package main

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestEventBus_PublishAndReceive(t *testing.T) {
	bus := NewEventBus()
	go bus.Run()
	defer bus.Stop()

	var received atomic.Int64
	bus.Subscribe("test", EventBusSubscriberFunc(func(msg EventBusMessage) {
		received.Add(1)
	}))

	ev := Event{ID: 1, Title: "Test"}
	bus.Publish(EventBusMessage{Action: ActionCreated, Event: &ev})
	bus.Publish(EventBusMessage{Action: ActionUpdated, Event: &ev})

	// Wait for messages to be processed
	time.Sleep(100 * time.Millisecond)

	if got := received.Load(); got != 2 {
		t.Errorf("expected 2 messages, got %d", got)
	}
}

func TestEventBus_MultipleSubscribers(t *testing.T) {
	bus := NewEventBus()
	go bus.Run()
	defer bus.Stop()

	var countA, countB atomic.Int64
	bus.Subscribe("A", EventBusSubscriberFunc(func(msg EventBusMessage) {
		countA.Add(1)
	}))
	bus.Subscribe("B", EventBusSubscriberFunc(func(msg EventBusMessage) {
		countB.Add(1)
	}))

	ev := Event{ID: 1, Title: "Test"}
	bus.Publish(EventBusMessage{Action: ActionCreated, Event: &ev})

	time.Sleep(100 * time.Millisecond)

	if countA.Load() != 1 {
		t.Errorf("subscriber A: expected 1, got %d", countA.Load())
	}
	if countB.Load() != 1 {
		t.Errorf("subscriber B: expected 1, got %d", countB.Load())
	}
}

func TestEventBus_Unsubscribe(t *testing.T) {
	bus := NewEventBus()
	go bus.Run()
	defer bus.Stop()

	var count atomic.Int64
	bus.Subscribe("test", EventBusSubscriberFunc(func(msg EventBusMessage) {
		count.Add(1)
	}))

	ev := Event{ID: 1, Title: "Test"}
	bus.Publish(EventBusMessage{Action: ActionCreated, Event: &ev})
	time.Sleep(100 * time.Millisecond)

	bus.Unsubscribe("test")
	bus.Publish(EventBusMessage{Action: ActionUpdated, Event: &ev})
	time.Sleep(100 * time.Millisecond)

	if got := count.Load(); got != 1 {
		t.Errorf("expected 1 message after unsubscribe, got %d", got)
	}
}
