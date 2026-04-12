package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Room / Resource handlers ───────────────────────────────────────────────────

func (app *App) handleListRooms(w http.ResponseWriter, r *http.Request, user *User) {
	rooms := app.store.GetRooms()
	if rooms == nil {
		rooms = []Room{}
	}
	jsonOK(w, rooms)
}

func (app *App) handleSaveRoom(w http.ResponseWriter, r *http.Request, user *User) {
	var room Room
	if err := decode(r, &room); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if room.Name == "" {
		jsonError(w, "room name required", http.StatusBadRequest)
		return
	}
	// H-05 fix: sanitize room name/description to prevent stored XSS
	room.Name = stripHTMLTags(room.Name)
	room.Description = stripHTMLTags(room.Description)
	room.Zone = stripHTMLTags(room.Zone)
	room.Responsibility = stripHTMLTags(room.Responsibility)
	room.Owner = stripHTMLTags(room.Owner)
	// SECURITY: ImageName is the on-disk filename joined with AttachmentDir()
	// in the download/delete code paths. Never trust it from the client —
	// it is only ever set server-side by the image upload handler. For an
	// update, preserve the existing value from the DB; for a new room, clear
	// it. This closes an arbitrary-file-read / delete chain via the
	// /api/rooms save endpoint.
	if room.ID > 0 {
		for _, existing := range app.store.GetRooms() {
			if existing.ID == room.ID {
				room.ImageName = existing.ImageName
				break
			}
		}
	} else {
		room.ImageName = ""
	}
	if err := app.store.SaveRoom(room); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "room", EntityID: room.ID,
		Summary: fmt.Sprintf("Updated room: %s", room.Name),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteRoom(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteRoom(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "deleted", EntityType: "room", EntityID: id,
		Summary: fmt.Sprintf("Deleted room/resource ID %d", id),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Custom Resource Type handlers ────────────────────────────────────────────

func (app *App) handleListCustomResourceTypes(w http.ResponseWriter, r *http.Request, user *User) {
	types := app.store.GetCustomResourceTypes()
	if types == nil {
		types = []CustomResourceType{}
	}
	jsonOK(w, types)
}

func (app *App) handleSaveCustomResourceType(w http.ResponseWriter, r *http.Request, user *User) {
	var crt CustomResourceType
	if err := decode(r, &crt); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if crt.Key == "" || crt.Label == "" {
		jsonError(w, "key and label required", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveCustomResourceType(crt); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "custom_resource_type",
		Summary: fmt.Sprintf("Saved custom resource type: %s", crt.Label),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteCustomResourceType(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/custom-resource-types/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteCustomResourceType(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Room Image handlers ─────────────────────────────────────────────────────

func (app *App) handleRoomImageUpload(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/rooms/{id}/image
	idStr := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	idStr = strings.TrimSuffix(idStr, "/image")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		jsonError(w, "file too large (max 10 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		jsonError(w, "image field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".jpg"
	}
	allowedImageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
	if !allowedImageExts[ext] {
		jsonError(w, "unsupported image type; allowed: JPG, PNG, GIF, WebP", http.StatusBadRequest)
		return
	}
	storedName := fmt.Sprintf("room_%d_%d%s", id, time.Now().UnixNano(), ext)
	destPath := filepath.Join(app.store.AttachmentDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save image", http.StatusInternalServerError)
		return
	}
	_, err = io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save image", http.StatusInternalServerError)
		return
	}
	// Update room record with image name
	rooms := app.store.GetRooms()
	for _, rm := range rooms {
		if rm.ID == id {
			// Remove old image if exists — route through the safe-path
			// helper so a legacy/tampered ImageName can never target files
			// outside AttachmentDir.
			if rm.ImageName != "" {
				if p, ok := app.safeAttachmentPath(rm.ImageName); ok {
					os.Remove(p)
				}
			}
			rm.ImageName = storedName
			_ = app.store.SaveRoom(rm)
			break
		}
	}
	jsonOK(w, map[string]string{"status": "ok", "image_name": storedName})
}

func (app *App) handleRoomImageDownload(w http.ResponseWriter, r *http.Request) {
	// Path: /api/rooms/{id}/image or /api/rooms/{id}/image/{filename}
	path := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	parts := strings.SplitN(path, "/", 3)
	if len(parts) < 2 {
		http.NotFound(w, r)
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	rooms := app.store.GetRooms()
	for _, rm := range rooms {
		if rm.ID == id && rm.ImageName != "" {
			// SECURITY: refuse to serve anything outside AttachmentDir.
			filePath, ok := app.safeAttachmentPath(rm.ImageName)
			if !ok {
				http.NotFound(w, r)
				return
			}
			http.ServeFile(w, r, filePath)
			return
		}
	}
	http.NotFound(w, r)
}

// safeAttachmentPath resolves an attachment filename to an absolute path
// under AttachmentDir() only if it is a safe, in-directory basename.
// Same semantics as safeReferenceFilePath but for the attachment dir.
// This is the single choke-point for every room/image on-disk operation so
// that a tampered Room.ImageName cannot escape the attachment directory.
func (app *App) safeAttachmentPath(filename string) (string, bool) {
	if filename == "" {
		return "", false
	}
	if filename != filepath.Base(filename) {
		return "", false
	}
	if filename == "." || filename == ".." {
		return "", false
	}
	if strings.ContainsAny(filename, `/\`) {
		return "", false
	}
	dir := app.store.AttachmentDir()
	full := filepath.Join(dir, filename)
	absDir, err1 := filepath.Abs(dir)
	absFull, err2 := filepath.Abs(full)
	if err1 != nil || err2 != nil {
		return "", false
	}
	if !strings.HasPrefix(absFull, absDir+string(filepath.Separator)) && absFull != absDir {
		return "", false
	}
	return full, true
}
