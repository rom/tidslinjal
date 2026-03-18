package main

import (
	"fmt"
	"net/http"
	"strings"
)

// ── Connector config handlers ─────────────────────────────────────────────────

func (app *App) handleListConnectors(w http.ResponseWriter, r *http.Request, user *User) {
	configs := app.store.GetConnectorConfigs()
	if configs == nil {
		configs = []ConnectorConfig{}
	}
	jsonOK(w, configs)
}

func (app *App) handleSaveConnectorConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg ConnectorConfig
	if err := decode(r, &cfg); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if cfg.Name == "" {
		jsonError(w, "connector name required", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveConnectorConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "connector", EntityID: 0,
		Summary: fmt.Sprintf("Updated connector config: %s", cfg.Name),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Federated IdP handlers ─────────────────────────────────────────────────────

func (app *App) handleListFederatedIdPs(w http.ResponseWriter, r *http.Request, user *User) {
	idps := app.store.GetFederatedIdPs()
	if idps == nil {
		idps = []FederatedIdP{}
	}
	// Strip secrets before sending to frontend
	safe := make([]FederatedIdP, len(idps))
	copy(safe, idps)
	for i := range safe {
		safe[i].ClientSecret = ""
	}
	jsonOK(w, safe)
}

func (app *App) handleSaveFederatedIdP(w http.ResponseWriter, r *http.Request, user *User) {
	var idp FederatedIdP
	if err := decode(r, &idp); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if idp.ID == "" || idp.Name == "" {
		jsonError(w, "id and name required", http.StatusBadRequest)
		return
	}
	if idp.Protocol != "oidc" && idp.Protocol != "saml" {
		jsonError(w, "protocol must be oidc or saml", http.StatusBadRequest)
		return
	}
	// If no secret provided, preserve existing one
	if idp.ClientSecret == "" {
		existing := app.store.GetFederatedIdPs()
		for _, e := range existing {
			if e.ID == idp.ID {
				idp.ClientSecret = e.ClientSecret
				break
			}
		}
	}
	if err := app.store.SaveFederatedIdP(idp); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "updated", EntityType: "federated_idp", EntityID: 0,
		Summary: fmt.Sprintf("Updated federated IdP: %s (%s)", idp.Name, idp.Protocol),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteFederatedIdP(w http.ResponseWriter, r *http.Request, user *User) {
	id := strings.TrimPrefix(r.URL.Path, "/api/federation/idps/")
	if id == "" {
		jsonError(w, "id required", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteFederatedIdP(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.Username,
		Action: "deleted", EntityType: "federated_idp", EntityID: 0,
		Summary: fmt.Sprintf("Deleted federated IdP: %s", id),
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleListTrustRealms(w http.ResponseWriter, r *http.Request, user *User) {
	realms := app.store.GetTrustRealms()
	if realms == nil {
		realms = []TrustRealm{}
	}
	jsonOK(w, realms)
}

func (app *App) handleSaveTrustRealm(w http.ResponseWriter, r *http.Request, user *User) {
	var realm TrustRealm
	if err := decode(r, &realm); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if realm.ID == "" || realm.Name == "" {
		jsonError(w, "id and name required", http.StatusBadRequest)
		return
	}
	if err := app.store.SaveTrustRealm(realm); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}
