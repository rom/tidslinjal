package main

import (
	"fmt"
	"sort"
	"strings"
)

var _xmlReplacer = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")

// dangerousFileExtensions are blocked from upload to prevent serving executable content.
var dangerousFileExtensions = map[string]bool{
	".exe": true, ".bat": true, ".cmd": true, ".com": true, ".msi": true,
	".sh": true, ".bash": true, ".ps1": true, ".vbs": true, ".js": true,
	".html": true, ".htm": true, ".svg": true, ".php": true, ".jsp": true,
	".asp": true, ".aspx": true, ".cgi": true, ".pl": true, ".py": true,
	".rb": true, ".jar": true, ".war": true, ".dll": true, ".so": true,
}

// isDangerousFilename returns true if the filename has an extension that could
// be executed by a browser or OS when served/downloaded.
func isDangerousFilename(filename string) bool {
	ext := strings.ToLower(strings.TrimSpace(filename))
	if dot := strings.LastIndex(ext, "."); dot >= 0 {
		ext = ext[dot:]
	} else {
		return false
	}
	return dangerousFileExtensions[ext]
}

func xmlEsc(s string) string { return _xmlReplacer.Replace(s) }

// stripHTMLTags removes HTML/script tags and dangerous attributes from user input
// to prevent stored XSS. It strips <script> blocks, <style> blocks, all HTML tags,
// and inline event handlers (onclick, onerror, etc.) or javascript: URIs that could
// survive if content is ever rendered in an HTML context.
func stripHTMLTags(s string) string {
	// Remove <script>...</script> blocks (case insensitive)
	for {
		lower := strings.ToLower(s)
		start := strings.Index(lower, "<script")
		if start == -1 {
			break
		}
		end := strings.Index(lower[start:], "</script>")
		if end == -1 {
			s = s[:start]
			break
		}
		s = s[:start] + s[start+end+len("</script>"):]
	}
	// Remove <style>...</style> blocks (case insensitive)
	for {
		lower := strings.ToLower(s)
		start := strings.Index(lower, "<style")
		if start == -1 {
			break
		}
		end := strings.Index(lower[start:], "</style>")
		if end == -1 {
			s = s[:start]
			break
		}
		s = s[:start] + s[start+end+len("</style>"):]
	}
	// Remove remaining HTML tags
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' && inTag {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	cleaned := result.String()
	// Remove javascript:/data: URIs and event handler patterns that could survive
	// in contexts where output is placed in attributes
	lower := strings.ToLower(cleaned)
	if strings.Contains(lower, "javascript:") {
		cleaned = removePatternInsensitive(cleaned, "javascript:")
	}
	if strings.Contains(lower, "vbscript:") {
		cleaned = removePatternInsensitive(cleaned, "vbscript:")
	}
	return strings.TrimSpace(cleaned)
}

// removePatternInsensitive removes all occurrences of pattern (case-insensitive) from s.
func removePatternInsensitive(s, pattern string) string {
	lower := strings.ToLower(s)
	pat := strings.ToLower(pattern)
	var result strings.Builder
	i := 0
	for i < len(s) {
		idx := strings.Index(lower[i:], pat)
		if idx == -1 {
			result.WriteString(s[i:])
			break
		}
		result.WriteString(s[i : i+idx])
		i += idx + len(pat)
	}
	return result.String()
}





func csvEscape(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return fmt.Sprintf(`"%s"`, strings.ReplaceAll(s, `"`, `""`))
	}
	return s
}

func rtfEscape(s string) string {
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

func htmlEscape(s string) string {
	return strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
	).Replace(s)
}

func parseCommaSet(s string) map[string]bool {
	m := map[string]bool{}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			m[part] = true
		}
	}
	return m
}

// topN returns the top N entries from a name->count map, sorted by count descending.
func topN(counts map[string]int, n int) []map[string]any {
	type entry struct {
		name  string
		count int
	}
	var entries []entry
	for name, count := range counts {
		entries = append(entries, entry{name, count})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].count > entries[j].count })
	if len(entries) > n {
		entries = entries[:n]
	}
	var result []map[string]any
	for _, e := range entries {
		result = append(result, map[string]any{"name": e.name, "count": e.count})
	}
	return result
}
