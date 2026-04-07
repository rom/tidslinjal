package main

import (
	"archive/zip"
	"bytes"
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

	// Build 2D grid and headers
	grid := buildGrid(ss)
	headers := make([]string, len(ss.Columns))
	for i, c := range ss.Columns {
		if c.Title != "" {
			headers[i] = c.Title
		} else {
			headers[i] = c.Key
		}
	}

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, ss.Name))
		writer := csv.NewWriter(w)
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

	case "xlsx":
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.xlsx"`, ss.Name))
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		xlsxWriteFile(zw, "[Content_Types].xml", xlsxContentTypes())
		xlsxWriteFile(zw, "_rels/.rels", xlsxRels())
		xlsxWriteFile(zw, "xl/workbook.xml", xlsxWorkbook())
		xlsxWriteFile(zw, "xl/_rels/workbook.xml.rels", xlsxWorkbookRels())
		xlsxWriteFile(zw, "xl/styles.xml", xlsxStyles())
		xlsxWriteFile(zw, "xl/worksheets/sheet1.xml", ssXlsxSheet(headers, grid))
		zw.Close()
		w.Write(buf.Bytes())

	case "ods":
		w.Header().Set("Content-Type", "application/vnd.oasis.opendocument.spreadsheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.ods"`, ss.Name))
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		xlsxWriteFile(zw, "mimetype", "application/vnd.oasis.opendocument.spreadsheet")
		xlsxWriteFile(zw, "META-INF/manifest.xml", odsManifest())
		xlsxWriteFile(zw, "content.xml", odsContent(ss.Name, headers, grid))
		zw.Close()
		w.Write(buf.Bytes())

	case "rtf":
		w.Header().Set("Content-Type", "application/rtf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.rtf"`, ss.Name))
		w.Write([]byte(ssRTF(ss.Name, headers, grid)))

	case "pdf":
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pdf"`, ss.Name))
		w.Write(ssPDF(ss.Name, headers, grid))

	case "text", "txt":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.txt"`, ss.Name))
		w.Write([]byte(ssPlainText(ss.Name, headers, grid)))

	case "markdown", "md":
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.md"`, ss.Name))
		w.Write([]byte(ssMarkdown(ss.Name, headers, grid)))

	default:
		jsonError(w, "unsupported format", http.StatusBadRequest)
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

// ── XLSX sheet for spreadsheet export ─────────────────────────────────────────

func ssXlsxSheet(headers []string, grid [][]string) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	// Header row
	sb.WriteString(`<row r="1">`)
	for ci, h := range headers {
		sb.WriteString(xlsxCell(ci, 1, h, 1))
	}
	sb.WriteString(`</row>`)
	// Data rows
	for ri, row := range grid {
		sb.WriteString(fmt.Sprintf(`<row r="%d">`, ri+2))
		for ci, val := range row {
			if val != "" {
				sb.WriteString(xlsxCell(ci, ri+2, val, 0))
			}
		}
		sb.WriteString(`</row>`)
	}
	sb.WriteString(`</sheetData></worksheet>`)
	return sb.String()
}

// ── ODS helpers ───────────────────────────────────────────────────────────────

func odsManifest() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`
}

func odsContent(name string, headers []string, grid [][]string) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:spreadsheet>
<table:table table:name="` + xmlEsc(name) + `">`)
	// Header row
	sb.WriteString(`<table:table-row>`)
	for _, h := range headers {
		sb.WriteString(`<table:table-cell><text:p>` + xmlEsc(h) + `</text:p></table:table-cell>`)
	}
	sb.WriteString(`</table:table-row>`)
	// Data
	for _, row := range grid {
		sb.WriteString(`<table:table-row>`)
		for _, val := range row {
			sb.WriteString(`<table:table-cell><text:p>` + xmlEsc(val) + `</text:p></table:table-cell>`)
		}
		sb.WriteString(`</table:table-row>`)
	}
	sb.WriteString(`</table:table></office:spreadsheet></office:body></office:document-content>`)
	return sb.String()
}

// xmlEsc is in helpers.go — use that one

// ── RTF export ────────────────────────────────────────────────────────────────

func ssRTF(name string, headers []string, grid [][]string) string {
	var sb strings.Builder
	sb.WriteString(`{\rtf1\ansi\deff0{\fonttbl{\f0 Calibri;}}`)
	sb.WriteString(fmt.Sprintf(`\pard\b %s\b0\par\par`, rtfEsc(name)))
	// Table
	numCols := len(headers)
	cellW := 2000
	// Header row
	for i := 0; i < numCols; i++ {
		sb.WriteString(fmt.Sprintf(`\cellx%d`, (i+1)*cellW))
	}
	sb.WriteString(`\intbl`)
	for _, h := range headers {
		sb.WriteString(fmt.Sprintf(`\b %s\b0\cell`, rtfEsc(h)))
	}
	sb.WriteString(`\row`)
	// Data rows
	for _, row := range grid {
		for i := 0; i < numCols; i++ {
			sb.WriteString(fmt.Sprintf(`\cellx%d`, (i+1)*cellW))
		}
		sb.WriteString(`\intbl`)
		for ci := 0; ci < numCols; ci++ {
			val := ""
			if ci < len(row) {
				val = row[ci]
			}
			sb.WriteString(fmt.Sprintf(`%s\cell`, rtfEsc(val)))
		}
		sb.WriteString(`\row`)
	}
	sb.WriteString(`}`)
	return sb.String()
}

// rtfEsc is in handlers_diary.go — use that one

// ── PDF export (minimal valid PDF with table) ─────────────────────────────────

// ── Plain text export ─────────────────────────────────────────────────────────

func ssPlainText(name string, headers []string, grid [][]string) string {
	var sb strings.Builder
	sb.WriteString(name + "\n")
	sb.WriteString(strings.Repeat("=", len(name)) + "\n\n")
	// Calculate column widths
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range grid {
		for i, val := range row {
			if i < len(widths) && len(val) > widths[i] {
				widths[i] = len(val)
			}
		}
	}
	// Cap widths
	for i := range widths {
		if widths[i] > 30 {
			widths[i] = 30
		}
		if widths[i] < 3 {
			widths[i] = 3
		}
	}
	// Header
	for i, h := range headers {
		sb.WriteString(fmt.Sprintf("%-*s", widths[i]+2, h))
	}
	sb.WriteString("\n")
	for i := range headers {
		sb.WriteString(strings.Repeat("-", widths[i]) + "  ")
	}
	sb.WriteString("\n")
	// Rows
	for _, row := range grid {
		hasData := false
		for _, v := range row {
			if v != "" {
				hasData = true
				break
			}
		}
		if !hasData {
			continue
		}
		for i, val := range row {
			if i < len(widths) {
				if len(val) > widths[i] {
					val = val[:widths[i]-1] + "\u2026"
				}
				sb.WriteString(fmt.Sprintf("%-*s", widths[i]+2, val))
			}
		}
		sb.WriteString("\n")
	}
	return sb.String()
}

// ── Markdown export ───────────────────────────────────────────────────────────

func ssMarkdown(name string, headers []string, grid [][]string) string {
	var sb strings.Builder
	sb.WriteString("# " + name + "\n\n")
	// Header row
	sb.WriteString("|")
	for _, h := range headers {
		sb.WriteString(" " + h + " |")
	}
	sb.WriteString("\n|")
	for range headers {
		sb.WriteString("---|")
	}
	sb.WriteString("\n")
	// Data rows
	for _, row := range grid {
		hasData := false
		for _, v := range row {
			if v != "" {
				hasData = true
				break
			}
		}
		if !hasData {
			continue
		}
		sb.WriteString("|")
		for _, val := range row {
			sb.WriteString(" " + val + " |")
		}
		sb.WriteString("\n")
	}
	return sb.String()
}

func ssPDF(name string, headers []string, grid [][]string) []byte {
	var sb strings.Builder
	// Build text content
	sb.WriteString(fmt.Sprintf("%s\n\n", name))
	// Header line
	for i, h := range headers {
		if i > 0 {
			sb.WriteString("\t")
		}
		sb.WriteString(h)
	}
	sb.WriteString("\n")
	for i := 0; i < len(headers)*12; i++ {
		sb.WriteString("-")
	}
	sb.WriteString("\n")
	// Data
	for _, row := range grid {
		hasData := false
		for _, v := range row {
			if v != "" {
				hasData = true
				break
			}
		}
		if !hasData {
			continue
		}
		for ci, val := range row {
			if ci > 0 {
				sb.WriteString("\t")
			}
			sb.WriteString(val)
		}
		sb.WriteString("\n")
	}
	content := sb.String()
	// Escape PDF special chars
	content = strings.ReplaceAll(content, `\`, `\\`)
	content = strings.ReplaceAll(content, `(`, `\(`)
	content = strings.ReplaceAll(content, `)`, `\)`)

	// Build minimal PDF
	var pdf bytes.Buffer
	pdf.WriteString("%PDF-1.4\n")
	// Object 1: Catalog
	obj1Off := pdf.Len()
	pdf.WriteString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
	// Object 2: Pages
	obj2Off := pdf.Len()
	pdf.WriteString("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
	// Object 3: Page
	obj3Off := pdf.Len()
	pdf.WriteString("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n")
	// Object 4: Content stream
	stream := fmt.Sprintf("BT /F1 9 Tf 50 560 Td (%s) Tj ET", content)
	obj4Off := pdf.Len()
	pdf.WriteString(fmt.Sprintf("4 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n", len(stream), stream))
	// Object 5: Font
	obj5Off := pdf.Len()
	pdf.WriteString("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n")
	// Xref
	xrefOff := pdf.Len()
	pdf.WriteString("xref\n0 6\n")
	pdf.WriteString("0000000000 65535 f \n")
	pdf.WriteString(fmt.Sprintf("%010d 00000 n \n", obj1Off))
	pdf.WriteString(fmt.Sprintf("%010d 00000 n \n", obj2Off))
	pdf.WriteString(fmt.Sprintf("%010d 00000 n \n", obj3Off))
	pdf.WriteString(fmt.Sprintf("%010d 00000 n \n", obj4Off))
	pdf.WriteString(fmt.Sprintf("%010d 00000 n \n", obj5Off))
	pdf.WriteString(fmt.Sprintf("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", xrefOff))
	return pdf.Bytes()
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
