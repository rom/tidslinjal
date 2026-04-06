package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── Report Archive handlers ─────────────────────────────────────────────────

func (app *App) handleListReportArchive(w http.ResponseWriter, r *http.Request, user *User) {
	entries := app.store.GetReportArchive()
	if entries == nil {
		entries = []ReportArchiveEntry{}
	}
	jsonOK(w, entries)
}

func (app *App) handleUploadReportArchive(w http.ResponseWriter, r *http.Request, user *User) {
	if err := r.ParseMultipartForm(100 << 20); err != nil { // 100 MB
		jsonError(w, "file too large", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	title := r.FormValue("title")
	if title == "" {
		title = header.Filename
	}
	category := r.FormValue("category")
	if category != "local" && category != "incoming" {
		category = "local"
	}

	safeName := filepath.Base(header.Filename)
	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
	dir := filepath.Join(app.store.DataDir(), "report_archive")
	_ = os.MkdirAll(dir, 0700)
	dst, err := os.Create(filepath.Join(dir, storedName))
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	n, _ := io.Copy(dst, file)
	dst.Close()

	// Parse optional tags (comma-separated)
	var tags []string
	if raw := r.FormValue("tags"); raw != "" {
		for _, t := range strings.Split(raw, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}

	entry := ReportArchiveEntry{
		Title:          title,
		Description:    r.FormValue("description"),
		Category:       category,
		Filename:       safeName,
		StoredName:     storedName,
		OriginalName:   header.Filename,
		ContentType:    mime.TypeByExtension(filepath.Ext(safeName)),
		Size:           n,
		UploadedBy:     user.ID,
		UploadedByName: user.DisplayName,
		UploadedAt:     time.Now(),
		ReportType:     r.FormValue("report_type"),
		Tags:           tags,
	}
	created, err := app.store.AddReportArchiveEntry(entry)
	if err != nil {
		jsonError(w, "failed to save entry", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "create", "report_archive", created.ID, fmt.Sprintf("Uploaded report %q", created.Title))
	jsonOK(w, created)
}

func (app *App) handleDownloadReportArchive(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetReportArchiveByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	fpath := filepath.Join(app.store.DataDir(), "report_archive", filepath.Base(entry.StoredName))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", entry.Filename))
	http.ServeFile(w, r, fpath)
}

func (app *App) handleDeleteReportArchive(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	entry := app.store.GetReportArchiveByID(id)
	if entry == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Delete file
	fpath := filepath.Join(app.store.DataDir(), "report_archive", filepath.Base(entry.StoredName))
	_ = os.Remove(fpath)
	if err := app.store.DeleteReportArchiveEntry(id); err != nil {
		jsonError(w, "delete failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "delete", "report_archive", id, fmt.Sprintf("Deleted report %q", entry.Title))
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Report Ingest Config ─────────────────────────────────────────────────────

func (app *App) handleGetReportIngestConfig(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetReportIngestConfig()
	jsonOK(w, cfg)
}

func (app *App) handleSaveReportIngestConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg ReportIngestConfig
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveReportIngestConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "update", "report_ingest_config", 0,
		fmt.Sprintf("Report ingest config updated: enabled=%v", cfg.Enabled))
	jsonOK(w, cfg)
}

// ── Incoming Report Ingest Endpoint ──────────────────────────────────────────

// handleReportIngest handles POST /api/reports/ingest
// Accepts JSON or multipart/form-data with file attachment.
// Requires API key auth (Bearer token). Creates an "incoming" report archive entry.
func (app *App) handleReportIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if ingest is enabled
	cfg := app.store.GetReportIngestConfig()
	logDebug("report-ingest: request from %s, ingest enabled=%v", clientIP(r), cfg.Enabled)
	if !cfg.Enabled {
		logDebug("report-ingest: rejected — incoming report interface is disabled")
		jsonError(w, "incoming report interface is disabled", http.StatusForbidden)
		return
	}

	// Auth via API key
	user := app.authenticateAPIKey(r)
	if user == nil {
		logDebug("report-ingest: rejected — no valid API key provided from %s", clientIP(r))
		jsonError(w, "unauthorized — provide a valid API key via Authorization: Bearer <key>", http.StatusUnauthorized)
		return
	}
	logDebug("report-ingest: authenticated as %s (role=%s)", user.Username, user.Role)
	// V-33 fix: require at least RoleReadWrite for creating report entries
	if user.Role == RoleRead || user.Role == RoleObserver {
		logDebug("report-ingest: rejected — role %q insufficient (need readwrite+)", user.Role)
		jsonError(w, "insufficient permissions — API key requires read-write role or higher", http.StatusForbidden)
		return
	}

	ct := r.Header.Get("Content-Type")
	dir := filepath.Join(app.store.DataDir(), "report_archive")
	_ = os.MkdirAll(dir, 0700)

	var entry ReportArchiveEntry
	entry.Category = "incoming"
	entry.UploadedBy = user.ID
	entry.UploadedByName = user.DisplayName
	entry.UploadedAt = time.Now()

	if strings.HasPrefix(ct, "multipart/form-data") {
		// Multipart: file + metadata fields
		if err := r.ParseMultipartForm(100 << 20); err != nil {
			jsonError(w, "file too large or invalid form", http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			jsonError(w, "file is required for multipart submission", http.StatusBadRequest)
			return
		}
		defer file.Close()

		safeName := filepath.Base(header.Filename)
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		dst, err := os.Create(filepath.Join(dir, storedName))
		if err != nil {
			jsonError(w, "failed to save file", http.StatusInternalServerError)
			return
		}
		n, _ := io.Copy(dst, file)
		dst.Close()

		entry.Filename = safeName
		entry.StoredName = storedName
		entry.OriginalName = header.Filename
		entry.ContentType = mime.TypeByExtension(filepath.Ext(safeName))
		entry.Size = n
		entry.Subject = r.FormValue("subject")
		entry.Sender = r.FormValue("sender")
		entry.ReportType = r.FormValue("type")
		entry.Description = r.FormValue("description")
		if tags := r.FormValue("tags"); tags != "" {
			entry.Tags = strings.Split(tags, ",")
			for i := range entry.Tags {
				entry.Tags[i] = strings.TrimSpace(entry.Tags[i])
			}
		}
		entry.Title = entry.Subject
		if entry.Title == "" {
			entry.Title = safeName
		}
	} else {
		// JSON body
		var req struct {
			Subject     string   `json:"subject"`
			Sender      string   `json:"sender"`
			Type        string   `json:"type"`
			Description string   `json:"description"`
			Tags        []string `json:"tags"`
			Content     string   `json:"content"` // optional inline text content
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 10<<20)).Decode(&req); err != nil {
			jsonError(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if req.Subject == "" {
			jsonError(w, "subject is required", http.StatusBadRequest)
			return
		}

		entry.Subject = req.Subject
		entry.Sender = req.Sender
		entry.ReportType = req.Type
		entry.Description = req.Description
		entry.Tags = req.Tags
		entry.Title = req.Subject

		if req.Content != "" {
			// Store inline content as a JSON file
			safeName := fmt.Sprintf("report-%d.json", time.Now().UnixNano())
			storedName := safeName
			data, _ := json.Marshal(req)
			if err := os.WriteFile(filepath.Join(dir, storedName), data, 0600); err != nil {
				jsonError(w, "failed to save report", http.StatusInternalServerError)
				return
			}
			entry.Filename = safeName
			entry.StoredName = storedName
			entry.ContentType = "application/json"
			entry.Size = int64(len(data))
		} else {
			// No file, just metadata
			entry.Filename = ""
			entry.StoredName = ""
			entry.ContentType = "application/json"
		}
	}

	created, err := app.store.AddReportArchiveEntry(entry)
	if err != nil {
		jsonError(w, "failed to save report entry", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "create", "report_archive_ingest", created.ID,
		fmt.Sprintf("Incoming report from %q: %q", entry.Sender, entry.Subject))

	jsonOK(w, map[string]interface{}{
		"id":      created.ID,
		"title":   created.Title,
		"status":  "accepted",
		"message": "Report received and archived",
	})
}
