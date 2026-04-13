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
