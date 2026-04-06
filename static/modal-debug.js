/* ── Debug Console ────────────────────────────────────────────────────────── */
'use strict';

let _debugEntries = [];
let _debugSSEBound = false;
let _debugTriggers = [];
let _debugTraceUser = '';

function openDebugConsole() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'debugConsoleModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:900px;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>🐛 ${t('debug_title')||'Debug Console'}</h3>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" data-action="_debugDetach" title="${t('btn_detach')||'Detach to window'}">\u29C9</button>
          <button class="modal-close" data-action="_closeDebugConsole">&times;</button>
        </div>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px;font-family:monospace;font-size:12px">

        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
          <div style="flex:1;min-width:200px">
            <label style="font-size:10px;font-weight:600;display:block;margin-bottom:2px">🔍 Trace User</label>
            <div style="display:flex;gap:4px">
              <input id="debugTraceUser" class="input" style="flex:1;font-size:11px;font-family:monospace" placeholder="Username to trace..." value="${escHtml(_debugTraceUser)}">
              <button class="btn btn-sm btn-primary" data-action="_debugSetTrace">Set</button>
              <button class="btn btn-sm btn-secondary" data-action="_debugClearTrace">Clear</button>
            </div>
          </div>
          <div style="flex:1;min-width:200px">
            <label style="font-size:10px;font-weight:600;display:block;margin-bottom:2px">⚡ Triggers</label>
            <div style="display:flex;gap:4px">
              <input id="debugTriggerPattern" class="input" style="flex:1;font-size:11px;font-family:monospace" placeholder="Pattern (e.g. webhook, ingest, error)">
              <button class="btn btn-sm btn-primary" data-action="_debugAddTrigger">Add</button>
            </div>
            <div id="debugTriggerList" style="margin-top:4px;display:flex;gap:3px;flex-wrap:wrap">
              ${_debugTriggers.map((tr,i) => `<span style="font-size:10px;padding:1px 6px;background:var(--accent);color:#fff;border-radius:3px;cursor:pointer" data-action="_debugRemoveTrigger" data-arg="${i}">${escHtml(tr)} ×</span>`).join('')}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:4px;margin-bottom:8px">
          <button class="btn btn-sm btn-secondary" data-action="_debugClear">Clear Log</button>
          <button class="btn btn-sm btn-secondary" data-action="_debugLoadEventLog">Load Event Log</button>
          <span style="font-size:10px;color:var(--text-dim);margin-left:auto;padding-top:4px" id="debugSSEStatus">● Live</span>
        </div>

        <div id="debugLogArea" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:8px;max-height:500px;overflow-y:auto;font-size:11px;line-height:1.4">
          ${_debugEntries.length === 0 ? '<span style="color:var(--text-dim)">Waiting for events...</span>' : _debugEntries.map(e => _debugFormatEntry(e)).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  if (typeof _bindActions === 'function') _bindActions(modal);
  _debugBindSSE();
}

function _closeDebugConsole() {
  document.getElementById('debugConsoleModal')?.remove();
}

function _debugDetach() {
  _closeDebugConsole();
  const theme = window.state?.preferences?.theme || 'dark';
  const themeClass = theme === 'light' ? 'light-mode' : theme === 'city-camo' ? 'city-camo' : theme === 'urban-camo' ? 'urban-camo' : '';
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(el => el.outerHTML).join('\n');
  const w = window.open('', '_blank', 'width=900,height=600,menubar=no,toolbar=no');
  if (!w) { alert('Popup blocked'); return; }
  w.document.write(`<!DOCTYPE html><html data-theme="${theme}"><head><title>Debug Console</title>${styles}
    <style>body{padding:0;margin:0;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}
    #debugRoot{padding:12px}</style></head><body class="${themeClass}">
    <div id="notification-area" style="position:fixed;top:10px;right:10px;z-index:9999"></div>
    <div id="debugRoot"><h3 style="margin-bottom:8px">\u{1F41B} Debug Console (Detached)</h3>
    <div id="debugLogArea" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:8px;height:calc(100vh - 80px);overflow-y:auto;font-size:11px;font-family:monospace;line-height:1.4">
    ${_debugEntries.map(e => _debugFormatEntry(e)).join('')}
    </div></div></body></html>`);
  w.document.close();
  // Forward new entries to the detached window
  const origAdd = _debugAddEntry;
  const _patchedAdd = function(entry) {
    origAdd(entry);
    const area = w.document?.getElementById('debugLogArea');
    if (area && !w.closed) {
      area.insertAdjacentHTML('beforeend', _debugFormatEntry(entry));
      area.scrollTop = area.scrollHeight;
    }
  };
  // Monkey-patch temporarily
  window._debugAddEntryDetached = _patchedAdd;
}

function _debugFormatEntry(e) {
  const color = e.type === 'error' || e.type === 'failed' ? 'var(--red)' :
                e.type === 'warning' || e.type === 'blocked' ? 'var(--orange)' :
                e.type === 'success' ? 'var(--green)' :
                e.type === 'trace' ? 'var(--purple,#9b59b6)' : 'var(--text-dim)';
  return `<div style="border-bottom:1px solid var(--border);padding:3px 0">
    <span style="color:var(--text-dim)">${e.time||''}</span>
    <span style="color:${color};font-weight:600">[${escHtml(e.type||'info')}]</span>
    <span style="color:var(--accent)">${escHtml(e.source||'')}</span>
    ${e.user ? `<span style="color:var(--purple,#9b59b6)">@${escHtml(e.user)}</span>` : ''}
    <span>${escHtml(e.message||'')}</span>
  </div>`;
}

function _debugAddEntry(entry) {
  entry.time = new Date().toLocaleTimeString();
  _debugEntries.push(entry);
  if (_debugEntries.length > 500) _debugEntries = _debugEntries.slice(-500);

  // Check triggers
  for (const pattern of _debugTriggers) {
    const full = `${entry.source||''} ${entry.message||''} ${entry.type||''}`.toLowerCase();
    if (full.includes(pattern.toLowerCase())) {
      try { new Notification('Debug Trigger', { body: `[${entry.type}] ${entry.source}: ${entry.message}`, icon: '/static/favicon.ico' }); } catch {}
      if (typeof showNotification === 'function') showNotification('warning', `⚡ Debug trigger: ${pattern}`);
    }
  }

  // Check user trace
  if (_debugTraceUser && entry.user && entry.user.toLowerCase().includes(_debugTraceUser.toLowerCase())) {
    entry.type = 'trace';
  }

  // Update UI if open
  const area = document.getElementById('debugLogArea');
  if (area) {
    area.insertAdjacentHTML('beforeend', _debugFormatEntry(entry));
    area.scrollTop = area.scrollHeight;
  }
}

function _debugBindSSE() {
  if (_debugSSEBound) return;
  _debugSSEBound = true;

  // Listen for all SSE-dispatched events
  document.addEventListener('sse:log_change', (e) => {
    const d = e.detail || {};
    _debugAddEntry({ type: 'info', source: d.type || 'log', message: `Log change: ${d.type}` });
  });
  // Listen for user login/logoff (via user_change SSE events)
  const origES = window._sseConnection;
  if (origES) {
    origES.addEventListener('user_change', (e) => {
      try {
        const data = JSON.parse(e.data);
        const action = data.action || '';
        if (action === 'login' || action === 'logout' || action === 'login_failed' || action === 'blocked') {
          _debugAddEntry({
            type: action === 'login' ? 'success' : action === 'logout' ? 'info' : 'warning',
            source: 'auth',
            message: `${action}: ${data.username || data.display_name || 'user #'+data.user_id}`,
            user: data.username || data.display_name || ''
          });
        }
      } catch {}
    });
  }

  document.addEventListener('sse:key_terrain_change', () => {
    _debugAddEntry({ type: 'info', source: 'key_terrain', message: 'Key terrain board changed' });
  });

  // Hook into the main SSE connection for raw events
  const origES = window._sseConnection;
  if (origES) {
    ['event_change', 'log_change', 'key_terrain_change', 'board_change', 'decision_requested',
     'decision_assigned', 'decision_outcome', 'poll_new', 'poll_update', 'poll_closed',
     'user_change', 'editing_lock', 'resource_incident', 'personal_notification'].forEach(evt => {
      origES.addEventListener(evt, (e) => {
        let data = {};
        try { data = JSON.parse(e.data); } catch {}
        _debugAddEntry({
          type: 'info',
          source: `sse:${evt}`,
          message: JSON.stringify(data).slice(0, 200),
          user: data.user_name || data.username || ''
        });
      });
    });
  }
}

function _debugClear() {
  _debugEntries = [];
  const area = document.getElementById('debugLogArea');
  if (area) area.innerHTML = '<span style="color:var(--text-dim)">Log cleared.</span>';
}

async function _debugLoadEventLog() {
  try {
    const entries = await apiGet('/api/event-log');
    if (!entries) return;
    for (const e of entries.slice(-50)) {
      _debugAddEntry({
        type: e.summary || 'info',
        source: e.source || 'event_log',
        message: e.message || '',
        user: e.user_name || ''
      });
    }
  } catch {}
}

function _debugSetTrace() {
  _debugTraceUser = document.getElementById('debugTraceUser')?.value?.trim() || '';
  if (_debugTraceUser) {
    _debugAddEntry({ type: 'trace', source: 'debug', message: `Tracing user: ${_debugTraceUser}` });
  }
}

function _debugClearTrace() {
  _debugTraceUser = '';
  const el = document.getElementById('debugTraceUser');
  if (el) el.value = '';
  _debugAddEntry({ type: 'info', source: 'debug', message: 'User trace cleared' });
}

function _debugAddTrigger() {
  const pattern = document.getElementById('debugTriggerPattern')?.value?.trim();
  if (!pattern) return;
  _debugTriggers.push(pattern);
  const el = document.getElementById('debugTriggerPattern');
  if (el) el.value = '';
  _debugAddEntry({ type: 'info', source: 'debug', message: `Trigger added: "${pattern}"` });
  // Re-render trigger list
  const list = document.getElementById('debugTriggerList');
  if (list) {
    list.innerHTML = _debugTriggers.map((tr,i) => `<span style="font-size:10px;padding:1px 6px;background:var(--accent);color:#fff;border-radius:3px;cursor:pointer" data-action="_debugRemoveTrigger" data-arg="${i}">${escHtml(tr)} ×</span>`).join('');
    if (typeof _bindActions === 'function') _bindActions(list);
  }
}

function _debugRemoveTrigger(idx) {
  const removed = _debugTriggers.splice(Number(idx), 1);
  _debugAddEntry({ type: 'info', source: 'debug', message: `Trigger removed: "${removed[0]}"` });
  const list = document.getElementById('debugTriggerList');
  if (list) {
    list.innerHTML = _debugTriggers.map((tr,i) => `<span style="font-size:10px;padding:1px 6px;background:var(--accent);color:#fff;border-radius:3px;cursor:pointer" data-action="_debugRemoveTrigger" data-arg="${i}">${escHtml(tr)} ×</span>`).join('');
    if (typeof _bindActions === 'function') _bindActions(list);
  }
}
