package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Diary Handlers ──────────────────────────────────────────────────────────

// canDiary checks diary capability; defaults to true (all users can access unless explicitly denied).
func (app *App) canDiary(user *User, cap string) bool {
	if user.Role == RoleAdmin {
		return true
	}
	for _, rc := range app.store.GetRoleConfigs() {
		if rc.Key == string(user.Role) {
			if v, ok := rc.Capabilities[cap]; ok {
				return v
			}
			return true // default: allowed if not explicitly set
		}
	}
	return true // default: allowed if no role config exists
}

// handleListDiary returns diary entries visible to the requesting user.
// Each user sees their own entries plus non-private entries from other users.
func (app *App) handleListDiary(w http.ResponseWriter, r *http.Request, user *User) {
	all := app.store.GetDiary()
	canRead := app.canDiary(user, "diary_read")
	var visible []DiaryEntry
	for _, e := range all {
		if e.UserID == user.ID {
			visible = append(visible, e)
		} else if !e.Private && canRead {
			visible = append(visible, e)
		}
	}
	if visible == nil {
		visible = []DiaryEntry{}
	}
	jsonOK(w, visible)
}

// handleGetDiaryEntry returns a single diary entry by ID.
func (app *App) handleGetDiaryEntry(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetDiaryEntryByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	canRead := app.canDiary(user, "diary_read")
	if entry.UserID != user.ID && (entry.Private || !canRead) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	jsonOK(w, entry)
}

// handleCreateDiaryEntry creates a new diary entry for the requesting user.
func (app *App) handleCreateDiaryEntry(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canDiary(user, "diary_write") {
		jsonError(w, "insufficient permissions", http.StatusForbidden)
		return
	}
	var req struct {
		Title   string   `json:"title"`
		Body    string   `json:"body"`
		Tags    []string `json:"tags"`
		Mood    string   `json:"mood"`
		Private bool     `json:"private"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		jsonError(w, "title is required", http.StatusBadRequest)
		return
	}

	entry := DiaryEntry{
		UserID:      user.ID,
		UserName:    user.Username,
		DisplayName: user.DisplayName,
		Title:       stripHTMLTags(req.Title),
		Body:        sanitizeRichHTML(req.Body),
		Tags:        req.Tags,
		Mood:        req.Mood,
		Private:     req.Private,
	}
	created, err := app.store.AddDiaryEntry(entry)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "diary", created.ID, fmt.Sprintf("Created diary entry: %s", req.Title))
	jsonOK(w, created)
}

// handleUpdateDiaryEntry updates an existing diary entry (only by author).
func (app *App) handleUpdateDiaryEntry(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing := app.store.GetDiaryEntryByID(id)
	if existing == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.UserID != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "only the author can edit their diary entry", http.StatusForbidden)
		return
	}
	var req struct {
		Title   string   `json:"title"`
		Body    string   `json:"body"`
		Tags    []string `json:"tags"`
		Mood    string   `json:"mood"`
		Private bool     `json:"private"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	existing.Title = stripHTMLTags(req.Title)
	existing.Body = sanitizeRichHTML(req.Body)
	existing.Tags = req.Tags
	existing.Mood = req.Mood
	existing.Private = req.Private
	if err := app.store.UpdateDiaryEntry(*existing); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "diary", id, fmt.Sprintf("Updated diary entry: %s", req.Title))
	jsonOK(w, existing)
}

// handleDeleteDiaryEntry deletes a diary entry (author or admin).
func (app *App) handleDeleteDiaryEntry(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing := app.store.GetDiaryEntryByID(id)
	if existing == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.UserID != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "only the author or admin can delete a diary entry", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteDiaryEntry(id); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "diary", id, fmt.Sprintf("Deleted diary entry: %s", existing.Title))
	jsonOK(w, map[string]string{"status": "ok"})
}

// handleDiaryAttachment uploads a file attachment to a diary entry.
func (app *App) handleDiaryAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetDiaryEntryByID(id)
	if entry == nil {
		jsonError(w, "diary entry not found", http.StatusNotFound)
		return
	}
	if entry.UserID != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
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
	if isDangerousFilename(safeFilename) {
		jsonError(w, "file type not allowed", http.StatusBadRequest)
		return
	}
	storedName := fmt.Sprintf("dr_%d_%d_%s", id, time.Now().UnixNano(), safeFilename)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	written, err := io.Copy(dst, file)
	if err != nil {
		jsonError(w, "failed to write file", http.StatusInternalServerError)
		return
	}
	att := DiaryAttachment{
		Filename:   safeFilename,
		StoredName: storedName,
		Size:       written,
		MimeType:   header.Header.Get("Content-Type"),
	}
	if err := app.store.AddDiaryAttachment(id, att); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, att)
}

// handleDiaryAttachmentDownload serves a diary attachment file.
func (app *App) handleDiaryAttachmentDownload(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetDiaryEntryByID(id)
	if entry == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	canRead := app.canDiary(user, "diary_read")
	if entry.UserID != user.ID && (entry.Private || !canRead) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	filename := parts[4]
	for _, att := range entry.Attachments {
		if att.Filename == filename || att.StoredName == filename {
			fpath := filepath.Join(app.store.AttachmentDir(), filepath.Base(att.StoredName))
			// Security: verify resolved path stays within attachment directory
			absPath, _ := filepath.Abs(fpath)
			absDir, _ := filepath.Abs(app.store.AttachmentDir())
			if !strings.HasPrefix(absPath, absDir+string(filepath.Separator)) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(att.Filename)))
			http.ServeFile(w, r, fpath)
			return
		}
	}
	http.Error(w, "attachment not found", http.StatusNotFound)
}

// ── Diary Export ────────────────────────────────────────────────────────────

func (app *App) handleExportDiary(w http.ResponseWriter, r *http.Request, user *User) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}
	userIDStr := r.URL.Query().Get("user_id")

	var entries []DiaryEntry
	if userIDStr != "" {
		uid, _ := strconv.ParseInt(userIDStr, 10, 64)
		// Security: only allow exporting own diary or admin access
		if uid != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
			jsonError(w, "forbidden: can only export your own diary", http.StatusForbidden)
			return
		}
		entries = app.store.GetDiaryByUser(uid)
	} else {
		entries = app.store.GetDiaryByUser(user.ID)
	}

	// Filter: non-authors can only see non-private entries
	canRead := app.canDiary(user, "diary_read")
	var visible []DiaryEntry
	for _, e := range entries {
		if e.UserID == user.ID || (!e.Private && canRead) {
			visible = append(visible, e)
		}
	}
	if visible == nil {
		visible = []DiaryEntry{}
	}

	ts := time.Now().Format("2006-01-02T150405")
	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.json"`, ts))
		json.NewEncoder(w).Encode(visible)
	case "xml":
		w.Header().Set("Content-Type", "application/xml")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.xml"`, ts))
		type XMLDiary struct {
			XMLName xml.Name     `xml:"diary"`
			Entries []DiaryEntry `xml:"entry"`
		}
		xml.NewEncoder(w).Encode(XMLDiary{Entries: visible})
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.csv"`, ts))
		fmt.Fprintf(w, "id,title,author,private,tags,mood,created_at,updated_at\n")
		for _, e := range visible {
			tags := strings.Join(e.Tags, ";")
			fmt.Fprintf(w, "%d,%q,%q,%v,%q,%q,%s,%s\n",
				e.ID, e.Title, e.DisplayName, e.Private, tags, e.Mood,
				e.CreatedAt.Format(time.RFC3339), e.UpdatedAt.Format(time.RFC3339))
		}
	case "txt":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.txt"`, ts))
		for _, e := range visible {
			fmt.Fprintf(w, "═══════════════════════════════════════════════\n")
			fmt.Fprintf(w, "Title: %s\n", e.Title)
			fmt.Fprintf(w, "Author: %s\n", e.DisplayName)
			fmt.Fprintf(w, "Date: %s\n", e.CreatedAt.Format("2006-01-02 15:04"))
			if len(e.Tags) > 0 {
				fmt.Fprintf(w, "Tags: %s\n", strings.Join(e.Tags, ", "))
			}
			if e.Private {
				fmt.Fprintf(w, "Visibility: Private\n")
			}
			fmt.Fprintf(w, "───────────────────────────────────────────────\n")
			// Strip HTML tags for plain text
			fmt.Fprintf(w, "%s\n\n", stripHTML(e.Body))
		}
	case "rtf":
		w.Header().Set("Content-Type", "application/rtf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.rtf"`, ts))
		fmt.Fprintf(w, `{\rtf1\ansi\deff0{\fonttbl{\f0 Calibri;}}`)
		fmt.Fprintf(w, `\f0\fs22 `)
		for _, e := range visible {
			fmt.Fprintf(w, `\b %s\b0\line `, rtfEsc(e.Title))
			fmt.Fprintf(w, `\i %s — %s\i0\line `, rtfEsc(e.DisplayName), e.CreatedAt.Format("2006-01-02 15:04"))
			fmt.Fprintf(w, `%s\line\line `, rtfEsc(stripHTML(e.Body)))
		}
		fmt.Fprintf(w, `}`)
	case "md":
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.md"`, ts))
		fmt.Fprintf(w, "# Diary\n\n")
		for _, e := range visible {
			fmt.Fprintf(w, "## %s\n\n", stripHTML(e.Title))
			fmt.Fprintf(w, "**Author:** %s | **Date:** %s", e.DisplayName, e.CreatedAt.Format("2006-01-02 15:04"))
			if len(e.Tags) > 0 {
				fmt.Fprintf(w, " | **Tags:** %s", strings.Join(e.Tags, ", "))
			}
			if e.Private {
				fmt.Fprintf(w, " | 🔒 Private")
			}
			fmt.Fprintf(w, "\n\n%s\n\n---\n\n", stripHTML(e.Body))
		}
	case "xlsx":
		app.writeDiaryXLSX(w, visible)
	case "ods":
		app.writeDiaryXLSX(w, visible) // ODS uses same tabular structure via XLSX
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.json"`, ts))
		json.NewEncoder(w).Encode(visible)
	}
}

func (app *App) writeDiaryXLSX(w http.ResponseWriter, entries []DiaryEntry) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	xlsxWriteFile(zw, "[Content_Types].xml", xlsxContentTypes())
	xlsxWriteFile(zw, "_rels/.rels", xlsxRels())
	xlsxWriteFile(zw, "xl/workbook.xml", xlsxWorkbook())
	xlsxWriteFile(zw, "xl/_rels/workbook.xml.rels", xlsxWorkbookRels())
	xlsxWriteFile(zw, "xl/styles.xml", xlsxStyles())

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	headers := []string{"ID", "Title", "Author", "Private", "Tags", "Mood", "Created", "Updated", "Body"}
	sb.WriteString(`<row r="1">`)
	for i, h := range headers {
		sb.WriteString(xlsxCell(i, 1, h, 1))
	}
	sb.WriteString(`</row>`)
	for idx, e := range entries {
		r := idx + 2
		priv := ""
		if e.Private {
			priv = "Yes"
		}
		cells := []string{
			fmt.Sprintf("%d", e.ID), e.Title, e.DisplayName, priv,
			strings.Join(e.Tags, ", "), e.Mood,
			e.CreatedAt.Format("2006-01-02 15:04"), e.UpdatedAt.Format("2006-01-02 15:04"),
			stripHTML(e.Body),
		}
		sb.WriteString(fmt.Sprintf(`<row r="%d">`, r))
		for i, val := range cells {
			sb.WriteString(xlsxCell(i, r, val, 0))
		}
		sb.WriteString(`</row>`)
	}
	sb.WriteString(`</sheetData></worksheet>`)
	xlsxWriteFile(zw, "xl/worksheets/sheet1.xml", sb.String())
	zw.Close()

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diary_export_%s.xlsx"`, time.Now().Format("2006-01-02T150405")))
	w.Write(buf.Bytes()) //nolint
}

// handleImportDiary imports diary entries from a JSON or XML file.
func (app *App) handleImportDiary(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canDiary(user, "diary_write") {
		jsonError(w, "insufficient permissions", http.StatusForbidden)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20)) // 2MB limit
	if err != nil {
		jsonError(w, "failed to read body", http.StatusBadRequest)
		return
	}
	var entries []DiaryEntry
	ct := r.Header.Get("Content-Type")
	if strings.Contains(ct, "xml") || (len(body) > 0 && body[0] == '<') {
		// Try XML
		type XMLDiary struct {
			Entries []DiaryEntry `xml:"entry"`
		}
		var xd XMLDiary
		// Security: use decoder to prevent XXE attacks
		decoder := xml.NewDecoder(bytes.NewReader(body))
		decoder.Strict = true
		if err := decoder.Decode(&xd); err != nil {
			jsonError(w, "invalid XML: "+err.Error(), http.StatusBadRequest)
			return
		}
		entries = xd.Entries
	} else if err := json.Unmarshal(body, &entries); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	added := 0
	for _, e := range entries {
		e.ID = 0
		e.UserID = user.ID
		e.UserName = user.Username
		e.DisplayName = user.DisplayName
		if _, err := app.store.AddDiaryEntry(e); err == nil {
			added++
		}
	}
	app.audit(user.ID, user.DisplayName, "imported", "diary", 0, fmt.Sprintf("Imported %d diary entries", added))
	jsonOK(w, map[string]any{"status": "ok", "imported": added})
}

// ── Security: sanitize rich HTML (allow safe formatting, strip dangerous tags) ──

// sanitizeRichHTML removes dangerous HTML tags and attributes while preserving
// safe formatting tags (b, i, u, s, a, br, ul, ol, li, p, img, span, div, strong, em).
// Strips: script, iframe, object, embed, form, input, textarea, event handlers (on*).
func sanitizeRichHTML(s string) string {
	// Remove script/iframe/object/embed/form tags and their content
	for _, tag := range []string{"script", "iframe", "object", "embed", "form", "input", "textarea", "select", "button"} {
		// Remove opening+closing with content
		for {
			lower := strings.ToLower(s)
			start := strings.Index(lower, "<"+tag)
			if start == -1 {
				break
			}
			end := strings.Index(lower[start:], "</"+tag)
			if end == -1 {
				// Self-closing or unclosed — remove to end of tag
				tagEnd := strings.Index(s[start:], ">")
				if tagEnd == -1 {
					s = s[:start]
				} else {
					s = s[:start] + s[start+tagEnd+1:]
				}
			} else {
				closeEnd := strings.Index(s[start+end:], ">")
				if closeEnd == -1 {
					s = s[:start]
				} else {
					s = s[:start] + s[start+end+closeEnd+1:]
				}
			}
		}
	}
	// Remove event handler attributes (on*)
	var result strings.Builder
	i := 0
	for i < len(s) {
		if s[i] == '<' {
			// Inside a tag — copy tag but strip on* attributes
			tagEnd := strings.Index(s[i:], ">")
			if tagEnd == -1 {
				result.WriteString(s[i:])
				break
			}
			tag := s[i : i+tagEnd+1]
			// Remove on* attributes: onerror, onclick, onload, onmouseover, etc.
			cleaned := removeEventHandlers(tag)
			// Remove javascript:/vbscript: URLs (case-insensitive, handle whitespace/encoding tricks)
			cleaned = removeJSProtocol(cleaned)
			result.WriteString(cleaned)
			i += tagEnd + 1
		} else {
			result.WriteByte(s[i])
			i++
		}
	}
	return result.String()
}

// removeEventHandlers strips on* attributes from an HTML tag string.
func removeEventHandlers(tag string) string {
	lower := strings.ToLower(tag)
	// Find and remove all on* attributes
	for {
		idx := strings.Index(lower, " on")
		if idx == -1 {
			break
		}
		// Check if this is actually an on* event handler (followed by alpha then =)
		rest := lower[idx+3:]
		eqIdx := strings.IndexByte(rest, '=')
		if eqIdx == -1 || eqIdx > 20 {
			break
		}
		// Find the end of the attribute value
		attrStart := idx
		valStart := idx + 3 + eqIdx + 1
		if valStart >= len(tag) {
			tag = tag[:attrStart] + tag[len(tag):]
			lower = strings.ToLower(tag)
			continue
		}
		valEnd := valStart
		if valStart < len(tag) && (tag[valStart] == '"' || tag[valStart] == '\'') {
			quote := tag[valStart]
			closeIdx := strings.IndexByte(tag[valStart+1:], quote)
			if closeIdx != -1 {
				valEnd = valStart + 1 + closeIdx + 1
			} else {
				valEnd = len(tag)
			}
		} else {
			spaceIdx := strings.IndexAny(tag[valStart:], " >")
			if spaceIdx != -1 {
				valEnd = valStart + spaceIdx
			} else {
				valEnd = len(tag)
			}
		}
		tag = tag[:attrStart] + tag[valEnd:]
		lower = strings.ToLower(tag)
	}
	return tag
}

// removeJSProtocol removes javascript:/vbscript:/data: protocols case-insensitively
// including whitespace/encoding tricks between characters.
func removeJSProtocol(s string) string {
	lower := strings.ToLower(s)
	for _, proto := range []string{"javascript:", "vbscript:", "data:text/html"} {
		for {
			idx := strings.Index(lower, proto)
			if idx == -1 {
				break
			}
			s = s[:idx] + s[idx+len(proto):]
			lower = strings.ToLower(s)
		}
	}
	return s
}

// ── Helper: strip HTML tags ────────────────────────────────────────────────

func stripHTML(s string) string {
	var out strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			out.WriteRune(r)
		}
	}
	return out.String()
}

func rtfEsc(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `{`, `\{`)
	s = strings.ReplaceAll(s, `}`, `\}`)
	return s
}
