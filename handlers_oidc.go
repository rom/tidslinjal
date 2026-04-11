package main

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ── OIDC settings handler ───────────────────────────────────────────────────────

func (app *App) handleOIDCSettings(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.Method {
	case http.MethodGet:
		cfg := app.store.GetOIDCSettings()
		// Never expose client secret to the frontend; send a placeholder if set
		out := map[string]interface{}{
			"enabled":      cfg.Enabled,
			"issuer":       cfg.Issuer,
			"client_id":    cfg.ClientID,
			"redirect_url": cfg.RedirectURL,
			"exclusive":    cfg.Exclusive,
			"default_role": cfg.DefaultRole,
			"has_secret":   cfg.ClientSecret != "",
		}
		jsonOK(w, out)
	case http.MethodPut:
		var req struct {
			Enabled      bool   `json:"enabled"`
			Issuer       string `json:"issuer"`
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
			RedirectURL  string `json:"redirect_url"`
			Exclusive    bool   `json:"exclusive"`
			DefaultRole  string `json:"default_role"`
		}
		if err := decode(r, &req); err != nil {
			jsonError(w, "invalid request", http.StatusBadRequest)
			return
		}
		existing := app.store.GetOIDCSettings()
		// Preserve existing secret if a blank value is submitted (means "keep it")
		secret := req.ClientSecret
		if secret == "" {
			secret = existing.ClientSecret
		}
		cfg := OIDCPersistentConfig{
			Enabled:      req.Enabled,
			Issuer:       req.Issuer,
			ClientID:     req.ClientID,
			ClientSecret: secret,
			RedirectURL:  req.RedirectURL,
			Exclusive:    req.Exclusive,
			DefaultRole:  req.DefaultRole,
		}
		if err := app.store.SaveOIDCSettings(cfg); err != nil {
			jsonError(w, "failed to save", http.StatusInternalServerError)
			return
		}
		// Apply the new config immediately if enabled, clear it if not
		if cfg.Enabled && cfg.Issuer != "" && cfg.ClientID != "" {
			if err := app.configureOIDC(cfg.Issuer, cfg.ClientID, cfg.ClientSecret, cfg.RedirectURL); err != nil {
				log.Printf("[WARN] OIDC reconfiguration failed: %v", err)
				jsonError(w, "OIDC configuration error — check server logs for details", http.StatusBadGateway)
				return
			}
			app.oidcExclusive = cfg.Exclusive
			if cfg.DefaultRole != "" {
				app.oidcDefaultRole = Role(cfg.DefaultRole)
			} else {
				app.oidcDefaultRole = RoleReadWrite
			}
		} else if !cfg.Enabled {
			app.oidc = nil
			app.oidcExclusive = false
		}
		jsonOK(w, map[string]string{"status": "ok"})
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── OIDC test / diagnostic handler ──────────────────────────────────────────────
//
// POST /api/admin/oidc/test — tests OIDC connectivity and configuration end-to-end.
// Returns a structured diagnostic report with status for each step.

func (app *App) handleOIDCTest(w http.ResponseWriter, r *http.Request, user *User) {
	if user.Role != RoleAdmin {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type stepResult struct {
		Step    string `json:"step"`
		OK      bool   `json:"ok"`
		Message string `json:"message"`
		Detail  string `json:"detail,omitempty"`
	}
	var steps []stepResult

	addStep := func(step string, ok bool, msg, detail string) {
		steps = append(steps, stepResult{Step: step, OK: ok, Message: msg, Detail: detail})
		if ok {
			logVerbose("OIDC test [%s]: OK — %s", step, msg)
		} else {
			log.Printf("[WARN] OIDC test [%s]: FAIL — %s | %s", step, msg, detail)
		}
	}

	// Step 1: Check in-memory OIDC config
	if app.oidc == nil {
		cfg := app.store.GetOIDCSettings()
		if !cfg.Enabled || cfg.Issuer == "" || cfg.ClientID == "" {
			addStep("config", false, "OIDC is not enabled or configured", "Enable OIDC and provide Issuer URL, Client ID, and Client Secret.")
			jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
			return
		}
		addStep("config", false, "OIDC settings are stored but not yet active (server not yet loaded them)", "Try saving the settings again or restarting the server.")
	} else {
		addStep("config", true,
			fmt.Sprintf("OIDC configured: issuer=%s client_id=%s", app.oidc.Issuer, app.oidc.ClientID),
			fmt.Sprintf("authorization_endpoint=%s token_endpoint=%s userinfo_endpoint=%s",
				app.oidc.AuthorizationEndpoint, app.oidc.TokenEndpoint, app.oidc.UserinfoEndpoint))
	}

	if app.oidc == nil {
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}

	// Step 2: Fetch discovery document (re-fetch live)
	discURL := strings.TrimRight(app.oidc.Issuer, "/") + "/.well-known/openid-configuration"
	log.Printf("[INFO] OIDC test: fetching discovery document from %s", discURL)
	// V3-M02 fix: use SSRF-safe transport for OIDC discovery test
	ssrfTestClient := &http.Client{Timeout: 10 * time.Second, Transport: newSSRFSafeTransport()}
	discResp, err := ssrfTestClient.Get(discURL)
	if err != nil {
		addStep("discovery", false, "Cannot reach OIDC discovery endpoint", err.Error())
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}
	defer discResp.Body.Close()
	if discResp.StatusCode != http.StatusOK {
		addStep("discovery", false,
			fmt.Sprintf("Discovery endpoint returned HTTP %d", discResp.StatusCode),
			"Expected HTTP 200. Check that the Issuer URL is correct.")
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}
	var disc map[string]interface{}
	if err := json.NewDecoder(io.LimitReader(discResp.Body, 1<<20)).Decode(&disc); err != nil {
		addStep("discovery", false, "Discovery document is not valid JSON", err.Error())
		jsonOK(w, map[string]interface{}{"steps": steps, "overall": false})
		return
	}
	discDetail := fmt.Sprintf("issuer=%v auth=%v token=%v userinfo=%v",
		disc["issuer"], disc["authorization_endpoint"], disc["token_endpoint"], disc["userinfo_endpoint"])
	addStep("discovery", true, "Discovery document fetched successfully", discDetail)

	// Step 3: Verify required fields in discovery document
	requiredFields := []string{"authorization_endpoint", "token_endpoint", "userinfo_endpoint"}
	var missingFields []string
	for _, f := range requiredFields {
		if _, ok := disc[f]; !ok {
			missingFields = append(missingFields, f)
		}
	}
	if len(missingFields) > 0 {
		addStep("discovery_fields", false,
			"Discovery document is missing required fields: "+strings.Join(missingFields, ", "),
			"The OIDC provider may not be fully compliant with the OpenID Connect specification.")
	} else {
		addStep("discovery_fields", true, "All required OIDC fields present in discovery document", "")
	}

	// Step 4: Check that redirect URL is configured
	if app.oidc.RedirectURL == "" {
		addStep("redirect_url", false, "Redirect URL is not configured", "Set the Redirect URL to https://your-server/auth/oidc/callback")
	} else {
		addStep("redirect_url", true, "Redirect URL configured: "+app.oidc.RedirectURL, "Make sure this URL is registered in your identity provider's allowed redirect URIs.")
	}

	// Step 5: Check that client credentials are present
	if app.oidc.ClientID == "" {
		addStep("credentials", false, "Client ID is not set", "")
	} else if app.oidc.ClientSecret == "" {
		addStep("credentials", false, "Client Secret is not set", "")
	} else {
		addStep("credentials", true, "Client credentials present (ID and Secret)", "The secret is not shown for security.")
	}

	// Step 6: Check exclusive mode setting
	if app.oidcExclusive {
		addStep("exclusive_mode", true, "Exclusive mode is ON — local login is disabled (admin account excepted)", "")
	} else {
		addStep("exclusive_mode", true, "Exclusive mode is OFF — local login is available alongside SSO", "")
	}

	// Step 7: OIDC route registration
	addStep("routes", true,
		"OIDC routes are registered: /auth/oidc/login and /auth/oidc/callback",
		fmt.Sprintf("Default role for new SSO users: %s", app.oidcDefaultRole))

	// Overall result
	overall := true
	for _, s := range steps {
		if !s.OK {
			overall = false
			break
		}
	}

	jsonOK(w, map[string]interface{}{
		"steps":   steps,
		"overall": overall,
		"summary": func() string {
			if overall {
				return "OIDC configuration looks correct. Users can sign in via SSO."
			}
			return "OIDC configuration has issues. Review the steps above."
		}(),
	})
}

func (app *App) configureOIDC(issuer, clientID, clientSecret, redirectURL string) error {
	if issuer == "" {
		return fmt.Errorf("issuer URL is required")
	}
	// Fetch discovery document
	// V3-M02 fix: use SSRF-safe transport for OIDC discovery
	discURL := strings.TrimRight(issuer, "/") + "/.well-known/openid-configuration"
	ssrfClient := &http.Client{Timeout: 10 * time.Second, Transport: newSSRFSafeTransport()}
	resp, err := ssrfClient.Get(discURL)
	if err != nil {
		return fmt.Errorf("fetch discovery document: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("discovery document returned %d", resp.StatusCode)
	}
	var cfg OIDCConfig
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&cfg); err != nil {
		return fmt.Errorf("decode discovery document: %w", err)
	}
	// M-09 fix: verify discovery document issuer matches configured issuer (OIDC spec §4.3)
	if cfg.Issuer != issuer {
		return fmt.Errorf("issuer mismatch in discovery document: got %q, configured %q", cfg.Issuer, issuer)
	}
	cfg.ClientID     = clientID
	cfg.ClientSecret = clientSecret
	cfg.RedirectURL  = redirectURL
	if cfg.RedirectURL == "" {
		cfg.RedirectURL = "http://localhost:8080/auth/oidc/callback"
	}
	app.oidc = &cfg
	return nil
}

// handleOIDCInfo returns OIDC configuration info to the frontend (public, no auth required)
func (app *App) handleOIDCInfo(w http.ResponseWriter, r *http.Request) {
	if app.oidc == nil {
		jsonError(w, "OIDC not configured", http.StatusNotFound)
		return
	}
	exclusive := "false"
	if app.oidcExclusive || app.store.GetSecuritySettings().DisablePasswordLogin {
		exclusive = "true"
	}
	jsonOK(w, map[string]string{
		"enabled":      "true",
		"exclusive":    exclusive,
		"issuer":       app.oidc.Issuer,
		"client_id":    app.oidc.ClientID,
		"redirect_url": app.oidc.RedirectURL,
	})
}

// handleOIDCLogin redirects the user to the OIDC authorization endpoint.
func (app *App) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	if app.oidc == nil {
		http.Redirect(w, r, "/login?error=oidc_not_configured", http.StatusFound)
		return
	}
	logDebug("OIDC: login initiated from %s", r.RemoteAddr)
	// Generate a random state token and store it in a short-lived cookie
	stateTok := make([]byte, 16)
	if _, err := rand.Read(stateTok); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	state := hex.EncodeToString(stateTok)
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		MaxAge:   300, // 5 minutes
		SameSite: http.SameSiteStrictMode,
	})

	// PKCE: generate code_verifier (43-128 chars of unreserved URL chars)
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	codeVerifier := base64.RawURLEncoding.EncodeToString(verifierBytes)
	// Store code_verifier in cookie for use during callback
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_pkce",
		Value:    codeVerifier,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		MaxAge:   300,
		SameSite: http.SameSiteStrictMode,
	})
	// code_challenge = BASE64URL(SHA256(code_verifier))
	h := sha256.Sum256([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(h[:])

	// Nonce: random value bound to the session to prevent ID token replay attacks
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	nonce := hex.EncodeToString(nonceBytes)
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_nonce",
		Value:    nonce,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		MaxAge:   300,
		SameSite: http.SameSiteStrictMode,
	})

	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {app.oidc.ClientID},
		"redirect_uri":          {app.oidc.RedirectURL},
		"scope":                 {"openid profile email address"},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
	}
	http.Redirect(w, r, app.oidc.AuthorizationEndpoint+"?"+params.Encode(), http.StatusFound)
}

// handleOIDCCallback exchanges the auth code for tokens, fetches user info, and creates a session.
// validateIDToken performs local validation of OIDC ID token claims and verifies
// the cryptographic signature. It checks issuer, audience, expiry, nonce, and signature.
// fetchJWKS fetches and caches the OIDC provider's JSON Web Key Set.
// Keys are cached for 1 hour. If kid is not found in cache, a refresh is forced once.
func (app *App) fetchJWKS(forceRefresh bool) (*jwksKeySet, error) {
	app.jwksMu.Lock()
	defer app.jwksMu.Unlock()

	// Return cached keys if fresh (1 hour TTL)
	if !forceRefresh && app.jwksCache != nil && time.Since(app.jwksCache.FetchedAt) < time.Hour {
		return app.jwksCache, nil
	}

	if app.oidc == nil || app.oidc.JWKSEndpoint == "" {
		return nil, fmt.Errorf("OIDC JWKS endpoint not configured")
	}

	// V3-M02 fix: use SSRF-safe transport for OIDC JWKS fetch
	client := &http.Client{Timeout: 10 * time.Second, Transport: newSSRFSafeTransport()}
	resp, err := client.Get(app.oidc.JWKSEndpoint)
	if err != nil {
		return nil, fmt.Errorf("fetch JWKS: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS endpoint returned %d", resp.StatusCode)
	}

	var jwks struct {
		Keys []jwksKey `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("decode JWKS: %w", err)
	}

	app.jwksCache = &jwksKeySet{Keys: jwks.Keys, FetchedAt: time.Now()}
	return app.jwksCache, nil
}

// findJWK finds a key by kid in the JWKS, refreshing if needed.
func (app *App) findJWK(kid string) (*jwksKey, error) {
	keySet, err := app.fetchJWKS(false)
	if err != nil {
		return nil, err
	}
	for i := range keySet.Keys {
		if keySet.Keys[i].Kid == kid {
			return &keySet.Keys[i], nil
		}
	}
	// Key not found — try a forced refresh (key rotation may have occurred)
	keySet, err = app.fetchJWKS(true)
	if err != nil {
		return nil, err
	}
	for i := range keySet.Keys {
		if keySet.Keys[i].Kid == kid {
			return &keySet.Keys[i], nil
		}
	}
	return nil, fmt.Errorf("no JWK found for kid %q", kid)
}

// parseRSAPublicKey constructs an *rsa.PublicKey from JWK fields.
func parseRSAPublicKey(jwk *jwksKey) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("decode JWK modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("decode JWK exponent: %w", err)
	}
	n := new(big.Int).SetBytes(nBytes)
	e := 0
	for _, b := range eBytes {
		e = e<<8 | int(b)
	}
	return &rsa.PublicKey{N: n, E: e}, nil
}

// parseECPublicKey constructs an *ecdsa.PublicKey from JWK fields.
func parseECPublicKey(jwk *jwksKey) (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch jwk.Crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("unsupported EC curve: %s", jwk.Crv)
	}
	xBytes, err := base64.RawURLEncoding.DecodeString(jwk.X)
	if err != nil {
		return nil, fmt.Errorf("decode JWK x coordinate: %w", err)
	}
	yBytes, err := base64.RawURLEncoding.DecodeString(jwk.Y)
	if err != nil {
		return nil, fmt.Errorf("decode JWK y coordinate: %w", err)
	}
	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)
	return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
}

func (app *App) validateIDToken(rawToken, expectedNonce string) error {
	// JWT is three base64url-encoded segments separated by dots
	parts := strings.SplitN(rawToken, ".", 3)
	if len(parts) != 3 {
		return fmt.Errorf("malformed JWT: expected 3 parts, got %d", len(parts))
	}

	// Verify signature (V-01 fix): decode header to determine algorithm
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("decode JWT header: %w", err)
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return fmt.Errorf("parse JWT header: %w", err)
	}

	// Verify signature
	signingInput := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return fmt.Errorf("decode JWT signature: %w", err)
	}

	// V3-M01 fix: reject HMAC algorithms when JWKS endpoint is configured.
	// If JWKS fetch succeeds and contains keys, the provider uses asymmetric signing.
	// If JWKS fetch fails, reject HMAC as a precaution — an attacker could cause
	// the fetch to fail and then submit a forged HS256 token using the client secret.
	if header.Alg == "HS256" || header.Alg == "HS384" || header.Alg == "HS512" {
		if app.oidc.JWKSEndpoint != "" {
			ks, err := app.fetchJWKS(false)
			if err != nil {
				return fmt.Errorf("HMAC algorithm %s rejected: JWKS fetch failed (%v), cannot verify provider key type", header.Alg, err)
			}
			if len(ks.Keys) > 0 {
				return fmt.Errorf("HMAC algorithm %s rejected: provider uses asymmetric keys (JWKS has %d keys)", header.Alg, len(ks.Keys))
			}
		}
	}

	switch header.Alg {
	case "HS256":
		mac := hmac.New(sha256.New, []byte(app.oidc.ClientSecret))
		mac.Write([]byte(signingInput))
		expected := mac.Sum(nil)
		if subtle.ConstantTimeCompare(signature, expected) != 1 {
			return fmt.Errorf("HS256 signature verification failed")
		}
	case "HS384":
		mac := hmac.New(sha512.New384, []byte(app.oidc.ClientSecret))
		mac.Write([]byte(signingInput))
		expected := mac.Sum(nil)
		if subtle.ConstantTimeCompare(signature, expected) != 1 {
			return fmt.Errorf("HS384 signature verification failed")
		}
	case "HS512":
		mac := hmac.New(sha512.New, []byte(app.oidc.ClientSecret))
		mac.Write([]byte(signingInput))
		expected := mac.Sum(nil)
		if subtle.ConstantTimeCompare(signature, expected) != 1 {
			return fmt.Errorf("HS512 signature verification failed")
		}
	case "RS256", "RS384", "RS512":
		// C-01 fix: verify RSA signature using JWKS
		jwk, err := app.findJWK(header.Kid)
		if err != nil {
			return fmt.Errorf("RSA signature verification failed: %w", err)
		}
		pubKey, err := parseRSAPublicKey(jwk)
		if err != nil {
			return fmt.Errorf("RSA key parse failed: %w", err)
		}
		var hashFunc crypto.Hash
		switch header.Alg {
		case "RS256":
			hashFunc = crypto.SHA256
		case "RS384":
			hashFunc = crypto.SHA384
		case "RS512":
			hashFunc = crypto.SHA512
		}
		h := hashFunc.New()
		h.Write([]byte(signingInput))
		digest := h.Sum(nil)
		if err := rsa.VerifyPKCS1v15(pubKey, hashFunc, digest, signature); err != nil {
			return fmt.Errorf("%s signature verification failed", header.Alg)
		}
	case "PS256", "PS384", "PS512":
		// C-01 fix: verify RSA-PSS signature using JWKS
		jwk, err := app.findJWK(header.Kid)
		if err != nil {
			return fmt.Errorf("RSA-PSS signature verification failed: %w", err)
		}
		pubKey, err := parseRSAPublicKey(jwk)
		if err != nil {
			return fmt.Errorf("RSA-PSS key parse failed: %w", err)
		}
		var hashFunc crypto.Hash
		switch header.Alg {
		case "PS256":
			hashFunc = crypto.SHA256
		case "PS384":
			hashFunc = crypto.SHA384
		case "PS512":
			hashFunc = crypto.SHA512
		}
		h := hashFunc.New()
		h.Write([]byte(signingInput))
		digest := h.Sum(nil)
		if err := rsa.VerifyPSS(pubKey, hashFunc, digest, signature, nil); err != nil {
			return fmt.Errorf("%s signature verification failed", header.Alg)
		}
	case "ES256", "ES384", "ES512":
		// C-01 fix: verify ECDSA signature using JWKS
		jwk, err := app.findJWK(header.Kid)
		if err != nil {
			return fmt.Errorf("ECDSA signature verification failed: %w", err)
		}
		pubKey, err := parseECPublicKey(jwk)
		if err != nil {
			return fmt.Errorf("ECDSA key parse failed: %w", err)
		}
		var hashFunc crypto.Hash
		var keySize int
		switch header.Alg {
		case "ES256":
			hashFunc = crypto.SHA256
			keySize = 32
		case "ES384":
			hashFunc = crypto.SHA384
			keySize = 48
		case "ES512":
			hashFunc = crypto.SHA512
			keySize = 66
		}
		h := hashFunc.New()
		h.Write([]byte(signingInput))
		digest := h.Sum(nil)
		// ECDSA JWT signatures are r||s concatenated (not ASN.1 DER)
		if len(signature) != 2*keySize {
			return fmt.Errorf("%s signature has wrong length: got %d, want %d", header.Alg, len(signature), 2*keySize)
		}
		r := new(big.Int).SetBytes(signature[:keySize])
		s := new(big.Int).SetBytes(signature[keySize:])
		if !ecdsa.Verify(pubKey, digest, r, s) {
			return fmt.Errorf("%s signature verification failed", header.Alg)
		}
	case "none":
		return fmt.Errorf("unsigned JWT (alg=none) rejected")
	default:
		return fmt.Errorf("unsupported JWT algorithm: %s", header.Alg)
	}

	// Decode the claims (second segment)
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("decode JWT claims: %w", err)
	}
	var claims struct {
		Issuer   string `json:"iss"`
		Audience json.RawMessage `json:"aud"` // can be string or []string
		Expiry   int64  `json:"exp"`
		IssuedAt int64  `json:"iat"`
		Nonce    string `json:"nonce"`
	}
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return fmt.Errorf("parse JWT claims: %w", err)
	}

	// Validate issuer matches our configured OIDC issuer
	if claims.Issuer != app.oidc.Issuer {
		return fmt.Errorf("issuer mismatch: got %q, want %q", claims.Issuer, app.oidc.Issuer)
	}

	// Validate audience contains our client ID
	var audiences []string
	var singleAud string
	if err := json.Unmarshal(claims.Audience, &audiences); err != nil {
		if err := json.Unmarshal(claims.Audience, &singleAud); err != nil {
			return fmt.Errorf("invalid aud claim")
		}
		audiences = []string{singleAud}
	}
	audOK := false
	for _, a := range audiences {
		if a == app.oidc.ClientID {
			audOK = true
			break
		}
	}
	if !audOK {
		return fmt.Errorf("audience mismatch: %v does not contain %q", audiences, app.oidc.ClientID)
	}

	// Validate expiry (with 2-minute clock skew tolerance)
	now := time.Now().Unix()
	if claims.Expiry > 0 && now > claims.Expiry+120 {
		return fmt.Errorf("token expired at %d, now %d", claims.Expiry, now)
	}

	// Validate issued-at: reject tokens issued too far in the past (10 min + clock skew)
	if claims.IssuedAt > 0 && now-claims.IssuedAt > 720 {
		return fmt.Errorf("token issued too long ago: iat=%d, now=%d", claims.IssuedAt, now)
	}

	// Validate nonce (prevents replay attacks)
	if expectedNonce != "" && claims.Nonce != expectedNonce {
		return fmt.Errorf("nonce mismatch: got %q, want %q", claims.Nonce, expectedNonce)
	}

	return nil
}

func (app *App) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	if app.oidc == nil {
		http.Redirect(w, r, "/login?error=oidc_not_configured", http.StatusFound)
		return
	}

	// Validate state
	stateCookie, err := r.Cookie("oidc_state")
	if err != nil || subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(r.URL.Query().Get("state"))) != 1 {
		http.Redirect(w, r, "/login?error=state_mismatch", http.StatusFound)
		return
	}
	// Clear state cookie
	http.SetCookie(w, &http.Cookie{Name: "oidc_state", Path: "/", MaxAge: -1})

	// M-03 fix: PKCE and nonce cookies are required — reject callback if either is missing
	pkceCookie, err := r.Cookie("oidc_pkce")
	if err != nil || pkceCookie.Value == "" {
		http.Redirect(w, r, "/login?error=pkce_missing", http.StatusFound)
		return
	}
	codeVerifier := pkceCookie.Value
	// Clear PKCE cookie
	http.SetCookie(w, &http.Cookie{Name: "oidc_pkce", Path: "/", MaxAge: -1})

	// Retrieve nonce from cookie for ID token validation
	nonceCookie, err := r.Cookie("oidc_nonce")
	if err != nil || nonceCookie.Value == "" {
		http.Redirect(w, r, "/login?error=nonce_missing", http.StatusFound)
		return
	}
	expectedNonce := nonceCookie.Value
	http.SetCookie(w, &http.Cookie{Name: "oidc_nonce", Path: "/", MaxAge: -1})

	code := r.URL.Query().Get("code")
	if code == "" {
		errMsg := r.URL.Query().Get("error_description")
		if errMsg == "" {
			errMsg = r.URL.Query().Get("error")
		}
		http.Redirect(w, r, "/login?error="+url.QueryEscape(errMsg), http.StatusFound)
		return
	}

	// Exchange code for tokens (with PKCE code_verifier)
	tokenParams := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {app.oidc.RedirectURL},
		"client_id":     {app.oidc.ClientID},
		"client_secret": {app.oidc.ClientSecret},
	}
	if codeVerifier != "" {
		tokenParams.Set("code_verifier", codeVerifier)
	}
	// V3-M02 fix: use SSRF-safe transport for token exchange
	oidcHTTPClient := &http.Client{Timeout: 10 * time.Second, Transport: newSSRFSafeTransport()}
	tokenResp, err := oidcHTTPClient.PostForm(app.oidc.TokenEndpoint, tokenParams)
	if err != nil || tokenResp.StatusCode != http.StatusOK {
		http.Redirect(w, r, "/login?error=token_exchange_failed", http.StatusFound)
		return
	}
	defer tokenResp.Body.Close()

	var tokens struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.NewDecoder(io.LimitReader(tokenResp.Body, 1<<20)).Decode(&tokens); err != nil {
		http.Redirect(w, r, "/login?error=token_parse_failed", http.StatusFound)
		return
	}

	// Validate ID token claims (issuer, audience, expiry, nonce)
	if tokens.IDToken != "" {
		if err := app.validateIDToken(tokens.IDToken, expectedNonce); err != nil {
			logVerbose("OIDC: ID token validation failed: %v", err)
			http.Redirect(w, r, "/login?error=id_token_invalid", http.StatusFound)
			return
		}
	}

	// Fetch user info
	// V3-M02 fix: use SSRF-safe transport for userinfo fetch
	req, _ := http.NewRequest("GET", app.oidc.UserinfoEndpoint, nil)
	req.Header.Set("Authorization", tokens.TokenType+" "+tokens.AccessToken)
	uiResp, err := oidcHTTPClient.Do(req)
	if err != nil || uiResp.StatusCode != http.StatusOK {
		http.Redirect(w, r, "/login?error=userinfo_failed", http.StatusFound)
		return
	}
	defer uiResp.Body.Close()

	var userInfo struct {
		Sub         string `json:"sub"`
		Email       string `json:"email"`
		Name        string `json:"name"`
		PreferredUN string `json:"preferred_username"`
		GivenName   string `json:"given_name"`
		FamilyName  string `json:"family_name"`
		Locale      string `json:"locale"`
		Groups      []string `json:"groups"`
		// Address can be a structured object or a string; capture as raw JSON
		AddressRaw json.RawMessage `json:"address"`
	}
	if err := json.NewDecoder(io.LimitReader(uiResp.Body, 1<<20)).Decode(&userInfo); err != nil {
		http.Redirect(w, r, "/login?error=userinfo_parse_failed", http.StatusFound)
		return
	}

	// Determine username: preferred_username → email → sub
	username := userInfo.PreferredUN
	if username == "" {
		username = userInfo.Email
	}
	if username == "" {
		username = "oidc-" + userInfo.Sub
	}
	// V-10 fix: sanitize OIDC-derived username to prevent special characters
	if err := validateUsername(username); err != nil {
		// If the IDP username doesn't match our format, sanitize it
		sanitized := strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
				return r
			}
			return '_'
		}, username)
		if len(sanitized) > 64 {
			sanitized = sanitized[:64]
		}
		if sanitized == "" {
			sanitized = "oidc-" + userInfo.Sub
		}
		username = sanitized
	}
	displayName := userInfo.Name
	if displayName == "" {
		displayName = username
	}

	// Build full name from IDP claims (prefer given_name + family_name, fallback to name)
	fullName := userInfo.Name
	if userInfo.GivenName != "" || userInfo.FamilyName != "" {
		fullName = strings.TrimSpace(userInfo.GivenName + " " + userInfo.FamilyName)
	}

	// Parse address from IDP (can be a JSON object with "formatted" key, or a plain string)
	var oidcAddress string
	if len(userInfo.AddressRaw) > 0 {
		// Try structured address object first (OpenID Connect standard)
		var addrObj struct {
			Formatted     string `json:"formatted"`
			StreetAddress string `json:"street_address"`
			Locality      string `json:"locality"`
			Region        string `json:"region"`
			PostalCode    string `json:"postal_code"`
			Country       string `json:"country"`
		}
		if err := json.Unmarshal(userInfo.AddressRaw, &addrObj); err == nil && addrObj.Formatted != "" {
			oidcAddress = addrObj.Formatted
		} else if err == nil {
			// Build from components
			parts := []string{}
			if addrObj.StreetAddress != "" {
				parts = append(parts, addrObj.StreetAddress)
			}
			if addrObj.Locality != "" {
				parts = append(parts, addrObj.Locality)
			}
			if addrObj.Region != "" {
				parts = append(parts, addrObj.Region)
			}
			if addrObj.PostalCode != "" {
				parts = append(parts, addrObj.PostalCode)
			}
			if addrObj.Country != "" {
				parts = append(parts, addrObj.Country)
			}
			oidcAddress = strings.Join(parts, ", ")
		} else {
			// Maybe it's a plain string
			var plainAddr string
			if err := json.Unmarshal(userInfo.AddressRaw, &plainAddr); err == nil {
				oidcAddress = plainAddr
			}
		}
	}

	// Find or auto-create the local user
	user, found := app.store.GetUserByUsername(username)
	if !found {
		defaultRole := app.oidcDefaultRole
		if defaultRole == "" {
			// C-04 fix: default to least-privilege role for auto-enrolled OIDC users
			defaultRole = RoleRead
		}
		newUser := User{
			Username:    username,
			DisplayName: stripHTMLTags(displayName),
			Role:        defaultRole,
			Vetted:      true, // SSO users are pre-authenticated by the IDP
			IsOIDC:      true,
			FullName:    stripHTMLTags(fullName),
			Locale:      userInfo.Locale,
			Address:     stripHTMLTags(oidcAddress),
		}
		// No password — OIDC-only login
		created, err := app.store.CreateUser(newUser)
		if err != nil {
			logVerbose("OIDC: failed to create user %s: %v", username, err)
			http.Redirect(w, r, "/login?error=user_create_failed", http.StatusFound)
			return
		}
		user = &created
		log.Printf("OIDC: auto-created user %q (role=%s, vetted=true)", username, defaultRole)
		app.audit(0, "system", "created", "user", created.ID,
			fmt.Sprintf("SSO auto enrollment: user %q auto-created via OIDC (role=%s)", username, defaultRole))
	} else {
		// Sync profile fields from IDP on every login (sanitize to prevent stored XSS)
		changed := false
		sanitizedDisplayName := stripHTMLTags(displayName)
		if sanitizedDisplayName != "" && sanitizedDisplayName != user.DisplayName {
			logVerbose("OIDC: updating display name for %q: %q → %q", username, user.DisplayName, sanitizedDisplayName)
			user.DisplayName = sanitizedDisplayName
			changed = true
		}
		sanitizedFullName := stripHTMLTags(fullName)
		if sanitizedFullName != "" && sanitizedFullName != user.FullName {
			logVerbose("OIDC: updating full name for %q: %q → %q", username, user.FullName, sanitizedFullName)
			user.FullName = sanitizedFullName
			changed = true
		}
		if userInfo.Locale != "" && userInfo.Locale != user.Locale {
			logVerbose("OIDC: updating locale for %q: %q → %q", username, user.Locale, userInfo.Locale)
			user.Locale = userInfo.Locale
			changed = true
		}
		sanitizedAddress := stripHTMLTags(oidcAddress)
		if sanitizedAddress != "" && sanitizedAddress != user.Address {
			logVerbose("OIDC: updating address for %q: %q → %q", username, user.Address, sanitizedAddress)
			user.Address = sanitizedAddress
			changed = true
		}
		if changed {
			if err := app.store.UpdateUser(*user); err != nil {
				logVerbose("OIDC: failed to update profile for %q: %v", username, err)
			}
		}
		// Ensure existing OIDC users are vetted
		if !user.Vetted {
			user.Vetted = true
			app.store.UpdateUser(*user) //nolint
			logVerbose("OIDC: auto-vetted existing user %q", username)
		}
	}

	// Sync group memberships from IDP groups claim
	if len(userInfo.Groups) > 0 {
		app.syncOIDCGroups(user, userInfo.Groups)
	}

	// Deny login for blocked accounts (even via OIDC)
	if user.Blocked {
		app.audit(user.ID, "system", "login_failed_blocked", "user", user.ID,
			fmt.Sprintf("Login failed: blocked account %q attempted SSO login", username))
		http.Redirect(w, r, "/login?error=account_blocked", http.StatusFound)
		return
	}

	// Create session
	sessID, err := generateID()
	if err != nil {
		http.Redirect(w, r, "/login?error=session_failed", http.StatusFound)
		return
	}
	sess := Session{ID: sessID, UserID: user.ID, ExpiresAt: time.Now().Add(24 * time.Hour)}
	if err := app.store.CreateSession(sess); err != nil {
		http.Redirect(w, r, "/login?error=session_failed", http.StatusFound)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessID,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.secureMode,
		Expires:  sess.ExpiresAt,
		SameSite: http.SameSiteStrictMode,
	})
	app.setCSRFCookie(w, sess.ExpiresAt)
	// Track last login and ensure IsOIDC is set
	go func(u User, ip string) {
		now := time.Now()
		u.LastLoginAt = &now
		u.LastLoginIP = ip
		u.IsOIDC = true
		if names, err := net.LookupAddr(ip); err == nil && len(names) > 0 {
			u.LastLoginDomain = strings.TrimSuffix(names[0], ".")
		}
		if fullUser, ok := app.store.GetUserByID(u.ID); ok {
			// Preserve previous login info before overwriting
			fullUser.PrevLoginAt = fullUser.LastLoginAt
			fullUser.PrevLoginIP = fullUser.LastLoginIP
			fullUser.PrevLoginDomain = fullUser.LastLoginDomain
			fullUser.LastLoginAt = u.LastLoginAt
			fullUser.LastLoginIP = u.LastLoginIP
			fullUser.LastLoginDomain = u.LastLoginDomain
			fullUser.IsOIDC = true
			fullUser.LoginCount++
			app.store.UpdateUser(*fullUser) //nolint
		}
	// L-05 fix: use clientIP(r) instead of raw r.RemoteAddr for correct IP behind reverse proxy
	}(*user, clientIP(r))

	logVerbose("OIDC login success: user=%s role=%s", username, user.Role)
	logDebug("OIDC: session created id=%s expires=%s", sessID, sess.ExpiresAt.Format(time.RFC3339))
	http.Redirect(w, r, "/", http.StatusFound)
}

// syncOIDCGroups synchronises the user's local group memberships with the groups
// claim received from the identity provider. For each IDP group the matching
// local group is found (case-insensitive) or auto-created, and the user is added.
// Memberships for groups not present in the IDP claim are removed so that Keycloak
// remains the authoritative source of group membership.
func (app *App) syncOIDCGroups(user *User, idpGroups []string) {
	// Keycloak often sends groups as "/groupname" – strip leading slash
	cleaned := make([]string, 0, len(idpGroups))
	for _, g := range idpGroups {
		g = strings.TrimPrefix(g, "/")
		g = strings.TrimSpace(g)
		if g != "" {
			cleaned = append(cleaned, g)
		}
	}

	// Build a set of target group IDs from the IDP claim
	targetGroupIDs := make(map[int64]bool)
	for _, groupName := range cleaned {
		grp, found := app.store.GetGroupByName(groupName)
		if !found {
			// Auto-create the group
			newGroup := Group{
				Name:        groupName,
				Description: "Auto-created from IDP group",
				CreatedBy:   0, // system
			}
			created, err := app.store.CreateGroup(newGroup)
			if err != nil {
				logVerbose("OIDC: failed to auto-create group %q: %v", groupName, err)
				continue
			}
			grp = &created
			log.Printf("OIDC: auto-created group %q (id=%d) from IDP claim", groupName, grp.ID)
			app.audit(0, "system", "created", "group", grp.ID,
				fmt.Sprintf("Group %q auto-created from IDP groups claim", groupName))
		}
		targetGroupIDs[grp.ID] = true
		// Ensure user is a member
		if err := app.store.AddGroupMember(GroupMembership{
			GroupID: grp.ID,
			UserID:  user.ID,
			Role:    "member",
		}); err != nil {
			logVerbose("OIDC: failed to add user %q to group %q: %v", user.Username, groupName, err)
		}
	}

	// Remove memberships for groups not in the IDP claim (IDP is authoritative)
	currentMemberships := app.store.GetUserGroups(user.ID)
	for _, m := range currentMemberships {
		if !targetGroupIDs[m.GroupID] {
			if err := app.store.RemoveGroupMember(m.GroupID, user.ID); err != nil {
				logVerbose("OIDC: failed to remove user %q from group %d: %v", user.Username, m.GroupID, err)
			} else {
				logVerbose("OIDC: removed user %q from group %d (not in IDP claim)", user.Username, m.GroupID)
			}
		}
	}
	logVerbose("OIDC: synced %d group(s) for user %q", len(cleaned), user.Username)
}
