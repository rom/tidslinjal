package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ── Templates ──────────────────────────────────────────────────────────────

func (s *Store) GetTemplates(userID int64) []Template {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Template
	for _, tmpl := range s.templates {
		if tmpl.Scope == "public" || tmpl.CreatedBy == userID {
			t2 := tmpl
			t2.ItemCount = len(tmpl.Items)
			t2.Items = nil // don't send items in list view
			out = append(out, t2)
		}
	}
	return out
}

func (s *Store) GetTemplate(id int64) (Template, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, tmpl := range s.templates {
		if tmpl.ID == id {
			return tmpl, true
		}
	}
	return Template{}, false
}

func (s *Store) CreateTemplate(tmpl Template) (Template, error) {
	s.mu.Lock()
	s.nextTemplateID++
	tmpl.ID = s.nextTemplateID
	tmpl.CreatedAt = time.Now()
	tmpl.ItemCount = len(tmpl.Items)
	s.templates = append(s.templates, tmpl)
	snap := append([]Template(nil), s.templates...)
	s.mu.Unlock()
	return tmpl, s.persist("templates.json", snap)
}

func (s *Store) DeleteTemplate(id, userID int64, isAdmin bool) error {
	s.mu.Lock()
	for i, tmpl := range s.templates {
		if tmpl.ID == id {
			if tmpl.CreatedBy != userID && !isAdmin {
				s.mu.Unlock()
				return fmt.Errorf("not authorized")
			}
			s.templates = append(s.templates[:i], s.templates[i+1:]...)
			snap := append([]Template(nil), s.templates...)
			s.mu.Unlock()
			return s.persist("templates.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("template not found")
}

// ApplyTemplate creates events from a template offset by baseTime; returns count created.
// It also copies any template attachments to the newly created events.
func (s *Store) ApplyTemplate(id int64, baseTime time.Time, layerID *int64, useTemplateLayers bool, createdBy int64, createdByName string) (int, error) {
	tmpl, ok := s.GetTemplate(id)
	if !ok {
		return 0, fmt.Errorf("template not found")
	}
	logDebug("[template] ApplyTemplate: name=%q items=%d phases=%d locks=%d layers=%d useTemplateLayers=%v base=%s",
		tmpl.Name, len(tmpl.Items), len(tmpl.Phases), len(tmpl.Locks), len(tmpl.Layers), useTemplateLayers, baseTime.Format(time.RFC3339))

	// Create template-defined layers and build name→ID map (only if useTemplateLayers is true)
	layerMap := map[string]*int64{}
	if !useTemplateLayers {
		logDebug("[template] useTemplateLayers=false, all events go to single layer=%v", layerID)
	}
	for _, tl := range tmpl.Layers {
		if !useTemplateLayers {
			break
		}
		if tl.Name == "" {
			continue
		}
		vis := tl.Visibility
		if vis == "" {
			vis = "shared"
		}
		perm := tl.Permission
		if perm == "" {
			perm = "readwrite"
		}
		created, err := s.CreateLayer(Layer{
			Name:       tl.Name,
			Color:      tl.Color,
			Visibility: vis,
			Permission: perm,
			OwnerID:    createdBy,
			OwnerName:  createdByName,
		})
		if err != nil {
			logDebug("[template] failed to create layer %q: %v", tl.Name, err)
			continue
		}
		lid := created.ID
		layerMap[tl.Name] = &lid
		logDebug("[template] created layer %q id=%d", tl.Name, lid)
	}

	count := 0
	for _, item := range tmpl.Items {
		start := baseTime.Add(time.Duration(item.StartOffsetMin) * time.Minute)
		var end *time.Time
		if item.DurationMin > 0 {
			e := start.Add(time.Duration(item.DurationMin) * time.Minute)
			end = &e
		}
		// Determine layer: per-item layer takes precedence over default layerID
		itemLayerID := layerID
		if item.Layer != "" {
			if lid, ok := layerMap[item.Layer]; ok {
				itemLayerID = lid
			}
		}
		ev := Event{
			Title:             item.Title,
			EventType:         item.EventType,
			Color:             item.Color,
			Description:       item.Description,
			StartTime:         start,
			EndTime:           end,
			AllDay:            item.AllDay,
			IsRecurring:       item.IsRecurring,
			RecurrencePattern: item.RecurrencePattern,
			Participant:       item.Participant,
			Status:            StatusPlanned,
			LayerID:           itemLayerID,
			CreatedBy:         createdBy,
			CreatedByName:     createdByName,
		}
		created, err := s.CreateEvent(ev)
		logDebug("[template] item %q -> event start=%s err=%v", item.Title, start.Format(time.RFC3339), err)
		if err == nil {
			count++
			// Copy template attachments to the new event
			for _, ta := range item.Attachments {
				srcPath := filepath.Join(s.AttachmentDir(), filepath.Base(ta.StoredName))
				if _, err := os.Stat(srcPath); err != nil {
					continue // source file missing, skip
				}
				safeName := filepath.Base(ta.Filename)
				newStoredName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
				dstPath := filepath.Join(s.AttachmentDir(), newStoredName)
				srcData, err := os.ReadFile(srcPath)
				if err != nil {
					continue
				}
				if err := os.WriteFile(dstPath, srcData, 0600); err != nil {
					continue
				}
				att := Attachment{
					EventID:      created.ID,
					Filename:     ta.Filename,
					StoredName:   newStoredName,
					Size:         ta.Size,
					MimeType:     ta.MimeType,
					UploadedBy:   createdBy,
					UploaderName: createdByName,
				}
				s.CreateAttachment(att) //nolint
			}
		}
	}
	// Create phases from template
	for _, tp := range tmpl.Phases {
		start := baseTime.Add(time.Duration(tp.StartOffsetMin) * time.Minute)
		end := baseTime.Add(time.Duration(tp.EndOffsetMin) * time.Minute)
		ph := ExercisePhase{
			Name:      tp.Name,
			Color:     tp.Color,
			StartTime: start,
			EndTime:   end,
			Order:     tp.Order,
			CreatedBy: createdBy,
		}
		s.CreatePhase(ph) //nolint
	}
	// Create locks from template
	for _, tl := range tmpl.Locks {
		start := baseTime.Add(time.Duration(tl.StartOffsetMin) * time.Minute)
		end := baseTime.Add(time.Duration(tl.EndOffsetMin) * time.Minute)
		scope := tl.Scope
		if scope == "" {
			scope = "all"
		}
		lk := LockedSlot{
			StartTime:    start,
			EndTime:      end,
			Reason:       tl.Reason,
			Scope:        scope,
			LockedBy:     createdBy,
			LockedByName: createdByName,
		}
		s.CreateLock(lk) //nolint
	}
	// Create day labels from template
	for _, tdl := range tmpl.DayLabels {
		labelTime := baseTime.Add(time.Duration(tdl.DayOffsetMin) * time.Minute)
		dateStr := labelTime.Format("2006-01-02")
		dl := DayLabel{
			Date:       dateStr,
			Label:      tdl.Label,
			Color:      tdl.Color,
			Background: tdl.Background,
			FontSize:   tdl.FontSize,
			FontWeight: tdl.FontWeight,
			CreatedBy:  createdBy,
		}
		s.AddDayLabel(dl) //nolint
	}
	// Create groups from template
	groupIDMap := make(map[int]int64) // template group index -> real group ID
	for idx, tg := range tmpl.Groups {
		grp := Group{
			Name:        tg.Name,
			Description: tg.Description,
			CreatedBy:   createdBy,
		}
		created, err := s.CreateGroup(grp)
		if err == nil {
			groupIDMap[idx] = created.ID
			// Add members by username (best-effort)
			if len(tg.Members) > 0 {
				s.mu.RLock()
				usernameMap := make(map[string]int64, len(s.users))
				for _, u := range s.users {
					usernameMap[u.Username] = u.ID
				}
				s.mu.RUnlock()
				for _, uname := range tg.Members {
					if uid, ok := usernameMap[uname]; ok {
						s.AddGroupMember(GroupMembership{GroupID: created.ID, UserID: uid, Role: "member"}) //nolint
					}
				}
			}
		}
	}
	// Create layers from template
	for _, tl := range tmpl.Layers {
		vis := tl.Visibility
		if vis == "" {
			vis = "private"
		}
		perm := tl.Permission
		if perm == "" {
			perm = "read"
		}
		color := tl.Color
		if color == "" {
			color = "#4A90D9"
		}
		// Resolve group IDs from template group indices
		var gids []int64
		for _, gi := range tl.GroupIndex {
			if realID, ok := groupIDMap[gi]; ok {
				gids = append(gids, realID)
			}
		}
		layer := Layer{
			Name:        tl.Name,
			Description: tl.Description,
			Color:       color,
			OwnerID:     createdBy,
			OwnerName:   createdByName,
			Visibility:  vis,
			Permission:  perm,
			GroupIDs:    gids,
		}
		s.CreateLayer(layer) //nolint
	}
	return count, nil
}
