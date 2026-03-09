/* ============================================================
   Tidslinjal — Modals, Sidebar & Feature Logic
   All modal open/save/close handlers, sidebar rendering,
   preferences UI, export/import, templates, alarms, SSE.
   ============================================================ */
'use strict';

// ── Debug helper ────────────────────────────────────────────────────────────
// window.TIDSLINJAL_DEBUG is set by app.js after checking /api/version
function dbg(...args) {
  if (window.TIDSLINJAL_DEBUG) console.debug('[TL]', ...args);
}

// ── Group label helper ─────────────────────────────────────────────────────
function getGroupLabel() {
  const key = (state.exercise && state.exercise.group_label) || 'group';
  const map = {
    group: { singular: 'Group',  plural: 'Groups',  sv_s: 'Grupp',  sv_p: 'Grupper',  fr_s: 'Groupe',  fr_p: 'Groupes'  },
    unit:  { singular: 'Unit',   plural: 'Units',   sv_s: 'Enhet',  sv_p: 'Enheter',  fr_s: 'Unité',   fr_p: 'Unités'   },
    team:  { singular: 'Team',   plural: 'Teams',   sv_s: 'Team',   sv_p: 'Team',     fr_s: 'Équipe',  fr_p: 'Équipes'  },
  };
  const lang = (state.preferences && state.preferences.language) || 'en';
  const entry = map[key] || map.group;
  if (lang === 'sv') return { singular: entry.sv_s, plural: entry.sv_p };
  if (lang === 'fr') return { singular: entry.fr_s, plural: entry.fr_p };
  return { singular: entry.singular, plural: entry.plural };
}

// ── Role display name helper ───────────────────────────────────────────────
function getRoleDisplayName(roleKey) {
  // Check custom role names first
  const custom = state.roleConfigs && state.roleConfigs.find(r => r.key === roleKey);
  if (custom && custom.display_name) return custom.display_name;
  return t('role_' + roleKey) || roleKey;
}

// ── applyPreferences ───────────────────────────────────────────────────────
function applyPreferences() {
  const body = document.body;
  body.className = '';
  if (state.preferences.theme === 'light') body.classList.add('light-mode');
  if (state.preferences.theme === 'city-camo') body.classList.add('city-camo');
  if (state.preferences.theme === 'urban-camo') body.classList.add('urban-camo');
  const sz = state.preferences.size || 'small';
  if (sz !== 'small') body.classList.add('size-'+sz);
  if (!state.preferences.show_out_of_hours) body.classList.add('hide-out-of-hours');
  updateLangFlags();
}

// ── Event Modal Functions + Event Listeners ────────────────────────────────
function updateEventModalContactVisibility() {
  const typeVal = document.getElementById('eventType')?.value;
  const isPhysical = typeVal === 'physical_meeting';
  const physGroup = document.getElementById('physicalLocationGroup');
  const contactGroup = document.getElementById('contactInfoGroup');
  if (physGroup) physGroup.style.display = isPhysical ? '' : 'none';
  if (contactGroup) contactGroup.style.display = (!isPhysical && typeVal) ? '' : 'none';
  onContactTypeChange();
}

function onContactTypeChange() {
  const ct = document.getElementById('eventContactType')?.value;
  const urlGroup = document.getElementById('eventContactURLGroup');
  const vmGroup  = document.getElementById('virtualMeetingTypeGroup');
  if (urlGroup) urlGroup.style.display = ct ? '' : 'none';
  if (vmGroup)  vmGroup.style.display  = ct === 'url' ? '' : 'none';
  onVirtualMeetingTypeChange();
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
  const _typeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
    instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌' };
  typeSelect.innerHTML = sortedTypes.map(et => {
    const lbl = lang==='sv' && et.label_sv ? et.label_sv :
                lang==='fr' && et.label_fr ? et.label_fr : et.label;
    const ico = et.icon || _typeIcons[et.key] || '';
    return `<option value="${et.key}" ${ev && ev.event_type===et.key?'selected':''}>${ico ? ico+' ' : ''}${lbl}</option>`;
  }).join('');
  typeSelect.onchange = () => {
    const found = state.eventTypes.find(x => x.key === typeSelect.value);
    if (found) document.getElementById('eventColor').value = found.color;
    updateEventModalTimeVisibility();
    updateEventModalContactVisibility();
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
  const inlineWh = document.getElementById('inlineAlarmWebhookURL');
  if (inlineWh) inlineWh.value = '';

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

  // Physical location and contact/communication fields
  document.getElementById('eventPhysicalLocation').value = ev ? (ev.physical_location||'') : '';
  document.getElementById('eventContactType').value = ev ? (ev.contact_type||'') : '';
  document.getElementById('eventContactURL').value = ev ? (ev.contact_url||'') : '';
  document.getElementById('eventVirtualMeetingType').value = ev ? (ev.virtual_meeting_type||'') : '';

  // Map / coordinates for physical events
  const latEl = document.getElementById('eventLatitude');
  const lngEl = document.getElementById('eventLongitude');
  const mapCoords = document.getElementById('physicalMapCoords');
  if (latEl) latEl.value = ev?.latitude != null ? ev.latitude : '';
  if (lngEl) lngEl.value = ev?.longitude != null ? ev.longitude : '';
  if (mapCoords) {
    mapCoords.textContent = (ev?.latitude != null && ev?.longitude != null)
      ? `${Number(ev.latitude).toFixed(4)}, ${Number(ev.longitude).toFixed(4)}` : '';
  }

  // Show/hide map button for physical_meeting type
  const physMapGroup = document.getElementById('physicalMapGroup');
  if (physMapGroup) {
    const isPhys = (ev?.event_type === 'physical_meeting') || (typeSelect.value === 'physical_meeting');
    physMapGroup.style.display = isPhys ? '' : 'none';
  }

  // Planned times section (only for editing existing events)
  const plannedGroup = document.getElementById('plannedTimesGroup');
  const plannedStartEl = document.getElementById('eventPlannedStart');
  const plannedEndEl = document.getElementById('eventPlannedEnd');
  if (plannedGroup) {
    if (isEdit && ev.planned_start) {
      plannedGroup.style.display = '';
      if (plannedStartEl) plannedStartEl.value = new Date(ev.planned_start).toLocaleString();
      if (plannedEndEl) plannedEndEl.value = ev.planned_end ? new Date(ev.planned_end).toLocaleString() : '—';
    } else {
      plannedGroup.style.display = 'none';
    }
  }

  // History and dependencies buttons (only for existing events)
  const btnHist = document.getElementById('btnEventHistory');
  const btnDeps = document.getElementById('btnEventDeps');
  if (btnHist) btnHist.style.display = isEdit ? '' : 'none';
  if (btnDeps) btnDeps.style.display = isEdit ? '' : 'none';

  // Acquire editing lock for collaborative editing
  if (isEdit && ev.id) {
    acquireEditingLock(ev.id);
    _updateEditingLockIndicator();
  }

  // Wire typeSelect change to show/hide map button
  const origOnchange = typeSelect.onchange;
  typeSelect.onchange = function() {
    if (origOnchange) origOnchange.call(this);
    const isPhys2 = typeSelect.value === 'physical_meeting';
    const pg = document.getElementById('physicalMapGroup');
    if (pg) pg.style.display = isPhys2 ? '' : 'none';
  };

  // Update field visibility for type/allday
  updateEventModalTimeVisibility();
  updateEventModalContactVisibility();

  openModal('eventModal');
}

// ── Invited list filter (Users / Groups / Both) ────────────────────────────
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
    physical_location:  document.getElementById('eventPhysicalLocation')?.value || '',
    contact_type:       document.getElementById('eventContactType')?.value || '',
    contact_url:        document.getElementById('eventContactURL')?.value || '',
    virtual_meeting_type: document.getElementById('eventVirtualMeetingType')?.value || '',
    latitude:           document.getElementById('eventLatitude')?.value ? parseFloat(document.getElementById('eventLatitude').value) : null,
    longitude:          document.getElementById('eventLongitude')?.value ? parseFloat(document.getElementById('eventLongitude').value) : null,
  };

  // Track undo for updates
  if (id) {
    const oldEv = state.events.find(e => e.id === parseInt(id, 10));
    if (oldEv) pushUndo('update_event', { id: parseInt(id, 10), old: { ...oldEv } });
  }

  const res = id ? await apiPut(`/api/events/${id}`, payload) : await apiPost('/api/events', payload);
  if (res.ok) {
    const saved    = await res.json();
    const eventID  = saved.id || parseInt(id, 10);

    // Track undo for new events
    if (!id) pushUndo('create_event', { id: eventID });

    // Show overlap warnings if any
    if (saved.overlap_warnings && saved.overlap_warnings.length > 0) {
      const msgs = saved.overlap_warnings.map(w =>
        `• ${escHtml(w.user_name||'User #'+w.user_id)} ${t('overlap_also_in')||'is also scheduled in'}: "${escHtml(w.event_title)}"`
      ).join('\n');
      showError(`${t('overlap_warning')||'Scheduling overlap detected'}:\n${msgs}`, t('overlap_warning_title')||'Overlap Warning');
    }

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
      const leadTime    = parseInt(document.getElementById('inlineAlarmLeadTime').value, 10) || 0;
      const scope       = document.getElementById('inlineAlarmScope').value;
      const soundEl     = document.getElementById('inlineAlarmSound');
      const sound       = soundEl ? soundEl.value : 'klaxon';
      const webhookEl2  = document.getElementById('inlineAlarmWebhookURL');
      const webhook_url = webhookEl2 ? webhookEl2.value.trim() : '';
      const eventTime = new Date(payload.start_time);
      // Create alarm for current user
      await apiPost('/api/alarms', { event_id: eventID, lead_time: leadTime, event_time: eventTime.toISOString(), sound, webhook_url });
      // If "all invited" and there are invited users, create alarms for them too (admin/oplead only)
      if (scope === 'all' && hasRole2(state.user.role, 'oplead') && invUserIDs.length > 0) {
        for (const uid of invUserIDs) {
          if (uid !== state.user.id) {
            await apiPost('/api/alarms', { event_id: eventID, lead_time: leadTime, event_time: eventTime.toISOString(), sound, for_user_id: uid });
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

// ── patchEventStatus, deleteEvent, showRecurDeleteDialog, showEventDetail, comments, attachments ──
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
  // Push undo entry before deletion
  if (ev) pushUndo('delete_event', { ...ev });
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

// ── Event Detail Modal ─────────────────────────────────────────────────────
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
          ${(function(){
            if (!synthActive || !synthActive()) return '';
            const epochMs = new Date(state.exercise.epoch).getTime();
            const startH  = synthElapsedHours(epochMs, evStart.getTime());
            const startLabel = startH >= 0 ? `H+${startH}` : `H${startH}`;
            const endPart = evEnd
              ? (() => { const eh = synthElapsedHours(epochMs, evEnd.getTime()); return ` → ${eh >= 0 ? 'H+'+eh : 'H'+eh}`; })()
              : '';
            return `<b>⏱ ${t('info_synth_time')||'Synth time'}:</b><span style="color:var(--accent);font-weight:600">${startLabel}${endPart}</span>`;
          })()}
          ${ev.is_recurring ? `<b>${t('detail_repeats')}:</b><span>${t('event_pattern_'+(ev.recurrence_pattern||'weekly'))}</span>` : ''}
          ${layer ? `<b>${t('event_layer')}:</b><span>${escHtml(layer.name)}</span>` : ''}
          <b>${t('detail_created')}:</b><span>${escHtml(ev.created_by_name||'')}</span>
          <b>${t('detail_created_at')}:</b><span>${fmtDateTime(new Date(ev.created_at))}</span>
          ${(ev.updated_at && new Date(ev.updated_at) - new Date(ev.created_at) > 10000) ?
            `<b>${t('detail_updated_at')}:</b><span>${fmtDateTime(new Date(ev.updated_at))}</span>` : ''}
          <b>${t('event_status')}:</b><span><span class="status-badge status-${ev.status||'planned'}">${t('status_'+(ev.status||'planned'))}</span></span>
          ${ev.status==='verified' ? `<b>${t('status_verified_by')}:</b><span>${escHtml(ev.verified_by_name||'')} — ${ev.verified_at?fmtDateTime(new Date(ev.verified_at)):''}</span>` : ''}
          ${ev.status==='rejected' ? `<b>${t('status_rejection_reason')}:</b><span style="color:var(--red)">${escHtml(ev.rejection_reason||'')}</span>` : ''}
          ${ev.physical_location ? `<b>📍 Location:</b><span>${escHtml(ev.physical_location)}</span>` : ''}
          ${(ev.latitude != null && ev.longitude != null) ? `<b>🗺️ Coords:</b><span>${Number(ev.latitude).toFixed(4)}, ${Number(ev.longitude).toFixed(4)} <a href="https://www.openstreetmap.org/?mlat=${ev.latitude}&mlon=${ev.longitude}#map=15/${ev.latitude}/${ev.longitude}" target="_blank" style="color:var(--accent)">View on map ↗</a></span>` : ''}
          ${ev.depends_on && ev.depends_on.length ? `<b>🔗 Depends on:</b><span>${ev.depends_on.map(id => { const dep = state.events.find(e => e.id === id); return dep ? escHtml(dep.title) : 'Event #'+id; }).join(', ')}</span>` : ''}
          ${ev.planned_start ? `<b>📅 Planned:</b><span>${new Date(ev.planned_start).toLocaleString()}${ev.planned_end ? ' → ' + new Date(ev.planned_end).toLocaleString() : ''}</span>` : ''}
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

    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn btn-secondary btn-sm';
    dupBtn.textContent = t('detail_duplicate') || 'Duplicate';
    dupBtn.onclick = async () => {
      const res = await apiPost('/api/events-duplicate/' + ev.id, {});
      if (res.ok) {
        closeModal('detailModal');
        await refreshAll();
        showNotification('success', 'Event duplicated');
      } else {
        const err = await res.json();
        showError(err.error);
      }
    };
    footer.appendChild(dupBtn);

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


// ── Alarm Modal + Lock Modal handlers ─────────────────────────────────────
// ── Alarm Modal ────────────────────────────────────────────────────────────
function openAlarmModal(ev) {
  document.getElementById('alarmEventId').value = ev.id;
  document.getElementById('alarmEventTitle').value = ev.title;
  document.getElementById('alarmEventTime').value = fmtDateTime(new Date(ev.start_time));
  document.getElementById('alarmLeadTime').value = '5';
  const whEl = document.getElementById('alarmWebhookURL');
  if (whEl) whEl.value = '';
  openModal('alarmModal');
}

document.getElementById('btnSaveAlarm').addEventListener('click', async () => {
  const eventId     = parseInt(document.getElementById('alarmEventId').value, 10);
  const leadTime    = parseInt(document.getElementById('alarmLeadTime').value, 10);
  const soundEl     = document.getElementById('alarmSound');
  const sound       = soundEl ? soundEl.value : 'klaxon';
  const webhookEl   = document.getElementById('alarmWebhookURL');
  const webhook_url = webhookEl ? webhookEl.value.trim() : '';
  const res = await apiPost('/api/alarms', {event_id: eventId, lead_time: leadTime, sound, webhook_url});
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

// ── Lock Modal ─────────────────────────────────────────────────────────────
document.getElementById('btnAddLock').addEventListener('click', () => {
  const now = new Date();
  document.getElementById('lockStart').value = fmtDateInput(now);
  document.getElementById('lockEnd').value   = fmtDateInput(addHours(now, 1));
  document.getElementById('lockReason').value = '';
  openLockModal();
});

// Show/hide layer selector in lock modal based on scope
function onLockScopeChange() {
  const scope = document.getElementById('lockScope').value;
  document.getElementById('lockLayerGroup').style.display = scope === 'layer' ? '' : 'none';
}

// Populate layer select when opening lock modal
function openLockModal(startDate, endDate) {
  const sel = document.getElementById('lockLayerSelect');
  if (sel) {
    sel.innerHTML = state.layers.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
  }
  document.getElementById('lockScope').value = 'all';
  document.getElementById('lockLayerGroup').style.display = 'none';

  if (startDate) document.getElementById('lockStart').value = fmtDateInput(startDate);
  if (endDate) document.getElementById('lockEnd').value = fmtDateInput(endDate);
  renderExistingLocks();
  openModal('lockModal');
}

function renderExistingLocks() {
  const listEl = document.getElementById('existingLocksList');
  if (!listEl) return;
  const locks = state.locks || [];
  if (locks.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);margin-bottom:4px">No active locks.</div>`;
    return;
  }
  const isAdmin = state.user && state.user.role === 'admin';
  listEl.innerHTML = locks.map(l => {
    const canUnlock = isAdmin || (state.user && l.locked_by === state.user.id);
    const scopeLabel = {all:'All', master:'Master', layer:'Layer'}[l.scope||'all']||l.scope;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px;font-size:var(--fs-sm)">
      <span style="flex:1;min-width:0">
        <span style="color:var(--text-dim)">${scopeLabel}:</span>
        <span style="color:var(--text-bright)">${fmtDateTime(new Date(l.start_time))} – ${fmtDateTime(new Date(l.end_time))}</span>
        ${l.reason ? `<span style="color:var(--text-dim);margin-left:4px">"${escHtml(l.reason)}"</span>` : ''}
        <span style="color:var(--text-dim);font-size:var(--fs-xs);display:block">by ${escHtml(l.locked_by_name||'')}</span>
      </span>
      ${canUnlock ? `<button class="btn btn-danger btn-sm" onclick="unlockFromModal(${l.id})">🔓 Unlock</button>` : ''}
    </div>`;
  }).join('');
}

async function unlockFromModal(id) {
  if (!confirm(t('confirm_delete_lock')||'Remove this lock?')) return;
  const lockToRemove = (state.locks || []).find(l => l.id === id);
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) {
    if (lockToRemove) pushUndo('delete_lock', { ...lockToRemove });
    await fetchLocks();
    renderTimeline();
    renderExistingLocks();
    showNotification('success', t('notif_unlocked')||'Lock removed');
  } else {
    const err = await res.json();
    showError(err.error);
  }
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
  const lockPayload = {
    start_time: new Date(sv).toISOString(),
    end_time:   new Date(ev).toISOString(),
    reason:     document.getElementById('lockReason').value,
    scope,
    layer_id:   layerID,
  };
  const res = await apiPost('/api/locks', lockPayload);
  if (res.ok) {
    const created = await res.json();
    pushUndo('create_lock', { id: created.id });
    closeModal('lockModal'); await fetchLocks(); renderTimeline();
    showNotification('success', t('notif_locked'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteLock(id) {
  if (!confirm(t('confirm_delete_lock'))) return;
  const lockToRemove = (state.locks || []).find(l => l.id === id);
  const res = await apiDel(`/api/locks/${id}`);
  if (res.ok) {
    if (lockToRemove) pushUndo('delete_lock', { ...lockToRemove });
    await fetchLocks(); renderTimeline(); showNotification('success', t('notif_unlocked'));
  }
}

// ── User Modal, Group Modal, Member Modal ─────────────────────────────────
// ── User Modal ─────────────────────────────────────────────────────────────
async function openUserModal(user) {
  const isEdit = !!user;
  document.getElementById('userModalTitle').textContent = isEdit ? t('user_edit') : t('user_add');
  document.getElementById('userId').value = user ? user.id : '';
  document.getElementById('uUsername').value = user ? user.username : '';
  document.getElementById('uUsername').disabled = isEdit;
  document.getElementById('uPassword').value = '';
  document.getElementById('uDisplayName').value = user ? (user.display_name||'') : '';
  document.getElementById('uEmail').value = user ? (user.email||'') : '';
  // Populate role dropdown dynamically (includes custom roles)
  const roleSel = document.getElementById('uRole');
  const builtinRoles = [
    {key:'observer', label:'Observer'}, {key:'read', label:'Read'},
    {key:'reporter', label:'Reporter'}, {key:'readwrite', label:'Read/Write'},
    {key:'teamlead', label:'Team Lead'}, {key:'oplead', label:'Operations Lead'},
    {key:'staffofficer', label:'Staff Officer Assistant'}, {key:'staffofficer_full', label:'Staff Officer'}, {key:'admin', label:'Admin'},
  ];
  const allRoles = [...builtinRoles];
  (state.roleConfigs || []).forEach(rc => {
    if (!allRoles.find(r => r.key === rc.key)) {
      allRoles.push({key: rc.key, label: rc.display_name || rc.key});
    }
  });
  const currentRole = user ? user.role : 'read';
  roleSel.innerHTML = allRoles.map(r =>
    `<option value="${escHtml(r.key)}" ${r.key===currentRole?'selected':''}>${escHtml(getRoleDisplayName(r.key) || r.label)}</option>`
  ).join('');
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

  // Populate NATO J-staff picker
  const natoPicker = document.getElementById('uNATOPicker');
  if (natoPicker) {
    const current = new Set((user && user.nato_designations) ? user.nato_designations : []);
    const natoDesigs = [
      {code:'J1', label:'J1 — Personnel'},
      {code:'J2', label:'J2 — Intelligence'},
      {code:'J3', label:'J3 — Operations'},
      {code:'J4', label:'J4 — Logistics'},
      {code:'J5', label:'J5 — Plans'},
      {code:'J6', label:'J6 — Communications'},
      {code:'J7', label:'J7 — Training'},
      {code:'J8', label:'J8 — Finance'},
      {code:'J9', label:'J9 — Civil-Military'},
    ];
    natoPicker.innerHTML = natoDesigs.map(d => `
      <label style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer;font-size:var(--fs-xs);white-space:nowrap;${current.has(d.code)?'background:var(--accent-muted,rgba(0,120,255,.12));border-color:var(--accent)':''}">
        <input type="checkbox" name="uNATO" value="${d.code}" ${current.has(d.code)?'checked':''} style="accent-color:var(--accent)">
        ${escHtml(d.label)}
      </label>`).join('');
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
  const email = document.getElementById('uEmail').value.trim();
  const groupIDs = [...document.querySelectorAll('input[name="uGroup"]:checked')].map(cb => parseInt(cb.value, 10));
  const natoDesignations = [...document.querySelectorAll('input[name="uNATO"]:checked')].map(cb => cb.value);
  // Staff Officer role requires at least one J-designation
  if (role === 'staffofficer_full' && natoDesignations.length === 0) {
    showError('The Staff Officer role requires at least one J-designation to be assigned.', 'Validation');
    return;
  }
  const payload = {display_name:displayName, email, role, can_lock:canLock, group_ids:groupIDs, nato_designations:natoDesignations};
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

// ── Group Modal ────────────────────────────────────────────────────────────
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

// ── Member Management Modal ────────────────────────────────────────────────
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

// ── Layer Modal, Event Type Modal, Phase Modal ────────────────────────────
// ── Layer Modal ────────────────────────────────────────────────────────────
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
    // When creating a new layer, offer to also create a group with the same name
    if (!id) {
      const existingGroup = state.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
      if (!existingGroup) {
        const createGroup = confirm(`No group named "${name}" exists. Create a group with the same name?`);
        if (createGroup) {
          const gRes = await apiPost('/api/groups', { name, description: '' });
          if (gRes.ok) {
            const newGroup = await gRes.json();
            await fetchGroups();
            renderSidebar();
            showNotification('success', `Group "${name}" created.`);
          }
        }
      }
    }
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

// ── Event Type Modal ───────────────────────────────────────────────────────
function pickEtypeIcon(icon) {
  document.getElementById('etypeIcon').value = icon;
  document.querySelectorAll('.icon-pick-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.icon === icon);
  });
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
  pickEtypeIcon(et ? (et.icon||'') : '');
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
    icon:     document.getElementById('etypeIcon').value.trim(),
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

// ── Phase Modal ────────────────────────────────────────────────────────────
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

// ── renderSidebar ─────────────────────────────────────────────────────────
// ── Sidebar ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const tab  = state.sidebarTab;
  const el   = document.getElementById('sidebarContent');
  const lang = state.preferences.language || 'en';

  if (tab === 'legend') {
    const activeLayers = state.layers.filter(l => isLayerActive(l.id));
    const isSynthActive = synthActive ? synthActive() : false;
    const lastTemplate = state.lastAppliedTemplate || null;
    const langLabel = {en:'English 🇬🇧', sv:'Svenska 🇸🇪', fr:'Français 🇫🇷'}[lang] || lang;
    const vInfo = state._versionInfo || {};
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('event_types_title')}
          ${state.user&&hasRole2(state.user.role,'readwrite') ? `<button class="btn btn-primary btn-sm" onclick="openEtypeModal(null)">${t('event_types_add')}</button>` : ''}
        </div>
        <div class="legend-list">
          ${[...state.eventTypes].sort((a,b) => {
            const la = (lang==='sv'&&a.label_sv?a.label_sv:lang==='fr'&&a.label_fr?a.label_fr:a.label).toLowerCase();
            const lb = (lang==='sv'&&b.label_sv?b.label_sv:lang==='fr'&&b.label_fr?b.label_fr:b.label).toLowerCase();
            return la.localeCompare(lb);
          }).map(et => {
            const lbl = lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label;
            const hidden = isTypeHidden(et.key);
            const _builtinTypeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
              instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌' };
            const etIcon = et.icon || _builtinTypeIcons[et.key] || '';
            return `<div class="legend-item${hidden?' hidden-type':''}" onclick="toggleType('${et.key}')">
              <div class="legend-swatch" style="background:${et.color}"></div>
              ${etIcon ? `<span class="legend-type-icon">${etIcon}</span>` : ''}
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
      <div class="sidebar-section">
        <div class="sidebar-section-title">👤 ${t('info_roles_users')||'Roles, Users & Groups'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin-bottom:8px">
          <span style="color:var(--text-dim)">${t('info_users')||'Users'}:</span><span>${state.users.length}</span>
          <span style="color:var(--text-dim)">${t('info_groups')||'Groups'}:</span><span>${state.groups.length}</span>
        </div>
        ${(() => {
          const roleOrder = ['admin','staffofficer_full','staffofficer','oplead','teamlead','readwrite','reporter','read','observer'];
          const roleCounts = {};
          (state.users||[]).forEach(u => { roleCounts[u.role] = (roleCounts[u.role]||0)+1; });
          const rows = roleOrder.filter(r => roleCounts[r]).map(r =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid var(--border)">
              <span class="role-badge role-${r}" style="font-size:10px;padding:1px 5px">${getRoleDisplayName(r)}</span>
              <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text)">${roleCounts[r]}</span>
            </div>`
          ).join('');
          return rows ? `<div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">${rows}</div>` : `<span style="color:var(--text-dim);font-size:var(--fs-xs)">No users yet</span>`;
        })()}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('info_system')||'System'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
          <span style="color:var(--text-dim)">${t('info_language')||'Language'}:</span><span>${langLabel}</span>
          <span style="color:var(--text-dim)">${t('info_active_layers')||'Active layers'}:</span><span>${activeLayers.length > 0 ? activeLayers.map(l=>escHtml(l.name)).join(', ') : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_synth_time')||'Synthetic time'}:</span><span>${isSynthActive ? '✓ On' : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_last_template')||'Last template'}:</span><span>${lastTemplate ? escHtml(lastTemplate) : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_version')||'Version'}:</span><span>${vInfo.version ? 'v'+vInfo.version : '—'}</span>
        </div>
      </div>
      ${vInfo.github ? `
      <div class="sidebar-section" style="padding-top:6px">
        <a href="${escHtml(vInfo.github)}" target="_blank" rel="noopener" style="font-size:var(--fs-xs);color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:5px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          ${t('github_link')||'GitHub Repository'}
        </a>
      </div>` : ''}
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
                <span class="role-badge role-${u.role}">${getRoleDisplayName(u.role)}</span>
                ${u.can_lock?'<span title="Can lock">🔒</span>':''}
                ${(u.nato_designations && u.nato_designations.length) ? `<span style="font-size:var(--fs-sm);color:var(--accent);font-weight:600;letter-spacing:.04em">${u.nato_designations.join(' ')}</span>` : ''}
                <button class="btn btn-ghost btn-icon" onclick='openUserModal(${JSON.stringify(u).replace(/'/g,"&#39;")})'>✏️</button>
              </div>`).join('')}
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">🛡 ${t('role_editor_title')||'Role Editor'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('role_editor_desc')||'Edit role display names and capabilities.'}</p>
          <button class="btn btn-secondary btn-sm" onclick="openRoleEditor()">🛡 ${t('role_editor_title')||'Role Editor'}…</button>
        </div>
      `;
    });
  } else if (tab === 'groups' && state.user && hasRole2(state.user.role,'teamlead')) {
    const gl = getGroupLabel();
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          👥 ${gl.plural}
          <button class="btn btn-primary btn-sm" onclick="openGroupModal(null)">+ ${t('btn_add')||'Add'} ${gl.singular}</button>
        </div>
        <div class="group-list">
          ${state.groups.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No ${gl.plural.toLowerCase()} yet.</div>` : ''}
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
  } else if (tab === 'integrations' && state.user && state.user.role === 'admin') {
    const p = state.preferences;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔔 ${t('settings_webhook')||'Notifications / Webhook'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">Configure a webhook to receive alarm notifications. Changes are audited.</p>
        <div class="form-group" style="margin-bottom:6px">
          <select id="prefWebhookType" style="width:100%;margin-bottom:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
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
      <div class="sidebar-section" id="oidcSettingsSection">
        <div class="sidebar-section-title">🔐 ${t('settings_oidc')||'Single Sign-On (OIDC)'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure OpenID Connect for SSO. Leave Client Secret blank to keep the existing one.
          Status: <span id="oidcStatusBadge" style="font-weight:600"></span>
        </p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_oidc_issuer')||'Issuer URL'}</label>
          <input type="url" id="oidcIssuer" placeholder="https://accounts.example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_oidc_client_id')||'Client ID'}</label>
          <input type="text" id="oidcClientID" placeholder="client-id"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_oidc_client_secret')||'Client Secret'} <span style="opacity:.6">(leave blank to keep current)</span></label>
          <input type="password" id="oidcClientSecret" placeholder="••••••••"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_oidc_redirect_url')||'Redirect URL'} <span style="opacity:.6">(leave blank for auto)</span></label>
          <input type="url" id="oidcRedirectURL" placeholder="https://your-server/auth/oidc/callback"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_oidc_default_role')||'Default role for new users'}</label>
          <select id="oidcDefaultRole" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="readwrite">Read/Write</option>
            <option value="teamlead">Team Lead</option>
            <option value="oplead">Op Lead</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="oidcExclusive" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_oidc_exclusive')||'Exclusive mode (disable local login)'}
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="oidcEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable OIDC SSO
        </label>
        <button class="btn btn-primary btn-sm" onclick="saveOIDCSettings()">${t('settings_oidc_save')||'Save & Apply'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📧 Mail Setup</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">Configure SMTP for alarm notifications, reports, and user invitations.</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="mailEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Email Delivery
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">SMTP Host</label>
          <input type="text" id="mailHost" placeholder="smtp.example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">Port</label>
            <input type="number" id="mailPort" placeholder="587" value="587"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">TLS Mode</label>
            <select id="mailTLS" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
              <option value="starttls">STARTTLS (recommended)</option>
              <option value="tls">TLS</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Username</label>
          <input type="text" id="mailUsername" placeholder="user@example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Password <span style="opacity:.6">(leave blank to keep)</span></label>
          <input type="password" id="mailPassword" placeholder="••••••••"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">From Address</label>
          <input type="email" id="mailFrom" placeholder="tidslinjal@example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">From Name</label>
          <input type="text" id="mailFromName" placeholder="Tidslinjal"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" onclick="saveMailConfig()">Save</button>
          <button class="btn btn-secondary btn-sm" onclick="testMailConfig()">Test</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">💼 Microsoft Teams Integration</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">Configure Teams to auto-generate meeting links for Meeting-type events.</p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Teams Webhook URL (for notifications)</label>
          <input type="url" id="teamsWebhookURL" placeholder="https://…/IncomingWebhook/…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Teams Meeting URL Template</label>
          <input type="url" id="teamsMeetingTemplate" placeholder="https://teams.microsoft.com/l/meetup-join/…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">Provide a base URL; event details will be appended as query params.</p>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Zoom Meeting Base URL / User</label>
          <input type="text" id="zoomMeetingBase" placeholder="https://zoom.us/j/1234567890"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <button class="btn btn-secondary btn-sm" onclick="saveTeamsConfig()">Save Teams/Zoom Config</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔑 API Keys</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">Generate API keys for external tool integration (Bearer token auth).</p>
        <div id="apiKeyList" style="margin-bottom:8px">Loading…</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="newAPIKeyName" placeholder="Key name / description" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <button class="btn btn-primary btn-sm" onclick="createAPIKey()">+ Create</button>
        </div>
      </div>
    `;
    // Load current OIDC settings into the form
    setTimeout(_initOIDCSettingsUI, 0);
    setTimeout(_initMailSettingsUI, 0);
    setTimeout(_loadAPIKeys, 0);
    setTimeout(_loadTeamsConfigUI, 0);
  } else if (tab === 'settings') {
    const p  = state.preferences;
    const ex = state.exercise || {};
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_theme')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.theme==='dark'?' active':''}" onclick="setPref('theme','dark')">${t('theme_dark')||'Dark'}</button>
          <button class="toggle-btn${p.theme==='light'?' active':''}" onclick="setPref('theme','light')">${t('theme_light')||'Light'}</button>
          <button class="toggle-btn${p.theme==='city-camo'?' active':''}" onclick="setPref('theme','city-camo')" title="Camouflage (greens/grays)">🏕 Camo</button>
          <button class="toggle-btn${p.theme==='urban-camo'?' active':''}" onclick="setPref('theme','urban-camo')" title="Urban warfare (blues)">🌆 Urban Camo</button>
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
        <div class="sidebar-section-title">${t('settings_date_format')||'Date / Time Format'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${[['iso','ISO 8601'],['uk','UK'],['fr','FR'],['sv','SV']].map(([v,l]) =>
            `<button class="toggle-btn${(p.date_format||'iso')===v?' active':''}" onclick="setPref('date_format','${v}')">${l}</button>`
          ).join('')}
        </div>
        <div class="hour-range" style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_day_hours')}:</span>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH" style="width:52px" onchange="setHourPref()">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH" style="width:52px" onchange="setHourPref()">
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_timezone')||'Timezone'}:</span>
          <select id="prefTimezone" onchange="setTimezonePref(this.value)"
            style="margin-top:4px;width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value=""${!state.timezone?' selected':''}>Browser Default</option>
            ${['UTC','Europe/London','Europe/Paris','Europe/Stockholm','Europe/Berlin','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Tokyo','Asia/Shanghai','Australia/Sydney'].map(tz =>
              `<option value="${tz}"${state.timezone===tz?' selected':''}>${tz}</option>`
            ).join('')}
          </select>
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">Real time clock time format:</span>
          <div class="toggle-btn-group" style="margin-top:4px">
            <button class="toggle-btn${!_clockUTC?' active':''}" id="clockFmtLocal" onclick="setClockFormat('local')">Local time</button>
            <button class="toggle-btn${_clockUTC?' active':''}"  id="clockFmtZulu"  onclick="setClockFormat('zulu')">ZULU / UTC</button>
          </div>
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">Additional timezone clocks:</span>
          <div style="margin-top:4px">
            ${(p.extra_clocks||[]).length === 0
              ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">No extra clocks. Use the + button next to the clock to add one.</div>`
              : (p.extra_clocks||[]).map(ec => `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:var(--fs-xs)">
                  <span style="flex:1;color:var(--text)">${escHtml(ec.label)} <span style="color:var(--text-dim)">(${escHtml(ec.timezone)})</span></span>
                  <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" onclick="removeExtraClock(${ec.id})">× Remove</button>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_view')||'Default View'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','2days','3days','4days','5days','week','2weeks','3weeks'].map(v =>
            `<button class="toggle-btn${(p.default_view||'week')===v?' active':''}" onclick="setDefaultView('${v}')">${t('range_'+v)||v}</button>`
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
        <div class="sidebar-section-title">${t('settings_event_icons')||'Event Icons'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefShowEventIcons" ${p.show_event_icons!==false?'checked':''}
            onchange="setPref('show_event_icons', this.checked)"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_event_icons')||'Show icons on events (type, attachments, etc.)'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_red_line')||'Current-time Line'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefRedLine" ${p.red_line_enabled!==false?'checked':''} onchange="setRedLinePref()"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_red_line_enabled')||'Show current-time line'}
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="prefSynthLabel" ${p.synth_label?'checked':''} onchange="setSynthLabelPref(this.checked)"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
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
      </div>
      ${synthActive() ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('freeze_label')||'Timeline Freeze'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:0 0 8px">${state.timelinePaused ? (t('freeze_active')||'Timeline is frozen.') : (t('freeze_desc')||'Freeze progression for exercise review.')}</p>
        <button class="btn btn-sm ${state.timelinePaused?'btn-danger':'btn-secondary'}" onclick="toggleFreeze()">
          ${state.timelinePaused ? ('▶ '+(t('btn_resume')||'Resume')) : ('⏸ '+(t('btn_freeze')||'Freeze'))}
        </button>
      </div>` : ''}
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_terminology')||'Terminology'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_group_label')||'Group label'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(ex.group_label||'group')==='group'?' active':''}" onclick="setGroupLabel('group')">Group</button>
          <button class="toggle-btn${ex.group_label==='unit'?' active':''}" onclick="setGroupLabel('unit')">Unit</button>
          <button class="toggle-btn${ex.group_label==='team'?' active':''}" onclick="setGroupLabel('team')">Team</button>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_user_label')||'User label'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(ex.user_label||'users')==='users'?' active':''}" onclick="setUserLabel('users')">Users</button>
          <button class="toggle-btn${ex.user_label==='soldiers'?' active':''}" onclick="setUserLabel('soldiers')">Soldiers</button>
          <button class="toggle-btn${ex.user_label==='personnel'?' active':''}" onclick="setUserLabel('personnel')">Personnel</button>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_operation_mode')||'Operation mode'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(ex.operation_mode||'exercise')==='exercise'?' active':''}" onclick="setOperationMode('exercise')">Exercise</button>
          <button class="toggle-btn${ex.operation_mode==='incident'?' active':''}" onclick="setOperationMode('incident')">Incident</button>
          <button class="toggle-btn${ex.operation_mode==='operation'?' active':''}" onclick="setOperationMode('operation')">Operation</button>
        </div>
      </div>
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_exercise')}</div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${getOperationNameLabel(ex)}</label>
          <input type="text" id="exLabel" value="${escHtml(ex.label||'')}" placeholder="${getOperationNameLabel(ex)}…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">${getStartexLabel(ex)}</label>
          <input type="datetime-local" id="exEpoch" value="${ex.epoch ? fmtDateInput(new Date(ex.epoch)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">${getEndexLabel(ex)}</label>
          <input type="datetime-local" id="exEndex" value="${ex.endex ? fmtDateInput(new Date(ex.endex)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Exercise Index</label>
          <input type="number" id="exIndex" value="${ex.ex_index||0}" min="0"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="exEnabled" ${ex.enabled?'checked':''}>
          <label for="exEnabled" style="font-size:var(--fs-sm)">${t('settings_exercise_enable')}</label>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exDayHoursOnly" ${ex.day_hours_only?'checked':''}>
          <label for="exDayHoursOnly" style="font-size:var(--fs-sm)">${t('synth_day_hours_only')||'Day hours only'}</label>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exIncludeWeekends" ${ex.include_weekends!==false?'checked':''}>
          <label for="exIncludeWeekends" style="font-size:var(--fs-sm)" title="${t('settings_include_weekends_desc')||'Show weekends on the timeline and count them in synthetic time'}">${t('settings_include_weekends')||'Include weekends'}</label>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveExercise()">${t('btn_save')}</button>
        ${state.user.role==='admin' ? `<a href="/admin-view" class="btn btn-secondary btn-sm" style="margin-left:4px">${t('admin_view')||'Admin View'}</a>` : ''}
      </div>` : ''}
      ${state.user && state.user.role==='admin' ? `
      <div class="sidebar-section" id="enrollmentSettingsSection">
        <div class="sidebar-section-title">🚪 ${t('settings_enrollment')||'User Enrollment'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_enrollment_desc')||'Controls how new users can register for access.'}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap;gap:4px" id="enrollModeGroup">
          ${[['off','🚫 Off'],['open','🌐 Open'],['vetted','🔍 Vetted'],['generic_invitation','📧 Invite Code'],['personal_invitation','🎫 Personal Invite']].map(([v,l]) =>
            `<button class="toggle-btn" id="enrollBtn_${v}" onclick="setEnrollMode('${v}')">${l}</button>`
          ).join('')}
        </div>
        <div id="enrollCodeGroup" style="margin-top:8px;display:none">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">Generic Invitation Code:</label>
          <div style="display:flex;gap:6px;margin-top:4px">
            <input type="text" id="enrollCodeInput" placeholder="Shared invite code"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <button class="btn btn-secondary btn-sm" onclick="saveEnrollSettings()">Save</button>
          </div>
        </div>
        <div id="enrollVettedInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Users self-register but cannot log in until an admin approves them. Pending users appear in the Users tab.</p>
          <button class="btn btn-secondary btn-sm" onclick="saveEnrollSettings()">Save</button>
        </div>
        <div id="enrollPersonalInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Each user needs a unique personal invitation code. Manage codes in the Admin panel.</p>
          <button class="btn btn-secondary btn-sm" onclick="saveEnrollSettings()">Save</button>
          <a href="/admin-view" class="btn btn-secondary btn-sm" style="margin-left:4px">Admin Panel…</a>
        </div>
        <div id="enrollOpenInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Anyone can register and immediately log in. Use with caution.</p>
          <button class="btn btn-secondary btn-sm" onclick="saveEnrollSettings()">Save</button>
        </div>
        <div id="enrollOffInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Self-registration is disabled. Only admins can create accounts.</p>
          <button class="btn btn-secondary btn-sm" onclick="saveEnrollSettings()">Save</button>
        </div>
      </div>` : ''}
      ${state.user && state.user.role==='admin' ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="color:var(--danger)">${t('settings_danger_zone')||'Danger Zone'}</div>
        <button class="btn btn-danger btn-sm" onclick="resetDatabase()">${t('settings_reset')||'Reset to Empty'}</button>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('settings_reset_desc')||'Removes all data except the audit trail.'}</p>
      </div>` : ''}
    `;
    // After DOM injection, initialise dynamic state for enrollment settings
    if (state.user && state.user.role === 'admin') {
      setTimeout(_initEnrollmentUI, 0);
    }
  }
}

// ── Webhook helpers, preference setters: setOOHPref, setRedLinePref, setSynthLabelPref, toggleFreeze, saveExercise, setDefaultView, setPref, setHourPref, toggleType, toggleLayer, toggleAllLayers ──

// ── Enrollment settings helpers ─────────────────────────────────────────────
let _enrollMode = 'off';

function _initEnrollmentUI() {
  if (!state.user || state.user.role !== 'admin') return;
  apiGet('/api/admin/registration').then(data => {
    if (!data) return;
    _enrollMode = data.mode || 'off';
    _applyEnrollMode(_enrollMode, data.invitation_code || '');
  }).catch(() => {});
}

function _applyEnrollMode(mode, code) {
  ['off','open','vetted','generic_invitation','personal_invitation'].forEach(v => {
    const btn = document.getElementById('enrollBtn_'+v);
    if (btn) btn.classList.toggle('active', v === mode);
  });
  const show = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; };
  show('enrollCodeGroup',   mode === 'generic_invitation');
  show('enrollVettedInfo',  mode === 'vetted');
  show('enrollPersonalInfo',mode === 'personal_invitation');
  show('enrollOpenInfo',    mode === 'open');
  show('enrollOffInfo',     mode === 'off');
  if (mode === 'generic_invitation' && code) {
    const inp = document.getElementById('enrollCodeInput');
    if (inp) inp.value = code;
  }
}

function setEnrollMode(mode) {
  _enrollMode = mode;
  const curCode = document.getElementById('enrollCodeInput')?.value || '';
  _applyEnrollMode(mode, curCode);
}

async function saveEnrollSettings() {
  const code = document.getElementById('enrollCodeInput')?.value.trim() || '';
  const payload = { mode: _enrollMode };
  if (_enrollMode === 'generic_invitation') payload.invitation_code = code;
  const res = await api('PUT', '/api/admin/registration', payload);
  if (res.ok) {
    showNotification('success', t('notif_saved')||'Saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save enrollment settings');
  }
}

// ── Webhook helpers ────────────────────────────────────────────────────────
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

// ── Exercise settings ──────────────────────────────────────────────────────
async function saveExercise() {
  const epoch       = document.getElementById('exEpoch')?.value;
  const endex       = document.getElementById('exEndex')?.value;
  const label       = document.getElementById('exLabel')?.value?.trim() || '';
  const enabled          = document.getElementById('exEnabled')?.checked || false;
  const dayHrsOnly       = document.getElementById('exDayHoursOnly')?.checked || false;
  const includeWeekends  = document.getElementById('exIncludeWeekends')?.checked !== false;
  const exIndex          = parseInt(document.getElementById('exIndex')?.value || '0', 10);
  const payload = {
    enabled,
    epoch: epoch ? new Date(epoch).toISOString() : '',
    endex: endex ? new Date(endex).toISOString() : '',
    label,
    day_hours_only: dayHrsOnly,
    include_weekends: includeWeekends,
    group_label: state.exercise?.group_label || 'group',
    ex_index: exIndex,
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

// ── OIDC settings helpers ──────────────────────────────────────────────────
async function _initOIDCSettingsUI() {
  const data = await apiGet('/api/admin/oidc');
  if (!data) return;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  setVal('oidcIssuer', data.issuer);
  setVal('oidcClientID', data.client_id);
  setVal('oidcRedirectURL', data.redirect_url);
  setVal('oidcDefaultRole', data.default_role || 'readwrite');
  setChk('oidcExclusive', data.exclusive);
  setChk('oidcEnabled', data.enabled);
  // Clear password field; show placeholder hint if secret exists
  const secretEl = document.getElementById('oidcClientSecret');
  if (secretEl) {
    secretEl.value = '';
    secretEl.placeholder = data.has_secret ? '(secret saved — leave blank to keep)' : '••••••••';
  }
  const badge = document.getElementById('oidcStatusBadge');
  if (badge) {
    if (data.enabled && data.issuer) {
      badge.textContent = t('settings_oidc_status_active') || 'SSO active';
      badge.style.color = 'var(--success, #2ecc71)';
    } else {
      badge.textContent = t('settings_oidc_status_none') || 'Not configured';
      badge.style.color = 'var(--text-dim)';
    }
  }
}

async function saveOIDCSettings() {
  const getVal = id => document.getElementById(id)?.value?.trim() || '';
  const getChk = id => document.getElementById(id)?.checked || false;
  const payload = {
    enabled:      getChk('oidcEnabled'),
    issuer:       getVal('oidcIssuer'),
    client_id:    getVal('oidcClientID'),
    client_secret: getVal('oidcClientSecret'),
    redirect_url: getVal('oidcRedirectURL'),
    exclusive:    getChk('oidcExclusive'),
    default_role: getVal('oidcDefaultRole'),
  };
  const res = await api('PUT', '/api/admin/oidc', payload);
  if (res.ok) {
    showNotification('success', t('notif_saved') || 'Saved');
    // Re-init to reflect current state (e.g. clear secret field)
    setTimeout(_initOIDCSettingsUI, 0);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save OIDC settings');
  }
}

// ── Teams / Zoom Integration ───────────────────────────────────────────────
function _getTeamsConfig() {
  try { return JSON.parse(localStorage.getItem('teamsConfig') || '{}'); } catch { return {}; }
}

function saveTeamsConfig() {
  const cfg = {
    webhook:     document.getElementById('teamsWebhookURL')?.value?.trim()      || '',
    teamsBase:   document.getElementById('teamsMeetingTemplate')?.value?.trim() || '',
    zoomBase:    document.getElementById('zoomMeetingBase')?.value?.trim()      || '',
  };
  localStorage.setItem('teamsConfig', JSON.stringify(cfg));
  showNotification('success', 'Teams/Zoom config saved');
}

function _loadTeamsConfigUI() {
  const cfg = _getTeamsConfig();
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('teamsWebhookURL',       cfg.webhook);
  setVal('teamsMeetingTemplate',  cfg.teamsBase);
  setVal('zoomMeetingBase',       cfg.zoomBase);
}

// Called from event modal when virtual meeting type changes
function onVirtualMeetingTypeChange() {
  const vmType = document.getElementById('eventVirtualMeetingType')?.value;
  const btn    = document.getElementById('btnGenerateMeetingLink');
  if (btn) btn.style.display = (vmType === 'teams' || vmType === 'zoom') ? '' : 'none';
}

function generateMeetingLink() {
  const vmType  = document.getElementById('eventVirtualMeetingType')?.value;
  const cfg     = _getTeamsConfig();
  const title   = document.getElementById('eventTitle')?.value || 'Meeting';
  const start   = document.getElementById('eventStart')?.value || new Date().toISOString();
  let url = '';

  if (vmType === 'teams') {
    const base = cfg.teamsBase;
    if (base) {
      url = base + (base.includes('?') ? '&' : '?') +
        'subject=' + encodeURIComponent(title) +
        '&startTime=' + encodeURIComponent(start);
    } else {
      // Generate a "new meeting" deep link
      url = 'https://teams.microsoft.com/l/meeting/new?subject=' +
        encodeURIComponent(title) + '&startTime=' + encodeURIComponent(start);
    }
  } else if (vmType === 'zoom') {
    const base = cfg.zoomBase;
    if (base) {
      url = base;
    } else {
      url = 'https://zoom.us/start/videomeeting';
    }
  }

  if (url) {
    const urlEl = document.getElementById('eventContactURL');
    if (urlEl) urlEl.value = url;
    showNotification('success', `${vmType === 'teams' ? 'Teams' : 'Zoom'} link generated`);
  } else {
    showError(`Configure ${vmType} URL in Integrations first`);
  }
}

// ── User Profile ───────────────────────────────────────────────────────────
async function openProfileModal() {
  const u = state.user;
  if (!u) return;

  // Refresh user data from server to get latest info
  try {
    const fresh = await apiGet('/api/auth/me');
    if (fresh) Object.assign(state.user, fresh);
  } catch { /* use cached */ }

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('profileUsername',    u.username);
  setVal('profileRole',        t('role_' + u.role) || u.role);
  setVal('profileDisplayName', u.display_name);
  setVal('profileEmail',       u.email);
  setVal('profileMattermost',  u.mattermost_handle || '');
  setVal('profileDiscord',     u.discord_handle || '');
  setVal('profileSignal',      u.signal_handle || '');

  // Language select
  const langSel = document.getElementById('profileLanguage');
  if (langSel) {
    const prefs = state.preferences || {};
    langSel.value = prefs.language || u.language || 'en';
  }

  // J-Level / NATO designations
  const jGroup = document.getElementById('profileJLevelGroup');
  const jLevel = document.getElementById('profileJLevel');
  if (u.nato_designations && u.nato_designations.length) {
    if (jGroup) jGroup.style.display = '';
    if (jLevel) jLevel.value = u.nato_designations.join(', ');
  } else {
    if (jGroup) jGroup.style.display = 'none';
  }

  ['profilePwdCurrent', 'profilePwdNew', 'profilePwdConfirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  // Account info section
  const info = document.getElementById('profileInfo');
  if (info) {
    const groups = u.groups || [];
    const groupList = groups.length
      ? `<p>Groups/Units: ${groups.map(g => `<strong>${escHtml(g.name)}</strong> (${g.role})`).join(', ')}</p>`
      : '';
    const lastLogin = u.last_login_at
      ? `<p>Last login: ${new Date(u.last_login_at).toLocaleString()}${u.last_login_domain ? ` from <em>${escHtml(u.last_login_domain)}</em>` : u.last_login_ip ? ` from ${escHtml(u.last_login_ip)}` : ''}</p>`
      : '';
    const accountType = u.is_oidc
      ? `<p>Account type: <span style="color:var(--accent)">SSO / OIDC</span></p>`
      : `<p>Account type: Local account</p>`;
    info.innerHTML = `
      <p>Member since: ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</p>
      ${u.nato_designations && u.nato_designations.length ? `<p>NATO Designations: ${u.nato_designations.join(', ')}</p>` : ''}
      ${groupList}
      ${lastLogin}
      ${accountType}
    `;
  }

  // WebCal section
  const webCalURL = document.getElementById('profileWebCalURL');
  const webCalLink = document.getElementById('profileWebCalLink');
  if (u.webcal_token) {
    const url = `${location.protocol}//${location.host}/webcal/${u.webcal_token}.ics`;
    if (webCalURL) webCalURL.style.display = '';
    if (webCalLink) webCalLink.value = url;
  } else {
    if (webCalURL) webCalURL.style.display = 'none';
  }

  openModal('profileModal');
}

async function generateWebCalToken() {
  try {
    const res = await api('PUT', '/api/auth/profile', { generate_webcal: true });
    if (!res.ok) { showError('Failed to generate calendar link'); return; }
    const updated = await res.json();
    Object.assign(state.user, updated);
    const url = `${location.protocol}//${location.host}/webcal/${updated.webcal_token}.ics`;
    const webCalURL = document.getElementById('profileWebCalURL');
    const webCalLink = document.getElementById('profileWebCalLink');
    if (webCalURL) webCalURL.style.display = '';
    if (webCalLink) webCalLink.value = url;
    showNotification('success', 'Calendar subscription link generated');
  } catch { showError('Failed to generate calendar link'); }
}

async function saveProfile() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const displayName = val('profileDisplayName');
  const email       = val('profileEmail');
  const lang        = document.getElementById('profileLanguage')?.value || 'en';
  const curPw       = val('profilePwdCurrent');
  const newPw       = val('profilePwdNew');
  const conPw       = val('profilePwdConfirm');

  // Save display name + email
  if (displayName || email !== undefined) {
    const res = await api('PUT', `/api/users/${state.user.id}`, {
      display_name: displayName || state.user.display_name,
      email,
      role: state.user.role,
      can_lock: state.user.can_lock,
    });
    if (res.ok) {
      const updated = await res.json();
      state.user.display_name = updated.display_name || displayName;
      state.user.email = updated.email || email;
      document.getElementById('userDisplayName').textContent = state.user.display_name || state.user.username;
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to update profile');
      return;
    }
  }

  // Save social handles
  const mattermostHandle = val('profileMattermost');
  const discordHandle    = val('profileDiscord');
  const signalHandle     = val('profileSignal');
  await api('PUT', '/api/auth/profile', {
    mattermost_handle: mattermostHandle,
    discord_handle:    discordHandle,
    signal_handle:     signalHandle,
  }).catch(() => {});

  // Save language preference
  if (lang) {
    await setPref('language', lang);
  }

  // Change password if provided
  if (newPw) {
    if (newPw !== conPw) { showError(t('password_mismatch') || 'Passwords do not match'); return; }
    const res = await apiPost('/api/auth/change-password', {current_password: curPw, new_password: newPw});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to change password');
      return;
    }
  }

  closeModal('profileModal');
  showNotification('success', 'Profile updated');
}

// ── Mail Config UI ─────────────────────────────────────────────────────────
async function _initMailSettingsUI() {
  try {
    const cfg = await apiGet('/api/integrations/mail');
    if (!cfg) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    const setCb  = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    setCb('mailEnabled', cfg.enabled);
    setVal('mailHost',     cfg.smtp_host);
    setVal('mailPort',     cfg.smtp_port || 587);
    setVal('mailTLS',      cfg.tls_mode || 'starttls');
    setVal('mailUsername', cfg.username);
    setVal('mailFrom',     cfg.from_addr);
    setVal('mailFromName', cfg.from_name);
  } catch { /* mail not configured yet */ }
}

async function saveMailConfig() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const cfg = {
    enabled:   document.getElementById('mailEnabled')?.checked || false,
    smtp_host: val('mailHost'),
    smtp_port: parseInt(val('mailPort'), 10) || 587,
    tls_mode:  val('mailTLS'),
    username:  val('mailUsername'),
    password:  val('mailPassword'),
    from_addr: val('mailFrom'),
    from_name: val('mailFromName'),
  };
  const res = await api('PUT', '/api/integrations/mail', cfg);
  if (res.ok) {
    showNotification('success', 'Mail settings saved');
    // Clear password field
    const pw = document.getElementById('mailPassword');
    if (pw) pw.value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save mail settings');
  }
}

async function testMailConfig() {
  const res = await api('POST', '/api/integrations/mail/test', {});
  if (res.ok) {
    const d = await res.json();
    showNotification('success', `Test email sent to ${d.sent_to}`);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Mail test failed');
  }
}

// ── API Keys UI ─────────────────────────────────────────────────────────────
async function _loadAPIKeys() {
  const listEl = document.getElementById('apiKeyList');
  if (!listEl) return;
  try {
    const keys = await apiGet('/api/apikeys');
    if (!keys || !keys.length) {
      listEl.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No API keys yet.</p>';
      return;
    }
    listEl.innerHTML = keys.map(k => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(k.name)}</strong>
          ${k.description ? `<span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:6px">${escHtml(k.description)}</span>` : ''}
          ${k.last_used_at ? `<span style="color:var(--text-dim);font-size:var(--fs-xs);display:block">Last used: ${new Date(k.last_used_at).toLocaleString()}</span>` : ''}
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteAPIKey(${k.id})">Delete</button>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load API keys.</p>';
  }
}

async function createAPIKey() {
  const name = document.getElementById('newAPIKeyName')?.value?.trim();
  if (!name) { showError('Key name is required'); return; }
  const res = await apiPost('/api/apikeys', {name, description: ''});
  if (res.ok) {
    const key = await res.json();
    // Show the key once (will not be shown again)
    alert(`New API key created!\n\nKey: ${key.key}\n\nCopy it now — it won't be shown again.`);
    document.getElementById('newAPIKeyName').value = '';
    await _loadAPIKeys();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to create API key');
  }
}

async function deleteAPIKey(id) {
  if (!confirm('Delete this API key? It will stop working immediately.')) return;
  const res = await api('DELETE', `/api/apikeys/${id}`, null);
  if (res.ok) {
    showNotification('success', 'API key deleted');
    await _loadAPIKeys();
  } else {
    showError('Failed to delete API key');
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

// ── Preference actions ─────────────────────────────────────────────────────
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

// ── updateUILabels, updateLangFlags ───────────────────────────────────────
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

  // Toolbar group buttons
  setElText('btnTemplates', '📋 ' + (t('btn_templates')||'Templates'));
  setElText('btnLayerToggle', '🗂 ' + (t('btn_layers')||'Layers'));
  setElText('btnImport', t('btn_import')||'⬆ Import');
  setElText('btnSyntheticTime', t('btn_synth_time')||'⏱ T+');
  setElText('btnPrint', '🖨 ' + (t('btn_print')||'Print'));
  setElText('btnFilter', '🔍 ' + (t('btn_filter')||'Filter'));
  const undoEl = document.getElementById('btnUndo');
  if (undoEl) undoEl.textContent = '↩ ' + (t('btn_undo')||'Undo');

  // Range select options
  const rs = document.getElementById('rangeSelect');
  const rangeKeys = ['day','2days','3days','4days','5days','week','2weeks','3weeks','month','2months','3months'];
  [...rs.options].forEach(opt => { opt.text = t('range_'+opt.value) || opt.text; });

  // Resolution select
  const res = document.getElementById('resolutionSelect');
  [...res.options].forEach(opt => { opt.text = t('res_'+opt.value); });

  // Sidebar tabs — use dynamic group terminology for the groups tab
  const gl = getGroupLabel();
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    if (tab.dataset.tab === 'groups') {
      tab.textContent = '👥 ' + gl.plural;
    } else {
      tab.textContent = t('tab_'+tab.dataset.tab) || tab.dataset.tab;
    }
  });

  // Invited filter "Groups" button uses group terminology
  const filterGroupsBtn = document.querySelector('.inv-filter-btn[data-filter="groups"]');
  if (filterGroupsBtn) filterGroupsBtn.textContent = gl.plural;

  // Move event dialog labels
  setElText('lbl-move-event-time', t('move_event_new_time')||'New date and time');
  setElText('btnConfirmMove', t('move_event_btn')||'Move');
  setElText('lbl-role-editor-title', t('role_editor_title')||'🛡 Role Editor');
  setElText('lbl-role-editor-desc', t('role_editor_desc')||'Edit display names for each role.');
  setElText('btnSaveRoles', t('role_editor_save')||'Save Roles');

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
    const roleMap = {
      observer:'role_observer',read:'role_read',reporter:'role_reporter',
      readwrite:'role_readwrite',teamlead:'role_teamlead',oplead:'role_oplead',
      staffofficer:'role_staffofficer',staffofficer_full:'role_staffofficer_full',admin:'role_admin'
    };
    [...uRole.options].forEach(opt => { const k = roleMap[opt.value]; if (k) opt.text = t(k) || opt.text; });
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
    const typeMap = {
      aar: t('report_type_aar'),
      timeline: t('report_type_timeline'),
      per_layer: t('report_type_perlayer') || 'Per-Layer Activity',
      status_summary: t('report_type_status') || 'Status Summary',
      daily_briefing: t('report_type_daily') || 'Daily Briefing',
      type_breakdown: t('report_type_type') || 'Event Type Breakdown',
      responsible: t('report_type_responsible') || 'Responsible / Resource Report',
      planned_vs_actual: t('report_type_pva') || 'Planned vs. Actual',
      critical_path: t('report_type_cp') || 'Critical Path Analysis',
    };
    [...rType.options].forEach(opt => { opt.text = typeMap[opt.value] || opt.text; });
  }
  const rFmt = document.getElementById('reportFormat');
  if (rFmt) {
    const fmtMap = {html: t('report_format_html_opt') || t('report_format_html'), print: t('report_format_print_opt') || t('report_format_pdf')};
    [...rFmt.options].forEach(opt => { opt.text = fmtMap[opt.value] || opt.text; });
  }

  // Member modal
  setElText('lbl-member-close', t('btn_close'));

  // Translate any element with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated && translated !== key) el.textContent = translated;
  });

  // Search placeholder
  const si = document.getElementById('searchInput');
  if (si) si.placeholder = t('search_placeholder') || 'Search…';

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

// ── Alarm sound engine (Web Audio API) ─────────────────────────────────────
function playAlarmSound(sound) {
  if (!sound || sound === 'none') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (sound === 'klaxon') {
      // Fast alternating high-low tone, 3 cycles
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now + i * 0.4);
        osc.frequency.setValueAtTime(440, now + i * 0.4 + 0.2);
        gain.gain.setValueAtTime(0.4, now + i * 0.4);
        gain.gain.setValueAtTime(0, now + i * 0.4 + 0.38);
        osc.start(now + i * 0.4);
        osc.stop(now + i * 0.4 + 0.39);
      }
    } else if (sound === 'alert') {
      // 4 short beeps
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'square';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.3, now + i * 0.25);
        gain.gain.setValueAtTime(0, now + i * 0.25 + 0.15);
        osc.start(now + i * 0.25);
        osc.stop(now + i * 0.25 + 0.16);
      }
    } else if (sound === 'siren') {
      // Rising-falling sweep
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.5);
      osc.frequency.linearRampToValueAtTime(300, now + 1.0);
      osc.frequency.linearRampToValueAtTime(1200, now + 1.5);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 1.8);
      osc.start(now);
      osc.stop(now + 1.9);
    } else if (sound === 'chime') {
      // Soft bell-like tone
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.6);
    } else if (sound === 'beep') {
      // Single beep
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = 750;
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.31);
    }
    // Auto-close context after sounds finish
    setTimeout(() => ctx.close(), 3000);
  } catch (e) { /* Audio not available */ }
}

// ── SSE ────────────────────────────────────────────────────────────────────

// ── SSE, Alarm ACK: connectSSE, unackedAlarms, showAlarmNotification, dismissAlarmNotif, ackAlarm ──
// ── SSE ────────────────────────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/notifications/stream');
  es.addEventListener('alarm', e => {
    const data = JSON.parse(e.data);
    playAlarmSound(data.sound || 'klaxon');
    showAlarmNotification(data, 0);
  });
  // Listen for event changes from other users
  es.addEventListener('event_change', e => {
    const data = JSON.parse(e.data);
    if (data.action === 'deleted' || data.action === 'created' || data.action === 'updated' || data.action === 'status_changed') {
      refreshAll();
    }
  });
  // Listen for collaborative editing lock events
  es.addEventListener('editing_lock', e => {
    try {
      const data = JSON.parse(e.data);
      if (window._handleEditingLockEvent) window._handleEditingLockEvent(data);
    } catch { /* ignore parse errors */ }
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
    clearInterval(existing.counterID);
    if (existing.element && existing.element.parentNode) existing.element.remove();
  }

  const area = document.getElementById('notification-area');
  const el   = document.createElement('div');
  el.className = `notification alarm alarm-level-${Math.min(level, 2)}`;

  const warnings = level > 0 ? ' ' + '⚠️'.repeat(Math.min(level, 3)) : '';
  const shownAt  = Date.now();
  el.innerHTML = `
    <div class="notification-title">${t('notif_alarm_title')}${escHtml(warnings)}</div>
    <div class="notification-msg">${escHtml(data.message)}</div>
    <div class="alarm-since" style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">⏱ 0s ago</div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm notification-close-btn" onclick="dismissAlarmNotif(${data.alarm_id})">Dismiss</button>
      <button class="btn btn-secondary btn-sm" onclick="openAlarmEvent(${data.event_id})">📋 Show event</button>
      <button class="btn btn-primary btn-sm" onclick="ackAlarm(${data.alarm_id}, this.closest('.notification'))">✓ ${t('alarm_ack')}</button>
    </div>
  `;
  area.appendChild(el);

  // Update "X seconds/minutes ago" counter every second
  const sinceEl = el.querySelector('.alarm-since');
  const counterID = setInterval(() => {
    if (!el.parentNode) { clearInterval(counterID); return; }
    const secs = Math.floor((Date.now() - shownAt) / 1000);
    if (secs < 60) {
      sinceEl.textContent = `⏱ ${secs}s ago`;
    } else {
      const mins = Math.floor(secs / 60);
      const rem  = secs % 60;
      sinceEl.textContent = `⏱ ${mins}m ${rem}s ago`;
    }
  }, 1000);

  // Browser notification on first fire
  if (level === 0 && Notification.permission === 'granted') {
    new Notification('Tidslinjal — ' + t('notif_alarm_title'), {body: data.message});
  }

  // Escalate after 60 s if not acked, as long as we're before the event time
  const eventTime = new Date(data.event_time);
  const timerID = (new Date() < eventTime)
    ? setTimeout(() => showAlarmNotification(data, level + 1), 60000)
    : null;

  unackedAlarms.set(data.alarm_id, {data, level, timerID, counterID, element: el});
}

function dismissAlarmNotif(alarmID) {
  const entry = unackedAlarms.get(alarmID);
  if (entry) {
    clearTimeout(entry.timerID);
    clearInterval(entry.counterID);
    unackedAlarms.delete(alarmID);
    if (entry.element && entry.element.parentNode) entry.element.remove();
  }
}

async function openAlarmEvent(eventId) {
  let ev = state.events.find(x => x.id === eventId);
  if (!ev) {
    // Event might not be in current view — fetch it
    const data = await apiGet(`/api/events/${eventId}`);
    if (data && data.id) ev = data;
  }
  if (ev) showEventDetail(ev);
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

// ── Export, Import, exportCSV, ICS helpers, exportICS, Templates ─────────
// ── Export ─────────────────────────────────────────────────────────────────
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
  // Show/hide category section based on file type
  const fileEl = document.getElementById('importFile');
  if (fileEl) {
    fileEl.onchange = () => {
      const isICS = fileEl.files.length && fileEl.files[0].name.toLowerCase().endsWith('.ics');
      const catGroup   = document.getElementById('importCategoryGroup');
      const reassignR  = document.getElementById('importReassignRow');
      if (catGroup) catGroup.style.display = isICS ? 'none' : '';
      if (reassignR) reassignR.style.display = isICS ? 'none' : (isPriv ? '' : 'none');
    };
  }
  const resultEl = document.getElementById('importResult');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }
  openModal('importModal');
}

async function doImport() {
  const fileEl = document.getElementById('importFile');
  if (!fileEl || !fileEl.files.length) { showError('Please select a JSON or ICS file.', 'Validation'); return; }
  const file = fileEl.files[0];
  const isICS = file.name.toLowerCase().endsWith('.ics');
  const resultEl = document.getElementById('importResult');

  if (isICS) {
    const fd = new FormData();
    fd.append('data', file);
    const res = await api('POST', '/api/import/ics', fd);
    if (res.ok) {
      const r = await res.json();
      const msg = `ICS imported: ${r.events||0} events. Skipped: ${r.skipped||0}.`;
      if (resultEl) { resultEl.textContent = msg; resultEl.style.display = ''; }
      await refreshAll();
      showNotification('success', 'ICS import complete');
      _setImportDoneMode();
    } else {
      const err = await res.json();
      showError('ICS import failed: ' + err.error);
    }
    return;
  }

  const cats = [...document.querySelectorAll('.import-cat-cb:checked')].map(cb => cb.value);
  if (!cats.length) { showError('Select at least one category to import.', 'Validation'); return; }
  const reassign = document.getElementById('importReassign')?.checked || false;
  const fd = new FormData();
  fd.append('data', file);
  fd.append('include', cats.join(','));
  fd.append('reassign', reassign ? 'true' : 'false');
  const res = await api('POST', '/api/import', fd);
  if (res.ok) {
    const r = await res.json();
    const msg = `Imported: ${r.events||0} events, ${r.groups||0} groups, ${r.layers||0} layers, ${r.alarms||0} alarms, ${r.users||0} users. Skipped: ${r.skipped||0}.`;
    if (resultEl) { resultEl.textContent = msg; resultEl.style.display = ''; }
    await refreshAll();
    showNotification('success', 'Import complete');
    _setImportDoneMode();
  } else {
    const err = await res.json();
    showError('Import failed: ' + err.error);
  }
}

function _setImportDoneMode() {
  const cancelBtn = document.getElementById('btnImportCancel');
  const importBtn = document.getElementById('btnDoImport');
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (importBtn) {
    importBtn.textContent = '✓ ' + (t('import_done')||'Done');
    importBtn.onclick = () => {
      closeModal('importModal');
      // Reset for next open
      setTimeout(() => {
        if (cancelBtn) cancelBtn.style.display = '';
        if (importBtn) {
          importBtn.textContent = t('btn_import')||'⬆ Import';
          importBtn.onclick = doImport;
        }
      }, 300);
    };
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

// ── Templates ──────────────────────────────────────────────────────────────
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
  state.templates = templates; // keep in state for legend
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
        <button class="btn btn-primary btn-sm" onclick="openApplyTemplateDialog(${tmpl.id})">▶ Apply</button>
        ${(state.user && (state.user.id === tmpl.created_by || hasRole2(state.user.role, 'admin')))
          ? `<button class="btn btn-danger btn-sm" onclick="deleteTemplate(${tmpl.id})">Delete</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function _fmtLocalDTInput(d) {
  // Format a Date as "YYYY-MM-DDTHH:MM" for datetime-local inputs
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _countEventsInRange(from, to) {
  return (state.events || []).filter(e => {
    const s = new Date(e.start_time);
    const endT = e.end_time ? new Date(e.end_time) : s;
    return s < to && endT >= from;
  }).length;
}

function _updateTmplRangeCount() {
  const fromEl = document.getElementById('tmplRangeFrom');
  const toEl   = document.getElementById('tmplRangeTo');
  const countEl = document.getElementById('tmplEventCount');
  if (!fromEl || !toEl || !countEl) return;
  const from = fromEl.value ? new Date(fromEl.value) : null;
  const to   = toEl.value   ? new Date(toEl.value)   : null;
  if (!from || !to) { countEl.textContent = ''; return; }
  const evCount = _countEventsInRange(from, to);
  const phases = (state.phases||[]).filter(p => new Date(p.start_time) < to && new Date(p.end_time) > from);
  const locks  = (state.locks ||[]).filter(l => new Date(l.start_time) < to && new Date(l.end_time) > from);
  let msg = `Will save ${evCount} event${evCount!==1?'s':''}`;
  if (phases.length) msg += `, ${phases.length} phase${phases.length!==1?'s':''}`;
  if (locks.length)  msg += `, ${locks.length} lock${locks.length!==1?'s':''}`;
  msg += ' in selected range.';
  countEl.textContent = msg;
}

function openSaveTemplateDialog() {
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
  // Default date range to current view
  const days = typeof getDays === 'function' ? getDays() : [];
  const fromDef = days.length ? days[0] : state.startDate || new Date();
  const toDef   = days.length ? (() => { const d = new Date(days[days.length-1]); d.setDate(d.getDate()+1); return d; })()
                              : (() => { const d = new Date(fromDef); d.setDate(d.getDate()+7); return d; })();
  const fromEl = document.getElementById('tmplRangeFrom');
  const toEl   = document.getElementById('tmplRangeTo');
  if (fromEl) { fromEl.value = _fmtLocalDTInput(fromDef); fromEl.oninput = _updateTmplRangeCount; }
  if (toEl)   { toEl.value   = _fmtLocalDTInput(toDef);   toEl.oninput   = _updateTmplRangeCount; }
  _updateTmplRangeCount();
  document.getElementById('btnConfirmSaveTemplate').onclick = confirmSaveTemplate;
  openModal('saveTemplateModal');
}

async function confirmSaveTemplate() {
  const name = document.getElementById('tmplName').value.trim();
  if (!name) { showError('Template name is required.', 'Validation'); return; }
  const scope = document.getElementById('tmplScope').value;
  // Get date range
  const fromVal = document.getElementById('tmplRangeFrom')?.value;
  const toVal   = document.getElementById('tmplRangeTo')?.value;
  const rangeFrom = fromVal ? new Date(fromVal) : null;
  const rangeTo   = toVal   ? new Date(toVal)   : null;
  // Filter events by range (or all if no range set)
  let events = state.events || [];
  if (rangeFrom && rangeTo) {
    events = events.filter(e => {
      const s = new Date(e.start_time);
      const en = e.end_time ? new Date(e.end_time) : s;
      return s < rangeTo && en >= rangeFrom;
    });
  }
  if (!events.length) { showError('No events in the selected date range.', 'Validation'); return; }
  // Find earliest start to anchor offsets
  const earliest = Math.min(...events.map(e => new Date(e.start_time).getTime()));
  // Fetch attachments for each event to include in template
  const attachmentPromises = events.map(async e => {
    try {
      return await apiGet(`/api/events/${e.id}/attachments`) || [];
    } catch { return []; }
  });
  const allAttachments = await Promise.all(attachmentPromises);

  const items = events.map((e, idx) => {
    const startMs = new Date(e.start_time).getTime();
    const endMs   = e.end_time ? new Date(e.end_time).getTime() : null;
    const atts = (allAttachments[idx] || []).map(a => ({
      filename:    a.filename,
      stored_name: a.stored_name,
      size:        a.size,
      mime_type:   a.mime_type,
    }));
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
      attachments:        atts,
    };
  });
  // Build phases relative to earliest event time
  const phases = (state.phases || [])
    .filter(p => {
      if (!rangeFrom || !rangeTo) return true;
      return new Date(p.start_time) < rangeTo && new Date(p.end_time) > rangeFrom;
    })
    .map(p => ({
      name:             p.name,
      color:            p.color,
      start_offset_min: Math.round((new Date(p.start_time).getTime() - earliest) / 60000),
      end_offset_min:   Math.round((new Date(p.end_time).getTime()   - earliest) / 60000),
      order:            p.order || 0,
    }));
  // Build locks relative to earliest event time
  const locks = (state.locks || [])
    .filter(l => {
      if (!rangeFrom || !rangeTo) return true;
      return new Date(l.start_time) < rangeTo && new Date(l.end_time) > rangeFrom;
    })
    .map(l => ({
      start_offset_min: Math.round((new Date(l.start_time).getTime() - earliest) / 60000),
      end_offset_min:   Math.round((new Date(l.end_time).getTime()   - earliest) / 60000),
      reason:           l.reason || '',
      scope:            l.scope  || 'all',
    }));
  // Capture current theme/terminology settings
  const ex = state.exercise || {};
  const payload = {
    name,
    description: document.getElementById('tmplDescription').value.trim(),
    scope,
    items,
    phases: phases.length ? phases : undefined,
    locks:  locks.length  ? locks  : undefined,
    roles:  (state.roleConfigs && state.roleConfigs.length) ? state.roleConfigs : undefined,
    theme:          state.preferences.theme    || undefined,
    size:           state.preferences.size     || undefined,
    language:       state.preferences.language || undefined,
    operation_mode: ex.operation_mode          || undefined,
    group_label:    ex.group_label             || undefined,
    user_label:     ex.user_label              || undefined,
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

function openApplyTemplateDialog(id) {
  try {
    const tmpl = (state.templates || []).find(t => t.id === id);
    const name = tmpl ? tmpl.name : `Template ${id}`;
    const itemCount = tmpl ? (tmpl.item_count || 0) : 0;
    dbg('[template] openApplyTemplateDialog id=%o name=%o items=%o', id, name, itemCount);
    document.getElementById('applyTemplateInfo').textContent =
      `Apply template "${name}" — ${itemCount} event${itemCount!==1?'s':''}`;
    document.getElementById('applyTemplateBase').value = fmtDateInput(new Date());
    // Populate layer select
    const layerSel = document.getElementById('applyTemplateLayer');
    layerSel.innerHTML = `<option value="">Master Timeline</option>` +
      (state.layers || []).filter(l => l.owner_id===(state.user&&state.user.id) || l.permission==='readwrite')
        .map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
    document.getElementById('btnConfirmApplyTemplate').onclick = () => confirmApplyTemplate(id);
    openModal('applyTemplateModal');
  } catch(e) {
    console.error('[template] openApplyTemplateDialog error:', e);
    showError('Failed to open apply dialog: ' + e.message);
  }
}

async function confirmApplyTemplate(id) {
  const baseVal  = document.getElementById('applyTemplateBase').value;
  if (!baseVal) { showError('Please select a base date/time.', 'Validation'); return; }
  const layerVal = document.getElementById('applyTemplateLayer').value;
  const payload  = {
    base_time: new Date(baseVal).toISOString(),
    layer_id:  layerVal ? parseInt(layerVal, 10) : null,
  };
  dbg('[template] confirmApplyTemplate id=%o payload=%o', id, payload);
  let res;
  try {
    res = await apiPost(`/api/templates/${id}/apply`, payload);
  } catch(e) {
    console.error('[template] apply fetch error:', e);
    showError('Network error applying template: ' + e.message);
    return;
  }
  if (res.ok) {
    const r = await res.json();
    dbg('[template] applied: created=%o exerciseName=%o', r.created, r.exercise_name);
    closeModal('applyTemplateModal');
    closeModal('templatesModal');
    const tmpl = (state.templates || []).find(t2 => t2.id === id);
    if (tmpl) state.lastAppliedTemplate = tmpl.name;
    // If server set an exercise name from the template, update local state
    if (r.exercise_name) {
      state.exercise = state.exercise || {};
      state.exercise.label = r.exercise_name;
    }
    // Update STARTEX epoch to the base time the user specified
    if (r.startex) {
      state.exercise = state.exercise || {};
      state.exercise.epoch = r.startex;
    }
    // If server applied day hour preferences from the template, update local state
    if (r.day_end_hour > 0) {
      state.preferences.day_start_hour = r.day_start_hour;
      state.preferences.day_end_hour   = r.day_end_hour;
    }
    // Apply theme/size/language if returned from template
    if (r.theme) { state.preferences.theme = r.theme; }
    if (r.size)  { state.preferences.size  = r.size;  }
    if (r.language) { state.preferences.language = r.language; }
    if (r.theme || r.size || r.language) { applyPreferences(); }
    // Apply operation mode / terminology settings
    if (r.operation_mode || r.group_label || r.user_label) {
      state.exercise = state.exercise || {};
      if (r.operation_mode) state.exercise.operation_mode = r.operation_mode;
      if (r.group_label)    state.exercise.group_label    = r.group_label;
      if (r.user_label)     state.exercise.user_label     = r.user_label;
    }
    await refreshAll();
    const nameSuffix = r.exercise_name ? ` — exercise: ${r.exercise_name}` : '';
    showNotification('success', `Created ${r.created || 0} event${(r.created||0)!==1?'s':''} from template${nameSuffix}`);
  } else {
    let errMsg = 'Failed to apply template';
    try { const err = await res.json(); errMsg = err.error || errMsg; } catch(_) {}
    console.error('[template] apply error:', res.status, errMsg);
    showError(errMsg);
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

// ── Template file import / export ─────────────────────────────────────────
async function exportTemplatesToFile() {
  const templates = await apiGet('/api/templates') || [];
  if (!templates.length) { showNotification('warning', 'No templates to export.'); return; }
  const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'templates.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importTemplateFromFile() {
  document.getElementById('templateFileInput').value = '';
  document.getElementById('templateFileInput').click();
}

async function handleTemplateFileLoad(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { showError('Invalid JSON file: ' + e.message); return; }
  const templates = Array.isArray(data) ? data : [data];
  dbg('[template] loading file %o: found %o template(s)', file.name, templates.length);
  let created = 0;
  let errors  = 0;
  const canPublic = state.user && hasRole2(state.user.role, 'oplead');
  for (const tmpl of templates) {
    if (!tmpl.name || !Array.isArray(tmpl.items)) {
      dbg('[template] skipped (no name or items):', tmpl);
      errors++;
      continue;
    }
    const scope = (tmpl.scope === 'public' && canPublic) ? 'public' : 'private';
    const payload = {
      name:           tmpl.name,
      description:    tmpl.description || '',
      exercise_name:  tmpl.exercise_name  || undefined,
      day_start_hour: tmpl.day_start_hour || undefined,
      day_end_hour:   tmpl.day_end_hour   || undefined,
      scope,
      items:          tmpl.items,
      phases:         tmpl.phases  || undefined,
      locks:          tmpl.locks   || undefined,
      roles:          tmpl.roles   || undefined,
      theme:          tmpl.theme          || undefined,
      size:           tmpl.size           || undefined,
      language:       tmpl.language       || undefined,
      operation_mode: tmpl.operation_mode || undefined,
      group_label:    tmpl.group_label    || undefined,
      user_label:     tmpl.user_label     || undefined,
    };
    dbg('[template] importing %o: items=%o phases=%o locks=%o scope=%o',
      tmpl.name, tmpl.items.length, (tmpl.phases||[]).length, (tmpl.locks||[]).length, scope);
    const res = await apiPost('/api/templates', payload);
    if (res.ok) {
      const created_tmpl = await res.json();
      dbg('[template] imported OK id=%o', created_tmpl.id);
      created++;
    } else {
      errors++;
      try {
        const err = await res.json();
        console.warn('[template] import error:', tmpl.name, res.status, err.error);
      } catch { /* ignore */ }
    }
  }
  // If any imported template had an exercise_name, set it in exercise settings
  const firstWithName = templates.find(t => t.exercise_name);
  if (firstWithName && firstWithName.exercise_name) {
    const ex = { ...(state.exercise || {}), label: firstWithName.exercise_name };
    const exRes = await apiPut('/api/exercise', ex);
    if (exRes.ok) {
      state.exercise = ex;
      dbg('[template] Set exercise name from template: %o', firstWithName.exercise_name);
    }
  }
  // If any imported template had day_hours, update preferences
  const firstWithDayHours = templates.find(t => t.day_end_hour > 0);
  if (firstWithDayHours) {
    state.preferences.day_start_hour = firstWithDayHours.day_start_hour || 0;
    state.preferences.day_end_hour   = firstWithDayHours.day_end_hour;
    await savePreferences();
    dbg('[template] Set day hours from template: %o-%o', firstWithDayHours.day_start_hour, firstWithDayHours.day_end_hour);
  }
  if (created > 0) {
    showNotification('success', `Imported ${created} template${created!==1?'s':''}${errors>0?' ('+errors+' failed)':''}${firstWithName?' — exercise: '+firstWithName.exercise_name:''}`);
  } else {
    showError(`No templates imported.${errors>0?' '+errors+' file(s) failed.':''}`);
  }
  await renderTemplatesList();
}

// ── ICS Export ─────────────────────────────────────────────────────────────
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
}

// ── Mouse drag-to-pan (DOMContentLoaded) ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) panTriggered = true;
    container.scrollLeft = startScrollLeft - dx;
  });

  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    container.style.cursor = '';
    // If we dragged far enough horizontally, navigate to adjacent date range
    const dx = startX - e.clientX;
    if (Math.abs(dx) > container.clientWidth * 0.4) {
      navigate(dx > 0 ? 1 : -1);
    }
  });
});

// ── ICS drag-and-drop on the calendar view ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const tc = document.getElementById('timeline-container');
  if (!tc) return;

  // Overlay shown while dragging an ICS file over the calendar
  const overlay = document.createElement('div');
  overlay.id = 'ics-drop-overlay';
  overlay.style.cssText = [
    'position:absolute','inset:0','display:none','align-items:center',
    'justify-content:center','background:rgba(0,0,0,0.45)',
    'color:#fff','font-size:1.4rem','font-weight:600',
    'pointer-events:none','border-radius:var(--radius)',
    'z-index:900','border:3px dashed var(--accent)',
  ].join(';');
  overlay.textContent = '📅 Drop ICS file to import';
  tc.style.position = tc.style.position || 'relative';
  tc.appendChild(overlay);

  let dragDepth = 0;

  tc.addEventListener('dragenter', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    overlay.style.display = 'flex';
    e.preventDefault();
  });
  tc.addEventListener('dragleave', () => {
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; overlay.style.display = 'none'; }
  });
  tc.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  tc.addEventListener('drop', async e => {
    e.preventDefault();
    dragDepth = 0;
    overlay.style.display = 'none';
    const file = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.ics'));
    if (!file) { showError('Please drop an .ics file.', 'ICS Import'); return; }
    const fd = new FormData();
    fd.append('data', file);
    const res = await api('POST', '/api/import/ics', fd);
    if (res.ok) {
      const r = await res.json();
      showNotification('success', `ICS imported: ${r.events||0} events, ${r.skipped||0} skipped`);
      await refreshAll();
    } else {
      const err = await res.json();
      showError('ICS import failed: ' + err.error);
    }
  });
});

// ── Password change ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnSavePw = document.getElementById('btnSavePassword');
  if (btnSavePw) {
    btnSavePw.addEventListener('click', async () => {
      const curPw  = document.getElementById('pwdCurrent')?.value || '';
      const newPw  = document.getElementById('pwdNew')?.value?.trim()    || '';
      const conPw  = document.getElementById('pwdConfirm')?.value?.trim() || '';
      if (!newPw || newPw !== conPw) {
        showError(t('password_mismatch') || 'Passwords do not match', 'Validation'); return;
      }
      const res = await apiPost('/api/auth/change-password', {current_password: curPw, new_password: newPw});
      if (res.ok) {
        closeModal('passwordModal');
        showNotification('success', t('password_saved')||'Password changed');
      } else {
        const err = await res.json();
        showError(err.error);
      }
    });
  }

  const btnExport = document.getElementById('btnExportData');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const res = await api('GET', '/api/export');
      if (!res.ok) { showError('Export failed'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `tidslinjal-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  const btnReport = document.getElementById('btnReport');
  if (btnReport) {
    btnReport.addEventListener('click', () => {
      // Populate layer checkboxes in report modal
      const layerList = document.getElementById('reportLayerList');
      if (layerList) {
        layerList.innerHTML = `
          <label class="group-chip selected" style="cursor:pointer">
            <input type="checkbox" class="report-layer-cb" value="0" checked style="margin-right:4px">
            ${t('layers_master')||'Master'}
          </label>
          ${state.layers.map(l => `
            <label class="group-chip selected" style="cursor:pointer">
              <input type="checkbox" class="report-layer-cb" value="${l.id}" checked style="margin-right:4px">
              ${escHtml(l.name)}
            </label>
          `).join('')}
        `;
        // Toggle chip selected class on change
        layerList.querySelectorAll('.report-layer-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            cb.closest('.group-chip').classList.toggle('selected', cb.checked);
          });
        });
      }
      openModal('reportModal');
    });
  }
});


// ── generateReport, mobileNavTab, closeMobileSidebar ─────────────────────
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
  <p style="color:#666;font-size:13px">Generated: ${fmtDateTime(new Date())}</p>`;

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
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
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
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });

  } else if (type === 'status_summary') {
    // Status summary: pie-chart-style table with counts per status
    const byStatus = {};
    statusOrder.forEach(s => { byStatus[s] = 0; });
    events.forEach(ev => { const s = ev.status||'planned'; if (byStatus[s] !== undefined) byStatus[s]++; });
    const total = events.length;
    html += `<h2>Status Summary — ${total} events total</h2>
    <table><thead><tr><th>Status</th><th>Count</th><th>Percentage</th></tr></thead><tbody>
    ${statusOrder.filter(s => byStatus[s] > 0).map(s => `<tr>
      <td><strong>${t('status_'+s)||s}</strong></td>
      <td>${byStatus[s]}</td>
      <td>${total ? Math.round(byStatus[s]/total*100) : 0}%</td>
    </tr>`).join('')}
    </tbody></table>`;

  } else if (type === 'daily_briefing') {
    // Daily briefing: events grouped by day, chronological
    const byDay = {};
    events.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).forEach(ev => {
      const day = new Date(ev.start_time).toLocaleDateString();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(ev);
    });
    Object.entries(byDay).forEach(([day, evs]) => {
      html += `<h2>📅 ${day} (${evs.length} events)</h2>
      <table><thead><tr><th>Time</th><th>Title</th><th>Type</th><th>Status</th><th>Responsible</th><th>Location</th></tr></thead><tbody>
      ${evs.map(ev => `<tr>
        <td>${ev.all_day ? 'All day' : new Date(ev.start_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
        <td><strong>${escHtml(ev.title)}</strong></td>
        <td>${escHtml(ev.event_type)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
        <td>${escHtml(ev.responsible_name || ev.created_by_name || '')}</td>
        <td>${escHtml(ev.physical_location || '')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });
    if (!Object.keys(byDay).length) html += '<p style="color:#888">No events in this period.</p>';

  } else if (type === 'type_breakdown') {
    // Event type breakdown
    const byType = {};
    events.forEach(ev => {
      const k = ev.event_type || 'event';
      if (!byType[k]) byType[k] = [];
      byType[k].push(ev);
    });
    const sorted = Object.entries(byType).sort((a,b) => b[1].length - a[1].length);
    html += `<h2>Event Type Breakdown — ${events.length} events total</h2>
    <table><thead><tr><th>Type</th><th>Count</th><th>%</th><th>Avg Duration</th></tr></thead><tbody>
    ${sorted.map(([typ, evs]) => {
      const avgMs = evs.reduce((acc, ev) => {
        if (!ev.end_time) return acc;
        return acc + (new Date(ev.end_time) - new Date(ev.start_time));
      }, 0) / (evs.filter(e => e.end_time).length || 1);
      const avgMin = Math.round(avgMs / 60000);
      return `<tr>
        <td><strong>${escHtml(typ)}</strong></td>
        <td>${evs.length}</td>
        <td>${events.length ? Math.round(evs.length/events.length*100) : 0}%</td>
        <td>${avgMin > 0 ? (avgMin >= 60 ? Math.round(avgMin/60)+'h '+(avgMin%60)+'m' : avgMin+'m') : '—'}</td>
      </tr>`;
    }).join('')}
    </tbody></table>`;

  } else if (type === 'responsible') {
    // Responsible / resource report: events grouped by responsible person
    const byResp = {};
    events.forEach(ev => {
      const k = ev.responsible_name || ev.created_by_name || 'Unassigned';
      if (!byResp[k]) byResp[k] = [];
      byResp[k].push(ev);
    });
    const sorted = Object.entries(byResp).sort((a,b) => b[1].length - a[1].length);
    sorted.forEach(([name, evs]) => {
      const totalMins = evs.reduce((acc, ev) => {
        if (!ev.end_time) return acc;
        return acc + (new Date(ev.end_time) - new Date(ev.start_time)) / 60000;
      }, 0);
      html += `<h2>${escHtml(name)} — ${evs.length} events (${Math.round(totalMins/60*10)/10}h)</h2>
      <table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>Duration</th></tr></thead><tbody>
      ${evs.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).map(ev => `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${escHtml(ev.event_type)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
      </tr>`).join('')}
      </tbody></table>`;
    });

  } else if (type === 'planned_vs_actual') {
    // Planned vs Actual: compare planned_start/planned_end vs actual
    const withPlanned = events.filter(ev => ev.planned_start);
    html += `<h2>Planned vs. Actual — ${withPlanned.length} events with planned times</h2>
    <table><thead><tr><th>Title</th><th>Planned Start</th><th>Actual Start</th><th>Start Δ</th><th>Planned End</th><th>Actual End</th><th>End Δ</th><th>Status</th></tr></thead><tbody>
    ${withPlanned.sort((a,b)=>new Date(a.planned_start)-new Date(b.planned_start)).map(ev => {
      const pStart = new Date(ev.planned_start);
      const aStart = new Date(ev.start_time);
      const deltaStart = Math.round((aStart - pStart) / 60000);
      const pEnd = ev.planned_end ? new Date(ev.planned_end) : null;
      const aEnd = ev.end_time ? new Date(ev.end_time) : null;
      const deltaEnd = (pEnd && aEnd) ? Math.round((aEnd - pEnd) / 60000) : null;
      const fmtDelta = d => d === null ? '—' : (d > 0 ? `<span style="color:#c00">+${d}m</span>` : d < 0 ? `<span style="color:#0a0">${d}m</span>` : '<span style="color:#888">On time</span>');
      return `<tr>
        <td>${escHtml(ev.title)}</td>
        <td>${fmtDateTime(pStart)}</td>
        <td>${fmtDateTime(aStart)}</td>
        <td>${fmtDelta(deltaStart)}</td>
        <td>${pEnd ? fmtDateTime(pEnd) : '—'}</td>
        <td>${aEnd ? fmtDateTime(aEnd) : '—'}</td>
        <td>${fmtDelta(deltaEnd)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
    ${withPlanned.length === 0 ? '<p style="color:#888;margin-top:8px">No events have planned times recorded yet. Planned times are captured automatically on the first edit of an event.</p>' : ''}`;

  } else if (type === 'critical_path') {
    // Critical path analysis: find longest dependency chain
    const idMap = {};
    events.forEach(ev => { idMap[ev.id] = ev; });
    const longestPath = [];
    const memo = {};

    function calcPath(evId) {
      if (memo[evId] !== undefined) return memo[evId];
      const ev = idMap[evId];
      if (!ev || !ev.depends_on || !ev.depends_on.length) {
        memo[evId] = {len: 0, path: [evId]};
        return memo[evId];
      }
      let best = {len: -1, path: []};
      for (const dep of ev.depends_on) {
        const sub = calcPath(dep);
        if (sub.len > best.len) best = sub;
      }
      memo[evId] = {len: best.len + 1, path: [...best.path, evId]};
      return memo[evId];
    }

    events.forEach(ev => { if (!memo[ev.id]) calcPath(ev.id); });
    let maxPath = {len: 0, path: []};
    Object.values(memo).forEach(r => { if (r.len > maxPath.len) maxPath = r; });

    const cpIds = new Set(maxPath.path);
    html += `<h2>Critical Path Analysis</h2>
    <p style="color:#666;font-size:13px">The critical path is the longest chain of dependent events. Delays on the critical path delay the entire timeline.</p>
    <h3 style="font-size:14px;margin-top:16px">Critical Path (${maxPath.path.length} events):</h3>
    <table><thead><tr><th>#</th><th>Event</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th></tr></thead><tbody>
    ${maxPath.path.map((id, i) => {
      const ev = idMap[id];
      if (!ev) return '';
      return `<tr style="background:${i%2===0?'#fff9e6':'#fff'}">
        <td>${i+1}</td>
        <td><strong>${escHtml(ev.title)}</strong></td>
        <td>${fmtDateTime(new Date(ev.start_time))}</td>
        <td>${ev.end_time ? fmtDateTime(new Date(ev.end_time)) : '—'}</td>
        <td>${fmtDuration(ev.start_time, ev.end_time)}</td>
        <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
    <h3 style="font-size:14px;margin-top:16px">All events with dependencies:</h3>
    <table><thead><tr><th>Event</th><th>Depends On</th><th>On Critical Path</th></tr></thead><tbody>
    ${events.filter(ev => ev.depends_on && ev.depends_on.length).map(ev => `<tr>
      <td>${escHtml(ev.title)}</td>
      <td>${ev.depends_on.map(d => idMap[d] ? escHtml(idMap[d].title) : d).join(', ')}</td>
      <td>${cpIds.has(ev.id) ? '⚠️ Yes' : '—'}</td>
    </tr>`).join('')}
    </tbody></table>
    ${!events.some(ev => ev.depends_on && ev.depends_on.length) ? '<p style="color:#888;margin-top:8px">No event dependencies defined yet. Add dependencies via the event editor.</p>' : ''}`;

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

// ── Auto Report ─────────────────────────────────────────────────────────────
// Auto-report schedules stored in localStorage (client-side scheduling)
function _getAutoReports() {
  try { return JSON.parse(localStorage.getItem('autoReports') || '[]'); } catch { return []; }
}
function _saveAutoReports(list) {
  localStorage.setItem('autoReports', JSON.stringify(list));
}

function openAutoReportModal() {
  _renderAutoReportList();
  openModal('autoReportModal');
}

function _renderAutoReportList() {
  const list = _getAutoReports();
  const el   = document.getElementById('autoReportList');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">No schedules configured yet.</p>';
    return;
  }
  el.innerHTML = list.map((r, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:6px">
      <div>
        <strong>${escHtml(r.type)}</strong> — ${escHtml(r.frequency)}
        ${r.recipient ? `<span style="color:var(--text-dim);margin-left:8px">→ ${escHtml(r.recipient)}</span>` : ''}
        <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:8px">Next: ${_nextRunLabel(r)}</span>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteAutoReport(${i})">Remove</button>
    </div>
  `).join('');
}

function _nextRunLabel(r) {
  if (!r.nextRun) return 'soon';
  const d = new Date(r.nextRun);
  return d.toLocaleString();
}

function _calcNextRun(frequency) {
  const now = Date.now();
  switch (frequency) {
    case 'hourly': return now + 3600000;
    case 'daily':  return now + 86400000;
    case 'weekly': return now + 7 * 86400000;
    default:       return now + 86400000;
  }
}

function addAutoReport() {
  const type      = document.getElementById('arType')?.value || 'timeline';
  const frequency = document.getElementById('arFrequency')?.value || 'daily';
  const delivery  = document.getElementById('arDelivery')?.value || 'download';
  const recipient = document.getElementById('arRecipient')?.value?.trim() || '';

  const list = _getAutoReports();
  list.push({ type, frequency, delivery, recipient, nextRun: _calcNextRun(frequency), created: Date.now() });
  _saveAutoReports(list);
  _renderAutoReportList();
  showNotification('success', 'Auto-report schedule added');

  // Clear recipient field
  const rec = document.getElementById('arRecipient');
  if (rec) rec.value = '';
}

function deleteAutoReport(idx) {
  const list = _getAutoReports();
  list.splice(idx, 1);
  _saveAutoReports(list);
  _renderAutoReportList();
}

// Check and fire auto-reports that are due (called on page load and periodically)
function checkAutoReports() {
  const list = _getAutoReports();
  const now  = Date.now();
  let changed = false;
  list.forEach((r, i) => {
    if (r.nextRun && r.nextRun <= now) {
      // Generate and deliver the report
      _runAutoReport(r);
      list[i].nextRun = _calcNextRun(r.frequency);
      changed = true;
    }
  });
  if (changed) _saveAutoReports(list);
}

async function _runAutoReport(r) {
  // Build events for last period
  const to   = new Date();
  const msBack = r.frequency === 'hourly' ? 3600000 : r.frequency === 'weekly' ? 7*86400000 : 86400000;
  const from  = new Date(Date.now() - msBack);

  const events = state.events.filter(ev => {
    const evStart = new Date(ev.start_time);
    return evStart >= from && evStart < to;
  });

  const title = `Auto ${r.type.toUpperCase()} Report — ${from.toLocaleDateString()} to ${to.toLocaleDateString()}`;
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
  <style>body{font-family:sans-serif;margin:32px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ccc;padding:6px 10px}th{background:#f0f0f0}</style></head><body>
  <h1>${escHtml(title)}</h1><p style="color:#666;font-size:13px">Auto-generated: ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Start</th><th>End</th></tr></thead><tbody>
  ${events.sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).map(ev => `<tr>
    <td>${escHtml(ev.title)}</td>
    <td>${escHtml(ev.event_type)}</td>
    <td>${t('status_'+(ev.status||'planned'))||ev.status}</td>
    <td>${new Date(ev.start_time).toLocaleString()}</td>
    <td>${ev.end_time ? new Date(ev.end_time).toLocaleString() : '—'}</td>
  </tr>`).join('')}
  </tbody></table></body></html>`;

  if (r.delivery === 'download') {
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `auto-report-${r.type}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else if (r.delivery === 'webhook' && r.recipient) {
    try {
      await fetch(r.recipient, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: `Auto report ready: ${title}`, html})
      });
    } catch { /* silent fail */ }
  } else if (r.delivery === 'email' && r.recipient) {
    // Send via server-side mail API if available
    try {
      await apiPost('/api/mail/send', {
        to: r.recipient,
        subject: title,
        body_html: html
      });
    } catch { /* silent fail */ }
  }
  showNotification('success', `Auto report generated: ${title}`);
}

// ── Mobile nav ─────────────────────────────────────────────────────────────
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

// ── Help modal left-pane navigation ────────────────────────────────────────
// old conflict started here: old code

function initHelpNav() {
  const toc     = document.querySelector('.help-toc');
  const content = document.querySelector('.help-content');
  if (!toc || !content) return;

  const links = toc.querySelectorAll('.help-toc-link');
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('href')?.replace('#', '');
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  });

  // Highlight active section on scroll
  content.addEventListener('scroll', () => {
    let activeId = null;
    links.forEach(link => {
      const id = link.getAttribute('href')?.replace('#', '');
      if (!id) return;
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top - content.getBoundingClientRect().top < 80) {
        activeId = id;
      }
    });
    links.forEach(link => {
      const id = link.getAttribute('href')?.replace('#', '');
      link.classList.toggle('active', id === activeId);
    });
  });

  // Activate first link by default
  if (links.length > 0) links[0].classList.add('active');
}

// Call when help modal opens
document.addEventListener('DOMContentLoaded', () => {
  const helpBtn = document.getElementById('btnHelp');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      setTimeout(initHelpNav, 50);
    });
  }
});

// old conflict ended here for old code =======
// new code start here
// ── Reset Database ──────────────────────────────────────────────────────────
async function resetDatabase() {
  if (!confirm('WARNING: This will permanently delete ALL data except the audit trail. Are you sure?')) return;
  if (!confirm('This action CANNOT be undone. Type "RESET" in the next prompt to confirm.')) return;
  const confirmation = prompt('Type RESET to confirm database reset:');
  if (confirmation !== 'RESET') { showNotification('info', 'Reset cancelled.'); return; }
  const res = await apiPost('/api/reset', {});
  if (res.ok) {
    showNotification('success', 'Database has been reset to empty.');
    // Clear extra clocks from local state
    if (state.preferences) state.preferences.extra_clocks = [];
    await refreshAll();
    renderSidebar();
  } else {
    const err = await res.json();
    showError(err.error || 'Reset failed');
  }
}

// ── Operation mode label helpers ───────────────────────────────────────────
function getStartexLabel(ex) {
  const mode = ex && ex.operation_mode;
  if (mode === 'incident') return 'Incident start';
  if (mode === 'operation') return 'OPSTART';
  return 'STARTEX';
}
function getEndexLabel(ex) {
  const mode = ex && ex.operation_mode;
  if (mode === 'incident') return 'Incident end';
  if (mode === 'operation') return 'OPEND';
  return 'ENDEX';
}
function getOperationNameLabel(ex) {
  const mode = ex && ex.operation_mode;
  if (mode === 'incident') return 'Incident name / ticket';
  if (mode === 'operation') return 'Operation name';
  return t('settings_exercise_label') || 'Exercise name';
}

// ── Group Label Switching ──────────────────────────────────────────────────
async function setGroupLabel(label) {
  state.exercise = state.exercise || {};
  state.exercise.group_label = label;
  const payload = { ...state.exercise };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    renderSidebar();
    updateUILabels();
    showNotification('success', 'Group terminology updated to: ' + label);
  }
}

async function setUserLabel(label) {
  state.exercise = state.exercise || {};
  state.exercise.user_label = label;
  const payload = { ...state.exercise };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    renderSidebar();
    updateUILabels();
    showNotification('success', 'User terminology updated to: ' + label);
  }
}

async function setOperationMode(mode) {
  state.exercise = state.exercise || {};
  state.exercise.operation_mode = mode;
  const payload = { ...state.exercise };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    renderSidebar();
    updateUILabels();
    showNotification('success', 'Operation mode updated to: ' + mode);
  }
}

// ── Timezone ──────────────────────────────────────────────────────────────
function setTimezonePref(tz) {
  state.timezone = tz;
  renderTimeline();
  showNotification('success', tz ? 'Timezone set to ' + tz : 'Using browser timezone');
}

// ── Undo System ─────────────────────────────────────────────────────────────
const MAX_UNDO_STACK = 50;

function pushUndo(action, data) {
  state.undoStack.push({ action, data, timestamp: Date.now() });
  if (state.undoStack.length > MAX_UNDO_STACK) {
    state.undoStack.shift();
  }
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('btnUndo');
  if (!btn) return;
  btn.disabled = state.undoStack.length === 0;
  if (state.undoStack.length > 0) {
    const last = state.undoStack[state.undoStack.length - 1];
    btn.title = `Undo: ${last.action} (${state.undoStack.length} actions)`;
  } else {
    btn.title = 'Nothing to undo';
  }
}

async function performUndo() {
  if (state.undoStack.length === 0) {
    showNotification('info', 'Nothing to undo');
    return;
  }
  const entry = state.undoStack.pop();
  try {
    if (entry.action === 'create_event') {
      // Undo creation by deleting
      await apiDel('/api/events/' + entry.data.id);
    } else if (entry.action === 'delete_event') {
      // Undo deletion by re-creating
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      await apiPost('/api/events', payload);
    } else if (entry.action === 'update_event') {
      // Undo update by restoring old data
      const payload = { ...entry.data.old };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by_name;
      await apiPut('/api/events/' + entry.data.id, payload);
    } else if (entry.action === 'status_change') {
      await api('PATCH', `/api/events/${entry.data.id}/status`, { status: entry.data.oldStatus });
    } else if (entry.action === 'create_lock') {
      // Undo lock creation by deleting the lock
      await apiDel('/api/locks/' + entry.data.id);
      await fetchLocks();
    } else if (entry.action === 'delete_lock') {
      // Undo lock removal by re-creating it
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.locked_by;
      delete payload.locked_by_name;
      delete payload.created_at;
      await apiPost('/api/locks', payload);
      await fetchLocks();
    }
    await refreshAll();
    showNotification('success', `Undone: ${entry.action.replace(/_/g, ' ')}`);
  } catch (e) {
    showError('Undo failed: ' + (e.message || 'unknown error'));
  }
  updateUndoButton();
}

// ── Filter System ──────────────────────────────────────────────────────────
function openFilterPopover(btn) {
  const pop = document.getElementById('filterPopover');
  if (pop.style.display !== 'none') { pop.style.display = 'none'; return; }

  // Populate status filters
  const statuses = ['planned','active','responded_to','completed','submitted','verified','rejected','cancelled'];
  const statusList = document.getElementById('filterStatusList');
  statusList.innerHTML = statuses.map(s => `
    <label class="filter-cb-label">
      <input type="checkbox" class="filter-status-cb" value="${s}" ${state.filters.status.includes(s)?'checked':''}>
      ${t('status_'+s)||s}
    </label>
  `).join('');

  // Populate responsible filter
  const respSel = document.getElementById('filterResponsible');
  respSel.innerHTML = '<option value="">All</option>' +
    (state.users||[]).map(u => `<option value="${u.id}"${state.filters.responsibleId==u.id?' selected':''}>${escHtml(u.display_name||u.username)}</option>`).join('');

  // Populate layer filter
  const layerSel = document.getElementById('filterLayer');
  layerSel.innerHTML = '<option value="">All</option>' +
    '<option value="0"' + (state.filters.layerId===0?' selected':'') + '>Master Timeline</option>' +
    state.layers.map(l => `<option value="${l.id}"${state.filters.layerId==l.id?' selected':''}>${escHtml(l.name)}</option>`).join('');

  // Load presets
  _renderFilterPresets();

  const rect = btn.getBoundingClientRect();
  pop.style.top  = (rect.bottom + 4) + 'px';
  pop.style.left = Math.max(4, rect.left - 100) + 'px';
  pop.style.display = '';
}

function applyFilters() {
  const statusCbs = document.querySelectorAll('.filter-status-cb:checked');
  state.filters.status = [...statusCbs].map(cb => cb.value);
  const respVal = document.getElementById('filterResponsible').value;
  state.filters.responsibleId = respVal ? parseInt(respVal, 10) : null;
  const layerVal = document.getElementById('filterLayer').value;
  state.filters.layerId = layerVal !== '' ? parseInt(layerVal, 10) : null;
  document.getElementById('filterPopover').style.display = 'none';
  // Update filter button to indicate active filters
  const btn = document.getElementById('btnFilter');
  const hasFilters = state.filters.status.length > 0 || state.filters.responsibleId !== null || state.filters.layerId !== null;
  if (btn) btn.classList.toggle('btn-active-filter', hasFilters);
  renderTimeline();
}

function clearFilters() {
  state.filters = { status: [], responsibleId: null, layerId: null };
  document.getElementById('filterPopover').style.display = 'none';
  const btn = document.getElementById('btnFilter');
  if (btn) btn.classList.remove('btn-active-filter');
  renderTimeline();
}

// ── Filter Presets ─────────────────────────────────────────────────────────
async function _loadFilterPresets() {
  try {
    const presets = await apiGet('/api/filter-presets');
    state.filterPresets = presets || [];
    _renderFilterPresets();
  } catch { state.filterPresets = []; }
}

function _renderFilterPresets() {
  const listEl = document.getElementById('filterPresetList');
  if (!listEl) return;
  const presets = state.filterPresets || [];
  if (!presets.length) {
    listEl.innerHTML = '<span style="color:var(--text-dim);font-size:var(--fs-xs)">None saved</span>';
    return;
  }
  listEl.innerHTML = presets.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
      <button class="btn btn-ghost btn-sm" style="font-size:var(--fs-xs);padding:2px 6px;text-align:left" onclick="loadFilterPreset(${p.id})">${escHtml(p.name)}</button>
      <button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:10px" onclick="deleteFilterPreset(${p.id})">×</button>
    </div>
  `).join('');
}

async function saveFilterPreset() {
  const name = document.getElementById('filterPresetName')?.value?.trim();
  if (!name) { showError('Enter a preset name'); return; }
  const filters = { ...state.filters };
  const res = await apiPost('/api/filter-presets', { name, filters });
  if (res.ok) {
    const preset = await res.json();
    state.filterPresets = [...(state.filterPresets || []), preset];
    _renderFilterPresets();
    document.getElementById('filterPresetName').value = '';
    showNotification('success', 'Filter preset saved');
  } else {
    showError('Failed to save preset');
  }
}

async function deleteFilterPreset(id) {
  const res = await api('DELETE', `/api/filter-presets/${id}`, null);
  if (res.ok) {
    state.filterPresets = (state.filterPresets || []).filter(p => p.id !== id);
    _renderFilterPresets();
  }
}

function loadFilterPreset(id) {
  const preset = (state.filterPresets || []).find(p => p.id === id);
  if (!preset || !preset.filters) return;
  state.filters = { status: [], responsibleId: null, layerId: null, ...preset.filters };
  // Re-open popover to reflect the loaded preset
  const btn = document.getElementById('btnFilter');
  if (btn) openFilterPopover(btn);
  applyFilters();
  showNotification('success', `Preset "${preset.name}" loaded`);
}

// ── Context Menu System ─────────────────────────────────────────────────────
function setupContextMenus() {
  const container = document.getElementById('timeline-container');

  container.addEventListener('contextmenu', e => {
    e.preventDefault();
    closeAllContextMenus();

    const block = e.target.closest('.event-block[data-ev-id]');
    if (block) {
      const evId = parseInt(block.dataset.evId, 10);
      state._ctxEventId = evId;
      // Update "Move" label based on multi-select state
      const selIds = state.selectedEventIds || [];
      const ctxMoveEl = document.getElementById('ctxMove');
      if (ctxMoveEl) {
        if (selIds.length > 1 && selIds.includes(evId)) {
          ctxMoveEl.textContent = '📅 ' + (t('ctx_move_selected')||'Move selected events…');
        } else {
          ctxMoveEl.textContent = '📅 ' + (t('ctx_move')||'Move to new time/date…');
        }
      }
      const menu = document.getElementById('contextMenu');
      menu.style.top  = e.clientY + 'px';
      menu.style.left = e.clientX + 'px';
      menu.style.display = '';
      return;
    }

    // Right-click on empty slot
    const cell = e.target.closest('.tl-cell');
    if (cell && state.user && hasRole2(state.user.role, 'readwrite')) {
      const dayIdx  = parseInt(cell.dataset.day, 10);
      const slotIdx = parseInt(cell.dataset.slot, 10);
      if (!isNaN(dayIdx) && !isNaN(slotIdx)) {
        state._ctxSlotDay  = dayIdx;
        state._ctxSlotMin  = slotIdx;
        const menu = document.getElementById('slotContextMenu');
        menu.style.top  = e.clientY + 'px';
        menu.style.left = e.clientX + 'px';
        menu.style.display = '';
      }
    }
  });

  document.addEventListener('click', () => closeAllContextMenus());
}

function closeAllContextMenus() {
  document.getElementById('contextMenu').style.display = 'none';
  document.getElementById('slotContextMenu').style.display = 'none';
}

async function ctxAction(action, value) {
  closeAllContextMenus();
  const evId = state._ctxEventId;
  if (!evId) return;
  const ev = state.events.find(e => e.id === evId || e.id === parseInt(String(evId).split('_')[0], 10));
  if (!ev) return;

  if (action === 'edit') {
    openEventModal(ev);
  } else if (action === 'duplicate') {
    const res = await apiPost('/api/events-duplicate/' + ev.id, {});
    if (res.ok) {
      await refreshAll();
      showNotification('success', 'Event duplicated');
    } else {
      const err = await res.json();
      showError(err.error);
    }
  } else if (action === 'alarm') {
    openAlarmModal(ev);
  } else if (action === 'move') {
    // If multiple events selected and this event is among them, move all selected
    const selIds = state.selectedEventIds || [];
    if (selIds.length > 1 && selIds.includes(ev.id)) {
      openMoveSelectedDialog();
    } else {
      openMoveEventDialog(ev.id);
    }
  } else if (action === 'status') {
    const res = await api('PATCH', `/api/events/${ev.id}/status`, { status: value });
    if (res.ok) {
      await refreshAll();
      showNotification('success', `Status changed to ${value}`);
    } else {
      const err = await res.json();
      showError(err.error);
    }
  } else if (action === 'delete') {
    if (!confirm(`Delete event "${ev.title}"?`)) return;
    pushUndo('delete_event', ev);
    const res = await apiDel('/api/events/' + ev.id);
    if (res.ok) {
      await refreshAll();
      showNotification('success', 'Event deleted');
    }
  }
  state._ctxEventId = null;
}

function ctxSlotAction(action) {
  closeAllContextMenus();
  const dayIdx = state._ctxSlotDay;
  const slotIdx = state._ctxSlotMin;
  if (dayIdx == null || slotIdx == null) return;

  const days = getDays();
  const targetDay = days[dayIdx];
  if (!targetDay) return;
  const slotMin  = getSlotMinutes();
  const startOff = getStartHourOffset();
  const newMin   = startOff + slotIdx * slotMin;
  const newStart = new Date(targetDay);
  newStart.setHours(Math.floor(newMin / 60), newMin % 60, 0, 0);
  const newEnd = new Date(newStart.getTime() + 60 * 60000);

  if (action === 'add') {
    openEventModal(null, newStart, newEnd);
  } else if (action === 'lock') {
    openLockModal(newStart, newEnd);
  }
  state._ctxSlotDay = null;
  state._ctxSlotMin = null;
}

// ── Sidebar Resize ──────────────────────────────────────────────────────────
function setupSidebarResize() {
  const handle = document.getElementById('sidebarResizeHandle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = startX - e.clientX;
    const newWidth = Math.max(200, Math.min(800, startWidth + dx));
    sidebar.style.width = newWidth + 'px';
    sidebar.style.minWidth = newWidth + 'px';
    sidebar.style.maxWidth = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    renderEventBlocks(getDays(), getSlotHeight());
  });
}

// ── Print Support ──────────────────────────────────────────────────────────
function printTimeline() {
  window.print();
}

// ── Conflict/Overlap Warnings ──────────────────────────────────────────────
function checkConflicts(ev) {
  const start = new Date(ev.start_time || ev.startTime);
  const end = ev.end_time ? new Date(ev.end_time || ev.endTime) : new Date(start.getTime() + 3600000);
  const conflicts = state.events.filter(e => {
    if (e.id === ev.id) return false;
    // Must be on same layer
    if ((e.layer_id || null) !== (ev.layer_id || null)) return false;
    const eStart = new Date(e.start_time);
    const eEnd = e.end_time ? new Date(e.end_time) : new Date(eStart.getTime() + 3600000);
    return eStart < end && eEnd > start;
  });
  return conflicts;
}

function showConflictWarning(conflicts) {
  if (!conflicts.length) return;
  const names = conflicts.map(c => `"${c.title}"`).join(', ');
  showNotification('warning',
    `Warning: This event overlaps with ${conflicts.length} other event${conflicts.length>1?'s':''}: ${names}`
  );
}
// old conflict ended here new code

// ── Role Editor ─────────────────────────────────────────────────────────────

// Default role configurations
const DEFAULT_ROLE_CONFIGS = [
  { key: 'observer',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true } },
  { key: 'read',              display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true } },
  { key: 'reporter',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true } },
  { key: 'readwrite',         display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, delete_events: true } },
  { key: 'teamlead',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, view_audit: true, report: true, auto_report: true } },
  { key: 'oplead',            display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true } },
  { key: 'staffofficer',      display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true } },
  { key: 'staffofficer_full', display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true } },
];

// Ordered list of all capabilities shown in role editor
const ALL_CAPABILITIES = [
  'see_groups', 'see_users', 'view_events', 'create_events', 'edit_own', 'edit_all', 'delete_events',
  'manage_layers', 'manage_groups', 'manage_users', 'approve_users', 'manage_templates', 'lock_slots', 'view_audit', 'exercise',
  'report', 'auto_report'
];

async function openRoleEditor() {
  let configs = [];
  try {
    const data = await apiGet('/api/roles');
    configs = data || [];
  } catch { /* use defaults */ }

  // Merge defaults with saved; append any extra custom roles from server
  const builtinKeys = DEFAULT_ROLE_CONFIGS.map(d => d.key);
  const merged = DEFAULT_ROLE_CONFIGS.map(def => {
    const saved = configs.find(c => c.key === def.key);
    return saved ? { ...def, ...saved } : { ...def };
  });
  for (const c of configs) {
    if (!builtinKeys.includes(c.key) && c.key !== 'admin') merged.push(c);
  }
  state.roleConfigs = merged;
  state._roleEditorCustomCounter = 0;

  _renderRoleEditorTable(merged);
  openModal('roleEditorModal');
}

function _roleEditorInputStyle() {
  return 'width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 7px;font-size:var(--fs-sm)';
}

const _ROLE_CAP_LABELS = {
  see_groups:'See Groups', see_users:'See Users',
  view_events:'View Evts', create_events:'Create', edit_own:'Edit Own', edit_all:'Edit All',
  delete_events:'Delete', manage_layers:'Layers', manage_groups:'Manage Groups',
  manage_users:'Manage Users', approve_users:'Approve', manage_templates:'Tmpls', lock_slots:'Lock', view_audit:'Audit', exercise:'Exercise'
};

function _renderRoleEditorTable(roles) {
  const tableEl = document.getElementById('roleEditorTable');
  if (!tableEl) return;
  const builtinKeys = DEFAULT_ROLE_CONFIGS.map(d => d.key).concat(['admin']);
  tableEl.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
      <thead>
        <tr style="background:var(--bg2)">
          <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:110px;white-space:nowrap">Key</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:130px">🇬🇧 EN</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:130px">🇸🇪 SV</th>
          <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:130px">🇫🇷 FR</th>
          ${ALL_CAPABILITIES.map(cap =>
            `<th style="padding:6px 4px;border-bottom:2px solid var(--border);font-size:11px;text-align:center;min-width:52px" title="${cap}">${_ROLE_CAP_LABELS[cap]||cap}</th>`
          ).join('')}
          <th style="padding:6px 4px;border-bottom:2px solid var(--border);min-width:36px"></th>
        </tr>
      </thead>
      <tbody id="roleEditorTbody">
        ${roles.map(role => _renderRoleRow(role, builtinKeys.includes(role.key))).join('')}
        <tr style="opacity:0.4">
          <td style="padding:8px 10px;font-family:monospace;font-size:var(--fs-sm);color:var(--text-dim)">admin</td>
          <td style="padding:8px 10px;font-size:var(--fs-sm)" colspan="3">${t('role_admin')||'Admin'} 🔒</td>
          ${ALL_CAPABILITIES.map(() => `<td style="text-align:center;padding:4px"><input type="checkbox" checked disabled></td>`).join('')}
          <td></td>
        </tr>
      </tbody>
    </table>
    </div>
  `;
}

function _renderRoleRow(role, isBuiltin) {
  const dn = role.display_names || {};
  const enVal = dn.en || role.display_name || '';
  const svVal = dn.sv || '';
  const frVal = dn.fr || '';
  const key = role.key;
  const s = _roleEditorInputStyle();
  return `
    <tr data-role-key="${escHtml(key)}" data-custom="${isBuiltin ? 'false' : 'true'}">
      <td style="padding:6px 10px">
        ${isBuiltin
          ? `<span style="font-family:monospace;color:var(--text-dim);font-size:var(--fs-sm)">${escHtml(key)}</span>`
          : `<input type="text" class="role-key-input" value="${escHtml(key)}" placeholder="custom_role" style="${s};font-family:monospace">`}
      </td>
      <td style="padding:5px 6px"><input type="text" class="role-name-en" data-key="${escHtml(key)}" value="${escHtml(enVal)}" placeholder="${escHtml(getRoleDisplayName(key))}" style="${s}"></td>
      <td style="padding:5px 6px"><input type="text" class="role-name-sv" data-key="${escHtml(key)}" value="${escHtml(svVal)}" placeholder="${escHtml(getRoleDisplayName(key))}" style="${s}"></td>
      <td style="padding:5px 6px"><input type="text" class="role-name-fr" data-key="${escHtml(key)}" value="${escHtml(frVal)}" placeholder="${escHtml(getRoleDisplayName(key))}" style="${s}"></td>
      ${ALL_CAPABILITIES.map(cap => {
        const checked = role.capabilities && role.capabilities[cap];
        return `<td style="text-align:center;padding:4px"><input type="checkbox" class="role-cap-cb" data-role="${escHtml(key)}" data-cap="${escHtml(cap)}" ${checked ? 'checked' : ''}></td>`;
      }).join('')}
      <td style="text-align:center;padding:4px">
        ${isBuiltin ? '' : `<button class="btn btn-danger btn-xs" onclick="removeRoleRow(this)" title="Remove" style="padding:2px 7px;font-size:12px">✕</button>`}
      </td>
    </tr>`;
}

function addNewRoleRow() {
  const tbody = document.getElementById('roleEditorTbody');
  if (!tbody) return;
  state._roleEditorCustomCounter = (state._roleEditorCustomCounter || 0) + 1;
  const key = `custom_role_${state._roleEditorCustomCounter}`;
  // All new custom roles start with see_groups and see_users enabled by default
  const role = { key, display_name: '', display_names: {}, capabilities: { see_groups: true, see_users: true } };
  const adminRow = tbody.querySelector('tr[style*="opacity"]');
  const tmp = document.createElement('tbody');
  tmp.innerHTML = _renderRoleRow(role, false);
  const newRow = tmp.firstElementChild;
  if (adminRow) tbody.insertBefore(newRow, adminRow);
  else tbody.appendChild(newRow);
}

function removeRoleRow(btn) {
  const row = btn.closest('tr');
  if (row) row.remove();
}

async function saveRoles() {
  const rows = document.querySelectorAll('#roleEditorTbody tr[data-role-key]');
  const configs = [];
  rows.forEach(row => {
    const isCustom = row.dataset.custom === 'true';
    let key;
    if (isCustom) {
      const ki = row.querySelector('.role-key-input');
      key = ki ? ki.value.trim().replace(/\s+/g,'_').replace(/[^a-z0-9_]/gi,'').toLowerCase() : '';
      if (!key) return;
    } else {
      key = row.dataset.roleKey;
    }
    if (!key || key === 'admin') return;
    const enEl = row.querySelector('.role-name-en');
    const svEl = row.querySelector('.role-name-sv');
    const frEl = row.querySelector('.role-name-fr');
    const en = enEl ? enEl.value.trim() : '';
    const sv = svEl ? svEl.value.trim() : '';
    const fr = frEl ? frEl.value.trim() : '';
    const display_names = {};
    if (en) display_names.en = en;
    if (sv) display_names.sv = sv;
    if (fr) display_names.fr = fr;
    const caps = {};
    row.querySelectorAll('.role-cap-cb').forEach(cb => { caps[cb.dataset.cap] = cb.checked; });
    configs.push({ key, display_name: en || getRoleDisplayName(key), display_names, capabilities: caps });
  });

  try {
    const res = await api('PUT', '/api/roles', configs);
    if (res.ok || true) { // save locally even if endpoint fails
      state.roleConfigs = configs;
      closeModal('roleEditorModal');
      showNotification('success', t('notif_saved')||'Saved');
      renderSidebar();
    }
  } catch {
    state.roleConfigs = configs;
    closeModal('roleEditorModal');
    showNotification('success', t('notif_saved')||'Saved');
    renderSidebar();
  }
}

// ── Multi-select events ─────────────────────────────────────────────────────

function updateMultiselectBar() {
  const bar = document.getElementById('multiselectBar');
  if (!bar) return;
  const count = (state.selectedEventIds || []).length;
  if (count === 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    const countEl = document.getElementById('multiselectCount');
    if (countEl) countEl.textContent = `${count} ${t('multiselect_selected')||'selected'}`;
  }
  // Update event block highlights
  document.querySelectorAll('.event-block[data-ev-id]').forEach(block => {
    const id = parseInt(block.dataset.evId, 10);
    const sel = (state.selectedEventIds || []).includes(id);
    block.classList.toggle('event-selected', sel);
  });
}

function toggleEventSelection(evId) {
  if (!state.selectedEventIds) state.selectedEventIds = [];
  const idx = state.selectedEventIds.indexOf(evId);
  if (idx === -1) {
    state.selectedEventIds.push(evId);
  } else {
    state.selectedEventIds.splice(idx, 1);
  }
  updateMultiselectBar();
}

function clearSelection() {
  state.selectedEventIds = [];
  updateMultiselectBar();
}

function openMoveSelectedDialog() {
  const count = (state.selectedEventIds || []).length;
  if (!count) return;
  const isMulti = count > 1;
  const titleEl = document.getElementById('lbl-move-event-title');
  if (titleEl) titleEl.textContent = isMulti ? (t('move_event_title_multi')||'📅 Move Selected Events') : (t('move_event_title')||'📅 Move Event');
  const descEl = document.getElementById('lbl-move-event-desc');
  if (descEl) descEl.textContent = isMulti ? (t('move_event_desc')||'All selected events will be shifted by the same offset.') : '';

  // Pre-fill with the earliest selected event time
  const selectedEvs = state.events.filter(e => (state.selectedEventIds||[]).includes(e.id));
  const earliest = selectedEvs.length ? selectedEvs.reduce((a,b) => new Date(a.start_time) < new Date(b.start_time) ? a : b) : null;
  const timeInput = document.getElementById('moveEventNewTime');
  if (timeInput && earliest) timeInput.value = fmtDateInput(new Date(earliest.start_time));

  const confirmBtn = document.getElementById('btnConfirmMove');
  if (confirmBtn) confirmBtn.onclick = confirmMoveEvents;

  openModal('moveEventModal');
}

async function confirmMoveEvents() {
  const timeInput = document.getElementById('moveEventNewTime');
  if (!timeInput || !timeInput.value) { showError('Please select a new date and time.', 'Validation'); return; }
  const newBase = new Date(timeInput.value);

  const ids = state.selectedEventIds || [];
  if (!ids.length) { closeModal('moveEventModal'); return; }

  const selectedEvs = state.events.filter(e => ids.includes(e.id));
  if (!selectedEvs.length) { closeModal('moveEventModal'); return; }
  const earliest = Math.min(...selectedEvs.map(e => new Date(e.start_time).getTime()));
  const offset = newBase.getTime() - earliest;

  const movePromises = selectedEvs.map(async ev => {
    const oldStart = new Date(ev.start_time);
    const newStart = new Date(oldStart.getTime() + offset);
    const payload = { ...ev, start_time: newStart.toISOString() };
    if (ev.end_time) {
      const oldEnd = new Date(ev.end_time);
      payload.end_time = new Date(oldEnd.getTime() + offset).toISOString();
    }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    delete payload.created_by_name; delete payload.verified_by_name;
    pushUndo('update_event', { id: ev.id, old: { ...ev } });
    return apiPut('/api/events/' + ev.id, payload);
  });

  try {
    await Promise.all(movePromises);
    closeModal('moveEventModal');
    clearSelection();
    await refreshAll();
    showNotification('success', t('notif_event_updated')||'Events moved');
  } catch {
    showError('Failed to move some events');
  }
}

// ── Move single event via context menu ──────────────────────────────────────

function openMoveEventDialog(evId) {
  const ev = state.events.find(e => e.id === evId);
  if (!ev) return;

  const titleEl = document.getElementById('lbl-move-event-title');
  if (titleEl) titleEl.textContent = t('move_event_title')||'📅 Move Event';
  const descEl = document.getElementById('lbl-move-event-desc');
  if (descEl) descEl.textContent = escHtml(ev.title||'');

  const timeInput = document.getElementById('moveEventNewTime');
  if (timeInput) timeInput.value = fmtDateInput(new Date(ev.start_time));

  const confirmBtn = document.getElementById('btnConfirmMove');
  if (confirmBtn) confirmBtn.onclick = () => confirmMoveSingleEvent(evId);

  openModal('moveEventModal');
}

async function confirmMoveSingleEvent(evId) {
  const timeInput = document.getElementById('moveEventNewTime');
  if (!timeInput || !timeInput.value) { showError('Please select a new date and time.', 'Validation'); return; }
  const newStart = new Date(timeInput.value);

  const ev = state.events.find(e => e.id === evId);
  if (!ev) { closeModal('moveEventModal'); return; }

  const oldStart = new Date(ev.start_time);
  const payload = { ...ev, start_time: newStart.toISOString() };
  if (ev.end_time) {
    const dur = new Date(ev.end_time) - oldStart;
    payload.end_time = new Date(newStart.getTime() + dur).toISOString();
  }
  delete payload.id; delete payload.created_at; delete payload.updated_at;
  delete payload.created_by_name; delete payload.verified_by_name;
  pushUndo('update_event', { id: evId, old: { ...ev } });

  const res = await apiPut('/api/events/' + evId, payload);
  if (res.ok) {
    closeModal('moveEventModal');
    await refreshAll();
    showNotification('success', t('notif_event_updated')||'Event moved');
  } else {
    const err = await res.json();
    showError(err.error || 'Failed to move event');
  }
}


// ── Event History ──────────────────────────────────────────────────────────────

let _currentHistoryEventId = null;

async function openEventHistory() {
  const evId = document.getElementById('eventId')?.value;
  if (!evId) return;
  _currentHistoryEventId = evId;

  const listEl = document.getElementById('eventHistoryList');
  if (listEl) listEl.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</p>';

  closeModal('eventModal');
  openModal('eventHistoryModal');

  try {
    const versions = await apiGet(`/api/events/${evId}/history`);
    if (!listEl) return;
    if (!versions || !versions.length) {
      listEl.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">No history available yet. History is recorded whenever the event is edited.</p>';
      return;
    }
    listEl.innerHTML = versions.map((v, i) => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong>Version ${v.version}</strong>
          <span style="font-size:var(--fs-xs);color:var(--text-dim)">${new Date(v.changed_at).toLocaleString()}</span>
        </div>
        <div style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:6px">
          Changed by: <strong>${escHtml(v.changed_by_name || '—')}</strong>
          ${v.change_note ? ` — ${escHtml(v.change_note)}` : ''}
        </div>
        <div style="font-size:var(--fs-xs);display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">
          <span><em>Title:</em> ${escHtml(v.snapshot.title||'')}</span>
          <span><em>Status:</em> ${v.snapshot.status||'planned'}</span>
          <span><em>Start:</em> ${v.snapshot.start_time ? new Date(v.snapshot.start_time).toLocaleString() : '—'}</span>
          <span><em>End:</em> ${v.snapshot.end_time ? new Date(v.snapshot.end_time).toLocaleString() : '—'}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    if (listEl) listEl.innerHTML = '<p style="color:var(--danger);font-size:var(--fs-sm)">Failed to load history.</p>';
  }
}

// ── Event Dependencies ─────────────────────────────────────────────────────────

let _depsEventId = null;
let _currentDeps = []; // array of event IDs

function openDependenciesModal() {
  const evId = parseInt(document.getElementById('eventId')?.value, 10);
  if (!evId) return;
  _depsEventId = evId;

  const ev = state.events.find(e => e.id === evId);
  _currentDeps = ev?.depends_on ? [...ev.depends_on] : [];

  const titleEl = document.getElementById('dependencyEventTitle');
  if (titleEl) titleEl.textContent = ev ? ev.title : `Event #${evId}`;

  renderDependencyList();
  filterDepSearch();
  openModal('dependenciesModal');
}

function renderDependencyList() {
  const el = document.getElementById('dependencyList');
  if (!el) return;
  if (!_currentDeps.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm);padding:8px">No dependencies set.</p>';
    return;
  }
  el.innerHTML = _currentDeps.map(id => {
    const dep = state.events.find(e => e.id === id);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:var(--radius);background:var(--bg3);margin-bottom:4px">
      <span>${dep ? escHtml(dep.title) : `Event #${id}`}</span>
      <button class="btn btn-danger btn-sm" onclick="removeDependency(${id})">✕</button>
    </div>`;
  }).join('');
}

function removeDependency(id) {
  _currentDeps = _currentDeps.filter(d => d !== id);
  renderDependencyList();
}

function filterDepSearch() {
  const q = (document.getElementById('depSearch')?.value || '').toLowerCase();
  const el = document.getElementById('depSearchResults');
  if (!el) return;
  const candidates = state.events.filter(ev =>
    ev.id !== _depsEventId &&
    !_currentDeps.includes(ev.id) &&
    (q === '' || ev.title.toLowerCase().includes(q))
  ).slice(0, 20);
  if (!candidates.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs);padding:6px">No matching events.</p>';
    return;
  }
  el.innerHTML = candidates.map(ev => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:var(--radius);background:var(--bg3);margin-bottom:4px;cursor:pointer" onclick="addDependency(${ev.id})">
      <span>${escHtml(ev.title)}</span>
      <span style="font-size:var(--fs-xs);color:var(--text-dim)">${new Date(ev.start_time).toLocaleDateString()}</span>
    </div>
  `).join('');
}

function addDependency(id) {
  if (!_currentDeps.includes(id)) {
    _currentDeps.push(id);
    renderDependencyList();
    filterDepSearch();
  }
}

async function saveDependencies() {
  const evId = _depsEventId;
  if (!evId) return;
  const ev = state.events.find(e => e.id === evId);
  if (!ev) return;

  const payload = {...ev, depends_on: _currentDeps};
  delete payload.attachment_count; delete payload.comment_count;
  const res = await apiPut(`/api/events/${evId}`, payload);
  if (res.ok) {
    const updated = await res.json();
    const idx = state.events.findIndex(e => e.id === evId);
    if (idx >= 0) state.events[idx] = updated;
    closeModal('dependenciesModal');
    showNotification('success', 'Dependencies saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save dependencies');
  }
}

// ── Map Integration ────────────────────────────────────────────────────────────

let _map = null;
let _mapMarker = null;
let _mapCallback = null; // function(lat, lng, locationName) called on save

function openMapForEvent() {
  const lat = parseFloat(document.getElementById('eventLatitude')?.value) || null;
  const lng = parseFloat(document.getElementById('eventLongitude')?.value) || null;
  const loc = document.getElementById('eventPhysicalLocation')?.value || '';

  _mapCallback = (lat, lng, locationName) => {
    const latEl = document.getElementById('eventLatitude');
    const lngEl = document.getElementById('eventLongitude');
    const coordEl = document.getElementById('physicalMapCoords');
    const locEl = document.getElementById('eventPhysicalLocation');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
    if (coordEl) coordEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (locEl && locationName) locEl.value = locationName;
  };

  openModal('mapModal');
  document.getElementById('mapLocationName').value = loc;
  document.getElementById('mapLat').value = lat || '';
  document.getElementById('mapLng').value = lng || '';

  // Initialize map after modal is visible
  setTimeout(() => initMap(lat, lng), 100);
}

function initMap(lat, lng) {
  loadLeaflet(() => {
    const container = document.getElementById('mapContainer');
    if (!container) return;

    if (_map) { _map.remove(); _map = null; _mapMarker = null; }

    const center = (lat && lng) ? [lat, lng] : [51.505, -0.09];
    _map = L.map('mapContainer').setView(center, lat ? 13 : 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(_map);

    if (lat && lng) {
      _mapMarker = L.marker([lat, lng]).addTo(_map);
    }

    _map.on('click', function(e) {
      const { lat, lng } = e.latlng;
      document.getElementById('mapLat').value = lat.toFixed(6);
      document.getElementById('mapLng').value = lng.toFixed(6);
      if (_mapMarker) { _mapMarker.setLatLng(e.latlng); }
      else { _mapMarker = L.marker(e.latlng).addTo(_map); }
    });
  });
}

function saveMapLocation() {
  const lat = parseFloat(document.getElementById('mapLat')?.value);
  const lng = parseFloat(document.getElementById('mapLng')?.value);
  const name = document.getElementById('mapLocationName')?.value?.trim() || '';
  if (isNaN(lat) || isNaN(lng)) { showError('Please select a location on the map or enter coordinates'); return; }
  if (_mapCallback) _mapCallback(lat, lng, name);
  closeModal('mapModal');
}

// ── Backup & Restore ──────────────────────────────────────────────────────────

function openBackupModal() {
  openModal('backupModal');
  const status = document.getElementById('restoreStatus');
  if (status) status.textContent = '';
}

function downloadBackup() {
  window.location.href = '/api/backup';
}

async function uploadRestore() {
  const fileEl = document.getElementById('restoreFile');
  const statusEl = document.getElementById('restoreStatus');
  if (!fileEl || !fileEl.files.length) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">Please select a backup ZIP file first.</span>';
    return;
  }
  if (!confirm('Are you sure you want to restore from this backup? Current data will be overwritten. A server restart is required after restore.')) return;

  const formData = new FormData();
  formData.append('backup', fileEl.files[0]);

  try {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-dim)">Uploading and restoring…</span>';
    const res = await fetch('/api/restore', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--success,#2ecc71)">✅ ${escHtml(data.message || 'Restored successfully')}</span>`;
      showNotification('success', 'Backup restored. Please restart the server.');
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger)">❌ ${escHtml(data.error || 'Restore failed')}</span>`;
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">❌ Upload failed. Check server connection.</span>';
  }
}

// ── Planned vs. Actual Modal ──────────────────────────────────────────────────

function openPVAModal() {
  const el = document.getElementById('pvaContent');
  if (el) {
    const withPlanned = state.events.filter(ev => ev.planned_start);
    if (!withPlanned.length) {
      el.innerHTML = '<p style="color:var(--text-dim)">No events have planned times recorded yet.<br>Planned times are automatically captured on the first edit of an event.</p>';
    } else {
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
        <thead><tr style="background:var(--bg3)">
          <th style="padding:6px 8px;text-align:left">Event</th>
          <th style="padding:6px 8px;text-align:left">Planned Start</th>
          <th style="padding:6px 8px;text-align:left">Actual Start</th>
          <th style="padding:6px 8px;text-align:center">Δ Start</th>
          <th style="padding:6px 8px;text-align:center">Status</th>
        </tr></thead><tbody>
        ${withPlanned.sort((a,b)=>new Date(a.planned_start)-new Date(b.planned_start)).map((ev,i) => {
          const pStart = new Date(ev.planned_start);
          const aStart = new Date(ev.start_time);
          const deltaMins = Math.round((aStart - pStart) / 60000);
          const deltaStr = deltaMins === 0 ? '<span style="color:#2ecc71">On time</span>'
            : deltaMins > 0 ? `<span style="color:#e74c3c">+${deltaMins}m late</span>`
            : `<span style="color:#2ecc71">${deltaMins}m early</span>`;
          return `<tr style="background:${i%2===0?'var(--bg1)':'var(--bg2)'}">
            <td style="padding:6px 8px">${escHtml(ev.title)}</td>
            <td style="padding:6px 8px">${pStart.toLocaleString()}</td>
            <td style="padding:6px 8px">${aStart.toLocaleString()}</td>
            <td style="padding:6px 8px;text-align:center">${deltaStr}</td>
            <td style="padding:6px 8px;text-align:center">${ev.status||'planned'}</td>
          </tr>`;
        }).join('')}
        </tbody></table>`;
    }
  }
  openModal('pvaModal');
}

function exportPVAReport() {
  // Re-use the report generator with planned_vs_actual type
  const typeEl = document.getElementById('reportType');
  if (typeEl) typeEl.value = 'planned_vs_actual';
  closeModal('pvaModal');
  generateReport();
}

// ── Collaborative Editing ─────────────────────────────────────────────────────

// Track which events are being edited by other users
const _editingLocks = {};

// Called by SSE handler when an editing_lock event arrives
function handleEditingLockEvent(data) {
  if (data.type === 'editing_lock') {
    _editingLocks[data.event_id] = { user_name: data.user_name, user_id: data.user_id, expires_at: data.expires_at };
  } else if (data.type === 'editing_unlock') {
    delete _editingLocks[data.event_id];
  }
  // Update any open event modal to show lock indicator
  _updateEditingLockIndicator();
}

function _updateEditingLockIndicator() {
  const evIdEl = document.getElementById('eventId');
  if (!evIdEl || !evIdEl.value) return;
  const evId = parseInt(evIdEl.value, 10);
  const lock = _editingLocks[evId];
  const userId = state.user?.id;
  let indicator = document.getElementById('editingLockIndicator');
  if (!indicator) {
    // Create it if it doesn't exist
    const footer = document.querySelector('#eventModal .modal-footer');
    if (!footer) return;
    indicator = document.createElement('span');
    indicator.id = 'editingLockIndicator';
    indicator.style.cssText = 'font-size:var(--fs-xs);color:var(--warning,#f39c12);margin-right:auto;';
    footer.insertBefore(indicator, footer.firstChild);
  }
  if (lock && lock.user_id !== userId) {
    indicator.textContent = `✏️ ${escHtml(lock.user_name)} is also editing`;
  } else {
    indicator.textContent = '';
  }
}

// Acquire editing lock when event modal opens for editing
async function acquireEditingLock(eventId) {
  if (!eventId) return;
  try {
    await api('POST', `/api/events/${eventId}/lock`, {});
  } catch { /* non-critical */ }
}

// Release editing lock when event modal closes
async function releaseEditingLock(eventId) {
  if (!eventId) return;
  try {
    await api('DELETE', `/api/events/${eventId}/lock`, null);
  } catch { /* non-critical */ }
}

// Expose for SSE event handler in app.js
window._handleEditingLockEvent = handleEditingLockEvent;

// ── Event Modal Close Hook (for editing lock release) ─────────────────────────
// Observe when the eventModal is closed and release editing lock
(function() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      if (m.target.id === 'eventModal' && m.attributeName === 'class') {
        const isOpen = m.target.classList.contains('open');
        if (!isOpen) {
          const evIdEl = document.getElementById('eventId');
          const evId = evIdEl ? parseInt(evIdEl.value, 10) : null;
          if (evId && state.user) releaseEditingLock(evId);
        }
      }
    });
  });
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('eventModal');
    if (modal) observer.observe(modal, { attributes: true });
  });
})();
