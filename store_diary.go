package main

import (
	"fmt"
	"time"
)

// ── Diary Store ─────────────────────────────────────────────────────────────

func (s *Store) GetDiary() []DiaryEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]DiaryEntry, len(s.diary))
	copy(out, s.diary)
	return out
}

func (s *Store) GetDiaryByUser(userID int64) []DiaryEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []DiaryEntry
	for _, e := range s.diary {
		if e.UserID == userID {
			out = append(out, e)
		}
	}
	return out
}

func (s *Store) GetDiaryEntryByID(id int64) *DiaryEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, e := range s.diary {
		if e.ID == id {
			cp := e
			return &cp
		}
	}
	return nil
}

func (s *Store) AddDiaryEntry(entry DiaryEntry) (DiaryEntry, error) {
	s.mu.Lock()
	s.nextDiaryID++
	entry.ID = s.nextDiaryID
	entry.CreatedAt = time.Now()
	entry.UpdatedAt = entry.CreatedAt
	s.diary = append(s.diary, entry)
	if len(s.diary) > 50000 {
		s.diary = s.diary[len(s.diary)-50000:]
	}
	snap := append([]DiaryEntry(nil), s.diary...)
	s.mu.Unlock()
	return entry, s.persist("diary.json", snap)
}

func (s *Store) UpdateDiaryEntry(entry DiaryEntry) error {
	s.mu.Lock()
	for i, e := range s.diary {
		if e.ID == entry.ID {
			entry.CreatedAt = e.CreatedAt
			entry.UpdatedAt = time.Now()
			s.diary[i] = entry
			snap := append([]DiaryEntry(nil), s.diary...)
			s.mu.Unlock()
			return s.persist("diary.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("diary entry %d not found", entry.ID)
}

func (s *Store) DeleteDiaryEntry(id int64) error {
	s.mu.Lock()
	for i, e := range s.diary {
		if e.ID == id {
			s.diary = append(s.diary[:i], s.diary[i+1:]...)
			snap := append([]DiaryEntry(nil), s.diary...)
			s.mu.Unlock()
			return s.persist("diary.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("diary entry %d not found", id)
}

func (s *Store) AddDiaryAttachment(entryID int64, att DiaryAttachment) error {
	s.mu.Lock()
	for i, e := range s.diary {
		if e.ID == entryID {
			s.diary[i].Attachments = append(s.diary[i].Attachments, att)
			s.diary[i].UpdatedAt = time.Now()
			snap := append([]DiaryEntry(nil), s.diary...)
			s.mu.Unlock()
			return s.persist("diary.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("diary entry %d not found", entryID)
}
