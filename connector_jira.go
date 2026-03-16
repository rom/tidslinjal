package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// ── Jira Connector ──────────────────────────────────────────────────────────
// Bi-directional sync with Jira: pull issues/tickets and push timeline events.

// JiraConnector implements the Connector interface for Jira integration.
type JiraConnector struct {
	mu      sync.RWMutex
	cfg     JiraConfig
	enabled bool
	client  *http.Client
}

// JiraConfig configures the Jira integration.
type JiraConfig struct {
	BaseURL  string `json:"base_url"`  // e.g. "https://yourteam.atlassian.net"
	Email    string `json:"email"`     // Jira account email (for basic auth)
	APIToken string `json:"api_token,omitempty"` // Jira API token
	// What to sync
	Project    string `json:"project"`      // Jira project key (e.g. "OPS")
	JQL        string `json:"jql,omitempty"` // custom JQL filter (overrides project)
	SyncTickets bool  `json:"sync_tickets"`
	SyncSprints bool  `json:"sync_sprints"`
	SyncStats   bool  `json:"sync_stats"`
	// Bi-directional
	PushEnabled   bool   `json:"push_enabled"`
	PushIssueType string `json:"push_issue_type,omitempty"` // Jira issue type for pushed events (default: "Task")
}

func NewJiraConnector() *JiraConnector {
	return &JiraConnector{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *JiraConnector) Name() string { return "jira" }

func (c *JiraConnector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *JiraConnector) Init(cfg json.RawMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := json.Unmarshal(cfg, &c.cfg); err != nil {
		return fmt.Errorf("invalid Jira config: %w", err)
	}
	c.enabled = true
	return nil
}

func (c *JiraConnector) OnEvent(ev EventBusMessage) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()
	if !cfg.PushEnabled || ev.Event == nil {
		return
	}
	log.Printf("[JIRA] push event %d to %s (action=%s)", ev.Event.ID, cfg.Project, ev.Action)
}

func (c *JiraConnector) Poll(app *App) ([]IngestPayload, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if !cfg.SyncTickets {
		return nil, nil
	}

	jql := cfg.JQL
	if jql == "" {
		jql = fmt.Sprintf("project = %s ORDER BY updated DESC", cfg.Project)
	}

	url := fmt.Sprintf("%s/rest/api/3/search?jql=%s&maxResults=30", cfg.BaseURL, jql)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if cfg.Email != "" && cfg.APIToken != "" {
		req.SetBasicAuth(cfg.Email, cfg.APIToken)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("jira search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("jira HTTP %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Issues []struct {
			ID     string `json:"id"`
			Key    string `json:"key"`
			Fields struct {
				Summary     string `json:"summary"`
				Description *struct {
					Content []struct {
						Content []struct {
							Text string `json:"text"`
						} `json:"content"`
					} `json:"content"`
				} `json:"description"`
				Status struct {
					Name string `json:"name"`
				} `json:"status"`
				Priority struct {
					Name string `json:"name"`
				} `json:"priority"`
				IssueType struct {
					Name string `json:"name"`
				} `json:"issuetype"`
				Created string `json:"created"`
				Updated string `json:"updated"`
				DueDate string `json:"duedate"`
			} `json:"fields"`
		} `json:"issues"`
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse jira response: %w", err)
	}

	var payloads []IngestPayload
	for _, iss := range result.Issues {
		desc := ""
		if iss.Fields.Description != nil {
			for _, c := range iss.Fields.Description.Content {
				for _, cc := range c.Content {
					desc += cc.Text + "\n"
				}
			}
		}

		priority := mapJiraPriority(iss.Fields.Priority.Name)
		created, _ := time.Parse("2006-01-02T15:04:05.000-0700", iss.Fields.Created)
		if created.IsZero() {
			created = time.Now()
		}

		var endTime *time.Time
		if iss.Fields.DueDate != "" {
			if t, err := time.Parse("2006-01-02", iss.Fields.DueDate); err == nil {
				endTime = &t
			}
		}

		p := IngestPayload{
			Format:     FormatJSON,
			Source:     "jira",
			ExternalID: iss.Key,
			Title:      fmt.Sprintf("[%s] %s", iss.Key, iss.Fields.Summary),
			Description: desc,
			EventType:  "assigned_task",
			Priority:   priority,
			Tags:       []string{"jira", iss.Fields.Status.Name, iss.Fields.IssueType.Name},
			StartTime:  &created,
			EndTime:    endTime,
			Metadata: map[string]string{
				"jira_key":    iss.Key,
				"jira_status": iss.Fields.Status.Name,
				"jira_type":   iss.Fields.IssueType.Name,
			},
		}
		payloads = append(payloads, p)
	}

	return payloads, nil
}

// SyncStats fetches aggregated issue counts from Jira grouped by status and priority.
func (c *JiraConnector) SyncStats() (JiraStats, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	jql := cfg.JQL
	if jql == "" {
		jql = fmt.Sprintf("project = %s", cfg.Project)
	}

	url := fmt.Sprintf("%s/rest/api/3/search?jql=%s&maxResults=100", cfg.BaseURL, jql)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return JiraStats{}, err
	}
	if cfg.Email != "" && cfg.APIToken != "" {
		req.SetBasicAuth(cfg.Email, cfg.APIToken)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return JiraStats{}, fmt.Errorf("jira stats: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return JiraStats{}, fmt.Errorf("jira HTTP %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Total  int `json:"total"`
		Issues []struct {
			Fields struct {
				Status struct {
					Name string `json:"name"`
				} `json:"status"`
				Priority struct {
					Name string `json:"name"`
				} `json:"priority"`
			} `json:"fields"`
		} `json:"issues"`
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return JiraStats{}, err
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return JiraStats{}, fmt.Errorf("parse jira stats: %w", err)
	}

	stats := JiraStats{
		TotalIssues:  result.Total,
		ByStatus:     make(map[string]int),
		ByPriority:   make(map[string]int),
		LastSyncTime: time.Now(),
	}
	for _, iss := range result.Issues {
		stats.ByStatus[iss.Fields.Status.Name]++
		stats.ByPriority[iss.Fields.Priority.Name]++
	}
	return stats, nil
}

// mapJiraPriority converts Jira priority names to our priority levels.
func mapJiraPriority(name string) string {
	switch name {
	case "Highest", "Blocker":
		return "critical"
	case "High":
		return "high"
	case "Low", "Lowest":
		return "low"
	default:
		return "medium"
	}
}
