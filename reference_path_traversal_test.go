package main

import (
	"testing"
)

// TestSafeReferenceFilePath verifies the path-traversal choke-point used by
// every disk operation on reference documents. A stored Filename could
// historically be set to user-controlled content via CreateReferenceLink
// ("local" ref type). This test nails down the defensive helper so that
// future refactors cannot reintroduce arbitrary file read/write/delete.
func TestSafeReferenceFilePath(t *testing.T) {
	app, _ := newTestApp(t)

	cases := []struct {
		name     string
		filename string
		wantOK   bool
	}{
		{"empty rejected", "", false},
		{"dot rejected", ".", false},
		{"dotdot rejected", "..", false},
		{"forward traversal rejected", "../../etc/passwd", false},
		{"backslash traversal rejected", `..\..\windows\win.ini`, false},
		{"absolute path rejected", "/etc/passwd", false},
		{"nested path rejected", "subdir/file.pdf", false},
		{"tricky ./ prefix rejected", "./file.pdf", false},
		{"plain basename accepted", "report.pdf", true},
		{"timestamped basename accepted", "1744400000000000000_report.pdf", true},
		{"unicode basename accepted", "rapport_æøå.pdf", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, ok := app.safeReferenceFilePath(tc.filename)
			if ok != tc.wantOK {
				t.Errorf("safeReferenceFilePath(%q) ok=%v, want %v", tc.filename, ok, tc.wantOK)
			}
		})
	}
}

// TestCreateReferenceLinkDoesNotStoreFilename ensures the root-cause fix —
// CreateReferenceLink used to write user content into the Filename field,
// which then flowed into filepath.Join(ReferenceDir, rd.Filename) at the
// download/delete/checksum sinks. Any record that comes out of that
// constructor must have an empty Filename so the download handler falls
// through to the URL / Content branches instead of touching the filesystem.
func TestCreateReferenceLinkDoesNotStoreFilename(t *testing.T) {
	app, _ := newTestApp(t)

	rd := app.store.CreateReferenceLink(
		"evil", "desc", "other", "",
		"local",
		"", // URL
		"../../../etc/motd",
		1, "tester",
	)
	if rd.Filename != "" {
		t.Errorf("CreateReferenceLink stored user content in Filename: %q", rd.Filename)
	}
	if rd.Content != "../../../etc/motd" {
		t.Errorf("CreateReferenceLink dropped Content: got %q", rd.Content)
	}

	// URL refs must also leave Filename empty.
	rd2 := app.store.CreateReferenceLink(
		"link", "desc", "other", "",
		"url",
		"https://example.invalid/",
		"",
		1, "tester",
	)
	if rd2.Filename != "" {
		t.Errorf("CreateReferenceLink(url) stored URL in Filename: %q", rd2.Filename)
	}
}

// TestSafeAttachmentPath mirrors the reference test for the room-image
// attachment directory. Room.ImageName came from a full-struct JSON decode
// in handleSaveRoom, so a client could inject a traversal string that then
// flowed into http.ServeFile / os.Remove on AttachmentDir.
func TestSafeAttachmentPath(t *testing.T) {
	app, _ := newTestApp(t)

	if _, ok := app.safeAttachmentPath("../../../etc/passwd"); ok {
		t.Errorf("safeAttachmentPath allowed traversal")
	}
	if _, ok := app.safeAttachmentPath(""); ok {
		t.Errorf("safeAttachmentPath allowed empty filename")
	}
	if _, ok := app.safeAttachmentPath("room_1_1744400000000000000.jpg"); !ok {
		t.Errorf("safeAttachmentPath rejected valid filename")
	}
}
