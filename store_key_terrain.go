package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// BattleRhythmSnapshotDir returns the directory under which automated
// battle-rhythm snapshots of the Key Terrain Board are written, creating
// it if needed. One subdirectory per cycle-start timestamp holds all the
// format files for that cycle's snapshots.
func (s *Store) BattleRhythmSnapshotDir() string {
	dir := filepath.Join(s.dataDir, "key_terrain_battle_rhythm")
	_ = os.MkdirAll(dir, 0o750)
	return dir
}

// ── Key Terrain Store ──────────────────────────────────────────────────────

func (s *Store) GetKeyTerrainEntries() []KeyTerrainEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]KeyTerrainEntry, len(s.keyTerrainEntries))
	copy(out, s.keyTerrainEntries)
	return out
}

func (s *Store) GetKeyTerrainEntryByID(id int64) *KeyTerrainEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, e := range s.keyTerrainEntries {
		if e.ID == id {
			cp := e
			return &cp
		}
	}
	return nil
}

func (s *Store) CreateKeyTerrainEntry(e KeyTerrainEntry) (KeyTerrainEntry, error) {
	s.mu.Lock()
	s.nextKeyTerrainID++
	e.ID = s.nextKeyTerrainID
	e.CreatedAt = time.Now()
	e.UpdatedAt = e.CreatedAt
	s.keyTerrainEntries = append(s.keyTerrainEntries, e)
	snap := append([]KeyTerrainEntry(nil), s.keyTerrainEntries...)
	s.mu.Unlock()
	return e, s.persist("key_terrain.json", snap)
}

func (s *Store) UpdateKeyTerrainEntry(e KeyTerrainEntry) error {
	s.mu.Lock()
	for i, x := range s.keyTerrainEntries {
		if x.ID == e.ID {
			e.UpdatedAt = time.Now()
			s.keyTerrainEntries[i] = e
			snap := append([]KeyTerrainEntry(nil), s.keyTerrainEntries...)
			s.mu.Unlock()
			return s.persist("key_terrain.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("key terrain entry %d not found", e.ID)
}

// GetKeyTerrainBoardAttachments returns a copy of all board-level
// attachments (meeting protocols etc.), sorted newest first.
func (s *Store) GetKeyTerrainBoardAttachments() []KeyTerrainAttachment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]KeyTerrainAttachment, len(s.keyTerrainAttachments))
	copy(out, s.keyTerrainAttachments)
	return out
}

// AddKeyTerrainBoardAttachment appends a new board-level attachment and
// persists. Caller is responsible for writing the file to AttachmentDir().
func (s *Store) AddKeyTerrainBoardAttachment(att KeyTerrainAttachment) error {
	s.mu.Lock()
	s.keyTerrainAttachments = append(s.keyTerrainAttachments, att)
	snap := append([]KeyTerrainAttachment(nil), s.keyTerrainAttachments...)
	s.mu.Unlock()
	return s.persist("key_terrain_attachments.json", snap)
}

// DeleteKeyTerrainBoardAttachment removes an attachment record by its
// stored filename and returns the removed record. The on-disk file is
// deleted by the handler.
func (s *Store) DeleteKeyTerrainBoardAttachment(storedName string) (KeyTerrainAttachment, error) {
	s.mu.Lock()
	var removed KeyTerrainAttachment
	found := false
	for i, a := range s.keyTerrainAttachments {
		if a.StoredName == storedName {
			removed = a
			s.keyTerrainAttachments = append(s.keyTerrainAttachments[:i], s.keyTerrainAttachments[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return removed, fmt.Errorf("attachment not found")
	}
	snap := append([]KeyTerrainAttachment(nil), s.keyTerrainAttachments...)
	s.mu.Unlock()
	return removed, s.persist("key_terrain_attachments.json", snap)
}

func (s *Store) DeleteKeyTerrainEntry(id int64) error {
	s.mu.Lock()
	for i, x := range s.keyTerrainEntries {
		if x.ID == id {
			s.keyTerrainEntries = append(s.keyTerrainEntries[:i], s.keyTerrainEntries[i+1:]...)
			snap := append([]KeyTerrainEntry(nil), s.keyTerrainEntries...)
			s.mu.Unlock()
			return s.persist("key_terrain.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("key terrain entry %d not found", id)
}

// ── Key Terrain Settings ──────────────────────────────────────────────────

func (s *Store) GetKeyTerrainSettings() KeyTerrainSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.keyTerrainSettings
}

func (s *Store) SaveKeyTerrainSettings(settings KeyTerrainSettings) error {
	s.mu.Lock()
	s.keyTerrainSettings = settings
	cp := s.keyTerrainSettings
	s.mu.Unlock()
	return s.persist("key_terrain_settings.json", cp)
}

// ── Key Terrain Snapshots (version control) ───────────────────────────────

func (s *Store) GetKeyTerrainSnapshots() []KeyTerrainSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]KeyTerrainSnapshot, len(s.keyTerrainSnapshots))
	copy(out, s.keyTerrainSnapshots)
	return out
}

func (s *Store) CreateKeyTerrainSnapshot(snap KeyTerrainSnapshot) (KeyTerrainSnapshot, error) {
	s.mu.Lock()
	s.nextKTSnapshotID++
	snap.ID = s.nextKTSnapshotID
	snap.Timestamp = time.Now()
	// Deep-copy current entries into snapshot
	snap.Entries = make([]KeyTerrainEntry, len(s.keyTerrainEntries))
	copy(snap.Entries, s.keyTerrainEntries)
	s.keyTerrainSnapshots = append(s.keyTerrainSnapshots, snap)
	snapAll := append([]KeyTerrainSnapshot(nil), s.keyTerrainSnapshots...)
	s.mu.Unlock()
	return snap, s.persist("key_terrain_snapshots.json", snapAll)
}

func (s *Store) GetKeyTerrainSnapshotByID(id int64) *KeyTerrainSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, snap := range s.keyTerrainSnapshots {
		if snap.ID == id {
			cp := snap
			return &cp
		}
	}
	return nil
}
