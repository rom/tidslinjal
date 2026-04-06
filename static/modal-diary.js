/* ── Diary Module ────────────────────────────────────────────────────────── */
'use strict';

let _diaryEntries = [];
let _diaryFilter = { search: '', tag: '', author: '', private: '' };

// ── Rich text field helper ───────────────────────────────────────────────

// Prevent keyboard events inside diary modals from leaking to the parent app
// (timeline shortcuts, navigation keys, etc.)
function _diaryTrapModalKeys(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  const stop = (e) => e.stopPropagation();
  el.addEventListener('keydown', stop);
  el.addEventListener('keyup', stop);
  el.addEventListener('keypress', stop);
}

// Attach event listeners to toolbar buttons inside a container.
// Uses data-diary-cmd for execCommand buttons and data-diary-action for special buttons.
// mousedown preventDefault keeps focus in the contenteditable editor.
function _diaryBindToolbar(container, editorId) {
  container.querySelectorAll('[data-diary-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => document.execCommand(btn.dataset.diaryCmd));
  });
  container.querySelectorAll('[data-diary-action]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      const action = btn.dataset.diaryAction;
      if (action === 'insertLink') _diaryInsertLink(editorId);
      else if (action === 'insertImage') _diaryInsertImage(editorId);
    });
  });
}

function _diaryRichField(id, value, placeholder, height) {
  const toolbar = `<div style="display:flex;gap:2px;margin-bottom:4px;flex-wrap:wrap" class="diary-rich-toolbar">
    <button type="button" class="btn btn-sm" data-diary-cmd="bold" title="${t("btn_bold")||"Bold"}"><b>B</b></button>
    <button type="button" class="btn btn-sm" data-diary-cmd="italic" title="${t("btn_italic")||"Italic"}"><i>I</i></button>
    <button type="button" class="btn btn-sm" data-diary-cmd="underline" title="${t("btn_underline")||"Underline"}"><u>U</u></button>
    <button type="button" class="btn btn-sm" data-diary-cmd="strikethrough" title="${t("btn_strikethrough")||"Strikethrough"}"><s>S</s></button>
    <button type="button" class="btn btn-sm" data-diary-cmd="insertUnorderedList" title="${t("btn_bullet_list")||"Bullet list"}">• List</button>
    <button type="button" class="btn btn-sm" data-diary-cmd="insertOrderedList" title="${t("btn_numbered_list")||"Numbered list"}">1. List</button>
    <button type="button" class="btn btn-sm" data-diary-action="insertLink" title="${t("btn_insert_link")||"Insert link"}">🔗</button>
    <button type="button" class="btn btn-sm" data-diary-action="insertImage" title="${t("btn_insert_image")||"Insert image"}">🖼</button>
  </div>`;
  return `${toolbar}<div id="${id}" contenteditable="true" class="input"
    style="width:100%;min-height:${height};max-height:400px;overflow-y:auto;resize:vertical;padding:8px;font-size:var(--fs-sm);white-space:pre-wrap;word-break:break-word;line-height:1.5"
    data-placeholder="${escHtml(placeholder)}">${value||''}</div>`;
}

function _diaryInsertLink(fieldId) {
  const url = prompt(t('diary_link_url')||'URL:');
  if (!url) return;
  const label = prompt(t('diary_link_label')||'Link text (leave empty for URL):', '') || url;
  const el = document.getElementById(fieldId);
  if (el) { el.focus(); document.execCommand('insertHTML', false, `<a href="${escHtml(url)}" target="_blank" style="color:var(--accent)">${escHtml(label)}</a>`); }
}

function _diaryInsertImage(fieldId) {
  const url = prompt(t('diary_image_url')||'Image URL:');
  if (!url) return;
  const el = document.getElementById(fieldId);
  if (el) { el.focus(); document.execCommand('insertHTML', false, `<img src="${escHtml(url)}" style="max-width:100%;border-radius:4px;margin:4px 0" alt="image">`); }
}

// ── Wire filter controls via addEventListener (CSP-safe) ─────────────────
function _diaryBindFilterListeners() {
  const search = document.getElementById('diarySearchInput');
  const author = document.getElementById('diaryFilterAuthor');
  const tag = document.getElementById('diaryFilterTag');
  const vis = document.getElementById('diaryFilterPrivate');
  if (search) search.addEventListener('input', _diaryApplyFilter);
  if (author) author.addEventListener('change', _diaryApplyFilter);
  if (tag) tag.addEventListener('change', _diaryApplyFilter);
  if (vis) vis.addEventListener('change', _diaryApplyFilter);
}

// ── Open Diary Modal ────────────────────────────────────────────────────────
async function openDiaryModal() {
  try {
    _diaryEntries = await apiGet('/api/diary') || [];
  } catch { _diaryEntries = []; }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'diaryModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:800px;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>📔 ${t('diary_title')||'Diary'}</h3>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="btn btn-sm btn-secondary" data-action="_diaryExportMenu" title="${t('btn_export')||'Export'}">⬇ ${t('btn_export')||'Export'}</button>
          <button class="btn btn-sm btn-secondary" data-action="_diaryImportPrompt" title="${t('btn_import')||'Import'}">⬆</button>
          <button class="modal-close" data-action="_closeDiaryModal">&times;</button>
        </div>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
        <div style="margin-bottom:12px">
          <button class="btn btn-primary btn-sm" data-action="_diaryNewEntry">+ ${t('diary_new_entry')||'New Entry'}</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
          <input id="diarySearchInput" class="input" style="flex:1;min-width:150px;font-size:var(--fs-xs)" placeholder="${t('diary_search_placeholder')||'Search diary...'}">
          <select id="diaryFilterAuthor" class="input" style="font-size:var(--fs-xs)">
            <option value="">— ${t('diary_all_authors')||'All authors'} —</option>
          </select>
          <select id="diaryFilterTag" class="input" style="font-size:var(--fs-xs)">
            <option value="">— ${t('diary_all_tags')||'All tags'} —</option>
          </select>
          <select id="diaryFilterPrivate" class="input" style="font-size:var(--fs-xs)">
            <option value="">${t('diary_all_visibility')||'All'}</option>
            <option value="public">${t('diary_public')||'Public'}</option>
            <option value="private">${t('diary_private')||'Private'}</option>
          </select>
        </div>
        <div id="diaryEntriesList"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _diaryTrapModalKeys('diaryModal');
  if (typeof _bindActions === 'function') _bindActions(modal);
  _diaryBindFilterListeners();
  _diaryPopulateFilters();
  _diaryRenderList();
}

function _closeDiaryModal() {
  document.getElementById('diaryModal')?.remove();
}

// ── Filters ──────────────────────────────────────────────────────────────────
function _diaryPopulateFilters() {
  const authors = [...new Set(_diaryEntries.map(e => e.display_name).filter(Boolean))].sort();
  const tags = [...new Set(_diaryEntries.flatMap(e => e.tags || []))].sort();
  const authorSel = document.getElementById('diaryFilterAuthor');
  const tagSel = document.getElementById('diaryFilterTag');
  if (authorSel) {
    authorSel.innerHTML = `<option value="">— ${t('diary_all_authors')||'All authors'} —</option>` +
      authors.map(a => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('');
  }
  if (tagSel) {
    tagSel.innerHTML = `<option value="">— ${t('diary_all_tags')||'All tags'} —</option>` +
      tags.map(tg => `<option value="${escHtml(tg)}">${escHtml(tg)}</option>`).join('');
  }
}

function _diaryApplyFilter() {
  _diaryFilter.search = (document.getElementById('diarySearchInput')?.value || '').toLowerCase().trim();
  _diaryFilter.author = document.getElementById('diaryFilterAuthor')?.value || '';
  _diaryFilter.tag = document.getElementById('diaryFilterTag')?.value || '';
  _diaryFilter.private = document.getElementById('diaryFilterPrivate')?.value || '';
  _diaryRenderList();
}

function _diaryFilterEntries() {
  return _diaryEntries.filter(e => {
    if (_diaryFilter.author && e.display_name !== _diaryFilter.author) return false;
    if (_diaryFilter.tag && !(e.tags || []).includes(_diaryFilter.tag)) return false;
    if (_diaryFilter.private === 'public' && e.private) return false;
    if (_diaryFilter.private === 'private' && !e.private) return false;
    if (_diaryFilter.search) {
      const q = _diaryFilter.search;
      const text = `${e.title} ${e.display_name} ${(e.tags||[]).join(' ')} ${e.body||''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

// ── Render List ──────────────────────────────────────────────────────────────
function _diaryRenderList() {
  const container = document.getElementById('diaryEntriesList');
  if (!container) return;
  const filtered = _diaryFilterEntries();
  const isMe = (uid) => state.user && state.user.id === uid;

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim);text-align:center;padding:20px">${t('diary_no_entries')||'No diary entries yet.'}</p>`;
    return;
  }

  // Sort newest first
  const sorted = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  let html = '';
  for (const e of sorted) {
    const date = new Date(e.created_at).toLocaleString();
    const tags = (e.tags || []).map(tg => `<span style="background:var(--accent);color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;margin-right:2px">${escHtml(tg)}</span>`).join('');
    const priv = e.private ? `<span style="color:var(--red,#e74c3c);font-size:9px;margin-left:4px" title="${t('diary_private')||'Private'}">🔒</span>` : '';
    const mood = e.mood ? `<span style="margin-left:4px" title="${t("diary_mood")||"Mood"}">${escHtml(e.mood)}</span>` : '';
    const mine = isMe(e.user_id);
    html += `<div style="padding:10px;margin-bottom:8px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(e.title)}</strong>${priv}${mood}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${mine ? `<button class="btn btn-sm" data-action="_diaryEditEntry" data-arg="${e.id}" title="${t('btn_edit')||'Edit'}">✏</button>` : ''}
          ${mine || (state.user && state.user.role === 'admin') ? `<button class="btn btn-sm" data-action="_diaryDeleteEntry" data-arg="${e.id}" title="${t('btn_delete')||'Delete'}">🗑</button>` : ''}
          <button class="btn btn-sm" data-action="_diaryPrintEntry" data-arg="${e.id}" title="${t('diary_print_entry')||'Print'}">🖨</button>
        </div>
      </div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
        👤 ${escHtml(e.display_name)} — ${date}
        ${tags ? `<div style="margin-top:3px">${tags}</div>` : ''}
      </div>
      <div style="font-size:var(--fs-xs);line-height:1.5">${e.body || ''}</div>
      ${(e.attachments && e.attachments.length) ? `<div style="margin-top:6px;font-size:var(--fs-xs)">📎 ${e.attachments.map(a => `<a href="/api/diary/${e.id}/attachment/${encodeURIComponent(a.stored_name)}" target="_blank" style="color:var(--accent)">${escHtml(a.filename)}</a>`).join(', ')}</div>` : ''}
    </div>`;
  }
  container.innerHTML = html;
  if (typeof _bindActions === 'function') _bindActions(container);
}

// ── New / Edit Entry ─────────────────────────────────────────────────────────
function _diaryNewEntry() {
  _diaryShowEditor(null);
}

function _diaryEditEntry(id) {
  const entry = _diaryEntries.find(e => e.id === Number(id));
  if (!entry) return;
  _diaryShowEditor(entry);
}

function _diaryShowEditor(entry) {
  const isEdit = !!entry;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'diaryEditorModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:700px;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3>${isEdit ? (t('diary_edit_entry')||'Edit Diary Entry') : (t('diary_new_entry')||'New Diary Entry')}</h3>
        <button class="modal-close" data-action="_diaryCloseEditor">&times;</button>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600">${t('diary_entry_title')||'Title'}</label>
          <input id="diaryEditTitle" class="input" style="width:100%;font-size:var(--fs-sm)" value="${escHtml(entry?.title||'')}" placeholder="${t('diary_title_placeholder')||'Entry title...'}">
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600">${t('diary_entry_body')||'Content'}</label>
          ${_diaryRichField('diaryEditBody', entry?.body||'', t('diary_body_placeholder')||'Write your diary entry...', '200px')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:var(--fs-xs);font-weight:600">${t('diary_tags')||'Tags'}</label>
            <input id="diaryEditTags" class="input" style="width:100%;font-size:var(--fs-xs)" value="${escHtml((entry?.tags||[]).join(', '))}" placeholder="${t('diary_tags_placeholder')||'tag1, tag2, ...'}">
          </div>
          <div>
            <label style="font-size:var(--fs-xs);font-weight:600">${t('diary_mood')||'Mood'}</label>
            <select id="diaryEditMood" class="input" style="width:100%;font-size:var(--fs-xs)">
              <option value="">—</option>
              <option value="😊" ${entry?.mood==='😊'?'selected':''}>😊 ${t('diary_mood_good')||'Good'}</option>
              <option value="😐" ${entry?.mood==='😐'?'selected':''}>😐 ${t('diary_mood_neutral')||'Neutral'}</option>
              <option value="😟" ${entry?.mood==='😟'?'selected':''}>😟 ${t('diary_mood_concerned')||'Concerned'}</option>
              <option value="😠" ${entry?.mood==='😠'?'selected':''}>😠 ${t('diary_mood_frustrated')||'Frustrated'}</option>
              <option value="🎉" ${entry?.mood==='🎉'?'selected':''}>🎉 ${t('diary_mood_celebration')||'Celebration'}</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);cursor:pointer">
            <input type="checkbox" id="diaryEditPrivate" ${entry?.private?'checked':''} style="accent-color:var(--accent)">
            🔒 ${t('diary_mark_private')||'Mark as private (only visible to you)'}
          </label>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600">📎 ${t('diary_attachments')||'Attachments'}</label>
          <input type="file" id="diaryEditFile" multiple style="font-size:var(--fs-xs)">
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" data-action="_diarySaveEntry" data-arg="${entry?.id||''}">${t('btn_save')||'Save'}</button>
          <button class="btn btn-secondary btn-sm" data-action="_diaryCloseEditor">${t('btn_cancel')||'Cancel'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _diaryTrapModalKeys('diaryEditorModal');
  if (typeof _bindActions === 'function') _bindActions(modal);
  _diaryBindToolbar(modal, 'diaryEditBody');
  // Auto-focus the title field
  setTimeout(() => document.getElementById('diaryEditTitle')?.focus(), 50);
}

function _diaryCloseEditor() {
  document.getElementById('diaryEditorModal')?.remove();
}

async function _diarySaveEntry(idStr) {
  const title = document.getElementById('diaryEditTitle')?.value?.trim();
  if (!title) { showNotification('warning', t('diary_title_required')||'Title is required'); return; }
  const body = document.getElementById('diaryEditBody')?.innerHTML?.trim() || '';
  const tagsStr = document.getElementById('diaryEditTags')?.value || '';
  const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean);
  const mood = document.getElementById('diaryEditMood')?.value || '';
  const priv = document.getElementById('diaryEditPrivate')?.checked || false;

  const data = { title, body, tags, mood, private: priv };
  const isEdit = idStr && idStr !== '';

  try {
    let entry;
    if (isEdit) {
      entry = await apiPut('/api/diary/' + idStr, data);
    } else {
      entry = await apiPost('/api/diary', data);
    }
    // Upload attachments if any
    const fileInput = document.getElementById('diaryEditFile');
    if (fileInput && fileInput.files.length > 0) {
      const entryId = entry?.id || idStr;
      for (const file of fileInput.files) {
        const fd = new FormData();
        fd.append('file', file);
        await fetch('/api/diary/' + entryId + '/attachment', {
          method: 'POST',
          headers: { 'X-CSRF-Token': _getCsrf(), 'X-Requested-With': 'XMLHttpRequest' },
          body: fd
        });
      }
    }
    _diaryCloseEditor();
    // Refresh
    _diaryEntries = await apiGet('/api/diary') || [];
    _diaryPopulateFilters();
    _diaryRenderList();
    showNotification('success', isEdit ? (t('diary_updated')||'Diary entry updated') : (t('diary_created')||'Diary entry created'));
  } catch (e) {
    showNotification('error', e.message || 'Failed to save');
  }
}

function _getCsrf() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? m[1] : '';
}

// ── Delete Entry ─────────────────────────────────────────────────────────────
async function _diaryDeleteEntry(id) {
  if (!confirm(t('diary_delete_confirm')||'Delete this diary entry?')) return;
  try {
    await apiDelete('/api/diary/' + id);
    _diaryEntries = _diaryEntries.filter(e => e.id !== Number(id));
    _diaryRenderList();
    showNotification('success', t('diary_deleted')||'Diary entry deleted');
  } catch (e) {
    showNotification('error', e.message || 'Failed to delete');
  }
}

// ── Print ────────────────────────────────────────────────────────────────────
function _diaryPrintEntry(id) {
  const entry = _diaryEntries.find(e => e.id === Number(id));
  if (!entry) return;
  _diaryPrintHTML(_diaryEntryToHTML(entry), entry.title);
}

function _diaryPrintAll() {
  const filtered = _diaryFilterEntries().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  let html = '';
  for (const e of filtered) {
    html += _diaryEntryToHTML(e) + '<hr style="margin:20px 0">';
  }
  _diaryPrintHTML(html, t('diary_title')||'Diary');
}

function _diaryEntryToHTML(e) {
  const date = new Date(e.created_at).toLocaleString();
  const tags = (e.tags || []).join(', ');
  return `
    <h2 style="margin:0 0 4px 0">${escHtml(e.title)}</h2>
    <p style="color:#666;margin:0 0 8px 0">${escHtml(e.display_name)} — ${date}${tags ? ' — Tags: '+escHtml(tags) : ''}${e.private ? ' — 🔒 Private' : ''}</p>
    <div style="line-height:1.6">${e.body||''}</div>`;
}

function _diaryPrintHTML(bodyHtml, title) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>body{font-family:Calibri,Arial,sans-serif;max-width:800px;margin:20px auto;padding:0 20px;color:#222}
    h2{color:#333}img{max-width:100%}a{color:#2563eb}@media print{body{margin:0;padding:10px}}</style>
    </head><body>${bodyHtml}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ── Export / Import ──────────────────────────────────────────────────────────
function _diaryExportMenu() {
  const menu = document.createElement('div');
  menu.className = 'modal-overlay open';
  menu.id = 'diaryExportMenu';
  menu.innerHTML = `
    <div class="modal" style="max-width:300px">
      <div class="modal-header">
        <h3>${t('diary_export')||'Export Diary'}</h3>
        <button class="modal-close" data-action="_diaryCloseExportMenu">&times;</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="json">JSON</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="xml">XML</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="csv">CSV</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="xlsx">XLSX</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="ods">ODS</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="txt">${t('diary_export_text')||'Text'}</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="rtf">RTF</button>
        <button class="btn btn-secondary" data-action="_diaryDoExport" data-arg="md">Markdown</button>
        <hr>
        <button class="btn btn-secondary" data-action="_diaryPrintAll">🖨 ${t('diary_print_all')||'Print All'}</button>
      </div>
    </div>`;
  document.body.appendChild(menu);
  _diaryTrapModalKeys('diaryExportMenu');
  if (typeof _bindActions === 'function') _bindActions(menu);
}

function _diaryCloseExportMenu() {
  document.getElementById('diaryExportMenu')?.remove();
}

function _diaryDoExport(format) {
  _diaryCloseExportMenu();
  window.open('/api/diary/export?format=' + format, '_blank');
}

function _diaryImportPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.xml';
  input.onchange = async () => {
    if (!input.files.length) return;
    const text = await input.files[0].text();
    try {
      const res = await fetch('/api/diary/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _getCsrf(), 'X-Requested-With': 'XMLHttpRequest' },
        body: text
      });
      const data = await res.json();
      showNotification('success', `Imported ${data.imported || 0} entries`);
      _diaryEntries = await apiGet('/api/diary') || [];
      _diaryPopulateFilters();
      _diaryRenderList();
    } catch (e) {
      showNotification('error', e.message || 'Import failed');
    }
  };
  input.click();
}
