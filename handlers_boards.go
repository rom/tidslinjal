package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Board access check ──────────────────────────────────────────────────────

func (app *App) canAccessBoard(board *Board, user *User) bool {
	if user.Role == RoleAdmin {
		return true
	}
	switch board.Visibility {
	case "private":
		return board.OwnerID == user.ID
	case "group":
		for _, gid := range app.userGroups(user.ID) {
			if gid == board.GroupID {
				return true
			}
		}
		return board.OwnerID == user.ID
	case "role":
		return string(user.Role) == board.RoleKey || hasRole(user.Role, RoleAdmin) || board.OwnerID == user.ID
	case "global":
		return true
	}
	return board.OwnerID == user.ID
}

func (app *App) canEditBoard(board *Board, user *User) bool {
	if user.Role == RoleAdmin || board.OwnerID == user.ID {
		return true
	}
	if board.Visibility == "global" && hasRole(user.Role, RoleTeamLead) {
		return true
	}
	if board.Visibility == "group" {
		for _, gid := range app.userGroups(user.ID) {
			if gid == board.GroupID {
				return true
			}
		}
	}
	if board.Visibility == "role" && string(user.Role) == board.RoleKey {
		return true
	}
	return false
}

// ── Board CRUD ──────────────────────────────────────────────────────────────

func (app *App) handleGetBoards(w http.ResponseWriter, r *http.Request, user *User) {
	boards := app.store.GetBoards()
	type boardWithCount struct {
		Board
		ItemCount int `json:"item_count"`
	}
	var visible []boardWithCount
	for _, b := range boards {
		if app.canAccessBoard(&b, user) {
			items := app.store.GetBoardItems(b.ID)
			visible = append(visible, boardWithCount{Board: b, ItemCount: len(items)})
		}
	}
	if visible == nil {
		visible = []boardWithCount{}
	}
	jsonOK(w, visible)
}

func (app *App) handleGetBoardTemplates(w http.ResponseWriter, r *http.Request, user *User) {
	templates := BuiltInBoardTemplates()
	exampleItems := BuiltInBoardTemplateItems()
	type templateWithItems struct {
		Board
		ExampleItems []BoardItem `json:"example_items,omitempty"`
	}
	out := make([]templateWithItems, len(templates))
	for i, t := range templates {
		out[i] = templateWithItems{Board: t, ExampleItems: exampleItems[t.ID]}
	}
	jsonOK(w, out)
}

func (app *App) handleCreateBoard(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Name        string     `json:"name"`
		Description string     `json:"description"`
		Visibility  string     `json:"visibility"`
		GroupID     int64      `json:"group_id"`
		RoleKey     string     `json:"role_key"`
		Columns     []BoardCol `json:"columns"`
		TemplateID  int64      `json:"template_id"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name is required", http.StatusBadRequest)
		return
	}
	vis := req.Visibility
	if vis == "" {
		vis = "private"
	}
	if vis != "private" && vis != "group" && vis != "role" && vis != "global" {
		jsonError(w, "invalid visibility", http.StatusBadRequest)
		return
	}

	cols := req.Columns
	var templateID int64
	// If creating from template, use template columns
	if req.TemplateID != 0 {
		templateID = req.TemplateID
		for _, t := range BuiltInBoardTemplates() {
			if t.ID == req.TemplateID {
				cols = t.Columns
				if req.Name == "" {
					req.Name = t.Name
				}
				if req.Description == "" {
					req.Description = t.Description
				}
				break
			}
		}
	}
	if len(cols) == 0 {
		cols = DefaultBoardColumns()
	}

	board := Board{
		Name:        req.Name,
		Description: req.Description,
		OwnerID:     user.ID,
		OwnerName:   user.DisplayName,
		Visibility:  vis,
		GroupID:     req.GroupID,
		RoleKey:     req.RoleKey,
		Columns:     cols,
	}
	created, err := app.store.CreateBoard(board)
	if err != nil {
		jsonError(w, "failed to create board", http.StatusInternalServerError)
		return
	}

	// Add example items from template
	if templateID != 0 {
		exampleItems := BuiltInBoardTemplateItems()
		if items, ok := exampleItems[templateID]; ok {
			for _, item := range items {
				item.BoardID = created.ID
				item.CreatorID = user.ID
				item.CreatorName = user.DisplayName
				item.History = []BoardHistory{
					{Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName, Action: "created", Detail: "Added from template"},
				}
				_, _ = app.store.CreateBoardItem(item)
			}
		}
	}

	app.audit(user.ID, user.Username, "create", "board", created.ID, fmt.Sprintf("Created board %q", created.Name))
	app.broadcastBoardChange("board_created", created.ID)
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleGetBoard(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(id)
	if board == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if !app.canAccessBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	jsonOK(w, board)
}

func (app *App) handleUpdateBoard(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(id)
	if board == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Name               *string     `json:"name"`
		Description        *string     `json:"description"`
		Visibility         *string     `json:"visibility"`
		GroupID            *int64      `json:"group_id"`
		RoleKey            *string     `json:"role_key"`
		Columns            *[]BoardCol `json:"columns"`
		Color              *string     `json:"color"`
		ShowIcons          *bool       `json:"show_icons"`
		PriorityBackground *bool       `json:"priority_background"`
		ShowArchival       *bool       `json:"show_archival"`
		SortMode           *string     `json:"sort_mode"`
		HighlightMe        *bool       `json:"highlight_me"`
		HighlightStyle     *string     `json:"highlight_style"`
		MyBoardsOnTop      *bool       `json:"my_boards_on_top"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Name != nil {
		board.Name = *req.Name
	}
	if req.Description != nil {
		board.Description = *req.Description
	}
	if req.Visibility != nil {
		board.Visibility = *req.Visibility
	}
	if req.GroupID != nil {
		board.GroupID = *req.GroupID
	}
	if req.RoleKey != nil {
		board.RoleKey = *req.RoleKey
	}
	if req.Columns != nil {
		board.Columns = *req.Columns
	}
	if req.Color != nil {
		board.Color = *req.Color
	}
	if req.ShowIcons != nil {
		board.ShowIcons = req.ShowIcons
	}
	if req.PriorityBackground != nil {
		board.PriorityBackground = req.PriorityBackground
	}
	if req.ShowArchival != nil {
		board.ShowArchival = req.ShowArchival
	}
	if req.SortMode != nil {
		board.SortMode = *req.SortMode
	}
	if req.HighlightMe != nil {
		board.HighlightMe = req.HighlightMe
	}
	if req.HighlightStyle != nil {
		board.HighlightStyle = *req.HighlightStyle
	}
	if req.MyBoardsOnTop != nil {
		board.MyBoardsOnTop = req.MyBoardsOnTop
	}
	if err := app.store.UpdateBoard(*board); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "update", "board", board.ID, fmt.Sprintf("Updated board %q", board.Name))
	app.broadcastBoardChange("board_updated", board.ID)
	jsonOK(w, board)
}

func (app *App) handleDeleteBoard(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(id)
	if board == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if board.OwnerID != user.ID && user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteBoard(id); err != nil {
		jsonError(w, "delete failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "delete", "board", id, fmt.Sprintf("Deleted board %q", board.Name))
	app.broadcastBoardChange("board_deleted", id)
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Board Items CRUD ────────────────────────────────────────────────────────

func (app *App) handleGetBoardItems(w http.ResponseWriter, r *http.Request, user *User) {
	boardID, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid board id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(boardID)
	if board == nil {
		jsonError(w, "board not found", http.StatusNotFound)
		return
	}
	if !app.canAccessBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	items := app.store.GetBoardItems(boardID)
	if items == nil {
		items = []BoardItem{}
	}
	jsonOK(w, items)
}

func (app *App) handleCreateBoardItem(w http.ResponseWriter, r *http.Request, user *User) {
	boardID, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid board id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(boardID)
	if board == nil {
		jsonError(w, "board not found", http.StatusNotFound)
		return
	}
	if !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		ColumnID        string   `json:"column_id"`
		Subject         string   `json:"subject"`
		Note            string   `json:"note"`
		ItemType        string   `json:"item_type"`
		Color           string   `json:"color"`
		Tags            []string `json:"tags"`
		ChecklistID     int64    `json:"checklist_id"`
		EventID         int64    `json:"event_id"`
		SortOrder       int      `json:"sort_order"`
		ResponsibleID   int64    `json:"responsible_id"`
		ResponsibleName string   `json:"responsible_name"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	colID := req.ColumnID
	if colID == "" && len(board.Columns) > 0 {
		colID = board.Columns[0].ID
	}

	// Default responsible to creator if not specified
	respID := req.ResponsibleID
	respName := req.ResponsibleName
	if respID == 0 {
		respID = user.ID
		respName = user.DisplayName
	}
	// Default item type to task if not specified
	itemType := req.ItemType
	if itemType == "" {
		itemType = "task"
	}

	item := BoardItem{
		BoardID:         boardID,
		ColumnID:        colID,
		SortOrder:       req.SortOrder,
		Subject:         req.Subject,
		Note:            req.Note,
		ItemType:        itemType,
		Color:           req.Color,
		Tags:            req.Tags,
		CreatorID:       user.ID,
		CreatorName:     user.DisplayName,
		ResponsibleID:   respID,
		ResponsibleName: respName,
		ChecklistID:     req.ChecklistID,
		EventID:         req.EventID,
		History: []BoardHistory{
			{Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName, Action: "created", Detail: "Item created"},
		},
	}
	created, err := app.store.CreateBoardItem(item)
	if err != nil {
		jsonError(w, "failed to create item", http.StatusInternalServerError)
		return
	}

	// Notify @mentioned users (non-private boards only)
	if board.Visibility != "private" {
		app.notifyBoardMentions(req.Note, user, board, &created)
	}

	app.audit(user.ID, user.DisplayName, "created", "board_item", created.ID,
		fmt.Sprintf("Created item %q on board #%d", created.Subject, boardID))
	app.broadcastBoardChange("board_item_created", boardID)
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleUpdateBoardItem(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Subject         *string        `json:"subject"`
		Note            *string        `json:"note"`
		ItemType        *string        `json:"item_type"`
		Color           *string        `json:"color"`
		Tags            *[]string      `json:"tags"`
		Links           *[]BoardLink   `json:"links"`
		DueDate         *string        `json:"due_date"`
		ResponsibleID   *int64         `json:"responsible_id"`
		ResponsibleName *string        `json:"responsible_name"`
		Comments        *[]BoardComment  `json:"comments"`
		Priority        *string         `json:"priority"`
		Activities      *[]BoardActivity `json:"activities"`
		ChecklistID     *int64          `json:"checklist_id"`
		EventID         *int64          `json:"event_id"`
		RelatedItemIDs  *[]int64        `json:"related_item_ids"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	changes := []string{}
	if req.Subject != nil && *req.Subject != item.Subject {
		item.Subject = *req.Subject
		changes = append(changes, "subject")
	}
	if req.Note != nil && *req.Note != item.Note {
		oldNote := item.Note
		item.Note = *req.Note
		changes = append(changes, "note")
		// Check for new @mentions
		if board.Visibility != "private" {
			app.notifyBoardMentions(*req.Note, user, board, item)
			_ = oldNote
		}
	}
	if req.ItemType != nil {
		item.ItemType = *req.ItemType
	}
	if req.Color != nil {
		item.Color = *req.Color
		changes = append(changes, "color")
	}
	if req.Tags != nil {
		item.Tags = *req.Tags
	}
	if req.Links != nil {
		item.Links = *req.Links
		changes = append(changes, "links")
	}
	if req.DueDate != nil {
		item.DueDate = *req.DueDate
		changes = append(changes, "due_date")
	}
	if req.ResponsibleID != nil {
		item.ResponsibleID = *req.ResponsibleID
		if req.ResponsibleName != nil {
			item.ResponsibleName = *req.ResponsibleName
		} else if *req.ResponsibleID > 0 {
			if u, ok := app.store.GetUserByID(*req.ResponsibleID); ok {
				item.ResponsibleName = u.DisplayName
			}
		} else {
			item.ResponsibleName = ""
		}
		changes = append(changes, "responsible")
	}
	if req.Comments != nil {
		item.Comments = *req.Comments
		changes = append(changes, "comments")
	}
	if req.Activities != nil {
		item.Activities = *req.Activities
		changes = append(changes, "activities")
	}
	if req.Priority != nil {
		item.Priority = *req.Priority
		changes = append(changes, "priority")
		// Auto-set color based on priority
		switch *req.Priority {
		case "normal", "":
			item.Color = "" // default/no color
		case "low":
			item.Color = "#3498db" // blue
		case "high":
			item.Color = "#e67e22" // orange
		case "critical":
			item.Color = "#e74c3c" // red
		}
	}
	if req.ChecklistID != nil {
		item.ChecklistID = *req.ChecklistID
	}
	if req.EventID != nil {
		item.EventID = *req.EventID
	}
	if req.RelatedItemIDs != nil {
		item.RelatedItemIDs = *req.RelatedItemIDs
		changes = append(changes, "related_items")
	}
	if len(changes) > 0 {
		item.History = append(item.History, BoardHistory{
			Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
			Action: "edited", Detail: "Updated: " + strings.Join(changes, ", "),
		})
	}
	if err := app.store.UpdateBoardItem(*item); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	if len(changes) > 0 {
		app.audit(user.ID, user.DisplayName, "updated", "board_item", item.ID,
			fmt.Sprintf("Updated item %q: %s", item.Subject, strings.Join(changes, ", ")))
	}
	app.broadcastBoardChange("board_item_updated", item.BoardID)
	jsonOK(w, item)
}

func (app *App) handleDeleteBoardItem(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := app.store.DeleteBoardItem(id); err != nil {
		jsonError(w, "delete failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "board_item", id,
		fmt.Sprintf("Deleted item %q from board #%d", item.Subject, item.BoardID))
	app.broadcastBoardChange("board_item_deleted", item.BoardID)
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleMoveBoardItem(w http.ResponseWriter, r *http.Request, user *User) {
	// URL is /api/board-items/{id}/move — pathID returns "move", use segment 2 instead
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		ColumnID  string `json:"column_id"`
		SortOrder int    `json:"sort_order"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	oldCol := item.ColumnID
	if err := app.store.MoveBoardItem(id, req.ColumnID, req.SortOrder); err != nil {
		jsonError(w, "move failed", http.StatusInternalServerError)
		return
	}
	_ = app.store.AddBoardItemHistory(id, BoardHistory{
		Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
		Action: "moved", Detail: fmt.Sprintf("Moved from %s to %s", oldCol, req.ColumnID),
	})
	app.audit(user.ID, user.DisplayName, "moved", "board_item", id,
		fmt.Sprintf("Moved item %q from %s to %s", item.Subject, oldCol, req.ColumnID))
	app.broadcastBoardChange("board_item_moved", item.BoardID)
	jsonOK(w, map[string]string{"status": "ok"})
}

// handleMoveBoardItemToBoard moves an item (and optionally its related items) to a different board.
func (app *App) handleMoveBoardItemToBoard(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	srcBoard := app.store.GetBoardByID(item.BoardID)
	if srcBoard == nil || !app.canEditBoard(srcBoard, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		TargetBoardID  int64   `json:"target_board_id"`
		TargetColumnID string  `json:"target_column_id"`
		MoveRelated    bool    `json:"move_related"` // also move related items
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.TargetBoardID == 0 {
		jsonError(w, "target_board_id is required", http.StatusBadRequest)
		return
	}
	targetBoard := app.store.GetBoardByID(req.TargetBoardID)
	if targetBoard == nil {
		jsonError(w, "target board not found", http.StatusNotFound)
		return
	}
	if !app.canEditBoard(targetBoard, user) {
		jsonError(w, "no access to target board", http.StatusForbidden)
		return
	}
	// Default to first column of target board
	colID := req.TargetColumnID
	if colID == "" && len(targetBoard.Columns) > 0 {
		colID = targetBoard.Columns[0].ID
	}

	// Collect items to move
	itemsToMove := []int64{id}
	if req.MoveRelated && len(item.RelatedItemIDs) > 0 {
		for _, relID := range item.RelatedItemIDs {
			rel := app.store.GetBoardItemByID(relID)
			if rel != nil && rel.BoardID == item.BoardID {
				itemsToMove = append(itemsToMove, relID)
			}
		}
	}

	srcBoardID := item.BoardID
	movedItems := []map[string]any{}
	for _, mid := range itemsToMove {
		if err := app.store.MoveBoardItemToBoard(mid, req.TargetBoardID, colID); err != nil {
			continue
		}
		movedItem := app.store.GetBoardItemByID(mid)
		subj := ""
		if movedItem != nil {
			subj = movedItem.Subject
		}
		_ = app.store.AddBoardItemHistory(mid, BoardHistory{
			Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
			Action: "moved", Detail: fmt.Sprintf("Moved from board #%d to board #%d (%s)", srcBoardID, req.TargetBoardID, targetBoard.Name),
		})
		movedItems = append(movedItems, map[string]any{"id": mid, "subject": subj})
	}

	app.audit(user.ID, user.DisplayName, "moved_to_board", "board_item", id,
		fmt.Sprintf("Moved %d item(s) from board %q to board %q", len(movedItems), srcBoard.Name, targetBoard.Name))
	app.broadcastBoardChange("board_item_moved", srcBoardID)
	app.broadcastBoardChange("board_item_moved", req.TargetBoardID)
	jsonOK(w, map[string]any{"status": "ok", "moved": movedItems})
}

// ── Board Item Attachments ──────────────────────────────────────────────────

func (app *App) handleAddBoardItemComment(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	itemID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid item id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(itemID)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canAccessBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var req struct {
		Text string `json:"text"`
	}
	if err := decode(r, &req); err != nil || strings.TrimSpace(req.Text) == "" {
		jsonError(w, "text required", http.StatusBadRequest)
		return
	}
	comment := BoardComment{
		ID:        time.Now().UnixNano(),
		UserID:    user.ID,
		UserName:  user.DisplayName,
		Text:      strings.TrimSpace(req.Text),
		CreatedAt: time.Now(),
	}
	item.Comments = append(item.Comments, comment)
	item.History = append(item.History, BoardHistory{
		Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
		Action: "commented", Detail: req.Text,
	})
	if err := app.store.UpdateBoardItem(*item); err != nil {
		jsonError(w, "save failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "commented", "board_item", itemID,
		fmt.Sprintf("Commented on item %q", item.Subject))
	app.broadcastBoardChange("board_item_updated", item.BoardID)
	jsonOK(w, item)
}

func (app *App) handleUploadBoardItemAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	itemID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid item id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(itemID)
	if item == nil {
		jsonError(w, "item not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := r.ParseMultipartForm(25 << 20); err != nil {
		jsonError(w, "file too large", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	safeName := filepath.Base(header.Filename)
	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
	dir := filepath.Join(app.store.DataDir(), "board_attachments")
	_ = os.MkdirAll(dir, 0700)
	dst, err := os.Create(filepath.Join(dir, storedName))
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	n, _ := io.Copy(dst, file)
	dst.Close()

	att := BoardAttachment{
		ID:         time.Now().UnixNano(),
		Filename:   safeName,
		StoredName: storedName,
		Size:       n,
		MimeType:   mime.TypeByExtension(filepath.Ext(safeName)),
		UploadedBy: user.ID,
		CreatedAt:  time.Now(),
	}
	if err := app.store.AddBoardItemAttachment(itemID, att); err != nil {
		jsonError(w, "failed to save attachment", http.StatusInternalServerError)
		return
	}
	_ = app.store.AddBoardItemHistory(itemID, BoardHistory{
		Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
		Action: "attachment_added", Detail: safeName,
	})
	app.audit(user.ID, user.DisplayName, "attachment", "board_item", itemID,
		fmt.Sprintf("Uploaded attachment %q to item %q", safeName, item.Subject))
	app.broadcastBoardChange("board_item_updated", item.BoardID)
	jsonOK(w, att)
}

func (app *App) handleDownloadBoardItemAttachment(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	itemID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid item id", http.StatusBadRequest)
		return
	}
	attID, _ := strconv.ParseInt(parts[4], 10, 64)
	item := app.store.GetBoardItemByID(itemID)
	if item == nil {
		jsonError(w, "item not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canAccessBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var att *BoardAttachment
	attIDStr := parts[4]
	for _, a := range item.Attachments {
		if a.ID == attID {
			att = &a
			break
		}
	}
	// Fallback: JavaScript may lose precision on large int64 IDs (> 2^53).
	// Try matching by stored_name prefix (the nanosecond part) or filename.
	if att == nil {
		for _, a := range item.Attachments {
			if a.StoredName == attIDStr || strings.HasPrefix(a.StoredName, attIDStr+"_") || a.Filename == attIDStr {
				att = &a
				break
			}
		}
	}
	if att == nil {
		jsonError(w, "attachment not found", http.StatusNotFound)
		return
	}
	fpath := filepath.Join(app.store.DataDir(), "board_attachments", filepath.Base(att.StoredName))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", att.Filename))
	http.ServeFile(w, r, fpath)
}

// ── Board Export ─────────────────────────────────────────────────────────────

func (app *App) handleExportBoard(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	boardID, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid board id", http.StatusBadRequest)
		return
	}
	format := parts[3] // "json", "csv", "svg"

	board := app.store.GetBoardByID(boardID)
	if board == nil {
		jsonError(w, "board not found", http.StatusNotFound)
		return
	}
	if !app.canAccessBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	items := app.store.GetBoardItems(boardID)

	app.audit(user.ID, user.DisplayName, "exported", "board", boardID,
		fmt.Sprintf("Exported board %q as %s", board.Name, format))

	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", board.Name+".json"))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"board": board,
			"items": items,
		})
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", board.Name+".csv"))
		fmt.Fprintf(w, "ID,Column,Subject,Type,Tags,Creator,Created,Updated\r\n")
		for _, item := range items {
			tags := strings.Join(item.Tags, ";")
			fmt.Fprintf(w, "%d,%s,%s,%s,%s,%s,%s,%s\r\n",
				item.ID,
				csvEscape(item.ColumnID),
				csvEscape(item.Subject),
				csvEscape(item.ItemType),
				csvEscape(tags),
				csvEscape(item.CreatorName),
				item.CreatedAt.Format(time.RFC3339),
				item.UpdatedAt.Format(time.RFC3339),
			)
		}
	case "svg":
		app.renderBoardSVG(w, board, items)
	default:
		jsonError(w, "unsupported format: "+format, http.StatusBadRequest)
	}
}

func (app *App) handleImportBoard(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Board Board       `json:"board"`
		Items []BoardItem `json:"items"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Board.Name == "" {
		jsonError(w, "board name is required", http.StatusBadRequest)
		return
	}
	req.Board.OwnerID = user.ID
	req.Board.OwnerName = user.DisplayName
	if len(req.Board.Columns) == 0 {
		req.Board.Columns = DefaultBoardColumns()
	}
	created, err := app.store.CreateBoard(req.Board)
	if err != nil {
		jsonError(w, "failed to create board", http.StatusInternalServerError)
		return
	}
	count := 0
	for _, item := range req.Items {
		item.BoardID = created.ID
		item.CreatorID = user.ID
		item.CreatorName = user.DisplayName
		if _, err := app.store.CreateBoardItem(item); err == nil {
			count++
		}
	}
	app.audit(user.ID, user.Username, "import", "board", created.ID, fmt.Sprintf("Imported board %q with %d items", created.Name, count))
	app.broadcastBoardChange("board_created", created.ID)
	jsonOK(w, map[string]interface{}{"board": created, "items_imported": count})
}

// ── Helpers ─────────────────────────────────────────────────────────────────

func (app *App) renderBoardSVG(w http.ResponseWriter, board *Board, items []BoardItem) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", board.Name+".svg"))

	colWidth := 260
	padding := 16
	headerH := 50
	cardH := 60
	gap := 8
	totalW := len(board.Columns) * (colWidth + padding)

	// Find max items per column
	colItems := map[string][]BoardItem{}
	for _, item := range items {
		colItems[item.ColumnID] = append(colItems[item.ColumnID], item)
	}
	maxCards := 0
	for _, col := range board.Columns {
		if n := len(colItems[col.ID]); n > maxCards {
			maxCards = n
		}
	}
	totalH := headerH + 40 + maxCards*(cardH+gap) + padding

	fmt.Fprintf(w, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`, totalW, totalH, totalW, totalH)
	fmt.Fprintf(w, `<rect width="100%%" height="100%%" fill="#1a1a2e"/>`)
	fmt.Fprintf(w, `<text x="%d" y="30" fill="#e0e0e0" font-size="18" font-family="sans-serif" font-weight="bold">%s</text>`, padding, escXML(board.Name))

	for ci, col := range board.Columns {
		x := ci*(colWidth+padding) + padding/2
		y := headerH
		fmt.Fprintf(w, `<rect x="%d" y="%d" width="%d" height="%d" rx="8" fill="#16213e"/>`, x, y, colWidth, totalH-headerH-padding)
		fmt.Fprintf(w, `<text x="%d" y="%d" fill="#e0e0e0" font-size="14" font-family="sans-serif" font-weight="bold">%s (%d)</text>`, x+12, y+22, escXML(col.Name), len(colItems[col.ID]))

		for ii, item := range colItems[col.ID] {
			cy := y + 36 + ii*(cardH+gap)
			cardColor := "#0f3460"
			if item.Color != "" {
				cardColor = item.Color
			}
			fmt.Fprintf(w, `<rect x="%d" y="%d" width="%d" height="%d" rx="6" fill="%s"/>`, x+6, cy, colWidth-12, cardH, cardColor)
			fmt.Fprintf(w, `<text x="%d" y="%d" fill="#e0e0e0" font-size="12" font-family="sans-serif">%s</text>`, x+14, cy+20, escXML(truncate(item.Subject, 32)))
			fmt.Fprintf(w, `<text x="%d" y="%d" fill="#a0a0a0" font-size="10" font-family="sans-serif">#%d · %s</text>`, x+14, cy+38, item.ID, escXML(item.CreatorName))
			if len(item.Tags) > 0 {
				fmt.Fprintf(w, `<text x="%d" y="%d" fill="#7ec8e3" font-size="9" font-family="sans-serif">%s</text>`, x+14, cy+52, escXML(strings.Join(item.Tags, ", ")))
			}
		}
	}
	fmt.Fprintf(w, `</svg>`)
}

func escXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}


// notifyBoardMentions parses @username mentions and sends notifications.
func (app *App) notifyBoardMentions(text string, sender *User, board *Board, item *BoardItem) {
	if text == "" {
		return
	}
	// Simple @username extraction
	words := strings.Fields(text)
	seen := map[string]bool{}
	for _, w := range words {
		if strings.HasPrefix(w, "@") {
			username := strings.TrimLeft(w, "@")
			username = strings.TrimRight(username, ".,;:!?")
			if username != "" && !seen[username] {
				seen[username] = true
				users := app.store.GetUsers()
				for _, u := range users {
					if strings.EqualFold(u.Username, username) && u.ID != sender.ID {
						app.notifyUser(u.ID, "board_mention",
							fmt.Sprintf("Mentioned in board %q", board.Name),
							fmt.Sprintf("%s mentioned you in item #%d: %s", sender.DisplayName, item.ID, item.Subject),
							fmt.Sprintf("board:%d:item:%d", board.ID, item.ID),
						)
						break
					}
				}
			}
		}
	}
}

func (app *App) broadcastBoardChange(action string, boardID int64) {
	data := fmt.Sprintf(`{"action":"%s","board_id":%d}`, action, boardID)
	msg := SSEMessage{Event: "board_change", Data: data}

	// Only notify users who have access to this board
	board := app.store.GetBoardByID(boardID)
	if board == nil {
		// Board deleted — broadcast to everyone so clients can clean up
		app.broker.BroadcastAll(msg)
		return
	}
	app.broker.BroadcastFiltered(0, msg, func(userID int64) bool {
		u, ok := app.store.GetUserByID(userID)
		if !ok {
			return false
		}
		return app.canAccessBoard(board, u)
	})
}

// ── Share Token Endpoints ───────────────────────────────────────────────────

func (app *App) handleGenerateBoardShareToken(w http.ResponseWriter, r *http.Request, user *User) {
	// URL is /api/boards/{id}/share — pathID returns "share", use segment 2 instead
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(id)
	if board == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	token, err := generateID()
	if err != nil {
		jsonError(w, "failed to generate token", http.StatusInternalServerError)
		return
	}
	board.ShareToken = token
	if err := app.store.UpdateBoard(*board); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.Username, "share", "board", board.ID, fmt.Sprintf("Generated share link for board %q", board.Name))
	jsonOK(w, map[string]string{"share_token": token})
}

func (app *App) handleGetBoardByShareToken(w http.ResponseWriter, r *http.Request, user *User) {
	token := r.URL.Query().Get("token")
	if token == "" {
		jsonError(w, "token is required", http.StatusBadRequest)
		return
	}
	boards := app.store.GetBoards()
	for _, b := range boards {
		if b.ShareToken != "" && subtle.ConstantTimeCompare([]byte(b.ShareToken), []byte(token)) == 1 {
			// Share token grants access if the user is authenticated
			items := app.store.GetBoardItems(b.ID)
			if items == nil {
				items = []BoardItem{}
			}
			jsonOK(w, map[string]interface{}{"board": b, "items": items})
			return
		}
	}
	jsonError(w, "invalid or expired share link", http.StatusNotFound)
}

func (app *App) handleGenerateBoardItemShareToken(w http.ResponseWriter, r *http.Request, user *User) {
	// URL is /api/board-items/{id}/share — pathID returns "share", use segment 2 instead
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	token, err := generateID()
	if err != nil {
		jsonError(w, "failed to generate token", http.StatusInternalServerError)
		return
	}
	item.ShareToken = token
	if err := app.store.UpdateBoardItem(*item); err != nil {
		jsonError(w, "update failed", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "share", "board_item", id,
		fmt.Sprintf("Generated share link for item %q", item.Subject))
	jsonOK(w, map[string]string{"share_token": token})
}

func (app *App) handleGetBoardItemByShareToken(w http.ResponseWriter, r *http.Request, user *User) {
	token := r.URL.Query().Get("token")
	if token == "" {
		jsonError(w, "token is required", http.StatusBadRequest)
		return
	}
	// Search all board items for the token
	boards := app.store.GetBoards()
	for _, b := range boards {
		items := app.store.GetBoardItems(b.ID)
		for _, item := range items {
			if item.ShareToken != "" && subtle.ConstantTimeCompare([]byte(item.ShareToken), []byte(token)) == 1 {
				// Share token grants access if user is authenticated
				colName := ""
				for _, c := range b.Columns {
					if c.ID == item.ColumnID {
						colName = c.Name
						break
					}
				}
				jsonOK(w, map[string]interface{}{
					"item":       item,
					"board_name": b.Name,
					"board_id":   b.ID,
					"column_name": colName,
				})
				return
			}
		}
	}
	jsonError(w, "invalid or expired share link", http.StatusNotFound)
}

// ── Board Tags Endpoint ─────────────────────────────────────────────────────

func (app *App) handleGetBoardTags(w http.ResponseWriter, r *http.Request, user *User) {
	boardID, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid board id", http.StatusBadRequest)
		return
	}
	board := app.store.GetBoardByID(boardID)
	if board == nil {
		jsonError(w, "board not found", http.StatusNotFound)
		return
	}
	if !app.canAccessBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	items := app.store.GetBoardItems(boardID)
	tagSet := map[string]bool{}
	for _, item := range items {
		for _, tag := range item.Tags {
			tagSet[tag] = true
		}
	}
	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}
	jsonOK(w, tags)
}

// handleGetBoardDueItems returns items with due dates that the user is responsible for or created
func (app *App) handleGetBoardDueItems(w http.ResponseWriter, r *http.Request, user *User) {
	boards := app.store.GetBoards()
	type dueItem struct {
		BoardItem
		BoardName string `json:"board_name"`
	}
	var dueItems []dueItem
	today := time.Now().Format("2006-01-02")
	for _, b := range boards {
		if !app.canAccessBoard(&b, user) {
			continue
		}
		items := app.store.GetBoardItems(b.ID)
		for _, item := range items {
			if item.DueDate == "" {
				continue
			}
			if item.DueDate > today {
				continue
			}
			if item.ResponsibleID == user.ID || item.CreatorID == user.ID {
				dueItems = append(dueItems, dueItem{BoardItem: item, BoardName: b.Name})
			}
		}
	}
	if dueItems == nil {
		dueItems = []dueItem{}
	}
	jsonOK(w, dueItems)
}

// ── Archive / Unarchive Board Items ─────────────────────────────────────────

func (app *App) handleArchiveBoardItem(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	item.Archived = true
	item.UpdatedAt = time.Now()
	if err := app.store.UpdateBoardItem(*item); err != nil {
		jsonError(w, "archive failed", http.StatusInternalServerError)
		return
	}
	_ = app.store.AddBoardItemHistory(id, BoardHistory{
		Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
		Action: "archived", Detail: "Item archived",
	})
	app.broadcastBoardChange("board_item_archived", item.BoardID)
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleUnarchiveBoardItem(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(pathSegment(r, 2), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	item := app.store.GetBoardItemByID(id)
	if item == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	board := app.store.GetBoardByID(item.BoardID)
	if board == nil || !app.canEditBoard(board, user) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	item.Archived = false
	item.UpdatedAt = time.Now()
	if err := app.store.UpdateBoardItem(*item); err != nil {
		jsonError(w, "unarchive failed", http.StatusInternalServerError)
		return
	}
	_ = app.store.AddBoardItemHistory(id, BoardHistory{
		Timestamp: time.Now(), UserID: user.ID, UserName: user.DisplayName,
		Action: "unarchived", Detail: "Item unarchived",
	})
	app.broadcastBoardChange("board_item_unarchived", item.BoardID)
	jsonOK(w, map[string]string{"status": "ok"})
}

