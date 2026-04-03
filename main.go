package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func (app *App) routes() http.Handler {
	mux := http.NewServeMux()

	// Static files — L-16 fix: wrap with noDirListing to prevent directory listing exposure
	mux.Handle("/static/", http.StripPrefix("/static/", noDirListing(http.FileServer(http.Dir("static")))))

	// Favicon at root (browsers request /favicon.ico by default)
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/favicon.ico")
	})

	// Pages
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			http.ServeFile(w, r, "static/404.html")
			return
		}
		_, user := app.getSession(r)
		if user == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		http.ServeFile(w, r, "static/index.html")
	})
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/login.html")
	})
	mux.HandleFunc("/admin-view", app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
		http.ServeFile(w, r, "static/admin.html")
	}))

	// Documentation / User Manual
	mux.HandleFunc("/docs/user-manual", app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = "en"
		}
		// V-15 fix: validate lang parameter to prevent path traversal
		for _, r := range lang {
			if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '-') {
				http.Error(w, "invalid language code", http.StatusBadRequest)
				return
			}
		}
		if len(lang) > 10 {
			http.Error(w, "invalid language code", http.StatusBadRequest)
			return
		}
		file := "docs/USER_MANUAL.md"
		if lang != "en" {
			candidate := fmt.Sprintf("docs/USER_MANUAL_%s.md", strings.ToUpper(lang))
			if _, err := os.Stat(candidate); err == nil {
				file = candidate
			}
		}
		content, err := os.ReadFile(file)
		if err != nil {
			http.Error(w, "Manual not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!DOCTYPE html>
<html lang="%s"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Tidslinjal — User Manual</title>
<link rel="icon" href="/static/favicon.ico" sizes="16x16" type="image/x-icon">
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;max-width:900px;margin:0 auto;padding:20px 40px;background:#0f1923;color:#cfd8e3;line-height:1.6}
a{color:#4A90D9}h1,h2,h3,h4{color:#f0f4f8;margin-top:1.5em}h1{border-bottom:2px solid #2a3f56;padding-bottom:8px}
h2{border-bottom:1px solid #2a3f56;padding-bottom:6px}code{background:#1e2d40;padding:2px 6px;border-radius:4px;font-size:0.9em}
pre{background:#1e2d40;padding:16px;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%%}th,td{border:1px solid #2a3f56;padding:8px 12px;text-align:left}
th{background:#1e2d40}blockquote{border-left:4px solid #4A90D9;margin:1em 0;padding:8px 16px;background:#162030}
hr{border:none;border-top:1px solid #2a3f56;margin:2em 0}
.back-link{display:inline-block;margin-bottom:20px;color:#4A90D9;text-decoration:none;font-size:14px}
.back-link:hover{text-decoration:underline}
</style></head><body>
<a href="/" class="back-link">← Back to Tidslinjal</a>
<div id="content"></div>
<script src="/static/docs-renderer.js"></script>
</body></html>`, lang)
		_ = content // will be served via API
	}))
	mux.HandleFunc("/api/docs/user-manual", app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = "en"
		}
		// C-02 fix: validate lang parameter to prevent path traversal (same as HTML endpoint)
		for _, c := range lang {
			if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '-') {
				jsonError(w, "invalid language code", http.StatusBadRequest)
				return
			}
		}
		if len(lang) > 10 {
			jsonError(w, "invalid language code", http.StatusBadRequest)
			return
		}
		file := "docs/USER_MANUAL.md"
		if lang != "en" {
			candidate := fmt.Sprintf("docs/USER_MANUAL_%s.md", strings.ToUpper(lang))
			if _, err := os.Stat(candidate); err == nil {
				file = candidate
			}
		}
		content, err := os.ReadFile(file)
		if err != nil {
			jsonError(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write(content)
	}))

	// Version
	mux.HandleFunc("/api/version", func(w http.ResponseWriter, r *http.Request) {
		_, user := app.getSession(r)
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		handleVersion(w, r)
	})
	mux.HandleFunc("/api/db-stats", app.requireAuth(app.handleDBStats))

	// Languages (enabled language list)
	mux.HandleFunc("/api/languages", func(w http.ResponseWriter, r *http.Request) {
		_, user := app.getSession(r)
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(app.enabledLangs)
	})

	// Day Labels
	mux.HandleFunc("/api/day-labels", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetDayLabels)(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateDayLabel)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/day-labels/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleReadWrite, app.handleUpdateDayLabel)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleReadWrite, app.handleDeleteDayLabel)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// Integration status (admin-only summary of SSO/TLS/Syslog/SMTP/Webhooks/API keys)
	mux.HandleFunc("/api/status", app.requireRole(RoleAdmin, app.handleStatus))

	// Sidebar security tab endpoints (admin-only, used by sidebar.js _optionalApiGet)
	mux.HandleFunc("GET /api/tls/status", app.requireRole(RoleAdmin, app.handleTLSStatus))
	mux.HandleFunc("GET /api/oidc/config", app.requireRole(RoleAdmin, app.handleOIDCConfigForSidebar))
	mux.HandleFunc("GET /api/security/policy", app.requireRole(RoleAdmin, app.handleSecurityPolicy))

	// Admin operations
	mux.HandleFunc("/api/admin/reset", app.requireRole(RoleAdmin, app.handleAdminReset))
	mux.HandleFunc("/api/admin/registration", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			// Public: expose only the mode (not the invitation code) so login page can check
			_, u := app.getSession(r)
			rs := app.store.GetRegistrationSettings()
			if u != nil && u.Role == RoleAdmin {
				// Admin sees full settings including invitation code
				jsonOK(w, rs)
			} else {
				// Public only sees mode
				jsonOK(w, map[string]string{"mode": rs.Mode})
			}
			return
		}
		app.requireRole(RoleAdmin, app.handleRegistrationSettings)(w, r)
	})
	mux.HandleFunc("/api/admin/invitations", app.requireRole(RoleAdmin, app.handleInvitations))
	mux.HandleFunc("/api/admin/invitations/", app.requireRole(RoleAdmin, app.handleDeleteInvitation))
	mux.HandleFunc("/api/admin/oidc", app.requireRole(RoleAdmin, app.handleOIDCSettings))
	mux.HandleFunc("/api/admin/oidc/test", app.requireRole(RoleAdmin, app.handleOIDCTest))
	mux.HandleFunc("/api/admin/sessions", app.requireRole(RoleAdmin, app.handleAdminSessions))
	mux.HandleFunc("/api/admin/sessions/", app.requireRole(RoleAdmin, app.handleAdminDeleteSession))
	mux.HandleFunc("/api/admin/bulk/status", app.requireRole(RoleAdmin, app.handleAdminBulkStatus))
	mux.HandleFunc("/api/admin/bulk/delete", app.requireRole(RoleAdmin, app.handleAdminBulkDelete))
	mux.HandleFunc("/api/admin/bulk/type", app.requireRole(RoleAdmin, app.handleAdminBulkSetType))
	mux.HandleFunc("/api/export/xlsx", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleExportXLSX)(w, r)
	})

	// Auth
	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		// V-21 fix: require X-Requested-With header on login to prevent login CSRF
		if r.Method == http.MethodPost {
			if r.Header.Get("X-Requested-With") == "" {
				jsonError(w, "missing required header", http.StatusForbidden)
				return
			}
		}
		app.handleLogin(w, r)
	})
	mux.HandleFunc("/api/auth/logout", app.handleLogout)
	mux.HandleFunc("/api/auth/me", app.requireAuth(app.handleMe))
	mux.HandleFunc("/api/auth/change-password", app.requireAuth(app.handleChangePassword))
	mux.HandleFunc("/api/auth/password-policy", app.requireAuth(app.handlePasswordPolicy))
	// V3-L01 fix: add CSRF header check to pre-auth POST endpoints (matching login pattern)
	mux.HandleFunc("/api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if r.Header.Get("X-Requested-With") == "" {
				jsonError(w, "missing required header", http.StatusForbidden)
				return
			}
		}
		app.handleRegister(w, r)
	})
	mux.HandleFunc("/api/auth/forgot-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if r.Header.Get("X-Requested-With") == "" {
				jsonError(w, "missing required header", http.StatusForbidden)
				return
			}
		}
		app.handleForgotPassword(w, r)
	})
	mux.HandleFunc("/api/auth/reset-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if r.Header.Get("X-Requested-With") == "" {
				jsonError(w, "missing required header", http.StatusForbidden)
				return
			}
		}
		app.handleResetPassword(w, r)
	})
	mux.HandleFunc("/api/auth/update-email", app.requireAuth(app.handleUpdateEmail))

	// Preferences
	mux.HandleFunc("/api/preferences", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPreferences)(w, r)
		case http.MethodPut:
			app.requireAuth(app.handleSavePreferences)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Event types
	mux.HandleFunc("/api/event-types", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
				app.handleGetEventTypes(w, r)
			})(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateEventType)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/event-types/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleReadWrite, app.handleUpdateEventType)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleReadWrite, app.handleDeleteEventType)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Events
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetEvents)(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateEvent)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// Event sub-resources (attachments, comments) and event CRUD
	mux.HandleFunc("/api/events/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")

		// /api/events/:id/status
		if len(parts) == 4 && parts[3] == "status" && r.Method == http.MethodPatch {
			app.requireAuth(app.handlePatchEventStatus)(w, r)
			return
		}

		// /api/events/:id/attachments
		if len(parts) == 4 && parts[3] == "attachments" {
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetAttachments)(w, r)
			case http.MethodPost:
				app.requireAuth(app.handleUploadAttachment)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// /api/events/:id/comments
		if len(parts) == 4 && parts[3] == "comments" {
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetComments)(w, r)
			case http.MethodPost:
				app.requireAuth(app.handleCreateComment)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// /api/events/:id/history
		if len(parts) == 4 && parts[3] == "history" && r.Method == http.MethodGet {
			app.requireAuth(app.handleGetEventHistory)(w, r)
			return
		}

		// /api/events/:id/lock (editing lock)
		if len(parts) == 4 && parts[3] == "lock" {
			switch r.Method {
			case http.MethodPost:
				app.requireAuth(app.handleAcquireEditingLock)(w, r)
			case http.MethodDelete:
				app.requireAuth(app.handleReleaseEditingLock)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// /api/events/:id
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateEvent)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteEvent)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Attachments download/delete
	mux.HandleFunc("/api/attachments/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleDownloadAttachment)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteAttachment)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Layers
	mux.HandleFunc("/api/layers", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetLayers)(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateLayer)(w, r) // V-14 fix: require write permission
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/layers/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateLayer)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteLayer)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Groups
	mux.HandleFunc("/api/groups", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetGroups)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateGroup)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/groups/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")

		if len(parts) >= 4 && parts[3] == "members" {
			if len(parts) == 5 && r.Method == http.MethodDelete {
				app.requireRole(RoleAdmin, app.handleRemoveGroupMember)(w, r)
				return
			}
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetGroupMembers)(w, r)
			case http.MethodPost:
				app.requireRole(RoleAdmin, app.handleAddGroupMember)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleUpdateGroup)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleAdmin, app.handleDeleteGroup)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Alarms
	mux.HandleFunc("/api/alarms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetAlarms)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateAlarm)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/alarms/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		// POST /api/alarms/:id/ack
		if len(parts) == 4 && parts[3] == "ack" && r.Method == http.MethodPost {
			app.requireAuth(app.handleAckAlarm)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteAlarm)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Audit log (teamlead+)
	mux.HandleFunc("/api/audit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleTeamLead, app.handleGetAudit)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Exercise settings (admin saves, any auth reads)
	mux.HandleFunc("/api/exercise", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetExercise)(w, r)
		case http.MethodPut:
			app.requireRole(RoleOpLead, app.handleSaveExercise)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// SSE
	mux.HandleFunc("/api/notifications/stream", app.handleSSE)

	// Locks
	mux.HandleFunc("/api/locks", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetLocks)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateLock)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/locks/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteLock)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Users
	mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleRead, app.handleGetUsers)(w, r)
		case http.MethodPost:
			app.requireRole(RoleAdmin, app.handleCreateUser)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/users/:id/groups
		if len(parts) == 4 && parts[3] == "groups" && r.Method == http.MethodGet {
			app.requireAuth(app.handleGetUserGroups)(w, r)
			return
		}
		// /api/users/:id/vet
		if len(parts) == 4 && parts[3] == "vet" && r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleVetUser)(w, r)
			return
		}
		// /api/users/:id/block
		if len(parts) == 4 && parts[3] == "block" && r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleBlockUser)(w, r)
			return
		}
		// /api/users/:id/unblock
		if len(parts) == 4 && parts[3] == "unblock" && r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleUnblockUser)(w, r)
			return
		}
		// /api/users/:id/login-history — returns recent login audit entries for a user
		if len(parts) == 4 && parts[3] == "login-history" && r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, admin *User) {
				pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
				if len(pathParts) < 4 {
					jsonError(w, "missing id", http.StatusBadRequest)
					return
				}
				userID, err := strconv.ParseInt(pathParts[2], 10, 64)
				if err != nil {
					jsonError(w, "invalid id", http.StatusBadRequest)
					return
				}
				targetUser, ok := app.store.GetUserByID(userID)
				if !ok {
					jsonError(w, "user not found", http.StatusNotFound)
					return
				}
				allEntries := app.store.GetAudit(0) // all entries, newest first
				var loginEntries []AuditEntry
				successCount := 0
				for _, e := range allEntries {
					if e.EntityType == "user" && e.EntityID == userID &&
						(e.Action == "login" || e.Action == "login_failed" || e.Action == "login_blocked") {
						loginEntries = append(loginEntries, e)
						if e.Action == "login" {
							successCount++
						}
						if len(loginEntries) >= 100 {
							break
						}
					}
				}
				// Fix login count if it drifted from audit log reality
				if targetUser.LoginCount != successCount && successCount > 0 {
					targetUser.LoginCount = successCount
					app.store.UpdateUser(*targetUser) //nolint
				}
				jsonOK(w, loginEntries)
			})(w, r)
			return
		}
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateUser)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleAdmin, app.handleDeleteUser)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Comments delete/approve
	mux.HandleFunc("/api/comments/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/comments/:id/approve
		if len(parts) == 4 && parts[3] == "approve" && r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, app.handleApproveComment)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteComment)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Exercise Phases
	mux.HandleFunc("/api/phases", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPhases)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreatePhase)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/phases/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleUpdatePhase)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeletePhase)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Export (authenticated users; admin/oplead can export all)
	mux.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleExport)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// Import (readwrite+; admin/oplead can import all)
	mux.HandleFunc("/api/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleImport)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// ICS import
	mux.HandleFunc("/api/import/ics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleImportICS)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Templates
	mux.HandleFunc("/api/templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetTemplates)(w, r)
		case http.MethodPost:
			app.requireRole(RoleReadWrite, app.handleCreateTemplate)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/templates/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/templates/"), "/")
		if len(parts) == 1 && r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteTemplate)(w, r)
		} else if len(parts) == 2 && parts[1] == "apply" && r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleApplyTemplate)(w, r)
		} else {
			http.Error(w, "not found", http.StatusNotFound)
		}
	})

	// Role configuration (admin only for PUT)
	mux.HandleFunc("/api/roles", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetRoles)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleUpdateRoles)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Reset database (admin only)
	mux.HandleFunc("/api/reset", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleResetDatabase)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Event duplicate
	mux.HandleFunc("/api/events-duplicate/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleDuplicateEvent)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Activity feed
	mux.HandleFunc("/api/activity", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetActivityFeed)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ICS export
	mux.HandleFunc("/api/export/ics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleExportICS)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// OIDC SSO routes (only registered if OIDC is configured)
	if app.oidc != nil {
		mux.HandleFunc("/auth/oidc/login", app.handleOIDCLogin)
		mux.HandleFunc("/auth/oidc/callback", app.handleOIDCCallback)
		mux.HandleFunc("/api/auth/oidc-config", app.handleOIDCInfo)
	}

	// Mail configuration (admin only)
	mux.HandleFunc("/api/integrations/mail", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetMailConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveMailConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Mail send (for reports / alarm notifications)
	mux.HandleFunc("/api/mail/send", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, app.handleSendMail)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Mail: test connection
	mux.HandleFunc("/api/integrations/mail/test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleTestMail)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Syslog configuration (admin only)
	mux.HandleFunc("/api/integrations/syslog", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetSyslogConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveSyslogConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Syslog: test connection
	mux.HandleFunc("/api/integrations/syslog/test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleTestSyslog)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Security settings (password policy) — admin only
	mux.HandleFunc("/api/admin/security", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetSecuritySettings)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveSecuritySettings)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// TLS configuration — admin only (takes effect on next server restart)
	mux.HandleFunc("/api/integrations/tls", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetTLSConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveTLSConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// IP Blacklist — admin only
	mux.HandleFunc("/api/admin/ip-blacklist", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetIPBlacklist)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveIPBlacklist)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/ip-blacklist/add", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		app.requireRole(RoleAdmin, app.handleAddIPBlacklistEntry)(w, r)
	})
	mux.HandleFunc("/api/admin/ip-blacklist/remove", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		app.requireRole(RoleAdmin, app.handleRemoveIPBlacklistEntry)(w, r)
	})
	mux.HandleFunc("/api/admin/ip-blacklist/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		app.requireRole(RoleAdmin, app.handleExportIPBlacklist)(w, r)
	})
	mux.HandleFunc("/api/admin/ip-blacklist/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		app.requireRole(RoleAdmin, app.handleImportIPBlacklist)(w, r)
	})

	// Reports: on-demand download in specific format
	mux.HandleFunc("/api/reports/download", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleTeamLead, app.handleReportDownload)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Auto-report schedules (server-side)
	mux.HandleFunc("/api/auto-report-schedules", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleTeamLead, app.handleListAutoReportSchedules)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateAutoReportSchedule)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/auto-report-schedules/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleTeamLead, app.handleDeleteAutoReportSchedule)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// API Keys
	mux.HandleFunc("/api/apikeys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListAPIKeys)(w, r)
		case http.MethodPost:
			app.requireRole(RoleAdmin, app.handleCreateAPIKey)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/apikeys/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleDeleteAPIKey)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Filter presets
	mux.HandleFunc("/api/filter-presets", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListFilterPresets)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateFilterPreset)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/filter-presets/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireAuth(app.handleDeleteFilterPreset)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Decisions (formerly Decision Log) — use Go 1.22+ method-based routing for clarity
	mux.HandleFunc("GET /api/decision-log", app.requireAuth(app.handleListDecisionLog))
	mux.HandleFunc("POST /api/decision-log", app.requireAuth(app.handleAddDecisionLogEntry))
	mux.HandleFunc("POST /api/decision-log/request", app.requireAuth(app.handleRequestDecision))
	mux.HandleFunc("DELETE /api/decision-log/{id}", app.requireRole(RoleAdmin, app.handleDeleteDecisionLogEntry))
	mux.HandleFunc("PUT /api/decision-log/{id}/review", app.requireAuth(app.handleReviewDecisionLogEntry))
	mux.HandleFunc("PUT /api/decision-log/{id}/cosign", app.requireRole(RoleTeamLead, app.handleCoSignDecisionLogEntry))
	mux.HandleFunc("POST /api/decision-log/{id}/attachment", app.requireRole(RoleTeamLead, app.handleDecisionLogAttachment))
	mux.HandleFunc("POST /api/decision-log/{id}/share", app.requireRole(RoleTeamLead, app.handleGenerateDecisionLogShareToken))
	mux.HandleFunc("GET /api/decision-log/shared", app.requireAuth(app.handleGetDecisionLogByShareToken))

	// Report Archive
	mux.HandleFunc("GET /api/report-archive", app.requireAuth(app.handleListReportArchive))
	mux.HandleFunc("POST /api/report-archive", app.requireRole(RoleTeamLead, app.handleUploadReportArchive))
	mux.HandleFunc("GET /api/report-archive/{id}/download", app.requireAuth(app.handleDownloadReportArchive))
	mux.HandleFunc("DELETE /api/report-archive/{id}", app.requireRole(RoleTeamLead, app.handleDeleteReportArchive))

	// Report Ingest Config (admin only)
	mux.HandleFunc("/api/integrations/report-ingest", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetReportIngestConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveReportIngestConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Report Ingest API (API key auth, handled internally)
	mux.HandleFunc("/api/reports/ingest", app.handleReportIngest)

	// Analysis / Statistics API
	mux.HandleFunc("GET /api/stats/overview", app.requireAuth(app.handleStatsOverview))
	mux.HandleFunc("GET /api/stats/events/timeline", app.requireAuth(app.handleStatsEventsTimeline))
	mux.HandleFunc("GET /api/stats/events/status", app.requireAuth(app.handleStatsEventsStatus))
	mux.HandleFunc("GET /api/stats/events/type", app.requireAuth(app.handleStatsEventsType))
	mux.HandleFunc("GET /api/stats/events/heatmap", app.requireAuth(app.handleStatsEventsHeatmap))
	mux.HandleFunc("GET /api/stats/users/workload", app.requireAuth(app.handleStatsUsersWorkload))
	mux.HandleFunc("GET /api/stats/users/locations", app.requireRole(RoleTeamLead, app.handleStatsUserLocations))
	mux.HandleFunc("GET /api/stats/decisions", app.requireAuth(app.handleStatsDecisions))
	mux.HandleFunc("GET /api/stats/events/slip", app.requireAuth(app.handleStatsSlipHistogram))
	mux.HandleFunc("GET /api/stats/events/tempo", app.requireAuth(app.handleStatsOpTempo))
	mux.HandleFunc("GET /api/stats/decisions/analytics", app.requireAuth(app.handleStatsDecisionAnalytics))
	mux.HandleFunc("GET /api/stats/dependencies/graph", app.requireAuth(app.handleStatsDependencyGraph))
	mux.HandleFunc("GET /api/stats/export", app.requireAuth(app.handleStatsExport))
	// Frontend-facing aliases for stats endpoints
	mux.HandleFunc("GET /api/stats/dependency-graph", app.requireAuth(app.handleStatsDependencyGraph))
	mux.HandleFunc("GET /api/stats/decision-analytics", app.requireAuth(app.handleStatsDecisionAnalytics))
	mux.HandleFunc("GET /api/stats/slip-histogram", app.requireAuth(app.handleStatsSlipHistogram))
	mux.HandleFunc("GET /api/stats/op-tempo", app.requireAuth(app.handleStatsOpTempo))
	mux.HandleFunc("GET /api/dashboard", app.requireAuth(app.handleDashboardData))
	mux.HandleFunc("/api/dashboard/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetDashboardConfig)(w, r)
		case http.MethodPut:
			app.requireAuth(app.handleSaveDashboardConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("GET /api/stats/leadership-dashboard", app.requireRole(RoleOpLead, app.handleStatsLeadershipDashboard))
	mux.HandleFunc("GET /api/stats/personnel-performance", app.requireAuth(app.handleStatsPersonnelPerformance))
	mux.HandleFunc("GET /api/stats/usage", app.requireAuth(app.handleStatsUsage))
	mux.HandleFunc("GET /api/stats/polls", app.requireAuth(app.handleStatsPollAnalytics))
	mux.HandleFunc("GET /api/stats/boards", app.requireAuth(app.handleStatsBoardAnalytics))

	// Narrative / Storyline API
	mux.HandleFunc("GET /api/narrative", app.requireAuth(app.handleNarrative))

	// TeamLead Toolbox API
	mux.HandleFunc("POST /api/teamlead/quick-response", app.requireRole(RoleTeamLead, app.handleTeamLeadQuickResponse))
	mux.HandleFunc("POST /api/teamlead/escalate-decision", app.requireRole(RoleTeamLead, app.handleTeamLeadEscalateDecision))
	mux.HandleFunc("POST /api/teamlead/ready-check", app.requireRole(RoleTeamLead, app.handleTeamLeadReadyCheck))
	mux.HandleFunc("POST /api/teamlead/team-poll", app.requireRole(RoleTeamLead, app.handleTeamLeadTeamPoll))
	mux.HandleFunc("POST /api/teamlead/quick-report", app.requireRole(RoleTeamLead, app.handleTeamLeadQuickReport))
	mux.HandleFunc("GET /api/teamlead/quick-reports", app.requireAuth(app.handleGetQuickReports))

	// Staff Toolbox API
	mux.HandleFunc("GET /api/staff/duties", app.requireRole(RoleStaffOfficer, app.handleGetStaffDuties))
	mux.HandleFunc("POST /api/staff/duties", app.requireRole(RoleStaffOfficer, app.handleSetStaffDuty))
	mux.HandleFunc("DELETE /api/staff/duties/{id}", app.requireRole(RoleStaffOfficer, app.handleDeleteStaffDuty))
	mux.HandleFunc("GET /api/staff/members", app.requireRole(RoleStaffOfficer, app.handleGetStaffMembers))
	mux.HandleFunc("POST /api/staff/members", app.requireRole(RoleStaffOfficer, app.handleSetStaffMember))
	mux.HandleFunc("DELETE /api/staff/members/{id}", app.requireRole(RoleStaffOfficer, app.handleDeleteStaffMember))
	mux.HandleFunc("GET /api/staff/areas", app.requireRole(RoleStaffOfficer, app.handleGetAreas))
	mux.HandleFunc("POST /api/staff/areas", app.requireRole(RoleStaffOfficer, app.handleCreateArea))
	mux.HandleFunc("PUT /api/staff/areas/{id}", app.requireRole(RoleStaffOfficer, app.handleUpdateArea))
	mux.HandleFunc("DELETE /api/staff/areas/{id}", app.requireRole(RoleStaffOfficer, app.handleDeleteArea))
	mux.HandleFunc("GET /api/decision-log/{id}/attachment/{filename}", func(w http.ResponseWriter, r *http.Request) {
		_, user := app.getSession(r)
		if user == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		app.handleDecisionLogAttachmentDownload(w, r)
	})

	// Event Log
	mux.HandleFunc("/api/event-log", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleTeamLead, app.handleGetEventLog)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleAddEventLog)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Log Book
	mux.HandleFunc("/api/log-book", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetLogBook)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleAddLogBookEntry)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/log-book/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if r.Method == http.MethodDelete && !strings.Contains(path, "/attachment") {
			app.requireRole(RoleTeamLead, app.handleDeleteLogBookEntry)(w, r)
		} else if r.Method == http.MethodPost && strings.Contains(path, "/attachment") {
			app.requireAuth(app.handleLogBookAttachment)(w, r)
		} else if r.Method == http.MethodGet && strings.Contains(path, "/attachment/") {
			app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
				app.handleLogBookAttachmentDownload(w, r)
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Map Locations
	mux.HandleFunc("/api/map-locations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListMapLocations)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleAddMapLocation)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/map-locations/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleUpdateMapLocation)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeleteMapLocation)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Connector configuration (admin only)
	mux.HandleFunc("/api/integrations/connectors", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListConnectors)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveConnectorConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Digest & Jira Stats ──
	mux.HandleFunc("/api/integrations/digest", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleOpLead, app.handleSendDigest)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/connectors/jira/stats", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleOpLead, app.handleJiraStats)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Editing locks (all active locks for collaborative editing awareness)
	mux.HandleFunc("/api/editing-locks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetEditingLocks)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Backup & Restore (admin only)
	mux.HandleFunc("/api/backup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, app.handleBackup)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/restore", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleRestore)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Rate limiting settings (admin only)
	mux.HandleFunc("/api/admin/rate-limits", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				rl := app.store.GetRateLimitSettings()
				jsonOK(w, rl)
			})(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				var req struct {
					LoginLimit         int `json:"login_limit"`
					RegistrationLimit  int `json:"registration_limit"`
					PasswordResetLimit int `json:"password_reset_limit"`
				}
				if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
					http.Error(w, "invalid request", http.StatusBadRequest)
					return
				}
				app.store.SaveRateLimitSettings(req.LoginLimit, req.RegistrationLimit, req.PasswordResetLimit)
				app.audit(user.ID, user.Username, "update_rate_limits", "settings", 0, fmt.Sprintf("login=%d reg=%d reset=%d", req.LoginLimit, req.RegistrationLimit, req.PasswordResetLimit))
				jsonOK(w, map[string]string{"ok": "true"})
			})(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Geoblocking settings (admin only)
	mux.HandleFunc("/api/admin/geoblocking", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				geo := app.store.GetGeoblockingSettings()
				jsonOK(w, geo)
			})(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				var req struct {
					Enabled   bool     `json:"enabled"`
					Mode      string   `json:"mode"`
					Countries []string `json:"countries"`
				}
				if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
					http.Error(w, "invalid request", http.StatusBadRequest)
					return
				}
				app.store.SaveGeoblockingSettings(req.Enabled, req.Mode, req.Countries)
				app.audit(user.ID, user.Username, "update_geoblocking", "settings", 0, fmt.Sprintf("enabled=%v mode=%s countries=%v", req.Enabled, req.Mode, req.Countries))
				jsonOK(w, map[string]string{"ok": "true"})
			})(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Backup encryption settings (admin only)
	mux.HandleFunc("/api/admin/encryption", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				enc := app.store.GetEncryptionSettings()
				jsonOK(w, enc)
			})(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				var req struct {
					Enabled bool `json:"enabled"`
				}
				if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
					http.Error(w, "invalid request", http.StatusBadRequest)
					return
				}
				app.store.SaveEncryptionSettings(req.Enabled)
				app.audit(user.ID, user.Username, "update_encryption", "settings", 0, fmt.Sprintf("enabled=%v", req.Enabled))
				jsonOK(w, map[string]string{"ok": "true"})
			})(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// SSO toggle (admin only)
	mux.HandleFunc("/api/admin/sso-toggle", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				var req struct {
					Enabled bool `json:"enabled"`
				}
				if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
					http.Error(w, "invalid request", http.StatusBadRequest)
					return
				}
				app.store.SaveSSOToggle(req.Enabled)
				app.audit(user.ID, user.Username, "toggle_sso", "settings", 0, fmt.Sprintf("enabled=%v", req.Enabled))
				jsonOK(w, map[string]string{"ok": "true"})
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Backend restart (admin only)
	// L-15 fix: use graceful shutdown via app.shutdownCh instead of os.Exit(0)
	mux.HandleFunc("/api/admin/restart-backend", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				app.audit(user.ID, user.Username, "restart_backend", "system", 0, "Admin initiated backend restart")
				jsonOK(w, map[string]string{"ok": "true"})
				go func() {
					time.Sleep(500 * time.Millisecond)
					app.Stop()
					os.Exit(0)
				}()
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Server restart (disabled — OS-level reboot from a web API is a security risk;
	// use systemd/supervisor to manage the process lifecycle instead)
	mux.HandleFunc("/api/admin/restart-server", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				app.audit(user.ID, user.Username, "restart_server_denied", "system", 0, "Server restart via API is disabled for security")
				jsonError(w, "server restart via API is disabled for security — use systemd/supervisor to restart", http.StatusForbidden)
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Test stats (admin only)
	mux.HandleFunc("/api/admin/test-stats", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
				stats := app.store.GetTestStats()
				jsonOK(w, stats)
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// References link (URL / local)
	mux.HandleFunc("/api/references/link", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, func(w http.ResponseWriter, r *http.Request, user *User) {
				var req struct {
					Title          string `json:"title"`
					Description    string `json:"description"`
					Category       string `json:"category"`
					Tags           string `json:"tags"`
					RefType        string `json:"ref_type"`
					URL            string `json:"url"`
					Content        string `json:"content"`
					DownloadLocal  bool   `json:"download_local"`
					DownloadServer bool   `json:"download_server"`
					Language       string `json:"language"`
					Owner          string `json:"owner"`
					Authors        string `json:"authors"`
					Custodian      string `json:"custodian"`
					CopyMode       string `json:"copy_mode"`
				}
				if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
					jsonError(w, "invalid request", http.StatusBadRequest)
					return
				}
				if req.Title == "" {
					jsonError(w, "title is required", http.StatusBadRequest)
					return
				}
				ref := app.store.CreateReferenceLink(req.Title, req.Description, req.Category, req.Tags, req.RefType, req.URL, req.Content, user.ID, user.DisplayName)
				// Set additional metadata fields on the created reference
				ref.Language = req.Language
				ref.Owner = req.Owner
				ref.Authors = req.Authors
				ref.Custodian = req.Custodian
				ref.CopyMode = req.CopyMode
				app.store.UpdateReferenceDoc(ref)
				// If download_server is set and URL is provided, fetch and cache the URL content
				if req.DownloadServer && req.URL != "" && req.RefType == "url" {
					go func() {
						// V-09 fix: use DNS-resolution-based SSRF protection (same as webhook system)
						if err := validateWebhookURL(req.URL); err != nil {
							logVerbose("[reference] rejected URL (SSRF): %s — %v", req.URL, err)
							return
						}
						client := &http.Client{Timeout: 30 * time.Second, Transport: newSSRFSafeTransport()}
						resp, err := client.Get(req.URL) //nolint:gosec
						if err != nil {
							logVerbose("[reference] failed to download URL %s: %v", req.URL, err)
							return
						}
						defer resp.Body.Close()
						body, err := io.ReadAll(io.LimitReader(resp.Body, 50<<20)) // 50MB limit
						if err != nil {
							logVerbose("[reference] failed to read URL %s: %v", req.URL, err)
							return
						}
						refDir := filepath.Join(app.store.DataDir(), "references")
						fname := fmt.Sprintf("ref_%d_cached", ref.ID)
						if err := os.WriteFile(filepath.Join(refDir, fname), body, 0600); err != nil {
							logVerbose("[reference] failed to save cached copy: %v", err)
							return
						}
						logVerbose("[reference] cached URL %s as %s (%d bytes)", req.URL, fname, len(body))
					}()
				}
				jsonOK(w, ref)
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Export logs
	mux.HandleFunc("/api/export/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleOpLead, func(w http.ResponseWriter, r *http.Request, user *User) {
				logType := r.URL.Query().Get("type")
				format := r.URL.Query().Get("format")
				if format == "" {
					format = "json"
				}
				var data interface{}
				var filename string
				switch logType {
				case "decision_log":
					data = app.store.GetDecisionLog()
					filename = "decision_log"
				case "log_book":
					data = app.store.GetLogBook()
					filename = "log_book"
				case "audit_log":
					data = app.store.GetAudit(500)
					filename = "audit_log"
				case "event_log":
					data = app.store.GetEventLog()
					filename = "event_log"
				case "pollster_log":
					data = app.store.GetPolls()
					filename = "pollster_log"
				case "checklist_log":
					data = app.store.GetChecklistInstances()
					filename = "checklist_log"
				default:
					http.Error(w, `{"error":"invalid log type"}`, http.StatusBadRequest)
					return
				}
				switch format {
				case "csv":
					w.Header().Set("Content-Type", "text/csv")
					w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, filename))
					b, _ := json.Marshal(data)
					w.Write(b) // simplified — real CSV conversion would be more complex
				case "xml":
					w.Header().Set("Content-Type", "application/xml")
					w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.xml"`, filename))
					w.Write([]byte("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"))
					b, _ := json.Marshal(data)
					w.Write([]byte(fmt.Sprintf("<data>%s</data>", string(b))))
				default:
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, filename))
					json.NewEncoder(w).Encode(data)
				}
				app.audit(user.ID, user.DisplayName, "exported", "logs", 0,
					fmt.Sprintf("Exported %s log in %s format", logType, format))
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Export settings
	mux.HandleFunc("/api/export/settings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleOpLead, func(w http.ResponseWriter, r *http.Request, user *User) {
				settings := app.store.GetAllSettings()
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Content-Disposition", `attachment; filename="tidslinjal_settings.json"`)
				json.NewEncoder(w).Encode(settings)
				app.audit(user.ID, user.DisplayName, "exported", "settings", 0,
					"Exported application settings")
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Gradual Backup (admin only)
	mux.HandleFunc("/api/admin/gradual-backup", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleGradualBackupSettings)(w, r)
	})
	mux.HandleFunc("/api/admin/gradual-backup/snapshot", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleGradualBackupSnapshotNow)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/gradual-backup/restore/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleAdmin, app.handleGradualBackupRestore)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/gradual-backup/download/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireRole(RoleAdmin, app.handleGradualBackupDownload)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/gradual-backup/snapshots/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleGradualBackupDelete)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// WebCal subscription (token-based, no session cookie required)
	mux.HandleFunc("/webcal/", app.handleWebCal)

	// Update user profile handles (social handles, etc.)
	mux.HandleFunc("/api/auth/profile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			app.requireAuth(app.handleUpdateProfile)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Cascade reschedule for event dependencies
	mux.HandleFunc("/api/events/cascade", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleReadWrite, app.handleCascadeReschedule)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Ingest API ──
	mux.HandleFunc("/api/ingest", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleReadWrite, app.handleIngest)(w, r) // V-13 fix: require write permission
	})

	// ── Routing rules (admin/oplead) ──
	mux.HandleFunc("/api/routing-rules", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleOpLead, app.handleRoutingRules)(w, r)
	})
	mux.HandleFunc("/api/routing-rules/", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleOpLead, app.handleRoutingRule)(w, r)
	})

	// ── Connector management (admin only) ──
	mux.HandleFunc("/api/connectors", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleConnectors)(w, r)
	})
	mux.HandleFunc("/api/connectors/", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleConnectorConfig)(w, r)
	})

	// ── STIX export ──
	mux.HandleFunc("/api/export/stix", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleSTIXExport)(w, r)
	})

	// ── LDAP config (admin only) ──
	mux.HandleFunc("/api/integrations/ldap", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleLDAPConfig)(w, r)
	})
	mux.HandleFunc("/api/integrations/ldap/test", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, app.handleLDAPTest)(w, r)
	})

	// ── Federated IdPs / Trust Realms (admin only) ──
	mux.HandleFunc("/api/federation/idps", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListFederatedIdPs)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveFederatedIdP)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/federation/idps/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleDeleteFederatedIdP)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/federation/realms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleListTrustRealms)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveTrustRealm)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Rooms / Resources ──
	mux.HandleFunc("/api/rooms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListRooms)(w, r)
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleSaveRoom)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/rooms/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if r.Method == http.MethodDelete && !strings.Contains(path, "/image") {
			app.requireRole(RoleTeamLead, app.handleDeleteRoom)(w, r)
		} else if r.Method == http.MethodPost && strings.HasSuffix(path, "/image") {
			app.requireRole(RoleTeamLead, app.handleRoomImageUpload)(w, r)
		} else if r.Method == http.MethodGet && strings.Contains(path, "/image") {
			app.requireAuth(func(w http.ResponseWriter, r *http.Request, user *User) {
				app.handleRoomImageDownload(w, r)
			})(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Custom Resource Types ──
	mux.HandleFunc("/api/custom-resource-types", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListCustomResourceTypes)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveCustomResourceType)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/custom-resource-types/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleDeleteCustomResourceType)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Ready Check ──
	mux.HandleFunc("/api/ready-check", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleReadyCheck)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Person Ready Check ──
	mux.HandleFunc("/api/person-ready-check", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPersonReadyChecks)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreatePersonReadyCheck)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/person-ready-check/{id}/respond", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			app.requireAuth(app.handleRespondPersonReadyCheck)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Polls / Multipoll ──
	mux.HandleFunc("/api/polls", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPolls)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreatePoll)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/polls/log", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetPollLog)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/polls/default-questions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetDefaultPollQuestions)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/polls/{id}", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetPoll)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeletePoll)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/polls/{id}/respond", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			app.requireAuth(app.handleRespondPoll)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/polls/{id}/close", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			app.requireRole(RoleTeamLead, app.handleClosePoll)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/polls/{id}/remind", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, app.handlePollReminder)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Poll Questionnaires ──
	mux.HandleFunc("/api/poll-questionnaires", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetQuestionnaires)(w, r)
		case http.MethodPost:
			app.requireRole(RoleStaffOfficer, app.handleCreateQuestionnaire)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/poll-questionnaires/{id}", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleStaffOfficer, app.handleUpdateQuestionnaire)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleStaffOfficer, app.handleDeleteQuestionnaire)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/poll-questionnaires/{id}/duplicate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleStaffOfficer, app.handleDuplicateQuestionnaire)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Tags ──
	mux.HandleFunc("/api/tags", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetTags)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateTag)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/tags/cloud", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetTagCloud)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/tags/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleTeamLead, app.handleDeleteTag)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Checklist Templates ──
	mux.HandleFunc("/api/checklist-templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetChecklistTemplates)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateChecklistTemplate)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/checklist-templates/{id}", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleUpdateChecklistTemplate)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeleteChecklistTemplate)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Checklist Instances ──
	mux.HandleFunc("/api/checklist-instances", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetChecklistInstances)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateChecklistInstance)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/checklist-instances/{id}", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateChecklistInstance)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteChecklistInstance)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Boards (Kanban) ──
	mux.HandleFunc("/api/boards", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetBoards)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateBoard)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/boards/templates", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleGetBoardTemplates)(w, r)
	})
	mux.HandleFunc("/api/boards/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireAuth(app.handleImportBoard)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/boards/shared", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleGetBoardByShareToken)(w, r)
	})
	mux.HandleFunc("/api/boards/due-items", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleGetBoardDueItems)(w, r)
	})
	mux.HandleFunc("/api/boards/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/boards/{id}/share
		if len(parts) == 4 && parts[3] == "share" {
			if r.Method == http.MethodPost {
				app.requireAuth(app.handleGenerateBoardShareToken)(w, r)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		// /api/boards/{id}/tags
		if len(parts) == 4 && parts[3] == "tags" {
			app.requireAuth(app.handleGetBoardTags)(w, r)
			return
		}
		// /api/boards/{id}/items
		if len(parts) == 4 && parts[3] == "items" {
			switch r.Method {
			case http.MethodGet:
				app.requireAuth(app.handleGetBoardItems)(w, r)
			case http.MethodPost:
				app.requireAuth(app.handleCreateBoardItem)(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		// /api/boards/{id}/export/{format}
		if len(parts) == 5 && parts[3] == "export" {
			app.requireAuth(app.handleExportBoard)(w, r)
			return
		}
		// /api/boards/{id}
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetBoard)(w, r)
		case http.MethodPut:
			app.requireAuth(app.handleUpdateBoard)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteBoard)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/board-items/shared", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleGetBoardItemByShareToken)(w, r)
	})
	mux.HandleFunc("/api/board-items/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/board-items/{id}/move
		if len(parts) == 3 && parts[2] == "move" {
			jsonError(w, "invalid path", http.StatusBadRequest)
			return
		}
		if len(parts) >= 4 && parts[2] != "" {
			itemSeg := parts[1]
			_ = itemSeg
			// /api/board-items/{id}/share
			if len(parts) == 4 && parts[3] == "share" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleGenerateBoardItemShareToken)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/move
			if len(parts) == 4 && parts[3] == "move" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleMoveBoardItem)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/move-to-board
			if len(parts) == 4 && parts[3] == "move-to-board" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleMoveBoardItemToBoard)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/comments
			if len(parts) == 4 && parts[3] == "comments" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleAddBoardItemComment)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/attachments
			if len(parts) == 4 && parts[3] == "attachments" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleUploadBoardItemAttachment)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/archive
			if len(parts) == 4 && parts[3] == "archive" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleArchiveBoardItem)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/unarchive
			if len(parts) == 4 && parts[3] == "unarchive" {
				if r.Method == http.MethodPost {
					app.requireAuth(app.handleUnarchiveBoardItem)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			// /api/board-items/{id}/attachments/{attId}
			if len(parts) == 5 && parts[3] == "attachments" {
				if r.Method == http.MethodGet {
					app.requireAuth(app.handleDownloadBoardItemAttachment)(w, r)
				} else {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
		}
		// /api/board-items/{id}
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateBoardItem)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteBoardItem)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Key Terrain Board ──
	mux.HandleFunc("/api/key-terrain", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetKeyTerrainEntries)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateKeyTerrainEntry)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/key-terrain/access", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleGetKeyTerrainAccess)(w, r)
	})
	mux.HandleFunc("/api/key-terrain/users", func(w http.ResponseWriter, r *http.Request) {
		app.requireAuth(app.handleSearchUsersForKeyTerrain)(w, r)
	})
	mux.HandleFunc("/api/key-terrain/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetKeyTerrainSettings)(w, r)
		case http.MethodPut:
			app.requireAuth(app.handleSaveKeyTerrainSettings)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/key-terrain/snapshots", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetKeyTerrainSnapshots)(w, r)
		case http.MethodPost:
			app.requireAuth(app.handleCreateKeyTerrainSnapshot)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/key-terrain/snapshots/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetKeyTerrainSnapshot)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/key-terrain/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			app.requireAuth(app.handleUpdateKeyTerrainEntry)(w, r)
		case http.MethodDelete:
			app.requireAuth(app.handleDeleteKeyTerrainEntry)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Resource Incidents ──
	mux.HandleFunc("/api/resource-incidents", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListResourceIncidents)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleSaveResourceIncident)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/resource-incidents/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/status") {
			app.requireRole(RoleTeamLead, app.handleUpdateResourceIncidentStatus)(w, r)
		} else if r.Method == http.MethodDelete {
			app.requireRole(RoleAdmin, app.handleDeleteResourceIncident)(w, r)
		} else if r.Method == http.MethodPut {
			app.requireRole(RoleTeamLead, app.handleSaveResourceIncident)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Resource Notes ──
	mux.HandleFunc("/api/resource-notes", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetResourceNotes)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateResourceNote)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/resource-notes/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleTeamLead, app.handleDeleteResourceNote)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Resource Stars ──
	mux.HandleFunc("/api/resource-stars", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetResourceStars)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleCreateResourceStar)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/resource-stars/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.requireRole(RoleStaffOfficer, app.handleDeleteResourceStar)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Startup Text ──
	mux.HandleFunc("/api/startup-text", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetStartupText)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSetStartupText)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Personal Notifications ──
	mux.HandleFunc("/api/personal-notifications", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleGetNotifications)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/personal-notifications/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if strings.HasSuffix(r.URL.Path, "/ack") {
				app.requireAuth(app.handleAckNotification)(w, r)
			} else if strings.HasSuffix(r.URL.Path, "/read") {
				app.requireAuth(app.handleReadNotification)(w, r)
			} else {
				http.Error(w, "not found", http.StatusNotFound)
			}
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Free/Busy lookup ──
	mux.HandleFunc("/api/free-busy", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleFreeBusy)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Meeting config (admin only) ──
	mux.HandleFunc("/api/meeting-config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireRole(RoleAdmin, app.handleGetMeetingConfig)(w, r)
		case http.MethodPut:
			app.requireRole(RoleAdmin, app.handleSaveMeetingConfig)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Geo Items (items placed directly on the geographical/OSM map) ──
	mux.HandleFunc("/api/geo-items", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetGeoItems)(w, r)
		case http.MethodPut:
			// L-12 fix: require RoleReadWrite to modify geo items (was any auth)
			app.requireRole(RoleReadWrite, app.handleSetGeoItems)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Map Resources (uploaded maps + overlays) ──
	mux.HandleFunc("/api/map-resources", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListMapResources)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleUploadMapResource)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/map-resources/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/map-resources/{id}/file
		if len(parts) == 4 && parts[3] == "file" && r.Method == http.MethodGet {
			app.requireAuth(app.handleServeMapResourceFile)(w, r)
			return
		}
		// /api/map-resources/{id}/overlays (GET or PUT)
		if len(parts) == 4 && parts[3] == "overlays" {
			if r.Method == http.MethodPut {
				app.requireRole(RoleReadWrite, app.handleUpdateMapResourceOverlays)(w, r)
			} else if r.Method == http.MethodGet {
				app.requireAuth(app.handleGetMapOverlays)(w, r)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		// /api/map-resources/{id}/overlays/{overlayId}/lock
		if len(parts) == 6 && parts[3] == "overlays" && parts[5] == "lock" && r.Method == http.MethodPost {
			app.requireAuth(app.handleLockMapOverlay)(w, r)
			return
		}
		// /api/map-resources/{id}/overlays/{overlayId}/unlock
		if len(parts) == 6 && parts[3] == "overlays" && parts[5] == "unlock" && r.Method == http.MethodPost {
			app.requireAuth(app.handleUnlockMapOverlay)(w, r)
			return
		}
		// /api/map-resources/{id}/lock
		if len(parts) == 4 && parts[3] == "lock" && r.Method == http.MethodPost {
			app.requireAuth(app.handleLockMap)(w, r)
			return
		}
		// /api/map-resources/{id}/unlock
		if len(parts) == 4 && parts[3] == "unlock" && r.Method == http.MethodPost {
			app.requireAuth(app.handleUnlockMap)(w, r)
			return
		}
		// /api/map-resources/{id}/drawings
		if len(parts) == 4 && parts[3] == "drawings" {
			if r.Method == http.MethodGet {
				app.requireAuth(app.handleGetMapDrawings)(w, r)
			} else if r.Method == http.MethodPut {
				app.requireRole(RoleReadWrite, app.handleUpdateMapDrawings)(w, r)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		// /api/map-resources/{id}
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetMapResource)(w, r)
		case http.MethodPut:
			app.requireRole(RoleTeamLead, app.handleUpdateMapResourceMeta)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeleteMapResource)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Prometheus metrics (L-03 fix: restricted to admin role) ──
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		app.requireRole(RoleAdmin, func(w http.ResponseWriter, r *http.Request, user *User) {
			app.handleMetrics(w, r)
		})(w, r)
	})

	// ── References ──
	mux.HandleFunc("POST /api/references/git/save", app.requireRole(RoleTeamLead, app.handleGitSaveReferences))
	mux.HandleFunc("POST /api/references/git/load", app.requireRole(RoleTeamLead, app.handleGitLoadReferences))
	mux.HandleFunc("/api/references", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleListReferences)(w, r)
		case http.MethodPost:
			app.requireRole(RoleTeamLead, app.handleUploadReference)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/references/bulk", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			app.requireRole(RoleTeamLead, app.handleBulkUploadReferences)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/references/index", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			app.requireAuth(app.handleReferenceIndex)(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/references/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(r.URL.Path, "/")
		parts := strings.Split(path, "/")
		// /api/references/{id}/download
		if len(parts) == 4 && parts[3] == "download" && r.Method == http.MethodGet {
			app.requireAuth(app.handleDownloadReference)(w, r)
			return
		}
		// /api/references/{id}/checksums
		if len(parts) == 4 && parts[3] == "checksums" && r.Method == http.MethodGet {
			app.requireAuth(app.handleReferenceChecksums)(w, r)
			return
		}
		// /api/references/{id}
		switch r.Method {
		case http.MethodGet:
			app.requireAuth(app.handleGetReference)(w, r)
		case http.MethodPut:
			app.requireAuth(app.handleUpdateReference)(w, r)
		case http.MethodDelete:
			app.requireRole(RoleTeamLead, app.handleDeleteReference)(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// ── Map projection page ──
	mux.HandleFunc("/map", func(w http.ResponseWriter, r *http.Request) {
		_, user := app.getSession(r)
		if user == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		http.ServeFile(w, r, "static/map-popup.html")
	})

	// API versioning: /api/v1/* is rewritten to /api/* for forward compatibility.
	// When a v2 is introduced, v1 routes can be frozen and v2 handled separately.
	var handler http.Handler = apiVersionRewrite(mux)

	// Add request ID middleware for audit correlation
	handler = requestIDMiddleware(handler)

	// Wrap the entire mux with security headers.
	if app.secureMode {
		handler = securityHeadersWithHSTS(handler)
	} else {
		handler = securityHeaders(handler)
	}

	// IP blacklist — outermost layer, blocks before any processing
	handler = app.ipBlacklistMiddleware(handler)

	return handler
}

// apiVersionRewrite transparently rewrites /api/v1/* requests to /api/* so that
// clients can start using versioned URLs today. The /api/* paths continue to work
// as an alias for the current (v1) API version.
func apiVersionRewrite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v1/") {
			r2 := r.Clone(r.Context())
			r2.URL = cloneURL(r.URL)
			r2.URL.Path = "/api/" + strings.TrimPrefix(r.URL.Path, "/api/v1/")
			if r2.URL.RawPath != "" {
				r2.URL.RawPath = "/api/" + strings.TrimPrefix(r2.URL.RawPath, "/api/v1/")
			}
			next.ServeHTTP(w, r2)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// cloneURL returns a shallow copy of a URL.
func cloneURL(u *url.URL) *url.URL {
	u2 := *u
	return &u2
}

func main() {
	// CLI flags
	var (
		host    string
		port    string
		dataDir string
		tlsCert string
		tlsKey  string
		// OIDC flags
		oidcIssuer       string
		oidcClientID     string
		oidcClientSecret string
		oidcRedirectURL  string
		oidcExclusive    bool
		oidcDefaultRole  string
	)
	flag.StringVar(&host,    "host",    "",      "Listen host/interface (default: all interfaces, i.e. 0.0.0.0)")
	flag.StringVar(&port,    "port",    "",      "Listen port (default: 8080 for HTTP, 443 for HTTPS, or $PORT env)")
	flag.StringVar(&dataDir, "data",    "",      "Data directory (default: data, or $DATA_DIR env)")
	flag.BoolVar(&verbose,   "verbose", false,   "Enable verbose logging")
	flag.BoolVar(&debug,     "debug",   false,   "Enable debug logging (implies verbose)")
	flag.StringVar(&tlsCert, "tls-cert", "",     "Path to TLS certificate file (enables HTTPS)")
	flag.StringVar(&tlsKey,  "tls-key",  "",     "Path to TLS private key file (enables HTTPS)")
	flag.StringVar(&oidcIssuer,       "oidc-issuer",        os.Getenv("OIDC_ISSUER"),        "OIDC provider issuer URL (e.g. https://accounts.google.com)")
	flag.StringVar(&oidcClientID,     "oidc-client-id",     os.Getenv("OIDC_CLIENT_ID"),     "OIDC client ID")
	flag.StringVar(&oidcClientSecret, "oidc-client-secret", os.Getenv("OIDC_CLIENT_SECRET"), "OIDC client secret")
	flag.StringVar(&oidcRedirectURL,  "oidc-redirect-url",  os.Getenv("OIDC_REDIRECT_URL"),  "OIDC redirect URL (e.g. https://your-server/auth/oidc/callback)")
	flag.BoolVar(&oidcExclusive,      "oidc-exclusive",     os.Getenv("OIDC_EXCLUSIVE") == "true", "Disable local username/password login (SSO only; admin account excepted)")
	flag.StringVar(&oidcDefaultRole,  "oidc-default-role",  os.Getenv("OIDC_DEFAULT_ROLE"),  "Default role for auto-created OIDC users (teammember|teamlead|oplead; default: teammember)")

	// Syslog flags (override persistent config stored in syslog.json)
	var (
		syslogHost      = os.Getenv("SYSLOG_HOST")
		syslogPort      int
		syslogTransport = os.Getenv("SYSLOG_TRANSPORT") // udp | tcp | tls
		syslogFormat    = os.Getenv("SYSLOG_FORMAT")    // classic | json
	)
	flag.StringVar(&syslogHost,      "syslog-host",      syslogHost,      "Syslog server host (enables syslog forwarding)")
	flag.IntVar(&syslogPort,         "syslog-port",      0,               "Syslog server port (default 514 UDP/TCP, 6514 TLS)")
	flag.StringVar(&syslogTransport, "syslog-transport", syslogTransport, "Syslog transport: udp | tcp | tls (default: udp)")
	flag.StringVar(&syslogFormat,    "syslog-format",    syslogFormat,    "Syslog message format: classic | json (default: classic)")

	// Language flags
	var (
		languagesFlag        string
		disableLanguagesFlag string
	)
	flag.StringVar(&languagesFlag,        "languages",         os.Getenv("LANGUAGES"),         "Comma-separated list of enabled language codes (e.g. en,sv,da). Empty = all languages enabled.")
	flag.StringVar(&disableLanguagesFlag, "disable-languages", os.Getenv("DISABLE_LANGUAGES"), "Comma-separated list of language codes to disable (e.g. et,lv,lt). Ignored if --languages is set.")
	flag.Parse()

	if debug {
		verbose = true
	}

	// Fall back to environment variables
	portEnv := os.Getenv("PORT")
	if port == "" {
		port = portEnv // may still be "" — final default set after TLS is resolved
	}
	if dataDir == "" {
		dataDir = os.Getenv("DATA_DIR")
		if dataDir == "" {
			dataDir = "data"
		}
	}
	if tlsCert == "" {
		tlsCert = os.Getenv("TLS_CERT")
	}
	if tlsKey == "" {
		tlsKey = os.Getenv("TLS_KEY")
	}

	app, err := NewApp(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize: %v", err)
	}

	// TLS config: CLI flags / env vars take priority; fall back to persistent admin UI settings
	if tlsCert == "" && tlsKey == "" {
		persisted := app.store.GetTLSConfig()
		if persisted.CertFile != "" && persisted.KeyFile != "" {
			tlsCert = persisted.CertFile
			tlsKey = persisted.KeyFile
			log.Printf("[INFO] TLS config loaded from persistent settings: cert=%s key=%s", tlsCert, tlsKey)
		}
	}

	// Set default port now that TLS is fully resolved:
	// 443 when TLS is configured (saved or via flags/env), 8080 otherwise.
	if port == "" {
		if tlsCert != "" && tlsKey != "" {
			port = "443"
		} else {
			port = "8080"
		}
	}

	// Configure OIDC — CLI flags take priority; fall back to persistent settings stored in DB
	if oidcIssuer != "" {
		if err := app.configureOIDC(oidcIssuer, oidcClientID, oidcClientSecret, oidcRedirectURL); err != nil {
			log.Printf("[WARN] OIDC configuration failed: %v — SSO will be unavailable", err)
		} else {
			app.oidcExclusive = oidcExclusive
			if oidcDefaultRole != "" {
				app.oidcDefaultRole = Role(oidcDefaultRole)
			}
			log.Printf("OIDC SSO enabled (CLI): issuer=%s exclusive=%v defaultRole=%q",
				oidcIssuer, oidcExclusive, app.oidcDefaultRole)
		}
	} else {
		// No CLI flags — try persistent settings saved via the admin UI
		persistedOIDC := app.store.GetOIDCSettings()
		if persistedOIDC.Enabled && persistedOIDC.Issuer != "" && persistedOIDC.ClientID != "" {
			if err := app.configureOIDC(persistedOIDC.Issuer, persistedOIDC.ClientID, persistedOIDC.ClientSecret, persistedOIDC.RedirectURL); err != nil {
				log.Printf("[WARN] OIDC configuration (from DB) failed: %v — SSO will be unavailable", err)
			} else {
				app.oidcExclusive = persistedOIDC.Exclusive
				if persistedOIDC.DefaultRole != "" {
					app.oidcDefaultRole = Role(persistedOIDC.DefaultRole)
				}
				log.Printf("OIDC SSO enabled (DB): issuer=%s exclusive=%v defaultRole=%q",
					persistedOIDC.Issuer, persistedOIDC.Exclusive, app.oidcDefaultRole)
			}
		}
	}

	// Configure syslog — CLI flags override persistent settings
	{
		sysCfg := app.store.GetSyslogConfig()
		if syslogHost != "" {
			// CLI flags take priority
			sysCfg.Enabled = true
			sysCfg.Host = syslogHost
			if syslogPort != 0 {
				sysCfg.Port = syslogPort
			}
			if syslogTransport != "" {
				sysCfg.Transport = syslogTransport
			}
			if syslogFormat != "" {
				sysCfg.Format = syslogFormat
			}
		}
		if sysCfg.Transport == "" {
			sysCfg.Transport = "udp"
		}
		if sysCfg.Format == "" {
			sysCfg.Format = "classic"
		}
		setSyslogWriter(sysCfg)
		if sysCfg.Enabled && sysCfg.Host != "" {
			// Hook syslog into the standard logger
			log.SetOutput(&syslogLogWriter{orig: os.Stderr})
		}
	}

	// Resolve enabled languages
	allLangs := []string{"en", "sv", "fr", "fi", "da", "de", "nb", "nl", "et", "lv", "lt", "it", "es", "pt", "pl", "uk", "is"}
	if languagesFlag != "" {
		// Explicit whitelist
		var enabled []string
		for _, code := range strings.Split(languagesFlag, ",") {
			code = strings.TrimSpace(strings.ToLower(code))
			if code != "" {
				enabled = append(enabled, code)
			}
		}
		// Always ensure "en" is included as it's the fallback language
		hasEN := false
		for _, c := range enabled {
			if c == "en" {
				hasEN = true
				break
			}
		}
		if !hasEN {
			enabled = append([]string{"en"}, enabled...)
		}
		app.enabledLangs = enabled
	} else if disableLanguagesFlag != "" {
		// Blacklist: start from all and remove disabled
		disabled := make(map[string]bool)
		for _, code := range strings.Split(disableLanguagesFlag, ",") {
			code = strings.TrimSpace(strings.ToLower(code))
			if code != "" && code != "en" { // never disable English
				disabled[code] = true
			}
		}
		var enabled []string
		for _, l := range allLangs {
			if !disabled[l] {
				enabled = append(enabled, l)
			}
		}
		app.enabledLangs = enabled
	} else {
		app.enabledLangs = allLangs
	}

	go app.runAlarmScheduler()
	go app.runSessionCleaner()
	go app.runGradualBackupScheduler()
	go app.runPRCScheduler()
	go app.runPollScheduler()
	app.startAutoReportScheduler()

	addr := host + ":" + port
	listenAddr := addr
	if host == "" {
		listenAddr = "0.0.0.0:" + port
	}

	useTLS := tlsCert != "" && tlsKey != ""
	scheme := "http"
	if useTLS {
		scheme = "https"
	}

	// ── Startup summary ──────────────────────────────────────────────────────
	hn, _ := os.Hostname()
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Printf("  Tidslinjal v%s (commit %s)", AppVersion, BuildCommit)
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Runtime / system info
	log.Printf("  Hostname   : %s", hn)
	log.Printf("  PID        : %d", os.Getpid())
	log.Printf("  Go version : %s", runtime.Version())
	if BuildTime != "" {
		log.Printf("  Built at   : %s", BuildTime)
	}
	log.Printf("  OS/Arch    : %s/%s", runtime.GOOS, runtime.GOARCH)
	log.Printf("  CPUs       : %d", runtime.NumCPU())
	log.Printf("  Started at : %s", time.Now().Format(time.RFC3339))

	// Network / TLS
	log.Printf("  URL        : %s://%s", scheme, listenAddr)
	log.Printf("  Bind addr  : %s (host=%q port=%s)", addr, func() string { if host == "" { return "0.0.0.0 (all interfaces)" }; return host }(), port)
	if useTLS {
		log.Printf("  TLS        : ENABLED")
		log.Printf("    cert     : %s", tlsCert)
		log.Printf("    key      : %s", tlsKey)
		// Verify cert/key files are readable
		if _, err := os.Stat(tlsCert); err != nil {
			log.Printf("    [WARN] cert file not accessible: %v", err)
		}
		if _, err := os.Stat(tlsKey); err != nil {
			log.Printf("    [WARN] key file not accessible: %v", err)
		}
	} else {
		log.Printf("  TLS        : disabled (plain HTTP)")
	}

	// Data / debug
	absData, _ := filepath.Abs(dataDir)
	log.Printf("  Data dir   : %s", absData)
	log.Printf("  Debug      : %v   Verbose: %v", debug, verbose)

	// Authentication — registration
	rs := app.store.GetRegistrationSettings()
	log.Printf("  Auth")
	log.Printf("    local login    : enabled (admin always allowed)")
	log.Printf("    registration   : mode=%s", rs.Mode)

	// Authentication — OIDC
	if app.oidc != nil {
		log.Printf("    OIDC/SSO       : ENABLED")
		log.Printf("      issuer       : %s", app.oidc.Issuer)
		log.Printf("      client_id    : %s", app.oidc.ClientID)
		log.Printf("      redirect_url : %s", app.oidc.RedirectURL)
		log.Printf("      exclusive    : %v  (local login %s)", app.oidcExclusive, func() string {
			if app.oidcExclusive { return "BLOCKED for non-admin" }
			return "still allowed"
		}())
		dr := app.oidcDefaultRole
		if dr == "" { dr = RoleReadWrite }
		log.Printf("      default_role : %s", dr)
	} else {
		log.Printf("    OIDC/SSO       : disabled")
	}

	// Exercise / operation mode
	ex := app.store.GetExerciseSettings()
	log.Printf("  Exercise")
	log.Printf("    enabled        : %v", ex.Enabled)
	if ex.Enabled {
		log.Printf("    mode           : %s", func() string { if ex.OperationMode != "" { return ex.OperationMode }; return "exercise" }())
		log.Printf("    label          : %q", ex.Label)
		log.Printf("    epoch (STARTEX): %s", ex.Epoch)
		if ex.GroupLabel != "" {
			log.Printf("    group_label    : %s", ex.GroupLabel)
		}
		if ex.UserLabel != "" {
			log.Printf("    user_label     : %s", ex.UserLabel)
		}
	}

	// Syslog
	sysCfgDisplay := app.store.GetSyslogConfig()
	if globalSyslog != nil {
		p := sysCfgDisplay.Port
		if p == 0 {
			if sysCfgDisplay.Transport == "tls" {
				p = 6514
			} else {
				p = 514
			}
		}
		log.Printf("  Syslog     : ENABLED (%s) %s:%d format=%s",
			sysCfgDisplay.Transport, sysCfgDisplay.Host, p, sysCfgDisplay.Format)
	} else {
		log.Printf("  Syslog     : disabled")
	}

	// Mail
	mailCfg := app.store.GetMailConfig()
	if mailCfg.SMTPHost != "" {
		log.Printf("  Mail       : ENABLED (%s:%d)", mailCfg.SMTPHost, mailCfg.SMTPPort)
	} else {
		log.Printf("  Mail       : disabled")
	}

	// Gradual backup
	gbCfg := app.store.GetGradualBackupSettings()
	if gbCfg.Enabled {
		log.Printf("  Backup     : ENABLED (interval=%dm, max=%d, encrypt=%v)", gbCfg.IntervalMinutes, gbCfg.MaxSnapshots, app.store.GetEncryptionSettings().Enabled)
	} else {
		log.Printf("  Backup     : disabled")
	}

	// API keys
	apiKeys := app.store.GetAPIKeys()
	log.Printf("  API keys   : %d configured", len(apiKeys))

	// Rate limiting
	rlCfg := app.store.GetRateLimitSettings()
	log.Printf("  Rate limits: login=%d reg=%d reset=%d", rlCfg.LoginLimit, rlCfg.RegistrationLimit, rlCfg.PasswordResetLimit)

	// Geoblocking (ISO 3166-1)
	geoCfg := app.store.GetGeoblockingSettings()
	if geoCfg.Enabled {
		log.Printf("  Geoblocking: ENABLED mode=%s countries=%v (ISO 3166-1)", geoCfg.Mode, geoCfg.Countries)
	} else {
		log.Printf("  Geoblocking: disabled")
	}

	// Languages
	log.Printf("  Languages  : %s (%d of %d)", strings.Join(app.enabledLangs, ", "), len(app.enabledLangs), len(allLangs))

	// Security policy
	secCfg := app.store.GetSecuritySettings()
	if secCfg.PasswordPolicyEnabled {
		log.Printf("  Password   : policy ENABLED (min=%d upper=%v lower=%v num=%v sym=%v)", secCfg.MinLength, secCfg.RequireUppercase, secCfg.RequireLowercase, secCfg.RequireNumbers, secCfg.RequireSymbols)
	} else {
		log.Printf("  Password   : no policy enforced")
	}

	// Data summary (always shown — gives a quick health overview)
	{
		users := app.store.GetUsers()
		evTypes := app.store.GetEventTypes()
		grps := app.store.GetGroups()
		lyrs := app.store.GetAllLayers()
		phases := app.store.GetPhases()
		refs := app.store.GetReferenceDocs()
		locs := app.store.GetMapLocations()
		schedules := app.store.GetAutoReportSchedules()
		log.Printf("  Data")
		log.Printf("    users      : %d", len(users))
		log.Printf("    groups     : %d", len(grps))
		log.Printf("    layers     : %d", len(lyrs))
		log.Printf("    event types: %d", len(evTypes))
		log.Printf("    phases     : %d", len(phases))
		log.Printf("    references : %d", len(refs))
		log.Printf("    map locs   : %d", len(locs))
		log.Printf("    auto rpts  : %d", len(schedules))
	}

	// Extra debug info
	if debug {
		evs := app.store.GetEvents(time.Time{}, time.Now().Add(10*365*24*time.Hour), nil)
		decisions := app.store.GetDecisionLog()
		sessions := app.store.GetAllSessions()
		log.Printf("  [DEBUG] Extended data:")
		log.Printf("    events     : %d", len(evs))
		log.Printf("    decisions  : %d", len(decisions))
		log.Printf("    sessions   : %d (active)", len(sessions))
		log.Printf("  [DEBUG] All registered API routes will be logged per request")

		// Log configured security limits
		ss := app.store.GetSecuritySettings()
		log.Printf("  [DEBUG] Security limits:")
		log.Printf("    Password policy      : enabled=%v  minLength=%d  uppercase=%v  lowercase=%v  numbers=%v  symbols=%v",
			ss.PasswordPolicyEnabled, ss.MinLength, ss.RequireUppercase, ss.RequireLowercase, ss.RequireNumbers, ss.RequireSymbols)
		pwHist := ss.PasswordHistoryCount
		if pwHist <= 0 { pwHist = 0 }
		log.Printf("    Password history     : %d (0=disabled)", pwHist)
		log.Printf("    Session time         : enabled=%v  hours=%d", ss.SessionTimeEnabled, ss.SessionTimeHours)
		log.Printf("    Idle timeout         : enabled=%v  hours=%d", ss.IdleTimeoutEnabled, ss.IdleTimeoutHours)
		log.Printf("    Logoff on pw change  : %v", ss.LogoffOnPasswordChange)
		log.Printf("    Rotate sess on role  : %v", ss.RotateSessionOnRoleChange)
		log.Printf("    Disable pw login     : %v", ss.DisablePasswordLogin)
		uploadDaily := ss.UploadQuotaDailyMB
		if uploadDaily <= 0 { uploadDaily = 500 }
		uploadTotal := ss.UploadQuotaTotalMB
		if uploadTotal <= 0 { uploadTotal = 5000 }
		log.Printf("    Upload quota daily   : %d MB", uploadDaily)
		log.Printf("    Upload quota total   : %d MB", uploadTotal)
		maxSSE := ss.MaxSSEConnsPerUser
		if maxSSE <= 0 { maxSSE = 5 }
		log.Printf("    Max SSE conns/user   : %d", maxSSE)
		pollMin := ss.ConnectorPollMinSeconds
		if pollMin < 30 { pollMin = 30 }
		log.Printf("    Connector poll min   : %d seconds", pollMin)
		maxComments := ss.MaxCommentsPerEvent
		if maxComments <= 0 { maxComments = 500 }
		log.Printf("    Max comments/event   : %d", maxComments)

		// Rate limits
		rl := app.store.GetRateLimitSettings()
		log.Printf("    Login rate limit     : %d/window", rl.LoginLimit)
		log.Printf("    Registration limit   : %d/window", rl.RegistrationLimit)
		log.Printf("    Password reset limit : %d/window", rl.PasswordResetLimit)
		log.Printf("    API key rate limit   : 20/minute (per IP)")

		// Gradual backup
		gb := app.store.GetGradualBackupSettings()
		log.Printf("    Gradual backup       : enabled=%v  interval=%d min  max=%d snapshots", gb.Enabled, gb.IntervalMinutes, gb.MaxSnapshots)
	}
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Enable secure-mode (HTTPS) features when TLS is configured.
	app.secureMode = useTLS

	handler := app.routes()

	// Wrap with debug request logger when --debug is enabled
	if debug {
		inner := handler
		handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("[DEBUG] %s %s from %s", r.Method, r.URL.Path, clientIP(r))
			inner.ServeHTTP(w, r)
		})
	}

	// Tuned HTTP server — explicit timeouts prevent resource leaks under high load.
	// WriteTimeout is long (5 min) to allow SSE connections to stay open.
	srv := &http.Server{
		Addr:           addr,
		Handler:        handler,
		ReadHeaderTimeout: 30 * time.Second,
		WriteTimeout:   5 * time.Minute,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB
	}

	// Graceful shutdown: listen for SIGINT/SIGTERM and drain in-flight requests.
	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-shutdownCh
		log.Printf("Received %v — initiating graceful shutdown...", sig)
		shutdownStart := time.Now()

		// Give in-flight requests up to 30 seconds to finish
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Disconnect SSE clients first so they can reconnect to another instance
		connCount := len(app.broker.ConnectedUserIDs())
		if connCount > 0 {
			log.Printf("Closing %d SSE client connection(s)...", connCount)
		}

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		} else {
			log.Printf("HTTP server stopped (took %s)", time.Since(shutdownStart).Truncate(time.Millisecond))
		}

		// Stop background goroutines and drain webhook queue
		log.Printf("Draining background workers...")
		app.Stop()
		log.Printf("Graceful shutdown complete (total %s)", time.Since(shutdownStart).Truncate(time.Millisecond))
	}()

	if useTLS {
		log.Printf("TLS enabled — cert=%s key=%s", tlsCert, tlsKey)
		if err := srv.ListenAndServeTLS(tlsCert, tlsKey); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	} else {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}
}
