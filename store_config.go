package main

import (
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── Exercise settings ──────────────────────────────────────────────────────────

func (s *Store) GetExerciseSettings() ExerciseSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.exercise
}

func (s *Store) SaveExerciseSettings(es ExerciseSettings) error {
	s.mu.Lock()
	s.exercise = es
	s.mu.Unlock()
	return s.persist("exercise.json", es)
}

// ── Registration Settings ──────────────────────────────────────────────────────

func (s *Store) GetRegistrationSettings() RegistrationSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.registrationSettings
}

func (s *Store) SaveRegistrationSettings(rs RegistrationSettings) error {
	s.mu.Lock()
	s.registrationSettings = rs
	s.mu.Unlock()
	return s.persist("registration.json", rs)
}

// ── OIDC Settings ─────────────────────────────────────────────────────────────

func (s *Store) GetOIDCSettings() OIDCPersistentConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.oidcSettings
}

func (s *Store) SaveOIDCSettings(cfg OIDCPersistentConfig) error {
	s.mu.Lock()
	s.oidcSettings = cfg
	s.mu.Unlock()
	return s.persist("oidc.json", cfg)
}

// ── Personal Invitations ───────────────────────────────────────────────────────

func (s *Store) GetInvitations() []PersonalInvitation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]PersonalInvitation, len(s.invitations))
	copy(result, s.invitations)
	return result
}

func (s *Store) CreateInvitation(inv PersonalInvitation) (PersonalInvitation, error) {
	s.mu.Lock()
	s.nextInvitationID++
	inv.ID = s.nextInvitationID
	inv.CreatedAt = time.Now()
	s.invitations = append(s.invitations, inv)
	snap := append([]PersonalInvitation(nil), s.invitations...)
	s.mu.Unlock()
	return inv, s.persist("invitations.json", snap)
}

// ClaimInvitation atomically checks that the invitation is valid+unused and marks it as used (V-04 fix).
// Returns the invitation and true on success, or nil and false if invalid/already used.
func (s *Store) ClaimInvitation(code string, usedBy string) (*PersonalInvitation, bool) {
	s.mu.Lock()
	for i := range s.invitations {
		if s.invitations[i].Code == code {
			if s.invitations[i].Used {
				s.mu.Unlock()
				return nil, false
			}
			now := time.Now()
			s.invitations[i].Used = true
			s.invitations[i].UsedBy = usedBy
			s.invitations[i].UsedAt = &now
			inv := s.invitations[i]
			snap := append([]PersonalInvitation(nil), s.invitations...)
			s.mu.Unlock()
			s.persist("invitations.json", snap) //nolint
			return &inv, true
		}
	}
	s.mu.Unlock()
	return nil, false
}

func (s *Store) DeleteInvitation(id int64) error {
	s.mu.Lock()
	found := false
	for i, inv := range s.invitations {
		if inv.ID == id {
			s.invitations = append(s.invitations[:i], s.invitations[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("invitation not found")
	}
	snap := append([]PersonalInvitation(nil), s.invitations...)
	s.mu.Unlock()
	return s.persist("invitations.json", snap)
}

// ── Mail Config ────────────────────────────────────────────────────────────────

func (s *Store) GetMailConfig() MailConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mailConfig
}

func (s *Store) SaveMailConfig(cfg MailConfig) error {
	s.mu.Lock()
	s.mailConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("mail.json", snap)
}

// ── Meeting Config ────────────────────────────────────────────────────────────

func (s *Store) GetMeetingConfig() MeetingConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.meetingConfig
}

func (s *Store) SaveMeetingConfig(cfg MeetingConfig) error {
	s.mu.Lock()
	s.meetingConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("meeting.json", snap)
}

// ── Syslog Config ──────────────────────────────────────────────────────────────

func (s *Store) GetSyslogConfig() SyslogConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.syslogConfig
}

func (s *Store) SaveSyslogConfig(cfg SyslogConfig) error {
	s.mu.Lock()
	s.syslogConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("syslog.json", snap)
}

// ── Security Settings ─────────────────────────────────────────────────────────

func (s *Store) GetSecuritySettings() SecuritySettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.securitySettings
}

func (s *Store) SaveSecuritySettings(ss SecuritySettings) error {
	s.mu.Lock()
	s.securitySettings = ss
	snap := ss
	s.mu.Unlock()
	return s.persist("security.json", snap)
}

// ── TLS Config ────────────────────────────────────────────────────────────────

func (s *Store) GetTLSConfig() TLSConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tlsConfig
}

func (s *Store) SaveTLSConfig(cfg TLSConfig) error {
	s.mu.Lock()
	s.tlsConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("tls.json", snap)
}

// ── Report Ingest Config ──────────────────────────────────────────────────────

func (s *Store) GetReportIngestConfig() ReportIngestConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.reportIngestConfig
}

func (s *Store) SaveReportIngestConfig(cfg ReportIngestConfig) error {
	s.mu.Lock()
	s.reportIngestConfig = cfg
	snap := cfg
	s.mu.Unlock()
	return s.persist("report_ingest_config.json", snap)
}

// ── API Keys ──────────────────────────────────────────────────────────────────

func (s *Store) GetAPIKeys() []APIKey {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]APIKey, len(s.apiKeys))
	for i, k := range s.apiKeys {
		cp := k
		cp.KeyHash = "" // never expose hash
		cp.Key = ""
		out[i] = cp
	}
	return out
}

func (s *Store) CreateAPIKey(k APIKey) (APIKey, error) {
	s.mu.Lock()
	s.nextAPIKeyID++
	k.ID = s.nextAPIKeyID
	k.CreatedAt = time.Now()
	s.apiKeys = append(s.apiKeys, k)
	snap := append([]APIKey(nil), s.apiKeys...)
	s.mu.Unlock()
	return k, s.persist("apikeys.json", snap)
}

func (s *Store) DeleteAPIKey(id int64) error {
	s.mu.Lock()
	for i, k := range s.apiKeys {
		if k.ID == id {
			s.apiKeys = append(s.apiKeys[:i], s.apiKeys[i+1:]...)
			snap := append([]APIKey(nil), s.apiKeys...)
			s.mu.Unlock()
			return s.persist("apikeys.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("api key not found")
}

// ValidateAPIKey checks a raw key string against stored hashes; returns the key record or nil.
// Uses a read lock to snapshot keys, then performs expensive bcrypt comparisons without holding
// the lock to avoid blocking all store operations during validation.
func (s *Store) ValidateAPIKey(raw string) *APIKey {
	s.mu.RLock()
	keys := append([]APIKey(nil), s.apiKeys...)
	s.mu.RUnlock()

	for _, k := range keys {
		if bcrypt.CompareHashAndPassword([]byte(k.KeyHash), []byte(raw)) == nil {
			// Found match; update LastUsedAt under write lock
			s.mu.Lock()
			for i := range s.apiKeys {
				if s.apiKeys[i].ID == k.ID {
					now := time.Now()
					s.apiKeys[i].LastUsedAt = &now
					break
				}
			}
			snap := append([]APIKey(nil), s.apiKeys...)
			s.mu.Unlock()
			go s.persist("apikeys.json", snap)
			cp := k
			cp.KeyHash = ""
			cp.Key = ""
			return &cp
		}
	}
	return nil
}

// ── Rate Limit Settings ───────────────────────────────────────────────────────

func (s *Store) GetRateLimitSettings() RateLimitSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.rateLimitSettings
}

func (s *Store) SaveRateLimitSettings(login, registration, passwordReset int) error {
	s.mu.Lock()
	s.rateLimitSettings = RateLimitSettings{
		LoginLimit:         login,
		RegistrationLimit:  registration,
		PasswordResetLimit: passwordReset,
	}
	snap := s.rateLimitSettings
	s.mu.Unlock()
	return s.persist("rate_limits.json", snap)
}

// ── Geoblocking Settings ──────────────────────────────────────────────────────

func (s *Store) GetGeoblockingSettings() GeoblockingSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.geoblockingSettings
}

func (s *Store) SaveGeoblockingSettings(enabled bool, mode string, countries []string) error {
	s.mu.Lock()
	s.geoblockingSettings = GeoblockingSettings{
		Enabled:   enabled,
		Mode:      mode,
		Countries: countries,
	}
	snap := s.geoblockingSettings
	s.mu.Unlock()
	return s.persist("geoblocking.json", snap)
}

// ── Encryption Settings ───────────────────────────────────────────────────────

func (s *Store) GetEncryptionSettings() EncryptionSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.encryptionSettings
}

func (s *Store) SaveEncryptionSettings(enabled bool) error {
	s.mu.Lock()
	s.encryptionSettings = EncryptionSettings{Enabled: enabled}
	snap := s.encryptionSettings
	s.mu.Unlock()
	return s.persist("encryption.json", snap)
}

// ── SSO Toggle ────────────────────────────────────────────────────────────────

func (s *Store) SaveSSOToggle(enabled bool) error {
	s.mu.Lock()
	s.oidcSettings.Enabled = enabled
	snap := s.oidcSettings
	s.mu.Unlock()
	return s.persist("oidc.json", snap)
}

// ── IP Blacklist ──────────────────────────────────────────────────────────────

func (s *Store) GetIPBlacklist() IPBlacklistSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ipBlacklist
}

func (s *Store) SaveIPBlacklist(settings IPBlacklistSettings) error {
	s.mu.Lock()
	s.ipBlacklist = settings
	snap := s.ipBlacklist
	s.mu.Unlock()
	return s.persist("ip_blacklist.json", snap)
}

// ── Export All Settings ───────────────────────────────────────────────────────

func (s *Store) GetAllSettings() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return map[string]interface{}{
		"exercise":     s.exercise,
		"registration": s.registrationSettings,
		"oidc":         s.oidcSettings,
		"mail":         s.mailConfig,
		"meeting":      s.meetingConfig,
		"syslog":       s.syslogConfig,
		"security":     s.securitySettings,
		"tls":          s.tlsConfig,
		"rate_limits":  s.rateLimitSettings,
		"geoblocking":  s.geoblockingSettings,
		"encryption":    s.encryptionSettings,
		"ip_blacklist":  s.ipBlacklist,
		"day_labels":    s.dayLabels,
	}
}
