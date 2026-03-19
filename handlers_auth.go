package main

import (
	"crypto/subtle"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !app.authLimiter.allow(clientIP(r), 10, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Deny local login when OIDC exclusive mode is enabled (via CLI/OIDC config)
	// or when the admin has disabled password login in security settings.
	// The built-in admin account is always exempted so admins can recover if OIDC breaks.
	if req.Username != "admin" && app.oidc != nil {
		if app.oidcExclusive || app.store.GetSecuritySettings().DisablePasswordLogin {
			logVerbose("local login blocked for %q — SSO-only mode", req.Username)
			app.audit(0, "system", "login_failed_sso_only", "user", 0,
				fmt.Sprintf("Login failed: password login disabled (SSO-only) for %q from %s", req.Username, clientIP(r)))
			jsonError(w, "local login disabled — use SSO", http.StatusForbidden)
			return
		}
	}
	loginClientIP := clientIP(r)
	user, ok := app.store.GetUserByUsername(req.Username)
	if !ok {
		// Perform a dummy bcrypt comparison to prevent timing-based user enumeration.
		bcrypt.CompareHashAndPassword([]byte("$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), []byte(req.Password)) //nolint:errcheck
		app.audit(0, "system", "login_failed_unknown_account", "user", 0,
			fmt.Sprintf("Login failed: unknown account %q from %s", req.Username, loginClientIP))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	// L-06 fix: check progressive account lockout
	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) //nolint:errcheck
		app.audit(user.ID, "system", "login_failed_lockout", "user", user.ID,
			fmt.Sprintf("Login failed: account %q locked out (repeated failures) from %s", user.Username, loginClientIP))
		jsonError(w, "account temporarily locked — try again later", http.StatusTooManyRequests)
		return
	}
	// Check blocked/unvetted status BEFORE password verification to avoid
	// leaking valid credentials via different error responses (V-23 fix)
	if user.Blocked {
		// Still do bcrypt comparison to prevent timing-based detection of blocked accounts
		bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) //nolint:errcheck
		app.audit(user.ID, "system", "login_failed_blocked", "user", user.ID,
			fmt.Sprintf("Login failed: administratively blocked account %q from %s", user.Username, loginClientIP))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if !user.Vetted && user.Role != RoleAdmin {
		// Timing-attack mitigation: dummy bcrypt to prevent detection of unvetted accounts
		bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) //nolint:errcheck
		app.audit(user.ID, "system", "login_failed_unvetted", "user", user.ID,
			fmt.Sprintf("Login failed: unvetted account %q from %s", user.Username, loginClientIP))
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		app.audit(0, "system", "login_failed_password", "user", user.ID,
			fmt.Sprintf("Login failed: wrong password for %q from %s", user.Username, loginClientIP))
		// Record failed login attempt and apply progressive lockout (L-06 fix)
		go func(u User, ip string) {
			if fullUser, ok := app.store.GetUserByID(u.ID); ok {
				now := time.Now()
				fullUser.LastFailedLoginAt = &now
				fullUser.LastFailedLoginIP = ip
				fullUser.FailedLoginCount++
				// Progressive lockout: 5 failures → 15min, 10 → 1hr, 20+ → 4hr
				switch {
				case fullUser.FailedLoginCount >= 20:
					lockUntil := now.Add(4 * time.Hour)
					fullUser.LockedUntil = &lockUntil
				case fullUser.FailedLoginCount >= 10:
					lockUntil := now.Add(1 * time.Hour)
					fullUser.LockedUntil = &lockUntil
				case fullUser.FailedLoginCount >= 5:
					lockUntil := now.Add(15 * time.Minute)
					fullUser.LockedUntil = &lockUntil
				}
				app.store.UpdateUser(*fullUser) //nolint
			}
		}(*user, loginClientIP)
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	sessID, err := generateID()
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Compute session expiry from security settings
	sessionDuration := 24 * time.Hour
	secSettings := app.store.GetSecuritySettings()
	if secSettings.SessionTimeEnabled && secSettings.SessionTimeHours > 0 {
		sessionDuration = time.Duration(secSettings.SessionTimeHours) * time.Hour
	}
	sess := Session{ID: sessID, UserID: user.ID, ExpiresAt: time.Now().Add(sessionDuration)}
	if err := app.store.CreateSession(sess); err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Invalidate all previous sessions for this user to prevent session hijack persistence
	app.store.DeleteSessionsForUserExcept(user.ID, sessID)
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessID,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})
	app.audit(user.ID, user.DisplayName, "login", "user", user.ID,
		fmt.Sprintf("User %q logged in from %s", user.Username, loginClientIP))
	logVerbose("login: user=%q role=%s ip=%s", user.Username, user.Role, loginClientIP)

	// Record last login time, IP, and domain (async to avoid blocking login response)
	go func(u User, ip string) {
		now := time.Now()
		u.LastLoginAt = &now
		u.LastLoginIP = ip
		// Best-effort reverse DNS lookup
		if names, err := net.LookupAddr(ip); err == nil && len(names) > 0 {
			u.LastLoginDomain = strings.TrimSuffix(names[0], ".")
		}
		if fullUser, ok := app.store.GetUserByID(u.ID); ok {
			// Preserve previous login info before overwriting
			fullUser.PrevLoginAt = fullUser.LastLoginAt
			fullUser.PrevLoginIP = fullUser.LastLoginIP
			fullUser.PrevLoginDomain = fullUser.LastLoginDomain
			fullUser.LastLoginAt = u.LastLoginAt
			fullUser.LastLoginIP = u.LastLoginIP
			fullUser.LastLoginDomain = u.LastLoginDomain
			fullUser.LoginCount++
			// L-06 fix: reset failed login counter on successful login
			fullUser.FailedLoginCount = 0
			fullUser.LockedUntil = nil
			app.store.UpdateUser(*fullUser) //nolint
		}
	}(*user, loginClientIP)

	jsonOK(w, user.Public())
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	// M-05 fix: require POST to prevent CSRF logout via <img src="/api/auth/logout">
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_, user := app.getSession(r)
	if c, err := r.Cookie("session"); err == nil {
		logDebug("logout: session=%s", c.Value[:min(8, len(c.Value))])
		app.store.DeleteSession(c.Value) //nolint
	}
	if user != nil {
		ip := clientIP(r)
		app.audit(user.ID, user.DisplayName, "logout", "user", user.ID,
			fmt.Sprintf("User %q logged out from %s", user.Username, ip))
		logVerbose("logout: user=%q ip=%s", user.Username, ip)
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", HttpOnly: true, Secure: app.secureMode, SameSite: http.SameSiteLaxMode, Expires: time.Unix(0, 0)})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request, user *User) {
	pub := user.Public()
	// Enrich with group memberships
	memberships := app.store.GetUserGroups(user.ID)
	allGroups := app.store.GetGroups()
	type groupInfo struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
		Role string `json:"role"`
	}
	groups := make([]groupInfo, 0, len(memberships))
	for _, m := range memberships {
		for _, g := range allGroups {
			if g.ID == m.GroupID {
				groups = append(groups, groupInfo{ID: g.ID, Name: g.Name, Role: m.Role})
				break
			}
		}
	}
	type meResponse struct {
		UserPublic
		Groups          []groupInfo `json:"groups"`
		WebCalToken     string      `json:"webcal_token,omitempty"`
		LastLoginIP     string      `json:"last_login_ip,omitempty"`
		LastLoginDomain string      `json:"last_login_domain,omitempty"`
	}
	jsonOK(w, meResponse{
		UserPublic:      pub,
		Groups:          groups,
		WebCalToken:     user.WebCalToken,
		LastLoginIP:     user.LastLoginIP,
		LastLoginDomain: user.LastLoginDomain,
	})
}

func (app *App) handleChangePassword(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.NewPassword == "" {
		jsonError(w, "new password required", http.StatusBadRequest)
		return
	}
	// Verify current password (unless admin changing own or other — here it's always self)
	fullUser, ok := app.store.GetUserByID(user.ID)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}

	// Block OIDC/SSO users — their identity is managed by the external provider
	if fullUser.IsOIDC {
		jsonError(w, "oidc_account: Password cannot be changed here — this account uses Single Sign-On (SSO/OIDC). Manage your password through your identity provider.", http.StatusForbidden)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(fullUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		jsonError(w, "current password incorrect", http.StatusForbidden)
		return
	}

	// Enforce password quality policy if enabled
	if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
		if err := validatePasswordQuality(req.NewPassword, policy); err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	fullUser.PasswordHash = string(hash)
	if err := app.store.UpdateUser(*fullUser); err != nil {
		jsonError(w, "failed to update password", http.StatusInternalServerError)
		return
	}
	// H-07 fix: invalidate sessions on other devices when password changes
	ss := app.store.GetSecuritySettings()
	if ss.LogoffOnPasswordChange {
		// Get current session ID to preserve it
		currentSessID := ""
		if c, err := r.Cookie("session"); err == nil {
			currentSessID = c.Value
		}
		app.store.DeleteSessionsForUserExcept(user.ID, currentSessID)
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "user", EntityID: user.ID,
		Summary: "changed own password",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// handlePasswordPolicy returns the password policy for any authenticated user.
func (app *App) handlePasswordPolicy(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ss := app.store.GetSecuritySettings()
	jsonOK(w, map[string]any{
		"password_policy_enabled": ss.PasswordPolicyEnabled,
		"min_length":              ss.MinLength,
		"require_uppercase":       ss.RequireUppercase,
		"require_lowercase":       ss.RequireLowercase,
		"require_numbers":         ss.RequireNumbers,
		"require_symbols":         ss.RequireSymbols,
	})
}

// validateUsername checks that a username is non-empty, not too long, and only
// contains safe characters (letters, digits, underscores, hyphens, dots).
// This prevents log injection and other issues caused by unusual characters.
func validateUsername(username string) error {
	if username == "" {
		return fmt.Errorf("username is required")
	}
	if len(username) > 64 {
		return fmt.Errorf("username must be at most 64 characters")
	}
	for _, r := range username {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '_' || r == '-' || r == '.') {
			return fmt.Errorf("username may only contain letters, digits, underscores, hyphens and dots")
		}
	}
	return nil
}

// validatePasswordQuality checks a candidate password against the active policy.
func validatePasswordQuality(password string, policy SecuritySettings) error {
	// H-03 fix: enforce max length to prevent bcrypt 72-byte truncation issues
	if len(password) > 128 {
		return fmt.Errorf("password_quality: Password must not exceed 128 characters")
	}
	minLen := policy.MinLength
	if minLen == 0 {
		minLen = 8
	}
	if len(password) < minLen {
		return fmt.Errorf("password_quality: Password must be at least %d characters long", minLen)
	}
	var hasUpper, hasLower, hasDigit, hasSymbol bool
	for _, r := range password {
		switch {
		case r >= 'A' && r <= 'Z':
			hasUpper = true
		case r >= 'a' && r <= 'z':
			hasLower = true
		case r >= '0' && r <= '9':
			hasDigit = true
		default:
			hasSymbol = true
		}
	}
	if policy.RequireUppercase && !hasUpper {
		return fmt.Errorf("password_quality: Password must contain at least one uppercase letter (A–Z)")
	}
	if policy.RequireLowercase && !hasLower {
		return fmt.Errorf("password_quality: Password must contain at least one lowercase letter (a–z)")
	}
	if policy.RequireNumbers && !hasDigit {
		return fmt.Errorf("password_quality: Password must contain at least one number (0–9)")
	}
	if policy.RequireSymbols && !hasSymbol {
		return fmt.Errorf("password_quality: Password must contain at least one symbol (e.g. !@#$%%^&*)")
	}
	return nil
}

// ── Registration handler ───────────────────────────────────────────────────────

func (app *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !app.authLimiter.allow(clientIP(r), 5, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	rs := app.store.GetRegistrationSettings()
	if rs.Mode == "" || rs.Mode == "off" {
		jsonError(w, "registration is disabled", http.StatusForbidden)
		return
	}
	// oidc_auto_enroll: local registration disabled; users must authenticate via OIDC
	if rs.Mode == "oidc_auto_enroll" {
		jsonError(w, "local registration is disabled — please sign in via OIDC/SSO to get enrolled automatically", http.StatusForbidden)
		return
	}

	var req struct {
		Username       string `json:"username"`
		Password       string `json:"password"`
		DisplayName    string `json:"display_name"`
		Email          string `json:"email"`
		InvitationCode string `json:"invitation_code"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := validateUsername(req.Username); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		jsonError(w, "password is required", http.StatusBadRequest)
		return
	}
	// Apply password quality policy if enabled; otherwise enforce bare minimum of 6
	if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
		if err := validatePasswordQuality(req.Password, policy); err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else if len(req.Password) < 6 || len(req.Password) > 128 {
		jsonError(w, "password must be 6–128 characters", http.StatusBadRequest)
		return
	}

	// Validate invitation codes (V-04 fix: use atomic claim for personal invitations)
	switch rs.Mode {
	case "generic_invitation":
		// V-06 fix: use constant-time comparison for generic invitation code
		if rs.InvitationCode == "" || subtle.ConstantTimeCompare([]byte(req.InvitationCode), []byte(rs.InvitationCode)) != 1 {
			jsonError(w, "invalid invitation code", http.StatusForbidden)
			return
		}
	case "personal_invitation":
		// Atomically claim the invitation to prevent TOCTOU race (V-04 fix)
		if _, ok := app.store.ClaimInvitation(req.InvitationCode, req.Username); !ok {
			jsonError(w, "invalid or already-used invitation code", http.StatusForbidden)
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}

	displayName := stripHTMLTags(req.DisplayName)
	if displayName == "" {
		displayName = req.Username
	}

	// Vetted mode: user must be approved before login
	vetted := rs.Mode != "vetted"

	newUser := User{
		Username:    req.Username,
		PasswordHash: string(hash),
		DisplayName: displayName,
		Email:       req.Email,
		Role:        RoleRead,
		Vetted:      vetted,
	}
	// Atomically check username uniqueness and create user (V-05 fix)
	created, ok, err := app.store.CreateUserIfNotExists(newUser)
	if err != nil {
		jsonError(w, "failed to create user", http.StatusInternalServerError)
		return
	}
	if !ok {
		jsonError(w, "username already taken", http.StatusConflict)
		return
	}

	app.audit(0, "system", "created", "user", created.ID,
		fmt.Sprintf("Self-registered user %q via %s mode", req.Username, rs.Mode))

	if vetted {
		jsonOK(w, map[string]interface{}{"status": "registered", "vetted": true})
	} else {
		jsonOK(w, map[string]interface{}{"status": "pending_approval", "vetted": false})
	}
}

// ── Registration Settings handler ──────────────────────────────────────────────

func (app *App) handleRegistrationSettings(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodGet:
		jsonOK(w, app.store.GetRegistrationSettings())
	case http.MethodPut:
		var rs RegistrationSettings
		if err := decode(r, &rs); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		validModes := map[string]bool{"off": true, "open": true, "vetted": true, "generic_invitation": true, "personal_invitation": true}
		if !validModes[rs.Mode] {
			jsonError(w, "invalid mode", http.StatusBadRequest)
			return
		}
		if err := app.store.SaveRegistrationSettings(rs); err != nil {
			jsonError(w, "failed to save", http.StatusInternalServerError)
			return
		}
		jsonOK(w, rs)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── Invitation handlers ─────────────────────────────────────────────────────────

func (app *App) handleInvitations(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodGet:
		jsonOK(w, app.store.GetInvitations())
	case http.MethodPost:
		var req struct {
			Note  string `json:"note"`
			Email string `json:"email"` // optional: send invitation link via email
		}
		if err := decode(r, &req); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		code, err := generateID()
		if err != nil {
			jsonError(w, "internal error", http.StatusInternalServerError)
			return
		}
		// Use a 24-character code (96 bits of entropy) — short enough to share
		// but long enough to be brute-force resistant.
		code = code[:24]
		inv, err := app.store.CreateInvitation(PersonalInvitation{
			Code:      code,
			Note:      req.Note,
			CreatedBy: user.ID,
		})
		if err != nil {
			jsonError(w, "failed to create invitation", http.StatusInternalServerError)
			return
		}
		// Send invitation email if SMTP is configured and email provided
		if req.Email != "" {
			cfg := app.store.GetMailConfig()
			if cfg.Enabled && cfg.SMTPHost != "" {
				invURL := fmt.Sprintf("/register?code=%s", code)
				body := fmt.Sprintf(`<p>You have been invited to join Tidslinjal.</p>
<p>Click the link below to create your account:</p>
<p><a href="%s">%s</a></p>
<p>Invitation code: <strong>%s</strong></p>`,
					invURL, invURL, htmlEscape(code))
				if err := app.sendMail(cfg, req.Email, "Tidslinjal — Invitation", body); err != nil {
					log.Printf("Failed to send invitation email to %s: %v", req.Email, err)
				} else {
					log.Printf("Invitation email sent to %s (code: %s)", req.Email, code)
				}
			}
		}
		jsonOK(w, inv)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) handleDeleteInvitation(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodDelete {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteInvitation(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Vet User handler ────────────────────────────────────────────────────────────

func (app *App) handleVetUser(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// /api/users/:id/vet
	if len(parts) < 4 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	uid, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.VetUser(uid); err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "user", uid,
		fmt.Sprintf("Admin %q vetted user #%d", user.Username, uid))
	app.broadcastUserChange(user.ID, "vetted", uid)
	// Send approval email if SMTP configured and user has email
	go func() {
		users := app.store.GetUsers()
		for _, u := range users {
			if u.ID == uid && u.Email != "" {
				cfg := app.store.GetMailConfig()
				if cfg.Enabled && cfg.SMTPHost != "" {
					body := fmt.Sprintf(`<p>Hello %s,</p>
<p>Your Tidslinjal account has been approved. You can now log in at <a href="/login">/login</a>.</p>`,
						htmlEscape(u.DisplayName))
					if err := app.sendMail(cfg, u.Email, "Tidslinjal — Account Approved", body); err != nil {
						log.Printf("Failed to send approval email to %s: %v", u.Email, err)
					}
				}
				break
			}
		}
	}()
	jsonOK(w, map[string]string{"status": "ok"})
}

// handleBlockUser blocks a user account (admin only). Blocked users cannot login even via OIDC.
func (app *App) handleBlockUser(w http.ResponseWriter, r *http.Request, admin *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	uid, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	target, ok := app.store.GetUserByID(uid)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	if target.Role == RoleAdmin {
		jsonError(w, "cannot block an admin account", http.StatusForbidden)
		return
	}
	target.Blocked = true
	if err := app.store.UpdateUser(*target); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	// Invalidate all active sessions for the blocked user (V-03 fix)
	app.store.DeleteSessionsForUser(uid)
	app.audit(admin.ID, admin.DisplayName, "blocked", "user", uid,
		fmt.Sprintf("Admin %q blocked user %q (#%d)", admin.Username, target.Username, uid))
	app.broadcastUserChange(admin.ID, "blocked", uid)
	jsonOK(w, map[string]string{"status": "blocked"})
}

// handleUnblockUser removes a block from a user account (admin only).
func (app *App) handleUnblockUser(w http.ResponseWriter, r *http.Request, admin *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	uid, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	target, ok := app.store.GetUserByID(uid)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	target.Blocked = false
	if err := app.store.UpdateUser(*target); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(admin.ID, admin.DisplayName, "unblocked", "user", uid,
		fmt.Sprintf("Admin %q unblocked user %q (#%d)", admin.Username, target.Username, uid))
	app.broadcastUserChange(admin.ID, "unblocked", uid)
	jsonOK(w, map[string]string{"status": "unblocked"})
}

// ── Password Reset handlers ────────────────────────────────────────────────────

func (app *App) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !app.authLimiter.allow(clientIP(r), 5, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Find user by username or email
	var targetUser *User
	if req.Username != "" {
		u, ok := app.store.GetUserByUsername(req.Username)
		if ok {
			targetUser = u
		}
	}
	if targetUser == nil && req.Email != "" {
		users := app.store.GetUsers()
		for i := range users {
			if users[i].Email == req.Email && req.Email != "" {
				targetUser = &users[i]
				break
			}
		}
	}

	// Always return success to avoid user enumeration
	if targetUser == nil {
		jsonOK(w, map[string]string{"status": "ok"})
		return
	}

	token, err := generateID()
	if err != nil {
		jsonOK(w, map[string]string{"status": "ok"})
		return
	}
	expiry := time.Now().Add(2 * time.Hour)
	app.store.SetPasswordResetToken(targetUser.ID, token, expiry) //nolint

	// Never log the token in plaintext — only note that a reset was initiated.
	log.Printf("Password reset requested for user %q (valid 2h)", targetUser.Username)

	// Send reset email if SMTP is configured and user has an email
	cfg := app.store.GetMailConfig()
	if cfg.Enabled && cfg.SMTPHost != "" && targetUser.Email != "" {
		resetURL := fmt.Sprintf("/login?reset_token=%s", token)
		body := fmt.Sprintf(`<p>Hello %s,</p>
<p>A password reset was requested for your Tidslinjal account.</p>
<p>Click the link below to reset your password (valid for 2 hours):</p>
<p><a href="%s">%s</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
			htmlEscape(targetUser.DisplayName), resetURL, resetURL)
		if err := app.sendMail(cfg, targetUser.Email, "Tidslinjal — Password Reset", body); err != nil {
			log.Printf("Failed to send password reset email to %s: %v", targetUser.Email, err)
		}
	} else {
		// SMTP not configured and/or user has no email. Log the token to stderr
		// (server console only, not the HTTP response) so an admin can relay it
		// out-of-band. Never return it in the API response.
		// V-17 fix: avoid logging the full reset token in plaintext
		log.Printf("[SECURITY] No SMTP configured — password reset token generated for %q. Token prefix: %s... (use admin API to retrieve full token securely)", targetUser.Username, token[:8])
	}
	// Always return a generic "ok" regardless of whether email was sent,
	// to avoid leaking whether the account/email exists or whether SMTP is set up.
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// V-24 fix: rate-limit password reset attempts
	if !app.authLimiter.allow(clientIP(r), 5, time.Minute) {
		jsonError(w, "too many requests — try again later", http.StatusTooManyRequests)
		return
	}
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Token == "" || req.NewPassword == "" {
		jsonError(w, "token and new_password required", http.StatusBadRequest)
		return
	}
	// Apply password quality policy if enabled; otherwise enforce a bare minimum of 6
	if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
		if err := validatePasswordQuality(req.NewPassword, policy); err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else if len(req.NewPassword) < 6 || len(req.NewPassword) > 128 {
		jsonError(w, "password must be 6–128 characters", http.StatusBadRequest)
		return
	}

	user, ok := app.store.GetUserByResetToken(req.Token)
	if !ok {
		jsonError(w, "invalid or expired token", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	user.PasswordHash = string(hash)
	user.PasswordResetToken = ""
	user.PasswordResetExpiry = nil
	if err := app.store.UpdateUser(*user); err != nil {
		jsonError(w, "failed to update password", http.StatusInternalServerError)
		return
	}
	// H-07 fix: invalidate all existing sessions after password reset
	app.store.DeleteSessionsForUser(user.ID)
	app.audit(user.ID, user.Username, "updated", "user", user.ID, "password reset via token")
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Update email handler ────────────────────────────────────────────────────────

func (app *App) handleUpdateEmail(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Email           string `json:"email"`
		CurrentPassword string `json:"current_password"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	fullUser, ok := app.store.GetUserByID(user.ID)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	// Require current password verification for email changes (prevents account
	// takeover via session hijack → email change → password reset).
	// OIDC-only users and admins acting on behalf of others are exempt.
	if !fullUser.IsOIDC && fullUser.PasswordHash != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(fullUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
			jsonError(w, "current password is incorrect", http.StatusForbidden)
			return
		}
	}
	oldEmail := fullUser.Email
	fullUser.Email = req.Email
	if err := app.store.UpdateUser(*fullUser); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "email_changed", "user", user.ID,
		fmt.Sprintf("Email changed from %q to %q", oldEmail, req.Email))
	jsonOK(w, map[string]string{"status": "ok"})
}
