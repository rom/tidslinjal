package main

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
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
