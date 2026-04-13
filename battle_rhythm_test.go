package main

import (
	"testing"
	"time"
)

// TestComputeBattleRhythmState pins the clock-state math for the shared
// exercise rhythm: H0 tracking, modulo-cycle position, pause freezing,
// and current/next step detection with positive and negative offsets.
func TestComputeBattleRhythmState(t *testing.T) {
	intPtr := func(i int) *int { return &i }
	h0 := time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC)
	cfg := BattleRhythmConfig{
		Enabled:      true,
		ShowClock:    true,
		CycleMinutes: 120,
		StartedAt:    &h0,
		Steps: []BattleRhythmStep{
			{Name: "Alpha", StartOffsetMin: -15, EndOffsetMin: intPtr(0)},  // last 15 min of prior cycle
			{Name: "Bravo", StartOffsetMin: 0, EndOffsetMin: intPtr(30)},
			{Name: "Charlie", StartOffsetMin: 60},                           // instant at H+60
			{Name: "Delta", StartOffsetMin: 90, EndOffsetMin: intPtr(120)},
		},
	}

	// 1. Still before H0 — clock is armed but not yet counting. The new
	// Scheduled state means Running=false, Scheduled=true, and the
	// countdown in ScheduledSeconds is the positive delta to H0.
	before := h0.Add(-5 * time.Minute)
	st := computeBattleRhythmState(cfg, before)
	if st.Running {
		t.Errorf("expected not-running before H0, got running=%v", st.Running)
	}
	if !st.Scheduled {
		t.Errorf("expected Scheduled=true before H0")
	}
	if st.ScheduledSeconds < 299 || st.ScheduledSeconds > 301 {
		t.Errorf("ScheduledSeconds = %v, want ~300", st.ScheduledSeconds)
	}

	// 2. At H+15 — inside Bravo, next step Charlie in 45 min.
	at15 := h0.Add(15 * time.Minute)
	st = computeBattleRhythmState(cfg, at15)
	if st.PositionMin < 14.99 || st.PositionMin > 15.01 {
		t.Errorf("PositionMin = %v, want ~15", st.PositionMin)
	}
	if st.CurrentStep == nil || st.CurrentStep.Name != "Bravo" {
		t.Errorf("current step = %v, want Bravo", st.CurrentStep)
	}
	if st.NextStep == nil || st.NextStep.Name != "Charlie" {
		t.Errorf("next step = %v, want Charlie", st.NextStep)
	}
	if st.NextStepInMin == nil || *st.NextStepInMin < 44.99 || *st.NextStepInMin > 45.01 {
		t.Errorf("next_step_in_min = %v, want ~45", st.NextStepInMin)
	}

	// 3. At H+125 (into second cycle, position 5) — inside Bravo of cycle 2.
	at125 := h0.Add(125 * time.Minute)
	st = computeBattleRhythmState(cfg, at125)
	if st.PositionMin < 4.99 || st.PositionMin > 5.01 {
		t.Errorf("PositionMin after wrap = %v, want ~5", st.PositionMin)
	}
	if st.CurrentStep == nil || st.CurrentStep.Name != "Bravo" {
		t.Errorf("current after wrap = %v, want Bravo", st.CurrentStep)
	}
	if st.CycleStart == nil || !st.CycleStart.Equal(h0.Add(120*time.Minute)) {
		t.Errorf("cycle start after wrap = %v, want %v", st.CycleStart, h0.Add(120*time.Minute))
	}

	// 4. Pause freezes the position.
	paused := h0.Add(15 * time.Minute)
	cfg2 := cfg
	cfg2.PausedAt = &paused
	stPaused := computeBattleRhythmState(cfg2, h0.Add(99*time.Minute))
	if !stPaused.Paused {
		t.Errorf("expected Paused=true")
	}
	if stPaused.PositionMin < 14.99 || stPaused.PositionMin > 15.01 {
		t.Errorf("paused PositionMin = %v, want ~15 (frozen at pause time)", stPaused.PositionMin)
	}

	// 5. Clock stopped (no StartedAt) — Running=false, no step info.
	stopped := BattleRhythmConfig{Enabled: true, CycleMinutes: 120}
	stStopped := computeBattleRhythmState(stopped, h0)
	if stStopped.Running {
		t.Errorf("expected stopped clock, got Running=true")
	}
}

// TestComputeBattleRhythmStepShift pins the backward and fast_forward
// navigation math. Given a cycle with steps at fixed offsets, each
// action should return an H0 shift that lands the apparent clock
// position on the correct neighbouring step start.
//
// Note: "forward" is NOT tested here because it no longer uses H0
// shifts — it mutates the Steps slice instead. See
// TestDonateLeftoverToNextStep below.
func TestComputeBattleRhythmStepShift(t *testing.T) {
	intPtr := func(i int) *int { return &i }
	h0 := time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC)
	cfg := BattleRhythmConfig{
		Enabled:      true,
		CycleMinutes: 120,
		StartedAt:    &h0,
		Steps: []BattleRhythmStep{
			{Name: "Brief", StartOffsetMin: 30, EndOffsetMin: intPtr(60)},
			{Name: "Assess", StartOffsetMin: 60, EndOffsetMin: intPtr(90)},
			{Name: "Execute", StartOffsetMin: 90, EndOffsetMin: intPtr(120)},
		},
	}
	at45 := h0.Add(45 * time.Minute)

	// fast_forward at H+45 → shifts H0 backward by 15 min, position 60.
	ff, err := computeBattleRhythmStepShift(cfg, at45, "fast_forward")
	if err != nil {
		t.Fatalf("fast_forward: %v", err)
	}
	if ff != -15*time.Minute {
		t.Errorf("fast_forward at H+45: got shift %v, want -15m", ff)
	}
	cfgFF := cfg
	newH0FF := h0.Add(ff)
	cfgFF.StartedAt = &newH0FF
	stFF := computeBattleRhythmState(cfgFF, at45)
	if stFF.PositionMin < 59.99 || stFF.PositionMin > 60.01 {
		t.Errorf("fast_forward shift landed at %v, want ~60", stFF.PositionMin)
	}
	if stFF.CurrentStep == nil || stFF.CurrentStep.Name != "Assess" {
		t.Errorf("fast_forward shift: current step = %v, want Assess", stFF.CurrentStep)
	}

	// backward at H+45 → rewind to H+30 (start of Brief), shift +15 min.
	back, err := computeBattleRhythmStepShift(cfg, at45, "backward")
	if err != nil {
		t.Fatalf("backward: %v", err)
	}
	if back != 15*time.Minute {
		t.Errorf("backward at H+45: got shift %v, want +15m", back)
	}
	cfgBack := cfg
	newH0Back := h0.Add(back)
	cfgBack.StartedAt = &newH0Back
	stBack := computeBattleRhythmState(cfgBack, at45)
	if stBack.PositionMin < 29.99 || stBack.PositionMin > 30.01 {
		t.Errorf("backward shift landed at %v, want ~30", stBack.PositionMin)
	}

	// fast_forward past the last step rolls to the next cycle boundary.
	at100 := h0.Add(100 * time.Minute) // inside Execute (H+90..H+120)
	ffRoll, err := computeBattleRhythmStepShift(cfg, at100, "fast_forward")
	if err != nil {
		t.Fatalf("fast_forward rollover: %v", err)
	}
	if ffRoll != -20*time.Minute {
		t.Errorf("fast_forward rollover: got %v, want -20m (to reach next cycle start)", ffRoll)
	}

	// Backward when already at H+30 (start of Brief) rewinds to H+0.
	at30 := h0.Add(30 * time.Minute)
	backToZero, err := computeBattleRhythmStepShift(cfg, at30, "backward")
	if err != nil {
		t.Fatalf("backward to zero: %v", err)
	}
	if backToZero != 30*time.Minute {
		t.Errorf("backward from H+30: got %v, want +30m (→ H+0)", backToZero)
	}

	// Backward when already at H+0 rewinds one full cycle.
	atZero := h0
	backFullCycle, err := computeBattleRhythmStepShift(cfg, atZero, "backward")
	if err != nil {
		t.Fatalf("backward full cycle: %v", err)
	}
	if backFullCycle != 120*time.Minute {
		t.Errorf("backward from H+0: got %v, want +120m (one full cycle)", backFullCycle)
	}

	// Unknown action returns an error. "forward" is also not accepted
	// here any more — it goes through donateLeftoverToNextStep.
	for _, bad := range []string{"wiggle", "forward"} {
		if _, err := computeBattleRhythmStepShift(cfg, at45, bad); err == nil {
			t.Errorf("expected error for action %q", bad)
		}
	}
}

// TestDonateLeftoverToNextStep pins the "forward" semantic: pressing
// forward at H+45 (mid-Brief) should shorten Brief to end at H+45 and
// move Assess's start from H+60 back to H+45, so Assess gains 15 min
// of wall clock while the cycle length and H0 are untouched.
func TestDonateLeftoverToNextStep(t *testing.T) {
	intPtr := func(i int) *int { return &i }
	h0 := time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC)
	cfg := BattleRhythmConfig{
		Enabled:      true,
		CycleMinutes: 120,
		StartedAt:    &h0,
		Steps: []BattleRhythmStep{
			{Name: "Brief", StartOffsetMin: 30, EndOffsetMin: intPtr(60)},
			{Name: "Assess", StartOffsetMin: 60, EndOffsetMin: intPtr(90)},
			{Name: "Execute", StartOffsetMin: 90, EndOffsetMin: intPtr(120)},
		},
	}
	at45 := h0.Add(45 * time.Minute)

	newSteps := donateLeftoverToNextStep(cfg.Steps, cfg, at45)
	if len(newSteps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(newSteps))
	}

	brief := newSteps[0]
	if brief.Name != "Brief" {
		t.Errorf("step 0 name = %q, want Brief", brief.Name)
	}
	if brief.StartOffsetMin != 30 {
		t.Errorf("Brief.start = %d, want 30 (unchanged)", brief.StartOffsetMin)
	}
	if brief.EndOffsetMin == nil || *brief.EndOffsetMin != 45 {
		t.Errorf("Brief.end = %v, want 45 (truncated from 60)", brief.EndOffsetMin)
	}

	assess := newSteps[1]
	if assess.Name != "Assess" {
		t.Errorf("step 1 name = %q, want Assess", assess.Name)
	}
	if assess.StartOffsetMin != 45 {
		t.Errorf("Assess.start = %d, want 45 (moved back from 60)", assess.StartOffsetMin)
	}
	if assess.EndOffsetMin == nil || *assess.EndOffsetMin != 90 {
		t.Errorf("Assess.end = %v, want 90 (unchanged → step grew from 30min to 45min)", assess.EndOffsetMin)
	}

	execute := newSteps[2]
	if execute.StartOffsetMin != 90 || execute.EndOffsetMin == nil || *execute.EndOffsetMin != 120 {
		t.Errorf("Execute should be unchanged, got start=%d end=%v", execute.StartOffsetMin, execute.EndOffsetMin)
	}

	// Applying the new steps to cfg and re-computing the state: at H+45
	// the current step is now Assess (since Assess starts at 45).
	cfg2 := cfg
	cfg2.Steps = newSteps
	st := computeBattleRhythmState(cfg2, at45)
	if st.CurrentStep == nil || st.CurrentStep.Name != "Assess" {
		t.Errorf("after forward mutation: current step = %v, want Assess", st.CurrentStep)
	}

	// Second forward press at H+60 (now 15 min into the grown Assess).
	// Assess should be truncated to end at 60; Execute's start should
	// move to 60 (so Execute grows from 30 min to 60 min).
	at60 := h0.Add(60 * time.Minute)
	newSteps2 := donateLeftoverToNextStep(newSteps, cfg2, at60)
	if newSteps2[1].EndOffsetMin == nil || *newSteps2[1].EndOffsetMin != 60 {
		t.Errorf("second forward: Assess.end = %v, want 60", newSteps2[1].EndOffsetMin)
	}
	if newSteps2[2].StartOffsetMin != 60 {
		t.Errorf("second forward: Execute.start = %d, want 60", newSteps2[2].StartOffsetMin)
	}
	if newSteps2[2].EndOffsetMin == nil || *newSteps2[2].EndOffsetMin != 120 {
		t.Errorf("second forward: Execute.end = %v, want 120 (unchanged)", newSteps2[2].EndOffsetMin)
	}

	// Forward when there's no next step in the current cycle: current
	// step is truncated; next cycle is not touched (mutation is a no-op
	// on that side).
	at100 := h0.Add(100 * time.Minute) // inside Execute
	newSteps3 := donateLeftoverToNextStep(cfg.Steps, cfg, at100)
	if newSteps3[2].EndOffsetMin == nil || *newSteps3[2].EndOffsetMin != 100 {
		t.Errorf("forward at end of cycle: Execute.end = %v, want 100 (truncated)", newSteps3[2].EndOffsetMin)
	}

	// Input is never mutated in place.
	if cfg.Steps[0].EndOffsetMin == nil || *cfg.Steps[0].EndOffsetMin != 60 {
		t.Errorf("donateLeftoverToNextStep mutated the input slice")
	}
}

// TestComputeBattleRhythmStateOverlappingSteps verifies that two (or
// more) steps whose intervals genuinely overlap at the current position
// are both reported in CurrentSteps, in definition order. The first
// active step remains the backwards-compatible CurrentStep field so
// older clients that only look at CurrentStep still get a sensible
// answer.
func TestComputeBattleRhythmStateOverlappingSteps(t *testing.T) {
	intPtr := func(i int) *int { return &i }
	h0 := time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC)
	cfg := BattleRhythmConfig{
		Enabled:      true,
		CycleMinutes: 120,
		StartedAt:    &h0,
		Steps: []BattleRhythmStep{
			// Brief [30, 75) — long, overlaps into Assess.
			{Name: "Brief", StartOffsetMin: 30, EndOffsetMin: intPtr(75)},
			// Assess [60, 90) — starts while Brief is still running.
			{Name: "Assess", StartOffsetMin: 60, EndOffsetMin: intPtr(90)},
			// Execute [90, 120) — starts when Assess ends.
			{Name: "Execute", StartOffsetMin: 90, EndOffsetMin: intPtr(120)},
		},
	}

	// At H+70: Brief and Assess both contain this position.
	at70 := h0.Add(70 * time.Minute)
	st := computeBattleRhythmState(cfg, at70)
	if len(st.CurrentSteps) != 2 {
		t.Fatalf("expected 2 active steps at H+70, got %d", len(st.CurrentSteps))
	}
	if st.CurrentSteps[0].Name != "Brief" || st.CurrentSteps[1].Name != "Assess" {
		t.Errorf("overlap order = [%s, %s], want [Brief, Assess]",
			st.CurrentSteps[0].Name, st.CurrentSteps[1].Name)
	}
	// CurrentStep (singular, compat) should be the first active step.
	if st.CurrentStep == nil || st.CurrentStep.Name != "Brief" {
		t.Errorf("CurrentStep (compat) = %v, want Brief", st.CurrentStep)
	}
	// Next step when Brief+Assess are active should be Execute.
	if st.NextStep == nil || st.NextStep.Name != "Execute" {
		t.Errorf("NextStep with overlap active = %v, want Execute", st.NextStep)
	}

	// At H+50: only Brief is active.
	at50 := h0.Add(50 * time.Minute)
	st = computeBattleRhythmState(cfg, at50)
	if len(st.CurrentSteps) != 1 || st.CurrentSteps[0].Name != "Brief" {
		t.Errorf("at H+50: CurrentSteps = %v, want [Brief]", st.CurrentSteps)
	}

	// Half-open interval: at H+60 exactly, Assess has just started and
	// Brief (which actually ends at 75 here) is still running. So the
	// overlap still applies — both active.
	at60 := h0.Add(60 * time.Minute)
	st = computeBattleRhythmState(cfg, at60)
	if len(st.CurrentSteps) != 2 {
		t.Errorf("at H+60 with overlap interval: got %d active steps, want 2", len(st.CurrentSteps))
	}

	// Non-overlapping boundary: in a cycle where Brief is strictly
	// [30, 60) and Assess is [60, 90), at H+60 only Assess should be
	// active (no single-point double-count at the boundary).
	cfgStrict := BattleRhythmConfig{
		Enabled:      true,
		CycleMinutes: 120,
		StartedAt:    &h0,
		Steps: []BattleRhythmStep{
			{Name: "Brief", StartOffsetMin: 30, EndOffsetMin: intPtr(60)},
			{Name: "Assess", StartOffsetMin: 60, EndOffsetMin: intPtr(90)},
		},
	}
	st = computeBattleRhythmState(cfgStrict, at60)
	if len(st.CurrentSteps) != 1 || st.CurrentSteps[0].Name != "Assess" {
		t.Errorf("non-overlapping boundary at H+60: got %v, want [Assess]", st.CurrentSteps)
	}
}

// TestResolveBattleRhythmStartTime covers the "start at 09:00" behaviour:
// when the requested wall-clock time is in the future today, schedule for
// today; when it's already past, schedule for tomorrow.
func TestResolveBattleRhythmStartTime(t *testing.T) {
	// Noon UTC reference.
	now := time.Date(2026, 4, 13, 12, 0, 0, 0, time.UTC)

	// Empty → immediate.
	if got, err := resolveBattleRhythmStartTime("", now); err != nil || !got.Equal(now) {
		t.Errorf("empty start → got %v err %v, want %v", got, err, now)
	}

	// 15:00 today → today 15:00.
	got, err := resolveBattleRhythmStartTime("15:00", now)
	if err != nil {
		t.Fatalf("15:00: %v", err)
	}
	want := time.Date(2026, 4, 13, 15, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("15:00 → got %v, want %v", got, want)
	}

	// 09:00 (already past) → tomorrow 09:00.
	got, err = resolveBattleRhythmStartTime("09:00", now)
	if err != nil {
		t.Fatalf("09:00: %v", err)
	}
	want = time.Date(2026, 4, 14, 9, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("09:00 → got %v, want %v", got, want)
	}

	// Bad formats.
	bad := []string{"bogus", "25:00", "9:60", "nine"}
	for _, s := range bad {
		if _, err := resolveBattleRhythmStartTime(s, now); err == nil {
			t.Errorf("expected error for %q", s)
		}
	}
}
