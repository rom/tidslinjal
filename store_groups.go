package main

import (
	"fmt"
	"strings"
	"time"
)

// ── Groups ────────────────────────────────────────────────────────────────────

func (s *Store) GetGroups() []Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Group, len(s.groups))
	copy(result, s.groups)
	return result
}

func (s *Store) GetGroupByID(id int64) (*Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.groups {
		if s.groups[i].ID == id {
			g := s.groups[i]
			return &g, true
		}
	}
	return nil, false
}

func (s *Store) GetGroupByName(name string) (*Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.groups {
		if strings.EqualFold(s.groups[i].Name, name) {
			g := s.groups[i]
			return &g, true
		}
	}
	return nil, false
}

func (s *Store) CreateGroup(g Group) (Group, error) {
	s.mu.Lock()
	s.nextGroupID++
	g.ID = s.nextGroupID
	g.CreatedAt = time.Now()
	s.groups = append(s.groups, g)
	snap := append([]Group(nil), s.groups...)
	s.mu.Unlock()
	return g, s.persist("groups.json", snap)
}

func (s *Store) UpdateGroup(g Group) error {
	s.mu.Lock()
	found := false
	for i := range s.groups {
		if s.groups[i].ID == g.ID {
			s.groups[i] = g
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("group not found")
	}
	snap := append([]Group(nil), s.groups...)
	s.mu.Unlock()
	return s.persist("groups.json", snap)
}

func (s *Store) DeleteGroup(id int64) error {
	s.mu.Lock()
	found := false
	for i, g := range s.groups {
		if g.ID == id {
			s.groups = append(s.groups[:i], s.groups[i+1:]...)
			var ms []GroupMembership
			for _, m := range s.memberships {
				if m.GroupID != id {
					ms = append(ms, m)
				}
			}
			s.memberships = ms
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("group not found")
	}
	groupSnap := append([]Group(nil), s.groups...)
	memberSnap := append([]GroupMembership(nil), s.memberships...)
	s.mu.Unlock()
	s.persist("memberships.json", memberSnap) //nolint
	return s.persist("groups.json", groupSnap)
}

func (s *Store) GetGroupMembers(groupID int64) []GroupMembership {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []GroupMembership
	for _, m := range s.memberships {
		if m.GroupID == groupID {
			result = append(result, m)
		}
	}
	return result
}

func (s *Store) GetUserGroups(userID int64) []GroupMembership {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []GroupMembership
	for _, m := range s.memberships {
		if m.UserID == userID {
			result = append(result, m)
		}
	}
	return result
}

func (s *Store) AddGroupMember(m GroupMembership) error {
	s.mu.Lock()
	for _, existing := range s.memberships {
		if existing.GroupID == m.GroupID && existing.UserID == m.UserID {
			s.mu.Unlock()
			return nil // already member
		}
	}
	s.memberships = append(s.memberships, m)
	snap := append([]GroupMembership(nil), s.memberships...)
	s.mu.Unlock()
	return s.persist("memberships.json", snap)
}

func (s *Store) RemoveGroupMember(groupID, userID int64) error {
	s.mu.Lock()
	for i, m := range s.memberships {
		if m.GroupID == groupID && m.UserID == userID {
			s.memberships = append(s.memberships[:i], s.memberships[i+1:]...)
			snap := append([]GroupMembership(nil), s.memberships...)
			s.mu.Unlock()
			return s.persist("memberships.json", snap)
		}
	}
	s.mu.Unlock()
	return nil
}

// ── Layers ────────────────────────────────────────────────────────────────────

func (s *Store) GetLayersVisibleTo(userID int64, userGroups []int64) []Layer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Layer
	groupSet := make(map[int64]bool)
	for _, gid := range userGroups {
		groupSet[gid] = true
	}
	for _, l := range s.layers {
		if l.OwnerID == userID {
			result = append(result, l)
			continue
		}
		if l.Visibility == "public" {
			result = append(result, l)
			continue
		}
		if l.Visibility == "groups" {
			for _, gid := range l.GroupIDs {
				if groupSet[gid] {
					result = append(result, l)
					break
				}
			}
		}
	}
	return result
}

func (s *Store) GetAllLayers() []Layer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Layer, len(s.layers))
	copy(result, s.layers)
	return result
}

func (s *Store) GetLayerByID(id int64) (*Layer, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.layers {
		if s.layers[i].ID == id {
			l := s.layers[i]
			return &l, true
		}
	}
	return nil, false
}

func (s *Store) CreateLayer(l Layer) (Layer, error) {
	s.mu.Lock()
	s.nextLayerID++
	l.ID = s.nextLayerID
	l.CreatedAt = time.Now()
	if l.GroupIDs == nil {
		l.GroupIDs = []int64{}
	}
	s.layers = append(s.layers, l)
	snap := append([]Layer(nil), s.layers...)
	s.mu.Unlock()
	return l, s.persist("layers.json", snap)
}

func (s *Store) UpdateLayer(l Layer) error {
	s.mu.Lock()
	found := false
	for i := range s.layers {
		if s.layers[i].ID == l.ID {
			s.layers[i] = l
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("layer not found")
	}
	snap := append([]Layer(nil), s.layers...)
	s.mu.Unlock()
	return s.persist("layers.json", snap)
}

func (s *Store) DeleteLayer(id int64) error {
	s.mu.Lock()
	found := false
	for i, l := range s.layers {
		if l.ID == id {
			s.layers = append(s.layers[:i], s.layers[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("layer not found")
	}

	// Cascade: move events on this layer to the master timeline (nil layer)
	eventsChanged := false
	for i := range s.events {
		if s.events[i].LayerID != nil && *s.events[i].LayerID == id {
			s.events[i].LayerID = nil
			eventsChanged = true
		}
	}

	// Cascade: remove layer from user preferences' hidden_layers and active_layers
	for i := range s.preferences {
		p := &s.preferences[i]
		filtered := p.HiddenLayers[:0]
		for _, lid := range p.HiddenLayers {
			if lid != id {
				filtered = append(filtered, lid)
			}
		}
		p.HiddenLayers = filtered

		filteredActive := p.ActiveLayers[:0]
		for _, lid := range p.ActiveLayers {
			if lid != id {
				filteredActive = append(filteredActive, lid)
			}
		}
		p.ActiveLayers = filteredActive
	}

	snapLayers := append([]Layer(nil), s.layers...)
	var snapEvents []Event
	if eventsChanged {
		snapEvents = append([]Event(nil), s.events...)
	}
	snapPrefs := append([]UserPreferences(nil), s.preferences...)
	s.mu.Unlock()

	var firstErr error
	if err := s.persist("layers.json", snapLayers); err != nil && firstErr == nil {
		firstErr = err
	}
	if eventsChanged {
		if err := s.persist("events.json", snapEvents); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if err := s.persist("preferences.json", snapPrefs); err != nil && firstErr == nil {
		firstErr = err
	}
	return firstErr
}
