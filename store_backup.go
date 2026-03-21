package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── Gradual Backup ─────────────────────────────────────────────────────────────

const gradualBackupDefaultInterval = 15
const gradualBackupDefaultMax      = 480
const gradualBackupDir             = "snapshots"

// GetGradualBackupSettings reads the gradual backup configuration from disk.
// Returns sensible defaults if the file does not exist yet.
func (s *Store) GetGradualBackupSettings() GradualBackupSettings {
	raw, err := os.ReadFile(filepath.Join(s.dataDir, "gradual_backup.json"))
	var cfg GradualBackupSettings
	if err != nil || len(raw) < 2 {
		// File not saved yet → all defaults, enabled by default
		cfg.Enabled = true
		cfg.IntervalMinutes = gradualBackupDefaultInterval
		cfg.MaxSnapshots = gradualBackupDefaultMax
		return cfg
	}
	_ = json.Unmarshal(raw, &cfg)
	if cfg.IntervalMinutes <= 0 {
		cfg.IntervalMinutes = gradualBackupDefaultInterval
	}
	if cfg.MaxSnapshots <= 0 {
		cfg.MaxSnapshots = gradualBackupDefaultMax
	}
	return cfg
}

// SaveGradualBackupSettings writes gradual backup settings to disk.
func (s *Store) SaveGradualBackupSettings(cfg GradualBackupSettings) error {
	if cfg.IntervalMinutes <= 0 {
		cfg.IntervalMinutes = gradualBackupDefaultInterval
	}
	if cfg.MaxSnapshots <= 0 {
		cfg.MaxSnapshots = gradualBackupDefaultMax
	}
	data, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dataDir, "gradual_backup.json"), data, 0600)
}

// snapshotDir returns the path to the snapshots subdirectory, creating it if needed.
func (s *Store) snapshotDir() string {
	d := filepath.Join(s.dataDir, gradualBackupDir)
	_ = os.MkdirAll(d, 0755)
	return d
}

// CreateGradualBackupSnapshot takes an in-memory ZIP of all data JSON files,
// encrypts it with AES-256-GCM using the admin password hash as key material,
// and saves it to the snapshots directory. Returns the filename of the snapshot.
func (s *Store) CreateGradualBackupSnapshot() (string, error) {
	snapDir := s.snapshotDir()
	filename := fmt.Sprintf("snapshot-%s.zip.enc", time.Now().UTC().Format("2006-01-02T150405"))
	dstPath := filepath.Join(snapDir, filename)

	// Build zip in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	files := []string{
		"event_types.json", "users.json", "preferences.json", "groups.json",
		"memberships.json", "layers.json", "events.json", "attachments.json",
		"alarms.json", "locks.json", "audit.json", "exercise.json",
		"comments.json", "phases.json", "templates.json", "roles.json",
		"registration.json", "invitations.json", "filter_presets.json",
		"event_versions.json", "auto_report_schedules.json",
		"map_resources.json", "map_locations.json", "references.json",
		"rooms.json", "custom_resource_types.json", "day_labels.json",
		"boards.json", "board_items.json",
		"decision_log.json", "event_log.json", "log_book.json",
		"routing_rules.json", "connectors.json",
		"questionnaires.json", "checklist_templates.json", "checklist_instances.json",
		"tags.json", "notifications.json", "polls.json",
		"person_ready_checks.json",
	}
	for _, fn := range files {
		data, err := os.ReadFile(filepath.Join(s.dataDir, fn))
		if err != nil {
			continue // skip missing
		}
		fw, err := zw.Create(fn)
		if err != nil {
			continue
		}
		_, _ = fw.Write(data)
	}
	if err := zw.Close(); err != nil {
		return "", err
	}

	// Encrypt with admin password hash
	keyMaterial := s.GetAdminPasswordHash()
	encrypted, err := encryptBackupData(buf.Bytes(), keyMaterial)
	if err != nil {
		return "", fmt.Errorf("encrypt snapshot: %w", err)
	}
	if err := os.WriteFile(dstPath, encrypted, 0600); err != nil {
		return "", fmt.Errorf("write snapshot file: %w", err)
	}
	return filename, nil
}

// ListGradualBackupSnapshots returns metadata for all snapshot files, newest first.
func (s *Store) ListGradualBackupSnapshots() ([]GradualBackupSnapshot, error) {
	snapDir := s.snapshotDir()
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []GradualBackupSnapshot{}, nil
		}
		return nil, err
	}
	var out []GradualBackupSnapshot
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || (!strings.HasSuffix(name, ".zip") && !strings.HasSuffix(name, ".zip.enc")) {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, GradualBackupSnapshot{
			Filename:  name,
			CreatedAt: fi.ModTime().UTC(),
			SizeBytes: fi.Size(),
		})
	}
	// Sort newest first
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// RestoreGradualBackupSnapshot restores data files from a named snapshot ZIP.
// Returns the count of files restored. If areas is non-empty, only files in
// those areas are restored (uses backupRestoreAreas from handlers_backup.go).
func (s *Store) RestoreGradualBackupSnapshot(filename string, areas []string) (int, error) {
	// Sanitise: filename must be a plain name with no path separators
	if strings.ContainsAny(filename, "/\\") {
		return 0, fmt.Errorf("invalid snapshot filename")
	}
	snapPath := filepath.Join(s.snapshotDir(), filename)
	raw, err := os.ReadFile(snapPath)
	if err != nil {
		return 0, fmt.Errorf("snapshot not found: %w", err)
	}

	// Decrypt if not a plain zip (magic bytes "PK" = unencrypted; anything else = encrypted)
	if len(raw) < 2 || raw[0] != 0x50 || raw[1] != 0x4B {
		keyMaterial := s.GetAdminPasswordHash()
		decrypted, err := decryptBackupData(raw, keyMaterial)
		if err != nil {
			return 0, fmt.Errorf("decrypt snapshot: %w", err)
		}
		raw = decrypted
	}

	zr, err := zip.NewReader(&bytesReaderAt{raw}, int64(len(raw)))
	if err != nil {
		return 0, fmt.Errorf("invalid zip: %w", err)
	}

	// Build allowed file set from areas, or use default allow-all
	allowed := map[string]bool{}
	if len(areas) > 0 {
		for _, area := range areas {
			if files, ok := backupRestoreAreas[area]; ok {
				for _, f := range files {
					allowed[f] = true
				}
			}
		}
	}
	if len(allowed) == 0 {
		allowed = map[string]bool{
			"event_types.json": true, "users.json": true, "preferences.json": true,
			"groups.json": true, "memberships.json": true, "layers.json": true,
			"events.json": true, "attachments.json": true, "alarms.json": true,
			"locks.json": true, "exercise.json": true, "comments.json": true,
			"phases.json": true, "templates.json": true, "roles.json": true,
			"registration.json": true, "invitations.json": true,
			"filter_presets.json": true, "event_versions.json": true,
			"auto_report_schedules.json": true, "map_resources.json": true,
			"map_locations.json": true, "references.json": true,
			"rooms.json": true, "custom_resource_types.json": true,
			"decision_log.json": true, "event_log.json": true, "log_book.json": true,
			"day_labels.json": true, "boards.json": true, "board_items.json": true,
			"routing_rules.json": true, "connectors.json": true,
			"questionnaires.json": true, "checklist_templates.json": true,
			"checklist_instances.json": true, "tags.json": true,
			"notifications.json": true, "polls.json": true,
			"person_ready_checks.json": true,
		}
	}

	restored := 0
	for _, f := range zr.File {
		if !allowed[f.Name] {
			continue
		}
		// H-09 fix: limit decompressed size to prevent zip bomb attacks (100MB per file)
		if f.UncompressedSize64 > 100<<20 {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		fdata, err := io.ReadAll(io.LimitReader(rc, 100<<20))
		rc.Close()
		if err != nil {
			continue
		}
		// M-17 fix: write restored files with 0600 permissions (not world-readable)
		if err := os.WriteFile(filepath.Join(s.dataDir, f.Name), fdata, 0600); err != nil {
			continue
		}
		restored++
	}
	return restored, nil
}

// bytesReaderAt wraps a byte slice to satisfy zip.NewReader's io.ReaderAt interface.
type bytesReaderAt struct{ d []byte }
func (b *bytesReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(b.d)) { return 0, io.EOF }
	n := copy(p, b.d[off:])
	return n, nil
}

// PruneGradualBackupSnapshots removes the oldest snapshots keeping at most max.
func (s *Store) PruneGradualBackupSnapshots(max int) error {
	if max <= 0 {
		max = gradualBackupDefaultMax
	}
	snapshots, err := s.ListGradualBackupSnapshots()
	if err != nil {
		return err
	}
	// snapshots is newest-first; delete beyond max
	for i := max; i < len(snapshots); i++ {
		_ = os.Remove(filepath.Join(s.snapshotDir(), snapshots[i].Filename))
	}
	return nil
}
