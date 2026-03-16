package main

import (
	"fmt"
	"sort"
	"time"
)

// ── Store extensions for routing rules and connector configs ─────────────────

// Routing rules — stored in routing_rules.json
// Added to Store via init in the load chain.

func (s *Store) GetRoutingRules() []RoutingRule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]RoutingRule, len(s.routingRules))
	copy(result, s.routingRules)
	sort.Slice(result, func(i, j int) bool { return result[i].Priority < result[j].Priority })
	return result
}

func (s *Store) GetRoutingRule(id int64) (RoutingRule, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, r := range s.routingRules {
		if r.ID == id {
			return r, true
		}
	}
	return RoutingRule{}, false
}

func (s *Store) CreateRoutingRule(r RoutingRule) (RoutingRule, error) {
	s.mu.Lock()
	s.nextRoutingRuleID++
	r.ID = s.nextRoutingRuleID
	if r.CreatedAt.IsZero() {
		r.CreatedAt = time.Now()
	}
	r.UpdatedAt = r.CreatedAt
	s.routingRules = append(s.routingRules, r)
	snap := append([]RoutingRule(nil), s.routingRules...)
	s.mu.Unlock()
	return r, s.persist("routing_rules.json", snap)
}

func (s *Store) UpdateRoutingRule(r RoutingRule) (RoutingRule, error) {
	s.mu.Lock()
	found := false
	for i := range s.routingRules {
		if s.routingRules[i].ID == r.ID {
			// Preserve creation metadata
			r.CreatedBy = s.routingRules[i].CreatedBy
			r.CreatedAt = s.routingRules[i].CreatedAt
			r.UpdatedAt = time.Now()
			s.routingRules[i] = r
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return r, fmt.Errorf("routing rule %d not found", r.ID)
	}
	snap := append([]RoutingRule(nil), s.routingRules...)
	s.mu.Unlock()
	return r, s.persist("routing_rules.json", snap)
}

func (s *Store) DeleteRoutingRule(id int64) error {
	s.mu.Lock()
	found := false
	for i := range s.routingRules {
		if s.routingRules[i].ID == id {
			s.routingRules = append(s.routingRules[:i], s.routingRules[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("routing rule %d not found", id)
	}
	snap := append([]RoutingRule(nil), s.routingRules...)
	s.mu.Unlock()
	return s.persist("routing_rules.json", snap)
}

// Connector configs — stored in connectors.json

func (s *Store) GetConnectorConfigs() []ConnectorConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ConnectorConfig, len(s.connectorConfigs))
	copy(result, s.connectorConfigs)
	return result
}

func (s *Store) SaveConnectorConfig(cfg ConnectorConfig) error {
	s.mu.Lock()
	found := false
	for i := range s.connectorConfigs {
		if s.connectorConfigs[i].Name == cfg.Name {
			s.connectorConfigs[i] = cfg
			found = true
			break
		}
	}
	if !found {
		s.connectorConfigs = append(s.connectorConfigs, cfg)
	}
	snap := append([]ConnectorConfig(nil), s.connectorConfigs...)
	s.mu.Unlock()
	return s.persist("connectors.json", snap)
}

func (s *Store) DeleteConnectorConfig(name string) error {
	s.mu.Lock()
	found := false
	for i := range s.connectorConfigs {
		if s.connectorConfigs[i].Name == name {
			s.connectorConfigs = append(s.connectorConfigs[:i], s.connectorConfigs[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("connector config %q not found", name)
	}
	snap := append([]ConnectorConfig(nil), s.connectorConfigs...)
	s.mu.Unlock()
	return s.persist("connectors.json", snap)
}

// ── Federated IdPs ─────────────────────────────────────────────────────────

func (s *Store) GetFederatedIdPs() []FederatedIdP {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]FederatedIdP, len(s.federatedIdPs))
	copy(result, s.federatedIdPs)
	return result
}

func (s *Store) SaveFederatedIdP(idp FederatedIdP) error {
	s.mu.Lock()
	found := false
	for i := range s.federatedIdPs {
		if s.federatedIdPs[i].ID == idp.ID {
			s.federatedIdPs[i] = idp
			found = true
			break
		}
	}
	if !found {
		s.federatedIdPs = append(s.federatedIdPs, idp)
	}
	snap := append([]FederatedIdP(nil), s.federatedIdPs...)
	s.mu.Unlock()
	return s.persist("federated_idps.json", snap)
}

func (s *Store) DeleteFederatedIdP(id string) error {
	s.mu.Lock()
	found := false
	for i := range s.federatedIdPs {
		if s.federatedIdPs[i].ID == id {
			s.federatedIdPs = append(s.federatedIdPs[:i], s.federatedIdPs[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		s.mu.Unlock()
		return fmt.Errorf("federated IdP %q not found", id)
	}
	snap := append([]FederatedIdP(nil), s.federatedIdPs...)
	s.mu.Unlock()
	return s.persist("federated_idps.json", snap)
}

// ── Trust Realms ───────────────────────────────────────────────────────────

func (s *Store) GetTrustRealms() []TrustRealm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]TrustRealm, len(s.trustRealms))
	copy(result, s.trustRealms)
	return result
}

func (s *Store) SaveTrustRealm(realm TrustRealm) error {
	s.mu.Lock()
	found := false
	for i := range s.trustRealms {
		if s.trustRealms[i].ID == realm.ID {
			s.trustRealms[i] = realm
			found = true
			break
		}
	}
	if !found {
		s.trustRealms = append(s.trustRealms, realm)
	}
	snap := append([]TrustRealm(nil), s.trustRealms...)
	s.mu.Unlock()
	return s.persist("trust_realms.json", snap)
}

// ── Rooms / Resources ──────────────────────────────────────────────────────

func (s *Store) GetRooms() []Room {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Room, len(s.rooms))
	copy(result, s.rooms)
	return result
}

func (s *Store) SaveRoom(room Room) error {
	s.mu.Lock()
	if room.ID == 0 {
		s.nextRoomID++
		room.ID = s.nextRoomID
		room.CreatedAt = time.Now()
		s.rooms = append(s.rooms, room)
	} else {
		for i := range s.rooms {
			if s.rooms[i].ID == room.ID {
				s.rooms[i] = room
				break
			}
		}
	}
	snap := append([]Room(nil), s.rooms...)
	s.mu.Unlock()
	return s.persist("rooms.json", snap)
}

func (s *Store) DeleteRoom(id int64) error {
	s.mu.Lock()
	for i := range s.rooms {
		if s.rooms[i].ID == id {
			s.rooms = append(s.rooms[:i], s.rooms[i+1:]...)
			snap := append([]Room(nil), s.rooms...)
			s.mu.Unlock()
			return s.persist("rooms.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("room %d not found", id)
}

// ── Custom Resource Types ──────────────────────────────────────────────────

func (s *Store) GetCustomResourceTypes() []CustomResourceType {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]CustomResourceType, len(s.customResourceTypes))
	copy(result, s.customResourceTypes)
	return result
}

func (s *Store) SaveCustomResourceType(crt CustomResourceType) error {
	s.mu.Lock()
	if crt.ID == 0 {
		s.nextCustomResTypeID++
		crt.ID = s.nextCustomResTypeID
		s.customResourceTypes = append(s.customResourceTypes, crt)
	} else {
		found := false
		for i := range s.customResourceTypes {
			if s.customResourceTypes[i].ID == crt.ID {
				s.customResourceTypes[i] = crt
				found = true
				break
			}
		}
		if !found {
			s.customResourceTypes = append(s.customResourceTypes, crt)
		}
	}
	snap := append([]CustomResourceType(nil), s.customResourceTypes...)
	s.mu.Unlock()
	return s.persist("custom_resource_types.json", snap)
}

func (s *Store) DeleteCustomResourceType(id int64) error {
	s.mu.Lock()
	for i := range s.customResourceTypes {
		if s.customResourceTypes[i].ID == id {
			s.customResourceTypes = append(s.customResourceTypes[:i], s.customResourceTypes[i+1:]...)
			snap := append([]CustomResourceType(nil), s.customResourceTypes...)
			s.mu.Unlock()
			return s.persist("custom_resource_types.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("custom resource type %d not found", id)
}

func (s *Store) GetRoomBookings(roomID int64, from, to time.Time) []RoomBooking {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Filter events that have a room booking for this room in the time range
	var bookings []RoomBooking
	// For now, room bookings are stored within events as metadata
	// Future: dedicated booking storage
	return bookings
}

// ── Free/Busy Lookup ────────────────────────────────────────────────────────

func (s *Store) GetFreeBusy(userID int64, from, to time.Time) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Event
	for _, ev := range s.events {
		if ev.ResponsibleID != nil && *ev.ResponsibleID == userID {
			if ev.StartTime.Before(to) && (ev.EndTime == nil || ev.EndTime.After(from)) {
				result = append(result, ev)
			}
		}
	}
	return result
}

func (s *Store) GetRoomFreeBusy(roomID int64, from, to time.Time) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Event
	for _, ev := range s.events {
		if ev.RoomID != nil && *ev.RoomID == roomID {
			if ev.StartTime.Before(to) && (ev.EndTime == nil || ev.EndTime.After(from)) {
				result = append(result, ev)
			}
		}
	}
	return result
}

// ── Resource Notes ──────────────────────────────────────────────────────────

func (s *Store) GetResourceNotes(resourceType, resourceID string) []ResourceNote {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []ResourceNote
	for _, n := range s.resourceNotes {
		if n.ResourceType == resourceType && n.ResourceID == resourceID {
			result = append(result, n)
		}
	}
	// Sort newest first
	sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
	return result
}

func (s *Store) GetAllResourceNotes() []ResourceNote {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ResourceNote, len(s.resourceNotes))
	copy(result, s.resourceNotes)
	return result
}

func (s *Store) AddResourceNote(note ResourceNote) (ResourceNote, error) {
	s.mu.Lock()
	s.nextResourceNoteID++
	note.ID = s.nextResourceNoteID
	if note.CreatedAt.IsZero() {
		note.CreatedAt = time.Now()
	}
	note.UpdatedAt = note.CreatedAt
	s.resourceNotes = append(s.resourceNotes, note)
	snap := append([]ResourceNote(nil), s.resourceNotes...)
	s.mu.Unlock()
	return note, s.persist("resource_notes.json", snap)
}

func (s *Store) DeleteResourceNote(id int64) error {
	s.mu.Lock()
	for i := range s.resourceNotes {
		if s.resourceNotes[i].ID == id {
			s.resourceNotes = append(s.resourceNotes[:i], s.resourceNotes[i+1:]...)
			snap := append([]ResourceNote(nil), s.resourceNotes...)
			s.mu.Unlock()
			return s.persist("resource_notes.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("resource note %d not found", id)
}

// ── Resource Stars ──────────────────────────────────────────────────────────

func (s *Store) GetResourceStars(resourceType, resourceID string) []ResourceStar {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []ResourceStar
	for _, st := range s.resourceStars {
		if st.ResourceType == resourceType && st.ResourceID == resourceID {
			result = append(result, st)
		}
	}
	return result
}

func (s *Store) GetAllResourceStars() []ResourceStar {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ResourceStar, len(s.resourceStars))
	copy(result, s.resourceStars)
	return result
}

func (s *Store) AddResourceStar(star ResourceStar) (ResourceStar, error) {
	s.mu.Lock()
	s.nextResourceStarID++
	star.ID = s.nextResourceStarID
	if star.CreatedAt.IsZero() {
		star.CreatedAt = time.Now()
	}
	star.UpdatedAt = star.CreatedAt
	s.resourceStars = append(s.resourceStars, star)
	snap := append([]ResourceStar(nil), s.resourceStars...)
	s.mu.Unlock()
	return star, s.persist("resource_stars.json", snap)
}

func (s *Store) DeleteResourceStar(id int64) error {
	s.mu.Lock()
	for i := range s.resourceStars {
		if s.resourceStars[i].ID == id {
			s.resourceStars = append(s.resourceStars[:i], s.resourceStars[i+1:]...)
			snap := append([]ResourceStar(nil), s.resourceStars...)
			s.mu.Unlock()
			return s.persist("resource_stars.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("resource star %d not found", id)
}

// ── Startup Text ──────────────────────────────────────────────────────────

func (s *Store) GetStartupText() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.startupText
}

func (s *Store) SetStartupText(text string) error {
	s.mu.Lock()
	s.startupText = text
	s.mu.Unlock()
	return s.persist("startup_text.json", map[string]string{"text": text})
}

// GetGeoItems returns items placed on the geographical/OSM map.
func (s *Store) GetGeoItems() []map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.geoItems
}

// SetGeoItems saves items placed on the geographical/OSM map.
func (s *Store) SetGeoItems(items []map[string]any) error {
	s.mu.Lock()
	s.geoItems = items
	s.mu.Unlock()
	return s.persist("geo_items.json", items)
}
