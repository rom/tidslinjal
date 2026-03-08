package main

import "time"

// AppVersion is the current application version
const AppVersion = "3.6.0"


// AppGitHub is the project repository URL
const AppGitHub = "https://github.com/rom/tidslinjal"

// Role defines user access levels
type Role string

const (
	RoleRead      Role = "read"
	RoleReporter  Role = "reporter"  // can comment + set responded/completed, needs approval
	RoleReadWrite Role = "readwrite"
	RoleTeamLead  Role = "teamlead" // can create groups/layers, verify/reject events
	RoleOpLead    Role = "oplead"   // operations lead: master timeline + teamlead rights
	RoleAdmin     Role = "admin"    // full access
)

// EventStatus is the lifecycle state of an event
type EventStatus string

const (
	StatusPlanned     EventStatus = "planned"
	StatusActive      EventStatus = "active"
	StatusRespondedTo EventStatus = "responded_to"
	StatusCompleted   EventStatus = "completed"
	StatusSubmitted   EventStatus = "submitted"
	StatusVerified    EventStatus = "verified"
	StatusRejected    EventStatus = "rejected"
	StatusCancelled   EventStatus = "cancelled"
)

// EventType is a string key referencing a dynamic EventTypeDef
type EventType = string

// SystemEventTypes lists the built-in event type keys (cannot be deleted)
var SystemEventTypes = []EventTypeDef{
	{Key: "event", Label: "Event", Color: "#4A90D9", IsSystem: true,
		LabelSV: "Händelse", LabelFR: "Événement"},
	{Key: "instant", Label: "Instant", Color: "#F39C12", IsSystem: true,
		LabelSV: "Ögonblick", LabelFR: "Instant"},
	{Key: "mote", Label: "Meeting (Möte)", Color: "#7F8C8D", IsSystem: true,
		LabelSV: "Möte", LabelFR: "Réunion"},
	{Key: "decision", Label: "Decision", Color: "#27AE60", IsSystem: true,
		LabelSV: "Beslut", LabelFR: "Décision"},
	{Key: "deadline", Label: "Deadline", Color: "#C0392B", IsSystem: true,
		LabelSV: "Tidsgräns", LabelFR: "Échéance"},
	{Key: "activity", Label: "Activity", Color: "#2ECC71", IsSystem: true,
		LabelSV: "Aktivitet", LabelFR: "Activité"},
	{Key: "repeated", Label: "Repeated", Color: "#9B59B6", IsSystem: true,
		LabelSV: "Upprepande", LabelFR: "Récurrent"},
	{Key: "reporting", Label: "Reporting", Color: "#1ABC9C", IsSystem: true,
		LabelSV: "Rapportering", LabelFR: "Rapport"},
	{Key: "assigned_task", Label: "Assigned Task", Color: "#E67E22", IsSystem: true,
		LabelSV: "Tilldelad uppgift", LabelFR: "Tâche assignée"},
	{Key: "standup", Label: "Standup Meeting", Color: "#00ACC1", IsSystem: true,
		LabelSV: "Daglig standup", LabelFR: "Réunion debout"},
	{Key: "physical_meeting", Label: "Physical Meeting", Color: "#D35400", IsSystem: true,
		LabelSV: "Fysiskt möte", LabelFR: "Réunion physique"},
}

// EventTypeDef is a dynamic (user/admin definable) event type
type EventTypeDef struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Label     string    `json:"label"`
	LabelSV   string    `json:"label_sv,omitempty"`
	LabelFR   string    `json:"label_fr,omitempty"`
	Color     string    `json:"color"`
	IsSystem  bool      `json:"is_system"`
	CreatedBy int64     `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// User represents a system user
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"password_hash,omitempty"`
	DisplayName  string    `json:"display_name"`
	Role         Role      `json:"role"`
	CanLock      bool      `json:"can_lock"`
	CreatedAt    time.Time `json:"created_at"`
}

// UserPublic is the safe view of a user (no password hash)
type UserPublic struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	Role        Role      `json:"role"`
	CanLock     bool      `json:"can_lock"`
	CreatedAt   time.Time `json:"created_at"`
}

func (u *User) Public() UserPublic {
	return UserPublic{
		ID:          u.ID,
		Username:    u.Username,
		DisplayName: u.DisplayName,
		Role:        u.Role,
		CanLock:     u.CanLock,
		CreatedAt:   u.CreatedAt,
	}
}

// UserPreferences stores per-user UI settings
type UserPreferences struct {
	UserID          int64    `json:"user_id"`
	Theme           string   `json:"theme"`           // dark | light
	Size            string   `json:"size"`            // small | normal | large | huge
	Language        string   `json:"language"`        // en | sv | fr
	DayStartHour    int      `json:"day_start_hour"`  // 0-23
	DayEndHour      int      `json:"day_end_hour"`    // 1-24  (exclusive)
	HiddenTypes     []string `json:"hidden_types"`    // event type keys to hide
	ActiveLayers    []int64  `json:"active_layers"`   // legacy (was inclusion list)
	HiddenLayers    []int64  `json:"hidden_layers"`   // layer IDs to hide (exclusion list)
	WebhookURL      string   `json:"webhook_url,omitempty"`
	WebhookType     string   `json:"webhook_type,omitempty"` // mattermost | slack | generic
	DefaultView     string   `json:"default_view,omitempty"` // day|2days|3days|4days|week
	ShowOutOfHours  bool     `json:"show_out_of_hours"`      // show ghosted time outside day hours
	RedLineEnabled  bool     `json:"red_line_enabled"`       // show current-time red line
	RedLineColor    string   `json:"red_line_color,omitempty"`
	RedLineWidth    int      `json:"red_line_width,omitempty"`
	RedLineStyle    string   `json:"red_line_style,omitempty"` // solid | dashed | dotted
	SynthLabel      bool     `json:"synth_label"`              // show H+N label on red line
	DateFormat      string   `json:"date_format,omitempty"`    // iso | uk | fr | sv
}

// Group is a named set of users used for layer sharing
type Group struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedBy   int64     `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// GroupMembership links a user to a group
type GroupMembership struct {
	GroupID int64  `json:"group_id"`
	UserID  int64  `json:"user_id"`
	Role    string `json:"role"` // member | admin
}

// Layer is a named overlay of events that can be shared with groups
type Layer struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Color       string    `json:"color"`      // accent color for the layer
	OwnerID     int64     `json:"owner_id"`
	OwnerName   string    `json:"owner_name"`
	Visibility  string    `json:"visibility"` // private | groups | public
	GroupIDs    []int64   `json:"group_ids"`
	Permission  string    `json:"permission"` // read | readwrite  (for group members)
	CreatedAt   time.Time `json:"created_at"`
}

// Event represents a timeline event/activity
type Event struct {
	ID                int64       `json:"id"`
	Title             string      `json:"title"`
	Description       string      `json:"description"`
	EventType         EventType   `json:"event_type"`
	Color             string      `json:"color"`
	Status            EventStatus `json:"status"`
	StartTime         time.Time   `json:"start_time"`
	EndTime           *time.Time  `json:"end_time,omitempty"`
	AllDay            bool        `json:"all_day"`               // day-only activity (no specific time)
	Participant       string      `json:"participant,omitempty"` // "" | "intern" | "extern"
	PhysicalLocation  string      `json:"physical_location,omitempty"` // for physical_meeting type
	ContactURL        string      `json:"contact_url,omitempty"`       // URL, IP address, or phone number
	ContactType       string      `json:"contact_type,omitempty"`      // url | ip | phone
	VirtualMeetingType string     `json:"virtual_meeting_type,omitempty"` // mattermost|teams|signal|discord|teleconf|other
	IsRecurring       bool        `json:"is_recurring"`
	RecurrencePattern string      `json:"recurrence_pattern,omitempty"` // 30min | hourly | 2hours | 3hours | 4hours | daily | weekly | monthly | quarterly
	RecurrenceEnd     *time.Time  `json:"recurrence_end,omitempty"`
	RecurrenceExcl    []string    `json:"recurrence_excl,omitempty"` // ISO8601 timestamps of excluded occurrences
	LayerID           *int64      `json:"layer_id,omitempty"`
	ResponsibleID     *int64      `json:"responsible_id,omitempty"`
	ResponsibleName   string      `json:"responsible_name,omitempty"`
	InvitedUserIDs    []int64     `json:"invited_user_ids,omitempty"`
	InvitedGroupIDs   []int64     `json:"invited_group_ids,omitempty"`
	CreatedBy         int64       `json:"created_by"`
	CreatedByName     string      `json:"created_by_name"`
	CreatedAt         time.Time   `json:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at"`
	// Derived (not stored)
	AttachmentCount int `json:"attachment_count,omitempty"`
	CommentCount    int `json:"comment_count,omitempty"`
	// Verification
	VerifiedBy      int64      `json:"verified_by,omitempty"`
	VerifiedByName  string     `json:"verified_by_name,omitempty"`
	VerifiedAt      *time.Time `json:"verified_at,omitempty"`
	RejectionReason string     `json:"rejection_reason,omitempty"`
}

// EventComment is a comment on an event
type EventComment struct {
	ID          int64     `json:"id"`
	EventID     int64     `json:"event_id"`
	AuthorID    int64     `json:"author_id"`
	AuthorName  string    `json:"author_name"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"created_at"`
	// PendingApproval: for reporter role comments that change status
	PendingApproval bool        `json:"pending_approval,omitempty"`
	ApprovedBy      int64       `json:"approved_by,omitempty"`
	ApprovedAt      *time.Time  `json:"approved_at,omitempty"`
	StatusChange    EventStatus `json:"status_change,omitempty"`
}

// ExercisePhase is a visually distinct phase block on the timeline
type ExercisePhase struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
	Order     int       `json:"order"` // 0-9
	LayerID   *int64    `json:"layer_id,omitempty"` // nil = master timeline phase
	CreatedBy int64     `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// Attachment is a file attached to an event
type Attachment struct {
	ID           int64     `json:"id"`
	EventID      int64     `json:"event_id"`
	Filename     string    `json:"filename"`     // original name
	StoredName   string    `json:"stored_name"`  // name on disk
	Size         int64     `json:"size"`
	MimeType     string    `json:"mime_type"`
	UploadedBy   int64     `json:"uploaded_by"`
	UploaderName string    `json:"uploader_name"`
	CreatedAt    time.Time `json:"created_at"`
}

// Alarm is a personal user reminder tied to an event
type Alarm struct {
	ID             int64      `json:"id"`
	UserID         int64      `json:"user_id"`
	EventID        int64      `json:"event_id"`
	EventTitle     string     `json:"event_title"`
	EventTime      time.Time  `json:"event_time"`
	LeadTime       int        `json:"lead_time"` // minutes before
	IsActive       bool       `json:"is_active"`
	Fired          bool       `json:"fired"`
	AcknowledgedAt *time.Time `json:"acknowledged_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// LockedSlot represents a time slot locked by admin/designated user
type LockedSlot struct {
	ID           int64     `json:"id"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Reason       string    `json:"reason"`
	// Scope controls what the lock applies to: "all" | "master" | "layer"
	Scope        string    `json:"scope"`
	LayerID      *int64    `json:"layer_id,omitempty"` // only used when Scope=="layer"
	LockedBy     int64     `json:"locked_by"`
	LockedByName string    `json:"locked_by_name"`
	CreatedAt    time.Time `json:"created_at"`
}

// Session represents an authenticated user session
type Session struct {
	ID        string    `json:"id"`
	UserID    int64     `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

// AlarmNotification sent over SSE
type AlarmNotification struct {
	AlarmID    int64     `json:"alarm_id"`
	EventID    int64     `json:"event_id"`
	EventTitle string    `json:"event_title"`
	EventTime  time.Time `json:"event_time"`
	LeadTime   int       `json:"lead_time"`
	Message    string    `json:"message"`
}

// AuditEntry records every significant action in the system
type AuditEntry struct {
	ID         int64     `json:"id"`
	Timestamp  time.Time `json:"timestamp"`
	UserID     int64     `json:"user_id"`
	UserName   string    `json:"user_name"`
	Action     string    `json:"action"`      // created | updated | deleted | verified | rejected | status_changed
	EntityType string    `json:"entity_type"` // event | user | group | layer | lock | alarm
	EntityID   int64     `json:"entity_id"`
	Summary    string    `json:"summary"`
}

// Template is a named, reusable set of events (with relative time offsets)
type Template struct {
	ID            int64          `json:"id"`
	Name          string         `json:"name"`
	Description   string         `json:"description"`
	Scope         string         `json:"scope"` // private | public
	CreatedBy     int64          `json:"created_by"`
	CreatedByName string         `json:"created_by_name"`
	CreatedAt     time.Time      `json:"created_at"`
	Items         []TemplateItem `json:"items"`
	ItemCount     int            `json:"item_count"`
}

// TemplateAttachment stores attachment metadata within a template item
type TemplateAttachment struct {
	Filename   string `json:"filename"`
	StoredName string `json:"stored_name"` // reference to file on disk
	Size       int64  `json:"size"`
	MimeType   string `json:"mime_type"`
}

// TemplateItem is a single event blueprint stored relative to T=0
type TemplateItem struct {
	Title             string               `json:"title"`
	EventType         string               `json:"event_type"`
	Color             string               `json:"color"`
	Description       string               `json:"description"`
	StartOffsetMin    int                  `json:"start_offset_min"` // minutes from template base time
	DurationMin       int                  `json:"duration_min"`     // 0 = instant
	AllDay            bool                 `json:"all_day"`
	IsRecurring       bool                 `json:"is_recurring"`
	RecurrencePattern string               `json:"recurrence_pattern"`
	Participant       string               `json:"participant"`
	Attachments       []TemplateAttachment `json:"attachments,omitempty"`
}

// OIDCConfig holds the discovered OIDC provider endpoints
type OIDCConfig struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	ClientID              string `json:"-"`
	ClientSecret          string `json:"-"`
	RedirectURL           string `json:"-"`
}

// ExerciseSettings controls synthetic time display across the application
type ExerciseSettings struct {
	Enabled      bool   `json:"enabled"`
	Epoch        string `json:"epoch"`                    // ISO8601: STARTEX — real datetime = Day 1 T+0
	Endex        string `json:"endex,omitempty"`          // ISO8601: ENDEX — end of exercise
	Label        string `json:"label"`                    // exercise name shown in header
	Paused       bool   `json:"paused"`                   // freeze timeline progression
	PausedAt     string `json:"paused_at,omitempty"`      // ISO8601: when it was paused
	DayHoursOnly bool   `json:"day_hours_only"`           // synthetic time only advances during day hours
	GroupLabel   string `json:"group_label,omitempty"`    // "group" | "unit" | "team"
	ExIndex      int    `json:"ex_index,omitempty"`       // exercise index number
}
