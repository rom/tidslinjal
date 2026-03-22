package main

import (
	"crypto/subtle"
	"fmt"
	"time"
)

// ── Users ─────────────────────────────────────────────────────────────────────

func (s *Store) GetUsers() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]User, len(s.users))
	copy(result, s.users)
	return result
}

// GetUserByID is O(1) via index map.
func (s *Store) GetUserByID(id int64) (*User, bool) {
	s.mu.RLock()
	u, ok := s.userByID[id]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return &u, true
}

// GetAdminPasswordHash returns the bcrypt hash of the "admin" account, used as
// key material when encrypting/decrypting backup archives.
func (s *Store) GetAdminPasswordHash() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].Username == "admin" {
			return []byte(s.users[i].PasswordHash)
		}
	}
	return nil
}

// GetUserByUsername is O(n) but username lookups are rare (login only).
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
	s.nextUserID++
	u.ID = s.nextUserID
	u.CreatedAt = time.Now()
	s.users = append(s.users, u)
	s.userByID[u.ID] = u
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return u, s.persist("users.json", snap)
}

// CreateUserIfNotExists atomically checks username uniqueness and creates the user (V-05 fix).
// Returns the created user and true, or zero-value User and false if username already exists.
func (s *Store) CreateUserIfNotExists(u User) (User, bool, error) {
	s.mu.Lock()
	for i := range s.users {
		if s.users[i].Username == u.Username {
			s.mu.Unlock()
			return User{}, false, nil
		}
	}
	s.nextUserID++
	u.ID = s.nextUserID
	u.CreatedAt = time.Now()
	s.users = append(s.users, u)
	s.userByID[u.ID] = u
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return u, true, s.persist("users.json", snap)
}

func (s *Store) UpdateUser(u User) error {
	s.mu.Lock()
	found := false
	for i := range s.users {
		if s.users[i].ID == u.ID {
			s.users[i] = u
			s.userByID[u.ID] = u
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
}

func (s *Store) DeleteUser(id int64) error {
	s.mu.Lock()
	found := false
	for i, u := range s.users {
		if u.ID == id {
			s.users = append(s.users[:i], s.users[i+1:]...)
			delete(s.userByID, id)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
}

// ── Preferences ───────────────────────────────────────────────────────────────

func (s *Store) GetPreferences(userID int64) UserPreferences {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.preferences {
		if p.UserID == userID {
			return p
		}
	}
	trueVal := true
	return UserPreferences{
		UserID:       userID,
		Theme:        "light",
		Size:         "small",
		Language:     "en",
		DayStartHour: 0,
		DayEndHour:   24,
		HiddenTypes:  []string{},
		ActiveLayers: []int64{},
		ConfirmDragMove: &trueVal,
		RedLineEnabled:  true,
		SynthLabel:       true,
		ShowClockFlags:   &trueVal,
		ShowWeekNumbers:  true,
	}
}

// getPreferencesLocked returns preferences without acquiring lock (caller must hold lock).
func (s *Store) getPreferencesLocked(userID int64) UserPreferences {
	for _, p := range s.preferences {
		if p.UserID == userID {
			return p
		}
	}
	return UserPreferences{UserID: userID}
}

func (s *Store) GetAllPreferences() []UserPreferences {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]UserPreferences, len(s.preferences))
	copy(result, s.preferences)
	return result
}

func (s *Store) SavePreferences(p UserPreferences) error {
	s.mu.Lock()
	found := false
	for i := range s.preferences {
		if s.preferences[i].UserID == p.UserID {
			s.preferences[i] = p
			found = true
			break
		}
	}
	if !found {
		s.preferences = append(s.preferences, p)
	}
	snap := append([]UserPreferences(nil), s.preferences...)
	s.mu.Unlock()
	return s.persist("preferences.json", snap)
}

// ── Password Reset ─────────────────────────────────────────────────────────────

func (s *Store) SetPasswordResetToken(userID int64, token string, expiry time.Time) error {
	s.mu.Lock()
	found := false
	for i := range s.users {
		if s.users[i].ID == userID {
			s.users[i].PasswordResetToken = token
			s.users[i].PasswordResetExpiry = &expiry
			s.userByID[userID] = s.users[i]
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
}

func (s *Store) GetUserByResetToken(token string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Hash the incoming token to compare against stored SHA-256 hash
	hashed := hashToken(token)
	now := time.Now()
	for i := range s.users {
		u := &s.users[i]
		if u.PasswordResetToken != "" && subtle.ConstantTimeCompare([]byte(u.PasswordResetToken), []byte(hashed)) == 1 && u.PasswordResetExpiry != nil && u.PasswordResetExpiry.After(now) {
			cp := *u
			return &cp, true
		}
	}
	return nil, false
}

// VetUser approves a pending (unvetted) user registration
func (s *Store) VetUser(userID int64) error {
	s.mu.Lock()
	found := false
	for i := range s.users {
		if s.users[i].ID == userID {
			s.users[i].Vetted = true
			s.userByID[userID] = s.users[i]
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("user not found")
	}
	snap := append([]User(nil), s.users...)
	s.mu.Unlock()
	return s.persist("users.json", snap)
}
