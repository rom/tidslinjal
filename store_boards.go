package main

import (
	"fmt"
	"time"
)

// ── Board Store ─────────────────────────────────────────────────────────────

func (s *Store) GetBoards() []Board {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Board, len(s.boards))
	copy(out, s.boards)
	return out
}

func (s *Store) GetBoardByID(id int64) *Board {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, b := range s.boards {
		if b.ID == id {
			cp := b
			return &cp
		}
	}
	return nil
}

func (s *Store) CreateBoard(b Board) (Board, error) {
	s.mu.Lock()
	s.nextBoardID++
	b.ID = s.nextBoardID
	b.CreatedAt = time.Now()
	b.UpdatedAt = b.CreatedAt
	s.boards = append(s.boards, b)
	snap := append([]Board(nil), s.boards...)
	s.mu.Unlock()
	return b, s.persist("boards.json", snap)
}

func (s *Store) UpdateBoard(b Board) error {
	s.mu.Lock()
	for i, x := range s.boards {
		if x.ID == b.ID {
			b.UpdatedAt = time.Now()
			s.boards[i] = b
			snap := append([]Board(nil), s.boards...)
			s.mu.Unlock()
			return s.persist("boards.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("board %d not found", b.ID)
}

func (s *Store) DeleteBoard(id int64) error {
	s.mu.Lock()
	for i, x := range s.boards {
		if x.ID == id {
			s.boards = append(s.boards[:i], s.boards[i+1:]...)
			snap := append([]Board(nil), s.boards...)
			// Also remove all items for this board
			filtered := s.boardItems[:0]
			for _, item := range s.boardItems {
				if item.BoardID != id {
					filtered = append(filtered, item)
				}
			}
			s.boardItems = filtered
			snapItems := append([]BoardItem(nil), s.boardItems...)
			s.mu.Unlock()
			_ = s.persist("board_items.json", snapItems)
			return s.persist("boards.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("board %d not found", id)
}

// ── Board Items Store ───────────────────────────────────────────────────────

func (s *Store) GetBoardItems(boardID int64) []BoardItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []BoardItem
	for _, item := range s.boardItems {
		if item.BoardID == boardID {
			out = append(out, item)
		}
	}
	return out
}

func (s *Store) GetBoardItemByID(id int64) *BoardItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, item := range s.boardItems {
		if item.ID == id {
			cp := item
			return &cp
		}
	}
	return nil
}

func (s *Store) CreateBoardItem(item BoardItem) (BoardItem, error) {
	s.mu.Lock()
	s.nextBoardItemID++
	item.ID = s.nextBoardItemID
	item.CreatedAt = time.Now()
	item.UpdatedAt = item.CreatedAt
	s.boardItems = append(s.boardItems, item)
	snap := append([]BoardItem(nil), s.boardItems...)
	s.mu.Unlock()
	return item, s.persist("board_items.json", snap)
}

func (s *Store) UpdateBoardItem(item BoardItem) error {
	s.mu.Lock()
	for i, x := range s.boardItems {
		if x.ID == item.ID {
			item.UpdatedAt = time.Now()
			s.boardItems[i] = item
			snap := append([]BoardItem(nil), s.boardItems...)
			s.mu.Unlock()
			return s.persist("board_items.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("board item %d not found", item.ID)
}

func (s *Store) DeleteBoardItem(id int64) error {
	s.mu.Lock()
	for i, x := range s.boardItems {
		if x.ID == id {
			s.boardItems = append(s.boardItems[:i], s.boardItems[i+1:]...)
			snap := append([]BoardItem(nil), s.boardItems...)
			s.mu.Unlock()
			return s.persist("board_items.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("board item %d not found", id)
}

// MoveBoardItem moves an item to a column at the given sort position, shifting other items.
func (s *Store) MoveBoardItem(itemID int64, columnID string, sortOrder int) error {
	s.mu.Lock()
	// Find the item
	itemIdx := -1
	var boardID int64
	for i, x := range s.boardItems {
		if x.ID == itemID {
			itemIdx = i
			boardID = x.BoardID
			break
		}
	}
	if itemIdx < 0 {
		s.mu.Unlock()
		return fmt.Errorf("board item %d not found", itemID)
	}

	// Update the item's column and sort order
	s.boardItems[itemIdx].ColumnID = columnID
	s.boardItems[itemIdx].SortOrder = sortOrder
	s.boardItems[itemIdx].UpdatedAt = time.Now()

	// Reorder all items in the target column to have sequential sort orders
	// Collect indices of items in this column for this board (sorted by sort_order, with moved item at its new position)
	type idxOrder struct {
		idx       int
		sortOrder int
	}
	var colIdxs []idxOrder
	for i, x := range s.boardItems {
		if x.BoardID == boardID && x.ColumnID == columnID {
			colIdxs = append(colIdxs, idxOrder{i, x.SortOrder})
		}
	}
	// Sort: by sort_order, but if equal, the moved item comes first (to place it at the requested position)
	for i := 0; i < len(colIdxs); i++ {
		for j := i + 1; j < len(colIdxs); j++ {
			swap := false
			if colIdxs[i].sortOrder > colIdxs[j].sortOrder {
				swap = true
			} else if colIdxs[i].sortOrder == colIdxs[j].sortOrder && colIdxs[i].idx != itemIdx && colIdxs[j].idx == itemIdx {
				swap = true
			}
			if swap {
				colIdxs[i], colIdxs[j] = colIdxs[j], colIdxs[i]
			}
		}
	}
	// Assign sequential sort orders
	for seq, ci := range colIdxs {
		s.boardItems[ci.idx].SortOrder = seq
	}

	snap := append([]BoardItem(nil), s.boardItems...)
	s.mu.Unlock()
	return s.persist("board_items.json", snap)
}

// AddBoardItemHistory appends a history entry to a board item.
func (s *Store) AddBoardItemHistory(itemID int64, h BoardHistory) error {
	s.mu.Lock()
	for i, x := range s.boardItems {
		if x.ID == itemID {
			s.boardItems[i].History = append(s.boardItems[i].History, h)
			s.boardItems[i].UpdatedAt = time.Now()
			snap := append([]BoardItem(nil), s.boardItems...)
			s.mu.Unlock()
			return s.persist("board_items.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("board item %d not found", itemID)
}

// AddBoardItemAttachment appends an attachment to a board item.
func (s *Store) AddBoardItemAttachment(itemID int64, att BoardAttachment) error {
	s.mu.Lock()
	for i, x := range s.boardItems {
		if x.ID == itemID {
			s.boardItems[i].Attachments = append(s.boardItems[i].Attachments, att)
			s.boardItems[i].UpdatedAt = time.Now()
			snap := append([]BoardItem(nil), s.boardItems...)
			s.mu.Unlock()
			return s.persist("board_items.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("board item %d not found", itemID)
}
