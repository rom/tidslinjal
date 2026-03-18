package main

import (
	"time"
)

// ── Sessions ──────────────────────────────────────────────────────────────────

// GetSession is O(1) via index map. Also validates expiry.
func (s *Store) GetSession(id string) (*Session, bool) {
	s.mu.RLock()
	sess, ok := s.sessionByID[id]
	s.mu.RUnlock()
	if !ok || !sess.ExpiresAt.After(time.Now()) {
		return nil, false
	}
	return &sess, true
}

func (s *Store) CreateSession(sess Session) error {
	s.mu.Lock()
	s.sessions = append(s.sessions, sess)
	s.sessionByID[sess.ID] = sess
	snap := append([]Session(nil), s.sessions...)
	s.mu.Unlock()
	return s.persist("sessions.json", snap)
}

func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	for i, sess := range s.sessions {
		if sess.ID == id {
			s.sessions = append(s.sessions[:i], s.sessions[i+1:]...)
			delete(s.sessionByID, id)
			snap := append([]Session(nil), s.sessions...)
			s.mu.Unlock()
			return s.persist("sessions.json", snap)
		}
	}
	s.mu.Unlock()
	return nil
}

// DeleteSessionsForUser removes all sessions belonging to a specific user (V-03 fix).
func (s *Store) DeleteSessionsForUser(userID int64) {
	s.mu.Lock()
	filtered := s.sessions[:0]
	for _, sess := range s.sessions {
		if sess.UserID == userID {
			delete(s.sessionByID, sess.ID)
		} else {
			filtered = append(filtered, sess)
		}
	}
	s.sessions = filtered
	snap := append([]Session(nil), s.sessions...)
	s.mu.Unlock()
	s.persist("sessions.json", snap) //nolint
}

func (s *Store) CleanExpiredSessions() {
	s.mu.Lock()
	now := time.Now()
	var active []Session
	for _, sess := range s.sessions {
		if sess.ExpiresAt.After(now) {
			active = append(active, sess)
		}
	}
	changed := len(active) != len(s.sessions)
	if changed {
		s.sessions = active
		s.rebuildSessionIdx()
	}
	s.mu.Unlock()
	if changed {
		snap := append([]Session(nil), active...)
		s.persist("sessions.json", snap) //nolint
	}
}

// ── Editing Locks (collaborative editing) ────────────────────────────────────

// AcquireEditingLock tries to lock an event for editing by userID.
// Returns true if the lock was acquired; false if another user holds it.
func (s *Store) AcquireEditingLock(eventID, userID int64, userName string) (EditingLock, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	// Remove any expired locks first
	active := s.editingLocks[:0]
	for _, l := range s.editingLocks {
		if l.ExpiresAt.After(now) {
			active = append(active, l)
		}
	}
	s.editingLocks = active
	// Check if another user holds the lock
	for i, l := range s.editingLocks {
		if l.EventID == eventID {
			if l.UserID == userID {
				// Refresh own lock
				s.editingLocks[i].ExpiresAt = now.Add(2 * time.Minute)
				return s.editingLocks[i], true
			}
			// Another user holds it
			return l, false
		}
	}
	lock := EditingLock{
		EventID:   eventID,
		UserID:    userID,
		UserName:  userName,
		LockedAt:  now,
		ExpiresAt: now.Add(2 * time.Minute),
	}
	s.editingLocks = append(s.editingLocks, lock)
	return lock, true
}

// ReleaseEditingLock releases the editing lock for an event.
func (s *Store) ReleaseEditingLock(eventID, userID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, l := range s.editingLocks {
		if l.EventID == eventID && l.UserID == userID {
			s.editingLocks = append(s.editingLocks[:i], s.editingLocks[i+1:]...)
			return
		}
	}
}

// GetEditingLock returns the current editing lock for an event (if any).
func (s *Store) GetEditingLock(eventID int64) (*EditingLock, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	for i, l := range s.editingLocks {
		if l.EventID == eventID && l.ExpiresAt.After(now) {
			_ = i
			cp := l
			return &cp, true
		}
	}
	return nil, false
}

// GetAllEditingLocks returns all active editing locks.
func (s *Store) GetAllEditingLocks() []EditingLock {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	var out []EditingLock
	for _, l := range s.editingLocks {
		if l.ExpiresAt.After(now) {
			out = append(out, l)
		}
	}
	return out
}

// ── Session management (admin) ────────────────────────────────────────────────

// SessionInfo is Session enriched with display name for admin UI
type SessionInfo struct {
	Session
	DisplayName string `json:"display_name"`
	Username    string `json:"username"`
}

// GetAllSessions returns all non-expired sessions with user info attached.
func (s *Store) GetAllSessions() []SessionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	out := make([]SessionInfo, 0)
	for _, sess := range s.sessions {
		if !sess.ExpiresAt.After(now) {
			continue
		}
		si := SessionInfo{Session: sess}
		for _, u := range s.users {
			if u.ID == sess.UserID {
				si.DisplayName = u.DisplayName
				si.Username = u.Username
				break
			}
		}
		out = append(out, si)
	}
	return out
}
