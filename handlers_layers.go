package main

import (
	"fmt"
	"net/http"
)

// ── Layer helpers ──────────────────────────────────────────────────────────────

// canReadLayer checks whether the user has read access to a layer (H-01/H-02/H-04 fix).
func (app *App) canReadLayer(layerID int64, user *User) bool {
	layer, ok := app.store.GetLayerByID(layerID)
	if !ok {
		return false
	}
	if layer.OwnerID == user.ID || hasRole(user.Role, RoleAdmin) {
		return true
	}
	if layer.Visibility == "public" {
		return true
	}
	if layer.Visibility == "groups" {
		userGroups := app.userGroups(user.ID)
		groupSet := make(map[int64]bool)
		for _, gid := range userGroups {
			groupSet[gid] = true
		}
		for _, gid := range layer.GroupIDs {
			if groupSet[gid] {
				return true
			}
		}
	}
	return false
}

func (app *App) canWriteLayer(layerID int64, user *User) bool {
	layer, ok := app.store.GetLayerByID(layerID)
	if !ok {
		return false
	}
	if layer.OwnerID == user.ID || hasRole(user.Role, RoleAdmin) {
		return true
	}
	// Custom roles with manage_layers capability can write to any layer
	if app.userHasCapability(user, "manage_layers") {
		return true
	}
	if layer.Visibility == "groups" && layer.Permission == "readwrite" {
		userGroups := app.userGroups(user.ID)
		groupSet := make(map[int64]bool)
		for _, gid := range userGroups {
			groupSet[gid] = true
		}
		for _, gid := range layer.GroupIDs {
			if groupSet[gid] {
				return true
			}
		}
	}
	return false
}

// visibleLayerSet returns the set of layer IDs the user can read.
// Admins get nil (meaning "all layers visible").
// V3-H02 fix: centralized layer filtering for all event queries.
func (app *App) visibleLayerSet(user *User) map[int64]bool {
	if hasRole(user.Role, RoleAdmin) || app.userHasCapability(user, "manage_layers") {
		return nil // nil = no filter, admin/manage_layers sees everything
	}
	vis := make(map[int64]bool)
	userGroups := app.userGroups(user.ID)
	for _, l := range app.store.GetLayersVisibleTo(user.ID, userGroups) {
		vis[l.ID] = true
	}
	return vis
}

// filterVisibleEvents filters a slice of events to only those the user can see.
// Master-timeline events (LayerID == nil) are always included.
// V3-H02 fix: centralized layer filtering for all event queries.
func filterVisibleEvents(events []Event, visibleLayers map[int64]bool) []Event {
	if visibleLayers == nil {
		return events // admin — no filtering
	}
	result := make([]Event, 0, len(events))
	for _, e := range events {
		if e.LayerID == nil || visibleLayers[*e.LayerID] {
			result = append(result, e)
		}
	}
	return result
}

// canUserSeeEvent checks whether a single event is visible to the user.
// V3-H01 fix: used by SSE broadcast to filter per-client.
func (app *App) canUserSeeEvent(userID int64, ev *Event) bool {
	if ev.LayerID == nil {
		return true // master timeline
	}
	user, ok := app.store.GetUserByID(userID)
	if !ok {
		return false
	}
	if hasRole(user.Role, RoleAdmin) {
		return true
	}
	return app.canReadLayer(*ev.LayerID, user)
}

// ── Layer handlers ─────────────────────────────────────────────────────────────

func (app *App) handleGetLayers(w http.ResponseWriter, r *http.Request, user *User) {
	var layers []Layer
	if hasRole(user.Role, RoleAdmin) {
		// Admins see all layers
		layers = app.store.GetAllLayers()
	} else {
		userGroups := app.userGroups(user.ID)
		layers = app.store.GetLayersVisibleTo(user.ID, userGroups)
	}
	if layers == nil {
		layers = []Layer{}
	}
	jsonOK(w, layers)
}

func (app *App) handleCreateLayer(w http.ResponseWriter, r *http.Request, user *User) {
	var l Layer
	if err := decode(r, &l); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if l.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	if l.Visibility == "" {
		l.Visibility = "private"
	}
	if l.Permission == "" {
		l.Permission = "read"
	}
	l.OwnerID = user.ID
	l.OwnerName = user.DisplayName

	created, err := app.store.CreateLayer(l)
	if err != nil {
		jsonError(w, "failed to create layer", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	logDebug("layer created: id=%d name=%q user=%s", created.ID, created.Name, user.Username)
	jsonOK(w, created)
}

func (app *App) handleUpdateLayer(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetLayerByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.OwnerID != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var l Layer
	if err := decode(r, &l); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	l.ID = id
	l.OwnerID = existing.OwnerID
	l.OwnerName = existing.OwnerName
	l.CreatedAt = existing.CreatedAt
	if l.GroupIDs == nil {
		l.GroupIDs = []int64{}
	}
	if err := app.store.UpdateLayer(l); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetLayerByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeleteLayer(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetLayerByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.OwnerID != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteLayer(id); err != nil {
		jsonError(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "layer", id,
		fmt.Sprintf("Deleted layer %q", existing.Name))
	logDebug("layer deleted: id=%d user=%s", id, user.Username)
	jsonOK(w, map[string]string{"status": "deleted"})
}
