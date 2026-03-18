package main

import (
	"sync"
)

// ── SSE broker ────────────────────────────────────────────────────────────────

// SSEMessage is a generic SSE message with an event type and JSON data
type SSEMessage struct {
	Event string `json:"event"`
	Data  string `json:"data"`
}

type SSEClient struct {
	userID    int64
	ch        chan AlarmNotification
	broadcast chan SSEMessage
}

// SSEBroker manages all connected SSE clients.
//
// Performance notes (v4.0):
//   - byUser index gives O(1) targeted alarm delivery instead of O(n) scan.
//   - mu is an RWMutex so Notify/Broadcast/BroadcastAll can run concurrently.
//     Only Subscribe/Unsubscribe need an exclusive lock.
type SSEBroker struct {
	mu      sync.RWMutex
	clients map[*SSEClient]struct{}  // all clients (for broadcast)
	byUser  map[int64][]*SSEClient   // index: userID → clients
}

func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		clients: make(map[*SSEClient]struct{}),
		byUser:  make(map[int64][]*SSEClient),
	}
}

func (b *SSEBroker) Subscribe(userID int64) *SSEClient {
	b.mu.Lock()
	defer b.mu.Unlock()
	c := &SSEClient{
		userID:    userID,
		ch:        make(chan AlarmNotification, 8),
		broadcast: make(chan SSEMessage, 16),
	}
	b.clients[c] = struct{}{}
	b.byUser[userID] = append(b.byUser[userID], c)
	return c
}

func (b *SSEBroker) Unsubscribe(c *SSEClient) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, c)
	// Remove from byUser index
	list := b.byUser[c.userID]
	for i, ec := range list {
		if ec == c {
			b.byUser[c.userID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(b.byUser[c.userID]) == 0 {
		delete(b.byUser, c.userID)
	}
}

// Notify delivers an alarm to a specific user — O(1) via byUser index.
func (b *SSEBroker) Notify(userID int64, n AlarmNotification) {
	b.mu.RLock()
	clients := b.byUser[userID]
	b.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.ch <- n:
		default:
		}
	}
}

// Broadcast sends an SSE message to all connected clients except the sender.
func (b *SSEBroker) Broadcast(senderID int64, msg SSEMessage) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for c := range b.clients {
		if c.userID != senderID {
			select {
			case c.broadcast <- msg:
			default:
			}
		}
	}
}

// BroadcastAll sends an SSE message to ALL connected clients including sender.
func (b *SSEBroker) BroadcastAll(msg SSEMessage) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for c := range b.clients {
		select {
		case c.broadcast <- msg:
		default:
		}
	}
}

// SendToUser sends an SSE message to all clients for a specific user — O(1) via byUser index.
func (b *SSEBroker) SendToUser(userID int64, msg SSEMessage) {
	b.mu.RLock()
	clients := b.byUser[userID]
	b.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.broadcast <- msg:
		default:
		}
	}
}
