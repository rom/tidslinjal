/* ── Resources Popup — standalone, CSP-safe ───────────────────────────────── */
(function() {
'use strict';

// ── State ───────────────────────────────────────────────────────────────────
var _users = [];
var _groups = [];
var _rooms = [];
var _customTypes = [];
var _activeTab = 'users';
var _searchTerm = '';

// ── Opener helper ───────────────────────────────────────────────────────────
function getOpener() {
  try { return window.opener && !window.opener.closed ? window.opener : null; }
  catch(e) { return null; }
}

// ── Theme sync ──────────────────────────────────────────────────────────────
function syncTheme() {
  var theme = 'theme-dark';
  try {
    var op = getOpener();
    if (op && op.state && op.state.preferences) {
      theme = 'theme-' + (op.state.preferences.theme || 'dark');
    }
  } catch(e) {}
  document.body.className = theme;
}

// BroadcastChannel for theme sync (works even if opener closes)
try {
  var _bc = new BroadcastChannel('tidslinjal-sync');
  _bc.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      document.body.className = 'theme-' + (e.data.theme || 'dark');
    }
  };
} catch(e) {}

// ── API helpers ─────────────────────────────────────────────────────────────
function apiGet(url) {
  return fetch(url, { credentials: 'include' })
    .then(function(r) { return r.ok ? r.json() : []; })
    .catch(function() { return []; });
}

function apiDelete(url) {
  var hdrs = { 'X-Requested-With': 'XMLHttpRequest' };
  var csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  if (csrfMatch) hdrs['X-CSRF-Token'] = csrfMatch[1];
  return fetch(url, { method: 'DELETE', credentials: 'include', headers: hdrs });
}

function apiPost(url, body) {
  var hdrs = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  var csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  if (csrfMatch) hdrs['X-CSRF-Token'] = csrfMatch[1];
  return fetch(url, { method: 'POST', credentials: 'include', headers: hdrs, body: JSON.stringify(body) });
}

// Check current user role for edit/delete permissions
var _currentUserRole = '';
(function() {
  fetch('/api/auth/me', { credentials: 'include' })
    .then(function(r) { return r.ok ? r.json() : {}; })
    .then(function(u) { _currentUserRole = u.role || ''; })
    .catch(function() {});
})();

function canEditResources() {
  var editRoles = ['admin','oplead','deputy_oplead','teamlead','deputy_teamlead','staffofficer','staffofficer_full','staff_assistant'];
  return editRoles.indexOf(_currentUserRole) >= 0;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Data loading ────────────────────────────────────────────────────────────
function loadAll() {
  return Promise.all([
    apiGet('/api/users'),
    apiGet('/api/groups'),
    apiGet('/api/rooms'),
    apiGet('/api/custom-resource-types')
  ]).then(function(results) {
    _users = results[0] || [];
    _groups = results[1] || [];
    _rooms = results[2] || [];
    _customTypes = results[3] || [];
    renderTabs();
    renderContent();
  });
}

// ── SSE connection for live updates ─────────────────────────────────────────
function connectSSE() {
  try {
    var es = new EventSource('/api/notifications/stream');
    es.addEventListener('user_change', function() { apiGet('/api/users').then(function(u) { _users = u || []; renderContent(); }); });
    es.addEventListener('event_change', function() { loadAll(); });
    es.onopen = function() {
      try { if (typeof reportPopupOnline === 'function') reportPopupOnline(); } catch(e) {}
    };
    es.onerror = function() {
      try { if (typeof reportPopupOffline === 'function') reportPopupOffline('SSE error'); } catch(e) {}
      setTimeout(connectSSE, 5000);
    };
  } catch(e) {}
}

// ── Tab rendering ───────────────────────────────────────────────────────────
function renderTabs() {
  var tabsEl = document.getElementById('resTabs');
  var tabs = [
    { key: 'users', label: 'Users' },
    { key: 'groups', label: 'Groups' }
  ];

  // Built-in room types
  var roomTypes = [
    { key: 'room', label: 'Rooms' },
    { key: 'building', label: 'Buildings' },
    { key: 'computer_service', label: 'IT Services' },
    { key: 'data_center', label: 'Data Centers' },
    { key: 'work_area', label: 'Work Areas' },
    { key: 'alliance_partner', label: 'Alliance Partners' }
  ];
  // Only show room type tabs that have at least one entry, or always show rooms
  roomTypes.forEach(function(rt) {
    tabs.push(rt);
  });

  // Custom resource types
  (_customTypes || []).forEach(function(crt) {
    tabs.push({ key: 'custom_' + crt.key, label: crt.icon ? crt.icon + ' ' + crt.label : crt.label });
  });

  var html = '';
  tabs.forEach(function(tb) {
    html += '<button class="res-tab' + (tb.key === _activeTab ? ' active' : '') + '" data-tab="' + escHtml(tb.key) + '">' + escHtml(tb.label) + '</button>';
  });
  tabsEl.innerHTML = html;

  // Bind clicks
  tabsEl.querySelectorAll('.res-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _activeTab = btn.dataset.tab;
      _searchTerm = '';
      renderTabs();
      renderContent();
    });
  });
}

// ── Content rendering ───────────────────────────────────────────────────────
function renderContent() {
  var el = document.getElementById('resContent');

  if (_activeTab === 'users') {
    renderUsers(el);
  } else if (_activeTab === 'groups') {
    renderGroups(el);
  } else if (_activeTab.startsWith('custom_')) {
    var customKey = _activeTab.replace('custom_', '');
    renderRoomsByType(el, customKey);
  } else {
    renderRoomsByType(el, _activeTab);
  }
}

function filterItems(items, fields) {
  if (!_searchTerm) return items;
  var term = _searchTerm.toLowerCase();
  return items.filter(function(item) {
    return fields.some(function(f) {
      return item[f] && String(item[f]).toLowerCase().indexOf(term) >= 0;
    });
  });
}

function renderSearchBox() {
  return '<input type="text" class="res-search" id="resSearch" placeholder="Search..." value="' + escHtml(_searchTerm) + '">';
}

function bindSearch() {
  var input = document.getElementById('resSearch');
  if (input) {
    input.addEventListener('input', function() {
      _searchTerm = input.value;
      renderContent();
      // Re-focus and restore cursor position
      var newInput = document.getElementById('resSearch');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(newInput.value.length, newInput.value.length);
      }
    });
  }
}

function renderUsers(el) {
  var users = filterItems(_users, ['username', 'display_name', 'role']);
  var html = renderSearchBox();

  if (users.length === 0) {
    html += '<div class="res-empty">No users found</div>';
  } else {
    // Sort by display name
    users.sort(function(a, b) {
      return (a.display_name || a.username || '').localeCompare(b.display_name || b.username || '');
    });
    users.forEach(function(u) {
      var name = u.display_name || u.username;
      var roleLabel = u.role || 'unknown';
      var initial = (name || '?')[0].toUpperCase();
      var avatar = u.photo_data_url
        ? '<img src="' + escHtml(u.photo_data_url) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover">'
        : '<div class="res-card-avatar">' + escHtml(initial) + '</div>';
      var lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—';
      var failedLogin = u.last_failed_login_at
        ? new Date(u.last_failed_login_at).toLocaleString() + (u.last_failed_login_ip ? ' (IP: ' + escHtml(u.last_failed_login_ip) + ')' : '')
        : '';
      var hasSsoInfo = u.full_name || u.locale || u.email || u.address;
      html += '<div class="res-card res-card-clickable" style="flex-wrap:wrap" data-user-id="' + u.id + '">' +
        avatar +
        '<div class="res-card-body">' +
          '<div class="res-card-name">' + escHtml(name) + '</div>' +
          '<div class="res-card-detail">' +
            '<span class="res-badge res-badge-role">' + escHtml(roleLabel) + '</span>' +
            (u.username ? ' &middot; ' + escHtml(u.username) : '') +
            (u.email ? ' &middot; ' + escHtml(u.email) : '') +
            (u.is_oidc ? ' &middot; <span class="res-badge" style="font-size:9px">SSO</span>' : '') +
          '</div>' +
          '<div class="res-card-meta">' +
            '<span>Last login: ' + lastLogin + '</span>' +
            '<span>Logins: ' + (u.login_count || 0) + '</span>' +
            (failedLogin ? '<span style="color:var(--danger)">Failed: ' + failedLogin + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="res-user-detail" id="user-detail-' + u.id + '">' +
          (u.full_name ? '<div class="res-user-detail-row"><span class="label">Full name</span><span class="value">' + escHtml(u.full_name) + '</span></div>' : '') +
          (u.locale ? '<div class="res-user-detail-row"><span class="label">Locale</span><span class="value">' + escHtml(u.locale) + '</span></div>' : '') +
          (u.email ? '<div class="res-user-detail-row"><span class="label">Email</span><span class="value">' + escHtml(u.email) + '</span></div>' : '') +
          (u.address ? '<div class="res-user-detail-row"><span class="label">Address</span><span class="value">' + escHtml(u.address) + '</span></div>' : '') +
          '<div class="res-user-detail-row"><span class="label">Groups</span><span class="value" id="user-groups-' + u.id + '">Loading...</span></div>' +
        '</div>' +
      '</div>';
    });
  }

  el.innerHTML = html;
  bindSearch();
  bindUserCards();
}

function bindUserCards() {
  var cards = document.querySelectorAll('[data-user-id]');
  cards.forEach(function(card) {
    card.addEventListener('click', function(e) {
      // Don't toggle if clicking the search box
      if (e.target.tagName === 'INPUT') return;
      var uid = card.dataset.userId;
      var detail = document.getElementById('user-detail-' + uid);
      if (!detail) return;
      var isOpen = detail.classList.contains('open');
      // Close all other detail panels
      document.querySelectorAll('.res-user-detail.open').forEach(function(d) { d.classList.remove('open'); });
      if (!isOpen) {
        detail.classList.add('open');
        // Load user groups
        var groupsEl = document.getElementById('user-groups-' + uid);
        if (groupsEl && groupsEl.textContent === 'Loading...') {
          apiGet('/api/users/' + uid + '/groups').then(function(memberships) {
            if (!memberships || memberships.length === 0) {
              groupsEl.textContent = 'None';
              return;
            }
            var names = [];
            (memberships || []).forEach(function(m) {
              var grp = _groups.find(function(g) { return g.id === m.group_id; });
              names.push(grp ? grp.name : 'Group #' + m.group_id);
            });
            groupsEl.innerHTML = '<span class="res-user-detail-groups">' +
              names.map(function(n) { return '<span class="res-badge">' + escHtml(n) + '</span>'; }).join('') +
              '</span>';
          });
        }
      }
    });
  });
}

function renderGroups(el) {
  var groups = filterItems(_groups, ['name', 'description']);
  var html = renderSearchBox();

  if (groups.length === 0) {
    html += '<div class="res-empty">No groups found</div>';
  } else {
    groups.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
    groups.forEach(function(g, idx) {
      var memberCount = typeof g.member_count === 'number' ? g.member_count : 0;
      var createdAt = g.created_at ? new Date(g.created_at).toLocaleDateString() + ' ' + new Date(g.created_at).toLocaleTimeString() : '';
      var creatorName = g.created_by_name || (g.created_by === 0 ? 'System (SSO/auto)' : 'Unknown');
      html += '<div class="res-card" style="cursor:pointer" data-group-idx="' + idx + '">' +
        '<div class="res-card-body">' +
          '<div class="res-card-name">' + escHtml(g.name) + '</div>' +
          '<div class="res-card-detail">' +
            '<span class="res-badge">👥 ' + memberCount + ' member' + (memberCount !== 1 ? 's' : '') + '</span>' +
            ' &middot; Created by: ' + escHtml(creatorName) +
            (createdAt ? ' &middot; ' + createdAt : '') +
            (g.description ? '<br>' + escHtml(g.description) : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
  }

  el.innerHTML = html;
  bindSearch();

  // Bind click to expand group details
  el.querySelectorAll('[data-group-idx]').forEach(function(card) {
    card.addEventListener('click', function() {
      var idx = parseInt(card.dataset.groupIdx, 10);
      var g = filterItems(_groups, ['name', 'description']);
      g.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
      if (g[idx]) openGroupDetail(g[idx]);
    });
  });
}

// ── Group detail panel ──────────────────────────────────────────────────────
function openGroupDetail(group) {
  var el = document.getElementById('resContent');
  el.innerHTML = '<div style="padding:8px;color:var(--text-dim)">Loading members…</div>';

  Promise.all([
    apiGet('/api/groups/' + group.id + '/members'),
    apiGet('/api/users')
  ]).then(function(results) {
    var members = results[0] || [];
    var allUsers = results[1] || [];
    var userMap = {};
    allUsers.forEach(function(u) { userMap[u.id] = u; });
    var memberIDs = {};
    members.forEach(function(m) { memberIDs[m.user_id] = true; });
    var nonMembers = allUsers.filter(function(u) { return !memberIDs[u.id]; });

    var createdAt = group.created_at ? new Date(group.created_at).toLocaleDateString() + ' ' + new Date(group.created_at).toLocaleTimeString() : 'Unknown';
    var creatorName = group.created_by_name || (group.created_by === 0 ? 'System (SSO/auto)' : 'Unknown');

    var html = '<div style="margin-bottom:12px">' +
      '<button class="res-tab" id="backToGroups" style="margin-bottom:12px">&larr; Back to groups</button>' +
      '<h3 style="margin:0 0 4px 0">' + escHtml(group.name) + '</h3>' +
      (group.description ? '<div style="color:var(--text-dim);margin-bottom:4px">' + escHtml(group.description) + '</div>' : '') +
      '<div style="font-size:12px;color:var(--text-dim)">' +
        'Created by: <strong>' + escHtml(creatorName) + '</strong>' +
        ' &middot; ' + createdAt +
        ' &middot; ' + members.length + ' member' + (members.length !== 1 ? 's' : '') +
      '</div>' +
    '</div>';

    // Members table
    html += '<div style="font-weight:600;margin-bottom:6px">Members</div>';
    if (members.length === 0) {
      html += '<div style="color:var(--text-dim);font-size:13px;margin-bottom:12px">No members yet.</div>';
    } else {
      html += '<table class="res-table" style="margin-bottom:12px"><thead><tr>' +
        '<th>Name</th><th>Username</th><th>Group Role</th>' +
        (canEditResources() ? '<th style="width:40px"></th>' : '') +
        '</tr></thead><tbody>';
      members.forEach(function(m) {
        var u = userMap[m.user_id];
        var name = u ? (u.display_name || u.username) : 'User #' + m.user_id;
        var uname = u ? u.username : '';
        html += '<tr>' +
          '<td>' + escHtml(name) + '</td>' +
          '<td style="color:var(--text-dim)">' + escHtml(uname) + '</td>' +
          '<td>' + escHtml(m.role || 'member') + '</td>' +
          (canEditResources() ? '<td><button class="res-delete-btn" data-rm-member="' + m.user_id + '" title="Remove member" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--danger);padding:2px 6px">✕</button></td>' : '') +
          '</tr>';
      });
      html += '</tbody></table>';
    }

    // Add member form (admin/teamlead only)
    if (canEditResources() && nonMembers.length > 0) {
      html += '<div style="border-top:1px solid var(--border);padding-top:10px">' +
        '<div style="font-weight:600;margin-bottom:6px">Add Member</div>' +
        '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
          '<select id="resAddMemberUser" style="flex:1;min-width:120px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text)">' +
            nonMembers.map(function(u) { return '<option value="' + u.id + '">' + escHtml(u.display_name || u.username) + '</option>'; }).join('') +
          '</select>' +
          '<select id="resAddMemberRole" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text)">' +
            '<option value="member">Member</option>' +
            '<option value="admin">Admin</option>' +
          '</select>' +
          '<button id="resAddMemberBtn" style="padding:4px 12px;border-radius:4px;background:var(--primary);color:#fff;border:none;cursor:pointer">Add</button>' +
        '</div>' +
      '</div>';
    }

    el.innerHTML = html;

    // Back button
    document.getElementById('backToGroups').addEventListener('click', function() {
      _activeTab = 'groups';
      renderContent();
    });

    // Remove member buttons
    el.querySelectorAll('[data-rm-member]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Remove this member from the group?')) return;
        apiDelete('/api/groups/' + group.id + '/members/' + btn.dataset.rmMember).then(function(res) {
          if (res.ok) { loadAll().then(function() { openGroupDetail(group); }); }
          else { alert('Failed to remove member'); }
        });
      });
    });

    // Add member button
    var addBtn = document.getElementById('resAddMemberBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var userId = parseInt(document.getElementById('resAddMemberUser').value, 10);
        var role = document.getElementById('resAddMemberRole').value;
        apiPost('/api/groups/' + group.id + '/members', { user_id: userId, role: role }).then(function(res) {
          if (res.ok) { loadAll().then(function() { openGroupDetail(group); }); }
          else { alert('Failed to add member'); }
        });
      });
    }
  });
}

function renderRoomsByType(el, roomType) {
  var filtered = (_rooms || []).filter(function(r) { return r.type === roomType; });
  filtered = filterItems(filtered, ['name', 'location', 'description']);
  var html = renderSearchBox();
  var editable = canEditResources();

  if (filtered.length === 0) {
    html += '<div class="res-empty">No resources of this type</div>';
  } else {
    html += '<table class="res-table"><thead><tr>' +
      '<th>Name</th><th>Location</th><th>Capacity</th><th>Status</th>' +
      (editable ? '<th style="width:40px"></th>' : '') +
      '</tr></thead><tbody>';
    filtered.forEach(function(r) {
      html += '<tr>' +
        '<td>' + (r.icon ? r.icon + ' ' : '') + escHtml(r.name) + '</td>' +
        '<td>' + escHtml(r.location || '-') + '</td>' +
        '<td>' + (r.capacity || '-') + '</td>' +
        '<td>' + (r.enabled ? '<span style="color:#22c55e">Active</span>' : '<span style="color:var(--text-dim)">Disabled</span>') + '</td>' +
        (editable ? '<td style="text-align:center"><button class="res-delete-btn" data-delete-room="' + r.id + '" title="Delete resource" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--danger);padding:2px 6px">🗑</button></td>' : '') +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  el.innerHTML = html;
  bindSearch();
  bindDeleteButtons();
}

function bindDeleteButtons() {
  var btns = document.querySelectorAll('[data-delete-room]');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.dataset.deleteRoom;
      if (!confirm('Delete this resource?')) return;
      apiDelete('/api/rooms/' + id).then(function(res) {
        if (res.ok) {
          loadAll();
        } else {
          alert('Failed to delete resource');
        }
      }).catch(function() { alert('Failed to delete resource'); });
    });
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
syncTheme();
setInterval(syncTheme, 2000);

document.getElementById('btnRefresh').addEventListener('click', loadAll);

loadAll();
connectSSE();

// Periodic data refresh (every 30 seconds)
setInterval(loadAll, 30000);

// Offline-mode banner: fixed red bar when connectivity is lost.
try { if (typeof initPopupOfflineBanner === 'function') initPopupOfflineBanner(); } catch(e) {}

})();
