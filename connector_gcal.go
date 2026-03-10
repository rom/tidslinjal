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

// ── Google Calendar Connector ───────────────────────────────────────────────
// Pulls events from Google Calendar and syncs them to the timeline.

// GCalConnector implements the Connector interface for Google Calendar.
type GCalConnector struct {
	mu      sync.RWMutex
	cfg     GCalConfig
	enabled bool
	client  *http.Client
}

// GCalConfig configures the Google Calendar integration.
type GCalConfig struct {
	APIKey     string `json:"api_key,omitempty"`     // API key for public calendars
	OAuthToken string `json:"oauth_token,omitempty"` // OAuth2 access token for private calendars
	CalendarID string `json:"calendar_id"`           // e.g. "primary" or a specific calendar ID
	// Sync settings
	SyncEnabled   bool   `json:"sync_enabled"`
	TimeMin       string `json:"time_min,omitempty"`   // ISO8601: only sync events after this time
	MaxResults    int    `json:"max_results,omitempty"` // default: 50
	EventType     string `json:"event_type,omitempty"`  // map imported events to this type (default: "mote")
	// Export: push timeline events to Google Calendar
	PushEnabled   bool `json:"push_enabled"`
}

func NewGCalConnector() *GCalConnector {
	return &GCalConnector{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *GCalConnector) Name() string { return "google_calendar" }

func (c *GCalConnector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *GCalConnector) Init(cfg json.RawMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := json.Unmarshal(cfg, &c.cfg); err != nil {
		return fmt.Errorf("invalid Google Calendar config: %w", err)
	}
	if c.cfg.MaxResults == 0 {
		c.cfg.MaxResults = 50
	}
	if c.cfg.EventType == "" {
		c.cfg.EventType = "mote"
	}
	c.enabled = true
	return nil
}

func (c *GCalConnector) OnEvent(ev EventBusMessage) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()
	if !cfg.PushEnabled || ev.Event == nil {
		return
	}
	log.Printf("[GCAL] push event %d (action=%s)", ev.Event.ID, ev.Action)
}

func (c *GCalConnector) Poll(app *App) ([]IngestPayload, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if !cfg.SyncEnabled || cfg.CalendarID == "" {
		return nil, nil
	}

	timeMin := cfg.TimeMin
	if timeMin == "" {
		timeMin = time.Now().Add(-24 * time.Hour).Format(time.RFC3339)
	}

	url := fmt.Sprintf(
		"https://www.googleapis.com/calendar/v3/calendars/%s/events?timeMin=%s&maxResults=%d&singleEvents=true&orderBy=startTime",
		cfg.CalendarID, timeMin, cfg.MaxResults,
	)
	if cfg.APIKey != "" {
		url += "&key=" + cfg.APIKey
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if cfg.OAuthToken != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.OAuthToken)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google calendar: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("google calendar HTTP %d: %s", resp.StatusCode, body)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, err
	}

	var result struct {
		Items []struct {
			ID          string `json:"id"`
			Summary     string `json:"summary"`
			Description string `json:"description"`
			Location    string `json:"location"`
			Start       struct {
				DateTime string `json:"dateTime"`
				Date     string `json:"date"`
			} `json:"start"`
			End struct {
				DateTime string `json:"dateTime"`
				Date     string `json:"date"`
			} `json:"end"`
			Status  string `json:"status"`
			Updated string `json:"updated"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse google calendar: %w", err)
	}

	var payloads []IngestPayload
	for _, item := range result.Items {
		if item.Status == "cancelled" {
			continue
		}
		start := parseGCalTime(item.Start.DateTime, item.Start.Date)
		end := parseGCalTime(item.End.DateTime, item.End.Date)

		metadata := map[string]string{
			"gcal_id": item.ID,
		}
		if item.Location != "" {
			metadata["location"] = item.Location
		}

		p := IngestPayload{
			Format:     FormatJSON,
			Source:     "google_calendar",
			ExternalID: item.ID,
			Title:      item.Summary,
			Description: item.Description,
			EventType:  cfg.EventType,
			Priority:   "medium",
			Tags:       []string{"google_calendar"},
			StartTime:  start,
			EndTime:    end,
			Metadata:   metadata,
		}
		payloads = append(payloads, p)
	}

	return payloads, nil
}

// parseGCalTime parses a Google Calendar dateTime or date string.
func parseGCalTime(dateTime, date string) *time.Time {
	if dateTime != "" {
		if t, err := time.Parse(time.RFC3339, dateTime); err == nil {
			return &t
		}
	}
	if date != "" {
		if t, err := time.Parse("2006-01-02", date); err == nil {
			return &t
		}
	}
	return nil
}
