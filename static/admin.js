'use strict';
window.state = { preferences: { language: 'en', theme: 'light', size: 'small' } };

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _getCSRFToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? m[1] : '';
}
async function api(path, opts) {
  if (!opts) opts = {};
  if (!opts.headers) opts.headers = {};
  // Add CSRF protection header for state-changing requests
  if (opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') {
    opts.headers['X-Requested-With'] = 'XMLHttpRequest';
    const csrf = _getCSRFToken();
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  }
  const r = await fetch(path, opts);
  if (r.status === 401) { window.location.href = '/login'; throw new Error('unauth'); }
  if (r.status === 403) { throw new Error('forbidden'); }
  return r;
}

async function apiJSON(path) {
  const r = await api(path);
  return r.json();
}

function fmtDT(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

async function loadAdmin() {
  try {
    const [me, ver, users, groups, layers, exercise, regSettings] = await Promise.all([
      apiJSON('/api/auth/me'),
      apiJSON('/api/version'),
      apiJSON('/api/users'),
      apiJSON('/api/groups'),
      apiJSON('/api/layers'),
      apiJSON('/api/exercise'),
      apiJSON('/api/admin/registration'),
    ]);

    // System info
    document.getElementById('cfgVersion').textContent = ver.version || '—';
    document.getElementById('cfgDataDir').textContent = ver.data_dir || '(not exposed)';
    document.getElementById('cfgUser').textContent = `${me.display_name || me.username} (${me.role})`;
    document.title = `Admin — Tidslinjal v${ver.version || ''}`;

    // Stats
    document.getElementById('statUsers').textContent = (users||[]).length;
    document.getElementById('statGroups').textContent = (groups||[]).length;
    document.getElementById('statLayers').textContent = (layers||[]).length;

    // Exercise
    document.getElementById('exLabel').textContent   = exercise.label   || '(not set)';
    document.getElementById('exEpoch').textContent   = exercise.epoch   ? fmtDT(exercise.epoch) : '(not set)';
    document.getElementById('exEndex').textContent   = exercise.endex   ? fmtDT(exercise.endex) : '(not set)';
    document.getElementById('exEnabled').textContent = exercise.enabled ? '✓ Yes' : '✗ No';

    // Events stat
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to   = new Date(now.getFullYear(), now.getMonth()+1, 1).toISOString();
    try {
      const evs = await apiJSON(`/api/events?from=${from}&to=${to}`);
      document.getElementById('statEvents').textContent = (evs||[]).length;
    } catch { document.getElementById('statEvents').textContent = '?'; }

    // Users table
    const roleBadge = r => `<span class="badge badge-${r}">${r}</span>`;
    document.getElementById('userTbody').innerHTML = (users||[]).map(u => {
      let statusCell = u.vetted ? '✓ Active' : '<span class="pending-badge">Pending</span>';
      if (u.blocked) statusCell = '<span class="badge" style="background:rgba(231,76,60,.2);color:#e74c3c">⛔ Blocked</span>';
      let actions = '';
      if (!u.vetted && !u.blocked) actions += `<button class="btn btn-primary btn-sm" data-action="vet" data-user-id="${u.id}" style="margin-right:4px">Approve</button>`;
      if (!u.blocked && u.role !== 'admin') actions += `<button class="btn btn-danger btn-sm" data-action="block" data-user-id="${u.id}" data-username="${escHtml(u.username)}">Block</button>`;
      if (u.blocked) actions += `<button class="btn btn-secondary btn-sm" data-action="unblock" data-user-id="${u.id}">Unblock</button>`;
      return `<tr>
        <td>${u.id}</td>
        <td>${escHtml(u.username)}${u.is_oidc ? ' <span title="OIDC user" style="font-size:10px;color:var(--accent)">SSO</span>' : ''}</td>
        <td>${escHtml(u.display_name||'')}</td>
        <td style="font-size:11px">${escHtml(u.email||'—')}</td>
        <td>${roleBadge(u.role)}</td>
        <td>${u.can_lock ? '✓' : ''}</td>
        <td>${statusCell}</td>
        <td style="white-space:nowrap;font-size:11px">${fmtDT(u.created_at)}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    // Registration settings
    const mode = (regSettings && regSettings.mode) || 'off';
    document.getElementById('regMode').value = mode;
    document.getElementById('genericCode').value = (regSettings && regSettings.invitation_code) || '';
    updateRegUI(mode);

    if (mode === 'personal_invitation') {
      loadInvitations();
    }

  } catch(e) {
    const errEl = document.getElementById('adminError');
    errEl.style.display = '';
    errEl.textContent = e.message === 'forbidden'
      ? 'Access denied — admin role required.'
      : 'Error loading admin data: ' + e.message;
  }
}

function updateRegUI(mode) {
  document.getElementById('genericCodeSection').style.display = mode === 'generic_invitation' ? '' : 'none';
  document.getElementById('personalInvSection').style.display = mode === 'personal_invitation' ? '' : 'none';
}

async function saveRegistrationMode() {
  const mode = document.getElementById('regMode').value;
  const code = document.getElementById('genericCode').value.trim();
  try {
    const r = await api('/api/admin/registration', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode, invitation_code: code}),
    });
    if (r.ok) { alert('Registration settings saved.'); }
    else { const e = await r.json(); alert('Error: ' + (e.error||'unknown')); }
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadInvitations() {
  try {
    const invs = await apiJSON('/api/admin/invitations');
    const el = document.getElementById('invitationsList');
    if (!invs || invs.length === 0) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:var(--fs-sm)">No invitations yet.</div>';
      return;
    }
    el.innerHTML = invs.map(inv => `
      <div class="inv-item">
        <span class="inv-code">${escHtml(inv.code)}</span>
        <span style="color:var(--text-dim);flex:1">${escHtml(inv.note||'')}</span>
        ${inv.used ? `<span style="color:var(--green);font-size:11px">✓ Used by ${escHtml(inv.used_by||'?')}</span>` : '<span style="color:var(--accent);font-size:11px">Available</span>'}
        <button class="btn btn-danger btn-sm" data-action="delete-invitation" data-invitation-id="${inv.id}">✕</button>
      </div>`).join('');
  } catch(e) { console.error(e); }
}

async function createInvitation() {
  const note  = document.getElementById('invNote').value.trim();
  const email = document.getElementById('invEmail')?.value?.trim() || '';
  try {
    const r = await api('/api/admin/invitations', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({note, email}),
    });
    if (r.ok) {
      document.getElementById('invNote').value = '';
      if (document.getElementById('invEmail')) document.getElementById('invEmail').value = '';
      if (email) alert('Invitation created and email sent to ' + email);
      loadInvitations();
    } else {
      const e = await r.json(); alert('Error: ' + (e.error||'unknown'));
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function deleteInvitation(id) {
  if (!confirm('Delete this invitation code?')) return;
  try {
    const r = await api(`/api/admin/invitations/${id}`, {method: 'DELETE'});
    if (r.ok) loadInvitations();
    else { const e = await r.json(); alert('Error: ' + (e.error||'unknown')); }
  } catch(e) { alert('Error: ' + e.message); }
}

async function vetUser(id, btn) {
  try {
    const r = await api(`/api/users/${id}/vet`, {method: 'POST'});
    if (r.ok) {
      btn.closest('tr').querySelector('td:nth-child(7)').innerHTML = '✓ Active';
      btn.remove();
      alert('User approved successfully.');
    } else {
      const e = await r.json(); alert('Error: ' + (e.error||'unknown'));
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// Apply theme from localStorage/cookie if available; default to light
const savedTheme = document.cookie.match(/theme=([^;]+)/);
const adminTheme = (savedTheme && savedTheme[1]) || 'light';
if (adminTheme === 'light') document.body.classList.add('light-mode');
else if (adminTheme === 'city-camo') document.body.classList.add('city-camo');
else if (adminTheme === 'urban-camo') document.body.classList.add('urban-camo');

// ── Block / Unblock User ──────────────────────────────────────────────────
async function blockUser(id, username, btn) {
  if (!confirm(`Block user "${username}"? They will not be able to log in (even via OIDC).`)) return;
  try {
    const r = await api(`/api/users/${id}/block`, {method: 'POST'});
    if (r.ok) { loadAdmin(); }
    else { const e = await r.json(); alert('Error: ' + (e.error||'unknown')); }
  } catch(e) { alert('Error: ' + e.message); }
}

async function unblockUser(id, btn) {
  try {
    const r = await api(`/api/users/${id}/unblock`, {method: 'POST'});
    if (r.ok) { loadAdmin(); }
    else { const e = await r.json(); alert('Error: ' + (e.error||'unknown')); }
  } catch(e) { alert('Error: ' + e.message); }
}

// ── Bulk Event Actions ────────────────────────────────────────────────────
function updateBulkValueUI() {
  const f = document.getElementById('bulkFilter').value;
  const hints = {
    type: 'Event type key, e.g. "event", "decision", "meeting"…',
    user: 'User numeric ID (see Users table above)',
    group: 'Group name or numeric ID',
    role: 'Role name: observer, read, reporter, teammember, teamlead, oplead, staffofficer, staffofficer_full, admin',
  };
  document.getElementById('bulkTypeHelper').textContent = hints[f] || '';
}

async function bulkSetStatus() {
  const filter = document.getElementById('bulkFilter').value;
  const value  = document.getElementById('bulkValue').value.trim();
  const status = document.getElementById('bulkStatus').value;
  if (!value) { alert('Please enter a filter value.'); return; }
  if (!confirm(`Set all matching events (filter: ${filter}="${value}") to status "${status}"?`)) return;
  try {
    const r = await api('/api/admin/bulk/status', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({filter, value, status}),
    });
    const data = await r.json();
    if (r.ok) {
      const el = document.getElementById('bulkResult');
      el.style.display = '';
      el.style.color = 'var(--green)';
      el.textContent = `✓ Updated ${data.updated} event(s) to status "${status}".`;
    } else {
      alert('Error: ' + (data.error||'unknown'));
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function bulkDeleteEvents() {
  const filter = document.getElementById('bulkFilter').value;
  const value  = document.getElementById('bulkValue').value.trim();
  if (!value) { alert('Please enter a filter value.'); return; }
  if (!confirm(`⚠ Delete ALL events matching ${filter}="${value}"? Type DELETE to confirm.`)) return;
  const conf = prompt('Type DELETE to confirm permanent deletion:');
  if (conf !== 'DELETE') { alert('Cancelled.'); return; }
  try {
    const r = await api('/api/admin/bulk/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({filter, value, confirm: 'DELETE'}),
    });
    const data = await r.json();
    if (r.ok) {
      const el = document.getElementById('bulkResult');
      el.style.display = '';
      el.style.color = 'var(--red)';
      el.textContent = `✓ Deleted ${data.deleted} event(s).`;
    } else {
      alert('Error: ' + (data.error||'unknown'));
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// ── Session Management ────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const sessions = await apiJSON('/api/admin/sessions');
    const el = document.getElementById('sessionsList');
    if (!sessions || sessions.length === 0) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:var(--fs-sm)">No active sessions.</div>';
      return;
    }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
      <thead><tr><th style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:left">User</th><th style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:left">Session ID</th><th style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:left">Expires</th><th></th></tr></thead>
      <tbody>` + sessions.map(s => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid var(--border)">${escHtml(s.display_name||s.username||s.user_id)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${(s.id||'').substring(0,12)}…</td>
          <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px">${fmtDT(s.expires_at)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid var(--border)"><button class="btn btn-danger btn-sm" data-action="terminate-session" data-session-id="${s.id}">Terminate</button></td>
        </tr>`).join('') + `</tbody></table>`;
  } catch(e) { console.error(e); }
}

async function terminateSession(id) {
  if (!confirm('Terminate this session? The user will be logged out immediately.')) return;
  try {
    const r = await api(`/api/admin/sessions/${encodeURIComponent(id)}`, {method: 'DELETE'});
    if (r.ok) { loadSessions(); }
    else { const e = await r.json(); alert('Error: ' + (e.error||'unknown')); }
  } catch(e) { alert('Error: ' + e.message); }
}

function hideResetConfirmBox() {
  document.getElementById('resetConfirmBox').style.display = 'none';
}

// ── DOMContentLoaded: wire up all event listeners ─────────────────────────
document.addEventListener('DOMContentLoaded', function() {

  // Registration mode save buttons
  document.getElementById('btnSaveRegMode').addEventListener('click', saveRegistrationMode);
  document.getElementById('btnSaveGenericCode').addEventListener('click', saveRegistrationMode);

  // Create invitation button
  document.getElementById('btnCreateInvitation').addEventListener('click', createInvitation);

  // Bulk filter change
  document.getElementById('bulkFilter').addEventListener('change', updateBulkValueUI);

  // Bulk action buttons
  document.getElementById('btnBulkSetStatus').addEventListener('click', bulkSetStatus);
  document.getElementById('btnBulkDelete').addEventListener('click', bulkDeleteEvents);

  // Refresh sessions button
  document.getElementById('btnRefreshSessions').addEventListener('click', loadSessions);

  // Reset to empty button
  document.getElementById('btnResetToEmpty').addEventListener('click', function() {
    document.getElementById('resetConfirmBox').style.display = '';
    document.getElementById('resetConfirmInput').value = '';
    document.getElementById('resetConfirmInput').focus();
  });

  // Confirm reset button
  document.getElementById('btnConfirmReset').addEventListener('click', async function() {
    const val = document.getElementById('resetConfirmInput').value.trim();
    if (val !== 'RESET') {
      alert('Please type RESET to confirm.');
      return;
    }
    const keepTemplates = document.getElementById('keepTemplatesCheck').checked;
    try {
      const r = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({confirm: 'RESET', keep_templates: keepTemplates}),
      });
      if (r.ok) {
        alert(`Reset complete. All data has been cleared${keepTemplates ? ' (templates preserved)' : ''}. Reloading...`);
        window.location.reload();
      } else {
        const err = await r.json();
        alert('Reset failed: ' + (err.error || 'unknown error'));
      }
    } catch(e) {
      alert('Reset failed: ' + e.message);
    }
  });

  // Cancel reset button
  document.getElementById('btnCancelReset').addEventListener('click', hideResetConfirmBox);

  // Registration mode dropdown change
  document.getElementById('regMode').addEventListener('change', function(e) {
    updateRegUI(e.target.value);
    if (e.target.value === 'personal_invitation') loadInvitations();
  });

  // ── Event delegation for dynamically generated content ──────────────────

  // User table: vet, block, unblock actions
  document.getElementById('userTbody').addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const userId = parseInt(btn.dataset.userId, 10);
    if (action === 'vet') {
      vetUser(userId, btn);
    } else if (action === 'block') {
      blockUser(userId, btn.dataset.username, btn);
    } else if (action === 'unblock') {
      unblockUser(userId, btn);
    }
  });

  // Invitations list: delete invitation
  document.getElementById('invitationsList').addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-action="delete-invitation"]');
    if (!btn) return;
    deleteInvitation(parseInt(btn.dataset.invitationId, 10));
  });

  // Sessions list: terminate session
  document.getElementById('sessionsList').addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-action="terminate-session"]');
    if (!btn) return;
    terminateSession(btn.dataset.sessionId);
  });

  // Load initial data
  loadAdmin();
  loadSessions();
});
