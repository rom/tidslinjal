/* ── Spreadsheet Tool ──────────────────────────────────────────────────────── */
'use strict';

// Prevent keyboard events inside the spreadsheet modal from leaking to global shortcuts
function _ssTrapKeys(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  const stop = (e) => e.stopPropagation();
  el.addEventListener('keydown', stop);
  el.addEventListener('keyup', stop);
  el.addEventListener('keypress', stop);
}

let _ssState = {
  list: [],
  currentId: null,
  instance: null,     // jspreadsheet instance
  searchOpen: false,
};

// ── Open Spreadsheet Board (called from sidebar/tools) ────────────────────

async function openSpreadsheetBoard() {
  const container = document.getElementById('boardContainer') || document.getElementById('sidebarContent');
  if (!container) return;

  // Load list
  try {
    const res = await fetch('/api/spreadsheets', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (res.ok) _ssState.list = await res.json() || [];
  } catch { _ssState.list = []; }

  _renderSpreadsheetSelector(container);
}

function _renderSpreadsheetSelector(container) {
  const canWrite = state.user && hasRole2(state.user.role, 'readwrite');
  const list = _ssState.list;

  let html = `<div style="max-width:98vw;margin:0 auto;padding:16px" id="ssBoard">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">📊 ${t('ss_title')||'Spreadsheets'}</h2>
      <div style="display:flex;gap:8px;align-items:center">
        ${canWrite ? `<button class="btn btn-primary btn-sm" id="ssCreateBtn">+ ${t('ss_create')||'New Spreadsheet'}</button>` : ''}
        <button class="btn btn-secondary btn-sm" id="ssDetachBtn" title="${t('btn_detach')||'Detach to window'}">⧉</button>
      </div>
    </div>
    <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:12px">${t('ss_desc')||'Create and manage spreadsheets with formulas, filters, and export.'}</p>`;

  if (list.length === 0) {
    html += `<div style="text-align:center;padding:40px;color:var(--text-dim)">${t('ss_empty')||'No spreadsheets yet. Create one to get started.'}</div>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">`;
    for (const ss of list) {
      const dateStr = ss.updated_at ? new Date(ss.updated_at).toLocaleString() : '';
      const visBadge = ss.visibility === 'public' ? '🌐' : ss.visibility === 'group' ? '👥' : '🔒';
      html += `<div style="padding:14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;transition:border-color .15s" class="ss-card" data-ssid="${ss.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <strong style="font-size:var(--fs-sm)">${escHtml(ss.name)}</strong>
            <span style="font-size:10px;margin-left:6px">${visBadge}</span>
          </div>
          ${canWrite && ss.owner_id === state.user.id ? `<button class="btn btn-sm" style="font-size:10px;color:var(--danger);padding:1px 5px" data-ss-delete="${ss.id}" title="${t('btn_delete')||'Delete'}">✖</button>` : ''}
        </div>
        ${ss.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${escHtml(ss.description)}</div>` : ''}
        <div style="font-size:10px;color:var(--text-dim);margin-top:6px">
          👤 ${escHtml(ss.owner_name)} · ${ss.col_count} ${t('ss_cols')||'cols'} × ${ss.row_count} ${t('ss_rows')||'rows'} · ${dateStr}
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  _boardModal('spreadsheetModal', html, '95vw');
  _ssTrapKeys('spreadsheetModal');
  // Bind card clicks
  document.querySelectorAll('.ss-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-ss-delete]')) return;
      _openSpreadsheet(parseInt(card.dataset.ssid));
    });
  });
  document.querySelectorAll('[data-ss-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(t('ss_delete_confirm')||'Delete this spreadsheet?')) return;
      await apiDel('/api/spreadsheets/' + btn.dataset.ssDelete);
      openSpreadsheetBoard();
    });
  });
  document.getElementById('ssCreateBtn')?.addEventListener('click', _createSpreadsheetDialog);
  document.getElementById('ssDetachBtn')?.addEventListener('click', _detachSpreadsheet);
}

// ── Create Dialog ────────────────────────────────────────────────────────────

function _createSpreadsheetDialog() {
  const name = prompt(t('ss_name_prompt')||'Spreadsheet name:');
  if (!name) return;
  const desc = prompt(t('ss_desc_prompt')||'Description (optional):') || '';
  apiPost('/api/spreadsheets', { name, description: desc, visibility: 'public', row_count: 50, col_count: 26 })
    .then(async res => {
      if (res.ok) {
        const ss = await res.json();
        _openSpreadsheet(ss.id);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to create');
      }
    });
}

// ── Open a Spreadsheet ───────────────────────────────────────────────────────

async function _openSpreadsheet(id) {
  let ss;
  try {
    const res = await fetch('/api/spreadsheets/' + id, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) { showError('Failed to load spreadsheet'); return; }
    ss = await res.json();
  } catch { showError('Failed to load spreadsheet'); return; }

  _ssState.currentId = id;

  // Build jspreadsheet data from sparse map
  const colCount = ss.col_count || 26;
  const rowCount = ss.row_count || 50;
  const data = [];
  for (let r = 0; r < rowCount; r++) {
    const row = [];
    for (let c = 0; c < colCount; c++) {
      const key = (ss.columns[c]?.key || _colLetter(c)) + (r + 1);
      row.push(ss.data[key] || '');
    }
    data.push(row);
  }

  const columns = ss.columns.map(c => ({
    title: c.title || c.key,
    width: c.width || 100,
  }));

  // Build UI
  let html = `<div style="max-width:98vw;margin:0 auto" id="ssEditorRoot">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-sm" id="ssBackBtn">← ${t('btn_back')||'Back'}</button>
        <h3 style="margin:0" id="ssNameLabel">${escHtml(ss.name)}</h3>
        <span style="font-size:var(--fs-xs);color:var(--text-dim)">${ss.col_count}×${ss.row_count}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input type="text" id="ssSearchInput" placeholder="${t('ss_search')||'Search...'}" style="width:140px;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
        <button class="btn btn-sm" id="ssAddRowBtn">+ ${t('ss_add_row')||'Row'}</button>
        <button class="btn btn-sm" id="ssAddColBtn">+ ${t('ss_add_col')||'Col'}</button>
        <select id="ssExportFmt" style="padding:4px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="xml">XML</option>
        </select>
        <button class="btn btn-sm" id="ssExportBtn">⬇ ${t('btn_export')||'Export'}</button>
        <button class="btn btn-sm" id="ssImportBtn">⬆ ${t('btn_import')||'Import'}</button>
        <button class="btn btn-sm" id="ssPrintBtn">🖨 ${t('btn_print')||'Print'}</button>
        <button class="btn btn-sm" id="ssSaveBtn" style="font-weight:700">💾 ${t('btn_save')||'Save'}</button>
        <button class="btn btn-sm" id="ssDetachSheetBtn" title="${t('btn_detach')||'Detach to window'}">⧉</button>
      </div>
    </div>
    <div id="ssGrid" style="overflow:auto;max-height:70vh;border:1px solid var(--border);border-radius:var(--radius)"></div>
    <input type="file" id="ssImportFile" style="display:none" accept=".csv,.json,.xml,.xlsx,.ods">
  </div>`;

  _boardModal('spreadsheetModal', html, '98vw');
  // Trap keyboard events so global shortcuts don't steal keystrokes from cells
  _ssTrapKeys('spreadsheetModal');

  // Initialize jspreadsheet
  const gridEl = document.getElementById('ssGrid');
  if (typeof jspreadsheet === 'undefined') {
    gridEl.innerHTML = '<p style="padding:20px;color:var(--danger)">Jspreadsheet library not loaded.</p>';
    return;
  }

  // v5 API uses worksheets array; returns object with .worksheets[]
  const ssObj = jspreadsheet(gridEl, {
    worksheets: [{
      data: data,
      columns: columns,
      minDimensions: [colCount, rowCount],
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: '65vh',
      allowInsertRow: true,
      allowInsertColumn: true,
      allowDeleteRow: true,
      allowDeleteColumn: true,
      allowRenameColumn: true,
      columnSorting: true,
      search: true,
      wordWrap: true,
      parseFormulas: true,
    }]
  });
  _ssState.instance = ssObj;

  // Get the first worksheet for method calls
  const ws = ssObj.worksheets ? ssObj.worksheets[0] : (Array.isArray(ssObj) ? ssObj[0] : ssObj);

  _ssState.worksheet = ws;
  console.log('[spreadsheet] instance type:', typeof ssObj, 'worksheets:', ssObj.worksheets, 'ws:', ws, 'ws methods:', ws ? Object.getOwnPropertyNames(Object.getPrototypeOf(ws)).slice(0,20) : 'null');

  // Bind toolbar buttons
  document.getElementById('ssBackBtn')?.addEventListener('click', () => openSpreadsheetBoard());
  document.getElementById('ssSaveBtn')?.addEventListener('click', () => _saveSpreadsheet(ss));
  document.getElementById('ssAddRowBtn')?.addEventListener('click', () => {
    if (ws && typeof ws.insertRow === 'function') ws.insertRow();
    else console.warn('[spreadsheet] insertRow not available on', ws);
  });
  document.getElementById('ssAddColBtn')?.addEventListener('click', () => {
    if (ws && typeof ws.insertColumn === 'function') ws.insertColumn();
    else console.warn('[spreadsheet] insertColumn not available on', ws);
  });
  document.getElementById('ssExportBtn')?.addEventListener('click', () => {
    const fmt = document.getElementById('ssExportFmt')?.value || 'csv';
    window.open('/api/spreadsheets/' + id + '/export?format=' + fmt, '_blank');
  });
  document.getElementById('ssImportBtn')?.addEventListener('click', () => {
    document.getElementById('ssImportFile')?.click();
  });
  document.getElementById('ssImportFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const fmt = file.name.endsWith('.json') ? 'json' : 'csv';
      const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      const hdrs = { 'Content-Type': fmt === 'json' ? 'application/json' : 'text/csv', 'X-Requested-With': 'XMLHttpRequest' };
      if (csrf) hdrs['X-CSRF-Token'] = csrf[1];
      const res = await fetch('/api/spreadsheets/' + id + '/import?format=' + fmt, { method: 'POST', headers: hdrs, body: reader.result });
      if (res.ok) {
        showNotification('success', t('ss_imported')||'Imported');
        _openSpreadsheet(id); // Reload
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Import failed');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('ssPrintBtn')?.addEventListener('click', () => {
    if (!_ssState.instance) return;
    const printW = window.open('', '_blank');
    const tableHtml = gridEl.querySelector('table')?.outerHTML || '';
    printW.document.write(`<!DOCTYPE html><html><head><title>${escHtml(ss.name)}</title>
      <style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;font-size:12px;font-family:system-ui}th{background:#f0f0f0;font-weight:600}</style>
      </head><body><h2>${escHtml(ss.name)}</h2>${tableHtml}</body></html>`);
    printW.document.close();
    printW.print();
  });

  // Search
  document.getElementById('ssSearchInput')?.addEventListener('input', (e) => {
    if (_ssState.worksheet && _ssState.worksheet.search) {
      _ssState.worksheet.search(e.target.value);
    }
  });

  // Detach this spreadsheet to its own window
  document.getElementById('ssDetachSheetBtn')?.addEventListener('click', () => _detachSingleSpreadsheet(id, ss.name));
}

// ── Save current spreadsheet state back to server ────────────────────────────

async function _saveSpreadsheet(ss) {
  const ws = _ssState.worksheet;
  if (!ws) return;
  const data = ws.getData();
  const headers = ws.getHeaders ? ws.getHeaders(true) : [];

  // Build sparse data map
  const cellData = {};
  const numCols = headers.length || (data[0] ? data[0].length : 0);
  const colKeys = [];
  for (let c = 0; c < numCols; c++) {
    colKeys.push(ss.columns[c]?.key || _colLetter(c));
  }
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const val = data[r][c];
      if (val !== '' && val !== null && val !== undefined) {
        cellData[colKeys[c] + (r + 1)] = String(val);
      }
    }
  }

  // Build columns with custom titles
  const columns = [];
  for (let c = 0; c < numCols; c++) {
    const key = ss.columns[c]?.key || _colLetter(c);
    const hdr = headers[c] || key;
    const title = hdr !== key ? hdr : '';
    const width = ws.getWidth ? (parseInt(ws.getWidth(c)) || 100) : 100;
    columns.push({ key, title, width });
  }

  const updated = {
    ...ss,
    data: cellData,
    columns: columns,
    row_count: data.length,
    col_count: headers.length,
  };

  const res = await apiPut('/api/spreadsheets/' + ss.id, updated);
  if (res.ok) {
    showNotification('success', t('ss_saved')||'Spreadsheet saved');
  } else {
    showError(t('ss_save_error')||'Failed to save');
  }
}

// ── Detach to window ─────────────────────────────────────────────────────────

function _ssDetachWindow(title, onReady) {
  const w = window.open('', '', 'width=1200,height=800,resizable=yes,scrollbars=yes');
  if (!w) return;
  const theme = window.state?.preferences?.theme || 'dark';
  const themeClasses = {light:'light-mode','city-camo':'city-camo','urban-camo':'urban-camo',
    sand:'theme-sand',matrix:'theme-matrix',sunset:'theme-sunset','light-blue-sky':'theme-light-blue-sky',
    ocean:'theme-ocean',forest:'theme-forest',accessible:'theme-accessible',crimson:'theme-crimson'};
  const cls = themeClasses[theme] || '';
  w.document.write(`<!DOCTYPE html><html><head><title>Tidslinjal — ${escHtml(title)}</title>
    <link rel="stylesheet" href="/static/style.css">
    <link rel="stylesheet" href="/static/vendor/jsuites.min.css">
    <link rel="stylesheet" href="/static/vendor/jspreadsheet.min.css">
    <style>body{padding:0;margin:0;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}#ssRoot{padding:16px}</style>
    </head><body class="${cls}"><div id="ssRoot"></div></body></html>`);
  w.document.close();
  // Copy required globals
  w.state = window.state;
  w.TRANSLATIONS = window.TRANSLATIONS;
  w.t = window.t;
  w.escHtml = window.escHtml;
  w.hasRole2 = window.hasRole2;
  w.jspreadsheet = window.jspreadsheet;
  w.jSuites = window.jSuites;
  w.apiGet = window.apiGet;
  w.apiPost = window.apiPost;
  w.apiPut = window.apiPut;
  w.apiDel = window.apiDel;
  w.showNotification = function(type, msg) { try { window.showNotification(type, msg); } catch {} };
  w.showError = function(msg) { try { window.showError(msg); } catch {} };
  onReady(w);
}

// Detach the spreadsheet selector
function _detachSpreadsheet() {
  _ssDetachWindow('Spreadsheets', (w) => {
    w._boardModal = function(id, content) { w.document.getElementById('ssRoot').innerHTML = content; };
    // Re-export the functions into the child window and call
    w.openSpreadsheetBoard = openSpreadsheetBoard;
    w._openSpreadsheet = _openSpreadsheet;
    w._createSpreadsheetDialog = _createSpreadsheetDialog;
    w._saveSpreadsheet = _saveSpreadsheet;
    w._ssTrapKeys = _ssTrapKeys;
    w._ssState = _ssState;
    w._colLetter = _colLetter;
    w._detachSingleSpreadsheet = _detachSingleSpreadsheet;
    setTimeout(() => openSpreadsheetBoard(), 100);
  });
}

// Detach a single spreadsheet into its own window
function _detachSingleSpreadsheet(id, name) {
  _ssDetachWindow(name || 'Spreadsheet', (w) => {
    w._boardModal = function(modalId, content) { w.document.getElementById('ssRoot').innerHTML = content; };
    w._openSpreadsheet = _openSpreadsheet;
    w._saveSpreadsheet = _saveSpreadsheet;
    w._ssTrapKeys = _ssTrapKeys;
    w._ssState = _ssState;
    w._colLetter = _colLetter;
    w.openSpreadsheetBoard = openSpreadsheetBoard;
    w._detachSingleSpreadsheet = _detachSingleSpreadsheet;
    setTimeout(() => _openSpreadsheet(id), 100);
  });
}

// ── Helper ───────────────────────────────────────────────────────────────────

function _colLetter(i) {
  let result = '';
  while (true) {
    result = String.fromCharCode(65 + i % 26) + result;
    i = Math.floor(i / 26) - 1;
    if (i < 0) break;
  }
  return result;
}
