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
      const visBadge = ss.visibility === 'public'
        ? `<span style="background:#27ae60;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px">\uD83C\uDF10 ${t('ss_access_public_short')||'Public'}</span>`
        : ss.visibility === 'group'
        ? `<span style="background:#3498db;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px">\uD83D\uDC65 ${t('ss_access_group_short')||'Group'}</span>`
        : `<span style="background:#e74c3c;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px">\uD83D\uDD12 ${t('ss_access_private_short')||'Private'}</span>`;
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
  _ssShowSettingsDialog(null, async (data) => {
    const res = await apiPost('/api/spreadsheets', { ...data, row_count: 50, col_count: 26 });
    if (res.ok) {
      const ss = await res.json();
      _openSpreadsheet(ss.id);
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to create');
    }
  });
}

function _ssEditSettingsDialog(ss) {
  _ssShowSettingsDialog(ss, async (data) => {
    const res = await apiPut('/api/spreadsheets/' + ss.id, { ...ss, ...data });
    if (res.ok) {
      showNotification('success', t('ss_settings_saved')||'Settings saved');
      _openSpreadsheet(ss.id);
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to update');
    }
  });
}

function _ssShowSettingsDialog(existing, onSave) {
  const isEdit = !!existing;
  const doc = _ssDoc();
  const groups = state.groups || [];
  const overlay = doc.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="max-width:440px;padding:20px">
    <h3>${isEdit ? (t('ss_edit_settings')||'Spreadsheet Settings') : (t('ss_create')||'New Spreadsheet')}</h3>
    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('ss_name_label')||'Name'}</label>
      <input id="ssDlgName" class="input" style="width:100%;font-size:var(--fs-sm)" value="${escHtml(existing?.name||'')}" placeholder="${t('ss_name_ph')||'Spreadsheet name'}">
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('description')||'Description'}</label>
      <textarea id="ssDlgDesc" class="input" style="width:100%;font-size:var(--fs-xs);resize:vertical" rows="2" placeholder="${t('ss_desc_ph')||'Optional description'}">${escHtml(existing?.description||'')}</textarea>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('ss_access')||'Access'}</label>
      <select id="ssDlgVis" class="input" style="width:100%;font-size:var(--fs-xs)">
        <option value="private" ${existing?.visibility==='private'?'selected':''}>${t('ss_access_private')||'Private (only me)'}</option>
        <option value="group" ${existing?.visibility==='group'?'selected':''}>${t('ss_access_group')||'Group members'}</option>
        <option value="public" ${!existing||existing?.visibility==='public'?'selected':''}>${t('ss_access_public')||'Public (everyone)'}</option>
      </select>
    </div>
    <div id="ssDlgGroupDiv" style="margin-bottom:12px;display:${existing?.visibility==='group'?'':'none'}">
      <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">${t('ss_access_groups')||'Groups'}</label>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${groups.map(g => `<label style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius);font-size:var(--fs-xs);cursor:pointer"><input type="checkbox" class="ssDlgGroup" value="${g.id}" ${(existing?.group_ids||[]).includes(g.id)?'checked':''} style="accent-color:var(--accent)">${escHtml(g.name)}</label>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" id="ssDlgSaveBtn">${isEdit ? (t('btn_save')||'Save') : (t('ss_create')||'Create')}</button>
      <button class="btn btn-secondary btn-sm" id="ssDlgCancelBtn">${t('btn_cancel')||'Cancel'}</button>
    </div>
  </div>`;
  doc.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#ssDlgCancelBtn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#ssDlgVis').addEventListener('change', (e) => {
    overlay.querySelector('#ssDlgGroupDiv').style.display = e.target.value === 'group' ? '' : 'none';
  });
  overlay.querySelector('#ssDlgSaveBtn').addEventListener('click', () => {
    const name = overlay.querySelector('#ssDlgName').value.trim();
    if (!name) { showError(t('ss_name_required')||'Name is required'); return; }
    const groupIds = [...overlay.querySelectorAll('.ssDlgGroup:checked')].map(cb => parseInt(cb.value));
    const data = {
      name,
      description: overlay.querySelector('#ssDlgDesc').value.trim(),
      visibility: overlay.querySelector('#ssDlgVis').value,
      group_ids: groupIds,
    };
    overlay.remove();
    onSave(data);
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

  // Build UI — single toolbar row with all controls
  let html = `<div style="max-width:98vw;margin:0 auto" id="ssEditorRoot">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-sm" id="ssBackBtn">\u2190 ${t('btn_back')||'Back'}</button>
        <h3 style="margin:0" id="ssNameLabel">${escHtml(ss.name)}</h3>
        <span style="font-size:var(--fs-xs);color:var(--text-dim)" id="ssDimLabel">${colCount}\u00d7${rowCount}</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
        <input type="text" id="ssSearchInput" placeholder="${t('ss_search')||'Search...'}" style="width:110px;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
        <button class="btn btn-sm" id="ssAddRowBtn" title="${t('ss_add_row_tip')||'Add a new row'}">+ ${t('ss_add_row')||'Row'}</button>
        <button class="btn btn-sm" id="ssAddColBtn" title="${t('ss_add_col_tip')||'Add a new column'}">+ ${t('ss_add_col')||'Col'}</button>
        <button class="btn btn-sm" id="ssFilterBtn">\uD83D\uDD0D ${t('ss_filter_btn')||'Filter'}</button>
        <button class="btn btn-sm" id="ssClearFilterBtn" style="display:none">\u2716 ${t('ss_clear_filter')||'Clear'}</button>
        <select id="ssFuncMenu" title="${t('ss_func_menu_tip')||'Apply formula to selected cells'}" style="padding:2px 4px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="">\u0192x ${t('ss_func_menu')||'Function...'}</option>
          <optgroup label="${t('ss_func_math')||'Math'}">
            <option value="SUM">SUM</option><option value="AVERAGE">AVERAGE</option>
            <option value="MIN">MIN</option><option value="MAX">MAX</option>
            <option value="COUNT">COUNT</option><option value="COUNTA">COUNTA</option>
            <option value="MEDIAN">MEDIAN</option><option value="PRODUCT">PRODUCT</option>
            <option value="STDEV">STDEV</option><option value="VAR">VAR</option>
          </optgroup>
          <optgroup label="${t('ss_func_cond')||'Conditional'}">
            <option value="SUMIF">SUMIF</option><option value="COUNTIF">COUNTIF</option>
            <option value="AVERAGEIF">AVERAGEIF</option>
          </optgroup>
          <optgroup label="${t('ss_func_text')||'Text'}">
            <option value="CONCAT">CONCAT</option><option value="LEN">LEN</option>
            <option value="UPPER">UPPER</option><option value="LOWER">LOWER</option>
          </optgroup>
        </select>
        <span style="color:var(--border)">|</span>
        <select id="ssExportFmt" style="padding:2px 4px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="csv">CSV</option><option value="xlsx">XLSX</option><option value="ods">ODS</option>
          <option value="json">JSON</option><option value="xml">XML</option><option value="rtf">RTF</option><option value="pdf">PDF</option>
          <option value="txt">Text</option><option value="md">Markdown</option>
        </select>
        <button class="btn btn-sm" id="ssExportBtn">\u2B07 ${t('btn_export')||'Export'}</button>
        <button class="btn btn-sm" id="ssImportBtn">\u2B06 ${t('btn_import')||'Import'}</button>
        <button class="btn btn-sm" id="ssPrintBtn">\uD83D\uDDA8 ${t('btn_print')||'Print'}</button>
        <button class="btn btn-sm" id="ssSaveBtn" style="font-weight:700">\uD83D\uDCBE ${t('btn_save')||'Save'}</button>
        <button class="btn btn-sm" id="ssDetachSheetBtn" title="${t('btn_detach')||'Detach to window'}">\u29C9</button>
        <button class="btn btn-sm" id="ssSettingsBtn" title="${t('ss_settings')||'Settings'}">\u2699</button>
        <button class="btn btn-sm" id="ssHelpBtn" title="${t('btn_help')||'Help'}">\u2753</button>
      </div>
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
  // Function menu — save selection before the dropdown steals focus
  let _savedSelection = null;
  const funcMenu = doc.getElementById('ssFuncMenu');
  if (funcMenu) {
    funcMenu.addEventListener('mousedown', () => {
      const w = _ws();
      if (w && w.selectedCell && w.selectedCell.length) {
        _savedSelection = [...w.selectedCell];
      }
    });
    funcMenu.addEventListener('change', (e) => {
    const funcName = e.target.value;
    e.target.value = ''; // reset dropdown
    if (!funcName) return;
    const w = _ws();
    if (!w) { showError('No active worksheet'); return; }
    // Use saved selection (captured before dropdown stole focus)
    const sel = _savedSelection || w.selectedCell;
    if (!sel || !sel.length) { showError(t('ss_func_no_selection')||'Select cells first, then choose a function'); return; }
    // sel is [startCol, startRow, endCol, endRow]
    const c1 = sel[0], r1 = sel[1], c2 = sel[2], r2 = sel[3];
    // Build the cell range string (e.g. "A1:A5")
    const startRef = _colLetter(c1) + (r1 + 1);
    const endRef = _colLetter(c2) + (r2 + 1);
    const rangeStr = (startRef === endRef) ? startRef : startRef + ':' + endRef;
    const formula = '=' + funcName + '(' + rangeStr + ')';
    // Place result in the cell just below the selection (same column as end)
    const targetRow = r2 + 1;
    const targetCol = c2;
    // Expand grid if needed. `getData()` returns a snapshot, so we must
    // compute how many rows to add up front — otherwise the `data.length`
    // comparison never updates and we get an infinite loop that hangs the
    // tab (observed when a formula is picked with a selection whose end
    // row is at the last row of the sheet).
    try {
      const data = w.getData();
      const rowsToAdd = Math.max(0, targetRow + 1 - data.length);
      for (let i = 0; i < rowsToAdd; i++) {
        if (typeof w.insertRow === 'function') w.insertRow();
        else break;
      }
    } catch {}
    // Set the formula in the target cell
    try {
      w.setValue(w.records[targetRow][targetCol].element, formula);
      _updateDimLabel();
      showNotification('success', formula + ' \u2192 ' + _colLetter(targetCol) + (targetRow + 1));
    } catch (err) {
      // Fallback: try setValueFromCoords
      try {
        w.setValueFromCoords(targetCol, targetRow, formula);
        _updateDimLabel();
        showNotification('success', formula + ' \u2192 ' + _colLetter(targetCol) + (targetRow + 1));
      } catch (err2) {
        showError('Could not apply formula: ' + err2.message);
      }
    }
    _savedSelection = null; // clear after use
  });
  } // end funcMenu
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

  // Filter — popup dialog
  doc.getElementById('ssFilterBtn')?.addEventListener('click', () => {
    const colOpts = (ss.columns||[]).map((c,i) => '<option value="'+escHtml(c.key||_colLetter(i))+'">'+(c.title||c.key||_colLetter(i))+'</option>').join('');
    const overlay = doc.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = '<div class="modal" style="max-width:380px;padding:20px">' +
      '<h3>\uD83D\uDD0D '+(t('ss_filter_title')||'Filter Spreadsheet')+'</h3>' +
      '<div style="margin-bottom:10px"><label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">'+(t('ss_filter_column')||'Column')+'</label>' +
      '<select id="ssFilterCol" class="input" style="width:100%;font-size:var(--fs-xs)">'+colOpts+'</select></div>' +
      '<div style="margin-bottom:10px"><label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">'+(t('ss_filter_match')||'Match type')+'</label>' +
      '<select id="ssFilterMatch" class="input" style="width:100%;font-size:var(--fs-xs)">' +
      '<option value="contains">'+(t('ss_filter_contains')||'Contains')+'</option>' +
      '<option value="equals">'+(t('ss_filter_equals')||'Equals')+'</option>' +
      '<option value="starts">'+(t('ss_filter_starts')||'Starts with')+'</option>' +
      '<option value="ends">'+(t('ss_filter_ends')||'Ends with')+'</option>' +
      '<option value="gt">'+(t('ss_filter_gt')||'Greater than')+'</option>' +
      '<option value="lt">'+(t('ss_filter_lt')||'Less than')+'</option>' +
      '<option value="empty">'+(t('ss_filter_empty')||'Is empty')+'</option>' +
      '<option value="notempty">'+(t('ss_filter_notempty')||'Is not empty')+'</option>' +
      '</select></div>' +
      '<div style="margin-bottom:12px"><label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:3px">'+(t('ss_filter_value')||'Value')+'</label>' +
      '<input id="ssFilterVal" class="input" style="width:100%;font-size:var(--fs-xs)" placeholder="'+(t('ss_filter_value_ph')||'Filter value...')+'"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn btn-primary btn-sm" id="ssFilterApplyBtn">\u2714 '+(t('ss_filter_apply')||'Apply')+'</button>' +
      '<button class="btn btn-secondary btn-sm" id="ssFilterCancelBtn">'+(t('btn_cancel')||'Cancel')+'</button></div></div>';
    doc.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#ssFilterCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#ssFilterApplyBtn').addEventListener('click', () => {
      const col = overlay.querySelector('#ssFilterCol').value;
      const match = overlay.querySelector('#ssFilterMatch').value;
      const val = overlay.querySelector('#ssFilterVal').value;
      overlay.remove();
      _applyColumnFilter(col, val, match);
      const clearBtn = doc.getElementById('ssClearFilterBtn');
      if (clearBtn) clearBtn.style.display = '';
    });
  });
  doc.getElementById('ssClearFilterBtn')?.addEventListener('click', () => {
    _clearColumnFilter();
    const clearBtn = doc.getElementById('ssClearFilterBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  });

  function _applyColumnFilter(colLetter, filterVal, matchType) {
    let colIdx = -1;
    for (let c = 0; c < (ss.columns || []).length; c++) {
      if ((ss.columns[c]?.key || _colLetter(c)) === colLetter) { colIdx = c; break; }
    }
    if (colIdx < 0) { showError('Column ' + colLetter + ' not found'); return; }
    const rows = gridEl.querySelectorAll('tbody tr');
    const lv = (filterVal||'').toLowerCase();
    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      const cell = cells[colIdx + 1]; // +1 for row header
      const text = cell ? (cell.textContent || '') : '';
      const lt = text.toLowerCase();
      let show = true;
      switch (matchType) {
        case 'contains': show = lt.includes(lv); break;
        case 'equals':   show = lt === lv; break;
        case 'starts':   show = lt.startsWith(lv); break;
        case 'ends':     show = lt.endsWith(lv); break;
        case 'gt':       show = parseFloat(text) > parseFloat(filterVal); break;
        case 'lt':       show = parseFloat(text) < parseFloat(filterVal); break;
        case 'empty':    show = text.trim() === ''; break;
        case 'notempty': show = text.trim() !== ''; break;
        default:         show = lt.includes(lv); break;
      }
      tr.style.display = show ? '' : 'none';
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
  doc.getElementById('ssSettingsBtn')?.addEventListener('click', () => _ssEditSettingsDialog(ss));
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

// ── Formula help table ────────────────────────────────────────────────────────

function _ssFormulaHelpTable() {
  const R = (f,ex,d) => '<tr><td style="padding:3px 8px;border-bottom:1px solid var(--border);font-family:monospace;font-size:10px"><code>'+f+'</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--border);font-size:10px">'+ex+'</td><td style="padding:3px 8px;border-bottom:1px solid var(--border);font-size:10px">'+d+'</td></tr>';
  const H = (cat) => '<tr><td colspan="3" style="padding:6px 8px;font-weight:700;background:var(--bg3);font-size:11px">'+cat+'</td></tr>';
  return '<table style="font-size:var(--fs-xs);width:100%;border-collapse:collapse;margin-bottom:12px">' +
    '<tr style="background:var(--bg3)"><th style="padding:4px 8px;text-align:left">Formula</th><th style="padding:4px 8px;text-align:left">Example</th><th style="padding:4px 8px;text-align:left">Description</th></tr>' +
    H('Arithmetic') +
    R('=A1+B1','=A1+B1','Addition') +
    R('=A1-B1','=A1-B1','Subtraction') +
    R('=A1*B1','=A1*B1','Multiplication') +
    R('=A1/B1','=A1/B1','Division') +
    H('Math & Statistics') +
    R('SUM(range)','=SUM(A1:A10)','Sum of values') +
    R('AVERAGE(range)','=AVERAGE(A1:A10)','Average of values') +
    R('MIN(range)','=MIN(A1:A10)','Smallest value') +
    R('MAX(range)','=MAX(A1:A10)','Largest value') +
    R('COUNT(range)','=COUNT(A1:A10)','Count numbers') +
    R('COUNTA(range)','=COUNTA(A1:A10)','Count non-empty cells') +
    R('MEDIAN(range)','=MEDIAN(A1:A10)','Middle value') +
    R('STDEV(range)','=STDEV(A1:A10)','Standard deviation') +
    R('VAR(range)','=VAR(A1:A10)','Variance') +
    R('PRODUCT(range)','=PRODUCT(A1:A5)','Multiply all values') +
    R('ABS(n)','=ABS(A1)','Absolute value') +
    R('SQRT(n)','=SQRT(A1)','Square root') +
    R('POWER(base,exp)','=POWER(2,8)','Exponentiation') +
    R('ROUND(n,d)','=ROUND(A1,2)','Round to d decimals') +
    R('ROUNDUP(n,d)','=ROUNDUP(A1,2)','Round up') +
    R('ROUNDDOWN(n,d)','=ROUNDDOWN(A1,2)','Round down') +
    R('INT(n)','=INT(3.7)','Integer part (floor)') +
    R('MOD(n,div)','=MOD(10,3)','Remainder') +
    R('CEILING(n,sig)','=CEILING(2.3,1)','Round up to significance') +
    R('FLOOR(n,sig)','=FLOOR(2.7,1)','Round down to significance') +
    R('LOG(n[,base])','=LOG(100,10)','Logarithm') +
    R('LOG10(n)','=LOG10(1000)','Base-10 logarithm') +
    R('EXP(n)','=EXP(1)','e raised to power') +
    R('SIGN(n)','=SIGN(-5)','Sign: -1, 0, or 1') +
    R('PI()','=PI()','3.14159...') +
    R('RAND()','=RAND()','Random 0\u20131') +
    R('LARGE(range,k)','=LARGE(A1:A10,2)','k-th largest value') +
    R('SMALL(range,k)','=SMALL(A1:A10,2)','k-th smallest value') +
    H('Conditional & Logic') +
    R('IF(cond,t,f)','=IF(A1>10,"High","Low")','If/then/else') +
    R('AND(a,b,...)','=AND(A1>0,B1>0)','All conditions true') +
    R('OR(a,b,...)','=OR(A1>0,B1>0)','Any condition true') +
    R('NOT(v)','=NOT(A1>10)','Negate boolean') +
    R('IFERROR(v,fallback)','=IFERROR(A1/B1,0)','Fallback on error') +
    R('ISBLANK(v)','=ISBLANK(A1)','Test if empty') +
    R('ISNUMBER(v)','=ISNUMBER(A1)','Test if numeric') +
    H('Conditional Aggregation') +
    R('SUMIF(range,crit)','=SUMIF(A1:A10,">5")','Sum matching criteria') +
    R('COUNTIF(range,crit)','=COUNTIF(A1:A10,">0")','Count matching criteria') +
    R('AVERAGEIF(range,crit)','=AVERAGEIF(A1:A10,">=10")','Average matching criteria') +
    H('Text & String') +
    R('CONCAT(a,b,...)','=CONCAT(A1," ",B1)','Join text') +
    R('LEFT(text,n)','=LEFT(A1,3)','First N characters') +
    R('RIGHT(text,n)','=RIGHT(A1,3)','Last N characters') +
    R('MID(text,start,len)','=MID(A1,2,3)','Substring') +
    R('LEN(text)','=LEN(A1)','Text length') +
    R('UPPER(text)','=UPPER(A1)','Uppercase') +
    R('LOWER(text)','=LOWER(A1)','Lowercase') +
    R('PROPER(text)','=PROPER(A1)','Title Case') +
    R('TRIM(text)','=TRIM(A1)','Remove whitespace') +
    R('SUBSTITUTE(t,old,new)','=SUBSTITUTE(A1,"x","y")','Replace text') +
    R('REPT(text,n)','=REPT("*",5)','Repeat text') +
    R('FIND(needle,hay)','=FIND("x",A1)','Find position (case-sensitive)') +
    R('SEARCH(needle,hay)','=SEARCH("x",A1)','Find position (case-insensitive)') +
    R('REPLACE(t,pos,len,new)','=REPLACE(A1,2,3,"xyz")','Replace by position') +
    R('VALUE(text)','=VALUE("42")','Text to number') +
    R('TEXT(v)','=TEXT(A1)','Value to text') +
    R('CHAR(n)','=CHAR(65)','Number to character') +
    R('CODE(text)','=CODE("A")','Character to number') +
    R('EXACT(a,b)','=EXACT(A1,B1)','Case-sensitive compare') +
    H('Date & Time') +
    R('TODAY()','=TODAY()','Current date') +
    R('NOW()','=NOW()','Current date+time') +
    R('DATE(y,m,d)','=DATE(2026,4,7)','Create date') +
    R('YEAR(date)','=YEAR(A1)','Extract year') +
    R('MONTH(date)','=MONTH(A1)','Extract month') +
    R('DAY(date)','=DAY(A1)','Extract day') +
    R('HOUR(dt)','=HOUR(A1)','Extract hour') +
    R('MINUTE(dt)','=MINUTE(A1)','Extract minute') +
    R('SECOND(dt)','=SECOND(A1)','Extract second') +
    R('WEEKDAY(date)','=WEEKDAY(A1)','Day of week (1=Sun)') +
    R('DAYS(end,start)','=DAYS(B1,A1)','Days between dates') +
    H('Reference & Utility') +
    R('CHOOSE(idx,a,b,...)','=CHOOSE(2,"a","b","c")','Pick by index') +
    R('TYPE(v)','=TYPE(A1)','1=num, 2=text, 4=bool') +
    R('N(v)','=N(A1)','Convert to number') +
    '</table>';
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
    <p style="font-size:var(--fs-xs);margin-bottom:6px">${t('ss_help_formula_intro')||'Start a cell with <b>=</b> to enter a formula. Cell references use column letter + row number (e.g. A1, B3). Ranges use colon notation (e.g. A1:A10). All function names are case-insensitive.'}</p>
    ` + _ssFormulaHelpTable() + `

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

  // Load scripts in child window: formula engine → jsuites → jspreadsheet
  const formulaScript = w.document.createElement('script');
  formulaScript.src = '/static/spreadsheet-formulas.js';
  formulaScript.onload = () => {
    const jsuitesScript = w.document.createElement('script');
    jsuitesScript.src = '/static/vendor/jsuites.min.js';
    jsuitesScript.onload = () => {
      const jssScript = w.document.createElement('script');
      jssScript.src = '/static/vendor/jspreadsheet.min.js';
      jssScript.onload = () => {
        jspreadsheet = w.jspreadsheet;
        onReady(w);
      };
      w.document.head.appendChild(jssScript);
    };
    w.document.head.appendChild(jsuitesScript);
  };
  w.document.head.appendChild(formulaScript);

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

// Called from the print tool. Fetches the spreadsheet list, lets the user
// pick one, then renders its current cell data as a printable HTML table
// in a new tab. We go through the list → pick flow because the print tool
// is opened from the timeline view, not from inside an open spreadsheet.
async function _printSpreadsheetPicker() {
  let list = [];
  try { list = await apiGet('/api/spreadsheets') || []; } catch {}
  if (!Array.isArray(list) || list.length === 0) {
    showError(t('ss_print_empty') || 'No spreadsheets to print.');
    return;
  }
  // Build a small picker modal
  const existing = document.getElementById('ssPrintPicker');
  if (existing) existing.remove();
  const opts = list.map(ss =>
    `<option value="${ss.id}">${escHtml(ss.name || ('Spreadsheet #' + ss.id))}</option>`
  ).join('');
  const html = `
    <div class="modal-overlay open" id="ssPrintPicker">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h3>🖨 ${escHtml(t('ss_print_title') || 'Print Spreadsheet')}</h3>
          <button class="modal-close" data-close-modal="ssPrintPicker">&times;</button>
        </div>
        <div class="modal-body">
          <label style="display:block;margin-bottom:6px;font-size:var(--fs-sm);color:var(--text-dim)">${escHtml(t('ss_print_pick') || 'Choose a spreadsheet')}</label>
          <select id="ssPrintPickerSel" class="input" style="width:100%">${opts}</select>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal="ssPrintPicker">${escHtml(t('btn_cancel') || 'Cancel')}</button>
          <button class="btn btn-primary" id="ssPrintPickerGo">🖨 ${escHtml(t('btn_print') || 'Print')}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('ssPrintPickerGo')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('ssPrintPickerSel')?.value || '0', 10);
    const pickerEl = document.getElementById('ssPrintPicker');
    if (pickerEl) pickerEl.remove();
    if (!id) return;
    let ss;
    try { ss = await apiGet('/api/spreadsheets/' + id); } catch { showError('Failed to load spreadsheet'); return; }
    if (!ss) return;
    _printSpreadsheetData(ss);
  });
}

// Render the spreadsheet's persisted cell grid as a printable table. We
// don't rely on the jspreadsheet DOM because the spreadsheet modal may
// not be open — we read `ss.cells` straight from the API payload.
function _printSpreadsheetData(ss) {
  const cells = (ss && ss.cells) || [];
  let maxR = 0, maxC = 0;
  for (const c of cells) {
    if (c.row > maxR) maxR = c.row;
    if (c.col > maxC) maxC = c.col;
  }
  const grid = Array.from({length: maxR + 1}, () => Array(maxC + 1).fill(''));
  for (const c of cells) {
    grid[c.row][c.col] = (c.value != null ? String(c.value) : '');
  }
  const headerCols = [];
  for (let c = 0; c <= maxC; c++) headerCols.push('<th>' + _colLetter(c) + '</th>');
  const rows = grid.map((row, rIdx) => {
    const cells = row.map(v => '<td>' + escHtml(v) + '</td>').join('');
    return '<tr><th style="background:#eee">' + (rIdx + 1) + '</th>' + cells + '</tr>';
  }).join('');
  const win = window.open('', '_blank');
  if (!win) return;
  const title = ss.name || 'Spreadsheet';
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHtml(title) + '</title>' +
    '<style>body{font-family:Calibri,Arial,sans-serif;margin:16px;color:#222}' +
    'h1{color:#333;border-bottom:2px solid #333;padding-bottom:4px}' +
    'table{border-collapse:collapse;width:100%;font-size:12px}' +
    'td,th{border:1px solid #ccc;padding:4px 8px}' +
    'th{background:#f0f0f0;font-weight:600;text-align:center}' +
    '@media print{body{margin:0;padding:10px}}</style></head><body>' +
    '<h1>' + escHtml(title) + '</h1>' +
    '<p style="color:#666;font-size:12px">' + new Date().toLocaleString() + '</p>' +
    '<table><thead><tr><th></th>' + headerCols.join('') + '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '</body></html>');
  win.document.close();
  setTimeout(() => win.print(), 300);
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
