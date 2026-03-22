/* ── TeamLead Toolbox Modal ── */
// ── TeamLead Toolbox Modal ──────────────────────────────────────────────────
let _tlEscalatedDecisions = [];
let _tlEscalationSortNewest = true; // default: newest first

async function _loadTlEscalatedDecisions() {
  try {
    const all = await apiGet('/api/decision-log') || [];
    _tlEscalatedDecisions = all.filter(e =>
      e.user_id === state.user?.id && e.requested_of_value === 'oplead' && e.status
    );
    // Sort by requested_at or timestamp
    _tlEscalatedDecisions.sort((a, b) => {
      const ta = new Date(a.requested_at || a.timestamp).getTime();
      const tb = new Date(b.requested_at || b.timestamp).getTime();
      return _tlEscalationSortNewest ? (tb - ta) : (ta - tb);
    });
  } catch { _tlEscalatedDecisions = []; }
}

function _renderTlEscalatedDecisions() {
  if (!_tlEscalatedDecisions.length) return `<p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('tl_no_escalations')||'No escalated decisions yet.'}</p>`;
  return _tlEscalatedDecisions.map(e => {
    const ts = e.requested_at ? fmtDateTime(new Date(e.requested_at)) : fmtDateTime(new Date(e.timestamp));
    let statusHtml = '';
    if (e.status === 'requested') {
      statusHtml = `<span style="background:#E67E22;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700">⏳ ${t('decision_filter_pending')||'PENDING'}</span>`;
    } else if (e.status === 'approved') {
      const labels = { approved: 'APPROVED', approved_with_condition: 'APPROVED W/ CONDITION', approved_with_modification: 'APPROVED W/ MODIFICATION' };
      const label = labels[e.approval_type] || 'APPROVED';
      statusHtml = `<span style="background:#27AE60;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700">✓ ${label}</span>`;
    } else if (e.status === 'rejected') {
      statusHtml = `<span style="background:#E74C3C;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700">✗ ${t('decision_filter_denied')||'DENIED'}</span>`;
    }
    let reviewHtml = '';
    if (e.reviewed_by_name) {
      const reviewTs = e.reviewed_at ? ' — ' + fmtDateTime(new Date(e.reviewed_at)) : '';
      const commentHtml = e.review_comment ? `<div style="margin-top:3px;font-size:var(--fs-xs);color:var(--text);padding:4px 8px;background:var(--bg);border-left:3px solid ${e.status==='rejected'?'var(--danger,#E74C3C)':'var(--accent)'};border-radius:2px">${escHtml(e.review_comment)}</div>` : '';
      reviewHtml = `<div style="margin-top:4px;font-size:var(--fs-xs);color:var(--text-dim)">
        ${e.status === 'rejected' ? '✗' : '✓'} ${escHtml(e.reviewed_by_name)}${reviewTs}
      </div>${commentHtml}`;
    }
    return `<div style="padding:8px;margin-bottom:6px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid ${e.status==='requested'?'#E67E22':e.status==='approved'?'#27AE60':'#E74C3C'}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
        <span style="font-size:var(--fs-xs);font-weight:700">${escHtml(e.sequence_number || '')} ${escHtml(e.title || '')}</span>
        ${statusHtml}
      </div>
      <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${ts}</div>
      <div style="font-size:var(--fs-sm);margin-top:4px">${escHtml(e.decision)}</div>
      ${e.reason ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);font-style:italic;margin-top:3px;border-left:3px solid var(--border);padding-left:8px">${escHtml(e.reason)}</div>` : ''}
      ${reviewHtml}
    </div>`;
  }).join('');
}

// Live-refresh escalated decisions panel if teamlead toolbox is open (modal or detached)
async function _refreshTlEscalationsIfOpen() {
  const modal = document.getElementById('teamleadToolboxModal');
  const popout = (typeof _teamleadPopout !== 'undefined' && _teamleadPopout && !_teamleadPopout.closed) ? _teamleadPopout : null;
  if (!modal && !popout) return;
  await _loadTlEscalatedDecisions();
  const html = _renderTlEscalatedDecisions();
  if (modal) {
    const panel = document.getElementById('tlEscalatedDecisionsPanel');
    if (panel) panel.innerHTML = html;
  }
  if (popout) {
    const panel = popout.document.getElementById('tlEscalatedDecisionsPanel');
    if (panel) panel.innerHTML = html;
  }
}

async function openTeamLeadToolbox() {
  const groups = state.groups || [];
  const myGroups = groups; // TeamLead can see all groups they manage
  const html = `
    <div class="modal-overlay" id="teamleadToolboxModal">
      <div class="modal" style="max-width:650px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center">
          <h2>🧰 ${t('teamlead_toolbox_title')||'TeamLead Toolbox'}</h2>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="detachTeamLeadToolbox" title="${t('btn_detach')||'Detach to window'}">⧉ ${t('btn_detach')||'Detach'}</button>
            <button class="modal-close" data-action="closeTeamLeadToolbox">✕</button>
          </div>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">

          <!-- Quick Response to OpLead -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px;color:#E74C3C">🚨 ${t('tl_quick_response')||'Quick Response needed!'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_quick_response_desc')||'Send an urgent message to leadership. Choose who should receive it.'}</p>
            <textarea id="tlQuickMsg" rows="2" placeholder="${t('tl_quick_response_placeholder')||'Describe the urgent situation...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <select id="tlQuickTarget" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="oplead">${t('tl_target_oplead')||'Operations Lead'}</option>
                <option value="oplead_deputy">${t('tl_target_oplead_deputy')||'OpLead + Deputy OpLeads'}</option>
                <option value="custom">${t('tl_target_custom')||'Custom recipients...'}</option>
              </select>
              <select id="tlQuickPriority" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="high">${t('priority_high')||'High'}</option>
                <option value="critical">${t('priority_critical')||'Critical'}</option>
              </select>
              <button class="btn btn-sm" style="background:#E74C3C;color:#fff" data-action="sendQuickResponse">🚨 ${t('btn_send')||'Send'}</button>
            </div>
            <div id="tlQuickCustomRecipients" style="display:none;margin-top:8px">
              <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('tl_select_recipients')||'Select recipients:'}</p>
              <div style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:4px;background:var(--bg)">
                ${(state.users||[]).map(u => `<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:var(--fs-xs);cursor:pointer">
                  <input type="checkbox" class="tlCustomRecipient" value="${u.id}" style="width:14px;height:14px;accent-color:var(--accent)">
                  ${escHtml(u.display_name||u.username)} <span style="color:var(--text-dim)">(${escHtml(String(u.role||''))})</span>
                </label>`).join('')}
              </div>
            </div>
          </div>

          <!-- Quick Report to OpLead / InfoHandler -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px;color:var(--accent)">📋 ${t('tl_quick_report')||'Quick Report'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_quick_report_desc')||'Send an instant report to Operations Lead and InfoHandler'}</p>
            <input type="text" id="tlReportSubject" placeholder="${t('tl_report_subject')||'Report subject'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <textarea id="tlReportBody" rows="3" placeholder="${t('tl_report_body')||'Report details...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <select id="tlReportCategory" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="situation">${t('tl_report_cat_situation')||'Situation'}</option>
                <option value="incident">${t('tl_report_cat_incident')||'Incident'}</option>
                <option value="resource">${t('tl_report_cat_resource')||'Resource'}</option>
                <option value="progress">${t('tl_report_cat_progress')||'Progress'}</option>
                <option value="other">${t('tl_report_cat_other')||'Other'}</option>
              </select>
              <select id="tlReportPriority" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="normal">${t('priority_normal')||'Normal'}</option>
                <option value="high">${t('priority_high')||'High'}</option>
                <option value="critical">${t('priority_critical')||'Critical'}</option>
              </select>
              <span style="flex:1"></span>
              <button class="btn btn-sm btn-primary" data-action="sendQuickReport">📋 ${t('btn_send_report')||'Send Report'}</button>
            </div>
          </div>

          <!-- TeamLead Decisions -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">⚖ ${t('tl_decisions')||'TeamLead Decisions'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_decisions_desc')||'Record decisions made by TeamLead or Deputy TeamLead on the full team'}</p>
            <input type="text" id="tlDecisionTitle" placeholder="${t('decision_title_placeholder')||'Decision title'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <textarea id="tlDecisionText" rows="2" placeholder="${t('tl_decision_placeholder')||'Enter your decision...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <input type="text" id="tlDecisionReason" placeholder="${t('decision_reason_label')||'Reason for decision'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div style="display:flex;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" data-action="addTeamLeadDecision">${t('btn_add_decision')||'Add Decision'}</button>
            </div>
          </div>

          <!-- Escalate Decision -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">⬆ ${t('tl_escalate_decision')||'Decision needed — Escalate to OpLead'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_escalate_desc')||'Escalate a decision that requires Operations Lead authority'}</p>
            <input type="text" id="tlEscalateTitle" placeholder="${t('tl_escalate_title_placeholder')||'Decision title'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <textarea id="tlEscalateText" rows="2" placeholder="${t('tl_escalate_placeholder')||'Describe what needs to be decided...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <input type="text" id="tlEscalateReason" placeholder="${t('tl_escalate_reason')||'Background / reason for escalation'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div style="display:flex;gap:6px;align-items:center">
              <select id="tlEscalateUrgency" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="normal">${t('urgency_normal')||'Normal'}</option>
                <option value="urgent">${t('urgency_urgent')||'Urgent'}</option>
                <option value="critical">${t('urgency_critical')||'Critical'}</option>
              </select>
              <button class="btn btn-sm" style="background:#E67E22;color:#fff" data-action="escalateDecision">⬆ ${t('btn_escalate')||'Escalate'}</button>
            </div>
          </div>

          <!-- Escalated Decisions Status -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:700">📋 ${t('tl_my_escalations')||'My Escalated Decisions'}</span>
              <button class="btn btn-sm btn-secondary" style="font-size:10px;padding:1px 6px" data-action="toggleTlEscalationSort">${t('sort')||'Sort'}: ${_tlEscalationSortNewest ? (t('newest_first')||'Newest first') : (t('oldest_first')||'Oldest first')}</button>
            </div>
            <div id="tlEscalatedDecisionsPanel" style="max-height:250px;overflow-y:auto">
              <p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('loading')||'Loading...'}</p>
            </div>
          </div>

          <!-- Team Ready Check -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">✅ ${t('tl_team_ready_check')||'Team Ready Check'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_ready_check_desc')||'Send a ready check to your team members'}</p>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <select id="tlReadyCheckGroup" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:150px">
                ${myGroups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('')}
              </select>
              <input type="text" id="tlReadyCheckMsg" placeholder="${t('tl_ready_check_msg')||'Optional message'}"
                style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
              <button class="btn btn-sm btn-primary" data-action="sendTeamReadyCheck">✅ ${t('btn_send')||'Send'}</button>
            </div>
          </div>

          <!-- Team Poll -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">📊 ${t('tl_team_poll')||'Team Poll'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_team_poll_desc')||'Send a quick poll to your team members'}</p>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
              <select id="tlPollGroup" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:150px">
                ${myGroups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('')}
              </select>
            </div>
            <input type="text" id="tlPollQuestion" placeholder="${t('tl_poll_question')||'Question'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <input type="text" id="tlPollOptions" placeholder="${t('tl_poll_options_placeholder')||'Options (comma-separated, e.g.: Yes, No, Maybe)'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div style="display:flex;justify-content:flex-end">
              <button class="btn btn-sm btn-primary" data-action="sendTeamPoll">📊 ${t('btn_send_poll')||'Send Poll'}</button>
            </div>
          </div>

          <!-- Team Checklists -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">📋 ${t('checklist_team_checklists')||'Team Checklists'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('checklist_team_desc')||'Team-oriented checklists for group coordination and assessment.'}</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" data-action="showChecklistsInSidebar">📋 ${t('checklists')||'Checklists'}</button>
              <button class="btn btn-sm btn-secondary" data-action="openChecklistStart">▶ ${t('checklist_start')||'Start Checklist'}</button>
              <button class="btn btn-sm btn-secondary" data-action="openChecklistEditor">✏ ${t('checklist_editor')||'Editor'}</button>
            </div>
          </div>

        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('teamleadToolboxModal');
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);
  // Load escalated decisions asynchronously
  _loadTlEscalatedDecisions().then(() => {
    const panel = document.getElementById('tlEscalatedDecisionsPanel');
    if (panel) panel.innerHTML = _renderTlEscalatedDecisions();
  });
}

function closeTeamLeadToolbox() {
  const el = document.getElementById('teamleadToolboxModal');
  if (el) el.remove();
}

// Show/hide custom recipients when target changes
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'tlQuickTarget') {
    const custom = document.getElementById('tlQuickCustomRecipients');
    if (custom) custom.style.display = e.target.value === 'custom' ? '' : 'none';
  }
});

async function sendQuickResponse() {
  const msg = document.getElementById('tlQuickMsg')?.value?.trim();
  if (!msg) { showError(t('message_required')||'Message is required'); return; }
  const priority = document.getElementById('tlQuickPriority')?.value || 'high';
  const target = document.getElementById('tlQuickTarget')?.value || 'oplead';
  const body = { message: msg, priority, target };
  if (target === 'custom') {
    const customIds = [];
    document.querySelectorAll('.tlCustomRecipient:checked').forEach(cb => {
      customIds.push(parseInt(cb.value));
    });
    if (customIds.length === 0) { showError(t('tl_select_at_least_one')||'Select at least one recipient'); return; }
    body.custom_ids = customIds;
  }
  const targetLabels = { oplead: 'Operations Lead', oplead_deputy: 'OpLead + Deputies', custom: 'selected recipients' };
  const res = await apiPost('/api/teamlead/quick-response', body);
  if (res.ok) {
    showNotification('success', (t('tl_quick_response_sent_to')||'Quick response sent to') + ' ' + (targetLabels[target] || target));
    document.getElementById('tlQuickMsg').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to send');
  }
}

function toggleTlEscalationSort() {
  _tlEscalationSortNewest = !_tlEscalationSortNewest;
  _refreshTlEscalationsIfOpen();
  // Update sort button text in both modal and detached window
  document.querySelectorAll('[data-action="toggleTlEscalationSort"]').forEach(btn => {
    btn.textContent = (t('sort')||'Sort') + ': ' + (_tlEscalationSortNewest ? (t('newest_first')||'Newest first') : (t('oldest_first')||'Oldest first'));
  });
  if (typeof _teamleadPopout !== 'undefined' && _teamleadPopout && !_teamleadPopout.closed) {
    _teamleadPopout.document.querySelectorAll('[data-action="toggleTlEscalationSort"]').forEach(btn => {
      btn.textContent = (t('sort')||'Sort') + ': ' + (_tlEscalationSortNewest ? (t('newest_first')||'Newest first') : (t('oldest_first')||'Oldest first'));
    });
  }
}

async function addTeamLeadDecision() {
  const title = document.getElementById('tlDecisionTitle')?.value?.trim() || '';
  const text = document.getElementById('tlDecisionText')?.value?.trim();
  if (!text) { showError(t('decision_required')||'Decision text is required'); return; }
  const reason = document.getElementById('tlDecisionReason')?.value?.trim() || '';
  const res = await apiPost('/api/decision-log', {title, decision: text, reason, log_type: 'general'});
  if (res.ok) {
    showNotification('success', t('decision_added')||'Decision recorded');
    document.getElementById('tlDecisionTitle').value = '';
    document.getElementById('tlDecisionText').value = '';
    document.getElementById('tlDecisionReason').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to add decision');
  }
}

async function escalateDecision() {
  const title = document.getElementById('tlEscalateTitle')?.value?.trim() || '';
  const text = document.getElementById('tlEscalateText')?.value?.trim();
  if (!text) { showError(t('decision_required')||'Decision text is required'); return; }
  const reason = document.getElementById('tlEscalateReason')?.value?.trim() || '';
  const urgency = document.getElementById('tlEscalateUrgency')?.value || 'urgent';
  const res = await apiPost('/api/teamlead/escalate-decision', {title, decision: text, reason, urgency});
  if (res.ok) {
    showNotification('success', t('tl_decision_escalated')||'Decision escalated to Operations Lead');
    document.getElementById('tlEscalateTitle').value = '';
    document.getElementById('tlEscalateText').value = '';
    document.getElementById('tlEscalateReason').value = '';
    // Refresh the escalations panel immediately
    _refreshTlEscalationsIfOpen();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to escalate');
  }
}

async function sendTeamReadyCheck() {
  const groupId = parseInt(document.getElementById('tlReadyCheckGroup')?.value || '0');
  if (!groupId) { showError(t('group_required')||'Please select a group'); return; }
  const msg = document.getElementById('tlReadyCheckMsg')?.value?.trim() || '';
  const res = await apiPost('/api/teamlead/ready-check', {group_id: groupId, message: msg});
  if (res.ok) {
    showNotification('success', t('tl_ready_check_sent')||'Ready check sent');
    document.getElementById('tlReadyCheckMsg').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to send ready check');
  }
}

async function sendTeamPoll() {
  const groupId = parseInt(document.getElementById('tlPollGroup')?.value || '0');
  if (!groupId) { showError(t('group_required')||'Please select a group'); return; }
  const question = document.getElementById('tlPollQuestion')?.value?.trim();
  if (!question) { showError(t('question_required')||'Question is required'); return; }
  const optionsStr = document.getElementById('tlPollOptions')?.value?.trim() || '';
  const options = optionsStr.split(',').map(s => s.trim()).filter(Boolean);
  if (options.length < 2) { showError(t('tl_poll_min_options')||'At least 2 options are required'); return; }
  const res = await apiPost('/api/teamlead/team-poll', {group_id: groupId, question, options});
  if (res.ok) {
    showNotification('success', t('tl_poll_sent')||'Team poll sent');
    document.getElementById('tlPollQuestion').value = '';
    document.getElementById('tlPollOptions').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to send poll');
  }
}

async function sendQuickReport() {
  const subject = document.getElementById('tlReportSubject')?.value?.trim();
  if (!subject) { showError(t('tl_report_subject_required')||'Report subject is required'); return; }
  const body = document.getElementById('tlReportBody')?.value?.trim();
  if (!body) { showError(t('tl_report_body_required')||'Report body is required'); return; }
  const category = document.getElementById('tlReportCategory')?.value || 'situation';
  const priority = document.getElementById('tlReportPriority')?.value || 'normal';
  const res = await apiPost('/api/teamlead/quick-report', {subject, body, category, priority});
  if (res.ok) {
    showNotification('success', t('tl_report_sent')||'Report sent to Operations Lead');
    document.getElementById('tlReportSubject').value = '';
    document.getElementById('tlReportBody').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to send report');
  }
}

// ── Detach TeamLead Toolbox ────────────────────────────────────────────────
let _teamleadPopout = null;
let _teamleadPopoutMonitor = null;

function detachTeamLeadToolbox() {
  closeTeamLeadToolbox();

  if (_teamleadPopout && !_teamleadPopout.closed) {
    _teamleadPopout.focus();
    return;
  }

  const groups = state.groups || [];
  const myGroups = groups;
  const theme = document.body.className || '';
  const w = Math.min(window.screen.availWidth, 680);
  const h = Math.min(window.screen.availHeight - 100, 800);

  _teamleadPopout = window.open('', 'tidslinjal-teamlead',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_teamleadPopout) return;

  // Build the same content as the modal body
  const content = _teamleadToolboxContent(myGroups);

  _teamleadPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 TeamLead Toolbox</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:16px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    'h2{margin:0 0 12px 0}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<h2>\u{1F9F0} ' + escHtml(t('teamlead_toolbox_title')||'TeamLead Toolbox') + '</h2>' +
    '<div id="teamleadDetachedWrap">' + content + '</div>' +
    '</body></html>');
  _teamleadPopout.document.close();

  // Bind actions in the popout to opener (main window) functions
  function rebindPopoutActions() {
    if (!_teamleadPopout || _teamleadPopout.closed) return;
    const wrap = _teamleadPopout.document.getElementById('teamleadDetachedWrap');
    if (!wrap) return;
    wrap.querySelectorAll('[data-action]').forEach(el => {
      el.onclick = function() {
        try {
          window.focus();
          const fn = el.dataset.action;
          const arg = el.dataset.arg;
          if (typeof window[fn] === 'function') {
            arg ? window[fn](arg) : window[fn]();
          }
        } catch(e) { console.error(e); }
      };
    });
  }
  rebindPopoutActions();

  // Load escalated decisions in detached window
  _loadTlEscalatedDecisions().then(() => {
    if (_teamleadPopout && !_teamleadPopout.closed) {
      const panel = _teamleadPopout.document.getElementById('tlEscalatedDecisionsPanel');
      if (panel) panel.innerHTML = _renderTlEscalatedDecisions();
    }
  });

  if (_teamleadPopoutMonitor) clearInterval(_teamleadPopoutMonitor);
  _teamleadPopoutMonitor = setInterval(() => {
    if (!_teamleadPopout || _teamleadPopout.closed) {
      clearInterval(_teamleadPopoutMonitor);
      _teamleadPopoutMonitor = null;
      _teamleadPopout = null;
    }
  }, 1000);
}

// Helper to extract toolbox content for reuse in detached window
function _teamleadToolboxContent(myGroups) {
  return `
          <!-- Quick Response to OpLead -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px;color:#E74C3C">\u{1F6A8} ${t('tl_quick_response')||'Quick Response needed!'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_quick_response_desc')||'Send an urgent message directly to Operations Lead'}</p>
            <textarea id="tlQuickMsg" rows="2" placeholder="${t('tl_quick_response_placeholder')||'Describe the urgent situation...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <div style="display:flex;gap:6px;align-items:center">
              <select id="tlQuickPriority" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="high">${t('priority_high')||'High'}</option>
                <option value="critical">${t('priority_critical')||'Critical'}</option>
              </select>
              <button class="btn btn-sm" style="background:#E74C3C;color:#fff" data-action="sendQuickResponse">\u{1F6A8} ${t('btn_send')||'Send'}</button>
            </div>
          </div>

          <!-- Quick Report -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px;color:var(--accent)">\u{1F4CB} ${t('tl_quick_report')||'Quick Report'}</div>
            <input type="text" id="tlReportSubject" placeholder="${t('tl_report_subject')||'Report subject'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <textarea id="tlReportBody" rows="3" placeholder="${t('tl_report_body')||'Report details...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <select id="tlReportCategory" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="situation">${t('tl_report_cat_situation')||'Situation'}</option>
                <option value="incident">${t('tl_report_cat_incident')||'Incident'}</option>
                <option value="resource">${t('tl_report_cat_resource')||'Resource'}</option>
                <option value="progress">${t('tl_report_cat_progress')||'Progress'}</option>
                <option value="other">${t('tl_report_cat_other')||'Other'}</option>
              </select>
              <select id="tlReportPriority" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="normal">${t('priority_normal')||'Normal'}</option>
                <option value="high">${t('priority_high')||'High'}</option>
                <option value="critical">${t('priority_critical')||'Critical'}</option>
              </select>
              <span style="flex:1"></span>
              <button class="btn btn-sm btn-primary" data-action="sendQuickReport">\u{1F4CB} ${t('btn_send_report')||'Send Report'}</button>
            </div>
          </div>

          <!-- TeamLead Decisions -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">\u2696 ${t('tl_decisions')||'TeamLead Decisions'}</div>
            <input type="text" id="tlDecisionTitle" placeholder="${t('decision_title_placeholder')||'Decision title'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <textarea id="tlDecisionText" rows="2" placeholder="${t('tl_decision_placeholder')||'Enter your decision...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <input type="text" id="tlDecisionReason" placeholder="${t('decision_reason_label')||'Reason for decision'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div style="display:flex;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" data-action="addTeamLeadDecision">${t('btn_add_decision')||'Add Decision'}</button>
            </div>
          </div>

          <!-- Escalate Decision -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">\u2B06 ${t('tl_escalate_decision')||'Decision needed \u2014 Escalate to OpLead'}</div>
            <input type="text" id="tlEscalateTitle" placeholder="${t('tl_escalate_title_placeholder')||'Decision title'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <textarea id="tlEscalateText" rows="2" placeholder="${t('tl_escalate_placeholder')||'Describe what needs to be decided...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <input type="text" id="tlEscalateReason" placeholder="${t('tl_escalate_reason')||'Background / reason for escalation'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div style="display:flex;gap:6px;align-items:center">
              <select id="tlEscalateUrgency" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="normal">${t('urgency_normal')||'Normal'}</option>
                <option value="urgent">${t('urgency_urgent')||'Urgent'}</option>
                <option value="critical">${t('urgency_critical')||'Critical'}</option>
              </select>
              <button class="btn btn-sm" style="background:#E67E22;color:#fff" data-action="escalateDecision">\u2B06 ${t('btn_escalate')||'Escalate'}</button>
            </div>
          </div>

          <!-- Escalated Decisions Status (detached) -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:700">\uD83D\uDCCB ${t('tl_my_escalations')||'My Escalated Decisions'}</span>
              <button class="btn btn-sm btn-secondary" style="font-size:10px;padding:1px 6px" data-action="toggleTlEscalationSort">${t('sort')||'Sort'}: ${_tlEscalationSortNewest ? (t('newest_first')||'Newest first') : (t('oldest_first')||'Oldest first')}</button>
            </div>
            <div id="tlEscalatedDecisionsPanel" style="max-height:250px;overflow-y:auto">
              <p style="font-size:var(--fs-xs);color:var(--text-dim)">${t('loading')||'Loading...'}</p>
            </div>
          </div>

          <!-- Team Ready Check -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">\u2705 ${t('tl_team_ready_check')||'Team Ready Check'}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <select id="tlReadyCheckGroup" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:150px">
                ${myGroups.map(g => '<option value="' + g.id + '">' + escHtml(g.name) + '</option>').join('')}
              </select>
              <input type="text" id="tlReadyCheckMsg" placeholder="${t('tl_ready_check_msg')||'Optional message'}"
                style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
              <button class="btn btn-sm btn-primary" data-action="sendTeamReadyCheck">\u2705 ${t('btn_send')||'Send'}</button>
            </div>
          </div>

          <!-- Team Poll -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px">\u{1F4CA} ${t('tl_team_poll')||'Team Poll'}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
              <select id="tlPollGroup" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);min-width:150px">
                ${myGroups.map(g => '<option value="' + g.id + '">' + escHtml(g.name) + '</option>').join('')}
              </select>
            </div>
            <input type="text" id="tlPollQuestion" placeholder="${t('tl_poll_question')||'Question'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm);margin-bottom:6px">
            <input type="text" id="tlPollOptions" placeholder="${t('tl_poll_options_placeholder')||'Options (comma-separated, e.g.: Yes, No, Maybe)'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-xs);margin-bottom:6px">
            <div style="display:flex;justify-content:flex-end">
              <button class="btn btn-sm btn-primary" data-action="sendTeamPoll">\u{1F4CA} ${t('btn_send_poll')||'Send Poll'}</button>
            </div>
          </div>`;
}

