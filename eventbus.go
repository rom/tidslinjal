package main

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

// ── Outbound Event Bus ──────────────────────────────────────────────────────
// Generalises the webhook system into a pub/sub model. Connectors and
// webhook subscribers all receive event lifecycle notifications through
// this single bus.

// EventAction describes what happened to an event.
type EventAction string

const (
	ActionCreated EventAction = "created"
	ActionUpdated EventAction = "updated"
)

// EventBusMessage is the payload delivered to all subscribers.
type EventBusMessage struct {
	Action    EventAction `json:"action"`
	Event     *Event      `json:"event"`
	OldStatus string      `json:"old_status,omitempty"` // for status_changed
	Timestamp time.Time   `json:"timestamp"`
	UserID    int64       `json:"user_id"`
	UserName  string      `json:"user_name"`
}

// EventBusSubscriber receives bus messages.
type EventBusSubscriber interface {
	OnBusEvent(msg EventBusMessage)
}

// EventBusSubscriberFunc is a function adapter for EventBusSubscriber.
type EventBusSubscriberFunc func(EventBusMessage)

func (f EventBusSubscriberFunc) OnBusEvent(msg EventBusMessage) { f(msg) }

// EventBus manages pub/sub for event lifecycle notifications.
type EventBus struct {
	mu          sync.RWMutex
	subscribers map[string]EventBusSubscriber
	ch          chan EventBusMessage
	stopped     bool
}

// NewEventBus creates a bus with a bounded channel.
func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string]EventBusSubscriber),
		ch:          make(chan EventBusMessage, 512),
	}
}

// Subscribe adds a named subscriber.
func (eb *EventBus) Subscribe(name string, sub EventBusSubscriber) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	eb.subscribers[name] = sub
}

// Unsubscribe removes a named subscriber.
func (eb *EventBus) Unsubscribe(name string) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	delete(eb.subscribers, name)
}

// Publish sends a message to the bus channel (non-blocking).
func (eb *EventBus) Publish(msg EventBusMessage) {
	eb.mu.RLock()
	if eb.stopped {
		eb.mu.RUnlock()
		return
	}
	eb.mu.RUnlock()
	msg.Timestamp = time.Now()
	logDebug("eventbus: publishing action=%s event=%d user=%s", msg.Action, msg.Event.ID, msg.UserName)
	select {
	case eb.ch <- msg:
	default:
		log.Printf("[WARN] event bus channel full, dropping message action=%s event=%d", msg.Action, msg.Event.ID)
	}
}

// Stop closes the bus channel, causing Run() to return.
func (eb *EventBus) Stop() {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	if !eb.stopped {
		eb.stopped = true
		close(eb.ch)
	}
}

// Run processes messages from the bus channel and fans out to all subscribers.
// Subscriber callbacks run inline (sequentially) to prevent unbounded goroutine
// growth. Each subscriber is protected by panic recovery.
func (eb *EventBus) Run() {
	for msg := range eb.ch {
		eb.mu.RLock()
		logDebug("eventbus: delivering action=%s event=%d to %d subscribers", msg.Action, msg.Event.ID, len(eb.subscribers))
		for name, sub := range eb.subscribers {
			func(n string, s EventBusSubscriber, m EventBusMessage) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[ERROR] event bus subscriber %q panicked: %v", n, r)
					}
				}()
				s.OnBusEvent(m)
			}(name, sub, msg)
		}
		eb.mu.RUnlock()
	}
}

// MarshalJSON helper for EventBusMessage.
func (msg EventBusMessage) MarshalJSON() ([]byte, error) {
	type Alias EventBusMessage
	return json.Marshal(&struct {
		Alias
	}{Alias: Alias(msg)})
}
