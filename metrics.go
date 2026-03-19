package main

import (
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ── Prometheus/OpenTelemetry Metrics ────────────────────────────────────────
// Exposes /metrics in Prometheus text exposition format for integration
// with Grafana, Datadog, and other monitoring stacks.

// Metrics collects application-level counters and gauges.
type Metrics struct {
	// Request counters
	httpRequestsTotal   atomic.Int64
	httpRequestsByPath  sync.Map // path → *atomic.Int64

	// Event counters
	eventsCreated  atomic.Int64
	eventsUpdated  atomic.Int64
	eventsDeleted  atomic.Int64

	// SSE
	sseConnectionsActive atomic.Int64

	// Webhook
	webhooksSent   atomic.Int64
	webhooksFailed atomic.Int64

	// Ingest
	ingestReceived atomic.Int64
	ingestAccepted atomic.Int64
	ingestErrors   atomic.Int64

	// Routing
	routingRulesMatched atomic.Int64

	// Connectors
	connectorPollsTotal  atomic.Int64
	connectorPollErrors  atomic.Int64

	// Startup time
	startedAt time.Time
}

// NewMetrics creates a new metrics collector.
func NewMetrics() *Metrics {
	return &Metrics{
		startedAt: time.Now(),
	}
}

// IncHTTPRequest increments the HTTP request counter.
// Paths are normalized to prevent unbounded sync.Map growth from unique IDs.
func (m *Metrics) IncHTTPRequest(path string) {
	m.httpRequestsTotal.Add(1)
	normalized := normalizeMetricsPath(path)
	v, _ := m.httpRequestsByPath.LoadOrStore(normalized, &atomic.Int64{})
	v.(*atomic.Int64).Add(1)
}

// normalizeMetricsPath replaces numeric path segments with {id} to bound the
// number of unique keys in the metrics map.
func normalizeMetricsPath(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if len(p) > 0 && isNumeric(p) {
			parts[i] = "{id}"
		}
	}
	return strings.Join(parts, "/")
}

func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// IncEventCreated increments the events created counter.
func (m *Metrics) IncEventCreated() { m.eventsCreated.Add(1) }

// IncEventUpdated increments the events updated counter.
func (m *Metrics) IncEventUpdated() { m.eventsUpdated.Add(1) }

// IncEventDeleted increments the events deleted counter.
func (m *Metrics) IncEventDeleted() { m.eventsDeleted.Add(1) }

// IncSSEConnect increments the active SSE connections gauge.
func (m *Metrics) IncSSEConnect() { m.sseConnectionsActive.Add(1) }

// DecSSEConnect decrements the active SSE connections gauge.
func (m *Metrics) DecSSEConnect() { m.sseConnectionsActive.Add(-1) }

// IncWebhookSent increments the webhook sent counter.
func (m *Metrics) IncWebhookSent() { m.webhooksSent.Add(1) }

// IncWebhookFailed increments the webhook failed counter.
func (m *Metrics) IncWebhookFailed() { m.webhooksFailed.Add(1) }

// IncIngestReceived increments the ingest received counter.
func (m *Metrics) IncIngestReceived() { m.ingestReceived.Add(1) }

// IncIngestAccepted increments the ingest accepted counter.
func (m *Metrics) IncIngestAccepted() { m.ingestAccepted.Add(1) }

// IncIngestError increments the ingest error counter.
func (m *Metrics) IncIngestError() { m.ingestErrors.Add(1) }

// IncRoutingMatched increments the routing rules matched counter.
func (m *Metrics) IncRoutingMatched() { m.routingRulesMatched.Add(1) }

// IncConnectorPoll increments the connector poll counter.
func (m *Metrics) IncConnectorPoll() { m.connectorPollsTotal.Add(1) }

// IncConnectorPollError increments the connector poll error counter.
func (m *Metrics) IncConnectorPollError() { m.connectorPollErrors.Add(1) }

// handleMetrics serves metrics in Prometheus text exposition format.
// GET /metrics
func (app *App) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	m := app.metrics
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	// Application info
	fmt.Fprintf(w, "# HELP tidslinjal_info Application information.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_info gauge\n")
	fmt.Fprintf(w, "tidslinjal_info{version=%q} 1\n\n", AppVersion)

	// Uptime
	fmt.Fprintf(w, "# HELP tidslinjal_uptime_seconds Seconds since application start.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_uptime_seconds gauge\n")
	fmt.Fprintf(w, "tidslinjal_uptime_seconds %.0f\n\n", time.Since(m.startedAt).Seconds())

	// HTTP requests
	fmt.Fprintf(w, "# HELP tidslinjal_http_requests_total Total HTTP requests.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_http_requests_total counter\n")
	fmt.Fprintf(w, "tidslinjal_http_requests_total %d\n\n", m.httpRequestsTotal.Load())

	// Events
	fmt.Fprintf(w, "# HELP tidslinjal_events_total Total events by action.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_events_total counter\n")
	fmt.Fprintf(w, "tidslinjal_events_total{action=\"created\"} %d\n", m.eventsCreated.Load())
	fmt.Fprintf(w, "tidslinjal_events_total{action=\"updated\"} %d\n", m.eventsUpdated.Load())
	fmt.Fprintf(w, "tidslinjal_events_total{action=\"deleted\"} %d\n\n", m.eventsDeleted.Load())

	// Event count (gauge)
	eventCount := len(app.store.GetEventsInRange(time.Time{}, time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)))
	fmt.Fprintf(w, "# HELP tidslinjal_events_count Current number of events.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_events_count gauge\n")
	fmt.Fprintf(w, "tidslinjal_events_count %d\n\n", eventCount)

	// Users
	userCount := len(app.store.GetUsers())
	fmt.Fprintf(w, "# HELP tidslinjal_users_count Current number of users.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_users_count gauge\n")
	fmt.Fprintf(w, "tidslinjal_users_count %d\n\n", userCount)

	// SSE connections
	fmt.Fprintf(w, "# HELP tidslinjal_sse_connections_active Active SSE connections.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_sse_connections_active gauge\n")
	fmt.Fprintf(w, "tidslinjal_sse_connections_active %d\n\n", m.sseConnectionsActive.Load())

	// Webhooks
	fmt.Fprintf(w, "# HELP tidslinjal_webhooks_total Total webhooks by status.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_webhooks_total counter\n")
	fmt.Fprintf(w, "tidslinjal_webhooks_total{status=\"sent\"} %d\n", m.webhooksSent.Load())
	fmt.Fprintf(w, "tidslinjal_webhooks_total{status=\"failed\"} %d\n\n", m.webhooksFailed.Load())

	// Ingest
	fmt.Fprintf(w, "# HELP tidslinjal_ingest_total Total ingested messages by status.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_ingest_total counter\n")
	fmt.Fprintf(w, "tidslinjal_ingest_total{status=\"received\"} %d\n", m.ingestReceived.Load())
	fmt.Fprintf(w, "tidslinjal_ingest_total{status=\"accepted\"} %d\n", m.ingestAccepted.Load())
	fmt.Fprintf(w, "tidslinjal_ingest_total{status=\"error\"} %d\n\n", m.ingestErrors.Load())

	// Routing
	fmt.Fprintf(w, "# HELP tidslinjal_routing_rules_matched_total Total routing rule matches.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_routing_rules_matched_total counter\n")
	fmt.Fprintf(w, "tidslinjal_routing_rules_matched_total %d\n\n", m.routingRulesMatched.Load())

	// Connectors
	fmt.Fprintf(w, "# HELP tidslinjal_connector_polls_total Total connector polls.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_connector_polls_total counter\n")
	fmt.Fprintf(w, "tidslinjal_connector_polls_total %d\n", m.connectorPollsTotal.Load())
	fmt.Fprintf(w, "# HELP tidslinjal_connector_poll_errors_total Total connector poll errors.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_connector_poll_errors_total counter\n")
	fmt.Fprintf(w, "tidslinjal_connector_poll_errors_total %d\n\n", m.connectorPollErrors.Load())

	// Go runtime
	fmt.Fprintf(w, "# HELP tidslinjal_go_goroutines Number of goroutines.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_go_goroutines gauge\n")
	fmt.Fprintf(w, "tidslinjal_go_goroutines %d\n\n", runtime.NumGoroutine())

	fmt.Fprintf(w, "# HELP tidslinjal_go_memstats_alloc_bytes Current memory allocation.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_go_memstats_alloc_bytes gauge\n")
	fmt.Fprintf(w, "tidslinjal_go_memstats_alloc_bytes %d\n\n", memStats.Alloc)

	fmt.Fprintf(w, "# HELP tidslinjal_go_memstats_sys_bytes Total memory obtained from OS.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_go_memstats_sys_bytes gauge\n")
	fmt.Fprintf(w, "tidslinjal_go_memstats_sys_bytes %d\n\n", memStats.Sys)

	// Layers and groups
	layerCount := len(app.store.GetAllLayers())
	groupCount := len(app.store.GetGroups())
	fmt.Fprintf(w, "# HELP tidslinjal_layers_count Current number of layers.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_layers_count gauge\n")
	fmt.Fprintf(w, "tidslinjal_layers_count %d\n\n", layerCount)

	fmt.Fprintf(w, "# HELP tidslinjal_groups_count Current number of groups.\n")
	fmt.Fprintf(w, "# TYPE tidslinjal_groups_count gauge\n")
	fmt.Fprintf(w, "tidslinjal_groups_count %d\n\n", groupCount)
}
