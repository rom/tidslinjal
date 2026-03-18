package main

import (
	"net/http"
)

// ── Event type handlers ────────────────────────────────────────────────────────

func (app *App) handleGetEventTypes(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, app.store.GetEventTypes())
}

func (app *App) handleCreateEventType(w http.ResponseWriter, r *http.Request, user *User) {
	var et EventTypeDef
	if err := decode(r, &et); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if et.Key == "" || et.Label == "" {
		jsonError(w, "key and label required", http.StatusBadRequest)
		return
	}
	if et.Color == "" {
		et.Color = "#666666"
	}
	et.IsSystem = false
	et.CreatedBy = user.ID

	created, err := app.store.CreateEventType(et)
	if err != nil {
		jsonError(w, "failed to create", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateEventType(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventTypeByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// System types editable only by admin; custom types by creator or admin
	if existing.IsSystem && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if !existing.IsSystem && existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var et EventTypeDef
	if err := decode(r, &et); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	et.ID = id
	et.Key = existing.Key // key is immutable
	et.IsSystem = existing.IsSystem
	et.CreatedBy = existing.CreatedBy
	et.CreatedAt = existing.CreatedAt

	if err := app.store.UpdateEventType(et); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetEventTypeByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeleteEventType(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetEventTypeByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.IsSystem {
		jsonError(w, "cannot delete system event type", http.StatusBadRequest)
		return
	}
	if existing.CreatedBy != user.ID && !hasRole(user.Role, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteEventType(id); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}
