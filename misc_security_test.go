package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestSafeJoinFilename pins the shared path-traversal choke-point used by
// every filesystem sink. If this test fails, an attacker-controlled
// filename can escape its intended directory somewhere in the codebase.
func TestSafeJoinFilename(t *testing.T) {
	dir := t.TempDir()

	cases := []struct {
		name     string
		filename string
		wantOK   bool
	}{
		{"empty rejected", "", false},
		{"dot rejected", ".", false},
		{"dotdot rejected", "..", false},
		{"traversal forward", "../../etc/passwd", false},
		{"traversal back", `..\..\windows\win.ini`, false},
		{"nested subdir", "sub/file.pdf", false},
		{"leading slash", "/etc/passwd", false},
		{"leading dotslash", "./file.pdf", false},
		{"plain basename accepted", "report.pdf", true},
		{"timestamped basename", "1744400000000000000_report.pdf", true},
		{"unicode basename", "rapport_æøå.pdf", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			full, ok := safeJoinFilename(dir, tc.filename)
			if ok != tc.wantOK {
				t.Errorf("safeJoinFilename(dir, %q) ok=%v, want %v", tc.filename, ok, tc.wantOK)
			}
			if ok {
				// When accepted, full path must live under dir.
				absDir, _ := filepath.Abs(dir)
				absFull, _ := filepath.Abs(full)
				if !strings.HasPrefix(absFull, absDir+string(filepath.Separator)) {
					t.Errorf("accepted path %q escaped dir %q", full, dir)
				}
			}
		})
	}

	// Empty dir is always rejected even with a valid filename.
	if _, ok := safeJoinFilename("", "ok.pdf"); ok {
		t.Errorf("safeJoinFilename with empty dir should be rejected")
	}
}

// TestSanitizeSyslogMessage verifies log-forging protection. The classic
// RFC 3164 formatter appends "\n" to delimit records, so any "\n" that
// survives from attacker-controlled input (e.g. an event title) lets the
// attacker inject a fake record.
func TestSanitizeSyslogMessage(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"normal message", "normal message"},
		{"with tab\there", "with tab\there"}, // tabs preserved
		{"a\nb", "a b"},
		{"a\r\nb", "a  b"}, // each control char becomes a space
		{"a\rb", "a b"},
		{"null\x00byte", "null byte"},
		{"bell\x07", "bell "},
		{"del\x7f", "del "},
		{
			in:   "event: Normal\n<34>Jan 1 00:00:00 host tidslinjal: FAKE root login from 1.2.3.4",
			want: "event: Normal <34>Jan 1 00:00:00 host tidslinjal: FAKE root login from 1.2.3.4",
		},
	}
	for _, tc := range cases {
		got := sanitizeSyslogMessage(tc.in)
		if got != tc.want {
			t.Errorf("sanitizeSyslogMessage(%q) = %q, want %q", tc.in, got, tc.want)
		}
		// Absolute invariant: no CR or LF may ever survive.
		if strings.ContainsAny(got, "\r\n") {
			t.Errorf("sanitizeSyslogMessage(%q) left CR/LF in output %q", tc.in, got)
		}
	}
}

// TestValidateAutoReportEmail verifies that auto-report email recipients
// cannot be used to turn the instance into a spam relay, and that header
// injection is blocked.
func TestValidateAutoReportEmail(t *testing.T) {
	// Accept valid addresses with no allowlist.
	good := []string{
		"alice@example.com",
		"bob+tag@example.org",
		"Alice <alice@example.com>",
	}
	for _, e := range good {
		if err := validateAutoReportEmail(e, nil); err != nil {
			t.Errorf("validateAutoReportEmail(%q) unexpected error: %v", e, err)
		}
	}

	// Reject malformed / injection attempts.
	bad := []string{
		"",
		"not-an-email",
		"foo@",
		"@bar",
		"alice@example.com\r\nBcc: victim@evil.tld",
		"alice@example.com\nBcc: victim@evil.tld",
	}
	for _, e := range bad {
		if err := validateAutoReportEmail(e, nil); err == nil {
			t.Errorf("validateAutoReportEmail(%q) should have failed", e)
		}
	}

	// Domain allowlist enforced.
	allow := []string{"example.com", "Mil.Example.Org"}
	if err := validateAutoReportEmail("alice@example.com", allow); err != nil {
		t.Errorf("allowlisted domain rejected: %v", err)
	}
	if err := validateAutoReportEmail("alice@MIL.EXAMPLE.ORG", allow); err != nil {
		t.Errorf("allowlisted domain (case-insensitive) rejected: %v", err)
	}
	if err := validateAutoReportEmail("alice@evil.tld", allow); err == nil {
		t.Errorf("non-allowlisted domain should have been rejected")
	}
}
