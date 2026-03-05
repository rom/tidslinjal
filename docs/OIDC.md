# OIDC / SSO Authentication

Tidslinjal supports Single Sign-On (SSO) via **OpenID Connect (OIDC)**. When configured, users see a "Sign in with SSO" button on the login page in addition to (or instead of) the username/password form.

---

## How It Works

1. User clicks **"Sign in with SSO"** on the login page.
2. They are redirected to the identity provider (IdP) for authentication.
3. After successful authentication, the IdP redirects back to `/auth/oidc/callback`.
4. Tidslinjal exchanges the authorization code for an access token and fetches the user's profile from the IdP's userinfo endpoint.
5. A local user account is created automatically if it doesn't exist (with role `readwrite`).
6. A session cookie is set and the user is redirected to the timeline.

---

## Configuration

OIDC is configured via **CLI flags** or **environment variables**.

### CLI Flags

```bash
./tidslinjal \
  --oidc-issuer       "https://accounts.google.com" \
  --oidc-client-id    "my-client-id" \
  --oidc-client-secret "my-client-secret" \
  --oidc-redirect-url  "https://timeline.example.com/auth/oidc/callback"
```

### Environment Variables

```bash
export OIDC_ISSUER="https://accounts.google.com"
export OIDC_CLIENT_ID="my-client-id"
export OIDC_CLIENT_SECRET="my-client-secret"
export OIDC_REDIRECT_URL="https://timeline.example.com/auth/oidc/callback"
./tidslinjal
```

### Parameters

| Parameter | Flag | Env var | Description |
|-----------|------|---------|-------------|
| Issuer URL | `--oidc-issuer` | `OIDC_ISSUER` | Base URL of the OIDC provider. Must have a `/.well-known/openid-configuration` endpoint. |
| Client ID | `--oidc-client-id` | `OIDC_CLIENT_ID` | Client ID registered with the provider. |
| Client Secret | `--oidc-client-secret` | `OIDC_CLIENT_SECRET` | Client secret (keep confidential). |
| Redirect URL | `--oidc-redirect-url` | `OIDC_REDIRECT_URL` | Must match exactly what is registered with the provider. Defaults to `http://localhost:8080/auth/oidc/callback`. |

---

## Provider Setup Examples

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (type: Web application).
3. Add `https://timeline.example.com/auth/oidc/callback` as an Authorized Redirect URI.
4. Note the Client ID and Client Secret.

```bash
./tidslinjal \
  --oidc-issuer "https://accounts.google.com" \
  --oidc-client-id "123456789-abc.apps.googleusercontent.com" \
  --oidc-client-secret "GOCSPX-..." \
  --oidc-redirect-url "https://timeline.example.com/auth/oidc/callback"
```

### Microsoft Entra ID (Azure AD)

1. In Azure Portal, go to **Microsoft Entra ID → App registrations → New registration**.
2. Set redirect URI to `https://timeline.example.com/auth/oidc/callback`.
3. Under **Certificates & secrets**, create a new client secret.
4. The issuer URL is `https://login.microsoftonline.com/{tenant-id}/v2.0`.

```bash
./tidslinjal \
  --oidc-issuer "https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0" \
  --oidc-client-id "YOUR-CLIENT-ID" \
  --oidc-client-secret "YOUR-CLIENT-SECRET" \
  --oidc-redirect-url "https://timeline.example.com/auth/oidc/callback"
```

### Keycloak

1. Create a realm and a **Confidential** client.
2. Set redirect URI to `https://timeline.example.com/auth/oidc/callback`.
3. The issuer URL is `https://keycloak.example.com/realms/{realm-name}`.

```bash
./tidslinjal \
  --oidc-issuer "https://keycloak.example.com/realms/myrealm" \
  --oidc-client-id "tidslinjal" \
  --oidc-client-secret "..." \
  --oidc-redirect-url "https://timeline.example.com/auth/oidc/callback"
```

### Authentik

1. Create a **Provider** of type OAuth2/OpenID Connect.
2. Set redirect URIs to `https://timeline.example.com/auth/oidc/callback`.
3. Create an **Application** linked to the provider.
4. The issuer URL is `https://authentik.example.com/application/o/{slug}/`.

---

## User Auto-Provisioning

When an OIDC user logs in for the first time, Tidslinjal automatically creates a local account with:

- **Username**: `preferred_username` claim → `email` claim → `sub` claim (in that order of preference)
- **Display Name**: `name` claim (or username if not available)
- **Role**: `readwrite` (can create and edit events)

After auto-creation, an admin can update the user's role via the Users panel in the sidebar.

---

## Security Notes

- OIDC tokens are exchanged server-side; the client never sees the access token.
- The OIDC state parameter is validated to prevent CSRF attacks.
- If OIDC is not configured, the SSO button does not appear on the login page.
- Local username/password login continues to work alongside OIDC.
- OIDC auto-created users have no password set — they can only log in via SSO unless an admin explicitly sets a password.

---

## Troubleshooting

| Error on login page | Cause |
|---------------------|-------|
| `state_mismatch` | The OIDC state cookie expired or was tampered with. Try again. |
| `token_exchange_failed` | Invalid client secret, or redirect URL doesn't match registration. |
| `userinfo_failed` | The access token was rejected by the provider's userinfo endpoint. |
| `user_create_failed` | Database error creating the user (check server logs). |
| `oidc_not_configured` | OIDC is not configured on the server. |

Server-side errors are logged at startup. Check stdout/systemd journal for details.
