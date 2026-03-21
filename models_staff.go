package main

import "time"

// StaffDuty represents a duty assignment (who is on duty for what)
type StaffDuty struct {
	ID             int64     `json:"id"`
	Role           string    `json:"role"`            // e.g. "chief_of_staff", "tools_responsible", etc.
	UserID         int64     `json:"user_id"`
	UserName       string    `json:"user_name"`
	StartTime      string    `json:"start_time,omitempty"` // ISO datetime, optional
	EndTime        string    `json:"end_time,omitempty"`   // ISO datetime, optional
	Note           string    `json:"note,omitempty"`
	SetByID        int64     `json:"set_by_id"`
	SetByName      string    `json:"set_by_name"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// StaffMember represents a person assigned to a staff position
type StaffMember struct {
	ID          int64     `json:"id"`
	Position    string    `json:"position"`     // e.g. "chief_of_staff", "planning", "documentation", etc.
	UserID      int64     `json:"user_id"`
	UserName    string    `json:"user_name"`
	Note        string    `json:"note,omitempty"`
	SetByID     int64     `json:"set_by_id"`
	SetByName   string    `json:"set_by_name"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AreaOfResponsibility represents a defined area of responsibility
type AreaOfResponsibility struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	AssignedTo  int64     `json:"assigned_to,omitempty"` // user ID
	AssignedName string   `json:"assigned_name,omitempty"`
	CreatedByID int64     `json:"created_by_id"`
	CreatedByName string  `json:"created_by_name"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
