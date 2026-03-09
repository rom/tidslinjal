package main

import "time"

// AppVersion is the current application version
const AppVersion = "4.0.0"


// AppGitHub is the project repository URL
const AppGitHub = "https://github.com/rom/tidslinjal"

// Role defines user access levels
type Role string

const (
	RoleObserver      Role = "observer"      // read-only access (same level as read)
	RoleRead          Role = "read"
	RoleReporter      Role = "reporter"      // can comment + set responded/completed, needs approval
	RoleReadWrite     Role = "readwrite"
	RoleTeamLead      Role = "teamlead"      // can create groups/layers, verify/reject events
	RoleOpLead        Role = "oplead"        // operations lead: master timeline + teamlead rights
	RoleStaffOfficer     Role = "staffofficer"      // staff officer assistant: same rights as oplead
	RoleStaffOfficerFull Role = "staffofficer_full" // staff officer: same rights as oplead; requires J-designation
	RoleAdmin            Role = "admin"             // full access
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
	{Key: "mote", Label: "Meeting", Color: "#7F8C8D", IsSystem: true,
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
	{Key: "assigned_task", Label: "Assigned Task", Color: "#E67E22", IsSystem: true, Icon: "📌",
		LabelSV: "Tilldelad uppgift", LabelFR: "Tâche assignée"},
	{Key: "standup", Label: "Standup Meeting", Color: "#00ACC1", IsSystem: true,
		LabelSV: "Daglig standup", LabelFR: "Réunion debout"},
	{Key: "physical_meeting", Label: "Physical Meeting", Color: "#D35400", IsSystem: true,
		LabelSV: "Fysiskt möte", LabelFR: "Réunion physique", Icon: "🏢"},
}

// EventTypeDef is a dynamic (user/admin definable) event type
type EventTypeDef struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Label     string    `json:"label"`
	LabelSV   string    `json:"label_sv,omitempty"`
	LabelFR   string    `json:"label_fr,omitempty"`
	Color     string    `json:"color"`
	Icon      string    `json:"icon,omitempty"`
	IsSystem  bool      `json:"is_system"`
	CreatedBy int64     `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// User represents a system user
type User struct {
	ID                  int64     `json:"id"`
	Username            string    `json:"username"`
	PasswordHash        string    `json:"password_hash,omitempty"`
	DisplayName         string    `json:"display_name"`
	Email               string    `json:"email,omitempty"`
	Role                Role      `json:"role"`
	CanLock             bool      `json:"can_lock"`
	Vetted              bool      `json:"vetted"`                        // false = pending admin approval (vetted registration mode)
	NATODesignations    []string  `json:"nato_designations,omitempty"`   // NATO J-staff designations e.g. ["J3","J5"]
	PasswordResetToken  string    `json:"password_reset_token,omitempty"`
	PasswordResetExpiry *time.Time `json:"password_reset_expiry,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
}

// UserPublic is the safe view of a user (no password hash or reset tokens)
type UserPublic struct {
	ID               int64     `json:"id"`
	Username         string    `json:"username"`
	DisplayName      string    `json:"display_name"`
	Email            string    `json:"email,omitempty"`
	Role             Role      `json:"role"`
	CanLock          bool      `json:"can_lock"`
	Vetted           bool      `json:"vetted"`
	NATODesignations []string  `json:"nato_designations,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

func (u *User) Public() UserPublic {
	return UserPublic{
		ID:               u.ID,
		Username:         u.Username,
		DisplayName:      u.DisplayName,
		Email:            u.Email,
		Role:             u.Role,
		CanLock:          u.CanLock,
		Vetted:           u.Vetted,
		NATODesignations: u.NATODesignations,
		CreatedAt:        u.CreatedAt,
	}
}

// RegistrationSettings controls how new users can self-register
type RegistrationSettings struct {
	// Mode: off | open | vetted | generic_invitation | personal_invitation
	Mode           string `json:"mode"`
	InvitationCode string `json:"invitation_code,omitempty"` // used in generic_invitation mode
}

// PersonalInvitation is a single-use code for inviting a specific person
type PersonalInvitation struct {
	ID        int64      `json:"id"`
	Code      string     `json:"code"`
	Note      string     `json:"note,omitempty"` // e.g. intended recipient name/email
	Used      bool       `json:"used"`
	UsedBy    string     `json:"used_by,omitempty"`
	CreatedBy int64      `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
}

// ExtraClock is an additional timezone clock shown in the header
type ExtraClock struct {
	ID       int    `json:"id"`
	Timezone string `json:"timezone"` // IANA timezone, e.g. "Europe/Tallinn"
	Label    string `json:"label"`    // Short display name, e.g. "Tallinn"
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
	SynthLabel      bool         `json:"synth_label"`              // show H+N label on red line
	DateFormat      string       `json:"date_format,omitempty"`    // iso | uk | fr | sv
	ExtraClocks     []ExtraClock `json:"extra_clocks,omitempty"`   // additional timezone clocks
	ShowEventIcons  *bool        `json:"show_event_icons,omitempty"` // nil = true (default on)
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
	Sound          string     `json:"sound,omitempty"`       // alarm sound: "klaxon" | "beep" | "chime" | "siren" | "alert" | "none"
	WebhookURL     string     `json:"webhook_url,omitempty"` // optional per-alarm webhook URL called when alarm fires
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
	Sound      string    `json:"sound,omitempty"`
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
	ID            int64           `json:"id"`
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	ExerciseName  string          `json:"exercise_name,omitempty"` // optional: sets exercise label when applied/imported
	DayStartHour  int             `json:"day_start_hour,omitempty"` // preferred start of day when applied (0-23)
	DayEndHour    int             `json:"day_end_hour,omitempty"`   // preferred end of day when applied (1-24)
	Scope         string          `json:"scope"`                   // private | public
	CreatedBy     int64           `json:"created_by"`
	CreatedByName string          `json:"created_by_name"`
	CreatedAt     time.Time       `json:"created_at"`
	Items         []TemplateItem  `json:"items"`
	ItemCount     int             `json:"item_count"`
	Phases        []TemplatePhase `json:"phases,omitempty"` // optional phase blocks
	Locks         []TemplateLock  `json:"locks,omitempty"`  // optional time locks
	Roles         []RoleConfig    `json:"roles,omitempty"`  // optional role configs
	// Theme / UX settings applied when the template is loaded
	Theme         string          `json:"theme,omitempty"`          // dark | light
	Size          string          `json:"size,omitempty"`           // small | normal | large | huge
	Language      string          `json:"language,omitempty"`       // en | sv | fr
	OperationMode string          `json:"operation_mode,omitempty"` // exercise | incident | operation
	GroupLabel    string          `json:"group_label,omitempty"`    // group | unit | team
	UserLabel     string          `json:"user_label,omitempty"`     // users | soldiers | personnel
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
	// Alarm settings: if AlarmLeadTime > 0, an alarm is created for the applying user
	AlarmLeadTime     int                  `json:"alarm_lead_time,omitempty"`  // minutes before event; 0 = no alarm
	AlarmSound        string               `json:"alarm_sound,omitempty"`      // optional sound name
}

// TemplatePhase is a phase block stored relative to T=0 for use in templates
type TemplatePhase struct {
	Name           string `json:"name"`
	Color          string `json:"color"`
	StartOffsetMin int    `json:"start_offset_min"`
	EndOffsetMin   int    `json:"end_offset_min"`
	Order          int    `json:"order"`
}

// TemplateLock is a time lock stored relative to T=0 for use in templates
type TemplateLock struct {
	StartOffsetMin int    `json:"start_offset_min"`
	EndOffsetMin   int    `json:"end_offset_min"`
	Reason         string `json:"reason"`
	Scope          string `json:"scope"` // all | master | layer
}

// RoleConfig holds a customisable display name and capability flags for a role
type RoleConfig struct {
	Key          string            `json:"key"`
	DisplayName  string            `json:"display_name"`           // default (English) display name
	DisplayNames map[string]string `json:"display_names,omitempty"` // per-language names: "en", "sv", "fr"
	Capabilities map[string]bool   `json:"capabilities"`
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

// OIDCPersistentConfig stores OIDC settings that can be configured via the UI.
// Client secret is stored but never sent to the frontend.
type OIDCPersistentConfig struct {
	Enabled      bool   `json:"enabled"`
	Issuer       string `json:"issuer"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret,omitempty"`
	RedirectURL  string `json:"redirect_url,omitempty"`
	Exclusive    bool   `json:"exclusive"`
	DefaultRole  string `json:"default_role,omitempty"` // readwrite | teamlead | oplead
}

// ExerciseSettings controls synthetic time display across the application
type ExerciseSettings struct {
	Enabled         bool   `json:"enabled"`
	Epoch           string `json:"epoch"`                     // ISO8601: STARTEX / OPSTART / Incident start
	Endex           string `json:"endex,omitempty"`           // ISO8601: ENDEX / OPEND / Incident end
	Label           string `json:"label"`                     // exercise/incident/operation name shown in header
	Paused          bool   `json:"paused"`                    // freeze timeline progression
	PausedAt        string `json:"paused_at,omitempty"`       // ISO8601: when it was paused
	DayHoursOnly    bool   `json:"day_hours_only"`            // synthetic time only advances during day hours
	IncludeWeekends bool   `json:"include_weekends"`          // show weekends and count them in synthetic time (default true)
	GroupLabel      string `json:"group_label,omitempty"`     // "group" | "unit" | "team"
	UserLabel       string `json:"user_label,omitempty"`      // "users" | "soldiers" | "personnel"
	OperationMode   string `json:"operation_mode,omitempty"`  // "exercise" | "incident" | "operation"
	ExIndex         int    `json:"ex_index,omitempty"`        // exercise/incident index number
}
