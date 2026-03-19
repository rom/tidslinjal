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
  return fetch(url, { method: 'DELETE', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
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
    es.onerror = function() { setTimeout(connectSSE, 5000); };
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
    groups.forEach(function(g) {
      var memberCount = typeof g.member_count === 'number' ? g.member_count : (g.member_ids || g.members || []).length;
      var createdAt = g.created_at ? new Date(g.created_at).toLocaleDateString() : '';
      html += '<div class="res-card">' +
        '<div class="res-card-body">' +
          '<div class="res-card-name">' + escHtml(g.name) + '</div>' +
          '<div class="res-card-detail">' +
            '<span class="res-badge">' + memberCount + ' member' + (memberCount !== 1 ? 's' : '') + '</span>' +
            (createdAt ? ' &middot; Created: ' + createdAt : '') +
            (g.description ? ' &middot; ' + escHtml(g.description) : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
  }

  el.innerHTML = html;
  bindSearch();
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

})();
