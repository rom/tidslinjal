/* ── TeamLead Toolbox Modal ── */
// ── TeamLead Toolbox Modal ──────────────────────────────────────────────────
async function openTeamLeadToolbox() {
  const groups = state.groups || [];
  const myGroups = groups; // TeamLead can see all groups they manage
  const html = `
    <div class="modal-overlay" id="teamleadToolboxModal">
      <div class="modal" style="max-width:650px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>🧰 ${t('teamlead_toolbox_title')||'TeamLead Toolbox'}</h2>
          <button class="modal-close" data-action="closeTeamLeadToolbox">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">

          <!-- Quick Response to OpLead -->
          <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:8px;color:#E74C3C">🚨 ${t('tl_quick_response')||'Quick Response needed!'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('tl_quick_response_desc')||'Send an urgent message directly to Operations Lead'}</p>
            <textarea id="tlQuickMsg" rows="2" placeholder="${t('tl_quick_response_placeholder')||'Describe the urgent situation...'}"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:8px;font-size:var(--fs-sm);resize:vertical;margin-bottom:6px"></textarea>
            <div style="display:flex;gap:6px;align-items:center">
              <select id="tlQuickPriority" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
                <option value="high">${t('priority_high')||'High'}</option>
                <option value="critical">${t('priority_critical')||'Critical'}</option>
              </select>
              <button class="btn btn-sm" style="background:#E74C3C;color:#fff" data-action="sendQuickResponse">🚨 ${t('btn_send')||'Send'}</button>
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
}

function closeTeamLeadToolbox() {
  const el = document.getElementById('teamleadToolboxModal');
  if (el) el.remove();
}

async function sendQuickResponse() {
  const msg = document.getElementById('tlQuickMsg')?.value?.trim();
  if (!msg) { showError(t('message_required')||'Message is required'); return; }
  const priority = document.getElementById('tlQuickPriority')?.value || 'high';
  const res = await apiPost('/api/teamlead/quick-response', {message: msg, priority});
  if (res.ok) {
    showNotification('success', t('tl_quick_response_sent')||'Quick response sent to Operations Lead');
    document.getElementById('tlQuickMsg').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to send');
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

