package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ── Battle Rhythm ─────────────────────────────────────────────────────────
//
// A battle rhythm is a shared exercise clock with a fixed cycle length
// (e.g. every 120 minutes). H0 marks the start of the current cycle; each
// cycle contains zero or more named "steps" timed relative to H0 and a set
// of snapshot offsets where a Key Terrain Board snapshot is automatically
// captured in the configured formats.
//
// The clock state lives inside KeyTerrainSettings so every connected
// client sees the same H0 via the existing /api/key-terrain/settings
// endpoint (and the SSE settings_updated broadcast). Start / pause / reset
// are exposed as small dedicated endpoints so operators don't have to
// round-trip the whole settings struct.

// battleRhythmState is the lightweight runtime view of the clock that the
// frontend uses to render the widget. It's derived on each fetch so the
// server stays stateless between requests.
type battleRhythmState struct {
	Enabled          bool               `json:"enabled"`
	ShowClock        bool               `json:"show_clock"`
	Running          bool               `json:"running"`
	Paused           bool               `json:"paused"`
	// Scheduled is true when the clock has been "armed" by pressing Start
	// with a future HH:MM start time but the wall clock hasn't yet reached
	// H0. In this state the widget shows a countdown to the scheduled
	// start rather than an H-offset.
	Scheduled        bool               `json:"scheduled"`
	// ScheduledSeconds is the positive number of seconds remaining until
	// H0 fires, when Scheduled is true.
	ScheduledSeconds float64            `json:"scheduled_seconds,omitempty"`
	CycleMinutes     int                `json:"cycle_minutes"`
	CycleStart       *time.Time         `json:"cycle_start,omitempty"`     // H0 of the current cycle
	CycleEnd         *time.Time         `json:"cycle_end,omitempty"`       // H0 + cycle
	StartedAt        *time.Time         `json:"started_at,omitempty"`      // raw scheduled H0 (same as cfg.StartedAt)
	ElapsedMinutes   float64            `json:"elapsed_minutes"`           // minutes since H0, may exceed cycle when clock spans cycles
	PositionMin      float64            `json:"position_min"`              // elapsed modulo cycle
	CurrentStep      *BattleRhythmStep  `json:"current_step,omitempty"`
	CurrentStepIdx   int                `json:"current_step_idx,omitempty"` // index into Steps of CurrentStep, or -1
	NextStep         *BattleRhythmStep  `json:"next_step,omitempty"`
	NextStepInMin    *float64           `json:"next_step_in_min,omitempty"`
	// CyclesCompleted is the zero-based index of the cycle the clock is
	// currently inside — i.e. when the clock is 5 minutes into the very
	// first cycle the value is 0, and after it wraps around for the first
	// time it becomes 1. The frontend shows this as "Cycles completed".
	CyclesCompleted int                `json:"cycles_completed"`
	ServerTime      time.Time          `json:"server_time"`
	Steps           []BattleRhythmStep `json:"steps,omitempty"`
}

// computeBattleRhythmState evaluates the clock relative to `now`.
// When the clock is paused, `now` is effectively replaced by PausedAt.
func computeBattleRhythmState(cfg BattleRhythmConfig, now time.Time) battleRhythmState {
	st := battleRhythmState{
		Enabled:        cfg.Enabled,
		ShowClock:      cfg.ShowClock,
		CycleMinutes:   cfg.CycleMinutes,
		ServerTime:     now,
		Steps:          cfg.Steps,
		CurrentStepIdx: -1,
	}
	if cfg.StartedAt == nil || cfg.CycleMinutes <= 0 {
		return st
	}
	st.StartedAt = cfg.StartedAt
	effectiveNow := now
	if cfg.PausedAt != nil {
		st.Paused = true
		effectiveNow = *cfg.PausedAt
	}
	// Scheduled state: the operator pressed Start with a future HH:MM and
	// the wall clock hasn't reached H0 yet. Expose a positive countdown
	// so the widget can show "Waiting for 09:00 — starts in 1m 23s".
	if effectiveNow.Before(*cfg.StartedAt) {
		st.Scheduled = true
		st.ScheduledSeconds = cfg.StartedAt.Sub(effectiveNow).Seconds()
		// The clock is armed but not yet counting; don't set Running so
		// the widget can render a distinct "waiting" UI state.
		return st
	}
	st.Running = true
	// Elapsed since the very first H0 (can be many cycles).
	elapsed := effectiveNow.Sub(*cfg.StartedAt)
	if elapsed < 0 {
		// Defensive: should already have returned via the Scheduled
		// branch above, but keep the clamp for safety.
		elapsed = 0
	}
	cycle := time.Duration(cfg.CycleMinutes) * time.Minute
	posMs := elapsed % cycle
	// Normalise to whole-minute precision for display but keep fractional
	// minutes for "next step in" countdowns.
	st.ElapsedMinutes = elapsed.Minutes()
	st.PositionMin = posMs.Minutes()
	cycleIndex := int(elapsed / cycle)
	st.CyclesCompleted = cycleIndex
	cycleStart := cfg.StartedAt.Add(time.Duration(cycleIndex) * cycle)
	cycleEnd := cycleStart.Add(cycle)
	st.CycleStart = &cycleStart
	st.CycleEnd = &cycleEnd

	// Find current + next step. Steps may have negative StartOffsetMin
	// (pre-H0); we normalise them into the visible cycle window [0, cycle).
	// A negative-offset step actually fires in the *previous* cycle; it is
	// visible near the end of that cycle. We render steps relative to the
	// closest cycle start.
	if len(cfg.Steps) > 0 {
		var current *BattleRhythmStep
		currentIdx := -1
		var next *BattleRhythmStep
		var nextDelta float64 = -1
		for i := range cfg.Steps {
			step := cfg.Steps[i]
			start := step.StartOffsetMin
			end := start
			if step.EndOffsetMin != nil {
				end = *step.EndOffsetMin
			}
			if end < start {
				end = start
			}
			// Is the clock currently inside this step?
			if float64(start) <= st.PositionMin && st.PositionMin <= float64(end) {
				current = &cfg.Steps[i]
				currentIdx = i
			}
			// Next step: smallest positive delta from current position.
			delta := float64(start) - st.PositionMin
			if delta < 0 {
				// Wraps to next cycle.
				delta += float64(cfg.CycleMinutes)
			}
			if nextDelta < 0 || delta < nextDelta {
				nextDelta = delta
				next = &cfg.Steps[i]
			}
		}
		st.CurrentStep = current
		st.CurrentStepIdx = currentIdx
		if next != nil {
			st.NextStep = next
			st.NextStepInMin = &nextDelta
		}
	}
	return st
}

// handleGetBattleRhythmState returns the computed clock state for the
// currently-stored battle rhythm configuration. Read-only — any logged-in
// user may fetch this so all clients can render the widget.
func (app *App) handleGetBattleRhythmState(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetKeyTerrainSettings().BattleRhythm
	st := computeBattleRhythmState(cfg, time.Now())
	jsonOK(w, st)
}

// handleBattleRhythmControl starts, pauses, resumes, resets or navigates
// the clock between steps. Teamlead+ only (same gating as other Key
// Terrain writes).
//
// Body: {"action":"start"|"pause"|"resume"|"reset"|"backward"|"forward"|
//        "fast_forward", "start_at":"15:04"?}
//
// - start:        sets StartedAt to now (or to today's clock-time when
//                 start_at is provided, e.g. "09:00" — server-local).
// - pause:        sets PausedAt to now (no-op if already paused).
// - resume:       shifts StartedAt forward by the pause duration and
//                 clears PausedAt so the elapsed position resumes from
//                 where it froze.
// - reset:        clears StartedAt and PausedAt; Enabled/ShowClock/Steps
//                 are preserved.
// - backward:     shifts H0 forward by (current_position - prev_step_start)
//                 so the clock position rewinds to the start of the
//                 previous step. If no previous step in this cycle,
//                 rewinds to H0 of the current cycle.
// - forward:      shifts H0 backward by (next_step_start - current_position)
//                 so the clock position jumps to the start of the next
//                 step. The current step is effectively cut short; wall
//                 clock continues normally. Cycle rollover happens
//                 earlier in wall clock.
// - fast_forward: same H0 shift as forward. Conceptually: "catch up to
//                 the step we should have started by now". Emitted as a
//                 separate action so the frontend can distinguish the
//                 toast/label, and left deliberately close-to-equivalent
//                 until the operator confirms the exact semantic they
//                 want (skip wall clock vs donate leftover time).
func (app *App) handleBattleRhythmControl(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Action  string `json:"action"`
		StartAt string `json:"start_at,omitempty"` // "HH:MM" in server-local time
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	settings := app.store.GetKeyTerrainSettings()
	cfg := settings.BattleRhythm
	now := time.Now()
	switch req.Action {
	case "start":
		ts, err := resolveBattleRhythmStartTime(req.StartAt, now)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		cfg.StartedAt = &ts
		cfg.PausedAt = nil
		// Fresh start: the first cycle is cycle 0, so the rollover scheduler
		// must not think the previous LastCycleIdx has already been handled.
		cfg.LastCycleIdx = 0
	case "pause":
		if cfg.StartedAt == nil {
			jsonError(w, "battle rhythm is not running", http.StatusBadRequest)
			return
		}
		if cfg.PausedAt == nil {
			pausedAt := now
			cfg.PausedAt = &pausedAt
		}
	case "resume":
		if cfg.StartedAt == nil || cfg.PausedAt == nil {
			jsonError(w, "battle rhythm is not paused", http.StatusBadRequest)
			return
		}
		// Advance StartedAt by the pause duration so the elapsed position
		// continues smoothly from where it froze.
		pauseDuration := now.Sub(*cfg.PausedAt)
		shifted := cfg.StartedAt.Add(pauseDuration)
		cfg.StartedAt = &shifted
		cfg.PausedAt = nil
	case "reset":
		cfg.StartedAt = nil
		cfg.PausedAt = nil
		cfg.LastCycleIdx = 0
	case "backward", "forward", "fast_forward":
		if cfg.StartedAt == nil {
			jsonError(w, "battle rhythm is not running", http.StatusBadRequest)
			return
		}
		if cfg.CycleMinutes <= 0 {
			jsonError(w, "cycle length must be > 0", http.StatusBadRequest)
			return
		}
		shift, err := computeBattleRhythmStepShift(cfg, now, req.Action)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		// Applying the shift: positive shift means "rewind" (H0 moves
		// forward in time); negative means "advance" (H0 moves back).
		shifted := cfg.StartedAt.Add(shift)
		cfg.StartedAt = &shifted
		// If paused, keep PausedAt consistent with the new H0 so the
		// frozen position is preserved relative to the step we just
		// jumped to.
		if cfg.PausedAt != nil {
			pausedShifted := cfg.PausedAt.Add(shift)
			cfg.PausedAt = &pausedShifted
		}
	default:
		jsonError(w, "action must be start|pause|resume|reset|backward|forward|fast_forward", http.StatusBadRequest)
		return
	}
	settings.BattleRhythm = cfg
	if err := app.store.SaveKeyTerrainSettings(settings); err != nil {
		jsonError(w, "failed to save", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, req.Action, "battle_rhythm", 0,
		fmt.Sprintf("Battle rhythm %s (cycle=%dmin)", req.Action, cfg.CycleMinutes))
	app.broadcastKeyTerrainChange("battle_rhythm_" + req.Action)
	jsonOK(w, computeBattleRhythmState(cfg, now))
}

// handleListBattleRhythmSnapshots returns a list of every on-disk snapshot
// produced by the scheduler, grouped by cycle start. Teamlead+ only so the
// audit trail isn't exposed to read-only observers.
func (app *App) handleListBattleRhythmSnapshots(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	dir := app.store.BattleRhythmSnapshotDir()
	type fileInfo struct {
		Name    string    `json:"name"`
		Size    int64     `json:"size"`
		Mtime   time.Time `json:"mtime"`
		Format  string    `json:"format"`
		OffsetM int       `json:"offset_min"`
	}
	type cycleGroup struct {
		CycleDir string     `json:"cycle_dir"`
		Files    []fileInfo `json:"files"`
	}
	cycles := map[string]*cycleGroup{}
	cycleEntries, err := os.ReadDir(dir)
	if err != nil && !os.IsNotExist(err) {
		jsonError(w, "failed to read snapshots dir", http.StatusInternalServerError)
		return
	}
	for _, ce := range cycleEntries {
		if !ce.IsDir() {
			continue
		}
		cycleName := ce.Name()
		sub, err := os.ReadDir(filepath.Join(dir, cycleName))
		if err != nil {
			continue
		}
		g := &cycleGroup{CycleDir: cycleName}
		for _, f := range sub {
			if f.IsDir() {
				continue
			}
			info, err := f.Info()
			if err != nil {
				continue
			}
			fi := fileInfo{Name: f.Name(), Size: info.Size(), Mtime: info.ModTime()}
			// h+30.csv → offset 30, format csv
			if dot := strings.LastIndex(f.Name(), "."); dot > 0 {
				fi.Format = f.Name()[dot+1:]
				base := strings.TrimPrefix(f.Name()[:dot], "h")
				if n, err := strconv.Atoi(base); err == nil {
					fi.OffsetM = n
				}
			}
			g.Files = append(g.Files, fi)
		}
		cycles[cycleName] = g
	}
	// Sort cycles by name descending so newest first (RFC3339 sorts alphabetically).
	keys := make([]string, 0, len(cycles))
	for k := range cycles {
		keys = append(keys, k)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(keys)))
	out := make([]cycleGroup, 0, len(keys))
	for _, k := range keys {
		out = append(out, *cycles[k])
	}
	jsonOK(w, out)
}

// handleDownloadBattleRhythmSnapshot serves a single snapshot file.
// Route: /api/key-terrain/battle-rhythm/snapshots/{cycle}/{name}
func (app *App) handleDownloadBattleRhythmSnapshot(w http.ResponseWriter, r *http.Request, user *User) {
	if !app.canWriteKeyTerrain(user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	// Path: /api/key-terrain/battle-rhythm/snapshots/<cycle>/<name>
	prefix := "/api/key-terrain/battle-rhythm/snapshots/"
	rest := strings.TrimPrefix(r.URL.Path, prefix)
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	// SECURITY: route through the shared safe-join helper so a tampered
	// cycle or filename cannot escape the snapshots directory.
	dir := app.store.BattleRhythmSnapshotDir()
	cycleDir, ok1 := safeJoinFilename(dir, parts[0])
	if !ok1 {
		jsonError(w, "invalid cycle", http.StatusBadRequest)
		return
	}
	full, ok2 := safeJoinFilename(cycleDir, parts[1])
	if !ok2 {
		jsonError(w, "invalid filename", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, parts[1]))
	http.ServeFile(w, r, full)
}

// computeBattleRhythmStepShift returns the duration to add to
// BattleRhythmConfig.StartedAt for a backward / forward / fast_forward
// navigation. A positive result means H0 moves forward in wall clock
// (the apparent position rewinds); a negative result means H0 moves
// backward (the apparent position advances).
//
// The shift is computed against the position we'd compute for `now`
// against the current config, and against the list of step start
// offsets in the cycle. "backward" lands the apparent position on the
// start of the most recent step that has already begun; "forward" and
// "fast_forward" land it on the start of the next step whose offset
// lies strictly after the current position. If there is no such
// neighbour inside the current cycle, we fall back to the cycle
// boundary (H0 of the previous or next cycle).
func computeBattleRhythmStepShift(cfg BattleRhythmConfig, now time.Time, action string) (time.Duration, error) {
	st := computeBattleRhythmState(cfg, now)
	cycle := cfg.CycleMinutes
	if cycle <= 0 {
		return 0, errors.New("cycle length must be > 0")
	}
	// Current position in the cycle, 0..cycle.
	pos := st.PositionMin
	// Build a sorted list of step starts normalised into [0, cycle).
	// Negative offsets wrap to the end of the cycle (e.g. a step with
	// start=-15 in a 120-min cycle appears at offset 105). Duplicates
	// are kept so a cycle with two steps starting at the same minute
	// still behaves deterministically.
	starts := make([]float64, 0, len(cfg.Steps))
	for _, step := range cfg.Steps {
		offset := float64(step.StartOffsetMin)
		mod := offset - float64(cycle)*(floorDiv(offset, float64(cycle)))
		if mod < 0 {
			mod += float64(cycle)
		}
		starts = append(starts, mod)
	}
	sort.Float64s(starts)

	switch action {
	case "backward":
		// Find the largest start strictly less than the current position.
		// If at position 0 (rare), rewind one cycle; otherwise land at
		// the previous step start, or at 0 if no earlier step.
		target := -1.0
		for _, s := range starts {
			if s < pos-1e-9 {
				if s > target {
					target = s
				}
			}
		}
		if target < 0 {
			// No previous step — rewind to H0 of the current cycle
			// (position 0). If we're already there, rewind a full cycle.
			if pos < 1e-6 {
				return time.Duration(cycle) * time.Minute, nil
			}
			target = 0
		}
		// Delta (how far back in cycle we want to go) is (pos - target).
		// Shift H0 FORWARD by that many minutes so new_position = target.
		delta := (pos - target) * float64(time.Minute)
		return time.Duration(delta), nil

	case "forward", "fast_forward":
		// Find the smallest start strictly greater than the current
		// position. If none, land at the cycle boundary (cycle end =
		// start of next cycle's H0).
		target := -1.0
		for _, s := range starts {
			if s > pos+1e-9 {
				if target < 0 || s < target {
					target = s
				}
			}
		}
		if target < 0 {
			target = float64(cycle) // next cycle boundary
		}
		// Delta is (target - pos). Shift H0 BACKWARD by that many
		// minutes so new_position = target.
		delta := (target - pos) * float64(time.Minute)
		return -time.Duration(delta), nil
	}
	return 0, fmt.Errorf("unknown navigation action %q", action)
}

// floorDiv returns math.Floor(a/b) as a float64, avoiding imports.
func floorDiv(a, b float64) float64 {
	q := a / b
	if q >= 0 {
		// integer floor via truncation
		return float64(int64(q))
	}
	// negative: truncation is toward zero, floor goes further negative
	n := int64(q)
	if float64(n) == q {
		return float64(n)
	}
	return float64(n - 1)
}

// resolveBattleRhythmStartTime returns the effective H0 for a new cycle.
// When startAt is empty the result is `now`. When startAt is "HH:MM", we
// interpret it as today's wall clock in the server's local zone; if that
// moment is already in the past (we're past 09:00 when the operator asked
// for 09:00), we shift to the *next* occurrence tomorrow.
func resolveBattleRhythmStartTime(startAt string, now time.Time) (time.Time, error) {
	startAt = strings.TrimSpace(startAt)
	if startAt == "" {
		return now, nil
	}
	parts := strings.SplitN(startAt, ":", 2)
	if len(parts) != 2 {
		return time.Time{}, errors.New("start_at must be HH:MM")
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return time.Time{}, errors.New("start_at must be HH:MM in 24-hour format")
	}
	ts := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, now.Location())
	if ts.Before(now) {
		// Already past today; schedule for tomorrow so the cycle actually
		// fires at the requested clock time.
		ts = ts.Add(24 * time.Hour)
	}
	return ts, nil
}
