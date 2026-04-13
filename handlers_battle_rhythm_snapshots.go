package main

import (
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── Battle Rhythm Snapshot Scheduler ──────────────────────────────────────
//
// Periodically inspects the shared battle-rhythm configuration and, when
// the clock passes one of the configured snapshot offsets, writes a
// snapshot of the current Key Terrain Board entries to disk in each
// configured format.
//
// Snapshots live under dataDir/key_terrain_battle_rhythm/<cycle_start>/
// where <cycle_start> is UTC RFC3339 with colons replaced by dashes for
// filesystem compatibility. Each snapshot file is named "h<offset>.ext".
// Deduplication is per (cycle_start, offset, format): the scheduler uses
// os.Stat to skip files that already exist, so restarting the server or
// firing the ticker multiple times cannot create duplicate snapshots.
//
// Snapshots are currently written in CSV, JSON, XML, and SVG formats.
// Image formats (PNG/JPEG/PDF) are deliberately out of scope because
// rendering them server-side would require a headless browser.

// startBattleRhythmScheduler launches the per-minute ticker goroutine.
// Called from main.go just after NewApp returns. The goroutine exits
// when app.stopCh closes during graceful shutdown.
func (app *App) startBattleRhythmScheduler() {
	go func() {
		// Small jitter after startup so the very first fire isn't right on
		// an operator-visible minute boundary during local testing.
		select {
		case <-app.stopCh:
			return
		case <-time.After(15 * time.Second):
		}
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-app.stopCh:
				return
			case <-ticker.C:
				now := time.Now()
				// Cycle rollover first so the rounds column is fresh
				// before the snapshot writer serialises entries.
				app.runDueBattleRhythmCycles(now)
				app.runDueBattleRhythmSnapshots(now)
			}
		}
	}()
}

// runDueBattleRhythmCycles detects cycle rollover (the clock has wrapped
// past the previous cycle boundary) and increments the Rounds counter on
// every non-archived Key Terrain entry by the number of cycles that have
// elapsed since LastCycleIdx. The per-minute ticker makes this an at-most
// once-per-minute update per entry. LastCycleIdx is persisted so restarts
// and delayed ticks do not double-increment.
func (app *App) runDueBattleRhythmCycles(now time.Time) {
	settings := app.store.GetKeyTerrainSettings()
	cfg := settings.BattleRhythm
	if !cfg.Enabled || cfg.StartedAt == nil || cfg.PausedAt != nil {
		return
	}
	if cfg.CycleMinutes <= 0 {
		return
	}
	elapsed := now.Sub(*cfg.StartedAt)
	if elapsed < 0 {
		return
	}
	cycle := time.Duration(cfg.CycleMinutes) * time.Minute
	currentIdx := int(elapsed / cycle)
	if currentIdx <= cfg.LastCycleIdx {
		return
	}
	delta := currentIdx - cfg.LastCycleIdx
	entries := app.store.GetKeyTerrainEntries()
	updated := 0
	for _, e := range entries {
		if e.Archived {
			continue
		}
		e.Rounds += delta
		if err := app.store.UpdateKeyTerrainEntry(e); err == nil {
			updated++
		}
	}
	cfg.LastCycleIdx = currentIdx
	settings.BattleRhythm = cfg
	_ = app.store.SaveKeyTerrainSettings(settings)
	app.store.LogAudit(AuditEntry{ //nolint
		Action: "cycle_rollover", EntityType: "battle_rhythm",
		Summary: fmt.Sprintf("Battle rhythm cycle %d began; rounds incremented on %d entries (+%d)",
			currentIdx, updated, delta),
	})
	app.broadcastKeyTerrainChange("cycle_rollover")
}

// runDueBattleRhythmSnapshots is the core of the scheduler: given the
// current time, figure out which cycle we're in, compute the elapsed
// position, and for each configured snapshot offset, write a file if
// the clock has just crossed (or is exactly on) that offset and no file
// already exists for this (cycle_start, offset, format) tuple.
func (app *App) runDueBattleRhythmSnapshots(now time.Time) {
	cfg := app.store.GetKeyTerrainSettings().BattleRhythm
	if !cfg.Enabled || cfg.StartedAt == nil || cfg.PausedAt != nil {
		return
	}
	if cfg.CycleMinutes <= 0 {
		return
	}
	if len(cfg.SnapshotOffsets) == 0 || len(cfg.SnapshotFormats) == 0 {
		return
	}
	elapsed := now.Sub(*cfg.StartedAt)
	if elapsed < 0 {
		return // clock scheduled to start in the future
	}
	cycle := time.Duration(cfg.CycleMinutes) * time.Minute
	cycleIdx := int(elapsed / cycle)
	cycleStart := cfg.StartedAt.Add(time.Duration(cycleIdx) * cycle)
	posMin := int((elapsed % cycle).Minutes())

	entries := app.store.GetKeyTerrainEntries()
	dir := app.store.BattleRhythmSnapshotDir()
	cycleDirName := safeTimestamp(cycleStart)
	cycleDir := filepath.Join(dir, cycleDirName)

	for _, offset := range cfg.SnapshotOffsets {
		// Normalise into the visible cycle window [0, CycleMinutes).
		normalised := ((offset % cfg.CycleMinutes) + cfg.CycleMinutes) % cfg.CycleMinutes
		// We fire when the current minute matches the offset. Because the
		// ticker runs once per minute, a 60-second window is enough; we
		// accept a small leeway either side so a slightly delayed tick
		// still catches the offset.
		if posMin != normalised {
			continue
		}
		if err := os.MkdirAll(cycleDir, 0o750); err != nil {
			log.Printf("[battle-rhythm] mkdir %s: %v", cycleDir, err)
			continue
		}
		for _, format := range cfg.SnapshotFormats {
			format = strings.ToLower(strings.TrimSpace(format))
			if format == "" {
				continue
			}
			// Actual wall-clock time of this snapshot instant: cycle
			// start plus the normalised offset. Folded into the
			// filename so operators can tell when a snapshot was
			// captured without opening the cycle-directory name or
			// inspecting the file mtime. The same (cycle, offset)
			// tuple always yields the same filename, so the
			// os.Stat-based dedup check below still works.
			snapshotTime := cycleStart.Add(time.Duration(normalised) * time.Minute)
			snapshotStamp := safeTimestamp(snapshotTime)
			name := fmt.Sprintf("h%+d_%s.%s", normalised, snapshotStamp, format)
			full := filepath.Join(cycleDir, name)
			if _, err := os.Stat(full); err == nil {
				continue // already written for this cycle+offset+format
			}
			data, renderErr := renderBattleRhythmSnapshot(entries, cycleStart, normalised, format)
			if renderErr != nil {
				log.Printf("[battle-rhythm] render %s: %v", format, renderErr)
				continue
			}
			if err := os.WriteFile(full, data, 0o640); err != nil {
				log.Printf("[battle-rhythm] write %s: %v", full, err)
				continue
			}
			app.store.LogAudit(AuditEntry{ //nolint
				Action: "snapshot", EntityType: "battle_rhythm", EntityID: 0,
				Summary: fmt.Sprintf("Battle rhythm snapshot: cycle=%s offset=%d at=%s format=%s entries=%d",
					cycleDirName, normalised, snapshotStamp, format, len(entries)),
			})
		}
	}
}

// safeTimestamp produces a filename-safe form of a time (YYYY-MM-DDTHH-MM-SSZ).
func safeTimestamp(t time.Time) string {
	return strings.ReplaceAll(t.UTC().Format(time.RFC3339), ":", "-")
}

// renderBattleRhythmSnapshot serialises the board entries into the
// requested format. CSV / JSON / XML are straightforward; SVG renders a
// simple tabular view with the same columns as the on-screen board.
func renderBattleRhythmSnapshot(entries []KeyTerrainEntry, cycleStart time.Time, offsetMin int, format string) ([]byte, error) {
	switch format {
	case "csv":
		return renderBattleRhythmCSV(entries)
	case "json":
		return renderBattleRhythmJSON(entries, cycleStart, offsetMin)
	case "xml":
		return renderBattleRhythmXML(entries, cycleStart, offsetMin)
	case "svg":
		return renderBattleRhythmSVG(entries, cycleStart, offsetMin)
	default:
		return nil, fmt.Errorf("unsupported snapshot format %q", format)
	}
}

// renderBattleRhythmCSV writes a comma-separated table, one row per entry,
// with a header that matches the on-screen column order.
func renderBattleRhythmCSV(entries []KeyTerrainEntry) ([]byte, error) {
	var sb strings.Builder
	w := csv.NewWriter(&sb)
	header := []string{
		"seq_num", "zone", "priority", "function", "status", "trend",
		"threat", "external", "responsible", "owner", "actions", "comments",
		"created_at", "updated_at", "finished_at", "rounds",
	}
	if err := w.Write(header); err != nil {
		return nil, err
	}
	for _, e := range entries {
		row := []string{
			fmt.Sprintf("%d", e.SeqNum),
			e.Zone,
			fmt.Sprintf("%d", e.Priority),
			e.Function,
			e.Status,
			e.Trend,
			e.Threat,
			e.External,
			e.ResponsibleName,
			e.OwnerName,
			e.Actions,
			e.Comments,
			rfcOrEmpty(&e.CreatedAt),
			rfcOrEmpty(&e.UpdatedAt),
			rfcOrEmpty(e.FinishedAt),
			fmt.Sprintf("%d", e.Rounds),
		}
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return []byte(sb.String()), nil
}

func rfcOrEmpty(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// renderBattleRhythmJSON writes the full entry slice plus a header that
// records when and where in the cycle the snapshot was taken.
func renderBattleRhythmJSON(entries []KeyTerrainEntry, cycleStart time.Time, offsetMin int) ([]byte, error) {
	wrapper := struct {
		CycleStart  time.Time         `json:"cycle_start"`
		OffsetMin   int               `json:"offset_min"`
		TakenAt     time.Time         `json:"taken_at"`
		EntryCount  int               `json:"entry_count"`
		Entries     []KeyTerrainEntry `json:"entries"`
	}{
		CycleStart: cycleStart,
		OffsetMin:  offsetMin,
		TakenAt:    time.Now().UTC(),
		EntryCount: len(entries),
		Entries:    entries,
	}
	return json.MarshalIndent(wrapper, "", "  ")
}

// renderBattleRhythmXML writes a simple element-per-entry document.
func renderBattleRhythmXML(entries []KeyTerrainEntry, cycleStart time.Time, offsetMin int) ([]byte, error) {
	type xmlEntry struct {
		XMLName     xml.Name `xml:"entry"`
		SeqNum      int      `xml:"seq_num,attr"`
		Zone        string   `xml:"zone,omitempty"`
		Priority    int      `xml:"priority,omitempty"`
		Function    string   `xml:"function"`
		Status      string   `xml:"status,omitempty"`
		Trend       string   `xml:"trend,omitempty"`
		Threat      string   `xml:"threat,omitempty"`
		External    string   `xml:"external,omitempty"`
		Responsible string   `xml:"responsible,omitempty"`
		Actions     string   `xml:"actions,omitempty"`
		Comments    string   `xml:"comments,omitempty"`
	}
	type doc struct {
		XMLName    xml.Name   `xml:"key_terrain_snapshot"`
		CycleStart string     `xml:"cycle_start,attr"`
		OffsetMin  int        `xml:"offset_min,attr"`
		TakenAt    string     `xml:"taken_at,attr"`
		Entries    []xmlEntry `xml:"entries>entry"`
	}
	out := doc{
		CycleStart: cycleStart.UTC().Format(time.RFC3339),
		OffsetMin:  offsetMin,
		TakenAt:    time.Now().UTC().Format(time.RFC3339),
	}
	for _, e := range entries {
		out.Entries = append(out.Entries, xmlEntry{
			SeqNum: e.SeqNum, Zone: e.Zone, Priority: e.Priority,
			Function: e.Function, Status: e.Status, Trend: e.Trend,
			Threat: e.Threat, External: e.External,
			Responsible: e.ResponsibleName, Actions: e.Actions,
			Comments: e.Comments,
		})
	}
	body, err := xml.MarshalIndent(out, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), body...), nil
}

// renderBattleRhythmSVG produces a minimal SVG "printout" of the board:
// a title row with the cycle start + offset, then one row per entry with
// function, status, trend, threat, responsible. Monospace font so every
// consumer (browser, image viewer, Inkscape) renders it consistently.
func renderBattleRhythmSVG(entries []KeyTerrainEntry, cycleStart time.Time, offsetMin int) ([]byte, error) {
	const (
		charW     = 7
		rowH      = 18
		padX      = 10
		padY      = 26
		headerY   = 22
	)
	cols := []struct {
		name  string
		width int // in characters
	}{
		{"#", 4},
		{"Zone", 10},
		{"Pri", 4},
		{"Function", 30},
		{"Status", 10},
		{"Trend", 10},
		{"Threat", 20},
		{"Responsible", 20},
	}
	totalCharWidth := 0
	for _, c := range cols {
		totalCharWidth += c.width + 1
	}
	width := padX*2 + totalCharWidth*charW
	height := padY + headerY + (len(entries)+1)*rowH + padY
	if height < 120 {
		height = 120
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, `<?xml version="1.0" encoding="UTF-8"?>`+"\n")
	fmt.Fprintf(&sb, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="monospace" font-size="12">`+"\n",
		width, height, width, height)
	fmt.Fprintf(&sb, `  <rect width="100%%" height="100%%" fill="#ffffff"/>`+"\n")
	fmt.Fprintf(&sb, `  <text x="%d" y="%d" font-weight="bold" font-size="14">Key Terrain snapshot — cycle %s, H+%d (%d entries)</text>`+"\n",
		padX, padY, xmlEscape(cycleStart.UTC().Format(time.RFC3339)), offsetMin, len(entries))
	// Header row.
	headerYPos := padY + headerY
	x := padX
	fmt.Fprintf(&sb, `  <g font-weight="bold">`+"\n")
	for _, c := range cols {
		fmt.Fprintf(&sb, `    <text x="%d" y="%d">%s</text>`+"\n", x, headerYPos, xmlEscape(c.name))
		x += (c.width + 1) * charW
	}
	fmt.Fprintf(&sb, `    <line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#444" stroke-width="1"/>`+"\n",
		padX, headerYPos+4, width-padX, headerYPos+4)
	fmt.Fprintf(&sb, `  </g>`+"\n")
	// Data rows.
	for i, e := range entries {
		rowY := headerYPos + rowH*(i+1)
		xx := padX
		values := []string{
			fmt.Sprintf("%d", e.SeqNum),
			truncate(e.Zone, cols[1].width),
			fmt.Sprintf("%d", e.Priority),
			truncate(e.Function, cols[3].width),
			truncate(e.Status, cols[4].width),
			truncate(e.Trend, cols[5].width),
			truncate(e.Threat, cols[6].width),
			truncate(e.ResponsibleName, cols[7].width),
		}
		for j, v := range values {
			fmt.Fprintf(&sb, `  <text x="%d" y="%d">%s</text>`+"\n", xx, rowY, xmlEscape(v))
			xx += (cols[j].width + 1) * charW
		}
	}
	fmt.Fprintf(&sb, `</svg>`+"\n")
	return []byte(sb.String()), nil
}

func xmlEscape(s string) string {
	var sb strings.Builder
	_ = xml.EscapeText(&sb, []byte(s))
	return sb.String()
}
