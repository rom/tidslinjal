/* ── Event Modal ── */

// ── Event Modal Functions + Event Listeners ────────────────────────────────
function updateEventModalContactVisibility() {
  const typeVal = document.getElementById('eventType')?.value;
  const isPhysical = typeVal === 'physical_meeting';
  const physGroup = document.getElementById('physicalLocationGroup');
  const contactGroup = document.getElementById('contactInfoGroup');
  // Physical location available for all event types
  if (physGroup) physGroup.style.display = typeVal ? '' : 'none';
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
  const isPointEvent = typeVal === 'starting_point' || typeVal === 'ending_point';
  const isTimed = typeVal === 'timed_event';

  const startRow = document.getElementById('eventTimeRow');
  const endGroup = document.getElementById('eventEndGroup');
  const recurRow = document.querySelectorAll('#eventModal .recurrence-row');
  const timedGroup = document.getElementById('timedEventGroup');

  if (startRow) startRow.style.display = allDay ? 'none' : '';
  if (endGroup) endGroup.style.display = (allDay || isInstant || isPointEvent || isTimed) ? 'none' : '';
  recurRow.forEach(el => { el.style.display = allDay ? 'none' : ''; });
  if (timedGroup) timedGroup.style.display = isTimed ? '' : 'none';
}

function openEventModal(ev, defaultStart, defaultEnd) {
  const isEdit = !!ev;
  document.getElementById('eventModalTitle').textContent = isEdit ? t('event_edit') : t('event_add');
  document.getElementById('eventId').value = ev ? ev.id : '';
  document.getElementById('eventTitle').value = ev ? ev.title : '';
  document.getElementById('eventDescription').value = ev ? (ev.description||'') : '';
  const evTypeColor = ev && ev.event_type ? (state.eventTypes.find(t => t.key === ev.event_type) || {}).color : null;
  document.getElementById('eventColor').value = ev ? (ev.color || evTypeColor || '#4A90D9') : '#4A90D9';

  // Type select — sorted alphabetically by display label
  const typeSelect = document.getElementById('eventType');
  const lang = state.preferences.language || 'en';
  const sortedTypes = [...state.eventTypes].sort((a, b) => {
    const la = (lang==='sv' && a.label_sv ? a.label_sv : lang==='fr' && a.label_fr ? a.label_fr : a.label).toLowerCase();
    const lb = (lang==='sv' && b.label_sv ? b.label_sv : lang==='fr' && b.label_fr ? b.label_fr : b.label).toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  const _typeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
    instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌', pause:'⏸' };
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
  const _canWriteAnyLayer = hasRole2(state.user.role, 'admin') || userHasCapability('manage_layers');
  layerSel.innerHTML = `<option value="">${t('event_master')}</option>` +
    state.layers
      .filter(l => l.owner_id===state.user.id || _canWriteAnyLayer || l.permission==='readwrite')
      .map(l => `<option value="${l.id}" ${ev && ev.layer_id===l.id?'selected':''}>${escHtml(l.name)}</option>`)
      .join('');

  const start = defaultStart || (ev ? new Date(ev.start_time) : new Date());
  const end   = defaultEnd   || (ev && ev.end_time ? new Date(ev.end_time) : addHours(start, 1));
  const startEl = document.getElementById('eventStart');
  const endEl   = document.getElementById('eventEnd');
  startEl.value = fmtDateInput(start);
  endEl.value   = fmtDateInput(end);
  // Baseline for "link_event_times" delta computation
  startEl.dataset.lastValue = startEl.value;
  endEl.dataset.lastValue   = endEl.value;

  // Show browser timezone hint next to time labels
  try {
    const tzAbbr = new Date().toLocaleTimeString(undefined, {timeZoneName:'short'}).split(' ').pop() || '';
    const startTZ = document.getElementById('eventStartTZ');
    const endTZ = document.getElementById('eventEndTZ');
    const recEndTZ = document.getElementById('eventRecEndTZ');
    if (startTZ) startTZ.textContent = tzAbbr ? '(' + tzAbbr + ')' : '';
    if (endTZ) endTZ.textContent = tzAbbr ? '(' + tzAbbr + ')' : '';
    if (recEndTZ) recEndTZ.textContent = tzAbbr ? '(' + tzAbbr + ')' : '';
  } catch(e) {}

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

  // Countdown timer
  const cdSelect = document.getElementById('eventCountdownBefore');
  if (cdSelect) cdSelect.value = ev?.countdown_before_minutes || '0';

  // Timed event fields
  const timedDur = document.getElementById('timedDuration');
  if (timedDur) timedDur.value = ev?.timed_duration_minutes || 30;
  const timedAlarms = document.getElementById('timedAlarms');
  if (timedAlarms) timedAlarms.value = ev?.timed_alarms || '5,10';
  const timedCont = document.getElementById('timedContinueAfter');
  if (timedCont) timedCont.checked = ev?.timed_continue_after !== false;
  const timedPre = document.getElementById('timedPreShow');
  if (timedPre) timedPre.value = ev?.timed_pre_show_minutes || 5;

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
        <span class="group-icon-badge">👥</span> ${escHtml(g.name)}
      </label>`)
    ].join('');
    invList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => cb.closest('.group-chip').classList.toggle('selected', cb.checked));
    });
  }

  // Populate resource/room selector
  const resSel = document.getElementById('eventResourceSelect');
  if (resSel) {
    const typeIcons = {room:'🏠', building:'🏢', computer_service:'💻', data_center:'🖥', exercise_area:'🏋', work_area:'💼', rest_room:'☕', training_ground:'🎯'};
    apiGet('/api/rooms').then(rooms => {
      const enabled = (rooms || []).filter(r => r.enabled !== false);
      resSel.innerHTML = '<option value="">— None —</option>' +
        enabled.map(r => {
          const icon = r.icon || typeIcons[r.type] || '📦';
          return `<option value="${r.id}" ${ev && ev.room_id === r.id ? 'selected' : ''}>${icon} ${escHtml(r.name)}${r.location ? ' ('+escHtml(r.location)+')' : ''}</option>`;
        }).join('');
    }).catch(() => {});
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
  const canDel = !eventIsLocked && isEdit && (hasRole2(state.user.role, 'admin') || state.user.id===ev.created_by || userHasCapability('delete_events'));
  delBtn.style.display = canDel ? '' : 'none';
  delBtn.onclick = canDel ? () => deleteEvent(ev.id) : null;

  const saveBtn = document.getElementById('btnSaveEvent');
  if (saveBtn) { saveBtn.disabled = !!eventIsLocked; saveBtn.style.pointerEvents = ''; }

  // Physical location and contact/communication fields
  document.getElementById('eventPhysicalLocation').value = ev ? (ev.physical_location||'') : '';
  const locAddrEl = document.getElementById('eventLocationAddress');
  if (locAddrEl) locAddrEl.value = ev ? (ev.location_address||'') : '';
  document.getElementById('eventContactType').value = ev ? (ev.contact_type||'') : '';
  document.getElementById('eventContactURL').value = ev ? (ev.contact_url||'') : '';
  document.getElementById('eventVirtualMeetingType').value = ev ? (ev.virtual_meeting_type||'') : '';

  // Auto-completion for physical location (rooms, buildings, addresses)
  _setupLocationAutocomplete('eventPhysicalLocation');
  _setupLocationAutocomplete('eventLocationAddress');

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

// When "link_event_times" preference is enabled, changing start shifts end
// (and vice versa) to preserve the event's duration. Default: independent.
document.getElementById('eventStart').addEventListener('change', function() {
  if (!state?.preferences?.link_event_times) {
    this.dataset.lastValue = this.value;
    return;
  }
  const endEl = document.getElementById('eventEnd');
  const newStart = new Date(this.value);
  const prevStart = this.dataset.lastValue ? new Date(this.dataset.lastValue) : null;
  const curEnd = endEl.value ? new Date(endEl.value) : null;
  if (!isNaN(newStart.getTime())) {
    if (prevStart && !isNaN(prevStart.getTime()) && curEnd && !isNaN(curEnd.getTime())) {
      const deltaMs = newStart.getTime() - prevStart.getTime();
      endEl.value = fmtDateInput(new Date(curEnd.getTime() + deltaMs));
    } else {
      endEl.value = fmtDateInput(addHours(newStart, 1));
    }
    endEl.dataset.lastValue = endEl.value;
  }
  this.dataset.lastValue = this.value;
});

document.getElementById('eventEnd').addEventListener('change', function() {
  if (!state?.preferences?.link_event_times) {
    this.dataset.lastValue = this.value;
    return;
  }
  const startEl = document.getElementById('eventStart');
  const newEnd = new Date(this.value);
  const prevEnd = this.dataset.lastValue ? new Date(this.dataset.lastValue) : null;
  const curStart = startEl.value ? new Date(startEl.value) : null;
  if (!isNaN(newEnd.getTime()) && prevEnd && !isNaN(prevEnd.getTime()) && curStart && !isNaN(curStart.getTime())) {
    const deltaMs = newEnd.getTime() - prevEnd.getTime();
    startEl.value = fmtDateInput(new Date(curStart.getTime() + deltaMs));
    startEl.dataset.lastValue = startEl.value;
  }
  this.dataset.lastValue = this.value;
});

document.getElementById('btnSaveEvent').addEventListener('click', async () => {
  const id    = document.getElementById('eventId').value;
  const title = document.getElementById('eventTitle').value.trim();
  if (!title) { showError(t('event_title') + ' is required', 'Validation'); return; }
  const allDay   = document.getElementById('eventAllDay')?.checked || false;
  const typeVal  = document.getElementById('eventType').value;
  const isInstant = typeVal === 'instant';
  const isPointEvent = typeVal === 'starting_point' || typeVal === 'ending_point';
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
    end_time:           (!allDay && !isInstant && !isPointEvent && endVal) ? new Date(endVal).toISOString() : null,
    is_recurring:       recurring && !allDay && !isInstant && !isPointEvent,
    recurrence_pattern: (recurring && !allDay && !isInstant && !isPointEvent) ? document.getElementById('eventRecurrencePattern').value : '',
    recurrence_end:     (recurring && !allDay && !isInstant && !isPointEvent && document.getElementById('eventRecurrenceEnd').value)
                          ? new Date(document.getElementById('eventRecurrenceEnd').value).toISOString() : null,
    layer_id:           layerVal ? parseInt(layerVal, 10) : null,
    physical_location:  document.getElementById('eventPhysicalLocation')?.value || '',
    location_address:   document.getElementById('eventLocationAddress')?.value || '',
    contact_type:       document.getElementById('eventContactType')?.value || '',
    contact_url:        document.getElementById('eventContactURL')?.value || '',
    virtual_meeting_type: document.getElementById('eventVirtualMeetingType')?.value || '',
    latitude:           document.getElementById('eventLatitude')?.value ? parseFloat(document.getElementById('eventLatitude').value) : null,
    longitude:          document.getElementById('eventLongitude')?.value ? parseFloat(document.getElementById('eventLongitude').value) : null,
    room_id:                (() => { const v = document.getElementById('eventResourceSelect')?.value; return v ? parseInt(v, 10) : null; })(),
    room_name:              (() => { const sel = document.getElementById('eventResourceSelect'); return sel && sel.value ? sel.options[sel.selectedIndex]?.textContent?.trim() || '' : ''; })(),
    countdown_before_minutes: parseInt(document.getElementById('eventCountdownBefore')?.value, 10) || 0,
    timed_duration_minutes: typeVal === 'timed_event' ? (parseInt(document.getElementById('timedDuration')?.value, 10) || 30) : 0,
    timed_alarms: typeVal === 'timed_event' ? (document.getElementById('timedAlarms')?.value || '') : '',
    timed_continue_after: typeVal === 'timed_event' ? (document.getElementById('timedContinueAfter')?.checked || false) : false,
    timed_pre_show_minutes: typeVal === 'timed_event' ? (parseInt(document.getElementById('timedPreShow')?.value, 10) || 5) : 0,
  };

  // Track undo for updates
  if (id) {
    const oldEv = state.events.find(e => e.id === parseInt(id, 10));
    if (oldEv) pushUndo('update_event', { id: parseInt(id, 10), old: { ...oldEv } });
  }

  // For recurring events being edited, show choice dialog
  if (id) {
    const masterEv = state.events.find(e => e.id === parseInt(id, 10));
    const occTime = state._currentOccurrenceTime;
    if (masterEv && masterEv.is_recurring && occTime) {
      await _saveRecurringEventWithChoice(id, payload, masterEv, occTime);
      return;
    }
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
    // Create person ready check if requested
    const prcCb = document.getElementById('eventRequestReadyCheck');
    if (prcCb && prcCb.checked && invUserIDs.length > 0) {
      await apiPost('/api/person-ready-check', { participant_ids: invUserIDs, event_id: eventID });
    }
    closeModal('eventModal');
    await refreshAll();
    showNotification('success', t(id ? 'notif_event_updated' : 'notif_event_created'));
  } else {
    const err = await res.json();
    showError(err.error);
  }
});

// Auto-complete for location fields using rooms/buildings
let _locationSuggestions = null;
async function _loadLocationSuggestions() {
  if (_locationSuggestions) return _locationSuggestions;
  try {
    const rooms = await apiGet('/api/rooms') || [];
    const suggestions = [];
    const subTypeLabels = {meeting_room:'Meeting Room',video_room:'Video Room',aula:'Aula',studio:'Studio',server_room:'Server Room',depot:'Depot',workshop:'Workshop',lab:'Lab'};
    rooms.forEach(r => {
      const icon = r.icon || ({room:'🏠',building:'🏢',computer_service:'💻',data_center:'🖥'}[r.type]||'📍');
      const subLabel = r.sub_type ? ` (${subTypeLabels[r.sub_type]||r.sub_type})` : '';
      suggestions.push({ text: r.name, detail: (r.location||'') + subLabel, icon, address: r.location||'' });
      if (r.location && r.location !== r.name) {
        suggestions.push({ text: r.location, detail: r.name, icon: '📍', address: r.location });
      }
    });
    _locationSuggestions = suggestions;
    return suggestions;
  } catch { return []; }
}

function _setupLocationAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input._acSetup) return;
  input._acSetup = true;
  let dropdown = null;

  function close() { if (dropdown) { dropdown.remove(); dropdown = null; } }
  function show(items) {
    close();
    if (!items.length) return;
    dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    dropdown.style.cssText = 'position:absolute;z-index:10000;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.3);width:' + input.offsetWidth + 'px';
    const rect = input.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
    dropdown.style.left = (rect.left + window.scrollX) + 'px';
    items.slice(0, 10).forEach(item => {
      const opt = document.createElement('div');
      opt.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:var(--fs-sm);display:flex;gap:6px;align-items:center';
      opt.innerHTML = `<span>${item.icon}</span><span style="font-weight:600">${escHtml(item.text)}</span>${item.detail ? `<span style="color:var(--text-dim);font-size:var(--fs-xs)">${escHtml(item.detail)}</span>` : ''}`;
      opt.addEventListener('mousedown', e => { e.preventDefault(); input.value = item.text; close(); });
      opt.addEventListener('mouseenter', () => opt.style.background = 'var(--bg3)');
      opt.addEventListener('mouseleave', () => opt.style.background = '');
      dropdown.appendChild(opt);
    });
    document.body.appendChild(dropdown);
  }

  input.addEventListener('input', async () => {
    const val = input.value.trim().toLowerCase();
    if (val.length < 1) { close(); return; }
    const suggestions = await _loadLocationSuggestions();
    const matches = suggestions.filter(s => s.text.toLowerCase().includes(val) || s.detail.toLowerCase().includes(val));
    show(matches);
  });
  input.addEventListener('focus', async () => {
    const val = input.value.trim().toLowerCase();
    if (val.length >= 1) {
      const suggestions = await _loadLocationSuggestions();
      const matches = suggestions.filter(s => s.text.toLowerCase().includes(val) || s.detail.toLowerCase().includes(val));
      show(matches);
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 200));
}
