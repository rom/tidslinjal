/* ============================================================
   Tidslinjal — Modals, Sidebar & Feature Logic
   All modal open/save/close handlers, sidebar rendering,
   preferences UI, export/import, templates, alarms, SSE.
   ============================================================ */
'use strict';

function applyPreferences() {
  const body = document.body;
  body.className = '';
  if (state.preferences.theme === 'light') body.classList.add('light-mode');
  const sz = state.preferences.size || 'small';
  if (sz !== 'small') body.classList.add('size-'+sz);
  if (!state.preferences.show_out_of_hours) body.classList.add('hide-out-of-hours');
  updateLangFlags();
}
function updateEventModalTimeVisibility() {
  const allDay  = document.getElementById('eventAllDay')?.checked;
  const typeVal = document.getElementById('eventType')?.value;
  const isInstant = typeVal === 'instant';

  const startRow = document.getElementById('eventTimeRow');
  const endGroup = document.getElementById('eventEndGroup');
  const recurRow = document.querySelectorAll('#eventModal .recurrence-row');

  if (startRow) startRow.style.display = allDay ? 'none' : '';
  if (endGroup) endGroup.style.display = (allDay || isInstant) ? 'none' : '';
  recurRow.forEach(el => { el.style.display = allDay ? 'none' : ''; });
}
function openEventModal(ev, defaultStart, defaultEnd) {
  const isEdit = !!ev;
  document.getElementById('eventModalTitle').textContent = isEdit ? t('event_edit') : t('event_add');
  document.getElementById('eventId').value = ev ? ev.id : '';
  document.getElementById('eventTitle').value = ev ? ev.title : '';
  document.getElementById('eventDescription').value = ev ? (ev.description||'') : '';
  document.getElementById('eventColor').value = ev ? (ev.color||'#4A90D9') : '#4A90D9';

  // Type select — sorted alphabetically by display label
  const typeSelect = document.getElementById('eventType');
  const lang = state.preferences.language || 'en';
  const sortedTypes = [...state.eventTypes].sort((a, b) => {
    const la = (lang==='sv' && a.label_sv ? a.label_sv : lang==='fr' && a.label_fr ? a.label_fr : a.label).toLowerCase();
    const lb = (lang==='sv' && b.label_sv ? b.label_sv : lang==='fr' && b.label_fr ? b.label_fr : b.label).toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  typeSelect.innerHTML = sortedTypes.map(et => {
    const lbl = lang==='sv' && et.label_sv ? et.label_sv :
                lang==='fr' && et.label_fr ? et.label_fr : et.label;
    return `<option value="${et.key}" ${ev && ev.event_type===et.key?'selected':''}>${lbl}</option>`;
  }).join('');
  typeSelect.onchange = () => {
    const found = state.eventTypes.find(x => x.key === typeSelect.value);
    if (found) document.getElementById('eventColor').value = found.color;
    updateEventModalTimeVisibility();
  };

  // Layer select
  const layerSel = document.getElementById('eventLayer');
  layerSel.innerHTML = `<option value="">${t('event_master')}</option>` +
    state.layers
      .filter(l => l.owner_id===state.user.id || state.user.role==='admin' || l.permission==='readwrite')
      .map(l => `<option value="${l.id}" ${ev && ev.layer_id===l.id?'selected':''}>${escHtml(l.name)}</option>`)
      .join('');

  const start = defaultStart || (ev ? new Date(ev.start_time) : new Date());
  const end   = defaultEnd   || (ev && ev.end_time ? new Date(ev.end_time) : addHours(start, 1));
  document.getElementById('eventStart').value = fmtDateInput(start);
  document.getElementById('eventEnd').value   = fmtDateInput(end);

  // All-day checkbox
  const allDayChk = document.getElementById('eventAllDay');
  if (allDayChk) allDayChk.checked = ev ? !!ev.all_day : false;

  const recurring = ev && ev.is_recurring;
  document.getElementById('eventRecurring').checked = recurring;
  document.getElementById('recurrenceGroup').style.display    = recurring ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = recurring ? '' : 'none';
  if (ev) {
    document.getElementById('eventRecurrencePattern').value = ev.recurrence_pattern || 'weekly';
    if (ev.recurrence_end) document.getElementById('eventRecurrenceEnd').value = fmtDateInput(new Date(ev.recurrence_end));
  }

  // Status
  document.getElementById('eventStatus').value = (ev && ev.status) ? ev.status : 'planned';

  // Intern/extern
  const partSel = document.getElementById('eventParticipant');
  if (partSel) partSel.value = ev ? (ev.participant || '') : '';

  // Responsible user select
  const respSel = document.getElementById('eventResponsible');
  if (respSel) {
    const users = state.users || [];
    const creatorId = ev ? ev.created_by : (state.user ? state.user.id : null);
    respSel.innerHTML = `<option value="">— (${t('ev_responsible_creator')||'creator'})</option>` +
      users.map(u => `<option value="${u.id}" ${ev && ev.responsible_id===u.id?'selected':''}>${escHtml(u.display_name||u.username)}</option>`).join('');
  }

  // Reset invited filter to 'both'
  _invitedFilter = 'both';
  document.querySelectorAll('.inv-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'both');
  });

  // Invited users/groups
  const invList = document.getElementById('eventInvitedList');
  if (invList) {
    const invUserIDs  = ev && ev.invited_user_ids  ? ev.invited_user_ids  : [];
    const invGroupIDs = ev && ev.invited_group_ids ? ev.invited_group_ids : [];
    const users = state.users || [];
    const groups = state.groups || [];
    invList.innerHTML = [
      ...users.map(u => `<label class="group-chip${invUserIDs.includes(u.id)?' selected':''}" style="cursor:pointer">
        <input type="checkbox" class="inv-user-cb" value="${u.id}" ${invUserIDs.includes(u.id)?'checked':''} style="margin-right:4px">
        👤 ${escHtml(u.display_name||u.username)}
      </label>`),
      ...groups.map(g => `<label class="group-chip${invGroupIDs.includes(g.id)?' selected':''}" style="cursor:pointer">
        <input type="checkbox" class="inv-group-cb" value="${g.id}" ${invGroupIDs.includes(g.id)?'checked':''} style="margin-right:4px">
        👥 ${escHtml(g.name)}
      </label>`)
    ].join('');
    invList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => cb.closest('.group-chip').classList.toggle('selected', cb.checked));
    });
  }

  // Clear attachment input on each open
  const attachFile = document.getElementById('eventAttachFile');
  if (attachFile) attachFile.value = '';

  // Reset inline alarm section
  const inlineAlarmCb = document.getElementById('inlineAlarmEnabled');
  const inlineAlarmOpts = document.getElementById('inlineAlarmOptions');
  if (inlineAlarmCb) {
    inlineAlarmCb.checked = false;
    if (inlineAlarmOpts) inlineAlarmOpts.style.display = 'none';
  }

  const creatorEl = document.getElementById('eventCreator');
  creatorEl.style.display = isEdit ? '' : 'none';
  if (isEdit) creatorEl.textContent = `${t('event_created_by')} ${ev.created_by_name} — ${fmtDateTime(new Date(ev.created_at))}`;

  // Check if event is within a locked slot
  const eventIsLocked = isEdit && isEventLocked(ev);
  if (eventIsLocked) {
    const lock = getEventLock(ev);
    const modalBody = document.getElementById('eventModal').querySelector('.modal-body');
    let lockBanner = document.getElementById('eventLockBanner');
    if (!lockBanner) {
      lockBanner = document.createElement('div');
      lockBanner.id = 'eventLockBanner';
      modalBody.insertBefore(lockBanner, modalBody.firstChild);
    }
    const scopeLabel = { all:'all layers & master', master:'master timeline', layer:'this layer' }[(lock&&lock.scope)||'all'] || 'all';
    lockBanner.style.cssText = 'background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.4);border-radius:var(--radius);padding:8px 12px;font-size:var(--fs-sm);color:var(--red);margin-bottom:12px;';
    lockBanner.innerHTML = `🔒 <b>Locked time slot</b> (${scopeLabel}) — editing and deleting disabled.`;
  } else {
    const old = document.getElementById('eventLockBanner');
    if (old) old.remove();
  }

  const delBtn = document.getElementById('btnDeleteEvent');
  const canDel = !eventIsLocked && isEdit && (state.user.role==='admin' || state.user.id===ev.created_by);
  delBtn.style.display = canDel ? '' : 'none';
  delBtn.onclick = canDel ? () => deleteEvent(ev.id) : null;

  const saveBtn = document.getElementById('btnSaveEvent');
  if (saveBtn) saveBtn.disabled = !!eventIsLocked;

  // Update field visibility for type/allday
  updateEventModalTimeVisibility();

  openModal('eventModal');
}
function setInvitedFilter(filter) {
  _invitedFilter = filter;
  document.querySelectorAll('.inv-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  const list = document.getElementById('eventInvitedList');
  if (!list) return;
  list.querySelectorAll('.group-chip').forEach(chip => {
    const isUser  = chip.querySelector('.inv-user-cb') !== null;
    const isGroup = chip.querySelector('.inv-group-cb') !== null;
    if (filter === 'users')  chip.style.display = isUser  ? '' : 'none';
    else if (filter === 'groups') chip.style.display = isGroup ? '' : 'none';
    else chip.style.display = '';
  });
}
// Wire up inline alarm checkbox toggle
document.getElementById('inlineAlarmEnabled')?.addEventListener('change', function() {
  const opts = document.getElementById('inlineAlarmOptions');
  if (opts) opts.style.display = this.checked ? '' : 'none';
});

document.getElementById('eventRecurring').addEventListener('change', function() {
  document.getElementById('recurrenceGroup').style.display    = this.checked ? '' : 'none';
  document.getElementById('recurrenceEndGroup').style.display = this.checked ? '' : 'none';
});

document.getElementById('eventAllDay').addEventListener('change', updateEventModalTimeVisibility);

// Auto-adjust end time to start + 1 hour whenever start changes
document.getElementById('eventStart').addEventListener('change', function() {
  const start = new Date(this.value);
  if (!isNaN(start.getTime())) {
    document.getElementById('eventEnd').value = fmtDateInput(addHours(start, 1));
  }
});

document.getElementById('btnSaveEvent').addEventListener('click', async () => {
  const id    = document.getElementById('eventId').value;
  const title = document.getElementById('eventTitle').value.trim();
  if (!title) { showError(t('event_title') + ' is required', 'Validation'); return; }
  const allDay   = document.getElementById('eventAllDay')?.checked || false;
  const typeVal  = document.getElementById('eventType').value;
  const isInstant = typeVal === 'instant';
  const startVal = document.getElementById('eventStart').value;
  const endVal   = document.getElementById('eventEnd').value;
  if (!allDay && !startVal) { showError(t('event_start') + ' is required', 'Validation'); return; }

  const recurring = document.getElementById('eventRecurring').checked;
  const layerVal  = document.getElementById('eventLayer').value;
  const partSel   = document.getElementById('eventParticipant');
  const respSel   = document.getElementById('eventResponsible');
  const respVal   = respSel ? respSel.value : '';
  // Collect invited user/group IDs from checkboxes
  const invUserIDs  = [...(document.querySelectorAll('.inv-user-cb:checked')  || [])].map(cb => parseInt(cb.value, 10));
  const invGroupIDs = [...(document.querySelectorAll('.inv-group-cb:checked') || [])].map(cb => parseInt(cb.value, 10));
  const payload = {
    title,
    description:        document.getElementById('eventDescription').value,
    event_type:         typeVal,
    color:              document.getElementById('eventColor').value,
    status:             document.getElementById('eventStatus').value,
    all_day:            allDay,
    participant:        partSel ? partSel.value : '',
    responsible_id:     respVal ? parseInt(respVal, 10) : null,
    invited_user_ids:   invUserIDs,
    invited_group_ids:  invGroupIDs,
    start_time:         (!allDay && startVal) ? new Date(startVal).toISOString() : new Date().toISOString(),
    end_time:           (!allDay && !isInstant && endVal) ? new Date(endVal).toISOString() : null,
    is_recurring:       recurring && !allDay && !isInstant,
    recurrence_pattern: (recurring && !allDay && !isInstant) ? document.getElementById('eventRecurrencePattern').value : '',
    recurrence_end:     (recurring && !allDay && !isInstant && document.getElementById('eventRecurrenceEnd').value)
                          ? new Date(document.getElementById('eventRecurrenceEnd').value).toISOString() : null,
    layer_id:           layerVal ? parseInt(layerVal, 10) : null,
  };

  const res = id ? await apiPut(`/api/events/${id}`, payload) : await apiPost('/api/events', payload);
  if (res.ok) {
    const saved    = await res.json();
    const eventID  = saved.id || parseInt(id, 10);
    // Upload attachment if a file was selected
    const attachFile = document.getElementById('eventAttachFile');
    if (attachFile && attachFile.files.length > 0) {
      const fd = new FormData();
      fd.append('file', attachFile.files[0]);
      const upRes = await apiPost(`/api/events/${eventID}/attachments`, fd);
      if (!upRes.ok) {
        const upErr = await upRes.json();
        showError('Event saved, but attachment upload failed: ' + upErr.error);
      }
      attachFile.value = '';
    }
    // Handle inline alarm
    const alarmCb = document.getElementById('inlineAlarmEnabled');
    if (alarmCb && alarmCb.checked && !allDay) {
      const leadTime = parseInt(document.getElementById('inlineAlarmLeadTime').value, 10) || 0;
      const scope    = document.getElementById('inlineAlarmScope').value;
      const eventTime = new Date(payload.start_time);
      // Create alarm for current user
      await apiPost('/api/alarms', { event_id: eventID, lead_time: leadTime, event_time: eventTime.toISOString() });
      // If "all invited" and there are invited users, create alarms for them too (admin/oplead only)
      if (scope === 'all' && hasRole2(state.user.role, 'oplead') && invUserIDs.length > 0) {
        for (const uid of invUserIDs) {
          if (uid !== state.user.id) {
            await apiPost('/api/alarms', { event_id: eventID, lead_time: leadTime, event_time: eventTime.toISOString(), for_user_id: uid });
          }
        }
      }
    }
    closeModal('eventModal');
    await refreshAll();
    showNotification('success', t(id ? 'notif_event_updated' : 'notif_event_created'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
});
async function patchEventStatus(id, status, rejectionReason) {
  const res = await api('PATCH', `/api/events/${id}/status`, {status, rejection_reason: rejectionReason});
  if (res.ok) {
    await refreshAll();
    closeModal('detailModal');
    showNotification('success', t('notif_status_changed'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
async function deleteEvent(id) {
  const ev = state.events.find(x => x.id === id);
  if (ev && ev.is_recurring) {
    showRecurDeleteDialog(ev);
    return;
  }
  if (!confirm(t('confirm_delete_event'))) return;
  const res = await apiDel(`/api/events/${id}`);
  if (res.ok) {
    closeModal('eventModal'); closeModal('detailModal');
    await refreshAll();
    showNotification('success', t('notif_event_deleted'));
  } else { showError('Failed to delete event'); }
}
function showRecurDeleteDialog(ev) {
  const occTime = state._currentOccurrenceTime;
  const msg = occTime
    ? `"${ev.title}" — occurrence on ${fmtDateTime(occTime)}`
    : `"${ev.title}" — recurring series`;
  document.getElementById('recurDeleteMsg').textContent =
    `This is a recurring event. What would you like to delete?\n${msg}`;

  const thisBtn   = document.getElementById('recurDelThis');
  const futureBtn = document.getElementById('recurDelFuture');
  const allBtn    = document.getElementById('recurDelAll');

  // "Delete only this occurrence" (only shown when viewing a specific occurrence)
  thisBtn.style.display = occTime ? '' : 'none';
  thisBtn.onclick = async () => {
    if (!occTime) return;
    closeModal('recurDeleteModal');
    // Add occurrence to exclusion list
    const excl = [...(ev.recurrence_excl || []), occTime.toISOString()];
    const res = await apiPut(`/api/events/${ev.id}`, {...ev, recurrence_excl: excl});
    if (res.ok) {
      closeModal('eventModal'); closeModal('detailModal');
      await refreshAll();
      showNotification('success', t('notif_event_deleted'));
    } else { const err = await res.json(); showError(err.error); }
  };

  // "Delete this and all future"
  futureBtn.style.display = occTime ? '' : 'none';
  futureBtn.onclick = async () => {
    if (!occTime) return;
    closeModal('recurDeleteModal');
    // Set recurrence_end to just before this occurrence
    const newEnd = new Date(occTime.getTime() - 60000); // 1 min before
    const res = await apiPut(`/api/events/${ev.id}`, {...ev, recurrence_end: newEnd.toISOString()});
    if (res.ok) {
      closeModal('eventModal'); closeModal('detailModal');
      await refreshAll();
      showNotification('success', t('notif_event_deleted'));
    } else { const err = await res.json(); showError(err.error); }
  };

  // "Delete all occurrences"
  allBtn.onclick = async () => {
    closeModal('recurDeleteModal');
    const res = await apiDel(`/api/events/${ev.id}`);
    if (res.ok) {
      closeModal('eventModal'); closeModal('detailModal');
      await refreshAll();
      showNotification('success', t('notif_event_deleted'));
    } else { showError('Failed to delete event'); }
  };

  openModal('recurDeleteModal');
}
function showEventDetail(ev) {
  document.getElementById('detailTitle').textContent = ev.title;
  const lang   = state.preferences.language || 'en';
  const et     = state.eventTypes.find(x => x.key===ev.event_type);
  const etLbl  = et ? (lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label) : ev.event_type;
  const evStart = new Date(ev.start_time);
  const evEnd   = ev.end_time ? new Date(ev.end_time) : null;
  const layer   = ev.layer_id ? state.layers.find(l => l.id===ev.layer_id) : null;

  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="width:12px;height:12px;border-radius:3px;background:${ev.color};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1">
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${etLbl}</div>
        ${ev.description ? `<div style="color:var(--text);margin-bottom:10px">${escHtml(ev.description)}</div>` : ''}
        <div style="font-size:var(--fs-sm);color:var(--text-dim);display:grid;grid-template-columns:auto 1fr;gap:3px 10px">
          <b>${t('detail_start')}:</b><span>${fmtDateTime(evStart)}</span>
          ${evEnd ? `<b>${t('detail_end')}:</b><span>${fmtDateTime(evEnd)}</span>` : ''}
          ${ev.is_recurring ? `<b>${t('detail_repeats')}:</b><span>${t('event_pattern_'+(ev.recurrence_pattern||'weekly'))}</span>` : ''}
          ${layer ? `<b>${t('event_layer')}:</b><span>${escHtml(layer.name)}</span>` : ''}
          <b>${t('detail_created')}:</b><span>${escHtml(ev.created_by_name||'')}</span>
          <b>${t('detail_created_at')}:</b><span>${fmtDateTime(new Date(ev.created_at))}</span>
          ${(ev.updated_at && new Date(ev.updated_at) - new Date(ev.created_at) > 10000) ?
            `<b>${t('detail_updated_at')}:</b><span>${fmtDateTime(new Date(ev.updated_at))}</span>` : ''}
          <b>${t('event_status')}:</b><span><span class="status-badge status-${ev.status||'planned'}">${t('status_'+(ev.status||'planned'))}</span></span>
          ${ev.status==='verified' ? `<b>${t('status_verified_by')}:</b><span>${escHtml(ev.verified_by_name||'')} — ${ev.verified_at?fmtDateTime(new Date(ev.verified_at)):''}</span>` : ''}
          ${ev.status==='rejected' ? `<b>${t('status_rejection_reason')}:</b><span style="color:var(--red)">${escHtml(ev.rejection_reason||'')}</span>` : ''}
        </div>
      </div>
    </div>
    <div id="attachmentSection" style="margin-top:14px">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${t('detail_attachments')}</div>
      <div id="attachmentList"><span style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</span></div>
      <label class="upload-zone" style="margin-top:8px;display:block" id="uploadZone">
        ${t('detail_upload')}
        <input type="file" id="attachFileInput" style="display:none">
      </label>
    </div>
    <div id="commentSection" style="margin-top:16px">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${t('detail_comments')}</div>
      <div id="commentList"><span style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</span></div>
      <div class="comment-input-row" style="margin-top:8px">
        <textarea id="commentText" placeholder="${t('comments_add')}"></textarea>
        <button class="btn btn-primary btn-sm" onclick="submitComment(${ev.id})">${t('comments_submit')}</button>
      </div>
    </div>
  `;

  // Load attachments
  apiGet(`/api/events/${ev.id}/attachments`).then(atts => {
    const listEl = document.getElementById('attachmentList');
    if (!listEl) return;
    if (!atts || atts.length===0) {
      listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('detail_no_attachments')}</div>`;
    } else {
      listEl.innerHTML = `<div class="attachment-list">${atts.map(a => `
        <div class="attachment-item">
          <span class="attachment-icon">📄</span>
          <span class="attachment-name" title="${escHtml(a.filename)}">${escHtml(a.filename)}</span>
          <span class="attachment-size">${fmtFileSize(a.size)}</span>
          <a href="/api/attachments/${a.id}" class="btn btn-secondary btn-sm" download="${escHtml(a.filename)}">${t('detail_download')}</a>
          ${state.user && (state.user.id===a.uploaded_by || state.user.role==='admin') ?
            `<button class="btn btn-danger btn-sm" onclick="deleteAttachment(${a.id},${ev.id})">✕</button>` : ''}
        </div>
      `).join('')}</div>`;
    }
  });

  // File upload
  const fileInput = document.getElementById('attachFileInput');
  if (fileInput) {
    fileInput.onchange = async () => {
      if (!fileInput.files.length) return;
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      const res = await apiPost(`/api/events/${ev.id}/attachments`, fd);
      if (res.ok) {
        showNotification('success', 'File attached');
        showEventDetail(ev); // refresh
      } else {
        const err = await res.json();
        showError('Upload failed: ' + err.error);
      }
    };
  }

  // Load comments
  apiGet(`/api/events/${ev.id}/comments`).then(comments => {
    const listEl = document.getElementById('commentList');
    if (!listEl) return;
    if (!comments || comments.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('comments_none')}</div>`;
    } else {
      listEl.innerHTML = comments.map(c => `
        <div class="comment-item${c.pending_approval?' comment-pending':''}">
          <div class="comment-header">
            <span class="comment-author">${escHtml(c.author_name)}</span>
            <span class="comment-ts">${fmtDateTime(new Date(c.created_at))}</span>
            ${c.pending_approval ? `<span class="comment-pending-badge">${t('comments_pending')}</span>` : ''}
            ${c.status_change ? `<span class="status-badge status-${c.status_change}" style="margin-left:4px">${t('status_'+c.status_change)}</span>` : ''}
          </div>
          <div class="comment-text">${escHtml(c.content)}</div>
          <div style="display:flex;gap:4px;margin-top:4px">
            ${state.user && (state.user.id===c.author_id || state.user.role==='admin') ?
              `<button class="btn btn-danger btn-sm" onclick="deleteComment(${c.id},${ev.id})">✕</button>` : ''}
            ${c.pending_approval && state.user && hasRole2(state.user.role,'teamlead') ?
              `<button class="btn btn-sm" style="background:var(--green)" onclick="approveComment(${c.id},${ev.id})">✓ ${t('comments_approve')}</button>` : ''}
          </div>
        </div>
      `).join('');
    }
  });

  const footer = document.getElementById('detailFooter');
  footer.innerHTML = '';

  const alarmBtn = document.createElement('button');
  alarmBtn.className = 'btn btn-secondary btn-sm';
  alarmBtn.textContent = t('detail_set_alarm');
  alarmBtn.onclick = () => { closeModal('detailModal'); openAlarmModal(ev); };
  footer.appendChild(alarmBtn);

  // Verify / Reject (teamlead+)
  if (state.user && hasRole2(state.user.role, 'teamlead') && ev.status !== 'verified' && ev.status !== 'cancelled') {
    const verBtn = document.createElement('button');
    verBtn.className = 'btn btn-sm';
    verBtn.style.background = 'var(--green)';
    verBtn.textContent = '✓ ' + t('status_verify');
    verBtn.onclick = () => patchEventStatus(ev.id, 'verified', '');
    footer.appendChild(verBtn);

    const rejBtn = document.createElement('button');
    rejBtn.className = 'btn btn-danger btn-sm';
    rejBtn.textContent = '✕ ' + t('status_reject');
    rejBtn.onclick = () => {
      const reason = prompt(t('status_rejection_prompt'));
      if (reason === null) return;
      if (!reason.trim()) { showError(t('status_rejection_required'), 'Validation'); return; }
      patchEventStatus(ev.id, 'rejected', reason.trim());
    };
    footer.appendChild(rejBtn);
  }

  // Show lock warning if event is within a locked slot
  const eventLock = getEventLock(ev);
  if (eventLock) {
    const lockInfo = document.createElement('div');
    lockInfo.style.cssText = 'background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.4);border-radius:var(--radius);padding:8px 12px;font-size:var(--fs-sm);color:var(--red);margin-bottom:8px;';
    const scopeLabel = { all:'all layers & master', master:'master timeline', layer:'this layer' }[eventLock.scope||'all'] || 'all';
    lockInfo.innerHTML = `🔒 <b>Locked</b> — This time slot is locked (applies to ${scopeLabel}). ${eventLock.reason ? 'Reason: '+escHtml(eventLock.reason) : ''}<br>No editing, moving, or deleting is permitted.`;
    body.appendChild(lockInfo);
  }

  // Edit/Delete (creator or readwrite+ on layers, oplead+ on master)
  const isMaster = !ev.layer_id;
  const canEdit = !isEventLocked(ev) && state.user && (
    state.user.role === 'admin' ||
    (!isMaster && (state.user.role === 'readwrite' || state.user.role === 'teamlead' || state.user.id === ev.created_by)) ||
    (isMaster && hasRole2(state.user.role, 'oplead'))
  );
  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary btn-sm';
    editBtn.textContent = t('detail_edit');
    editBtn.onclick = () => { closeModal('detailModal'); openEventModal(ev); };
    footer.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.textContent = t('detail_delete');
    delBtn.onclick = () => deleteEvent(ev.id);
    footer.appendChild(delBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = t('detail_close');
  closeBtn.onclick = () => closeModal('detailModal');
  footer.appendChild(closeBtn);

  openModal('detailModal');
}
async function submitComment(eventId) {
  const textarea = document.getElementById('commentText');
  const content  = textarea ? textarea.value.trim() : '';
  if (!content) return;
  const res = await apiPost(`/api/events/${eventId}/comments`, {content});
  if (res.ok) {
    if (textarea) textarea.value = '';
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
    showNotification('success', t('notif_saved'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
async function deleteComment(commentId, eventId) {
  if (!confirm(t('confirm_delete')||'Delete this comment?')) return;
  const res = await apiDel(`/api/comments/${commentId}`);
  if (res.ok) {
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
  }
}
async function approveComment(commentId, eventId) {
  const res = await apiPost(`/api/comments/${commentId}/approve`, {});
  if (res.ok) {
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
    await refreshAll();
    showNotification('success', t('notif_saved'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
async function deleteAttachment(id, eventId) {
  if (!confirm(t('confirm_delete_attachment'))) return;
  const res = await apiDel(`/api/attachments/${id}`);
  if (res.ok) {
    // Re-open detail of same event
    const ev = state.events.find(e => e.id === eventId);
    if (ev) showEventDetail(ev);
  }
}
function openAlarmModal(ev) {
  document.getElementById('alarmEventId').value = ev.id;
  document.getElementById('alarmEventTitle').value = ev.title;
  document.getElementById('alarmEventTime').value = fmtDateTime(new Date(ev.start_time));
  document.getElementById('alarmLeadTime').value = '5';
  openModal('alarmModal');
}
document.getElementById('btnSaveAlarm').addEventListener('click', async () => {
  const eventId  = parseInt(document.getElementById('alarmEventId').value, 10);
  const leadTime = parseInt(document.getElementById('alarmLeadTime').value, 10);
  const res = await apiPost('/api/alarms', {event_id: eventId, lead_time: leadTime});
  if (res.ok) {
    closeModal('alarmModal');
    await fetchAlarms(); renderSidebar();
    showNotification('success', t('notif_alarm_set'));
  } else { const err = await res.json(); showError(err.error); }
});
async function deleteAlarm(id) {
  const res = await apiDel(`/api/alarms/${id}`);
  if (res.ok) { await fetchAlarms(); renderSidebar(); showNotification('success', t('notif_alarm_removed')); }
}
document.getElementById('btnAddLock').addEventListener('click', () => {
  const now = new Date();
  document.getElementById('lockStart').value = fmtDateInput(now);
  document.getElementById('lockEnd').value   = fmtDateInput(addHours(now, 1));
  document.getElementById('lockReason').value = '';
  openLockModal();
});
function onLockScopeChange() {
  const scope = document.getElementById('lockScope').value;
  document.getElementById('lockLayerGroup').style.display = scope === 'layer' ? '' : 'none';
}
function openLockModal() {
  const sel = document.getElementById('lockLayerSelect');
  if (sel) {
    sel.innerHTML = state.layers.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
  }
  document.getElementById('lockScope').value = 'all';
  document.getElementById('lockLayerGroup').style.display = 'none';
  openModal('lockModal');
}
document.getElementById('btnSaveLock').addEventListener('click', async () => {
  const sv = document.getElementById('lockStart').value;
  const ev = document.getElementById('lockEnd').value;
  if (!sv||!ev) { showError('Start and end required', 'Validation'); return; }
  const scope = document.getElementById('lockScope').value;
  let layerID = null;
  if (scope === 'layer') {
    const lv = document.getElementById('lockLayerSelect').value;
    if (!lv) { showError('Please select a layer', 'Validation'); return; }
    layerID = parseInt(lv, 10);
  }
  const res = await apiPost('/api/locks', {
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    reason:     document.getElementById('lockReason').value,
    scope,
    layer_id:   layerID,
  });
  if (res.ok) {
    closeModal('lockModal'); await fetchLocks(); renderTimeline();
    showNotification('success', t('notif_locked'));
  } else { const err = await res.json(); showError(err.error); }
});
async function deleteLock(id) {
  if (!confirm(t('confirm_delete_lock'))) return;
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) { await fetchLocks(); renderTimeline(); showNotification('success', t('notif_unlocked')); }
}
async function openUserModal(user) {
  const isEdit = !!user;
  document.getElementById('userModalTitle').textContent = isEdit ? t('user_edit') : t('user_add');
  document.getElementById('userId').value = user ? user.id : '';
  document.getElementById('uUsername').value = user ? user.username : '';
  document.getElementById('uUsername').disabled = isEdit;
  document.getElementById('uPassword').value = '';
  document.getElementById('uDisplayName').value = user ? (user.display_name||'') : '';
  document.getElementById('uRole').value = user ? user.role : 'read';
  document.getElementById('uCanLock').checked = user ? user.can_lock : false;
  const delBtn = document.getElementById('btnDeleteUser');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteUser(user.id) : null;

  // Populate group picker
  const picker = document.getElementById('uGroupPicker');
  if (picker && state.groups.length > 0) {
    let currentMemberIDs = new Set();
    if (isEdit && user.id) {
      try {
        const members = await apiGet(`/api/users/${user.id}/groups`);
        if (members) members.forEach(m => currentMemberIDs.add(m.group_id || m));
      } catch { /* ignore */ }
    }
    picker.innerHTML = state.groups.map(g => `
      <label class="group-chip" style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer;font-size:var(--fs-xs);margin:2px">
        <input type="checkbox" name="uGroup" value="${g.id}" ${currentMemberIDs.has(g.id)?'checked':''} style="accent-color:var(--accent)">
        ${escHtml(g.name)}
      </label>`).join('');
  } else if (picker) {
    picker.innerHTML = `<span style="color:var(--text-dim);font-size:var(--fs-xs)">No groups available.</span>`;
  }

  openModal('userModal');
}
document.getElementById('btnSaveUser').addEventListener('click', async () => {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uPassword').value;
  const displayName = document.getElementById('uDisplayName').value.trim();
  const role = document.getElementById('uRole').value;
  const canLock = document.getElementById('uCanLock').checked;
  if (!id && (!username||!password)) { showError('Username and password required', 'Validation'); return; }
  const groupIDs = [...document.querySelectorAll('input[name="uGroup"]:checked')].map(cb => parseInt(cb.value, 10));
  const payload = {display_name:displayName, role, can_lock:canLock, group_ids:groupIDs};
  if (!id) { payload.username=username; payload.password=password; }
  if (id&&password) { payload.password=password; }
  const res = id ? await apiPut(`/api/users/${id}`, payload) : await apiPost('/api/users', payload);
  if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { const err = await res.json(); showError(err.error); }
});
async function deleteUser(id) {
  if (!confirm(t('confirm_delete_user'))) return;
  const res = await apiDel(`/api/users/${id}`);
  if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { showError('Failed to delete user'); }
}
function openGroupModal(group) {
  const isEdit = !!group;
  document.getElementById('groupModalTitle').textContent = isEdit ? 'Edit Group' : t('groups_add').replace('+ ','');
  document.getElementById('groupId').value = group ? group.id : '';
  document.getElementById('groupName').value = group ? group.name : '';
  document.getElementById('groupDesc').value = group ? (group.description||'') : '';
  const delBtn = document.getElementById('btnDeleteGroup');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteGroup(group.id) : null;
  openModal('groupModal');
}
document.getElementById('btnSaveGroup').addEventListener('click', async () => {
  const id = document.getElementById('groupId').value;
  const name = document.getElementById('groupName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  const payload = {name, description: document.getElementById('groupDesc').value};
  const res = id ? await apiPut(`/api/groups/${id}`, payload) : await apiPost('/api/groups', payload);
  if (res.ok) { closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved')); }
  else { const err = await res.json(); showError(err.error); }
});
async function deleteGroup(id) {
  if (!confirm(t('confirm_delete_group'))) return;
  const res = await apiDel(`/api/groups/${id}`);
  if (res.ok) { closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved')); }
}
async function openMemberModal(group) {
  document.getElementById('memberModalTitle').textContent = `${escHtml(group.name)} — ${t('groups_members')}`;
  const body = document.getElementById('memberModalBody');
  body.innerHTML = `<div style="color:var(--text-dim);padding:8px">Loading…</div>`;
  openModal('memberModal');

  const [members, users] = await Promise.all([
    apiGet(`/api/groups/${group.id}/members`),
    apiGet('/api/users'),
  ]);

  const userMap = {};
  (users||[]).forEach(u => { userMap[u.id] = u; });
  const memberIDs = new Set((members||[]).map(m => m.user_id));
  const nonMembers = (users||[]).filter(u => !memberIDs.has(u.id));

  const memberRows = (members||[]).map(m => {
    const u = userMap[m.user_id];
    const name = u ? (u.display_name || u.username) : `User #${m.user_id}`;
    const role = u ? u.role : 'read';
    return `<div class="member-item">
      <span class="member-name">${escHtml(name)}</span>
      <span class="role-badge role-${role}" style="font-size:var(--fs-xs)">${t('role_'+role)||role}</span>
      <span style="font-size:var(--fs-xs);color:var(--text-dim)">(${escHtml(m.role)})</span>
      <button class="btn btn-danger btn-sm" onclick="removeGroupMember(${group.id},${m.user_id})" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');

  const addMemberForm = nonMembers.length > 0 ? `
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">${t('groups_add_member')}</div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="flex:1;min-width:120px;margin:0">
          <label style="font-size:var(--fs-sm);color:var(--text-dim)">User</label>
          <select id="addMemberUser">
            ${nonMembers.map(u => `<option value="${u.id}">${escHtml(u.display_name||u.username)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:90px">
          <label style="font-size:var(--fs-sm);color:var(--text-dim)">Role</label>
          <select id="addMemberRole">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="addGroupMember(${group.id})">${t('btn_add')}</button>
      </div>
    </div>` : '';

  body.innerHTML = `
    <div>
      <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">${t('groups_members')}</div>
      <div class="member-list">
        ${(members||[]).length === 0
          ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No members yet.</div>`
          : memberRows}
      </div>
    </div>
    ${addMemberForm}
  `;
}
async function addGroupMember(groupID) {
  const userID = parseInt(document.getElementById('addMemberUser').value, 10);
  const role   = document.getElementById('addMemberRole').value;
  const res = await apiPost(`/api/groups/${groupID}/members`, {user_id: userID, role});
  if (res.ok) {
    const group = state.groups.find(g => g.id === groupID);
    if (group) openMemberModal(group);
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
}
async function removeGroupMember(groupID, userID) {
  if (!confirm('Remove this member from the group?')) return;
  const res = await apiDel(`/api/groups/${groupID}/members/${userID}`);
  if (res.ok) {
    const group = state.groups.find(g => g.id === groupID);
    if (group) openMemberModal(group);
    showNotification('success', t('notif_saved'));
  } else { showError('Failed to remove member'); }
}
function openLayerModal(layer) {
  const isEdit = !!layer;
  document.getElementById('layerModalTitle').textContent = isEdit ? 'Edit Layer' : t('layers_add').replace('+ ','');
  document.getElementById('layerId').value = layer ? layer.id : '';
  document.getElementById('layerName').value = layer ? layer.name : '';
  document.getElementById('layerDesc').value = layer ? (layer.description||'') : '';
  document.getElementById('layerColor').value = layer ? (layer.color||'#4A90D9') : '#4A90D9';

  const visSel   = document.getElementById('layerVisibility');
  const permSel  = document.getElementById('layerPermission');
  const grpGroup = document.getElementById('layerGroupsGroup');
  visSel.value  = layer ? layer.visibility : 'private';
  permSel.value = layer ? layer.permission : 'read';

  // Show/hide group section based on visibility
  const updateGroupsVis = () => {
    grpGroup.style.display = visSel.value === 'groups' ? '' : 'none';
  };
  visSel.onchange = updateGroupsVis;
  updateGroupsVis();

  // Populate group checkboxes
  const selectedGroups = layer ? (layer.group_ids||[]) : [];
  const groupCheckboxes = document.getElementById('layerGroupCheckboxes');
  if (state.groups.length === 0) {
    groupCheckboxes.innerHTML = `<span style="color:var(--text-dim);font-size:var(--fs-sm)">No groups available. Create groups first.</span>`;
  } else {
    groupCheckboxes.innerHTML = state.groups.map(g => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" name="layerGroup" value="${g.id}" ${selectedGroups.includes(g.id)?'checked':''} style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0">
        <span style="font-size:var(--fs-sm);color:var(--text)">${escHtml(g.name)}</span>
        ${g.description ? `<span style="color:var(--text-dim);font-size:var(--fs-xs)">${escHtml(g.description)}</span>` : ''}
      </label>
    `).join('');
  }

  const delBtn = document.getElementById('btnDeleteLayer');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteLayer(layer.id) : null;
  openModal('layerModal');
}
document.getElementById('btnSaveLayer').addEventListener('click', async () => {
  const id = document.getElementById('layerId').value;
  const name = document.getElementById('layerName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  const groupIDs = [...document.querySelectorAll('input[name="layerGroup"]:checked')]
    .map(cb => parseInt(cb.value, 10));
  const payload = {
    name, description: document.getElementById('layerDesc').value,
    color: document.getElementById('layerColor').value,
    visibility: document.getElementById('layerVisibility').value,
    permission: document.getElementById('layerPermission').value,
    group_ids: groupIDs,
  };
  const res = id ? await apiPut(`/api/layers/${id}`, payload) : await apiPost('/api/layers', payload);
  if (res.ok) {
    closeModal('layerModal'); await fetchLayers(); renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});
async function deleteLayer(id) {
  if (!confirm(t('confirm_delete_layer'))) return;
  const res = await apiDel(`/api/layers/${id}`);
  if (res.ok) {
    closeModal('layerModal'); await fetchLayers();
    state.preferences.active_layers = (state.preferences.active_layers||[]).filter(x => x!==id);
    await savePreferences(); renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  }
}
function openEtypeModal(et) {
  const isEdit = !!et;
  document.getElementById('etypeModalTitle').textContent = isEdit ? 'Edit Event Type' : 'New Event Type';
  document.getElementById('etypeId').value = et ? et.id : '';
  document.getElementById('etypeKey').value = et ? et.key : '';
  document.getElementById('etypeKey').disabled = isEdit;
  document.getElementById('etypeLabel').value   = et ? et.label    : '';
  document.getElementById('etypeLabelSV').value = et ? (et.label_sv||'') : '';
  document.getElementById('etypeLabelFR').value = et ? (et.label_fr||'') : '';
  document.getElementById('etypeColor').value   = et ? et.color : '#4A90D9';
  const delBtn = document.getElementById('btnDeleteEtype');
  const canDel = isEdit && !et.is_system;
  delBtn.style.display = canDel ? '' : 'none';
  delBtn.onclick = canDel ? () => deleteEtype(et.id) : null;
  openModal('etypeModal');
}
document.getElementById('btnSaveEtype').addEventListener('click', async () => {
  const id    = document.getElementById('etypeId').value;
  const key   = document.getElementById('etypeKey').value.trim().replace(/\s+/g,'_');
  const label = document.getElementById('etypeLabel').value.trim();
  if (!label || (!id && !key)) { showError('Key and label required', 'Validation'); return; }
  const payload = {
    key, label,
    label_sv: document.getElementById('etypeLabelSV').value,
    label_fr: document.getElementById('etypeLabelFR').value,
    color:    document.getElementById('etypeColor').value,
  };
  const res = id ? await apiPut(`/api/event-types/${id}`, payload) : await apiPost('/api/event-types', payload);
  if (res.ok) {
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});
async function deleteEtype(id) {
  if (!confirm(t('confirm_delete_type'))) return;
  const res = await apiDel(`/api/event-types/${id}`);
  if (res.ok) {
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
}
function openPhaseModal(ph) {
  const isEdit = !!ph;
  document.getElementById('phaseModalTitle').textContent = isEdit ? (t('phase_edit')||'Edit Phase') : (t('phase_add')||'New Phase');
  document.getElementById('phaseId').value    = ph ? ph.id : '';
  document.getElementById('phaseName').value  = ph ? ph.name : '';
  document.getElementById('phaseColor').value = ph ? (ph.color||'#4A90D9') : '#4A90D9';
  document.getElementById('phaseOrder').value = ph ? ph.order : 0;
  document.getElementById('phaseStart').value = ph ? fmtDateInput(new Date(ph.start_time)) : fmtDateInput(state.startDate);
  document.getElementById('phaseEnd').value   = ph ? fmtDateInput(new Date(ph.end_time))   : fmtDateInput(addDays(state.startDate, 1));
  // Layer selector for phase
  const phaseLaySel = document.getElementById('phaseLayer');
  if (phaseLaySel) {
    const myLayers = state.layers.filter(l => l.owner_id===state.user.id || hasRole2(state.user.role,'oplead'));
    phaseLaySel.innerHTML = `<option value="">— Master Timeline —</option>` +
      myLayers.map(l => `<option value="${l.id}" ${ph && ph.layer_id===l.id?'selected':''}>${escHtml(l.name)}</option>`).join('');
  }
  const delBtn = document.getElementById('btnDeletePhase');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deletePhase(ph.id) : null;
  openModal('phaseModal');
}
document.getElementById('btnSavePhase').addEventListener('click', async () => {
  const id    = document.getElementById('phaseId').value;
  const name  = document.getElementById('phaseName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  const sv = document.getElementById('phaseStart').value;
  const ev = document.getElementById('phaseEnd').value;
  if (!sv || !ev) { showError('Start and end required', 'Validation'); return; }
  const phaseLayVal = document.getElementById('phaseLayer')?.value;
  const payload = {
    name, color: document.getElementById('phaseColor').value,
    order: parseInt(document.getElementById('phaseOrder').value, 10) || 0,
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    layer_id:   phaseLayVal ? parseInt(phaseLayVal, 10) : null,
  };
  const res = id ? await apiPut(`/api/phases/${id}`, payload) : await apiPost('/api/phases', payload);
  if (res.ok) {
    closeModal('phaseModal');
    await fetchPhases();
    renderSidebar();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});
async function deletePhase(id) {
  if (!confirm(t('confirm_delete')||'Delete this phase?')) return;
  const res = await apiDel(`/api/phases/${id}`);
  if (res.ok) {
    closeModal('phaseModal');
    await fetchPhases();
    renderSidebar();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  }
}
function renderSidebar() {
  const tab  = state.sidebarTab;
  const el   = document.getElementById('sidebarContent');
  const lang = state.preferences.language || 'en';

  if (tab === 'legend') {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('event_types_title')}
          ${state.user&&hasRole2(state.user.role,'readwrite') ? `<button class="btn btn-primary btn-sm" onclick="openEtypeModal(null)">${t('event_types_add')}</button>` : ''}
        </div>
        <div class="legend-list">
          ${state.eventTypes.map(et => {
            const lbl = lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label;
            const hidden = isTypeHidden(et.key);
            return `<div class="legend-item${hidden?' hidden-type':''}" onclick="toggleType('${et.key}')">
              <div class="legend-swatch" style="background:${et.color}"></div>
              <span class="legend-label">${escHtml(lbl)}</span>
              <span class="legend-eye">${hidden?'👁‍🗨':'👁'}</span>
              ${state.user&&(state.user.role==='admin'||(et.created_by&&et.created_by===state.user.id)) ?
                `<button class="btn btn-ghost btn-icon" style="font-size:11px;padding:0 3px" onclick="event.stopPropagation();openEtypeModal(${JSON.stringify(et).replace(/"/g,'&quot;')})">✏️</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('info_range')}</div>
        <div style="font-size:var(--fs-sm);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
          <span style="color:var(--text-dim)">${t('info_from')}:</span><span>${localShortDate(state.startDate)}</span>
          <span style="color:var(--text-dim)">${t('info_to')}:</span><span>${localShortDate(addDays(state.startDate, getRangeDays()-1))}</span>
          <span style="color:var(--text-dim)">${t('info_events')}:</span><span>${state.events.filter(e=>!isTypeHidden(e.event_type)).length}</span>
          <span style="color:var(--text-dim)">${t('info_locks')}:</span><span>${state.locks.length}</span>
        </div>
      </div>
    `;
  } else if (tab === 'alarms') {
    const active = state.alarms.filter(a => !a.fired);
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('tab_alarms')}</div>
        ${active.length === 0
          ? `<div style="color:var(--text-dim);font-size:var(--fs-sm);white-space:pre-line">${t('alarms_none')}</div>`
          : `<div class="alarm-list">${active.map(a => `
            <div class="alarm-item">
              <div class="alarm-title">${escHtml(a.event_title)}</div>
              <div class="alarm-meta">📅 ${fmtDateTime(new Date(a.event_time))}<br>🔔 ${a.lead_time>0?a.lead_time+' min before':'At event time'}</div>
              <div class="alarm-actions"><button class="btn btn-danger btn-sm" onclick="deleteAlarm(${a.id})">${t('btn_remove')}</button></div>
            </div>`).join('')}</div>`
        }
      </div>
    `;
  } else if (tab === 'layers') {
    const myLayers     = state.layers.filter(l => l.owner_id === state.user.id);
    const sharedLayers = state.layers.filter(l => l.owner_id !== state.user.id);
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_master')}
        </div>
        <div class="layer-list">
          <div class="layer-item${!(state.preferences.hidden_layers&&state.preferences.hidden_layers.length>0)?' active':''}" onclick="toggleAllLayers()">
            <div class="layer-swatch" style="background:var(--accent)"></div>
            <span class="layer-name">${t('layers_master')}</span>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_my')}
          <button class="btn btn-primary btn-sm" onclick="openLayerModal(null)">${t('layers_add')}</button>
        </div>
        <div class="layer-list">
          ${myLayers.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No layers yet.</div>` : ''}
          ${myLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" onclick="toggleLayer(${l.id})">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${l.visibility}</span>
              <button class="btn btn-ghost btn-icon" style="font-size:11px" onclick="event.stopPropagation();openLayerModal(${JSON.stringify(l).replace(/"/g,'&quot;')})">✏️</button>
            </div>`;
          }).join('')}
        </div>
      </div>
      ${sharedLayers.length ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('layers_shared')}</div>
        <div class="layer-list">
          ${sharedLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" onclick="toggleLayer(${l.id})">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${escHtml(l.owner_name||'')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  } else if (tab === 'users' && state.user && state.user.role==='admin') {
    apiGet('/api/users').then(users => {
      el.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            ${t('tab_users')}
            <button class="btn btn-primary btn-sm" onclick="openUserModal(null)">${t('btn_add')}</button>
          </div>
          <div class="user-list">
            ${(users||[]).map(u => `
              <div class="user-item">
                <div class="user-name">
                  <div>${escHtml(u.display_name||u.username)}</div>
                  <div style="font-size:var(--fs-xs);color:var(--text-dim)">@${escHtml(u.username)}</div>
                </div>
                <span class="role-badge role-${u.role}">${t('role_'+u.role)||u.role}</span>
                ${u.can_lock?'<span title="Can lock">🔒</span>':''}
                <button class="btn btn-ghost btn-icon" onclick='openUserModal(${JSON.stringify(u).replace(/'/g,"&#39;")})'>✏️</button>
              </div>`).join('')}
          </div>
        </div>
      `;
    });
  } else if (tab === 'groups' && state.user && hasRole2(state.user.role,'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('groups_title')}
          <button class="btn btn-primary btn-sm" onclick="openGroupModal(null)">${t('groups_add')}</button>
        </div>
        <div class="group-list">
          ${state.groups.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No groups yet.</div>` : ''}
          ${state.groups.map(g => `
            <div class="group-item">
              <div class="group-name">
                <div>${escHtml(g.name)}</div>
                ${g.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(g.description)}</div>` : ''}
              </div>
              <button class="btn btn-ghost btn-icon btn-sm" onclick='openMemberModal(${JSON.stringify(g).replace(/'/g,"&#39;")})' title="${t('groups_members')}">👥</button>
              <button class="btn btn-ghost btn-icon" onclick='openGroupModal(${JSON.stringify(g).replace(/'/g,"&#39;")})' title="Edit">✏️</button>
            </div>`).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'phases' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('tab_phases')||'Exercise Phases'}
          <button class="btn btn-primary btn-sm" onclick="openPhaseModal(null)">${t('btn_add')||'+ Add'}</button>
        </div>
        <div class="phase-list">
          ${state.phases.length === 0
            ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('phases_none')||'No phases defined.'}</div>`
            : state.phases.sort((a,b)=>a.order-b.order).map(ph => `
              <div class="phase-item" style="border-left:4px solid ${ph.color};padding:6px 8px;margin-bottom:6px;background:var(--bg2);border-radius:var(--radius)">
                <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text)">${escHtml(ph.name)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-dim)">${fmtDateTime(new Date(ph.start_time))} – ${fmtDateTime(new Date(ph.end_time))}</div>
                <div style="display:flex;gap:4px;margin-top:4px">
                  <button class="btn btn-ghost btn-sm" onclick='openPhaseModal(${JSON.stringify(ph).replace(/'/g,"&#39;")})'>✏️</button>
                  <button class="btn btn-danger btn-sm" onclick="deletePhase(${ph.id})">✕</button>
                </div>
              </div>`).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'audit' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `<div class="sidebar-section"><div class="sidebar-section-title">${t('tab_audit')}</div><div id="auditLog" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">Loading…</em></div></div>`;
    apiGet('/api/audit?limit=200').then(entries => {
      const container = document.getElementById('auditLog');
      if (!container) return;
      if (!entries || entries.length === 0) {
        container.innerHTML = `<em style="color:var(--text-dim)">${t('audit_empty')}</em>`;
        return;
      }
      container.innerHTML = `<div class="audit-list">${entries.map(e => `
        <div class="audit-item">
          <span class="audit-ts">${fmtDateTime(new Date(e.timestamp))}</span>
          <span class="audit-user">${escHtml(e.user_name)}</span>
          <span class="audit-action audit-action-${e.action}">${escHtml(e.action)}</span>
          <span class="audit-summary">${escHtml(e.summary)}</span>
        </div>`).join('')}
      </div>`;
    });
  } else if (tab === 'settings') {
    const p  = state.preferences;
    const ex = state.exercise || {};
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_theme')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.theme==='dark'?' active':''}" onclick="setPref('theme','dark')">${t('theme_dark')}</button>
          <button class="toggle-btn${p.theme==='light'?' active':''}" onclick="setPref('theme','light')">${t('theme_light')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_size')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.size==='small'?' active':''}" onclick="setPref('size','small')">${t('size_small')}</button>
          <button class="toggle-btn${p.size==='normal'?' active':''}" onclick="setPref('size','normal')">${t('size_normal')}</button>
          <button class="toggle-btn${p.size==='large'?' active':''}" onclick="setPref('size','large')">${t('size_large')}</button>
          <button class="toggle-btn${p.size==='huge'?' active':''}" onclick="setPref('size','huge')">${t('size_huge')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_language')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.language==='en'?' active':''}" onclick="setPref('language','en')">EN</button>
          <button class="toggle-btn${p.language==='sv'?' active':''}" onclick="setPref('language','sv')">SV</button>
          <button class="toggle-btn${p.language==='fr'?' active':''}" onclick="setPref('language','fr')">FR</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_day_hours')}</div>
        <div class="hour-range">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH" style="width:52px" onchange="setHourPref()">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH" style="width:52px" onchange="setHourPref()">
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_webhook')}</div>
        <div class="form-group" style="margin-bottom:6px">
          <select id="prefWebhookType" style="width:100%;margin-bottom:4px">
            <option value="generic"${p.webhook_type==='generic'||!p.webhook_type?' selected':''}>Generic JSON</option>
            <option value="mattermost"${p.webhook_type==='mattermost'?' selected':''}>Mattermost / Slack</option>
          </select>
          <input type="url" id="prefWebhookURL" placeholder="https://…/webhook" value="${escHtml(p.webhook_url||'')}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" onclick="saveWebhookPref()">${t('btn_save')}</button>
          <button class="btn btn-secondary btn-sm" onclick="testWebhook()">${t('settings_webhook_test')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_view')||'Default View'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','2days','3days','4days','week'].map(v =>
            `<button class="toggle-btn${(p.default_view||'week')===v?' active':''}" onclick="setDefaultView('${v}')">${t('range_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_date_format')||'Date / Time Format'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${[['iso','ISO 8601'],['uk','UK'],['fr','FR'],['sv','SV']].map(([v,l]) =>
            `<button class="toggle-btn${(p.date_format||'iso')===v?' active':''}" onclick="setPref('date_format','${v}')">${l}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_out_of_hours')||'Out-of-Hours Area'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefShowOOH" ${p.show_out_of_hours!==false?'checked':''} onchange="setOOHPref(this.checked)"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_out_of_hours')||'Show ghosted area outside day hours'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_red_line')||'Current-time Line'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="prefRedLine" ${p.red_line_enabled!==false?'checked':''} onchange="setRedLinePref()"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_red_line_enabled')||'Show current-time line'}
        </label>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;font-size:var(--fs-xs);color:var(--text-dim)">
          <span>${t('settings_red_line_color')||'Color'}:</span>
          <input type="color" id="prefLineColor" value="${p.red_line_color||'#E74C3C'}" onchange="setRedLinePref()"
            style="width:32px;height:22px;padding:0;border:none;background:transparent;cursor:pointer">
          <span>${t('settings_red_line_width')||'Width'}:</span>
          <input type="number" id="prefLineWidth" min="1" max="8" value="${p.red_line_width||2}" onchange="setRedLinePref()"
            style="width:52px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <span>${t('settings_red_line_style')||'Style'}:</span>
          <select id="prefLineStyle" onchange="setRedLinePref()"
            style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            <option value="solid" ${(p.red_line_style||'solid')==='solid'?'selected':''}>Solid</option>
            <option value="dashed" ${p.red_line_style==='dashed'?'selected':''}>Dashed</option>
            <option value="dotted" ${p.red_line_style==='dotted'?'selected':''}>Dotted</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:8px">
          <input type="checkbox" id="prefSynthLabel" ${p.synth_label?'checked':''} onchange="setSynthLabelPref(this.checked)"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
        </label>
      </div>
      ${synthActive() ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('freeze_label')||'Timeline Freeze'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:0 0 8px">${state.timelinePaused ? (t('freeze_active')||'Timeline is frozen.') : (t('freeze_desc')||'Freeze progression for exercise review.')}</p>
        <button class="btn btn-sm ${state.timelinePaused?'btn-danger':'btn-secondary'}" onclick="toggleFreeze()">
          ${state.timelinePaused ? ('▶ '+(t('btn_resume')||'Resume')) : ('⏸ '+(t('btn_freeze')||'Freeze'))}
        </button>
      </div>` : ''}
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_exercise')}</div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_exercise_label')}</label>
          <input type="text" id="exLabel" value="${escHtml(ex.label||'')}" placeholder="${t('settings_exercise_label_ph')||'Exercise name…'}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">STARTEX — ${t('settings_exercise_epoch')}</label>
          <input type="datetime-local" id="exEpoch" value="${ex.epoch ? fmtDateInput(new Date(ex.epoch)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">ENDEX — ${t('settings_exercise_endex')||'End of exercise'}</label>
          <input type="datetime-local" id="exEndex" value="${ex.endex ? fmtDateInput(new Date(ex.endex)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="exEnabled" ${ex.enabled?'checked':''}>
          <label for="exEnabled" style="font-size:var(--fs-sm)">${t('settings_exercise_enable')}</label>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exDayHoursOnly" ${ex.day_hours_only?'checked':''}>
          <label for="exDayHoursOnly" style="font-size:var(--fs-sm)">${t('synth_day_hours_only')||'Day hours only'}</label>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveExercise()">${t('btn_save')}</button>
        ${state.user.role==='admin' ? `<a href="/admin-view" class="btn btn-secondary btn-sm" style="margin-left:4px">⚙ ${t('admin_view')||'Admin View'}</a>` : ''}
      </div>` : ''}
    `;
  }
}
async function saveWebhookPref() {
  state.preferences.webhook_url  = document.getElementById('prefWebhookURL').value.trim();
  state.preferences.webhook_type = document.getElementById('prefWebhookType').value;
  await savePreferences();
  showNotification('success', t('notif_saved'));
}
async function testWebhook() {
  const url  = document.getElementById('prefWebhookURL').value.trim();
  const type = document.getElementById('prefWebhookType').value;
  if (!url) { showError(t('settings_webhook_url_required'), 'Validation'); return; }
  const msg  = 'Tidslinjal webhook test';
  let payload;
  if (type === 'mattermost' || type === 'slack') {
    payload = JSON.stringify({text: msg});
  } else {
    payload = JSON.stringify({message: msg});
  }
  try {
    const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: payload});
    showNotification('success', `Webhook: ${res.status}`);
  } catch(e) {
    showError('Webhook test failed: ' + e.message);
  }
}
async function setOOHPref(val) {
  state.preferences.show_out_of_hours = val;
  applyPreferences();
  await savePreferences();
  renderTimeline();
}
async function setRedLinePref() {
  state.preferences.red_line_enabled = document.getElementById('prefRedLine')?.checked ?? true;
  state.preferences.red_line_color   = document.getElementById('prefLineColor')?.value || '#E74C3C';
  state.preferences.red_line_width   = parseInt(document.getElementById('prefLineWidth')?.value || '2', 10);
  state.preferences.red_line_style   = document.getElementById('prefLineStyle')?.value || 'solid';
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}
async function setSynthLabelPref(val) {
  state.preferences.synth_label = val;
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}
function toggleFreeze() {
  if (state.timelinePaused) {
    state.timelinePaused = false;
    state.pausedAt = null;
  } else {
    state.timelinePaused = true;
    state.pausedAt = new Date();
  }
  renderSidebar();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}
async function saveExercise() {
  const epoch       = document.getElementById('exEpoch')?.value;
  const endex       = document.getElementById('exEndex')?.value;
  const label       = document.getElementById('exLabel')?.value?.trim() || '';
  const enabled     = document.getElementById('exEnabled')?.checked || false;
  const dayHrsOnly  = document.getElementById('exDayHoursOnly')?.checked || false;
  const payload = {
    enabled,
    epoch: epoch ? new Date(epoch).toISOString() : '',
    endex: endex ? new Date(endex).toISOString() : '',
    label,
    day_hours_only: dayHrsOnly,
  };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    updateSyntheticUI();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
async function setDefaultView(view) {
  state.preferences.default_view = view;
  state.range = view;
  document.getElementById('rangeSelect').value = view;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  await refreshAll();
}
async function setPref(key, value) {
  state.preferences[key] = value;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  renderTimeline();
  updateUILabels();
}
async function setHourPref() {
  const sh = parseInt(document.getElementById('prefStartH').value, 10);
  const eh = parseInt(document.getElementById('prefEndH').value, 10);
  if (isNaN(sh)||isNaN(eh)||sh>=eh) return;
  state.preferences.day_start_hour = sh;
  state.preferences.day_end_hour   = eh;
  await savePreferences();
  renderTimeline();
}
async function toggleType(key) {
  const ht = state.preferences.hidden_types || [];
  if (ht.includes(key)) {
    state.preferences.hidden_types = ht.filter(k => k!==key);
  } else {
    state.preferences.hidden_types = [...ht, key];
  }
  await savePreferences();
  renderSidebar();
  renderTimeline();
}
function toggleLayer(id) {
  // Exclusion model: hidden_layers lists what to hide; toggling flips visibility
  const hl = state.preferences.hidden_layers || [];
  if (hl.includes(id)) {
    state.preferences.hidden_layers = hl.filter(x => x !== id); // unhide
  } else {
    state.preferences.hidden_layers = [...hl, id]; // hide
  }
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}
function toggleAllLayers() {
  state.preferences.hidden_layers = []; // show all layers
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}
function updateUILabels() {
  // Header buttons
  document.getElementById('btnToday').textContent    = t('today');
  const znBtn = document.getElementById('btnZoomNow');
  if (znBtn) znBtn.title = t('zoom_now');
  setElText('btnAddEvent', t('add_event'));
  setElText('btnAddLock', t('lock_slot'));
  setElText('btnLogout', t('logout'));
  setElText('btnExport', t('btn_export'));
  setElText('btnReport', t('btn_report'));
  setElText('lbl-show', t('show')+':');
  setElText('lbl-res', t('resolution')+':');

  // Range select options
  const rs = document.getElementById('rangeSelect');
  const rangeKeys = ['day','2days','3days','4days','week','month','2months','3months'];
  [...rs.options].forEach((opt, i) => { opt.text = t('range_'+rangeKeys[i]); });

  // Resolution select
  const res = document.getElementById('resolutionSelect');
  [...res.options].forEach(opt => { opt.text = t('res_'+opt.value); });

  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.textContent = t('tab_'+tab.dataset.tab) || tab.dataset.tab;
  });

  // Alarm modal
  setElText('lbl-alarm-cancel', t('btn_cancel'));
  setElText('btnSaveAlarm', t('alarm_set'));

  // Lock modal
  setElText('lbl-lock-cancel', t('btn_cancel'));
  setElText('btnSaveLock', t('btn_lock'));

  // Event modal
  setElText('lbl-btn-cancel', t('btn_cancel'));
  setElText('btnSaveEvent', t('btn_save'));
  setElText('btnDeleteEvent', t('btn_delete'));
  setElText('lbl-ev-responsible', t('ev_responsible') || 'Responsible');
  setElText('lbl-ev-invited', t('ev_invited') || 'Invited (notify on creation)');
  setElText('lbl-report-layers', t('report_layers') || 'Layers to include');
  // Status options
  const evStatus = document.getElementById('eventStatus');
  if (evStatus) {
    [...evStatus.options].forEach(opt => { opt.text = t('status_'+opt.value) || opt.text; });
  }
  // Recurrence pattern options
  const evPat = document.getElementById('eventRecurrencePattern');
  if (evPat) {
    [...evPat.options].forEach(opt => { opt.text = t('event_pattern_'+opt.value) || opt.text; });
  }

  // User modal
  setElText('lbl-u-username', t('user_username_lbl') || t('user_username'));
  setElText('lbl-u-password', t('user_password'));
  setElText('lbl-u-display', t('user_display'));
  setElText('lbl-u-role', t('user_role'));
  setElText('lbl-u-canlock', t('user_can_lock'));
  setElText('lbl-u-groups', t('user_groups'));
  setElText('lbl-u-changepwd', t('change_password'));
  setElText('lbl-u-cancel', t('btn_cancel'));
  setElText('btnSaveUser', t('btn_save'));
  setElText('btnDeleteUser', t('user_delete'));
  const uRole = document.getElementById('uRole');
  if (uRole) {
    const roleMap = {read:'role_read',reporter:'role_reporter',readwrite:'role_readwrite',teamlead:'role_teamlead',oplead:'role_oplead',admin:'role_admin'};
    [...uRole.options].forEach(opt => { opt.text = t(roleMap[opt.value]) || opt.text; });
  }

  // Password modal
  setElText('lbl-pwd-title', t('change_password'));
  setElText('lbl-pwd-current', t('current_password'));
  setElText('lbl-pwd-new', t('new_password'));
  setElText('lbl-pwd-confirm', t('confirm_password'));
  setElText('lbl-pwd-cancel', t('btn_cancel'));
  setElText('btnSavePassword', t('change_password'));

  // Phase modal
  setElText('lbl-phase-name', t('phase_name'));
  setElText('lbl-phase-color', t('phase_color'));
  setElText('lbl-phase-start', t('phase_start'));
  setElText('lbl-phase-end', t('phase_end'));
  setElText('lbl-phase-order', t('phase_order_lbl') || 'Order (0-9)');
  setElText('lbl-phase-layer', t('phase_layer_lbl') || 'Layer (empty = master timeline)');
  setElText('lbl-phase-cancel', t('btn_cancel'));
  setElText('btnSavePhase', t('btn_save'));
  setElText('btnDeletePhase', t('btn_delete'));

  // Group modal
  setElText('lbl-group-name', t('group_name_lbl') || 'Name *');
  setElText('lbl-group-desc', t('event_description'));
  setElText('lbl-group-cancel', t('btn_cancel'));
  setElText('btnSaveGroup', t('btn_save'));
  setElText('btnDeleteGroup', t('btn_delete'));

  // Layer modal
  setElText('lbl-layer-name', t('layer_name_lbl') || 'Name *');
  setElText('lbl-layer-color', t('event_type_color'));
  setElText('lbl-layer-desc', t('event_description'));
  setElText('lbl-layer-vis', t('layer_visibility_private').replace(/^./, '') || 'Visibility');
  setElText('lbl-layer-perm', t('layer_perm_lbl') || 'Group Permission');
  setElText('lbl-layer-groups', t('layer_shared_groups'));
  setElText('lbl-layer-cancel', t('btn_cancel'));
  setElText('btnSaveLayer', t('btn_save'));
  setElText('btnDeleteLayer', t('btn_delete'));
  const lVis = document.getElementById('layerVisibility');
  if (lVis) {
    const visMap = {private:'layer_visibility_private',groups:'layer_visibility_groups',public:'layer_visibility_public'};
    [...lVis.options].forEach(opt => { opt.text = t(visMap[opt.value]) || opt.text; });
  }
  const lPerm = document.getElementById('layerPermission');
  if (lPerm) {
    const permMap = {read:'layer_permission_read',readwrite:'layer_permission_readwrite'};
    [...lPerm.options].forEach(opt => { opt.text = t(permMap[opt.value]) || opt.text; });
  }

  // Event type modal
  setElText('lbl-etype-key', t('event_type_key'));
  setElText('lbl-etype-color', t('event_type_color'));
  setElText('lbl-etype-label', t('event_type_label'));
  setElText('lbl-etype-label-sv', t('event_type_label_sv'));
  setElText('lbl-etype-label-fr', t('event_type_label_fr'));
  setElText('lbl-etype-cancel', t('btn_cancel'));
  setElText('btnSaveEtype', t('btn_save'));
  setElText('btnDeleteEtype', t('btn_delete'));

  // Report modal
  setElText('lbl-report-title', '📄 ' + (t('report_title') || 'Generate Report'));
  setElText('lbl-report-type', t('report_type_label') || 'Report type');
  setElText('lbl-report-format', t('report_format_label') || 'Format');
  setElText('lbl-report-from', t('event_start'));
  setElText('lbl-report-to', t('event_end'));
  setElText('lbl-report-cancel', t('btn_cancel'));
  setElText('lbl-report-generate', t('report_generate'));
  const rType = document.getElementById('reportType');
  if (rType) {
    const typeMap = {aar: t('report_type_aar'), timeline: t('report_type_timeline'), per_layer: t('report_type_perlayer') || 'Per-Layer Activity'};
    [...rType.options].forEach(opt => { opt.text = typeMap[opt.value] || opt.text; });
  }
  const rFmt = document.getElementById('reportFormat');
  if (rFmt) {
    const fmtMap = {html: t('report_format_html_opt') || t('report_format_html'), print: t('report_format_print_opt') || t('report_format_pdf')};
    [...rFmt.options].forEach(opt => { opt.text = fmtMap[opt.value] || opt.text; });
  }

  // Member modal
  setElText('lbl-member-close', t('btn_close'));

  // Language flag active state
  updateLangFlags();
}
function updateLangFlags() {
  const lang = (state.preferences && state.preferences.language) || 'en';
  ['EN', 'SV', 'FR'].forEach(code => {
    const btn = document.getElementById('flag'+code);
    if (btn) btn.classList.toggle('active', lang === code.toLowerCase());
  });
}
function connectSSE() {
  const es = new EventSource('/api/notifications/stream');
  es.addEventListener('alarm', e => {
    const data = JSON.parse(e.data);
    showAlarmNotification(data, 0);
  });
  es.onerror = () => setTimeout(connectSSE, 5000);
}

// ── Alarm ACK ──────────────────────────────────────────────────────────────
const unackedAlarms = new Map(); // alarmID → {data, level, timerID, element}

function showAlarmNotification(data, level) {
  // Clear any existing notification for this alarm
  const existing = unackedAlarms.get(data.alarm_id);
  if (existing) {
    clearTimeout(existing.timerID);
    if (existing.element && existing.element.parentNode) existing.element.remove();
  }

  const area = document.getElementById('notification-area');
  const el   = document.createElement('div');
  el.className = `notification alarm alarm-level-${Math.min(level, 2)}`;

  const warnings = level > 0 ? ' ' + '⚠️'.repeat(Math.min(level, 3)) : '';
  el.innerHTML = `
    <div class="notification-title">${t('notif_alarm_title')}${escHtml(warnings)}</div>
    <div class="notification-msg">${escHtml(data.message)}</div>
    <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm notification-close-btn" onclick="dismissAlarmNotif(${data.alarm_id})">Dismiss</button>
      <button class="btn btn-primary btn-sm" onclick="ackAlarm(${data.alarm_id}, this.closest('.notification'))">✓ ${t('alarm_ack')}</button>
    </div>
  `;
  area.appendChild(el);

  // Browser notification on first fire
  if (level === 0 && Notification.permission === 'granted') {
    new Notification('Tidslinjal — ' + t('notif_alarm_title'), {body: data.message});
  }

  // Escalate after 60 s if not acked, as long as we're before the event time
  const eventTime = new Date(data.event_time);
  const timerID = (new Date() < eventTime)
    ? setTimeout(() => showAlarmNotification(data, level + 1), 60000)
    : null;

  unackedAlarms.set(data.alarm_id, {data, level, timerID, element: el});
}

function dismissAlarmNotif(alarmID) {
  const entry = unackedAlarms.get(alarmID);
  if (entry) {
    clearTimeout(entry.timerID);
    unackedAlarms.delete(alarmID);
    if (entry.element && entry.element.parentNode) entry.element.remove();
  }
}

async function ackAlarm(alarmID, notifEl) {
  const res = await apiPost(`/api/alarms/${alarmID}/ack`, {});
  if (res.ok) {
    dismissAlarmNotif(alarmID);
    if (notifEl && notifEl.parentNode) notifEl.remove();
    await fetchAlarms();
    renderSidebar();
    showNotification('success', t('alarm_acked'));
  }
}
function openExportModal() {
  // Show/hide privileged-only categories
  const isPriv = hasRole2(state.user?.role, 'oplead');
  const usersCb  = document.getElementById('exportUsersCb');
  const phasesCb = document.getElementById('exportPhasesCb');
  if (usersCb)  usersCb.style.display  = isPriv ? '' : 'none';
  if (phasesCb) phasesCb.style.display = isPriv ? '' : 'none';
  // Toggle chip style on checkbox change
  document.querySelectorAll('.export-cat-cb').forEach(cb => {
    cb.onchange = () => cb.closest('.group-chip').classList.toggle('selected', cb.checked);
  });
  openModal('exportModal');
}
function doExport(format) {
  if (format === 'ics') { closeModal('exportModal'); exportICS(); return; }
  if (format === 'csv') { closeModal('exportModal'); exportCSV(); return; }
  if (format === 'json') {
    const cats = [...document.querySelectorAll('.export-cat-cb:checked')].map(cb => cb.value);
    const include = cats.join(',') || 'events';
    const url = `/api/export?include=${encodeURIComponent(include)}`;
    window.location.href = url;
    closeModal('exportModal');
    return;
  }
}
function openImportModal() {
  const isPriv = hasRole2(state.user?.role, 'oplead');
  const usersCb     = document.getElementById('importUsersCb');
  const reassignRow = document.getElementById('importReassignRow');
  if (usersCb)     usersCb.style.display     = isPriv ? '' : 'none';
  if (reassignRow) reassignRow.style.display = isPriv ? '' : 'none';
  // Toggle chip style on checkbox change
  document.querySelectorAll('.import-cat-cb').forEach(cb => {
    cb.onchange = () => cb.closest('.group-chip').classList.toggle('selected', cb.checked);
  });
  const resultEl = document.getElementById('importResult');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }
  openModal('importModal');
}
async function doImport() {
  const fileEl = document.getElementById('importFile');
  if (!fileEl || !fileEl.files.length) { showError('Please select a JSON export file.', 'Validation'); return; }
  const cats = [...document.querySelectorAll('.import-cat-cb:checked')].map(cb => cb.value);
  if (!cats.length) { showError('Select at least one category to import.', 'Validation'); return; }
  const reassign = document.getElementById('importReassign')?.checked || false;
  const fd = new FormData();
  fd.append('data', fileEl.files[0]);
  fd.append('include', cats.join(','));
  fd.append('reassign', reassign ? 'true' : 'false');
  const res = await api('POST', '/api/import', fd);
  const resultEl = document.getElementById('importResult');
  if (res.ok) {
    const r = await res.json();
    const msg = `Imported: ${r.events||0} events, ${r.groups||0} groups, ${r.layers||0} layers, ${r.alarms||0} alarms, ${r.users||0} users. Skipped: ${r.skipped||0}.`;
    if (resultEl) { resultEl.textContent = msg; resultEl.style.display = ''; }
    await refreshAll();
    showNotification('success', 'Import complete');
  } else {
    const err = await res.json();
    showError('Import failed: ' + err.error);
  }
}
function exportCSV() {
  const events = state.events;
  if (!events.length) { showError('No events in the current view to export.', 'Validation'); return; }
  const headers = ['ID','Title','Type','Status','Start','End','All Day','Participant','Layer','Created By','Description'];
  const rows = events.map(ev => [
    ev.id,
    `"${(ev.title||'').replace(/"/g,'""')}"`,
    ev.event_type,
    ev.status,
    ev.all_day ? ev.start_time.slice(0,10) : ev.start_time,
    ev.all_day ? '' : (ev.end_time || ''),
    ev.all_day ? 'yes' : 'no',
    ev.participant || '',
    ev.layer_id || '',
    `"${(ev.created_by_name||'').replace(/"/g,'""')}"`,
    `"${(ev.description||'').replace(/"/g,'""').replace(/\n/g,' ')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tidslinjal-${state.startDate.toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function toICSDate(d) {
  const pad = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function escICS(s) {
  return (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function exportICS() {
  const events = state.events;
  if (!events.length) { showError('No events in the current view to export.', 'Validation'); return; }
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tidslinjal//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
  for (const ev of events) {
    const evStart = new Date(ev.start_time);
    const evEnd   = ev.end_time ? new Date(ev.end_time) : new Date(evStart.getTime() + 3600000);
    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:tidslinjal-${ev.id}@tidslinjal\r\n`;
    ics += `DTSTAMP:${toICSDate(new Date(ev.created_at))}\r\n`;
    ics += `DTSTART:${toICSDate(evStart)}\r\n`;
    ics += `DTEND:${toICSDate(evEnd)}\r\n`;
    ics += `SUMMARY:${escICS(ev.title)}\r\n`;
    if (ev.description) ics += `DESCRIPTION:${escICS(ev.description)}\r\n`;
    if (ev.created_by_name) ics += `ORGANIZER;CN=${escICS(ev.created_by_name)}:MAILTO:noreply@tidslinjal\r\n`;
    ics += `CATEGORIES:${escICS(ev.event_type)}\r\n`;
    if (ev.is_recurring && ev.recurrence_pattern) {
      const rruleMap = {
        '15min':     'MINUTELY;INTERVAL=15',
        '30min':     'MINUTELY;INTERVAL=30',
        'hourly':    'HOURLY',
        '2hours':    'HOURLY;INTERVAL=2',
        '3hours':    'HOURLY;INTERVAL=3',
        '4hours':    'HOURLY;INTERVAL=4',
        'daily':     'DAILY',
        'weekly':    'WEEKLY',
        'monthly':   'MONTHLY',
        'quarterly': 'MONTHLY;INTERVAL=3',
      };
      const freq = rruleMap[ev.recurrence_pattern];
      if (freq) {
        let rr = `RRULE:FREQ=${freq}`;
        if (ev.recurrence_end) rr += `;UNTIL=${toICSDate(new Date(ev.recurrence_end))}`;
        ics += rr + '\r\n';
      }
    }
    ics += 'END:VEVENT\r\n';
  }
  ics += 'END:VCALENDAR\r\n';
  const blob = new Blob([ics], {type: 'text/calendar;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tidslinjal-${state.startDate.toISOString().slice(0,10)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
async function openTemplatesModal() {
  await renderTemplatesList();
  // Wire up save button
  const btn = document.getElementById('btnSaveTemplate');
  if (btn) btn.onclick = openSaveTemplateDialog;
  openModal('templatesModal');
}
async function renderTemplatesList() {
  const listEl = document.getElementById('templatesList');
  if (!listEl) return;
  const templates = await apiGet('/api/templates') || [];
  if (!templates.length) {
    listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">No templates yet. Save the current events as a template to get started.</p>`;
    return;
  }
  listEl.innerHTML = templates.map(tmpl => `
    <div class="tmpl-card">
      <div class="tmpl-card-info">
        <div class="tmpl-card-name">${escHtml(tmpl.name)}</div>
        <div class="tmpl-card-meta">
          ${tmpl.item_count || 0} event${(tmpl.item_count||0)!==1?'s':''} ·
          ${tmpl.scope === 'private' ? '🔒 Private' : '🌐 Public'} ·
          by ${escHtml(tmpl.created_by_name||'—')}
          ${tmpl.description ? ' · ' + escHtml(tmpl.description) : ''}
        </div>
      </div>
      <div class="tmpl-card-actions">
        <button class="btn btn-primary btn-sm" onclick="openApplyTemplateDialog(${tmpl.id}, ${JSON.stringify(escHtml(tmpl.name))}, ${tmpl.item_count||0})">▶ Apply</button>
        ${(state.user && (state.user.id === tmpl.created_by || hasRole2(state.user.role, 'admin')))
          ? `<button class="btn btn-danger btn-sm" onclick="deleteTemplate(${tmpl.id})">Delete</button>`
          : ''}
      </div>
    </div>
  `).join('');
}
function openSaveTemplateDialog() {
  const evCount = state.events.length;
  const el = document.getElementById('tmplEventCount');
  if (el) el.textContent = `Will save ${evCount} event${evCount!==1?'s':''} from the current view.`;
  document.getElementById('tmplName').value = '';
  document.getElementById('tmplDescription').value = '';
  document.getElementById('tmplScope').value = 'private';
  // Role-based visibility
  const scopeSel = document.getElementById('tmplScope');
  if (scopeSel) {
    const isPriv = hasRole2(state.user?.role, 'oplead');
    [...scopeSel.options].forEach(opt => {
      if (opt.value === 'public') opt.hidden = !isPriv;
    });
  }
  document.getElementById('btnConfirmSaveTemplate').onclick = confirmSaveTemplate;
  openModal('saveTemplateModal');
}
async function confirmSaveTemplate() {
  const name = document.getElementById('tmplName').value.trim();
  if (!name) { showError('Template name is required.', 'Validation'); return; }
  const scope = document.getElementById('tmplScope').value;
  // Build items from current events
  const events = state.events;
  if (!events.length) { showError('No events in current view.', 'Validation'); return; }
  // Find earliest start to anchor offsets
  const earliest = Math.min(...events.map(e => new Date(e.start_time).getTime()));
  const items = events.map(e => {
    const startMs = new Date(e.start_time).getTime();
    const endMs   = e.end_time ? new Date(e.end_time).getTime() : null;
    return {
      title:              e.title,
      event_type:         e.event_type,
      color:              e.color,
      description:        e.description || '',
      start_offset_min:   Math.round((startMs - earliest) / 60000),
      duration_min:       endMs ? Math.round((endMs - startMs) / 60000) : 0,
      all_day:            e.all_day,
      is_recurring:       e.is_recurring,
      recurrence_pattern: e.recurrence_pattern || '',
      participant:        e.participant || '',
    };
  });
  const payload = {
    name,
    description: document.getElementById('tmplDescription').value.trim(),
    scope,
    items,
  };
  const res = await apiPost('/api/templates', payload);
  if (res.ok) {
    closeModal('saveTemplateModal');
    showNotification('success', 'Template saved');
    renderTemplatesList();
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
function openApplyTemplateDialog(id, name, itemCount) {
  document.getElementById('applyTemplateInfo').textContent =
    `Apply template "${name}" (${itemCount} event${itemCount!==1?'s':''})`;
  document.getElementById('applyTemplateBase').value = fmtDateInput(new Date());
  // Populate layer select
  const layerSel = document.getElementById('applyTemplateLayer');
  layerSel.innerHTML = `<option value="">Master Timeline</option>` +
    state.layers.filter(l => l.owner_id===state.user.id || l.permission==='readwrite')
      .map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
  document.getElementById('btnConfirmApplyTemplate').onclick = () => confirmApplyTemplate(id);
  openModal('applyTemplateModal');
}
async function confirmApplyTemplate(id) {
  const baseVal   = document.getElementById('applyTemplateBase').value;
  if (!baseVal) { showError('Please select a base date/time.', 'Validation'); return; }
  const layerVal  = document.getElementById('applyTemplateLayer').value;
  const payload   = {
    base_time: new Date(baseVal).toISOString(),
    layer_id:  layerVal ? parseInt(layerVal, 10) : null,
  };
  const res = await apiPost(`/api/templates/${id}/apply`, payload);
  if (res.ok) {
    const r = await res.json();
    closeModal('applyTemplateModal');
    closeModal('templatesModal');
    await refreshAll();
    showNotification('success', `Created ${r.created || 0} event${(r.created||0)!==1?'s':''} from template`);
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  const res = await apiDel(`/api/templates/${id}`);
  if (res.ok) {
    showNotification('success', 'Template deleted');
    renderTemplatesList();
  } else {
    const err = await res.json();
    showError(err.error);
  }
}
async function generateReport() {
  const type   = document.getElementById('reportType')?.value || 'aar';
  // Optionally use date range from report modal if provided
  const fromEl = document.getElementById('reportFrom');
  const toEl   = document.getElementById('reportTo');
  const from   = fromEl && fromEl.value ? new Date(fromEl.value) : state.startDate;
  const to     = toEl   && toEl.value   ? new Date(toEl.value)   : getViewEnd();

  // Layer filter from report modal checkboxes
  const reportLayerEls = document.querySelectorAll('.report-layer-cb:checked');
  const reportLayerFilter = reportLayerEls.length > 0
    ? new Set([...reportLayerEls].map(el => Number(el.value)))
    : null; // null = all layers

  let events = state.events.filter(ev => {
    const evStart = new Date(ev.start_time);
    if (evStart < from || evStart >= to) return false;
    if (reportLayerFilter !== null) {
      const lid = ev.layer_id ? Number(ev.layer_id) : 0;
      if (!reportLayerFilter.has(lid)) return false;
    }
    return true;
  });

  const title = `${type.toUpperCase()} Report — ${localShortDate(from)} to ${localShortDate(to)}`;

  const statusOrder = ['planned','active','responded_to','completed','submitted','verified','rejected','cancelled'];

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
  <style>body{font-family:sans-serif;margin:32px;color:#111}
  h1{font-size:22px;margin-bottom:4px}
  h2{font-size:16px;margin-top:24px;border-bottom:2px solid #333;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px}
  th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
  th{background:#f0f0f0}
  .status{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600}
  </style></head><body>
  <h1>${escHtml(title)}</h1>
  <p style="color:#666;font-size:13px">Generated: ${new Date().toLocaleString()}</p>`;

  if (type === 'aar') {
    const byStatus = {};
    statusOrder.forEach(s => { byStatus[s] = []; });
    events.forEach(ev => { const s = ev.status||'planned'; if (byStatus[s]) byStatus[s].push(ev); });

    statusOrder.forEach(s => {
      if (!byStatus[s].length) return;
      html += `<h2>${t('status_'+s)||s} (${byStatus[s].length})</h2>
      <table><thead><tr><th>Title</th><th>Type</th><th>Start</th><th>End</th><th>Duration</th><th>Responsible</th><th>Created by</th></tr></thead><tbody>
      ${byStatus[s].map(ev => `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${escHtml(ev.event_type)}</td>
        <td>${new Date(ev.start_time).toLocaleString()}</td>
        <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
        <td>${escHtml(ev.created_by_name||'')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });
  } else if (type === 'per_layer') {
    const byLayer = {};
    state.layers.forEach(l => { byLayer[l.id] = {name: l.name, events: []}; });
    byLayer['master'] = {name: t('layers_master')||'Master', events: []};
    events.forEach(ev => {
      const key = ev.layer_id ? ev.layer_id : 'master';
      if (!byLayer[key]) byLayer[key] = {name: 'Layer '+key, events: []};
      byLayer[key].events.push(ev);
    });
    Object.values(byLayer).forEach(({name, events: evs}) => {
      if (!evs.length) return;
      html += `<h2>${escHtml(name)} (${evs.length})</h2>
      <table><thead><tr><th>Title</th><th>Status</th><th>Start</th><th>End</th><th>Duration</th><th>Responsible</th></tr></thead><tbody>
      ${evs.map(ev => `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
        <td>${new Date(ev.start_time).toLocaleString()}</td>
        <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });
  } else {
    // timeline snapshot
    html += `<h2>Timeline Snapshot</h2>
    <table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Duration</th><th>Responsible</th><th>Created by</th></tr></thead><tbody>
    ${events.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).map(ev => `<tr>
      <td>${escHtml(ev.title)}</td>
      <td>${escHtml(ev.event_type)}</td>
      <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
      <td>${new Date(ev.start_time).toLocaleString()}</td>
      <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
      <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
      <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
      <td>${escHtml(ev.created_by_name||'')}</td>
    </tr>`).join('')}
    </tbody></table>`;
  }

  html += '</body></html>';

  const format = document.getElementById('reportFormat')?.value || 'html';
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);

  if (format === 'print') {
    // Open in new window and trigger print dialog (user can save as PDF)
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      // Delay print to allow rendering
      setTimeout(() => {
        printWin.print();
      }, 500);
    }
  } else {
    // Download as HTML
    const a = document.createElement('a');
    a.href     = url;
    a.download = `report-${type}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  URL.revokeObjectURL(url);
  closeModal('reportModal');
  showNotification('success', t('report_ready')||'Report downloaded');
}
function mobileNavTab(tab) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (tab === 'timeline') {
    closeMobileSidebar();
    return;
  }
  if (tab === 'menu') {
    // Show sidebar with first available tab
    sidebar.classList.add('visible');
    backdrop.classList.add('visible');
    return;
  }
  // Open sidebar to specific tab
  sidebar.classList.add('visible');
  backdrop.classList.add('visible');
  state.sidebarTab = tab;
  renderSidebar();
  // Update active tab button in sidebar
  document.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Highlight active mobile nav button
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const mn = document.getElementById('mn' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (mn) mn.classList.add('active');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
}