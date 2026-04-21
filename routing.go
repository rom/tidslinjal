package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ── Message Routing Engine ──────────────────────────────────────────────────
// Routes ingested events to users based on J-level, group membership,
// source, tags, priority, and content matching rules.

// RoutingRule defines a single routing rule that maps incoming messages
// to target users/groups based on conditions.
type RoutingRule struct {
	ID          int64    `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Enabled     bool     `json:"enabled"`
	Priority    int      `json:"priority"` // lower = evaluated first

	// Conditions (all must match for the rule to fire; empty = match all)
	SourceMatch   []string `json:"source_match,omitempty"`   // match on IngestPayload.Source
	TagMatch      []string `json:"tag_match,omitempty"`      // match if any tag present
	PriorityMatch []string `json:"priority_match,omitempty"` // low | medium | high | critical
	ContentMatch  string   `json:"content_match,omitempty"`  // substring match on title or description
	FormatMatch   []string `json:"format_match,omitempty"`   // stix | syslog | ical | adatp3 | json

	// Targets — who receives the routed event
	TargetJDesignations []string `json:"target_j_designations,omitempty"` // e.g. ["J2","J3","J6"]
	TargetGroupIDs      []int64  `json:"target_group_ids,omitempty"`
	TargetUserIDs       []int64  `json:"target_user_ids,omitempty"`
	TargetRoles         []string `json:"target_roles,omitempty"` // role keys

	// Actions
	AssignLayer     *int64 `json:"assign_layer,omitempty"`     // place event on this layer
	OverrideType    string `json:"override_type,omitempty"`    // override event type
	NotifyViaSSE    bool   `json:"notify_via_sse"`             // send SSE notification to targets
	NotifyViaWebhook bool  `json:"notify_via_webhook"`         // trigger webhook for targets

	CreatedBy int64     `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// routeIngestedMessage evaluates all routing rules against an ingested payload
// and applies matching rules to the created event.
func (app *App) routeIngestedMessage(payload IngestPayload, ev *Event) {
	rules := app.store.GetRoutingRules()
	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		if !ruleMatches(rule, payload) {
			continue
		}
		app.applyRoutingRule(rule, ev)
	}
}

// ruleMatches checks if a routing rule's conditions match the payload.
func ruleMatches(rule RoutingRule, p IngestPayload) bool {
	// Source match
	if len(rule.SourceMatch) > 0 && !containsCI(rule.SourceMatch, p.Source) {
		return false
	}
	// Tag match (any tag present)
	if len(rule.TagMatch) > 0 {
		found := false
		for _, rt := range rule.TagMatch {
			for _, pt := range p.Tags {
				if strings.EqualFold(rt, pt) {
					found = true
					break
				}
			}
			if found {
				break
			}
		}
		if !found {
			return false
		}
	}
	// Priority match
	if len(rule.PriorityMatch) > 0 && !containsCI(rule.PriorityMatch, p.Priority) {
		return false
	}
	// Content match (substring in title or description)
	if rule.ContentMatch != "" {
		lc := strings.ToLower(rule.ContentMatch)
		if !strings.Contains(strings.ToLower(p.Title), lc) &&
			!strings.Contains(strings.ToLower(p.Description), lc) {
			return false
		}
	}
	// Format match
	if len(rule.FormatMatch) > 0 && !containsCI(rule.FormatMatch, string(p.Format)) {
		return false
	}
	return true
}

// applyRoutingRule applies a matched routing rule to the event.
func (app *App) applyRoutingRule(rule RoutingRule, ev *Event) {
	// Override event type
	if rule.OverrideType != "" {
		ev.EventType = rule.OverrideType
		app.store.UpdateEvent(*ev)
	}

	// Assign to layer
	if rule.AssignLayer != nil {
		ev.LayerID = rule.AssignLayer
		app.store.UpdateEvent(*ev)
	}

	// Resolve target user IDs from J-designations and groups
	targetUserIDs := app.resolveRoutingTargets(rule)

	// Add as invited users on the event
	if len(targetUserIDs) > 0 {
		for _, uid := range targetUserIDs {
			if !containsInt64(ev.InvitedUserIDs, uid) {
				ev.InvitedUserIDs = append(ev.InvitedUserIDs, uid)
			}
		}
		app.store.UpdateEvent(*ev)
	}

	// Add invited group IDs
	if len(rule.TargetGroupIDs) > 0 {
		for _, gid := range rule.TargetGroupIDs {
			if !containsInt64(ev.InvitedGroupIDs, gid) {
				ev.InvitedGroupIDs = append(ev.InvitedGroupIDs, gid)
			}
		}
		app.store.UpdateEvent(*ev)
	}

	// SSE notifications to targeted users
	if rule.NotifyViaSSE && len(targetUserIDs) > 0 {
		for _, uid := range targetUserIDs {
			app.broker.Notify(uid, AlarmNotification{
				EventID:    ev.ID,
				EventTitle: ev.Title,
				EventTime:  ev.StartTime,
				Message:    fmt.Sprintf("Routed event: %s (rule: %s)", ev.Title, rule.Name),
				Kind:       "info",
			})
		}
	}

	log.Printf("[INFO] routing rule %q matched event %d, targets: %d users, %d groups",
		rule.Name, ev.ID, len(targetUserIDs), len(rule.TargetGroupIDs))
}

// resolveRoutingTargets resolves J-designations, groups, roles, and explicit user IDs
// into a deduplicated list of user IDs.
func (app *App) resolveRoutingTargets(rule RoutingRule) []int64 {
	seen := make(map[int64]bool)
	var result []int64

	addUser := func(uid int64) {
		if !seen[uid] {
			seen[uid] = true
			result = append(result, uid)
		}
	}

	// Explicit user IDs
	for _, uid := range rule.TargetUserIDs {
		addUser(uid)
	}

	// Users with matching J-designations
	if len(rule.TargetJDesignations) > 0 {
		users := app.store.GetUsers()
		for _, u := range users {
			for _, jd := range u.NATODesignations {
				if containsCI(rule.TargetJDesignations, jd) {
					addUser(u.ID)
					break
				}
			}
		}
	}

	// Users in target groups
	if len(rule.TargetGroupIDs) > 0 {
		for _, gid := range rule.TargetGroupIDs {
			members := app.store.GetGroupMembers(gid)
			for _, m := range members {
				addUser(m.UserID)
			}
		}
	}

	// Users with target roles
	if len(rule.TargetRoles) > 0 {
		users := app.store.GetUsers()
		for _, u := range users {
			if containsCI(rule.TargetRoles, string(u.Role)) {
				addUser(u.ID)
			}
		}
	}

	return result
}

// containsCI checks if a string slice contains a value (case-insensitive).
func containsCI(slice []string, val string) bool {
	lv := strings.ToLower(val)
	for _, s := range slice {
		if strings.ToLower(s) == lv {
			return true
		}
	}
	return false
}

// containsInt64 checks if an int64 slice contains a value.
func containsInt64(slice []int64, val int64) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

// ── HTTP Handlers for routing rules ─────────────────────────────────────────

// handleRoutingRules handles GET/POST /api/routing-rules
func (app *App) handleRoutingRules(w http.ResponseWriter, r *http.Request, user *User) {
	switch r.Method {
	case http.MethodGet:
		rules := app.store.GetRoutingRules()
		jsonOK(w, rules)
	case http.MethodPost:
		var rule RoutingRule
		if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
			jsonError(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		rule.CreatedBy = user.ID
		rule.CreatedAt = time.Now()
		rule.UpdatedAt = rule.CreatedAt
		created, err := app.store.CreateRoutingRule(rule)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "created", EntityType: "routing_rule", EntityID: created.ID,
			Summary: fmt.Sprintf("Created routing rule: %s", created.Name),
		})
		w.WriteHeader(http.StatusCreated)
		jsonOK(w, created)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleRoutingRule handles GET/PUT/DELETE /api/routing-rules/{id}
func (app *App) handleRoutingRule(w http.ResponseWriter, r *http.Request, user *User) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/routing-rules/")
	if idStr == "" {
		jsonError(w, "Missing rule ID", http.StatusBadRequest)
		return
	}
	var id int64
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		jsonError(w, "Invalid rule ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rule, ok := app.store.GetRoutingRule(id)
		if !ok {
			jsonError(w, "Rule not found", http.StatusNotFound)
			return
		}
		jsonOK(w, rule)

	case http.MethodPut:
		var rule RoutingRule
		if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
			jsonError(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		rule.ID = id
		rule.UpdatedAt = time.Now()
		updated, err := app.store.UpdateRoutingRule(rule)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "updated", EntityType: "routing_rule", EntityID: id,
			Summary: fmt.Sprintf("Updated routing rule: %s", updated.Name),
		})
		jsonOK(w, updated)

	case http.MethodDelete:
		if err := app.store.DeleteRoutingRule(id); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "deleted", EntityType: "routing_rule", EntityID: id,
			Summary: "Deleted routing rule",
		})
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
