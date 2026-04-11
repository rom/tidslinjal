package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// ── Group handlers ─────────────────────────────────────────────────────────────

func (app *App) handleGetGroups(w http.ResponseWriter, r *http.Request, user *User) {
	var groups []Group
	// ?all=true allows team leads and above to see all groups (for board sharing, etc.)
	showAll := r.URL.Query().Get("all") == "true" && app.effectiveHasRole(user, RoleTeamLead)
	if app.effectiveHasRole(user, RoleAdmin) || showAll {
		groups = app.store.GetGroups()
	} else {
		// Non-admins see only groups they're members of
		memberships := app.store.GetUserGroups(user.ID)
		for _, m := range memberships {
			if g, ok := app.store.GetGroupByID(m.GroupID); ok {
				groups = append(groups, *g)
			}
		}
	}
	if groups == nil {
		groups = []Group{}
	}
	// Enrich with member counts and creator info
	type groupWithCount struct {
		Group
		MemberCount int    `json:"member_count"`
		CreatedByName string `json:"created_by_name,omitempty"`
	}
	enriched := make([]groupWithCount, len(groups))
	for i, g := range groups {
		gwc := groupWithCount{
			Group:       g,
			MemberCount: len(app.store.GetGroupMembers(g.ID)),
		}
		if g.CreatedBy == 0 {
			gwc.CreatedByName = "System (SSO/auto)"
		} else if u, ok := app.store.GetUserByID(g.CreatedBy); ok {
			gwc.CreatedByName = u.DisplayName
		}
		enriched[i] = gwc
	}
	jsonOK(w, enriched)
}

func (app *App) handleCreateGroup(w http.ResponseWriter, r *http.Request, user *User) {
	var g Group
	if err := decode(r, &g); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if g.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	// H-05 fix: sanitize group name/description to prevent stored XSS
	g.Name = stripHTMLTags(g.Name)
	g.Description = stripHTMLTags(g.Description)
	g.CreatedBy = user.ID
	created, err := app.store.CreateGroup(g)
	if err != nil {
		jsonError(w, "failed to create group", http.StatusInternalServerError)
		return
	}
	// Auto-add creator as admin
	app.store.AddGroupMember(GroupMembership{GroupID: created.ID, UserID: user.ID, Role: "admin"}) //nolint
	// Auto-create a layer with the same name, or add group to existing layer
	existingLayer := app.findLayerByName(created.Name)
	if existingLayer != nil {
		// Layer already exists — add the new group to it
		existingLayer.GroupIDs = append(existingLayer.GroupIDs, created.ID)
		if existingLayer.Visibility == "private" {
			existingLayer.Visibility = "groups"
		}
		if existingLayer.Permission == "read" {
			existingLayer.Permission = "readwrite"
		}
		app.store.UpdateLayer(*existingLayer) //nolint
	} else {
		autoLayer := Layer{
			Name:        created.Name,
			Description: created.Description,
			Color:       "#4A90D9",
			OwnerID:     user.ID,
			OwnerName:   user.DisplayName,
			Visibility:  "groups",
			GroupIDs:    []int64{created.ID},
			Permission:  "readwrite",
		}
		app.store.CreateLayer(autoLayer) //nolint
	}
	w.WriteHeader(http.StatusCreated)
	logDebug("group created: id=%d name=%q user=%s", created.ID, created.Name, user.Username)
	jsonOK(w, created)
}

func (app *App) handleUpdateGroup(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, ok := app.store.GetGroupByID(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if existing.CreatedBy != user.ID && !app.effectiveHasRole(user, RoleAdmin) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var g Group
	if err := decode(r, &g); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// H-05 fix: sanitize group name/description to prevent stored XSS
	g.Name = stripHTMLTags(g.Name)
	g.Description = stripHTMLTags(g.Description)
	g.ID = id
	g.CreatedBy = existing.CreatedBy
	g.CreatedAt = existing.CreatedAt
	if err := app.store.UpdateGroup(g); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetGroupByID(id)
	jsonOK(w, updated)
}

func (app *App) handleDeleteGroup(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	grp, grpOK := app.store.GetGroupByID(id)
	if err := app.store.DeleteGroup(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if grpOK {
		app.audit(user.ID, user.DisplayName, "deleted", "group", id,
			fmt.Sprintf("Deleted group %q", grp.Name))
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func (app *App) handleGetGroupMembers(w http.ResponseWriter, r *http.Request, user *User) {
	// /api/groups/:id/members
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	groupID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid group id", http.StatusBadRequest)
		return
	}
	members := app.store.GetGroupMembers(groupID)
	type MemberView struct {
		GroupMembership
		DisplayName string `json:"display_name"`
		Username    string `json:"username"`
	}
	var result []MemberView
	for _, m := range members {
		mv := MemberView{GroupMembership: m}
		if u, ok := app.store.GetUserByID(m.UserID); ok {
			mv.DisplayName = u.DisplayName
			mv.Username = u.Username
		}
		result = append(result, mv)
	}
	if result == nil {
		result = []MemberView{}
	}
	jsonOK(w, result)
}

func (app *App) handleAddGroupMember(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	groupID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid group id", http.StatusBadRequest)
		return
	}
	var req struct {
		UserID int64  `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "member"
	}
	// V-36 fix: verify group and user exist before adding membership
	if _, ok := app.store.GetGroupByID(groupID); !ok {
		jsonError(w, "group not found", http.StatusNotFound)
		return
	}
	if _, ok := app.store.GetUserByID(req.UserID); !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	if err := app.store.AddGroupMember(GroupMembership{GroupID: groupID, UserID: req.UserID, Role: req.Role}); err != nil {
		jsonError(w, "failed to add member", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "added"})
}

func (app *App) handleRemoveGroupMember(w http.ResponseWriter, r *http.Request, user *User) {
	// /api/groups/:id/members/:uid
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	groupID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid group id", http.StatusBadRequest)
		return
	}
	userID, err := strconv.ParseInt(parts[4], 10, 64)
	if err != nil {
		jsonError(w, "invalid user id", http.StatusBadRequest)
		return
	}
	// V-37 fix: verify group exists before removing member
	if _, ok := app.store.GetGroupByID(groupID); !ok {
		jsonError(w, "group not found", http.StatusNotFound)
		return
	}
	app.store.RemoveGroupMember(groupID, userID) //nolint
	jsonOK(w, map[string]string{"status": "removed"})
}
