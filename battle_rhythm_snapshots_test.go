package main

import (
	"os"
	"strings"
	"testing"
	"time"
)

// TestRenderBattleRhythmCSV pins the header row and basic serialisation so
// downstream consumers of the snapshot format don't break silently.
func TestRenderBattleRhythmCSV(t *testing.T) {
	entries := []KeyTerrainEntry{
		{SeqNum: 1, Zone: "North", Priority: 1, Function: "Power",
			Status: "working", Trend: "stable", Threat: "Phishing",
			ResponsibleName: "alice"},
	}
	data, err := renderBattleRhythmCSV(entries)
	if err != nil {
		t.Fatal(err)
	}
	s := string(data)
	if !strings.HasPrefix(s, "seq_num,zone,priority,function,status,trend,") {
		t.Errorf("unexpected CSV header:\n%s", s)
	}
	if !strings.Contains(s, "Power") || !strings.Contains(s, "alice") {
		t.Errorf("row data missing:\n%s", s)
	}
}

// TestRenderBattleRhythmJSONXMLSVG is a smoke test — we just want all
// three non-CSV formats to produce something non-empty and syntactically
// reasonable so a broken struct field doesn't silently corrupt snapshots.
func TestRenderBattleRhythmJSONXMLSVG(t *testing.T) {
	entries := []KeyTerrainEntry{
		{SeqNum: 1, Function: "Power", Status: "degraded"},
	}
	cycleStart := time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC)

	j, err := renderBattleRhythmJSON(entries, cycleStart, 30)
	if err != nil {
		t.Fatalf("json: %v", err)
	}
	if !strings.Contains(string(j), `"cycle_start"`) || !strings.Contains(string(j), `"offset_min": 30`) {
		t.Errorf("json missing header fields:\n%s", j)
	}

	x, err := renderBattleRhythmXML(entries, cycleStart, 30)
	if err != nil {
		t.Fatalf("xml: %v", err)
	}
	if !strings.Contains(string(x), "<key_terrain_snapshot") || !strings.Contains(string(x), `offset_min="30"`) {
		t.Errorf("xml missing header fields:\n%s", x)
	}

	svg, err := renderBattleRhythmSVG(entries, cycleStart, 30)
	if err != nil {
		t.Fatalf("svg: %v", err)
	}
	if !strings.HasPrefix(string(svg), `<?xml`) || !strings.Contains(string(svg), "<svg") {
		t.Errorf("svg header malformed:\n%s", svg)
	}
	if !strings.Contains(string(svg), "Power") {
		t.Errorf("svg missing entry data:\n%s", svg)
	}
}

// TestRunDueBattleRhythmSnapshots exercises the end-to-end scheduler:
// configure a 120-minute cycle with snapshots at H+0 and H+15 in CSV+JSON
// formats, then call the runDue function at a synthetic "now" exactly at
// H+15 and verify that two files were written (csv + json) under the
// cycle-start directory.
func TestRunDueBattleRhythmSnapshots(t *testing.T) {
	app, _ := newTestApp(t)

	// Seed the board with one entry so the snapshot has content.
	_, _ = app.store.CreateKeyTerrainEntry(KeyTerrainEntry{Function: "Power", Status: "working"})

	cycleStart := time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC)
	cfg := BattleRhythmConfig{
		Enabled:         true,
		ShowClock:       true,
		CycleMinutes:    120,
		StartedAt:       &cycleStart,
		SnapshotOffsets: []int{0, 15},
		SnapshotFormats: []string{"csv", "json"},
	}
	settings := app.store.GetKeyTerrainSettings()
	settings.BattleRhythm = cfg
	if err := app.store.SaveKeyTerrainSettings(settings); err != nil {
		t.Fatal(err)
	}

	// Fire the scheduler at exactly H+15.
	now := cycleStart.Add(15 * time.Minute)
	app.runDueBattleRhythmSnapshots(now)

	// Verify the snapshot files exist.
	dir := app.store.BattleRhythmSnapshotDir()
	cycleDir := safeTimestamp(cycleStart)
	for _, name := range []string{"h+15.csv", "h+15.json"} {
		path := dir + "/" + cycleDir + "/" + name
		info, err := os.Stat(path)
		if err != nil {
			t.Errorf("expected %s to exist: %v", name, err)
			continue
		}
		if info.Size() == 0 {
			t.Errorf("%s is empty", name)
		}
	}
	// Running the scheduler a second time for the same offset must NOT
	// re-write the files (deduplication via os.Stat).
	firstInfo, _ := os.Stat(dir + "/" + cycleDir + "/h+15.csv")
	time.Sleep(10 * time.Millisecond)
	app.runDueBattleRhythmSnapshots(now)
	secondInfo, _ := os.Stat(dir + "/" + cycleDir + "/h+15.csv")
	if !firstInfo.ModTime().Equal(secondInfo.ModTime()) {
		t.Errorf("snapshot should not be overwritten on re-fire")
	}
}
