'use strict';
const opener = window.opener;
let entries = [];
let userRole = '';
let userId = 0;
let groups = [];
let users = [];
let _t = {}; // i18n translations

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function t(key) {
  return _t[key] || key;
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('unauth'); }
  return res;
}

async function loadEntries() {
  try {
    const res = await api('GET', '/api/decision-log');
    if (res.ok) entries = await res.json() || [];
  } catch { entries = []; }
  render();
}

function render() {
  const el = document.getElementById('dlEntries');
  if (!entries.length) {
    el.innerHTML = '<div class="dl-empty">' + escHtml(t('decision_log_empty')) + '</div>';
    return;
  }
  const canReview = ['admin','oplead','staffofficer','staffofficer_full','teamlead'].includes(userRole);
  const isAdmin = userRole === 'admin';
  el.innerHTML = entries.slice().reverse().map(e => {
    const ts = new Date(e.timestamp).toLocaleString();
    const confBadge = e.confidential ? ' <span style="color:var(--danger);font-weight:700">🔒 ' + escHtml(t('confidential')) + '</span>' : '';
    const typeBadge = e.log_type === 'private' ? ' 🔵' : e.log_type === 'group' ? ' 🟢' : '';
    let statusBadge = '';
    let reviewSection = '';
    if (e.status === 'requested') {
      const targetInfo = e.requested_of_label ? ' → ' + escHtml(e.requested_of_label) : '';
      statusBadge = '<span class="badge badge-requested">PENDING' + targetInfo + '</span>';
      if (canReview) {
        reviewSection = '<div style="margin-top:6px">' +
          '<input type="text" data-review-id="' + e.id + '" placeholder="' + escHtml(t('review_comment') || 'Comment / condition / modification...') + '" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:4px 8px;font-size:11px;margin-bottom:6px">' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
          '<button class="btn-primary" data-approve="' + e.id + '" data-approval-type="approved" style="padding:2px 8px;font-size:11px">✓ ' + escHtml(t('btn_approve') || 'Approve') + '</button>' +
          '<button class="btn-primary" data-approve="' + e.id + '" data-approval-type="approved_with_condition" style="padding:2px 8px;font-size:11px;background:#2ECC71">✓⚠ ' + escHtml(t('btn_approve_condition') || 'Approve w/ Condition') + '</button>' +
          '<button class="btn-primary" data-approve="' + e.id + '" data-approval-type="approved_with_modification" style="padding:2px 8px;font-size:11px;border:1px dashed #fff">✓✏ ' + escHtml(t('btn_approve_modification') || 'Approve w/ Modification') + '</button>' +
          '<button class="btn-danger" data-reject="' + e.id + '" style="padding:2px 8px;font-size:11px">✗ ' + escHtml(t('btn_deny') || 'Deny') + '</button>' +
          '</div></div>';
      }
    } else if (e.status === 'approved') {
      statusBadge = '<span class="badge badge-approved">DECIDED</span>';
      if (e.reviewed_by_name) reviewSection = '<div class="dl-review">✓ ' + escHtml(e.reviewed_by_name) + (e.reviewed_at ? ' — ' + new Date(e.reviewed_at).toLocaleString() : '') + (e.review_comment ? ': ' + escHtml(e.review_comment) : '') + '</div>';
    } else if (e.status === 'rejected') {
      statusBadge = '<span class="badge badge-rejected">REJECTED</span>';
      if (e.reviewed_by_name) reviewSection = '<div class="dl-review">✗ ' + escHtml(e.reviewed_by_name) + (e.reviewed_at ? ' — ' + new Date(e.reviewed_at).toLocaleString() : '') + (e.review_comment ? ': ' + escHtml(e.review_comment) : '') + '</div>';
    }
    // Reason/background
    const reasonSection = e.reason ? '<div style="margin-top:4px;font-size:12px;color:var(--text-dim);font-style:italic;border-left:3px solid var(--accent);padding-left:8px">' + escHtml(e.reason) + '</div>' : '';
    // Four-eyes co-sign info
    let coSignSection = '';
    if (e.co_sign_required) {
      if (e.co_signed_by_name) {
        coSignSection = '<div style="margin-top:4px;font-size:11px;color:var(--text-dim)">👁👁 Co-signed by ' + escHtml(e.co_signed_by_name) + (e.co_signed_at ? ' — ' + new Date(e.co_signed_at).toLocaleString() : '') + (e.co_sign_comment ? ': ' + escHtml(e.co_sign_comment) : '') + '</div>';
      } else {
        coSignSection = '<div style="margin-top:4px;font-size:11px;color:#E67E22">👁👁 Co-sign required (pending)</div>';
        if (canReview && e.user_id !== userId) {
          coSignSection += '<div style="margin-top:4px;display:flex;gap:6px;align-items:center"><input type="text" data-cosign-id="' + e.id + '" placeholder="Co-sign comment" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:4px 8px;font-size:11px"><button class="btn-primary" data-cosign="' + e.id + '" style="padding:2px 8px;font-size:11px">👁👁 Co-sign</button></div>';
        }
      }
    }
    const delBtn = isAdmin ? ' <button class="btn-danger" data-delete="' + e.id + '" style="padding:1px 6px;font-size:10px">×</button>' : '';
    const attachSection = (e.attachments && e.attachments.length) ? '<div class="dl-attachments">' + e.attachments.map(a =>
      '<a href="/api/decision-log/' + e.id + '/attachment/' + encodeURIComponent(a.stored_name) + '" target="_blank" title="' + escHtml(a.filename) + '">📎 ' + escHtml(a.filename) + '</a>'
    ).join('') + '</div>' : '';
    // Decision body: render as HTML (sanitised on server) so rich text
    // formatting (bold, lists, links etc.) is preserved.  Fall back to
    // escaped plain text only if the value looks like it has never been
    // through the rich-text editor (no HTML tags at all).
    const bodyHtml = (e.decision && /<[a-z][\s\S]*>/i.test(e.decision)) ? e.decision : escHtml(e.decision || '');
    // Background color: custom or deadline-auto
    let entryBg = '';
    if (e.color) entryBg = 'background:' + escHtml(e.color) + ';color:#222;';
    else if (e.deadline && e.status === 'requested') entryBg = 'background:#FFF4C2;color:#222;';
    else if ((e.status === 'approved' || (!e.status && e.decided_at)) && e.approval_type === 'approved_with_condition') entryBg = 'background:#FFF4C2;color:#222;';
    else if (e.deadline && e.status === 'rejected') entryBg = 'background:#FFD6D6;color:#222;';
    const seqLabel = e.sequence_number ? '<span style="font-family:monospace;font-size:10px;color:var(--text-dim);margin-right:4px">' + escHtml(e.sequence_number) + '</span>' : '';
    return '<div class="dl-entry" style="' + entryBg + 'border-radius:6px;margin-bottom:4px;border:1px solid var(--border)"><div class="dl-entry-header"><div>' + seqLabel + '<span style="font-weight:600">' + escHtml(e.display_name || e.user_name) + '</span><span class="dl-meta">' + ts + typeBadge + confBadge + '</span>' + statusBadge + '</div>' + delBtn + '</div><div class="dl-text" style="line-height:1.5">' + bodyHtml + '</div>' + reasonSection + attachSection + coSignSection + reviewSection + '</div>';
  }).join('');
  bindEntryActions();
}

function bindEntryActions() {
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('decision_delete_confirm'))) return;
      await api('DELETE', '/api/decision-log/' + btn.dataset.delete);
      loadEntries();
    };
  });
  document.querySelectorAll('[data-approve]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.approve;
      const approvalType = btn.dataset.approvalType || 'approved';
      const comment = document.querySelector('[data-review-id="' + id + '"]')?.value || '';
      if ((approvalType === 'approved_with_condition' || approvalType === 'approved_with_modification') && !comment) {
        alert(t('decision_condition_comment_required') || 'Please describe the condition or modification');
        return;
      }
      await api('PUT', '/api/decision-log/' + id + '/review', { status: 'approved', comment, approval_type: approvalType });
      loadEntries();
    };
  });
  document.querySelectorAll('[data-reject]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.reject;
      const comment = document.querySelector('[data-review-id="' + id + '"]')?.value || '';
      if (!comment) {
        alert(t('deny_reason_required') || 'A reason is required when denying a decision');
        return;
      }
      await api('PUT', '/api/decision-log/' + id + '/review', { status: 'rejected', comment });
      loadEntries();
    };
  });
  document.querySelectorAll('[data-cosign]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.cosign;
      const comment = document.querySelector('[data-cosign-id="' + id + '"]')?.value || '';
      await api('PUT', '/api/decision-log/' + id + '/cosign', { comment });
      loadEntries();
    };
  });
}

async function uploadAttachments(entryId) {
  const fileInput = document.getElementById('dlAttachFile');
  if (!fileInput?.files?.length) return;
  for (const f of fileInput.files) {
    const fd = new FormData();
    fd.append('file', f);
    await api('POST', '/api/decision-log/' + entryId + '/attachment', fd);
  }
  fileInput.value = '';
}

function getOpener() {
  try { return window.opener && !window.opener.closed ? window.opener : null; } catch(e) { return null; }
}

function initFromOpener() {
  var op = getOpener();
  if (!op || !op.state) return false;
  try {
    const s = op.state;
    userRole = s.user?.role || '';
    userId = s.user?.id || 0;
    groups = s.groups || [];
    users = s.users || [];
    // Load i18n translations
    if (op.TRANSLATIONS) {
      const lang = s.preferences?.language || 'en';
      _t = op.TRANSLATIONS[lang] || op.TRANSLATIONS.en || {};
    }
    // Apply theme
    const theme = s.preferences?.theme || 'dark';
    document.body.className = 'theme-' + theme;
    return true;
  } catch(e) {
    return false;
  }
}

async function initFromAPI() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return false;
    const me = await res.json();
    userRole = me.role || '';
    userId = me.id || 0;
    // Fetch groups, users, and preferences in parallel
    const [grpRes, usrRes, prefRes] = await Promise.all([
      fetch('/api/groups').catch(() => null),
      fetch('/api/users').catch(() => null),
      fetch('/api/preferences').catch(() => null),
    ]);
    if (grpRes && grpRes.ok) groups = await grpRes.json() || [];
    if (usrRes && usrRes.ok) users = await usrRes.json() || [];
    // Load preferences for theme
    if (prefRes && prefRes.ok) {
      const prefs = await prefRes.json();
      if (prefs) {
        const theme = prefs.theme || 'dark';
        document.body.className = 'theme-' + theme;
        // Load i18n if available globally (loaded via script tag)
        const lang = prefs.language || 'en';
        if (typeof TRANSLATIONS !== 'undefined') {
          _t = TRANSLATIONS[lang] || TRANSLATIONS.en || {};
        }
      }
    }
    return true;
  } catch { return false; }
}

// Dynamically load i18n.js so translations work even without opener
function _loadI18nScript() {
  return new Promise(function(resolve) {
    if (typeof TRANSLATIONS !== 'undefined') { resolve(); return; }
    var s = document.createElement('script');
    s.src = '/static/i18n.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

function applyI18n() {
  const el = (id, key, fallback) => {
    const e = document.getElementById(id);
    if (e) e.textContent = _t[key] || fallback || key;
  };
  el('dlHeaderTitle', 'decision_log_title', '📋 Tidslinjal — Decision Log');
  // Prefix with icon
  const hdr = document.getElementById('dlHeaderTitle');
  if (hdr && _t.decision_log_title) hdr.textContent = '📋 Tidslinjal — ' + _t.decision_log_title;
  el('lblRefresh', 'btn_refresh', 'Refresh');
  el('lblConfidential', 'confidential', 'Confidential');
  el('btnAdd', 'btn_add_decision', 'Add Decision');
  el('btnRequest', 'btn_request_decision', 'Request Decision');
  const ta = document.getElementById('dlNewDecision');
  if (ta) ta.placeholder = _t.decision_log_placeholder || 'Enter decision...';
  el('optGeneral', 'decision_log_general', 'General (all)');
  el('optGroup', 'decision_log_group', 'Group/Unit only');
  el('optPrivate', 'decision_log_private', 'Private');
}

function setupUI() {
  // Show add panel if user can write
  const canWrite = userRole === 'admin' ||
    ['teamlead','oplead','staffofficer','staffofficer_full'].includes(userRole);
  if (canWrite) {
    document.getElementById('dlAddPanel').style.display = '';
    // Populate groups
    const groupSel = document.getElementById('dlGroupId');
    groupSel.innerHTML = groups.map(g => '<option value="' + g.id + '">' + escHtml(g.name) + '</option>').join('');
    document.getElementById('dlLogType').onchange = function() {
      groupSel.style.display = this.value === 'group' ? '' : 'none';
    };
  }
  applyI18n();
}

document.getElementById('btnRefresh').onclick = loadEntries;

document.getElementById('btnAdd').onclick = async () => {
  const text = document.getElementById('dlNewDecision').value.trim();
  if (!text) return alert(_t.decision_required || 'Decision text is required');
  const logType = document.getElementById('dlLogType').value || 'general';
  const groupId = logType === 'group' ? parseInt(document.getElementById('dlGroupId').value || '0') : 0;
  const confidential = document.getElementById('dlConfidential').checked;
  const reason = document.getElementById('dlReason').value.trim();
  const coSignRequired = document.getElementById('dlCoSignRequired').checked;
  const res = await api('POST', '/api/decision-log', { decision: text, log_type: logType, group_id: groupId, confidential, reason, co_sign_required: coSignRequired });
  if (res.ok) {
    const created = await res.json().catch(() => null);
    if (created) await uploadAttachments(created.id);
    document.getElementById('dlNewDecision').value = '';
    document.getElementById('dlReason').value = '';
    document.getElementById('dlCoSignRequired').checked = false;
    loadEntries();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Failed to add decision');
  }
};

document.getElementById('btnRequest').onclick = async () => {
  const text = document.getElementById('dlNewDecision').value.trim();
  if (!text) return alert(_t.decision_required || 'Decision request text is required');
  const logType = document.getElementById('dlLogType').value || 'general';
  const groupId = logType === 'group' ? parseInt(document.getElementById('dlGroupId').value || '0') : 0;
  const confidential = document.getElementById('dlConfidential').checked;
  const reason = document.getElementById('dlReason').value.trim();
  const coSignRequired = document.getElementById('dlCoSignRequired').checked;
  const res = await api('POST', '/api/decision-log', { decision: text, log_type: logType, group_id: groupId, confidential, status: 'requested', reason, co_sign_required: coSignRequired });
  if (res.ok) {
    const created = await res.json().catch(() => null);
    if (created) await uploadAttachments(created.id);
    document.getElementById('dlNewDecision').value = '';
    document.getElementById('dlReason').value = '';
    document.getElementById('dlCoSignRequired').checked = false;
    loadEntries();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Failed to request decision');
  }
};

// Listen for theme changes from parent (validate origin to prevent cross-origin attacks)
window.addEventListener('message', function(e) {
  if (e.origin !== window.location.origin) return;
  if (e.data && e.data.type === 'theme') {
    document.body.className = 'theme-' + (e.data.theme || 'dark');
  }
});

// BroadcastChannel theme sync (works even if opener is lost)
try {
  var _dlBC = new BroadcastChannel('tidslinjal-sync');
  _dlBC.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      document.body.className = 'theme-' + (e.data.theme || 'dark');
    }
  };
} catch(e) {}

// Auto-refresh every 30 seconds
setInterval(loadEntries, 30000);

// Periodic theme sync — try opener first, fall back to localStorage
// so the popup keeps its theme even after the parent window closes.
setInterval(function() {
  var op = getOpener();
  var theme = '';
  if (op && op.state && op.state.preferences) {
    theme = op.state.preferences.theme || '';
  }
  if (!theme) {
    try { var prefs = JSON.parse(localStorage.getItem('tidslinjal_prefs') || '{}'); theme = prefs.theme || ''; } catch {}
  }
  if (!theme) theme = 'dark';
  if (document.body.className !== 'theme-' + theme) {
    document.body.className = 'theme-' + theme;
  }
}, 3000);

// Init: try opener first, always fall back to API for auth/role if needed
(async () => {
  var gotOpener = initFromOpener();
  if (!gotOpener) {
    // Load i18n script so translations work without opener
    await _loadI18nScript();
    await initFromAPI();
  } else if (!userRole) {
    // Opener was available but role wasn't set — fetch from API too
    await initFromAPI();
  }
  setupUI();
  loadEntries();
  // Offline-mode banner: shows a red bar at the top when network /
  // server connectivity is lost, so the operator can tell at a glance
  // that the decisions they're seeing may be stale.
  try { if (typeof initPopupOfflineBanner === 'function') initPopupOfflineBanner(); } catch(e) {}
})();
