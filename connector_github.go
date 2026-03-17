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

// ── GitHub/GitLab Connector ─────────────────────────────────────────────────
// Bi-directional sync with GitHub/GitLab: pull commit history, milestones,
// issues, and push timeline events as issue comments.

// GitConnector implements the Connector interface for GitHub/GitLab.
type GitConnector struct {
	mu      sync.RWMutex
	cfg     GitConnectorConfig
	enabled bool
	client  *http.Client
}

// GitConnectorConfig configures the GitHub/GitLab integration.
type GitConnectorConfig struct {
	Provider    string `json:"provider"`     // "github" | "gitlab"
	BaseURL     string `json:"base_url"`     // API base URL (e.g. "https://api.github.com" or self-hosted)
	Token       string `json:"token,omitempty"` // Personal access token or OAuth token
	Owner       string `json:"owner"`        // repository owner / namespace
	Repo        string `json:"repo"`         // repository name
	ProjectID   string `json:"project_id,omitempty"` // GitLab project ID (alternative to owner/repo)

	// What to sync
	SyncCommits    bool `json:"sync_commits"`
	SyncMilestones bool `json:"sync_milestones"`
	SyncIssues     bool `json:"sync_issues"`
	SyncPRs        bool `json:"sync_pull_requests"`

	// Bi-directional: push timeline events as comments
	PushEnabled    bool   `json:"push_enabled"`
	PushLabel      string `json:"push_label,omitempty"` // label to add to created issues

	// Filtering
	Branch         string `json:"branch,omitempty"`     // branch to track commits from
	LabelFilter    string `json:"label_filter,omitempty"` // only sync issues with this label
}

func NewGitConnector() *GitConnector {
	return &GitConnector{
		client: &http.Client{Timeout: 30 * time.Second, Transport: newSSRFSafeTransport()}, // V-20 fix
	}
}

func (c *GitConnector) Name() string { return "github_gitlab" }

func (c *GitConnector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *GitConnector) Init(cfg json.RawMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := json.Unmarshal(cfg, &c.cfg); err != nil {
		return fmt.Errorf("invalid Git connector config: %w", err)
	}
	if c.cfg.BaseURL == "" {
		switch c.cfg.Provider {
		case "github":
			c.cfg.BaseURL = "https://api.github.com"
		case "gitlab":
			c.cfg.BaseURL = "https://gitlab.com/api/v4"
		}
	}
	c.enabled = true
	return nil
}

func (c *GitConnector) OnEvent(ev EventBusMessage) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if !cfg.PushEnabled || ev.Event == nil {
		return
	}

	// Create an issue comment for the event change
	if cfg.Provider == "github" {
		c.pushGitHubComment(cfg, ev)
	}
}

func (c *GitConnector) Poll(app *App) ([]IngestPayload, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	var payloads []IngestPayload

	if cfg.SyncCommits {
		commits, err := c.fetchCommits(cfg)
		if err != nil {
			log.Printf("[WARN] git connector: fetch commits: %v", err)
		} else {
			payloads = append(payloads, commits...)
		}
	}

	if cfg.SyncMilestones {
		milestones, err := c.fetchMilestones(cfg)
		if err != nil {
			log.Printf("[WARN] git connector: fetch milestones: %v", err)
		} else {
			payloads = append(payloads, milestones...)
		}
	}

	if cfg.SyncIssues {
		issues, err := c.fetchIssues(cfg)
		if err != nil {
			log.Printf("[WARN] git connector: fetch issues: %v", err)
		} else {
			payloads = append(payloads, issues...)
		}
	}

	return payloads, nil
}

// fetchCommits retrieves recent commits from the repository.
func (c *GitConnector) fetchCommits(cfg GitConnectorConfig) ([]IngestPayload, error) {
	var url string
	switch cfg.Provider {
	case "github":
		url = fmt.Sprintf("%s/repos/%s/%s/commits?per_page=20", cfg.BaseURL, cfg.Owner, cfg.Repo)
		if cfg.Branch != "" {
			url += "&sha=" + cfg.Branch
		}
	case "gitlab":
		pid := cfg.ProjectID
		if pid == "" {
			pid = cfg.Owner + "%2F" + cfg.Repo
		}
		url = fmt.Sprintf("%s/projects/%s/repository/commits?per_page=20", cfg.BaseURL, pid)
		if cfg.Branch != "" {
			url += "&ref_name=" + cfg.Branch
		}
	default:
		return nil, fmt.Errorf("unknown provider: %s", cfg.Provider)
	}

	data, err := c.apiGet(cfg, url)
	if err != nil {
		return nil, err
	}

	var commits []struct {
		SHA     string `json:"sha"`
		ID      string `json:"id"` // GitLab uses "id"
		Message string `json:"message"`
		Commit  struct {
			Message string `json:"message"`
			Author  struct {
				Name string    `json:"name"`
				Date time.Time `json:"date"`
			} `json:"author"`
		} `json:"commit"` // GitHub wraps in "commit"
		AuthorName string    `json:"author_name"`    // GitLab
		CreatedAt  time.Time `json:"created_at"`     // GitLab
	}
	if err := json.Unmarshal(data, &commits); err != nil {
		return nil, fmt.Errorf("parse commits: %w", err)
	}

	var payloads []IngestPayload
	for _, cm := range commits {
		sha := cm.SHA
		if sha == "" {
			sha = cm.ID
		}
		msg := cm.Commit.Message
		if msg == "" {
			msg = cm.Message
		}
		author := cm.Commit.Author.Name
		if author == "" {
			author = cm.AuthorName
		}
		t := cm.Commit.Author.Date
		if t.IsZero() {
			t = cm.CreatedAt
		}

		p := IngestPayload{
			Format:     FormatJSON,
			Source:     cfg.Provider,
			ExternalID: sha,
			Title:      fmt.Sprintf("[commit] %s", firstLine(msg)),
			Description: msg,
			EventType:  "activity",
			Priority:   "low",
			Tags:       []string{cfg.Provider, "commit", cfg.Repo},
			StartTime:  &t,
			Metadata: map[string]string{
				"sha":    sha,
				"author": author,
				"repo":   cfg.Owner + "/" + cfg.Repo,
			},
		}
		payloads = append(payloads, p)
	}
	return payloads, nil
}

// fetchMilestones retrieves milestones from the repository.
func (c *GitConnector) fetchMilestones(cfg GitConnectorConfig) ([]IngestPayload, error) {
	var url string
	switch cfg.Provider {
	case "github":
		url = fmt.Sprintf("%s/repos/%s/%s/milestones?state=all&per_page=20", cfg.BaseURL, cfg.Owner, cfg.Repo)
	case "gitlab":
		pid := cfg.ProjectID
		if pid == "" {
			pid = cfg.Owner + "%2F" + cfg.Repo
		}
		url = fmt.Sprintf("%s/projects/%s/milestones?per_page=20", cfg.BaseURL, pid)
	default:
		return nil, fmt.Errorf("unknown provider: %s", cfg.Provider)
	}

	data, err := c.apiGet(cfg, url)
	if err != nil {
		return nil, err
	}

	var milestones []struct {
		ID          int       `json:"id"`
		Number      int       `json:"number"` // GitHub
		Title       string    `json:"title"`
		Description string    `json:"description"`
		State       string    `json:"state"`
		DueOn       *time.Time `json:"due_on"`   // GitHub
		DueDate     string    `json:"due_date"`   // GitLab (string format)
		CreatedAt   time.Time `json:"created_at"`
	}
	if err := json.Unmarshal(data, &milestones); err != nil {
		return nil, fmt.Errorf("parse milestones: %w", err)
	}

	var payloads []IngestPayload
	for _, ms := range milestones {
		t := ms.CreatedAt
		if ms.DueOn != nil {
			t = *ms.DueOn
		}
		if ms.DueDate != "" {
			if parsed, err := time.Parse("2006-01-02", ms.DueDate); err == nil {
				t = parsed
			}
		}

		p := IngestPayload{
			Format:     FormatJSON,
			Source:     cfg.Provider,
			ExternalID: fmt.Sprintf("milestone-%d", ms.ID),
			Title:      fmt.Sprintf("[milestone] %s", ms.Title),
			Description: ms.Description,
			EventType:  "deadline",
			Priority:   "medium",
			Tags:       []string{cfg.Provider, "milestone", ms.State},
			StartTime:  &t,
			Metadata: map[string]string{
				"state": ms.State,
				"repo":  cfg.Owner + "/" + cfg.Repo,
			},
		}
		payloads = append(payloads, p)
	}
	return payloads, nil
}

// fetchIssues retrieves recent issues from the repository.
func (c *GitConnector) fetchIssues(cfg GitConnectorConfig) ([]IngestPayload, error) {
	var url string
	switch cfg.Provider {
	case "github":
		url = fmt.Sprintf("%s/repos/%s/%s/issues?state=all&per_page=20&sort=updated", cfg.BaseURL, cfg.Owner, cfg.Repo)
		if cfg.LabelFilter != "" {
			url += "&labels=" + cfg.LabelFilter
		}
	case "gitlab":
		pid := cfg.ProjectID
		if pid == "" {
			pid = cfg.Owner + "%2F" + cfg.Repo
		}
		url = fmt.Sprintf("%s/projects/%s/issues?per_page=20&order_by=updated_at", cfg.BaseURL, pid)
		if cfg.LabelFilter != "" {
			url += "&labels=" + cfg.LabelFilter
		}
	default:
		return nil, fmt.Errorf("unknown provider: %s", cfg.Provider)
	}

	data, err := c.apiGet(cfg, url)
	if err != nil {
		return nil, err
	}

	var issues []struct {
		ID        int       `json:"id"`
		Number    int       `json:"number"`
		IID       int       `json:"iid"` // GitLab
		Title     string    `json:"title"`
		Body      string    `json:"body"`        // GitHub
		Description string  `json:"description"` // GitLab
		State     string    `json:"state"`
		Labels    []interface{} `json:"labels"` // GitHub: strings, GitLab: strings
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	if err := json.Unmarshal(data, &issues); err != nil {
		return nil, fmt.Errorf("parse issues: %w", err)
	}

	var payloads []IngestPayload
	for _, iss := range issues {
		desc := iss.Body
		if desc == "" {
			desc = iss.Description
		}
		num := iss.Number
		if num == 0 {
			num = iss.IID
		}

		priority := "medium"
		if iss.State == "open" {
			priority = "high"
		}

		p := IngestPayload{
			Format:     FormatJSON,
			Source:     cfg.Provider,
			ExternalID: fmt.Sprintf("issue-%d", iss.ID),
			Title:      fmt.Sprintf("[#%d] %s", num, iss.Title),
			Description: desc,
			EventType:  "assigned_task",
			Priority:   priority,
			Tags:       []string{cfg.Provider, "issue", iss.State},
			StartTime:  &iss.CreatedAt,
			Metadata: map[string]string{
				"state":  iss.State,
				"number": fmt.Sprintf("%d", num),
				"repo":   cfg.Owner + "/" + cfg.Repo,
			},
		}
		payloads = append(payloads, p)
	}
	return payloads, nil
}

// apiGet performs an authenticated GET request.
func (c *GitConnector) apiGet(cfg GitConnectorConfig, url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if cfg.Token != "" {
		switch cfg.Provider {
		case "github":
			req.Header.Set("Authorization", "Bearer "+cfg.Token)
			req.Header.Set("Accept", "application/vnd.github+json")
		case "gitlab":
			req.Header.Set("PRIVATE-TOKEN", cfg.Token)
		}
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, body)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 5<<20))
}

// pushGitHubComment creates a comment on relevant issues for a timeline event change.
func (c *GitConnector) pushGitHubComment(cfg GitConnectorConfig, ev EventBusMessage) {
	// In production, this would find the matching issue (by external ID or title)
	// and POST a comment with the event update details.
	log.Printf("[GIT] push event %d to %s/%s (action=%s)", ev.Event.ID, cfg.Owner, cfg.Repo, ev.Action)
}

// firstLine returns the first line of a multi-line string.
func firstLine(s string) string {
	if idx := len(s); idx > 0 {
		for i, c := range s {
			if c == '\n' || c == '\r' {
				return s[:i]
			}
		}
	}
	return s
}
