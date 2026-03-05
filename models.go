package main

import "time"

// Role defines user access levels
type Role string

const (
	RoleRead      Role = "read"
	RoleReadWrite Role = "readwrite"
	RoleAdmin     Role = "admin"
)

// EventType categories
type EventType string

const (
	EventTypeEvent     EventType = "event"
	EventTypeDecision  EventType = "decision"
	EventTypeDeadline  EventType = "deadline"
	EventTypeActivity  EventType = "activity"
	EventTypeRepeated  EventType = "repeated"
	EventTypeReporting EventType = "reporting"
)

// DefaultEventColors maps event types to their default display colors
var DefaultEventColors = map[EventType]string{
	EventTypeEvent:     "#4A90D9", // blue
	EventTypeDecision:  "#E67E22", // orange
	EventTypeDeadline:  "#E74C3C", // red
	EventTypeActivity:  "#2ECC71", // green
	EventTypeRepeated:  "#9B59B6", // purple
	EventTypeReporting: "#1ABC9C", // teal
}

// User represents a system user
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"password_hash,omitempty"`
	DisplayName  string    `json:"display_name"`
	Role         Role      `json:"role"`
	CanLock      bool      `json:"can_lock"` // designated to lock time slots
	CreatedAt    time.Time `json:"created_at"`
}

// UserPublic is the user object returned to clients (no password hash)
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

// Event represents a timeline event/activity
type Event struct {
	ID                int64      `json:"id"`
	Title             string     `json:"title"`
	Description       string     `json:"description"`
	EventType         EventType  `json:"event_type"`
	Color             string     `json:"color"`
	StartTime         time.Time  `json:"start_time"`
	EndTime           *time.Time `json:"end_time,omitempty"`
	IsRecurring       bool       `json:"is_recurring"`
	RecurrencePattern string     `json:"recurrence_pattern,omitempty"` // daily, weekly, monthly
	RecurrenceEnd     *time.Time `json:"recurrence_end,omitempty"`
	CreatedBy         int64      `json:"created_by"`
	CreatedByName     string     `json:"created_by_name"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// Alarm is a personal user reminder tied to an event
type Alarm struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	EventID    int64     `json:"event_id"`
	EventTitle string    `json:"event_title"`
	EventTime  time.Time `json:"event_time"`
	LeadTime   int       `json:"lead_time"` // minutes before event
	IsActive   bool      `json:"is_active"`
	Fired      bool      `json:"fired"`
	CreatedAt  time.Time `json:"created_at"`
}

// LockedSlot represents a time slot locked by admin/designated user
type LockedSlot struct {
	ID           int64     `json:"id"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Reason       string    `json:"reason"`
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
