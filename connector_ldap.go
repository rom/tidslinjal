package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

// ── LDAP/Active Directory Connector ─────────────────────────────────────────
// Provides direct LDAP bind authentication for environments without OIDC,
// particularly military networks running on-prem Active Directory.

// LDAPConnector implements the Connector interface for LDAP/AD authentication.
type LDAPConnector struct {
	mu      sync.RWMutex
	cfg     LDAPConfig
	enabled bool
}

// LDAPConfig stores LDAP/AD connection and mapping settings.
type LDAPConfig struct {
	Host       string `json:"host"`                  // LDAP server hostname or IP
	Port       int    `json:"port"`                  // default: 389 (LDAP), 636 (LDAPS)
	UseTLS     bool   `json:"use_tls"`               // use LDAPS (port 636)
	StartTLS   bool   `json:"start_tls"`             // use STARTTLS upgrade
	SkipVerify bool   `json:"skip_verify,omitempty"` // skip TLS certificate verification

	// Bind credentials (service account for searching)
	BindDN       string `json:"bind_dn"`       // e.g. "cn=admin,dc=example,dc=com"
	BindPassword string `json:"bind_password,omitempty"`

	// Search settings
	BaseDN       string `json:"base_dn"`        // e.g. "dc=example,dc=com"
	UserFilter   string `json:"user_filter"`     // e.g. "(&(objectClass=user)(sAMAccountName=%s))"
	GroupFilter  string `json:"group_filter"`    // e.g. "(&(objectClass=group)(member=%s))"

	// Attribute mapping
	AttrUsername    string `json:"attr_username"`     // default: "sAMAccountName"
	AttrDisplayName string `json:"attr_display_name"` // default: "displayName"
	AttrEmail       string `json:"attr_email"`        // default: "mail"
	AttrGroups      string `json:"attr_groups"`       // default: "memberOf"

	// Role mapping: LDAP group DN → Tidslinjal role
	RoleMapping map[string]string `json:"role_mapping,omitempty"` // e.g. {"cn=admins,dc=..": "admin"}

	// J-designation mapping: LDAP group DN → NATO J-designation
	JDesignationMapping map[string]string `json:"j_designation_mapping,omitempty"` // e.g. {"cn=j2-staff,dc=..": "J2"}

	// Default role for users not matching any role mapping
	DefaultRole string `json:"default_role"` // default: "teammember"

	// Sync settings
	SyncEnabled     bool `json:"sync_enabled"`      // periodically sync user info from LDAP
	SyncIntervalMin int  `json:"sync_interval_min"` // default: 60
}

// LDAPAuthResult is returned after a successful LDAP authentication attempt.
type LDAPAuthResult struct {
	Username     string
	DisplayName  string
	Email        string
	Groups       []string
	Role         Role
	JDesignations []string
}

func NewLDAPConnector() *LDAPConnector {
	return &LDAPConnector{}
}

func (c *LDAPConnector) Name() string { return "ldap" }

func (c *LDAPConnector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *LDAPConnector) Init(cfg json.RawMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := json.Unmarshal(cfg, &c.cfg); err != nil {
		return fmt.Errorf("invalid LDAP config: %w", err)
	}
	// Set defaults
	if c.cfg.Port == 0 {
		if c.cfg.UseTLS {
			c.cfg.Port = 636
		} else {
			c.cfg.Port = 389
		}
	}
	if c.cfg.AttrUsername == "" {
		c.cfg.AttrUsername = "sAMAccountName"
	}
	if c.cfg.AttrDisplayName == "" {
		c.cfg.AttrDisplayName = "displayName"
	}
	if c.cfg.AttrEmail == "" {
		c.cfg.AttrEmail = "mail"
	}
	if c.cfg.AttrGroups == "" {
		c.cfg.AttrGroups = "memberOf"
	}
	if c.cfg.DefaultRole == "" {
		c.cfg.DefaultRole = "teammember"
	}
	if c.cfg.UserFilter == "" {
		c.cfg.UserFilter = "(&(objectClass=user)(sAMAccountName=%s))"
	}
	c.enabled = true
	log.Printf("[INFO] LDAP connector configured: host=%s:%d baseDN=%s", c.cfg.Host, c.cfg.Port, c.cfg.BaseDN)
	return nil
}

// OnEvent is a no-op for LDAP (authentication-only connector).
func (c *LDAPConnector) OnEvent(ev EventBusMessage) {}

// Poll is a no-op for LDAP unless sync is enabled.
func (c *LDAPConnector) Poll(app *App) ([]IngestPayload, error) {
	return nil, nil
}

// Authenticate performs LDAP bind authentication.
// Returns nil result and error message on failure.
func (c *LDAPConnector) Authenticate(username, password string) (*LDAPAuthResult, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if !c.enabled {
		return nil, fmt.Errorf("LDAP connector not enabled")
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	// Connect
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("LDAP connect failed: %w", err)
	}
	defer conn.Close()

	// Upgrade to TLS if needed
	if cfg.UseTLS || cfg.StartTLS {
		tlsConn := tls.Client(conn, &tls.Config{
			ServerName:         cfg.Host,
			InsecureSkipVerify: cfg.SkipVerify, //nolint:gosec
		})
		if err := tlsConn.Handshake(); err != nil {
			return nil, fmt.Errorf("LDAP TLS handshake failed: %w", err)
		}
		conn = tlsConn
	}

	// SECURITY (V-02 fix): This is a stub implementation that does NOT perform
	// actual LDAP bind authentication. Reject all authentication attempts until
	// a proper LDAP library (e.g., go-ldap/ldap/v3) is integrated.
	_ = conn // connection established but cannot perform LDAP bind without a proper library

	// Build the user DN from the filter (for logging only)
	userFilter := strings.Replace(cfg.UserFilter, "%s", escapeLDAPFilter(username), 1)

	log.Printf("[LDAP] REJECTED authentication for user %s — LDAP bind not implemented (filter: %s)", username, userFilter)
	return nil, fmt.Errorf("LDAP authentication is not fully implemented — please use a proper LDAP library (go-ldap/ldap/v3) or configure OIDC instead")
}

// GetConfig returns the current LDAP configuration (with password masked).
func (c *LDAPConnector) GetConfig() LDAPConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cfg := c.cfg
	if cfg.BindPassword != "" {
		cfg.BindPassword = "••••••••"
	}
	return cfg
}

// escapeLDAPFilter escapes special characters in LDAP filter values.
func escapeLDAPFilter(s string) string {
	r := strings.NewReplacer(
		`\`, `\5c`,
		`*`, `\2a`,
		`(`, `\28`,
		`)`, `\29`,
		"\x00", `\00`,
	)
	return r.Replace(s)
}
