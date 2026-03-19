package main

import (
	"archive/zip"
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/pbkdf2"
)

// ── Gradual Backup ──────────────────────────────────────────────────────────────

// runGradualBackupScheduler runs in a background goroutine, waking every minute
// to check whether it is time to create a new automatic snapshot.
func (app *App) runGradualBackupScheduler() {
	// Track when the last snapshot was taken so we fire at the correct cadence
	// even if the ticker is slightly late.
	var lastSnap time.Time
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-app.stopCh:
			return
		case <-ticker.C:
		}
		cfg := app.store.GetGradualBackupSettings()
		if !cfg.Enabled {
			continue
		}
		interval := time.Duration(cfg.IntervalMinutes) * time.Minute
		if time.Since(lastSnap) < interval {
			continue
		}
		filename, err := app.store.CreateGradualBackupSnapshot()
		if err != nil {
			log.Printf("[WARN] gradual backup snapshot failed: %v", err)
			continue
		}
		logVerbose("[gradual-backup] snapshot created: %s", filename)
		lastSnap = time.Now()
		// Prune old snapshots
		if err := app.store.PruneGradualBackupSnapshots(cfg.MaxSnapshots); err != nil {
			log.Printf("[WARN] gradual backup prune failed: %v", err)
		}
	}
}

// handleGradualBackupSettings handles GET and PUT for /api/admin/gradual-backup
func (app *App) handleGradualBackupSettings(w http.ResponseWriter, r *http.Request, user *User) {
	switch r.Method {
	case http.MethodGet:
		cfg := app.store.GetGradualBackupSettings()
		snapshots, _ := app.store.ListGradualBackupSnapshots()
		if snapshots == nil {
			snapshots = []GradualBackupSnapshot{}
		}
		jsonOK(w, map[string]interface{}{
			"settings":  cfg,
			"snapshots": snapshots,
		})
	case http.MethodPut:
		var cfg GradualBackupSettings
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
			jsonError(w, "invalid body", http.StatusBadRequest)
			return
		}
		if err := app.store.SaveGradualBackupSettings(cfg); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		app.audit(user.ID, user.DisplayName, "update", "gradual_backup_settings", 0,
			fmt.Sprintf("Gradual backup settings updated: enabled=%v interval=%dm max=%d",
				cfg.Enabled, cfg.IntervalMinutes, cfg.MaxSnapshots))
		jsonOK(w, cfg)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGradualBackupSnapshotNow handles POST /api/admin/gradual-backup/snapshot
func (app *App) handleGradualBackupSnapshotNow(w http.ResponseWriter, r *http.Request, user *User) {
	filename, err := app.store.CreateGradualBackupSnapshot()
	if err != nil {
		jsonError(w, "failed to create snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Prune per current settings
	cfg := app.store.GetGradualBackupSettings()
	_ = app.store.PruneGradualBackupSnapshots(cfg.MaxSnapshots)
	app.audit(user.ID, user.DisplayName, "create", "gradual_backup_snapshot", 0,
		fmt.Sprintf("Manual snapshot created: %s", filename))
	snapshots, _ := app.store.ListGradualBackupSnapshots()
	if snapshots == nil {
		snapshots = []GradualBackupSnapshot{}
	}
	jsonOK(w, map[string]interface{}{"filename": filename, "snapshots": snapshots})
}

// handleGradualBackupRestore handles POST /api/admin/gradual-backup/restore/{filename}
func (app *App) handleGradualBackupRestore(w http.ResponseWriter, r *http.Request, user *User) {
	filename := filepath.Base(strings.TrimPrefix(r.URL.Path, "/api/admin/gradual-backup/restore/"))
	if filename == "" || filename == "." || filename == ".." {
		jsonError(w, "invalid filename", http.StatusBadRequest)
		return
	}
	restored, err := app.store.RestoreGradualBackupSnapshot(filename)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	app.audit(user.ID, user.DisplayName, "restore", "gradual_backup_snapshot", 0,
		fmt.Sprintf("Restored %d files from snapshot: %s", restored, filename))
	jsonOK(w, map[string]interface{}{
		"restored": restored,
		"message":  fmt.Sprintf("Restored %d files. Please restart the server for changes to take full effect.", restored),
	})
}

// handleGradualBackupDownload handles GET /api/admin/gradual-backup/download/{filename}
func (app *App) handleGradualBackupDownload(w http.ResponseWriter, r *http.Request, user *User) {
	filename := filepath.Base(strings.TrimPrefix(r.URL.Path, "/api/admin/gradual-backup/download/"))
	if filename == "" || filename == "." || filename == ".." {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}
	snapPath := filepath.Join(app.store.DataDir(), "snapshots", filename)
	if _, err := os.Stat(snapPath); err != nil {
		http.Error(w, "snapshot not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	// Sanitise filename for Content-Disposition to prevent header injection.
	safeFilename := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeFilename))
	http.ServeFile(w, r, snapPath)
}

// handleGradualBackupDelete handles DELETE /api/admin/gradual-backup/snapshots/{filename}
func (app *App) handleGradualBackupDelete(w http.ResponseWriter, r *http.Request, user *User) {
	filename := filepath.Base(strings.TrimPrefix(r.URL.Path, "/api/admin/gradual-backup/snapshots/"))
	if filename == "" || filename == "." || filename == ".." {
		jsonError(w, "invalid filename", http.StatusBadRequest)
		return
	}
	snapPath := filepath.Join(app.store.DataDir(), "snapshots", filename)
	if err := os.Remove(snapPath); err != nil {
		if os.IsNotExist(err) {
			jsonError(w, "snapshot not found", http.StatusNotFound)
		} else {
			jsonError(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	app.audit(user.ID, user.DisplayName, "delete", "gradual_backup_snapshot", 0,
		fmt.Sprintf("Deleted snapshot: %s", filename))
	w.WriteHeader(http.StatusNoContent)
}

// ── Backup & Restore ──────────────────────────────────────────────────────────

// encryptBackupData encrypts plaintext using AES-256-GCM with a key derived from
// keyMaterial (the admin password hash) via PBKDF2-SHA256.
// Output layout: salt(16) ‖ nonce(12) ‖ AES-GCM ciphertext.
func encryptBackupData(plaintext, keyMaterial []byte) ([]byte, error) {
	if len(keyMaterial) == 0 {
		return nil, fmt.Errorf("no encryption key material available")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	key := deriveBackupKey(keyMaterial, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)
	out := make([]byte, 0, 16+len(nonce)+len(ciphertext))
	out = append(out, salt...)
	out = append(out, nonce...)
	out = append(out, ciphertext...)
	return out, nil
}

// decryptBackupData reverses encryptBackupData.
func decryptBackupData(data, keyMaterial []byte) ([]byte, error) {
	if len(keyMaterial) == 0 {
		return nil, fmt.Errorf("no encryption key material available")
	}
	const saltLen, nonceLen = 16, 12
	if len(data) < saltLen+nonceLen {
		return nil, fmt.Errorf("ciphertext too short")
	}
	key := deriveBackupKey(keyMaterial, data[:saltLen])
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, data[saltLen:saltLen+nonceLen], data[saltLen+nonceLen:], nil)
}

// deriveBackupKey derives a 32-byte AES-256 key from keyMaterial and salt using PBKDF2-SHA256.
func deriveBackupKey(keyMaterial, salt []byte) []byte {
	return pbkdf2.Key(keyMaterial, salt, 100_000, 32, sha256.New)
}

func (app *App) handleBackup(w http.ResponseWriter, r *http.Request, user *User) {
	// Create a zip archive of all JSON data files, then encrypt it.
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tidslinjal-backup-%s.zip.enc"`, time.Now().Format("2006-01-02T150405")))

	// Build zip in memory
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	dataDir := app.store.DataDir()
	files := []string{
		"event_types.json", "users.json", "preferences.json", "groups.json",
		"memberships.json", "layers.json", "events.json", "attachments.json",
		"alarms.json", "locks.json", "audit.json", "exercise.json",
		"comments.json", "phases.json", "templates.json", "roles.json",
		"registration.json", "invitations.json", "oidc.json", "mail.json",
		"apikeys.json", "filter_presets.json", "event_versions.json",
		"decision_log.json", "event_log.json", "log_book.json",
		"map_resources.json", "references.json", "rooms.json", "custom_resource_types.json",
		"day_labels.json",
	}
	for _, f := range files {
		path := filepath.Join(dataDir, f)
		data, err := os.ReadFile(path)
		if err != nil {
			continue // skip missing files
		}
		fw, err := zw.Create(f)
		if err != nil {
			continue
		}
		fw.Write(data) //nolint
	}
	zw.Close() //nolint

	// Encrypt with admin password hash as key material
	keyMaterial := app.store.GetAdminPasswordHash()
	encrypted, err := encryptBackupData(buf.Bytes(), keyMaterial)
	if err != nil {
		jsonError(w, "failed to encrypt backup", http.StatusInternalServerError)
		return
	}
	w.Write(encrypted) //nolint
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: user.ID, UserName: user.DisplayName,
		Action: "backup", EntityType: "system", EntityID: 0,
		Summary: "Admin downloaded encrypted data backup",
	})
}

func (app *App) handleRestore(w http.ResponseWriter, r *http.Request, user *User) {
	// Parse the uploaded zip file and restore JSON data files
	if err := r.ParseMultipartForm(64 << 20); err != nil { // 64 MB
		jsonError(w, "failed to parse upload", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("backup")
	if err != nil {
		jsonError(w, "backup file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Read the entire file into memory
	buf := new(bytes.Buffer)
	if _, err := io.Copy(buf, file); err != nil {
		jsonError(w, "failed to read backup", http.StatusInternalServerError)
		return
	}
	raw := buf.Bytes()

	// Detect encrypted backups (magic bytes "PK" = plain zip; anything else = encrypted)
	if len(raw) < 2 || raw[0] != 0x50 || raw[1] != 0x4B {
		keyMaterial := app.store.GetAdminPasswordHash()
		decrypted, err := decryptBackupData(raw, keyMaterial)
		if err != nil {
			jsonError(w, "failed to decrypt backup — wrong admin password or corrupt file", http.StatusBadRequest)
			return
		}
		raw = decrypted
	}

	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		jsonError(w, "invalid zip file", http.StatusBadRequest)
		return
	}

	dataDir := app.store.DataDir()
	allowed := map[string]bool{
		"event_types.json": true, "preferences.json": true, "groups.json": true,
		"memberships.json": true, "layers.json": true, "events.json": true,
		"attachments.json": true, "alarms.json": true, "locks.json": true,
		"exercise.json": true, "comments.json": true, "phases.json": true,
		"templates.json": true, "roles.json": true,
		// V-11 fix: registration.json and invitations.json excluded to prevent
		// backup-based manipulation of registration mode and invitation codes
		"filter_presets.json": true, "event_versions.json": true,
		"map_resources.json": true, "references.json": true, "rooms.json": true,
		"custom_resource_types.json": true, "decision_log.json": true,
		"event_log.json": true, "log_book.json": true,
		"day_labels.json": true,
	}
	// Note: users.json, sessions.json, apikeys.json, oidc.json, mail.json excluded for security
	restored := 0
	for _, f := range zr.File {
		if !allowed[f.Name] {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			continue
		}
		if err := os.WriteFile(filepath.Join(dataDir, f.Name), data, 0600); err != nil {
			continue
		}
		restored++
	}
	app.store.LogAudit(AuditEntry{ //nolint
		UserID: user.ID, UserName: user.DisplayName,
		Action: "restore", EntityType: "system", EntityID: 0,
		Summary: fmt.Sprintf("Admin restored %d data files from backup", restored),
	})
	jsonOK(w, map[string]interface{}{
		"status":   "restored",
		"files":    restored,
		"message":  "Backup restored successfully. Please restart the server for changes to take full effect.",
	})
}

// ── WebCal Subscription ───────────────────────────────────────────────────────

func (app *App) handleWebCal(w http.ResponseWriter, r *http.Request) {
	// /webcal/:token.ics
	token := strings.TrimPrefix(r.URL.Path, "/webcal/")
	token = strings.TrimSuffix(token, ".ics")
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}
	// Find user by WebCal token
	users := app.store.GetUsers()
	var calUser *User
	for i := range users {
		if users[i].WebCalToken != "" && subtle.ConstantTimeCompare([]byte(users[i].WebCalToken), []byte(token)) == 1 {
			calUser = &users[i]
			break
		}
	}
	if calUser == nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	// Re-use existing ICS export handler with the found user
	r2 := r.WithContext(r.Context())
	app.handleExportICS(w, r2, calUser)
}
