package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (app *App) handleExport(w http.ResponseWriter, r *http.Request, user *User) {
	isPrivileged := app.effectiveHasRole(user, RoleOpLead)
	include := r.URL.Query().Get("include")
	if include == "" {
		include = "events,groups,layers,alarms,phases,event_types,comments,day_labels"
		if isPrivileged {
			include += ",users,decision_log,role_configs"
		}
	}
	data := app.store.GetExportDataFiltered(user.ID, isPrivileged, parseCommaSet(include))
	format := r.URL.Query().Get("format")
	ts := time.Now().Format("2006-01-02T150405")

	app.audit(user.ID, user.DisplayName, "exported", "data", 0,
		fmt.Sprintf("Exported %s data (include=%s)", format, include))

	switch format {
	case "xml":
		w.Header().Set("Content-Type", "application/xml")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.xml"`, ts))
		w.Write([]byte(xml.Header))
		enc := xml.NewEncoder(w)
		enc.Indent("", "  ")
		enc.Encode(data) //nolint
	case "kml":
		w.Header().Set("Content-Type", "application/vnd.google-earth.kml+xml")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.kml"`, ts))
		writeKMLExport(w, data)
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.json"`, ts))
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		enc.Encode(data) //nolint
	}
}

// writeKMLExport generates a KML file from export data. Events with coordinates
// become Placemarks; events without coordinates are included as description-only.
func writeKMLExport(w http.ResponseWriter, data ExportData) {
	esc := func(s string) string {
		s = strings.ReplaceAll(s, "&", "&amp;")
		s = strings.ReplaceAll(s, "<", "&lt;")
		s = strings.ReplaceAll(s, ">", "&gt;")
		return s
	}
	w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>` + "\n"))
	w.Write([]byte(`<kml xmlns="http://www.opengis.net/kml/2.2">` + "\n"))
	w.Write([]byte(`<Document>` + "\n"))
	w.Write([]byte(fmt.Sprintf("  <name>Tidslinjal Export %s</name>\n", esc(data.ExportAt.Format("2006-01-02")))))
	for _, ev := range data.Events {
		w.Write([]byte("  <Placemark>\n"))
		w.Write([]byte(fmt.Sprintf("    <name>%s</name>\n", esc(ev.Title))))
		desc := ev.Description
		if ev.StartTime != (time.Time{}) {
			desc += "\nStart: " + ev.StartTime.Format(time.RFC3339)
		}
		if ev.EndTime != nil {
			desc += "\nEnd: " + ev.EndTime.Format(time.RFC3339)
		}
		w.Write([]byte(fmt.Sprintf("    <description>%s</description>\n", esc(desc))))
		if ev.StartTime != (time.Time{}) {
			w.Write([]byte(fmt.Sprintf("    <TimeStamp><when>%s</when></TimeStamp>\n", ev.StartTime.Format(time.RFC3339))))
		}
		if ev.Latitude != nil && ev.Longitude != nil {
			w.Write([]byte(fmt.Sprintf("    <Point><coordinates>%f,%f,0</coordinates></Point>\n", *ev.Longitude, *ev.Latitude)))
		}
		w.Write([]byte("  </Placemark>\n"))
	}
	w.Write([]byte("</Document>\n</kml>\n"))
}

func (app *App) handleImport(w http.ResponseWriter, r *http.Request, user *User) {
	isPrivileged := app.effectiveHasRole(user, RoleOpLead)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		jsonError(w, "failed to parse form (max 20MB)", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("data")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()
	var data ExportData
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		jsonError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	include := r.FormValue("include")
	if include == "" {
		include = "events,groups,layers,alarms,day_labels"
	}
	reassign := r.FormValue("reassign") == "true"
	result := app.store.ImportData(data, user.ID, user.DisplayName, isPrivileged, reassign, parseCommaSet(include))
	app.audit(user.ID, user.DisplayName, "imported", "data", 0,
		fmt.Sprintf("Imported groups=%d layers=%d events=%d alarms=%d users=%d skipped=%d",
			result.Groups, result.Layers, result.Events, result.Alarms, result.Users, result.Skipped))
	jsonOK(w, result)
}

// ── User members (groups for a user) ─────────────────────────────────────────

func (app *App) handleGetUserGroups(w http.ResponseWriter, r *http.Request, user *User) {
	// Path is /api/users/{id}/groups — extract user ID from segment index 2.
	// pathID would return the last segment ("groups"), which is wrong.
	seg := pathSegment(r, 2)
	id, err := strconv.ParseInt(seg, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	memberships := app.store.GetUserGroups(id)
	if memberships == nil {
		memberships = []GroupMembership{}
	}
	jsonOK(w, memberships)
}
