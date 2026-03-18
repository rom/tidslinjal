/* ── Detach Windows ── */
// ── Resources Window (detached) ──────────────────────────────────────────────
let _resourcesPopout = null;

function openDetachedResources() {
  if (_resourcesPopout && !_resourcesPopout.closed) {
    _resourcesPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 600);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _resourcesPopout = window.open('/static/resources-popup.html', 'tidslinjal-resources',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
}

// ── References Window (detached) ────────────────────────────────────────────
let _referencesPopout = null;
function openDetachedReferences() {
  if (_referencesPopout && !_referencesPopout.closed) {
    _referencesPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 700);
  const h = Math.min(window.screen.availHeight - 100, 800);
  _referencesPopout = window.open('/static/references-popup.html', 'tidslinjal-references',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
}

// ── Map Window (detached) ────────────────────────────────────────────────────
let _mapPopout = null;

function openDetachedMap() {
  if (_mapPopout && !_mapPopout.closed) {
    _mapPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 1024);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _mapPopout = window.open('/static/map-popup.html', 'tidslinjal-map',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
}

// ── Detachable Tools Window ──────────────────────────────────────────────────
let _toolsPopout = null;
let _toolsPopoutMonitor = null;

function openDetachedTools() {
  if (_toolsPopout && !_toolsPopout.closed) {
    _toolsPopout.focus();
    return;
  }
  // Render tools content via the sidebar renderer
  const tempDiv = document.createElement('div');
  const prevTab = state.sidebarTab;
  state.sidebarTab = 'tools';
  renderSidebar();
  const srcContent = document.getElementById('sidebarContent');
  const toolsHTML = srcContent ? srcContent.innerHTML : '';
  state.sidebarTab = prevTab;
  renderSidebar();

  const theme = document.body.className || '';
  const w = Math.min(window.screen.availWidth, 420);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _toolsPopout = window.open('', 'tidslinjal-tools',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_toolsPopout) return;

  _toolsPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Tools</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<div id="toolsWrap"></div>' +
    '</body></html>');
  _toolsPopout.document.close();

  const wrapEl = _toolsPopout.document.getElementById('toolsWrap');
  if (wrapEl) wrapEl.innerHTML = toolsHTML;

  // Bind data-action buttons to opener functions
  function rebindActions() {
    if (!_toolsPopout || _toolsPopout.closed) return;
    const wrap = _toolsPopout.document.getElementById('toolsWrap');
    if (!wrap) return;
    wrap.querySelectorAll('[data-action]').forEach(function(el) {
      el.onclick = function() {
        try {
          window.focus();
          var fn = el.dataset.action;
          if (typeof window[fn] === 'function') window[fn]();
        } catch(e) {}
      };
    });
  }
  rebindActions();

  if (_toolsPopoutMonitor) clearInterval(_toolsPopoutMonitor);
  _toolsPopoutMonitor = setInterval(() => {
    if (!_toolsPopout || _toolsPopout.closed) {
      clearInterval(_toolsPopoutMonitor);
      _toolsPopoutMonitor = null;
      _toolsPopout = null;
    }
  }, 1000);
}

// ── Detachable Log Book Window ────────────────────────────────────────────────
let _logBookPopout = null;
let _logBookPopoutMonitor = null;

function openDetachedLogBook() {
  if (_logBookPopout && !_logBookPopout.closed) {
    _logBookPopout.focus();
    return;
  }

  // Build logbook categories
  const cats = [
    {v:'incoming',l:t('lb_incoming')||'Incoming matter'},
    {v:'outgoing',l:t('lb_outgoing')||'Outgoing matter'},
    {v:'incident',l:t('lb_incident')||'Special incident'},
    {v:'directive',l:t('lb_directive')||'Directive'},
    {v:'decision',l:t('lb_decision')||'Decision'},
    {v:'action',l:t('lb_action')||'Action taken'},
    {v:'briefing',l:t('lb_briefing')||'Briefing content'},
    {v:'situation',l:t('lb_situation')||'Situation change'},
    {v:'logistics',l:t('lb_logistics')||'Logistics'},
    {v:'meeting',l:t('lb_meeting')||'Meeting protocol'},
    {v:'other',l:t('lb_other')||'Other'}
  ].filter(c => !(c.v === 'decision' && state.preferences && state.preferences.logbook_hide_decisions));

  const theme = document.body.className || '';
  const w = Math.min(window.screen.availWidth, 700);
  const h = Math.min(window.screen.availHeight - 100, 800);
  _logBookPopout = window.open('', 'tidslinjal-logbook',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_logBookPopout) return;

  _logBookPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Log Book</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    'h3{margin:0 0 12px;font-size:16px;color:var(--accent)}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<h3>📖 ' + escHtml(t('tab_log_book')||'Log Book') + '</h3>' +
    '<div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:8px">' +
    '<select id="lbCategory" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">' +
    cats.map(c => '<option value="' + c.v + '">' + escHtml(c.l) + '</option>').join('') +
    '</select>' +
    '<input type="text" id="lbSubject" placeholder="' + escHtml(t('lb_subject')||'Subject') + '" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">' +
    '<textarea id="lbBody" rows="3" placeholder="' + escHtml(t('lb_body')||'Details (optional)') + '" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);resize:vertical;margin-bottom:4px"></textarea>' +
    '<div style="display:flex;gap:6px;align-items:center">' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">📎 <input type="file" id="lbAttachFile" style="max-width:200px;font-size:10px" multiple></label>' +
    '<span style="flex:1"></span>' +
    '<button class="btn btn-primary btn-sm" id="lbAddBtn">' + escHtml(t('btn_add')||'Add') + '</button>' +
    '</div></div>' +
    '<div id="logBookEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">' + escHtml(t('lb_loading')||'Loading…') + '</em></div>' +
    '</body></html>');
  _logBookPopout.document.close();

  // Bind add button
  const addBtn = _logBookPopout.document.getElementById('lbAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const doc = _logBookPopout.document;
      const category = doc.getElementById('lbCategory')?.value || 'other';
      const subject = doc.getElementById('lbSubject')?.value?.trim();
      if (!subject) { alert(t('lb_subject_required')||'Subject is required'); return; }
      const body = doc.getElementById('lbBody')?.value?.trim() || '';
      const res = await apiPost('/api/log-book', {category, subject, body});
      if (res.ok) {
        const created = await res.json().catch(() => null);
        const fileInput = doc.getElementById('lbAttachFile');
        if (created && created.id && fileInput && fileInput.files.length > 0) {
          for (const file of fileInput.files) {
            const fd = new FormData();
            fd.append('file', file);
            await api('POST', '/api/log-book/' + created.id + '/attachment', fd);
          }
        }
        doc.getElementById('lbSubject').value = '';
        doc.getElementById('lbBody').value = '';
        if (fileInput) fileInput.value = '';
        _refreshLogBookPopout();
        showNotification('success', t('lb_added')||'Log book entry added');
      }
    });
  }

  _refreshLogBookPopout();

  // Close any modal that launched this
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if (m.querySelector('[data-action="openDetachedLogBook"]')) m.remove();
  });

  if (_logBookPopoutMonitor) clearInterval(_logBookPopoutMonitor);
  _logBookPopoutMonitor = setInterval(() => {
    if (!_logBookPopout || _logBookPopout.closed) {
      clearInterval(_logBookPopoutMonitor);
      _logBookPopoutMonitor = null;
      _logBookPopout = null;
    }
  }, 1000);
}

async function _refreshLogBookPopout() {
  if (!_logBookPopout || _logBookPopout.closed) return;
  try {
    const entries = await apiGet('/api/log-book') || [];
    const el = _logBookPopout.document.getElementById('logBookEntries');
    if (!el) return;
    const isAdmin = state.user && (state.user.role === 'admin' || hasRole2(state.user.role, 'oplead'));
    if (entries.length === 0) {
      el.innerHTML = '<em style="color:var(--text-dim)">' + escHtml(t('lb_empty')||'No log book entries yet.') + '</em>';
      return;
    }
    el.innerHTML = entries.slice().reverse().map(e => {
      const ts = e.created_at ? new Date(e.created_at).toLocaleString() : '';
      const attachments = (e.attachments||[]).map(a =>
        '<a href="/api/log-book/' + e.id + '/attachment/' + encodeURIComponent(a.stored_name) + '" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none">📎 ' + escHtml(a.filename) + '</a>'
      ).join(' ');
      return '<div style="border-bottom:1px solid var(--border);padding:6px 0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-weight:600;color:var(--text)">[' + escHtml(e.category||'') + '] ' + escHtml(e.subject||'') + '</span>' +
        '<span style="color:var(--text-dim);font-size:10px">' + escHtml(ts) + '</span></div>' +
        (e.body ? '<div style="color:var(--text-dim);margin-top:2px;white-space:pre-line">' + escHtml(e.body) + '</div>' : '') +
        (attachments ? '<div style="margin-top:2px">' + attachments + '</div>' : '') +
        '<div style="font-size:10px;color:var(--text-dim);margin-top:2px">' + escHtml(e.created_by_name||'') + '</div>' +
        '</div>';
    }).join('');
  } catch(e) { /* ignore */ }
}

