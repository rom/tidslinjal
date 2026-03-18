package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"
)

// ── Mail Config ────────────────────────────────────────────────────────────────

func (app *App) handleGetMailConfig(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetMailConfig()
	cfg.Password = "" // never expose password
	jsonOK(w, cfg)
}

func (app *App) handleSaveMailConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg MailConfig
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	// Preserve existing password if not provided in request
	if cfg.Password == "" {
		existing := app.store.GetMailConfig()
		cfg.Password = existing.Password
	}
	if err := app.store.SaveMailConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.audit(user.ID, user.DisplayName, "updated", "mail_config", 0, "Updated mail configuration")
	resp := cfg
	resp.Password = ""
	jsonOK(w, resp)
}

func (app *App) handleTestMail(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetMailConfig()
	if !cfg.Enabled || cfg.SMTPHost == "" {
		jsonError(w, "Mail is not configured", http.StatusBadRequest)
		return
	}
	to := user.Email
	if to == "" {
		to = user.Username + "@example.com"
	}
	if err := app.sendMail(cfg, to, "Tidslinjal — Mail Test", "<p>Mail configuration is working correctly.</p>"); err != nil {
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "mail_test_failed", EntityType: "mail", EntityID: 0,
			Summary: fmt.Sprintf("Mail test failed to %s: %s", to, err.Error()),
		})
		jsonError(w, "Mail test failed — check server logs for details", http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "mail_test_sent", EntityType: "mail", EntityID: 0,
		Summary: fmt.Sprintf("Mail test sent to %s", to),
	})
	jsonOK(w, map[string]string{"status": "ok", "sent_to": to})
}

func (app *App) handleSendMail(w http.ResponseWriter, r *http.Request, user *User) {
	var req struct {
		To       string `json:"to"`
		Subject  string `json:"subject"`
		BodyHTML string `json:"body_html"`
		BodyText string `json:"body_text"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	cfg := app.store.GetMailConfig()
	if !cfg.Enabled || cfg.SMTPHost == "" {
		jsonError(w, "mail not configured", http.StatusServiceUnavailable)
		return
	}
	body := req.BodyHTML
	if body == "" {
		// HTML-escape plain text to prevent XSS via email body injection
		escaped := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;").Replace(req.BodyText)
		body = "<pre>" + escaped + "</pre>"
	}
	if err := app.sendMail(cfg, req.To, req.Subject, body); err != nil {
		app.store.LogAudit(AuditEntry{
			UserID: user.ID, UserName: user.DisplayName,
			Action: "mail_send_failed", EntityType: "mail", EntityID: 0,
			Summary: fmt.Sprintf("Failed to send mail to %s: %s — subject: %s", req.To, err.Error(), req.Subject),
		})
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app.store.LogAudit(AuditEntry{
		UserID: user.ID, UserName: user.DisplayName,
		Action: "mail_sent", EntityType: "mail", EntityID: 0,
		Summary: fmt.Sprintf("Sent mail to %s — subject: %s", req.To, req.Subject),
	})
	jsonOK(w, map[string]string{"status": "sent"})
}

// sendMail sends a plain HTML email via configured SMTP
func (app *App) sendMail(cfg MailConfig, to, subject, bodyHTML string) error {
	port := cfg.SMTPPort
	if port == 0 {
		port = 587
	}
	from := cfg.FromAddr
	if from == "" {
		from = "tidslinjal@localhost"
	}
	fromName := cfg.FromName
	if fromName == "" {
		fromName = "Tidslinjal"
	}

	// Sanitise header values to prevent SMTP header injection
	sanitiseHeader := func(s string) string {
		return strings.NewReplacer("\r", "", "\n", "", "\x00", "").Replace(s)
	}
	to = sanitiseHeader(to)
	subject = sanitiseHeader(subject)
	fromName = sanitiseHeader(fromName)

	logDebug("[mail] sending to=%s from=%s<%s> subject=%q host=%s:%d tls=%s auth=%v",
		to, fromName, from, subject, cfg.SMTPHost, port, cfg.TLSMode, cfg.Username != "")

	msg := []byte(fmt.Sprintf("From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		fromName, from, to, subject, bodyHTML))

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, port)
	var auth interface{ Start(*smtp.ServerInfo) (string, []byte, error) }
	if cfg.Username != "" && cfg.Password != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
		logDebug("[mail] using PLAIN auth user=%s", cfg.Username)
	}

	if cfg.TLSMode == "tls" {
		logDebug("[mail] connecting with implicit TLS to %s", addr)
		tlsCfg := &tls.Config{ServerName: cfg.SMTPHost}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			logDebug("[mail] TLS dial failed: %v", err)
			return err
		}
		defer conn.Close()
		logDebug("[mail] TLS connected, creating SMTP client")
		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			logDebug("[mail] SMTP client creation failed: %v", err)
			return err
		}
		defer client.Quit()
		if auth != nil {
			if err := client.Auth(auth.(smtp.Auth)); err != nil {
				logDebug("[mail] AUTH failed: %v", err)
				return err
			}
			logDebug("[mail] AUTH succeeded")
		}
		if err := client.Mail(from); err != nil {
			logDebug("[mail] MAIL FROM failed: %v", err)
			return err
		}
		if err := client.Rcpt(to); err != nil {
			logDebug("[mail] RCPT TO failed: %v", err)
			return err
		}
		wc, err := client.Data()
		if err != nil {
			logDebug("[mail] DATA command failed: %v", err)
			return err
		}
		_, err = wc.Write(msg)
		wc.Close()
		if err != nil {
			logDebug("[mail] DATA write failed: %v", err)
		} else {
			logDebug("[mail] sent successfully via TLS to %s", to)
		}
		return err
	}

	// STARTTLS or plain
	logDebug("[mail] connecting via STARTTLS/plain to %s", addr)
	var sendErr error
	if auth != nil {
		sendErr = smtp.SendMail(addr, auth.(smtp.Auth), from, []string{to}, msg)
	} else {
		sendErr = smtp.SendMail(addr, nil, from, []string{to}, msg)
	}
	if sendErr != nil {
		logDebug("[mail] SendMail failed: %v", sendErr)
	} else {
		logDebug("[mail] sent successfully to %s", to)
	}
	return sendErr
}

// ── Syslog Config Handlers ────────────────────────────────────────────────────

func (app *App) handleGetSyslogConfig(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetSyslogConfig())
}

func (app *App) handleSaveSyslogConfig(w http.ResponseWriter, r *http.Request, user *User) {
	var cfg SyslogConfig
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if cfg.Transport == "" {
		cfg.Transport = "udp"
	}
	if cfg.Format == "" {
		cfg.Format = "classic"
	}
	if err := app.store.SaveSyslogConfig(cfg); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Apply new config immediately
	setSyslogWriter(cfg)
	if cfg.Enabled && cfg.Host != "" {
		log.SetOutput(&syslogLogWriter{orig: os.Stderr})
	} else {
		log.SetOutput(os.Stderr)
	}
	app.audit(user.ID, user.DisplayName, "updated", "syslog_config", 0, "Updated syslog configuration")
	jsonOK(w, cfg)
}

func (app *App) handleTestSyslog(w http.ResponseWriter, r *http.Request, user *User) {
	cfg := app.store.GetSyslogConfig()
	if !cfg.Enabled || cfg.Host == "" {
		jsonError(w, "Syslog is not configured", http.StatusBadRequest)
		return
	}
	// Temporarily create a writer and send a test message
	hn, _ := os.Hostname()
	sw := &syslogWriter{cfg: cfg, hostname: hn}
	sw.send(6, fmt.Sprintf("Tidslinjal syslog test from %s (user: %s)", hn, user.Username))
	jsonOK(w, map[string]string{"status": "ok", "transport": cfg.Transport, "host": cfg.Host})
}

// sendMailWithAttachment sends an email with a binary attachment via SMTP.
func (app *App) sendMailWithAttachment(cfg MailConfig, to, subject, bodyHTML string, attachData []byte, attachName, attachMIME string) error {
	smtpPort := cfg.SMTPPort
	if smtpPort == 0 {
		smtpPort = 587
	}
	from := cfg.FromAddr
	if from == "" {
		from = "tidslinjal@localhost"
	}
	fromName := cfg.FromName
	if fromName == "" {
		fromName = "Tidslinjal"
	}

	// Sanitise header values to prevent SMTP header injection
	sanitiseHeader := func(s string) string {
		return strings.NewReplacer("\r", "", "\n", "", "\x00", "").Replace(s)
	}
	to = sanitiseHeader(to)
	subject = sanitiseHeader(subject)
	fromName = sanitiseHeader(fromName)
	attachName = sanitiseHeader(attachName)

	boundary := fmt.Sprintf("---=_Part_%d", time.Now().UnixNano())
	// Encode attachment as base64
	enc := make([]byte, 0, len(attachData)*2)
	const lineLen = 76
	b64 := make([]byte, ((len(attachData)+2)/3)*4)
	n := encodeBase64(b64, attachData)
	for i := 0; i < n; i += lineLen {
		end := i + lineLen
		if end > n {
			end = n
		}
		enc = append(enc, b64[i:end]...)
		enc = append(enc, '\r', '\n')
	}

	msg := fmt.Sprintf(
		"From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n"+
			"--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n\r\n"+
			"--%s\r\nContent-Type: %s; name=\"%s\"\r\nContent-Disposition: attachment; filename=\"%s\"\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n--%s--",
		fromName, from, to, subject, boundary,
		boundary, bodyHTML,
		boundary, attachMIME, attachName, attachName, string(enc), boundary,
	)

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, smtpPort)
	var auth smtp.Auth
	if cfg.Username != "" && cfg.Password != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
	}

	if cfg.TLSMode == "tls" {
		tlsCfg := &tls.Config{ServerName: cfg.SMTPHost}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return err
		}
		defer conn.Close()
		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return err
		}
		defer client.Quit()
		if auth != nil {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
		if err := client.Mail(from); err != nil {
			return err
		}
		if err := client.Rcpt(to); err != nil {
			return err
		}
		wc, err := client.Data()
		if err != nil {
			return err
		}
		_, err = wc.Write([]byte(msg))
		wc.Close()
		return err
	}
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}

// encodeBase64 encodes src into dst using standard base64 encoding, returns bytes written.
func encodeBase64(dst, src []byte) int {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	di, si := 0, 0
	for ; si+2 < len(src); si += 3 {
		v := uint(src[si])<<16 | uint(src[si+1])<<8 | uint(src[si+2])
		dst[di] = alphabet[v>>18&0x3F]
		dst[di+1] = alphabet[v>>12&0x3F]
		dst[di+2] = alphabet[v>>6&0x3F]
		dst[di+3] = alphabet[v&0x3F]
		di += 4
	}
	rem := len(src) - si
	if rem == 1 {
		v := uint(src[si]) << 16
		dst[di] = alphabet[v>>18&0x3F]
		dst[di+1] = alphabet[v>>12&0x3F]
		dst[di+2] = '='
		dst[di+3] = '='
		di += 4
	} else if rem == 2 {
		v := uint(src[si])<<16 | uint(src[si+1])<<8
		dst[di] = alphabet[v>>18&0x3F]
		dst[di+1] = alphabet[v>>12&0x3F]
		dst[di+2] = alphabet[v>>6&0x3F]
		dst[di+3] = '='
		di += 4
	}
	return di
}
