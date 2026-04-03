package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	ldaplib "github.com/go-ldap/ldap/v3"
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

// Authenticate performs LDAP bind authentication using go-ldap/ldap/v3.
// Returns nil result and error message on failure.
func (c *LDAPConnector) Authenticate(username, password string) (*LDAPAuthResult, error) {
	c.mu.RLock()
	cfg := c.cfg
	c.mu.RUnlock()

	if !c.enabled {
		return nil, fmt.Errorf("LDAP connector not enabled")
	}
	if username == "" || password == "" {
		return nil, fmt.Errorf("username and password required")
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	// Connect to LDAP server
	var conn *ldaplib.Conn
	var err error
	if cfg.UseTLS {
		tlsCfg := &tls.Config{
			ServerName:         cfg.Host,
			InsecureSkipVerify: cfg.SkipVerify, //nolint:gosec
		}
		conn, err = ldaplib.DialTLS("tcp", addr, tlsCfg)
	} else {
		conn, err = ldaplib.Dial("tcp", addr)
	}
	if err != nil {
		return nil, fmt.Errorf("LDAP connect failed: %w", err)
	}
	defer conn.Close()

	// Upgrade to TLS via STARTTLS if configured (non-LDAPS connections)
	if cfg.StartTLS && !cfg.UseTLS {
		tlsCfg := &tls.Config{
			ServerName:         cfg.Host,
			InsecureSkipVerify: cfg.SkipVerify, //nolint:gosec
		}
		if err := conn.StartTLS(tlsCfg); err != nil {
			return nil, fmt.Errorf("LDAP STARTTLS failed: %w", err)
		}
	}

	// Step 1: Bind with service account to search for the user
	if cfg.BindDN != "" {
		if err := conn.Bind(cfg.BindDN, cfg.BindPassword); err != nil {
			return nil, fmt.Errorf("LDAP service account bind failed: %w", err)
		}
	}

	// Step 2: Search for user entry
	userFilter := strings.Replace(cfg.UserFilter, "%s", ldaplib.EscapeFilter(username), 1)
	searchReq := ldaplib.NewSearchRequest(
		cfg.BaseDN,
		ldaplib.ScopeWholeSubtree, ldaplib.NeverDerefAliases, 1, 30, false,
		userFilter,
		[]string{"dn", cfg.AttrUsername, cfg.AttrDisplayName, cfg.AttrEmail, cfg.AttrGroups},
		nil,
	)
	sr, err := conn.Search(searchReq)
	if err != nil {
		return nil, fmt.Errorf("LDAP user search failed: %w", err)
	}
	if len(sr.Entries) == 0 {
		log.Printf("[LDAP] User %q not found (filter: %s)", username, userFilter)
		return nil, fmt.Errorf("user not found in LDAP directory")
	}
	entry := sr.Entries[0]

	// Step 3: Bind as the user to verify their password
	if err := conn.Bind(entry.DN, password); err != nil {
		log.Printf("[LDAP] Authentication failed for user %q (DN: %s)", username, entry.DN)
		return nil, fmt.Errorf("invalid credentials")
	}

	// Step 4: Extract user attributes
	result := &LDAPAuthResult{
		Username:    entry.GetAttributeValue(cfg.AttrUsername),
		DisplayName: entry.GetAttributeValue(cfg.AttrDisplayName),
		Email:       entry.GetAttributeValue(cfg.AttrEmail),
		Groups:      entry.GetAttributeValues(cfg.AttrGroups),
		Role:        Role(cfg.DefaultRole),
	}
	if result.Username == "" {
		result.Username = username
	}

	// Step 5: Map LDAP groups to roles and J-designations
	for _, groupDN := range result.Groups {
		groupLower := strings.ToLower(groupDN)
		for mappedGroup, role := range cfg.RoleMapping {
			if strings.ToLower(mappedGroup) == groupLower {
				result.Role = Role(role)
			}
		}
		for mappedGroup, jdes := range cfg.JDesignationMapping {
			if strings.ToLower(mappedGroup) == groupLower {
				result.JDesignations = append(result.JDesignations, jdes)
			}
		}
	}

	log.Printf("[LDAP] Successfully authenticated user %q (role=%s, groups=%d)", result.Username, result.Role, len(result.Groups))
	return result, nil
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
