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
