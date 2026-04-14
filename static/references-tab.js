/* ── References Tab, Upload, Checksums, Edit ── */
// ── References Tab ──────────────────────────────────────────────────────────

async function _openReferenceIndex() {
  const theme = state?.preferences?.theme || 'dark';
  const catLabels = {
    handbook: t('ref_category_handbook') || 'Handbook',
    sop: t('ref_category_sop') || 'SOP',
    policy: t('ref_category_policy') || 'Policy',
    map: t('ref_category_map') || 'Map',
    reference: t('ref_category_reference') || 'Reference',
    checklist: t('ref_category_checklist') || 'Checklist',
    faq: t('ref_category_faq') || 'FAQ',
    objectives: t('ref_category_objectives') || 'Objectives',
    presentation_material: t('ref_category_presentation_material') || 'Presentation Material',
    exercise_documents: t('ref_category_exercise_documents') || 'Exercise Documents',
    threat_intel: t('ref_category_threat_intel') || 'Threat Intel',
    other: t('ref_category_other') || 'Other'
  };
  const catColors = { handbook:'#3498DB', sop:'#E67E22', policy:'#9B59B6', map:'#2ECC71', reference:'#1ABC9C', checklist:'#27AE60', faq:'#F39C12', objectives:'#E74C3C', presentation_material:'#E91E63', exercise_documents:'#8E44AD', threat_intel:'#C0392B', other:'#95A5A6' };
  const langNames = {en:'English',sv:'Svenska',fr:'Français',fi:'Suomi',de:'Deutsch',no:'Norsk',nb:'Norsk (Bokmål)',da:'Dansk',es:'Español',it:'Italiano',pt:'Português',nl:'Nederlands',pl:'Polski',uk:'Українська',ru:'Русский',et:'Eesti',lv:'Latviešu',lt:'Lietuvių'};

  let data;
  try {
    const res = await fetch('/api/references/index');
    if (!res.ok) throw new Error('failed');
    data = await res.json();
  } catch (e) {
    console.warn('[refIndex]', e);
    return;
  }

  const w = window.open('', '_blank', 'width=900,height=700,resizable=yes,scrollbars=yes');
  if (!w) return;

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal — Document Index</title>
<style>
body.theme-dark{background:#1a1d23;color:#e8eaf0}body.theme-light{background:#f0f2f5;color:#1a1d23}body.theme-city-camo{background:#2b3325;color:#d4dbc0}body.theme-urban-camo{background:#1a2233;color:#c8d8e8}
body{font-family:'Segoe UI',system-ui,sans-serif;padding:24px;line-height:1.6;font-size:13px}
h1{font-size:18px;margin-bottom:16px;letter-spacing:.05em}
h2{font-size:14px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(128,128,128,.3);padding-bottom:4px}
.summary{margin-bottom:20px;padding:12px;border-radius:6px;background:rgba(128,128,128,.1);border:1px solid rgba(128,128,128,.2)}
.summary b{font-size:15px}
.badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;color:#fff;margin-right:6px;margin-bottom:4px}
.tag-list{margin-top:8px}
.tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;border:1px solid rgba(128,128,128,.3);margin:2px 3px 2px 0}
table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px}
th{text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid rgba(128,128,128,.3)}
td{padding:5px 8px;border-bottom:1px solid rgba(128,128,128,.15)}
tr:hover td{background:rgba(128,128,128,.08)}
a{color:#4a9eff;text-decoration:none}
a:hover{text-decoration:underline}
.lang-tag{font-size:10px;padding:1px 4px;border-radius:2px;border:1px solid rgba(128,128,128,.3);margin-left:4px}
.type-tag{font-size:10px;padding:1px 4px;border-radius:2px;background:#4a9eff;color:#fff;margin-left:4px}
</style></head><body class="theme-${escHtml(theme)}">
<h1>Document Index</h1>
<div class="summary">
  <b>${t('ref_info_total') || 'Total'}: ${data.total_count}</b><br>`;

  // Category badges
  (data.categories || []).forEach(g => {
    html += `<span class="badge" style="background:${catColors[g.category] || '#95A5A6'}">${escHtml(catLabels[g.category] || g.category)} (${g.count})</span>`;
  });

  // Languages
  if (data.languages && data.languages.length) {
    html += `<br><span style="font-size:11px;opacity:.7">${t('ref_languages') || 'Languages'}: ${data.languages.map(l => langNames[l] || l).join(', ')}</span>`;
  }

  // Top tags
  if (data.tags && data.tags.length) {
    html += `<div class="tag-list">`;
    data.tags.slice(0, 20).forEach(tg => {
      html += `<span class="tag">${escHtml(tg.tag)} (${tg.count})</span>`;
    });
    html += `</div>`;
  }

  html += `</div>`;

  // Category sections with tables
  (data.categories || []).forEach(g => {
    html += `<h2><span class="badge" style="background:${catColors[g.category] || '#95A5A6'}">${g.count}</span>${escHtml(catLabels[g.category] || g.category)}</h2>`;
    html += `<table><thead><tr><th>#</th><th>${t('ref_title') || 'Title'}</th><th>${t('ref_type') || 'Type'}</th><th>${t('ref_language') || 'Language'}</th><th>${t('ref_owner') || 'Owner'}</th><th>${t('ref_tags') || 'Tags'}</th><th></th></tr></thead><tbody>`;
    g.entries.forEach((e, i) => {
      const langLabel = e.language ? `<span class="lang-tag">${escHtml(langNames[e.language] || e.language)}</span>` : '';
      const typeLabel = e.detected_type ? `<span class="type-tag">${escHtml(e.detected_type.toUpperCase())}</span>` : (e.ref_type || '');
      const tags = (e.tags || []).map(tg => `<span class="tag">${escHtml(tg)}</span>`).join('');
      const link = e.download_url ? `<a href="${escHtml(e.download_url)}" target="_blank">${e.ref_type === 'url' ? 'Open' : 'Download'}</a>` : '';
      html += `<tr><td>${i + 1}</td><td><b>${escHtml(e.title)}</b></td><td>${typeLabel}</td><td>${langLabel}</td><td>${escHtml(e.owner || e.authors || '')}</td><td>${tags}</td><td>${link}</td></tr>`;
    });
    html += `</tbody></table>`;
  });

  html += `</body></html>`;
  w.document.write(html);
  w.document.close();
}

function _renderReferencesTab(el) {
  const canEdit = state.user && hasRole2(state.user.role, 'teamlead');
  el.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>${t('tab_infomanagement') || 'Infomanagement'}</span>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:10px">
        <button class="btn btn-sm _infomgmt-tab-btn" id="btnInfoTabRefs" style="flex:1;font-weight:700;background:var(--accent);color:#fff">${t('references_title') || 'References'}</button>
        <button class="btn btn-sm _infomgmt-tab-btn" id="btnInfoTabArchive" style="flex:1">${t('report_archive_title') || 'Report Archive'}</button>
        <button class="btn btn-sm _infomgmt-tab-btn" id="btnInfoTabMessages" style="flex:1">${t('message_archive_title') || 'Message Archive'}</button>
      </div>
      <div id="infoTabRefs">
        <div style="display:flex;justify-content:flex-end;gap:4px;margin-bottom:6px">
          ${canEdit ? '<button class="btn btn-primary btn-sm" id="btnAddReference">+ Add</button>' : ''}
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" id="btnRefIndex" title="${t('ref_index')||'Document Index'}">Index</button>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" id="btnDetachReferences" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        </div>
        <input type="text" id="refSearch" list="refSearchSuggestions" placeholder="${t('search') || 'Search...'}" style="width:100%;margin-bottom:8px;padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)" autocomplete="off">
        <datalist id="refSearchSuggestions"></datalist>
        <select id="refCategoryFilter" style="width:100%;margin-bottom:8px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)">
          <option value="">${t('all_categories') || 'All categories'}</option>
          <option value="handbook">${t('ref_category_handbook') || 'Handbook'}</option>
          <option value="sop">${t('ref_category_sop') || 'SOP'}</option>
          <option value="policy">${t('ref_category_policy') || 'Policy'}</option>
          <option value="map">${t('ref_category_map') || 'Map'}</option>
          <option value="reference">${t('ref_category_reference') || 'Reference'}</option>
          <option value="checklist">${t('ref_category_checklist') || 'Checklist'}</option>
          <option value="faq">${t('ref_category_faq') || 'FAQ'}</option>
          <option value="objectives">${t('ref_category_objectives') || 'Objectives'}</option>
          <option value="exercise_documents">${t('ref_category_exercise_documents') || 'Exercise Documents'}</option>
          <option value="threat_intel">${t('ref_category_threat_intel') || 'Threat Intel'}</option>
          <option value="other">${t('ref_category_other') || 'Other'}</option>
        </select>
        <select id="refLanguageFilter" style="width:100%;margin-bottom:8px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)">
          <option value="">${t('all_languages') || 'All languages'}</option>
        </select>
        <div id="refInfoArea" style="margin-bottom:8px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;font-size:11px;color:var(--text-dim)"></div>
        <div id="refGitActions" style="display:none;margin-bottom:8px;display:flex;gap:6px;align-items:center">
          <button class="btn btn-secondary btn-sm" id="btnRefGitSave" style="font-size:10px">💾 ${t('ref_git_save')||'Save to Git'}</button>
          <button class="btn btn-secondary btn-sm" id="btnRefGitLoad" style="font-size:10px">📥 ${t('ref_git_load')||'Load from Git'}</button>
          <span id="refGitStatus" style="font-size:var(--fs-xs);color:var(--text-dim)"></span>
        </div>
        <div id="refList" style="max-height:60vh;overflow-y:auto"></div>
      </div>
      <div id="infoTabArchive" style="display:none">
        <div style="display:flex;justify-content:flex-end;gap:4px;margin-bottom:8px">
          ${canEdit ? `<button class="btn btn-primary btn-sm" id="btnUploadReport">${t('report_archive_upload') || 'Upload Report'}</button>` : ''}
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px">
          <button class="btn btn-sm _report-cat-btn" id="btnReportLocal" style="flex:1;font-weight:700;background:var(--accent);color:#fff">${t('report_archive_local') || 'Local Reports'}</button>
          <button class="btn btn-sm _report-cat-btn" id="btnReportIncoming" style="flex:1">${t('report_archive_incoming') || 'Incoming Reports'}</button>
        </div>
        <div id="reportArchiveList" style="max-height:60vh;overflow-y:auto"></div>
      </div>
      <div id="infoTabMessages" style="display:none">
        <div style="display:flex;justify-content:flex-end;gap:4px;margin-bottom:8px">
          ${canEdit ? `<button class="btn btn-primary btn-sm" id="btnAddMessage">${t('message_archive_add') || '+ New Message'}</button>` : ''}
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px">
          <button class="btn btn-sm _msg-cat-btn" id="btnMsgLocal" style="flex:1;font-weight:700;background:var(--accent);color:#fff">${t('message_archive_local') || 'Local Messages'}</button>
          <button class="btn btn-sm _msg-cat-btn" id="btnMsgIncoming" style="flex:1">${t('message_archive_incoming') || 'Incoming Messages'}</button>
        </div>
        <div id="messageArchiveList" style="max-height:60vh;overflow-y:auto"></div>
      </div>
    </div>`;
  _loadAndRenderReferences();
  _checkRefGitIntegration();
  const addBtn = document.getElementById('btnAddReference');
  if (addBtn) addBtn.addEventListener('click', () => _openReferenceUploadModal());
  const indexBtn = document.getElementById('btnRefIndex');
  if (indexBtn) indexBtn.addEventListener('click', () => _openReferenceIndex());
  const detachRefBtn = document.getElementById('btnDetachReferences');
  if (detachRefBtn) detachRefBtn.addEventListener('click', () => openDetachedReferences());
  const searchEl = document.getElementById('refSearch');
  if (searchEl) searchEl.addEventListener('input', () => _filterReferences());
  const catEl = document.getElementById('refCategoryFilter');
  if (catEl) catEl.addEventListener('change', () => _filterReferences());
  const langEl = document.getElementById('refLanguageFilter');
  if (langEl) langEl.addEventListener('change', () => _filterReferences());

  // Infomanagement tab switching
  function _switchInfoTab(active) {
    ['Refs','Archive','Messages'].forEach(id => {
      const tab = document.getElementById('infoTab' + id);
      const btn = document.getElementById('btnInfoTab' + id);
      if (tab) tab.style.display = id === active ? '' : 'none';
      if (btn) { btn.style.background = id === active ? 'var(--accent)' : ''; btn.style.color = id === active ? '#fff' : ''; }
    });
  }
  document.getElementById('btnInfoTabRefs')?.addEventListener('click', () => _switchInfoTab('Refs'));
  document.getElementById('btnInfoTabArchive')?.addEventListener('click', () => {
    _switchInfoTab('Archive');
    _loadAndRenderReportArchive();
  });
  document.getElementById('btnInfoTabMessages')?.addEventListener('click', () => {
    _switchInfoTab('Messages');
    _loadAndRenderMessageArchive();
  });

  // Report archive category switching
  let _reportCategory = 'local';
  document.getElementById('btnReportLocal')?.addEventListener('click', () => {
    _reportCategory = 'local';
    document.getElementById('btnReportLocal').style.background = 'var(--accent)';
    document.getElementById('btnReportLocal').style.color = '#fff';
    document.getElementById('btnReportIncoming').style.background = '';
    document.getElementById('btnReportIncoming').style.color = '';
    _renderReportArchiveList();
  });
  document.getElementById('btnReportIncoming')?.addEventListener('click', () => {
    _reportCategory = 'incoming';
    document.getElementById('btnReportIncoming').style.background = 'var(--accent)';
    document.getElementById('btnReportIncoming').style.color = '#fff';
    document.getElementById('btnReportLocal').style.background = '';
    document.getElementById('btnReportLocal').style.color = '';
    _renderReportArchiveList();
  });

  const uploadReportBtn = document.getElementById('btnUploadReport');
  if (uploadReportBtn) uploadReportBtn.addEventListener('click', () => _openReportUploadModal(_reportCategory));

  // Message archive category switching
  document.getElementById('btnMsgLocal')?.addEventListener('click', () => {
    _messageCategory = 'local';
    document.getElementById('btnMsgLocal').style.background = 'var(--accent)';
    document.getElementById('btnMsgLocal').style.color = '#fff';
    document.getElementById('btnMsgIncoming').style.background = '';
    document.getElementById('btnMsgIncoming').style.color = '';
    _renderMessageArchiveList();
  });
  document.getElementById('btnMsgIncoming')?.addEventListener('click', () => {
    _messageCategory = 'incoming';
    document.getElementById('btnMsgIncoming').style.background = 'var(--accent)';
    document.getElementById('btnMsgIncoming').style.color = '#fff';
    document.getElementById('btnMsgLocal').style.background = '';
    document.getElementById('btnMsgLocal').style.color = '';
    _renderMessageArchiveList();
  });
  const addMsgBtn = document.getElementById('btnAddMessage');
  if (addMsgBtn) addMsgBtn.addEventListener('click', () => {
    const subject = prompt(t('message_archive_subject_prompt') || 'Message subject:');
    if (!subject) return;
    const body = prompt(t('message_archive_body_prompt') || 'Message body (optional):') || '';
    const _csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const _hdrs = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (_csrf) _hdrs['X-CSRF-Token'] = _csrf[1];
    fetch('/api/message-archive', { method: 'POST', headers: _hdrs, body: JSON.stringify({ subject, body }) })
      .then(r => { if (r.ok) _loadAndRenderMessageArchive(); else r.json().then(e => alert(e.error)).catch(() => alert('Failed')); });
  });

  // Report archive data and rendering
  let _reportArchiveData = [];

  async function _loadAndRenderReportArchive() {
    try {
      const res = await fetch('/api/report-archive', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (res.ok) _reportArchiveData = await res.json() || [];
    } catch { _reportArchiveData = []; }
    _renderReportArchiveList();
  }

  // Badge colors for report sources/tags
  const _sourceBadgeColors = {
    report: '#3498DB',
    autogenerated: '#E67E22',
    analysis: '#9B59B6',
    incoming: '#27AE60',
    manual: '#95A5A6',
  };
  const _sourceBadgeIcons = {
    report: '📄',
    autogenerated: '⏰',
    analysis: '📊',
    incoming: '📥',
    manual: '📎',
  };

  function _renderReportArchiveList() {
    const listEl = document.getElementById('reportArchiveList');
    if (!listEl) return;
    const filtered = _reportArchiveData
      .filter(r => r.category === _reportCategory)
      .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);padding:12px;text-align:center">${t('report_archive_empty') || 'No reports yet.'}</div>`;
      return;
    }
    listEl.innerHTML = filtered.map(r => {
      const sizeStr = r.size < 1024 ? r.size + ' B' : r.size < 1048576 ? (r.size / 1024).toFixed(1) + ' KB' : (r.size / 1048576).toFixed(1) + ' MB';
      const dateStr = r.uploaded_at ? new Date(r.uploaded_at).toLocaleString() : '';
      // Source badge from tags
      const source = (r.tags && r.tags[0]) || 'manual';
      const badgeColor = _sourceBadgeColors[source] || '#95A5A6';
      const badgeIcon = _sourceBadgeIcons[source] || '📎';
      const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
      // Report type badge
      const typeLabel = r.report_type ? r.report_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
      return `<div style="padding:8px 6px;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:${badgeColor};color:#fff;white-space:nowrap">${badgeIcon} ${escHtml(sourceLabel)}</span>
              ${typeLabel ? `<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg3);border:1px solid var(--border);color:var(--text);white-space:nowrap">${escHtml(typeLabel)}</span>` : ''}
              <strong style="font-size:var(--fs-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.title)}</strong>
            </div>
            ${r.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${escHtml(r.description)}</div>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <a href="/api/report-archive/${r.id}/download" target="_blank" class="btn btn-sm" title="${t('btn_download')||'Download'}">⬇</a>
            ${canEdit ? `<button class="btn btn-sm" style="color:var(--danger);font-size:10px" onclick="_deleteReportArchive(${r.id})" title="${t('btn_delete')||'Delete'}">✖</button>` : ''}
          </div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">
          <span>👤 ${escHtml(r.uploaded_by_name || t('unknown')||'Unknown')}</span>
          <span>🕐 ${dateStr}</span>
          <span>${escHtml(r.filename)} (${sizeStr})</span>
        </div>
      </div>`;
    }).join('');
  }

  window._deleteReportArchive = async function(id) {
    if (!confirm(t('report_archive_delete_confirm')||'Delete this report?')) return;
    try {
      const _csrfDel = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      const _hdrsDel = { 'X-Requested-With': 'XMLHttpRequest' };
      if (_csrfDel) _hdrsDel['X-CSRF-Token'] = _csrfDel[1];
      await fetch('/api/report-archive/' + id, { method: 'DELETE', headers: _hdrsDel });
      _loadAndRenderReportArchive();
    } catch (e) { alert(e.message); }
  };

  window._openReportUploadModal = function(category) {
    const html = `<div class="modal-overlay" id="reportUploadModal">
      <div class="modal" style="max-width:500px;width:90vw;padding:20px;position:relative">
        <button class="modal-close" id="reportUploadClose">✕</button>
        <h3>${t('report_archive_upload') || 'Upload Report'}</h3>
        <label>Title</label>
        <input id="reportTitle" class="input" style="width:100%;margin-bottom:8px" placeholder="${t('report_archive_title_ph')||'Report title'}">
        <label>${t('description')||'Description'}</label>
        <input id="reportDesc" class="input" style="width:100%;margin-bottom:8px" placeholder="${t('report_archive_desc_ph')||'Optional description'}">
        <label>${t('report_archive_category')||'Category'}</label>
        <select id="reportCat" class="input" style="width:100%;margin-bottom:8px">
          <option value="local" ${category==='local'?'selected':''}>${t('report_archive_local') || 'Local Reports'}</option>
          <option value="incoming" ${category==='incoming'?'selected':''}>${t('report_archive_incoming') || 'Incoming Reports'}</option>
        </select>
        <label>${t('report_archive_file')||'File'}</label>
        <input type="file" id="reportFile" style="margin-bottom:12px">
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="reportUploadBtn">${t('btn_upload')||'Upload'}</button>
          <button class="btn btn-secondary" id="reportUploadCancel">${t('btn_cancel')||'Cancel'}</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('reportUploadModal');
    void modal.offsetHeight;
    modal.classList.add('open');
    // Bind close/cancel/upload buttons (CSP-safe, no inline handlers)
    const closeModal = () => modal?.remove();
    document.getElementById('reportUploadClose')?.addEventListener('click', closeModal);
    document.getElementById('reportUploadCancel')?.addEventListener('click', closeModal);
    document.getElementById('reportUploadBtn')?.addEventListener('click', () => _doUploadReport());
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  };

  window._doUploadReport = async function() {
    const file = document.getElementById('reportFile')?.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', document.getElementById('reportTitle')?.value || '');
    fd.append('description', document.getElementById('reportDesc')?.value || '');
    fd.append('category', document.getElementById('reportCat')?.value || 'local');
    try {
      const _csrfUp = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      const _hdrsUp = { 'X-Requested-With': 'XMLHttpRequest' };
      if (_csrfUp) _hdrsUp['X-CSRF-Token'] = _csrfUp[1];
      const res = await fetch('/api/report-archive', { method: 'POST', headers: _hdrsUp, body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Upload failed'); }
      document.getElementById('reportUploadModal')?.remove();
      _loadAndRenderReportArchive();
    } catch (e) { alert(e.message); }
  };
}

// ── Message Archive ──────────────────────────────────────────────────────────
let _messageArchiveData = [];
let _messageCategory = 'local';

async function _loadAndRenderMessageArchive() {
  try {
    const res = await fetch('/api/message-archive', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (res.ok) _messageArchiveData = await res.json() || [];
  } catch { _messageArchiveData = []; }
  _renderMessageArchiveList();
}

function _renderMessageArchiveList() {
  const listEl = document.getElementById('messageArchiveList');
  if (!listEl) return;
  const filtered = _messageArchiveData
    .filter(m => m.category === _messageCategory)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);padding:12px;text-align:center">${t('message_archive_empty') || 'No messages yet.'}</div>`;
    return;
  }
  const canEdit = state.user && hasRole2(state.user.role, 'teamlead');
  listEl.innerHTML = filtered.map(m => {
    const dateStr = m.created_at ? new Date(m.created_at).toLocaleString() : '';
    const sourceIcon = { api: '🔌', webhook: '🔔', connector: '🔗', manual: '✍️' }[m.source] || '📨';
    const sourceLabel = m.source ? m.source.charAt(0).toUpperCase() + m.source.slice(1) : 'Unknown';
    const typeLabel = m.message_type ? m.message_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
    const seqLabel = m.seq_num ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:var(--accent);color:#fff;font-weight:700;font-family:monospace">#${m.seq_num}</span>` : '';
    const tags = (m.tags || []).map(tg => `<span style="font-size:9px;padding:1px 4px;border-radius:2px;background:var(--bg3);border:1px solid var(--border);margin-right:3px">${escHtml(tg)}</span>`).join('');
    return `<div style="padding:8px 6px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${seqLabel}
            <span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg3);border:1px solid var(--border);white-space:nowrap">${sourceIcon} ${escHtml(sourceLabel)}</span>
            ${typeLabel ? `<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg3);border:1px solid var(--border);white-space:nowrap">${escHtml(typeLabel)}</span>` : ''}
            <strong style="font-size:var(--fs-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.subject)}</strong>
          </div>
          ${m.body ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${escHtml(m.body)}</div>` : ''}
          ${tags ? `<div style="margin-top:3px">${tags}</div>` : ''}
        </div>
        ${canEdit ? `<button class="btn btn-sm" style="color:var(--danger);font-size:10px;flex-shrink:0" onclick="_deleteMessageArchive(${m.id})" title="${t('btn_delete')||'Delete'}">✖</button>` : ''}
      </div>
      <div style="font-size:10px;color:var(--text-dim);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">
        ${m.sender ? `<span>📡 ${escHtml(m.sender)}</span>` : ''}
        <span>🕐 ${dateStr}</span>
        ${m.created_by_name ? `<span>👤 ${escHtml(m.created_by_name)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

window._deleteMessageArchive = async function(id) {
  if (!confirm(t('message_archive_delete_confirm')||'Delete this message?')) return;
  try {
    const _csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const _hdrs = { 'X-Requested-With': 'XMLHttpRequest' };
    if (_csrf) _hdrs['X-CSRF-Token'] = _csrf[1];
    await fetch('/api/message-archive/' + id, { method: 'DELETE', headers: _hdrs });
    _loadAndRenderMessageArchive();
  } catch (e) { alert(e.message); }
};

async function _loadAndRenderReferences() {
  try {
    const res = await fetch('/api/references');
    if (!res.ok) return;
    state.references = await res.json() || [];
  } catch (e) { state.references = []; }
  // Ensure default user manual reference exists
  _ensureDefaultUserManualRef();
  // Populate language filter dropdown
  const _langNamesForFilter = {en:'English',sv:'Svenska',fr:'Français',fi:'Suomi',de:'Deutsch',no:'Norsk',nb:'Norsk (Bokmål)',da:'Dansk',es:'Español',it:'Italiano',pt:'Português',nl:'Nederlands',pl:'Polski',uk:'Українська',ru:'Русский',et:'Eesti',lv:'Latviešu',lt:'Lietuvių'};
  const langFilter = document.getElementById('refLanguageFilter');
  if (langFilter) {
    const usedLangs = new Set();
    (state.references || []).forEach(r => { if (r.language) usedLangs.add(r.language); });
    const currentVal = langFilter.value || '';
    langFilter.innerHTML = `<option value="">${t('all_languages') || 'All languages'}</option>`;
    [...usedLangs].sort().forEach(lang => {
      langFilter.innerHTML += `<option value="${lang}"${lang === currentVal ? ' selected' : ''}>${_langNamesForFilter[lang] || lang}</option>`;
    });
  }
  // Populate info area with category counts
  const infoArea = document.getElementById('refInfoArea');
  if (infoArea) {
    const catColors = { handbook:'#3498DB', sop:'#E67E22', policy:'#9B59B6', map:'#2ECC71', reference:'#1ABC9C', checklist:'#27AE60', faq:'#F39C12', objectives:'#E74C3C', presentation_material:'#E91E63', exercise_documents:'#8E44AD', threat_intel:'#C0392B', other:'#95A5A6' };
    const catCounts = {};
    (state.references || []).forEach(r => {
      const c = r.category || 'other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const total = (state.references || []).length;
    const catKeys = ['handbook','sop','policy','map','reference','checklist','faq','objectives','presentation_material','exercise_documents','threat_intel','other'];
    const badges = catKeys.filter(k => catCounts[k]).map(k =>
      `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;background:${catColors[k]};color:#fff;margin-right:4px">${t('ref_category_'+k)||k} ${catCounts[k]}</span>`
    ).join('');
    infoArea.innerHTML = `<b>${t('ref_info_total') || 'Total'}: ${total}</b> &nbsp; ${badges}`;
  }
  // Populate autocomplete suggestions from available reference titles and filenames
  const dl = document.getElementById('refSearchSuggestions');
  if (dl) {
    const seen = new Set();
    dl.innerHTML = '';
    (state.references || []).forEach(r => {
      [r.title, r.original_name].filter(Boolean).forEach(v => {
        if (!seen.has(v.toLowerCase())) {
          seen.add(v.toLowerCase());
          dl.innerHTML += `<option value="${escHtml(v)}">`;
        }
      });
      (r.tags || []).forEach(tag => {
        if (!seen.has(tag.toLowerCase())) {
          seen.add(tag.toLowerCase());
          dl.innerHTML += `<option value="${escHtml(tag)}">`;
        }
      });
    });
  }
  _filterReferences();
}

function _filterReferences() {
  const listEl = document.getElementById('refList');
  if (!listEl) return;
  const search = (document.getElementById('refSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('refCategoryFilter')?.value || '';
  const lang = document.getElementById('refLanguageFilter')?.value || '';
  const canEdit = state.user && hasRole2(state.user.role, 'teamlead');
  const refs = (state.references || []).filter(r => {
    if (cat && r.category !== cat) return false;
    if (lang && r.language !== lang) return false;
    if (search && !(r.title + ' ' + (r.description || '') + ' ' + (r.tags || []).join(' ')).toLowerCase().includes(search)) return false;
    return true;
  });
  if (refs.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-dim);font-size:var(--fs-sm);padding:12px 0">No references found.</div>';
    return;
  }
  const catColors = { handbook:'#3498DB', sop:'#E67E22', policy:'#9B59B6', map:'#2ECC71', reference:'#1ABC9C', checklist:'#27AE60', faq:'#F39C12', objectives:'#E74C3C', other:'#95A5A6' };
  const _langNames = {en:'English',sv:'Svenska',fr:'Français',fi:'Suomi',de:'Deutsch',no:'Norsk',nb:'Norsk (Bokmål)',da:'Dansk',es:'Español',it:'Italiano',pt:'Português',nl:'Nederlands',pl:'Polski',ru:'Русский',et:'Eesti',lv:'Latviešu',lt:'Lietuvių'};
  const _copyModeLabels = {central:t('ref_copy_central'),local:t('ref_copy_local'),link:t('ref_copy_link'),git:t('ref_copy_git')||'Push to Git'};
  listEl.innerHTML = refs.map(r => {
    const sizeStr = r.size ? fmtFileSize(r.size) : '';
    const dateStr = r.uploaded_at ? new Date(r.uploaded_at).toLocaleString(getLocale()) : '';
    return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;background:${catColors[r.category] || '#95A5A6'};color:#fff;text-transform:uppercase;margin-right:6px">${escHtml(r.category || 'other')}</span>
          ${r.detected_type ? `<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;background:var(--accent);color:#fff;margin-right:4px">${escHtml(r.detected_type.toUpperCase())}</span>` : ''}
          ${r.language ? `<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;background:var(--bg2);border:1px solid var(--border);margin-right:4px" title="${t('ref_language')}">${escHtml(_langNames[r.language] || r.language)}</span>` : ''}
          <b style="font-size:var(--fs-base)">${escHtml(r.title)}</b>
        </div>
        <div style="display:flex;gap:4px">
          ${r.ref_type === 'url' ? `<a href="${escHtml(r.url || '')}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="font-size:10px">🔗 Open</a>` :
            r.ref_type === 'local' ? `<button class="btn btn-secondary btn-sm" style="font-size:10px" data-ref-view-local="${r.id}">📄 View</button><span id="refLocal_${r.id}" style="display:none">${escHtml(r.content || '')}</span>` :
            `<button class="btn btn-secondary btn-sm" style="font-size:10px" data-ref-show="${r.id}">👁 ${t('ref_show')||'Show'}</button><a href="/api/references/${r.id}/download" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10px">${t('detail_download')||'Download'}</a>`}
          ${r.ref_type === 'url' && r.filename ? `<button class="btn btn-secondary btn-sm" style="font-size:10px" data-ref-show="${r.id}">👁 ${t('ref_show')||'Show'}</button>` : ''}
          ${r.checksum_md5 ? `<button class="btn btn-secondary btn-sm" style="font-size:10px" data-ref-checksums="${r.id}" title="${t('ref_checksums')}">#️⃣</button>` : ''}
          ${canEdit ? `<button class="btn btn-secondary btn-sm" style="font-size:10px" data-ref-edit="${r.id}">✏️</button>` : ''}
          ${canEdit ? `<button class="btn btn-secondary btn-sm" style="font-size:10px;color:var(--red)" data-ref-delete="${r.id}">${t('btn_delete')}</button>` : ''}
        </div>
      </div>
      ${r.description ? `<div style="font-size:var(--fs-sm);color:var(--text-dim);margin-top:4px">${escHtml(r.description)}</div>` : ''}
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px;display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 8px">
        <span>${escHtml(r.original_name || '')}</span><span>${sizeStr}</span>
        <span>${t('ref_owner')||'Owner'}:</span><span>${escHtml(r.owner || r.uploaded_by_name || '—')}</span>
        ${r.custodian ? `<span>${t('ref_custodian')}:</span><span>${escHtml(r.custodian)}</span>` : ''}
        <span>${t('ref_time_added')||'Added'}:</span><span>${dateStr}</span>
        ${r.copy_mode ? `<span>${t('ref_copy_mode')}:</span><span>${escHtml(_copyModeLabels[r.copy_mode] || r.copy_mode)}</span>` : ''}
        ${r.reference_count ? `<span>${t('ref_times_referenced')}:</span><span>${r.reference_count}</span>` : ''}
      </div>
      ${(r.tags || []).length ? `<div style="margin-top:4px">${r.tags.map(tg => `<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;background:var(--bg2);border:1px solid var(--border);margin-right:3px">${escHtml(tg)}</span>`).join('')}</div>` : ''}
      ${r.checksum_md5 ? `<details style="margin-top:4px;font-size:10px;color:var(--text-dim)"><summary style="cursor:pointer;font-weight:600">${t('ref_checksums') || 'Checksums'}</summary><div style="font-family:monospace;font-size:9px;word-break:break-all;margin-top:2px;padding:4px;background:var(--bg2);border-radius:3px;line-height:1.6">MD5: ${escHtml(r.checksum_md5)}<br>SHA-1: ${escHtml(r.checksum_sha1 || '')}<br>SHA-256: ${escHtml(r.checksum_sha256 || '')}<br>SHA-512: ${escHtml(r.checksum_sha512 || '')}</div></details>` : ''}
    </div>`;
  }).join('');
  // Bind reference action buttons (CSP-safe, no inline onclick)
  listEl.querySelectorAll('[data-ref-view-local]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.refViewLocal, 10);
      const ref = (state.references || []).find(r => r.id === id);
      const content = document.getElementById('refLocal_' + id)?.textContent || '';
      _showReferenceInWindow(ref, content);
    });
  });
  listEl.querySelectorAll('[data-ref-show]').forEach(btn => {
    btn.addEventListener('click', () => _showReferenceInWindow((state.references || []).find(r => r.id === parseInt(btn.dataset.refShow, 10))));
  });
  listEl.querySelectorAll('[data-ref-checksums]').forEach(btn => {
    btn.addEventListener('click', () => _showRefChecksums(parseInt(btn.dataset.refChecksums, 10)));
  });
  listEl.querySelectorAll('[data-ref-edit]').forEach(btn => {
    btn.addEventListener('click', () => _openRefEditModal(parseInt(btn.dataset.refEdit, 10)));
  });
  listEl.querySelectorAll('[data-ref-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(t('ref_delete_confirm') || 'Delete this reference?')) _deleteReference(parseInt(btn.dataset.refDelete, 10));
    });
  });
}

function _showReferenceInWindow(ref, localContent) {
  if (!ref) return;
  const theme = state?.preferences?.theme || 'dark';
  const title = 'Tidslinjal — ' + (ref.title || 'Reference');
  if (ref.ref_type === 'local' || localContent) {
    // Display inline content in a new window
    const w = window.open('', '_blank', 'width=800,height=600,resizable=yes,scrollbars=yes');
    if (!w) return;
    const content = localContent || ref.content || '';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(title)}</title>
<style>body.theme-dark{background:#1a1d23;color:#e8eaf0}body.theme-light{background:#f0f2f5;color:#1a1d23}body.theme-city-camo{background:#2b3325;color:#d4dbc0}body.theme-urban-camo{background:#1a2233;color:#c8d8e8}body{font-family:'Segoe UI',system-ui,sans-serif;padding:24px;white-space:pre-wrap;line-height:1.6}</style>
</head><body class="theme-${escHtml(theme)}">${escHtml(content)}</body></html>`);
    w.document.close();
    return;
  }
  if (ref.ref_type === 'url' && ref.url) {
    // For URL references that also have a server-cached file, show from server
    if (ref.filename) {
      window.open('/api/references/' + ref.id + '/download?inline=1', '_blank', 'width=900,height=700,resizable=yes,scrollbars=yes');
    } else {
      window.open(ref.url, '_blank');
    }
    return;
  }
  // File-type reference — open inline via download endpoint
  window.open('/api/references/' + ref.id + '/download?inline=1', '_blank', 'width=900,height=700,resizable=yes,scrollbars=yes');
}

async function _deleteReference(id) {
  try {
    const res = await fetch('/api/references/' + id, { method: 'DELETE' });
    if (res.ok) _loadAndRenderReferences();
  } catch (e) { console.warn('[deleteReference]', e); }
}

async function _checkRefGitIntegration() {
  const gitActions = document.getElementById('refGitActions');
  if (!gitActions) return;
  try {
    const status = state._integrationStatus || await apiGet('/api/status').catch(() => null);
    if (status && status.github_enabled) {
      gitActions.style.display = '';
      const saveBtn = document.getElementById('btnRefGitSave');
      const loadBtn = document.getElementById('btnRefGitLoad');
      const statusEl = document.getElementById('refGitStatus');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        saveBtn.textContent = '⏳...';
        try {
          const res = await api('POST', '/api/references/git/save');
          statusEl.textContent = res.ok ? '✓ Saved' : '✗ Failed';
        } catch { statusEl.textContent = '✗ Error'; }
        saveBtn.textContent = '💾 ' + (t('ref_git_save')||'Save to Git');
      });
      if (loadBtn) loadBtn.addEventListener('click', async () => {
        loadBtn.textContent = '⏳...';
        try {
          const res = await api('POST', '/api/references/git/load');
          if (res.ok) { statusEl.textContent = '✓ Loaded'; _loadAndRenderReferences(); }
          else statusEl.textContent = '✗ Failed';
        } catch { statusEl.textContent = '✗ Error'; }
        loadBtn.textContent = '📥 ' + (t('ref_git_load')||'Load from Git');
      });
    } else {
      gitActions.style.display = 'none';
    }
  } catch { gitActions.style.display = 'none'; }
}

async function _ensureDefaultUserManualRef() {
  // Check if the Tidslinjal user manual reference already exists
  const refs = state.references || [];
  const hasManual = refs.some(r =>
    r.title === 'Tidslinjal User Manual' ||
    (r.tags && r.tags.includes('User manual') && r.tags.includes('Tidslinjal'))
  );
  if (!hasManual) {
    try {
      await api('POST', '/api/references/link', {
        title: 'Tidslinjal User Manual',
        description: 'Official Tidslinjal user manual and documentation.',
        category: 'handbook',
        tags: 'User manual, documentation, Tidslinjal',
        ref_type: 'url',
        url: 'https://tidslinjal.cyberladan.se/docs/user-manual',
      });
    } catch { /* ignore — server might not support this endpoint yet */ }
  }
}

function _openReferenceUploadModal() {
  // Build and show a simple upload modal
  let modal = document.getElementById('referenceUploadModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'referenceUploadModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-header">
          <h3>${t('ref_add_title') || 'Add Reference'}</h3>
          <button class="modal-close" data-close-ref-modal>×</button>
        </div>
        <div class="modal-body">
          <label style="font-weight:600;margin-bottom:4px">Type</label>
          <div class="toggle-btn-group" style="margin-bottom:8px">
            <button class="toggle-btn active" id="refTypeFile" data-ref-type="file">${t('ref_type_file') || 'Upload File'}</button>
            <button class="toggle-btn" id="refTypeUrl" data-ref-type="url">${t('ref_type_url') || 'Link / URL'}</button>
            <button class="toggle-btn" id="refTypeLocal" data-ref-type="local">${t('ref_type_local') || 'Local Resource'}</button>
          </div>
          <label>Title</label>
          <input type="text" id="refUpTitle" class="form-input" placeholder="Document title">
          <label style="margin-top:8px">Description</label>
          <input type="text" id="refUpDesc" class="form-input" placeholder="Description (optional)">
          <label style="margin-top:8px">${t('ref_authors') || 'Authors'}</label>
          <input type="text" id="refUpAuthors" class="form-input" placeholder="${t('ref_authors_placeholder') || 'Author names (comma-separated)'}">
          <label style="margin-top:8px">Category</label>
          <select id="refUpCategory" class="form-input">
            <option value="handbook">${t('ref_category_handbook') || 'Handbook'}</option>
            <option value="sop">${t('ref_category_sop') || 'SOP'}</option>
            <option value="policy">${t('ref_category_policy') || 'Policy'}</option>
            <option value="map">${t('ref_category_map') || 'Map'}</option>
            <option value="reference">${t('ref_category_reference') || 'Reference'}</option>
            <option value="checklist">${t('ref_category_checklist') || 'Checklist'}</option>
            <option value="faq">${t('ref_category_faq') || 'FAQ'}</option>
            <option value="objectives">${t('ref_category_objectives') || 'Objectives'}</option>
            <option value="presentation_material">${t('ref_category_presentation_material') || 'Presentation Material'}</option>
            <option value="exercise_documents">${t('ref_category_exercise_documents') || 'Exercise Documents'}</option>
            <option value="threat_intel">${t('ref_category_threat_intel') || 'Threat Intel'}</option>
            <option value="other">${t('ref_category_other') || 'Other'}</option>
          </select>
          <label style="margin-top:8px">${t('ref_language') || 'Language'}</label>
          <select id="refUpLang" class="form-input">
            <option value="">—</option><option value="en">English</option><option value="sv">Svenska</option><option value="fr">Français</option><option value="fi">Suomi</option><option value="de">Deutsch</option><option value="nb">Norsk (Bokmål)</option><option value="da">Dansk</option><option value="it">Italiano</option><option value="es">Español</option><option value="pt">Português</option><option value="et">Eesti</option><option value="lv">Latviešu</option><option value="lt">Lietuvių</option>
          </select>
          <label style="margin-top:8px">${t('ref_owner') || 'Owner'}</label>
          <select id="refUpOwner" class="form-input"><option value="">—</option></select>
          <label style="margin-top:8px">${t('ref_custodian') || 'Custodian'}</label>
          <select id="refUpCustodian" class="form-input"><option value="">—</option></select>
          <label style="margin-top:8px">${t('ref_copy_mode') || 'Copy Mode'}</label>
          <select id="refUpCopyMode" class="form-input">
            <option value="">—</option><option value="central">${t('ref_copy_central') || 'Central copy'}</option><option value="local">${t('ref_copy_local') || 'Local copy'}</option><option value="link">${t('ref_copy_link') || 'Show link'}</option><option value="git">${t('ref_copy_git') || 'Push to Git'}</option>
          </select>
          <label style="margin-top:8px">Tags (comma-separated)</label>
          <input type="text" id="refUpTags" class="form-input" placeholder="tag1, tag2, ...">
          <div id="refFileGroup">
            <label style="margin-top:8px">File</label>
            <input type="file" id="refUpFile" class="form-input">
          </div>
          <div id="refUrlGroup" style="display:none">
            <label style="margin-top:8px">${t('ref_url_label') || 'URL'}</label>
            <input type="url" id="refUpUrl" class="form-input" placeholder="${t('ref_url_placeholder') || 'https://example.com/document'}">
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
              <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);cursor:pointer">
                <input type="checkbox" id="refDownloadLocal" checked style="accent-color:var(--accent)">
                ${t('ref_download_local') || 'Download local copy'}
                <span title="${t('ref_download_local_info') || 'Download a local copy of this URL to your browser.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);cursor:pointer">
                <input type="checkbox" id="refDownloadServer" checked style="accent-color:var(--accent)">
                ${t('ref_download_server') || 'Save copy to server'}
                <span title="${t('ref_download_server_info') || 'Save a cached copy of this URL on the Tidslinjal server.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
              </label>
            </div>
          </div>
          <div id="refLocalGroup" style="display:none">
            <label style="margin-top:8px">${t('ref_local_content') || 'Content'}</label>
            <textarea id="refUpLocalContent" class="form-input" rows="4" placeholder="${t('ref_local_placeholder') || 'Enter content directly…'}" style="resize:vertical"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="btnDoUploadRef">${t('btn_save') || 'Save'}</button>
          <button class="btn btn-secondary" data-close-ref-modal>${t('btn_cancel') || 'Cancel'}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-ref-modal]').forEach(b => b.addEventListener('click', () => modal.classList.remove('open')));
    document.getElementById('btnDoUploadRef').addEventListener('click', _handleReferenceUpload);
    // Ref type toggle
    modal.querySelectorAll('[data-ref-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('[data-ref-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ty = btn.dataset.refType;
        document.getElementById('refFileGroup').style.display = ty === 'file' ? '' : 'none';
        document.getElementById('refUrlGroup').style.display = ty === 'url' ? '' : 'none';
        document.getElementById('refLocalGroup').style.display = ty === 'local' ? '' : 'none';
      });
    });
  }
  // Reset form
  document.getElementById('refUpTitle').value = '';
  document.getElementById('refUpDesc').value = '';
  document.getElementById('refUpTags').value = '';
  const refUpFile = document.getElementById('refUpFile');
  if (refUpFile) refUpFile.value = '';
  const refUpUrl = document.getElementById('refUpUrl');
  if (refUpUrl) refUpUrl.value = '';
  const refUpLocal = document.getElementById('refUpLocalContent');
  if (refUpLocal) refUpLocal.value = '';
  // Reset type toggle to file
  modal.querySelectorAll('[data-ref-type]').forEach(b => b.classList.remove('active'));
  const fileBtn = document.getElementById('refTypeFile');
  if (fileBtn) fileBtn.classList.add('active');
  document.getElementById('refFileGroup').style.display = '';
  document.getElementById('refUrlGroup').style.display = 'none';
  document.getElementById('refLocalGroup').style.display = 'none';
  // Populate owner/custodian user selects
  _populateRefUserSelects(['refUpOwner', 'refUpCustodian']);
  modal.classList.add('open');
}

async function _populateRefUserSelects(selectIds, selectedValues) {
  let users = state.users || [];
  if (!users.length) {
    try { const res = await fetch('/api/users'); if (res.ok) users = await res.json(); } catch {}
  }
  const sv = selectedValues || {};
  for (const id of selectIds) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const curVal = sv[id] || '';
    sel.innerHTML = '<option value="">\u2014</option>';
    users.forEach(u => {
      const name = u.display_name || u.username;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === curVal) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}

async function _handleReferenceUpload() {
  const title = document.getElementById('refUpTitle').value.trim();
  if (!title) { alert(t('ref_title_required') || 'Title is required'); return; }
  const saveBtn = document.getElementById('btnDoUploadRef');
  const saveBtnOrigText = saveBtn ? saveBtn.textContent : '';
  const saveBtnOrigBg = saveBtn ? saveBtn.style.background : '';
  function _setUploading(busy) {
    if (!saveBtn) return;
    if (busy) { saveBtn.textContent = t('uploading') || 'Uploading\u2026'; saveBtn.style.background = 'var(--text-dim)'; saveBtn.disabled = true; }
    else { saveBtn.textContent = saveBtnOrigText; saveBtn.style.background = saveBtnOrigBg; saveBtn.disabled = false; }
  }
  _setUploading(true);
  // Determine active type
  const activeType = document.querySelector('[data-ref-type].active')?.dataset?.refType || 'file';

  if (activeType === 'url') {
    // URL reference
    const url = document.getElementById('refUpUrl')?.value?.trim() || '';
    if (!url) { alert('URL is required'); return; }
    const downloadLocal = document.getElementById('refDownloadLocal')?.checked ?? true;
    const downloadServer = document.getElementById('refDownloadServer')?.checked ?? true;
    const body = {
      title, url,
      description: document.getElementById('refUpDesc').value.trim(),
      category: document.getElementById('refUpCategory').value,
      tags: document.getElementById('refUpTags').value.trim(),
      ref_type: 'url',
      download_local: downloadLocal,
      download_server: downloadServer,
      language: document.getElementById('refUpLang')?.value || '',
      owner: document.getElementById('refUpOwner')?.value?.trim() || '',
      authors: document.getElementById('refUpAuthors')?.value?.trim() || '',
      custodian: document.getElementById('refUpCustodian')?.value?.trim() || '',
      copy_mode: document.getElementById('refUpCopyMode')?.value || '',
    };
    try {
      const res = await api('POST', '/api/references/link', body);
      if (!res.ok) { _setUploading(false); const err = await res.json().catch(() => ({})); alert('Failed: ' + (err.error || 'Unknown error')); return; }
      // Trigger local browser download if option was checked
      if (downloadLocal && url) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.download = title || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      _setUploading(false);
      document.getElementById('referenceUploadModal').classList.remove('open');
      _loadAndRenderReferences();
    } catch (e) { _setUploading(false); alert('Error: ' + e.message); }
  } else if (activeType === 'local') {
    // Local/inline resource
    const content = document.getElementById('refUpLocalContent')?.value?.trim() || '';
    if (!content) { alert('Content is required'); return; }
    const body = {
      title, content,
      description: document.getElementById('refUpDesc').value.trim(),
      category: document.getElementById('refUpCategory').value,
      tags: document.getElementById('refUpTags').value.trim(),
      ref_type: 'local',
      language: document.getElementById('refUpLang')?.value || '',
      owner: document.getElementById('refUpOwner')?.value?.trim() || '',
      authors: document.getElementById('refUpAuthors')?.value?.trim() || '',
      custodian: document.getElementById('refUpCustodian')?.value?.trim() || '',
      copy_mode: document.getElementById('refUpCopyMode')?.value || '',
    };
    try {
      const res = await api('POST', '/api/references/link', body);
      if (!res.ok) { _setUploading(false); const err = await res.json().catch(() => ({})); alert('Failed: ' + (err.error || 'Unknown error')); return; }
      _setUploading(false);
      document.getElementById('referenceUploadModal').classList.remove('open');
      _loadAndRenderReferences();
    } catch (e) { _setUploading(false); alert('Error: ' + e.message); }
  } else {
    // File upload (original behavior)
    const file = document.getElementById('refUpFile').files[0];
    if (!file) { _setUploading(false); alert('File is required'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title);
    fd.append('description', document.getElementById('refUpDesc').value.trim());
    fd.append('category', document.getElementById('refUpCategory').value);
    const tags = document.getElementById('refUpTags').value.trim();
    if (tags) fd.append('tags', tags);
    const lang = document.getElementById('refUpLang')?.value || '';
    if (lang) fd.append('language', lang);
    const currentUserName = state.user?.display_name || state.user?.username || '';
    const owner = document.getElementById('refUpOwner')?.value?.trim() || currentUserName;
    if (owner) fd.append('owner', owner);
    const authors = document.getElementById('refUpAuthors')?.value?.trim() || '';
    if (authors) fd.append('authors', authors);
    const custodian = document.getElementById('refUpCustodian')?.value?.trim() || currentUserName;
    if (custodian) fd.append('custodian', custodian);
    const copyMode = document.getElementById('refUpCopyMode')?.value || '';
    if (copyMode) fd.append('copy_mode', copyMode);
    try {
      const _csrfRef = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      const _hdrsRef = { 'X-Requested-With': 'XMLHttpRequest' };
      if (_csrfRef) _hdrsRef['X-CSRF-Token'] = _csrfRef[1];
      const res = await fetch('/api/references', { method: 'POST', body: fd, headers: _hdrsRef });
      if (!res.ok) { _setUploading(false); let txt = ''; try { const ct = res.headers.get('content-type')||''; if (ct.includes('application/json')) { const j = await res.json(); txt = j.error||''; } } catch {} showError(txt || ('Upload failed — HTTP ' + res.status)); return; }
      _setUploading(false);
      document.getElementById('referenceUploadModal').classList.remove('open');
      _loadAndRenderReferences();
    } catch (e) { _setUploading(false); alert('Upload error: ' + e.message); }
  }
}

function _showRefChecksums(id) {
  const ref = (state.references || []).find(r => r.id === id);
  if (!ref) return;
  const rows = [];
  if (ref.checksum_md5) rows.push(`<tr><td style="font-weight:600;padding:2px 8px 2px 0">MD5</td><td style="font-family:monospace;font-size:11px;word-break:break-all">${escHtml(ref.checksum_md5)}</td></tr>`);
  if (ref.checksum_sha1) rows.push(`<tr><td style="font-weight:600;padding:2px 8px 2px 0">SHA-1</td><td style="font-family:monospace;font-size:11px;word-break:break-all">${escHtml(ref.checksum_sha1)}</td></tr>`);
  if (ref.checksum_sha256) rows.push(`<tr><td style="font-weight:600;padding:2px 8px 2px 0">SHA-256</td><td style="font-family:monospace;font-size:11px;word-break:break-all">${escHtml(ref.checksum_sha256)}</td></tr>`);
  if (ref.checksum_sha512) rows.push(`<tr><td style="font-weight:600;padding:2px 8px 2px 0">SHA-512</td><td style="font-family:monospace;font-size:11px;word-break:break-all">${escHtml(ref.checksum_sha512)}</td></tr>`);
  if (rows.length === 0) {
    fetch('/api/references/' + id + '/checksums').then(r => r.json()).then(data => {
      if (data.checksum_md5) { ref.checksum_md5 = data.checksum_md5; ref.checksum_sha1 = data.checksum_sha1; ref.checksum_sha256 = data.checksum_sha256; ref.checksum_sha512 = data.checksum_sha512; _showRefChecksums(id); }
      else alert(t('ref_no_checksums') || 'No checksums available for this reference.');
    }).catch(() => alert('Failed to load checksums'));
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="max-width:520px">
    <div class="modal-header"><h3>${t('ref_checksums') || 'File Checksums'} — ${escHtml(ref.title)}</h3><button class="modal-close" data-close-overlay>×</button></div>
    <div class="modal-body"><table style="width:100%">${rows.join('')}</table></div>
    <div class="modal-footer"><button class="btn btn-secondary" data-close-overlay>${t('btn_close') || 'Close'}</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-overlay]').forEach(b => b.addEventListener('click', () => overlay.remove()));
}

function _openRefEditModal(id) {
  const ref = (state.references || []).find(r => r.id === id);
  if (!ref) return;
  const _langOpts = [{v:'',l:'—'},{v:'en',l:'English'},{v:'sv',l:'Svenska'},{v:'fr',l:'Français'},{v:'fi',l:'Suomi'},{v:'de',l:'Deutsch'},{v:'nb',l:'Norsk (Bokmål)'},{v:'da',l:'Dansk'},{v:'es',l:'Español'},{v:'it',l:'Italiano'},{v:'pt',l:'Português'},{v:'nl',l:'Nederlands'},{v:'pl',l:'Polski'},{v:'ru',l:'Русский'},{v:'et',l:'Eesti'},{v:'lv',l:'Latviešu'},{v:'lt',l:'Lietuvių'}];
  const _copyOpts = [{v:'',l:'—'},{v:'central',l:t('ref_copy_central')||'Central copy'},{v:'local',l:t('ref_copy_local')||'Local copy'},{v:'link',l:t('ref_copy_link')||'Show link'},{v:'git',l:t('ref_copy_git')||'Push to Git'}];
  const ti = ref.threat_intel || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="max-width:520px">
    <div class="modal-header"><h3>${t('ref_edit_title') || 'Edit Reference'}</h3><button class="modal-close" data-close-overlay>×</button></div>
    <div class="modal-body">
      <label>${t('ref_title') || 'Title'}</label>
      <input type="text" id="refEditTitle" class="form-input" value="${escHtml(ref.title || '')}">
      <label style="margin-top:8px">${t('ref_description') || 'Description'}</label>
      <input type="text" id="refEditDesc" class="form-input" value="${escHtml(ref.description || '')}">
      <label style="margin-top:8px">${t('ref_authors') || 'Authors'}</label>
      <input type="text" id="refEditAuthors" class="form-input" value="${escHtml(ref.authors || '')}" placeholder="${t('ref_authors_placeholder') || 'Author names (comma-separated)'}">
      <label style="margin-top:8px">${t('ref_category') || 'Category'}</label>
      <select id="refEditCategory" class="form-input">
        ${[{v:'handbook',l:t('ref_category_handbook')||'Handbook'},{v:'sop',l:t('ref_category_sop')||'SOP'},{v:'policy',l:t('ref_category_policy')||'Policy'},{v:'map',l:t('ref_category_map')||'Map'},{v:'reference',l:t('ref_category_reference')||'Reference'},{v:'checklist',l:t('ref_category_checklist')||'Checklist'},{v:'faq',l:t('ref_category_faq')||'FAQ'},{v:'objectives',l:t('ref_category_objectives')||'Objectives'},{v:'presentation_material',l:t('ref_category_presentation_material')||'Presentation Material'},{v:'exercise_documents',l:t('ref_category_exercise_documents')||'Exercise Documents'},{v:'threat_intel',l:t('ref_category_threat_intel')||'Threat Intel'},{v:'other',l:t('ref_category_other')||'Other'}].map(o => `<option value="${o.v}"${o.v === (ref.category || 'other') ? ' selected' : ''}>${o.l}</option>`).join('')}
      </select>
      <label style="margin-top:8px">${t('ref_language') || 'Language'}</label>
      <select id="refEditLang" class="form-input">${_langOpts.map(o => `<option value="${o.v}"${o.v === (ref.language || '') ? ' selected' : ''}>${o.l}</option>`).join('')}</select>
      <label style="margin-top:8px">${t('ref_owner') || 'Owner'}</label>
      <select id="refEditOwner" class="form-input"><option value="">—</option></select>
      <label style="margin-top:8px">${t('ref_custodian') || 'Custodian'}</label>
      <select id="refEditCustodian" class="form-input"><option value="">—</option></select>
      <label style="margin-top:8px">${t('ref_copy_mode') || 'Copy Mode'}</label>
      <select id="refEditCopyMode" class="form-input">${_copyOpts.map(o => `<option value="${o.v}"${o.v === (ref.copy_mode || '') ? ' selected' : ''}>${o.l}</option>`).join('')}</select>
      <label style="margin-top:8px">${t('ref_tags') || 'Tags'} (comma-separated)</label>
      <input type="text" id="refEditTags" class="form-input" value="${escHtml((ref.tags || []).join(', '))}">
      <!-- Threat Intel fieldset: only visible when category == threat_intel.
           Shown/hidden by _tiToggle() on category changes, below. Fields map
           1:1 onto the ThreatIntelMeta Go struct; the collect step below
           packs them back into a nested object before the PUT. -->
      <fieldset id="refEditThreatIntel" style="margin-top:14px;border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;display:none">
        <legend style="font-size:var(--fs-xs);color:var(--text-dim);padding:0 4px">\u{1F6A8} ${t('threat_intel_section')||'Threat Intel'}</legend>
        <label style="font-size:var(--fs-xs)">${t('threat_intel_aliases')||'Aliases'} (comma-separated)</label>
        <input type="text" id="refEditTiAliases" class="form-input" value="${escHtml((ti.aliases||[]).join(', '))}" placeholder="APT29, Cozy Bear, The Dukes">
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_actor_type')||'Actor Type'}</label>
        <select id="refEditTiActorType" class="form-input">
          ${[{v:'',l:'—'},{v:'apt',l:'APT'},{v:'nation_state',l:'Nation State'},{v:'ransomware',l:'Ransomware'},{v:'cybercrime',l:'Cybercrime'},{v:'hacktivist',l:'Hacktivist'},{v:'insider',l:'Insider'},{v:'unknown',l:'Unknown'}].map(o => `<option value="${o.v}"${o.v === (ti.actor_type||'') ? ' selected':''}>${o.l}</option>`).join('')}
        </select>
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_severity')||'Severity'}</label>
        <select id="refEditTiSeverity" class="form-input">
          ${[{v:'',l:'—'},{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'},{v:'critical',l:'Critical'}].map(o => `<option value="${o.v}"${o.v === (ti.severity||'') ? ' selected':''}>${o.l}</option>`).join('')}
        </select>
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_origin')||'Origin'}</label>
        <input type="text" id="refEditTiOrigin" class="form-input" value="${escHtml(ti.origin||'')}" placeholder="RU / CN / Unknown">
        <div style="display:flex;gap:8px;margin-top:8px">
          <div style="flex:1">
            <label style="font-size:var(--fs-xs)">${t('threat_intel_first_seen')||'First Seen'}</label>
            <input type="date" id="refEditTiFirstSeen" class="form-input" value="${escHtml(ti.first_seen||'')}">
          </div>
          <div style="flex:1">
            <label style="font-size:var(--fs-xs)">${t('threat_intel_last_seen')||'Last Seen'}</label>
            <input type="date" id="refEditTiLastSeen" class="form-input" value="${escHtml(ti.last_seen||'')}">
          </div>
        </div>
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_ttps')||'TTPs'} (one per line)</label>
        <textarea id="refEditTiTtps" class="form-input" rows="3" style="resize:vertical" placeholder="spearphishing with macro&#10;dll sideloading via signed binary">${escHtml((ti.ttps||[]).join('\n'))}</textarea>
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_known_apts')||'Known APTs'} (comma-separated)</label>
        <input type="text" id="refEditTiKnownApts" class="form-input" value="${escHtml((ti.known_apts||[]).join(', '))}" placeholder="APT28, APT29">
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_attack_mappings')||'ATT&amp;CK Mappings'}</label>
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">${t('threat_intel_attack_mappings_help')||'One per line: technique_id | tactic | sub_technique | note'}</div>
        <textarea id="refEditTiAttack" class="form-input" rows="4" style="resize:vertical;font-family:monospace;font-size:11px" placeholder="T1566.001 | Initial Access | Spearphishing Attachment | Observed Q1 2026">${escHtml((ti.attack_mappings||[]).map(m => [m.technique_id||'', m.tactic||'', m.sub_technique||'', m.note||''].join(' | ')).join('\n'))}</textarea>
        <label style="margin-top:8px;font-size:var(--fs-xs)">${t('threat_intel_refs')||'External References'}</label>
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">${t('threat_intel_refs_help')||'One per line: label | https://…'}</div>
        <textarea id="refEditTiRefs" class="form-input" rows="3" style="resize:vertical;font-size:11px" placeholder="CISA advisory | https://www.cisa.gov/...">${escHtml((ti.refs||[]).map(r => [r.label||'', r.url||''].join(' | ')).join('\n'))}</textarea>
      </fieldset>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="btnSaveRefEdit">${t('btn_save') || 'Save'}</button>
      <button class="btn btn-secondary" data-close-overlay>${t('btn_cancel') || 'Cancel'}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // Populate owner/custodian user selects with current values
  _populateRefUserSelects(['refEditOwner', 'refEditCustodian'], { refEditOwner: ref.owner || '', refEditCustodian: ref.custodian || '' });
  overlay.querySelectorAll('[data-close-overlay]').forEach(b => b.addEventListener('click', () => overlay.remove()));
  // Show/hide the threat intel fieldset based on the selected category.
  const _tiToggle = () => {
    const catEl = document.getElementById('refEditCategory');
    const fs = document.getElementById('refEditThreatIntel');
    if (fs) fs.style.display = (catEl && catEl.value === 'threat_intel') ? '' : 'none';
  };
  document.getElementById('refEditCategory').addEventListener('change', _tiToggle);
  _tiToggle();
  document.getElementById('btnSaveRefEdit').addEventListener('click', async () => {
    const category = document.getElementById('refEditCategory').value;
    // Build the threat intel payload only when the category is threat_intel.
    // The server will ignore it for other categories anyway, but skipping it
    // here keeps the PUT body small and avoids noise in git-synced JSON.
    let threatIntel = null;
    if (category === 'threat_intel') {
      const parseList = (s) => (s||'').split(',').map(x => x.trim()).filter(Boolean);
      const parseLines = (s) => (s||'').split('\n').map(x => x.trim()).filter(Boolean);
      const attackLines = parseLines(document.getElementById('refEditTiAttack').value);
      const mappings = attackLines.map(line => {
        const parts = line.split('|').map(x => x.trim());
        return { technique_id: parts[0]||'', tactic: parts[1]||'', sub_technique: parts[2]||'', note: parts[3]||'' };
      }).filter(m => m.technique_id);
      const refLines = parseLines(document.getElementById('refEditTiRefs').value);
      const refs = refLines.map(line => {
        const parts = line.split('|').map(x => x.trim());
        // A single-part line is treated as a bare URL with no label.
        if (parts.length === 1) return { url: parts[0] };
        return { label: parts[0]||'', url: parts[1]||'' };
      }).filter(r => r.url);
      threatIntel = {
        aliases: parseList(document.getElementById('refEditTiAliases').value),
        actor_type: document.getElementById('refEditTiActorType').value,
        severity: document.getElementById('refEditTiSeverity').value,
        origin: document.getElementById('refEditTiOrigin').value.trim(),
        first_seen: document.getElementById('refEditTiFirstSeen').value,
        last_seen: document.getElementById('refEditTiLastSeen').value,
        ttps: parseLines(document.getElementById('refEditTiTtps').value),
        known_apts: parseList(document.getElementById('refEditTiKnownApts').value),
        attack_mappings: mappings,
        refs: refs,
      };
    }
    const body = {
      title: document.getElementById('refEditTitle').value.trim(),
      description: document.getElementById('refEditDesc').value.trim(),
      category: category,
      language: document.getElementById('refEditLang').value,
      owner: document.getElementById('refEditOwner').value.trim(),
      authors: document.getElementById('refEditAuthors')?.value?.trim() || '',
      custodian: document.getElementById('refEditCustodian').value.trim(),
      copy_mode: document.getElementById('refEditCopyMode').value,
      tags: document.getElementById('refEditTags').value.trim().split(',').map(t => t.trim()).filter(Boolean),
      threat_intel: threatIntel,
    };
    try {
      const res = await api('PUT', '/api/references/' + id, body);
      if (res.ok) { overlay.remove(); _loadAndRenderReferences(); }
      else { const err = await res.json().catch(() => ({})); alert('Failed: ' + (err.error || 'Unknown')); }
    } catch (e) { alert('Error: ' + e.message); }
  });
}
