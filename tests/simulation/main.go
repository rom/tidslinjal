// tests/simulation/main.go — Long-running simulation / stress test for Tidslinjal.
//
// This framework simulates real user interactions over an extended period (2, 4, 6, or 10 days)
// to verify stability: no hangs, freezes, panics, or crashes under sustained load.
//
// It starts the Tidslinjal binary, then runs multiple concurrent virtual users that
// continuously perform realistic operations (login, create events, update events, add comments,
// query the API, etc.). Any abnormal behaviour (process death, panic output, hung requests)
// is recorded in a structured JSON log and summarised at the end.
//
// Usage:
//
//	go run ./tests/simulation [flags]
//
// Flags:
//
//	-duration 2d           Run for 2 days  (also accepts 4d, 6d, 10d, or Go duration strings like 48h)
//	-users    5            Number of concurrent virtual users (default 5)
//	-port     19090        Port for the embedded test server (default 19090)
//	-binary   ./tidslinjal Path to the pre-built tidslinjal binary (built if missing)
//	-log      sim.log.json Path for the structured JSON event log (default: simulation.log.json)
//	-verbose               Print each simulated action to stdout
//	-no-restart            Do not auto-restart the server if it crashes; just log and stop

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// ── Constants / defaults ──────────────────────────────────────────────────────

const (
	defaultPort     = "19090"
	defaultUsers    = 5
	defaultDuration = 2 * 24 * time.Hour
	defaultBinary   = "./tidslinjal"
	defaultLogFile  = "simulation.log.json"

	// HTTP timeout for each simulated request
	requestTimeout = 15 * time.Second

	// How long to wait for the server to come up after (re)start
	serverStartTimeout = 30 * time.Second

	// Delay between action batches for a single virtual user
	minThinkTime = 500 * time.Millisecond
	maxThinkTime = 4 * time.Second

	// Delay before restarting after a crash
	restartDelay = 5 * time.Second
)

// ── Log event types ───────────────────────────────────────────────────────────

type EventKind string

const (
	KindInfo       EventKind = "info"
	KindAction     EventKind = "action"
	KindError      EventKind = "error"
	KindCrash      EventKind = "crash"
	KindRestart    EventKind = "restart"
	KindHang       EventKind = "hang"
	KindCheckpoint EventKind = "checkpoint"
	KindSummary    EventKind = "summary"
)

// LogEvent is one entry in the structured JSON log.
type LogEvent struct {
	Time     time.Time         `json:"time"`
	Kind     EventKind         `json:"kind"`
	User     string            `json:"user,omitempty"`
	Action   string            `json:"action,omitempty"`
	Status   int               `json:"http_status,omitempty"`
	Duration time.Duration     `json:"duration_ms,omitempty"`
	Message  string            `json:"message,omitempty"`
	Extra    map[string]string `json:"extra,omitempty"`
}

// ── Simulation state ──────────────────────────────────────────────────────────

type Stats struct {
	TotalRequests  atomic.Int64
	TotalErrors    atomic.Int64
	TotalCrashes   atomic.Int64
	TotalRestarts  atomic.Int64
	TotalHangs     atomic.Int64
	ActionCounts   sync.Map // action name → int64
}

func (s *Stats) incAction(action string) {
	v, _ := s.ActionCounts.LoadOrStore(action, new(atomic.Int64))
	v.(*atomic.Int64).Add(1)
}

type Simulation struct {
	cfg        Config
	stats      Stats
	logMu      sync.Mutex
	logFile    *os.File
	logEncoder *json.Encoder
	serverCmd  *exec.Cmd
	serverMu   sync.Mutex
	serverPID  int
	baseURL    string
	dataDir    string
	verbose    bool
	noRestart  bool
	startedAt  time.Time
}

type Config struct {
	Duration    time.Duration
	UserCount   int
	Port        string
	BinaryPath  string
	LogFilePath string
	Verbose     bool
	NoRestart   bool
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	cfg := parseFlags()

	sim := &Simulation{
		cfg:       cfg,
		verbose:   cfg.Verbose,
		noRestart: cfg.NoRestart,
		baseURL:   "http://localhost:" + cfg.Port,
	}

	// Open log file
	lf, err := os.OpenFile(cfg.LogFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		log.Fatalf("cannot open log file %s: %v", cfg.LogFilePath, err)
	}
	defer lf.Close()
	sim.logFile    = lf
	sim.logEncoder = json.NewEncoder(lf)

	sim.emit(KindInfo, "", "", 0, 0,
		fmt.Sprintf("Simulation starting: duration=%s users=%d port=%s binary=%s",
			cfg.Duration, cfg.UserCount, cfg.Port, cfg.BinaryPath), nil)

	// Build binary if missing
	if _, err := os.Stat(cfg.BinaryPath); os.IsNotExist(err) {
		sim.emit(KindInfo, "", "", 0, 0, "Building tidslinjal binary…", nil)
		if err := buildBinary(cfg.BinaryPath); err != nil {
			log.Fatalf("build failed: %v", err)
		}
	}

	// Create temp data directory
	sim.dataDir, err = os.MkdirTemp("", "tidslinjal-sim-")
	if err != nil {
		log.Fatalf("cannot create data dir: %v", err)
	}
	defer os.RemoveAll(sim.dataDir)

	sim.startedAt = time.Now()

	// Start server
	if err := sim.startServer(); err != nil {
		log.Fatalf("cannot start server: %v", err)
	}
	defer sim.stopServer()

	// Handle Ctrl+C / SIGTERM
	ctx, cancel := context.WithTimeout(context.Background(), cfg.Duration)
	defer cancel()
	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
		<-ch
		sim.emit(KindInfo, "", "", 0, 0, "Interrupt received — stopping simulation", nil)
		cancel()
	}()

	// Start checkpoint ticker (hourly summary)
	go sim.checkpointLoop(ctx)

	// Launch virtual users
	var wg sync.WaitGroup
	for i := 0; i < cfg.UserCount; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sim.runVirtualUser(ctx, idx)
		}(i)
	}

	wg.Wait()
	sim.printSummary()
}

// ── Flag parsing ──────────────────────────────────────────────────────────────

func parseFlags() Config {
	var (
		durationStr = flag.String("duration", "2d", "Simulation duration (e.g. 2d, 4d, 6d, 10d, 48h)")
		users       = flag.Int("users", defaultUsers, "Number of concurrent virtual users")
		port        = flag.String("port", defaultPort, "TCP port for the embedded Tidslinjal server")
		binary      = flag.String("binary", defaultBinary, "Path to the tidslinjal binary (built if absent)")
		logFile     = flag.String("log", defaultLogFile, "JSON log file path")
		verbose     = flag.Bool("verbose", false, "Print every simulated action to stdout")
		noRestart   = flag.Bool("no-restart", false, "Do not auto-restart server after a crash")
	)
	flag.Parse()

	dur := parseDuration(*durationStr)

	return Config{
		Duration:    dur,
		UserCount:   *users,
		Port:        *port,
		BinaryPath:  *binary,
		LogFilePath: *logFile,
		Verbose:     *verbose,
		NoRestart:   *noRestart,
	}
}

func parseDuration(s string) time.Duration {
	// Accept shorthand like "2d", "10d"
	if len(s) > 1 && s[len(s)-1] == 'd' {
		days := 0
		fmt.Sscanf(s, "%d", &days)
		if days > 0 {
			return time.Duration(days) * 24 * time.Hour
		}
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		log.Fatalf("invalid duration %q: %v", s, err)
	}
	return d
}

// ── Binary build ──────────────────────────────────────────────────────────────

func buildBinary(target string) error {
	// Find module root (directory containing go.mod)
	root := findModuleRoot()
	cmd := exec.Command("go", "build", "-o", target, ".")
	cmd.Dir  = root
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func findModuleRoot() string {
	_, file, _, _ := runtime.Caller(0)
	// tests/simulation/main.go → go up two levels
	return filepath.Join(filepath.Dir(file), "..", "..")
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

func (sim *Simulation) startServer() error {
	sim.serverMu.Lock()
	defer sim.serverMu.Unlock()

	cmd := exec.Command(sim.cfg.BinaryPath,
		"--port", sim.cfg.Port,
		"--data", sim.dataDir,
		"--verbose",
	)
	cmd.Stdout = os.Stderr // route server output to our stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start server: %w", err)
	}
	sim.serverCmd = cmd
	sim.serverPID = cmd.Process.Pid
	sim.emit(KindInfo, "", "", 0, 0,
		fmt.Sprintf("Server started PID=%d port=%s", sim.serverPID, sim.cfg.Port), nil)

	// Monitor server exit in background
	go sim.monitorServer()

	// Wait for HTTP readiness
	return sim.waitForServer()
}

func (sim *Simulation) monitorServer() {
	cmd := sim.serverCmd
	err := cmd.Wait()
	code := -1
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	sim.emit(KindCrash, "", "", 0, 0,
		fmt.Sprintf("Server process exited: code=%d err=%v", code, err),
		map[string]string{"pid": fmt.Sprint(sim.serverPID)})
	sim.stats.TotalCrashes.Add(1)

	if sim.noRestart {
		return
	}
	// Restart after a short delay
	time.Sleep(restartDelay)
	sim.emit(KindRestart, "", "", 0, 0, "Restarting server…", nil)
	sim.stats.TotalRestarts.Add(1)
	if err := sim.startServer(); err != nil {
		sim.emit(KindError, "", "", 0, 0, "Server restart failed: "+err.Error(), nil)
	}
}

func (sim *Simulation) stopServer() {
	sim.serverMu.Lock()
	defer sim.serverMu.Unlock()
	if sim.serverCmd != nil && sim.serverCmd.Process != nil {
		_ = sim.serverCmd.Process.Kill()
	}
}

func (sim *Simulation) waitForServer() error {
	deadline := time.Now().Add(serverStartTimeout)
	for time.Now().Before(deadline) {
		resp, err := http.Get(sim.baseURL + "/api/version") //nolint:gosec
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("server did not become ready within %s", serverStartTimeout)
}

// ── Logging ───────────────────────────────────────────────────────────────────

func (sim *Simulation) emit(kind EventKind, user, action string, status int, dur time.Duration, msg string, extra map[string]string) {
	ev := LogEvent{
		Time:     time.Now(),
		Kind:     kind,
		User:     user,
		Action:   action,
		Status:   status,
		Duration: dur / time.Millisecond, // store as ms
		Message:  msg,
		Extra:    extra,
	}
	sim.logMu.Lock()
	_ = sim.logEncoder.Encode(ev)
	sim.logMu.Unlock()

	if sim.verbose || kind != KindAction {
		prefix := ""
		switch kind {
		case KindCrash:
			prefix = "💥 CRASH"
		case KindError:
			prefix = "⚠ ERROR"
		case KindRestart:
			prefix = "🔄 RESTART"
		case KindHang:
			prefix = "⏳ HANG"
		case KindCheckpoint:
			prefix = "📊 CHECKPOINT"
		case KindSummary:
			prefix = "📋 SUMMARY"
		case KindAction:
			prefix = fmt.Sprintf("  [%s]", user)
		default:
			prefix = "ℹ INFO"
		}
		log.Printf("%s %s", prefix, msg)
	}
}

// ── Checkpoint / hourly summary ───────────────────────────────────────────────

func (sim *Simulation) checkpointLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			elapsed := time.Since(sim.startedAt).Round(time.Minute)
			msg := fmt.Sprintf(
				"Checkpoint at %s: requests=%d errors=%d crashes=%d restarts=%d hangs=%d",
				elapsed,
				sim.stats.TotalRequests.Load(),
				sim.stats.TotalErrors.Load(),
				sim.stats.TotalCrashes.Load(),
				sim.stats.TotalRestarts.Load(),
				sim.stats.TotalHangs.Load(),
			)
			sim.emit(KindCheckpoint, "", "", 0, 0, msg, nil)
		}
	}
}

// ── Final summary ─────────────────────────────────────────────────────────────

func (sim *Simulation) printSummary() {
	elapsed := time.Since(sim.startedAt).Round(time.Second)
	msg := fmt.Sprintf(
		"Simulation complete. Duration=%s Requests=%d Errors=%d Crashes=%d Restarts=%d Hangs=%d",
		elapsed,
		sim.stats.TotalRequests.Load(),
		sim.stats.TotalErrors.Load(),
		sim.stats.TotalCrashes.Load(),
		sim.stats.TotalRestarts.Load(),
		sim.stats.TotalHangs.Load(),
	)
	sim.emit(KindSummary, "", "", 0, 0, msg, nil)
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Println("  SIMULATION SUMMARY")
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Println(msg)
	fmt.Println()
	fmt.Printf("  Action breakdown:\n")
	sim.stats.ActionCounts.Range(func(k, v interface{}) bool {
		fmt.Printf("    %-30s %d\n", k, v.(*atomic.Int64).Load())
		return true
	})
	fmt.Println()
	fmt.Printf("  Log written to: %s\n", sim.cfg.LogFilePath)

	crashes := sim.stats.TotalCrashes.Load()
	errors  := sim.stats.TotalErrors.Load()
	if crashes == 0 && errors == 0 {
		fmt.Println("  ✅ No crashes or errors recorded — stability looks good.")
	} else {
		if crashes > 0 {
			fmt.Printf("  ❌ %d server crash(es) detected!\n", crashes)
		}
		if errors > 0 {
			fmt.Printf("  ⚠  %d request error(s) recorded.\n", errors)
		}
		fmt.Println("  Review the log file for details.")
	}
	fmt.Println("═══════════════════════════════════════════════════════")
}

// ── Virtual User ──────────────────────────────────────────────────────────────

// VirtualUser holds the HTTP client and session state for one simulated user.
type VirtualUser struct {
	sim       *Simulation
	name      string
	client    *http.Client
	sessionOK bool
	userID    int64
	eventIDs  []int64
	layerIDs  []int64
}

func (sim *Simulation) runVirtualUser(ctx context.Context, idx int) {
	jar, _ := cookiejar.New(nil)
	vu := &VirtualUser{
		sim:  sim,
		name: fmt.Sprintf("simuser%d", idx),
		client: &http.Client{
			Jar:     jar,
			Timeout: requestTimeout,
		},
	}

	// Create account and login
	vu.ensureAccount()

	// Action pool — each action is a function that returns an error
	actions := []struct {
		name   string
		weight int // relative frequency
		fn     func() error
	}{
		{"login", 1, vu.actionLogin},
		{"get_events", 5, vu.actionGetEvents},
		{"create_event", 3, vu.actionCreateEvent},
		{"update_event", 2, vu.actionUpdateEvent},
		{"delete_event", 1, vu.actionDeleteEvent},
		{"add_comment", 3, vu.actionAddComment},
		{"get_layers", 3, vu.actionGetLayers},
		{"create_layer", 1, vu.actionCreateLayer},
		{"get_preferences", 2, vu.actionGetPreferences},
		{"get_users", 1, vu.actionGetUsers},
		{"get_version", 2, vu.actionGetVersion},
		{"get_audit", 1, vu.actionGetAudit},
		{"get_exercise", 1, vu.actionGetExercise},
		{"get_alarms", 2, vu.actionGetAlarms},
		{"export_json", 1, vu.actionExport},
		{"change_preference", 1, vu.actionChangePreference},
	}

	// Build weighted list
	var pool []func() error
	var poolNames []string
	for _, a := range actions {
		for i := 0; i < a.weight; i++ {
			pool = append(pool, a.fn)
			poolNames = append(poolNames, a.name)
		}
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(idx)))

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Occasionally re-login (session may have expired)
		if !vu.sessionOK || rng.Intn(50) == 0 {
			vu.actionLogin() //nolint
		}

		// Pick a random action
		i := rng.Intn(len(pool))
		actionName := poolNames[i]
		start := time.Now()
		err := pool[i]()
		dur := time.Since(start)

		sim.stats.TotalRequests.Add(1)
		sim.stats.incAction(actionName)

		if err != nil {
			sim.stats.TotalErrors.Add(1)
			sim.emit(KindError, vu.name, actionName, 0, dur,
				fmt.Sprintf("action %s failed: %v", actionName, err), nil)
		} else {
			sim.emit(KindAction, vu.name, actionName, 200, dur,
				fmt.Sprintf("%s → ok (%dms)", actionName, dur.Milliseconds()), nil)
		}

		// Detect hung requests (already caught by HTTP client timeout, but log separately)
		if dur > requestTimeout-time.Second {
			sim.stats.TotalHangs.Add(1)
			sim.emit(KindHang, vu.name, actionName, 0, dur,
				fmt.Sprintf("slow/hung request: action=%s duration=%s", actionName, dur), nil)
		}

		// Think time
		think := minThinkTime + time.Duration(rng.Int63n(int64(maxThinkTime-minThinkTime)))
		select {
		case <-ctx.Done():
			return
		case <-time.After(think):
		}
	}
}

// ── Account management ────────────────────────────────────────────────────────

func (vu *VirtualUser) ensureAccount() {
	// Try to register; ignore conflicts (user already exists)
	body := map[string]interface{}{
		"username":     vu.name,
		"password":     vu.name + "_pass",
		"display_name": "Sim User " + vu.name,
	}
	vu.post("/api/auth/register", body) //nolint
	vu.actionLogin()                   //nolint
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func (vu *VirtualUser) do(method, path string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, vu.sim.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	return vu.client.Do(req)
}

func (vu *VirtualUser) get(path string) (*http.Response, error) {
	return vu.do("GET", path, nil)
}

func (vu *VirtualUser) post(path string, body interface{}) (*http.Response, error) {
	return vu.do("POST", path, body)
}

func (vu *VirtualUser) put(path string, body interface{}) (*http.Response, error) {
	return vu.do("PUT", path, body)
}

func (vu *VirtualUser) delete(path string) (*http.Response, error) {
	return vu.do("DELETE", path, nil)
}

func drain(resp *http.Response) {
	if resp != nil && resp.Body != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func decode(resp *http.Response, v interface{}) error {
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(v)
}

// ── Actions ───────────────────────────────────────────────────────────────────

func (vu *VirtualUser) actionLogin() error {
	resp, err := vu.post("/api/auth/login", map[string]string{
		"username": vu.name,
		"password": vu.name + "_pass",
	})
	if err != nil {
		vu.sessionOK = false
		return err
	}
	defer drain(resp)
	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		vu.sessionOK = true
		return nil
	}
	vu.sessionOK = false
	return fmt.Errorf("login returned %d", resp.StatusCode)
}

func (vu *VirtualUser) actionGetVersion() error {
	resp, err := vu.get("/api/version")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("version: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetEvents() error {
	now := time.Now()
	from := url.QueryEscape(now.AddDate(0, 0, -7).Format(time.RFC3339))
	to   := url.QueryEscape(now.AddDate(0, 0, 30).Format(time.RFC3339))
	resp, err := vu.get(fmt.Sprintf("/api/events?from=%s&to=%s", from, to))
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("get_events: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionCreateEvent() error {
	now := time.Now()
	types := []string{"event", "mote", "decision", "checkpoint"}
	statuses := []string{"planned", "active"}
	body := map[string]interface{}{
		"title":      fmt.Sprintf("Sim event %d by %s", time.Now().UnixMilli(), vu.name),
		"event_type": types[rand.Intn(len(types))],
		"status":     statuses[rand.Intn(len(statuses))],
		"start_time": now.Format(time.RFC3339),
		"end_time":   now.Add(time.Duration(30+rand.Intn(90)) * time.Minute).Format(time.RFC3339),
	}
	resp, err := vu.post("/api/events", body)
	if err != nil {
		return err
	}
	var result struct{ ID int64 `json:"id"` }
	if err := decode(resp, &result); err != nil {
		return err
	}
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("create_event: %d", resp.StatusCode)
	}
	if result.ID > 0 {
		vu.eventIDs = append(vu.eventIDs, result.ID)
		// Keep list bounded
		if len(vu.eventIDs) > 20 {
			vu.eventIDs = vu.eventIDs[len(vu.eventIDs)-20:]
		}
	}
	return nil
}

func (vu *VirtualUser) actionUpdateEvent() error {
	if len(vu.eventIDs) == 0 {
		return nil
	}
	id := vu.eventIDs[rand.Intn(len(vu.eventIDs))]
	now := time.Now()
	body := map[string]interface{}{
		"title":      fmt.Sprintf("Updated sim event %d", time.Now().UnixMilli()),
		"event_type": "event",
		"status":     "active",
		"start_time": now.Format(time.RFC3339),
		"end_time":   now.Add(time.Hour).Format(time.RFC3339),
	}
	resp, err := vu.put(fmt.Sprintf("/api/events/%d", id), body)
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("update_event: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionDeleteEvent() error {
	if len(vu.eventIDs) == 0 {
		return nil
	}
	idx := rand.Intn(len(vu.eventIDs))
	id  := vu.eventIDs[idx]
	resp, err := vu.delete(fmt.Sprintf("/api/events/%d", id))
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode == 200 || resp.StatusCode == 204 {
		// Remove from local list
		vu.eventIDs = append(vu.eventIDs[:idx], vu.eventIDs[idx+1:]...)
	}
	return nil
}

func (vu *VirtualUser) actionAddComment() error {
	if len(vu.eventIDs) == 0 {
		return nil
	}
	id := vu.eventIDs[rand.Intn(len(vu.eventIDs))]
	resp, err := vu.post(fmt.Sprintf("/api/events/%d/comments", id), map[string]string{
		"content": fmt.Sprintf("Simulation comment at %s by %s", time.Now().Format(time.RFC3339), vu.name),
	})
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("add_comment: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetLayers() error {
	resp, err := vu.get("/api/layers")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("get_layers: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionCreateLayer() error {
	colors := []string{"#E74C3C", "#2ECC71", "#3498DB", "#F39C12", "#9B59B6"}
	body := map[string]interface{}{
		"name":       fmt.Sprintf("Sim layer %s %d", vu.name, time.Now().UnixMilli()),
		"color":      colors[rand.Intn(len(colors))],
		"visibility": "shared",
	}
	resp, err := vu.post("/api/layers", body)
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("create_layer: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetPreferences() error {
	resp, err := vu.get("/api/preferences")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("get_preferences: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionChangePreference() error {
	themes := []string{"light", "dark"}
	langs  := []string{"en", "sv", "fr"}
	body := map[string]interface{}{
		"theme":    themes[rand.Intn(len(themes))],
		"language": langs[rand.Intn(len(langs))],
	}
	resp, err := vu.put("/api/preferences", body)
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("change_preference: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetUsers() error {
	resp, err := vu.get("/api/users")
	if err != nil {
		return err
	}
	defer drain(resp)
	// 403 is acceptable for non-admin users
	if resp.StatusCode != 200 && resp.StatusCode != 403 {
		return fmt.Errorf("get_users: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetAudit() error {
	resp, err := vu.get("/api/audit")
	if err != nil {
		return err
	}
	defer drain(resp)
	// 403 acceptable for non-admin
	if resp.StatusCode != 200 && resp.StatusCode != 403 {
		return fmt.Errorf("get_audit: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetExercise() error {
	resp, err := vu.get("/api/exercise")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("get_exercise: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionGetAlarms() error {
	resp, err := vu.get("/api/alarms")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 {
		return fmt.Errorf("get_alarms: %d", resp.StatusCode)
	}
	return nil
}

func (vu *VirtualUser) actionExport() error {
	resp, err := vu.get("/api/export")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != 200 && resp.StatusCode != 403 {
		return fmt.Errorf("export: %d", resp.StatusCode)
	}
	return nil
}
