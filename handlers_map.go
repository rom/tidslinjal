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

// ── Map Location handlers ─────────────────────────────────────────────────────

func (app *App) handleListMapLocations(w http.ResponseWriter, r *http.Request, user *User) {
	locs := app.store.GetMapLocations()
	if locs == nil {
		locs = []MapLocation{}
	}
	jsonOK(w, locs)
}

func (app *App) handleAddMapLocation(w http.ResponseWriter, r *http.Request, user *User) {
	var loc MapLocation
	if err := decode(r, &loc); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if loc.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	// H-05 fix: sanitize map location name to prevent stored XSS
	loc.Name = stripHTMLTags(loc.Name)
	created, err := app.store.AddMapLocation(loc)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "created", EntityType: "map_location", EntityID: created.ID,
		Summary: fmt.Sprintf("Added map location: %s", loc.Name),
	})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (app *App) handleUpdateMapLocation(w http.ResponseWriter, r *http.Request, user *User) {
	var loc MapLocation
	if err := decode(r, &loc); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/map-locations/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	loc.ID = id
	// H-05 fix: sanitize map location name to prevent stored XSS
	loc.Name = stripHTMLTags(loc.Name)
	if err := app.store.UpdateMapLocation(loc); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, loc)
}

func (app *App) handleDeleteMapLocation(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/map-locations/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteMapLocation(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Geo Items handlers ────────────────────────────────────────────────────────

func (app *App) handleGetGeoItems(w http.ResponseWriter, r *http.Request, user *User) {
	items := app.store.GetGeoItems()
	if items == nil {
		items = []map[string]any{}
	}
	jsonOK(w, items)
}

func (app *App) handleSetGeoItems(w http.ResponseWriter, r *http.Request, user *User) {
	var items []map[string]any
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&items); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	app.store.SetGeoItems(items)
	jsonOK(w, items)
}

// ── Map Resource handlers ──────────────────────────────────────────────────────

func (app *App) handleListMapResources(w http.ResponseWriter, r *http.Request, user *User) {
	resources := app.store.GetMapResources()
	if resources == nil {
		resources = []MapResource{}
	}
	jsonOK(w, resources)
}

func (app *App) handleUploadMapResource(w http.ResponseWriter, r *http.Request, user *User) {
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		jsonError(w, "file too large (max 50 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()

	name := r.FormValue("name")
	if name == "" {
		name = header.Filename
	}
	mapType := r.FormValue("map_type")
	if mapType == "" {
		mapType = "custom"
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	// V3-H06 fix: removed .svg to prevent stored XSS via embedded JavaScript in SVG files
	allowed := map[string]bool{".pdf": true, ".jpg": true, ".jpeg": true, ".png": true, ".json": true, ".geojson": true}
	if !allowed[ext] {
		jsonError(w, "unsupported file type; allowed: PDF, JPG, PNG, JSON, GeoJSON", http.StatusBadRequest)
		return
	}

	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(header.Filename))
	destPath := filepath.Join(app.store.MapResourceDir(), storedName)
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

	// Derive Content-Type from file extension (don't trust client header)
	extToMime := map[string]string{
		".pdf": "application/pdf", ".svg": "image/svg+xml",
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
		".json": "application/json", ".geojson": "application/geo+json",
	}
	ct := extToMime[ext]
	if ct == "" {
		ct = "application/octet-stream"
	}

	mr := MapResource{
		Name:          stripHTMLTags(name),
		Description:   stripHTMLTags(r.FormValue("description")),
		MapType:       mapType,
		Filename:      storedName,
		OriginalName:  header.Filename,
		ContentType:   ct,
		Size:          written,
		CreatedBy:     user.ID,
		CreatedByName: user.DisplayName,
		CreatedAt:     time.Now(),
	}

	created, err := app.store.AddMapResource(mr)
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save map resource", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "created", EntityType: "map_resource", EntityID: created.ID,
		Summary: fmt.Sprintf("Uploaded map resource: %s", created.Name),
	})
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleDeleteMapResource(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/map-resources/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Remove the stored file — route through the safe-path choke-point so a
	// tampered mr.Filename cannot delete files outside MapResourceDir().
	if mr.Filename != "" {
		if p, ok := safeJoinFilename(app.store.MapResourceDir(), mr.Filename); ok {
			os.Remove(p)
		}
	}
	if err := app.store.DeleteMapResource(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "deleted", EntityType: "map_resource", EntityID: id,
		Summary: fmt.Sprintf("Deleted map resource: %s", mr.Name),
	})
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) handleGetMapOverlays(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/map-resources/"), "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	overlays := mr.Overlays
	if overlays == nil {
		overlays = []MapOverlay{}
	}
	jsonOK(w, overlays)
}

func (app *App) handleLockMapOverlay(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/map-resources/{id}/overlays/{overlayId}/lock
	path := strings.TrimPrefix(r.URL.Path, "/api/map-resources/")
	parts := strings.Split(path, "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid map resource id", http.StatusBadRequest)
		return
	}
	overlayID := parts[2]

	if !user.CanLock && !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "no lock permission", http.StatusForbidden)
		return
	}

	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	found := false
	for i, ov := range mr.Overlays {
		if ov.ID == overlayID {
			if ov.Locked {
				jsonError(w, "overlay already locked", http.StatusConflict)
				return
			}
			mr.Overlays[i].Locked = true
			mr.Overlays[i].LockedBy = user.ID
			found = true
			break
		}
	}
	if !found {
		jsonError(w, "overlay not found", http.StatusNotFound)
		return
	}
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, mr)
}

func (app *App) handleLockMap(w http.ResponseWriter, r *http.Request, user *User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/map-resources/")
	parts := strings.Split(path, "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !user.CanLock && !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "no map lock permission", http.StatusForbidden)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	mr.Locked = true
	mr.LockedBy = user.ID
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, mr)
}

func (app *App) handleUnlockMap(w http.ResponseWriter, r *http.Request, user *User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/map-resources/")
	parts := strings.Split(path, "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !user.CanLock && !app.effectiveHasRole(user, RoleTeamLead) {
		jsonError(w, "no map lock permission", http.StatusForbidden)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	mr.Locked = false
	mr.LockedBy = 0
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, mr)
}

func (app *App) handleGetMapDrawings(w http.ResponseWriter, r *http.Request, user *User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/map-resources/")
	parts := strings.Split(path, "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	drawings := mr.Drawings
	if drawings == nil {
		drawings = []MapDrawing{}
	}
	jsonOK(w, drawings)
}

func (app *App) handleUpdateMapDrawings(w http.ResponseWriter, r *http.Request, user *User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/map-resources/")
	parts := strings.Split(path, "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if mr.Locked && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "map is locked", http.StatusForbidden)
		return
	}
	var drawings []MapDrawing
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&drawings); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	mr.Drawings = drawings
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

// ── Additional Map Resource handlers ───────────────────────────────────────────

func (app *App) handleGetMapResource(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, mr)
}

func (app *App) handleServeMapResourceFile(w http.ResponseWriter, r *http.Request, user *User) {
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
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// SECURITY: defence-in-depth against a tampered mr.Filename (e.g. via
	// a malicious backup restore) — force the path through the shared
	// safeJoinFilename choke-point so it cannot escape MapResourceDir().
	filePath, pathOK := safeJoinFilename(app.store.MapResourceDir(), mr.Filename)
	if !pathOK {
		jsonError(w, "invalid filename", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", mr.ContentType)
	// Prevent script execution in served SVG/HTML files
	if strings.Contains(mr.ContentType, "svg") || strings.Contains(mr.ContentType, "html") {
		w.Header().Set("Content-Security-Policy", "sandbox")
	}
	safeDisp := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, mr.OriginalName)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, safeDisp))
	http.ServeFile(w, r, filePath)
}

func (app *App) handleUpdateMapResourceMeta(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		MapType     *string `json:"map_type"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name != nil {
		mr.Name = stripHTMLTags(*req.Name)
	}
	if req.Description != nil {
		mr.Description = stripHTMLTags(*req.Description)
	}
	if req.MapType != nil {
		mr.MapType = *req.MapType
	}
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, mr)
}

func (app *App) handleUpdateMapResourceOverlays(w http.ResponseWriter, r *http.Request, user *User) {
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
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if mr.Locked && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "map is locked", http.StatusForbidden)
		return
	}
	var overlays []MapOverlay
	if err := decode(r, &overlays); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	mr.Overlays = overlays
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, mr)
}

func (app *App) handleUnlockMapOverlay(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	overlayID := parts[4]
	mr, ok := app.store.GetMapResource(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	found := false
	for i := range mr.Overlays {
		if mr.Overlays[i].ID == overlayID {
			if !mr.Overlays[i].Locked {
				jsonError(w, "overlay not locked", http.StatusConflict)
				return
			}
			// Only the locker or teamlead+ can unlock
			if mr.Overlays[i].LockedBy != user.ID && !app.effectiveHasRole(user, RoleTeamLead) {
				jsonError(w, "only the lock owner or team lead can unlock", http.StatusForbidden)
				return
			}
			mr.Overlays[i].Locked = false
			mr.Overlays[i].LockedBy = 0
			found = true
			break
		}
	}
	if !found {
		jsonError(w, "overlay not found", http.StatusNotFound)
		return
	}
	if err := app.store.UpdateMapResource(mr); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, mr)
}
