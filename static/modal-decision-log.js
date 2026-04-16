/* ── Decision Log Modal, Rendering, Close, Detach ── */
// ── Decision Log Modal ──────────────────────────────────────────────────────
let _decisionLogEntries = [];
let _decisionLogSortNewest = true; // true = newest first (default), false = oldest first
let _decisionLogFilter = 'all'; // 'all' | 'pending' | 'decided' | 'approved_condition' | 'approved_modification' | 'denied'
let _decisionLogSearch = ''; // free-text search
let _decisionLogStaffDuties = []; // cached staff duties for acting check

// Live-refresh the decision log entries if the modal is currently open
async function _refreshDecisionLogIfOpen() {
  const modal = document.getElementById('decisionLogModal');
  if (!modal) return;
  try {
    await _loadDecisionLog();
    const el = document.getElementById('dlEntries');
    if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
    // Also update filter counts in the header
    const filterBar = modal.querySelector('.toggle-btn-group');
    if (filterBar) {
      const counts = {
        all: _decisionLogEntries.length,
        pending: _decisionLogEntries.filter(e => e.status === 'requested').length,
        decided: _decisionLogEntries.filter(e => !e.status || e.status === 'approved').length,
        approved_condition: _decisionLogEntries.filter(e => e.approval_type === 'approved_with_condition').length,
        approved_modification: _decisionLogEntries.filter(e => e.approval_type === 'approved_with_modification').length,
        denied: _decisionLogEntries.filter(e => e.status === 'rejected').length,
      };
      filterBar.querySelectorAll('.toggle-btn').forEach(btn => {
        const arg = btn.dataset?.arg;
        if (arg && counts[arg] !== undefined) {
          const text = btn.textContent.replace(/\(\d+\)/, `(${counts[arg]})`);
          btn.textContent = text;
        }
      });
    }
  } catch {}
}

async function openDecisionLogModal() {
  await _loadDecisionLog();
  const groups = state.groups || [];
  const canWrite = state.user?.role === 'admin' || hasRole2(state.user?.role, 'teamlead') || userHasCapability('decision_log_readwrite');
  const canRequest = !!state.user; // Any authenticated user can request a decision
  const html = `
    <div class="modal-overlay" id="decisionLogModal">
      <div class="modal" style="max-width:700px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>⚖ ${t('decisions_title')||'Decisions'}</h2>
          <button class="btn btn-secondary btn-sm" style="margin-left:auto;margin-right:8px;font-size:11px;padding:2px 8px" data-action="openDetachedDecisionLog" title="${t('detach_window')||'Open in separate window'}">⧉ ${t('btn_detach')||'Detach'}</button>
          <button class="modal-close" data-action="closeDecisionLogModal">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
          ${(canWrite || canRequest) ? `
          <div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
            <input type="text" id="dlTitle" placeholder="${t('decision_title_placeholder')||'Decision title (optional)'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <input type="text" id="dlReason" placeholder="${t('decision_reason_label')||'Reason for decision'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div id="dlNewDecisionWrap">${typeof _diaryRichField === 'function' ? _diaryRichField('dlNewDecision', '', t('decision_log_placeholder')||'Enter decision...', '100px') : `<textarea id="dlNewDecision" rows="3" placeholder="${t('decision_log_placeholder')||'Enter decision...'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical"></textarea>`}</div>
            <div style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">
              <select id="dlLogType" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="general">${t('decision_log_general')||'General (all)'}</option>
                <option value="group">${t('decision_log_group')||'Group/Unit only'}</option>
                <option value="private">${t('decision_log_private')||'Private'}</option>
              </select>
              <select id="dlGroupId" style="display:none;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                ${groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('')}
              </select>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim)">
                <input type="checkbox" id="dlConfidential" style="accent-color:var(--accent)">
                ${t('confidential')||'Confidential'}
              </label>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim)">
                <input type="checkbox" id="dlCoSignRequired" style="accent-color:var(--accent)">
                👁👁 ${t('four_eyes')||'Four eyes'}
              </label>
              <div id="dlCoSignTargetGroup" style="display:none;margin-left:4px">
                <select id="dlCoSignTarget" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:120px">
                  <option value="">${t('cosign_target_anyone')||'Anyone eligible'}</option>
                  ${(state.users||[]).filter(u => u.id !== state.user?.id && hasRole2(u.role, 'teamlead')).map(u =>
                    `<option value="${u.id}">${escHtml(u.display_name||u.username)}</option>`
                  ).join('')}
                </select>
              </div>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">
                📎 <input type="file" id="dlAttachFile" style="max-width:140px;font-size:10px" multiple>
              </label>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim)">
                📅 ${t('decision_deadline')||'Deadline'}:
                <input type="datetime-local" id="dlDeadline" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
              </label>
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('decision_executor')||'Executor'}:</span>
              <select id="dlExecutorType" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="">${t('none')||'None'}</option>
                <option value="role">${t('role')||'Role'}</option>
                <option value="group">${t('group')||'Group'}</option>
                <option value="person">${t('person')||'Person'}</option>
              </select>
              <select id="dlExecutorValue" style="display:none;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:120px">
              </select>
            </div>
            <div style="margin-top:6px">
              <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;display:block;margin-bottom:4px">${t('lb_background_color')||'Background colour'}</label>
              <div id="dlAddSwatches" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                ${['', '#FFF4C2', '#D6F5D6', '#FFD6D6', '#D6E4FF', '#E6D6FF', '#FFE0B3'].map(sw => {
                  const bg = sw || 'transparent';
                  const sel = sw === '' ? 'outline:2px solid var(--accent);' : '';
                  return `<button type="button" class="dl-add-swatch" data-dl-color="${escHtml(sw)}"
                    style="width:20px;height:20px;border:1px solid #888;border-radius:4px;background:${bg};${sel}cursor:pointer" title="${sw||'None'}"></button>`;
                }).join('')}
              </div>
              <input type="hidden" id="dlAddColor" value="">
            </div>
            <div style="margin-top:4px">
              <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;display:block;margin-bottom:4px">🔗 ${t('decision_references')||'References'}</label>
              <div id="dlAddRefs" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px"></div>
              <div style="display:flex;gap:4px;align-items:center">
                <select id="dlAddRefType" class="input" style="font-size:var(--fs-xs);width:auto;padding:3px 6px">
                  <option value="log_book">${t('tab_log_book')||'Log Book'}</option>
                  <option value="diary">${t('diary_title')||'Diary'}</option>
                  <option value="event">${t('event')||'Event'}</option>
                </select>
                <input type="number" id="dlAddRefId" class="input" style="width:60px;font-size:var(--fs-xs);padding:3px 6px" placeholder="ID" min="1">
                <input type="text" id="dlAddRefLabel" class="input" style="flex:1;font-size:var(--fs-xs);padding:3px 6px" placeholder="${t('decision_ref_label')||'Label'}">
                <button type="button" class="btn btn-sm btn-secondary" id="dlAddRefBtn" style="font-size:10px;padding:2px 6px">+</button>
              </div>
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${canWrite ? `
                <button class="btn btn-sm" style="background:#27AE60;color:#fff;padding:3px 10px;font-size:11px" data-action="addDecisionLogEntry" data-approval-type="approved" data-arg-el>✓ ${t('btn_approve')||'Approve'}</button>
                <button class="btn btn-sm" style="background:#2ECC71;color:#fff;padding:3px 10px;font-size:11px" data-action="addDecisionLogEntry" data-approval-type="approved_with_condition" data-arg-el>✓⚠ ${t('btn_approve_condition')||'Approve w/ Condition'}</button>
                <button class="btn btn-sm" style="background:#27AE60;color:#fff;padding:3px 10px;font-size:11px;border:1px dashed #fff" data-action="addDecisionLogEntry" data-approval-type="approved_with_modification" data-arg-el>✓✏ ${t('btn_approve_modification')||'Approve w/ Modification'}</button>
                <button class="btn btn-sm" style="background:#E74C3C;color:#fff;padding:3px 10px;font-size:11px" data-action="addDecisionLogEntry" data-approval-type="denied" data-arg-el>✗ ${t('btn_deny')||'Deny'}</button>
              ` : ''}
              <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 10px" data-action="requestDecision">${t('btn_request_decision')||'Request Decision'}</button>
            </div>
            <div id="dlRequestTarget" style="display:none;margin-top:8px;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius)">
              <div style="font-size:var(--fs-xs);font-weight:600;margin-bottom:4px">${t('request_decision_to')||'Request decision from'}:</div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <select id="dlTargetType" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                  <option value="">${t('anyone')||'Anyone'}</option>
                  <option value="role">${t('role')||'Role'}</option>
                  <option value="group">${t('group')||'Group'}</option>
                  <option value="person">${t('person')||'Person'}</option>
                </select>
                <select id="dlTargetValue" style="display:none;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:120px">
                </select>
              </div>
            </div>
          </div>` : ''}
          <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
            <input id="dlSearchInput" class="input" style="flex:1;min-width:150px;font-size:var(--fs-xs)" placeholder="🔍 ${t('dl_search_placeholder')||'Search decisions…'}">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:8px 0;border-bottom:2px solid var(--accent);flex-wrap:wrap;gap:6px">
            <h3 style="margin:0;font-size:var(--fs-sm);text-transform:uppercase;letter-spacing:.05em;color:var(--accent)">📋 ${t('decision_log_header')||'Decision Log'}</h3>
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <div class="toggle-btn-group" style="font-size:10px;flex-wrap:wrap">
                <button class="toggle-btn${_decisionLogFilter==='all'?' active':''}" data-action="_setDecisionFilter" data-arg="all" style="padding:2px 8px;font-size:10px">${t('filter_all')||'All'} (${_decisionLogEntries.length})</button>
                <button class="toggle-btn${_decisionLogFilter==='pending'?' active':''}" data-action="_setDecisionFilter" data-arg="pending" style="padding:2px 8px;font-size:10px">⏳ ${t('decision_filter_pending')||'Pending'} (${_decisionLogEntries.filter(e=>e.status==='requested').length})</button>
                <button class="toggle-btn${_decisionLogFilter==='decided'?' active':''}" data-action="_setDecisionFilter" data-arg="decided" style="padding:2px 8px;font-size:10px">✓ ${t('decision_filter_decided')||'Approved'} (${_decisionLogEntries.filter(e=>!e.status||e.status==='approved').length})</button>
                <button class="toggle-btn${_decisionLogFilter==='approved_condition'?' active':''}" data-action="_setDecisionFilter" data-arg="approved_condition" style="padding:2px 8px;font-size:10px">✓⚠ ${t('decision_filter_approved_condition')||'With Condition'} (${_decisionLogEntries.filter(e=>e.approval_type==='approved_with_condition').length})</button>
                <button class="toggle-btn${_decisionLogFilter==='approved_modification'?' active':''}" data-action="_setDecisionFilter" data-arg="approved_modification" style="padding:2px 8px;font-size:10px">✓✏ ${t('decision_filter_approved_modification')||'With Modification'} (${_decisionLogEntries.filter(e=>e.approval_type==='approved_with_modification').length})</button>
                <button class="toggle-btn${_decisionLogFilter==='denied'?' active':''}" data-action="_setDecisionFilter" data-arg="denied" style="padding:2px 8px;font-size:10px">✗ ${t('decision_filter_denied')||'Denied'} (${_decisionLogEntries.filter(e=>e.status==='rejected').length})</button>
              </div>
              <span style="border-left:1px solid var(--border);height:16px;margin:0 2px"></span>
              <span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('decision_sort')||'Sort'}:</span>
              <button class="btn btn-sm" id="dlSortToggle" style="font-size:10px;padding:2px 8px" data-action="_toggleDecisionSort">↓ ${t('decision_sort_newest')||'Newest first'}</button>
            </div>
          </div>
          <div id="dlEntries" style="font-size:var(--fs-sm)">
            ${_renderDecisionLogEntries()}
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('decisionLogModal');
  // Force reflow then add 'open' class for CSS transition
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);
  const logTypeEl = document.getElementById('dlLogType');
  const groupIdEl = document.getElementById('dlGroupId');
  if (logTypeEl && groupIdEl) {
    logTypeEl.onchange = () => { groupIdEl.style.display = logTypeEl.value === 'group' ? '' : 'none'; };
  }
  // Show/hide cosign target selector
  const coSignCb = document.getElementById('dlCoSignRequired');
  const coSignTarget = document.getElementById('dlCoSignTargetGroup');
  if (coSignCb && coSignTarget) {
    coSignCb.onchange = () => { coSignTarget.style.display = coSignCb.checked ? '' : 'none'; };
  }
  // Request Decision target selector logic
  const targetTypeEl = document.getElementById('dlTargetType');
  const targetValueEl = document.getElementById('dlTargetValue');
  if (targetTypeEl && targetValueEl) {
    targetTypeEl.onchange = () => {
      const tt = targetTypeEl.value;
      if (!tt) { targetValueEl.style.display = 'none'; return; }
      targetValueEl.style.display = '';
      let opts = '';
      if (tt === 'role') {
        const roles = ['admin','oplead','deputy_oplead','staffofficer','staff_assistant','staffofficer_full','teamlead','deputy_teamlead','teammember','readwrite','reporter','read','observer'];
        opts = roles.map(r => `<option value="${r}">${r}</option>`).join('');
      } else if (tt === 'group') {
        opts = (state.groups || []).map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
      } else if (tt === 'person') {
        opts = (state.users || []).map(u => `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');
      }
      targetValueEl.innerHTML = opts;
    };
  }
  // Executor selector
  const execTypeEl = document.getElementById('dlExecutorType');
  const execValueEl = document.getElementById('dlExecutorValue');
  if (execTypeEl && execValueEl) {
    execTypeEl.onchange = () => {
      const tt = execTypeEl.value;
      if (!tt) { execValueEl.style.display = 'none'; return; }
      execValueEl.style.display = '';
      let opts = '';
      if (tt === 'role') {
        const roles = ['admin','oplead','deputy_oplead','staffofficer','staff_assistant','staffofficer_full','teamlead','deputy_teamlead','teammember','readwrite','reporter','read','observer'];
        opts = roles.map(r => `<option value="${r}">${r}</option>`).join('');
      } else if (tt === 'group') {
        opts = (state.groups || []).map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
      } else if (tt === 'person') {
        opts = (state.users || []).map(u => `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');
      }
      execValueEl.innerHTML = opts;
    };
  }
  // Wire the rich text toolbar for the decision body (if diary helper loaded)
  if (typeof _diaryBindToolbar === 'function') {
    _diaryBindToolbar(modal, 'dlNewDecision');
  }
  // Wire color swatch clicks in the add form
  modal.querySelectorAll('.dl-add-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.dlColor || '';
      const hidden = document.getElementById('dlAddColor');
      if (hidden) hidden.value = val;
      modal.querySelectorAll('.dl-add-swatch').forEach(b => { b.style.outline = ''; });
      btn.style.outline = '2px solid var(--accent)';
    });
  });
  // Wire reference add button in the add form
  document.getElementById('dlAddRefBtn')?.addEventListener('click', () => {
    const refType = document.getElementById('dlAddRefType')?.value;
    const refId = document.getElementById('dlAddRefId')?.value;
    const refLabel = document.getElementById('dlAddRefLabel')?.value || '';
    if (!refType || !refId) return;
    const tag = document.createElement('span');
    tag.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);font-size:10px';
    tag.dataset.refType = refType;
    tag.dataset.refId = refId;
    tag.dataset.refLabel = refLabel || `${refType} #${refId}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'border:none;background:none;cursor:pointer;font-size:10px;color:var(--danger)';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => tag.remove());
    tag.textContent = `🔗 ${refLabel || refType + ' #' + refId} `;
    tag.appendChild(removeBtn);
    document.getElementById('dlAddRefs')?.appendChild(tag);
    document.getElementById('dlAddRefId').value = '';
    document.getElementById('dlAddRefLabel').value = '';
  });
  // Wire free-text search
  const searchEl = document.getElementById('dlSearchInput');
  if (searchEl) {
    searchEl.value = _decisionLogSearch;
    searchEl.addEventListener('input', () => {
      _decisionLogSearch = searchEl.value.trim();
      const el = document.getElementById('dlEntries');
      if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
    });
  }
}

function closeDecisionLogModal() {
  const el = document.getElementById('decisionLogModal');
  if (el) el.remove();
}

async function _loadDecisionLog() {
  try { _decisionLogEntries = await apiGet('/api/decision-log') || []; } catch { _decisionLogEntries = []; }
  try { _decisionLogStaffDuties = await apiGet('/api/staff/duties') || []; } catch { _decisionLogStaffDuties = []; }
}

function _canReviewDecisions() {
  const role = state.user?.role;
  if (role === 'admin' || role === 'oplead' || role === 'deputy_oplead') return true;
  // Check if user is acting as OpLead via staff duties
  const uid = state.user?.id;
  return _decisionLogStaffDuties.some(d =>
    d.user_id === uid && (d.role === 'acting_oplead' || d.role === 'acting_deputy_oplead')
  );
}

function _setDecisionFilter(filter) {
  _decisionLogFilter = filter;
  // Re-render the whole modal body to update filter tabs and entries
  closeDecisionLogModal();
  openDecisionLogModal();
}

function _toggleDecisionSort() {
  _decisionLogSortNewest = !_decisionLogSortNewest;
  const btn = document.getElementById('dlSortToggle');
  if (btn) {
    btn.textContent = _decisionLogSortNewest
      ? ('↓ ' + (t('decision_sort_newest') || 'Newest first'))
      : ('↑ ' + (t('decision_sort_oldest') || 'Oldest first'));
  }
  const el = document.getElementById('dlEntries');
  if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
}

async function _shareDecisionLogEntry(id) {
  try {
    const internalUrl = window.location.origin + '/#open-decision=' + id;
    await navigator.clipboard.writeText(internalUrl).catch(() => {});
    showNotification('success', t('link_copied') || 'Link copied to clipboard');
  } catch (e) { showError(e.message); }
}

function _renderDecisionLogEntries() {
  if (!_decisionLogEntries.length) return `<p style="color:var(--text-dim)">${t('decision_log_empty')||'No decisions recorded yet.'}</p>`;
  const canReview = _canReviewDecisions();
  let filtered = _decisionLogEntries.slice();
  if (_decisionLogFilter === 'pending') filtered = filtered.filter(e => e.status === 'requested');
  else if (_decisionLogFilter === 'decided') filtered = filtered.filter(e => !e.status || e.status === 'approved');
  else if (_decisionLogFilter === 'approved_condition') filtered = filtered.filter(e => e.approval_type === 'approved_with_condition');
  else if (_decisionLogFilter === 'approved_modification') filtered = filtered.filter(e => e.approval_type === 'approved_with_modification');
  else if (_decisionLogFilter === 'denied') filtered = filtered.filter(e => e.status === 'rejected');
  // Free-text search
  if (_decisionLogSearch) {
    const q = _decisionLogSearch.toLowerCase();
    filtered = filtered.filter(e => {
      const hay = `${e.sequence_number||''} ${e.title||''} ${e.decision||''} ${e.display_name||''} ${e.reason||''} ${e.review_comment||''} ${e.executor_label||''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (!filtered.length) return `<p style="color:var(--text-dim)">${t('decision_filter_empty')||'No decisions match this filter.'}</p>`;
  const sorted = _decisionLogSortNewest ? filtered.reverse() : filtered;
  const todayStr = new Date().toISOString().slice(0, 10);
  return sorted.map(e => {
    const ts = fmtDateTime(new Date(e.timestamp));
    const badge = e.confidential ? `<span style="color:var(--danger);font-size:var(--fs-xs);font-weight:700"> 🔒 ${t('confidential')||'CONFIDENTIAL'}</span>` : '';
    const typeBadge = e.log_type === 'private' ? ' 🔵' : e.log_type === 'group' ? ' 🟢' : '';
    const isAdmin = hasRole2(state.user?.role, 'admin') || userHasCapability('decision_log_readwrite');
    // Status badge for decision requests
    let statusBadge = '';
    let reviewSection = '';
    if (e.status === 'requested') {
      const targetInfo = e.requested_of_label ? ` → ${escHtml(e.requested_of_label)}` : '';
      statusBadge = `<span style="background:#E67E22;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px">PENDING${targetInfo}</span>`;
      if (canReview) {
        reviewSection = `<div style="margin-top:6px">
          <input type="text" id="dlReviewComment_${e.id}" placeholder="${t('review_comment')||'Comment / condition / modification...'}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:6px">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:#27AE60;color:#fff;padding:2px 8px;font-size:10px" data-action="reviewDecision" data-arg="${e.id}" data-status="approved" data-approval-type="approved" data-arg-el>✓ ${t('btn_approve')||'Approve'}</button>
            <button class="btn btn-sm" style="background:#2ECC71;color:#fff;padding:2px 8px;font-size:10px" data-action="reviewDecision" data-arg="${e.id}" data-status="approved" data-approval-type="approved_with_condition" data-arg-el>✓⚠ ${t('btn_approve_condition')||'Approve w/ Condition'}</button>
            <button class="btn btn-sm" style="background:#27AE60;color:#fff;padding:2px 8px;font-size:10px;border:1px dashed #fff" data-action="reviewDecision" data-arg="${e.id}" data-status="approved" data-approval-type="approved_with_modification" data-arg-el>✓✏ ${t('btn_approve_modification')||'Approve w/ Modification'}</button>
            <button class="btn btn-sm" style="background:#E74C3C;color:#fff;padding:2px 8px;font-size:10px" data-action="reviewDecision" data-arg="${e.id}" data-status="denied" data-arg-el>✗ ${t('btn_deny')||'Deny'}</button>
          </div>
        </div>`;
      }
    } else if (e.status === 'approved') {
      const approvalLabels = {
        approved: t('decision_approved_label')||'APPROVED',
        approved_with_condition: t('decision_approved_condition_label')||'APPROVED W/ CONDITION',
        approved_with_modification: t('decision_approved_modification_label')||'APPROVED W/ MODIFICATION',
      };
      const approvalLabel = approvalLabels[e.approval_type] || approvalLabels.approved;
      const approvalBg = e.approval_type === 'approved_with_condition' ? '#2ECC71' : e.approval_type === 'approved_with_modification' ? '#27AE60' : '#27AE60';
      statusBadge = `<span style="background:${approvalBg};color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px">${approvalLabel}</span>`;
      if (e.reviewed_by_name) reviewSection = `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">✓ ${escHtml(e.reviewed_by_name)}${e.reviewed_at ? ' — ' + fmtDateTime(new Date(e.reviewed_at)) : ''}${e.review_comment ? ': ' + escHtml(e.review_comment) : ''}</div>`;
      // Approved-with-condition: allow follow-up approve or deny.
      if (e.approval_type === 'approved_with_condition' && canReview) {
        reviewSection += `<div style="margin-top:6px">
          <input type="text" id="dlReviewComment_${e.id}" placeholder="${t('review_followup_comment')||'Follow-up comment...'}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:6px">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:#27AE60;color:#fff;padding:2px 8px;font-size:10px" data-action="reviewDecision" data-arg="${e.id}" data-status="approved" data-approval-type="approved" data-arg-el>✓ ${t('btn_final_approve')||'Final Approve'}</button>
            <button class="btn btn-sm" style="background:#E74C3C;color:#fff;padding:2px 8px;font-size:10px" data-action="reviewDecision" data-arg="${e.id}" data-status="denied" data-arg-el>✗ ${t('btn_deny')||'Deny'}</button>
          </div>
        </div>`;
      }
    } else if (e.status === 'rejected') {
      statusBadge = `<span style="background:#E74C3C;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px">DENIED</span>`;
      if (e.reviewed_by_name) reviewSection = `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">✗ Denied by ${escHtml(e.reviewed_by_name)}${e.reviewed_at ? ' — ' + fmtDateTime(new Date(e.reviewed_at)) : ''}${e.review_comment ? ': ' + escHtml(e.review_comment) : ''}</div>`;
    }
    // Reason / background
    const reasonHtml = e.reason ? `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim);font-style:italic;border-left:3px solid var(--accent);padding-left:8px">${escHtml(e.reason)}</div>` : '';
    // Four-eyes co-sign
    let coSignHtml = '';
    if (e.co_sign_required) {
      if (e.co_signed_by_name) {
        coSignHtml = `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">👁👁 Co-signed by ${escHtml(e.co_signed_by_name)}${e.co_signed_at ? ' — ' + fmtDateTime(new Date(e.co_signed_at)) : ''}${e.co_sign_comment ? ': ' + escHtml(e.co_sign_comment) : ''}</div>`;
      } else {
        coSignHtml = `<div style="margin-top:4px;font-size:var(--fs-xs);color:#E67E22">👁👁 Co-sign required (pending)</div>`;
        if ((canReview || hasRole2(state.user?.role, 'teamlead')) && e.user_id !== state.user?.id) {
          coSignHtml += `<div style="margin-top:4px;display:flex;gap:6px;align-items:center">
            <input type="text" id="dlCoSignComment_${e.id}" placeholder="Co-sign comment"
              style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
            <button class="btn btn-sm" style="background:var(--accent);color:#fff;padding:2px 8px;font-size:11px" data-action="coSignDecision" data-arg="${e.id}">👁👁 Co-sign</button>
          </div>`;
        }
      }
    }
    // Deadline display
    let deadlineHtml = '';
    if (e.deadline) {
      const isOverdue = e.deadline < todayStr && (e.status === 'requested');
      const isDueSoon = !isOverdue && e.deadline <= new Date(Date.now() + 2*86400000).toISOString().slice(0,10) && (e.status === 'requested');
      const deadlineColor = isOverdue ? 'var(--danger,#E74C3C)' : isDueSoon ? '#E67E22' : 'var(--text-dim)';
      const deadlineIcon = isOverdue ? '🔴' : isDueSoon ? '🟠' : '📅';
      deadlineHtml = `<span style="font-size:var(--fs-xs);color:${deadlineColor};margin-left:6px;font-weight:${isOverdue?'700':'400'}">${deadlineIcon} ${t('decision_deadline')||'Deadline'}: ${e.deadline}${isOverdue ? ' (' + (t('decision_overdue')||'OVERDUE') + ')' : ''}</span>`;
    }
    // Lifecycle tracking for pending decisions
    let lifecycleHtml = '';
    if (e.status === 'requested') {
      const requestedDate = e.requested_at ? fmtDateTime(new Date(e.requested_at)) : '';
      const elapsed = e.requested_at ? Math.floor((Date.now() - new Date(e.requested_at).getTime()) / 3600000) : 0;
      const elapsedLabel = elapsed >= 24 ? Math.floor(elapsed/24) + 'd ' + (elapsed%24) + 'h' : elapsed + 'h';
      lifecycleHtml = `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim);display:flex;gap:12px;flex-wrap:wrap">
        <span>📥 ${t('decision_requested_at')||'Requested'}: ${requestedDate}</span>
        <span>⏱ ${t('decision_elapsed')||'Elapsed'}: ${elapsedLabel}</span>
        ${e.requested_of_label ? '<span>👤 ' + (t('decision_requested_of')||'Requested of') + ': ' + escHtml(e.requested_of_label) + '</span>' : ''}
      </div>`;
    }
    const titleHtml = e.title ? `<div style="font-weight:700;font-size:var(--fs-sm);margin-top:2px">${escHtml(e.title)}</div>` : '';
    const execHtml = e.executor_label ? `<span style="font-size:var(--fs-xs);color:var(--accent);margin-left:6px">⚡ ${t('decision_executor')||'Executor'}: ${escHtml(e.executor_label)}</span>` : '';
    // Background color: custom > deadline-based auto-color
    // Status values: '' = direct decision (decided immediately),
    // 'requested' = pending, 'approved' = reviewed+approved, 'rejected' = denied.
    // Direct decisions (status='') are implicitly approved.
    const isApproved = e.status === 'approved' || (!e.status && e.decided_at);
    const isCondition = e.approval_type === 'approved_with_condition';
    let bgStyle = '';
    if (e.color) {
      bgStyle = `background:${escHtml(e.color)};color:#222;`;
    } else if (e.deadline && e.status === 'requested') {
      bgStyle = 'background:#FFF4C2;color:#222;'; // yellow: pending with deadline
    } else if (isApproved && isCondition) {
      bgStyle = 'background:#FFF4C2;color:#222;'; // yellow: conditional approval
    } else if (e.deadline && isApproved && !isCondition) {
      const dlDate = new Date(e.deadline);
      const decidedAt = e.decided_at ? new Date(e.decided_at) : null;
      if (decidedAt && decidedAt <= dlDate) bgStyle = 'background:#D6F5D6;color:#222;'; // green: approved before deadline
      else if (decidedAt) bgStyle = 'background:#FFD6D6;color:#222;'; // red: approved after deadline
    } else if (e.deadline && e.status === 'rejected') {
      bgStyle = 'background:#FFD6D6;color:#222;'; // red: denied
    }
    const borderStyle = e.deadline && e.deadline.slice(0,10) < todayStr && e.status === 'requested' ? 'border-left:3px solid var(--danger,#E74C3C);' : '';
    return `<div data-decision-id="${e.id}" style="padding:8px;margin-bottom:4px;border:1px solid var(--border);border-radius:var(--radius);${bgStyle}${borderStyle}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${escHtml(e.sequence_number||'')}</span>
          <span style="font-weight:600;margin-left:4px">${escHtml(e.display_name || e.user_name)}</span>
          <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:6px">${ts}${typeBadge}${badge}</span>
          ${statusBadge}${deadlineHtml}${execHtml}
        </div>
        <div style="display:flex;gap:2px">
          ${e.user_id === state.user?.id || isAdmin ? `<button class="btn btn-sm" style="padding:1px 6px;font-size:10px" data-action="_decisionOpenEditor" data-arg="${e.id}" title="${t('btn_edit')||'Edit'}">✏</button>` : ''}
          <button class="btn btn-sm" style="padding:1px 6px;font-size:10px" data-action="_decisionPrintEntry" data-arg="${e.id}" title="${t('btn_print')||'Print'}">🖨</button>
          ${canReview ? `<button class="btn btn-sm" style="padding:1px 6px;font-size:10px" data-action="_shareDecisionLogEntry" data-arg="${e.id}" title="${t('board_share')||'Share link'}">🔗</button>` : ''}
          ${isAdmin ? `<button class="btn btn-sm" style="padding:1px 6px;font-size:10px;color:var(--danger,#e74c3c)" data-action="deleteDecisionLogEntry" data-arg="${e.id}" title="${t('btn_delete')||'Delete'}">🗑</button>` : ''}
        </div>
      </div>
      ${titleHtml}
      <div style="margin-top:4px;line-height:1.5">${e.decision}</div>
      ${reasonHtml}
      ${(e.references && e.references.length) ? `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">🔗 ${e.references.map(r =>
        `<button type="button" class="btn btn-sm" style="padding:0 4px;font-size:10px;color:var(--accent);text-decoration:none" data-action="_openDecisionRef" data-args='["${escHtml(r.type)}",${r.id}]'>${escHtml(r.label || r.type + ' #' + r.id)}</button>`
      ).join(', ')}</div>` : ''}
      ${(e.revisions && e.revisions.length) ? `<details style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)"><summary style="cursor:pointer">📝 ${e.revisions.length} ${t('decision_revision_count')||'revision(s)'}</summary>${e.revisions.map(rv =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);margin-left:8px"><strong>${escHtml(rv.user_name||'')}</strong> — ${fmtDateTime(new Date(rv.timestamp))}${rv.prev_title ? '<br>Title: <del>' + escHtml(rv.prev_title) + '</del>' : ''}${rv.prev_decision ? '<br>Body changed' : ''}${rv.prev_log_type ? '<br>Visibility: <del>' + escHtml(rv.prev_log_type) + '</del>' : ''}${rv.prev_color ? '<br>Color changed' : ''}${rv.prev_deadline ? '<br>Deadline: <del>' + escHtml(rv.prev_deadline) + '</del>' : ''}</div>`
      ).join('')}</details>` : ''}
      ${lifecycleHtml}
      ${(e.attachments && e.attachments.length) ? `<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${e.attachments.map(a =>
        `<a href="/api/decision-log/${e.id}/attachment/${encodeURIComponent(a.stored_name)}" target="_blank" style="font-size:var(--fs-xs);color:var(--accent);text-decoration:none" title="${escHtml(a.filename)}">📎 ${escHtml(a.filename)}</a>`
      ).join('')}</div>` : ''}
      ${coSignHtml}
      ${reviewSection}
    </div>`;
  }).join('');
}

async function addDecisionLogEntry(el) {
  const approvalType = el?.dataset?.approvalType || 'approved';
  const isDeny = approvalType === 'denied';
  const decEl = document.getElementById('dlNewDecision');
  const text = decEl ? (decEl.tagName === 'TEXTAREA' ? decEl.value.trim() : (decEl.innerHTML || '').trim()) : '';
  if (!text) { showError(t('decision_required')||'Decision text is required'); return; }
  const reason = document.getElementById('dlReason')?.value?.trim() || '';
  // Deny requires a reason
  if (isDeny && !reason) {
    showError(t('deny_reason_required')||'A reason is required when denying a decision');
    document.getElementById('dlReason')?.focus();
    return;
  }
  // Condition/modification requires a reason describing it
  if ((approvalType === 'approved_with_condition' || approvalType === 'approved_with_modification') && !reason) {
    showError(t('decision_condition_comment_required')||'Please describe the condition or modification');
    document.getElementById('dlReason')?.focus();
    return;
  }
  const logType = document.getElementById('dlLogType')?.value || 'general';
  const groupId = logType === 'group' ? parseInt(document.getElementById('dlGroupId')?.value || '0') : 0;
  const confidential = document.getElementById('dlConfidential')?.checked || false;
  const title = document.getElementById('dlTitle')?.value?.trim() || '';
  const executorType = document.getElementById('dlExecutorType')?.value || '';
  const executorValueEl = document.getElementById('dlExecutorValue');
  const executorValue = executorType ? (executorValueEl?.value || '') : '';
  const executorLabel = executorType ? (executorValueEl?.selectedOptions?.[0]?.textContent || executorValue) : '';
  const coSignRequired = document.getElementById('dlCoSignRequired')?.checked || false;
  const coSignTargetId = coSignRequired ? (document.getElementById('dlCoSignTarget')?.value || '') : '';
  const coSignTargetUser = coSignTargetId ? (state.users||[]).find(u => u.id === parseInt(coSignTargetId, 10)) : null;
  const coSignTargetName = coSignTargetUser ? (coSignTargetUser.display_name || coSignTargetUser.username) : '';
  const deadline = document.getElementById('dlDeadline')?.value || '';
  const color = document.getElementById('dlAddColor')?.value || '';
  // Collect references from add form
  const addRefEls = document.querySelectorAll('#dlAddRefs span[data-ref-type]');
  const references = [];
  addRefEls.forEach(el => {
    references.push({ type: el.dataset.refType, id: parseInt(el.dataset.refId, 10), label: el.dataset.refLabel || '' });
  });
  const res = await apiPost('/api/decision-log', {title, decision: text, log_type: logType, group_id: groupId, confidential,
    status: isDeny ? 'rejected' : '',
    approval_type: isDeny ? '' : approvalType,
    executor_type: executorType, executor_value: executorValue, executor_label: executorLabel,
    reason, co_sign_required: coSignRequired, deadline, color, references,
    co_sign_target_id: coSignTargetId ? parseInt(coSignTargetId, 10) : null,
    co_sign_target_name: coSignTargetName});
  if (res.ok) {
    const created = await res.json().catch(() => null);
    // Upload attachments if any
    const fileInput = document.getElementById('dlAttachFile');
    if (created && fileInput?.files?.length) {
      for (const f of fileInput.files) {
        const fd = new FormData();
        fd.append('file', f);
        await api('POST', `/api/decision-log/${created.id}/attachment`, fd);
      }
      fileInput.value = '';
    }
    await _loadDecisionLog();
    const el = document.getElementById('dlEntries');
    if (el) el.innerHTML = _renderDecisionLogEntries();
    _bindActions(el);
    const inp = document.getElementById('dlNewDecision');
    if (inp) inp.value = '';
    showNotification('success', isDeny ? (t('decision_denied')||'Decision denied') : (t('decision_added')||'Decision recorded'));
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to add decision');
  }
}

async function deleteDecisionLogEntry(id) {
  if (!confirm(t('decision_delete_confirm')||'Delete this decision log entry?')) return;
  const res = await api('DELETE', `/api/decision-log/${id}`);
  if (res.ok) {
    await _loadDecisionLog();
    const el = document.getElementById('dlEntries');
    if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
  }
}

async function requestDecision() {
  // Show target selector panel if hidden
  const targetPanel = document.getElementById('dlRequestTarget');
  if (targetPanel && targetPanel.style.display === 'none') {
    targetPanel.style.display = '';
    return;
  }
  const decEl2 = document.getElementById('dlNewDecision');
  const text = decEl2 ? (decEl2.tagName === 'TEXTAREA' ? decEl2.value.trim() : (decEl2.innerHTML || '').trim()) : '';
  if (!text) { showError(t('decision_required')||'Decision request text is required'); return; }
  const logType = document.getElementById('dlLogType')?.value || 'general';
  const groupId = logType === 'group' ? parseInt(document.getElementById('dlGroupId')?.value || '0') : 0;
  const confidential = document.getElementById('dlConfidential')?.checked || false;
  // Target info
  const targetType = document.getElementById('dlTargetType')?.value || '';
  const targetValueEl = document.getElementById('dlTargetValue');
  const targetValue = targetType ? (targetValueEl?.value || '') : '';
  const targetLabel = targetType ? (targetValueEl?.selectedOptions?.[0]?.textContent || targetValue) : '';
  const title = document.getElementById('dlTitle')?.value?.trim() || '';
  const reason = document.getElementById('dlReason')?.value?.trim() || '';
  const deadline = document.getElementById('dlDeadline')?.value || '';
  const res = await apiPost('/api/decision-log/request', {
    title, decision: text, log_type: logType, group_id: groupId, confidential, reason,
    requested_of_type: targetType, requested_of_value: targetValue, requested_of_label: targetLabel,
    deadline
  });
  if (res.ok) {
    const created = await res.json().catch(() => null);
    // Upload attachments if any
    const fileInput = document.getElementById('dlAttachFile');
    if (created && fileInput?.files?.length) {
      for (const f of fileInput.files) {
        const fd = new FormData();
        fd.append('file', f);
        await api('POST', `/api/decision-log/${created.id}/attachment`, fd);
      }
      fileInput.value = '';
    }
    await _loadDecisionLog();
    const el = document.getElementById('dlEntries');
    if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
    const inp = document.getElementById('dlNewDecision');
    if (inp) inp.value = '';
    if (targetPanel) targetPanel.style.display = 'none';
    showNotification('success', t('decision_requested')||'Decision requested');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to request decision');
  }
}

async function reviewDecision(el) {
  const id = parseInt(el?.dataset?.arg, 10);
  const status = el?.dataset?.status || 'approved';
  const approvalType = el?.dataset?.approvalType || 'approved';
  const comment = document.getElementById('dlReviewComment_' + id)?.value?.trim() || '';
  // Deny requires a reason
  if (status === 'denied' && !comment) {
    showError(t('deny_reason_required')||'A reason is required when denying a decision');
    document.getElementById('dlReviewComment_' + id)?.focus();
    return;
  }
  // Conditional/modification approvals should have a comment explaining the condition/modification
  if ((approvalType === 'approved_with_condition' || approvalType === 'approved_with_modification') && !comment) {
    showError(t('decision_condition_comment_required')||'Please describe the condition or modification');
    document.getElementById('dlReviewComment_' + id)?.focus();
    return;
  }
  const res = await api('PUT', `/api/decision-log/${id}/review`, {status, comment, approval_type: approvalType});
  if (res.ok) {
    await _loadDecisionLog();
    const el2 = document.getElementById('dlEntries');
    if (el2) { el2.innerHTML = _renderDecisionLogEntries(); _bindActions(el2); }
    showNotification('success', status === 'approved' ? (t('decision_approved')||'Decision approved') : (t('decision_denied')||'Decision denied'));
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to review decision');
  }
}

async function coSignDecision(id) {
  if (typeof id !== 'number') id = parseInt(id, 10);
  const comment = document.getElementById('dlCoSignComment_' + id)?.value?.trim() || '';
  const res = await api('PUT', `/api/decision-log/${id}/cosign`, {comment});
  if (res.ok) {
    await _loadDecisionLog();
    const el = document.getElementById('dlEntries');
    if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
    showNotification('success', t('decision_co_signed')||'Decision co-signed');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to co-sign decision');
  }
}

// ── Handle Decision Share/Internal Link on Page Load ──
function _handleDecisionShareLinks() {
  const hash = window.location.hash;
  if (hash.startsWith('#decision-share=')) {
    const token = hash.substring('#decision-share='.length);
    window.location.hash = '';
    fetch('/api/decision-log/shared?token=' + token, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).then(res => {
      if (!res.ok) throw new Error('Access denied or invalid link');
      return res.json();
    }).then(entry => {
      openDecisionLogModal();
    }).catch(e => {
      if (typeof showError === 'function') showError(e.message);
      else alert(e.message);
    });
  } else if (hash.startsWith('#open-decision=')) {
    // Internal cross-reference: #open-decision=<id>
    const id = parseInt(hash.substring('#open-decision='.length), 10);
    window.location.hash = '';
    if (id && typeof openDecisionLogModal === 'function') {
      openDecisionLogModal();
      // After modal opens and entries load, scroll to the entry
      setTimeout(() => {
        const entry = document.querySelector(`[data-decision-id="${id}"]`);
        if (entry) {
          entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
          entry.style.outline = '2px solid var(--accent)';
          entry.style.outlineOffset = '2px';
          setTimeout(() => { entry.style.outline = ''; entry.style.outlineOffset = ''; }, 3000);
        }
      }, 800);
    }
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(_handleDecisionShareLinks, 1000));
} else {
  setTimeout(_handleDecisionShareLinks, 1000);
}
// Listen for hash changes to handle cross-reference links in-app
window.addEventListener('hashchange', _handleDecisionShareLinks);

// ── Decision Log Window (detached) ───────────────────────────────────────────
function openDetachedDecisionLog() {
  const w = Math.min(window.screen.availWidth, 800);
  const h = Math.min(window.screen.availHeight - 100, 600);
  window.open('/static/decision-log-popup.html', 'tidslinjal-decisionlog-' + Date.now(),
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  closeDecisionLogModal();
}

// ── Print helpers ──────────────────────────────────────────────────────────
// Turn a single decision log entry into a standalone HTML block suitable
// for the print popup.
function _decisionEntryToHTML(e) {
  const ts = e.timestamp ? new Date(e.timestamp).toLocaleString() : '';
  const seq = e.sequence_number ? `<span style="font-family:monospace;color:#666">${escHtml(e.sequence_number)}</span> · ` : '';
  const vt = e.log_type || 'general';
  const visLabel = vt === 'private' ? 'Private' : vt === 'group' ? 'Group' : 'General';
  const statusBits = [];
  if (e.status === 'requested') statusBits.push('⏳ Pending');
  else if (e.status === 'approved') statusBits.push(e.approval_type === 'approved_with_condition' ? '✓⚠ Approved with condition' : e.approval_type === 'approved_with_modification' ? '✓✏ Approved with modification' : '✓ Approved');
  else if (e.status === 'rejected') statusBits.push('✗ Denied');
  const statusHtml = statusBits.length ? ` — <strong>${escHtml(statusBits.join(' '))}</strong>` : '';
  const body = escHtml(e.decision || '').replace(/\n/g, '<br>');
  const reason = e.reason ? `<p style="margin:6px 0 0 0"><em>${t('decision_reason')||'Reason'}:</em> ${escHtml(e.reason).replace(/\n/g,'<br>')}</p>` : '';
  const exec = e.executor_label ? `<p style="margin:6px 0 0 0;color:#666"><em>${t('decision_executor')||'Executor'}:</em> ${escHtml(e.executor_label)}</p>` : '';
  const deadline = e.deadline ? `<p style="margin:6px 0 0 0;color:#666"><em>${t('decision_deadline')||'Deadline'}:</em> ${escHtml(e.deadline)}</p>` : '';
  return `
    <section style="page-break-inside:avoid;margin-bottom:18px">
      <h2 style="margin:0 0 4px 0">${escHtml(e.title || 'Decision')}</h2>
      <p style="color:#666;margin:0 0 8px 0">${seq}${escHtml(e.display_name||e.user_name||'')} — ${ts} — ${escHtml(visLabel)}${statusHtml}</p>
      <div style="line-height:1.6">${body}</div>
      ${reason}${exec}${deadline}
    </section>`;
}

function _decisionPrintHTML(bodyHtml, title) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>body{font-family:Calibri,Arial,sans-serif;max-width:800px;margin:20px auto;padding:0 20px;color:#222}
    h1{color:#333;border-bottom:2px solid #333;padding-bottom:4px}
    h2{color:#333;margin-top:0}
    a{color:#2563eb}
    hr{border:0;border-top:1px solid #ccc;margin:18px 0}
    @media print{body{margin:0;padding:10px}}</style>
    </head><body>${bodyHtml}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// Print every decision currently loaded, honouring the decision log
// filter if the modal is open. Used by the print-tool "Decisions log"
// option.
async function _decisionPrintAll() {
  if (!_decisionLogEntries || _decisionLogEntries.length === 0) {
    try { _decisionLogEntries = await apiGet('/api/decision-log') || []; } catch {}
  }
  let entries = (_decisionLogEntries || []).slice();
  if (typeof _decisionLogFilter !== 'undefined' && _decisionLogFilter && _decisionLogFilter !== 'all') {
    entries = entries.filter(e => {
      switch (_decisionLogFilter) {
        case 'pending':                return e.status === 'requested';
        case 'decided':                return !e.status || e.status === 'approved';
        case 'approved_condition':     return e.approval_type === 'approved_with_condition';
        case 'approved_modification':  return e.approval_type === 'approved_with_modification';
        case 'denied':                 return e.status === 'rejected';
        default: return true;
      }
    });
  }
  if (entries.length === 0) {
    showError(t('decision_log_empty')||'No decisions to print.');
    return;
  }
  entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const exName = (state.exercise && state.exercise.label) || '';
  const title = (exName ? exName + ' — ' : '') + (t('decision_log_title')||'Decision Log');
  let html = `<h1>${escHtml(title)}</h1>`;
  html += `<p style="color:#666">${new Date().toLocaleString()} — ${entries.length} ${t('lb_entries')||'entries'}</p><hr>`;
  for (const e of entries) html += _decisionEntryToHTML(e);
  _decisionPrintHTML(html, title);
}

// Print a single decision entry (called via 🖨 button)
function _decisionPrintEntry(idRaw) {
  const id = typeof idRaw === 'number' ? idRaw : parseInt(idRaw, 10);
  const entry = (_decisionLogEntries || []).find(e => e.id === id);
  if (!entry) { showError('Entry not found'); return; }
  _decisionPrintHTML(_decisionEntryToHTML(entry), entry.sequence_number || entry.title || 'Decision');
}

// ── Decision Editor (edit existing entry with revision tracking) ──────────
// Color swatches — matches log book palette
const _dlColorSwatches = ['', '#FFF4C2', '#D6F5D6', '#FFD6D6', '#D6E4FF', '#E6D6FF', '#FFE0B3'];

function _decisionOpenEditor(idRaw) {
  const id = typeof idRaw === 'number' ? idRaw : parseInt(idRaw, 10);
  const entry = (_decisionLogEntries || []).find(e => e.id === id);
  if (!entry) { showError('Entry not found'); return; }

  const groups = state.groups || [];
  const curColor = entry.color || '';
  const swatchesHtml = _dlColorSwatches.map(sw => {
    const bg = sw || 'transparent';
    const sel = (curColor === sw) ? 'outline:2px solid var(--accent);' : '';
    return `<button type="button" class="dl-swatch" data-dl-color="${escHtml(sw)}"
      style="width:22px;height:22px;border:1px solid #888;border-radius:4px;background:${bg};${sel}cursor:pointer" title="${sw||'None'}"></button>`;
  }).join('');
  const bodyField = (typeof _diaryRichField === 'function')
    ? _diaryRichField('dlEditBody', entry.decision || '', t('decision_log_placeholder')||'Decision text…', '160px')
    : `<textarea id="dlEditBody" rows="6" class="input" style="width:100%;font-size:var(--fs-xs)">${escHtml((entry.decision||'').replace(/<[^>]+>/g,''))}</textarea>`;

  // Build references display
  const refs = entry.references || [];
  const refsHtml = refs.map((r, i) => `<span data-ref-type="${escHtml(r.type)}" data-ref-id="${r.id}" data-ref-label="${escHtml(r.label || r.type + ' #' + r.id)}" style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);font-size:10px">🔗 ${escHtml(r.label || r.type + ' #' + r.id)} <button type="button" class="dl-ref-remove" style="border:none;background:none;cursor:pointer;font-size:10px;color:var(--danger)">×</button></span>`).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'dlEditorModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3>✏ ${t('decision_edit')||'Edit Decision'} ${escHtml(entry.sequence_number||'')}</h3>
        <button class="modal-close" data-action="_decisionCloseEditor">&times;</button>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600">${t('decision_title_placeholder')||'Title'}</label>
          <input id="dlEditTitle" class="input" style="width:100%;font-size:var(--fs-sm)" value="${escHtml(entry.title||'')}">
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600">${t('decision_reason_label')||'Reason'}</label>
          <input id="dlEditReason" class="input" style="width:100%;font-size:var(--fs-xs)" value="${escHtml(entry.reason||'')}">
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600">${t('decision_body')||'Decision'}</label>
          ${bodyField}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:var(--fs-xs);font-weight:600">${t('lb_visibility')||'Visibility'}</label>
            <select id="dlEditLogType" class="input" style="width:100%;font-size:var(--fs-xs)">
              <option value="general" ${(entry.log_type||'general')==='general'?'selected':''}>${t('decision_log_general')||'General (all)'}</option>
              <option value="group" ${entry.log_type==='group'?'selected':''}>${t('decision_log_group')||'Group'}</option>
              <option value="private" ${entry.log_type==='private'?'selected':''}>${t('decision_log_private')||'Private'}</option>
            </select>
          </div>
          <div>
            <label style="font-size:var(--fs-xs);font-weight:600">📅 ${t('decision_deadline')||'Deadline'}</label>
            <input type="datetime-local" id="dlEditDeadline" class="input" style="width:100%;font-size:var(--fs-xs)" value="${escHtml(entry.deadline||'')}">
          </div>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:4px">${t('lb_background_color')||'Background colour'}</label>
          <div id="dlEditSwatches" style="display:flex;gap:6px;flex-wrap:wrap">${swatchesHtml}</div>
          <input type="hidden" id="dlEditColor" value="${escHtml(curColor)}">
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:var(--fs-xs);font-weight:600;display:block;margin-bottom:4px">🔗 ${t('decision_references')||'References'}</label>
          <div id="dlEditRefs" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">${refsHtml}</div>
          <div style="display:flex;gap:4px;align-items:center">
            <select id="dlRefType" class="input" style="font-size:var(--fs-xs);width:auto">
              <option value="log_book">${t('tab_log_book')||'Log Book'}</option>
              <option value="diary">${t('diary_title')||'Diary'}</option>
              <option value="event">${t('event')||'Event'}</option>
            </select>
            <input type="number" id="dlRefId" class="input" style="width:80px;font-size:var(--fs-xs)" placeholder="ID" min="1">
            <input type="text" id="dlRefLabel" class="input" style="flex:1;font-size:var(--fs-xs)" placeholder="${t('decision_ref_label')||'Label (optional)'}">
            <button type="button" class="btn btn-sm btn-secondary" id="dlAddRefBtn" style="font-size:10px">+ Add</button>
          </div>
        </div>
        ${(entry.revisions && entry.revisions.length) ? `<details style="margin-bottom:8px;font-size:var(--fs-xs);color:var(--text-dim)"><summary style="cursor:pointer;font-weight:600">📝 ${entry.revisions.length} ${t('decision_revision_count')||'revision(s)'}</summary>${entry.revisions.map(rv =>
          `<div style="padding:4px 0;border-bottom:1px solid var(--border);margin-left:8px"><strong>${escHtml(rv.user_name||'')}</strong> — ${fmtDateTime(new Date(rv.timestamp))}${rv.prev_title ? '<br>Title: <del>' + escHtml(rv.prev_title) + '</del>' : ''}${rv.prev_decision ? '<br>Body changed' : ''}${rv.prev_log_type ? '<br>Visibility: <del>' + escHtml(rv.prev_log_type) + '</del>' : ''}</div>`
        ).join('')}</details>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" data-action="_decisionSaveEntry" data-arg="${entry.id}">${t('btn_save')||'Save'}</button>
          <button class="btn btn-secondary btn-sm" data-action="_decisionCloseEditor">${t('btn_cancel')||'Cancel'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  if (typeof _diaryBindToolbar === 'function') _diaryBindToolbar(modal, 'dlEditBody');
  if (typeof _diaryTrapModalKeys === 'function') _diaryTrapModalKeys('dlEditorModal');
  // Wire ref-chip remove buttons (CSP-safe — no inline onclick)
  modal.querySelectorAll('.dl-ref-remove').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('span').remove());
  });
  // Swatch clicks
  modal.querySelectorAll('.dl-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('dlEditColor').value = btn.dataset.dlColor || '';
      modal.querySelectorAll('.dl-swatch').forEach(b => { b.style.outline = ''; });
      btn.style.outline = '2px solid var(--accent)';
    });
  });
  // Add reference button
  document.getElementById('dlAddRefBtn')?.addEventListener('click', () => {
    const refType = document.getElementById('dlRefType')?.value;
    const refId = document.getElementById('dlRefId')?.value;
    const refLabel = document.getElementById('dlRefLabel')?.value || '';
    if (!refType || !refId) return;
    const tag = document.createElement('span');
    tag.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);font-size:10px';
    tag.dataset.refType = refType;
    tag.dataset.refId = refId;
    tag.dataset.refLabel = refLabel || `${refType} #${refId}`;
    tag.innerHTML = `🔗 ${escHtml(refLabel || refType + ' #' + refId)} <button type="button" class="dl-ref-remove" style="border:none;background:none;cursor:pointer;font-size:10px;color:var(--danger)">×</button>`;
    tag.querySelector('.dl-ref-remove').addEventListener('click', () => tag.remove());
    document.getElementById('dlEditRefs')?.appendChild(tag);
    document.getElementById('dlRefId').value = '';
    document.getElementById('dlRefLabel').value = '';
  });
  setTimeout(() => document.getElementById('dlEditTitle')?.focus(), 50);
}

function _decisionCloseEditor() {
  document.getElementById('dlEditorModal')?.remove();
}

async function _decisionSaveEntry(idStr) {
  const id = parseInt(idStr, 10);
  const title = document.getElementById('dlEditTitle')?.value?.trim() || '';
  const reason = document.getElementById('dlEditReason')?.value?.trim() || '';
  const bodyEl = document.getElementById('dlEditBody');
  const decision = bodyEl ? (bodyEl.tagName === 'TEXTAREA' ? bodyEl.value : (bodyEl.innerHTML || '')) : '';
  if (!decision.trim()) { showError(t('decision_required')||'Decision text is required'); return; }
  const logType = document.getElementById('dlEditLogType')?.value || 'general';
  const deadline = document.getElementById('dlEditDeadline')?.value || '';
  const color = document.getElementById('dlEditColor')?.value || '';
  // Collect references from the tag chips
  const refEls = document.querySelectorAll('#dlEditRefs span[data-ref-type]');
  const references = [];
  refEls.forEach(el => {
    references.push({ type: el.dataset.refType, id: parseInt(el.dataset.refId, 10), label: el.dataset.refLabel || '' });
  });
  try {
    const res = await api('PUT', '/api/decision-log/' + id, { title, decision, reason, log_type: logType, deadline, color, references });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save');
    }
    _decisionCloseEditor();
    showNotification('success', t('decision_updated')||'Decision updated');
    // Refresh entries
    await _loadDecisionLog();
    const el = document.getElementById('dlEntries');
    if (el) { el.innerHTML = _renderDecisionLogEntries(); _bindActions(el); }
  } catch (e) {
    showError(e.message || 'Failed to save');
  }
}

// Open a cross-reference target
function _openDecisionRef(type, id) {
  if (type === 'diary') {
    if (typeof openDiaryModal === 'function') openDiaryModal();
  } else if (type === 'log_book') {
    if (typeof openLogBookModal === 'function') openLogBookModal();
  } else if (type === 'event') {
    const ev = (state.events || []).find(e => e.id === id);
    if (ev && typeof showEventDetail === 'function') showEventDetail(ev);
  }
}

// ── Analysis Modal ──────────────────────────────────────────────────────────
