package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Free/Busy lookup handler ───────────────────────────────────────────────────

func (app *App) handleFreeBusy(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	resourceType := q.Get("type")   // "user" or "room"
	idStr := q.Get("id")
	fromStr := q.Get("from")
	toStr := q.Get("to")

	if fromStr == "" || toStr == "" {
		jsonError(w, "from and to parameters required (ISO8601)", http.StatusBadRequest)
		return
	}
	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		jsonError(w, "invalid from date", http.StatusBadRequest)
		return
	}
	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		jsonError(w, "invalid to date", http.StatusBadRequest)
		return
	}

	id, _ := strconv.ParseInt(idStr, 10, 64)

	type busySlot struct {
		Title     string    `json:"title"`
		StartTime time.Time `json:"start_time"`
		EndTime   *time.Time `json:"end_time,omitempty"`
	}

	var slots []busySlot
	if resourceType == "room" && id > 0 {
		events := app.store.GetRoomFreeBusy(id, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	} else if id > 0 {
		events := app.store.GetFreeBusy(id, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	} else {
		// Return availability for requesting user
		events := app.store.GetFreeBusy(user.ID, from, to)
		for _, ev := range events {
			slots = append(slots, busySlot{Title: ev.Title, StartTime: ev.StartTime, EndTime: ev.EndTime})
		}
	}
	if slots == nil {
		slots = []busySlot{}
	}
	jsonOK(w, slots)
}

// ── Meeting config handlers ────────────────────────────────────────────────────

func (app *App) handleGetMeetingConfig(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetMeetingConfig()
	// Mask secrets before returning
	if cfg.TeamsSecret != "" {
		cfg.TeamsSecret = "••••••••"
	}
	if cfg.ZoomSecret != "" {
		cfg.ZoomSecret = "••••••••"
	}
	jsonOK(w, cfg)
}

func (app *App) handleSaveMeetingConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg MeetingConfig
	if err := decode(r, &cfg); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// If secrets are masked, preserve the existing ones
	existing := app.store.GetMeetingConfig()
	if cfg.TeamsSecret == "••••••••" || cfg.TeamsSecret == "" {
		cfg.TeamsSecret = existing.TeamsSecret
	}
	if cfg.ZoomSecret == "••••••••" || cfg.ZoomSecret == "" {
		cfg.ZoomSecret = existing.ZoomSecret
	}
	if err := app.store.SaveMeetingConfig(cfg); err != nil {
		jsonError(w, "failed to save meeting config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "meeting_config", EntityID: 0,
		Summary: "Updated meeting integration config",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Filter Presets ────────────────────────────────────────────────────────────

func (app *App) handleListFilterPresets(w http.ResponseWriter, r *http.Request, user *User) {
	presets := app.store.GetFilterPresets(user.ID)
	if presets == nil {
		presets = []FilterPreset{}
	}
	jsonOK(w, presets)
}

func (app *App) handleCreateFilterPreset(w http.ResponseWriter, r *http.Request, user *User) {
	var p FilterPreset
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&p); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if p.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	p.UserID = user.ID
	created, err := app.store.CreateFilterPreset(p)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, created)
}

func (app *App) handleDeleteFilterPreset(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/filter-presets/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteFilterPreset(id, user.ID); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Event History ──────────────────────────────────────────────────────────────

func (app *App) handleGetEventHistory(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		// Try parsing from /api/events/:id/history
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			id, err = strconv.ParseInt(parts[2], 10, 64)
		}
		if err != nil {
			jsonError(w, "invalid id", http.StatusBadRequest)
			return
		}
	}
	if _, ok := app.store.GetEventByID(id); !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	versions := app.store.GetEventVersions(id)
	jsonOK(w, versions)
}

// ── Editing Locks ──────────────────────────────────────────────────────────────

func (app *App) handleAcquireEditingLock(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	lock, ok := app.store.AcquireEditingLock(id, user.ID, user.DisplayName)
	if !ok {
		jsonError(w, fmt.Sprintf("Event is being edited by %s", lock.UserName), http.StatusConflict)
		return
	}
	// Broadcast editing lock acquisition to all users
	lockData, _ := json.Marshal(map[string]interface{}{
		"type":       "editing_lock",
		"event_id":   id,
		"user_id":    user.ID,
		"user_name":  user.DisplayName,
		"expires_at": lock.ExpiresAt,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "editing_lock", Data: string(lockData)})
	jsonOK(w, lock)
}

func (app *App) handleReleaseEditingLock(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	app.store.ReleaseEditingLock(id, user.ID)
	unlockData, _ := json.Marshal(map[string]interface{}{
		"type":     "editing_unlock",
		"event_id": id,
		"user_id":  user.ID,
	})
	app.broker.BroadcastAll(SSEMessage{Event: "editing_lock", Data: string(unlockData)})
	jsonOK(w, map[string]string{"status": "released"})
}

func (app *App) handleGetEditingLocks(w http.ResponseWriter, r *http.Request, user *User) {
	locks := app.store.GetAllEditingLocks()
	jsonOK(w, locks)
}

// handleGetDoc serves a markdown document rendered as simple HTML.
// Allowed docs: README.md, docs/RELEASE_NOTES.md, docs/USER_MANUAL.md
func (app *App) handleGetDoc(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	allowed := map[string]string{
		"readme":        "README.md",
		"release_notes": filepath.Join("docs", "RELEASE_NOTES.md"),
		"user_manual":   filepath.Join("docs", "USER_MANUAL.md"),
	}
	path, ok := allowed[name]
	if !ok {
		jsonError(w, "unknown document", http.StatusBadRequest)
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		jsonError(w, "document not found", http.StatusNotFound)
		return
	}
	// Simple markdown-to-HTML conversion (handles headers, bold, italic, lists, code blocks, links, hr)
	html := renderMarkdown(string(data))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(html)) //nolint
}

// renderMarkdown converts markdown text to basic HTML.
func renderMarkdown(md string) string {
	lines := strings.Split(md, "\n")
	var out strings.Builder
	inCode := false
	inList := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Code blocks
		if strings.HasPrefix(trimmed, "```") {
			if inCode {
				out.WriteString("</code></pre>\n")
				inCode = false
			} else {
				if inList {
					out.WriteString("</ul>\n")
					inList = false
				}
				out.WriteString("<pre><code>")
				inCode = true
			}
			continue
		}
		if inCode {
			out.WriteString(escHTML(line))
			out.WriteString("\n")
			continue
		}
		// Empty line
		if trimmed == "" {
			if inList {
				out.WriteString("</ul>\n")
				inList = false
			}
			continue
		}
		// Horizontal rule
		if trimmed == "---" || trimmed == "***" || trimmed == "___" {
			if inList {
				out.WriteString("</ul>\n")
				inList = false
			}
			out.WriteString("<hr>\n")
			continue
		}
		// Headers
		if strings.HasPrefix(trimmed, "# ") {
			if inList {
				out.WriteString("</ul>\n")
				inList = false
			}
			out.WriteString("<h1>" + mdInline(trimmed[2:]) + "</h1>\n")
			continue
		}
		if strings.HasPrefix(trimmed, "## ") {
			if inList {
				out.WriteString("</ul>\n")
				inList = false
			}
			out.WriteString("<h2>" + mdInline(trimmed[3:]) + "</h2>\n")
			continue
		}
		if strings.HasPrefix(trimmed, "### ") {
			if inList {
				out.WriteString("</ul>\n")
				inList = false
			}
			out.WriteString("<h3>" + mdInline(trimmed[4:]) + "</h3>\n")
			continue
		}
		if strings.HasPrefix(trimmed, "#### ") {
			if inList {
				out.WriteString("</ul>\n")
				inList = false
			}
			out.WriteString("<h4>" + mdInline(trimmed[5:]) + "</h4>\n")
			continue
		}
		// List items
		if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			if !inList {
				out.WriteString("<ul>\n")
				inList = true
			}
			out.WriteString("<li>" + mdInline(trimmed[2:]) + "</li>\n")
			continue
		}
		// Paragraph
		if inList {
			out.WriteString("</ul>\n")
			inList = false
		}
		out.WriteString("<p>" + mdInline(trimmed) + "</p>\n")
	}
	if inList {
		out.WriteString("</ul>\n")
	}
	if inCode {
		out.WriteString("</code></pre>\n")
	}
	return out.String()
}

func mdInline(s string) string {
	s = escHTML(s)
	// Bold: **text** or __text__
	for {
		start := strings.Index(s, "**")
		if start == -1 {
			break
		}
		end := strings.Index(s[start+2:], "**")
		if end == -1 {
			break
		}
		s = s[:start] + "<strong>" + s[start+2:start+2+end] + "</strong>" + s[start+2+end+2:]
	}
	// Italic: *text* or _text_
	for {
		start := strings.Index(s, "*")
		if start == -1 {
			break
		}
		end := strings.Index(s[start+1:], "*")
		if end == -1 {
			break
		}
		s = s[:start] + "<em>" + s[start+1:start+1+end] + "</em>" + s[start+1+end+1:]
	}
	// Inline code: `text`
	for {
		start := strings.Index(s, "`")
		if start == -1 {
			break
		}
		end := strings.Index(s[start+1:], "`")
		if end == -1 {
			break
		}
		s = s[:start] + "<code>" + s[start+1:start+1+end] + "</code>" + s[start+1+end+1:]
	}
	// Links: [text](url)
	for {
		lStart := strings.Index(s, "[")
		if lStart == -1 {
			break
		}
		lEnd := strings.Index(s[lStart:], "](")
		if lEnd == -1 {
			break
		}
		urlEnd := strings.Index(s[lStart+lEnd+2:], ")")
		if urlEnd == -1 {
			break
		}
		text := s[lStart+1 : lStart+lEnd]
		url := s[lStart+lEnd+2 : lStart+lEnd+2+urlEnd]
		s = s[:lStart] + `<a href="` + url + `" target="_blank" style="color:var(--accent)">` + text + `</a>` + s[lStart+lEnd+2+urlEnd+1:]
	}
	return s
}

func escHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
