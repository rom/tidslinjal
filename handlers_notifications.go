package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// ── Personal Notification handlers ──────────────────────────────────────────

func (app *App) handleGetNotifications(w http.ResponseWriter, r *http.Request, user *User) {
	notifs := app.store.GetNotificationsForUser(user.ID, 50)
	if notifs == nil {
		notifs = []Notification{}
	}
	jsonOK(w, notifs)
}

func (app *App) handleAckNotification(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/personal-notifications/{id}/ack
	parts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
	if len(parts) < 2 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[len(parts)-2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	// If this is a PRC notification, also respond "ready" to the linked ready check
	notif, nErr := app.store.GetNotification(id)
	if nErr == nil && notif != nil && notif.Type == "prc" && notif.RefID != "" {
		prcID, parseErr := strconv.ParseInt(notif.RefID, 10, 64)
		if parseErr == nil {
			checks := app.store.GetPersonReadyChecks()
			for i := range checks {
				if checks[i].ID == prcID {
					for j := range checks[i].Participants {
						if checks[i].Participants[j].UserID == user.ID && checks[i].Participants[j].Status == "pending" {
							checks[i].Participants[j].Status = "ready"
							_ = app.store.UpdatePersonReadyCheck(checks[i])
							updatedData, _ := json.Marshal(checks[i])
							app.broker.BroadcastAll(SSEMessage{Event: "prc_update", Data: string(updatedData)})
							break
						}
					}
					break
				}
			}
		}
	}
	if err := app.store.AcknowledgeNotification(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

func (app *App) handleReadNotification(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/personal-notifications/{id}/read
	parts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
	if len(parts) < 2 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[len(parts)-2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.MarkNotificationRead(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}
