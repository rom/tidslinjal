# Software Quality Assessment — Tidslinjal v8.0.0

**Date**: 2026-03-18
**Codebase**: ~30,400 lines Go + ~100,000 lines frontend (JS/CSS/HTML)
**Dependencies**: 1 Go (`golang.org/x/crypto`), 1 npm (`leaflet`)

---

## Executive Summary

Tidslinjal is a mature, well-structured operational timeline application. The codebase demonstrates strong security practices, good modularity, comprehensive test coverage, and minimal external dependencies. Key areas for improvement are CI/CD automation, linting configuration, and some error handling patterns.

**Overall Score: 7.5/10**

| Category | Score | Notes |
|----------|-------|-------|
| Code Organization | 8/10 | Excellent domain separation, monolithic store could split further |
| Type Safety | 9/10 | Strong use of Go's type system, minimal `interface{}` |
| Error Handling | 6/10 | Good on critical paths, too many silent failures in async ops |
| Naming & Consistency | 9/10 | Exemplary conventions throughout |
| Security | 8.5/10 | Comprehensive hardening (XSS, SSRF, CSRF, rate limiting, CSP) |
| Test Coverage | 8/10 | 280+ tests, good edge cases, gaps in security/validation testing |
| Build & CI/CD | 5/10 | No CI/CD pipeline, no linting config, no pre-commit hooks |
| Documentation | 8/10 | Thorough user docs in 16 languages, security assessments included |
| Dependencies | 9/10 | Minimal surface area, trusted sources, pinned versions |
| API Design | 8/10 | Clean REST structure, consistent patterns, lacks versioning |

---

## 1. Code Organization & Architecture

### Strengths
- **Clean domain separation**: 38 handler files organized by feature (auth, events, admin, OIDC, etc.)
- **Modular store layer**: 12 `store_*.go` files with specialized persistence concerns
- **Pluggable connector system**: Clean `Connector` interface with 6 implementations (GitHub, Jira, Google Calendar, LDAP, STIX, ADatP-3)
- **Layered architecture**: HTTP handlers → App business logic → Store persistence
- **Infrastructure isolation**: SSE broker, event bus, metrics, and background tasks in dedicated files

### Concerns
- **Single Go package**: All code in `package main` limits reusability and testability
- **Large model file**: `models.go` at 1,785 lines with 83+ type definitions could be split
- **No store interface**: The `Store` struct has 100+ methods with no interface abstraction, making it harder to mock in tests

---

## 2. Security Posture

### Implemented Protections
- **XSS prevention**: `stripHTMLTags()` applied to all user inputs; CSP headers block inline scripts
- **SSRF protection**: Custom HTTP transport blocks private/loopback IPs for webhooks and references
- **CSRF protection**: `X-Requested-With` header required for state-changing requests
- **Rate limiting**: IP-based with progressive lockout (5 failures → 15min, 10 → 1hr, 20+ → 4hr)
- **Timing attack mitigation**: Dummy bcrypt comparison for non-existent users
- **Session security**: HttpOnly, Secure, SameSite=Lax cookie flags
- **Proxy header trust**: Only trusts X-Forwarded-For from private/loopback peers
- **Password hashing**: bcrypt with default cost via `golang.org/x/crypto`
- **Random admin password**: Generated with `crypto/rand` on first run
- **CSP headers**: Strict Content-Security-Policy with frame-ancestors 'none'
- **Request body limits**: 1 MB default, 10 MB for bulk ingestion

### Remaining Risks
- **No API versioning**: Breaking changes cannot be rolled out gradually
- **Personal login info exposure**: `PrevLoginIP` and `PrevLoginDomain` visible in public user view (information leak)
- **Silent webhook drops**: Queue-full webhooks are silently discarded without notification
- **Shutdown race**: `webhookCh` close in `Stop()` could race with active workers

---

## 3. Error Handling

### Good Patterns
- Consistent `jsonError(w, msg, code)` wrapper for HTTP error responses
- Proper error wrapping with context in validation functions
- Rate limiter communicates errors clearly

### Issues Found
- **~90+ `//nolint:errcheck` directives** across the codebase — many are justified (bcrypt timing mitigation) but some silence legitimate error paths
- **Silent failures in async operations**: Webhook JSON marshaling errors, audit log write errors, and email send errors are logged but not propagated or retried
- **Fire-and-forget patterns**: `app.Broadcast()` and `eventBus.Publish()` silently drop messages when channels are full

### Recommendation
Audit all `//nolint` directives. For async operations, consider at minimum structured error logging with alerting capability.

---

## 4. Test Suite

### Coverage Summary
- **157 Go tests** across 8 test files (store, API, connectors, ICS, routing, ingestion, event bus)
- **123 JavaScript unit tests** for utility functions
- **22+ Playwright E2E tests** for authentication and timeline UI
- **All tests passing** (Go: 25.6s with `-short`, JS: 123/123)
- **`go vet` clean** — no static analysis warnings

### Test Strengths
- Comprehensive CRUD and permission testing for all API endpoints
- XSS payload testing with special characters and script tags
- Concurrent read/write stress tests (20+ goroutines)
- Role hierarchy boundary testing across all 8 role levels
- ICS/iCalendar format compliance testing (RFC 5545)
- Date boundary edge cases (leap years, month wrapping)

### Test Gaps
- No rate limiting or DoS protection tests
- Limited API payload validation testing (malformed JSON, oversized payloads)
- E2E tests use overly flexible CSS selectors (brittle across UI changes)
- No performance regression tests
- No snapshot or visual regression tests for the frontend

---

## 5. Build & Tooling

### Current State
- **Build**: `go build -o tidslinjal ./...` (single binary, ~30K lines)
- **Test**: `go test ./...` and `node tests/js/test_utils.js`
- **No CI/CD pipeline**: No GitHub Actions, GitLab CI, or equivalent
- **No linting config**: No `.golangci.yml`, `.eslintrc`, or `.prettierrc`
- **No pre-commit hooks**: No automated checks before commits
- **No Makefile or build script**: Commands documented but not automated
- **Hardcoded Playwright path**: E2E config references specific chromium binary path (not portable)

### Recommendations
1. Add `.golangci.yml` with `gosec`, `errorlint`, `ineffassign`, `staticcheck`
2. Add `.eslintrc.json` for frontend JavaScript
3. Create a `Makefile` with `build`, `test`, `lint`, `e2e` targets
4. Set up GitHub Actions for automated testing on push/PR
5. Add pre-commit hooks for formatting and linting

---

## 6. Code Duplication

### Identified Duplications
- **XML/HTML escaping**: `xmlEscape()` and `xmlEsc()` implement the same logic independently in `helpers.go`
- **Language parameter validation**: Same character-by-character validation appears twice in `main.go` (lines 57-67 and 108-117)
- **Security headers**: `securityHeaders()` and `securityHeadersWithHSTS()` duplicate most header-setting logic in `middleware.go`
- **Event sanitization**: Identical `stripHTMLTags()` calls repeated in create and update handlers

### Assessment
Duplication is moderate and mostly in boilerplate code. Not a major concern but could be consolidated.

---

## 7. Concurrency & State Management

### Strengths
- **Smart locking strategy**: RWMutex for in-memory data + separate writeMu for file I/O (minimizes lock hold time)
- **Copy-on-write persistence**: Snapshots taken before disk writes to avoid holding locks during I/O
- **Bounded worker pools**: Webhook workers capped at 32 concurrent, channel capacity 256
- **SSE broker indexing**: O(1) targeted delivery via `byUser` map

### Concerns
- **Shutdown race condition**: `Close(app.webhookCh)` in `Stop()` may race with workers reading from the channel
- **Silent message drops**: Event bus and webhook queue silently drop messages when full
- **No backpressure**: Full queues don't signal upstream to slow down

---

## 8. Documentation

### Strengths
- Comprehensive README (1,550+ lines) with full API reference
- User manual translated into 12 languages (16 total with language support)
- Dedicated security assessments (v1 and v2) documenting vulnerabilities and fixes
- Test documentation listing every test with descriptions
- OIDC, TLS, and performance analysis docs

### Gaps
- No CONTRIBUTING.md or developer setup guide
- No API documentation separate from README (no OpenAPI/Swagger spec)
- No architecture decision records (ADRs)
- No CLAUDE.md for AI-assisted development context

---

## 9. Dependency Health

### Go Dependencies
| Dependency | Version | Status |
|-----------|---------|--------|
| `golang.org/x/crypto` | v0.48.0 | Current, trusted source |

### npm Dependencies
| Dependency | Version | Status |
|-----------|---------|--------|
| `leaflet` | ^1.9.4 | Stable, well-maintained |
| `@playwright/test` | ^1.46.0 | Dev only, recent |

**Assessment**: Exceptionally minimal dependency surface. This is a major strength — reduces supply chain risk and maintenance burden.

---

## 10. Key Recommendations (Priority Order)

1. **Add CI/CD pipeline** — Automated testing on every push/PR is the single highest-impact improvement
2. **Add linting configuration** — `golangci-lint` for Go, ESLint for JS to catch issues early
3. **Audit `//nolint` directives** — Ensure each suppression is justified and documented
4. **Fix shutdown race** — Add proper drain logic for webhook workers before closing channel
5. **Add API versioning** — Even a `/api/v1/` prefix enables future non-breaking evolution
6. **Extract store interface** — Enables easier testing and potential future storage backend swaps
7. **Add pre-commit hooks** — Enforce formatting and lint checks locally
8. **Consolidate duplicate utilities** — Merge `xmlEscape`/`xmlEsc` and extract shared validation
9. **Improve E2E test selectors** — Use data-testid attributes for stable test targeting
10. **Add CONTRIBUTING.md** — Lower the barrier for new contributors
