package main

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

// ── Update User Profile (handles + webcal token) ──────────────────────────────

func (app *App) handleUpdateProfile(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		MattermostHandle string `json:"mattermost_handle"`
		DiscordHandle    string `json:"discord_handle"`
		SignalHandle     string `json:"signal_handle"`
		Telephone        string `json:"telephone"`
		Cellular         string `json:"cellular"`
		Title            string `json:"title"`
		Rank             string `json:"rank"`
		JobRole          string `json:"job_role"`
		Expertise        string `json:"expertise"`
		PhotoDataURL     string  `json:"photo_data_url"` // base64 data URL
		GenerateWebCal   bool    `json:"generate_webcal"`
		Location         string  `json:"location"`
		Latitude         float64 `json:"latitude"`
		Longitude        float64 `json:"longitude"`
		Availability     string  `json:"availability"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Validate and limit photo data URL.
	if req.PhotoDataURL != "" {
		if len(req.PhotoDataURL) > 1_400_000 {
			jsonError(w, "photo too large (max ~1 MB)", http.StatusRequestEntityTooLarge)
			return
		}
		// Only accept image/* data URLs to prevent arbitrary content injection.
		if !strings.HasPrefix(req.PhotoDataURL, "data:image/jpeg;base64,") &&
			!strings.HasPrefix(req.PhotoDataURL, "data:image/png;base64,") &&
			!strings.HasPrefix(req.PhotoDataURL, "data:image/gif;base64,") &&
			!strings.HasPrefix(req.PhotoDataURL, "data:image/webp;base64,") {
			jsonError(w, "photo must be a JPEG, PNG, GIF, or WebP image", http.StatusBadRequest)
			return
		}
	}
	fullUser, ok := app.store.GetUserByID(user.ID)
	if !ok {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}
	// Sanitize text fields to prevent stored XSS — strip HTML tags
	fullUser.MattermostHandle = stripHTMLTags(req.MattermostHandle)
	fullUser.DiscordHandle = stripHTMLTags(req.DiscordHandle)
	fullUser.SignalHandle = stripHTMLTags(req.SignalHandle)
	fullUser.Telephone = stripHTMLTags(req.Telephone)
	fullUser.Cellular = stripHTMLTags(req.Cellular)
	fullUser.Title = stripHTMLTags(req.Title)
	fullUser.Rank = stripHTMLTags(req.Rank)
	fullUser.JobRole = stripHTMLTags(req.JobRole)
	fullUser.Expertise = stripHTMLTags(req.Expertise)
	fullUser.Location = stripHTMLTags(req.Location)
	fullUser.Latitude = req.Latitude
	fullUser.Longitude = req.Longitude
	if req.Availability == "free" || req.Availability == "busy" || req.Availability == "dnd" || req.Availability == "away" || req.Availability == "" {
		fullUser.Availability = req.Availability
	}
	if req.PhotoDataURL != "" {
		fullUser.PhotoDataURL = req.PhotoDataURL
	}
	if req.GenerateWebCal && fullUser.WebCalToken == "" {
		tokBytes := make([]byte, 16)
		if _, err := rand.Read(tokBytes); err != nil {
			jsonError(w, "internal error", http.StatusInternalServerError)
			return
		}
		fullUser.WebCalToken = hex.EncodeToString(tokBytes)
	}
	if err := app.store.UpdateUser(*fullUser); err != nil {
		jsonError(w, "failed to update profile", http.StatusInternalServerError)
		return
	}
	// Return public profile plus webcal_token (owner's own data)
	type profileResponse struct {
		UserPublic
		WebCalToken string `json:"webcal_token,omitempty"`
	}
	jsonOK(w, profileResponse{UserPublic: fullUser.Public(), WebCalToken: fullUser.WebCalToken})
}

// ── Cascade Reschedule ─────────────────────────────────────────────────────────

func (app *App) handleCascadeReschedule(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		EventID   int64         `json:"event_id"`
		ShiftMins int           `json:"shift_minutes"` // positive = forward, negative = backward
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.ShiftMins == 0 {
		jsonError(w, "shift_minutes must not be zero", http.StatusBadRequest)
		return
	}
	shift := time.Duration(req.ShiftMins) * time.Minute

	// Gather all events and find dependents (BFS/DFS cascade)
	allEvents := app.store.GetEventsInRange(time.Now().Add(-365*24*time.Hour), time.Now().Add(365*24*time.Hour))
	// Build dependency map: eventID -> list of events that depend on it
	dependents := map[int64][]Event{}
	for _, ev := range allEvents {
		for _, dep := range ev.DependsOn {
			dependents[dep] = append(dependents[dep], ev)
		}
	}

	// BFS
	visited := map[int64]bool{req.EventID: true}
	queue := []int64{req.EventID}
	updated := []Event{}
	skipped := 0

	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, dep := range dependents[cur] {
			if !visited[dep.ID] {
				visited[dep.ID] = true
				// V3-M04 fix: verify user has write access to each dependent event's layer
				if dep.LayerID != nil && !app.canWriteLayer(*dep.LayerID, user) {
					skipped++
					continue
				}
				dep.StartTime = dep.StartTime.Add(shift)
				if dep.EndTime != nil {
					t := dep.EndTime.Add(shift)
					dep.EndTime = &t
				}
				if err := app.store.UpdateEvent(dep); err == nil {
					updated = append(updated, dep)
					app.broadcastEventChange(user.ID, "updated", &dep)
				}
				queue = append(queue, dep.ID)
			}
		}
	}

	jsonOK(w, map[string]interface{}{
		"rescheduled": len(updated),
		"skipped":     skipped,
		"events":      updated,
	})
}
