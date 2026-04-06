package main

import (
	"encoding/json"
	"time"
)

// AppVersion is the current application version.
// Override at build time: go build -ldflags "-X main.AppVersion=1.2.3 -X main.BuildCommit=abc123 -X main.BuildTime=2024-01-01T00:00:00Z"
var AppVersion = "8.3.0"

// BuildCommit is the git commit hash, set at build time via ldflags.
var BuildCommit = "dev"

// BuildTime is the build timestamp, set at build time via ldflags.
var BuildTime = ""


// AppGitHub is the project repository URL
const AppGitHub = "https://github.com/rom/tidslinjal"

// Role defines user access levels
type Role string

const (
	RoleObserver           Role = "observer"           // read-only access (same level as read)
	RoleRead               Role = "read"
	RoleReporter           Role = "reporter"           // can comment + set responded/completed, needs approval
	RoleReadWrite          Role = "teammember"
	RoleTeamLead           Role = "teamlead"           // can create groups/layers, verify/reject events
	RoleDeputyTeamLead     Role = "deputy_teamlead"    // same permissions as teamlead
	RoleOpLead             Role = "oplead"             // operations lead: master timeline + teamlead rights
	RoleDeputyOpLead       Role = "deputy_oplead"      // same permissions as oplead
	RoleStaffOfficer       Role = "staffofficer"       // staff officer assistant: same rights as oplead
	RoleStaffAssistant     Role = "staff_assistant"    // same permissions as staff officer
	RoleStaffOfficerFull   Role = "staffofficer_full"  // staff officer: same rights as oplead; requires J-designation
	RoleDeveloper          Role = "developer"          // developer: same access as admin
	RoleAdmin              Role = "admin"              // full access
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
	{Key: "external_event", Label: "External Event", Color: "#6C5CE7", IsSystem: true, Icon: "🔌",
		LabelSV: "Extern händelse", LabelFR: "Événement externe"},
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
	FailedLoginCount   int        `json:"failed_login_count,omitempty"`   // L-06: progressive lockout counter
	LockedUntil        *time.Time `json:"locked_until,omitempty"`         // L-06: account temporarily locked
	// Previous login tracking (preserved when a new login occurs)
	PrevLoginAt     *time.Time `json:"prev_login_at,omitempty"`
	PrevLoginIP     string     `json:"prev_login_ip,omitempty"`
	PrevLoginDomain string     `json:"prev_login_domain,omitempty"`
	IsOIDC          bool       `json:"is_oidc,omitempty"` // true if this account was created via OIDC
	// WebCal subscription token (unique per user, for calendar sync)
	WebCalToken string `json:"webcal_token,omitempty"`
	// Blocked: admin can block a user from logging in (even via OIDC)
	Blocked bool `json:"blocked,omitempty"`
	// MustChangePassword: forces user to change password on next login (C-03 fix)
	MustChangePassword bool `json:"must_change_password,omitempty"`
	// PasswordHistory stores bcrypt hashes of previous passwords to prevent reuse
	PasswordHistory []string `json:"password_history,omitempty"`
	// Location: user's physical location (free text, e.g. "Stockholm, Sweden")
	Location     string `json:"location,omitempty"`
	Latitude     float64 `json:"latitude,omitempty"`
	Longitude    float64 `json:"longitude,omitempty"`
	BuildingID   int64   `json:"building_id,omitempty"` // link to a building/room resource
	Availability string      `json:"availability,omitempty"` // free | busy | dnd | away
	Labels       []UserLabel `json:"labels,omitempty"`       // visible labels/tags on user profile
	// OIDC-synced profile fields
	FullName string `json:"full_name,omitempty"` // full name from IDP (given_name + family_name or name)
	Locale   string `json:"locale,omitempty"`    // user's preferred locale from IDP (e.g. "en", "sv")
	Address  string `json:"address,omitempty"`   // user's address from IDP
}

// UserLabel is a visible label/tag attached to a user profile.
// Labels are visible to anyone; setting/removing labels is audit-logged.
type UserLabel struct {
	Text    string `json:"text"`              // label text
	Color   string `json:"color,omitempty"`   // CSS color (e.g. "#e74c3c", "blue")
	SetBy   int64  `json:"set_by,omitempty"`  // user ID who set this label
	SetByName string `json:"set_by_name,omitempty"` // display name of who set it
	SetAt   string `json:"set_at,omitempty"`  // ISO timestamp when set
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
	// Previous login tracking (IP/Domain omitted from public view — V-34 fix)
	PrevLoginAt *time.Time `json:"prev_login_at,omitempty"`
	IsOIDC            bool       `json:"is_oidc,omitempty"`
	Blocked           bool       `json:"blocked,omitempty"`
	MustChangePassword bool      `json:"must_change_password,omitempty"`
	Location         string     `json:"location,omitempty"`
	Latitude         float64    `json:"latitude,omitempty"`
	Longitude        float64    `json:"longitude,omitempty"`
	Availability     string     `json:"availability,omitempty"`
	FullName         string      `json:"full_name,omitempty"`
	Locale           string      `json:"locale,omitempty"`
	Address          string      `json:"address,omitempty"`
	Labels           []UserLabel `json:"labels,omitempty"`
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
		// V-26 fix: LastFailedLoginIP omitted from public view to prevent IP leakage
		// V-34 fix: PrevLoginIP and PrevLoginDomain omitted from public view
		PrevLoginAt: u.PrevLoginAt,
		IsOIDC:            u.IsOIDC,
		Blocked:          u.Blocked,
		MustChangePassword: u.MustChangePassword,
		Location:         u.Location,
		Latitude:         u.Latitude,
		Longitude:        u.Longitude,
		Availability:     u.Availability,
		FullName:         u.FullName,
		Locale:           u.Locale,
		Address:          u.Address,
		Labels:           u.Labels,
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
	ShowDayName       *bool      `json:"show_day_name,omitempty"`       // nil = true (default on) — show weekday name in column headers
	ShowDaysToEpoch   *bool      `json:"show_days_to_epoch,omitempty"` // nil = true (default on) — show Day N relative to exercise epoch
	ShowWeekNumbers   bool       `json:"show_week_numbers,omitempty"`  // show week numbers on calendar
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
	TacticalFontEnabled bool   `json:"tactical_font_enabled,omitempty"` // enable tactical task graphics font
	TacticalFontFamily  string `json:"tactical_font_family,omitempty"`  // CSS font-family name for tactical font
	TickerEnabled       bool   `json:"ticker_enabled,omitempty"`        // show narrative ticker bar at bottom
	TickerCount         int    `json:"ticker_count,omitempty"`          // number of narrative entries in ticker (default 10)
	ShowWelcomeMessage  *bool  `json:"show_welcome_message,omitempty"`  // show welcome window on login (default true)
	// Accessibility settings (configurable per user)
	A11yFocusIndicators  bool   `json:"a11y_focus_indicators,omitempty"`  // enhanced keyboard focus indicators
	A11yReducedMotion    bool   `json:"a11y_reduced_motion,omitempty"`    // reduce animations (override OS setting)
	A11yScreenReader     bool   `json:"a11y_screen_reader,omitempty"`     // enable ARIA live regions and announcements
	A11yLargeClickTarget bool   `json:"a11y_large_click_targets,omitempty"` // enlarge click/touch targets (44px minimum)
	A11yFontScaling      string `json:"a11y_font_scaling,omitempty"`      // 100 | 125 | 150 — percentage text scaling
	A11ySkipLinks        bool   `json:"a11y_skip_links,omitempty"`        // show skip-to-content navigation links
	// Dashboard widget configuration (persisted server-side)
	DashboardConfig json.RawMessage `json:"dashboard_config,omitempty"` // JSON array of widget configs
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
	// Tamper protection: SHA-256 hash chain — each entry includes the hash of the previous entry
	PrevHash   string    `json:"prev_hash,omitempty"` // SHA-256 hash of the previous entry
	Hash       string    `json:"hash,omitempty"`      // SHA-256(ID+Timestamp+UserID+Action+EntityType+EntityID+Summary+PrevHash)
	RequestID  string    `json:"request_id,omitempty"` // HTTP request ID for audit correlation
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
	JWKSEndpoint          string `json:"jwks_uri"`
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
	Key         string    `json:"key,omitempty"`      // only shown on creation
	KeyHash     string    `json:"key_hash,omitempty"`
	KeyPlain    string    `json:"key_plain,omitempty"` // stored for admin reveal (if SaveRawKey enabled)
	Description string    `json:"description,omitempty"`
	Role        Role      `json:"role,omitempty"`      // configurable role (default: read)
	SaveRawKey  bool      `json:"save_raw_key"`        // store raw key for later reveal (default: false)
	RouteMode   string    `json:"route_mode,omitempty"` // "message_archive" (default) | "external_event"
	CreatedBy   int64     `json:"created_by"`
	CreatedAt    time.Time  `json:"created_at"`
	LastUsedAt   *time.Time `json:"last_used_at,omitempty"`
	LastUsedIP   string     `json:"last_used_ip,omitempty"`
	UsageCount   int64      `json:"usage_count"`
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
	Latitude    *float64  `json:"latitude,omitempty"`
	Longitude   *float64  `json:"longitude,omitempty"`
	Capacity    int       `json:"capacity,omitempty"`
	Description string    `json:"description,omitempty"`
	Equipment   []string  `json:"equipment,omitempty"` // projector, whiteboard, etc.
	Icon        string    `json:"icon,omitempty"`      // selected symbol/emoji
	ImageName   string    `json:"image_name,omitempty"` // uploaded image filename (stored)
	Enabled     bool      `json:"enabled"`
	// Capability-specific fields
	Zone           string `json:"zone,omitempty"`           // zone/area placement (for capabilities)
	Responsibility string `json:"responsibility,omitempty"` // who is responsible (for capabilities)
	Owner          string `json:"owner,omitempty"`          // owner of the capability
	Status         string `json:"status,omitempty"`         // operational status (for capabilities)
	CreatedAt   time.Time `json:"created_at"`
}

// CustomResourceType defines a user-created resource category (e.g. "Vehicles", "Radios").
type CustomResourceType struct {
	ID    int64  `json:"id"`
	Key   string `json:"key"`   // machine-readable key, e.g. "vehicle"
	Label string `json:"label"` // display name, e.g. "Vehicles"
	Icon  string `json:"icon"`  // emoji icon for the tab button
}

// ResourceIncident represents an incident, impact, or issue affecting a resource
type ResourceIncident struct {
	ID              int64     `json:"id"`
	ResourceType    string    `json:"resource_type"`           // building | computer_service | data_center | capability | application | infrastructure
	ResourceID      int64     `json:"resource_id"`             // references Room.ID
	Title           string    `json:"title"`
	Description     string    `json:"description,omitempty"`
	IncidentType    string    `json:"incident_type"`           // incident | impact | task
	Severity        string    `json:"severity"`                // low | medium | high | critical
	Status          string    `json:"status"`                  // open | in_progress | resolved | closed
	DecisionID      int64     `json:"decision_id,omitempty"`   // link to decision log entry
	CreatedByID     int64     `json:"created_by_id"`
	CreatedByName   string    `json:"created_by_name"`
	AssignedToID    int64     `json:"assigned_to_id,omitempty"`
	AssignedToName  string    `json:"assigned_to_name,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	ResolvedAt      *time.Time `json:"resolved_at,omitempty"`
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
	// Icon set: "emoji" (default) or "material" (Google Material Icons)
	IconSet string `json:"icon_set,omitempty"`
	// Global URLs displayed in the welcome banner (set by admin, visible to all)
	WelcomeURL  string `json:"welcome_url,omitempty"`
	HelpURL     string `json:"help_url,omitempty"`
	TrainingURL string `json:"training_url,omitempty"`
	DemoURL     string `json:"demo_url,omitempty"`
	// Mattermost DM base URL (e.g. https://mm.example.com/team/messages)
	MattermostDMURL string `json:"mattermost_dm_url,omitempty"`
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
	ApprovalType      string     `json:"approval_type,omitempty"`       // "approved" | "approved_with_condition" | "approved_with_modification"
	DecidedAt         *time.Time `json:"decided_at,omitempty"`          // when decision was actually made/approved
	// Reason / background for the decision
	Reason            string     `json:"reason,omitempty"`
	// Four-eyes / grandfather co-sign
	CoSignRequired    bool       `json:"co_sign_required,omitempty"`     // true if a co-signer is needed
	CoSignTargetID    int64      `json:"co_sign_target_id,omitempty"`    // designated co-signer user ID
	CoSignTargetName  string     `json:"co_sign_target_name,omitempty"`  // designated co-signer display name
	CoSignedBy        int64      `json:"co_signed_by,omitempty"`         // user who co-signed
	CoSignedByName    string     `json:"co_signed_by_name,omitempty"`
	CoSignedAt        *time.Time `json:"co_signed_at,omitempty"`
	CoSignComment     string     `json:"co_sign_comment,omitempty"`
	// Sharable link token
	ShareToken        string               `json:"share_token,omitempty"`
	// Deadline for decision
	Deadline          string               `json:"deadline,omitempty"` // ISO date string YYYY-MM-DD, optional
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

// DiaryEntry represents a single entry in a user's personal diary
type DiaryEntry struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	UserName    string    `json:"user_name"`
	DisplayName string    `json:"display_name"`
	Title       string    `json:"title"`
	Body        string    `json:"body"`           // HTML rich text content
	Tags        []string  `json:"tags,omitempty"`
	Mood        string    `json:"mood,omitempty"`  // optional mood indicator
	Private     bool      `json:"private"`         // if true, only author can read
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Attachments []DiaryAttachment `json:"attachments,omitempty"`
}

// DiaryAttachment is a file or image attached to a diary entry
type DiaryAttachment struct {
	Filename   string `json:"filename"`
	StoredName string `json:"stored_name"`
	Size       int64  `json:"size"`
	MimeType   string `json:"mime_type"`
}

// ReportArchiveEntry is a report stored in the report archive (under infomanagement)
type ReportArchiveEntry struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Description    string    `json:"description,omitempty"`
	Category       string    `json:"category"`                 // "local" | "incoming"
	Filename       string    `json:"filename"`
	StoredName     string    `json:"stored_name"`
	OriginalName   string    `json:"original_name,omitempty"`
	ContentType    string    `json:"content_type,omitempty"`
	Size           int64     `json:"size"`
	UploadedBy     int64     `json:"uploaded_by"`
	UploadedByName string    `json:"uploaded_by_name"`
	UploadedAt     time.Time `json:"uploaded_at"`
	Tags           []string  `json:"tags,omitempty"`
	Sender         string    `json:"sender,omitempty"`      // external system name for incoming reports
	ReportType     string    `json:"report_type,omitempty"` // e.g. "sitrep", "incident", "assessment"
	Subject        string    `json:"subject,omitempty"`     // subject line from external submission
}

// MessageArchiveEntry stores an incoming or local message in the message archive.
type MessageArchiveEntry struct {
	ID          int64     `json:"id"`
	SeqNum      int       `json:"seq_num"`                // auto-assigned sequence number
	Category    string    `json:"category"`                // "local" | "incoming"
	Subject     string    `json:"subject"`
	Sender      string    `json:"sender,omitempty"`        // originating system/user
	Body        string    `json:"body,omitempty"`
	MessageType string    `json:"message_type,omitempty"`  // e.g. "sitrep", "alert", "notification"
	Tags        []string  `json:"tags,omitempty"`
	Source      string    `json:"source,omitempty"`        // "api", "webhook", "connector", "manual"
	ExternalID  string    `json:"external_id,omitempty"`   // ID in external system
	RawPayload  string    `json:"raw_payload,omitempty"`   // original JSON payload
	CreatedBy   int64     `json:"created_by,omitempty"`
	CreatedByName string  `json:"created_by_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// ReportIngestConfig controls the incoming report interface
type ReportIngestConfig struct {
	Enabled bool `json:"enabled"`
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
	TLSVerify     bool `json:"tls_verify,omitempty"`      // deprecated: use tls_skip_verify instead
	TLSSkipVerify bool `json:"tls_skip_verify,omitempty"` // V-18: explicitly skip TLS verification (default false = verify)
}

// SecuritySettings controls server-side password quality enforcement and session management
type SecuritySettings struct {
	PasswordPolicyEnabled bool `json:"password_policy_enabled"`
	MinLength             int  `json:"min_length,omitempty"`      // minimum password length (default 8)
	RequireUppercase      bool `json:"require_uppercase,omitempty"` // at least one A-Z
	RequireLowercase      bool `json:"require_lowercase,omitempty"` // at least one a-z
	RequireNumbers        bool `json:"require_numbers,omitempty"`   // at least one 0-9
	RequireSymbols        bool `json:"require_symbols,omitempty"`   // at least one symbol

	// Password history: prevent reuse of recent passwords
	PasswordHistoryCount int `json:"password_history_count,omitempty"` // 0 = disabled, e.g. 5 = remember last 5

	// Session management settings
	SessionTimeEnabled bool `json:"session_time_enabled"`            // enforce max session duration
	SessionTimeHours   int  `json:"session_time_hours,omitempty"`    // max session lifetime in hours (default 100)
	IdleTimeoutEnabled bool `json:"idle_timeout_enabled"`            // enforce idle timeout
	IdleTimeoutHours   int  `json:"idle_timeout_hours,omitempty"`    // idle timeout in hours (default 100)
	LogoffOnPasswordChange bool `json:"logoff_on_password_change"`   // invalidate sessions on other devices when password changes (default true)
	RotateSessionOnRoleChange bool `json:"rotate_session_on_role_change"` // invalidate sessions when user role changes (default true)

	// SSO-only mode: when enabled, password login is disabled for all users
	// except the built-in admin account. Requires OIDC/SSO to be configured.
	DisablePasswordLogin bool `json:"disable_password_login"`

	// Upload quotas
	UploadQuotaDailyMB int `json:"upload_quota_daily_mb,omitempty"` // per-user daily upload limit in MB (0 = unlimited, default 500)
	UploadQuotaTotalMB int `json:"upload_quota_total_mb,omitempty"` // per-user total upload limit in MB (0 = unlimited, default 5000)

	// SSE connection limit per user
	MaxSSEConnsPerUser int `json:"max_sse_conns_per_user,omitempty"` // 0 = unlimited, default 5

	// Connector poll interval minimum (seconds)
	ConnectorPollMinSeconds int `json:"connector_poll_min_seconds,omitempty"` // default 30

	// Max comments per event
	MaxCommentsPerEvent int `json:"max_comments_per_event,omitempty"` // 0 = unlimited, default 500
}

// TLSConfig stores TLS certificate and key file paths for persistent server configuration.
// CLI flags --tls-cert / --tls-key always override values stored here.
// Changes take effect on next server restart.
type TLSConfig struct {
	CertFile string `json:"cert_file,omitempty"` // path to PEM certificate file
	KeyFile  string `json:"key_file,omitempty"`  // path to PEM private key file
}

// IPBlacklistEntry represents a single IP address or CIDR range on the deny list.
type IPBlacklistEntry struct {
	IP        string `json:"ip"`                  // IP address or CIDR (e.g. "192.168.1.1" or "10.0.0.0/8")
	Reason    string `json:"reason,omitempty"`     // why this IP was blocked
	AddedBy   string `json:"added_by,omitempty"`   // who added it
	AddedAt   string `json:"added_at,omitempty"`   // ISO timestamp
}

// IPBlacklistSettings stores the IP deny list configuration.
type IPBlacklistSettings struct {
	Enabled bool               `json:"enabled"`
	Entries []IPBlacklistEntry `json:"entries"`
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
	Fired         bool                          `json:"fired,omitempty"` // true once a scheduled check has been dispatched
	Tags          []string                     `json:"tags,omitempty"`
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
	MapType       string       `json:"map_type"`      // geographical | political | logical | network | electrical | floor_plan | org_chart | custom
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
	Category       string    `json:"category"` // handbook | sop | policy | map | reference | checklist | faq | objectives | exercise_documents | other
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
	Authors        string    `json:"authors,omitempty"`        // document authors (comma-separated)
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
	Tags       []string  `json:"tags,omitempty"`
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
	ScheduledAt   string         `json:"scheduled_at,omitempty"` // ISO 8601 time for timed polls
	ReminderMins  int            `json:"reminder_mins,omitempty"` // auto-remind non-responders after N minutes
	Fired         bool           `json:"fired,omitempty"`         // true once a scheduled poll has been activated
	Tags          []string       `json:"tags,omitempty"`
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

// PollQuestionnaire is a reusable set of questions that can be loaded into a poll
type PollQuestionnaire struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Questions   []PollQuestion `json:"questions"`
	BuiltIn     bool           `json:"built_in"`            // true for system-provided questionnaires
	CreatedBy   int64          `json:"created_by,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// BuiltInQuestionnaires returns the pre-defined questionnaire templates
func BuiltInQuestionnaires() []PollQuestionnaire {
	now := time.Now()
	return []PollQuestionnaire{
		{
			ID: -1, Name: "TeamLead Battle Rhythm Check", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Standard team lead personnel check — stress levels, control, and support needs.",
			Questions: []PollQuestion{
				{ID: "stress_self", Text: "How would you rate your personal stress level?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "stress_team", Text: "How would you rate your team's stress level?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "in_control", Text: "Do you feel in control of your current tasks?", Type: PollQuestionYesNo, Required: true},
				{ID: "need_assistance", Text: "Do you need assistance from Operations Lead or other central support?", Type: PollQuestionYesNo, Required: true},
				{ID: "need_assist_teamlead", Text: "Do you need assistance from other team leads?", Type: PollQuestionYesNo, Required: true},
				{ID: "free_text", Text: "Any additional comments or concerns?", Type: PollQuestionFreeText, Required: false},
			},
		},
		{
			ID: -2, Name: "Operational Picture Battle Rhythm Check", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Common Operational Picture (COP) check — assess how the operation is progressing and whether situational awareness is maintained.",
			Questions: []PollQuestion{
				{ID: "cop_progress", Text: "How would you rate the overall operational progress?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "cop_sa", Text: "How would you rate your current situational awareness?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "cop_timeline", Text: "Is the operation progressing according to the planned timeline?", Type: PollQuestionYesNo, Required: true},
				{ID: "cop_objectives", Text: "Are the current operational objectives still achievable?", Type: PollQuestionYesNo, Required: true},
				{ID: "cop_threats", Text: "How would you rate the current threat level compared to planning assumptions?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "cop_gaps", Text: "Are there any significant intelligence or information gaps affecting your area?", Type: PollQuestionYesNo, Required: true},
				{ID: "cop_resources", Text: "Are your resources (personnel, equipment, supplies) sufficient for current tasks?", Type: PollQuestionYesNo, Required: true},
				{ID: "cop_comments", Text: "Key observations or concerns about the operational picture?", Type: PollQuestionFreeText, Required: false},
			},
		},
		{
			ID: -3, Name: "Leadership Check", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Assess information management, leadership priorities, and cooperation towards primary objectives.",
			Questions: []PollQuestion{
				{ID: "lead_info_mgmt", Text: "Is there a working information management process in your area?", Type: PollQuestionYesNo, Required: true},
				{ID: "lead_info_flow", Text: "How would you rate the quality and timeliness of information flow?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "lead_priorities", Text: "Is leadership prioritizing the right tasks and resources?", Type: PollQuestionYesNo, Required: true},
				{ID: "lead_priority_clarity", Text: "How clear are the current priorities to your team?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "lead_cooperation", Text: "Is leadership cooperating effectively towards the primary objective?", Type: PollQuestionYesNo, Required: true},
				{ID: "lead_coordination", Text: "How would you rate cross-functional coordination and cooperation?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "lead_decisions", Text: "Are decisions being made at the right level and in a timely manner?", Type: PollQuestionYesNo, Required: true},
				{ID: "lead_comments", Text: "Observations or suggestions regarding leadership effectiveness?", Type: PollQuestionFreeText, Required: false},
			},
		},
		{
			ID: -4, Name: "International Partnership Check", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Evaluate the effectiveness of international partnership and multinational cooperation.",
			Questions: []PollQuestion{
				{ID: "intl_communication", Text: "How would you rate communication with international partners?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "intl_interop", Text: "Are interoperability procedures (technical, procedural, language) working effectively?", Type: PollQuestionYesNo, Required: true},
				{ID: "intl_coordination", Text: "How would you rate the coordination of tasks across national boundaries?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "intl_trust", Text: "Is there a sufficient level of mutual trust and understanding between partners?", Type: PollQuestionYesNo, Required: true},
				{ID: "intl_info_sharing", Text: "Is information sharing with international partners adequate and timely?", Type: PollQuestionYesNo, Required: true},
				{ID: "intl_cultural", Text: "How well are cultural and procedural differences being managed?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "intl_comments", Text: "Observations or suggestions for improving international partnership?", Type: PollQuestionFreeText, Required: false},
			},
		},
		{
			ID: -5, Name: "Defence Capability Check", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Assess the effectiveness of defence measures and environmental security.",
			Questions: []PollQuestion{
				{ID: "def_perimeter", Text: "How would you rate the current perimeter and physical security posture?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "def_cyber", Text: "How would you rate the cyber defence and IT security posture?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "def_monitoring", Text: "Are monitoring and surveillance systems operating effectively?", Type: PollQuestionYesNo, Required: true},
				{ID: "def_response", Text: "How would you rate the incident response readiness?", Type: PollQuestionScaleZeroThree, Required: true},
				{ID: "def_vulnerabilities", Text: "Are there any known unmitigated vulnerabilities in your area?", Type: PollQuestionYesNo, Required: true},
				{ID: "def_redundancy", Text: "Are backup systems and redundancy measures in place and tested?", Type: PollQuestionYesNo, Required: true},
				{ID: "def_personnel", Text: "Is the defence manning level sufficient for current threat level?", Type: PollQuestionYesNo, Required: true},
				{ID: "def_comments", Text: "Key observations or concerns regarding defence capabilities?", Type: PollQuestionFreeText, Required: false},
			},
		},
	}
}

// ── Checklists ──────────────────────────────────────────────────────────────

// ChecklistTemplate is a reusable checklist definition (the "recipe").
type ChecklistTemplate struct {
	ID          int64              `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description,omitempty"`
	Category    string             `json:"category,omitempty"` // template category: Generic, Exercise, Incident, Operations, Tidslinjal
	Items       []ChecklistItemDef `json:"items"`
	BuiltIn     bool               `json:"built_in"`
	CreatedBy   int64              `json:"created_by,omitempty"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
}

// ChecklistItemDef is a single item in a checklist template.
type ChecklistItemDef struct {
	Text     string `json:"text"`
	Category string `json:"category,omitempty"` // optional grouping
}

// ChecklistInstance is a running/completed checklist created from a template.
type ChecklistInstance struct {
	ID              int64                  `json:"id"`
	TemplateID      int64                  `json:"template_id"`
	Name            string                 `json:"name"`
	Items           []ChecklistInstanceItem `json:"items"`
	Status          string                 `json:"status"` // active | completed
	CreatedBy       int64                  `json:"created_by"`
	CreatedByName   string                 `json:"created_by_name,omitempty"`
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
	CompletedAt     *time.Time             `json:"completed_at,omitempty"`
	CompletedBy     int64                  `json:"completed_by,omitempty"`
	CompletedByName string                 `json:"completed_by_name,omitempty"`
	GroupID         int64                  `json:"group_id,omitempty"`
}

// ChecklistInstanceItem tracks the check-state of a single item.
type ChecklistInstanceItem struct {
	Text      string     `json:"text"`
	Category  string     `json:"category,omitempty"`
	Checked   bool       `json:"checked"`
	CheckedBy int64      `json:"checked_by,omitempty"`
	CheckedAt *time.Time `json:"checked_at,omitempty"`
	Note      string     `json:"note,omitempty"`
	Skipped   bool       `json:"skipped,omitempty"`
	SkippedBy int64      `json:"skipped_by,omitempty"`
	SkippedAt *time.Time `json:"skipped_at,omitempty"`
}

// BuiltInChecklists returns the pre-defined checklist templates.
func BuiltInChecklists() []ChecklistTemplate {
	now := time.Now()
	return []ChecklistTemplate{
		// ── Operations ──────────────────────────────────────────────────
		{
			ID: -1, Name: "TeamLead Battle Rhythm Prep", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Preparation checklist before answering the TeamLead Battle Rhythm Check poll.",
			Items: []ChecklistItemDef{
				{Text: "Review current task status and progress", Category: "Situational Awareness"},
				{Text: "Check team member availability and well-being", Category: "Situational Awareness"},
				{Text: "Review outstanding issues or blockers", Category: "Situational Awareness"},
				{Text: "Assess personal stress level honestly", Category: "Self-Assessment"},
				{Text: "Assess team morale and stress indicators", Category: "Self-Assessment"},
				{Text: "Verify you have current information from all sub-teams", Category: "Information"},
				{Text: "Check if any pending decisions need escalation", Category: "Information"},
				{Text: "Review resource needs and shortfalls", Category: "Resources"},
				{Text: "Identify any support needed from Ops Lead or other team leads", Category: "Resources"},
				{Text: "Prepare summary of key concerns to report", Category: "Reporting"},
			},
		},
		{
			ID: -2, Name: "Shift Handover", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Standard checklist for shift handover procedures.",
			Items: []ChecklistItemDef{
				{Text: "Brief incoming shift on current operational situation", Category: "Briefing"},
				{Text: "Hand over all active tasks with current status", Category: "Briefing"},
				{Text: "Review open decisions and pending actions", Category: "Briefing"},
				{Text: "Transfer access credentials and communication channels", Category: "Logistics"},
				{Text: "Highlight any time-critical events in the next period", Category: "Logistics"},
				{Text: "Review and update the timeline with latest information", Category: "Documentation"},
				{Text: "Log handover in the log book", Category: "Documentation"},
				{Text: "Confirm incoming shift has access to all needed systems", Category: "Verification"},
				{Text: "Incoming shift acknowledges understanding of situation", Category: "Verification"},
			},
		},
		{
			ID: -5, Name: "Team Status Assessment", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Team-oriented checklist for assessing overall team status and readiness.",
			Items: []ChecklistItemDef{
				{Text: "Verify all team members have checked in", Category: "Personnel"},
				{Text: "Confirm team member roles and responsibilities are clear", Category: "Personnel"},
				{Text: "Check team fatigue levels and schedule rest rotations", Category: "Personnel"},
				{Text: "Review team communication channels are working", Category: "Communications"},
				{Text: "Verify all team members have access to shared resources", Category: "Communications"},
				{Text: "Confirm team understands current priorities", Category: "Situational Awareness"},
				{Text: "Review team workload distribution and balance", Category: "Situational Awareness"},
				{Text: "Identify any skill gaps for current tasks", Category: "Capability"},
				{Text: "Check equipment and tools availability for team", Category: "Capability"},
				{Text: "Confirm backup personnel are identified", Category: "Capability"},
			},
		},
		{
			ID: -6, Name: "Team Briefing Checklist", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Team-oriented checklist for conducting effective team briefings.",
			Items: []ChecklistItemDef{
				{Text: "Gather all team members or confirm remote attendance", Category: "Preparation"},
				{Text: "Prepare situation overview with latest updates", Category: "Preparation"},
				{Text: "Share current operational picture with the team", Category: "Briefing"},
				{Text: "Review assigned tasks and their current status", Category: "Briefing"},
				{Text: "Communicate priorities and any changes", Category: "Briefing"},
				{Text: "Address questions and concerns from team members", Category: "Interaction"},
				{Text: "Collect status updates from each team member", Category: "Interaction"},
				{Text: "Assign new tasks and confirm understanding", Category: "Tasking"},
				{Text: "Set next check-in time and communication plan", Category: "Tasking"},
				{Text: "Document key decisions and action items", Category: "Documentation"},
			},
		},
		{
			ID: -7, Name: "Team Coordination Check", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Team-oriented checklist for inter-team and intra-team coordination.",
			Items: []ChecklistItemDef{
				{Text: "Review dependencies with other teams", Category: "Inter-team"},
				{Text: "Confirm shared information is up to date", Category: "Inter-team"},
				{Text: "Check for conflicting activities between teams", Category: "Inter-team"},
				{Text: "Verify team internal task assignments are clear", Category: "Intra-team"},
				{Text: "Confirm all sub-tasks have owners", Category: "Intra-team"},
				{Text: "Check progress against team milestones", Category: "Progress"},
				{Text: "Identify and address bottlenecks", Category: "Progress"},
				{Text: "Update team status board/timeline", Category: "Reporting"},
				{Text: "Report team status to team lead", Category: "Reporting"},
			},
		},
		{
			ID: -8, Name: "Daily Operations Standup", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Daily standup meeting checklist for operational teams.",
			Items: []ChecklistItemDef{
				{Text: "Review overnight events and alerts", Category: "Review"},
				{Text: "Check status of all ongoing tasks", Category: "Review"},
				{Text: "Identify tasks completed since last standup", Category: "Review"},
				{Text: "List blockers and issues needing resolution", Category: "Issues"},
				{Text: "Confirm priorities for the day", Category: "Planning"},
				{Text: "Assign new tasks from backlog", Category: "Planning"},
				{Text: "Review upcoming deadlines for next 24-48 hours", Category: "Planning"},
				{Text: "Update timeline with current status", Category: "Documentation"},
			},
		},
		{
			ID: -9, Name: "Communication Check", Category: "Operations", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Verify all communication channels and systems are operational.",
			Items: []ChecklistItemDef{
				{Text: "Test primary communication channel", Category: "Primary"},
				{Text: "Test backup communication channel", Category: "Backup"},
				{Text: "Verify contact lists are up to date", Category: "Contacts"},
				{Text: "Confirm all team members know escalation procedures", Category: "Procedures"},
				{Text: "Test notification system (email/SMS)", Category: "Notifications"},
				{Text: "Verify shared document access for all participants", Category: "Access"},
				{Text: "Check radio/phone battery and signal levels", Category: "Equipment"},
			},
		},

		// ── Exercise ────────────────────────────────────────────────────
		{
			ID: -3, Name: "Exercise Setup", Category: "Exercise", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for setting up a new exercise or operation in Tidslinjal.",
			Items: []ChecklistItemDef{
				{Text: "Configure exercise name, dates, and time settings", Category: "Configuration"},
				{Text: "Set up layers and event types", Category: "Configuration"},
				{Text: "Create user accounts and assign roles", Category: "Users"},
				{Text: "Create groups and assign memberships", Category: "Users"},
				{Text: "Configure notification and mail settings", Category: "Communications"},
				{Text: "Upload reference documents", Category: "Content"},
				{Text: "Set up initial timeline events", Category: "Content"},
				{Text: "Configure phases if applicable", Category: "Content"},
				{Text: "Test poll and ready check functionality", Category: "Testing"},
				{Text: "Verify all participants can log in", Category: "Testing"},
				{Text: "Create backup before exercise start", Category: "Safety"},
			},
		},
		{
			ID: -4, Name: "After Action Review Prep", Category: "Exercise", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Preparation checklist for conducting an After Action Review.",
			Items: []ChecklistItemDef{
				{Text: "Export timeline data and reports", Category: "Data Collection"},
				{Text: "Export poll results and decision log", Category: "Data Collection"},
				{Text: "Download audit log for the exercise period", Category: "Data Collection"},
				{Text: "Collect participant feedback forms", Category: "Data Collection"},
				{Text: "Identify key events and decision points", Category: "Analysis"},
				{Text: "Note timeline deviations from plan", Category: "Analysis"},
				{Text: "Prepare lessons-learned template", Category: "Preparation"},
				{Text: "Schedule AAR meeting with all key personnel", Category: "Preparation"},
				{Text: "Distribute materials to participants before meeting", Category: "Preparation"},
			},
		},
		{
			ID: -10, Name: "Exercise STARTEX", Category: "Exercise", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for the start of an exercise (STARTEX).",
			Items: []ChecklistItemDef{
				{Text: "Confirm all participants are present and logged in", Category: "Personnel"},
				{Text: "Verify exercise inject schedule is loaded", Category: "Scenario"},
				{Text: "Confirm scenario briefing has been delivered", Category: "Scenario"},
				{Text: "Start exercise clock / set epoch time", Category: "Timing"},
				{Text: "Activate synthetic time if applicable", Category: "Timing"},
				{Text: "Verify all communication channels are active", Category: "Communications"},
				{Text: "Confirm EXCON team is ready", Category: "Control"},
				{Text: "Send STARTEX signal to all participants", Category: "Control"},
				{Text: "Begin audit logging", Category: "Documentation"},
				{Text: "Activate first phase on timeline", Category: "Timeline"},
			},
		},
		{
			ID: -11, Name: "Exercise ENDEX", Category: "Exercise", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for ending an exercise (ENDEX).",
			Items: []ChecklistItemDef{
				{Text: "Send ENDEX signal to all participants", Category: "Notification"},
				{Text: "Stop exercise clock", Category: "Timing"},
				{Text: "Collect final status reports from all teams", Category: "Reports"},
				{Text: "Export all timeline data", Category: "Data"},
				{Text: "Export audit log", Category: "Data"},
				{Text: "Export poll results and decisions", Category: "Data"},
				{Text: "Create full backup of exercise data", Category: "Backup"},
				{Text: "Distribute initial feedback forms", Category: "Feedback"},
				{Text: "Schedule AAR / hot wash session", Category: "Follow-up"},
				{Text: "Thank all participants", Category: "Follow-up"},
			},
		},
		{
			ID: -12, Name: "Exercise Observer Checklist", Category: "Exercise", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for exercise observers and evaluators.",
			Items: []ChecklistItemDef{
				{Text: "Review exercise objectives and evaluation criteria", Category: "Preparation"},
				{Text: "Obtain observer credentials and access", Category: "Preparation"},
				{Text: "Note timeline of key events observed", Category: "Observation"},
				{Text: "Document decision-making processes observed", Category: "Observation"},
				{Text: "Record communication effectiveness", Category: "Observation"},
				{Text: "Note deviations from SOPs", Category: "Observation"},
				{Text: "Identify best practices demonstrated", Category: "Analysis"},
				{Text: "Identify areas for improvement", Category: "Analysis"},
				{Text: "Prepare observer debrief notes", Category: "Reporting"},
			},
		},
		{
			ID: -13, Name: "Inject Preparation", Category: "Exercise", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Prepare and verify exercise injects before delivery.",
			Items: []ChecklistItemDef{
				{Text: "Review inject content for accuracy", Category: "Content"},
				{Text: "Verify inject timing matches exercise plan", Category: "Timing"},
				{Text: "Confirm inject delivery channel is ready", Category: "Delivery"},
				{Text: "Check inject dependencies are met", Category: "Dependencies"},
				{Text: "Prepare contingency injects if needed", Category: "Contingency"},
				{Text: "Brief inject team on delivery procedure", Category: "Coordination"},
				{Text: "Set up inject tracking in Tidslinjal", Category: "Tracking"},
			},
		},

		// ── Incident ────────────────────────────────────────────────────
		{
			ID: -14, Name: "Incident Initial Response", Category: "Incident", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Initial response checklist when an incident is reported.",
			Items: []ChecklistItemDef{
				{Text: "Acknowledge incident report", Category: "Acknowledgement"},
				{Text: "Assess severity and impact", Category: "Assessment"},
				{Text: "Determine if escalation is needed", Category: "Assessment"},
				{Text: "Activate incident response team", Category: "Activation"},
				{Text: "Establish incident communication channel", Category: "Communications"},
				{Text: "Notify stakeholders of incident", Category: "Notifications"},
				{Text: "Begin incident timeline logging", Category: "Documentation"},
				{Text: "Assign incident commander / lead", Category: "Organization"},
				{Text: "Set initial objectives and priorities", Category: "Planning"},
				{Text: "Schedule first status update", Category: "Planning"},
			},
		},
		{
			ID: -15, Name: "Incident Handover", Category: "Incident", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Handover during an ongoing incident to new responders.",
			Items: []ChecklistItemDef{
				{Text: "Brief incoming team on current situation", Category: "Briefing"},
				{Text: "Summarize actions taken so far", Category: "Briefing"},
				{Text: "Highlight outstanding issues and risks", Category: "Briefing"},
				{Text: "Transfer incident lead responsibility", Category: "Handover"},
				{Text: "Confirm access to all incident systems", Category: "Handover"},
				{Text: "Share contact list and escalation paths", Category: "Handover"},
				{Text: "Document handover in incident log", Category: "Documentation"},
				{Text: "Confirm incoming team understands objectives", Category: "Verification"},
			},
		},
		{
			ID: -16, Name: "Incident Closure", Category: "Incident", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for properly closing an incident.",
			Items: []ChecklistItemDef{
				{Text: "Confirm root cause identified", Category: "Analysis"},
				{Text: "Verify all corrective actions completed", Category: "Resolution"},
				{Text: "Confirm normal operations restored", Category: "Resolution"},
				{Text: "Notify all stakeholders of resolution", Category: "Notification"},
				{Text: "Export incident timeline and logs", Category: "Documentation"},
				{Text: "Complete incident report", Category: "Documentation"},
				{Text: "Schedule post-incident review", Category: "Follow-up"},
				{Text: "Update SOPs if needed", Category: "Follow-up"},
				{Text: "Archive incident data", Category: "Closure"},
			},
		},
		{
			ID: -17, Name: "Crisis Communication", Category: "Incident", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for managing crisis communications.",
			Items: []ChecklistItemDef{
				{Text: "Identify spokesperson and backup", Category: "Organization"},
				{Text: "Draft initial public statement", Category: "Messaging"},
				{Text: "Get legal/leadership approval on messaging", Category: "Approval"},
				{Text: "Notify internal stakeholders first", Category: "Internal"},
				{Text: "Notify external stakeholders", Category: "External"},
				{Text: "Set up media monitoring", Category: "Monitoring"},
				{Text: "Prepare Q&A document", Category: "Preparation"},
				{Text: "Schedule regular communication updates", Category: "Scheduling"},
				{Text: "Document all communications sent", Category: "Documentation"},
			},
		},

		// ── Generic ─────────────────────────────────────────────────────
		{
			ID: -18, Name: "Meeting Preparation", Category: "Generic", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "General checklist for preparing and running effective meetings.",
			Items: []ChecklistItemDef{
				{Text: "Define meeting objective and desired outcome", Category: "Preparation"},
				{Text: "Prepare agenda and distribute to participants", Category: "Preparation"},
				{Text: "Confirm meeting room/link is set up", Category: "Logistics"},
				{Text: "Ensure all required materials are ready", Category: "Logistics"},
				{Text: "Take attendance", Category: "During Meeting"},
				{Text: "Follow agenda and manage time", Category: "During Meeting"},
				{Text: "Capture decisions and action items", Category: "During Meeting"},
				{Text: "Distribute meeting minutes", Category: "Follow-up"},
				{Text: "Update task assignments in system", Category: "Follow-up"},
			},
		},
		{
			ID: -19, Name: "Project Kickoff", Category: "Generic", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for starting a new project or initiative.",
			Items: []ChecklistItemDef{
				{Text: "Define project scope and objectives", Category: "Planning"},
				{Text: "Identify key stakeholders", Category: "Planning"},
				{Text: "Assign project roles and responsibilities", Category: "Organization"},
				{Text: "Set up communication channels", Category: "Organization"},
				{Text: "Create project timeline with milestones", Category: "Timeline"},
				{Text: "Identify risks and mitigation strategies", Category: "Risk"},
				{Text: "Secure required resources and budget", Category: "Resources"},
				{Text: "Schedule regular status meetings", Category: "Scheduling"},
				{Text: "Document project charter/plan", Category: "Documentation"},
			},
		},
		{
			ID: -20, Name: "Decision Log Entry", Category: "Generic", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for documenting important decisions properly.",
			Items: []ChecklistItemDef{
				{Text: "State the decision clearly", Category: "Decision"},
				{Text: "Document the rationale and alternatives considered", Category: "Decision"},
				{Text: "Record who made the decision and when", Category: "Attribution"},
				{Text: "Identify who is affected by the decision", Category: "Impact"},
				{Text: "Define follow-up actions resulting from decision", Category: "Actions"},
				{Text: "Communicate decision to relevant parties", Category: "Communication"},
				{Text: "Set review date if decision is temporary", Category: "Follow-up"},
			},
		},
		{
			ID: -21, Name: "Weekly Review", Category: "Generic", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Weekly review checklist for teams and leaders.",
			Items: []ChecklistItemDef{
				{Text: "Review completed tasks from the past week", Category: "Review"},
				{Text: "Update status of ongoing tasks", Category: "Review"},
				{Text: "Identify tasks that are behind schedule", Category: "Review"},
				{Text: "Review upcoming deadlines for next week", Category: "Planning"},
				{Text: "Prioritize tasks for the coming week", Category: "Planning"},
				{Text: "Address any unresolved blockers", Category: "Issues"},
				{Text: "Recognize team achievements", Category: "Team"},
				{Text: "Update reports and dashboards", Category: "Reporting"},
			},
		},
		{
			ID: -22, Name: "Onboarding New Member", Category: "Generic", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for onboarding a new team member.",
			Items: []ChecklistItemDef{
				{Text: "Create user account with appropriate role", Category: "Access"},
				{Text: "Assign to relevant groups", Category: "Access"},
				{Text: "Share login credentials and system access guide", Category: "Access"},
				{Text: "Brief on current operational situation", Category: "Orientation"},
				{Text: "Introduce to team members and key contacts", Category: "Orientation"},
				{Text: "Share relevant reference documents", Category: "Documentation"},
				{Text: "Explain communication protocols and tools", Category: "Training"},
				{Text: "Walk through Tidslinjal interface and features", Category: "Training"},
				{Text: "Assign initial tasks", Category: "Tasks"},
				{Text: "Schedule follow-up check-in after first day", Category: "Follow-up"},
			},
		},

		// ── Tidslinjal ──────────────────────────────────────────────────
		{
			ID: -23, Name: "Tidslinjal Initial Setup", Category: "Tidslinjal", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "First-time setup checklist for a new Tidslinjal instance.",
			Items: []ChecklistItemDef{
				{Text: "Set admin password and secure the instance", Category: "Security"},
				{Text: "Configure SMTP for email notifications", Category: "Configuration"},
				{Text: "Set default language and timezone", Category: "Configuration"},
				{Text: "Configure SSO if applicable", Category: "Authentication"},
				{Text: "Create user accounts", Category: "Users"},
				{Text: "Set up groups and team structure", Category: "Users"},
				{Text: "Configure event types and layers", Category: "Content"},
				{Text: "Upload organization logo and customize theme", Category: "Branding"},
				{Text: "Create initial reference documents", Category: "Content"},
				{Text: "Test backup and restore procedure", Category: "Safety"},
				{Text: "Verify all features are working correctly", Category: "Testing"},
			},
		},
		{
			ID: -24, Name: "Tidslinjal Pre-Event Check", Category: "Tidslinjal", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Verify Tidslinjal is ready before a major event or exercise.",
			Items: []ChecklistItemDef{
				{Text: "Verify server is running and accessible", Category: "System"},
				{Text: "Check disk space and system resources", Category: "System"},
				{Text: "Create a fresh backup", Category: "Backup"},
				{Text: "Verify all user accounts are active", Category: "Users"},
				{Text: "Test notification delivery", Category: "Communications"},
				{Text: "Verify timeline loads correctly", Category: "Functionality"},
				{Text: "Test creating, editing, and deleting events", Category: "Functionality"},
				{Text: "Verify polls and ready checks work", Category: "Functionality"},
				{Text: "Check that reports can be generated", Category: "Functionality"},
				{Text: "Ensure reference documents are uploaded", Category: "Content"},
			},
		},
		{
			ID: -25, Name: "Tidslinjal Data Export", Category: "Tidslinjal", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for comprehensive data export from Tidslinjal.",
			Items: []ChecklistItemDef{
				{Text: "Export timeline events (JSON/CSV)", Category: "Events"},
				{Text: "Export audit log", Category: "Logs"},
				{Text: "Export poll results", Category: "Polls"},
				{Text: "Export decision log", Category: "Decisions"},
				{Text: "Download reference documents", Category: "Documents"},
				{Text: "Export user activity report", Category: "Reports"},
				{Text: "Generate status reports for all periods", Category: "Reports"},
				{Text: "Create full backup archive", Category: "Backup"},
				{Text: "Verify export data integrity", Category: "Verification"},
			},
		},
		{
			ID: -26, Name: "Tidslinjal Upgrade", Category: "Tidslinjal", BuiltIn: true, CreatedAt: now, UpdatedAt: now,
			Description: "Checklist for upgrading Tidslinjal to a new version.",
			Items: []ChecklistItemDef{
				{Text: "Read release notes for the new version", Category: "Preparation"},
				{Text: "Create full backup of current data", Category: "Backup"},
				{Text: "Note current version number", Category: "Preparation"},
				{Text: "Stop the Tidslinjal service", Category: "Upgrade"},
				{Text: "Replace binary with new version", Category: "Upgrade"},
				{Text: "Start the service and verify it starts correctly", Category: "Upgrade"},
				{Text: "Verify data migration completed successfully", Category: "Verification"},
				{Text: "Test core functionality (login, timeline, events)", Category: "Testing"},
				{Text: "Verify all users can log in", Category: "Testing"},
				{Text: "Confirm new features are working", Category: "Testing"},
			},
		},
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

// Tag is a user-created label for organizing polls, ready checks, etc.
type Tag struct {
	ID         int64     `json:"id"`
	Name       string    `json:"name"`
	Color      string    `json:"color,omitempty"`
	CreatedBy  int64     `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
	UsageCount int       `json:"usage_count"`
}

// JiraStats holds aggregated issue statistics from Jira.
type JiraStats struct {
	TotalIssues  int            `json:"total_issues"`
	ByStatus     map[string]int `json:"by_status"`
	ByPriority   map[string]int `json:"by_priority"`
	LastSyncTime time.Time      `json:"last_sync_time"`
}
