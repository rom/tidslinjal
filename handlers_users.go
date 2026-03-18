package main

import (
	"fmt"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

// ── User management handlers ───────────────────────────────────────────────────

func (app *App) handleGetUsers(w http.ResponseWriter, r *http.Request, user *User) {
	users := app.store.GetUsers()
	pub := make([]UserPublic, len(users))
	for i, u := range users {
		pub[i] = u.Public()
	}
	jsonOK(w, pub)
}

func (app *App) handleCreateUser(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Username         string   `json:"username"`
		Password         string   `json:"password"`
		DisplayName      string   `json:"display_name"`
		Email            string   `json:"email"`
		Role             Role     `json:"role"`
		CanLock          bool     `json:"can_lock"`
		GroupIDs         []int64  `json:"group_ids"`
		NATODesignations []string `json:"nato_designations"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := validateUsername(req.Username); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		jsonError(w, "password is required", http.StatusBadRequest)
		return
	}
	if _, exists := app.store.GetUserByUsername(req.Username); exists {
		jsonError(w, "username already exists", http.StatusConflict)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	validRoles := map[Role]bool{
		RoleObserver: true, RoleRead: true, RoleReporter: true,
		RoleReadWrite: true, RoleTeamLead: true, RoleOpLead: true,
		RoleStaffOfficer: true, RoleStaffOfficerFull: true, RoleAdmin: true,
	}
	if req.Role == "" {
		req.Role = RoleRead
	} else if !validRoles[req.Role] {
		jsonError(w, "invalid role", http.StatusBadRequest)
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	// Admin-created users are always vetted
	created, err := app.store.CreateUser(User{
		Username: req.Username, PasswordHash: string(hash),
		DisplayName: req.DisplayName, Email: req.Email,
		Role: req.Role, CanLock: req.CanLock, Vetted: true,
		NATODesignations: req.NATODesignations,
	})
	if err != nil {
		jsonError(w, "failed to create user", http.StatusInternalServerError)
		return
	}
	// Add to groups if specified
	for _, gid := range req.GroupIDs {
		app.store.AddGroupMember(GroupMembership{GroupID: gid, UserID: created.ID, Role: "member"}) //nolint
	}
	app.audit(user.ID, user.DisplayName, "created", "user", created.ID,
		fmt.Sprintf("Created user %q (role: %s)", created.Username, created.Role))
	w.WriteHeader(http.StatusCreated)
	logVerbose("user created: id=%d username=%q role=%s by=%s", created.ID, created.Username, created.Role, user.Username)
	jsonOK(w, created.Public())
}

func (app *App) handleUpdateUser(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if !hasRole(user.Role, RoleAdmin) && user.ID != id {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	existing, ok := app.store.GetUserByID(id)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	var req struct {
		Password         string   `json:"password"`
		CurrentPassword  string   `json:"current_password"` // required when non-admin changes own password
		DisplayName      string   `json:"display_name"`
		Email            string   `json:"email"`
		Role             Role     `json:"role"`
		CanLock          bool     `json:"can_lock"`
		GroupIDs         []int64  `json:"group_ids"`    // nil = no change; [] = remove all; [...] = replace
		GroupIDsSet      bool     `json:"group_ids_set"` // true if caller passed group_ids field
		NATODesignations []string `json:"nato_designations"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Password != "" {
		// H-03 fix: enforce max length before bcrypt
		if len(req.Password) > 128 {
			jsonError(w, "password must not exceed 128 characters", http.StatusBadRequest)
			return
		}
		// H-08 fix: apply password quality policy if enabled
		if policy := app.store.GetSecuritySettings(); policy.PasswordPolicyEnabled {
			if err := validatePasswordQuality(req.Password, policy); err != nil {
				jsonError(w, err.Error(), http.StatusBadRequest)
				return
			}
		} else if len(req.Password) < 6 {
			jsonError(w, "password must be 6–128 characters", http.StatusBadRequest)
			return
		}
		// Non-admin users must verify their current password before changing it
		if !hasRole(user.Role, RoleAdmin) {
			if err := bcrypt.CompareHashAndPassword([]byte(existing.PasswordHash), []byte(req.CurrentPassword)); err != nil {
				jsonError(w, "current password incorrect", http.StatusUnauthorized)
				return
			}
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			jsonError(w, "internal error", http.StatusInternalServerError)
			return
		}
		existing.PasswordHash = string(hash)
		// Clear MustChangePassword flag on successful password change
		existing.MustChangePassword = false
		// H-07 fix: invalidate all existing sessions for this user after password change
		app.store.DeleteSessionsForUser(id)
	}
	if req.DisplayName != "" {
		existing.DisplayName = req.DisplayName
	}
	// V-22 fix: only update email if the request explicitly provided a value
	// (avoid wiping email when field is omitted from JSON)
	if req.Email != "" || hasRole(user.Role, RoleAdmin) {
		existing.Email = req.Email
	}
	if hasRole(user.Role, RoleAdmin) {
		if req.Role != "" {
			// V-12 fix: validate role against allowed whitelist (same as handleCreateUser)
			validRoles := map[Role]bool{
				RoleObserver: true, RoleRead: true, RoleReporter: true,
				RoleReadWrite: true, RoleTeamLead: true, RoleOpLead: true,
				RoleStaffOfficer: true, RoleStaffOfficerFull: true, RoleAdmin: true,
			}
			if !validRoles[req.Role] {
				jsonError(w, "invalid role", http.StatusBadRequest)
				return
			}
			existing.Role = req.Role
		}
		existing.CanLock = req.CanLock
		if req.NATODesignations != nil {
			existing.NATODesignations = req.NATODesignations
		}
		// Update group memberships if admin passed group_ids
		if req.GroupIDs != nil {
			// Remove all existing memberships for this user
			allGroups := app.store.GetGroups()
			for _, g := range allGroups {
				app.store.RemoveGroupMember(g.ID, id) //nolint
			}
			// Add new memberships
			for _, gid := range req.GroupIDs {
				app.store.AddGroupMember(GroupMembership{GroupID: gid, UserID: id, Role: "member"}) //nolint
			}
		}
	}
	if err := app.store.UpdateUser(*existing); err != nil {
		jsonError(w, "failed to update", http.StatusInternalServerError)
		return
	}
	updated, _ := app.store.GetUserByID(id)
	app.audit(user.ID, user.DisplayName, "updated", "user", id,
		fmt.Sprintf("Updated user %q (role: %s)", updated.Username, updated.Role))
	app.broadcastUserChange(user.ID, "updated", id)
	jsonOK(w, updated.Public())
}

func (app *App) handleDeleteUser(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if user.ID == id {
		jsonError(w, "cannot delete yourself", http.StatusBadRequest)
		return
	}
	target, targetOK := app.store.GetUserByID(id)
	if err := app.store.DeleteUser(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if targetOK {
		app.audit(user.ID, user.DisplayName, "deleted", "user", id,
			fmt.Sprintf("Deleted user %q", target.Username))
	}
	logVerbose("user deleted: id=%d by=%s", id, user.Username)
	jsonOK(w, map[string]string{"status": "deleted"})
}
