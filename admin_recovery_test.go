package main

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// TestResetAdminRecovery verifies the --admin recovery flow: the admin
// account's password is reset to the given value, the account is unblocked
// and re-vetted, MustChangePassword is cleared, and the bcrypt hash compares
// correctly against the target password.
func TestResetAdminRecovery(t *testing.T) {
	app, _ := newTestApp(t)

	// Pretend the admin was blocked and forced to change password.
	u, ok := app.store.GetUserByUsername("admin")
	if !ok {
		t.Fatalf("admin account missing in fresh test app")
	}
	u.Blocked = true
	u.MustChangePassword = true
	u.Vetted = false
	if err := app.store.UpdateUser(*u); err != nil {
		t.Fatalf("seed UpdateUser: %v", err)
	}

	if err := app.resetAdminRecovery(adminRecoveryPassword); err != nil {
		t.Fatalf("resetAdminRecovery: %v", err)
	}

	got, ok := app.store.GetUserByUsername("admin")
	if !ok {
		t.Fatalf("admin vanished after reset")
	}
	if got.Blocked {
		t.Errorf("admin still blocked after reset")
	}
	if !got.Vetted {
		t.Errorf("admin not vetted after reset")
	}
	if got.MustChangePassword {
		t.Errorf("MustChangePassword still set after reset")
	}
	if got.Role != RoleAdmin {
		t.Errorf("admin role changed to %q", got.Role)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(got.PasswordHash), []byte(adminRecoveryPassword)); err != nil {
		t.Errorf("bcrypt compare failed: %v", err)
	}
}
