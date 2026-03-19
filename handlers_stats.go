package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Analysis / Statistics handlers ────────────────────────────────────────────

// allEvents returns all events using a very wide time range.
// Deprecated: use visibleEvents(user) for layer-filtered results.
func (app *App) allEvents() []Event {
	far := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	farEnd := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	return app.store.GetEvents(far, farEnd, nil)
}

// visibleEvents returns all events visible to the given user, respecting layer access.
// V3-H02 fix: centralized filtered event access for stats/export handlers.
func (app *App) visibleEvents(user *User) []Event {
	all := app.allEvents()
	return filterVisibleEvents(all, app.visibleLayerSet(user))
}

func (app *App) handleStatsOverview(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	users := app.store.GetUsers()
	layers := app.store.GetAllLayers()
	decisions := app.store.GetDecisionLog()
	statusCounts := map[string]int{}
	typeCounts := map[string]int{}
	for _, e := range events {
		statusCounts[string(e.Status)]++
		typeCounts[string(e.EventType)]++
	}
	pendingDecisions := 0
	approvedDecisions := 0
	deniedDecisions := 0
	for _, d := range decisions {
		switch d.Status {
		case "requested":
			pendingDecisions++
		case "approved":
			approvedDecisions++
		case "rejected":
			deniedDecisions++
		}
	}
	jsonOK(w, map[string]any{
		"total_events":       len(events),
		"total_users":        len(users),
		"total_layers":       len(layers),
		"status_counts":      statusCounts,
		"type_counts":        typeCounts,
		"pending_decisions":  pendingDecisions,
		"approved_decisions": approvedDecisions,
		"denied_decisions":   deniedDecisions,
		"total_decisions":    len(decisions),
	})
}

func (app *App) handleStatsEventsTimeline(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	resolution := r.URL.Query().Get("resolution")
	if resolution == "" {
		resolution = "day"
	}
	buckets := map[string]int{}
	for _, e := range events {
		var key string
		switch resolution {
		case "hour":
			key = e.StartTime.Format("2006-01-02T15")
		case "week":
			y, wk := e.StartTime.ISOWeek()
			key = fmt.Sprintf("%d-W%02d", y, wk)
		default:
			key = e.StartTime.Format("2006-01-02")
		}
		buckets[key]++
	}
	jsonOK(w, buckets)
}

func (app *App) handleStatsEventsStatus(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	counts := map[string]int{}
	for _, e := range events {
		counts[string(e.Status)]++
	}
	jsonOK(w, counts)
}

func (app *App) handleStatsEventsType(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	counts := map[string]int{}
	for _, e := range events {
		counts[string(e.EventType)]++
	}
	jsonOK(w, counts)
}

func (app *App) handleStatsEventsHeatmap(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	// 7 days × 24 hours matrix
	heatmap := make([][]int, 7)
	for i := range heatmap {
		heatmap[i] = make([]int, 24)
	}
	for _, e := range events {
		dow := int(e.StartTime.Weekday())
		// Convert Sunday=0 to Monday=0 based
		dow = (dow + 6) % 7
		hour := e.StartTime.Hour()
		heatmap[dow][hour]++
	}
	jsonOK(w, map[string]any{
		"days":  []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"},
		"hours": 24,
		"data":  heatmap,
	})
}

func (app *App) handleStatsUsersWorkload(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	workload := map[string]map[string]int{}
	for _, e := range events {
		name := e.ResponsibleName
		if name == "" {
			name = "(unassigned)"
		}
		if workload[name] == nil {
			workload[name] = map[string]int{}
		}
		workload[name][string(e.Status)]++
		workload[name]["total"]++
	}
	jsonOK(w, workload)
}

func (app *App) handleStatsDecisions(w http.ResponseWriter, r *http.Request, user *User) {
	decisions := app.store.GetDecisionLog()
	byStatus := map[string]int{}
	byDay := map[string]int{}
	avgResponseMs := int64(0)
	responseCount := 0
	for _, d := range decisions {
		byStatus[d.Status]++
		byDay[d.Timestamp.Format("2006-01-02")]++
		if d.ReviewedAt != nil && d.RequestedAt != nil {
			diff := d.ReviewedAt.Sub(*d.RequestedAt).Milliseconds()
			avgResponseMs += diff
			responseCount++
		}
	}
	if responseCount > 0 {
		avgResponseMs /= int64(responseCount)
	}
	jsonOK(w, map[string]any{
		"by_status":              byStatus,
		"by_day":                 byDay,
		"average_response_ms":    avgResponseMs,
		"total":                  len(decisions),
	})
}

// ── Stats: Slip Histogram ───────────────────────────────────────────────────

func (app *App) handleStatsSlipHistogram(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	buckets := map[string]int{
		"on_time":       0,
		"early":         0,
		"late_5min":     0,
		"late_15min":    0,
		"late_30min":    0,
		"late_1h":       0,
		"late_2h_plus":  0,
	}
	var slips []float64
	for _, ev := range events {
		if ev.PlannedStart == nil {
			continue
		}
		slip := ev.StartTime.Sub(*ev.PlannedStart).Minutes()
		slips = append(slips, slip)
		switch {
		case slip < -0.5:
			buckets["early"]++
		case slip <= 0.5:
			buckets["on_time"]++
		case slip <= 5:
			buckets["late_5min"]++
		case slip <= 15:
			buckets["late_15min"]++
		case slip <= 30:
			buckets["late_30min"]++
		case slip <= 60:
			buckets["late_1h"]++
		default:
			buckets["late_2h_plus"]++
		}
	}

	meanSlip := 0.0
	medianSlip := 0.0
	if len(slips) > 0 {
		total := 0.0
		for _, s := range slips {
			total += s
		}
		meanSlip = total / float64(len(slips))
		sort.Float64s(slips)
		mid := len(slips) / 2
		if len(slips)%2 == 0 {
			medianSlip = (slips[mid-1] + slips[mid]) / 2
		} else {
			medianSlip = slips[mid]
		}
	}
	jsonOK(w, map[string]any{
		"buckets":              buckets,
		"mean_slip_minutes":    meanSlip,
		"median_slip_minutes":  medianSlip,
	})
}

// ── Stats: Operational Tempo ────────────────────────────────────────────────

func (app *App) handleStatsOpTempo(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	now := time.Now()
	cutoff := now.Add(-24 * time.Hour)

	eventsPerHour := make(map[string]int)
	for h := 0; h < 24; h++ {
		eventsPerHour[fmt.Sprintf("%02d", h)] = 0
	}

	var dayEvents []Event
	for _, ev := range events {
		if ev.StartTime.After(cutoff) {
			hour := ev.StartTime.Format("15")
			eventsPerHour[hour]++
			dayEvents = append(dayEvents, ev)
		}
	}

	// Concurrent peak: find maximum overlapping events
	type point struct {
		t     time.Time
		delta int
	}
	var points []point
	for _, ev := range events {
		points = append(points, point{ev.StartTime, 1})
		if ev.EndTime != nil {
			points = append(points, point{*ev.EndTime, -1})
		} else {
			points = append(points, point{ev.StartTime.Add(time.Hour), -1})
		}
	}
	sort.Slice(points, func(i, j int) bool { return points[i].t.Before(points[j].t) })
	concurrentPeak := 0
	running := 0
	for _, p := range points {
		running += p.delta
		if running > concurrentPeak {
			concurrentPeak = running
		}
	}

	// Average events per day
	avgPerDay := 0.0
	if len(events) > 0 {
		earliest := events[0].StartTime
		for _, ev := range events {
			if ev.StartTime.Before(earliest) {
				earliest = ev.StartTime
			}
		}
		days := now.Sub(earliest).Hours() / 24
		if days < 1 {
			days = 1
		}
		avgPerDay = float64(len(events)) / days
	}

	jsonOK(w, map[string]any{
		"events_per_hour":  eventsPerHour,
		"concurrent_peak":  concurrentPeak,
		"avg_events_per_day": avgPerDay,
	})
}

// ── Stats: Decision Analytics ───────────────────────────────────────────────

func (app *App) handleStatsDecisionAnalytics(w http.ResponseWriter, r *http.Request, user *User) {
	decisions := app.store.GetDecisionLog()

	decisionsPerDay := make(map[string]int)
	decisionsByType := map[string]int{"requested": 0, "approved": 0, "rejected": 0, "direct": 0}
	var approvalTimes, denialTimes []float64
	requesterCounts := make(map[string]int)
	deciderCounts := make(map[string]int)

	for _, d := range decisions {
		day := d.Timestamp.Format("2006-01-02")
		decisionsPerDay[day]++

		switch d.Status {
		case "requested":
			decisionsByType["requested"]++
		case "approved":
			decisionsByType["approved"]++
			if d.ReviewedAt != nil && d.RequestedAt != nil {
				approvalTimes = append(approvalTimes, d.ReviewedAt.Sub(*d.RequestedAt).Minutes())
			}
		case "rejected":
			decisionsByType["rejected"]++
			if d.ReviewedAt != nil && d.RequestedAt != nil {
				denialTimes = append(denialTimes, d.ReviewedAt.Sub(*d.RequestedAt).Minutes())
			}
		default:
			decisionsByType["direct"]++
		}

		if d.UserName != "" {
			requesterCounts[d.UserName]++
		}
		if d.ReviewedByName != "" {
			deciderCounts[d.ReviewedByName]++
		}
	}

	avgApproval := 0.0
	if len(approvalTimes) > 0 {
		total := 0.0
		for _, t := range approvalTimes {
			total += t
		}
		avgApproval = total / float64(len(approvalTimes))
	}
	avgDenial := 0.0
	if len(denialTimes) > 0 {
		total := 0.0
		for _, t := range denialTimes {
			total += t
		}
		avgDenial = total / float64(len(denialTimes))
	}

	type nameCount struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	topRequesters := topN(requesterCounts, 5)
	topDeciders := topN(deciderCounts, 5)

	jsonOK(w, map[string]any{
		"decisions_per_day":        decisionsPerDay,
		"decisions_by_type":        decisionsByType,
		"avg_approval_time_minutes": avgApproval,
		"avg_denial_time_minutes":   avgDenial,
		"top_requesters":           topRequesters,
		"top_deciders":             topDeciders,
	})
}

// ── Stats: Dependency Graph ─────────────────────────────────────────────────

func (app *App) handleStatsDependencyGraph(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)

	type node struct {
		ID        int64     `json:"id"`
		Title     string    `json:"title"`
		Status    string    `json:"status"`
		Type      string    `json:"type"`
		StartTime time.Time `json:"start_time"`
	}
	type edge struct {
		From int64 `json:"from"`
		To   int64 `json:"to"`
	}

	var nodes []node
	var edges []edge
	eventMap := make(map[int64]Event)

	for _, ev := range events {
		eventMap[ev.ID] = ev
		nodes = append(nodes, node{
			ID:        ev.ID,
			Title:     ev.Title,
			Status:    string(ev.Status),
			Type:      string(ev.EventType),
			StartTime: ev.StartTime,
		})
		for _, depID := range ev.DependsOn {
			edges = append(edges, edge{From: depID, To: ev.ID})
		}
	}

	// Find critical path (longest chain via DFS)
	// Build adjacency list
	adj := make(map[int64][]int64)
	for _, e := range edges {
		adj[e.From] = append(adj[e.From], e.To)
	}

	// DFS for longest path from each node
	memo := make(map[int64][]int64)
	var longestFrom func(id int64) []int64
	longestFrom = func(id int64) []int64 {
		if cached, ok := memo[id]; ok {
			return cached
		}
		best := []int64{id}
		for _, next := range adj[id] {
			candidate := longestFrom(next)
			if len(candidate)+1 > len(best) {
				path := make([]int64, 0, len(candidate)+1)
				path = append(path, id)
				path = append(path, candidate...)
				best = path
			}
		}
		memo[id] = best
		return best
	}

	var criticalPath []int64
	for id := range eventMap {
		path := longestFrom(id)
		if len(path) > len(criticalPath) {
			criticalPath = path
		}
	}

	jsonOK(w, map[string]any{
		"nodes":         nodes,
		"edges":         edges,
		"critical_path": criticalPath,
	})
}

// ── Stats: Export ────────────────────────────────────────────────────────────

func (app *App) handleStatsExport(w http.ResponseWriter, r *http.Request, user *User) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	events := app.visibleEvents(user)
	decisions := app.store.GetDecisionLog()
	layers := app.store.GetAllLayers()

	data := map[string]any{
		"events":    events,
		"decisions": decisions,
		"layers":    layers,
		"exported_at": time.Now().Format(time.RFC3339),
	}

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=stats_export.csv")
		fmt.Fprintf(w, "id,title,status,event_type,start_time,end_time\n")
		for _, ev := range events {
			endStr := ""
			if ev.EndTime != nil {
				endStr = ev.EndTime.Format(time.RFC3339)
			}
			fmt.Fprintf(w, "%d,%q,%s,%s,%s,%s\n", ev.ID, ev.Title, ev.Status, ev.EventType, ev.StartTime.Format(time.RFC3339), endStr)
		}
	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=stats_export.json")
		json.NewEncoder(w).Encode(data)
	case "xml":
		w.Header().Set("Content-Type", "application/xml")
		w.Header().Set("Content-Disposition", "attachment; filename=stats_export.xml")
		fmt.Fprintf(w, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<export exported_at=\"%s\">\n<events>\n", time.Now().Format(time.RFC3339))
		for _, ev := range events {
			endStr := ""
			if ev.EndTime != nil {
				endStr = ev.EndTime.Format(time.RFC3339)
			}
			fmt.Fprintf(w, "  <event id=\"%d\" title=\"%s\" status=\"%s\" type=\"%s\" start=\"%s\" end=\"%s\"/>\n",
				ev.ID, xmlEsc(ev.Title), ev.Status, ev.EventType, ev.StartTime.Format(time.RFC3339), endStr)
		}
		fmt.Fprintf(w, "</events>\n<decisions>\n")
		for _, d := range decisions {
			fmt.Fprintf(w, "  <decision id=\"%d\" title=\"%s\" status=\"%s\" user=\"%s\"/>\n",
				d.ID, xmlEsc(d.Title), d.Status, xmlEsc(d.DisplayName))
		}
		fmt.Fprintf(w, "</decisions>\n</export>\n")
	case "txt":
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Disposition", "attachment; filename=stats_export.txt")
		fmt.Fprintf(w, "TIDSLINJAL ANALYSIS EXPORT\nExported: %s\n\n", time.Now().Format(time.RFC3339))
		fmt.Fprintf(w, "=== EVENTS (%d) ===\n", len(events))
		for _, ev := range events {
			endStr := ""
			if ev.EndTime != nil {
				endStr = ev.EndTime.Format(time.RFC3339)
			}
			fmt.Fprintf(w, "[%d] %s | Status: %s | Type: %s | Start: %s | End: %s\n",
				ev.ID, ev.Title, ev.Status, ev.EventType, ev.StartTime.Format(time.RFC3339), endStr)
		}
		fmt.Fprintf(w, "\n=== DECISIONS (%d) ===\n", len(decisions))
		for _, d := range decisions {
			fmt.Fprintf(w, "[%d] %s | Status: %s | User: %s\n",
				d.ID, d.Title, d.Status, d.DisplayName)
		}
	default:
		// xlsx not implemented server-side, fall back to JSON
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=stats_export.json")
		json.NewEncoder(w).Encode(data)
	}
}

// ── Stats: Leadership Dashboard ─────────────────────────────────────────────

func (app *App) handleStatsLeadershipDashboard(w http.ResponseWriter, r *http.Request, user *User) {
	now := time.Now()
	events := app.visibleEvents(user)
	decisions := app.store.GetDecisionLog()
	phases := app.store.GetPhases()
	layers := app.store.GetAllLayers()
	groups := app.store.GetGroups()
	users := app.store.GetUsers()
	readyChecks := app.store.GetPersonReadyChecks()
	logbook := app.store.GetLogBook()
	locks := app.store.GetLocks()
	alarms := app.store.GetActiveAlarms()
	auditEntries := app.store.GetAudit(500)

	// Build event map for dependency lookups
	eventMap := make(map[int64]Event, len(events))
	for _, ev := range events {
		eventMap[ev.ID] = ev
	}

	// Build layer name map
	layerNames := make(map[int64]string, len(layers))
	for _, l := range layers {
		layerNames[l.ID] = l.Name
	}

	// ── 1. Tempo ────────────────────────────────────────────────────────────
	eventsLast1h, eventsLast4h, eventsLast24h := 0, 0, 0
	eventsPrev4h := 0
	concurrentActive := 0
	cutoff1h := now.Add(-1 * time.Hour)
	cutoff4h := now.Add(-4 * time.Hour)
	cutoff8h := now.Add(-8 * time.Hour)
	cutoff24h := now.Add(-24 * time.Hour)

	for _, ev := range events {
		if ev.StartTime.After(cutoff1h) {
			eventsLast1h++
		}
		if ev.StartTime.After(cutoff4h) {
			eventsLast4h++
		}
		if ev.StartTime.After(cutoff24h) {
			eventsLast24h++
		}
		if ev.StartTime.After(cutoff8h) && !ev.StartTime.After(cutoff4h) {
			eventsPrev4h++
		}
		if ev.Status == "active" {
			concurrentActive++
		}
	}
	tempoTrend := "steady"
	if eventsLast4h > eventsPrev4h+2 {
		tempoTrend = "accelerating"
	} else if eventsLast4h < eventsPrev4h-2 {
		tempoTrend = "decelerating"
	}
	tempo := map[string]any{
		"events_last_hour": eventsLast1h,
		"events_last_4h":   eventsLast4h,
		"events_last_24h":  eventsLast24h,
		"tempo_trend":      tempoTrend,
		"concurrent_active": concurrentActive,
	}

	// ── 2. Readiness ────────────────────────────────────────────────────────
	totalChecks := len(readyChecks)
	avgResponseRate := 0.0
	latestCheckReadiness := 0.0
	if totalChecks > 0 {
		sumRate := 0.0
		for _, rc := range readyChecks {
			total := len(rc.Participants)
			if total == 0 {
				continue
			}
			responded := 0
			for _, p := range rc.Participants {
				if p.Status != "pending" {
					responded++
				}
			}
			sumRate += float64(responded) / float64(total) * 100.0
		}
		avgResponseRate = sumRate / float64(totalChecks)

		// Latest check (by CreatedAt)
		latest := readyChecks[0]
		for _, rc := range readyChecks[1:] {
			if rc.CreatedAt.After(latest.CreatedAt) {
				latest = rc
			}
		}
		if len(latest.Participants) > 0 {
			readyCount := 0
			for _, p := range latest.Participants {
				if p.Status == "ready" {
					readyCount++
				}
			}
			latestCheckReadiness = float64(readyCount) / float64(len(latest.Participants)) * 100.0
		}
	}
	readiness := map[string]any{
		"total_checks":           totalChecks,
		"avg_response_rate":      math.Round(avgResponseRate*100) / 100,
		"latest_check_readiness": math.Round(latestCheckReadiness*100) / 100,
	}

	// ── 3. Progress ─────────────────────────────────────────────────────────
	totalEvents := len(events)
	completedCount := 0
	eventsByStatus := make(map[string]int)
	for _, ev := range events {
		eventsByStatus[string(ev.Status)]++
		if ev.Status == "completed" || ev.Status == "verified" {
			completedCount++
		}
	}
	completionRate := 0.0
	if totalEvents > 0 {
		completionRate = float64(completedCount) / float64(totalEvents) * 100.0
	}

	// By phase
	type phaseProgress struct {
		Name           string  `json:"name"`
		TotalEvents    int     `json:"total_events"`
		CompletedCount int     `json:"completed_count"`
		CompletionRate float64 `json:"completion_rate"`
	}
	var byPhase []phaseProgress
	for _, ph := range phases {
		phTotal, phCompleted := 0, 0
		for _, ev := range events {
			if !ev.StartTime.Before(ph.StartTime) && ev.StartTime.Before(ph.EndTime) {
				phTotal++
				if ev.Status == "completed" || ev.Status == "verified" {
					phCompleted++
				}
			}
		}
		rate := 0.0
		if phTotal > 0 {
			rate = float64(phCompleted) / float64(phTotal) * 100.0
		}
		byPhase = append(byPhase, phaseProgress{
			Name:           ph.Name,
			TotalEvents:    phTotal,
			CompletedCount: phCompleted,
			CompletionRate: math.Round(rate*100) / 100,
		})
	}

	progress := map[string]any{
		"total_events":    totalEvents,
		"completed_count": completedCount,
		"completion_rate": math.Round(completionRate*100) / 100,
		"by_phase":        byPhase,
		"events_by_status": eventsByStatus,
	}

	// ── 4. Delay ────────────────────────────────────────────────────────────
	var slips []float64
	type criticalDelay struct {
		ID          int64   `json:"id"`
		Title       string  `json:"title"`
		SlipMinutes float64 `json:"slip_minutes"`
	}
	var allDelays []criticalDelay
	for _, ev := range events {
		if ev.PlannedStart == nil {
			continue
		}
		slip := ev.StartTime.Sub(*ev.PlannedStart).Minutes()
		slips = append(slips, slip)
		allDelays = append(allDelays, criticalDelay{ID: ev.ID, Title: ev.Title, SlipMinutes: math.Round(slip*100) / 100})
	}

	meanSlip, medianSlip, maxSlip := 0.0, 0.0, 0.0
	delayedCount := 0
	delayedRate := 0.0
	if len(slips) > 0 {
		total := 0.0
		for _, s := range slips {
			total += s
			if s > maxSlip {
				maxSlip = s
			}
			if s > 5 {
				delayedCount++
			}
		}
		meanSlip = total / float64(len(slips))
		sort.Float64s(slips)
		mid := len(slips) / 2
		if len(slips)%2 == 0 {
			medianSlip = (slips[mid-1] + slips[mid]) / 2
		} else {
			medianSlip = slips[mid]
		}
		delayedRate = float64(delayedCount) / float64(len(slips))
	}

	// Top 5 most delayed
	sort.Slice(allDelays, func(i, j int) bool {
		return allDelays[i].SlipMinutes > allDelays[j].SlipMinutes
	})
	criticalDelays := allDelays
	if len(criticalDelays) > 5 {
		criticalDelays = criticalDelays[:5]
	}

	delay := map[string]any{
		"mean_slip_minutes":   math.Round(meanSlip*100) / 100,
		"median_slip_minutes": math.Round(medianSlip*100) / 100,
		"max_slip_minutes":    math.Round(maxSlip*100) / 100,
		"delayed_count":       delayedCount,
		"delayed_rate":        math.Round(delayedRate*10000) / 10000,
		"critical_delays":     criticalDelays,
	}

	// ── 5. Bottlenecks ──────────────────────────────────────────────────────
	// Overloaded users: users with >5 active/planned events
	userEventCount := make(map[int64]int)
	userNames := make(map[int64]string)
	for _, u := range users {
		userNames[u.ID] = u.DisplayName
	}
	for _, ev := range events {
		if ev.Status == "active" || ev.Status == "planned" {
			if ev.ResponsibleID != nil {
				userEventCount[*ev.ResponsibleID]++
			}
		}
	}
	type overloadedUser struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	var overloadedUsers []overloadedUser
	for uid, count := range userEventCount {
		if count > 5 {
			overloadedUsers = append(overloadedUsers, overloadedUser{Name: userNames[uid], Count: count})
		}
	}
	sort.Slice(overloadedUsers, func(i, j int) bool {
		return overloadedUsers[i].Count > overloadedUsers[j].Count
	})

	// Blocked events: events whose DependsOn includes a non-completed event
	type blockedEvent struct {
		ID             int64  `json:"id"`
		Title          string `json:"title"`
		BlockedByTitle string `json:"blocked_by_title"`
	}
	var blockedEvents []blockedEvent
	for _, ev := range events {
		for _, depID := range ev.DependsOn {
			dep, ok := eventMap[depID]
			if ok && dep.Status != "completed" && dep.Status != "verified" {
				blockedEvents = append(blockedEvents, blockedEvent{
					ID:             ev.ID,
					Title:          ev.Title,
					BlockedByTitle: dep.Title,
				})
				break
			}
		}
	}

	// Unacknowledged alarms
	unacknowledgedAlarms := 0
	for _, a := range alarms {
		if a.AcknowledgedAt == nil {
			unacknowledgedAlarms++
		}
	}

	// Pending decisions
	pendingDecisions := 0
	for _, d := range decisions {
		if d.Status == "requested" {
			pendingDecisions++
		}
	}

	// Stale events: active for more than 2 hours
	type staleEvent struct {
		ID      int64   `json:"id"`
		Title   string  `json:"title"`
		ActiveH float64 `json:"active_hours"`
	}
	var staleEvents []staleEvent
	for _, ev := range events {
		if ev.Status == "active" && now.Sub(ev.StartTime) > 2*time.Hour {
			staleEvents = append(staleEvents, staleEvent{
				ID:      ev.ID,
				Title:   ev.Title,
				ActiveH: math.Round(now.Sub(ev.StartTime).Hours()*100) / 100,
			})
		}
	}

	bottlenecks := map[string]any{
		"overloaded_users":      overloadedUsers,
		"blocked_events":        blockedEvents,
		"unacknowledged_alarms": unacknowledgedAlarms,
		"pending_decisions":     pendingDecisions,
		"stale_events":          staleEvents,
	}

	// ── 6. Decision Load ────────────────────────────────────────────────────
	totalDecisions := len(decisions)
	pendingDec, approvedDec, rejectedDec := 0, 0, 0
	decisionsLast1h, decisionsLast4h := 0, 0
	var responseTimes []float64
	decisionsLast24h := 0
	for _, d := range decisions {
		switch d.Status {
		case "requested":
			pendingDec++
		case "approved":
			approvedDec++
		case "rejected":
			rejectedDec++
		}
		if d.Timestamp.After(cutoff1h) {
			decisionsLast1h++
		}
		if d.Timestamp.After(cutoff4h) {
			decisionsLast4h++
		}
		if d.Timestamp.After(cutoff24h) {
			decisionsLast24h++
		}
		if d.RequestedAt != nil && d.ReviewedAt != nil {
			rt := d.ReviewedAt.Sub(*d.RequestedAt).Minutes()
			if rt >= 0 {
				responseTimes = append(responseTimes, rt)
			}
		}
	}
	avgResponseTime := 0.0
	if len(responseTimes) > 0 {
		sum := 0.0
		for _, rt := range responseTimes {
			sum += rt
		}
		avgResponseTime = sum / float64(len(responseTimes))
	}
	decisionVelocity := float64(decisionsLast24h) / 24.0

	decisionLoad := map[string]any{
		"total_decisions":          totalDecisions,
		"pending":                  pendingDec,
		"approved":                 approvedDec,
		"rejected":                 rejectedDec,
		"decisions_last_hour":      decisionsLast1h,
		"decisions_last_4h":        decisionsLast4h,
		"avg_response_time_minutes": math.Round(avgResponseTime*100) / 100,
		"decision_velocity":        math.Round(decisionVelocity*100) / 100,
	}

	// ── 7. Impact ───────────────────────────────────────────────────────────
	eventsByType := make(map[string]int)
	eventsByLayer := make(map[string]int)
	for _, ev := range events {
		eventsByType[string(ev.EventType)]++
		if ev.LayerID != nil {
			name := layerNames[*ev.LayerID]
			if name == "" {
				name = fmt.Sprintf("layer_%d", *ev.LayerID)
			}
			eventsByLayer[name]++
		} else {
			eventsByLayer["master"]++
		}
	}

	// Critical events: active events sorted by dependency fan-out
	depFanOut := make(map[int64]int)
	for _, ev := range events {
		for _, depID := range ev.DependsOn {
			depFanOut[depID]++
		}
	}
	type criticalEvent struct {
		ID     int64  `json:"id"`
		Title  string `json:"title"`
		FanOut int    `json:"dependency_fan_out"`
	}
	var criticalEvents []criticalEvent
	for _, ev := range events {
		if ev.Status == "active" && depFanOut[ev.ID] > 0 {
			criticalEvents = append(criticalEvents, criticalEvent{
				ID:     ev.ID,
				Title:  ev.Title,
				FanOut: depFanOut[ev.ID],
			})
		}
	}
	sort.Slice(criticalEvents, func(i, j int) bool {
		return criticalEvents[i].FanOut > criticalEvents[j].FanOut
	})

	impact := map[string]any{
		"events_by_type":  eventsByType,
		"events_by_layer": eventsByLayer,
		"critical_events": criticalEvents,
	}

	// ── 8. Confidence ───────────────────────────────────────────────────────
	// On-time delivery: completed events that finished on or before PlannedEnd
	onTimeCount := 0
	completedWithPlan := 0
	for _, ev := range events {
		if ev.Status != "completed" && ev.Status != "verified" {
			continue
		}
		if ev.PlannedEnd == nil {
			continue
		}
		completedWithPlan++
		endTime := ev.EndTime
		if endTime != nil && !endTime.After(*ev.PlannedEnd) {
			onTimeCount++
		}
	}
	onTimeRate := 0.0
	if completedWithPlan > 0 {
		onTimeRate = float64(onTimeCount) / float64(completedWithPlan)
	}

	completionConf := completionRate * onTimeRate // weighted by on-time delivery
	readinessScore := latestCheckReadiness
	scheduleAdherence := (1.0 - delayedRate) * 100.0
	overallConfidence := (completionConf + readinessScore + scheduleAdherence) / 3.0

	confidence := map[string]any{
		"completion_confidence": math.Round(completionConf*100) / 100,
		"readiness_score":      math.Round(readinessScore*100) / 100,
		"schedule_adherence":   math.Round(scheduleAdherence*100) / 100,
		"overall_confidence":   math.Round(overallConfidence*100) / 100,
	}

	// ── 9. Escalation ───────────────────────────────────────────────────────
	escalatedDecisions := 0
	quickResponses := 0
	quickReports := 0
	for _, a := range auditEntries {
		if !a.Timestamp.After(cutoff24h) {
			continue
		}
		switch a.Action {
		case "escalate_decision":
			escalatedDecisions++
		case "quick_response":
			quickResponses++
		case "quick_report":
			quickReports++
		}
	}
	escalationTotal := float64(escalatedDecisions + quickResponses + quickReports)
	escalationRate := escalationTotal / 24.0

	escalation := map[string]any{
		"escalated_decisions": escalatedDecisions,
		"quick_responses":     quickResponses,
		"quick_reports":       quickReports,
		"escalation_rate":     math.Round(escalationRate*100) / 100,
	}

	// ── 10. Summary ─────────────────────────────────────────────────────────
	currentPhase := ""
	for _, ph := range phases {
		if !now.Before(ph.StartTime) && now.Before(ph.EndTime) {
			currentPhase = ph.Name
			break
		}
	}

	// Count unique connected users from SSE broker
	app.broker.mu.RLock()
	activeUsersCount := len(app.broker.byUser)
	app.broker.mu.RUnlock()

	// Logbook entries in last 24h
	logbookEntries24h := 0
	for _, entry := range logbook {
		if entry.Timestamp.After(cutoff24h) {
			logbookEntries24h++
		}
	}

	// Active locks (locks where now is within their time range)
	activeLockCount := 0
	for _, lock := range locks {
		if !now.Before(lock.StartTime) && now.Before(lock.EndTime) {
			activeLockCount++
		}
	}

	summary := map[string]any{
		"phase_name":          currentPhase,
		"active_users_count":  activeUsersCount,
		"total_groups":        len(groups),
		"total_layers":        len(layers),
		"logbook_entries_24h": logbookEntries24h,
		"lock_count":          activeLockCount,
	}

	// ── Response ────────────────────────────────────────────────────────────
	jsonOK(w, map[string]any{
		"tempo":         tempo,
		"readiness":     readiness,
		"progress":      progress,
		"delay":         delay,
		"bottlenecks":   bottlenecks,
		"decision_load": decisionLoad,
		"impact":        impact,
		"confidence":    confidence,
		"escalation":    escalation,
		"summary":       summary,
		"generated_at":  now.Format(time.RFC3339),
	})
}

// ── Personnel Performance Stats ─────────────────────────────────────────────

func (app *App) handleStatsPersonnelPerformance(w http.ResponseWriter, r *http.Request, user *User) {
	events := app.visibleEvents(user)
	decisions := app.store.GetDecisionLog()
	users := app.store.GetUsers()
	auditEntries := app.store.GetAudit(1000)

	// Build user maps
	userMap := make(map[int64]User, len(users))
	for _, u := range users {
		userMap[u.ID] = u
	}

	// Per-user stats
	type userPerf struct {
		UserID       int64    `json:"user_id"`
		DisplayName  string   `json:"display_name"`
		Role         string   `json:"role"`
		JDesignation []string `json:"j_designations,omitempty"`
		TotalEvents  int      `json:"total_events"`
		Completed    int      `json:"completed"`
		Active       int      `json:"active"`
		Planned      int      `json:"planned"`
		Verified     int      `json:"verified"`
		Rejected     int      `json:"rejected"`
		CompletionRate float64 `json:"completion_rate"`
		AvgSlipMinutes float64 `json:"avg_slip_minutes"`
		DecisionsMade  int     `json:"decisions_made"`
		DecisionsReq   int     `json:"decisions_requested"`
		AuditActions   int     `json:"audit_actions"`
	}

	perfMap := make(map[int64]*userPerf)
	ensurePerf := func(uid int64) *userPerf {
		if p, ok := perfMap[uid]; ok {
			return p
		}
		u := userMap[uid]
		p := &userPerf{
			UserID:       uid,
			DisplayName:  u.DisplayName,
			Role:         string(u.Role),
			JDesignation: u.NATODesignations,
		}
		perfMap[uid] = p
		return p
	}

	// Tally events per responsible user
	for _, ev := range events {
		if ev.ResponsibleID == nil {
			continue
		}
		p := ensurePerf(*ev.ResponsibleID)
		p.TotalEvents++
		switch ev.Status {
		case "completed":
			p.Completed++
		case "active":
			p.Active++
		case "planned":
			p.Planned++
		case "verified":
			p.Verified++
		case "rejected":
			p.Rejected++
		}
		if ev.PlannedStart != nil {
			slip := ev.StartTime.Sub(*ev.PlannedStart).Minutes()
			p.AvgSlipMinutes += slip
		}
	}

	// Finalize avg slip
	for _, p := range perfMap {
		if p.TotalEvents > 0 {
			p.AvgSlipMinutes = math.Round(p.AvgSlipMinutes/float64(p.TotalEvents)*100) / 100
			p.CompletionRate = math.Round(float64(p.Completed+p.Verified)/float64(p.TotalEvents)*10000) / 100
		}
	}

	// Tally decisions
	for _, d := range decisions {
		if d.ReviewedBy > 0 {
			ensurePerf(d.ReviewedBy).DecisionsMade++
		}
		if d.UserID > 0 {
			ensurePerf(d.UserID).DecisionsReq++
		}
	}

	// Tally audit actions
	for _, a := range auditEntries {
		if a.UserID > 0 {
			ensurePerf(a.UserID).AuditActions++
		}
	}

	// Build result arrays grouped by role type
	type roleGroup struct {
		Role  string      `json:"role"`
		Users []*userPerf `json:"users"`
	}

	// J-staff by designation type (J1-J9 aggregated)
	jStaffByType := make(map[string][]*userPerf)
	var jStaffIndividual []*userPerf
	var teamLeads []*userPerf
	var deputyTeamLeads []*userPerf
	var opsLeads []*userPerf
	var deputyOpsLeads []*userPerf
	var teamMembers []*userPerf

	for _, p := range perfMap {
		role := Role(p.Role)
		switch {
		case role == RoleStaffOfficer || role == RoleStaffOfficerFull || role == RoleStaffAssistant:
			jStaffIndividual = append(jStaffIndividual, p)
			for _, jd := range p.JDesignation {
				jStaffByType[jd] = append(jStaffByType[jd], p)
			}
		case role == RoleTeamLead:
			teamLeads = append(teamLeads, p)
		case role == RoleDeputyTeamLead:
			deputyTeamLeads = append(deputyTeamLeads, p)
		case role == RoleOpLead:
			opsLeads = append(opsLeads, p)
		case role == RoleDeputyOpLead:
			deputyOpsLeads = append(deputyOpsLeads, p)
		case role == RoleReadWrite:
			teamMembers = append(teamMembers, p)
		}
	}

	// J-staff type aggregation
	type jTypeAgg struct {
		Designation    string  `json:"designation"`
		UserCount      int     `json:"user_count"`
		TotalEvents    int     `json:"total_events"`
		Completed      int     `json:"completed"`
		CompletionRate float64 `json:"completion_rate"`
		AvgSlip        float64 `json:"avg_slip_minutes"`
		DecisionsMade  int     `json:"decisions_made"`
	}
	var jTypeAggs []jTypeAgg
	for jd, perfs := range jStaffByType {
		agg := jTypeAgg{Designation: jd, UserCount: len(perfs)}
		for _, p := range perfs {
			agg.TotalEvents += p.TotalEvents
			agg.Completed += p.Completed
			agg.AvgSlip += p.AvgSlipMinutes
			agg.DecisionsMade += p.DecisionsMade
		}
		if agg.UserCount > 0 {
			agg.AvgSlip = math.Round(agg.AvgSlip/float64(agg.UserCount)*100) / 100
		}
		if agg.TotalEvents > 0 {
			agg.CompletionRate = math.Round(float64(agg.Completed)/float64(agg.TotalEvents)*10000) / 100
		}
		jTypeAggs = append(jTypeAggs, agg)
	}

	// Sort slices by total events descending
	sortPerf := func(s []*userPerf) {
		sort.Slice(s, func(i, j int) bool {
			return s[i].TotalEvents > s[j].TotalEvents
		})
	}
	sortPerf(jStaffIndividual)
	sortPerf(teamLeads)
	sortPerf(deputyTeamLeads)
	sortPerf(opsLeads)
	sortPerf(deputyOpsLeads)
	sortPerf(teamMembers)

	sort.Slice(jTypeAggs, func(i, j int) bool {
		return jTypeAggs[i].TotalEvents > jTypeAggs[j].TotalEvents
	})

	jsonOK(w, map[string]any{
		"j_staff_by_type":       jTypeAggs,
		"j_staff_individual":    jStaffIndividual,
		"team_leads":            teamLeads,
		"deputy_team_leads":     deputyTeamLeads,
		"ops_leads":             opsLeads,
		"deputy_ops_leads":      deputyOpsLeads,
		"team_members":          teamMembers,
		"generated_at":          time.Now().Format(time.RFC3339),
	})
}

// ── Usage Statistics ─────────────────────────────────────────────────────────

func (app *App) handleStatsUsage(w http.ResponseWriter, r *http.Request, user *User) {
	audit := app.store.GetAudit(10000)

	// ── Logins over time ──
	loginsByDay := make(map[string]int)
	failedByDay := make(map[string]int)
	totalLogins := 0
	totalFailed := 0
	for _, a := range audit {
		day := a.Timestamp.Format("2006-01-02")
		if a.Action == "login" {
			loginsByDay[day]++
			totalLogins++
		} else if strings.HasPrefix(a.Action, "login_failed") || a.Action == "login_blocked" {
			failedByDay[day]++
			totalFailed++
		}
	}

	// ── Security audit breakdown ──
	securityActions := map[string]int{}
	securitySet := map[string]bool{
		"login": true, "login_failed": true, "login_blocked": true,
		"login_failed_unknown_account": true, "login_failed_password": true,
		"login_failed_blocked": true, "login_failed_lockout": true,
		"login_failed_unvetted": true, "login_failed_sso_only": true,
		"email_changed": true, "password_changed": true, "password_reset": true,
		"blocked": true, "unblocked": true,
	}
	for _, a := range audit {
		if securitySet[a.Action] {
			securityActions[a.Action]++
		} else if a.EntityType == "security_settings" {
			securityActions["security_config_change"]++
		}
	}

	// ── Audit actions by type ──
	actionCounts := map[string]int{}
	entityCounts := map[string]int{}
	for _, a := range audit {
		actionCounts[a.Action]++
		entityCounts[a.EntityType]++
	}

	// ── Integrations usage ──
	eventLog := app.store.GetEventLog()
	integrationsBySource := map[string]int{}
	for _, el := range eventLog {
		src := el.Source
		if src == "" {
			src = "manual"
		}
		integrationsBySource[src]++
	}
	// Count webhook-configured users
	allPrefs := app.store.GetAllPreferences()
	webhookUsers := 0
	for _, p := range allPrefs {
		if p.WebhookURL != "" {
			webhookUsers++
		}
	}

	// ── Reference material usage ──
	refDocs := app.store.GetReferenceDocs()
	refByCategory := map[string]int{}
	for _, d := range refDocs {
		cat := d.Category
		if cat == "" {
			cat = "other"
		}
		refByCategory[cat]++
	}

	// ── Map resources ──
	mapResources := app.store.GetMapResources()
	mapsByType := map[string]int{}
	for _, m := range mapResources {
		mt := m.MapType
		if mt == "" {
			mt = "custom"
		}
		mapsByType[mt]++
	}
	// Most popular maps by overlay/drawing count
	type mapPop struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Overlays int    `json:"overlays"`
		Drawings int    `json:"drawings"`
		Activity int    `json:"activity"`
	}
	var mapPopularity []mapPop
	for _, m := range mapResources {
		drawings := 0
		for _, o := range m.Overlays {
			drawings += len(o.Items)
		}
		drawings += len(m.Drawings)
		if drawings > 0 || len(m.Overlays) > 0 {
			mapPopularity = append(mapPopularity, mapPop{
				Name: m.Name, Type: m.MapType,
				Overlays: len(m.Overlays), Drawings: drawings,
				Activity: drawings + len(m.Overlays),
			})
		}
	}
	sort.Slice(mapPopularity, func(i, j int) bool {
		return mapPopularity[i].Activity > mapPopularity[j].Activity
	})
	if len(mapPopularity) > 10 {
		mapPopularity = mapPopularity[:10]
	}

	// ── Most used features (audit entity types as proxy) ──
	featureUsage := map[string]int{}
	for _, a := range audit {
		if a.Action == "login" || a.Action == "login_failed" || a.Action == "login_blocked" {
			continue // Skip auth actions from feature usage
		}
		featureUsage[a.EntityType]++
	}

	// ── Readychecks, checklists, polls summary ──
	readyChecks := app.store.GetPersonReadyChecks()
	checklists := app.store.GetChecklistInstances()
	polls := app.store.GetPolls()

	rcTotal := len(readyChecks)
	rcResponseRate := 0.0
	rcTotalParticipants := 0
	rcTotalResponded := 0
	for _, rc := range readyChecks {
		for _, p := range rc.Participants {
			rcTotalParticipants++
			if p.Status != "pending" {
				rcTotalResponded++
			}
		}
	}
	if rcTotalParticipants > 0 {
		rcResponseRate = float64(rcTotalResponded) / float64(rcTotalParticipants) * 100
	}

	clTotal := len(checklists)
	clCompleted := 0
	clTotalItems := 0
	clCheckedItems := 0
	for _, cl := range checklists {
		if cl.Status == "completed" {
			clCompleted++
		}
		for _, item := range cl.Items {
			clTotalItems++
			if item.Checked {
				clCheckedItems++
			}
		}
	}

	pollTotal := len(polls)
	pollClosed := 0
	pollTotalResponses := 0
	for _, p := range polls {
		if p.Status == "closed" {
			pollClosed++
		}
		pollTotalResponses += len(p.Responses)
	}

	jsonOK(w, map[string]any{
		"logins_by_day":          loginsByDay,
		"failed_logins_by_day":   failedByDay,
		"total_logins":           totalLogins,
		"total_failed_logins":    totalFailed,
		"security_actions":       securityActions,
		"audit_by_action":        actionCounts,
		"audit_by_entity":        entityCounts,
		"integrations_by_source": integrationsBySource,
		"webhook_users":          webhookUsers,
		"ref_docs_by_category":   refByCategory,
		"total_ref_docs":         len(refDocs),
		"maps_by_type":           mapsByType,
		"total_maps":             len(mapResources),
		"map_popularity":         mapPopularity,
		"feature_usage":          featureUsage,
		"readychecks": map[string]any{
			"total":         rcTotal,
			"response_rate": math.Round(rcResponseRate*100) / 100,
			"participants":  rcTotalParticipants,
			"responded":     rcTotalResponded,
		},
		"checklists": map[string]any{
			"total":         clTotal,
			"completed":     clCompleted,
			"total_items":   clTotalItems,
			"checked_items": clCheckedItems,
		},
		"polls": map[string]any{
			"total":           pollTotal,
			"closed":          pollClosed,
			"total_responses": pollTotalResponses,
		},
		"generated_at": time.Now().Format(time.RFC3339),
	})
}
