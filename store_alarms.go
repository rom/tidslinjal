package main

import (
	"fmt"
	"time"
)

// ── Alarms ────────────────────────────────────────────────────────────────────

func (s *Store) GetAlarmsByUser(userID int64) []Alarm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Alarm
	for _, a := range s.alarms {
		if a.UserID == userID {
			result = append(result, a)
		}
	}
	return result
}

func (s *Store) GetActiveAlarms() []Alarm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Alarm
	for _, a := range s.alarms {
		if a.IsActive && !a.Fired {
			result = append(result, a)
		}
	}
	return result
}

func (s *Store) CreateAlarm(a Alarm) (Alarm, error) {
	s.mu.Lock()
	s.nextAlarmID++
	a.ID = s.nextAlarmID
	a.CreatedAt = time.Now()
	a.IsActive = true
	a.Fired = false
	s.alarms = append(s.alarms, a)
	snap := append([]Alarm(nil), s.alarms...)
	s.mu.Unlock()
	return a, s.persist("alarms.json", snap)
}

func (s *Store) MarkAlarmFired(id int64) error {
	s.mu.Lock()
	for i := range s.alarms {
		if s.alarms[i].ID == id {
			s.alarms[i].Fired = true
			snap := append([]Alarm(nil), s.alarms...)
			s.mu.Unlock()
			return s.persist("alarms.json", snap)
		}
	}
	s.mu.Unlock()
	return nil
}

func (s *Store) GetAlarmByID(id int64) (Alarm, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, a := range s.alarms {
		if a.ID == id {
			return a, true
		}
	}
	return Alarm{}, false
}

func (s *Store) AckAlarm(id, userID int64) error {
	s.mu.Lock()
	found := false
	for i := range s.alarms {
		if s.alarms[i].ID == id && s.alarms[i].UserID == userID {
			now := time.Now()
			s.alarms[i].AcknowledgedAt = &now
			s.alarms[i].IsActive = false
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("alarm not found")
	}
	snap := append([]Alarm(nil), s.alarms...)
	s.mu.Unlock()
	return s.persist("alarms.json", snap)
}

func (s *Store) DeleteAlarm(id, userID int64) error {
	s.mu.Lock()
	found := false
	for i, a := range s.alarms {
		if a.ID == id && a.UserID == userID {
			s.alarms = append(s.alarms[:i], s.alarms[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("alarm not found")
	}
	snap := append([]Alarm(nil), s.alarms...)
	s.mu.Unlock()
	return s.persist("alarms.json", snap)
}

// ── Locks ─────────────────────────────────────────────────────────────────────

func (s *Store) GetLocks() []LockedSlot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]LockedSlot, len(s.locks))
	copy(result, s.locks)
	return result
}

func (s *Store) CreateLock(l LockedSlot) (LockedSlot, error) {
	s.mu.Lock()
	s.nextLockID++
	l.ID = s.nextLockID
	l.CreatedAt = time.Now()
	s.locks = append(s.locks, l)
	snap := append([]LockedSlot(nil), s.locks...)
	s.mu.Unlock()
	return l, s.persist("locks.json", snap)
}

func (s *Store) DeleteLock(id int64) error {
	s.mu.Lock()
	found := false
	for i, l := range s.locks {
		if l.ID == id {
			s.locks = append(s.locks[:i], s.locks[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("lock not found")
	}
	snap := append([]LockedSlot(nil), s.locks...)
	s.mu.Unlock()
	return s.persist("locks.json", snap)
}

// DeleteLockAuthorized deletes a lock if the user is authorized (admin or creator).
func (s *Store) DeleteLockAuthorized(id, userID int64, isAdmin bool) error {
	s.mu.Lock()
	for i, l := range s.locks {
		if l.ID == id {
			if !isAdmin && l.LockedBy != userID {
				s.mu.Unlock()
				return fmt.Errorf("not authorized to delete this lock")
			}
			s.locks = append(s.locks[:i], s.locks[i+1:]...)
			snap := append([]LockedSlot(nil), s.locks...)
			s.mu.Unlock()
			return s.persist("locks.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("lock not found")
}
