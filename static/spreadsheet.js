/* ── Spreadsheet Tool ──────────────────────────────────────────────────────── */
'use strict';

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
      </div>
    </div>
    <div id="ssGrid" style="overflow:auto;max-height:70vh;border:1px solid var(--border);border-radius:var(--radius)"></div>
    <input type="file" id="ssImportFile" style="display:none" accept=".csv,.json,.xml,.xlsx,.ods">
  </div>`;

  _boardModal('spreadsheetModal', html, '98vw');

  // Initialize jspreadsheet
  const gridEl = document.getElementById('ssGrid');
  if (typeof jspreadsheet === 'undefined') {
    gridEl.innerHTML = '<p style="padding:20px;color:var(--danger)">Jspreadsheet library not loaded.</p>';
    return;
  }
  _ssState.instance = jspreadsheet(gridEl, {
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
    // Enable formula parser
    parseFormulas: true,
  });

  // Bind toolbar buttons
  document.getElementById('ssBackBtn')?.addEventListener('click', () => openSpreadsheetBoard());
  document.getElementById('ssSaveBtn')?.addEventListener('click', () => _saveSpreadsheet(ss));
  document.getElementById('ssAddRowBtn')?.addEventListener('click', () => {
    if (_ssState.instance) _ssState.instance.insertRow();
  });
  document.getElementById('ssAddColBtn')?.addEventListener('click', () => {
    if (_ssState.instance) _ssState.instance.insertColumn();
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
    if (_ssState.instance && _ssState.instance.search) {
      _ssState.instance.search(e.target.value);
    }
  });
}

// ── Save current spreadsheet state back to server ────────────────────────────

async function _saveSpreadsheet(ss) {
  if (!_ssState.instance) return;
  const inst = _ssState.instance;
  const data = inst.getData();
  const headers = inst.getHeaders(true); // array of header strings

  // Build sparse data map
  const cellData = {};
  const colKeys = [];
  for (let c = 0; c < headers.length; c++) {
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
  for (let c = 0; c < headers.length; c++) {
    const key = ss.columns[c]?.key || _colLetter(c);
    const title = headers[c] !== key ? headers[c] : '';
    const width = inst.getWidth ? (parseInt(inst.getWidth(c)) || 100) : 100;
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

function _detachSpreadsheet() {
  const w = window.open('', 'tidslinjal_spreadsheet', 'width=1200,height=800,resizable=yes,scrollbars=yes');
  if (!w) return;
  const theme = window.state?.preferences?.theme || 'dark';
  const themeClass = theme === 'light' ? 'light-mode' : theme === 'city-camo' ? 'city-camo' : theme === 'urban-camo' ? 'urban-camo' : '';
  w.document.write(`<!DOCTYPE html><html><head><title>Tidslinjal — Spreadsheets</title>
    <link rel="stylesheet" href="/static/style.css">
    <link rel="stylesheet" href="/static/vendor/jsuites.min.css">
    <link rel="stylesheet" href="/static/vendor/jspreadsheet.min.css">
    <style>body{padding:0;margin:0;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}#ssRoot{padding:16px}</style>
    </head><body class="${themeClass}"><div id="ssRoot">Loading...</div>
    <script src="/static/vendor/jsuites.min.js"><\/script>
    <script src="/static/vendor/jspreadsheet.min.js"><\/script>
    <script src="/static/i18n.js"><\/script>
    <script src="/static/lang/en.js"><\/script>
    <script src="/static/utils.js"><\/script>
    <script src="/static/state.js"><\/script>
    <script src="/static/api.js"><\/script>
    <script src="/static/modals.js"><\/script>
    <script src="/static/spreadsheet.js"><\/script>
    <script>
      setTimeout(function() {
        if (window.opener && window.opener.state) window.state = window.opener.state;
        if (window.opener && window.opener.TRANSLATIONS) window.TRANSLATIONS = window.opener.TRANSLATIONS;
        var root = document.getElementById('ssRoot');
        if (typeof openSpreadsheetBoard === 'function') {
          window._boardModal = function(id, content, width) {
            root.innerHTML = content;
          };
          openSpreadsheetBoard();
        }
      }, 500);
    <\/script></body></html>`);
  w.document.close();
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
