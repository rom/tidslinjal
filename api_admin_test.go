package main

import (
	"io"
	"net/http"
	"testing"
)

// ── Admin API Tests ─────────────────────────────────────────────────────────

func TestAPI_AdminSessions_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/sessions", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var sessions []map[string]any
	decodeJSON(t, resp, &sessions)
	if len(sessions) < 1 {
		t.Error("expected at least 1 active session (admin's own)")
	}
}

func TestAPI_AdminSessions_RequiresAdmin(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	// Create a non-admin user
	cookies := login(t, srv, "admin", "admin")
	apiDo(t, srv, http.MethodPost, "/api/users", map[string]any{
		"username": "viewer", "password": "viewer123!", "role": "read",
		"display_name": "Viewer",
	}, cookies)

	viewerCookies := login(t, srv, "viewer", "viewer123!")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/sessions", nil, viewerCookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminRegistration_GetSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/registration", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminRegistration_UpdateSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPut, "/api/admin/registration", map[string]any{
		"mode": "vetted",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("update registration: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
}

func TestAPI_AdminSecurity_GetSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/security", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminRateLimits_GetSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/rate-limits", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminGeoblocking_GetSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/geoblocking", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminEncryption_GetSettings(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/encryption", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminSSOToggle_Update(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodPut, "/api/admin/sso-toggle", map[string]any{
		"enabled": false,
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 2xx, got %d: %s", resp.StatusCode, body)
	}
}

func TestAPI_AdminGradualBackup_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/gradual-backup", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminGradualBackup_Snapshot(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/admin/gradual-backup/snapshot", nil, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create snapshot: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
}

func TestAPI_AdminInvitations_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/invitations", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AdminBulkStatus(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/admin/bulk/status", nil, cookies)
	defer resp.Body.Close()
	// This might accept GET or need POST - check both
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("expected 200 or 405, got %d", resp.StatusCode)
	}
}

// ── Auth Extended Tests ─────────────────────────────────────────────────────

func TestAPI_PasswordPolicy(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/auth/password-policy", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AuthProfile_Update(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodPut, "/api/auth/profile", map[string]any{
		"display_name": "Admin Updated",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("update profile: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
}

func TestAPI_AuthRegister_WhenDisabled(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	// By default, registration is off
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/register", map[string]any{
		"username":     "newuser",
		"password":     "SecurePass123!",
		"display_name": "New User",
	}, nil)
	defer resp.Body.Close()
	// Should fail because registration is disabled by default
	if resp.StatusCode == http.StatusCreated {
		t.Error("registration should be disabled by default")
	}
}

func TestAPI_AuthForgotPassword(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	// Should always return 200 to prevent user enumeration
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/forgot-password", map[string]any{
		"username": "nonexistent",
		"email":    "nope@example.com",
	}, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 (anti-enumeration), got %d", resp.StatusCode)
	}
}

func TestAPI_AuthResetPassword_InvalidToken(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/reset-password", map[string]any{
		"token":        "invalid-token",
		"new_password": "NewSecure123!",
	}, nil)
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		t.Error("reset with invalid token should not succeed")
	}
}

func TestAPI_AuthUpdateEmail(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodPost, "/api/auth/update-email", map[string]any{
		"email":            "admin@example.com",
		"current_password": "admin",
	}, cookies)
	defer resp.Body.Close()
	if !isSuccess(resp.StatusCode) {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("update email: expected 2xx, got %d: %s", resp.StatusCode, body)
	}
}

func TestAPI_OIDCInfo(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	resp := apiDo(t, srv, http.MethodGet, "/api/auth/oidc-config", nil, nil)
	defer resp.Body.Close()
	// OIDC endpoint only registered when OIDC is configured; 404 is acceptable
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 200 or 404, got %d", resp.StatusCode)
	}
}

// ── Federation ──────────────────────────────────────────────────────────────

func TestAPI_Federation_IdPs_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/federation/idps", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_Federation_Realms_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/federation/realms", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── TeamLead Actions ────────────────────────────────────────────────────────

func TestAPI_TeamLead_QuickReports_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/teamlead/quick-reports", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Integration Config ──────────────────────────────────────────────────────

func TestAPI_IntegrationDigest_Post(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodPost, "/api/integrations/digest", nil, cookies)
	defer resp.Body.Close()
	// Digest send may fail without SMTP config but should not be 405
	if resp.StatusCode == http.StatusMethodNotAllowed {
		t.Fatalf("expected method to be accepted, got 405")
	}
}

func TestAPI_IntegrationLDAP_Get(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/integrations/ldap", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_IntegrationConnectors_List(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/integrations/connectors", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// ── Polls Log ───────────────────────────────────────────────────────────────

func TestAPI_PollsLog(t *testing.T) {
	t.Parallel()
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")
	resp := apiDo(t, srv, http.MethodGet, "/api/polls/log", nil, cookies)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}
