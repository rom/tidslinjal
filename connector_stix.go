package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── STIX/TAXII Connector ────────────────────────────────────────────────────
// Supports STIX 2.1 bundle import/export and TAXII 2.1 feed subscription.

// STIXConnector implements the Connector interface for STIX/TAXII integration.
type STIXConnector struct {
	mu      sync.RWMutex
	cfg     STIXConfig
	enabled bool
	client  *http.Client
}

// STIXConfig is the configuration for the STIX/TAXII connector.
type STIXConfig struct {
	// TAXII server settings
	TAXIIServerURL  string `json:"taxii_server_url"`
	TAXIICollection string `json:"taxii_collection"`
	TAXIIUsername    string `json:"taxii_username,omitempty"`
	TAXIIPassword   string `json:"taxii_password,omitempty"`
	TAXIIAPIKey     string `json:"taxii_api_key,omitempty"`
	PollIntervalSec int    `json:"poll_interval_sec"` // 0 = use default (300)

	// Mapping: which STIX object types to ingest
	IngestIndicators    bool `json:"ingest_indicators"`     // STIX indicator objects
	IngestSightings     bool `json:"ingest_sightings"`      // STIX sighting objects
	IngestMalware       bool `json:"ingest_malware"`        // STIX malware objects
	IngestAttackPattern bool `json:"ingest_attack_pattern"` // STIX attack-pattern objects
	IngestIncident      bool `json:"ingest_incident"`       // STIX incident objects
	IngestAll           bool `json:"ingest_all"`            // ingest all object types

	// Export settings
	ExportEnabled bool `json:"export_enabled"` // publish timeline events as STIX bundles
}

// STIXBundle represents a STIX 2.1 bundle.
type STIXBundle struct {
	Type    string       `json:"type"` // "bundle"
	ID      string       `json:"id"`
	Objects []STIXObject `json:"objects"`
}

// STIXObject is a generic STIX 2.1 object.
type STIXObject struct {
	Type        string    `json:"type"`
	ID          string    `json:"id"`
	Created     time.Time `json:"created"`
	Modified    time.Time `json:"modified"`
	Name        string    `json:"name,omitempty"`
	Description string    `json:"description,omitempty"`
	Pattern     string    `json:"pattern,omitempty"` // for indicators
	Labels      []string  `json:"labels,omitempty"`
	// Sighting fields
	SightingOf  string    `json:"sighting_of_ref,omitempty"`
	FirstSeen   *time.Time `json:"first_seen,omitempty"`
	LastSeen    *time.Time `json:"last_seen,omitempty"`
	Count       int        `json:"count,omitempty"`
}

func NewSTIXConnector() *STIXConnector {
	return &STIXConnector{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *STIXConnector) Name() string { return "stix_taxii" }

func (c *STIXConnector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *STIXConnector) Init(cfg json.RawMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := json.Unmarshal(cfg, &c.cfg); err != nil {
		return fmt.Errorf("invalid STIX config: %w", err)
	}
	c.enabled = true
	return nil
}

func (c *STIXConnector) OnEvent(ev EventBusMessage) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if !c.cfg.ExportEnabled {
		return
	}
	// Convert timeline event to STIX sighting and publish
	// (In production, this would POST to a TAXII collection or write to a feed)
	log.Printf("[STIX] export event %d as STIX object (action=%s)", ev.Event.ID, ev.Action)
}

func (c *STIXConnector) Poll(app *App) ([]IngestPayload, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if cfg.TAXIIServerURL == "" {
		return nil, nil
	}

	// TAXII 2.1: GET /collections/{id}/objects
	url := strings.TrimRight(cfg.TAXIIServerURL, "/") +
		"/collections/" + cfg.TAXIICollection + "/objects/"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("build TAXII request: %w", err)
	}
	req.Header.Set("Accept", "application/taxii+json;version=2.1")
	if cfg.TAXIIUsername != "" {
		req.SetBasicAuth(cfg.TAXIIUsername, cfg.TAXIIPassword)
	}
	if cfg.TAXIIAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.TAXIIAPIKey)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("TAXII poll: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("TAXII poll HTTP %d: %s", resp.StatusCode, body)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("read TAXII response: %w", err)
	}

	return normaliseSTIX(data, "taxii:"+cfg.TAXIICollection)
}

// normaliseSTIX converts a STIX 2.1 bundle into IngestPayloads.
func normaliseSTIX(data []byte, source string) ([]IngestPayload, error) {
	var bundle STIXBundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return nil, fmt.Errorf("invalid STIX bundle: %w", err)
	}

	var payloads []IngestPayload
	for _, obj := range bundle.Objects {
		p := stixObjectToPayload(obj, source, data)
		if p != nil {
			payloads = append(payloads, *p)
		}
	}
	return payloads, nil
}

// stixObjectToPayload converts a single STIX object to an IngestPayload.
func stixObjectToPayload(obj STIXObject, source string, raw []byte) *IngestPayload {
	// Map STIX type to priority
	priority := "medium"
	eventType := "event"
	switch obj.Type {
	case "indicator":
		priority = "high"
		eventType = "reporting"
	case "sighting":
		priority = "high"
		eventType = "instant"
	case "malware":
		priority = "critical"
		eventType = "event"
	case "attack-pattern":
		priority = "high"
		eventType = "event"
	case "incident":
		priority = "critical"
		eventType = "event"
	case "relationship", "marking-definition", "identity":
		return nil // skip non-actionable objects
	}

	title := obj.Name
	if title == "" {
		title = fmt.Sprintf("STIX %s: %s", obj.Type, obj.ID)
	}

	startTime := obj.Created
	if obj.FirstSeen != nil {
		startTime = *obj.FirstSeen
	}

	tags := append([]string{"stix", obj.Type}, obj.Labels...)

	desc := obj.Description
	if obj.Pattern != "" {
		desc += "\n\nPattern: " + obj.Pattern
	}

	return &IngestPayload{
		Format:      FormatSTIX,
		Source:      source,
		ExternalID:  obj.ID,
		Title:       title,
		Description: desc,
		EventType:   eventType,
		Priority:    priority,
		Tags:        tags,
		StartTime:   &startTime,
		Metadata: map[string]string{
			"stix_type": obj.Type,
			"stix_id":   obj.ID,
		},
		RawPayload: raw,
	}
}

// ── STIX Export ─────────────────────────────────────────────────────────────

// EventToSTIXBundle converts timeline events into a STIX 2.1 bundle.
func EventToSTIXBundle(events []Event) STIXBundle {
	bundle := STIXBundle{
		Type:    "bundle",
		ID:      fmt.Sprintf("bundle--tidslinjal-%d", time.Now().UnixNano()),
		Objects: make([]STIXObject, 0, len(events)),
	}
	for _, ev := range events {
		obj := STIXObject{
			Type:        "sighting",
			ID:          fmt.Sprintf("sighting--tidslinjal-%d", ev.ID),
			Created:     ev.CreatedAt,
			Modified:    ev.UpdatedAt,
			Name:        ev.Title,
			Description: ev.Description,
			FirstSeen:   &ev.StartTime,
			LastSeen:    ev.EndTime,
			Labels:      []string{ev.EventType, string(ev.Status)},
		}
		bundle.Objects = append(bundle.Objects, obj)
	}
	return bundle
}

// handleSTIXExport handles GET /api/export/stix
func (app *App) handleSTIXExport(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	events := app.store.GetEventsInRange(time.Time{}, time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC))
	bundle := EventToSTIXBundle(events)
	w.Header().Set("Content-Type", "application/stix+json;version=2.1")
	w.Header().Set("Content-Disposition", "attachment; filename=\"tidslinjal-stix-export.json\"")
	json.NewEncoder(w).Encode(bundle) //nolint
}
