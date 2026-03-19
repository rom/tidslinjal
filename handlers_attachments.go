package main

import (
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Attachment handlers ────────────────────────────────────────────────────────

func (app *App) handleGetAttachments(w http.ResponseWriter, r *http.Request, user *User) {
	// path: /api/events/:id/attachments
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	eventID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid event id", http.StatusBadRequest)
		return
	}
	atts := app.store.GetAttachmentsByEvent(eventID)
	if atts == nil {
		atts = []Attachment{}
	}
	jsonOK(w, atts)
}

func (app *App) handleUploadAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	eventID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid event id", http.StatusBadRequest)
		return
	}
	if _, ok := app.store.GetEventByID(eventID); !ok {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}

	if err := r.ParseMultipartForm(25 << 20); err != nil {
		jsonError(w, "file too large (max 25 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Strip any path components from the filename to prevent path traversal attacks.
	safeFilename := filepath.Base(header.Filename)
	if safeFilename == "." || safeFilename == "/" {
		safeFilename = "upload"
	}
	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeFilename)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	size, err := io.Copy(dst, file)
	if err != nil {
		jsonError(w, "failed to write file", http.StatusInternalServerError)
		return
	}

	mimeType := mime.TypeByExtension(filepath.Ext(header.Filename))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	att, err := app.store.CreateAttachment(Attachment{
		EventID:      eventID,
		Filename:     header.Filename,
		StoredName:   storedName,
		Size:         size,
		MimeType:     mimeType,
		UploadedBy:   user.ID,
		UploaderName: user.DisplayName,
	})
	if err != nil {
		jsonError(w, "failed to record attachment", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, att)
}

func (app *App) handleDownloadAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	att, ok := app.store.GetAttachmentByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// H-01 fix: verify user can access the event's layer before serving attachment
	if ev, ok := app.store.GetEventByID(att.EventID); ok && ev.LayerID != nil {
		if !app.canReadLayer(*ev.LayerID, user) {
			jsonError(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	path := filepath.Join(app.store.AttachmentDir(), att.StoredName)
	w.Header().Set("Content-Type", att.MimeType)
	// Sanitise filename for use in Content-Disposition to prevent header injection.
	// Remove double-quotes, backslashes, and newline characters that could break the header.
	safeDisp := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, att.Filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeDisp))
	http.ServeFile(w, r, path)
}

func (app *App) handleDeleteAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	att, ok := app.store.GetAttachmentByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// L-06 fix: verify user has write access to the event's layer before allowing delete
	if ev, ok := app.store.GetEventByID(att.EventID); ok && ev.LayerID != nil {
		if !app.canWriteLayer(*ev.LayerID, user) {
			jsonError(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	if att.UploadedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	path := filepath.Join(app.store.AttachmentDir(), att.StoredName)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		log.Printf("warning: failed to remove attachment file %s: %v", path, err)
	}
	if err := app.store.DeleteAttachment(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}
