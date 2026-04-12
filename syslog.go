package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ── Syslog writer ─────────────────────────────────────────────────────────────

// syslogWriter forwards log messages to a remote syslog server.
// It supports UDP, TCP, and TLS transports, and classic or JSON message formats.
// An instance is set via setSyslogWriter(); concurrent use is safe via its own mutex.
type syslogWriter struct {
	mu       sync.Mutex
	cfg      SyslogConfig
	conn     net.Conn // nil for UDP (reconnect on each write)
	hostname string
}

var (
	globalSyslog     *syslogWriter
	globalSyslogOnce sync.Once
)

// ── Logging ──────────────────────────────────────────────────────────────────

var (
	verbose bool
	debug   bool
)

func init() {
	for _, arg := range os.Args[1:] {
		switch arg {
		case "-verbose":
			verbose = true
		case "-debug":
			debug = true
			verbose = true
		}
	}
}

func logInfo(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	log.Print("[INFO] " + msg)
	syslogSend(6, msg) // info severity
}

func logWarn(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	log.Print("[WARN] " + msg)
	syslogSend(4, msg) // warning severity
}

func logError(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	log.Print("[ERROR] " + msg)
	syslogSend(3, msg) // error severity
}

func logVerbose(format string, args ...any) {
	if verbose {
		fmt.Printf("[VERBOSE] "+format+"\n", args...)
	}
}

func logDebug(format string, args ...any) {
	if debug {
		fmt.Printf("[DEBUG] "+format+"\n", args...)
	}
	syslogSend(7, fmt.Sprintf(format, args...)) // debug severity
}

// logRequestError logs an error with request context (request ID, user, method, path).
func logRequestError(r *http.Request, format string, args ...any) {
	reqID := getRequestID(r)
	user := getUserFromContext(r)
	username := ""
	if user != nil {
		username = user.Username
	}
	msg := fmt.Sprintf(format, args...)
	logError("req=%s user=%s %s %s: %s", reqID, username, r.Method, r.URL.Path, msg)
}

// setSyslogWriter replaces the active syslog writer (or disables it if cfg.Enabled is false).
func setSyslogWriter(cfg SyslogConfig) {
	if !cfg.Enabled || cfg.Host == "" {
		globalSyslog = nil
		return
	}
	hn, _ := os.Hostname()
	globalSyslog = &syslogWriter{cfg: cfg, hostname: hn}
}

// syslogSend forwards a log line to the remote syslog server (if configured).
func syslogSend(severity int, msg string) {
	sw := globalSyslog
	if sw == nil {
		return
	}
	sw.send(severity, msg)
}

// syslogPriority computes the RFC 3164 priority value from facility and severity.
func syslogPriority(facility, severity int) int {
	return facility*8 + severity
}

// sanitizeSyslogMessage strips characters that would let an attacker forge
// additional log records. CR/LF terminate records in RFC 3164, and NUL /
// other C0 control characters can confuse downstream parsers and SIEMs.
// Tabs are preserved. Returns the sanitised string with replacement chars.
func sanitizeSyslogMessage(msg string) string {
	if msg == "" {
		return msg
	}
	b := make([]byte, 0, len(msg))
	for i := 0; i < len(msg); i++ {
		c := msg[i]
		switch {
		case c == '\n', c == '\r':
			b = append(b, ' ') // preserve word boundary
		case c == '\t':
			b = append(b, c)
		case c < 0x20, c == 0x7f:
			b = append(b, ' ') // other control chars → space
		default:
			b = append(b, c)
		}
	}
	return string(b)
}

func (sw *syslogWriter) formatClassic(priority int, msg string) []byte {
	// RFC 3164: <PRI>Mmm DD HH:MM:SS hostname tag: message
	t := time.Now().UTC()
	app := sw.cfg.AppName
	if app == "" {
		app = "tidslinjal"
	}
	line := fmt.Sprintf("<%d>%s %s %s: %s\n",
		priority,
		t.Format("Jan _2 15:04:05"),
		sw.hostname,
		app,
		msg,
	)
	return []byte(line)
}

func (sw *syslogWriter) formatJSON(priority int, severity int, msg string) []byte {
	app := sw.cfg.AppName
	if app == "" {
		app = "tidslinjal"
	}
	b, _ := json.Marshal(map[string]any{
		"priority":  priority,
		"facility":  sw.cfg.Facility,
		"severity":  severity,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"hostname":  sw.hostname,
		"app":       app,
		"message":   msg,
	})
	return append(b, '\n')
}

func (sw *syslogWriter) send(severity int, msg string) {
	facility := sw.cfg.Facility
	if facility == 0 {
		facility = 1 // user-level messages
	}
	priority := syslogPriority(facility, severity)

	// SECURITY: strip CR/LF (and other control characters) from msg before
	// formatting. RFC 3164 classic format delimits records with newlines,
	// so an attacker-controlled string containing "\n<34>Jan 1 ..." would
	// inject a forged record into the syslog stream and mislead SIEM/IR.
	// JSON format auto-escapes newlines, but we sanitise for both so the
	// behaviour is consistent and defence-in-depth.
	msg = sanitizeSyslogMessage(msg)

	var payload []byte
	if sw.cfg.Format == "json" {
		payload = sw.formatJSON(priority, severity, msg)
	} else {
		payload = sw.formatClassic(priority, msg)
	}

	port := sw.cfg.Port
	if port == 0 {
		if sw.cfg.Transport == "tls" {
			port = 6514
		} else {
			port = 514
		}
	}
	addr := fmt.Sprintf("%s:%d", sw.cfg.Host, port)

	sw.mu.Lock()
	defer sw.mu.Unlock()

	switch sw.cfg.Transport {
	case "udp":
		// UDP: connectionless, create a new connection per message
		conn, err := net.DialTimeout("udp", addr, 3*time.Second)
		if err != nil {
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(3 * time.Second)) //nolint
		conn.Write(payload)                                //nolint
	case "tls":
		// V-18 fix: default to verifying TLS certificates (InsecureSkipVerify=false).
		// The TLSVerify field's Go zero value (false) previously caused skipping verification.
		// Now we only skip if explicitly configured via tls_skip_verify=true.
		tlsCfg := &tls.Config{InsecureSkipVerify: sw.cfg.TLSSkipVerify} //nolint
		if sw.conn == nil {
			conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", addr, tlsCfg)
			if err != nil {
				return
			}
			sw.conn = conn
		}
		sw.conn.SetDeadline(time.Now().Add(5 * time.Second)) //nolint
		if _, err := sw.conn.Write(payload); err != nil {
			sw.conn.Close()
			sw.conn = nil
			// Retry once
			conn, err2 := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", addr, tlsCfg)
			if err2 != nil {
				return
			}
			sw.conn = conn
			sw.conn.Write(payload) //nolint
		}
	default: // tcp
		if sw.conn == nil {
			conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
			if err != nil {
				return
			}
			sw.conn = conn
		}
		sw.conn.SetDeadline(time.Now().Add(5 * time.Second)) //nolint
		if _, err := sw.conn.Write(payload); err != nil {
			sw.conn.Close()
			sw.conn = nil
			conn, err2 := net.DialTimeout("tcp", addr, 5*time.Second)
			if err2 != nil {
				return
			}
			sw.conn = conn
			sw.conn.Write(payload) //nolint
		}
	}
}

// syslogLogWriter wraps the standard log package to also forward to syslog.
// It implements io.Writer so it can be set as log.SetOutput(…).
type syslogLogWriter struct {
	orig io.Writer
}

func (w *syslogLogWriter) Write(p []byte) (int, error) {
	n, err := w.orig.Write(p)
	// Determine severity from prefix: ERROR/FATAL→3, WARN→4, INFO→6, default→6
	s := strings.TrimSpace(string(p))
	severity := 6 // informational
	sl := strings.ToUpper(s)
	if strings.Contains(sl, "[WARN]") {
		severity = 4 // warning
	} else if strings.Contains(sl, "[DEBUG]") {
		severity = 7 // debug
	} else if strings.Contains(sl, "FATAL") || strings.Contains(sl, "ERROR") {
		severity = 3 // error
	}
	syslogSend(severity, strings.TrimRight(s, "\n"))
	return n, err
}
