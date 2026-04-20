package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

// ── Board API Tests ──────────────────────────────────────────────────────────

func TestAPI_Board_CRUD(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create board
	resp := apiDo(t, srv, http.MethodPost, "/api/boards", map[string]any{
		"name":       "Test Board",
		"visibility": "global",
		"columns": []map[string]any{
			{"id": "1", "name": "Open"},
			{"id": "2", "name": "In Progress"},
			{"id": "3", "name": "Done"},
		},
	}, cookies)
	var board map[string]any
	decodeJSON(t, resp, &board)
	if !isSuccess(resp.StatusCode) {
		t.Fatalf("create board: expected 200/201, got %d", resp.StatusCode)
	}
	boardID := int(board["id"].(float64))
	if board["name"] != "Test Board" {
		t.Errorf("expected name 'Test Board', got %v", board["name"])
	}

	// List boards
	resp2 := apiDo(t, srv, http.MethodGet, "/api/boards", nil, cookies)
	var boards []map[string]any
	decodeJSON(t, resp2, &boards)
	if len(boards) < 1 {
		t.Fatal("expected at least 1 board")
	}

	// Update board
	resp3 := apiDo(t, srv, http.MethodPut, fmt.Sprintf("/api/boards/%d", boardID), map[string]any{
		"name":       "Updated Board",
		"visibility": "global",
		"columns": []map[string]any{
			{"id": "1", "name": "Open"},
			{"id": "2", "name": "In Progress"},
			{"id": "3", "name": "Done"},
		},
	}, cookies)
	defer resp3.Body.Close()
	if !isSuccess(resp3.StatusCode) {
		t.Errorf("update board: expected 200, got %d", resp3.StatusCode)
	}

	// Delete board
	resp4 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/boards/%d", boardID), nil, cookies)
	defer resp4.Body.Close()
	if !isSuccess(resp4.StatusCode) {
		t.Errorf("delete board: expected 200, got %d", resp4.StatusCode)
	}
}

func TestAPI_BoardItem_CRUD(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create board
	resp := apiDo(t, srv, http.MethodPost, "/api/boards", map[string]any{
		"name":       "Item Test Board",
		"visibility": "global",
		"columns":    []map[string]any{{"id": "1", "name": "Open"}, {"id": "2", "name": "Done"}},
	}, cookies)
	var board map[string]any
	decodeJSON(t, resp, &board)
	boardID := int(board["id"].(float64))

	// Create item
	resp2 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/boards/%d/items", boardID), map[string]any{
		"subject":    "Test Item",
		"column_id":  "1",
		"sort_order": 0,
	}, cookies)
	var item map[string]any
	decodeJSON(t, resp2, &item)
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("create item: expected 200/201, got %d", resp2.StatusCode)
	}
	itemID := int(item["id"].(float64))
	if item["subject"] != "Test Item" {
		t.Errorf("expected subject 'Test Item', got %v", item["subject"])
	}

	// Get items
	resp3 := apiDo(t, srv, http.MethodGet, fmt.Sprintf("/api/boards/%d/items", boardID), nil, cookies)
	var items []map[string]any
	decodeJSON(t, resp3, &items)
	if len(items) < 1 {
		t.Fatal("expected at least 1 item")
	}

	// Update item
	resp4 := apiDo(t, srv, http.MethodPut, fmt.Sprintf("/api/board-items/%d", itemID), map[string]any{
		"subject": "Updated Item",
		"note":    "A note",
	}, cookies)
	defer resp4.Body.Close()
	if !isSuccess(resp4.StatusCode) {
		t.Errorf("update item: expected 200, got %d", resp4.StatusCode)
	}

	// Move item to column 2
	resp5 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/board-items/%d/move", itemID), map[string]any{
		"column_id":  "2",
		"sort_order": 0,
	}, cookies)
	defer resp5.Body.Close()
	if !isSuccess(resp5.StatusCode) {
		t.Errorf("move item: expected 200, got %d", resp5.StatusCode)
	}

	// Delete item
	resp6 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/board-items/%d", itemID), nil, cookies)
	defer resp6.Body.Close()
	if !isSuccess(resp6.StatusCode) {
		t.Errorf("delete item: expected 200, got %d", resp6.StatusCode)
	}
}

func TestAPI_BoardItem_Archive_Unarchive(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create board + item
	resp := apiDo(t, srv, http.MethodPost, "/api/boards", map[string]any{
		"name": "Archive Test", "visibility": "global",
		"columns": []map[string]any{{"id": "1", "name": "Open"}},
	}, cookies)
	var board map[string]any
	decodeJSON(t, resp, &board)
	boardID := int(board["id"].(float64))

	resp2 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/boards/%d/items", boardID), map[string]any{
		"subject": "Archivable", "column_id": "1", "sort_order": 0,
	}, cookies)
	var item map[string]any
	decodeJSON(t, resp2, &item)
	itemID := int(item["id"].(float64))

	// Archive
	resp3 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/board-items/%d/archive", itemID), map[string]any{}, cookies)
	defer resp3.Body.Close()
	if !isSuccess(resp3.StatusCode) {
		t.Errorf("archive: expected 200, got %d", resp3.StatusCode)
	}

	// Verify archived
	resp4 := apiDo(t, srv, http.MethodGet, fmt.Sprintf("/api/boards/%d/items", boardID), nil, cookies)
	var itemsAfterArchive []map[string]any
	decodeJSON(t, resp4, &itemsAfterArchive)
	for _, it := range itemsAfterArchive {
		if int(it["id"].(float64)) == itemID {
			if it["archived"] != true {
				t.Error("expected item to be archived")
			}
		}
	}

	// Unarchive
	resp5 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/board-items/%d/unarchive", itemID), map[string]any{}, cookies)
	defer resp5.Body.Close()
	if !isSuccess(resp5.StatusCode) {
		t.Errorf("unarchive: expected 200, got %d", resp5.StatusCode)
	}
}

func TestAPI_BoardItem_Accept_Unaccept(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	resp := apiDo(t, srv, http.MethodPost, "/api/boards", map[string]any{
		"name": "Accept Test", "visibility": "global",
		"columns": []map[string]any{{"id": "1", "name": "Open"}},
	}, cookies)
	var board map[string]any
	decodeJSON(t, resp, &board)
	boardID := int(board["id"].(float64))

	resp2 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/boards/%d/items", boardID), map[string]any{
		"subject": "Acceptable", "column_id": "1", "sort_order": 0,
		"event_id": 9999, // point at a non-existent event — must not break accept
		"due_date": "2020-01-01", // long past
	}, cookies)
	var item map[string]any
	decodeJSON(t, resp2, &item)
	itemID := int(item["id"].(float64))

	// Accept
	resp3 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/board-items/%d/accept", itemID), map[string]any{}, cookies)
	defer resp3.Body.Close()
	if !isSuccess(resp3.StatusCode) {
		t.Fatalf("accept: expected 200, got %d", resp3.StatusCode)
	}

	// Verify accepted_at set
	resp4 := apiDo(t, srv, http.MethodGet, fmt.Sprintf("/api/boards/%d/items", boardID), nil, cookies)
	var itemsAfter []map[string]any
	decodeJSON(t, resp4, &itemsAfter)
	found := false
	for _, it := range itemsAfter {
		if int(it["id"].(float64)) == itemID {
			found = true
			if it["accepted_at"] == nil || it["accepted_at"] == "" {
				t.Error("expected accepted_at to be set after accept")
			}
			if it["accepted_by_name"] == nil {
				t.Error("expected accepted_by_name to be set after accept")
			}
		}
	}
	if !found {
		t.Error("item not found after accept")
	}

	// Unaccept
	resp5 := apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/board-items/%d/unaccept", itemID), map[string]any{}, cookies)
	defer resp5.Body.Close()
	if !isSuccess(resp5.StatusCode) {
		t.Fatalf("unaccept: expected 200, got %d", resp5.StatusCode)
	}

	// Verify accepted_at cleared
	resp6 := apiDo(t, srv, http.MethodGet, fmt.Sprintf("/api/boards/%d/items", boardID), nil, cookies)
	var itemsAfter2 []map[string]any
	decodeJSON(t, resp6, &itemsAfter2)
	for _, it := range itemsAfter2 {
		if int(it["id"].(float64)) == itemID {
			if v, ok := it["accepted_at"]; ok && v != nil && v != "" {
				t.Errorf("expected accepted_at cleared after unaccept, got %v", v)
			}
		}
	}
}

func TestAPI_BoardDelete_CascadesItems(t *testing.T) {
	_, srv := newTestApp(t)
	cookies := login(t, srv, "admin", "admin")

	// Create board with items
	resp := apiDo(t, srv, http.MethodPost, "/api/boards", map[string]any{
		"name": "Cascade Test", "visibility": "global",
		"columns": []map[string]any{{"id": "1", "name": "Col"}},
	}, cookies)
	var board map[string]any
	decodeJSON(t, resp, &board)
	boardID := int(board["id"].(float64))

	for i := 0; i < 3; i++ {
		apiDo(t, srv, http.MethodPost, fmt.Sprintf("/api/boards/%d/items", boardID), map[string]any{
			"subject": fmt.Sprintf("Item %d", i), "column_id": 1, "sort_order": i,
		}, cookies).Body.Close()
	}

	// Delete board
	resp2 := apiDo(t, srv, http.MethodDelete, fmt.Sprintf("/api/boards/%d", boardID), nil, cookies)
	defer resp2.Body.Close()
	if !isSuccess(resp2.StatusCode) {
		t.Fatalf("delete board: got %d", resp2.StatusCode)
	}

	// Verify items are gone (board no longer exists, so should get 404 or empty)
	resp3 := apiDo(t, srv, http.MethodGet, fmt.Sprintf("/api/boards/%d/items", boardID), nil, cookies)
	defer resp3.Body.Close()
	// Board is deleted, so this should fail or return empty
	if resp3.StatusCode == 200 {
		var items []map[string]any
		json.NewDecoder(resp3.Body).Decode(&items)
		if len(items) > 0 {
			t.Error("expected no items after board deletion")
		}
	}
}
