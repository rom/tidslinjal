package main

import (
	"net/http"
)

// ── Lock handlers ──────────────────────────────────────────────────────────────

func (app *App) handleGetLocks(w http.ResponseWriter, r *http.Request, user *User) {
	locks := app.store.GetLocks()
	if locks == nil {
		locks = []LockedSlot{}
	}
	jsonOK(w, locks)
}

func (app *App) handleCreateLock(w http.ResponseWriter, r *http.Request, user *User) {
	if !hasRole(user.Role, RoleTeamLead) && !user.CanLock {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var l LockedSlot
	if err := decode(r, &l); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	l.LockedBy = user.ID
	l.LockedByName = user.DisplayName
	created, err := app.store.CreateLock(l)
	if err != nil {
		jsonError(w, "failed to create lock", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	logVerbose("lock created: id=%d user=%s", created.ID, user.Username)
	jsonOK(w, created)
}

func (app *App) handleDeleteLock(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// Admin can always unlock; lock creator and can_lock users can unlock their own
	if err := app.store.DeleteLockAuthorized(id, user.ID, hasRole(user.Role, RoleAdmin)); err != nil {
		jsonError(w, err.Error(), http.StatusForbidden)
		return
	}
	logVerbose("lock deleted: id=%d user=%s", id, user.Username)
	jsonOK(w, map[string]string{"status": "deleted"})
}
