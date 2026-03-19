package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ── Report Download Handler ────────────────────────────────────────────────────

// handleReportDownload serves an on-demand report in the requested format.
// Query params: type=<report_type>, format=excel|rtf|docx|html|csv
func (app *App) handleReportDownload(w http.ResponseWriter, r *http.Request, user *User) {
	q := r.URL.Query()
	reportType := q.Get("type")
	if reportType == "" {
		reportType = "timeline"
	}
	format := strings.ToLower(q.Get("format"))
	if format == "" {
		format = "html"
	}

	from := time.Now().Add(-30 * 24 * time.Hour)
	to := time.Now().Add(30 * 24 * time.Hour)
	if qf := q.Get("from"); qf != "" {
		if t, err := time.Parse(time.RFC3339, qf); err == nil {
			from = t
		}
	}
	if qt := q.Get("to"); qt != "" {
		if t, err := time.Parse(time.RFC3339, qt); err == nil {
			to = t
		}
	}

	// V3-H02 fix: filter events by layer visibility
	events := filterVisibleEvents(app.store.GetEvents(from, to, nil), app.visibleLayerSet(user))
	commentsMap := make(map[int64][]EventComment)
	for _, ev := range events {
		if cs := app.store.GetCommentsByEvent(ev.ID); len(cs) > 0 {
			commentsMap[ev.ID] = cs
		}
	}
	title := fmt.Sprintf("%s Report — %s", reportType, time.Now().Format("2006-01-02"))

	switch format {
	case "excel", "xlsx":
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.xlsx\"", reportType))
		buildReportXLSXWriter(w, title, events)
	case "rtf":
		w.Header().Set("Content-Type", "application/rtf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.rtf\"", reportType))
		w.Write(buildAutoReportRTF(title, events, commentsMap)) //nolint
	case "docx":
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.docx\"", reportType))
		buildReportDOCXWriter(w, title, events, commentsMap)
	default: // html
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"report-%s.html\"", reportType))
		w.Write([]byte(buildAutoReportHTML(reportType, events, commentsMap))) //nolint
	}
}

// ── Auto-Report Schedule Handlers ─────────────────────────────────────────────

func (app *App) handleListAutoReportSchedules(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetAutoReportSchedules())
}

func (app *App) handleCreateAutoReportSchedule(w http.ResponseWriter, r *http.Request, user *User) {
	var sched AutoReportSchedule
	if err := decode(r, &sched); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	sched.CreatedBy = user.ID
	// Validate webhook URL when delivery is webhook (SSRF protection)
	if sched.Delivery == "webhook" && sched.Recipient != "" {
		if err := validateWebhookURL(sched.Recipient); err != nil {
			jsonError(w, "invalid webhook URL: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	sched.NextRun = calcNextRun(sched.Frequency, time.Now())
	created, err := app.store.CreateAutoReportSchedule(sched)
	if err != nil {
		jsonError(w, "failed to create schedule", http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "created", "auto_report_schedule", created.ID,
		fmt.Sprintf("Auto-report schedule created: %s %s → %s", created.ReportType, created.Frequency, created.Delivery))
	jsonOK(w, created)
}

func (app *App) handleDeleteAutoReportSchedule(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "missing id", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := app.store.DeleteAutoReportSchedule(id); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	app.audit(user.ID, user.DisplayName, "deleted", "auto_report_schedule", id, "Auto-report schedule removed")
	jsonOK(w, map[string]string{"status": "ok"})
}

func calcNextRun(frequency string, from time.Time) time.Time {
	switch frequency {
	case "hourly":
		return from.Add(time.Hour)
	case "weekly":
		return from.Add(7 * 24 * time.Hour)
	default: // daily
		return from.Add(24 * time.Hour)
	}
}

// startAutoReportScheduler runs a background goroutine that fires scheduled reports
func (app *App) startAutoReportScheduler() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			app.runDueAutoReports()
		}
	}()
}

func (app *App) runDueAutoReports() {
	now := time.Now()
	schedules := app.store.GetAutoReportSchedules()
	for _, s := range schedules {
		if !s.Enabled || s.NextRun.After(now) {
			continue
		}
		// Deliver the report
		if s.Delivery == "email" && s.Recipient != "" {
			app.sendAutoReportEmail(s)
		}
		// Update last run and next run
		s.LastRun = &now
		s.NextRun = calcNextRun(s.Frequency, now)
		app.store.UpdateAutoReportSchedule(s) //nolint
	}
}

func (app *App) sendAutoReportEmail(s AutoReportSchedule) {
	cfg := app.store.GetMailConfig()
	if !cfg.Enabled || cfg.SMTPHost == "" {
		log.Printf("Auto-report: mail not configured, skipping schedule %d", s.ID)
		return
	}
	now2 := time.Now()
	allEvs := app.store.GetEvents(now2.Add(-30*24*time.Hour), now2.Add(30*24*time.Hour), nil)
	// V3-H02 fix: filter by the report creator's layer visibility
	var events []Event
	if creator, ok := app.store.GetUserByID(s.CreatedBy); ok {
		events = filterVisibleEvents(allEvs, app.visibleLayerSet(creator))
	} else {
		events = allEvs // fallback if creator deleted — admin-level access
	}
	subject := fmt.Sprintf("Auto %s Report — %s", s.ReportType, time.Now().Format("2006-01-02"))
	// Build comments map for report
	commentsMap := make(map[int64][]EventComment)
	for _, ev := range events {
		comments := app.store.GetCommentsByEvent(ev.ID)
		if len(comments) > 0 {
			commentsMap[ev.ID] = comments
		}
	}

	format := strings.ToLower(s.Format)
	if format == "" {
		format = "html"
	}

	var err error
	switch format {
	case "excel", "xlsx":
		var buf bytes.Buffer
		buildReportXLSXWriter(&buf, subject, events)
		err = app.sendMailWithAttachment(cfg, s.Recipient, subject,
			"<p>Please find the report attached as an Excel file.</p>",
			buf.Bytes(), fmt.Sprintf("report-%s.xlsx", s.ReportType),
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	case "rtf":
		data := buildAutoReportRTF(subject, events, commentsMap)
		err = app.sendMailWithAttachment(cfg, s.Recipient, subject,
			"<p>Please find the report attached as an RTF file.</p>",
			data, fmt.Sprintf("report-%s.rtf", s.ReportType), "application/rtf")
	case "docx":
		var buf bytes.Buffer
		buildReportDOCXWriter(&buf, subject, events, commentsMap)
		err = app.sendMailWithAttachment(cfg, s.Recipient, subject,
			"<p>Please find the report attached as a Word document.</p>",
			buf.Bytes(), fmt.Sprintf("report-%s.docx", s.ReportType),
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	default: // html
		html := buildAutoReportHTML(s.ReportType, events, commentsMap)
		err = app.sendMail(cfg, s.Recipient, subject, html)
	}

	if err != nil {
		log.Printf("Auto-report: failed to send email for schedule %d: %v", s.ID, err)
	} else {
		log.Printf("Auto-report: sent %s report (%s) to %s (schedule %d)", s.ReportType, format, s.Recipient, s.ID)
	}
}

func buildAutoReportHTML(reportType string, events []Event, commentsMap map[int64][]EventComment) string {
	title := fmt.Sprintf("Auto %s Report — %s", reportType, time.Now().Format("2006-01-02 15:04"))
	rows := ""
	for _, ev := range events {
		start := ev.StartTime.Format("2006-01-02 15:04")
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		// Build comments cell
		commentHTML := ""
		if comments, ok := commentsMap[ev.ID]; ok && len(comments) > 0 {
			for _, c := range comments {
				commentHTML += fmt.Sprintf(`<div style="margin-bottom:4px"><span style="color:#666;font-size:11px">%s — %s</span><br>%s</div>`,
					htmlEscape(c.AuthorName), c.CreatedAt.Format("2006-01-02 15:04"), htmlEscape(c.Content))
			}
		}
		rows += fmt.Sprintf("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
			htmlEscape(ev.Title), htmlEscape(ev.EventType), htmlEscape(string(ev.Status)), start, end, commentHTML)
	}
	return fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>%s</title>
<style>body{font-family:sans-serif;margin:32px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%%;font-size:13px}th,td{border:1px solid #ccc;padding:6px 10px;vertical-align:top}th{background:#f0f0f0}</style></head><body>
<h1>%s</h1><p style="color:#666;font-size:13px">Auto-generated: %s</p>
<table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Comments</th></tr></thead><tbody>%s</tbody></table>
</body></html>`, htmlEscape(title), htmlEscape(title), time.Now().Format("2006-01-02 15:04:05"), rows)
}

// ── Report format builders ────────────────────────────────────────────────────

// buildReportXLSXWriter writes an XLSX report to w using the existing xlsx helpers.
func buildReportXLSXWriter(w io.Writer, title string, events []Event) {
	zw := zip.NewWriter(w)
	xlsxWriteFile(zw, "[Content_Types].xml", xlsxContentTypes())
	xlsxWriteFile(zw, "_rels/.rels", xlsxRels())
	xlsxWriteFile(zw, "xl/workbook.xml", xlsxWorkbook())
	xlsxWriteFile(zw, "xl/_rels/workbook.xml.rels", xlsxWorkbookRels())
	xlsxWriteFile(zw, "xl/styles.xml", xlsxStyles())
	xlsxWriteFile(zw, "xl/worksheets/sheet1.xml", xlsxSheet(events, nil))
	zw.Close() //nolint
}

// buildAutoReportRTF builds an RTF document for the given events.
// RTF is a plain-text format that any word processor can open.
func buildAutoReportRTF(title string, events []Event, commentsMap map[int64][]EventComment) []byte {
	rtfEsc := func(s string) string {
		var b strings.Builder
		for _, r := range s {
			switch {
			case r == '\\':
				b.WriteString(`\\`)
			case r == '{':
				b.WriteString(`\{`)
			case r == '}':
				b.WriteString(`\}`)
			case r > 127:
				b.WriteString(fmt.Sprintf(`\u%d?`, r))
			default:
				b.WriteRune(r)
			}
		}
		return b.String()
	}

	var b strings.Builder
	b.WriteString(`{\rtf1\ansi\deff0`)
	b.WriteString(`{\fonttbl{\f0\froman\fcharset0 Times New Roman;}{\f1\fswiss\fcharset0 Arial;}}`)
	b.WriteString(`{\colortbl;\red0\green0\blue0;\red100\green100\blue100;\red0\green70\blue150;}`)
	b.WriteString("\n")

	// Title
	b.WriteString(fmt.Sprintf(`\f1\fs28\b\cf3 %s\b0\cf1\fs22\par`, rtfEsc(title)))
	b.WriteString(fmt.Sprintf(`\f0\fs18\cf2 Generated: %s\cf1\par\par`, time.Now().Format("2006-01-02 15:04:05")))

	// Table header (simulated with tabs)
	b.WriteString(`\f1\fs20\b Title\tab Type\tab Status\tab Start\tab End\b0\par`)
	b.WriteString(`\brdrb\brdrs\brdrw10 `)

	for _, ev := range events {
		start := ev.StartTime.Format("2006-01-02 15:04")
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		b.WriteString(fmt.Sprintf(`\f0\fs18 %s\tab %s\tab %s\tab %s\tab %s\par`,
			rtfEsc(ev.Title), rtfEsc(ev.EventType), rtfEsc(string(ev.Status)), rtfEsc(start), rtfEsc(end)))
		if comments, ok := commentsMap[ev.ID]; ok {
			for _, c := range comments {
				b.WriteString(fmt.Sprintf(`\cf2\fs16   [%s] %s: %s\cf1\fs18\par`,
					rtfEsc(c.CreatedAt.Format("2006-01-02 15:04")), rtfEsc(c.AuthorName), rtfEsc(c.Content)))
			}
		}
	}
	b.WriteString("}")
	return []byte(b.String())
}

// buildReportDOCXWriter writes a DOCX document to w.
// DOCX is an Office Open XML ZIP archive with XML parts.
func buildReportDOCXWriter(w io.Writer, title string, events []Event, commentsMap map[int64][]EventComment) {
	docxEsc := func(s string) string {
		s = strings.ReplaceAll(s, "&", "&amp;")
		s = strings.ReplaceAll(s, "<", "&lt;")
		s = strings.ReplaceAll(s, ">", "&gt;")
		s = strings.ReplaceAll(s, `"`, "&quot;")
		return s
	}

	// Build document.xml body
	var body strings.Builder
	body.WriteString(fmt.Sprintf(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>%s</w:t></w:r></w:p>`, docxEsc(title)))
	body.WriteString(fmt.Sprintf(`<w:p><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>Generated: %s</w:t></w:r></w:p>`,
		time.Now().Format("2006-01-02 15:04:05")))

	// Table
	body.WriteString(`<w:tbl>`)
	body.WriteString(`<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>`)
	body.WriteString(`<w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>`)

	// Header row
	hdrCell := func(text string) string {
		return fmt.Sprintf(`<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E1F2"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>%s</w:t></w:r></w:p></w:tc>`, docxEsc(text))
	}
	body.WriteString(`<w:tr>`)
	for _, h := range []string{"Title", "Type", "Status", "Start", "End"} {
		body.WriteString(hdrCell(h))
	}
	body.WriteString(`</w:tr>`)

	for _, ev := range events {
		start := ev.StartTime.Format("2006-01-02 15:04")
		end := ""
		if ev.EndTime != nil {
			end = ev.EndTime.Format("2006-01-02 15:04")
		}
		cell := func(text string) string {
			return fmt.Sprintf(`<w:tc><w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>`, docxEsc(text))
		}
		body.WriteString(`<w:tr>`)
		body.WriteString(cell(ev.Title))
		body.WriteString(cell(ev.EventType))
		body.WriteString(cell(string(ev.Status)))
		body.WriteString(cell(start))
		body.WriteString(cell(end))
		body.WriteString(`</w:tr>`)

		// Comments as extra rows
		if comments, ok := commentsMap[ev.ID]; ok {
			for _, c := range comments {
				commentText := fmt.Sprintf("[%s] %s: %s", c.CreatedAt.Format("2006-01-02 15:04"), c.AuthorName, c.Content)
				body.WriteString(fmt.Sprintf(`<w:tr><w:tc><w:tcPr><w:gridSpan w:val="5"/></w:tcPr><w:p><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">  %s</w:t></w:r></w:p></w:tc></w:tr>`, docxEsc(commentText)))
			}
		}
	}
	body.WriteString(`</w:tbl>`)

	documentXML := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
<w:body>%s<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>
</w:document>`, body.String())

	stylesXML := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="003366"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:color="auto"/>
    </w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`

	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

	relsRoot := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

	wordRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

	zw := zip.NewWriter(w)
	for _, part := range []struct{ name, content string }{
		{"[Content_Types].xml", contentTypes},
		{"_rels/.rels", relsRoot},
		{"word/document.xml", documentXML},
		{"word/styles.xml", stylesXML},
		{"word/_rels/document.xml.rels", wordRels},
	} {
		f, _ := zw.Create(part.name)
		f.Write([]byte(part.content)) //nolint
	}
	zw.Close() //nolint
}
