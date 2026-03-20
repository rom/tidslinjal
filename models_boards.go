package main

import "time"

// Board represents a Kanban-style board
type Board struct {
	ID          int64       `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	OwnerID     int64       `json:"owner_id"`
	OwnerName   string      `json:"owner_name"`
	Visibility  string      `json:"visibility"` // "private", "group", "role", "global"
	GroupID     int64       `json:"group_id,omitempty"`
	RoleKey     string      `json:"role_key,omitempty"`
	Columns     []BoardCol  `json:"columns"`
	Color       string      `json:"color,omitempty"`       // board background/accent color
	ShareToken  string      `json:"share_token,omitempty"` // token for sharable link
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// BoardCol is a column in the kanban board
type BoardCol struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Collapsed bool   `json:"collapsed,omitempty"`
	Color     string `json:"color,omitempty"` // column background color (e.g. orange, yellow, green)
}

// BoardItem is a card/issue on the board
type BoardItem struct {
	ID            int64             `json:"id"`
	BoardID       int64             `json:"board_id"`
	ColumnID      string            `json:"column_id"`
	SortOrder     int               `json:"sort_order"`
	Subject       string            `json:"subject"`
	Note          string            `json:"note,omitempty"`
	ItemType      string            `json:"item_type,omitempty"`   // "task", "meeting", "checklist", etc.
	Color         string            `json:"color,omitempty"`       // card background color
	Tags          []string          `json:"tags,omitempty"`
	CreatorID     int64             `json:"creator_id"`
	CreatorName   string            `json:"creator_name"`
	Attachments   []BoardAttachment `json:"attachments,omitempty"`
	History       []BoardHistory    `json:"history,omitempty"`
	ChecklistID   int64             `json:"checklist_id,omitempty"`  // linked checklist
	EventID       int64             `json:"event_id,omitempty"`      // linked event/meeting
	ShareToken    string            `json:"share_token,omitempty"`   // token for sharable link
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
}

// BoardAttachment is a file attached to a board item
type BoardAttachment struct {
	ID         int64     `json:"id"`
	Filename   string    `json:"filename"`
	StoredName string    `json:"stored_name"`
	Size       int64     `json:"size"`
	MimeType   string    `json:"mime_type"`
	UploadedBy int64     `json:"uploaded_by"`
	CreatedAt  time.Time `json:"created_at"`
}

// BoardHistory is an activity/history entry on a board item
type BoardHistory struct {
	Timestamp time.Time `json:"timestamp"`
	UserID    int64     `json:"user_id"`
	UserName  string    `json:"user_name"`
	Action    string    `json:"action"` // "created", "moved", "edited", "commented", "attachment_added", etc.
	Detail    string    `json:"detail,omitempty"`
}

// DefaultBoardColumns returns the default 3-column layout
func DefaultBoardColumns() []BoardCol {
	return []BoardCol{
		{ID: "open", Name: "Open"},
		{ID: "in_progress", Name: "In Progress"},
		{ID: "closed", Name: "Closed"},
	}
}

// BuiltInBoardTemplates returns a set of board templates for training/examples
func BuiltInBoardTemplates() []Board {
	now := time.Now()
	return []Board{
		{
			ID: -1, Name: "Basic Task Board", Description: "Simple task tracking with three columns.",
			Columns: DefaultBoardColumns(), Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -2, Name: "Incident Response", Description: "Track incident response activities.",
			Columns: []BoardCol{
				{ID: "reported", Name: "Reported"},
				{ID: "triaging", Name: "Triaging"},
				{ID: "in_progress", Name: "In Progress"},
				{ID: "resolved", Name: "Resolved"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -3, Name: "Meeting Planner", Description: "Organize and track meetings and briefings.",
			Columns: []BoardCol{
				{ID: "planned", Name: "Planned"},
				{ID: "preparing", Name: "Preparing"},
				{ID: "completed", Name: "Completed"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -4, Name: "Resource Allocation", Description: "Manage resource requests and allocation.",
			Columns: []BoardCol{
				{ID: "requested", Name: "Requested"},
				{ID: "approved", Name: "Approved"},
				{ID: "allocated", Name: "Allocated"},
				{ID: "returned", Name: "Returned"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -5, Name: "Decision Tracker", Description: "Track decisions from proposal to implementation.",
			Columns: []BoardCol{
				{ID: "proposed", Name: "Proposed"},
				{ID: "under_review", Name: "Under Review"},
				{ID: "approved", Name: "Approved"},
				{ID: "implemented", Name: "Implemented"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -6, Name: "Shift Handover", Description: "Track items for shift handover and continuity.",
			Columns: []BoardCol{
				{ID: "carry_over", Name: "Carry Over"},
				{ID: "in_progress", Name: "In Progress"},
				{ID: "handed_over", Name: "Handed Over"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -7, Name: "Exercise Planning", Description: "Plan and track exercise scenarios and injects.",
			Columns: []BoardCol{
				{ID: "backlog", Name: "Backlog"},
				{ID: "ready", Name: "Ready"},
				{ID: "active", Name: "Active"},
				{ID: "evaluated", Name: "Evaluated"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: -8, Name: "Logistics Pipeline", Description: "Track supplies and logistics requests.",
			Columns: []BoardCol{
				{ID: "requested", Name: "Requested"},
				{ID: "sourcing", Name: "Sourcing"},
				{ID: "in_transit", Name: "In Transit"},
				{ID: "delivered", Name: "Delivered"},
			},
			Visibility: "global", CreatedAt: now, UpdatedAt: now,
		},
	}
}
