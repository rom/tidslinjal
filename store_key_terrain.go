package main

import (
	"fmt"
	"time"
)

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
