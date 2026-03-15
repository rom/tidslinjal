package main

import "time"

// AppVersion is the current application version
const AppVersion = "7.0.0"


// AppGitHub is the project repository URL
const AppGitHub = "https://github.com/rom/tidslinjal"

// Role defines user access levels
type Role string

const (
	RoleObserver      Role = "observer"      // read-only access (same level as read)
	RoleRead          Role = "read"
	RoleReporter      Role = "reporter"      // can comment + set responded/completed, needs approval
	RoleReadWrite     Role = "teammember"
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
	{Key: "pause", Label: "Pause", Color: "#95A5A6", IsSystem: true, Icon: "⏸",
		LabelSV: "Paus", LabelFR: "Pause"},
	{Key: "timed_event", Label: "Timed Event", Color: "#E74C3C", IsSystem: true, Icon: "⏱",
		LabelSV: "Tidsstyrd händelse", LabelFR: "Événement chronométré"},
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
	// Professional profile fields
	Title     string `json:"title,omitempty"`      // job title / position
	Rank      string `json:"rank,omitempty"`       // military rank or equivalent
	JobRole   string `json:"job_role,omitempty"`   // functional role / position description
	Expertise string `json:"expertise,omitempty"` // area of expertise
	// Profile photo (base64 data URL, e.g. "data:image/jpeg;base64,…")
	PhotoDataURL string `json:"photo_data_url,omitempty"`
	// Social/communication handles
	MattermostHandle string `json:"mattermost_handle,omitempty"`
	DiscordHandle    string `json:"discord_handle,omitempty"`
	SignalHandle     string `json:"signal_handle,omitempty"`
	Telephone        string `json:"telephone,omitempty"`
	Cellular         string `json:"cellular,omitempty"`
	// Login tracking
	LastLoginAt        *time.Time `json:"last_login_at,omitempty"`
	LastLoginIP        string     `json:"last_login_ip,omitempty"`
	LastLoginDomain    string     `json:"last_login_domain,omitempty"`
	LoginCount         int        `json:"login_count"`
	LastFailedLoginAt  *time.Time `json:"last_failed_login_at,omitempty"`
	LastFailedLoginIP  string     `json:"last_failed_login_ip,omitempty"`
	IsOIDC          bool       `json:"is_oidc,omitempty"` // true if this account was created via OIDC
	// WebCal subscription token (unique per user, for calendar sync)
	WebCalToken string `json:"webcal_token,omitempty"`
	// Blocked: admin can block a user from logging in (even via OIDC)
	Blocked bool `json:"blocked,omitempty"`
	// Location: user's physical location (free text, e.g. "Stockholm, Sweden")
	Location     string `json:"location,omitempty"`
	Latitude     float64 `json:"latitude,omitempty"`
	Longitude    float64 `json:"longitude,omitempty"`
	Availability string `json:"availability,omitempty"` // free | busy | dnd | away
}

// UserPublic is the safe view of a user (no password hash or reset tokens)
type UserPublic struct {
	ID               int64      `json:"id"`
	Username         string     `json:"username"`
	DisplayName      string     `json:"display_name"`
	Email            string     `json:"email,omitempty"`
	Role             Role       `json:"role"`
	CanLock          bool       `json:"can_lock"`
	Vetted           bool       `json:"vetted"`
	NATODesignations []string   `json:"nato_designations,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	// Professional profile fields
	Title        string `json:"title,omitempty"`
	Rank         string `json:"rank,omitempty"`
	JobRole      string `json:"job_role,omitempty"`
	Expertise    string `json:"expertise,omitempty"`
	PhotoDataURL string `json:"photo_data_url,omitempty"`
	// Communication
	MattermostHandle string     `json:"mattermost_handle,omitempty"`
	DiscordHandle    string     `json:"discord_handle,omitempty"`
	SignalHandle     string     `json:"signal_handle,omitempty"`
	Telephone        string     `json:"telephone,omitempty"`
	Cellular         string     `json:"cellular,omitempty"`
	LastLoginAt       *time.Time `json:"last_login_at,omitempty"`
	LoginCount        int        `json:"login_count"`
	LastFailedLoginAt *time.Time `json:"last_failed_login_at,omitempty"`
	LastFailedLoginIP string     `json:"last_failed_login_ip,omitempty"`
	IsOIDC            bool       `json:"is_oidc,omitempty"`
	Blocked           bool       `json:"blocked,omitempty"`
	Location         string     `json:"location,omitempty"`
	Latitude         float64    `json:"latitude,omitempty"`
	Longitude        float64    `json:"longitude,omitempty"`
	Availability     string     `json:"availability,omitempty"`
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
		Title:            u.Title,
		Rank:             u.Rank,
		JobRole:          u.JobRole,
		Expertise:        u.Expertise,
		PhotoDataURL:     u.PhotoDataURL,
		MattermostHandle: u.MattermostHandle,
		DiscordHandle:    u.DiscordHandle,
		SignalHandle:     u.SignalHandle,
		Telephone:        u.Telephone,
		Cellular:         u.Cellular,
		LastLoginAt:       u.LastLoginAt,
		LoginCount:        u.LoginCount,
		LastFailedLoginAt: u.LastFailedLoginAt,
		LastFailedLoginIP: u.LastFailedLoginIP,
		IsOIDC:            u.IsOIDC,
		Blocked:          u.Blocked,
		Location:         u.Location,
		Latitude:         u.Latitude,
		Longitude:        u.Longitude,
		Availability:     u.Availability,
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
	Language        string   `json:"language"`        // en | sv | fr | fi
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
	DateFormat      string       `json:"date_format,omitempty"`    // iso | uk | fr | sv | dtg
	ExtraClocks     []ExtraClock `json:"extra_clocks,omitempty"`   // additional timezone clocks
	ShowEventIcons  *bool        `json:"show_event_icons,omitempty"` // nil = true (default on)
	ViewSpacing     float64      `json:"view_spacing,omitempty"`     // 1 | 1.5 | 2 — row spacing multiplier
	ShowDayOfYear   bool         `json:"show_day_of_year,omitempty"` // show day-of-year number on calendar
	ShowDayName     *bool        `json:"show_day_name,omitempty"`    // nil = true (default on) — show weekday name in column headers
	ShowWeekNumbers bool         `json:"show_week_numbers,omitempty"` // show week numbers on calendar
	WeekNumberStyle string       `json:"week_number_style,omitempty"` // "iso" (1-52) or "year_week" (Y-WW)
	PushEventChanges *bool       `json:"push_event_changes,omitempty"` // browser notifications for event changes
	// v6.1.0 additions
	TimeFormat         string   `json:"time_format,omitempty"`          // 24h | 12h (default: 24h)
	HighContrast       bool     `json:"high_contrast,omitempty"`        // high-contrast accessibility overlay
	ColorBlindMode     string   `json:"color_blind_mode,omitempty"`     // off | protanopia | deuteranopia | tritanopia
	DefaultLandingView string   `json:"default_landing_view,omitempty"` // grid | list | log_book | decisions | map | reports
	AutoFollowNow      *bool    `json:"auto_follow_now,omitempty"`      // auto-scroll grid to current time
	DefaultRange       string   `json:"default_range,omitempty"`        // day|3days|week|2weeks|month — startup range
	DefaultResolution  string   `json:"default_resolution,omitempty"`   // ten|quarter|hour|day — default slot size
	WeekStartDay       string   `json:"week_start_day,omitempty"`       // monday | sunday (default: monday)
	TooltipDelay       int      `json:"tooltip_delay,omitempty"`        // 0 | 200 | 500 ms hover delay
	ConfirmDragMove    *bool    `json:"confirm_drag_move,omitempty"`    // confirm before drag-reschedule
	DefaultEventType   string   `json:"default_event_type,omitempty"`   // per-user default event type key
	WorkspacePresetsEnabled *bool `json:"workspace_presets_enabled,omitempty"` // enable workspace presets feature
	WorkspacePresets   []WorkspacePreset `json:"workspace_presets,omitempty"`  // saved workspace presets
	WelcomeURL         string   `json:"welcome_url,omitempty"`          // default welcome URL for banner
	HelpURL            string   `json:"help_url,omitempty"`             // default help URL for banner
	TrainingURL        string   `json:"training_url,omitempty"`         // training URL for welcome banner
	DemoURL            string   `json:"demo_url,omitempty"`             // demo URL for welcome banner
	TimeSeparator      string   `json:"time_separator,omitempty"`       // colon | dot (default: colon)
	ShowLangFlags      *bool    `json:"show_lang_flags,omitempty"`      // show language flags in toolbar (default: true)
	LogbookHideDecisions bool   `json:"logbook_hide_decisions,omitempty"` // hide 'decision' type from logbook (use decisions log only)
	ShowClockFlags     *bool    `json:"show_clock_flags,omitempty"`     // show national flags on timezone clocks (default: false)
	CountryCodeFormat  string   `json:"country_code_format,omitempty"` // alpha2 | alpha3 — ISO 3166-1 abbreviation format (default: alpha2)
}

// WorkspacePreset stores a full "working posture" that can be restored with one click
type WorkspacePreset struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	View         string `json:"view,omitempty"`         // grid | list
	Range        string `json:"range,omitempty"`        // day|week|etc.
	Resolution   string `json:"resolution,omitempty"`   // hour|ten|quarter|day
	ZoomFactor   float64 `json:"zoom_factor,omitempty"`
	HiddenLayers []int64 `json:"hidden_layers,omitempty"`
	Filters      map[string]interface{} `json:"filters,omitempty"`
	SidebarTab   string `json:"sidebar_tab,omitempty"`
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
	PhysicalLocation  string      `json:"physical_location,omitempty"`  // for physical_meeting type
	LocationAddress   string      `json:"location_address,omitempty"`   // human-readable address (fallback/alternative to coordinates)
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
	// Dependencies: list of event IDs this event depends on (must finish before this starts)
	DependsOn []int64 `json:"depends_on,omitempty"`
	// Planned vs. actual: original planned times (set once, then tracked against actual)
	PlannedStart *time.Time `json:"planned_start,omitempty"`
	PlannedEnd   *time.Time `json:"planned_end,omitempty"`
	// Latitude/Longitude for physical events with map location
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	// Room/resource booking
	RoomID    *int64  `json:"room_id,omitempty"`
	RoomName  string  `json:"room_name,omitempty"`
	// Virtual meeting auto-creation
	MeetingURL string `json:"meeting_url,omitempty"` // auto-generated Teams/Zoom link
	// Countdown timer: minutes before event start to begin countdown (0 = no countdown)
	CountdownBeforeMinutes int `json:"countdown_before_minutes,omitempty"`
	// Timed event fields
	TimedDurationMinutes    int    `json:"timed_duration_minutes,omitempty"`    // duration in minutes for timed_event type
	TimedAlarms             string `json:"timed_alarms,omitempty"`             // comma-separated alarm points, e.g. "5,10,50%"
	TimedContinueAfter      bool   `json:"timed_continue_after"`               // continue counting (with +) after timer completes
	TimedPreShowMinutes     int    `json:"timed_pre_show_minutes,omitempty"`   // minutes before start to show detached timer (1/2/5)
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

// DayLabel is a custom label displayed at the top of a day column
type DayLabel struct {
	ID         int64    `json:"id"`
	Date       string   `json:"date"`       // YYYY-MM-DD format
	Label      string   `json:"label"`       // e.g. "Training Day", "Exercise"
	Color      string   `json:"color"`       // text color, e.g. "#ffffff"
	Background string   `json:"background"`  // background color, e.g. "#4A90D9"
	FontSize   string   `json:"font_size"`   // CSS font size, e.g. "12px", "var(--fs-xs)"
	FontWeight string   `json:"font_weight"` // CSS font weight, e.g. "bold", "600"
	CreatedBy  int64    `json:"created_by"`
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

// TemplateGroup defines a group to create when the template is applied
type TemplateGroup struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Members     []string `json:"members,omitempty"` // usernames (best-effort match on apply)
}

// TemplateLayer defines a layer to create when the template is applied
type TemplateLayer struct {
	Name        string  `json:"name"`
	Description string  `json:"description,omitempty"`
	Color       string  `json:"color,omitempty"`
	Visibility  string  `json:"visibility,omitempty"` // private | groups | public
	Permission  string  `json:"permission,omitempty"` // read | readwrite
	GroupIndex  []int   `json:"group_index,omitempty"` // indices into template Groups slice
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
	Groups        []TemplateGroup `json:"groups,omitempty"` // groups to create when applied
	Layers        []TemplateLayer    `json:"layers,omitempty"` // layers to create when applied
	DayLabels     []TemplateDayLabel `json:"day_labels,omitempty"` // day labels to create when applied
	// Theme / UX settings applied when the template is loaded
	Theme         string          `json:"theme,omitempty"`          // dark | light
	Size          string          `json:"size,omitempty"`           // small | normal | large | huge
	Language      string          `json:"language,omitempty"`       // en | sv | fr
	OperationMode string          `json:"operation_mode,omitempty"` // exercise | incident | operation
	GroupLabel    string          `json:"group_label,omitempty"`    // group | unit | team
	UserLabel     string          `json:"user_label,omitempty"`     // users | soldiers | personnel
	// Map / geographic settings
	MapCenter     []float64       `json:"map_center,omitempty"`     // [lat, lng] default center
	MapZoom       int             `json:"map_zoom,omitempty"`       // default zoom level
	MapLocations  []MapLocation   `json:"map_locations,omitempty"`  // named locations (HQ, bases, POIs)
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
	Layer             string               `json:"layer,omitempty"` // layer name (matched against template Layers)
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

// TemplateDayLabel is a day label stored relative to T=0 for use in templates
type TemplateDayLabel struct {
	DayOffsetMin int    `json:"day_offset_min"` // offset in minutes from template base time (rounded to day)
	Label        string `json:"label"`
	Color        string `json:"color"`
	Background   string `json:"background"`
	FontSize     string `json:"font_size,omitempty"`
	FontWeight   string `json:"font_weight,omitempty"`
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

// MailConfig stores SMTP settings for outgoing email
type MailConfig struct {
	Enabled    bool   `json:"enabled"`
	SMTPHost   string `json:"smtp_host"`
	SMTPPort   int    `json:"smtp_port"`   // default 587
	Username   string `json:"username"`
	Password   string `json:"password,omitempty"` // never sent to frontend
	FromAddr   string `json:"from_addr"`
	FromName   string `json:"from_name,omitempty"`
	TLSMode    string `json:"tls_mode,omitempty"` // starttls | tls | none
}

// APIKey represents an API key for external tool integration
type APIKey struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Key         string    `json:"key,omitempty"` // only shown on creation
	KeyHash     string    `json:"key_hash,omitempty"`
	Description string    `json:"description,omitempty"`
	CreatedBy   int64     `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
}

// FilterPreset is a saved filter configuration
type FilterPreset struct {
	ID          int64             `json:"id"`
	Name        string            `json:"name"`
	UserID      int64             `json:"user_id"`
	Filters     map[string]interface{} `json:"filters"`
	CreatedAt   time.Time         `json:"created_at"`
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
	DefaultRole  string `json:"default_role,omitempty"` // teammember | teamlead | oplead
}

// FederatedIdP represents an external identity provider for partner organizations
type FederatedIdP struct {
	ID           string `json:"id"`            // unique slug, e.g. "partner-nato"
	Name         string `json:"name"`          // display name, e.g. "NATO Partner SSO"
	Protocol     string `json:"protocol"`      // oidc | saml
	Issuer       string `json:"issuer"`        // OIDC issuer URL or SAML entity ID
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret,omitempty"`
	RedirectURL  string `json:"redirect_url,omitempty"`
	MetadataURL  string `json:"metadata_url,omitempty"` // SAML metadata URL
	Enabled      bool   `json:"enabled"`
	TrustRealm   string `json:"trust_realm"`            // e.g. "nato", "eu", "partner-org"
	DefaultRole  string `json:"default_role,omitempty"`  // role for auto-provisioned users
	AllowedDomains []string `json:"allowed_domains,omitempty"` // restrict by email domain
}

// TrustRealm defines a logical trust boundary for partner access
type TrustRealm struct {
	ID          string   `json:"id"`           // unique slug
	Name        string   `json:"name"`         // display name
	Description string   `json:"description,omitempty"`
	MaxRole     string   `json:"max_role"`     // highest role users from this realm can have
	Capabilities []string `json:"capabilities,omitempty"` // allowed capabilities for realm users
	IdPIDs      []string `json:"idp_ids"`      // which IdPs belong to this realm
}

// Room represents a bookable resource (meeting room, vehicle, equipment, etc.)
type Room struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`       // room | building | computer_service | data_center | vehicle | equipment | <custom>
	SubType     string    `json:"sub_type,omitempty"` // meeting_room | video_room | aula | studio | server_room | depot | ...
	Location    string    `json:"location,omitempty"`
	Capacity    int       `json:"capacity,omitempty"`
	Description string    `json:"description,omitempty"`
	Equipment   []string  `json:"equipment,omitempty"` // projector, whiteboard, etc.
	Icon        string    `json:"icon,omitempty"`      // selected symbol/emoji
	ImageName   string    `json:"image_name,omitempty"` // uploaded image filename (stored)
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
}

// CustomResourceType defines a user-created resource category (e.g. "Vehicles", "Radios").
type CustomResourceType struct {
	ID    int64  `json:"id"`
	Key   string `json:"key"`   // machine-readable key, e.g. "vehicle"
	Label string `json:"label"` // display name, e.g. "Vehicles"
	Icon  string `json:"icon"`  // emoji icon for the tab button
}

// RoomBooking represents a reservation of a room/resource for a time period
type RoomBooking struct {
	ID        int64      `json:"id"`
	RoomID    int64      `json:"room_id"`
	RoomName  string     `json:"room_name"`
	EventID   *int64     `json:"event_id,omitempty"` // linked event (optional)
	Title     string     `json:"title"`
	StartTime time.Time  `json:"start_time"`
	EndTime   time.Time  `json:"end_time"`
	BookedBy  int64      `json:"booked_by"`
	BookedByName string  `json:"booked_by_name"`
	CreatedAt time.Time  `json:"created_at"`
}

// MeetingConfig stores auto-creation settings for virtual meetings
type MeetingConfig struct {
	TeamsEnabled   bool   `json:"teams_enabled"`
	TeamsTenantID  string `json:"teams_tenant_id,omitempty"`
	TeamsClientID  string `json:"teams_client_id,omitempty"`
	TeamsSecret    string `json:"teams_secret,omitempty"`
	ZoomEnabled    bool   `json:"zoom_enabled"`
	ZoomAccountID  string `json:"zoom_account_id,omitempty"`
	ZoomClientID   string `json:"zoom_client_id,omitempty"`
	ZoomSecret     string `json:"zoom_secret,omitempty"`
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
	// Artificial time: user-defined "current time" for exercise simulation
	ArtificialTime        string `json:"artificial_time,omitempty"`         // ISO8601: the artificial "now"
	ArtificialTimeEnabled bool   `json:"artificial_time_enabled"`           // whether artificial time is active
	ArtificialTimeSetAt   string `json:"artificial_time_set_at,omitempty"`  // ISO8601: real wall-clock time when artificial_time was set
	LastTemplate          string `json:"last_template,omitempty"`           // name of the last applied template
	// Ready check: verify all activities changed from "planned" before a set time
	ReadyCheckEnabled     bool   `json:"ready_check_enabled"`               // whether ready check is active
	ReadyCheckTime        string `json:"ready_check_time,omitempty"`        // ISO8601: when to run the ready check
	ReadyCheckOffsetMins  int    `json:"ready_check_offset_mins,omitempty"` // minutes before epoch to check (alternative to absolute time)
	ReadyCheckUseOffset   bool   `json:"ready_check_use_offset"`            // if true, use offset from epoch instead of absolute time
	// Global URLs displayed in the welcome banner (set by admin, visible to all)
	WelcomeURL  string `json:"welcome_url,omitempty"`
	HelpURL     string `json:"help_url,omitempty"`
	TrainingURL string `json:"training_url,omitempty"`
	DemoURL     string `json:"demo_url,omitempty"`
}

// MapLocation represents a named geographic position (HQ, base, POI, etc.)
type MapLocation struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Type        string  `json:"type"`        // hq | staff_hq | base | temp_base | target | poi | resource
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Description string  `json:"description,omitempty"`
	GroupID     int64   `json:"group_id,omitempty"` // optional: linked group/unit
	Icon        string  `json:"icon,omitempty"`
}

// DecisionLogEntry represents a single entry in the decision log
type DecisionLogEntry struct {
	ID             int64     `json:"id"`
	SequenceNumber string    `json:"sequence_number,omitempty"` // e.g. "EX-AURORA-001"
	Timestamp      time.Time `json:"timestamp"`
	UserID         int64     `json:"user_id"`
	UserName       string    `json:"user_name"`
	DisplayName    string    `json:"display_name"`
	Title          string    `json:"title,omitempty"` // short decision title
	Decision       string    `json:"decision"`        // free text (decision body)
	LogType        string    `json:"log_type"`        // private | group | general
	// Executor: person/role/group assigned to execute the decision
	ExecutorType   string    `json:"executor_type,omitempty"`  // "role" | "group" | "person"
	ExecutorValue  string    `json:"executor_value,omitempty"` // role key, group id, or user id
	ExecutorLabel  string    `json:"executor_label,omitempty"` // display name
	GroupID        int64     `json:"group_id,omitempty"` // if log_type=group
	Confidential   bool      `json:"confidential"`    // only visible to users with confidential_read right
	// Decision request workflow
	Status            string     `json:"status,omitempty"`              // "" (decided) | "requested" | "approved" | "rejected"
	RequestedAt       *time.Time `json:"requested_at,omitempty"`        // when decision was requested
	RequestedOfType   string     `json:"requested_of_type,omitempty"`   // "role" | "group" | "person"
	RequestedOfValue  string     `json:"requested_of_value,omitempty"`  // role key, group id, or user id
	RequestedOfLabel  string     `json:"requested_of_label,omitempty"`  // display name of target
	ReviewedBy        int64      `json:"reviewed_by,omitempty"`         // user who approved/rejected
	ReviewedByName    string     `json:"reviewed_by_name,omitempty"`
	ReviewedAt        *time.Time `json:"reviewed_at,omitempty"`
	ReviewComment     string     `json:"review_comment,omitempty"`
	DecidedAt         *time.Time `json:"decided_at,omitempty"`          // when decision was actually made/approved
	// Reason / background for the decision
	Reason            string     `json:"reason,omitempty"`
	// Four-eyes / grandfather co-sign
	CoSignRequired    bool       `json:"co_sign_required,omitempty"`     // true if a co-signer is needed
	CoSignedBy        int64      `json:"co_signed_by,omitempty"`         // user who co-signed
	CoSignedByName    string     `json:"co_signed_by_name,omitempty"`
	CoSignedAt        *time.Time `json:"co_signed_at,omitempty"`
	CoSignComment     string     `json:"co_sign_comment,omitempty"`
	// File attachments
	Attachments       []DecisionAttachment `json:"attachments,omitempty"`
}

// DecisionAttachment is a file attached to a decision log entry
type DecisionAttachment struct {
	Filename   string `json:"filename"`
	StoredName string `json:"stored_name"`
	Size       int64  `json:"size"`
	MimeType   string `json:"mime_type"`
}

// AutoReportSchedule defines a server-side scheduled report
type AutoReportSchedule struct {
	ID         int64      `json:"id"`
	ReportType string     `json:"report_type"` // aar | timeline | per_layer | status_summary | daily_briefing | type_breakdown | responsible | planned_vs_actual
	Format     string     `json:"format"`      // html | excel | rtf | docx
	Frequency  string     `json:"frequency"`   // hourly | daily | weekly
	Delivery   string     `json:"delivery"`    // email | webhook | download
	Recipient  string     `json:"recipient"`   // email address or webhook URL
	CreatedBy  int64      `json:"created_by"`
	CreatedAt  time.Time  `json:"created_at"`
	LastRun    *time.Time `json:"last_run,omitempty"`
	NextRun    time.Time  `json:"next_run"`
	Enabled    bool       `json:"enabled"`
}

// SyslogConfig stores settings for remote syslog forwarding
type SyslogConfig struct {
	Enabled   bool   `json:"enabled"`
	Host      string `json:"host"`                 // syslog server hostname or IP
	Port      int    `json:"port"`                 // default 514 for UDP/TCP, 6514 for TLS
	Transport string `json:"transport"`            // udp | tcp | tls
	Format    string `json:"format"`               // classic | json
	AppName   string `json:"app_name,omitempty"`   // tag/app name in syslog messages (default: tidslinjal)
	Facility  int    `json:"facility,omitempty"`   // syslog facility 0-23 (default 1 = user-level)
	TLSVerify bool   `json:"tls_verify,omitempty"` // verify TLS certificate (default true)
}

// SecuritySettings controls server-side password quality enforcement
type SecuritySettings struct {
	PasswordPolicyEnabled bool `json:"password_policy_enabled"`
	MinLength             int  `json:"min_length,omitempty"`      // minimum password length (default 8)
	RequireUppercase      bool `json:"require_uppercase,omitempty"` // at least one A-Z
	RequireLowercase      bool `json:"require_lowercase,omitempty"` // at least one a-z
	RequireNumbers        bool `json:"require_numbers,omitempty"`   // at least one 0-9
	RequireSymbols        bool `json:"require_symbols,omitempty"`   // at least one symbol
}

// TLSConfig stores TLS certificate and key file paths for persistent server configuration.
// CLI flags --tls-cert / --tls-key always override values stored here.
// Changes take effect on next server restart.
type TLSConfig struct {
	CertFile string `json:"cert_file,omitempty"` // path to PEM certificate file
	KeyFile  string `json:"key_file,omitempty"`  // path to PEM private key file
}

// EventVersion records a historical snapshot of an event at a point in time
type EventVersion struct {
	ID        int64     `json:"id"`
	EventID   int64     `json:"event_id"`
	Version   int       `json:"version"` // monotonically increasing per event
	ChangedBy int64     `json:"changed_by"`
	ChangedByName string `json:"changed_by_name"`
	ChangedAt time.Time `json:"changed_at"`
	ChangeNote string   `json:"change_note,omitempty"` // summary of what changed
	Snapshot  Event     `json:"snapshot"`              // full event state before this change
}

// EditingLock tracks which user is currently editing an event (for collaborative editing)
type EditingLock struct {
	EventID   int64     `json:"event_id"`
	UserID    int64     `json:"user_id"`
	UserName  string    `json:"user_name"`
	LockedAt  time.Time `json:"locked_at"`
	ExpiresAt time.Time `json:"expires_at"` // auto-release after 2 minutes of inactivity
}

// GradualBackupSettings configures the automatic periodic data snapshot feature.
// When enabled, the server takes rolling ZIP snapshots at a configurable interval
// and retains up to MaxSnapshots copies before pruning the oldest.
type GradualBackupSettings struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"interval_minutes"` // 0 → default 15
	MaxSnapshots    int  `json:"max_snapshots"`     // 0 → default 48
}

// GradualBackupSnapshot is metadata about a single auto-backup snapshot file.
type GradualBackupSnapshot struct {
	Filename  string    `json:"filename"`
	CreatedAt time.Time `json:"created_at"`
	SizeBytes int64     `json:"size_bytes"`
}

// EventLogEntry represents an external event received via pub/sub or webhook
// LogBookEntry represents a single entry in the staff log book (stabsloggbok)
type LogBookEntry struct {
	ID          int64                `json:"id"`
	Timestamp   time.Time            `json:"timestamp"`
	UserID      int64                `json:"user_id"`
	UserName    string               `json:"user_name"`
	DisplayName string               `json:"display_name"`
	Category    string               `json:"category"` // incoming|outgoing|incident|directive|decision|action|briefing|situation|meeting|other
	Subject     string               `json:"subject"`
	Body        string               `json:"body"`
	Attachments []LogBookAttachment  `json:"attachments,omitempty"`
}

type LogBookAttachment struct {
	Filename   string `json:"filename"`
	StoredName string `json:"stored_name"`
	Size       int64  `json:"size"`
	MimeType   string `json:"mime_type,omitempty"`
}

// PersonReadyCheckParticipant is a participant in a person ready check
type PersonReadyCheckParticipant struct {
	UserID      int64  `json:"user_id"`
	UserName    string `json:"user_name"`
	Status      string `json:"status"`                // pending | ready | not_ready
	RespondedAt string `json:"responded_at,omitempty"` // ISO 8601 timestamp
}

// PersonReadyCheck tracks a per-participant readiness request
type PersonReadyCheck struct {
	ID            int64                         `json:"id"`
	CreatedBy     int64                         `json:"created_by"`
	CreatedByName string                        `json:"created_by_name"`
	EventID       *int64                        `json:"event_id,omitempty"`
	Message       string                        `json:"message,omitempty"`
	Participants  []PersonReadyCheckParticipant `json:"participants"`
	CreatedAt     time.Time                     `json:"created_at"`
	ScheduledAt   string                        `json:"scheduled_at,omitempty"`
}

type EventLogEntry struct {
	ID        int64     `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source"`    // e.g. "webhook", "mqtt", "kafka", "manual"
	Message   string    `json:"message"`
	Summary   string    `json:"summary,omitempty"`
	Data      string    `json:"data,omitempty"` // raw JSON payload
	UserID    int64     `json:"user_id,omitempty"`
	UserName  string    `json:"user_name,omitempty"`
}

// Notification is a persistent personal notification for a user
type Notification struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	Type         string    `json:"type"`              // event | prc | alarm | timer | system
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	RefID        string    `json:"ref_id,omitempty"`  // reference entity ID
	Read         bool      `json:"read"`
	Acknowledged bool      `json:"acknowledged"`
	CreatedAt    time.Time `json:"created_at"`
}

// MapResource represents an uploaded map file (geographical, network, etc.)
type MapResource struct {
	ID            int64        `json:"id"`
	Name          string       `json:"name"`
	Description   string       `json:"description,omitempty"`
	MapType       string       `json:"map_type"`      // geographical | network | electrical | floor_plan | custom
	Filename      string       `json:"filename"`       // stored filename on disk
	OriginalName  string       `json:"original_name"`  // original upload filename
	ContentType   string       `json:"content_type"`   // MIME type
	Size          int64        `json:"size"`
	CreatedBy     int64        `json:"created_by"`
	CreatedByName string       `json:"created_by_name"`
	CreatedAt     time.Time    `json:"created_at"`
	Overlays      []MapOverlay `json:"overlays,omitempty"`
	Locked        bool         `json:"locked"`                // whole-map lock
	LockedBy      int64        `json:"locked_by,omitempty"`   // user who locked
	Drawings      []MapDrawing `json:"drawings,omitempty"`    // freehand drawings, shapes, pins
}

// MapDrawing is a drawing element on a map (polyline, shape, marker)
type MapDrawing struct {
	Type    string      `json:"type"`              // polyline | rect | circle | marker
	LatLngs [][]float64 `json:"latlngs,omitempty"` // for polyline
	Bounds  [][]float64 `json:"bounds,omitempty"`  // for rect
	Lat     float64     `json:"lat,omitempty"`     // for circle/marker
	Lng     float64     `json:"lng,omitempty"`
	Radius  float64     `json:"radius,omitempty"`  // for circle
	Color   string      `json:"color,omitempty"`
	Weight  int         `json:"weight,omitempty"`
	Opacity float64     `json:"opacity,omitempty"`
	HTML    string      `json:"html,omitempty"`    // for marker icon
}

// MapOverlay is a layer of resources placed on a map
type MapOverlay struct {
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	Locked   bool             `json:"locked"`
	LockedBy int64            `json:"locked_by,omitempty"`
	Items    []MapOverlayItem `json:"items"`
}

// MapOverlayItem is a resource placed on a map overlay
type MapOverlayItem struct {
	ID    string  `json:"id"`
	Type  string  `json:"type"`            // user | group | building | service | custom
	RefID string  `json:"ref_id,omitempty"` // reference to user ID, group ID, etc.
	Label string  `json:"label"`
	X     float64 `json:"x"`              // position as percentage of map width
	Y     float64 `json:"y"`              // position as percentage of map height
	Icon  string  `json:"icon,omitempty"`
	Color string  `json:"color,omitempty"`
	Notes string  `json:"notes,omitempty"`
}

// RateLimitSettings stores configurable rate limit thresholds
type RateLimitSettings struct {
	LoginLimit         int `json:"login_limit"`
	RegistrationLimit  int `json:"registration_limit"`
	PasswordResetLimit int `json:"password_reset_limit"`
}

// GeoblockingSettings stores geoblocking configuration
type GeoblockingSettings struct {
	Enabled   bool     `json:"enabled"`
	Mode      string   `json:"mode"`      // "allow" or "block"
	Countries []string `json:"countries"` // ISO 3166-1 alpha-2 codes
}

// EncryptionSettings stores backup encryption configuration
type EncryptionSettings struct {
	Enabled bool `json:"enabled"`
}

// TestStats holds test case / unit test statistics for admin view
type TestStats struct {
	TestCases  int `json:"test_cases"`
	UnitTests  int `json:"unit_tests"`
	Passed     int `json:"passed"`
	Failed     int `json:"failed"`
	Skipped    int `json:"skipped"`
	Coverage   float64 `json:"coverage"`
}

// ReferenceDoc is a document/file stored in the reference library
type ReferenceDoc struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Description    string    `json:"description,omitempty"`
	Category       string    `json:"category"` // handbook | sop | policy | map | reference | checklist | faq | objectives | other
	Filename       string    `json:"filename"`
	OriginalName   string    `json:"original_name"`
	ContentType    string    `json:"content_type"`
	Size           int64     `json:"size"`
	UploadedBy     int64     `json:"uploaded_by"`
	UploadedByName string    `json:"uploaded_by_name"`
	UploadedAt     time.Time `json:"uploaded_at"`
	Tags           []string  `json:"tags,omitempty"`
	RefType        string    `json:"ref_type,omitempty"`  // file | url | local
	URL            string    `json:"url,omitempty"`       // URL for url-type references
	Content        string    `json:"content,omitempty"`   // inline content for local-type references
	// v6.1.0 additions
	Language       string    `json:"language,omitempty"`       // language of the reference (en|sv|fr|fi|de|no|da etc.)
	DetectedType   string    `json:"detected_type,omitempty"` // auto-detected file type (e.g. "pdf", "docx")
	CopyMode       string    `json:"copy_mode,omitempty"`     // central | local | link
	Owner          string    `json:"owner,omitempty"`          // document owner
	Custodian      string    `json:"custodian,omitempty"`      // document custodian
	ReferenceCount int       `json:"reference_count,omitempty"` // number of times referenced
	ChecksumMD5    string    `json:"checksum_md5,omitempty"`
	ChecksumSHA1   string    `json:"checksum_sha1,omitempty"`
	ChecksumSHA256 string    `json:"checksum_sha256,omitempty"`
	ChecksumSHA512 string    `json:"checksum_sha512,omitempty"`
}

// PollQuestionType defines the type of a poll question
type PollQuestionType string

const (
	PollQuestionScaleZeroThree PollQuestionType = "scale_0_3"
	PollQuestionYesNo          PollQuestionType = "yes_no"
	PollQuestionFreeText       PollQuestionType = "free_text"
)

// PollQuestion is a single question within a poll
type PollQuestion struct {
	ID       string           `json:"id"`
	Text     string           `json:"text"`
	Type     PollQuestionType `json:"type"`
	Required bool             `json:"required"`
}

// PollResponse is a single user's answer to a single question
type PollResponse struct {
	UserID     int64     `json:"user_id"`
	UserName   string    `json:"user_name"`
	QuestionID string    `json:"question_id"`
	Answer     string    `json:"answer"`
	AnsweredAt time.Time `json:"answered_at"`
}

// Poll is a multipoll / personnel check that targets users, groups, or roles
type Poll struct {
	ID            int64          `json:"id"`
	CreatedBy     int64          `json:"created_by"`
	CreatedByName string         `json:"created_by_name"`
	CreatedAt     time.Time      `json:"created_at"`
	Title         string         `json:"title"`
	Description   string         `json:"description,omitempty"`
	TargetType    string         `json:"target_type"`    // user | group | role
	TargetIDs     []string       `json:"target_ids"`     // user IDs, group IDs, or role names
	Questions     []PollQuestion `json:"questions"`
	Responses     []PollResponse `json:"responses"`
	Status        string         `json:"status"`          // open | closed
	ClosedAt      *time.Time     `json:"closed_at,omitempty"`
}

// DefaultPollQuestions returns the standard personnel-check questions
func DefaultPollQuestions() []PollQuestion {
	return []PollQuestion{
		{ID: "stress_self", Text: "How would you rate your personal stress level?", Type: PollQuestionScaleZeroThree, Required: true},
		{ID: "stress_team", Text: "How would you rate your team's stress level?", Type: PollQuestionScaleZeroThree, Required: true},
		{ID: "in_control", Text: "Do you feel in control of your current tasks?", Type: PollQuestionYesNo, Required: true},
		{ID: "need_assistance", Text: "Do you need assistance from Operations Lead or other central support?", Type: PollQuestionYesNo, Required: true},
		{ID: "need_assist_teamlead", Text: "Do you need assistance from other team leads?", Type: PollQuestionYesNo, Required: true},
		{ID: "free_text", Text: "Any additional comments or concerns?", Type: PollQuestionFreeText, Required: false},
	}
}

// ResourceNote is a note (review, comment, achievement) attached to a resource (user, group, role, function)
type ResourceNote struct {
	ID           int64     `json:"id"`
	ResourceType string    `json:"resource_type"` // user | group | role | function
	ResourceID   string    `json:"resource_id"`   // user ID, group ID, or role key
	NoteType     string    `json:"note_type"`     // general | performance | achievement | team_spirit
	Content      string    `json:"content"`
	CreatedBy    int64     `json:"created_by"`
	CreatedByName string   `json:"created_by_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ResourceStar is a star rating for a resource with visibility controls
type ResourceStar struct {
	ID           int64     `json:"id"`
	ResourceType string    `json:"resource_type"` // user | group | role | function
	ResourceID   string    `json:"resource_id"`
	Stars        int       `json:"stars"`         // 1-5
	Visibility   string    `json:"visibility"`    // global | team | role | private
	TeamID       *int64    `json:"team_id,omitempty"`    // if visibility=team, which team
	RoleKey      string    `json:"role_key,omitempty"`   // if visibility=role, which role
	CreatedBy    int64     `json:"created_by"`
	CreatedByName string   `json:"created_by_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
