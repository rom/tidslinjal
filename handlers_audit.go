package main

import (
	"archive/zip"
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

// ── Audit log handler ──────────────────────────────────────────────────────────

func (app *App) handleGetEventLog(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetEventLog()
	if entries == nil {
		entries = []EventLogEntry{}
	}
	jsonOK(w, entries)
}

func (app *App) handleAddEventLog(w http.ResponseWriter, r *http.Request, user *User) {
	var entry EventLogEntry
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&entry); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if entry.Source == "" {
		entry.Source = "manual"
	}
	// H-05 fix: sanitize event log fields to prevent stored XSS
	entry.Message = stripHTMLTags(entry.Message)
	entry.Summary = stripHTMLTags(entry.Summary)
	entry.Source = stripHTMLTags(entry.Source)
	entry.UserID = user.ID
	entry.UserName = user.DisplayName
	created, err := app.store.AddEventLogEntry(entry)
	if err != nil {
		jsonError(w, "failed to add event log entry", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "created", EntityType: "event_log", EntityID: created.ID,
		Summary: fmt.Sprintf("Added event log entry: %s", created.Source),
	})
	app.broker.BroadcastAll(SSEMessage{Event: "log_change", Data: `{"type":"event_log"}`})
	jsonOK(w, created)
}

// canReadLogBookEntry mirrors canReadDecisionLogEntry: admins can always
// read, authors can always read their own, then apply the LogType
// visibility rule (public / group / private).
func (app *App) canReadLogBookEntry(user *User, entry LogBookEntry) bool {
	if app.effectiveHasRole(user, RoleAdmin) {
		return true
	}
	if entry.UserID == user.ID {
		return true
	}
	switch entry.LogType {
	case "public", "general", "":
		return true
	case "group":
		if entry.GroupID > 0 && app.userInGroup(user.ID, entry.GroupID) {
			return true
		}
	case "private":
		// Only the author can read — already handled above
	}
	return false
}

func (app *App) handleGetLogBook(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetLogBook()
	if entries == nil {
		entries = []LogBookEntry{}
	}
	// Apply visibility filter so private/group entries don't leak.
	filtered := make([]LogBookEntry, 0, len(entries))
	for _, e := range entries {
		if app.canReadLogBookEntry(user, e) {
			filtered = append(filtered, e)
		}
	}
	jsonOK(w, filtered)
}

// normaliseLogType maps user input to a canonical visibility value. Unknown
// or empty values fall back to "public" so existing callers keep working.
func normaliseLogType(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "private":
		return "private"
	case "group":
		return "group"
	default:
		return "public"
	}
}

// validLogBookColor returns the input if it is an acceptable CSS colour,
// otherwise empty string. We accept short/long hex codes and a small set
// of named CSS colours — plenty for a background tint.
func validLogBookColor(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if len(s) > 32 {
		return ""
	}
	// Hex: #fff, #ffffff, #ffffff00
	if s[0] == '#' {
		hex := s[1:]
		if len(hex) == 3 || len(hex) == 4 || len(hex) == 6 || len(hex) == 8 {
			for _, c := range hex {
				if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
					return ""
				}
			}
			return s
		}
		return ""
	}
	// Named colours — short allowlist
	named := map[string]bool{
		"red": true, "orange": true, "yellow": true, "green": true,
		"blue": true, "purple": true, "pink": true, "gray": true, "grey": true,
		"lightyellow": true, "lightgreen": true, "lightblue": true, "lightpink": true,
		"lightgray": true, "lightgrey": true, "transparent": true,
	}
	if named[strings.ToLower(s)] {
		return strings.ToLower(s)
	}
	return ""
}

// logBookSequenceNumber builds an exercise-scoped label of the form
// `{exercise}-log-{year}-{number}` (or `log-{year}-{number}` if no exercise
// label is configured).
func (app *App) logBookSequenceNumber(id int64, ts time.Time) string {
	prefix := "log"
	if ex := app.store.GetExerciseSettings(); ex.Enabled && ex.Label != "" {
		abbr := strings.ToLower(strings.ReplaceAll(ex.Label, " ", "-"))
		if len(abbr) > 20 {
			abbr = abbr[:20]
		}
		prefix = abbr + "-log"
	}
	year := ts.Year()
	if year == 0 {
		year = time.Now().Year()
	}
	return fmt.Sprintf("%s-%d-%03d", prefix, year, id)
}

func (app *App) handleAddLogBookEntry(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Category string `json:"category"`
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		LogType  string `json:"log_type"`
		GroupID  int64  `json:"group_id"`
		Color    string `json:"color"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Subject == "" {
		jsonError(w, "subject required", http.StatusBadRequest)
		return
	}
	if req.Category == "" {
		req.Category = "other"
	}
	logType := normaliseLogType(req.LogType)
	if logType != "group" {
		req.GroupID = 0
	}
	entry := LogBookEntry{
		UserID:      user.ID,
		UserName:    user.Username,
		DisplayName: user.DisplayName,
		Category:    stripHTMLTags(req.Category),
		Subject:     stripHTMLTags(req.Subject),
		// Rich text: keep a safe subset of HTML instead of stripping all tags.
		Body:    sanitizeRichHTML(req.Body),
		LogType: logType,
		GroupID: req.GroupID,
		Color:   validLogBookColor(req.Color),
	}
	created, err := app.store.AddLogBookEntry(entry)
	if err != nil {
		jsonError(w, "failed to add log book entry", http.StatusInternalServerError)
		return
	}
	// Assign an exercise-scoped sequence number now that we have the ID.
	created.SequenceNumber = app.logBookSequenceNumber(created.ID, created.Timestamp)
	_ = app.store.UpdateLogBookEntry(created)
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "created", EntityType: "log_book", EntityID: created.ID,
		Summary: fmt.Sprintf("Log book entry %s: [%s] %s", created.SequenceNumber, req.Category, req.Subject),
	})
	app.broker.BroadcastAll(SSEMessage{Event: "log_change", Data: `{"type":"log_book"}`})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// handleUpdateLogBookEntry lets the author (or an admin) edit an existing
// log book entry. Rich text, category, subject, visibility and background
// colour can all be changed; the sequence number, author and timestamps
// are immutable.
func (app *App) handleUpdateLogBookEntry(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/log-book/")
	idStr = strings.TrimSuffix(idStr, "/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing := app.store.GetLogBookEntryByID(id)
	if existing == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.UserID != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Category string `json:"category"`
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		LogType  string `json:"log_type"`
		GroupID  int64  `json:"group_id"`
		Color    string `json:"color"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Subject == "" {
		jsonError(w, "subject required", http.StatusBadRequest)
		return
	}
	if req.Category == "" {
		req.Category = existing.Category
	}
	logType := normaliseLogType(req.LogType)
	if logType != "group" {
		req.GroupID = 0
	}
	existing.Category = stripHTMLTags(req.Category)
	existing.Subject = stripHTMLTags(req.Subject)
	existing.Body = sanitizeRichHTML(req.Body)
	existing.LogType = logType
	existing.GroupID = req.GroupID
	existing.Color = validLogBookColor(req.Color)
	now := time.Now()
	existing.UpdatedAt = &now
	if err := app.store.UpdateLogBookEntry(*existing); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "updated", EntityType: "log_book", EntityID: existing.ID,
		Summary: fmt.Sprintf("Log book entry %s edited", existing.SequenceNumber),
	})
	app.broker.BroadcastAll(SSEMessage{Event: "log_change", Data: `{"type":"log_book"}`})
	jsonOK(w, existing)
}

func (app *App) handleDeleteLogBookEntry(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/log-book/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteLogBookEntry(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "deleted", EntityType: "log_book", EntityID: id,
		Summary: fmt.Sprintf("Deleted log book entry #%d", id),
	})
	app.broker.BroadcastAll(SSEMessage{Event: "log_change", Data: `{"type":"log_book"}`})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleLogBookAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	// Extract ID from path: /api/log-book/{id}/attachment
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/log-book/"), "/")
	if len(parts) < 1 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// IDOR fix: verify the log book entry exists and the user is allowed
	// to add attachments to it. Previously any authenticated user could
	// upload attachments to any entry by guessing the ID.
	entry := app.store.GetLogBookEntryByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if entry.UserID != user.ID && !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		jsonError(w, "file too large (max 10 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()
	safeFilename := filepath.Base(header.Filename)
	if safeFilename == "." || safeFilename == "/" {
		safeFilename = "upload"
	}
	if isDangerousFilename(safeFilename) {
		jsonError(w, "file type not allowed", http.StatusBadRequest)
		return
	}
	storedName := fmt.Sprintf("lb_%d_%d_%s", id, time.Now().UnixNano(), safeFilename)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	written, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	att := LogBookAttachment{
		Filename:   safeFilename,
		StoredName: storedName,
		Size:       written,
		MimeType:   header.Header.Get("Content-Type"),
	}
	if err := app.store.AddLogBookAttachment(id, att); err != nil {
		os.Remove(destPath)
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(att)
}

func (app *App) handleLogBookAttachmentDownload(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/log-book/{id}/attachment/{filename}
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/log-book/")
	parts := strings.SplitN(trimmed, "/attachment/", 2)
	if len(parts) != 2 || parts[1] == "" {
		http.NotFound(w, r)
		return
	}
	// Validate the log book entry exists and the attachment belongs to it
	entryID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	storedName := filepath.Base(parts[1])
	entry := app.store.GetLogBookEntryByID(entryID)
	if entry == nil {
		http.NotFound(w, r)
		return
	}
	// IDOR fix: require that the user is the entry author or has teamlead+
	// role. Log book entries are part of the audit trail and should be
	// restricted to their author or operational leadership.
	if entry.UserID != user.ID && !app.effectiveHasRole(user, RoleTeamLead) {
		http.NotFound(w, r) // hide existence
		return
	}
	// Verify the requested file actually belongs to this entry
	found := false
	for _, att := range entry.Attachments {
		if att.StoredName == storedName {
			found = true
			break
		}
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	filePath := filepath.Join(app.store.AttachmentDir(), storedName)
	// Defense-in-depth: prevent browsers from sniffing/rendering as HTML/SVG
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", storedName))
	http.ServeFile(w, r, filePath)
}

func (app *App) handleGetAudit(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	limit := 500
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	// Optional export format
	exportFormat := q.Get("format") // csv, json, rtf, docx

	// Filtering params
	filterUser   := strings.ToLower(q.Get("user"))
	filterAction := strings.ToLower(q.Get("action"))
	filterSearch := strings.ToLower(q.Get("search"))
	var dateFrom, dateTo time.Time
	if df := q.Get("date_from"); df != "" {
		dateFrom, _ = time.Parse("2006-01-02", df)
	}
	if dt := q.Get("date_to"); dt != "" {
		dateTo, _ = time.Parse("2006-01-02", dt)
		dateTo = dateTo.Add(24*time.Hour - time.Second) // end of day
	}

	entries := app.store.GetAudit(limit)
	if entries == nil {
		entries = []AuditEntry{}
	}

	// Apply filters
	if filterUser != "" || filterAction != "" || filterSearch != "" || !dateFrom.IsZero() || !dateTo.IsZero() {
		filtered := entries[:0]
		for _, e := range entries {
			if filterUser != "" && !strings.Contains(strings.ToLower(e.UserName), filterUser) {
				continue
			}
			if filterAction != "" && !strings.Contains(strings.ToLower(e.Action), filterAction) {
				continue
			}
			if filterSearch != "" && !strings.Contains(strings.ToLower(e.Summary), filterSearch) &&
				!strings.Contains(strings.ToLower(e.UserName), filterSearch) &&
				!strings.Contains(strings.ToLower(e.Action), filterSearch) {
				continue
			}
			if !dateFrom.IsZero() && e.Timestamp.Before(dateFrom) {
				continue
			}
			if !dateTo.IsZero() && e.Timestamp.After(dateTo) {
				continue
			}
			filtered = append(filtered, e)
		}
		entries = filtered
	}

	// Build filename with timestamp and hostname: YYYYMMDD-hostname-audit-log.ext
	auditDate := time.Now().Format("20060102")
	auditHost := r.Host
	if h := strings.Split(auditHost, ":"); len(h) > 0 {
		auditHost = h[0]
	}
	if auditHost == "" {
		auditHost, _ = os.Hostname()
	}

	switch exportFormat {
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-%s-audit-log.csv\"", auditDate, auditHost))
		fmt.Fprintf(w, "ID,Timestamp,User,Action,EntityType,EntityID,Summary\n")
		for _, e := range entries {
			fmt.Fprintf(w, "%d,%s,%s,%s,%s,%d,%s\n",
				e.ID,
				e.Timestamp.Format(time.RFC3339),
				csvEscape(e.UserName),
				csvEscape(e.Action),
				csvEscape(e.EntityType),
				e.EntityID,
				csvEscape(e.Summary),
			)
		}
		return
	case "json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-%s-audit-log.json\"", auditDate, auditHost))
		json.NewEncoder(w).Encode(entries)
		return
	case "rtf":
		w.Header().Set("Content-Type", "application/rtf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-%s-audit-log.rtf\"", auditDate, auditHost))
		fmt.Fprintf(w, "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\n")
		fmt.Fprintf(w, "\\f0\\fs24\\b Audit Log\\b0\\par\\par\n")
		fmt.Fprintf(w, "\\trowd\\trgaph100\\cellx800\\cellx3200\\cellx5200\\cellx7200\\cellx8800\\cellx9600\\cellx14000\\pard\\intbl\n")
		fmt.Fprintf(w, "\\b ID\\cell Timestamp\\cell User\\cell Action\\cell Entity Type\\cell Entity ID\\cell Summary\\cell\\b0\\row\n")
		for _, e := range entries {
			fmt.Fprintf(w, "\\trowd\\trgaph100\\cellx800\\cellx3200\\cellx5200\\cellx7200\\cellx8800\\cellx9600\\cellx14000\\pard\\intbl\n")
			fmt.Fprintf(w, "%d\\cell %s\\cell %s\\cell %s\\cell %s\\cell %d\\cell %s\\cell\\row\n",
				e.ID,
				e.Timestamp.Format("2006-01-02 15:04:05"),
				rtfEscape(e.UserName),
				rtfEscape(e.Action),
				rtfEscape(e.EntityType),
				e.EntityID,
				rtfEscape(e.Summary),
			)
		}
		fmt.Fprintf(w, "}\n")
		return
	case "docx":
		app.exportAuditDocx(w, entries, auditDate, auditHost)
		return
	default:
		jsonOK(w, entries)
	}
}

func (app *App) exportAuditDocx(w http.ResponseWriter, entries []AuditEntry, auditDate, auditHost string) {
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-%s-audit-log.docx\"", auditDate, auditHost))
	zw := zip.NewWriter(w)
	defer zw.Close()

	// [Content_Types].xml
	ct, _ := zw.Create("[Content_Types].xml")
	fmt.Fprintf(ct, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
		`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`+
		`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`+
		`<Default Extension="xml" ContentType="application/xml"/>`+
		`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`+
		`</Types>`)

	// _rels/.rels
	rels, _ := zw.Create("_rels/.rels")
	fmt.Fprintf(rels, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
		`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`+
		`</Relationships>`)

	// word/_rels/document.xml.rels
	drels, _ := zw.Create("word/_rels/document.xml.rels")
	fmt.Fprintf(drels, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
		`</Relationships>`)

	// word/document.xml
	doc, _ := zw.Create("word/document.xml")
	fmt.Fprintf(doc, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
		`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+
		`<w:body>`)
	// Title
	fmt.Fprintf(doc, `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Audit Log</w:t></w:r></w:p>`)
	// Table
	fmt.Fprintf(doc, `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>`+
		`<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>`+
		`<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>`+
		`<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>`+
		`<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>`+
		`<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>`+
		`<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>`+
		`</w:tblBorders></w:tblPr>`)
	// Header row
	headers := []string{"ID", "Timestamp", "User", "Action", "Entity Type", "Entity ID", "Summary"}
	fmt.Fprintf(doc, `<w:tr>`)
	for _, h := range headers {
		fmt.Fprintf(doc, `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>%s</w:t></w:r></w:p></w:tc>`, xmlEsc(h))
	}
	fmt.Fprintf(doc, `</w:tr>`)
	// Data rows
	for _, e := range entries {
		fmt.Fprintf(doc, `<w:tr>`)
		cells := []string{
			fmt.Sprintf("%d", e.ID),
			e.Timestamp.Format("2006-01-02 15:04:05"),
			e.UserName,
			e.Action,
			e.EntityType,
			fmt.Sprintf("%d", e.EntityID),
			e.Summary,
		}
		for _, c := range cells {
			fmt.Fprintf(doc, `<w:tc><w:p><w:r><w:t>%s</w:t></w:r></w:p></w:tc>`, xmlEsc(c))
		}
		fmt.Fprintf(doc, `</w:tr>`)
	}
	fmt.Fprintf(doc, `</w:tbl>`)
	fmt.Fprintf(doc, `</w:body></w:document>`)
}

