package main

import (
	"net/http"
	"strconv"
	"time"
)

// ── Tag handlers ────────────────────────────────────────────────────────────

func (app *App) handleGetTags(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetTags())
}

func (app *App) handleCreateTag(w http.ResponseWriter, r *http.Request, user *User) {
	var req Tag
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}
	req.CreatedBy = user.ID
	req.CreatedAt = time.Now()
	saved, err := app.store.AddTag(req)
	if err != nil {
		jsonError(w, "failed to save tag", http.StatusInternalServerError)
		return
	}
	jsonOK(w, saved)
}

func (app *App) handleDeleteTag(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteTag(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleGetTagCloud(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetTagCloud())
}
