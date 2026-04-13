package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIpsMatchBinding(t *testing.T) {
	cases := []struct {
		name    string
		stored  string
		current string
		mode    string
		want    bool
	}{
		{"exact ipv4", "10.0.0.5", "10.0.0.5", "subnet", true},
		{"exact ipv4 strict", "10.0.0.5", "10.0.0.5", "strict", true},
		{"ipv4 same /24 subnet", "10.0.0.5", "10.0.0.200", "subnet", true},
		{"ipv4 same /24 strict", "10.0.0.5", "10.0.0.200", "strict", false},
		{"ipv4 different /24 subnet", "10.0.0.5", "10.0.1.5", "subnet", false},
		{"ipv4 vs ipv6", "10.0.0.5", "2001:db8::1", "subnet", false},
		{"ipv6 same /64", "2001:db8:0:0:1::1", "2001:db8:0:0:aaaa::2", "subnet", true},
		{"ipv6 different /64", "2001:db8:0:0::1", "2001:db8:0:1::1", "subnet", false},
		{"garbage strings", "not-an-ip", "also-not", "subnet", false},
		{"empty mode defaults to subnet", "10.0.0.5", "10.0.0.200", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ipsMatchBinding(tc.stored, tc.current, tc.mode)
			if got != tc.want {
				t.Errorf("ipsMatchBinding(%q, %q, %q) = %v, want %v",
					tc.stored, tc.current, tc.mode, got, tc.want)
			}
		})
	}
}

func TestSessionBindingMismatch(t *testing.T) {
	mkReq := func(ip, ua string) *http.Request {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = ip + ":12345"
		r.Header.Set("User-Agent", ua)
		return r
	}

	sess := &Session{IPAddress: "10.0.0.5", UserAgent: "Mozilla/5.0 Foo"}
	// With the master switch enabled, the sub-options take effect.
	ss := SecuritySettings{SessionHijackProtection: true, SessionBindIP: true, SessionBindIPMode: "subnet", SessionBindUA: true}

	// Master switch OFF (default): every mismatch is ignored even
	// when the sub-options say to check. The feature is DISABLED by
	// default to avoid kicking users out behind reverse proxies.
	ssMasterOff := SecuritySettings{SessionHijackProtection: false, SessionBindIP: true, SessionBindUA: true}
	if r := sessionBindingMismatch(sess, mkReq("8.8.8.8", "completely different"), ssMasterOff); r != "" {
		t.Errorf("expected no mismatch with master switch off, got %q", r)
	}

	// Matching request — no mismatch.
	if r := sessionBindingMismatch(sess, mkReq("10.0.0.5", "Mozilla/5.0 Foo"), ss); r != "" {
		t.Errorf("expected no mismatch for identical binding, got %q", r)
	}
	// Same /24 — subnet mode should accept.
	if r := sessionBindingMismatch(sess, mkReq("10.0.0.99", "Mozilla/5.0 Foo"), ss); r != "" {
		t.Errorf("expected subnet match to pass, got %q", r)
	}
	// Different /24 — should be flagged.
	if r := sessionBindingMismatch(sess, mkReq("10.0.1.5", "Mozilla/5.0 Foo"), ss); r != "ip" {
		t.Errorf("expected ip mismatch, got %q", r)
	}
	// UA mismatch
	if r := sessionBindingMismatch(sess, mkReq("10.0.0.5", "curl/8.0"), ss); r != "user-agent" {
		t.Errorf("expected user-agent mismatch, got %q", r)
	}
	// Strict mode — any IP change rejected.
	strict := ss
	strict.SessionBindIPMode = "strict"
	if r := sessionBindingMismatch(sess, mkReq("10.0.0.6", "Mozilla/5.0 Foo"), strict); r != "ip" {
		t.Errorf("expected strict ip mismatch, got %q", r)
	}
	// Disabled sub-options (but master switch on) — mismatches ignored.
	off := SecuritySettings{SessionHijackProtection: true, SessionBindIP: false, SessionBindUA: false}
	if r := sessionBindingMismatch(sess, mkReq("8.8.8.8", "something else"), off); r != "" {
		t.Errorf("expected no mismatch when sub-options disabled, got %q", r)
	}
	// Legacy sessions with empty stored binding metadata — gracefully allowed.
	legacy := &Session{}
	if r := sessionBindingMismatch(legacy, mkReq("1.2.3.4", "anything"), ss); r != "" {
		t.Errorf("expected legacy session to be allowed, got %q", r)
	}
}
