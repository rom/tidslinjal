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
