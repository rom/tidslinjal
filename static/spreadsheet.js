/* ── Spreadsheet Tool ──────────────────────────────────────────────────────── */
'use strict';

// Mark the spreadsheet modal so global shortcuts skip it
function _ssTrapKeys(modalId) {
  const doc = _ssDoc();
  const el = doc.getElementById(modalId);
  if (el) el.setAttribute('data-ss-active', 'true');
}

// Check if an element is inside an active spreadsheet
function _isInSpreadsheet(el) {
  return el && el.closest && el.closest('[data-ss-active]');
}

// Return the active document (detached window or main)
function _ssDoc() {
  return _ssState.activeDoc || document;
}

let _ssState = {
  list: [],
  currentId: null,
  instance: null,     // jspreadsheet root object
  worksheet: null,    // first worksheet ref
  activeDoc: null,    // document context (null = main, or detached window.document)
};

// ── Open Spreadsheet Board (called from sidebar/tools) ────────────────────

async function openSpreadsheetBoard() {
  // Load list
  try {
    const res = await fetch('/api/spreadsheets', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (res.ok) _ssState.list = await res.json() || [];
  } catch { _ssState.list = []; }

  _renderSpreadsheetSelector();
}

function _renderSpreadsheetSelector() {
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

  const doc = _ssDoc();
  // Bind card clicks
  doc.querySelectorAll('.ss-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-ss-delete]')) return;
      _openSpreadsheet(parseInt(card.dataset.ssid));
    });
  });
  doc.querySelectorAll('[data-ss-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(t('ss_delete_confirm')||'Delete this spreadsheet?')) return;
      await apiDel('/api/spreadsheets/' + btn.dataset.ssDelete);
      openSpreadsheetBoard();
    });
  });
  doc.getElementById('ssCreateBtn')?.addEventListener('click', _createSpreadsheetDialog);
  doc.getElementById('ssDetachBtn')?.addEventListener('click', _detachSpreadsheet);
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
  const cellData = ss.data || {};
  const data = [];
  for (let r = 0; r < rowCount; r++) {
    const row = [];
    for (let c = 0; c < colCount; c++) {
      const colKey = (ss.columns && ss.columns[c]) ? ss.columns[c].key : _colLetter(c);
      const ref = colKey + (r + 1);
      row.push(cellData[ref] || '');
    }
    data.push(row);
  }

  const columns = (ss.columns || []).map(c => ({
    title: c.title || c.key,
    width: c.width || 100,
  }));
  // Pad columns if fewer than colCount
  while (columns.length < colCount) {
    columns.push({ title: _colLetter(columns.length), width: 100 });
  }

  // Build UI — two rows: top row has back/name + search/filter/export/import/save/detach/help
  //                       second row has +Row, +Col
  let html = `<div style="max-width:98vw;margin:0 auto" id="ssEditorRoot">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-sm" id="ssBackBtn">\u2190 ${t('btn_back')||'Back'}</button>
        <h3 style="margin:0" id="ssNameLabel">${escHtml(ss.name)}</h3>
        <span style="font-size:var(--fs-xs);color:var(--text-dim)" id="ssDimLabel">${colCount}\u00d7${rowCount}</span>
      </div>
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
        <input type="text" id="ssSearchInput" placeholder="${t('ss_search')||'Search...'}" style="width:120px;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
        <select id="ssExportFmt" style="padding:3px 4px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="csv">CSV</option><option value="xlsx">XLSX</option><option value="ods">ODS</option>
          <option value="json">JSON</option><option value="xml">XML</option><option value="rtf">RTF</option><option value="pdf">PDF</option>
        </select>
        <button class="btn btn-sm" id="ssExportBtn">\u2B07 ${t('btn_export')||'Export'}</button>
        <button class="btn btn-sm" id="ssImportBtn">\u2B06 ${t('btn_import')||'Import'}</button>
        <button class="btn btn-sm" id="ssPrintBtn">\uD83D\uDDA8 ${t('btn_print')||'Print'}</button>
        <button class="btn btn-sm" id="ssSaveBtn" style="font-weight:700">\uD83D\uDCBE ${t('btn_save')||'Save'}</button>
        <button class="btn btn-sm" id="ssDetachSheetBtn" title="${t('btn_detach')||'Detach to window'}">\u29C9</button>
        <button class="btn btn-sm" id="ssHelpBtn" title="${t('btn_help')||'Help'}">\u2753</button>
      </div>
    </div>
    <div style="display:flex;gap:5px;align-items:center;margin-bottom:8px">
      <button class="btn btn-sm" id="ssAddRowBtn">+ ${t('ss_add_row')||'Row'}</button>
      <button class="btn btn-sm" id="ssAddColBtn">+ ${t('ss_add_col')||'Col'}</button>
      <button class="btn btn-sm" id="ssFilterBtn">\uD83D\uDD0D ${t('ss_filter')||'Filter'}</button>
      <button class="btn btn-sm" id="ssClearFilterBtn" style="display:none">\u2716 ${t('ss_clear_filter')||'Clear Filter'}</button>
    </div>
    <div id="ssGrid" style="overflow:auto;max-height:70vh;border:1px solid var(--border);border-radius:var(--radius)"></div>
    <input type="file" id="ssImportFile" style="display:none" accept=".csv,.json,.xml,.xlsx,.ods">
  </div>`;

  _boardModal('spreadsheetModal', html, '98vw');
  _ssTrapKeys('spreadsheetModal');

  const doc = _ssDoc();
  const gridEl = doc.getElementById('ssGrid');
  if (!gridEl) { console.error('[spreadsheet] ssGrid not found in document'); return; }

  // Initialize jspreadsheet
  if (typeof jspreadsheet === 'undefined') {
    gridEl.innerHTML = '<p style="padding:20px;color:var(--danger)">Jspreadsheet library not loaded.</p>';
    return;
  }

  // v5 API: jspreadsheet() is async — returns array, populates worksheets via promise.
  // We use onload callback to know when the worksheet is ready.
  let ssArr;
  try {
    ssArr = jspreadsheet(gridEl, {
      onload: function(spreadsheetInstance) {
        // Called when worksheets are ready
        const ws = Array.isArray(ssArr) && ssArr[0] ? ssArr[0] : spreadsheetInstance;
        _ssState.worksheet = ws;
        _ssState.instance = ssArr;
        console.log('[spreadsheet] onload — worksheet ready:', ws);
      },
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
        filters: true,
      }]
    });
  } catch (e) {
    console.error('[spreadsheet] jspreadsheet init error:', e);
    gridEl.innerHTML = '<p style="padding:20px;color:var(--danger)">Failed to initialize spreadsheet: ' + escHtml(e.message) + '</p>';
    return;
  }
  _ssState.instance = ssArr;
  // Resolve worksheet synchronously as fallback (v5 may populate array synchronously)
  if (Array.isArray(ssArr) && ssArr[0]) {
    _ssState.worksheet = ssArr[0];
  }

  // Helper to get current worksheet
  function _ws() { return _ssState.worksheet; }

  // Bind toolbar buttons
  doc.getElementById('ssBackBtn')?.addEventListener('click', () => openSpreadsheetBoard());
  doc.getElementById('ssSaveBtn')?.addEventListener('click', () => _saveSpreadsheet(ss));
  doc.getElementById('ssAddRowBtn')?.addEventListener('click', () => {
    const w = _ws();
    if (w && typeof w.insertRow === 'function') { w.insertRow(); _updateDimLabel(); }
    else console.warn('[spreadsheet] insertRow not available. ws:', w);
  });
  doc.getElementById('ssAddColBtn')?.addEventListener('click', () => {
    const w = _ws();
    if (w && typeof w.insertColumn === 'function') { w.insertColumn(); _updateDimLabel(); }
    else console.warn('[spreadsheet] insertColumn not available. ws:', w);
  });
  doc.getElementById('ssExportBtn')?.addEventListener('click', () => {
    const fmt = doc.getElementById('ssExportFmt')?.value || 'csv';
    window.open('/api/spreadsheets/' + id + '/export?format=' + fmt, '_blank');
  });
  doc.getElementById('ssImportBtn')?.addEventListener('click', () => {
    doc.getElementById('ssImportFile')?.click();
  });
  doc.getElementById('ssImportFile')?.addEventListener('change', (e) => {
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
        _openSpreadsheet(id);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Import failed');
      }
    };
    reader.readAsText(file);
  });
  doc.getElementById('ssPrintBtn')?.addEventListener('click', () => {
    const tableHtml = gridEl.querySelector('table')?.outerHTML || '';
    if (!tableHtml) { showError('No table content to print'); return; }
    const printW = window.open('', '_blank');
    if (!printW) return;
    printW.document.write('<!DOCTYPE html><html><head><title>' + escHtml(ss.name) + '</title>' +
      '<style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;font-size:12px;font-family:system-ui}th{background:#f0f0f0;font-weight:600}</style>' +
      '</head><body><h2>' + escHtml(ss.name) + '</h2>' + tableHtml + '</body></html>');
    printW.document.close();
    printW.print();
  });

  // Search
  doc.getElementById('ssSearchInput')?.addEventListener('input', (e) => {
    const w = _ws();
    if (w && typeof w.search === 'function') w.search(e.target.value);
  });

  // Filter — prompt for column and value
  let _ssFilterActive = false;
  doc.getElementById('ssFilterBtn')?.addEventListener('click', () => {
    const col = prompt(t('ss_filter_col_prompt')||'Filter column (e.g. A, B, C):');
    if (!col) return;
    const val = prompt(t('ss_filter_val_prompt')||'Filter value (show rows containing):');
    if (val === null) return;
    _applyColumnFilter(col.toUpperCase(), val);
    _ssFilterActive = true;
    const clearBtn = doc.getElementById('ssClearFilterBtn');
    if (clearBtn) clearBtn.style.display = '';
  });
  doc.getElementById('ssClearFilterBtn')?.addEventListener('click', () => {
    _clearColumnFilter();
    _ssFilterActive = false;
    const clearBtn = doc.getElementById('ssClearFilterBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  });

  function _applyColumnFilter(colLetter, filterVal) {
    const w = _ws();
    if (!w) return;
    // Find column index from letter
    let colIdx = -1;
    for (let c = 0; c < (ss.columns || []).length; c++) {
      if ((ss.columns[c]?.key || _colLetter(c)) === colLetter) { colIdx = c; break; }
    }
    if (colIdx < 0) { showError('Column ' + colLetter + ' not found'); return; }
    // Hide rows that don't match
    const rows = gridEl.querySelectorAll('tbody tr');
    const lowerVal = filterVal.toLowerCase();
    rows.forEach((tr, ri) => {
      const cells = tr.querySelectorAll('td');
      const cell = cells[colIdx + 1]; // +1 for row header
      const text = cell ? (cell.textContent || '').toLowerCase() : '';
      tr.style.display = (filterVal === '' || text.includes(lowerVal)) ? '' : 'none';
    });
  }

  function _clearColumnFilter() {
    const rows = gridEl.querySelectorAll('tbody tr');
    rows.forEach(tr => { tr.style.display = ''; });
  }

  function _updateDimLabel() {
    const w = _ws();
    if (!w) return;
    try {
      const d = w.getData();
      const h = w.getHeaders ? w.getHeaders(true) : [];
      const label = doc.getElementById('ssDimLabel');
      if (label) label.textContent = (h.length || colCount) + '\u00d7' + (d.length || rowCount);
    } catch {}
  }

  // Detach this spreadsheet to its own window
  doc.getElementById('ssDetachSheetBtn')?.addEventListener('click', () => _detachSingleSpreadsheet(id, ss.name));

  // Help modal
  doc.getElementById('ssHelpBtn')?.addEventListener('click', _ssShowHelp);
}

// ── Save current spreadsheet state back to server ────────────────────────────

async function _saveSpreadsheet(ss) {
  const ws = _ssState.worksheet;
  if (!ws) { showError('No worksheet to save'); return; }

  // Get data safely
  let data;
  try { data = typeof ws.getData === 'function' ? ws.getData() : []; }
  catch { data = []; }
  if (!Array.isArray(data)) data = [];

  // Get headers safely
  let headers;
  try { headers = typeof ws.getHeaders === 'function' ? ws.getHeaders(true) : []; }
  catch { headers = []; }
  if (!Array.isArray(headers)) headers = [];

  // Determine column count from data or headers or original
  const numCols = Math.max(
    headers.length,
    data.length > 0 && data[0] ? data[0].length : 0,
    ss.col_count || 0
  );

  // Build sparse data map
  const cellData = {};
  const colKeys = [];
  for (let c = 0; c < numCols; c++) {
    colKeys.push((ss.columns && ss.columns[c]) ? ss.columns[c].key : _colLetter(c));
  }
  for (let r = 0; r < data.length; r++) {
    if (!Array.isArray(data[r])) continue;
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
    const key = colKeys[c];
    const hdr = (headers[c] || key);
    const title = hdr !== key ? hdr : (ss.columns && ss.columns[c] ? ss.columns[c].title : '');
    let width = 100;
    try {
      if (ws && typeof ws.getWidth === 'function') {
        const w = ws.getWidth(c);
        if (w) width = parseInt(w) || 100;
      }
    } catch {}
    columns.push({ key, title: title || '', width });
  }

  const updated = {
    ...ss,
    data: cellData,
    columns: columns,
    row_count: Math.max(data.length, ss.row_count || 0),
    col_count: numCols,
  };

  const res = await apiPut('/api/spreadsheets/' + ss.id, updated);
  if (res.ok) {
    showNotification('success', t('ss_saved')||'Spreadsheet saved');
  } else {
    showError(t('ss_save_error')||'Failed to save');
  }
}

// ── Help ─────────────────────────────────────────────────────────────────────

function _ssShowHelp() {
  const helpHtml = `<div style="max-width:600px;padding:4px">
    <h3>\u2753 ${t('ss_help_title')||'Spreadsheet Help'}</h3>

    <h4>${t('ss_help_basics')||'Basics'}</h4>
    <ul style="font-size:var(--fs-xs);line-height:1.8;margin-bottom:12px">
      <li><b>${t('ss_help_edit')||'Edit a cell'}</b>: ${t('ss_help_edit_desc')||'Click a cell and start typing, or double-click to edit'}</li>
      <li><b>${t('ss_help_navigate')||'Navigate'}</b>: ${t('ss_help_navigate_desc')||'Arrow keys, Tab, Enter to move between cells'}</li>
      <li><b>${t('ss_help_rename_col')||'Rename column'}</b>: ${t('ss_help_rename_col_desc')||'Right-click a column header and select Rename'}</li>
      <li><b>${t('ss_help_sort')||'Sort'}</b>: ${t('ss_help_sort_desc')||'Right-click a column header to sort ascending/descending'}</li>
      <li><b>${t('ss_help_resize')||'Resize column'}</b>: ${t('ss_help_resize_desc')||'Drag the edge of a column header'}</li>
      <li><b>+ Row / + Col</b>: ${t('ss_help_addrowcol_desc')||'Add rows or columns to expand the spreadsheet'}</li>
    </ul>

    <h4>${t('ss_help_formulas')||'Formulas'}</h4>
    <p style="font-size:var(--fs-xs);margin-bottom:6px">${t('ss_help_formula_intro')||'Start a cell with <b>=</b> to enter a formula. Cell references use column letter + row number (e.g. A1, B3). Ranges use colon notation (e.g. A1:A10).'}</p>
    <table style="font-size:var(--fs-xs);width:100%;border-collapse:collapse;margin-bottom:12px">
      <tr style="background:var(--bg3)"><th style="padding:4px 8px;text-align:left">Formula</th><th style="padding:4px 8px;text-align:left">${t('ss_help_example')||'Example'}</th><th style="padding:4px 8px;text-align:left">${t('ss_help_description')||'Description'}</th></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=A1+B1</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Addition</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Add two cells</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=A1-B1</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Subtraction</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Subtract</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=A1*B1</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Multiplication</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Multiply</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=A1/B1</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Division</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Divide</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=SUM(A1:A10)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Sum range</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Sum of cells in range</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=AVERAGE(A1:A10)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Average</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Average of range</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=MIN(A1:A10)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Minimum</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Smallest value</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=MAX(A1:A10)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Maximum</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Largest value</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=COUNT(A1:A10)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Count numbers</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Count numeric cells</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=COUNTA(A1:A10)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Count non-empty</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Count non-empty cells</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=IF(A1>10,"High","Low")</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Conditional</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">If/then/else</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=TODAY()</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Today</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Current date</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=NOW()</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Now</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Current date+time</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=CONCAT(A1,B1)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Concatenate</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Join text</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=LEFT(A1,3)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Left</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">First N characters</td></tr>
      <tr><td style="padding:3px 8px;border-bottom:1px solid var(--border)"><code>=RIGHT(A1,3)</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Right</td><td style="padding:3px 8px;border-bottom:1px solid var(--border)">Last N characters</td></tr>
      <tr><td style="padding:3px 8px"><code>=LEN(A1)</code></td><td style="padding:3px 8px">Length</td><td style="padding:3px 8px">Text length</td></tr>
    </table>

    <h4>${t('ss_help_export_title')||'Export & Import'}</h4>
    <p style="font-size:var(--fs-xs);margin-bottom:6px">${t('ss_help_export_desc')||'Export supports CSV, XLSX, ODS, JSON, XML, RTF, and PDF. Import supports CSV and JSON. Use the dropdown to select format before clicking Export.'}</p>

    <h4>${t('ss_help_filter_title')||'Filtering'}</h4>
    <p style="font-size:var(--fs-xs);margin-bottom:6px">${t('ss_help_filter_desc')||'Click the Filter button and enter a column letter and a filter value. Only rows containing the value in that column will be shown. Click Clear Filter to reset.'}</p>

    <h4>${t('ss_help_tips_title')||'Tips'}</h4>
    <ul style="font-size:var(--fs-xs);line-height:1.8">
      <li>${t('ss_help_tip_formula_case')||'Formula names are case-insensitive: =sum() and =SUM() both work'}</li>
      <li>${t('ss_help_tip_save')||'Remember to Save before leaving — changes are not auto-saved'}</li>
      <li>${t('ss_help_tip_detach')||'Use the \u29C9 button to open the spreadsheet in its own window'}</li>
      <li>${t('ss_help_tip_context')||'Right-click cells or headers for additional options (insert, delete, rename)'}</li>
    </ul>
  </div>`;

  const doc = _ssDoc();
  const overlay = doc.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = '<div class="modal" style="max-width:660px;padding:20px;max-height:85vh;overflow-y:auto">' +
    '<button class="modal-close" style="position:absolute;top:6px;right:6px;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-size:16px;cursor:pointer;border-radius:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;z-index:10">&times;</button>' +
    helpHtml + '</div>';
  doc.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
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

  // Copy required globals to child window
  w.state = window.state;
  w.TRANSLATIONS = window.TRANSLATIONS;
  w.t = window.t;
  w.escHtml = window.escHtml;
  w.hasRole2 = window.hasRole2;
  w.apiGet = window.apiGet;
  w.apiPost = window.apiPost;
  w.apiPut = window.apiPut;
  w.apiDel = window.apiDel;
  w.showNotification = function(type, msg) { try { window.showNotification(type, msg); } catch {} };
  w.showError = function(msg) { try { window.showError(msg); } catch {} };

  // Set active document context so all getElementById calls go to the child window
  _ssState.activeDoc = w.document;

  // Override _boardModal to render into the child window
  _boardModal = function(id, content) {
    const root = w.document.getElementById('ssRoot');
    if (root) root.innerHTML = content;
  };

  // jspreadsheet needs to be called with the child window's element, so load it in child
  const jsuitesScript = w.document.createElement('script');
  jsuitesScript.src = '/static/vendor/jsuites.min.js';
  jsuitesScript.onload = () => {
    const jssScript = w.document.createElement('script');
    jssScript.src = '/static/vendor/jspreadsheet.min.js';
    jssScript.onload = () => {
      // Use the child window's jspreadsheet so it creates elements in the right document
      jspreadsheet = w.jspreadsheet;
      onReady(w);
    };
    w.document.head.appendChild(jssScript);
  };
  w.document.head.appendChild(jsuitesScript);

  // Restore parent context when child closes
  w.addEventListener('beforeunload', () => {
    _ssState.activeDoc = null;
    _boardModal = window._origBoardModal || _boardModal;
    jspreadsheet = window._origJspreadsheet || jspreadsheet;
  });
}

// Store original references
if (typeof _boardModal === 'function') window._origBoardModal = _boardModal;
window._origJspreadsheet = typeof jspreadsheet !== 'undefined' ? jspreadsheet : null;

// Detach the spreadsheet selector
function _detachSpreadsheet() {
  _ssDetachWindow('Spreadsheets', (w) => {
    openSpreadsheetBoard();
  });
}

// Detach a single spreadsheet into its own window
function _detachSingleSpreadsheet(id, name) {
  _ssDetachWindow(name || 'Spreadsheet', (w) => {
    _openSpreadsheet(id);
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
