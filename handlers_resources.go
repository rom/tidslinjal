package main

import (
	"fmt"
	"net/http"
	"strconv"
)

// ── Resource Notes handlers ──────────────────────────────────────────────────

func (app *App) handleGetResourceNotes(w http.ResponseWriter, r *http.Request, user *User) {
	resType := r.URL.Query().Get("resource_type")
	resID := r.URL.Query().Get("resource_id")
	if resType != "" && resID != "" {
		notes := app.store.GetResourceNotes(resType, resID)
		if notes == nil {
			notes = []ResourceNote{}
		}
		// Filter notes: only show notes created by the current user (private to each individual)
		if !app.effectiveHasRole(user, RoleAdmin) {
			var filtered []ResourceNote
			for _, n := range notes {
				if n.CreatedBy == user.ID {
					filtered = append(filtered, n)
				}
			}
			if filtered == nil {
				filtered = []ResourceNote{}
			}
			notes = filtered
		}
		jsonOK(w, notes)
	} else {
		notes := app.store.GetAllResourceNotes()
		if notes == nil {
			notes = []ResourceNote{}
		}
		// Filter: non-admin users only see their own notes
		if !app.effectiveHasRole(user, RoleAdmin) {
			var filtered []ResourceNote
			for _, n := range notes {
				if n.CreatedBy == user.ID {
					filtered = append(filtered, n)
				}
			}
			if filtered == nil {
				filtered = []ResourceNote{}
			}
			notes = filtered
		}
		jsonOK(w, notes)
	}
}

func (app *App) handleCreateResourceNote(w http.ResponseWriter, r *http.Request, user *User) {
	var note ResourceNote
	if err := decode(r, &note); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if note.ResourceType == "" || note.ResourceID == "" || note.Content == "" {
		jsonError(w, "resource_type, resource_id, and content are required", http.StatusBadRequest)
		return
	}
	note.CreatedBy = user.ID
	note.CreatedByName = user.DisplayName
	if note.CreatedByName == "" {
		note.CreatedByName = user.Username
	}
	created, err := app.store.AddResourceNote(note)
	if err != nil {
		jsonError(w, "failed to create note", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "create_resource_note", EntityType: "resource_note", EntityID: created.ID,
		Summary: fmt.Sprintf("Added note on %s %s: %s", note.ResourceType, note.ResourceID, truncate(note.Content, 50)),
	})
	jsonOK(w, created)
}

func (app *App) handleDeleteResourceNote(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteResourceNote(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "delete_resource_note", EntityType: "resource_note", EntityID: id,
		Summary: "Deleted resource note",
	})
	w.WriteHeader(http.StatusNoContent)
}

// ── Resource Stars handlers ──────────────────────────────────────────────────

func (app *App) handleGetResourceStars(w http.ResponseWriter, r *http.Request, user *User) {
	resType := r.URL.Query().Get("resource_type")
	resID := r.URL.Query().Get("resource_id")
	if resType != "" && resID != "" {
		stars := app.store.GetResourceStars(resType, resID)
		if stars == nil {
			stars = []ResourceStar{}
		}
		// Filter by visibility
		var visible []ResourceStar
		for _, st := range stars {
			switch st.Visibility {
			case "global":
				visible = append(visible, st)
			case "team":
				// Check if user is in the same team
				if st.TeamID != nil {
					members := app.store.GetGroupMembers(*st.TeamID)
					for _, m := range members {
						if m.UserID == user.ID {
							visible = append(visible, st)
							break
						}
					}
				}
			case "role":
				if string(user.Role) == st.RoleKey {
					visible = append(visible, st)
				}
			case "private":
				if st.CreatedBy == user.ID {
					visible = append(visible, st)
				}
			default:
				visible = append(visible, st)
			}
		}
		if visible == nil {
			visible = []ResourceStar{}
		}
		jsonOK(w, visible)
	} else {
		stars := app.store.GetAllResourceStars()
		if stars == nil {
			stars = []ResourceStar{}
		}
		jsonOK(w, stars)
	}
}

func (app *App) handleCreateResourceStar(w http.ResponseWriter, r *http.Request, user *User) {
	var star ResourceStar
	if err := decode(r, &star); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if star.ResourceType == "" || star.ResourceID == "" {
		jsonError(w, "resource_type and resource_id are required", http.StatusBadRequest)
		return
	}
	if star.Stars < 1 || star.Stars > 5 {
		star.Stars = 1
	}
	if star.Visibility == "" {
		star.Visibility = "global"
	}
	star.CreatedBy = user.ID
	star.CreatedByName = user.DisplayName
	if star.CreatedByName == "" {
		star.CreatedByName = user.Username
	}
	created, err := app.store.AddResourceStar(star)
	if err != nil {
		jsonError(w, "failed to create star", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "create_resource_star", EntityType: "resource_star", EntityID: created.ID,
		Summary: fmt.Sprintf("Added %d star(s) on %s %s (visibility: %s)", star.Stars, star.ResourceType, star.ResourceID, star.Visibility),
	})
	jsonOK(w, created)
}

func (app *App) handleDeleteResourceStar(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteResourceStar(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "delete_resource_star", EntityType: "resource_star", EntityID: id,
		Summary: "Deleted resource star",
	})
	w.WriteHeader(http.StatusNoContent)
}

// ── Startup Text handlers ──────────────────────────────────────────────────

func (app *App) handleGetStartupText(w http.ResponseWriter, r *http.Request, user *User) {
	text := app.store.GetStartupText()
	jsonOK(w, map[string]string{"text": text})
}

func (app *App) handleSetStartupText(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Text string `json:"text"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := app.store.SetStartupText(req.Text); err != nil {
		jsonError(w, "failed to save startup text", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "set_startup_text", EntityType: "settings",
		Summary: fmt.Sprintf("Updated startup text (%d chars)", len(req.Text)),
	})
	jsonOK(w, map[string]string{"text": req.Text})
}
