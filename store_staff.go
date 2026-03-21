package main

import "time"

// ── Staff Duties ────────────────────────────────────────────────────────────

func (s *Store) GetStaffDuties() []StaffDuty {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]StaffDuty, len(s.staffDuties))
	copy(out, s.staffDuties)
	return out
}

func (s *Store) SetStaffDuty(d StaffDuty) StaffDuty {
	s.mu.Lock()
	// Upsert by role: if a duty with the same role exists, update it
	for i, x := range s.staffDuties {
		if x.Role == d.Role {
			d.ID = x.ID
			d.CreatedAt = x.CreatedAt
			d.UpdatedAt = time.Now()
			s.staffDuties[i] = d
			snap := append([]StaffDuty(nil), s.staffDuties...)
			s.mu.Unlock()
			_ = s.persist("staff_duties.json", snap)
			return d
		}
	}
	s.nextStaffDutyID++
	d.ID = s.nextStaffDutyID
	d.CreatedAt = time.Now()
	d.UpdatedAt = d.CreatedAt
	s.staffDuties = append(s.staffDuties, d)
	snap := append([]StaffDuty(nil), s.staffDuties...)
	s.mu.Unlock()
	_ = s.persist("staff_duties.json", snap)
	return d
}

func (s *Store) DeleteStaffDuty(id int64) {
	s.mu.Lock()
	for i, x := range s.staffDuties {
		if x.ID == id {
			s.staffDuties = append(s.staffDuties[:i], s.staffDuties[i+1:]...)
			snap := append([]StaffDuty(nil), s.staffDuties...)
			s.mu.Unlock()
			_ = s.persist("staff_duties.json", snap)
			return
		}
	}
	s.mu.Unlock()
}

// ── Staff Members ───────────────────────────────────────────────────────────

func (s *Store) GetStaffMembers() []StaffMember {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]StaffMember, len(s.staffMembers))
	copy(out, s.staffMembers)
	return out
}

func (s *Store) SetStaffMember(m StaffMember) StaffMember {
	s.mu.Lock()
	// Upsert by position
	for i, x := range s.staffMembers {
		if x.Position == m.Position {
			m.ID = x.ID
			m.CreatedAt = x.CreatedAt
			m.UpdatedAt = time.Now()
			s.staffMembers[i] = m
			snap := append([]StaffMember(nil), s.staffMembers...)
			s.mu.Unlock()
			_ = s.persist("staff_members.json", snap)
			return m
		}
	}
	s.nextStaffMemberID++
	m.ID = s.nextStaffMemberID
	m.CreatedAt = time.Now()
	m.UpdatedAt = m.CreatedAt
	s.staffMembers = append(s.staffMembers, m)
	snap := append([]StaffMember(nil), s.staffMembers...)
	s.mu.Unlock()
	_ = s.persist("staff_members.json", snap)
	return m
}

func (s *Store) DeleteStaffMember(id int64) {
	s.mu.Lock()
	for i, x := range s.staffMembers {
		if x.ID == id {
			s.staffMembers = append(s.staffMembers[:i], s.staffMembers[i+1:]...)
			snap := append([]StaffMember(nil), s.staffMembers...)
			s.mu.Unlock()
			_ = s.persist("staff_members.json", snap)
			return
		}
	}
	s.mu.Unlock()
}

// ── Areas of Responsibility ─────────────────────────────────────────────────

func (s *Store) GetAreasOfResponsibility() []AreaOfResponsibility {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AreaOfResponsibility, len(s.areasOfResp))
	copy(out, s.areasOfResp)
	return out
}

func (s *Store) CreateArea(a AreaOfResponsibility) AreaOfResponsibility {
	s.mu.Lock()
	s.nextAreaID++
	a.ID = s.nextAreaID
	a.CreatedAt = time.Now()
	a.UpdatedAt = a.CreatedAt
	s.areasOfResp = append(s.areasOfResp, a)
	snap := append([]AreaOfResponsibility(nil), s.areasOfResp...)
	s.mu.Unlock()
	_ = s.persist("areas_of_responsibility.json", snap)
	return a
}

func (s *Store) UpdateArea(id int64, name, desc string, assignedTo int64, assignedName string) {
	s.mu.Lock()
	for i, x := range s.areasOfResp {
		if x.ID == id {
			if name != "" {
				s.areasOfResp[i].Name = name
			}
			s.areasOfResp[i].Description = desc
			s.areasOfResp[i].AssignedTo = assignedTo
			s.areasOfResp[i].AssignedName = assignedName
			s.areasOfResp[i].UpdatedAt = time.Now()
			snap := append([]AreaOfResponsibility(nil), s.areasOfResp...)
			s.mu.Unlock()
			_ = s.persist("areas_of_responsibility.json", snap)
			return
		}
	}
	s.mu.Unlock()
}

func (s *Store) DeleteArea(id int64) {
	s.mu.Lock()
	for i, x := range s.areasOfResp {
		if x.ID == id {
			s.areasOfResp = append(s.areasOfResp[:i], s.areasOfResp[i+1:]...)
			snap := append([]AreaOfResponsibility(nil), s.areasOfResp...)
			s.mu.Unlock()
			_ = s.persist("areas_of_responsibility.json", snap)
			return
		}
	}
	s.mu.Unlock()
}
