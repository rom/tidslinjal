/* ── User Profile ── */
// ── User Profile ───────────────────────────────────────────────────────────
async function openProfileModal() {
  const u = state.user;
  if (!u) return;

  // Refresh user data from server to get latest info
  try {
    const fresh = await apiGet('/api/auth/me');
    if (fresh) Object.assign(state.user, fresh);
  } catch { /* use cached */ }

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('profileUsername',    u.username);
  setVal('profileRole',        t('role_' + u.role) || u.role);
  setVal('profileDisplayName', u.display_name);
  setVal('profileEmail',       u.email);
  setVal('profileMattermost',  u.mattermost_handle || '');
  setVal('profileDiscord',     u.discord_handle || '');
  setVal('profileSignal',      u.signal_handle || '');
  setVal('profileTelephone',   u.telephone || '');
  setVal('profileCellular',    u.cellular || '');
  setVal('profileTitle',       u.title || '');
  setVal('profileRank',        u.rank || '');
  setVal('profileJobRole',     u.job_role || '');
  setVal('profileExpertise',   u.expertise || '');
  setVal('profileLocation',    u.location || '');
  setVal('profileLatitude',    u.latitude || '');
  setVal('profileLongitude',   u.longitude || '');
  setVal('profileAvailability', u.availability || 'free');
  // Profile photo
  const preview = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('profilePhotoRemove');
  if (u.photo_data_url) {
    if (preview) { preview.src = u.photo_data_url; preview.style.display = ''; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = '';
  } else {
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (placeholder) placeholder.style.display = '';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  // Password policy
  _loadProfilePwdPolicy();

  // Language select
  const langSel = document.getElementById('profileLanguage');
  if (langSel) {
    const prefs = state.preferences || {};
    langSel.value = prefs.language || u.language || 'en';
  }

  // J-Level / NATO designations
  const jGroup = document.getElementById('profileJLevelGroup');
  const jLevel = document.getElementById('profileJLevel');
  if (u.nato_designations && u.nato_designations.length) {
    if (jGroup) jGroup.style.display = '';
    if (jLevel) jLevel.value = u.nato_designations.join(', ');
  } else {
    if (jGroup) jGroup.style.display = 'none';
  }

  ['profilePwdCurrent', 'profilePwdNew', 'profilePwdConfirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Reset strength indicator
  const profBar = document.getElementById('profilePwdStrengthBar');
  const profLbl = document.getElementById('profilePwdStrengthLabel');
  if (profBar) { profBar.style.width = '0%'; profBar.style.background = '#ccc'; }
  if (profLbl) profLbl.textContent = '';
  // Show SSO banner for OIDC accounts
  const isSSO = u.is_oidc;
  const ssoBanner   = document.getElementById('profilePwdSSOBanner');
  const pwdFields   = document.getElementById('profilePwdFields');
  if (ssoBanner) ssoBanner.style.display = isSSO ? '' : 'none';
  if (pwdFields) pwdFields.style.display  = isSSO ? 'none' : '';

  // Account info section
  const info = document.getElementById('profileInfo');
  if (info) {
    const groups = u.groups || [];
    const groupList = groups.length
      ? `<p>Groups/Units: ${groups.map(g => `<strong>${escHtml(g.name)}</strong> (${g.role})`).join(', ')}</p>`
      : '';
    const lastLogin = u.last_login_at
      ? `<p>${t('user_last_login')||'Last login'}: ${fmtDateTime(new Date(u.last_login_at))}${u.last_login_domain ? ` ${t('from')||'from'} <em>${escHtml(u.last_login_domain)}</em>` : u.last_login_ip ? ` ${t('from')||'from'} ${escHtml(u.last_login_ip)}` : ''}</p>`
      : '';
    const accountType = u.is_oidc
      ? `<p>${t('user_account_type')||'Account type'}: <span style="color:var(--accent)">SSO / OIDC</span></p>`
      : `<p>${t('user_account_type')||'Account type'}: ${t('user_local_account')||'Local account'}</p>`;
    info.innerHTML = `
      <p>${t('user_member_since')||'Member since'}: ${u.created_at ? fmtDateTime(new Date(u.created_at)) : '—'}</p>
      <p>${t('user_login_count')||'Logins'}: ${u.login_count || 0}</p>
      ${u.nato_designations && u.nato_designations.length ? `<p>${t('user_nato_designations')||'NATO Designations'}: ${u.nato_designations.join(', ')}</p>` : ''}
      ${groupList}
      ${lastLogin}
      ${accountType}
    `;
  }

  // WebCal section
  const webCalURL = document.getElementById('profileWebCalURL');
  const webCalLink = document.getElementById('profileWebCalLink');
  if (u.webcal_token) {
    const url = `${location.protocol}//${location.host}/webcal/${u.webcal_token}.ics`;
    if (webCalURL) webCalURL.style.display = '';
    if (webCalLink) webCalLink.value = url;
  } else {
    if (webCalURL) webCalURL.style.display = 'none';
  }

  renderProfileAvatars();
  openModal('profileModal');
}

async function generateWebCalToken() {
  try {
    const res = await api('PUT', '/api/auth/profile', { generate_webcal: true });
    if (!res.ok) { showError('Failed to generate calendar link'); return; }
    const updated = await res.json();
    Object.assign(state.user, updated);
    const url = `${location.protocol}//${location.host}/webcal/${updated.webcal_token}.ics`;
    const webCalURL = document.getElementById('profileWebCalURL');
    const webCalLink = document.getElementById('profileWebCalLink');
    if (webCalURL) webCalURL.style.display = '';
    if (webCalLink) webCalLink.value = url;
    showNotification('success', 'Calendar subscription link generated');
  } catch { showError('Failed to generate calendar link'); }
}

async function saveProfile() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const displayName = val('profileDisplayName');
  const email       = val('profileEmail');
  const lang        = document.getElementById('profileLanguage')?.value || 'en';
  const curPw       = val('profilePwdCurrent');
  const newPw       = val('profilePwdNew');
  const conPw       = val('profilePwdConfirm');

  // Save display name + email
  if (displayName || email !== undefined) {
    const res = await api('PUT', `/api/users/${state.user.id}`, {
      display_name: displayName || state.user.display_name,
      email,
      role: state.user.role,
      can_lock: state.user.can_lock,
    });
    if (res.ok) {
      const updated = await res.json();
      state.user.display_name = updated.display_name || displayName;
      state.user.email = updated.email || email;
      document.getElementById('userDisplayName').textContent = state.user.display_name || state.user.username;
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to update profile');
      return;
    }
  }

  // Save profile fields, communication handles, photo
  const photoPreview = document.getElementById('profilePhotoPreview');
  const photoDataURL = (photoPreview && photoPreview.style.display !== 'none') ? (photoPreview.src || '') : '';
  await api('PUT', '/api/auth/profile', {
    mattermost_handle: val('profileMattermost'),
    discord_handle:    val('profileDiscord'),
    signal_handle:     val('profileSignal'),
    telephone:         val('profileTelephone'),
    cellular:          val('profileCellular'),
    title:             val('profileTitle'),
    rank:              val('profileRank'),
    job_role:          val('profileJobRole'),
    expertise:         val('profileExpertise'),
    photo_data_url:    photoDataURL,
    location:          val('profileLocation'),
    latitude:          parseFloat(val('profileLatitude')) || 0,
    longitude:         parseFloat(val('profileLongitude')) || 0,
    availability:      document.getElementById('profileAvailability')?.value || 'free',
  }).catch(() => {});

  // Save language preference
  if (lang) {
    await setPref('language', lang);
  }

  // Change password if provided
  if (newPw) {
    if (!curPw) { showError(t('current_password_required') || 'Current password is required'); return; }
    if (newPw !== conPw) { showError(t('password_mismatch') || 'Passwords do not match'); return; }
    const res = await apiPost('/api/auth/change-password', {current_password: curPw, new_password: newPw});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err.error || 'Failed to change password').replace(/^password_quality:\s*/,'').replace(/^oidc_account:\s*/,'');
      showError(msg);
      return;
    }
  }

  closeModal('profileModal');
  showNotification('success', 'Profile updated');
}

// ── Profile Photo helpers ─────────────────────────────────────────────────────
function loadProfilePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 1_000_000) { showError('Photo must be under 1 MB'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('profilePhotoPreview');
    const placeholder = document.getElementById('profilePhotoPlaceholder');
    const removeBtn = document.getElementById('profilePhotoRemove');
    if (preview) { preview.src = e.target.result; preview.style.display = ''; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = '';
  };
  reader.readAsDataURL(file);
}

function removeProfilePhoto() {
  const preview = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('profilePhotoRemove');
  const input = document.getElementById('profilePhotoInput');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = '';
  if (removeBtn) removeBtn.style.display = 'none';
  if (input) input.value = '';
}

// ── Default avatar picker ─────────────────────────────────────────────────────
const _DEFAULT_AVATARS = [
  { id: 'person',  label: 'Person',     svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#3a5a8a"/><circle cx="40" cy="30" r="13" fill="#c8a07a"/><ellipse cx="40" cy="72" rx="24" ry="20" fill="#c8a07a"/><rect x="16" y="60" width="48" height="24" rx="4" fill="#3a5a8a"/></svg>` },
  { id: 'soldier', label: 'Soldier',    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#3d5228"/><circle cx="40" cy="30" r="13" fill="#c8a07a"/><rect x="22" y="20" width="36" height="14" rx="4" fill="#253418"/><rect x="18" y="50" width="44" height="30" rx="4" fill="#4a6030"/></svg>` },
  { id: 'tech',    label: 'Tech',       svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#1a304a"/><rect x="24" y="20" width="32" height="28" rx="5" fill="#4090c0"/><circle cx="33" cy="32" r="5" fill="#e0f0ff"/><circle cx="47" cy="32" r="5" fill="#e0f0ff"/><rect x="30" y="42" width="20" height="5" rx="2" fill="#80d0ff"/><rect x="33" y="50" width="6" height="14" rx="3" fill="#4090c0"/><rect x="41" y="50" width="6" height="14" rx="3" fill="#4090c0"/></svg>` },
  { id: 'star',    label: 'Star Badge', svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#1a2a50"/><polygon points="40,16 46,34 65,34 51,46 56,64 40,53 24,64 29,46 15,34 34,34" fill="#f0c030"/></svg>` },
  { id: 'cat',     label: 'Cat',        svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#4a3060"/><polygon points="20,32 28,50 14,50" fill="#c09060"/><polygon points="60,32 66,50 52,50" fill="#c09060"/><circle cx="40" cy="44" r="22" fill="#c09060"/><circle cx="33" cy="42" r="4" fill="#1a0a00"/><circle cx="47" cy="42" r="4" fill="#1a0a00"/><ellipse cx="40" cy="52" rx="5" ry="3" fill="#d08080"/></svg>` },
  { id: 'bear',    label: 'Bear',       svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#3a2010"/><circle cx="26" cy="26" r="10" fill="#8a6040"/><circle cx="54" cy="26" r="10" fill="#8a6040"/><circle cx="40" cy="44" r="22" fill="#8a6040"/><circle cx="33" cy="41" r="4" fill="#1a0a00"/><circle cx="47" cy="41" r="4" fill="#1a0a00"/><ellipse cx="40" cy="52" rx="8" ry="6" fill="#b08060"/><circle cx="40" cy="49" r="3" fill="#1a0a00"/></svg>` },
  { id: 'shield',  label: 'Shield',     svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#2a1a40"/><path d="M40 12 L64 22 L64 44 Q64 64 40 72 Q16 64 16 44 L16 22 Z" fill="#4060c0" stroke="#6080e0" stroke-width="2"/><polygon points="40,28 44,38 55,38 46,44 50,55 40,49 30,55 34,44 25,38 36,38" fill="#f0d060"/></svg>` },
  { id: 'pilot',   label: 'Pilot',      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#202840"/><ellipse cx="40" cy="36" rx="20" ry="22" fill="#3060a0"/><rect x="20" y="28" width="40" height="14" rx="3" fill="#506090"/><rect x="26" y="31" width="28" height="8" rx="2" fill="#80d0ff" opacity=".7"/><ellipse cx="40" cy="62" rx="22" ry="16" fill="#3060a0"/></svg>` },
];

function renderProfileAvatars() {
  const grid = document.getElementById('profileAvatarGrid');
  if (!grid) return;
  grid.innerHTML = _DEFAULT_AVATARS.map(a =>
    `<div title="${escHtml(a.label)}" data-action="selectDefaultAvatar" data-arg="${a.id}"
      class="avatar-pick"
      style="width:32px;height:32px;border-radius:50%;overflow:hidden;cursor:pointer;
             border:2px solid var(--border);transition:border-color .15s,transform .15s;flex-shrink:0">${a.svg}</div>`
  ).join('');
  grid.querySelectorAll('.avatar-pick').forEach(el => {
    el.addEventListener('mouseover', () => { el.style.borderColor = 'var(--accent)'; el.style.transform = 'scale(1.1)'; });
    el.addEventListener('mouseout', () => { el.style.borderColor = 'var(--border)'; el.style.transform = 'scale(1)'; });
  });
  _bindActions(grid);
}

function selectDefaultAvatar(id) {
  const avatar = _DEFAULT_AVATARS.find(a => a.id === id);
  if (!avatar) return;
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatar.svg);
  const preview = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('profilePhotoRemove');
  if (preview) { preview.src = dataUrl; preview.style.display = ''; }
  if (placeholder) placeholder.style.display = 'none';
  if (removeBtn) removeBtn.style.display = '';
}

// ── Profile language change handler ──────────────────────────────────────────
function onProfileLanguageChange(lang) {
  state.preferences.language = lang;
  applyPreferences();
  updateUILabels();
  // Refresh all data-i18n elements inside the profile modal immediately
  document.querySelectorAll('#profileModal [data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated && translated !== key) el.textContent = translated;
  });
}

// ── Password Policy helpers ───────────────────────────────────────────────────
let _cachedPasswordPolicy = null;

async function _loadProfilePwdPolicy() {
  try {
    if (!_cachedPasswordPolicy) {
      _cachedPasswordPolicy = await apiGet('/api/auth/password-policy').catch(() => null);
    }
    const ss = _cachedPasswordPolicy;
    const infoEl = document.getElementById('profilePwdPolicyInfo');
    if (!infoEl || !ss || !ss.password_policy_enabled) return;
    const rules = [];
    if (ss.min_length > 0) rules.push(`Min. ${ss.min_length} characters`);
    if (ss.require_uppercase) rules.push('Uppercase (A–Z)');
    if (ss.require_lowercase) rules.push('Lowercase (a–z)');
    if (ss.require_numbers)   rules.push('Numbers (0–9)');
    if (ss.require_symbols)   rules.push('Symbols (!@#…)');
    if (rules.length) {
      infoEl.style.display = '';
      infoEl.textContent = '🔐 Password policy: ' + rules.join(' · ');
    }
  } catch { /* policy load is best-effort */ }
}

async function _loadStandalonePwdPolicy() {
  try {
    if (!_cachedPasswordPolicy) {
      _cachedPasswordPolicy = await apiGet('/api/auth/password-policy').catch(() => null);
    }
    const ss = _cachedPasswordPolicy;
    const infoEl = document.getElementById('pwdPolicyInfo');
    if (!infoEl || !ss || !ss.password_policy_enabled) return;
    const rules = [];
    if (ss.min_length > 0) rules.push(`Min. ${ss.min_length} characters`);
    if (ss.require_uppercase) rules.push('Uppercase (A–Z)');
    if (ss.require_lowercase) rules.push('Lowercase (a–z)');
    if (ss.require_numbers)   rules.push('Numbers (0–9)');
    if (ss.require_symbols)   rules.push('Symbols (!@#…)');
    if (rules.length) {
      infoEl.style.display = '';
      infoEl.textContent = '🔐 Password policy: ' + rules.join(' · ');
    }
  } catch { /* best-effort */ }
}

function _generatePassword(policy) {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const syms   = '!@#$%^&*-_=+?';
  const minLen = (policy && policy.min_length > 0) ? Math.max(policy.min_length, 12) : 12;
  let chars = lower + upper + digits;
  let pwd = [];
  if (!policy || policy.require_uppercase) { pwd.push(upper[Math.floor(Math.random()*upper.length)]); }
  if (!policy || policy.require_lowercase) { pwd.push(lower[Math.floor(Math.random()*lower.length)]); }
  if (!policy || policy.require_numbers)   { pwd.push(digits[Math.floor(Math.random()*digits.length)]); }
  if (policy && policy.require_symbols)    { pwd.push(syms[Math.floor(Math.random()*syms.length)]); chars += syms; }
  while (pwd.length < minLen) {
    pwd.push(chars[Math.floor(Math.random()*chars.length)]);
  }
  // Shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}

async function generateProfilePassword() {
  const policy = _cachedPasswordPolicy || await apiGet('/api/auth/password-policy').catch(() => null);
  _cachedPasswordPolicy = policy;
  const pw = _generatePassword(policy);
  const inp = document.getElementById('profilePwdNew');
  const conf = document.getElementById('profilePwdConfirm');
  const copyBtn = document.getElementById('profilePwdCopyBtn');
  if (inp) { inp.value = pw; inp.type = 'text'; updatePwdStrength('profilePwdNew','profilePwdStrengthBar','profilePwdStrengthLabel'); }
  if (conf) conf.value = pw;
  if (copyBtn) copyBtn.style.display = '';
}

function copyProfilePassword() {
  const inp = document.getElementById('profilePwdNew');
  if (!inp || !inp.value) return;
  navigator.clipboard.writeText(inp.value).then(() => showNotification('success', 'Password copied to clipboard')).catch(() => {
    prompt('Copy this password:', inp.value);
  });
}

async function generateStandalonePassword() {
  const policy = _cachedPasswordPolicy || await apiGet('/api/auth/password-policy').catch(() => null);
  _cachedPasswordPolicy = policy;
  const pw = _generatePassword(policy);
  const inp = document.getElementById('pwdNew');
  const conf = document.getElementById('pwdConfirm');
  const copyBtn = document.getElementById('pwdCopyBtn');
  if (inp) { inp.value = pw; inp.type = 'text'; updatePwdStrength('pwdNew','pwdStrengthBar','pwdStrengthLabel'); }
  if (conf) conf.value = pw;
  if (copyBtn) copyBtn.style.display = '';
}

function copyStandalonePassword() {
  const inp = document.getElementById('pwdNew');
  if (!inp || !inp.value) return;
  navigator.clipboard.writeText(inp.value).then(() => showNotification('success', 'Password copied to clipboard')).catch(() => {
    prompt('Copy this password:', inp.value);
  });
}

// ── Password Strength Meter ───────────────────────────────────────────────────
// updatePwdStrength(inputId, barId, labelId) — call from oninput on password fields.
// Computes a 0–4 score and updates the visual bar + label.
function updatePwdStrength(inputId, barId, labelId) {
  const pw  = document.getElementById(inputId)?.value || '';
  const bar = document.getElementById(barId);
  const lbl = document.getElementById(labelId);
  if (!bar || !lbl) return;

  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // clamp to 4
  score = Math.min(score, 4);

  const pct   = pw.length === 0 ? 0 : Math.max(10, score * 25);
  const color = ['#ccc','#e74c3c','#e67e22','#f1c40f','#27ae60'][score];
  const label = ['','Very weak','Weak','Fair','Strong','Very strong'][pw.length === 0 ? 0 : score + (score === 4 ? 0 : 0)];
  // Simpler label map
  const labels = {0:'',1:'Very weak',2:'Weak',3:'Fair',4:'Strong'};
  bar.style.width = pct + '%';
  bar.style.background = color;
  lbl.textContent = pw.length === 0 ? '' : (labels[score] || '');
  lbl.style.color = color;
}

