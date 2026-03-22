package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ── Resource Incident handlers ───────────────────────────────────────────────

func (app *App) handleListResourceIncidents(w http.ResponseWriter, r *http.Request, user *User) {
	resourceType := r.URL.Query().Get("resource_type")
	resourceIDStr := r.URL.Query().Get("resource_id")

	if resourceType != "" && resourceIDStr != "" {
		resourceID, _ := strconv.ParseInt(resourceIDStr, 10, 64)
		incidents := app.store.GetResourceIncidentsByResource(resourceType, resourceID)
		if incidents == nil {
			incidents = []ResourceIncident{}
		}
		jsonOK(w, incidents)
		return
	}
	incidents := app.store.GetResourceIncidents()
	if incidents == nil {
		incidents = []ResourceIncident{}
	}
	jsonOK(w, incidents)
}

func (app *App) handleSaveResourceIncident(w http.ResponseWriter, r *http.Request, user *User) {
	var ri ResourceIncident
	if err := decode(r, &ri); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if ri.Title == "" {
		jsonError(w, "title is required", http.StatusBadRequest)
		return
	}
	ri.Title = stripHTMLTags(ri.Title)
	ri.Description = stripHTMLTags(ri.Description)
	if ri.ID == 0 {
		ri.CreatedByID = user.ID
		ri.CreatedByName = user.DisplayName
	}

	saved, err := app.store.SaveResourceIncident(ri)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	action := "updated"
	if ri.ID == 0 {
		action = "created"
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: action, EntityType: "resource_incident", EntityID: saved.ID,
		Summary: fmt.Sprintf("%s resource incident: %s (%s/%s)", action, saved.Title, saved.IncidentType, saved.Severity),
	})

	// Broadcast via SSE for critical incidents
	if saved.Severity == "critical" || saved.Severity == "high" {
		payload := fmt.Sprintf(`{"type":"resource_incident","id":%d,"title":"%s","severity":"%s","resource_type":"%s","incident_type":"%s"}`,
			saved.ID, saved.Title, saved.Severity, saved.ResourceType, saved.IncidentType)
		app.broker.BroadcastAll(SSEMessage{Event: "resource_incident", Data: payload})
	}

	jsonOK(w, saved)
}

func (app *App) handleDeleteResourceIncident(w http.ResponseWriter, r *http.Request, user *User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/resource-incidents/")
	id, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteResourceIncident(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "deleted", EntityType: "resource_incident", EntityID: id,
		Summary: fmt.Sprintf("Deleted resource incident ID %d", id),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleUpdateResourceIncidentStatus(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/resource-incidents/{id}/status
	path := strings.TrimPrefix(r.URL.Path, "/api/resource-incidents/")
	path = strings.TrimSuffix(path, "/status")
	id, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	incidents := app.store.GetResourceIncidents()
	for _, ri := range incidents {
		if ri.ID == id {
			ri.Status = req.Status
			if req.Status == "resolved" || req.Status == "closed" {
				now := time.Now()
				ri.ResolvedAt = &now
			}
			app.store.SaveResourceIncident(ri)
			app.store.LogAudit(AuditEntry{
				UserID: user.ID, UserName: user.Username,
				Action: "status_changed", EntityType: "resource_incident", EntityID: id,
				Summary: fmt.Sprintf("Resource incident %d status → %s", id, req.Status),
			})
			jsonOK(w, ri)
			return
		}
	}
	jsonError(w, "incident not found", http.StatusNotFound)
}
