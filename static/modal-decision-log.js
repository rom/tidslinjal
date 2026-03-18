/* ── Decision Log Modal ── */
// ── Decision Log Modal ──────────────────────────────────────────────────────
let _decisionLogEntries = [];

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
            <textarea id="dlNewDecision" rows="3" placeholder="${t('decision_log_placeholder')||'Enter decision...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical"></textarea>
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
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${canWrite ? `<button class="btn btn-primary btn-sm" data-action="addDecisionLogEntry">${t('btn_add_decision')||'Add Decision'}</button>` : ''}
              <button class="btn btn-secondary btn-sm" data-action="requestDecision">${t('btn_request_decision')||'Request Decision'}</button>
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
}

function closeDecisionLogModal() {
  const el = document.getElementById('decisionLogModal');
  if (el) el.remove();
}

async function _loadDecisionLog() {
  try { _decisionLogEntries = await apiGet('/api/decision-log') || []; } catch { _decisionLogEntries = []; }
}

function _renderDecisionLogEntries() {
  if (!_decisionLogEntries.length) return `<p style="color:var(--text-dim)">${t('decision_log_empty')||'No decisions recorded yet.'}</p>`;
  const canReview = hasRole2(state.user?.role, 'teamlead');
  return _decisionLogEntries.slice().reverse().map(e => {
    const ts = fmtDateTime(new Date(e.timestamp));
    const badge = e.confidential ? `<span style="color:var(--danger);font-size:var(--fs-xs);font-weight:700"> 🔒 ${t('confidential')||'CONFIDENTIAL'}</span>` : '';
    const typeBadge = e.log_type === 'private' ? ' 🔵' : e.log_type === 'group' ? ' 🟢' : '';
    const isAdmin = state.user?.role === 'admin';
    // Status badge for decision requests
    let statusBadge = '';
    let reviewSection = '';
    if (e.status === 'requested') {
      const targetInfo = e.requested_of_label ? ` → ${escHtml(e.requested_of_label)}` : '';
      statusBadge = `<span style="background:#E67E22;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px">PENDING${targetInfo}</span>`;
      if (canReview) {
        reviewSection = `<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="text" id="dlReviewComment_${e.id}" placeholder="${t('review_comment')||'Comment...'}"
            style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
          <button class="btn btn-sm" style="background:#27AE60;color:#fff;padding:2px 8px;font-size:11px" data-action="reviewDecision" data-arg="${e.id}" data-status="approved" data-arg-el>✓ ${t('btn_approve')||'Approve'}</button>
          <button class="btn btn-sm" style="background:#E74C3C;color:#fff;padding:2px 8px;font-size:11px" data-action="reviewDecision" data-arg="${e.id}" data-status="denied" data-arg-el>✗ ${t('btn_deny')||'Deny'}</button>
        </div>`;
      }
    } else if (e.status === 'approved') {
      statusBadge = `<span style="background:#27AE60;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px">DECIDED</span>`;
      if (e.reviewed_by_name) reviewSection = `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">✓ ${escHtml(e.reviewed_by_name)}${e.reviewed_at ? ' — ' + fmtDateTime(new Date(e.reviewed_at)) : ''}${e.review_comment ? ': ' + escHtml(e.review_comment) : ''}</div>`;
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
        if (canReview && e.user_id !== state.user?.id) {
          coSignHtml += `<div style="margin-top:4px;display:flex;gap:6px;align-items:center">
            <input type="text" id="dlCoSignComment_${e.id}" placeholder="Co-sign comment"
              style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
            <button class="btn btn-sm" style="background:var(--accent);color:#fff;padding:2px 8px;font-size:11px" data-action="coSignDecision" data-arg="${e.id}">👁👁 Co-sign</button>
          </div>`;
        }
      }
    }
    const titleHtml = e.title ? `<div style="font-weight:700;font-size:var(--fs-sm);margin-top:2px">${escHtml(e.title)}</div>` : '';
    const execHtml = e.executor_label ? `<span style="font-size:var(--fs-xs);color:var(--accent);margin-left:6px">⚡ ${t('decision_executor')||'Executor'}: ${escHtml(e.executor_label)}</span>` : '';
    return `<div style="padding:8px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${escHtml(e.sequence_number||'')}</span>
          <span style="font-weight:600;margin-left:4px">${escHtml(e.display_name || e.user_name)}</span>
          <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:6px">${ts}${typeBadge}${badge}</span>
          ${statusBadge}${execHtml}
        </div>
        ${isAdmin ? `<button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" data-action="deleteDecisionLogEntry" data-arg="${e.id}">×</button>` : ''}
      </div>
      ${titleHtml}
      <div style="margin-top:4px;white-space:pre-wrap">${escHtml(e.decision)}</div>
      ${reasonHtml}
      ${(e.attachments && e.attachments.length) ? `<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${e.attachments.map(a =>
        `<a href="/api/decision-log/${e.id}/attachment/${encodeURIComponent(a.stored_name)}" target="_blank" style="font-size:var(--fs-xs);color:var(--accent);text-decoration:none" title="${escHtml(a.filename)}">📎 ${escHtml(a.filename)}</a>`
      ).join('')}</div>` : ''}
      ${coSignHtml}
      ${reviewSection}
    </div>`;
  }).join('');
}

async function addDecisionLogEntry() {
  const text = document.getElementById('dlNewDecision')?.value?.trim();
  if (!text) { showError(t('decision_required')||'Decision text is required'); return; }
  const logType = document.getElementById('dlLogType')?.value || 'general';
  const groupId = logType === 'group' ? parseInt(document.getElementById('dlGroupId')?.value || '0') : 0;
  const confidential = document.getElementById('dlConfidential')?.checked || false;
  const title = document.getElementById('dlTitle')?.value?.trim() || '';
  const executorType = document.getElementById('dlExecutorType')?.value || '';
  const executorValueEl = document.getElementById('dlExecutorValue');
  const executorValue = executorType ? (executorValueEl?.value || '') : '';
  const executorLabel = executorType ? (executorValueEl?.selectedOptions?.[0]?.textContent || executorValue) : '';
  const reason = document.getElementById('dlReason')?.value?.trim() || '';
  const coSignRequired = document.getElementById('dlCoSignRequired')?.checked || false;
  const coSignTargetId = coSignRequired ? (document.getElementById('dlCoSignTarget')?.value || '') : '';
  const coSignTargetUser = coSignTargetId ? (state.users||[]).find(u => u.id === parseInt(coSignTargetId, 10)) : null;
  const coSignTargetName = coSignTargetUser ? (coSignTargetUser.display_name || coSignTargetUser.username) : '';
  const res = await apiPost('/api/decision-log', {title, decision: text, log_type: logType, group_id: groupId, confidential,
    executor_type: executorType, executor_value: executorValue, executor_label: executorLabel,
    reason, co_sign_required: coSignRequired,
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
    showNotification('success', t('decision_added')||'Decision recorded');
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
  const text = document.getElementById('dlNewDecision')?.value?.trim();
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
  const res = await apiPost('/api/decision-log/request', {
    title, decision: text, log_type: logType, group_id: groupId, confidential, reason,
    requested_of_type: targetType, requested_of_value: targetValue, requested_of_label: targetLabel
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
  const comment = document.getElementById('dlReviewComment_' + id)?.value?.trim() || '';
  // Deny requires a reason
  if (status === 'denied' && !comment) {
    showError(t('deny_reason_required')||'A reason is required when denying a decision');
    document.getElementById('dlReviewComment_' + id)?.focus();
    return;
  }
  const res = await api('PUT', `/api/decision-log/${id}/review`, {status, comment});
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

// ── Decision Log Window (detached) ───────────────────────────────────────────
function openDetachedDecisionLog() {
  const w = Math.min(window.screen.availWidth, 800);
  const h = Math.min(window.screen.availHeight - 100, 600);
  window.open('/static/decision-log-popup.html', 'tidslinjal-decisionlog-' + Date.now(),
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  closeDecisionLogModal();
}
