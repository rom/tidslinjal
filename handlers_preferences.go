package main

import (
	"fmt"
	"net/http"
)

// ── Preferences handlers ───────────────────────────────────────────────────────

func (app *App) handleGetPreferences(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetPreferences(user.ID))
}

func (app *App) handleSavePreferences(w http.ResponseWriter, r *http.Request, user *User) {
	oldPrefs := app.store.GetPreferences(user.ID)
	var p UserPreferences
	if err := decode(r, &p); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	p.UserID = user.ID
	if p.HiddenTypes == nil {
		p.HiddenTypes = []string{}
	}
	if p.ActiveLayers == nil {
		p.ActiveLayers = []int64{}
	}
	// Validate webhook URL: block private/loopback addresses (SSRF protection)
	if p.WebhookURL != "" {
		if err := validateWebhookURL(p.WebhookURL); err != nil {
			jsonError(w, "invalid webhook URL: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	if err := app.store.SavePreferences(p); err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	// Audit webhook/integration changes
	if p.WebhookURL != oldPrefs.WebhookURL {
		if p.WebhookURL == "" {
			app.audit(user.ID, user.DisplayName, "deleted", "integration", 0, "Webhook integration removed")
		} else if oldPrefs.WebhookURL == "" {
			app.audit(user.ID, user.DisplayName, "created", "integration", 0,
				fmt.Sprintf("Webhook integration configured: type=%s", p.WebhookType))
		} else {
			app.audit(user.ID, user.DisplayName, "updated", "integration", 0,
				fmt.Sprintf("Webhook integration updated: type=%s", p.WebhookType))
		}
	}
	logDebug("preferences saved: user=%s theme=%s lang=%s", user.Username, p.Theme, p.Language)
	jsonOK(w, p)
}
