package main

import (
	"fmt"
	"sort"
	"strings"
)

var _xmlReplacer = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")

func xmlEsc(s string) string { return _xmlReplacer.Replace(s) }

// stripHTMLTags removes HTML/script tags from user input to prevent stored XSS.
// It strips anything that looks like an HTML tag (<...>) including script tags.
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
	return strings.TrimSpace(result.String())
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

func xmlEscape(s string) string {
	return strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
		"'", "&apos;",
	).Replace(s)
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
