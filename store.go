package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Store is a thread-safe in-memory store backed by JSON files
type Store struct {
	mu      sync.RWMutex
	dataDir string

	users    []User
	events   []Event
	alarms   []Alarm
	locks    []LockedSlot
	sessions []Session

	nextUserID  int64
	nextEventID int64
	nextAlarmID int64
	nextLockID  int64
}

func NewStore(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	if err := s.load(); err != nil {
		return nil, fmt.Errorf("load data: %w", err)
	}
	return s, nil
}

func (s *Store) load() error {
	s.loadFile("users.json", &s.users)
	s.loadFile("events.json", &s.events)
	s.loadFile("alarms.json", &s.alarms)
	s.loadFile("locks.json", &s.locks)
	s.loadFile("sessions.json", &s.sessions)

	for _, u := range s.users {
		if u.ID > s.nextUserID {
			s.nextUserID = u.ID
		}
	}
	for _, e := range s.events {
		if e.ID > s.nextEventID {
			s.nextEventID = e.ID
		}
	}
	for _, a := range s.alarms {
		if a.ID > s.nextAlarmID {
			s.nextAlarmID = a.ID
		}
	}
	for _, l := range s.locks {
		if l.ID > s.nextLockID {
			s.nextLockID = l.ID
		}
	}
	return nil
}

func (s *Store) loadFile(filename string, v interface{}) {
	path := filepath.Join(s.dataDir, filename)
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	json.NewDecoder(f).Decode(v) //nolint
}

func (s *Store) saveFile(filename string, v interface{}) error {
	path := filepath.Join(s.dataDir, filename)
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	f.Close()
	return os.Rename(tmp, path)
}

// ── Users ────────────────────────────────────────────────────────────────────

func (s *Store) GetUsers() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]User, len(s.users))
	copy(result, s.users)
	return result
}

func (s *Store) GetUserByID(id int64) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].ID == id {
			u := s.users[i]
			return &u, true
		}
	}
	return nil, false
}

func (s *Store) GetUserByUsername(username string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].Username == username {
			u := s.users[i]
			return &u, true
		}
	}
	return nil, false
}

func (s *Store) CreateUser(u User) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextUserID++
	u.ID = s.nextUserID
	u.CreatedAt = time.Now()
	s.users = append(s.users, u)
	return u, s.saveFile("users.json", s.users)
}

func (s *Store) UpdateUser(u User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.users {
		if s.users[i].ID == u.ID {
			s.users[i] = u
			return s.saveFile("users.json", s.users)
		}
	}
	return fmt.Errorf("user not found")
}

func (s *Store) DeleteUser(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, u := range s.users {
		if u.ID == id {
			s.users = append(s.users[:i], s.users[i+1:]...)
			return s.saveFile("users.json", s.users)
		}
	}
	return fmt.Errorf("user not found")
}

// ── Events ───────────────────────────────────────────────────────────────────

func (s *Store) GetEvents(from, to time.Time) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Event
	for _, e := range s.events {
		// Include if event overlaps [from, to]
		end := e.StartTime
		if e.EndTime != nil {
			end = *e.EndTime
		}
		if !e.StartTime.After(to) && !end.Before(from) {
			result = append(result, e)
		}
	}
	return result
}

func (s *Store) GetAllEvents() []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Event, len(s.events))
	copy(result, s.events)
	return result
}

func (s *Store) GetEventByID(id int64) (*Event, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.events {
		if s.events[i].ID == id {
			e := s.events[i]
			return &e, true
		}
	}
	return nil, false
}

func (s *Store) CreateEvent(e Event) (Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextEventID++
	e.ID = s.nextEventID
	now := time.Now()
	e.CreatedAt = now
	e.UpdatedAt = now
	s.events = append(s.events, e)
	return e, s.saveFile("events.json", s.events)
}

func (s *Store) UpdateEvent(e Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.events {
		if s.events[i].ID == e.ID {
			e.UpdatedAt = time.Now()
			s.events[i] = e
			return s.saveFile("events.json", s.events)
		}
	}
	return fmt.Errorf("event not found")
}

func (s *Store) DeleteEvent(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, e := range s.events {
		if e.ID == id {
			s.events = append(s.events[:i], s.events[i+1:]...)
			return s.saveFile("events.json", s.events)
		}
	}
	return fmt.Errorf("event not found")
}

// ── Alarms ───────────────────────────────────────────────────────────────────

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
	defer s.mu.Unlock()
	s.nextAlarmID++
	a.ID = s.nextAlarmID
	a.CreatedAt = time.Now()
	a.IsActive = true
	a.Fired = false
	s.alarms = append(s.alarms, a)
	return a, s.saveFile("alarms.json", s.alarms)
}

func (s *Store) MarkAlarmFired(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.alarms {
		if s.alarms[i].ID == id {
			s.alarms[i].Fired = true
			return s.saveFile("alarms.json", s.alarms)
		}
	}
	return nil
}

func (s *Store) DeleteAlarm(id int64, userID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, a := range s.alarms {
		if a.ID == id && a.UserID == userID {
			s.alarms = append(s.alarms[:i], s.alarms[i+1:]...)
			return s.saveFile("alarms.json", s.alarms)
		}
	}
	return fmt.Errorf("alarm not found")
}

// ── Locked Slots ─────────────────────────────────────────────────────────────

func (s *Store) GetLocks() []LockedSlot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]LockedSlot, len(s.locks))
	copy(result, s.locks)
	return result
}

func (s *Store) CreateLock(l LockedSlot) (LockedSlot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextLockID++
	l.ID = s.nextLockID
	l.CreatedAt = time.Now()
	s.locks = append(s.locks, l)
	return l, s.saveFile("locks.json", s.locks)
}

func (s *Store) DeleteLock(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, l := range s.locks {
		if l.ID == id {
			s.locks = append(s.locks[:i], s.locks[i+1:]...)
			return s.saveFile("locks.json", s.locks)
		}
	}
	return fmt.Errorf("lock not found")
}

// ── Sessions ─────────────────────────────────────────────────────────────────

func (s *Store) GetSession(id string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.sessions {
		if s.sessions[i].ID == id && s.sessions[i].ExpiresAt.After(time.Now()) {
			sess := s.sessions[i]
			return &sess, true
		}
	}
	return nil, false
}

func (s *Store) CreateSession(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions = append(s.sessions, sess)
	return s.saveFile("sessions.json", s.sessions)
}

func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, sess := range s.sessions {
		if sess.ID == id {
			s.sessions = append(s.sessions[:i], s.sessions[i+1:]...)
			return s.saveFile("sessions.json", s.sessions)
		}
	}
	return nil
}

func (s *Store) CleanExpiredSessions() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	var active []Session
	for _, sess := range s.sessions {
		if sess.ExpiresAt.After(now) {
			active = append(active, sess)
		}
	}
	if len(active) != len(s.sessions) {
		s.sessions = active
		s.saveFile("sessions.json", s.sessions) //nolint
	}
}
