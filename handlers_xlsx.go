package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ── XLSX Export ────────────────────────────────────────────────────────────────

// handleExportXLSX exports events as an Excel XLSX file.
// XLSX is a ZIP archive containing XML files; we build it directly without
// any external library using the archive/zip package (already imported).
func (app *App) handleExportXLSX(w http.ResponseWriter, r *http.Request, user *User) {
	from := time.Now().Add(-365 * 24 * time.Hour)
	to := time.Now().Add(365 * 24 * time.Hour)
	if q := r.URL.Query().Get("from"); q != "" {
		if t, err := time.Parse(time.RFC3339, q); err == nil {
			from = t
		}
	}
	if q := r.URL.Query().Get("to"); q != "" {
		if t, err := time.Parse(time.RFC3339, q); err == nil {
			to = t
		}
	}
	events := app.store.GetEvents(from, to, nil)

	// Fetch comments for each event
	commentsMap := make(map[int64][]EventComment)
	for _, ev := range events {
		comments := app.store.GetCommentsByEvent(ev.ID)
		if len(comments) > 0 {
			commentsMap[ev.ID] = comments
		}
	}

	// Build the XLSX in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// Required XLSX files
	xlsxWriteFile(zw, "[Content_Types].xml", xlsxContentTypes())
	xlsxWriteFile(zw, "_rels/.rels", xlsxRels())
	xlsxWriteFile(zw, "xl/workbook.xml", xlsxWorkbook())
	xlsxWriteFile(zw, "xl/_rels/workbook.xml.rels", xlsxWorkbookRels())
	xlsxWriteFile(zw, "xl/styles.xml", xlsxStyles())
	xlsxWriteFile(zw, "xl/worksheets/sheet1.xml", xlsxSheet(events, commentsMap))

	zw.Close()

	app.audit(user.ID, user.DisplayName, "exported", "data", 0, "Exported XLSX")
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-export-%s.xlsx"`, time.Now().Format("2006-01-02T150405")))
	w.Write(buf.Bytes()) //nolint
}

func xlsxWriteFile(zw *zip.Writer, name, content string) {
	f, _ := zw.Create(name)
	f.Write([]byte(content)) //nolint
}

func xlsxContentTypes() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
}

func xlsxRels() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
}

func xlsxWorkbook() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Events" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
}

func xlsxWorkbookRels() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

func xlsxStyles() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>
  <borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`
}

// xlsxEsc escapes a string for use in XML cell values.
func xlsxEsc(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	// Remove control characters that are invalid in XML 1.0
	var b strings.Builder
	for _, r := range s {
		if r == 0x09 || r == 0x0A || r == 0x0D || (r >= 0x20 && r != 0xFFFE && r != 0xFFFF) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func xlsxCell(col, row int, value string, styleIdx int) string {
	// Convert col index to letter (A, B, C, …)
	colLetter := string(rune('A' + col))
	if col >= 26 {
		colLetter = string(rune('A'+col/26-1)) + string(rune('A'+col%26))
	}
	ref := fmt.Sprintf("%s%d", colLetter, row)
	return fmt.Sprintf(`<c r="%s" t="inlineStr" s="%d"><is><t>%s</t></is></c>`, ref, styleIdx, xlsxEsc(value))
}

func xlsxSheet(events []Event, commentsMap map[int64][]EventComment) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>`)

	headers := []string{"ID", "Title", "Type", "Status", "Start", "End", "All Day", "Description", "Created By", "Location", "Address", "Comments"}
	sb.WriteString(`<row r="1">`)
	for i, h := range headers {
		sb.WriteString(xlsxCell(i, 1, h, 1))
	}
	sb.WriteString(`</row>`)

	for rowIdx, ev := range events {
		r := rowIdx + 2
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		allDay := ""
		if ev.AllDay {
			allDay = "Yes"
		}
		// Build comments cell
		commentText := ""
		if comments, ok := commentsMap[ev.ID]; ok {
			parts := make([]string, 0, len(comments))
			for _, c := range comments {
				parts = append(parts, fmt.Sprintf("[%s %s] %s", c.AuthorName, c.CreatedAt.Format("2006-01-02 15:04"), c.Content))
			}
			commentText = strings.Join(parts, " | ")
		}
		cells := []string{
			fmt.Sprintf("%d", ev.ID),
			ev.Title,
			ev.EventType,
			string(ev.Status),
			ev.StartTime.Format("2006-01-02 15:04"),
			end,
			allDay,
			ev.Description,
			ev.CreatedByName,
			ev.PhysicalLocation,
			ev.LocationAddress,
			commentText,
		}
		sb.WriteString(fmt.Sprintf(`<row r="%d">`, r))
		for i, val := range cells {
			sb.WriteString(xlsxCell(i, r, val, 0))
		}
		sb.WriteString(`</row>`)
	}

	sb.WriteString(`</sheetData></worksheet>`)
	return sb.String()
}
