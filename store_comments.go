package main

import (
	"fmt"
	"time"
)

// ── Event Comments ─────────────────────────────────────────────────────────

func (s *Store) GetCommentsByEvent(eventID int64) []EventComment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []EventComment
	for _, c := range s.comments {
		if c.EventID == eventID {
			result = append(result, c)
		}
	}
	return result
}

func (s *Store) CreateComment(c EventComment) (EventComment, error) {
	s.mu.Lock()
	s.nextCommentID++
	c.ID = s.nextCommentID
	c.CreatedAt = time.Now()
	s.comments = append(s.comments, c)
	snap := append([]EventComment(nil), s.comments...)
	s.mu.Unlock()
	return c, s.persist("comments.json", snap)
}

func (s *Store) DeleteComment(id, userID int64, isAdmin bool) error {
	s.mu.Lock()
	for i, c := range s.comments {
		if c.ID == id {
			if !isAdmin && c.AuthorID != userID {
				s.mu.Unlock()
				return fmt.Errorf("forbidden")
			}
			s.comments = append(s.comments[:i], s.comments[i+1:]...)
			snap := append([]EventComment(nil), s.comments...)
			s.mu.Unlock()
			return s.persist("comments.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("comment not found")
}

func (s *Store) ApproveComment(id, approverID int64) error {
	s.mu.Lock()
	found := false
	for i := range s.comments {
		if s.comments[i].ID == id {
			now := time.Now()
			s.comments[i].PendingApproval = false
			s.comments[i].ApprovedBy = approverID
			s.comments[i].ApprovedAt = &now
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("comment not found")
	}
	snap := append([]EventComment(nil), s.comments...)
	s.mu.Unlock()
	return s.persist("comments.json", snap)
}

// commentCounts returns map[eventID]count. Caller must not hold lock.
func (s *Store) commentCounts() map[int64]int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m := make(map[int64]int)
	for _, c := range s.comments {
		m[c.EventID]++
	}
	return m
}

// ── Exercise Phases ────────────────────────────────────────────────────────

func (s *Store) GetPhases() []ExercisePhase {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ExercisePhase, len(s.phases))
	copy(result, s.phases)
	return result
}

func (s *Store) GetPhaseByID(id int64) (*ExercisePhase, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.phases {
		if s.phases[i].ID == id {
			p := s.phases[i]
			return &p, true
		}
	}
	return nil, false
}

func (s *Store) CreatePhase(p ExercisePhase) (ExercisePhase, error) {
	s.mu.Lock()
	s.nextPhaseID++
	p.ID = s.nextPhaseID
	p.CreatedAt = time.Now()
	s.phases = append(s.phases, p)
	snap := append([]ExercisePhase(nil), s.phases...)
	s.mu.Unlock()
	return p, s.persist("phases.json", snap)
}

func (s *Store) UpdatePhase(p ExercisePhase) error {
	s.mu.Lock()
	found := false
	for i := range s.phases {
		if s.phases[i].ID == p.ID {
			s.phases[i] = p
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("phase not found")
	}
	snap := append([]ExercisePhase(nil), s.phases...)
	s.mu.Unlock()
	return s.persist("phases.json", snap)
}

func (s *Store) DeletePhase(id int64) error {
	s.mu.Lock()
	found := false
	for i, p := range s.phases {
		if p.ID == id {
			s.phases = append(s.phases[:i], s.phases[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("phase not found")
	}
	snap := append([]ExercisePhase(nil), s.phases...)
	s.mu.Unlock()
	return s.persist("phases.json", snap)
}
