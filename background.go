package main

import (
	"fmt"
	"log"
	"time"
)

// ── Background tasks ───────────────────────────────────────────────────────────

func (app *App) runAlarmScheduler() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		active := app.store.GetActiveAlarms()
		logDebug("alarm scheduler tick: checking %d alarms", len(active))
		for _, alarm := range active {
			fireAt := alarm.EventTime.Add(-time.Duration(alarm.LeadTime) * time.Minute)
			if !now.Before(fireAt) { // fires when now >= fireAt
				app.store.MarkAlarmFired(alarm.ID) //nolint
				msg := fmt.Sprintf("Reminder: \"%s\" starts in %d minutes", alarm.EventTitle, alarm.LeadTime)
				if alarm.LeadTime == 0 {
					msg = fmt.Sprintf("Now: \"%s\" is starting", alarm.EventTitle)
				}
				notif := AlarmNotification{
					AlarmID: alarm.ID, EventID: alarm.EventID,
					EventTitle: alarm.EventTitle, EventTime: alarm.EventTime,
					LeadTime: alarm.LeadTime, Sound: alarm.Sound, Message: msg,
				}
				app.broker.Notify(alarm.UserID, notif)
				// Personal notification for the alarm
				app.notifyUser(alarm.UserID, "alarm",
					"Alarm: "+alarm.EventTitle,
					msg,
					fmt.Sprintf("%d", alarm.EventID))
				// Call per-alarm webhook if set
				if alarm.WebhookURL != "" {
					app.callWebhookURL(alarm.WebhookURL, "generic", msg, notif)
					app.audit(alarm.UserID, "", "posted", "integration", alarm.ID,
						fmt.Sprintf("Alarm webhook fired for %q (event: %s)", alarm.EventTitle, alarm.EventTime.Format("2006-01-02 15:04")))
				}
				// Call user-level webhook if configured, and audit it
				userPrefs := app.store.GetPreferences(alarm.UserID)
				if userPrefs.WebhookURL != "" {
					app.audit(alarm.UserID, "", "posted", "integration", alarm.ID,
						fmt.Sprintf("Alarm notification posted to user webhook for %q", alarm.EventTitle))
				}
				app.callWebhook(alarm.UserID, msg, notif)
				// Send alarm email if user has email and SMTP is configured
				go func(uID int64, aMsg, aTitle string, aTime time.Time) {
					users := app.store.GetUsers()
					for _, u := range users {
						if u.ID == uID && u.Email != "" {
							cfg := app.store.GetMailConfig()
							if cfg.Enabled && cfg.SMTPHost != "" {
								body := fmt.Sprintf(`<p><strong>Alarm:</strong> %s</p>
<p><strong>Event:</strong> %s</p><p><strong>Time:</strong> %s</p>
<p>Log in to Tidslinjal to acknowledge this alarm.</p>`,
									htmlEscape(aMsg), htmlEscape(aTitle), aTime.Format("2006-01-02 15:04 MST"))
								if err := app.sendMail(cfg, u.Email, "Tidslinjal — Alarm: "+aTitle, body); err != nil {
									log.Printf("alarm email failed for user %d: %v", uID, err)
								}
							}
							break
						}
					}
				}(alarm.UserID, msg, alarm.EventTitle, alarm.EventTime)
			}
		}
	}
}

func (app *App) runSessionCleaner() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		app.store.CleanExpiredSessions()
	}
}
