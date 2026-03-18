package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// ── Checklist handlers ──────────────────────────────────────────────────────

func (app *App) handleGetChecklistTemplates(w http.ResponseWriter, r *http.Request, user *User) {
	custom := app.store.GetChecklistTemplates()
	builtIn := BuiltInChecklists()
	all := append(builtIn, custom...)
	jsonOK(w, all)
}

func (app *App) handleCreateChecklistTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	var req ChecklistTemplate
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}
	if len(req.Items) == 0 {
		jsonError(w, "at least one item is required", http.StatusBadRequest)
		return
	}
	now := time.Now()
	req.CreatedBy = user.ID
	req.CreatedAt = now
	req.UpdatedAt = now
	req.BuiltIn = false
	saved, err := app.store.AddChecklistTemplate(req)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "create_checklist_template", EntityType: "checklist_template", EntityID: saved.ID,
		Summary: fmt.Sprintf("Created checklist template '%s'", saved.Name),
	})
	jsonOK(w, saved)
}

func (app *App) handleUpdateChecklistTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if id < 0 {
		jsonError(w, "cannot modify built-in checklists", http.StatusForbidden)
		return
	}
	var req ChecklistTemplate
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}
	req.ID = id
	req.UpdatedAt = time.Now()
	req.BuiltIn = false
	if err := app.store.UpdateChecklistTemplate(req); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "update_checklist_template", EntityType: "checklist_template", EntityID: id,
		Summary: fmt.Sprintf("Updated checklist template '%s'", req.Name),
	})
	jsonOK(w, req)
}

func (app *App) handleDeleteChecklistTemplate(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if id < 0 {
		jsonError(w, "cannot delete built-in checklists", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteChecklistTemplate(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "delete_checklist_template", EntityType: "checklist_template", EntityID: id,
		Summary: "Deleted checklist template",
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleGetChecklistInstances(w http.ResponseWriter, r *http.Request, user *User) {
	instances := app.store.GetChecklistInstances()
	if instances == nil {
		instances = []ChecklistInstance{}
	}
	jsonOK(w, instances)
}

func (app *App) handleCreateChecklistInstance(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		TemplateID int64  `json:"template_id"`
		Name       string `json:"name"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Find template (built-in or custom)
	var tmpl *ChecklistTemplate
	for _, b := range BuiltInChecklists() {
		if b.ID == req.TemplateID {
			tmpl = &b
			break
		}
	}
	if tmpl == nil {
		for _, c := range app.store.GetChecklistTemplates() {
			if c.ID == req.TemplateID {
				tmpl = &c
				break
			}
		}
	}
	if tmpl == nil {
		jsonError(w, "template not found", http.StatusNotFound)
		return
	}
	name := req.Name
	if name == "" {
		name = tmpl.Name
	}
	now := time.Now()
	items := make([]ChecklistInstanceItem, len(tmpl.Items))
	for i, it := range tmpl.Items {
		items[i] = ChecklistInstanceItem{Text: it.Text, Category: it.Category}
	}
	ci := ChecklistInstance{
		TemplateID:    req.TemplateID,
		Name:          name,
		Items:         items,
		Status:        "active",
		CreatedBy:     user.ID,
		CreatedByName: user.DisplayName,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	saved, err := app.store.AddChecklistInstance(ci)
	if err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "start_checklist", EntityType: "checklist_instance", EntityID: saved.ID,
		Summary: fmt.Sprintf("Started checklist '%s'", name),
	})
	jsonOK(w, saved)
}

func (app *App) handleUpdateChecklistInstance(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req ChecklistInstance
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.ID = id
	req.UpdatedAt = time.Now()
	if req.Status == "completed" && req.CompletedAt == nil {
		now := time.Now()
		req.CompletedAt = &now
		req.CompletedBy = user.ID
		req.CompletedByName = user.DisplayName
	}
	if err := app.store.UpdateChecklistInstance(req); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	if req.Status == "completed" {
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "complete_checklist", EntityType: "checklist_instance", EntityID: req.ID,
			Summary: fmt.Sprintf("Completed checklist '%s'", req.Name),
		})
	}
	jsonOK(w, req)
}

func (app *App) handleDeleteChecklistInstance(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteChecklistInstance(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// resolvePollTargets returns the list of user IDs targeted by a poll
func (app *App) resolvePollTargets(poll Poll) []int64 {
	seen := make(map[int64]bool)
	var result []int64
	switch poll.TargetType {
	case "user":
		for _, idStr := range poll.TargetIDs {
			uid, err := strconv.ParseInt(idStr, 10, 64)
			if err == nil {
				if !seen[uid] {
					seen[uid] = true
					result = append(result, uid)
				}
			}
		}
	case "group":
		for _, idStr := range poll.TargetIDs {
			gid, err := strconv.ParseInt(idStr, 10, 64)
			if err == nil {
				members := app.store.GetGroupMembers(gid)
				for _, m := range members {
					if !seen[m.UserID] {
						seen[m.UserID] = true
						result = append(result, m.UserID)
					}
				}
			}
		}
	case "role":
		users := app.store.GetUsers()
		for _, u := range users {
			for _, roleStr := range poll.TargetIDs {
				if string(u.Role) == roleStr {
					if !seen[u.ID] {
						seen[u.ID] = true
						result = append(result, u.ID)
					}
					break
				}
			}
		}
	}
	return result
}
