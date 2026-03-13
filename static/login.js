'use strict';

function escHtmlLogin(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let regMode = 'off';
let oidcConfig = null;

// ── Error message map ─────────────────────────────────────────────────────
const SSO_ERRORS = {
  oidc_not_configured:  'SSO is not configured on this server.',
  state_mismatch:       'Security check failed (state mismatch). This can happen if the page was open in multiple tabs. Please try again.',
  token_exchange_failed:'Could not exchange authorization code for a token. The SSO provider may be unreachable.',
  token_parse_failed:   'Received an unexpected response from the SSO provider (token parsing failed).',
  userinfo_failed:      'Could not retrieve user information from the SSO provider.',
  userinfo_parse_failed:'The user information returned by the SSO provider could not be read.',
  user_create_failed:   'Your SSO identity was verified, but an account could not be created automatically. Contact an administrator.',
  session_failed:       'SSO authentication succeeded but a session could not be established. Please try again.',
  account_blocked:      'Your account has been blocked. Contact an administrator.',
  access_denied:        'Access was denied by the SSO provider.',
};

function ssoErrorMessage(code) {
  const mapped = SSO_ERRORS[code];
  if (mapped) return mapped;
  return 'An SSO error occurred (' + code.replace(/_/g, ' ') + ').';
}

// ── View switchers ────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginForm').style.display = '';
  document.getElementById('regForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('resetForm').style.display = 'none';
}

function showRegister() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('regForm').style.display = '';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('resetForm').style.display = 'none';
  document.getElementById('regCodeGroup').style.display =
    (regMode === 'generic_invitation' || regMode === 'personal_invitation') ? '' : 'none';
}

function showForgot() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('regForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = '';
  document.getElementById('resetForm').style.display = 'none';
}

function toggleLoginDetail() {
  const el = document.getElementById('loginErrorDetail');
  const tog = document.getElementById('loginDetailToggle');
  const shown = el.style.display === 'block';
  el.style.display = shown ? 'none' : 'block';
  tog.textContent = shown ? 'Show details' : 'Hide details';
}

function toggleSSODetail() {
  const el = document.getElementById('ssoErrorDetail');
  const tog = document.getElementById('ssoDetailToggle');
  const shown = el.style.display === 'block';
  el.style.display = shown ? 'none' : 'block';
  tog.textContent = shown ? 'Show technical details' : 'Hide technical details';
}

// ── Helper for forgot-password reset link ─────────────────────────────────
function applyResetToken(token) {
  document.getElementById('resetToken').value = token;
  showLogin();
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('resetForm').style.display = '';
}

// ── URL error handling ────────────────────────────────────────────────────
const urlParams = new URLSearchParams(location.search);
const urlError  = urlParams.get('error');
if (urlError) {
  const errDiv  = document.getElementById('loginUrlError');
  const errMsg  = document.getElementById('loginUrlErrorMsg');
  const detTog  = document.getElementById('ssoDetailToggle');
  const detBody = document.getElementById('ssoErrorDetail');
  const retryHint = document.getElementById('ssoRetryHint');

  errMsg.textContent = ssoErrorMessage(urlError);
  errDiv.style.display = 'block';

  // Show technical detail toggle for non-obvious errors
  if (!SSO_ERRORS[urlError]) {
    detTog.style.display = 'inline';
    detBody.textContent = 'Raw error code: ' + urlError;
  } else {
    // Show raw code as supplemental info
    detTog.style.display = 'inline';
    detBody.textContent = 'Error code: ' + urlError + '\nIf you need to report this issue, include the error code above.';
  }

  // Offer retry for retriable errors
  if (['token_exchange_failed','userinfo_failed','session_failed','state_mismatch'].includes(urlError)) {
    retryHint.style.display = 'inline';
  }
}

// ── Reset token pre-fill ──────────────────────────────────────────────────
const resetToken = urlParams.get('reset_token') || urlParams.get('reset');
if (resetToken) {
  document.getElementById('resetToken').value = resetToken;
  showLogin();
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('resetForm').style.display = '';
}

// ── OIDC config fetch ─────────────────────────────────────────────────────
fetch('/api/auth/oidc-config').then(async r => {
  if (!r.ok) return; // OIDC not configured — keep login form as-is

  oidcConfig = await r.json();
  const issuer = oidcConfig.issuer || '';

  // Show SSO section with provider name
  const oidcSec = document.getElementById('oidcSection');
  oidcSec.style.display = '';
  const providerEl = document.getElementById('ssoProviderName');
  if (issuer) {
    try {
      providerEl.textContent = 'via ' + new URL(issuer).hostname;
    } catch { providerEl.textContent = ''; }
  }

  // Add click spinner on SSO button
  document.getElementById('ssoLoginBtn').addEventListener('click', () => {
    document.getElementById('ssoSpinner').style.display = 'inline-block';
  });

  if (oidcConfig.exclusive === 'true') {
    // Exclusive SSO mode — hide local forms
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotLink').style.display = 'none';
    document.getElementById('ssoExclusiveNotice').style.display = '';
    // Auto-redirect if no URL error and no reset token
    if (!urlError && !resetToken) {
      document.getElementById('ssoSpinner').style.display = 'inline-block';
      setTimeout(() => { window.location.href = '/auth/oidc/login'; }, 600);
    }
  }
}).catch(() => {});

// ── Registration mode ─────────────────────────────────────────────────────
fetch('/api/admin/registration').then(async r => {
  if (r.ok) {
    const data = await r.json();
    regMode = data.mode || 'off';
    if (regMode !== 'off' && regMode !== 'oidc_auto_enroll') {
      document.getElementById('registerSection').style.display = '';
    }
  }
}).catch(() => {});

// ── Login form ────────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl  = document.getElementById('loginError');
  const errMsg = document.getElementById('loginErrorMsg');
  const detTog = document.getElementById('loginDetailToggle');
  const detBody = document.getElementById('loginErrorDetail');
  const btn    = document.getElementById('loginBtn');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      btn.textContent = 'Redirecting…';
      window.location.href = '/';
      return;
    }
    const data = await res.json().catch(() => ({}));
    let msg = data.error || 'Login failed';
    let detail = null;

    if (res.status === 403) {
      if (data.error && data.error.includes('SSO')) {
        msg = 'Local login is disabled on this server — please use SSO.';
        detail = 'Server returned: ' + (data.error || '');
      } else if (data.error === 'account pending approval') {
        msg = 'Your account is pending admin approval. Please try again later.';
      } else if (data.error === 'account blocked') {
        msg = 'Your account has been blocked. Please contact an administrator.';
      }
    } else if (res.status === 401) {
      msg = 'Invalid username or password.';
    }

    errMsg.textContent = msg;
    errEl.style.display = 'block';

    if (detail) {
      detTog.style.display = 'inline';
      detBody.textContent = detail;
    } else {
      detTog.style.display = 'none';
    }
  } catch {
    errMsg.textContent = 'Network error — could not reach the server. Please check your connection.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// ── Register form ─────────────────────────────────────────────────────────
document.getElementById('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl  = document.getElementById('regError');
  const succEl = document.getElementById('regSuccess');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  const body = {
    username:        document.getElementById('regUsername').value.trim(),
    password:        document.getElementById('regPassword').value,
    display_name:    document.getElementById('regDisplay').value.trim(),
    email:           document.getElementById('regEmail').value.trim(),
    invitation_code: document.getElementById('regCode').value.trim(),
  };

  if (!body.username || !body.password) {
    errEl.textContent = 'Username and password are required.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      if (data.vetted) {
        succEl.textContent = 'Registration successful! You can now log in.';
      } else {
        succEl.textContent = 'Registration submitted. An admin will review your account before you can log in.';
      }
      succEl.style.display = 'block';
      document.getElementById('regForm').reset();
    } else {
      errEl.textContent = data.error || 'Registration failed';
      errEl.style.display = 'block';
    }
  } catch {
    errEl.textContent = 'Network error';
    errEl.style.display = 'block';
  }
});

// ── Forgot Password form ──────────────────────────────────────────────────
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl  = document.getElementById('forgotError');
  const succEl = document.getElementById('forgotSuccess');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  const val = document.getElementById('forgotUser').value.trim();
  if (!val) { errEl.textContent = 'Please enter your username or email.'; errEl.style.display = 'block'; return; }

  const body = val.includes('@') ? {email: val} : {username: val};

  try {
    const res  = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      if (data.token) {
        succEl.innerHTML = 'Reset token generated. Please send this to the user:<br>' +
          '<code style="word-break:break-all;font-size:11px">' + escHtmlLogin(data.token) + '</code><br>' +
          '<small>They can use it at <a id="forgotResetLink" style="cursor:pointer;color:var(--accent)">Reset password</a></small>';
        succEl.style.display = 'block';
        document.getElementById('forgotResetLink').addEventListener('click', function() {
          applyResetToken(data.token);
        });
      } else {
        succEl.textContent = 'If the account exists, a reset link has been sent.';
      }
      succEl.style.display = 'block';
    } else {
      errEl.textContent = data.error || 'Request failed';
      errEl.style.display = 'block';
    }
  } catch {
    errEl.textContent = 'Network error';
    errEl.style.display = 'block';
  }
});

// ── Reset Password form ───────────────────────────────────────────────────
document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl  = document.getElementById('resetError');
  const succEl = document.getElementById('resetSuccess');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  const token  = document.getElementById('resetToken').value.trim();
  const newPwd = document.getElementById('resetPwd').value;
  if (!token || !newPwd) { errEl.textContent = 'Token and password are required.'; errEl.style.display = 'block'; return; }

  try {
    const res  = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token, new_password: newPwd})
    });
    const data = await res.json();
    if (res.ok) {
      succEl.textContent = 'Password changed successfully. You can now log in.';
      succEl.style.display = 'block';
      setTimeout(showLogin, 2000);
    } else {
      errEl.textContent = data.error || 'Reset failed';
      errEl.style.display = 'block';
    }
  } catch {
    errEl.textContent = 'Network error';
    errEl.style.display = 'block';
  }
});

// ── Bind inline event handlers via addEventListener ───────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('loginDetailToggle').addEventListener('click', toggleLoginDetail);
  document.getElementById('forgotPasswordLink').addEventListener('click', showForgot);
  document.getElementById('backToLoginFromForgot').addEventListener('click', showLogin);
  document.getElementById('backToLoginFromReset').addEventListener('click', showLogin);
  document.getElementById('backToLoginFromReg').addEventListener('click', showLogin);
  document.getElementById('showRegisterLink').addEventListener('click', showRegister);
  document.getElementById('ssoDetailToggle').addEventListener('click', toggleSSODetail);
});
