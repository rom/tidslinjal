/* ── Debug Console — Comprehensive Trace System ──────────────────────────── */
'use strict';

let _debugEntries = [];
let _debugSSEBound = false;
let _debugTriggers = [];
let _debugTraces = {
  user: '',         // username to trace
  webhook: false,   // trace incoming webhooks/ingest API
  eventbus: false,  // trace outbound event bus
  syslog: false,    // trace syslog forwarding
};
let _debugDetachedWindow = null;

function openDebugConsole() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'debugConsoleModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:960px;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>\u{1F41B} ${t('debug_title')||'Debug Console'}</h3>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" data-action="_debugDetach" title="${t('btn_detach')||'Detach to window'}">\u29C9</button>
          <button class="modal-close" data-action="_closeDebugConsole">&times;</button>
        </div>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px;font-family:monospace;font-size:12px">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div style="padding:8px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:600;font-size:10px;margin-bottom:4px">\u{1F50D} ${t('debug_trace_user')||'Trace User'}</div>
            <div style="display:flex;gap:4px">
              <input id="debugTraceUser" class="input" style="flex:1;font-size:11px;font-family:monospace" placeholder="${t('debug_trace_placeholder')||'Username...'}" value="${escHtml(_debugTraces.user)}">
              <button class="btn btn-sm btn-primary" data-action="_debugSetTrace">${t('btn_set')||'Set'}</button>
              <button class="btn btn-sm btn-secondary" data-action="_debugClearTrace">\u2715</button>
            </div>
          </div>
          <div style="padding:8px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:600;font-size:10px;margin-bottom:4px">\u26A1 ${t('debug_triggers')||'Triggers'}</div>
            <div style="display:flex;gap:4px">
              <input id="debugTriggerPattern" class="input" style="flex:1;font-size:11px;font-family:monospace" placeholder="${t('debug_trigger_ph')||'Pattern...'}">
              <button class="btn btn-sm btn-primary" data-action="_debugAddTrigger">${t('btn_add')||'Add'}</button>
            </div>
            <div id="debugTriggerList" style="margin-top:4px;display:flex;gap:3px;flex-wrap:wrap">
              ${_debugTriggers.map((tr,i) => `<span style="font-size:10px;padding:1px 6px;background:var(--accent);color:#fff;border-radius:3px;cursor:pointer" data-action="_debugRemoveTrigger" data-arg="${i}">${escHtml(tr)} \u00D7</span>`).join('')}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;font-weight:600;color:var(--text-dim)">${t('debug_trace_channels')||'Trace Channels'}:</span>
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer">
            <input type="checkbox" id="debugTraceWebhook" ${_debugTraces.webhook?'checked':''} style="accent-color:var(--accent)"> ${t('debug_trace_webhook')||'Webhook / Ingest'}
          </label>
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer">
            <input type="checkbox" id="debugTraceEventbus" ${_debugTraces.eventbus?'checked':''} style="accent-color:var(--accent)"> ${t('debug_trace_eventbus')||'Event Bus (outbound)'}
          </label>
          <label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer">
            <input type="checkbox" id="debugTraceSyslog" ${_debugTraces.syslog?'checked':''} style="accent-color:var(--accent)"> ${t('debug_trace_syslog')||'Syslog'}
          </label>
          <span style="margin-left:auto;display:flex;gap:4px">
            <button class="btn btn-sm btn-secondary" data-action="_debugSaveTrace" title="${t('debug_save_trace')||'Save trace to file'}">\u{1F4BE} ${t('btn_save')||'Save'}</button>
            <button class="btn btn-sm btn-secondary" data-action="_debugClear">${t('debug_clear_log')||'Clear'}</button>
            <button class="btn btn-sm btn-secondary" data-action="_debugLoadEventLog">${t('debug_load_event_log')||'Load Log'}</button>
            <span style="font-size:10px;color:var(--text-dim);padding-top:4px" id="debugSSEStatus">\u25CF ${t('debug_live')||'Live'}</span>
          </span>
        </div>

        <div id="debugLogArea" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:8px;max-height:450px;overflow-y:auto;font-size:11px;line-height:1.4">
          ${_debugEntries.length === 0 ? `<span style="color:var(--text-dim)">${t('debug_waiting')||'Waiting for events...'}</span>` : _debugEntries.map(e => _debugFormatEntry(e)).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  if (typeof _bindActions === 'function') _bindActions(modal);
  // Bind trace channel checkboxes
  ['Webhook','Eventbus','Syslog'].forEach(ch => {
    const cb = document.getElementById('debugTrace'+ch);
    if (cb) cb.addEventListener('change', () => { _debugTraces[ch.toLowerCase()] = cb.checked; });
  });
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
  const w = window.open('', '_blank', 'width=960,height=600,menubar=no,toolbar=no');
  if (!w) { alert(t('dialog_popup_blocked')||'Popup blocked'); return; }
  _debugDetachedWindow = w;
  w.document.write(`<!DOCTYPE html><html data-theme="${theme}"><head><title>Debug Console</title>${styles}
    <style>body{padding:0;margin:0;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}
    #debugRoot{padding:12px;font-family:monospace;font-size:12px}</style></head><body class="${themeClass}">
    <div id="notification-area" style="position:fixed;top:10px;right:10px;z-index:9999"></div>
    <div id="debugRoot">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">\u{1F41B} Debug Console</h3>
        <span style="font-size:10px;color:var(--text-dim)">\u25CF Live</span>
      </div>
      <div id="debugLogArea" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:8px;height:calc(100vh - 70px);overflow-y:auto;font-size:11px;line-height:1.4">
        ${_debugEntries.map(e => _debugFormatEntry(e)).join('')}
      </div>
    </div></body></html>`);
  w.document.close();
  // Auto-cleanup on close
  const checkClosed = setInterval(() => { if (w.closed) { clearInterval(checkClosed); _debugDetachedWindow = null; } }, 2000);
}

function _debugFormatEntry(e) {
  const color = e.type === 'error' || e.type === 'failed' ? 'var(--red)' :
                e.type === 'warning' || e.type === 'blocked' ? 'var(--orange)' :
                e.type === 'success' ? 'var(--green)' :
                e.type === 'trace' ? 'var(--purple,#9b59b6)' :
                e.type === 'webhook' ? 'var(--teal,#1abc9c)' :
                e.type === 'eventbus' ? '#e67e22' :
                e.type === 'syslog' ? '#3498db' : 'var(--text-dim)';
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

  // Check user trace — highlight if matches
  if (_debugTraces.user && entry.user && entry.user.toLowerCase().includes(_debugTraces.user.toLowerCase())) {
    entry.type = 'trace';
  }

  // Filter by trace channels
  const src = (entry.source || '').toLowerCase();
  if (src.includes('ingest') || src.includes('webhook')) {
    if (!_debugTraces.webhook && entry.type !== 'trace') {
      // Only show if webhook trace is on, or if it matches user trace
      if (!_debugTraces.user || !entry.user) return;
    }
    entry.type = entry.type || 'webhook';
  }
  if (src.includes('eventbus') || src.includes('event_bus')) {
    entry.type = entry.type || 'eventbus';
  }
  if (src.includes('syslog')) {
    entry.type = entry.type || 'syslog';
  }

  _debugEntries.push(entry);
  if (_debugEntries.length > 1000) _debugEntries = _debugEntries.slice(-1000);

  // Check triggers
  for (const pattern of _debugTriggers) {
    const full = `${entry.source||''} ${entry.message||''} ${entry.type||''} ${entry.user||''}`.toLowerCase();
    if (full.includes(pattern.toLowerCase())) {
      try { new Notification(t('debug_trigger_notification')||'Debug Trigger', { body: `[${entry.type}] ${entry.source}: ${entry.message}`, icon: '/static/favicon.ico' }); } catch {}
      if (typeof showNotification === 'function') showNotification('warning', `\u26A1 ${pattern}`);
    }
  }

  // Update UI in modal
  const area = document.getElementById('debugLogArea');
  if (area) {
    if (area.querySelector('span[style*="text-dim"]') && _debugEntries.length === 1) area.innerHTML = '';
    area.insertAdjacentHTML('beforeend', _debugFormatEntry(entry));
    area.scrollTop = area.scrollHeight;
  }

  // Forward to detached window
  if (_debugDetachedWindow && !_debugDetachedWindow.closed) {
    const dArea = _debugDetachedWindow.document?.getElementById('debugLogArea');
    if (dArea) {
      dArea.insertAdjacentHTML('beforeend', _debugFormatEntry(entry));
      dArea.scrollTop = dArea.scrollHeight;
    }
  }
}

function _debugBindSSE() {
  if (_debugSSEBound) return;
  _debugSSEBound = true;

  const es = window._sseConnection;
  if (!es) return;

  // Listen to ALL SSE event types for comprehensive tracing
  const allEvents = [
    'event_change', 'log_change', 'key_terrain_change', 'board_change',
    'decision_requested', 'decision_assigned', 'decision_outcome',
    'poll_new', 'poll_update', 'poll_closed',
    'user_change', 'editing_lock', 'resource_incident', 'personal_notification',
    'day_labels_change', 'prc_new_check'
  ];

  allEvents.forEach(evt => {
    es.addEventListener(evt, (e) => {
      let data = {};
      try { data = JSON.parse(e.data); } catch {}

      // Determine entry type
      let type = 'info';
      let source = `sse:${evt}`;
      let user = data.user_name || data.username || '';

      // Auth events
      if (evt === 'user_change') {
        const action = data.action || '';
        if (action === 'login' || action === 'logout' || action === 'login_failed' || action === 'blocked') {
          type = action === 'login' ? 'success' : action === 'logout' ? 'info' : 'warning';
          source = 'auth';
          user = data.username || data.display_name || '';
        }
      }

      _debugAddEntry({
        type,
        source,
        message: JSON.stringify(data).slice(0, 300),
        user
      });
    });
  });

  // Also listen for custom dispatched events
  document.addEventListener('sse:log_change', (e) => {
    const d = e.detail || {};
    if (d.type === 'event_log' && _debugTraces.webhook) {
      // Webhook/ingest events appear in event_log
      _debugAddEntry({ type: 'webhook', source: 'ingest', message: `Event log updated (${d.type})` });
    }
  });
}

function _debugClear() {
  _debugEntries = [];
  const area = document.getElementById('debugLogArea');
  if (area) area.innerHTML = `<span style="color:var(--text-dim)">${t('debug_log_cleared')||'Log cleared.'}</span>`;
}

async function _debugLoadEventLog() {
  try {
    const entries = await apiGet('/api/event-log');
    if (!entries) return;
    for (const e of entries.slice(-100)) {
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
  _debugTraces.user = document.getElementById('debugTraceUser')?.value?.trim() || '';
  if (_debugTraces.user) {
    _debugAddEntry({ type: 'trace', source: 'debug', message: `Tracing user: ${_debugTraces.user}` });
  }
}

function _debugClearTrace() {
  _debugTraces.user = '';
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
  _debugRenderTriggerList();
}

function _debugRemoveTrigger(idx) {
  const removed = _debugTriggers.splice(Number(idx), 1);
  _debugAddEntry({ type: 'info', source: 'debug', message: `Trigger removed: "${removed[0]}"` });
  _debugRenderTriggerList();
}

function _debugRenderTriggerList() {
  const list = document.getElementById('debugTriggerList');
  if (!list) return;
  list.innerHTML = _debugTriggers.map((tr,i) => `<span style="font-size:10px;padding:1px 6px;background:var(--accent);color:#fff;border-radius:3px;cursor:pointer" data-action="_debugRemoveTrigger" data-arg="${i}">${escHtml(tr)} \u00D7</span>`).join('');
  if (typeof _bindActions === 'function') _bindActions(list);
}

function _debugSaveTrace() {
  const traceUser = _debugTraces.user;
  let entries = _debugEntries;
  if (traceUser) {
    entries = entries.filter(e => e.user && e.user.toLowerCase().includes(traceUser.toLowerCase()));
  }
  const lines = entries.map(e => `${e.time}\t[${e.type}]\t${e.source}\t${e.user||'-'}\t${e.message}`).join('\n');
  const filename = traceUser ? `trace_${traceUser}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt` : `debug_trace_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  _debugAddEntry({ type: 'info', source: 'debug', message: `Trace saved: ${filename} (${entries.length} entries)` });
}
