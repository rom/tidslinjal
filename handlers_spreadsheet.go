package main

import (
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ── Spreadsheet Store Methods ────────────────────────────────────────────────

func (s *Store) GetSpreadsheets() []Spreadsheet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Spreadsheet, len(s.spreadsheets))
	copy(out, s.spreadsheets)
	return out
}

func (s *Store) GetSpreadsheetByID(id int64) *Spreadsheet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.spreadsheets {
		if s.spreadsheets[i].ID == id {
			cp := s.spreadsheets[i]
			return &cp
		}
	}
	return nil
}

func (s *Store) CreateSpreadsheet(ss Spreadsheet) (Spreadsheet, error) {
	s.mu.Lock()
	s.nextSpreadsheetID++
	ss.ID = s.nextSpreadsheetID
	now := time.Now()
	ss.CreatedAt = now
	ss.UpdatedAt = now
	if ss.Data == nil {
		ss.Data = make(map[string]string)
	}
	if ss.Columns == nil {
		ss.Columns = []SpreadsheetCol{}
	}
	if ss.GroupIDs == nil {
		ss.GroupIDs = []int64{}
	}
	s.spreadsheets = append(s.spreadsheets, ss)
	snap := append([]Spreadsheet(nil), s.spreadsheets...)
	s.mu.Unlock()
	return ss, s.persist("spreadsheets.json", snap)
}

func (s *Store) UpdateSpreadsheet(ss Spreadsheet) error {
	s.mu.Lock()
	for i := range s.spreadsheets {
		if s.spreadsheets[i].ID == ss.ID {
			ss.UpdatedAt = time.Now()
			s.spreadsheets[i] = ss
			snap := append([]Spreadsheet(nil), s.spreadsheets...)
			s.mu.Unlock()
			return s.persist("spreadsheets.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("spreadsheet not found")
}

func (s *Store) DeleteSpreadsheet(id int64) error {
	s.mu.Lock()
	for i := range s.spreadsheets {
		if s.spreadsheets[i].ID == id {
			s.spreadsheets = append(s.spreadsheets[:i], s.spreadsheets[i+1:]...)
			snap := append([]Spreadsheet(nil), s.spreadsheets...)
			s.mu.Unlock()
			return s.persist("spreadsheets.json", snap)
		}
	}
	s.mu.Unlock()
	return fmt.Errorf("spreadsheet not found")
}

// ── Spreadsheet HTTP Handlers ────────────────────────────────────────────────

func (app *App) handleListSpreadsheets(w http.ResponseWriter, r *http.Request, user *User) {
	all := app.store.GetSpreadsheets()
	// Filter by visibility
	var visible []Spreadsheet
	for _, ss := range all {
		if ss.OwnerID == user.ID || ss.Visibility == "public" || user.Role == RoleAdmin {
			visible = append(visible, ss)
			continue
		}
		if ss.Visibility == "group" {
			for _, gid := range ss.GroupIDs {
				if userInGroup(user, gid, app.store) {
					visible = append(visible, ss)
					break
				}
			}
		}
	}
	if visible == nil {
		visible = []Spreadsheet{}
	}
	// Strip data from list response (too large)
	for i := range visible {
		visible[i].Data = nil
	}
	jsonOK(w, visible)
}

func (app *App) handleGetSpreadsheet(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/api/spreadsheets/"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	ss := app.store.GetSpreadsheetByID(id)
	if ss == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, ss)
}

func (app *App) handleCreateSpreadsheet(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Visibility  string  `json:"visibility"`
		GroupIDs    []int64 `json:"group_ids"`
		RowCount    int     `json:"row_count"`
		ColCount    int     `json:"col_count"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "name required", http.StatusBadRequest)
		return
	}
	if req.Visibility == "" {
		req.Visibility = "private"
	}
	if req.RowCount == 0 {
		req.RowCount = 50
	}
	if req.ColCount == 0 {
		req.ColCount = 26
	}
	// Generate default columns
	cols := make([]SpreadsheetCol, req.ColCount)
	for i := 0; i < req.ColCount; i++ {
		cols[i] = SpreadsheetCol{Key: colIndexToLetter(i)}
	}
	ss, err := app.store.CreateSpreadsheet(Spreadsheet{
		Name:        stripHTMLTags(req.Name),
		Description: stripHTMLTags(req.Description),
		OwnerID:     user.ID,
		OwnerName:   user.DisplayName,
		Visibility:  req.Visibility,
		GroupIDs:    req.GroupIDs,
		Columns:     cols,
		RowCount:    req.RowCount,
		ColCount:    req.ColCount,
	})
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "spreadsheet", ss.ID,
		fmt.Sprintf("Created spreadsheet %q", req.Name))
	jsonOK(w, ss)
}

func (app *App) handleUpdateSpreadsheet(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/api/spreadsheets/"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing := app.store.GetSpreadsheetByID(id)
	if existing == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	var req Spreadsheet
	if err := json.NewDecoder(io.LimitReader(r.Body, 10<<20)).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.ID = id
	req.OwnerID = existing.OwnerID
	req.OwnerName = existing.OwnerName
	req.CreatedAt = existing.CreatedAt
	if req.Name == "" {
		req.Name = existing.Name
	}
	if req.Visibility == "" {
		req.Visibility = existing.Visibility
	}
	if err := app.store.UpdateSpreadsheet(req); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Broadcast change
	app.broker.BroadcastAll(SSEMessage{Event: "spreadsheet_change", Data: fmt.Sprintf(`{"id":%d}`, id)})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (app *App) handleDeleteSpreadsheet(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/api/spreadsheets/"), 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteSpreadsheet(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "spreadsheet", id,
		fmt.Sprintf("Deleted spreadsheet #%d", id))
	jsonOK(w, map[string]string{"status": "deleted"})
}

// ── Export ────────────────────────────────────────────────────────────────────

func (app *App) handleExportSpreadsheet(w http.ResponseWriter, r *http.Request, user *User) {
	// Path: /api/spreadsheets/{id}/export?format=csv
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/spreadsheets/"), "/")
	if len(parts) < 2 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	ss := app.store.GetSpreadsheetByID(id)
	if ss == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "csv"
	}

	// Build 2D grid
	grid := buildGrid(ss)

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, ss.Name))
		writer := csv.NewWriter(w)
		// Header row
		headers := make([]string, len(ss.Columns))
		for i, c := range ss.Columns {
			if c.Title != "" {
				headers[i] = c.Title
			} else {
				headers[i] = c.Key
			}
		}
		_ = writer.Write(headers)
		for _, row := range grid {
			_ = writer.Write(row)
		}
		writer.Flush()

	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, ss.Name))
		jsonOK(w, ss)

	case "xml":
		w.Header().Set("Content-Type", "application/xml")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.xml"`, ss.Name))
		type Cell struct {
			XMLName xml.Name `xml:"cell"`
			Ref     string   `xml:"ref,attr"`
			Value   string   `xml:",chardata"`
		}
		type Row struct {
			XMLName xml.Name `xml:"row"`
			Num     int      `xml:"num,attr"`
			Cells   []Cell   `xml:"cell"`
		}
		type Sheet struct {
			XMLName xml.Name `xml:"spreadsheet"`
			Name    string   `xml:"name,attr"`
			Rows    []Row    `xml:"row"`
		}
		sheet := Sheet{Name: ss.Name}
		for ri, row := range grid {
			xmlRow := Row{Num: ri + 1}
			for ci, val := range row {
				if val != "" {
					ref := ss.Columns[ci].Key
					xmlRow.Cells = append(xmlRow.Cells, Cell{Ref: fmt.Sprintf("%s%d", ref, ri+1), Value: val})
				}
			}
			if len(xmlRow.Cells) > 0 {
				sheet.Rows = append(sheet.Rows, xmlRow)
			}
		}
		w.Write([]byte(xml.Header))
		enc := xml.NewEncoder(w)
		enc.Indent("", "  ")
		enc.Encode(sheet)

	default:
		jsonError(w, "unsupported format (csv, json, xml supported)", http.StatusBadRequest)
	}
}

// ── Import ───────────────────────────────────────────────────────────────────

func (app *App) handleImportSpreadsheet(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/spreadsheets/"), "/")
	if len(parts) < 2 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	ss := app.store.GetSpreadsheetByID(id)
	if ss == nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "csv"
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20))
	if err != nil {
		jsonError(w, "body too large", http.StatusRequestEntityTooLarge)
		return
	}

	var rows [][]string
	switch format {
	case "csv":
		reader := csv.NewReader(strings.NewReader(string(body)))
		rows, err = reader.ReadAll()
		if err != nil {
			jsonError(w, "invalid CSV: "+err.Error(), http.StatusBadRequest)
			return
		}
	case "json":
		var imported Spreadsheet
		if err := json.Unmarshal(body, &imported); err != nil {
			jsonError(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		// Copy data and columns
		ss.Data = imported.Data
		ss.Columns = imported.Columns
		ss.RowCount = imported.RowCount
		ss.ColCount = imported.ColCount
		if err := app.store.UpdateSpreadsheet(*ss); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		app.broker.BroadcastAll(SSEMessage{Event: "spreadsheet_change", Data: fmt.Sprintf(`{"id":%d}`, id)})
		jsonOK(w, map[string]string{"status": "imported"})
		return
	default:
		jsonError(w, "unsupported format (csv, json supported)", http.StatusBadRequest)
		return
	}

	// Process CSV rows into spreadsheet data
	if len(rows) == 0 {
		jsonOK(w, map[string]string{"status": "empty"})
		return
	}
	newData := make(map[string]string)
	// First row may be headers — import as data starting at row 1
	maxCol := 0
	for ri, row := range rows {
		for ci, val := range row {
			if val != "" {
				colKey := colIndexToLetter(ci)
				newData[fmt.Sprintf("%s%d", colKey, ri+1)] = val
				if ci >= maxCol {
					maxCol = ci + 1
				}
			}
		}
	}
	ss.Data = newData
	if maxCol > ss.ColCount {
		ss.ColCount = maxCol
		cols := make([]SpreadsheetCol, maxCol)
		for i := 0; i < maxCol; i++ {
			if i < len(ss.Columns) {
				cols[i] = ss.Columns[i]
			} else {
				cols[i] = SpreadsheetCol{Key: colIndexToLetter(i)}
			}
		}
		ss.Columns = cols
	}
	if len(rows) > ss.RowCount {
		ss.RowCount = len(rows)
	}
	if err := app.store.UpdateSpreadsheet(*ss); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.broker.BroadcastAll(SSEMessage{Event: "spreadsheet_change", Data: fmt.Sprintf(`{"id":%d}`, id)})
	jsonOK(w, map[string]interface{}{"status": "imported", "rows": len(rows), "cols": maxCol})
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// colIndexToLetter converts 0-based index to spreadsheet column letter (0=A, 25=Z, 26=AA, etc.)
func colIndexToLetter(i int) string {
	result := ""
	for {
		result = string(rune('A'+i%26)) + result
		i = i/26 - 1
		if i < 0 {
			break
		}
	}
	return result
}

// buildGrid converts sparse cell data into a 2D string array for export
func buildGrid(ss *Spreadsheet) [][]string {
	grid := make([][]string, ss.RowCount)
	colCount := len(ss.Columns)
	for i := range grid {
		grid[i] = make([]string, colCount)
	}
	for ref, val := range ss.Data {
		col, row := parseCellRef(ref)
		if row >= 0 && row < ss.RowCount && col >= 0 && col < colCount {
			grid[row][col] = val
		}
	}
	return grid
}

// parseCellRef parses "A1" into (col=0, row=0), "AA10" into (col=26, row=9)
func parseCellRef(ref string) (col, row int) {
	i := 0
	for i < len(ref) && ref[i] >= 'A' && ref[i] <= 'Z' {
		i++
	}
	if i == 0 || i == len(ref) {
		return -1, -1
	}
	// Parse column letters
	col = 0
	for j := 0; j < i; j++ {
		col = col*26 + int(ref[j]-'A') + 1
	}
	col-- // 0-based
	// Parse row number
	row, err := strconv.Atoi(ref[i:])
	if err != nil || row < 1 {
		return -1, -1
	}
	return col, row - 1 // 0-based
}

// userInGroup checks if a user belongs to a group
func userInGroup(user *User, groupID int64, store *Store) bool {
	members := store.GetGroupMembers(groupID)
	for _, m := range members {
		if m.UserID == user.ID {
			return true
		}
	}
	return false
}
