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
	Color              string    `json:"color,omitempty"`                // board background/accent color
	ShareToken         string    `json:"share_token,omitempty"`          // token for sharable link
	ShowIcons          *bool     `json:"show_icons,omitempty"`           // show icons in subject (default true)
	PriorityBackground *bool     `json:"priority_background,omitempty"` // color bg by priority (default true)
	ShowArchival       *bool     `json:"show_archival,omitempty"`        // show archival controls (default true)
	SortMode           string    `json:"sort_mode,omitempty"`            // "normal", "priority", "due_date" (default "normal")
	HighlightMe        *bool     `json:"highlight_me,omitempty"`         // highlight boards user is responsible for (default true)
	HighlightStyle     string    `json:"highlight_style,omitempty"`      // "border", "color", "icon" (default "border")
	MyBoardsOnTop      *bool     `json:"my_boards_on_top,omitempty"`     // sort my boards to top (default true)
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
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
	ID              int64             `json:"id"`
	BoardID         int64             `json:"board_id"`
	ColumnID        string            `json:"column_id"`
	SortOrder       int               `json:"sort_order"`
	Subject         string            `json:"subject"`
	Note            string            `json:"note,omitempty"`
	ItemType        string            `json:"item_type,omitempty"`   // "task", "meeting", "checklist", "issue", "note", "other"
	Color           string            `json:"color,omitempty"`       // card background color
	Tags            []string          `json:"tags,omitempty"`
	Links           []BoardLink       `json:"links,omitempty"`
	DueDate         string            `json:"due_date,omitempty"`    // ISO date string (YYYY-MM-DD), optional
	ResponsibleID   int64             `json:"responsible_id,omitempty"`
	ResponsibleName string            `json:"responsible_name,omitempty"`
	Comments        []BoardComment    `json:"comments,omitempty"`
	CreatorID       int64             `json:"creator_id"`
	CreatorName     string            `json:"creator_name"`
	Attachments     []BoardAttachment `json:"attachments,omitempty"`
	History         []BoardHistory    `json:"history,omitempty"`
	ChecklistID     int64             `json:"checklist_id,omitempty"`  // linked checklist
	EventID         int64             `json:"event_id,omitempty"`      // linked event/meeting
	Priority        string            `json:"priority,omitempty"`      // "low", "high", "critical"
	Activities      []BoardActivity   `json:"activities,omitempty"`    // timestamped activity log entries
	RelatedItemIDs  []int64           `json:"related_item_ids,omitempty"` // IDs of related board items
	Archived        bool              `json:"archived,omitempty"`      // archived items are hidden from board view
	ShareToken      string            `json:"share_token,omitempty"`   // token for sharable link
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
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

// BoardLink is a URL link attached to a board item
type BoardLink struct {
	URL   string `json:"url"`
	Label string `json:"label,omitempty"`
}

// BoardComment is a comment on a board item
type BoardComment struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	UserName  string    `json:"user_name"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
}

// BoardActivity is a user-entered timestamped activity log entry on a board item
type BoardActivity struct {
	Text      string    `json:"text"`
	UserID    int64     `json:"user_id"`
	UserName  string    `json:"user_name"`
	CreatedAt time.Time `json:"created_at"`
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

// BuiltInBoardTemplateItems returns example items for each template (keyed by template ID).
// The "Basic Task Board" (ID -1) has no example items.
func BuiltInBoardTemplateItems() map[int64][]BoardItem {
	now := time.Now()
	return map[int64][]BoardItem{
		-2: { // Incident Response
			{Subject: "Server room temperature alert", ColumnID: "reported", SortOrder: 0, ItemType: "issue", Note: "Temperature sensors triggered in server room B.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Network outage sector 3", ColumnID: "triaging", SortOrder: 0, ItemType: "issue", Note: "Investigating root cause of connectivity loss.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Phishing email campaign detected", ColumnID: "in_progress", SortOrder: 0, ItemType: "task", Note: "Blocking sender domains and notifying affected users.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Badge system malfunction", ColumnID: "resolved", SortOrder: 0, ItemType: "issue", Note: "Firmware update applied, system restored.", CreatedAt: now, UpdatedAt: now},
		},
		-3: { // Meeting Planner
			{Subject: "Weekly status briefing", ColumnID: "planned", SortOrder: 0, ItemType: "meeting", Note: "Monday 09:00, all team leads.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Stakeholder update", ColumnID: "planned", SortOrder: 1, ItemType: "meeting", Note: "Prepare slides and talking points.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Safety review board", ColumnID: "preparing", SortOrder: 0, ItemType: "meeting", Note: "Collecting agenda items from department heads.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Post-exercise debrief", ColumnID: "completed", SortOrder: 0, ItemType: "meeting", Note: "Lessons learned documented.", CreatedAt: now, UpdatedAt: now},
		},
		-4: { // Resource Allocation
			{Subject: "3x portable radios", ColumnID: "requested", SortOrder: 0, ItemType: "task", Note: "Needed for field team deployment.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Transport vehicle", ColumnID: "approved", SortOrder: 0, ItemType: "task", Note: "Approved for logistics run Thursday.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Projector + screen", ColumnID: "allocated", SortOrder: 0, ItemType: "task", Note: "Set up in briefing room A.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Generator unit #4", ColumnID: "returned", SortOrder: 0, ItemType: "task", Note: "Returned and inspected, ready for next use.", CreatedAt: now, UpdatedAt: now},
		},
		-5: { // Decision Tracker
			{Subject: "Switch to encrypted radio channels", ColumnID: "proposed", SortOrder: 0, ItemType: "note", Note: "Proposal to migrate all comms to encrypted channels.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Extend shift rotation to 12h", ColumnID: "under_review", SortOrder: 0, ItemType: "note", Note: "HR and operations reviewing feasibility.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Adopt new reporting template", ColumnID: "approved", SortOrder: 0, ItemType: "note", Note: "Approved by ops lead, rollout next week.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Relocate command post", ColumnID: "implemented", SortOrder: 0, ItemType: "note", Note: "Moved to building C, all systems operational.", CreatedAt: now, UpdatedAt: now},
		},
		-6: { // Shift Handover
			{Subject: "Monitor water level sensor #7", ColumnID: "carry_over", SortOrder: 0, ItemType: "task", Note: "Rising trend, check every 30 min.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Coordinate with external agency", ColumnID: "carry_over", SortOrder: 1, ItemType: "task", Note: "Awaiting callback from regional HQ.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Update situation report", ColumnID: "in_progress", SortOrder: 0, ItemType: "task", Note: "Draft due by end of shift.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Perimeter check zone A-D", ColumnID: "handed_over", SortOrder: 0, ItemType: "task", Note: "Completed, no issues found.", CreatedAt: now, UpdatedAt: now},
		},
		-7: { // Exercise Planning
			{Subject: "Scenario: chemical spill at dock", ColumnID: "backlog", SortOrder: 0, ItemType: "task", Note: "Draft scenario with 5 injects.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Inject: comms failure", ColumnID: "ready", SortOrder: 0, ItemType: "task", Note: "Trigger at T+45min, test fallback procedures.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Scenario: mass casualty event", ColumnID: "active", SortOrder: 0, ItemType: "task", Note: "Currently running, 3 injects delivered.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Evacuation drill building A", ColumnID: "evaluated", SortOrder: 0, ItemType: "task", Note: "Completed in 4:32. Target was 5:00.", CreatedAt: now, UpdatedAt: now},
		},
		-8: { // Logistics Pipeline
			{Subject: "500x bottled water", ColumnID: "requested", SortOrder: 0, ItemType: "task", Note: "For forward operating base.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Medical supply kit (10x)", ColumnID: "sourcing", SortOrder: 0, ItemType: "task", Note: "Contacting suppliers for availability.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Fuel tanker resupply", ColumnID: "in_transit", SortOrder: 0, ItemType: "task", Note: "ETA 14:00, tracking active.", CreatedAt: now, UpdatedAt: now},
			{Subject: "Tent package (20-person)", ColumnID: "delivered", SortOrder: 0, ItemType: "task", Note: "Delivered and assembled at site B.", CreatedAt: now, UpdatedAt: now},
		},
	}
}

// ── Key Terrain Board ───────────────────────────────────────────────────────

// KeyTerrainEntry represents a single row in the Key Terrain Board
type KeyTerrainEntry struct {
	ID              int64            `json:"id"`
	SeqNum          int              `json:"seq_num,omitempty"`           // unique sequential number per entry (#)
	CapabilityID    int64            `json:"capability_id,omitempty"`     // linked capability resource ID
	Zone            string           `json:"zone,omitempty"`              // zone / area classification
	Function        string           `json:"function"`                    // what matters / cyber key terrain
	Status          string           `json:"status"`                      // working, degraded, down, unknown
	Trend           string           `json:"trend"`                       // improving, stable, worsening
	Threat          string           `json:"threat"`                      // hostile pressure description
	External        string           `json:"external"`                    // external dependencies / peer effects
	Comments        string           `json:"comments,omitempty"`          // free-form notes / remarks / flags for this entry
	Priority        int              `json:"priority"`                    // explicit ranking (1 = highest)
	ResponsibleID   int64            `json:"responsible_id,omitempty"`
	ResponsibleName string           `json:"responsible_name,omitempty"`
	OwnerName       string           `json:"owner_name,omitempty"`        // owner of the linked capability
	Actions         string           `json:"actions"`                     // what is being done
	Rounds          int              `json:"rounds,omitempty"`            // number of battle rhythm rounds on the board
	Ghosted         bool             `json:"ghosted,omitempty"`           // visually dimmed / inactive
	Archived        bool             `json:"archived,omitempty"`          // hidden from normal view
	FinishedAt      *time.Time       `json:"finished_at,omitempty"`       // when the entry was marked finished
	History         []KeyTerrainHist `json:"history,omitempty"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
}

// KeyTerrainHist tracks changes to a key terrain entry
type KeyTerrainHist struct {
	Timestamp time.Time `json:"timestamp"`
	UserID    int64     `json:"user_id"`
	UserName  string    `json:"user_name"`
	Field     string    `json:"field"`
	OldValue  string    `json:"old_value"`
	NewValue  string    `json:"new_value"`
}

// KeyTerrainSettings holds board-level display configuration
type KeyTerrainSettings struct {
	// Priority color coding
	PriorityColors map[string]string `json:"priority_colors,omitempty"` // e.g. {"1":"#e74c3c","2":"#e67e22","3":"#f1c40f"}
	// Status icons override
	StatusIcons map[string]string `json:"status_icons,omitempty"` // e.g. {"working":"✅","degraded":"⚠️"}
	// Trend icons override
	TrendIcons map[string]string `json:"trend_icons,omitempty"` // e.g. {"improving":"⬆️","stable":"➡️"}
	// Sort order
	SortBy string `json:"sort_by,omitempty"` // "priority","function","status","trend","responsible","entry_order","zone"
	// Ghosting style
	GhostStyle string `json:"ghost_style,omitempty"` // "grey","strikethrough","remove"
	// Show functions without priority (priority == 0); default true
	ShowNoPriority *bool `json:"show_no_priority,omitempty"`
	// Custom status labels: override default labels for status values
	StatusLabels map[string]string `json:"status_labels,omitempty"` // e.g. {"working":"Normal","degraded":"Limited"}
	// Hidden columns: columns that should not be displayed
	HiddenColumns map[string]bool `json:"hidden_columns,omitempty"` // e.g. {"threat":true,"rounds":true}
	// Custom column labels: override the default i18n label for a column.
	// Keys are the internal column IDs (e.g. "function","zone","threat");
	// values are the label text shown in the board header, filter panel,
	// and export column headings. Leave a key out to keep the default.
	ColumnLabels map[string]string `json:"column_labels,omitempty"` // e.g. {"function":"Task","threat":"Risk"}

	// Battle rhythm — shared exercise clock with cyclic steps. All fields
	// live server-side so every connected client sees the same H0.
	BattleRhythm BattleRhythmConfig `json:"battle_rhythm,omitempty"`
}

// BattleRhythmConfig describes a recurring cycle (e.g. "every 2 hours")
// used to drive exercise battle rhythm. Steps are timed relative to H0
// (the start of the current cycle) and may occur before or after H0.
type BattleRhythmConfig struct {
	// Enabled reveals the clock widget on the Key Terrain Board toolbar
	// and in the detached clock window. Must be true for the snapshot
	// scheduler to fire.
	Enabled bool `json:"enabled"`
	// ShowClock toggles the clock widget in the Key Terrain toolbar and
	// the card in the detached clock window independently of Enabled.
	ShowClock bool `json:"show_clock"`
	// CycleMinutes is the duration of one full cycle. Must be > 0 when
	// enabled. Typical values: 60, 120, 180.
	CycleMinutes int `json:"cycle_minutes,omitempty"`
	// StartedAt is the wall-clock time of H0 for the current cycle, or
	// nil if the clock is stopped/reset. When set, the current elapsed
	// position into the cycle is Now.Sub(StartedAt) mod CycleMinutes.
	StartedAt *time.Time `json:"started_at,omitempty"`
	// PausedAt freezes the clock at this moment. While non-nil, the
	// elapsed position is computed as PausedAt.Sub(StartedAt) rather
	// than Now.Sub(StartedAt), so the clock face and current step stop
	// advancing until the operator hits resume. nil means running.
	PausedAt *time.Time `json:"paused_at,omitempty"`
	// Steps are named events within each cycle, ordered by start offset.
	Steps []BattleRhythmStep `json:"steps,omitempty"`
	// SnapshotOffsets lists the minute offsets (relative to H0) at which
	// the snapshot scheduler should fire. Negative values are allowed
	// (e.g. -15 = fifteen minutes before H0 of each cycle) but are
	// normalised modulo CycleMinutes by the scheduler.
	SnapshotOffsets []int `json:"snapshot_offsets,omitempty"`
	// SnapshotFormats: any of "csv","json","xml","svg". Multiple formats
	// may be selected — every configured format is written each fire.
	SnapshotFormats []string `json:"snapshot_formats,omitempty"`
	// LastCycleIdx tracks the highest cycle index for which the per-cycle
	// scheduler has already incremented the Rounds counter on every active
	// Key Terrain entry. Incremented atomically by runDueBattleRhythmCycles
	// so a server restart or a delayed tick cannot double-increment.
	// Reset to 0 by the start and reset control actions.
	LastCycleIdx int `json:"last_cycle_idx,omitempty"`
}

// BattleRhythmStep is a single named event inside a cycle.
type BattleRhythmStep struct {
	Name             string `json:"name"`
	Description      string `json:"description,omitempty"`
	StartOffsetMin   int    `json:"start_offset_min"`           // minutes from H0; may be negative
	EndOffsetMin     *int   `json:"end_offset_min,omitempty"`    // nil = instant step; otherwise spans [start,end]
	// Color is an optional hex colour (e.g. "#3498db") used for the board
	// border while this step is the active one. Empty means "fall back to
	// a palette colour picked from the step's index on the client".
	Color            string `json:"color,omitempty"`
}

// KeyTerrainSnapshot is a point-in-time copy of the board for version control
type KeyTerrainSnapshot struct {
	ID        int64              `json:"id"`
	Timestamp time.Time          `json:"timestamp"`
	UserID    int64              `json:"user_id"`
	UserName  string             `json:"user_name"`
	Label     string             `json:"label,omitempty"`
	Entries   []KeyTerrainEntry  `json:"entries"`
}
