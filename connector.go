package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// ── Connector interface ─────────────────────────────────────────────────────

// Connector is the plugin/adapter interface for external integrations.
// Each connector registers at startup and receives lifecycle callbacks.
type Connector interface {
	// Name returns the unique identifier for this connector (e.g. "github", "jira")
	Name() string
	// Init initialises the connector with its persisted JSON configuration.
	Init(cfg json.RawMessage) error
	// OnEvent is called when a timeline event lifecycle change occurs.
	OnEvent(ev EventBusMessage)
	// Poll is called periodically to let the connector pull external data.
	// The interval is controlled by the connector registry (default 60s).
	Poll(app *App) ([]IngestPayload, error)
	// Enabled returns whether this connector is currently active.
	Enabled() bool
}

// ConnectorConfig stores the persisted configuration for a single connector.
type ConnectorConfig struct {
	Name    string          `json:"name"`
	Enabled bool            `json:"enabled"`
	Config  json.RawMessage `json:"config"`
}

// ConnectorRegistry manages all registered connectors.
type ConnectorRegistry struct {
	mu         sync.RWMutex
	connectors map[string]Connector
	configs    map[string]ConnectorConfig
}

// NewConnectorRegistry creates a new empty registry.
func NewConnectorRegistry() *ConnectorRegistry {
	return &ConnectorRegistry{
		connectors: make(map[string]Connector),
		configs:    make(map[string]ConnectorConfig),
	}
}

// Register adds a connector to the registry. Does not Init — call LoadConfigs first.
func (cr *ConnectorRegistry) Register(c Connector) {
	cr.mu.Lock()
	defer cr.mu.Unlock()
	cr.connectors[c.Name()] = c
}

// LoadConfigs loads persisted configs from the store and initialises each connector.
func (cr *ConnectorRegistry) LoadConfigs(configs []ConnectorConfig) {
	cr.mu.Lock()
	defer cr.mu.Unlock()
	for _, cfg := range configs {
		cr.configs[cfg.Name] = cfg
		if c, ok := cr.connectors[cfg.Name]; ok && cfg.Enabled {
			if err := c.Init(cfg.Config); err != nil {
				log.Printf("[WARN] connector %q init failed: %v", cfg.Name, err)
			} else {
				log.Printf("[INFO] connector %q initialised", cfg.Name)
			}
		}
	}
}

// GetConfig returns the config for a named connector.
func (cr *ConnectorRegistry) GetConfig(name string) (ConnectorConfig, bool) {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	cfg, ok := cr.configs[name]
	return cfg, ok
}

// SetConfig updates config for a named connector and re-inits it.
func (cr *ConnectorRegistry) SetConfig(cfg ConnectorConfig) error {
	cr.mu.Lock()
	defer cr.mu.Unlock()
	cr.configs[cfg.Name] = cfg
	if c, ok := cr.connectors[cfg.Name]; ok && cfg.Enabled {
		if err := c.Init(cfg.Config); err != nil {
			return fmt.Errorf("connector %q init: %w", cfg.Name, err)
		}
	}
	return nil
}

// Dispatch sends an event bus message to all enabled connectors.
func (cr *ConnectorRegistry) Dispatch(msg EventBusMessage) {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	for name, c := range cr.connectors {
		cfg := cr.configs[name]
		if cfg.Enabled && c.Enabled() {
			go func(cc Connector, m EventBusMessage) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[ERROR] connector %q panicked on event: %v", cc.Name(), r)
					}
				}()
				cc.OnEvent(m)
			}(c, msg)
		}
	}
}

// PollAll calls Poll on all enabled connectors and returns ingested payloads.
func (cr *ConnectorRegistry) PollAll(app *App) []IngestPayload {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	var results []IngestPayload
	for name, c := range cr.connectors {
		cfg := cr.configs[name]
		if !cfg.Enabled || !c.Enabled() {
			continue
		}
		payloads, err := c.Poll(app)
		if err != nil {
			log.Printf("[WARN] connector %q poll error: %v", name, err)
			continue
		}
		results = append(results, payloads...)
	}
	return results
}

// List returns all registered connector names and their enabled status.
func (cr *ConnectorRegistry) List() []ConnectorConfig {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	var out []ConnectorConfig
	for name := range cr.connectors {
		if cfg, ok := cr.configs[name]; ok {
			out = append(out, cfg)
		} else {
			out = append(out, ConnectorConfig{Name: name, Enabled: false})
		}
	}
	return out
}

// runConnectorPoller runs in a goroutine, polling all connectors periodically.
func (app *App) runConnectorPoller() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			payloads := app.connectors.PollAll(app)
			for _, p := range payloads {
				app.processIngestPayload(p)
			}
		case <-app.stopCh:
			return
		}
	}
}
