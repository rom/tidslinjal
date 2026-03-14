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
    { key: 'data_center', label: 'Data Centers' }
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
      html += '<div class="res-card">' +
        avatar +
        '<div class="res-card-body">' +
          '<div class="res-card-name">' + escHtml(name) + '</div>' +
          '<div class="res-card-detail">' +
            '<span class="res-badge res-badge-role">' + escHtml(roleLabel) + '</span>' +
            (u.username ? ' &middot; ' + escHtml(u.username) : '') +
            (u.email ? ' &middot; ' + escHtml(u.email) : '') +
          '</div>' +
          '<div class="res-card-meta">' +
            '<span>Last login: ' + lastLogin + '</span>' +
            '<span>Logins: ' + (u.login_count || 0) + '</span>' +
            (failedLogin ? '<span style="color:var(--danger)">Failed: ' + failedLogin + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
  }

  el.innerHTML = html;
  bindSearch();
}

function renderGroups(el) {
  var groups = filterItems(_groups, ['name', 'description']);
  var html = renderSearchBox();

  if (groups.length === 0) {
    html += '<div class="res-empty">No groups found</div>';
  } else {
    groups.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
    groups.forEach(function(g) {
      var memberCount = (g.member_ids || g.members || []).length;
      html += '<div class="res-card">' +
        '<div class="res-card-name">' + escHtml(g.name) + '</div>' +
        '<div class="res-card-detail">' +
          memberCount + ' member' + (memberCount !== 1 ? 's' : '') +
          (g.description ? ' &middot; ' + escHtml(g.description) : '') +
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

  if (filtered.length === 0) {
    html += '<div class="res-empty">No resources of this type</div>';
  } else {
    html += '<table class="res-table"><thead><tr>' +
      '<th>Name</th><th>Location</th><th>Capacity</th><th>Status</th>' +
      '</tr></thead><tbody>';
    filtered.forEach(function(r) {
      html += '<tr>' +
        '<td>' + (r.icon ? r.icon + ' ' : '') + escHtml(r.name) + '</td>' +
        '<td>' + escHtml(r.location || '-') + '</td>' +
        '<td>' + (r.capacity || '-') + '</td>' +
        '<td>' + (r.enabled ? '<span style="color:#22c55e">Active</span>' : '<span style="color:var(--text-dim)">Disabled</span>') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  el.innerHTML = html;
  bindSearch();
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
