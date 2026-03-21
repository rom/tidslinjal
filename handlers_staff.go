package main

import (
	"fmt"
	"net/http"
	"time"
)

// ── Staff Duties ─────────────────────────────────────────────────────────────

func (app *App) handleGetStaffDuties(w http.ResponseWriter, r *http.Request, user *User) {
	duties := app.store.GetStaffDuties()
	if duties == nil {
		duties = []StaffDuty{}
	}
	jsonOK(w, duties)
}

func (app *App) handleSetStaffDuty(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Role      string `json:"role"`
		UserID    int64  `json:"user_id"`
		UserName  string `json:"user_name"`
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
		Note      string `json:"note"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		jsonError(w, "role is required", http.StatusBadRequest)
		return
	}
	if req.UserName == "" && req.UserID > 0 {
		if u, ok := app.store.GetUserByID(req.UserID); ok {
			req.UserName = u.DisplayName
		}
	}
	now := time.Now()
	duty := StaffDuty{
		Role:      req.Role,
		UserID:    req.UserID,
		UserName:  req.UserName,
		StartTime: req.StartTime,
		EndTime:   req.EndTime,
		Note:      req.Note,
		SetByID:   user.ID,
		SetByName: user.DisplayName,
		CreatedAt: now,
		UpdatedAt: now,
	}
	app.store.SetStaffDuty(duty)
	app.audit(user.ID, user.DisplayName, "set", "staff_duty", 0,
		fmt.Sprintf("Set duty %q → %s", req.Role, req.UserName))
	jsonOK(w, duty)
}

func (app *App) handleDeleteStaffDuty(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	app.store.DeleteStaffDuty(id)
	app.audit(user.ID, user.DisplayName, "deleted", "staff_duty", id,
		fmt.Sprintf("Deleted staff duty #%d", id))
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Staff Members ────────────────────────────────────────────────────────────

func (app *App) handleGetStaffMembers(w http.ResponseWriter, r *http.Request, user *User) {
	members := app.store.GetStaffMembers()
	if members == nil {
		members = []StaffMember{}
	}
	jsonOK(w, members)
}

func (app *App) handleSetStaffMember(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Position string `json:"position"`
		UserID   int64  `json:"user_id"`
		UserName string `json:"user_name"`
		Note     string `json:"note"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Position == "" {
		jsonError(w, "position is required", http.StatusBadRequest)
		return
	}
	if req.UserName == "" && req.UserID > 0 {
		if u, ok := app.store.GetUserByID(req.UserID); ok {
			req.UserName = u.DisplayName
		}
	}
	now := time.Now()
	member := StaffMember{
		Position:  req.Position,
		UserID:    req.UserID,
		UserName:  req.UserName,
		Note:      req.Note,
		SetByID:   user.ID,
		SetByName: user.DisplayName,
		CreatedAt: now,
		UpdatedAt: now,
	}
	app.store.SetStaffMember(member)
	app.audit(user.ID, user.DisplayName, "set", "staff_member", 0,
		fmt.Sprintf("Set staff position %q → %s", req.Position, req.UserName))
	jsonOK(w, member)
}

func (app *App) handleDeleteStaffMember(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	app.store.DeleteStaffMember(id)
	app.audit(user.ID, user.DisplayName, "deleted", "staff_member", id,
		fmt.Sprintf("Deleted staff member #%d", id))
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Areas of Responsibility ──────────────────────────────────────────────────

func (app *App) handleGetAreas(w http.ResponseWriter, r *http.Request, user *User) {
	areas := app.store.GetAreasOfResponsibility()
	if areas == nil {
		areas = []AreaOfResponsibility{}
	}
	jsonOK(w, areas)
}

func (app *App) handleCreateArea(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		AssignedTo   int64  `json:"assigned_to"`
		AssignedName string `json:"assigned_name"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.AssignedName == "" && req.AssignedTo > 0 {
		if u, ok := app.store.GetUserByID(req.AssignedTo); ok {
			req.AssignedName = u.DisplayName
		}
	}
	now := time.Now()
	area := AreaOfResponsibility{
		Name:          req.Name,
		Description:   req.Description,
		AssignedTo:    req.AssignedTo,
		AssignedName:  req.AssignedName,
		CreatedByID:   user.ID,
		CreatedByName: user.DisplayName,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	app.store.CreateArea(area)
	app.audit(user.ID, user.DisplayName, "created", "area_of_responsibility", 0,
		fmt.Sprintf("Created area %q", req.Name))
	jsonOK(w, area)
}

func (app *App) handleUpdateArea(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		AssignedTo   int64  `json:"assigned_to"`
		AssignedName string `json:"assigned_name"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.AssignedName == "" && req.AssignedTo > 0 {
		if u, ok := app.store.GetUserByID(req.AssignedTo); ok {
			req.AssignedName = u.DisplayName
		}
	}
	app.store.UpdateArea(id, req.Name, req.Description, req.AssignedTo, req.AssignedName)
	app.audit(user.ID, user.DisplayName, "updated", "area_of_responsibility", id,
		fmt.Sprintf("Updated area #%d %q", id, req.Name))
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteArea(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	app.store.DeleteArea(id)
	app.audit(user.ID, user.DisplayName, "deleted", "area_of_responsibility", id,
		fmt.Sprintf("Deleted area #%d", id))
	jsonOK(w, map[string]string{"status": "ok"})
}
