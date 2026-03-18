/* ============================================================
   Tidslinjal — Modals, Sidebar & Feature Logic
   All modal open/save/close handlers, sidebar rendering,
   preferences UI, export/import, templates, alarms, SSE.
   ============================================================ */

/** Safe JSON.parse wrapper — returns null on invalid input instead of throwing */
function safeJsonParse(str) {
  try { return JSON.parse(str); }
  catch (e) { console.warn('[safeJsonParse] invalid JSON:', e.message); return null; }
}

/* ── Auto-stack modals: ensure each new modal-overlay opens on top ────────── */
var _modalZCounter = 10100;
(function _initModalStacking() {
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay')) {
          node.style.zIndex = String(++_modalZCounter);
        }
      });
    });
  });
  if (document.body) {
    obs.observe(document.body, { childList: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      obs.observe(document.body, { childList: true });
    });
  }
})();

/**
 * CSP-safe event binding helper. After setting innerHTML, call this to bind
 * all elements with data-action="fnName" attributes to their handlers.
 * Supports data-arg (single arg) and data-args (JSON array of args).
 * Use data-stop-prop on elements that need event.stopPropagation().
 * Use data-event="change|input" for non-click events (default is 'click').
 */
function _bindActions(root) {
  root.querySelectorAll('[data-action]').forEach(el => {
    if (el._actionBound) return;
    el._actionBound = true;
    const fnName = el.dataset.action;
    const fn = window[fnName];
    if (typeof fn !== 'function') return;
    const eventType = el.dataset.event || 'click';
    el.addEventListener(eventType, e => {
      if (el.hasAttribute('data-stop-prop')) e.stopPropagation();
      const rawArgs = el.dataset.args;
      const rawArg = el.dataset.arg;
      if (rawArgs) {
        fn(...JSON.parse(rawArgs));
      } else if (el.hasAttribute('data-arg-checked')) {
        fn(el.checked);
      } else if (el.hasAttribute('data-pref-checked')) {
        setPref(el.dataset.prefChecked, el.checked);
      } else if (el.hasAttribute('data-arg-value')) {
        fn(el.value);
      } else if (el.hasAttribute('data-arg-el')) {
        fn(el);
      } else if (rawArg !== undefined) {
        let arg = rawArg;
        if (arg === 'null') arg = null;
        else if (/^\d+$/.test(arg)) arg = parseInt(arg, 10);
        else try { arg = JSON.parse(arg); } catch {}
        fn(arg);
      } else {
        fn();
      }
    });
  });
  root.querySelectorAll('[data-stop-prop-only]').forEach(el => {
    el.addEventListener('click', e => e.stopPropagation());
  });
  // Special: edit etype buttons (JSON in single-quoted data attr)
  root.querySelectorAll('[data-edit-etype]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); const d = safeJsonParse(el.dataset.editEtype); if (d) openEtypeModal(d); });
  });
  // Special: edit layer buttons
  root.querySelectorAll('[data-edit-layer]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); const d = safeJsonParse(el.dataset.editLayer); if (d) openLayerModal(d); });
  });
  // Special: close OIDC test panel
  root.querySelectorAll('[data-close-oidc-test]').forEach(el => {
    el.addEventListener('click', () => { document.getElementById('oidcTestResult').style.display = 'none'; });
  });
  // Special: user/group/phase modals with JSON arg in data-arg + data-arg-el
  root.querySelectorAll('[data-action="openUserModal"][data-arg-el]').forEach(el => {
    // Remove the generic handler and re-bind with JSON parse
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openUserModal(d); });
  });
  root.querySelectorAll('[data-action="openGroupModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openGroupModal(d); });
  });
  root.querySelectorAll('[data-action="openMemberModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openMemberModal(d); });
  });
  root.querySelectorAll('[data-action="openPhaseModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openPhaseModal(d); });
  });
  root.querySelectorAll('[data-action="openRoomModal"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => { const d = safeJsonParse(el.dataset.arg); if (d) openRoomModal(d); });
  });
  // Special: ackAlarm with closest notification element
  root.querySelectorAll('[data-action="ackAlarm"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => ackAlarm(parseInt(el.dataset.arg, 10), el.closest('.notification')));
  });
  // Special: removeRoleRow(this)
  root.querySelectorAll('[data-action="removeRoleRow"][data-arg-el]').forEach(el => {
    el.removeAttribute('data-action');
    el.addEventListener('click', () => removeRoleRow(el));
  });
}
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
  if (state.preferences.hover_zoom_enabled !== false) body.classList.add('hover-zoom-enabled');
  // High contrast mode (separate from theme)
  if (state.preferences.high_contrast) body.classList.add('high-contrast');
  // Color-blind safe palette
  const cbMode = state.preferences.color_blind_mode || 'off';
  if (cbMode !== 'off') body.classList.add('cb-' + cbMode);
  // Apply view spacing
  const spacing = state.preferences.view_spacing || 1;
  document.documentElement.style.setProperty('--view-spacing', spacing);
  // Apply tooltip delay
  const ttDelay = state.preferences.tooltip_delay || 0;
  document.documentElement.style.setProperty('--tooltip-delay', ttDelay + 'ms');
  updateLangFlags();
  // Show/hide language flags in toolbar
  const langFlagsEl = document.getElementById('langFlags');
  if (langFlagsEl) langFlagsEl.style.display = state.preferences.show_lang_flags === false ? 'none' : '';
  // Load Google Material Icons if icon_set is 'material'
  const iconSet = (state.exercise || {}).icon_set || 'emoji';
  if (iconSet === 'material' && !document.getElementById('materialIconsCSS')) {
    const link = document.createElement('link');
    link.id = 'materialIconsCSS';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined|Material+Icons+Round';
    document.head.appendChild(link);
  }
  // Apply tactical font
  if (typeof _applyTacticalFont === 'function') _applyTacticalFont();
  // Broadcast theme to detached windows
  if (typeof _broadcastSync === 'function') {
    _broadcastSync({ type: 'theme', theme: state.preferences.theme || 'dark' });
  }
}

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
  const isTimed = typeVal === 'timed_event';

  const startRow = document.getElementById('eventTimeRow');
  const endGroup = document.getElementById('eventEndGroup');
  const recurRow = document.querySelectorAll('#eventModal .recurrence-row');
  const timedGroup = document.getElementById('timedEventGroup');

  if (startRow) startRow.style.display = allDay ? 'none' : '';
  if (endGroup) endGroup.style.display = (allDay || isInstant || isTimed) ? 'none' : '';
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
  layerSel.innerHTML = `<option value="">${t('event_master')}</option>` +
    state.layers
      .filter(l => l.owner_id===state.user.id || state.user.role==='admin' || l.permission==='readwrite')
      .map(l => `<option value="${l.id}" ${ev && ev.layer_id===l.id?'selected':''}>${escHtml(l.name)}</option>`)
      .join('');

  const start = defaultStart || (ev ? new Date(ev.start_time) : new Date());
  const end   = defaultEnd   || (ev && ev.end_time ? new Date(ev.end_time) : addHours(start, 1));
  document.getElementById('eventStart').value = fmtDateInput(start);
  document.getElementById('eventEnd').value   = fmtDateInput(end);

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
  const canDel = !eventIsLocked && isEdit && (state.user.role==='admin' || state.user.id===ev.created_by);
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

// ── Recurring Event Edit Dialog ────────────────────────────────────────────

async function _saveRecurringEventWithChoice(id, payload, masterEv, occTime) {
  return new Promise((resolve) => {
    const msg = `"${masterEv.title}" — occurrence on ${fmtDateTime(occTime)}`;
    const msgEl = document.getElementById('recurEditMsg');
    if (msgEl) msgEl.textContent = `This is a recurring event. What would you like to edit?\n${msg}`;

    const thisBtn   = document.getElementById('recurEditThis');
    const futureBtn = document.getElementById('recurEditFuture');
    const allBtn    = document.getElementById('recurEditAll');

    const cleanup = () => {
      thisBtn.onclick   = null;
      futureBtn.onclick = null;
      allBtn.onclick    = null;
    };

    // Edit only this occurrence: exclude this occurrence from series, create a new one-off event
    thisBtn.onclick = async () => {
      closeModal('recurEditModal');
      cleanup();
      // 1. Add this occurrence to exclusion list of master
      const excl = [...(masterEv.recurrence_excl || []), occTime.toISOString()];
      await apiPut(`/api/events/${masterEv.id}`, { ...masterEv, recurrence_excl: excl });
      // 2. Create a new non-recurring event for this occurrence with the edited payload
      const oneOff = { ...payload, is_recurring: false, recurrence_pattern: '', recurrence_end: null };
      const res = await apiPost('/api/events', oneOff);
      if (res.ok) {
        closeModal('eventModal'); closeModal('detailModal');
        state._currentOccurrenceTime = null;
        await refreshAll();
        showNotification('success', t('notif_event_updated') || 'This occurrence updated');
      } else { const err = await res.json(); showError(err.error); }
      resolve();
    };

    // Edit this and future: truncate master series before this occurrence, create new series from here
    futureBtn.onclick = async () => {
      closeModal('recurEditModal');
      cleanup();
      // 1. Truncate master series to end just before this occurrence
      const newEnd = new Date(occTime.getTime() - 60000);
      await apiPut(`/api/events/${masterEv.id}`, { ...masterEv, recurrence_end: newEnd.toISOString() });
      // 2. Create a new series starting from this occurrence with the edited payload
      const newSeries = { ...payload, start_time: occTime.toISOString() };
      const res = await apiPost('/api/events', newSeries);
      if (res.ok) {
        closeModal('eventModal'); closeModal('detailModal');
        state._currentOccurrenceTime = null;
        await refreshAll();
        showNotification('success', t('notif_event_updated') || 'This and future occurrences updated');
      } else { const err = await res.json(); showError(err.error); }
      resolve();
    };

    // Edit all occurrences: just update the master event
    allBtn.onclick = async () => {
      closeModal('recurEditModal');
      cleanup();
      const res = await apiPut(`/api/events/${masterEv.id}`, payload);
      if (res.ok) {
        closeModal('eventModal'); closeModal('detailModal');
        state._currentOccurrenceTime = null;
        await refreshAll();
        showNotification('success', t('notif_event_updated') || 'All occurrences updated');
      } else { const err = await res.json(); showError(err.error); }
      resolve();
    };

    openModal('recurEditModal');
  });
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
        <textarea id="commentText" placeholder="${t('comments_add')} (use @username to mention someone)"></textarea>
        <button class="btn btn-primary btn-sm" data-submit-comment="${ev.id}">${t('comments_submit')}</button>
      </div>
    </div>
  `;
  body.querySelector('[data-submit-comment]')?.addEventListener('click', () => submitComment(ev.id));

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
            `<button class="btn btn-danger btn-sm" data-del-attach="${a.id}" data-ev="${ev.id}">✕</button>` : ''}
        </div>
      `).join('')}</div>`;
      listEl.querySelectorAll('[data-del-attach]').forEach(btn => {
        btn.addEventListener('click', () => deleteAttachment(parseInt(btn.dataset.delAttach,10), parseInt(btn.dataset.ev,10)));
      });
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

  // Attach @mention autocomplete to comment textarea
  _attachMentionAutocomplete(document.getElementById('commentText'));

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
          <div class="comment-text">${renderCommentContent(c.content)}</div>
          <div style="display:flex;gap:4px;margin-top:4px">
            ${state.user && (state.user.id===c.author_id || state.user.role==='admin') ?
              `<button class="btn btn-danger btn-sm" data-del-comment="${c.id}" data-ev="${ev.id}">✕</button>` : ''}
            ${c.pending_approval && state.user && hasRole2(state.user.role,'teamlead') ?
              `<button class="btn btn-sm" style="background:var(--green)" data-approve-comment="${c.id}" data-ev="${ev.id}">✓ ${t('comments_approve')}</button>` : ''}
          </div>
        </div>
      `).join('');
      listEl.querySelectorAll('[data-del-comment]').forEach(btn => {
        btn.addEventListener('click', () => deleteComment(parseInt(btn.dataset.delComment,10), parseInt(btn.dataset.ev,10)));
      });
      listEl.querySelectorAll('[data-approve-comment]').forEach(btn => {
        btn.addEventListener('click', () => approveComment(parseInt(btn.dataset.approveComment,10), parseInt(btn.dataset.ev,10)));
      });
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
    (!isMaster && (state.user.role === 'teammember' || state.user.role === 'readwrite' || state.user.role === 'teamlead' || state.user.id === ev.created_by)) ||
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

// renderCommentContent highlights @mentions in comment text
function renderCommentContent(text) {
  return escHtml(text).replace(/@(\w+)/g, '<span style="color:var(--accent);font-weight:600">@$1</span>');
}

// ── @username autocomplete ───────────────────────────────────────────────────
let _mentionDropdown = null;
let _mentionStart = -1;
let _mentionCursorPos = -1; // Save cursor position for click handling

function _attachMentionAutocomplete(textarea) {
  if (!textarea || textarea._mentionBound) return;
  textarea._mentionBound = true;

  textarea.addEventListener('input', _onMentionInput);
  textarea.addEventListener('keydown', _onMentionKey);
  textarea.addEventListener('blur', () => { setTimeout(_closeMentionDropdown, 150); });
}

function _onMentionInput() {
  const ta = document.getElementById('commentText');
  if (!ta) return;
  const val = ta.value;
  const pos = ta.selectionStart;
  // Find the @ that begins the current word
  let start = pos - 1;
  while (start >= 0 && /\w/.test(val[start])) start--;
  if (start < 0 || val[start] !== '@') { _closeMentionDropdown(); return; }
  _mentionStart = start;
  _mentionCursorPos = pos;
  const query = val.slice(start + 1, pos).toLowerCase();
  const users = (state.users || []).filter(u =>
    u.username && u.username.toLowerCase().includes(query) ||
    u.display_name && u.display_name.toLowerCase().includes(query)
  ).slice(0, 8);
  if (!users.length) { _closeMentionDropdown(); return; }
  _showMentionDropdown(ta, users, query);
}

function _onMentionKey(e) {
  if (!_mentionDropdown) return;
  const items = _mentionDropdown.querySelectorAll('.mention-item');
  const active = _mentionDropdown.querySelector('.mention-item.active');
  let idx = Array.from(items).indexOf(active);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _updateMentionActive(items, Math.min(idx + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _updateMentionActive(items, Math.max(idx - 1, 0));
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (active) { e.preventDefault(); active.click(); }
    else if (items.length === 1) { e.preventDefault(); items[0].click(); }
  } else if (e.key === 'Escape') {
    e.preventDefault(); _closeMentionDropdown();
  }
}

function _updateMentionActive(items, idx) {
  items.forEach((it, i) => it.classList.toggle('active', i === idx));
  const el = items[idx]; if (el) el.scrollIntoView({block:'nearest'});
}

function _showMentionDropdown(ta, users, query) {
  _closeMentionDropdown();
  const rect = ta.getBoundingClientRect();
  const dd = document.createElement('div');
  dd.id = 'mentionDropdown';
  _mentionDropdown = dd;
  Object.assign(dd.style, {
    position: 'fixed', zIndex: '9999', background: 'var(--bg2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)', minWidth: '180px', maxHeight: '220px',
    overflowY: 'auto', left: rect.left + 'px', top: (rect.bottom + 2) + 'px'
  });
  users.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'mention-item' + (i === 0 ? ' active' : '');
    item.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:var(--fs-sm);display:flex;gap:8px;align-items:center';
    item.innerHTML = `<span style="font-weight:600">@${escHtml(u.username)}</span><span style="color:var(--text-dim);font-size:var(--fs-xs)">${escHtml(u.display_name||'')}</span>`;
    item.addEventListener('mouseover', () => { dd.querySelectorAll('.mention-item').forEach(x=>x.classList.remove('active')); item.classList.add('active'); });
    item.addEventListener('mousedown', (e) => { e.preventDefault(); _insertMention(u.username); });
    dd.appendChild(item);
  });
  document.body.appendChild(dd);
}

function _closeMentionDropdown() {
  if (_mentionDropdown) { _mentionDropdown.remove(); _mentionDropdown = null; }
  _mentionStart = -1;
}

function _insertMention(username) {
  const ta = document.getElementById('commentText');
  if (!ta || _mentionStart < 0) return;
  const pos = _mentionCursorPos >= 0 ? _mentionCursorPos : ta.selectionStart;
  const val = ta.value;
  const before = val.slice(0, _mentionStart);
  const after = val.slice(pos);
  const insert = '@' + username + ' ';
  ta.value = before + insert + after;
  const newPos = before.length + insert.length;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  _mentionCursorPos = -1;
  _closeMentionDropdown();
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
    const created = await res.clone().json().catch(() => null);
    if (created && created.id) pushUndo('create_alarm', { id: created.id });
    closeModal('alarmModal');
    await fetchAlarms(); renderSidebar();
    showNotification('success', t('notif_alarm_set'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteAlarm(id) {
  const alarmToDelete = (state.alarms||[]).find(a => a.id === parseInt(id, 10));
  const res = await apiDel(`/api/alarms/${id}`);
  if (res.ok) {
    if (alarmToDelete) pushUndo('delete_alarm', { ...alarmToDelete });
    await fetchAlarms(); renderSidebar(); showNotification('success', t('notif_alarm_removed'));
  }
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
      ${canUnlock ? `<button class="btn btn-danger btn-sm" data-unlock="${l.id}">🔓 Unlock</button>` : ''}
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-unlock]').forEach(btn => {
    btn.addEventListener('click', () => unlockFromModal(parseInt(btn.dataset.unlock,10)));
  });
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
    {key:'reporter', label:'Reporter'}, {key:'teammember', label:'Team Member'},
    {key:'teamlead', label:'Team Lead'}, {key:'deputy_teamlead', label:'Deputy Team Lead'},
    {key:'oplead', label:'Operations Lead'}, {key:'deputy_oplead', label:'Deputy Operations Lead'},
    {key:'staffofficer', label:'Staff Officer Assistant'}, {key:'staff_assistant', label:'Staff Assistant'},
    {key:'staffofficer_full', label:'Staff Officer'}, {key:'admin', label:'Admin'},
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

  // User info panel (created_at, last login, login count, blocked status, SSO badge, profile info)
  const uUserInfo = document.getElementById('uUserInfo');
  if (uUserInfo) {
    if (isEdit && user) {
      const createdStr = user.created_at ? fmtDateTime(new Date(user.created_at)) : '—';
      const lastLoginStr = user.last_login_at ? fmtDateTime(new Date(user.last_login_at)) : '—';
      const loginCountStr = user.login_count || 0;
      const ssoNote = user.is_oidc
        ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:3px;background:var(--accent-muted,rgba(0,120,255,.12));color:var(--accent);border:1px solid var(--accent);font-weight:600">🔗 SSO / OIDC — auto enrolled</span><br>${t('user_sso_note')||'This account was automatically created via Single Sign-On (OIDC). The identity is managed by the external identity provider.'}`
        : '';
      const blockedBadge = user.blocked
        ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:3px;background:rgba(231,76,60,.15);color:var(--red,#E74C3C);border:1px solid var(--red,#E74C3C);font-weight:600">🚫 ${t('user_account_blocked')||'Account Blocked'}</span>`
        : '';
      const profileInfo = [
        user.title ? `<strong>${t('user_title')||'Title'}:</strong> ${escHtml(user.title)}` : '',
        user.rank ? `<strong>${t('user_rank')||'Rank'}:</strong> ${escHtml(user.rank)}` : '',
        user.job_role ? `<strong>${t('user_job_role')||'Role/Position'}:</strong> ${escHtml(user.job_role)}` : '',
        user.expertise ? `<strong>${t('user_expertise')||'Expertise'}:</strong> ${escHtml(user.expertise)}` : '',
        user.telephone ? `<strong>${t('user_telephone')||'Telephone'}:</strong> ${escHtml(user.telephone)}` : '',
        user.cellular ? `<strong>${t('user_cellular')||'Cellular'}:</strong> ${escHtml(user.cellular)}` : '',
        user.mattermost_handle ? `<strong>Mattermost:</strong> ${escHtml(user.mattermost_handle)}` : '',
        user.discord_handle ? `<strong>Discord:</strong> ${escHtml(user.discord_handle)}` : '',
        user.signal_handle ? `<strong>Signal:</strong> ${escHtml(user.signal_handle)}` : '',
        user.location ? `<strong>${t('user_location')||'Location'}:</strong> ${escHtml(user.location)}` : '',
      ].filter(Boolean);
      const failedLoginStr = user.last_failed_login_at ? fmtDateTime(new Date(user.last_failed_login_at)) : '—';
      const failedLoginIP = user.last_failed_login_ip || '—';
      uUserInfo.innerHTML = `
        <strong>${t('user_created_at')||'Created'}:</strong> ${escHtml(createdStr)}<br>
        <strong>${t('user_last_login')||'Last login'}:</strong> ${lastLoginStr}<br>
        <strong>${t('user_login_count')||'Logins'}:</strong> ${loginCountStr}<br>
        <strong>${t('user_last_failed_login')||'Last failed login'}:</strong> ${failedLoginStr}${user.last_failed_login_ip ? ' (IP: ' + escHtml(failedLoginIP) + ')' : ''}<br>
        ${profileInfo.length ? '<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">' + profileInfo.join('<br>') : ''}
        ${blockedBadge ? '<br>' + blockedBadge : ''}
        ${ssoNote ? '<br>' + ssoNote : ''}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          ${user.blocked
            ? `<button class="btn btn-secondary btn-sm" id="btnUnblockUser" title="${t('user_unblock_desc')||'Allow this user to log in again'}">🔓 ${t('user_unblock')||'Unblock'}</button>`
            : `<button class="btn btn-danger btn-sm" id="btnBlockUser" title="${t('user_block_desc')||'Prevent this user from logging in'}">🚫 ${t('user_block')||'Block'}</button>`
          }
          <button class="btn btn-secondary btn-sm" id="btnLoginHistory" title="${t('user_login_history_desc')||'View recent login activity for this user'}">📋 ${t('user_login_history')||'Login History'}</button>
        </div>
        <div id="uLoginHistoryPanel" style="display:none;margin-top:8px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px"></div>
      `;
      uUserInfo.style.display = '';
      // Bind block/unblock and login history buttons
      const btnBlock = document.getElementById('btnBlockUser');
      const btnUnblock = document.getElementById('btnUnblockUser');
      if (btnBlock) btnBlock.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(t('confirm_block_user')||`Block user "${user.username}"? They will not be able to log in.`)) return;
        const res = await apiPost(`/api/users/${user.id}/block`);
        if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('user_blocked_success')||'User blocked'); }
        else { const err = await res.json(); showError(err.error); }
      });
      if (btnUnblock) btnUnblock.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await apiPost(`/api/users/${user.id}/unblock`);
        if (res.ok) { closeModal('userModal'); renderSidebar(); showNotification('success', t('user_unblocked_success')||'User unblocked'); }
        else { const err = await res.json(); showError(err.error); }
      });
      const btnHistory = document.getElementById('btnLoginHistory');
      if (btnHistory) btnHistory.addEventListener('click', async (e) => {
        e.stopPropagation();
        const panel = document.getElementById('uLoginHistoryPanel');
        if (!panel) return;
        if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
        panel.innerHTML = `<em style="color:var(--text-dim)">${t('loading')||'Loading…'}</em>`;
        panel.style.display = '';
        try {
          const entries = await apiGet(`/api/users/${user.id}/login-history`);
          if (!entries || entries.length === 0) {
            panel.innerHTML = `<em style="color:var(--text-dim)">${t('user_no_login_history')||'No login history found.'}</em>`;
          } else {
            panel.innerHTML = entries.map(e => {
              const actionLabel = {login: t('audit_login')||'Login', login_failed: t('audit_login_failed')||'Login Failed', login_blocked: t('audit_login_blocked')||'Login Blocked'}[e.action] || e.action;
              const color = e.action === 'login' ? 'var(--green,#27AE60)' : 'var(--red,#E74C3C)';
              return `<div style="display:flex;gap:8px;align-items:center;padding:2px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:10px;color:var(--text-dim)">${fmtDateTime(new Date(e.timestamp))}</span>
                <span style="font-size:10px;font-weight:600;color:${color}">${actionLabel}</span>
                <span style="font-size:10px;color:var(--text-dim);flex:1">${escHtml(e.summary||'')}</span>
              </div>`;
            }).join('');
          }
        } catch { panel.innerHTML = `<em style="color:var(--red)">Error loading login history.</em>`; }
      });
    } else {
      uUserInfo.style.display = 'none';
      uUserInfo.innerHTML = '';
    }
  }

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

  // ── Resource Notes & Stars panels ──
  const notesPanel = document.getElementById('uResourceNotesPanel');
  const starsPanel = document.getElementById('uResourceStarsPanel');
  const canManageNotes = state.user && hasRole2(state.user.role, 'teamlead');
  const canManageStars = state.user && hasRole2(state.user.role, 'teamlead');

  if (isEdit && user.id) {
    notesPanel.style.display = '';
    starsPanel.style.display = '';
    const resType = 'user';
    const resId = String(user.id);

    // Load notes
    _loadResourceNotes(resType, resId, canManageNotes);
    // Load stars
    _loadResourceStars(resType, resId, canManageStars);

    // Show add controls for authorized users
    const notesAddEl = document.getElementById('uResourceNotesAdd');
    const starsAddEl = document.getElementById('uResourceStarsAdd');
    if (notesAddEl) notesAddEl.style.display = canManageNotes ? '' : 'none';
    if (starsAddEl) starsAddEl.style.display = canManageStars ? '' : 'none';

    // Bind add note button
    const btnAddNote = document.getElementById('btnAddResourceNote');
    if (btnAddNote) {
      const newBtn = btnAddNote.cloneNode(true);
      btnAddNote.parentNode.replaceChild(newBtn, btnAddNote);
      newBtn.addEventListener('click', async () => {
        const content = document.getElementById('uNoteContent').value.trim();
        if (!content) return;
        const noteType = document.getElementById('uNoteType').value;
        try {
          await apiPost('/api/resource-notes', {
            resource_type: resType, resource_id: resId,
            note_type: noteType, content: content
          });
          document.getElementById('uNoteContent').value = '';
          _loadResourceNotes(resType, resId, canManageNotes);
        } catch (e) { showError(e.message || 'Failed to add note'); }
      });
    }

    // Bind star picker & add star button
    _initStarPicker();
    const btnAddStar = document.getElementById('btnAddResourceStar');
    if (btnAddStar) {
      const newBtn = btnAddStar.cloneNode(true);
      btnAddStar.parentNode.replaceChild(newBtn, btnAddStar);
      newBtn.addEventListener('click', async () => {
        const stars = window._selectedStarCount || 0;
        if (stars < 1) { showError('Select at least 1 star'); return; }
        const visibility = document.getElementById('uStarVisibility').value;
        try {
          await apiPost('/api/resource-stars', {
            resource_type: resType, resource_id: resId,
            stars: stars, visibility: visibility
          });
          window._selectedStarCount = 0;
          _initStarPicker();
          _loadResourceStars(resType, resId, canManageStars);
        } catch (e) { showError(e.message || 'Failed to add star'); }
      });
    }
  } else {
    notesPanel.style.display = 'none';
    starsPanel.style.display = 'none';
  }

  openModal('userModal');
}

async function _loadResourceNotes(resType, resId, canDelete) {
  const list = document.getElementById('uResourceNotesList');
  if (!list) return;
  list.innerHTML = `<em style="color:var(--text-dim);font-size:var(--fs-xs)">${t('loading')||'Loading…'}</em>`;
  try {
    const notes = await apiGet(`/api/resource-notes?resource_type=${resType}&resource_id=${resId}`);
    if (!notes || notes.length === 0) {
      list.innerHTML = `<em style="color:var(--text-dim);font-size:var(--fs-xs)">${t('resource_note_empty')||'No notes yet.'}</em>`;
      return;
    }
    list.innerHTML = notes.map(n => {
      const typeLabel = t('resource_note_type_' + n.note_type) || n.note_type;
      const dateStr = n.created_at ? fmtDateTime(new Date(n.created_at)) : '';
      return `<div style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:var(--fs-xs);display:flex;gap:6px;align-items:flex-start">
        <div style="flex:1">
          <span style="font-weight:600;color:var(--accent)">[${escHtml(typeLabel)}]</span>
          ${escHtml(n.content)}
          <div style="color:var(--text-dim);font-size:10px;margin-top:2px">— ${escHtml(n.created_by_name||'')} · ${dateStr}</div>
        </div>
        ${canDelete ? `<button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:10px" data-action="_deleteResourceNote" data-args='[${n.id},"${resType}","${resId}"]'>&times;</button>` : ''}
      </div>`;
    }).join('');
    _bindActions(list);
  } catch { list.innerHTML = `<em style="color:var(--red);font-size:var(--fs-xs)">Error loading notes.</em>`; }
}

window._deleteResourceNote = async function(noteId, resType, resId) {
  if (!confirm(t('resource_note_delete_confirm')||'Delete this note?')) return;
  try {
    const res = await fetch(`/api/resource-notes/${noteId}`, { method: 'DELETE', headers: {'Authorization': 'Bearer ' + state.token} });
    if (!res.ok) { const e = await res.json(); showError(e.error); return; }
    _loadResourceNotes(resType, resId, true);
  } catch (e) { showError(e.message); }
};

async function _loadResourceStars(resType, resId, canDelete) {
  const list = document.getElementById('uResourceStarsList');
  if (!list) return;
  list.innerHTML = `<em style="color:var(--text-dim);font-size:var(--fs-xs)">${t('loading')||'Loading…'}</em>`;
  try {
    const stars = await apiGet(`/api/resource-stars?resource_type=${resType}&resource_id=${resId}`);
    if (!stars || stars.length === 0) {
      list.innerHTML = `<em style="color:var(--text-dim);font-size:var(--fs-xs)">${t('resource_note_empty')||'No stars yet.'}</em>`;
      return;
    }
    list.innerHTML = stars.map(s => {
      const starStr = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
      const visLabel = t('star_visibility_' + s.visibility) || s.visibility;
      const dateStr = s.created_at ? fmtDateTime(new Date(s.created_at)) : '';
      return `<div style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:var(--fs-xs);display:flex;gap:6px;align-items:center">
        <span style="color:gold;font-size:14px;letter-spacing:1px">${starStr}</span>
        <span style="color:var(--text-dim)">(${escHtml(visLabel)})</span>
        <span style="color:var(--text-dim);font-size:10px;flex:1">— ${escHtml(s.created_by_name||'')} · ${dateStr}</span>
        ${canDelete ? `<button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:10px" data-action="_deleteResourceStar" data-args='[${s.id},"${resType}","${resId}"]'>&times;</button>` : ''}
      </div>`;
    }).join('');
    _bindActions(list);
  } catch { list.innerHTML = `<em style="color:var(--red);font-size:var(--fs-xs)">Error loading stars.</em>`; }
}

window._deleteResourceStar = async function(starId, resType, resId) {
  if (!confirm(t('resource_star_remove')||'Remove this star rating?')) return;
  try {
    const res = await fetch(`/api/resource-stars/${starId}`, { method: 'DELETE', headers: {'Authorization': 'Bearer ' + state.token} });
    if (!res.ok) { const e = await res.json(); showError(e.error); return; }
    _loadResourceStars(resType, resId, true);
  } catch (e) { showError(e.message); }
};

function _initStarPicker() {
  const picker = document.getElementById('uStarPicker');
  if (!picker) return;
  window._selectedStarCount = window._selectedStarCount || 0;
  _renderStarPicker(picker, window._selectedStarCount);
  picker.onmouseleave = () => _renderStarPicker(picker, window._selectedStarCount);
}

function _renderStarPicker(el, count) {
  el.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const span = document.createElement('span');
    span.textContent = i <= count ? '★' : '☆';
    span.style.color = i <= count ? 'gold' : 'var(--text-dim)';
    span.style.cursor = 'pointer';
    span.addEventListener('mouseenter', () => {
      [...el.children].forEach((c, idx) => {
        c.textContent = idx < i ? '★' : '☆';
        c.style.color = idx < i ? 'gold' : 'var(--text-dim)';
      });
    });
    span.addEventListener('click', () => {
      window._selectedStarCount = i;
      _renderStarPicker(el, i);
    });
    el.appendChild(span);
  }
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
  if (res.ok) {
    if (!id) {
      const created = await res.clone().json().catch(() => null);
      if (created && created.id) pushUndo('create_group', { id: created.id });
    }
    closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved'));
  }
  else { const err = await res.json(); showError(err.error); }
});

async function deleteGroup(id) {
  if (!confirm(t('confirm_delete_group'))) return;
  const groupToDelete = state.groups.find(g => g.id === parseInt(id, 10));
  const res = await apiDel(`/api/groups/${id}`);
  if (res.ok) {
    if (groupToDelete) pushUndo('delete_group', { ...groupToDelete });
    closeModal('groupModal'); await fetchGroups(); renderSidebar(); showNotification('success', t('notif_saved'));
  }
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
      <button class="btn btn-danger btn-sm" data-rm-member="${m.user_id}" data-group="${group.id}" style="margin-left:auto">✕</button>
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
        <button class="btn btn-primary btn-sm" data-add-member="${group.id}">${t('btn_add')}</button>
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
  body.querySelectorAll('[data-rm-member]').forEach(btn => {
    btn.addEventListener('click', () => removeGroupMember(parseInt(btn.dataset.group,10), parseInt(btn.dataset.rmMember,10)));
  });
  const addBtn = body.querySelector('[data-add-member]');
  if (addBtn) addBtn.addEventListener('click', () => addGroupMember(parseInt(addBtn.dataset.addMember,10)));
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
  const oldLayer = id ? state.layers.find(l => l.id === parseInt(id, 10)) : null;
  const res = id ? await apiPut(`/api/layers/${id}`, payload) : await apiPost('/api/layers', payload);
  if (res.ok) {
    if (id && oldLayer) {
      pushUndo('update_layer', { id: parseInt(id, 10), old: { ...oldLayer } });
    } else if (!id) {
      const created = await res.clone().json().catch(() => null);
      if (created && created.id) pushUndo('create_layer', { id: created.id });
    }
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
  const layerToDelete = state.layers.find(l => l.id === parseInt(id, 10));
  const res = await apiDel(`/api/layers/${id}`);
  if (res.ok) {
    if (layerToDelete) pushUndo('delete_layer', { ...layerToDelete });
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
  const oldEtype = id ? state.eventTypes.find(e => String(e.id) === String(id)) : null;
  const res = id ? await apiPut(`/api/event-types/${id}`, payload) : await apiPost('/api/event-types', payload);
  if (res.ok) {
    if (id && oldEtype) {
      pushUndo('update_event_type', { id: parseInt(id, 10), old: { ...oldEtype } });
    } else if (!id) {
      const created = await res.clone().json().catch(() => null);
      if (created && created.id) pushUndo('create_event_type', { id: created.id });
    }
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deleteEtype(id) {
  if (!confirm(t('confirm_delete_type'))) return;
  const etypeToDelete = state.eventTypes.find(e => String(e.id) === String(id));
  const res = await apiDel(`/api/event-types/${id}`);
  if (res.ok) {
    if (etypeToDelete) pushUndo('delete_event_type', { ...etypeToDelete });
    closeModal('etypeModal');
    state.eventTypes = await apiGet('/api/event-types');
    renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
}

// ── Day Label Modal ────────────────────────────────────────────────────────
function _dlFormHTML(prefix, dl) {
  // Shared form fields for add/edit day label
  const txt = dl ? escHtml(dl.label) : '';
  const bg = dl ? (dl.background || '#4A90D9') : '#4A90D9';
  const clr = dl ? (dl.color || '#ffffff') : '#ffffff';
  const fs = dl ? (dl.font_size || 'var(--fs-xs)') : 'var(--fs-xs)';
  const fw = dl ? (dl.font_weight || '600') : '600';
  const fsOptions = [
    ['9px','9px'], ['10px','10px'], ['var(--fs-xs)','Default (xs)'],
    ['var(--fs-sm)','Small'], ['var(--fs-base)','Base'], ['14px','14px'], ['16px','16px'],
  ];
  const fwOptions = [
    ['400', t('day_label_font_weight_normal')],
    ['600', t('day_label_font_weight_semibold')],
    ['700', t('day_label_font_weight_bold')],
    ['800', t('day_label_font_weight_extrabold')],
  ];
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
      <div style="grid-column:1/-1">
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('day_label_text')}:</label>
        <input type="text" class="${prefix}-text-input" value="${txt}" placeholder="${t('day_label_text')}..." maxlength="60"
          style="width:100%;padding:4px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('day_label_bg')}:</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="color" class="${prefix}-bg-input" value="${bg}" style="width:36px;height:30px;padding:1px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer">
          <span class="${prefix}-bg-hex" style="font-size:var(--fs-xs);color:var(--text-dim);font-family:monospace">${bg}</span>
        </div>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('day_label_color')}:</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="color" class="${prefix}-color-input" value="${clr}" style="width:36px;height:30px;padding:1px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer">
          <span class="${prefix}-color-hex" style="font-size:var(--fs-xs);color:var(--text-dim);font-family:monospace">${clr}</span>
        </div>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('day_label_font_size')}:</label>
        <select class="${prefix}-fontsize-input" style="width:100%;padding:4px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          ${fsOptions.map(([v,l]) => `<option value="${v}"${v===fs?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('day_label_font_weight')}:</label>
        <select class="${prefix}-fontweight-input" style="width:100%;padding:4px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          ${fwOptions.map(([v,l]) => `<option value="${v}"${v===fw?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

function openDayLabelModal(date) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0,10);
  const existing = (state.dayLabels||[]).filter(dl => dl.date === dateStr);
  // Remove any existing day label modal to avoid duplicate IDs
  document.querySelectorAll('.day-label-modal-overlay').forEach(m => m.remove());
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open day-label-modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <h3>🏷️ ${t('day_labels')} — ${dateStr}</h3>
        <button class="modal-close day-label-close">&times;</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        <div class="dl-label-list">
          ${existing.length === 0 ? `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('day_labels_none')}</p>` : ''}
          ${existing.map(dl => `
            <div class="day-label-row" data-id="${dl.id}" style="margin-bottom:6px;padding:6px;border:1px solid var(--border);border-radius:var(--radius)">
              <div style="display:flex;gap:6px;align-items:center">
                <span style="background:${dl.background||'var(--accent)'};color:${dl.color||'#fff'};padding:2px 8px;border-radius:3px;font-size:${dl.font_size||'var(--fs-xs)'};font-weight:${dl.font_weight||'600'};flex:1">${escHtml(dl.label)}</span>
                <button class="btn btn-sm day-label-edit" data-id="${dl.id}" style="flex-shrink:0" title="${t('day_label_edit')}">✎</button>
                <button class="btn btn-danger btn-sm day-label-del" data-id="${dl.id}" style="flex-shrink:0">✕</button>
              </div>
              <div class="dl-edit-form" data-id="${dl.id}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                ${_dlFormHTML('dl-edit-' + dl.id, dl)}
                <div style="display:flex;gap:6px">
                  <button class="btn btn-primary btn-sm dl-edit-save" data-id="${dl.id}">${t('btn_save')||'Save'}</button>
                  <button class="btn btn-secondary btn-sm dl-edit-cancel" data-id="${dl.id}">${t('btn_cancel')||'Cancel'}</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px">
          <div style="font-weight:600;font-size:var(--fs-sm);margin-bottom:6px">${t('day_label_add')}</div>
          ${_dlFormHTML('dl', null)}
          <button class="btn btn-primary btn-sm dl-add-btn">${t('btn_add')||'+ Add'}</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary day-label-close">${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  // Color hex display updaters
  modal.querySelectorAll('input[type="color"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const hexEl = inp.parentElement.querySelector('span[class$="-hex"]');
      if (hexEl) hexEl.textContent = inp.value;
    });
  });
  // Close handlers
  modal.querySelectorAll('.day-label-close').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); modal.remove(); }));
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  // Edit handlers — toggle edit form
  modal.querySelectorAll('.day-label-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const form = modal.querySelector(`.dl-edit-form[data-id="${id}"]`);
      if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
    });
  });
  // Edit cancel
  modal.querySelectorAll('.dl-edit-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const form = modal.querySelector(`.dl-edit-form[data-id="${btn.dataset.id}"]`);
      if (form) form.style.display = 'none';
    });
  });
  // Edit save
  modal.querySelectorAll('.dl-edit-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);
      const form = modal.querySelector(`.dl-edit-form[data-id="${btn.dataset.id}"]`);
      const prefix = 'dl-edit-' + btn.dataset.id;
      const label = form.querySelector(`.${prefix}-text-input`).value.trim();
      if (!label) { showError(t('day_label_text_required')); return; }
      const payload = {
        id: id,
        date: dateStr,
        label: label,
        background: form.querySelector(`.${prefix}-bg-input`).value,
        color: form.querySelector(`.${prefix}-color-input`).value,
        font_size: form.querySelector(`.${prefix}-fontsize-input`).value,
        font_weight: form.querySelector(`.${prefix}-fontweight-input`).value,
      };
      const res = await api('PUT', `/api/day-labels/${id}`, payload);
      if (res.ok) {
        await fetchDayLabels();
        modal.remove();
        renderTimeline();
        openDayLabelModal(dateStr);
      } else { showError('Failed to update label'); }
    });
  });
  // Delete handlers
  modal.querySelectorAll('.day-label-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);
      const res = await api('DELETE', `/api/day-labels/${id}`);
      if (res.ok) {
        await fetchDayLabels();
        modal.remove();
        renderTimeline();
        openDayLabelModal(dateStr);
      } else { showError('Failed to delete label'); }
    });
  });
  // Add handler
  modal.querySelector('.dl-add-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const label = modal.querySelector('.dl-text-input').value.trim();
    if (!label) { showError(t('day_label_text_required')); return; }
    const payload = {
      date: dateStr,
      label: label,
      background: modal.querySelector('.dl-bg-input').value,
      color: modal.querySelector('.dl-color-input').value,
      font_size: modal.querySelector('.dl-fontsize-input').value,
      font_weight: modal.querySelector('.dl-fontweight-input').value,
    };
    const res = await apiPost('/api/day-labels', payload);
    if (res.ok) {
      await fetchDayLabels();
      modal.remove();
      renderTimeline();
      openDayLabelModal(dateStr);
    } else { showError('Failed to add label'); }
  });
}

// ── Phase Modal ────────────────────────────────────────────────────────────
function openPhaseModal(ph) {
  const isEdit = !!ph;
  document.getElementById('phaseModalTitle').textContent = isEdit ? (t('phase_edit')||'Edit Phase') : (t('phase_add')||'New Phase');
  document.getElementById('phaseId').value    = ph ? ph.id : '';
  document.getElementById('phaseName').value  = ph ? ph.name : '';
  document.getElementById('phaseColor').value = ph ? (ph.color||'#4A90D9') : '#4A90D9';
  document.getElementById('phaseOrder').value = ph ? (ph.order ?? 0) : 0;
  const phStart = ph && ph.start_time ? new Date(ph.start_time) : null;
  const phEnd   = ph && ph.end_time   ? new Date(ph.end_time)   : null;
  document.getElementById('phaseStart').value = fmtDateInput(phStart && !isNaN(phStart) ? phStart : state.startDate);
  document.getElementById('phaseEnd').value   = fmtDateInput(phEnd && !isNaN(phEnd)     ? phEnd   : addDays(state.startDate, 1));
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
  const oldPhase = id ? (state.phases||[]).find(p => String(p.id) === String(id)) : null;
  const res = id ? await apiPut(`/api/phases/${id}`, payload) : await apiPost('/api/phases', payload);
  if (res.ok) {
    if (id && oldPhase) {
      pushUndo('update_phase', { id: parseInt(id, 10), old: { ...oldPhase } });
    } else if (!id) {
      const created = await res.clone().json().catch(() => null);
      if (created && created.id) pushUndo('create_phase', { id: created.id });
    }
    closeModal('phaseModal');
    await fetchPhases();
    renderSidebar();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  } else { const err = await res.json(); showError(err.error); }
});

async function deletePhase(id) {
  if (!confirm(t('confirm_delete')||'Delete this phase?')) return;
  const phaseToDelete = (state.phases||[]).find(p => String(p.id) === String(id));
  const res = await apiDel(`/api/phases/${id}`);
  if (res.ok) {
    if (phaseToDelete) pushUndo('delete_phase', { ...phaseToDelete });
    closeModal('phaseModal');
    await fetchPhases();
    renderSidebar();
    renderTimeline();
    showNotification('success', t('notif_saved'));
  }
}

// ── renderSidebar ─────────────────────────────────────────────────────────
// ── Sidebar ────────────────────────────────────────────────────────────────
function _bindResSubTabs(el) {
  el.querySelectorAll('[data-res-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      el.dataset.resSubTab = btn.dataset.resSub;
      renderSidebar();
    });
  });
}

function _bindLogSubTabs(el) {
  el.querySelectorAll('[data-log-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      el.dataset.logSubTab = btn.dataset.logSub;
      renderSidebar();
    });
  });
}

let _detachedDecisionLogWin = null;
function detachDecisionLog() {
  if (_detachedDecisionLogWin && !_detachedDecisionLogWin.closed) {
    _detachedDecisionLogWin.focus();
    return;
  }
  _detachedDecisionLogWin = window.open('/static/decision-log-popup.html', 'tidslinjal-decisionlog',
    'width=600,height=700,menubar=no,toolbar=no,scrollbars=yes');
}

// Event log: external events received via SSE/webhook
let _eventLogEntries = [];

async function _loadEventLog() {
  const el = document.getElementById('eventLogEntries');
  if (!el) return;
  try {
    const entries = await apiGet('/api/event-log');
    if (entries && entries.length) _eventLogEntries = entries;
  } catch {}
  if (_eventLogEntries.length === 0) {
    el.innerHTML = `<em style="color:var(--text-dim)">${t('event_log_empty')||'No external events received yet.'}</em>`;
    return;
  }
  el.innerHTML = _eventLogEntries.slice().reverse().map(e => `
    <div style="padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-dim)">${new Date(e.timestamp).toLocaleString()}</span>
      <strong>${escHtml(e.source||'external')}</strong>: ${escHtml(e.message||e.summary||'')}
    </div>`).join('');
}

// ── Pollster Log ────────────────────────────────────────────────────────────
async function _loadPollsterLog(container) {
  const el = container.querySelector ? container.querySelector('#pollsterLogEntries') : document.getElementById('pollsterLogEntries');
  if (!el) return;
  try {
    const res = await api('GET', '/api/polls/log');
    if (!res.ok) throw new Error('Failed');
    const polls = await res.json();
    if (!polls || polls.length === 0) {
      el.innerHTML = `<em style="color:var(--text-dim)">${t('pollster_log_empty')||'No polls recorded yet.'}</em>`;
      return;
    }
    el.innerHTML = polls.map(poll => {
      const ts = fmtDateTime(new Date(poll.created_at));
      const closedTs = poll.closed_at ? fmtDateTime(new Date(poll.closed_at)) : '';
      const statusColor = poll.status === 'open' ? 'var(--accent)' : 'var(--text-dim)';
      const allResponses = poll.responses || [];
      const respondedUserSet = new Set(allResponses.map(r => r.user_id));
      const totalR = respondedUserSet.size;
      const totalT = (poll.target_ids || []).length || '?';
      const pollCreatedAt = new Date(poll.created_at);
      const totalQuestions = (poll.questions || []).length;

      // Build respondent details
      const answeredMap = {};
      allResponses.forEach(r => {
        if (!answeredMap[r.user_id]) {
          answeredMap[r.user_id] = { name: r.user_name, firstAt: new Date(r.answered_at), count: 0 };
        }
        answeredMap[r.user_id].count++;
        const at = new Date(r.answered_at);
        if (at < answeredMap[r.user_id].firstAt) answeredMap[r.user_id].firstAt = at;
      });
      const partialTitle = t('poll_partial_answer')||'Partial';
      const answeredUsers = Object.entries(answeredMap).map(([uid, info]) => {
        const diffMs = info.firstAt - pollCreatedAt;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffH = Math.floor(diffMin / 60);
        let diffStr = '';
        if (diffH > 0) diffStr = `${diffH}h ${diffMin % 60}m`;
        else if (diffMin > 0) diffStr = `${diffMin}m ${diffSec % 60}s`;
        else diffStr = `${diffSec}s`;
        const isPartial = info.count < totalQuestions;
        return { uid: parseInt(uid), name: info.name, diffStr, isPartial };
      });

      // Non-respondents
      const respondedSet = new Set(Object.keys(answeredMap).map(Number));
      let nonRespondents = [];
      if (poll.target_type === 'user') {
        (poll.target_ids || []).forEach(idStr => {
          const uid = parseInt(idStr);
          if (!respondedSet.has(uid)) {
            const u = (state.users||[]).find(u => u.id === uid);
            nonRespondents.push({ uid, name: u ? (u.display_name||u.username) : `User #${uid}` });
          }
        });
      }

      // Standard question table
      const standardQs = (poll.questions || []).filter(q => q.type === 'scale' || q.type === 'scale_0_3' || q.type === 'yes_no');
      let tableHtml = '';
      if (standardQs.length > 0 && answeredUsers.length > 0) {
        const headerCells = standardQs.map(q => `<th style="padding:3px 6px;border:1px solid var(--border);font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(q.text)}">${escHtml(q.text.length > 30 ? q.text.slice(0,27)+'...' : q.text)}</th>`).join('');
        const rows = answeredUsers.map(au => {
          const cells = standardQs.map(q => {
            const resp = allResponses.find(r => r.user_id === au.uid && r.question_id === q.id);
            if (!resp) return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;color:var(--text-dim)">—</td>`;
            let val = resp.answer;
            let bg = '';
            if (q.type === 'scale' || q.type === 'scale_0_3') {
              const v = parseInt(val);
              if (v === 0) bg = 'background:#27AE6033';
              else if (v === 1) bg = 'background:#F39C1233';
              else if (v === 2) bg = 'background:#E67E2233';
              else if (v === 3) bg = 'background:#E74C3C33';
              val = t('poll_scale_'+v)||['None','Low','Medium','High'][v]||v;
            } else if (q.type === 'yes_no') {
              bg = val === 'yes' ? 'background:#27AE6022' : 'background:#E74C3C22';
              val = val === 'yes' ? (t('yes')||'Yes') : (t('no')||'No');
            }
            return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;font-size:10px;${bg}">${val}</td>`;
          }).join('');
          return `<tr><td style="padding:3px 6px;border:1px solid var(--border);font-size:10px;white-space:nowrap">${escHtml(au.name)} <span style="color:var(--text-dim)">(+${au.diffStr})</span>${au.isPartial ? ' ⚠' : ''}</td>${cells}</tr>`;
        }).join('');
        tableHtml = `<div style="margin-top:6px;overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:10px">
          <thead><tr><th style="padding:3px 6px;border:1px solid var(--border)"></th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
      }

      // Free text responses
      const freeTextQs = (poll.questions || []).filter(q => q.type === 'free_text');
      let freeTextHtml = '';
      if (freeTextQs.length > 0) {
        freeTextHtml = freeTextQs.map(q => {
          const answers = allResponses.filter(r => r.question_id === q.id && r.answer).map(r => `<div style="padding:2px 0"><b>${escHtml(r.user_name)}</b>: ${escHtml(r.answer)}</div>`).join('');
          return answers ? `<div style="margin-top:4px"><em>${escHtml(q.text)}</em>${answers}</div>` : '';
        }).join('');
      }

      return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>📊 ${escHtml(poll.title)}</strong>
          <span style="font-size:10px;color:${statusColor}">${poll.status}</span>
        </div>
        <div style="color:var(--text-dim);font-size:var(--fs-xs)">
          📅 ${t('poll_started')||'Started'}: ${ts}
          ${closedTs ? `<br>🔒 ${t('poll_closed')||'Closed'}: ${closedTs}` : ''}
        </div>
        <div style="font-size:var(--fs-xs);margin-top:4px">
          <strong>${t('poll_responses')||'Responses'}: ${totalR}/${totalT}</strong>
        </div>
        ${answeredUsers.length > 0 ? `<div style="font-size:var(--fs-xs);margin-top:4px"><span style="color:#27AE60;font-weight:600">✅ ${t('poll_answered')||'Answered'}:</span>
          ${answeredUsers.map(au => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #27AE60${au.isPartial ? '80' : ''}">${escHtml(au.name)} <span style="color:var(--text-dim)">(+${au.diffStr})</span>${au.isPartial ? ' <span style="color:#F39C12" title="' + partialTitle + '">⚠</span>' : ''}</span>`).join(' ')}
        </div>` : ''}
        ${nonRespondents.length > 0 ? `<div style="font-size:var(--fs-xs);margin-top:2px"><span style="color:#E74C3C;font-weight:600">❌ ${t('poll_not_answered')||'Not answered'}:</span>
          ${nonRespondents.map(nr => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #E74C3C">${escHtml(nr.name)}</span>`).join(' ')}
        </div>` : ''}
        ${tableHtml || freeTextHtml ? `<div style="margin-top:4px;padding:6px;background:var(--bg3);border-radius:var(--radius)">${tableHtml}${freeTextHtml}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<em style="color:var(--text-dim)">${t('pollster_log_empty')||'No polls recorded yet.'}</em>`;
  }

  // Search filter
  const searchEl = container.querySelector ? container.querySelector('#pollsterSearch') : document.getElementById('pollsterSearch');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.toLowerCase();
      el.querySelectorAll(':scope > div').forEach(div => {
        div.style.display = div.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Export CSV
  const csvBtn = container.querySelector ? container.querySelector('#pollsterExportCSV') : document.getElementById('pollsterExportCSV');
  if (csvBtn) {
    csvBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        let csv = 'Poll,Status,Created,Questions,Responses\n';
        (polls || []).forEach(p => {
          csv += `"${(p.title||'').replace(/"/g,'""')}","${p.status}","${p.created_at}","${(p.questions||[]).length}","${(p.responses||[]).length}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.csv';
        a.click();
      } catch {}
    });
  }

  // Export JSON
  const jsonBtn = container.querySelector ? container.querySelector('#pollsterExportJSON') : document.getElementById('pollsterExportJSON');
  if (jsonBtn) {
    jsonBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        const blob = new Blob([JSON.stringify(polls, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.json';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {}
    });
  }

  // Export RTF
  const rtfBtn = container.querySelector ? container.querySelector('#pollsterExportRTF') : document.getElementById('pollsterExportRTF');
  if (rtfBtn) {
    rtfBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        const esc = s => String(s||'').replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}');
        let rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\n';
        rtf += '\\f0\\fs24\\b Pollster Log\\b0\\par\\par\n';
        rtf += '\\trowd\\trgaph100\\cellx3000\\cellx5000\\cellx7500\\cellx9000\\cellx11000\\pard\\intbl\n';
        rtf += '\\b Poll\\cell Status\\cell Created\\cell Questions\\cell Responses\\cell\\b0\\row\n';
        (polls || []).forEach(p => {
          rtf += '\\trowd\\trgaph100\\cellx3000\\cellx5000\\cellx7500\\cellx9000\\cellx11000\\pard\\intbl\n';
          rtf += `${esc(p.title)}\\cell ${esc(p.status)}\\cell ${esc(p.created_at)}\\cell ${(p.questions||[]).length}\\cell ${(p.responses||[]).length}\\cell\\row\n`;
        });
        rtf += '}';
        const blob = new Blob([rtf], { type: 'application/rtf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.rtf';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {}
    });
  }

  // Export DOCX
  const docxBtn = container.querySelector ? container.querySelector('#pollsterExportDOCX') : document.getElementById('pollsterExportDOCX');
  if (docxBtn) {
    docxBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        const xe = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const headers = ['Poll','Status','Created','Questions','Responses'];
        let rows = '';
        (polls || []).forEach(p => {
          const cells = [p.title, p.status, p.created_at, String((p.questions||[]).length), String((p.responses||[]).length)];
          rows += '<w:tr>' + cells.map(c => `<w:tc><w:p><w:r><w:t>${xe(c)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>';
        });
        const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          '<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Pollster Log</w:t></w:r></w:p>' +
          '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
          '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '</w:tblBorders></w:tblPr>' +
          '<w:tr>' + headers.map(h => `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xe(h)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>' +
          rows + '</w:tbl></w:body></w:document>';
        const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>';
        const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>';
        const drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
        // Build ZIP using minimal PKZIP structure
        const enc = new TextEncoder();
        const files = [
          { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
          { name: '_rels/.rels', data: enc.encode(rels) },
          { name: 'word/_rels/document.xml.rels', data: enc.encode(drels) },
          { name: 'word/document.xml', data: enc.encode(docXml) },
        ];
        const parts = [];
        const centralDir = [];
        let offset = 0;
        for (const f of files) {
          const nameBytes = enc.encode(f.name);
          // Local file header
          const lh = new Uint8Array(30 + nameBytes.length);
          const lv = new DataView(lh.buffer);
          lv.setUint32(0, 0x04034b50, true); // signature
          lv.setUint16(4, 20, true); // version
          lv.setUint16(8, 0, true); // compression: store
          lv.setUint16(12, 0, true); // mod time
          lv.setUint16(14, 0, true); // mod date
          const crc = _crc32(f.data);
          lv.setUint32(16, crc, true);
          lv.setUint32(20, f.data.length, true);
          lv.setUint32(24, f.data.length, true);
          lv.setUint16(26, nameBytes.length, true);
          lh.set(nameBytes, 30);
          parts.push(lh, f.data);
          // Central directory entry
          const cd = new Uint8Array(46 + nameBytes.length);
          const cv = new DataView(cd.buffer);
          cv.setUint32(0, 0x02014b50, true);
          cv.setUint16(4, 20, true);
          cv.setUint16(6, 20, true);
          cv.setUint16(12, 0, true); // compression
          cv.setUint32(16, crc, true);
          cv.setUint32(20, f.data.length, true);
          cv.setUint32(24, f.data.length, true);
          cv.setUint16(28, nameBytes.length, true);
          cv.setUint32(42, offset, true);
          cd.set(nameBytes, 46);
          centralDir.push(cd);
          offset += lh.length + f.data.length;
        }
        const cdOffset = offset;
        let cdSize = 0;
        centralDir.forEach(c => cdSize += c.length);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true);
        ev.setUint32(12, cdSize, true);
        ev.setUint32(16, cdOffset, true);
        const blob = new Blob([...parts, ...centralDir, eocd], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.docx';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) { showError(e.message); }
    });
  }

  // Print
  const printBtn = container.querySelector ? container.querySelector('#pollsterPrint') : document.getElementById('pollsterPrint');
  if (printBtn) {
    printBtn.addEventListener('click', () => { window.print(); });
  }
}

// ── CRC32 for client-side ZIP generation ──────────────────────────────────
const _crc32 = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  return data => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
})();

// ── Log Book ───────────────────────────────────────────────────────────────
let _logBookEntries = [];
async function _loadLogBook() {
  const el = document.getElementById('logBookEntries');
  if (!el) return;
  try {
    _logBookEntries = await apiGet('/api/log-book') || [];
  } catch { _logBookEntries = []; }
  if (_logBookEntries.length === 0) {
    el.innerHTML = `<em style="color:var(--text-dim)">${t('lb_empty')||'No log book entries yet.'}</em>`;
    return;
  }
  const isAdmin = state.user?.role === 'admin';
  const catIcons = {incoming:'📥',outgoing:'📤',incident:'🚨',directive:'🎯',decision:'⚖️',action:'✅',briefing:'📊',situation:'🔄',meeting:'📝',other:'📌'};
  el.innerHTML = _logBookEntries.slice().reverse().map(e => {
    const ts = new Date(e.timestamp).toLocaleString();
    const icon = catIcons[e.category] || '📌';
    const attHtml = (e.attachments && e.attachments.length) ? `<div style="margin-top:2px">${e.attachments.map(a =>
      `<a href="/api/log-book/${e.id}/attachment/${encodeURIComponent(a.stored_name)}" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none">📎 ${escHtml(a.filename)}</a>`
    ).join(' ')}</div>` : '';
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span>${icon}</span>
          <span style="font-weight:600;font-size:var(--fs-xs)">${escHtml(e.subject)}</span>
          <span style="color:var(--text-dim);font-size:10px;margin-left:4px">${escHtml(e.display_name||e.user_name)} — ${ts}</span>
        </div>
        ${isAdmin ? `<button class="btn btn-danger btn-sm" style="padding:0 4px;font-size:10px" data-action="deleteLogBookEntry" data-arg="${e.id}">×</button>` : ''}
      </div>
      ${e.body ? `<div style="margin-top:2px;white-space:pre-wrap;color:var(--text-dim)">${escHtml(e.body)}</div>` : ''}
      ${attHtml}
    </div>`;
  }).join('');
  _bindActions(el);
}

async function addLogBookEntry() {
  const category = document.getElementById('lbCategory')?.value || 'other';
  const subject = document.getElementById('lbSubject')?.value?.trim();
  const body = document.getElementById('lbBody')?.value?.trim() || '';
  if (!subject) { showError(t('lb_subject_required')||'Subject is required'); return; }
  const res = await apiPost('/api/log-book', {category, subject, body});
  if (res.ok) {
    const created = await res.json().catch(() => null);
    // Upload attachments
    const fileInput = document.getElementById('lbAttachFile');
    if (created && fileInput?.files?.length) {
      for (const f of fileInput.files) {
        const fd = new FormData();
        fd.append('file', f);
        await api('POST', `/api/log-book/${created.id}/attachment`, fd);
      }
      fileInput.value = '';
    }
    document.getElementById('lbSubject').value = '';
    document.getElementById('lbBody').value = '';
    showNotification('success', t('lb_added')||'Log book entry added');
    await _loadLogBook();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to add entry');
  }
}

async function deleteLogBookEntry(id) {
  if (!confirm(t('lb_delete_confirm')||'Delete this log book entry?')) return;
  const res = await api('DELETE', `/api/log-book/${id}`);
  if (res.ok) {
    showNotification('success', t('lb_deleted')||'Entry deleted');
    await _loadLogBook();
  }
}

// ── Log Book modal (accessible from Tools) ──
function openLogBookModal() {
  const cats = [
    {v:'incoming',l:t('lb_incoming')||'Incoming matter'},
    {v:'outgoing',l:t('lb_outgoing')||'Outgoing matter'},
    {v:'incident',l:t('lb_incident')||'Special incident'},
    {v:'directive',l:t('lb_directive')||'Directive'},
    {v:'decision',l:t('lb_decision')||'Decision'},
    {v:'action',l:t('lb_action')||'Action taken'},
    {v:'briefing',l:t('lb_briefing')||'Briefing content'},
    {v:'situation',l:t('lb_situation')||'Situation change'},
    {v:'logistics',l:t('lb_logistics')||'Logistics'},
    {v:'meeting',l:t('lb_meeting')||'Meeting protocol'},
    {v:'other',l:t('lb_other')||'Other'}
  ].filter(c => !(c.v === 'decision' && state.preferences && state.preferences.logbook_hide_decisions));
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:700px">
      <div class="modal-header">
        <h3>📖 ${t('tab_log_book')||'Log Book'}</h3>
        <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6;margin-right:8px" data-action="openDetachedLogBook" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:8px">
          <select id="lbCategory" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
            ${cats.map(c=>`<option value="${c.v}">${c.l}</option>`).join('')}
          </select>
          <input type="text" id="lbSubject" placeholder="${t('lb_subject')||'Subject'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
          <textarea id="lbBody" rows="2" placeholder="${t('lb_body')||'Details (optional)'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);resize:vertical;margin-bottom:4px"></textarea>
          <div style="display:flex;gap:6px;align-items:center">
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">
              📎 <input type="file" id="lbAttachFile" style="max-width:120px;font-size:10px" multiple>
            </label>
            <span style="flex:1"></span>
            <button class="btn btn-primary btn-sm" data-action="addLogBookEntry">${t('btn_add')||'Add'}</button>
          </div>
        </div>
        <div id="logBookEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  _loadLogBook();
}

// Detach sidebar into separate window
let _detachedSidebarWin = null;
function detachSidebar() {
  // If on resources tab, open standalone resources popup (CSP-safe)
  if (state.sidebarTab === 'resources') {
    openDetachedResources();
    return;
  }
  // If on references tab, open standalone references popup
  if (state.sidebarTab === 'references') {
    openDetachedReferences();
    return;
  }
  // If on tools tab, open standalone tools popup
  if (state.sidebarTab === 'tools') {
    openDetachedTools();
    return;
  }
  if (_detachedSidebarWin && !_detachedSidebarWin.closed) {
    _detachedSidebarWin.focus();
    return;
  }
  const sidebar = document.getElementById('sidebar');
  // Save sidebar content BEFORE hiding (so innerHTML is populated)
  const sidebarHTML = sidebar.innerHTML;
  sidebar.classList.add('hidden');
  const w = window.open('', 'tidslinjal-sidebar',
    'width=350,height=700,menubar=no,toolbar=no,scrollbars=yes');
  if (!w) { sidebar.classList.remove('hidden'); return; }
  _detachedSidebarWin = w;
  const theme = document.body.className || '';
  const reattachLabel = t('btn_reattach_menu') || 'Reattach Menu';
  // Write document shell first (no dynamic content in template)
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Menu</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    '.detached-sidebar{display:flex;flex-direction:column;height:calc(100vh - 38px);overflow-y:auto}' +
    '.detached-sidebar .sidebar-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap}' +
    '.detached-sidebar .sidebar-content{flex:1;overflow-y:auto;padding:12px}' +
    '.reattach-bar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg2);border-bottom:1px solid var(--border)}' +
    '.reattach-bar button{background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<div class="reattach-bar">' +
    '<button id="btnReattach">\u2B05 ' + escHtml(reattachLabel) + '</button>' +
    '<span style="flex:1"></span>' +
    '<span style="font-size:11px;color:var(--text-dim)">Tidslinjal Menu</span>' +
    '</div>' +
    '<div class="detached-sidebar" id="detachedWrap"></div>' +
    '</body></html>');
  w.document.close();

  // Inject sidebar content safely via DOM (not template literal)
  const wrapEl = w.document.getElementById('detachedWrap');
  if (wrapEl) wrapEl.innerHTML = sidebarHTML;

  // Bind reattach button
  w.document.getElementById('btnReattach').onclick = function() {
    try { window._reattachSidebar(); } catch(e) {}
    w.close();
  };

  // Sync + rebind function
  function syncContent() {
    try {
      if (!w || w.closed) return;
      const wrap = w.document.getElementById('detachedWrap');
      if (!wrap) return;
      // Re-render sidebar in opener
      try { renderSidebar(); } catch(e) {}
      const srcSidebar = document.getElementById('sidebar');
      if (srcSidebar) {
        wrap.innerHTML = srcSidebar.innerHTML;
      }
      // Re-bind tab clicks to talk to opener
      wrap.querySelectorAll('.sidebar-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          try { state.sidebarTab = tab.dataset.tab; renderSidebar(); } catch(e) {}
          setTimeout(syncContent, 100);
        });
      });
      // Re-bind all data-action buttons
      wrap.querySelectorAll('[data-action]').forEach(function(el) {
        el.addEventListener('click', function(evt) {
          try {
            window.focus();
            var fn = el.dataset.action;
            var arg = el.dataset.arg;
            if (typeof window[fn] === 'function') window[fn](arg === 'null' ? null : arg);
          } catch(e) {}
        });
      });
      // Re-bind sub-tab buttons
      wrap.querySelectorAll('[data-res-sub]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          try {
            var el = wrap.closest('[data-resSubTab]') || wrap;
            el.dataset.resSubTab = btn.dataset.resSub;
            renderSidebar();
            setTimeout(syncContent, 100);
          } catch(e) {}
        });
      });
      wrap.querySelectorAll('[data-log-sub]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          try {
            var el = wrap.closest('[data-logSubTab]') || wrap;
            el.dataset.logSubTab = btn.dataset.logSub;
            renderSidebar();
            setTimeout(syncContent, 100);
          } catch(e) {}
        });
      });
      // Re-bind selects and inputs to proxy change events
      wrap.querySelectorAll('select[data-action-change]').forEach(function(sel) {
        sel.addEventListener('change', function() {
          try {
            var fn = sel.dataset.actionChange;
            if (typeof window[fn] === 'function') window[fn](sel.value);
          } catch(e) {}
        });
      });
    } catch(e) {}
  }
  syncContent();
  var _sidebarSyncInterval = setInterval(function() {
    if (!w || w.closed) {
      clearInterval(_sidebarSyncInterval);
      _reattachSidebar();
      return;
    }
    syncContent();
  }, 2000);
  w.addEventListener('beforeunload', function() {
    try { _reattachSidebar(); } catch(e) {}
  });
}

function _reattachSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('hidden');
  _detachedSidebarWin = null;
}

function renderSidebar() {
  const tab  = state.sidebarTab;
  const el   = document.getElementById('sidebarContent');
  const lang = state.preferences.language || 'en';

  if (tab === 'legend') {
    const activeLayers = state.layers.filter(l => isLayerActive(l.id));
    const isSynthActive = synthActive ? synthActive() : false;
    const lastTemplate = (state.exercise && state.exercise.last_template) || state.lastAppliedTemplate || null;
    const langLabel = {en:'English 🇬🇧', sv:'Svenska 🇸🇪', fr:'Français 🇫🇷', fi:'Suomi 🇫🇮', da:'Dansk 🇩🇰'}[lang] || lang;
    const vInfo = state._versionInfo || {};
    const gbStatus = state._gradualBackupStatus || null;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('event_types_title')}
          ${state.user&&hasRole2(state.user.role,'readwrite') ? `<button class="btn btn-primary btn-sm" data-action="openEtypeModal" data-arg="null">${t('event_types_add')}</button>` : ''}
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
              instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌', pause:'⏸' };
            const etIcon = et.icon || _builtinTypeIcons[et.key] || '';
            return `<div class="legend-item${hidden?' hidden-type':''}" data-action="toggleType" data-arg="${et.key}">
              <div class="legend-swatch" style="background:${cbSafeColor(et.color)}"></div>
              ${etIcon ? `<span class="legend-type-icon">${etIcon}</span>` : ''}
              <span class="legend-label">${escHtml(lbl)}</span>
              <span class="legend-eye">${hidden?'👁‍🗨':'👁'}</span>
              ${state.user&&(state.user.role==='admin'||(et.created_by&&et.created_by===state.user.id)) ?
                `<button class="btn btn-ghost btn-icon" style="font-size:11px;padding:0 3px" data-edit-etype='${escAttr(JSON.stringify(et))}' data-stop-prop-only>✏️</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('legend_status')||'Event Status'}</div>
        <div class="legend-list">
          ${[
            {key:'planned',   color:'var(--text-dim)',  label: t('status_planned')||'Planned'},
            {key:'active',    color:'var(--accent)',    label: t('status_active')||'Active'},
            {key:'completed', color:'var(--green)',     label: t('status_completed')||'Completed'},
            {key:'rejected',  color:'var(--red)',       label: t('status_rejected')||'Rejected'},
            {key:'cancelled', color:'var(--red)',       label: t('status_cancelled')||'Cancelled'}
          ].map(s => `<div class="legend-item" style="cursor:default">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
            <span class="legend-label">${s.label}</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('info_range')}</div>
        <div style="font-size:var(--fs-sm);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
          <span style="color:var(--text-dim)">${t('info_from')}:</span><span>${fmtDateTime(state.startDate)}</span>
          <span style="color:var(--text-dim)">${t('info_to')}:</span><span>${fmtDateTime(addDays(state.startDate, getRangeDays()-1))}</span>
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
          const roleOrder = ['admin','staffofficer_full','staffofficer','oplead','teamlead','teammember','readwrite','reporter','read','observer'];
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
          <span style="color:var(--text-dim)">${t('info_uptime')||'Server Uptime'}:</span><span>${vInfo.uptime || '—'}</span>
          <span style="color:var(--text-dim)">${t('info_tool_started')||'Tool Started'}:</span><span>${vInfo.started_at ? fmtDateTime(new Date(vInfo.started_at)) : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_server_booted')||'Server Booted'}:</span><span>${vInfo.server_booted_at ? fmtDateTime(new Date(vInfo.server_booted_at)) : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_connection')||'Connection'}:</span><span>${window._offlineModeForced ? '<span style="color:#f59e0b">● ' + (t('info_forced_offline')||'Forced Offline') + '</span>' : navigator.onLine ? '<span style="color:#22c55e">● ' + (t('info_online')||'Online') + '</span>' : '<span style="color:var(--red,#E74C3C)">● ' + (t('info_offline')||'Offline') + '</span>'}</span>
          ${gbStatus !== null ? `<span style="color:var(--text-dim)">Gradual backup:</span><span>${gbStatus.enabled ? `<span style="color:#22c55e">✓ Active</span> (every ${gbStatus.interval_minutes||15} min, ${gbStatus.snapshot_count||0} snapshots)` : '<span style="color:var(--text-dim)">— Disabled</span>'}</span>` : ''}
        </div>
      </div>
      ${(() => {
        // Database statistics panel
        const db = state._dbStats || null;
        if (db) {
          const sizeStr = db.size_bytes < 1024 ? db.size_bytes + ' B'
            : db.size_bytes < 1048576 ? (db.size_bytes/1024).toFixed(1) + ' KB'
            : (db.size_bytes/1048576).toFixed(1) + ' MB';
          const createdStr = db.created_at ? fmtDateTime(new Date(db.created_at)) : '—';
          return `<div class="sidebar-section">
            <div class="sidebar-section-title">💾 ${t('legend_database')||'Database'}</div>
            <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
              <span style="color:var(--text-dim)">${t('legend_db_created')||'Created'}:</span><span>${createdStr}</span>
              <span style="color:var(--text-dim)">${t('legend_db_size')||'Size'}:</span><span>${sizeStr}</span>
              <span style="color:var(--text-dim)">${t('info_events')||'Events'}:</span><span>${db.events||0}</span>
              <span style="color:var(--text-dim)">${t('info_users')||'Users'}:</span><span>${db.users||0}</span>
              <span style="color:var(--text-dim)">${t('info_groups')||'Groups'}:</span><span>${db.groups||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_layers')||'Layers'}:</span><span>${db.layers||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_alarms')||'Alarms'}:</span><span>${db.alarms||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_phases')||'Phases'}:</span><span>${db.phases||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_audit')||'Audit entries'}:</span><span>${db.audit_entries||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_attachments')||'Attachments'}:</span><span>${db.attachments||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_comments')||'Comments'}:</span><span>${db.comments||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_templates')||'Templates'}:</span><span>${db.templates||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_polls')||'Polls'}:</span><span>${db.polls||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_log_book')||'Log book'}:</span><span>${db.log_book||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_decisions')||'Decisions'}:</span><span>${db.decision_log||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_locations')||'Map locations'}:</span><span>${db.map_locations||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_rooms')||'Rooms'}:</span><span>${db.rooms||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_notifications')||'Notifications'}:</span><span>${db.notifications||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_references')||'Reference docs'}:</span><span>${db.reference_docs||0}</span>
            </div>
          </div>`;
        }
        return '';
      })()}
      ${(() => {
        // Test statistics panel — admin only
        if (state.user && state.user.role === 'admin') {
          const ts = state._testStats || null;
          if (ts) {
            return `<div class="sidebar-section">
              <div class="sidebar-section-title">🧪 ${t('legend_test_stats')||'Test Statistics'}</div>
              <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
                <span style="color:var(--text-dim)">${t('legend_test_cases')||'Test cases'}:</span><span>${ts.test_cases || 0}</span>
                <span style="color:var(--text-dim)">${t('legend_unit_tests')||'Unit tests'}:</span><span>${ts.unit_tests || 0}</span>
                <span style="color:var(--text-dim)">${t('legend_tests_run')||'Tests performed'}:</span><span>${ts.tests_run || 0}</span>
              </div>
            </div>`;
          }
        }
        return '';
      })()}
      ${(() => {
        // Integration status panel — admin only
        const st = (state.user && state.user.role === 'admin') ? (state._integrationStatus || null) : null;
        if (!st) return '';
        const pill = (ok, label, detail) => {
          const col = ok ? '#22c55e' : '#6b7280';
          return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border)">
            <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></span>
            <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text);min-width:80px">${label}</span>
            <span style="font-size:10px;color:var(--text-dim);word-break:break-all">${escHtml(detail||'')}</span>
          </div>`;
        };
        const sso = st.sso || {};
        const tls = st.tls || {};
        const sys = st.syslog || {};
        const smtp = st.smtp || {};
        const mm = st.mattermost || {};
        const ak = st.api_keys || {};
        return `
        <div class="sidebar-section">
          <div class="sidebar-section-title">🔌 ${t('info_integrations')||'Integrations'}</div>
          <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;padding:0 4px">
            ${pill(sso.active, 'SSO / OIDC', sso.active ? (sso.issuer||'active') + (sso.exclusive?' · excl.':'') : sso.enabled ? 'configured, inactive' : 'disabled')}
            ${pill(tls.configured, 'TLS', tls.configured ? (tls.cert_file||'cert set') : 'not configured')}
            ${pill(sys.enabled, 'Syslog', sys.enabled ? `${escHtml(sys.host||'')}:${sys.port||514} (${sys.transport||'udp'}, ${sys.format||'classic'})` : 'disabled')}
            ${pill(smtp.enabled, 'SMTP/Mail', smtp.enabled ? `${escHtml(smtp.host||'')}:${smtp.port||587} ${smtp.tls_mode||''}` : 'disabled')}
            ${pill((mm.mattermost_users||0)>0, 'Mattermost', (mm.webhook_users||0)>0 ? `${mm.webhook_users} webhook user${mm.webhook_users!==1?'s':''}, ${mm.mattermost_users} Mattermost` : 'no webhooks')}
            ${pill((ak.count||0)>0, 'API Keys', `${ak.count||0} key${(ak.count||0)!==1?'s':''} active`)}
          </div>
        </div>`;
      })()}
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

    // Collect scheduled (queued) polls and PRCs to show in alarms
    let queuedHtml = '';
    const _fetchQueued = async () => {
      let items = [];
      // Scheduled polls
      try {
        const pollRes = await api('GET', '/api/polls');
        if (pollRes.ok) {
          const polls = await pollRes.json();
          (polls || []).forEach(p => {
            if (p.status === 'scheduled' && p.scheduled_at) {
              items.push({ type: 'poll', title: p.title, time: p.scheduled_at, id: p.id });
            }
          });
        }
      } catch {}
      // Scheduled PRCs
      try {
        const prcs = await apiGet('/api/person-ready-check');
        (prcs || []).forEach(c => {
          if (c.scheduled_at && !c.fired && new Date(c.scheduled_at) > new Date()) {
            items.push({ type: 'prc', title: (t('prc_ready_check')||'Ready Check') + ' #' + c.id, time: c.scheduled_at, id: c.id });
          }
        });
      } catch {}
      const queueEl = document.getElementById('alarmQueuedItems');
      if (!queueEl) return;
      if (items.length === 0) {
        queueEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-xs)">${t('alarms_no_queued')||'No queued items.'}</div>`;
        return;
      }
      items.sort((a, b) => new Date(a.time) - new Date(b.time));
      queueEl.innerHTML = items.map(it => `
        <div class="alarm-item" style="border-left:3px solid ${it.type === 'poll' ? 'var(--accent)' : '#F39C12'}">
          <div class="alarm-title">${it.type === 'poll' ? '📊' : '🙋'} ${escHtml(it.title)}</div>
          <div class="alarm-meta">⏰ ${t('prc_scheduled_for')||'Scheduled for'}: ${fmtDateTime(new Date(it.time))}</div>
        </div>`).join('');
    };

    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('tab_alarms')}</div>
        ${active.length === 0
          ? `<div style="color:var(--text-dim);font-size:var(--fs-sm);white-space:pre-line">${t('alarms_none')}</div>`
          : `<div class="alarm-list">${active.map(a => `
            <div class="alarm-item">
              <div class="alarm-title">${escHtml(a.event_title)}</div>
              <div class="alarm-meta">📅 ${fmtDateTime(new Date(a.event_time))}<br>🔔 ${a.lead_time>0?a.lead_time+' min before':'At event time'}</div>
              <div class="alarm-actions"><button class="btn btn-danger btn-sm" data-action="deleteAlarm" data-arg="${a.id}">${t('btn_remove')}</button></div>
            </div>`).join('')}</div>`
        }
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">⏰ ${t('alarms_queued')||'Queued Timed Items'}</div>
        <div id="alarmQueuedItems"><em style="color:var(--text-dim);font-size:var(--fs-xs)">${t('lb_loading')||'Loading…'}</em></div>
      </div>
    `;
    _fetchQueued();
  } else if (tab === 'layers') {
    const myLayers     = state.layers.filter(l => l.owner_id === state.user.id);
    const sharedLayers = state.layers.filter(l => l.owner_id !== state.user.id);
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_master')}
        </div>
        <div class="layer-list">
          <div class="layer-item${!(state.preferences.hidden_layers&&state.preferences.hidden_layers.length>0)?' active':''}" data-action="toggleAllLayers">
            <div class="layer-swatch" style="background:var(--accent)"></div>
            <span class="layer-name">${t('layers_master')}</span>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_my')}
          <button class="btn btn-primary btn-sm" data-action="openLayerModal" data-arg="null">${t('layers_add')}</button>
        </div>
        <div class="layer-list">
          ${myLayers.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No layers yet.</div>` : ''}
          ${myLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" data-action="toggleLayer" data-arg="${l.id}">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${l.visibility}</span>
              <button class="btn btn-ghost btn-icon" style="font-size:11px" data-edit-layer='${escAttr(JSON.stringify(l))}' data-stop-prop-only>✏️</button>
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
            return `<div class="layer-item${active?' active':''}" data-action="toggleLayer" data-arg="${l.id}">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${escHtml(l.owner_name||'')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  } else if (tab === 'resources' && state.user && state.user.role==='admin') {
    const canSeeLoc = userHasCapability('see_location');
    const gl = getGroupLabel();
    // Sub-tab state
    const resSubTab = el.dataset.resSubTab || 'users';
    const subBtn = (key, label, icon) =>
      `<button class="toggle-btn${resSubTab===key?' active':''}" data-res-sub="${key}">${icon} ${label}</button>`;
    // Build sub-tab bar with built-in types + custom types
    const customTypes = state._customResourceTypes || [];
    let subTabBar = `<div class="toggle-btn-group" style="margin-bottom:10px;flex-wrap:wrap">
      ${subBtn('users', t('tab_users')||'Users', '👤')}
      ${subBtn('groups', gl.plural, '👥')}
      ${subBtn('rooms', t('resource_rooms')||'Rooms', '🏠')}
      ${subBtn('buildings', t('resource_buildings')||'Buildings', '🏢')}
      ${subBtn('computers', t('resource_computer_services')||'IT Services', '💻')}
      ${subBtn('datacenters', t('resource_data_centers')||'Data Centers', '🖥')}
      ${subBtn('exercise_areas', t('resource_exercise_areas')||'Exercise Areas', '🏋')}
      ${subBtn('work_areas', t('resource_work_areas')||'Work Areas', '💼')}
      ${subBtn('rest_rooms', t('resource_rest_rooms')||'Rest Rooms', '☕')}
      ${subBtn('training_grounds', t('resource_training_grounds')||'Training Ground', '🎯')}
      ${customTypes.map(ct => subBtn('custom_'+ct.key, ct.label, ct.icon||'📦')).join('')}
      ${subBtn('resource_list', t('resource_list')||'Resource List', '📋')}
      ${subBtn('resource_plan', t('resource_plan')||'Resource Plan', '📅')}
      ${subBtn('manage_types', t('manage_resource_types')||'Manage Types', '⚙')}
      <button class="toggle-btn" data-action="openDetachedResources" title="${t('detach_window')||'Open in separate window'}" style="margin-left:auto">⧉</button>
    </div>`;
    // Load custom resource types if not cached
    if (!state._customResourceTypes) {
      apiGet('/api/custom-resource-types').then(types => {
        state._customResourceTypes = types || [];
        renderSidebar();
      });
      el.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);padding:8px">Loading…</div>`;
      return;
    }
    if (resSubTab === 'users') {
      apiGet('/api/users').then(users => {
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">
              ${t('tab_users')}
              <button class="btn btn-primary btn-sm" data-action="openUserModal" data-arg="null">${t('btn_add')}</button>
            </div>
            <div class="user-list">
              ${(users||[]).map(u => `
                <div class="user-item" style="cursor:pointer;flex-wrap:wrap${u.blocked ? ';background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25)' : ''}" data-action="openUserModal" data-arg='${escAttr(JSON.stringify(u))}' data-arg-el>
                  <div class="user-name" style="min-width:120px">
                    <div>${u.blocked ? '<span title="${t("user_blocked")||"Blocked"}" style="color:var(--red,#E74C3C)">🚫 </span>' : ''}${escHtml(u.display_name||u.username)}${u.is_oidc ? ' <span title="SSO / OIDC user" style="font-size:var(--fs-xs);background:var(--accent-muted,rgba(0,120,255,.15));color:var(--accent);border:1px solid var(--accent);border-radius:3px;padding:0 4px;vertical-align:middle;font-weight:600">SSO</span>' : ''}</div>
                    <div style="font-size:var(--fs-xs);color:var(--text-dim)">@${escHtml(u.username)}${canSeeLoc && u.location ? ' · 📍 '+escHtml(u.location) : ''}</div>
                  </div>
                  <span class="role-badge role-${u.role}">${getRoleDisplayName(u.role)}</span>
                  ${u.can_lock?'<span title="Can lock">🔒</span>':''}
                  ${(u.nato_designations && u.nato_designations.length) ? `<span style="font-size:var(--fs-sm);color:var(--accent);font-weight:600;letter-spacing:.04em">${u.nato_designations.join(' ')}</span>` : ''}
                  <div style="width:100%;display:flex;gap:10px;font-size:10px;color:var(--text-dim);margin-top:2px;padding-left:2px;flex-wrap:wrap">
                    <span title="${t('user_created_at')||'Created'}">${t('user_created_at')||'Created'}: ${u.created_at ? fmtDateTime(new Date(u.created_at)) : '—'}</span>
                    <span title="${t('user_last_login')||'Last login'}">${t('user_last_login')||'Last login'}: ${u.last_login_at ? fmtDateTime(new Date(u.last_login_at)) : '—'}</span>
                    <span title="${t('user_login_count')||'Logins'}">${t('user_login_count')||'Logins'}: ${u.login_count || 0}</span>
                  </div>
                  <button class="btn btn-ghost btn-icon" data-action="openUserModal" data-arg='${escAttr(JSON.stringify(u))}' data-arg-el data-stop-prop>✏️</button>
                </div>`).join('')}
            </div>
          </div>
          <div class="sidebar-section">
            <div class="sidebar-section-title">🛡 ${t('role_editor_title')||'Role Editor'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('role_editor_desc')||'Edit role display names and capabilities.'}</p>
            <button class="btn btn-secondary btn-sm" data-action="openRoleEditor">🛡 ${t('role_editor_title')||'Role Editor'}…</button>
          </div>`;
        _bindResSubTabs(el);
        _bindActions(el);
      });
    } else if (resSubTab === 'groups') {
      el.innerHTML = subTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span class="group-icon-badge">👥</span> ${gl.plural}
            <button class="btn btn-primary btn-sm" data-action="openGroupModal" data-arg="null">+ ${t('btn_add')||'Add'} ${gl.singular}</button>
          </div>
          <div class="group-list">
            ${state.groups.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No ${gl.plural.toLowerCase()} yet.</div>` : ''}
            ${state.groups.map(g => `
              <div class="group-item" style="cursor:pointer" data-action="openGroupModal" data-arg='${escAttr(JSON.stringify(g))}' data-arg-el>
                <div class="group-name">
                  <div>${escHtml(g.name)}</div>
                  ${g.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(g.description)}</div>` : ''}
                </div>
                <button class="btn btn-ghost btn-icon btn-sm" data-action="openMemberModal" data-arg='${escAttr(JSON.stringify(g))}' data-arg-el title="${t('groups_members')}" data-stop-prop>👥</button>
                <button class="btn btn-ghost btn-icon" data-action="openGroupModal" data-arg='${escAttr(JSON.stringify(g))}' data-arg-el title="Edit" data-stop-prop>✏️</button>
              </div>`).join('')}
          </div>
        </div>`;
      _bindResSubTabs(el);
      _bindActions(el);
    } else if (resSubTab === 'rooms' || resSubTab === 'buildings' || resSubTab === 'computers' || resSubTab === 'datacenters' || resSubTab === 'exercise_areas' || resSubTab === 'work_areas' || resSubTab === 'rest_rooms' || resSubTab === 'training_grounds' || resSubTab.startsWith('custom_')) {
      const builtinTypeMap = {rooms:'room', buildings:'building', computers:'computer_service', datacenters:'data_center', exercise_areas:'exercise_area', work_areas:'work_area', rest_rooms:'rest_room', training_grounds:'training_ground'};
      const builtinLabelMap = {rooms:t('resource_rooms')||'Rooms', buildings:t('resource_buildings')||'Buildings', computers:t('resource_computer_services')||'Computer Services', datacenters:t('resource_data_centers')||'Data Centers', exercise_areas:t('resource_exercise_areas')||'Exercise Areas', work_areas:t('resource_work_areas')||'Work Areas', rest_rooms:t('resource_rest_rooms')||'Rest Rooms', training_grounds:t('resource_training_grounds')||'Training Ground'};
      const builtinIconMap = {rooms:'🏠', buildings:'🏢', computers:'💻', datacenters:'🖥', exercise_areas:'🏋', work_areas:'💼', rest_rooms:'☕', training_grounds:'🎯'};
      let roomType, sectionLabel, sectionIcon;
      if (resSubTab.startsWith('custom_')) {
        const customKey = resSubTab.replace('custom_', '');
        const ct = customTypes.find(c => c.key === customKey);
        roomType = customKey;
        sectionLabel = ct ? ct.label : customKey;
        sectionIcon = ct ? (ct.icon||'📦') : '📦';
      } else {
        roomType = builtinTypeMap[resSubTab];
        sectionLabel = builtinLabelMap[resSubTab];
        sectionIcon = builtinIconMap[resSubTab];
      }
      apiGet('/api/rooms').then(rooms => {
        const filtered = (rooms||[]).filter(r => r.type === roomType);
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">${sectionIcon} ${sectionLabel}
              <button type="button" class="btn btn-primary btn-sm" data-action="openRoomModal" data-arg='{"type":"${roomType}"}'>${t('btn_add')||'Add'}</button>
            </div>
            ${filtered.length === 0 ? `<p style="color:var(--text-dim);font-size:var(--fs-sm)">No ${sectionLabel.toLowerCase()} yet.</p>` : ''}
            ${filtered.map(r => `
              <div style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px;cursor:pointer" data-action="openRoomModal" data-arg='${escAttr(JSON.stringify(r))}' data-arg-el>
                ${r.image_name ? `<img src="/api/rooms/${r.id}/image" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border)">` :
                  `<span style="font-size:24px;width:48px;text-align:center">${r.icon || sectionIcon}</span>`}
                <div style="flex:1;min-width:0">
                  <div style="font-size:var(--fs-sm);font-weight:600">${r.icon && !r.image_name ? r.icon+' ' : ''}${escHtml(r.name)}</div>
                  ${r.sub_type ? `<div style="font-size:var(--fs-xs);color:var(--accent);font-weight:600">${t('room_type_'+r.sub_type)||r.sub_type.replace(/_/g,' ')}</div>` : ''}
                  ${r.location ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">📍 ${escHtml(r.location)}</div>` : ''}
                  ${r.capacity ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${t('capacity')||'Capacity'}: ${r.capacity}</div>` : ''}
                  ${r.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(r.description)}</div>` : ''}
                </div>
                <button class="btn btn-ghost btn-icon btn-sm" data-action="openRoomModal" data-arg='${escAttr(JSON.stringify(r))}' data-arg-el data-stop-prop>✏️</button>
              </div>`).join('')}
          </div>`;
        _bindResSubTabs(el);
        _bindActions(el);
      });
    } else if (resSubTab === 'manage_types') {
      // Manage custom resource types
      el.innerHTML = subTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">⚙ ${t('manage_resource_types')||'Manage Resource Types'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('manage_resource_types_desc')||'Create custom resource categories. Resources of each type appear as their own tab.'}</p>
          <div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:10px">
            <label class="form-label" style="font-size:var(--fs-xs)">${t('resource_type_key')||'Key (machine name)'}</label>
            <input class="form-input" id="crtKey" placeholder="e.g. vehicle" style="margin-bottom:4px;font-size:var(--fs-sm)">
            <label class="form-label" style="font-size:var(--fs-xs)">${t('resource_type_label')||'Display Name'}</label>
            <input class="form-input" id="crtLabel" placeholder="e.g. Vehicles" style="margin-bottom:4px;font-size:var(--fs-sm)">
            <label class="form-label" style="font-size:var(--fs-xs)">${t('resource_type_icon')||'Icon (emoji)'}</label>
            <input class="form-input" id="crtIcon" placeholder="e.g. 🚗" style="margin-bottom:6px;font-size:var(--fs-sm);width:60px">
            <button class="btn btn-primary btn-sm" data-action="saveCustomResourceType">${t('btn_add')||'Add'}</button>
          </div>
          ${customTypes.length === 0 ? `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('no_custom_types')||'No custom resource types defined yet.'}</p>` : ''}
          ${customTypes.map(ct => `
            <div style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px" data-crt-id="${ct.id}">
              <span style="font-size:20px" class="crt-icon">${ct.icon||'📦'}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--fs-sm);font-weight:600" class="crt-label">${escHtml(ct.label)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-dim)">key: ${escHtml(ct.key)}</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-crt-edit="${ct.id}" data-crt-key="${escAttr(ct.key)}" data-crt-label="${escAttr(ct.label)}" data-crt-icon="${escAttr(ct.icon||'')}" style="padding:2px 8px;font-size:var(--fs-xs)" title="${t('btn_edit')||'Edit'}">✏️</button>
              <button class="btn btn-danger btn-sm" data-action="deleteCustomResourceType" data-arg="${ct.id}" style="padding:2px 8px;font-size:var(--fs-xs)">✕</button>
            </div>`).join('')}
        </div>`;
      _bindResSubTabs(el);
      _bindActions(el);
      // Bind edit buttons for custom resource types
      el.querySelectorAll('[data-crt-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const keyInput = el.querySelector('#crtKey');
          const labelInput = el.querySelector('#crtLabel');
          const iconInput = el.querySelector('#crtIcon');
          const addBtn = el.querySelector('[data-action="saveCustomResourceType"]');
          if (keyInput) { keyInput.value = btn.dataset.crtKey; keyInput.readOnly = true; }
          if (labelInput) labelInput.value = btn.dataset.crtLabel;
          if (iconInput) iconInput.value = btn.dataset.crtIcon;
          if (addBtn) addBtn.textContent = t('btn_save') || 'Save';
          keyInput?.scrollIntoView({behavior:'smooth', block:'nearest'});
        });
      });
    } else if (resSubTab === 'resource_list') {
      // Resource list: shows all users, groups, and rooms in a combined view
      const canEdit = hasRole2(state.user.role, 'teamlead');
      Promise.all([apiGet('/api/users'), apiGet('/api/rooms').catch(()=>[])]).then(([users, rooms]) => {
        const allResources = [];
        (users||[]).forEach(u => allResources.push({type:'user', name: u.display_name||u.username, role: u.role, detail: '@'+u.username}));
        state.groups.forEach(g => allResources.push({type:'group', name: g.name, detail: g.description||''}));
        const typeIcons = {room:'🏠', building:'🏢', computer_service:'💻', data_center:'🖥', exercise_area:'🏋', work_area:'💼', rest_room:'☕', training_ground:'🎯'};
        (rooms||[]).forEach(r => allResources.push({type: r.type||'room', name: r.name, detail: (r.location||'') + (r.capacity ? ' (cap:'+r.capacity+')' : ''), icon: typeIcons[r.type]||'🏠', _roomData: r}));
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">📋 ${t('resource_list')||'Resource List'}</div>
            <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
              <thead><tr style="background:var(--bg3)">
                <th style="padding:4px 8px;text-align:left">${t('resource_type')||'Type'}</th>
                <th style="padding:4px 8px;text-align:left">${t('resource_name')||'Name'}</th>
                <th style="padding:4px 8px;text-align:left">${t('resource_detail')||'Detail'}</th>
                ${canEdit ? `<th style="padding:4px 8px;text-align:center;width:70px">${t('actions')||'Actions'}</th>` : ''}
              </tr></thead><tbody>
              ${allResources.map(r => `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:4px 8px">${r.icon||(r.type==='user'?'👤':'<span class="group-icon-badge">👥</span>')} ${({user:t('tab_users')||'User',group:t('tab_groups')||'Group',room:t('resource_rooms')||'Room',building:t('resource_buildings')||'Building',computer_service:t('resource_computer_services')||'IT Service',data_center:t('resource_data_centers')||'Data Center'})[r.type]||r.type}</td>
                <td style="padding:4px 8px">${escHtml(r.name)}</td>
                <td style="padding:4px 8px;color:var(--text-dim)">${escHtml(r.detail)}${r.role?' <span class="role-badge role-'+r.role+'">'+getRoleDisplayName(r.role)+'</span>':''}</td>
                ${canEdit && r._roomData ? `<td style="padding:4px 8px;text-align:center;white-space:nowrap">
                  <button class="btn btn-ghost btn-icon btn-sm" data-rl-edit='${escAttr(JSON.stringify(r._roomData))}' title="${t('btn_edit')||'Edit'}">✏️</button>
                  <button class="btn btn-ghost btn-icon btn-sm" data-rl-delete="${r._roomData.id}" title="${t('btn_delete')||'Delete'}" style="color:var(--danger)">🗑</button>
                </td>` : (canEdit ? '<td></td>' : '')}
              </tr>`).join('')}
              </tbody></table>
          </div>`;
        _bindResSubTabs(el);
        // Bind edit/delete actions for resources
        if (canEdit) {
          el.querySelectorAll('[data-rl-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
              const roomData = JSON.parse(btn.dataset.rlEdit);
              openRoomModal(roomData);
            });
          });
          el.querySelectorAll('[data-rl-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(t('confirm_delete_resource')||'Delete this resource?')) return;
              try {
                const res = await api('DELETE', '/api/rooms/' + btn.dataset.rlDelete, null);
                if (res.ok) {
                  showNotification('success', t('resource_deleted')||'Resource deleted');
                  renderSidebar();
                } else {
                  showError(t('resource_delete_failed')||'Failed to delete resource');
                }
              } catch (e) { showError(e.message); }
            });
          });
        }
      });
    } else if (resSubTab === 'resource_plan') {
      // Resource plan: shows who is assigned to what events
      apiGet('/api/users').then(users => {
        const evByUser = {};
        (state.events||[]).forEach(ev => {
          const key = ev.participant || ev.user_name || 'Unassigned';
          if (!evByUser[key]) evByUser[key] = [];
          evByUser[key].push(ev);
        });
        const userNames = Object.keys(evByUser).sort();
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">📅 ${t('resource_plan')||'Resource Plan'}</div>
            ${userNames.length === 0 ? '<p style="color:var(--text-dim);font-size:var(--fs-sm)">No event assignments found.</p>' : ''}
            ${userNames.map(name => `
              <div style="margin-bottom:10px">
                <div style="font-weight:600;font-size:var(--fs-sm);margin-bottom:4px">👤 ${escHtml(name)} <span style="color:var(--text-dim);font-weight:400">(${evByUser[name].length})</span></div>
                ${evByUser[name].sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).slice(0,10).map(ev => `
                  <div style="font-size:var(--fs-xs);padding:2px 0 2px 12px;color:var(--text-dim)">
                    ${fmtDateTime(new Date(ev.start_time))} — ${escHtml(ev.title)}
                  </div>`).join('')}
              </div>`).join('')}
          </div>`;
        _bindResSubTabs(el);
      });
    }
  } else if (tab === 'logs' && state.user && hasRole2(state.user.role, 'teamlead')) {
    const logSub = el.dataset.logSubTab || 'decision';
    const logSubBtn = (key, label) =>
      `<button class="toggle-btn${logSub===key?' active':''}" data-log-sub="${key}">${label}</button>`;
    const logTabBar = `<div class="toggle-btn-group" style="margin-bottom:10px">
      ${logSubBtn('decision', t('decisions_title')||'Decisions')}
      ${logSubBtn('logbook', t('tab_log_book')||'Log Book')}
      ${logSubBtn('checklists', t('checklist_logs')||'Checklist Log')}
      ${logSubBtn('audit', t('tab_audit_log')||'Audit Log')}
      ${logSubBtn('eventlog', t('tab_event_log')||'Event Log')}
      ${logSubBtn('pollster', t('tab_pollster_log')||'Pollster Log')}
    </div>`;
    if (logSub === 'decision') {
      el.innerHTML = logTabBar + `<div class="sidebar-section">
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="openDecisionLogModal">⚖ ${t('decisions_title')||'Decisions'}</button>
          <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="detachDecisionLog">⧉ ${t('detach_window')||'Detach Window'}</button>
        </div>
      </div>`;
      _bindLogSubTabs(el);
    } else if (logSub === 'audit') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">${t('tab_audit_log')||'Audit Log'}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <input type="text" id="auditSearch" placeholder="🔍 Search…" style="flex:1;min-width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="oninput">
            <select id="auditFilterAction" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
              <option value="">${t('audit_all_actions')||'All actions'}</option>
              <option value="created">${t('audit_created')||'Created'}</option>
              <option value="updated">${t('audit_updated')||'Updated'}</option>
              <option value="deleted">${t('audit_deleted')||'Deleted'}</option>
              <option value="status_changed">${t('audit_status_changed')||'Status Changed'}</option>
              <option value="login">${t('audit_login')||'Login'}</option>
              <option value="login_failed">${t('audit_login_failed')||'Login Failed'}</option>
              <option value="login_blocked">${t('audit_login_blocked')||'Login Blocked'}</option>
              <option value="blocked">${t('audit_user_blocked')||'User Blocked'}</option>
              <option value="unblocked">${t('audit_user_unblocked')||'User Unblocked'}</option>
              <option value="reset">${t('audit_reset')||'Reset'}</option>
            </select>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
            <input type="date" id="auditDateFrom" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
            <span style="color:var(--text-dim);font-size:var(--fs-xs)">–</span>
            <input type="date" id="auditDateTo" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="csv" title="Export to CSV">⬇ CSV</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="json" title="Export to JSON">⬇ JSON</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="rtf" title="Export to RTF">⬇ RTF</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="docx" title="Export to DOCX">⬇ DOCX</button>
          </div>
          <div id="auditLog" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">Loading…</em></div>
        </div>`;
      _bindLogSubTabs(el);
      refreshAuditLog();
    } else if (logSub === 'eventlog') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">${t('tab_event_log')||'Event Log'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">External events received via pub/sub or webhook.</p>
          <div id="eventLogEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('event_log_empty')||'No external events received yet.'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _loadEventLog();
    } else if (logSub === 'logbook') {
      const cats = [
        {v:'incoming',l:t('lb_incoming')||'Incoming matter'},
        {v:'outgoing',l:t('lb_outgoing')||'Outgoing matter'},
        {v:'incident',l:t('lb_incident')||'Special incident'},
        {v:'directive',l:t('lb_directive')||'Directive'},
        {v:'decision',l:t('lb_decision')||'Decision'},
        {v:'action',l:t('lb_action')||'Action taken'},
        {v:'briefing',l:t('lb_briefing')||'Briefing content'},
        {v:'situation',l:t('lb_situation')||'Situation change'},
        {v:'logistics',l:t('lb_logistics')||'Logistics'},
        {v:'meeting',l:t('lb_meeting')||'Meeting protocol'},
        {v:'other',l:t('lb_other')||'Other'}
      ].filter(c => !(c.v === 'decision' && state.preferences && state.preferences.logbook_hide_decisions));
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">📖 ${t('tab_log_book')||'Log Book'}
            <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6;margin-left:auto" data-action="openDetachedLogBook" title="${t('btn_detach')||'Detach to window'}">⧉</button>
          </div>
          <div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:8px">
            <select id="lbCategory" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
              ${cats.map(c=>`<option value="${c.v}">${c.l}</option>`).join('')}
            </select>
            <input type="text" id="lbSubject" placeholder="${t('lb_subject')||'Subject'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
            <textarea id="lbBody" rows="2" placeholder="${t('lb_body')||'Details (optional)'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);resize:vertical;margin-bottom:4px"></textarea>
            <div style="display:flex;gap:6px;align-items:center">
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">
                📎 <input type="file" id="lbAttachFile" style="max-width:120px;font-size:10px" multiple>
              </label>
              <span style="flex:1"></span>
              <button class="btn btn-primary btn-sm" data-action="addLogBookEntry">${t('btn_add')||'Add'}</button>
            </div>
          </div>
          <div id="logBookEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _bindActions(el);
      _loadLogBook();
    } else if (logSub === 'checklists') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">📋 ${t('checklist_logs')||'Checklist Log'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('checklist_logs_desc')||'All completed checklists with details and timestamps.'}</p>
          <div id="checklistLogEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _loadChecklistLog();
    } else if (logSub === 'pollster') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">📊 ${t('pollster_log_title')||'Pollster Log'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('pollster_log_desc')||'View, search, and export poll results.'}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <input type="text" id="pollsterSearch" placeholder="🔍 ${t('search')||'Search'}…" style="flex:1;min-width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
            <button class="btn btn-secondary btn-sm" id="pollsterExportCSV" title="Export to CSV">⬇ CSV</button>
            <button class="btn btn-secondary btn-sm" id="pollsterExportJSON" title="Export to JSON">⬇ JSON</button>
            <button class="btn btn-secondary btn-sm" id="pollsterExportRTF" title="Export to RTF">⬇ RTF</button>
            <button class="btn btn-secondary btn-sm" id="pollsterExportDOCX" title="Export to DOCX">⬇ DOCX</button>
            <button class="btn btn-secondary btn-sm" id="pollsterPrint" title="Print">🖨</button>
          </div>
          <div id="pollsterLogEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _loadPollsterLog(el);
    }
  } else if (tab === 'phases' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('tab_phases')||'Exercise Phases'}
          <button class="btn btn-primary btn-sm" data-action="openPhaseModal" data-arg="null">${t('btn_add')||'+ Add'}</button>
        </div>
        <div class="phase-list">
          ${state.phases.length === 0
            ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('phases_none')||'No phases defined.'}</div>`
            : state.phases.sort((a,b)=>a.order-b.order).map(ph => {
              const canEdit = state.user && (hasRole2(state.user.role,'oplead') || ph.created_by === state.user.id);
              return `<div class="phase-item" style="border-left:4px solid ${ph.color};padding:6px 8px;margin-bottom:6px;background:var(--bg2);border-radius:var(--radius);${canEdit?'cursor:pointer':'cursor:default'}" ${canEdit?`data-action="openPhaseModal" data-arg='${escAttr(JSON.stringify(ph))}' data-arg-el`:''}>
                <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text)">${escHtml(ph.name)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-dim)">${fmtDateTime(new Date(ph.start_time))} – ${fmtDateTime(new Date(ph.end_time))}</div>
                ${canEdit ? `<div style="display:flex;gap:4px;margin-top:4px" data-stop-prop-only>
                  <button class="btn btn-ghost btn-sm" data-action="openPhaseModal" data-arg='${escAttr(JSON.stringify(ph))}' data-arg-el>✏️</button>
                  <button class="btn btn-danger btn-sm" data-action="deletePhase" data-arg="${ph.id}">✕</button>
                </div>` : ''}
              </div>`;
            }).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'audit' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('tab_audit')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <input type="text" id="auditSearch" placeholder="🔍 Search…" style="flex:1;min-width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="oninput">
          <select id="auditFilterAction" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
            <option value="">${t('audit_all_actions')||'All actions'}</option>
            <option value="created">${t('audit_created')||'Created'}</option>
            <option value="updated">${t('audit_updated')||'Updated'}</option>
            <option value="deleted">${t('audit_deleted')||'Deleted'}</option>
            <option value="status_changed">${t('audit_status_changed')||'Status Changed'}</option>
            <option value="login">${t('audit_login')||'Login'}</option>
            <option value="login_failed">${t('audit_login_failed')||'Login Failed'}</option>
            <option value="login_blocked">${t('audit_login_blocked')||'Login Blocked'}</option>
            <option value="blocked">${t('audit_user_blocked')||'User Blocked'}</option>
            <option value="unblocked">${t('audit_user_unblocked')||'User Unblocked'}</option>
            <option value="reset">${t('audit_reset')||'Reset'}</option>
          </select>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
          <input type="date" id="auditDateFrom" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
          <span style="color:var(--text-dim);font-size:var(--fs-xs)">–</span>
          <input type="date" id="auditDateTo" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
          <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="csv" title="Export to CSV">⬇ CSV</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="json" title="Export to JSON">⬇ JSON</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="rtf" title="Export to RTF">⬇ RTF</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="docx" title="Export to DOCX">⬇ DOCX</button>
        </div>
        <div id="auditLog" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">Loading…</em></div>
      </div>`;
    refreshAuditLog();
  } else if (tab === 'integrations' && state.user && state.user.role === 'admin') {
    const p = state.preferences;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔔 ${t('settings_webhook')||'Notifications / Webhook'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure a webhook to receive real-time alarm notifications from Tidslinjal.
          When an alarm fires, a JSON payload is POST-ed to this URL. Changes are audited.
        </p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)" title="Choose the payload format that matches your target service">
            Format
            <span style="opacity:.55;font-style:italic;margin-left:4px">— how the notification is structured</span>
          </label>
          <select id="prefWebhookType" style="width:100%;margin-bottom:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)"
            title="Generic JSON: raw payload with all alarm fields. Mattermost/Slack: formatted text message compatible with Mattermost and Slack incoming webhooks.">
            <option value="generic"${p.webhook_type==='generic'||!p.webhook_type?' selected':''}>Generic JSON</option>
            <option value="mattermost"${p.webhook_type==='mattermost'?' selected':''}>Mattermost / Slack</option>
          </select>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)" title="The URL that will receive the notification POST request">
            Webhook URL
          </label>
          <input type="url" id="prefWebhookURL" placeholder="https://…/webhook" value="${escHtml(p.webhook_url||'')}"
            title="Paste the full HTTPS URL of your webhook endpoint. It must respond with HTTP 2xx to acknowledge receipt."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveWebhookPref" title="Save the webhook URL and format. Changes take effect immediately.">${t('btn_save')}</button>
          <button class="btn btn-secondary btn-sm" data-action="testWebhook" title="Send a test notification to the configured URL and check if it responds correctly.">${t('settings_webhook_test')}</button>
        </div>
      </div>

      <div class="sidebar-section" id="oidcSettingsSection">
        <div class="sidebar-section-title">🔐 ${t('settings_oidc')||'Single Sign-On (OIDC)'}</div>

        <!-- Status bar -->
        <div id="oidcStatusBar" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;margin-bottom:10px;background:var(--bg3);border:1px solid var(--border)">
          <span id="oidcStatusDot" style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#888"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--fs-xs);font-weight:600" id="oidcStatusLabel">Checking…</div>
            <div style="font-size:10px;color:var(--text-dim);word-break:break-all" id="oidcStatusDetail"></div>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="runOIDCTest"
            title="Run a live connectivity check: verifies discovery document, credentials, and route registration."
            style="flex-shrink:0;white-space:nowrap">🔍 Test</button>
        </div>

        <!-- OIDC test result panel -->
        <div id="oidcTestResult" style="display:none;margin-bottom:10px;border-radius:6px;overflow:hidden;border:1px solid var(--border)">
          <div style="padding:8px 10px;font-size:var(--fs-xs);font-weight:600;background:var(--bg3)">
            OIDC Diagnostics
            <button data-close-oidc-test
              style="float:right;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">✕</button>
          </div>
          <div id="oidcTestSteps" style="padding:8px 10px;font-size:11px;line-height:1.7"></div>
          <div id="oidcTestSummary" style="padding:8px 10px;font-size:var(--fs-xs);font-weight:600;border-top:1px solid var(--border)"></div>
        </div>

        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">
          OpenID Connect (OIDC) enables Single Sign-On: users are authenticated by an external
          Identity Provider (IdP) such as Keycloak, Azure AD, Okta, or Google Workspace, and
          automatically provisioned in Tidslinjal on first login.
        </p>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_issuer')||'Issuer URL'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— the base URL of your identity provider</span>
          </label>
          <input type="url" id="oidcIssuer" placeholder="https://accounts.example.com"
            title="The Issuer URL (also called the Realm URL in Keycloak). Tidslinjal appends /.well-known/openid-configuration to discover all endpoints automatically. Example: https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
            e.g. <code style="opacity:.7">https://login.microsoftonline.com/&lt;tenant&gt;/v2.0</code> (Azure AD),
            <code style="opacity:.7">https://accounts.google.com</code> (Google),
            <code style="opacity:.7">https://keycloak.example.com/realms/myrealm</code> (Keycloak)
          </div>
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_client_id')||'Client ID'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— provided by your IdP when you registered the application</span>
          </label>
          <input type="text" id="oidcClientID" placeholder="tidslinjal-client"
            title="The client ID (also called Application ID in Azure AD) assigned to Tidslinjal by your identity provider."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_client_secret')||'Client Secret'}
            <span style="opacity:.6;margin-left:4px">(leave blank to keep current)</span>
          </label>
          <input type="password" id="oidcClientSecret" placeholder="••••••••"
            title="The client secret issued by your identity provider. This is stored encrypted. Leave blank to keep the existing secret unchanged."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div id="oidcSecretHint" style="font-size:10px;color:var(--text-dim);margin-top:2px"></div>
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_redirect_url')||'Redirect URL'}
            <span style="opacity:.6;margin-left:4px">(leave blank for auto)</span>
          </label>
          <input type="url" id="oidcRedirectURL" placeholder="https://your-server/auth/oidc/callback"
            title="The URL that the identity provider redirects back to after authentication. Must exactly match a redirect URI registered in your IdP. Usually: https://your-server/auth/oidc/callback. If blank, defaults to http://localhost:8080/auth/oidc/callback."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
            Register this exact URL in your IdP's allowed redirect URIs list.
          </div>
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_default_role')||'Default role for new users'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— applied when an SSO user is auto-created</span>
          </label>
          <select id="oidcDefaultRole"
            title="When a user logs in via SSO for the first time and no local account exists, they are automatically created with this role."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="teammember">Team Member — can create and edit events</option>
            <option value="teamlead">Team Lead — can manage events for their group</option>
            <option value="oplead">Op Lead — operational leadership role</option>
          </select>
        </div>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px"
          title="When enabled, only the built-in admin account can use local username/password login. All other users must authenticate via SSO.">
          <input type="checkbox" id="oidcExclusive" style="width:14px;height:14px;accent-color:var(--accent)">
          <span>
            ${t('settings_oidc_exclusive')||'Exclusive mode (disable local login)'}
            <span style="font-size:10px;color:var(--text-dim);display:block;margin-top:1px">
              ⚠ The built-in <code>admin</code> account is always exempt so you can recover if SSO breaks.
            </span>
          </span>
        </label>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:10px"
          title="Master switch — must be checked for OIDC SSO to be active. Saved settings are preserved when disabled.">
          <input type="checkbox" id="oidcEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          <span>Enable OIDC SSO</span>
        </label>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-action="saveOIDCSettings"
            title="Save configuration and immediately apply it. If the settings are invalid, an error will be shown."
            >${t('settings_oidc_save')||'Save & Apply'}</button>
          <button class="btn btn-secondary btn-sm" data-action="runOIDCTest"
            title="Run a live diagnostic check against the configured OIDC provider to verify connectivity and configuration."
            >🔍 Test Connection</button>
          <a href="/auth/oidc/login" target="_blank" class="btn btn-secondary btn-sm"
            title="Open the SSO login flow in a new tab to verify the end-to-end login experience."
            >↗ Try SSO Login</a>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📧 Mail Setup</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure SMTP to send alarm notifications, scheduled reports, and user invitation emails.
          Without mail, password reset tokens are shown inline and must be copied manually.
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px"
          title="Master switch. When off, email delivery is disabled but settings are preserved.">
          <input type="checkbox" id="mailEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Email Delivery
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Hostname or IP address of your SMTP server. Must be reachable from the Tidslinjal server.">SMTP Host</label>
          <input type="text" id="mailHost" placeholder="smtp.example.com"
            title="Examples: smtp.gmail.com, smtp.office365.com, mail.company.internal"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="SMTP port. Common values: 587 (STARTTLS), 465 (TLS/SSL), 25 (legacy/no TLS)">Port</label>
            <input type="number" id="mailPort" placeholder="587" value="587"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Encryption method. STARTTLS upgrades a plain connection to encrypted (port 587). TLS uses encryption from the start (port 465). None sends in plain text — not recommended.">TLS Mode</label>
            <select id="mailTLS" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
              <option value="starttls">STARTTLS (recommended, port 587)</option>
              <option value="tls">TLS / SSL (port 465)</option>
              <option value="none">None (plain, not recommended)</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="SMTP authentication username — usually your email address.">Username</label>
          <input type="text" id="mailUsername" placeholder="user@example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            Password <span style="opacity:.6">(leave blank to keep)</span>
          </label>
          <input type="password" id="mailPassword" placeholder="••••••••"
            title="SMTP authentication password. Leave blank to keep the currently saved password."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="The email address that appears in the From field of outgoing messages.">From Address</label>
          <input type="email" id="mailFrom" placeholder="tidslinjal@example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="The human-readable name shown in the From field (e.g. 'Tidslinjal Notifications').">From Name</label>
          <input type="text" id="mailFromName" placeholder="Tidslinjal"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveMailConfig"
            title="Save SMTP settings.">Save</button>
          <button class="btn btn-secondary btn-sm" data-action="testMailConfig"
            title="Send a test email to the From address to verify that SMTP settings are correct.">Send Test Email</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📡 Syslog Forwarding</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Forward application log messages to a remote syslog server.
          Supports UDP, TCP, and TLS transports with classic (RFC 3164) or JSON formats.
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px"
          title="Enable syslog forwarding. When off, logs are written to stderr only.">
          <input type="checkbox" id="syslogEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Syslog Forwarding
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Hostname or IP of the remote syslog server.">Syslog Host</label>
          <input type="text" id="syslogHost" placeholder="syslog.example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Port: default 514 for UDP/TCP, 6514 for TLS.">Port</label>
            <input type="number" id="syslogPort" placeholder="514"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Transport protocol. UDP is fire-and-forget. TCP guarantees delivery. TLS encrypts the channel.">Transport</label>
            <select id="syslogTransport" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
              <option value="udp">UDP (RFC 3164, port 514)</option>
              <option value="tcp">TCP (RFC 6587, port 514)</option>
              <option value="tls">TLS (RFC 5425, port 6514)</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Message format. Classic uses RFC 3164 syslog format. JSON sends structured JSON objects.">Log Format</label>
          <select id="syslogFormat" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="classic">Classic (RFC 3164)</option>
            <option value="json">JSON (structured)</option>
          </select>
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Application name / tag appearing in syslog messages. Defaults to 'tidslinjal'.">App Name / Tag</label>
            <input type="text" id="syslogAppName" placeholder="tidslinjal"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Syslog facility (0–23). Default 1 = user-level. 16–23 = local0–local7.">Facility</label>
            <input type="number" id="syslogFacility" placeholder="1" min="0" max="23" value="1"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px"
          title="When enabled, the TLS server certificate must be signed by a trusted CA. Disable only for self-signed certs in private networks.">
          <input type="checkbox" id="syslogTLSVerify" checked style="width:14px;height:14px;accent-color:var(--accent)">
          Verify TLS certificate
        </label>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveSyslogConfig"
            title="Save syslog settings and apply immediately.">Save</button>
          <button class="btn btn-secondary btn-sm" data-action="testSyslogConfig"
            title="Send a test message to the syslog server.">Send Test Message</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">💼 Microsoft Teams Integration</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure Teams and Zoom to automatically attach meeting links to Meeting-type events.
          Notifications can also be sent to a Teams channel via an Incoming Webhook.
        </p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Paste the Incoming Webhook URL from your Teams channel connector settings. Alarm and event notifications will be posted there.">
            Teams Webhook URL
            <span style="opacity:.55;font-style:italic;margin-left:4px">— for channel notifications</span>
          </label>
          <input type="url" id="teamsWebhookURL" placeholder="https://…/IncomingWebhook/…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="A base Teams meeting URL. Event title and time will be appended as query parameters when a meeting link is generated.">
            Teams Meeting URL Template
            <span style="opacity:.55;font-style:italic;margin-left:4px">— base URL for auto-generated meeting links</span>
          </label>
          <input type="url" id="teamsMeetingTemplate" placeholder="https://teams.microsoft.com/l/meetup-join/…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="A Zoom meeting URL to attach to Meeting-type events.">
            Zoom Meeting URL
            <span style="opacity:.55;font-style:italic;margin-left:4px">— for Meeting-type events</span>
          </label>
          <input type="text" id="zoomMeetingBase" placeholder="https://zoom.us/j/1234567890"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveTeamsConfig"
          title="Save Teams and Zoom integration settings.">Save Teams/Zoom Config</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 TLS / HTTPS Configuration</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure TLS certificate and key file paths for HTTPS.
          CLI flags <code>--tls-cert</code> / <code>--tls-key</code> and environment variables
          <code>TLS_CERT</code> / <code>TLS_KEY</code> always take priority over settings stored here.
        </p>
        <div id="tlsCurrentStatus" style="margin-bottom:10px;padding:8px 10px;border-radius:var(--radius);background:var(--bg3);border:1px solid var(--border);font-size:var(--fs-xs)">
          Checking TLS status…
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Absolute path to the PEM-encoded TLS certificate file on the server.">Certificate File (cert.pem)</label>
          <input type="text" id="tlsCertFile" placeholder="/etc/ssl/certs/tidslinjal.crt"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Absolute path to the PEM-encoded private key file on the server.">Private Key File (key.pem)</label>
          <input type="text" id="tlsKeyFile" placeholder="/etc/ssl/private/tidslinjal.key"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="padding:8px 10px;border-radius:var(--radius);background:rgba(255,165,0,.12);border:1px solid rgba(255,165,0,.4);font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ⚠️ Changes to TLS configuration require a <strong>server restart</strong> to take effect.
          The server validates that both file paths are accessible before saving.
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveTLSConfig"
          title="Save TLS file paths. The server will use them on next restart.">Save TLS Config</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔑 API Keys</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          API keys allow external tools (scripts, monitoring systems, integrations) to access
          Tidslinjal without a user session. Use <code>Authorization: Bearer &lt;key&gt;</code> in HTTP requests.
          Keys are shown only once after creation — store them securely.
        </p>
        <div id="apiKeyList" style="margin-bottom:8px">Loading…</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="newAPIKeyName" placeholder="Key name / description"
            title="Give the key a descriptive name so you can identify which system uses it (e.g. 'Monitoring Script', 'CI Pipeline')."
            style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <button class="btn btn-primary btn-sm" data-action="createAPIKey"
            title="Generate a new API key. The key value will be shown once — copy it immediately.">+ Create</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔌 ${t('settings_connectors')||'Connectors / Plugins'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_connectors_desc')||'Configure external system connectors. Each connector can poll external services and push events into Tidslinjal.'}
        </p>
        <div id="connectorList" style="margin-bottom:8px">Loading…</div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📤 ${t('settings_event_bus')||'Outbound Event Bus'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_event_bus_desc')||'The event bus broadcasts lifecycle events (created, updated, deleted) to all registered connectors and webhook endpoints in real-time.'}
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius);color:var(--text-dim)">
          ${t('settings_event_bus_status')||'Status: Active — events are routed to configured connectors and webhooks automatically.'}
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📥 ${t('settings_ingest_api')||'Inbound Ingestion API'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_ingest_api_desc')||'External systems can push events into Tidslinjal via the Ingestion API. Authenticate with an API key using Authorization: Bearer <key>.'}
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius)">
          <code style="color:var(--accent);font-size:11px">POST /api/ingest</code>
          <span style="color:var(--text-dim);margin-left:8px">${t('settings_ingest_format')||'JSON payload with title, start, end, type fields'}</span>
        </div>
      </div>

      ${state.user?.role === 'admin' ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔐 ${t('settings_federation')||'Federation / Trust Realms'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_federation_desc')||'Configure multiple identity providers (IdPs) for partner organizations. Each IdP belongs to a trust realm that controls access levels.'}
        </p>
        <div id="federatedIdPList" style="margin-bottom:8px">Loading…</div>
        <details style="margin-bottom:8px">
          <summary style="cursor:pointer;font-size:var(--fs-xs);color:var(--accent);font-weight:600">+ Add Identity Provider</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
            <input type="text" id="fedIdpId" placeholder="ID slug (e.g. partner-nato)" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpName" placeholder="Display name" style="font-size:var(--fs-xs)">
            <select id="fedIdpProtocol" style="font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px">
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
            <input type="text" id="fedIdpIssuer" placeholder="Issuer URL" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpClientId" placeholder="Client ID" style="font-size:var(--fs-xs)">
            <input type="password" id="fedIdpSecret" placeholder="Client Secret" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpRealm" placeholder="Trust realm slug" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpDomains" placeholder="Allowed domains (comma-sep)" style="font-size:var(--fs-xs)">
            <select id="fedIdpRole" style="font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px">
              <option value="readonly">Read Only</option>
              <option value="readwrite">Read/Write</option>
              <option value="teammember" selected>Team Member</option>
              <option value="teamlead">Team Lead</option>
            </select>
            <button class="btn btn-secondary btn-sm" data-action="saveFederatedIdP">Save IdP</button>
          </div>
        </details>
        <details>
          <summary style="cursor:pointer;font-size:var(--fs-xs);color:var(--accent);font-weight:600">Trust Realms</summary>
          <div id="trustRealmList" style="margin-top:6px">Loading…</div>
        </details>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🏢 ${t('settings_rooms')||'Rooms & Resources'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_rooms_desc')||'Manage bookable rooms, vehicles, and equipment. Resources can be assigned to events for automatic scheduling.'}
        </p>
        <div id="roomList" style="margin-bottom:8px">Loading…</div>
        <details>
          <summary style="cursor:pointer;font-size:var(--fs-xs);color:var(--accent);font-weight:600">+ Add Room/Resource</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
            <input type="text" id="roomName" placeholder="Room/resource name" style="font-size:var(--fs-xs)">
            <select id="roomType" style="font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px">
              <option value="room">${t('resource_rooms')||'Room'}</option>
              <option value="building">${t('resource_buildings')||'Building'}</option>
              <option value="computer_service">${t('resource_computer_services')||'Computer Service'}</option>
              <option value="data_center">${t('resource_data_centers')||'Data Center'}</option>
              <option value="vehicle">${t('vehicle')||'Vehicle'}</option>
              <option value="equipment">${t('equipment')||'Equipment'}</option>
            </select>
            <input type="text" id="roomLocation" placeholder="Location" style="font-size:var(--fs-xs)">
            <input type="number" id="roomCapacity" placeholder="Capacity" min="1" style="font-size:var(--fs-xs)">
            <button class="btn btn-secondary btn-sm" data-action="saveRoom">Save</button>
          </div>
        </details>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📞 ${t('settings_meetings')||'Meeting Integration'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_meetings_desc')||'Configure automatic meeting creation for Microsoft Teams and Zoom. Meeting links are auto-generated when creating virtual meeting events.'}
        </p>
        <div id="meetingConfigUI" style="font-size:var(--fs-xs)">
          <details>
            <summary style="cursor:pointer;color:var(--accent);font-weight:600">Microsoft Teams</summary>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
              <input type="text" id="teamsTenantId" placeholder="Tenant ID" style="font-size:var(--fs-xs)">
              <input type="text" id="teamsClientId" placeholder="Client ID" style="font-size:var(--fs-xs)">
              <input type="password" id="teamsSecret" placeholder="Client Secret" style="font-size:var(--fs-xs)">
              <button class="btn btn-secondary btn-sm" data-action="saveMeetingConfig" data-arg="teams">Save Teams Config</button>
            </div>
          </details>
          <details style="margin-top:6px">
            <summary style="cursor:pointer;color:var(--accent);font-weight:600">Zoom</summary>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
              <input type="text" id="zoomAccountId" placeholder="Account ID" style="font-size:var(--fs-xs)">
              <input type="text" id="zoomClientId" placeholder="Client ID" style="font-size:var(--fs-xs)">
              <input type="password" id="zoomSecret" placeholder="Client Secret" style="font-size:var(--fs-xs)">
              <button class="btn btn-secondary btn-sm" data-action="saveMeetingConfig" data-arg="zoom">Save Zoom Config</button>
            </div>
          </details>
        </div>
      </div>
      ` : ''}
    `;
    // Load current OIDC settings into the form
    setTimeout(_initOIDCSettingsUI, 0);
    setTimeout(_initMailSettingsUI, 0);
    setTimeout(_initSyslogSettingsUI, 0);
    setTimeout(_initTLSConfigUI, 0);
    setTimeout(_loadAPIKeys, 0);
    setTimeout(_loadTeamsConfigUI, 0);
    setTimeout(_loadConnectorList, 0);
    if (state.user?.role === 'admin') {
      setTimeout(_loadFederatedIdPs, 0);
      setTimeout(_loadTrustRealms, 0);
      setTimeout(_loadRoomList, 0);
    }
  } else if (tab === 'tools') {
    const role          = state.user?.role || '';
    const isAdminOrOplead = hasRole2(role, 'oplead');
    const isTeamLead    = hasRole2(role, 'teamlead');
    const canReport     = role === 'admin' || isAdminOrOplead || isTeamLead || userHasCapability('report');
    const canAutoReport = role === 'admin' || isAdminOrOplead || userHasCapability('auto_report');
    const toolBtn = (icon, label, fnName) =>
      `<button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="${fnName.replace(/\(\)/,'')}">${icon} ${label}</button>`;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>🛠 ${t('tab_tools')||'Tools'}</span>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" data-action="openDetachedTools" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('🧰', t('teamlead_toolbox_title')||'TeamLead Toolbox', 'openTeamLeadToolbox()') : ''}
          ${toolBtn('📊', t('poll_title')||'Poll / Multipoll', 'openPollModal()')}
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('📝', t('questionnaire_editor')||'Poll Questions Editor', 'openQuestionnaireEditor()') : ''}
          ${toolBtn('🙋', t('person_ready_check_title')||'Person Ready Check', 'openPersonReadyCheckPopup()')}
          ${toolBtn('✅', t('ready_check_title')||'Ready Check', 'openReadyCheckPopup()')}
          ${role === 'admin' ? toolBtn('🔧', t('btn_bulk_actions')||'Bulk Event Actions', 'openBulkActionsModal()') : ''}
          ${toolBtn('⚖', t('decisions_title')||'Decisions', 'openDecisionLogModal()')}
          ${toolBtn('📰', t('narrative_title')||'Narrative / Storyline', 'openNarrativeModal()')}
          ${toolBtn('📈', t('analysis_title')||'Analysis', 'openAnalysisModal()')}
          ${toolBtn('📋', t('checklists')||'Checklists', 'showChecklistsInSidebar()')}
          ${isTeamLead || isAdminOrOplead ? toolBtn('📖', t('tab_log_book')||'Log Book', 'openLogBookModal()') : ''}
          ${canReport ? toolBtn('📄', t('btn_report')||'Report', 'openReportModal()') : ''}
          ${canAutoReport ? toolBtn('⏰', t('btn_auto_report')||'Auto reports', 'openAutoReportModal()') : ''}
          ${toolBtn('🖨', t('btn_print')||'Print', 'printTimeline()')}
          ${toolBtn('🗺', t('btn_map')||'Map', 'openDetachedMap()')}
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('📊', t('btn_pva')||'Plan vs Actual', 'openPVAModal()') : ''}
          ${(isTeamLead || isAdminOrOplead || userHasCapability('critical_line_analysis')) ? toolBtn('📈', t('btn_critical_line')||'Critical Line', 'openCriticalLineModal()') : ''}
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('📊', t('btn_task_time_matrix')||'Task-Time Matrix', 'openTaskTimeMatrix()') : ''}
          ${isAdminOrOplead ? toolBtn('📋', t('btn_templates')||'Templates', 'openTemplatesModal()') : ''}
          ${isAdminOrOplead ? toolBtn('⬇', t('btn_export')||'Export', 'openExportModal()') : ''}
          ${isAdminOrOplead ? toolBtn('⬆', t('btn_import')||'Import', 'openImportModal()') : ''}
          ${role === 'admin' ? toolBtn('💾', t('btn_backup')||'Backup', 'openBackupModal()') : ''}
          ${role === 'admin' ? toolBtn('🔄', t('btn_gradual_backup')||'Gradual Backup', 'openGradualBackupModal()') : ''}
        </div>
      </div>
    `;
  } else if (tab === 'checklists') {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>📋 ${t('checklists')||'Checklists'}</span>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" data-action="openDetachedChecklists" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        </div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('checklists_desc')||'Create, manage, and track checklists for operational tasks.'}
        </p>
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" data-action="openChecklistStart" style="flex:1">▶ ${t('checklist_start')||'Start Checklist'}</button>
          ${hasRole2(state.user?.role||'','teamlead') ? `<button class="btn btn-sm btn-secondary" data-action="openChecklistEditor">✏ ${t('checklist_editor')||'Editor'}</button>` : ''}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">✅ ${t('checklist_active')||'Active Checklists'}</div>
        <div id="checklistActiveList" style="font-size:var(--fs-xs);color:var(--text-dim)">Loading...</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('checklist_completed')||'Completed'}</div>
        <div id="checklistCompletedList" style="font-size:var(--fs-xs);color:var(--text-dim)">Loading...</div>
      </div>
    `;
    _bindActions(el);
    _loadChecklistInstances();
  } else if (tab === 'security' && state.user && state.user.role === 'admin') {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🛡 ${t('tab_security')||'Security'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_overview_desc')||'Security configuration and status overview for Tidslinjal.'}
        </p>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 ${t('security_tls')||'TLS / HTTPS Configuration'}</div>
        <div id="secTlsCurrentStatus" style="margin-bottom:8px;padding:8px 10px;border-radius:var(--radius);background:var(--bg3);border:1px solid var(--border);font-size:var(--fs-xs)">
          ${t('checking')||'Checking TLS status…'}
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secTlsEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_tls_enabled')||'Enable TLS'}
        </label>
        <button class="btn btn-secondary btn-sm" id="secTlsToggleDetails" data-action="toggleSecTlsDetails" style="margin-bottom:8px">${t('security_tls_details')||'Show Details'}</button>
        <div id="secTlsDetails" style="display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
            ${t('security_tls_desc')||'Configure TLS certificate and key file paths for HTTPS.'}
          </p>
          <div class="form-group" style="margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_cert_file')||'Certificate File (cert.pem)'}</label>
            <input type="text" id="secTlsCertFile" placeholder="/etc/ssl/certs/tidslinjal.crt"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_key_file')||'Private Key File (key.pem)'}</label>
            <input type="text" id="secTlsKeyFile" placeholder="/etc/ssl/private/tidslinjal.key"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div style="padding:8px 10px;border-radius:var(--radius);background:rgba(255,165,0,.12);border:1px solid rgba(255,165,0,.4);font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
            ⚠️ ${t('security_tls_restart')||'Changes to TLS configuration require a server restart to take effect.'}
          </div>
          <button class="btn btn-secondary btn-sm" data-action="saveTLSConfig">${t('btn_save')||'Save'} TLS</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔐 ${t('security_oidc')||'Single Sign-On (OIDC)'}</div>
        <div id="secOidcStatus" style="padding:8px 10px;border-radius:var(--radius);background:var(--bg3);border:1px solid var(--border);font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('checking')||'Checking…'}
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secSsoEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_sso_enabled')||'Enable SSO'}
        </label>
        <button class="btn btn-secondary btn-sm" id="secOidcToggleDetails" data-action="toggleSecOidcDetails" style="margin-bottom:8px">${t('security_oidc_details')||'Show Details'}</button>
        <div id="secOidcDetails" style="display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
            ${t('security_oidc_desc')||'OIDC/SSO configuration. Full configuration is in the Integrations tab.'}
          </p>
          <div id="secOidcDetailContent" style="font-size:var(--fs-xs);padding:8px 10px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);color:var(--text-dim)">
            ${t('checking')||'Loading…'}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveSecSsoEnabled" style="margin-top:4px">${t('btn_save')||'Save'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🚦 ${t('security_rate_limiting')||'Rate Limiting'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_rate_limiting_desc')||'Built-in per-IP rate limiting protects authentication endpoints against brute-force attacks.'}
        </p>
        <div style="font-size:var(--fs-xs);display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-bottom:8px">
          <label style="font-weight:600">${t('security_login')||'Login'}:</label>
          <input type="number" id="secRateLogin" min="1" max="1000" value="10" style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <label style="font-weight:600">${t('security_registration')||'Registration'}:</label>
          <input type="number" id="secRateReg" min="1" max="1000" value="5" style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <label style="font-weight:600">${t('security_password_reset')||'Password Reset'}:</label>
          <input type="number" id="secRateReset" min="1" max="1000" value="5" style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
        </div>
        <span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_per_minute')||'requests / minute / IP'}</span>
        <button class="btn btn-secondary btn-sm" data-action="saveSecRateLimits" style="margin-top:6px">${t('security_rate_save')||'Save Rate Limits'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🌐 ${t('security_geoblocking')||'Geoblocking'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_geoblocking_desc')||'Restrict access by geographic location using IP-based geoblocking.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secGeoEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_geo_enabled')||'Enable geoblocking'}
        </label>
        <div style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_geo_mode')||'Mode'}</label>
          <select id="secGeoMode" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="allowlist">${t('security_geo_allowlist')||'Allowlist (only these countries)'}</option>
            <option value="blocklist">${t('security_geo_blocklist')||'Blocklist (block these countries)'}</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_geo_countries')||'Country codes (ISO 3166-1, comma-separated, e.g. SE,NO,FI)'}</label>
          <input type="text" id="secGeoCountries" placeholder="SE,NO,FI,DK"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div id="secGeoCountryNames" style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px"></div>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveSecGeoblock">${t('security_geo_save')||'Save Geoblocking'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔑 ${t('security_password_policy')||'Password Policy'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secPolicyEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Password Quality Policy
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_min_length')||'Minimum Length'}</label>
          <input type="number" id="secMinLength" placeholder="8" min="4" max="128" value="8"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqUpper" style="accent-color:var(--accent)"> ${t('security_require_uppercase')||'Require uppercase (A–Z)'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqLower" style="accent-color:var(--accent)"> ${t('security_require_lowercase')||'Require lowercase (a–z)'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqNumbers" style="accent-color:var(--accent)"> ${t('security_require_numbers')||'Require numbers (0–9)'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqSymbols" style="accent-color:var(--accent)"> ${t('security_require_symbols')||'Require symbols (!@#…)'}
          </label>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveSecuritySettings">${t('btn_save')||'Save'} Policy</button>
      </div>

      <div class="sidebar-section" id="enrollmentSettingsSection">
        <div class="sidebar-section-title">🚪 ${t('settings_enrollment')||'User Enrollment'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_enrollment_desc')||'Controls how new users can register for access.'}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap;gap:4px" id="enrollModeGroup">
          ${[['off','Off'],['open','Open'],['generic_invitation','Shared code'],['personal_invitation','Personal invite'],['vetted','Vetted'],['oidc_auto_enroll','SSO auto']].map(([v,l]) =>
            `<button class="toggle-btn" id="enrollBtn_${v}" data-action="setEnrollMode" data-arg="${v}">${l}</button>`
          ).join('')}
        </div>
        <div id="enrollCodeGroup" style="margin-top:8px;display:none">
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="enrollCodeInput" placeholder="Shared invite code"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
          </div>
        </div>
        <div id="enrollVettedInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">New users must be approved by an admin.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
        <div id="enrollPersonalInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Users must be invited individually with a unique code.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
        <div id="enrollOpenInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Anyone can create an account freely.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
        <div id="enrollOffInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Registration is disabled. Only admins can create accounts.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 ${t('security_encryption')||'Backup Encryption'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_encryption_desc')||'Backups are encrypted with AES-256-GCM using PBKDF2-SHA256 key derivation (100,000 iterations).'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secEncryptionEnabled" checked style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_encryption_toggle')||'Enable backup encryption'}
        </label>
        <button class="btn btn-secondary btn-sm" data-action="saveSecEncryption">${t('btn_save')||'Save'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🛡 ${t('security_headers_title')||'Security Headers'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('security_headers_desc')||'The following security headers are automatically applied to all responses:'}
        </p>
        <div style="font-size:11px;padding:8px 10px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);line-height:1.8;font-family:monospace">
          <div>X-Frame-Options: <strong>DENY</strong></div>
          <div>X-Content-Type-Options: <strong>nosniff</strong></div>
          <div>Referrer-Policy: <strong>strict-origin-when-cross-origin</strong></div>
          <div>Content-Security-Policy: <strong>default-src 'self'; …</strong></div>
          <div>Permissions-Policy: <strong>camera=(), microphone=(), …</strong></div>
          <div style="color:var(--accent)">Strict-Transport-Security: <strong>max-age=63072000</strong> (HTTPS only)</div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📋 ${t('security_sessions')||'Active Sessions'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('security_sessions_desc')||'Session cookies use HttpOnly, Secure (HTTPS), and SameSite=Lax attributes.'}
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);color:var(--text-dim)">
          ${t('security_session_info')||'Sessions expire after inactivity. Token-based authentication with cryptographically random IDs.'}
        </div>
      </div>
    `;
    // Load TLS status for security tab
    apiGet('/api/tls/status').then(tls => {
      const el = document.getElementById('secTlsCurrentStatus');
      if (el) {
        const configured = tls && tls.configured;
        el.innerHTML = configured
          ? `<span style="color:#27AE60">✅ ${t('security_tls_active')||'TLS is active'}</span> — ${escHtml(tls.cert_file||'')}`
          : `<span style="color:var(--red,#E74C3C)">❌ ${t('security_tls_inactive')||'TLS not configured'}</span> — ${t('security_tls_inactive_desc')||'HTTPS is not enabled.'}`;
        const enableCb = document.getElementById('secTlsEnabled');
        if (enableCb) enableCb.checked = !!configured;
        if (tls) {
          const certInput = document.getElementById('secTlsCertFile');
          const keyInput = document.getElementById('secTlsKeyFile');
          if (certInput && tls.cert_file) certInput.value = tls.cert_file;
          if (keyInput && tls.key_file) keyInput.value = tls.key_file;
        }
      }
    }).catch(() => {});
    // Load OIDC status
    apiGet('/api/oidc/config').then(oidc => {
      const statusEl = document.getElementById('secOidcStatus');
      const enableCb = document.getElementById('secSsoEnabled');
      const detailEl = document.getElementById('secOidcDetailContent');
      const configured = oidc && oidc.issuer;
      if (statusEl) {
        statusEl.innerHTML = configured
          ? `<span style="color:#27AE60">✅ ${t('security_oidc_active')||'OIDC configured'}</span> — ${escHtml(oidc.issuer)}${oidc.exclusive_mode ? ' <strong>(Exclusive)</strong>' : ''}`
          : `<span style="color:var(--text-dim)">— ${t('security_oidc_not_configured')||'OIDC not configured'}</span>`;
      }
      if (enableCb) enableCb.checked = !!configured && oidc.sso_enabled !== false;
      if (detailEl && configured) {
        detailEl.innerHTML = `
          <div>${t('security_oidc_issuer')||'Issuer'}: <strong>${escHtml(oidc.issuer)}</strong></div>
          <div>Client ID: <strong>${escHtml(oidc.client_id || '***')}</strong></div>
          <div>Redirect URL: <strong>${escHtml(oidc.redirect_url || '')}</strong></div>
          <div>Exclusive: <strong>${oidc.exclusive_mode ? 'Yes' : 'No'}</strong></div>
          <div>Default role: <strong>${escHtml(oidc.default_role || 'teammember')}</strong></div>`;
      } else if (detailEl) {
        detailEl.innerHTML = `<span style="color:var(--text-dim)">${t('security_oidc_not_configured')||'Not configured'}</span>`;
      }
    }).catch(() => {});
    // Load password policy
    apiGet('/api/security/policy').then(policy => {
      const el = document.getElementById('secPasswordPolicy');
      if (el && policy) {
        // Already have form fields, just update them
      }
    }).catch(() => {});
    // Load rate limiting settings
    apiGet('/api/admin/rate-limits').then(rl => {
      if (!rl) return;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      setVal('secRateLogin', rl.login_limit || 10);
      setVal('secRateReg', rl.registration_limit || 5);
      setVal('secRateReset', rl.password_reset_limit || 5);
    }).catch(() => {});
    // Load geoblocking settings
    apiGet('/api/admin/geoblocking').then(geo => {
      if (!geo) return;
      const setCb = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      setCb('secGeoEnabled', geo.enabled);
      setVal('secGeoMode', geo.mode || 'allowlist');
      setVal('secGeoCountries', (geo.countries || []).join(','));
      _updateGeoCountryNames();
    }).catch(() => {});
    // Load backup encryption settings
    apiGet('/api/admin/encryption').then(enc => {
      if (!enc) return;
      const cb = document.getElementById('secEncryptionEnabled');
      if (cb) cb.checked = enc.enabled !== false;
    }).catch(() => {});
    // Init enrollment UI (moved from settings)
    setTimeout(_initEnrollmentUI, 0);
    setTimeout(_initSecuritySettingsUI, 0);
    _bindActions(el);
  } else if (tab === 'references') {
    _renderReferencesTab(el);

  } else if (tab === 'settings') {
    const p  = state.preferences;
    const ex = state.exercise || {};
    el.innerHTML = `
      <div style="padding:10px 12px;margin:0 0 12px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px">${t('settings_global_header')||'Global Settings'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${t('settings_global_desc')||'Shared with all users — changes here affect everyone'}</div>
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
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${getExIndexLabel(ex)}
            <span data-action="showExIndexInfo" style="cursor:pointer;margin-left:4px;opacity:.6" title="${t('exercise_index_info_tip')||'What is this?'}">ℹ️</span>
          </label>
          <input type="number" id="exIndex" value="${ex.ex_index||0}" min="0"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('artificial_time')||'Artificial time'}</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="exArtificialTimeEnabled" ${ex.artificial_time_enabled?'checked':''}
              data-action="setArtificialTime" data-event="change"
              style="width:14px;height:14px;accent-color:var(--accent)">
            <input type="datetime-local" id="exArtificialTime" value="${ex.artificial_time ? fmtDateInput(new Date(ex.artificial_time)) : ''}"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${t('artificial_time_desc')||'Set a custom "current time" for exercise simulation'}</div>
        </div>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="exEnabled" ${ex.enabled?'checked':''}>
          <label for="exEnabled" style="font-size:var(--fs-sm)">${t('settings_exercise_enable')}</label>
          <span title="${t('settings_exercise_enable_info')||'Enable the synthetic time display, showing H+N elapsed time on the timeline.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent);margin-left:4px">ℹ️</span>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exDayHoursOnly" ${ex.day_hours_only?'checked':''}>
          <label for="exDayHoursOnly" style="font-size:var(--fs-sm)">${t('synth_day_hours_only')||'Day hours only'}</label>
          <span title="${t('settings_synth_day_only_info')||'Only count daytime hours in synthetic elapsed time. Night hours are skipped.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent);margin-left:4px">ℹ️</span>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exIncludeWeekends" ${ex.include_weekends!==false?'checked':''}>
          <label for="exIncludeWeekends" style="font-size:var(--fs-sm)">${t('settings_include_weekends')||'Include weekends'}</label>
          <span title="${t('settings_include_weekends_info')||'Show weekends on the timeline and count them in synthetic time calculations.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent);margin-left:4px">ℹ️</span>
        </div>
        <button class="btn btn-primary btn-sm" data-action="saveExercise">${t('btn_save')}</button>
        ${state.user.role==='admin' ? `<a href="/admin-view" class="btn btn-secondary btn-sm" style="margin-left:4px">${t('admin_view')||'Admin View'}</a>` : ''}
      </div>` : ''}
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_urls')||'Links & URLs'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_urls_desc')||'URLs shown on the welcome screen and help buttons. Visible to all users.'}</p>
        <div class="sidebar-section-title" style="font-size:var(--fs-xs)">${t('settings_welcome_url')||'Welcome URL'}</div>
        <input type="url" value="${escHtml(ex.welcome_url||p.welcome_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="welcome_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
        <div class="sidebar-section-title" style="margin-top:6px;font-size:var(--fs-xs)">${t('settings_help_url')||'Help URL'}</div>
        <input type="url" value="${escHtml(ex.help_url||p.help_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="help_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
        <div class="sidebar-section-title" style="margin-top:6px;font-size:var(--fs-xs)">${t('settings_training_url')||'Training URL'}</div>
        <input type="url" value="${escHtml(ex.training_url||p.training_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="training_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
        <div class="sidebar-section-title" style="margin-top:6px;font-size:var(--fs-xs)">${t('settings_demo_url')||'Demo URL'}</div>
        <input type="url" value="${escHtml(ex.demo_url||p.demo_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="demo_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        ${state.user && (state.user.role==='admin' || hasRole2(state.user.role, 'oplead')) ? `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          <div class="sidebar-section-title" style="font-size:var(--fs-xs)">📢 ${t('startup_text')||'Startup Message'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('startup_text_desc')||'Text displayed to all users when they start the application'}</p>
          <textarea id="startupTextInput" rows="3" placeholder="${t('startup_text_placeholder')||'Enter a message to display on startup...'}"
            style="width:100%;padding:6px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-primary btn-sm" data-action="saveStartupText">${t('startup_text_save')||'Save'}</button>
            <button class="btn btn-secondary btn-sm" data-action="clearStartupText">${t('startup_text_clear')||'Clear'}</button>
          </div>
        </div>` : ''}
      </div>
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🎨 ${t('settings_icon_set')||'Icon Set'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_icon_set_desc')||'Choose which icon set to use for symbols and icons across the application (maps, resources, user icons, etc.)'}</p>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(ex.icon_set||'emoji')==='emoji'?' active':''}" data-action="setIconSet" data-arg="emoji">😀 ${t('icon_set_emoji')||'Emoji'}</button>
          <button class="toggle-btn${ex.icon_set==='material'?' active':''}" data-action="setIconSet" data-arg="material"><span class="material-icons" style="font-size:16px;vertical-align:middle">star</span> ${t('icon_set_material')||'Material Icons'}</button>
        </div>
        ${ex.icon_set==='material' ? `
        <div style="margin-top:8px;padding:8px;background:var(--bg2);border-radius:var(--radius);border:1px solid var(--border)">
          <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('material_icons_preview')||'Preview — Google Material Icons'}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:24px">
            <span class="material-icons" title="Home">home</span>
            <span class="material-icons" title="Person">person</span>
            <span class="material-icons" title="Star">star</span>
            <span class="material-icons" title="Warning">warning</span>
            <span class="material-icons" title="Flag">flag</span>
            <span class="material-icons" title="Place">place</span>
            <span class="material-icons" title="Build">build</span>
            <span class="material-icons" title="Security">security</span>
            <span class="material-icons" title="Settings">settings</span>
            <span class="material-icons-outlined" title="Military Tech">military_tech</span>
            <span class="material-icons" title="Groups">groups</span>
            <span class="material-icons" title="Assignment">assignment</span>
          </div>
          <p style="font-size:10px;color:var(--text-dim);margin-top:6px"><a href="https://fonts.google.com/icons" target="_blank" rel="noopener" style="color:var(--accent)">${t('browse_material_icons')||'Browse all Material Icons'}</a></p>
        </div>` : ''}
      </div>` : ''}
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🎖 ${t('settings_tactical_font')||'Tactical Task Graphics Font'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_tactical_font_desc')||'Use the NDU Tactical Task Graphics font for military symbols and icons. The font is not distributed with Tidslinjal due to licensing — download it from the official source, then install it locally.'}</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <a href="http://ndupress.ndu.edu/Portals/68/Images/jfq/jfq-85/cyberspace-graphics/Tactical-Task-Graphics-to-Cyber.zip" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="text-align:center;text-decoration:none">⬇ ${t('settings_tactical_font_download')||'Download Font (NDU Press)'}</a>
          <p style="font-size:10px;color:var(--text-dim);line-height:1.5">${t('settings_tactical_font_install')||'After downloading, extract the ZIP and install the .ttf/.otf font files on your operating system. Then enable the font below.'}</p>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
            <input type="checkbox" id="prefTacticalFont" ${p.tactical_font_enabled?'checked':''} data-action="setTacticalFontPref" data-event="change" data-arg-checked
              style="width:14px;height:14px;accent-color:var(--accent)">
            ${t('settings_tactical_font_enable')||'Enable Tactical Task Graphics font'}
          </label>
          <input type="text" id="prefTacticalFontFamily" value="${escHtml(p.tactical_font_family || 'Tactical Task Graphics to Cyber')}" data-action="setTacticalFontFamily" data-event="change" data-arg-value
            style="font-size:var(--fs-xs);padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)" placeholder="Font family name">
          <p style="font-size:10px;color:var(--text-dim)">${t('settings_tactical_font_family_desc')||'CSS font-family name (must match the installed font name).'}</p>
        </div>
      </div>` : ''}
      <div style="padding:10px 12px;margin:16px 0 12px;background:var(--bg3);border-left:3px solid var(--text-dim);border-radius:0 var(--radius) var(--radius) 0">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.5px">${t('settings_personal_header')||'Personal Preferences'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${t('settings_personal_desc')||'Only affects your view — other users have their own settings'}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_theme')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.theme==='light'?' active':''}" data-action="setPref" data-args='["theme","light"]' >${t('theme_light')||'Light'}</button>
          <button class="toggle-btn${p.theme==='dark'?' active':''}" data-action="setPref" data-args='["theme","dark"]' >${t('theme_dark')||'Dark'}</button>
          <button class="toggle-btn${p.theme==='city-camo'?' active':''}" data-action="setPref" data-args='["theme","city-camo"]'  title="Camouflage (greens/grays)">🏕 Camo</button>
          <button class="toggle-btn${p.theme==='urban-camo'?' active':''}" data-action="setPref" data-args='["theme","urban-camo"]'  title="Urban warfare (blues)">🌆 Urban Camo</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_size')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.size==='small'?' active':''}" data-action="setPref" data-args='["size","small"]' >${t('size_small')}</button>
          <button class="toggle-btn${p.size==='normal'?' active':''}" data-action="setPref" data-args='["size","normal"]' >${t('size_normal')}</button>
          <button class="toggle-btn${p.size==='large'?' active':''}" data-action="setPref" data-args='["size","large"]' >${t('size_large')}</button>
          <button class="toggle-btn${p.size==='huge'?' active':''}" data-action="setPref" data-args='["size","huge"]' >${t('size_huge')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_language')}</div>
        <div class="toggle-btn-group">
          ${[
            {code:'en',name:'English'},{code:'sv',name:'Svenska'},{code:'fr',name:'Français'},
            {code:'fi',name:'Suomi'},{code:'da',name:'Dansk'},{code:'nb',name:'Norsk (Bokmål)'},
            {code:'et',name:'Eesti'},{code:'lv',name:'Latviešu'},{code:'lt',name:'Lietuvių'},
            {code:'it',name:'Italiano'},{code:'es',name:'Español'},{code:'pt',name:'Português'},
            {code:'pl',name:'Polski'},{code:'uk',name:'Українська'}
          ].filter(l => isLangEnabled(l.code)).map(l =>
            `<button class="toggle-btn${p.language===l.code?' active':''}" data-action="setPref" data-args='["language","${l.code}"]' title="${l.name}">${langAbbr(l.code)}</button>`
          ).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:var(--fs-sm);cursor:pointer">
          <input type="checkbox" ${p.show_lang_flags!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_lang_flags"
            style="accent-color:var(--accent)">
          ${t('settings_show_lang_flags')||'Show language flags in toolbar'}
        </label>
        <div style="margin-top:8px">
          <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_country_code_format')||'Country code format (ISO 3166-1)'}</div>
          <div class="toggle-btn-group">
            <button class="toggle-btn${(p.country_code_format||'alpha2')==='alpha2'?' active':''}" data-action="setPref" data-args='["country_code_format","alpha2"]' title="ISO 3166-1 alpha-2 (e.g. SE, GB, FR)">${t('settings_alpha2')||'2-letter'}</button>
            <button class="toggle-btn${p.country_code_format==='alpha3'?' active':''}" data-action="setPref" data-args='["country_code_format","alpha3"]' title="ISO 3166-1 alpha-3 (e.g. SWE, GBR, FRA)">${t('settings_alpha3')||'3-letter'}</button>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_date_format')||'Date / Time Format'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${[['iso','ISO 8601'],['uk','UK'],['fr','FR'],['sv','SV'],['dtg','DTG']].map(([v,l]) =>
            `<button class="toggle-btn${(p.date_format||'iso')===v?' active':''}" data-action="setPref" data-args='["date_format","${v}"]' title="${v==='dtg'?'Date-Time Group (DDHHMMZmmmYY)':''}">${l}</button>`
          ).join('')}
        </div>
        <div class="hour-range" style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_day_hours')}:</span>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH" style="width:52px" data-action="setHourPref" data-event="change">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH" style="width:52px" data-action="setHourPref" data-event="change">
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_timezone')||'Timezone'}:</span>
          <select id="prefTimezone" data-action="setTimezonePref" data-event="change" data-arg-value
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
            <button class="toggle-btn${!_clockUTC?' active':''}" id="clockFmtLocal" data-action="setClockFormat" data-arg="local">Local time</button>
            <button class="toggle-btn${_clockUTC?' active':''}"  id="clockFmtZulu"  data-action="setClockFormat" data-arg="zulu">ZULU / UTC</button>
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
                  <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" data-action="removeExtraClock" data-arg="${ec.id}">× Remove</button>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_time_format')||'Time Format'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.time_format||'24h')==='24h'?' active':''}" data-action="setPref" data-args='["time_format","24h"]'>${t('time_format_24h')}</button>
          <button class="toggle-btn${p.time_format==='12h'?' active':''}" data-action="setPref" data-args='["time_format","12h"]'>${t('time_format_12h')}</button>
        </div>
        <div style="margin-top:8px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_time_separator')||'Time Separator'}</span>
          <div class="toggle-btn-group" style="margin-top:4px">
            <button class="toggle-btn${(p.time_separator||'colon')==='colon'?' active':''}" data-action="setPref" data-args='["time_separator","colon"]'>${t('time_sep_colon')||': separation'}</button>
            <button class="toggle-btn${p.time_separator==='dot'?' active':''}" data-action="setPref" data-args='["time_separator","dot"]'>${t('time_sep_dot')||'. separation'}</button>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_week_start')||'Week Starts On'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.week_start_day||'monday')==='monday'?' active':''}" data-action="setPref" data-args='["week_start_day","monday"]'>${t('week_start_monday')}</button>
          <button class="toggle-btn${p.week_start_day==='sunday'?' active':''}" data-action="setPref" data-args='["week_start_day","sunday"]'>${t('week_start_sunday')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_range')||'Default Timeline Range'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','3days','week','2weeks','month'].map(v =>
            `<button class="toggle-btn${(p.default_range||'week')===v?' active':''}" data-action="setPref" data-args='["default_range","${v}"]'>${t('range_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_resolution')||'Default Time-slot Resolution'}</div>
        <div class="toggle-btn-group">
          ${[['ten','10 min'],['quarter','15 min'],['hour',t('res_hour')],['day',t('res_day')]].map(([v,l]) =>
            `<button class="toggle-btn${(p.default_resolution||'hour')===v?' active':''}" data-action="setPref" data-args='["default_resolution","${v}"]'>${l}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_high_contrast')||'High Contrast'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_high_contrast_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.high_contrast?'checked':''} data-action="setPref" data-event="change" data-pref-checked="high_contrast"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_high_contrast')||'High Contrast'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_color_blind')||'Color-blind Safe Palette'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_color_blind_desc')}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          <button class="toggle-btn${(p.color_blind_mode||'off')==='off'?' active':''}" data-action="setPref" data-args='["color_blind_mode","off"]'>${t('cb_off')}</button>
          <button class="toggle-btn${p.color_blind_mode==='protanopia'?' active':''}" data-action="setPref" data-args='["color_blind_mode","protanopia"]'>${t('cb_protanopia')}</button>
          <button class="toggle-btn${p.color_blind_mode==='deuteranopia'?' active':''}" data-action="setPref" data-args='["color_blind_mode","deuteranopia"]'>${t('cb_deuteranopia')}</button>
          <button class="toggle-btn${p.color_blind_mode==='tritanopia'?' active':''}" data-action="setPref" data-args='["color_blind_mode","tritanopia"]'>${t('cb_tritanopia')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_landing_view')||'Default Landing View'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_landing_view_desc')}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['grid','list','log_book','decisions','map','reports'].map(v =>
            `<button class="toggle-btn${(p.default_landing_view||'grid')===v?' active':''}" data-action="setPref" data-args='["default_landing_view","${v}"]'>${t('landing_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_auto_follow')||'Auto-follow "Now"'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_auto_follow_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.auto_follow_now?'checked':''} data-action="setPref" data-event="change" data-pref-checked="auto_follow_now"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_auto_follow')||'Auto-follow "Now"'}
          <span title="${t('settings_auto_follow_info')||'When enabled, the timeline automatically scrolls to keep the current time visible as time progresses.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_tooltip_delay')||'Tooltip Hover Delay'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.tooltip_delay||0)===0?' active':''}" data-action="setTooltipDelay" data-arg="0">${t('tooltip_instant')}</button>
          <button class="toggle-btn${p.tooltip_delay===200?' active':''}" data-action="setTooltipDelay" data-arg="200">${t('tooltip_200ms')}</button>
          <button class="toggle-btn${p.tooltip_delay===500?' active':''}" data-action="setTooltipDelay" data-arg="500">${t('tooltip_500ms')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_confirm_drag')||'Confirm Before Drag-Move'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_confirm_drag_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.confirm_drag_move?'checked':''} data-action="setPref" data-event="change" data-pref-checked="confirm_drag_move"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_confirm_drag')||'Confirm Before Drag-Move'}
          <span title="${t('settings_confirm_drag_info')||'Shows a confirmation dialog before moving an event via drag-and-drop, preventing accidental reschedules.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_event_type')||'Default Event Type'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_default_event_type_desc')}</p>
        <select data-action="setPrefSelect" data-event="change" data-pref-key="default_event_type"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <option value=""${!p.default_event_type?' selected':''}>—</option>
          ${(state.eventTypes||[]).map(et =>
            `<option value="${et.key}"${p.default_event_type===et.key?' selected':''}>${escHtml(et.label||et.key)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_workspace_presets')||'Workspace Presets'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_workspace_presets_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" ${p.workspace_presets_enabled?'checked':''} data-action="setPref" data-event="change" data-pref-checked="workspace_presets_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_workspace_presets')||'Enable Workspace Presets'}
        </label>
        ${p.workspace_presets_enabled ? `
        <div style="margin-bottom:6px">
          ${(p.workspace_presets||[]).map((ws, i) => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:var(--fs-xs)">
              <span style="flex:1;color:var(--text)">${escHtml(ws.name)}</span>
              <button class="btn btn-secondary btn-sm" style="padding:1px 6px;font-size:10px" data-action="loadWorkspacePreset" data-arg="${i}">${t('preset_load')}</button>
              <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" data-action="deleteWorkspacePreset" data-arg="${i}">${t('preset_delete')}</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveWorkspacePreset">${t('preset_save')||'Save Current'}</button>
        ` : ''}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_logbook_decisions')||'Log Book — Decisions'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_logbook_decisions_desc')||'When enabled, the "Decision" category is hidden from Log Book. Decisions will only appear in the dedicated Decisions Log.'}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.logbook_hide_decisions?'checked':''} data-action="setPref" data-event="change" data-pref-checked="logbook_hide_decisions"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_logbook_hide_decisions')||'Hide decisions from Log Book'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_clock_flags')||'Clock Flags'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_clock_flags_desc')||'Show national flags on timezone clocks based on the city of each timezone.'}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.show_clock_flags?'checked':''} data-action="setPref" data-event="change" data-pref-checked="show_clock_flags"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_clock_flags')||'Add flags on clocks'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_view')||'Default View'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','2days','3days','4days','5days','week','2weeks','3weeks'].map(v =>
            `<button class="toggle-btn${(p.default_view||'week')===v?' active':''}" data-action="setDefaultView" data-arg="${v}">${t('range_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_day_visualisation')||'Day Visualisation'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefShowOOH" ${p.show_out_of_hours!==false?'checked':''} data-action="setOOHPref" data-event="change" data-arg-checked
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_out_of_hours')||'Show time outside day hours'}
        </label>
        <div class="hour-range" style="margin-bottom:6px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_day_hours')}:</span>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH2" style="width:52px" data-action="setHourPref" data-event="change">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH2" style="width:52px" data-action="setHourPref" data-event="change">
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefIncludeWeekends2" ${(ex.include_weekends!==false)?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="include_weekends"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_include_weekends')||'Include weekends'}
          <span style="font-size:9px;padding:1px 5px;background:var(--accent);color:white;border-radius:8px;margin-left:2px;vertical-align:middle;font-weight:600">${t('settings_tag_global')||'GLOBAL'}</span>
          <span title="${t('settings_include_weekends_info')||'Show weekends on the timeline and count them in synthetic time calculations.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        ${synthActive() ? `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefSynthLabel2" ${p.synth_label?'checked':''} data-action="setSynthLabelPref" data-event="change" data-arg-checked
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
          <span title="${t('settings_synth_label_info')||'Shows elapsed time (H+N) label next to the current-time line.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefSynthDayOnly2" ${ex.day_hours_only?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="synth_day_hours_only"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('synth_day_hours_only')||'Synthetic time: day hours only'}
          <span style="font-size:9px;padding:1px 5px;background:var(--accent);color:white;border-radius:8px;margin-left:2px;vertical-align:middle;font-weight:600">${t('settings_tag_global')||'GLOBAL'}</span>
          <span title="${t('settings_synth_day_only_info')||'Only count daytime hours in synthetic elapsed time. Night hours are skipped.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>` : ''}
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowDayOfYear" ${p.show_day_of_year?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_day_of_year"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_day_of_year')||'Show day-of-year number (1–365)'}
          <span title="${t('settings_show_day_of_year_info')||'Display the ordinal day number (1–365) in the timeline header.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowDayName" ${p.show_day_name!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_day_name"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_day_name')||'Show name of day'}
          <span title="${t('settings_show_day_name_info')||'Display the weekday name (e.g. Monday, Tuesday) in timeline column headers.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowWelcomeMessage" ${p.show_welcome_message!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_welcome_message"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_welcome_message')||'Show welcome message'}
          <span title="${t('settings_show_welcome_message_info')||'Display the welcome window when logging in.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowWeekNumbers" ${p.show_week_numbers?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_week_numbers"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_week_numbers')||'Show week numbers'}
          <span title="${t('settings_show_week_numbers_info')||'Display ISO week numbers (W1–W52) in the timeline header.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        ${p.show_week_numbers ? `
        <div style="margin-top:4px;margin-left:22px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_week_style')||'Week number style'}:</span>
          <select id="prefWeekStyle" data-action="setPrefSelect" data-event="change" data-pref-key="week_number_style"
            style="margin-left:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            <option value="iso"${(p.week_number_style||'iso')==='iso'?' selected':''}>ISO (W1–W52)</option>
            <option value="year_week"${p.week_number_style==='year_week'?' selected':''}>Year+Week (6-W01)</option>
          </select>
        </div>` : ''}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_view_spacing')||'Vertical Spacing'} <span title="${t('settings_view_spacing_info')||'Adjust the vertical spacing between rows on the timeline.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_view_spacing_desc')||'Vertical spacing multiplier for timeline rows.'}</p>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.view_spacing||1)===1?' active':''}" data-action="setViewSpacing" data-arg="1">1×</button>
          <button class="toggle-btn${p.view_spacing===1.5?' active':''}" data-action="setViewSpacing" data-arg="1.5">1.5×</button>
          <button class="toggle-btn${p.view_spacing===2?' active':''}" data-action="setViewSpacing" data-arg="2">2×</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_event_icons')||'Event Icons'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefShowEventIcons" ${p.show_event_icons!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_event_icons"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_event_icons')||'Show icons on events (type, attachments, etc.)'}
          <span title="${t('settings_show_event_icons_info')||'Display small icons on timeline events indicating their type, attachments, and other attributes.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_hover_zoom')||'Hover Zoom'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefHoverZoom" ${p.hover_zoom_enabled!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="hover_zoom_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_hover_zoom_desc')||'Enlarge calendar events on hover'}
          <span title="${t('settings_hover_zoom_info')||'When enabled, hovering over a timeline event will enlarge it for easier reading.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_red_line')||'Current-time Line'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefRedLine" ${p.red_line_enabled!==false?'checked':''} data-action="setRedLinePref" data-event="change"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_red_line_enabled')||'Show current-time line'}
          <span title="${t('settings_red_line_enabled_info')||'Displays a vertical line on the timeline at the current time position.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="prefSynthLabel" ${p.synth_label?'checked':''} data-action="setSynthLabelPref" data-event="change" data-arg-checked
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
          <span title="${t('settings_synth_label_info')||'Shows elapsed time (H+N) label next to the current-time line.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;font-size:var(--fs-xs);color:var(--text-dim)">
          <span>${t('settings_red_line_color_label')||'Color'}: <span title="${t('settings_red_line_color_label')||'Color of the current-time line.'}" style="cursor:help;color:var(--accent)">ℹ️</span></span>
          <input type="color" id="prefLineColor" value="${p.red_line_color||'#E74C3C'}" data-action="setRedLinePref" data-event="change"
            style="width:32px;height:22px;padding:0;border:none;background:transparent;cursor:pointer">
          <span>${t('settings_red_line_width_label')||'Width (px)'}: <span title="${t('settings_red_line_width_label')||'Width of the current-time line in pixels.'}" style="cursor:help;color:var(--accent)">ℹ️</span></span>
          <input type="number" id="prefLineWidth" min="1" max="8" value="${p.red_line_width||5}" data-action="setRedLinePref" data-event="change"
            style="width:52px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <span>${t('settings_red_line_style_label')||'Line style'}: <span title="${t('settings_red_line_style_label')||'Style of the current-time line.'}" style="cursor:help;color:var(--accent)">ℹ️</span></span>
          <select id="prefLineStyle" data-action="setRedLinePref" data-event="change"
            style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            <option value="solid" ${(p.red_line_style||'dashed')==='solid'?'selected':''}>${t('settings_red_line_style_solid')||'Solid'}</option>
            <option value="dashed" ${(p.red_line_style||'dashed')==='dashed'?'selected':''}>${t('settings_red_line_style_dashed')||'Dashed'}</option>
            <option value="dotted" ${(p.red_line_style||'dashed')==='dotted'?'selected':''}>${t('settings_red_line_style_dotted')||'Dotted'}</option>
          </select>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔔 ${t('settings_push_notifications')||'Browser Notifications'}</div>
        <div id="pushNotifStatus" style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${Notification.permission === 'granted' ? '✅ ' + (t('settings_push_enabled')||'Notifications are enabled') : Notification.permission === 'denied' ? '🚫 ' + (t('settings_push_blocked')||'Blocked — allow in browser settings') : '⚠️ ' + (t('settings_push_not_granted')||'Permission not granted yet')}
        </div>
        ${Notification.permission === 'denied' ? `
        <details style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px;cursor:pointer">
          <summary style="font-weight:600">${t('settings_push_howto')||'How to enable in your browser'}</summary>
          <div style="margin-top:6px;line-height:1.6">
            <p><strong>Chrome:</strong> ${t('push_chrome')||'Click the lock/tune icon in the address bar → Site settings → Notifications → Allow'}</p>
            <p><strong>Edge:</strong> ${t('push_edge')||'Click the lock icon → Permissions for this site → Notifications → Allow'}</p>
            <p><strong>Firefox:</strong> ${t('push_firefox')||'Click the lock icon → Connection secure → More Information → Permissions → Notifications → Allow'}</p>
            <p><strong>Safari:</strong> ${t('push_safari')||'Safari menu → Settings → Websites → Notifications → find this site → Allow'}</p>
          </div>
        </details>` : ''}
        ${Notification.permission !== 'denied' ? `<button class="btn btn-secondary btn-sm" style="margin-bottom:8px" data-action="requestPushPermission">${Notification.permission === 'granted' ? '✓ Granted' : 'Enable Notifications'}</button>` : ''}
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:4px">
          <input type="checkbox" ${p.push_alarms!==false?'checked':''} data-action="setPref" data-event="change" data-pref-checked="push_alarms"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_push_alarms')||'Alarm notifications'}
          <span title="${t('settings_push_alarms_info')||'Receive browser notifications when alarms trigger.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.push_event_changes!==false?'checked':''} data-action="setPref" data-event="change" data-pref-checked="push_event_changes"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_push_event_changes')||'Event changes by other users'}
          <span title="${t('settings_push_event_info')||'Receive browser notifications when other users modify events.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">📅 ${t('settings_auto_busy')||'Auto-busy on activities'} <span title="${t('settings_auto_busy_info')||'When enabled, your status changes to busy during scheduled activities and returns to your previous status afterward.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('settings_auto_busy_desc')||'Automatically set your availability to "busy" while a scheduled activity you are invited to is ongoing.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefAutoBusy" ${p.auto_busy_enabled?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="auto_busy_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_auto_busy')||'Auto-busy on activities'}
          <span title="${t('settings_auto_busy_info')||'When enabled, your status changes to busy during scheduled activities and returns afterward.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">📡 ${t('settings_offline_mode')||'Offline Mode'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('settings_offline_desc')||'When enabled or when network is unavailable, the tool works with locally cached data. Integrations and advanced features are disabled.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefOfflineMode" ${window._offlineModeForced?'checked':''}
            data-action="toggleOfflineMode" data-event="change"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_force_offline')||'Force offline mode'}
          <span title="${t('settings_force_offline_info')||'Force the application into offline mode, using locally cached data only.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <div id="offlineStatus" style="font-size:var(--fs-xs);padding:4px 8px;background:var(--bg3);border-radius:var(--radius)">
          ${window._offlineMode ? '<span style="color:#e05252">● Offline</span>' : '<span style="color:#27ae60">● Online</span>'}
        </div>
      </div>
      <div style="padding:10px 12px;margin:16px 0 12px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px">${t('settings_global_header')||'Global Settings'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${t('settings_global_desc')||'Shared with all users — changes here affect everyone'}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('artificial_time')||'Artificial Time'} <span title="${t('settings_artificial_time_info')||'Override the current time for exercise simulation purposes.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        ${hasRole2(state.user?.role, 'teamlead') ? `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-sm)">
            <input type="checkbox" id="settingsArtTimeEnabled" ${ex.artificial_time_enabled?'checked':''}
              data-action="toggleArtificialTimeSetting" data-event="change"
              style="width:14px;height:14px;accent-color:var(--accent)">
            ${t('artificial_time_enable')||'Enable artificial time'}
          </label>
        </div>
        <div style="margin-bottom:6px">
          <input type="datetime-local" id="settingsArtTime" value="${ex.artificial_time ? fmtDateInput(new Date(ex.artificial_time)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveArtificialTimeSetting">${t('btn_save')||'Save'}</button>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px">${t('artificial_time_desc')||'Set a custom "current time" for exercise simulation'}</div>
        ` : `
        <div style="font-size:var(--fs-sm);color:var(--text)">
          ${ex.artificial_time_enabled
            ? `<span style="color:#27AE60">✓ Active</span> — ${ex.artificial_time ? new Date(ex.artificial_time).toLocaleString() : 'Not set'}`
            : `<span style="color:var(--text-dim)">— Disabled</span>`}
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${t('artificial_time_readonly')||'Contact a team lead or admin to change artificial time settings.'}</div>
        `}
      </div>
      ${synthActive() ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('freeze_label')||'Timeline Freeze'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:0 0 8px">${state.timelinePaused ? (t('freeze_active')||'Timeline is frozen.') : (t('freeze_desc')||'Freeze progression for exercise review.')}</p>
        <button class="btn btn-sm ${state.timelinePaused?'btn-danger':'btn-secondary'}" data-action="toggleFreeze">
          ${state.timelinePaused ? ('▶ '+(t('btn_resume')||'Resume')) : ('⏸ '+(t('btn_freeze')||'Freeze'))}
        </button>
      </div>` : ''}
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_terminology')||'Terminology'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_group_label')||'Group label'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(ex.group_label||'group')==='group'?' active':''}" data-action="setGroupLabel" data-arg="group">Group</button>
          <button class="toggle-btn${ex.group_label==='unit'?' active':''}" data-action="setGroupLabel" data-arg="unit">Unit</button>
          <button class="toggle-btn${ex.group_label==='team'?' active':''}" data-action="setGroupLabel" data-arg="team">Team</button>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_user_label')||'User label'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(ex.user_label||'users')==='users'?' active':''}" data-action="setUserLabel" data-arg="users">Users</button>
          <button class="toggle-btn${ex.user_label==='soldiers'?' active':''}" data-action="setUserLabel" data-arg="soldiers">Soldiers</button>
          <button class="toggle-btn${ex.user_label==='personnel'?' active':''}" data-action="setUserLabel" data-arg="personnel">Personnel</button>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_operation_mode')||'Operation mode'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(ex.operation_mode||'exercise')==='exercise'?' active':''}" data-action="setOperationMode" data-arg="exercise">Exercise</button>
          <button class="toggle-btn${ex.operation_mode==='incident'?' active':''}" data-action="setOperationMode" data-arg="incident">Incident</button>
          <button class="toggle-btn${ex.operation_mode==='operation'?' active':''}" data-action="setOperationMode" data-arg="operation">Operation</button>
        </div>
      </div>
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">✅ ${t('ready_check_title')||'Ready Check'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('ready_check_desc')||'Verify that all activities have been moved from "planned" status before the operation starts. Useful to confirm all preparations are complete.'}</p>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="rcEnabled" ${ex.ready_check_enabled?'checked':''}>
          <label for="rcEnabled" style="font-size:var(--fs-sm)">${t('ready_check_enable')||'Enable ready check'}</label>
        </div>
        <div style="margin-bottom:6px">
          <div class="form-check" style="margin-bottom:4px">
            <input type="radio" name="rcMode" id="rcModeAbsolute" value="absolute" ${!ex.ready_check_use_offset?'checked':''}>
            <label for="rcModeAbsolute" style="font-size:var(--fs-sm)">${t('ready_check_absolute')||'At specific time'}</label>
          </div>
          <input type="datetime-local" id="rcAbsoluteTime" value="${ex.ready_check_time ? fmtDateInput(new Date(ex.ready_check_time)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
          <div class="form-check" style="margin-bottom:4px">
            <input type="radio" name="rcMode" id="rcModeOffset" value="offset" ${ex.ready_check_use_offset?'checked':''}>
            <label for="rcModeOffset" style="font-size:var(--fs-sm)">${t('ready_check_offset')||'Minutes before epoch'}</label>
          </div>
          <input type="number" id="rcOffsetMins" min="0" value="${ex.ready_check_offset_mins||60}" placeholder="60"
            style="width:100px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);margin-left:4px">${t('minutes')||'minutes'}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-action="saveReadyCheckSettings">${t('btn_save')||'Save'}</button>
          <button class="btn btn-secondary btn-sm" data-action="runReadyCheck">▶ ${t('ready_check_run')||'Run Now'}</button>
        </div>
      </div>` : ''}
      ${state.user && state.user.role==='admin' ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="color:var(--danger)">${t('settings_danger_zone')||'Danger Zone'}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div>
            <button class="btn btn-danger btn-sm" data-action="resetDatabase">${t('settings_reset')||'Reset to Empty'}</button>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('settings_reset_desc')||'Removes all data except the audit trail.'}</p>
          </div>
          <div>
            <button class="btn btn-danger btn-sm" data-action="restartBackend">${t('danger_restart_backend')||'Restart Backend'}</button>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('danger_restart_backend_desc')||'Restart the Tidslinjal backend service.'}</p>
          </div>
          <div>
            <button class="btn btn-danger btn-sm" data-action="restartServer">${t('danger_restart_server')||'Restart Server'}</button>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('danger_restart_server_desc')||'Restart the server host. All services will be temporarily unavailable.'}</p>
          </div>
        </div>
      </div>` : ''}
    `;
  }
  // Bind all data-action handlers on the sidebar (CSP-safe)
  _bindActions(el);

  // Load startup text into settings textarea if settings tab is active
  if (tab === 'settings') {
    setTimeout(_loadStartupTextInput, 50);
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
  state.preferences.red_line_width   = parseInt(document.getElementById('prefLineWidth')?.value || '5', 10);
  state.preferences.red_line_style   = document.getElementById('prefLineStyle')?.value || 'dashed';
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}

async function setSynthLabelPref(val) {
  state.preferences.synth_label = val;
  await savePreferences();
  updateCurrentTimeLine(getDays(), getSlotHeight());
}

async function setTacticalFontPref(val) {
  state.preferences.tactical_font_enabled = val;
  await savePreferences();
  _applyTacticalFont();
}

async function setTacticalFontFamily(val) {
  state.preferences.tactical_font_family = val;
  await savePreferences();
  _applyTacticalFont();
}

function _applyTacticalFont() {
  const p = state.preferences;
  if (p.tactical_font_enabled && p.tactical_font_family) {
    document.documentElement.style.setProperty('--tactical-font', p.tactical_font_family);
    document.body.classList.add('tactical-font-enabled');
  } else {
    document.body.classList.remove('tactical-font-enabled');
  }
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
  const artTimeEnabled   = document.getElementById('exArtificialTimeEnabled')?.checked || false;
  const artTimeVal       = document.getElementById('exArtificialTime')?.value;
  const ex = state.exercise || {};
  const payload = {
    enabled,
    epoch: epoch ? new Date(epoch).toISOString() : '',
    endex: endex ? new Date(endex).toISOString() : '',
    label,
    day_hours_only: dayHrsOnly,
    include_weekends: includeWeekends,
    group_label: ex.group_label || 'group',
    ex_index: exIndex,
    artificial_time_enabled: artTimeEnabled,
    artificial_time: artTimeVal ? new Date(artTimeVal).toISOString() : '',
    // Preserve ready check settings
    ready_check_enabled: ex.ready_check_enabled || false,
    ready_check_time: ex.ready_check_time || '',
    ready_check_offset_mins: ex.ready_check_offset_mins || 0,
    ready_check_use_offset: ex.ready_check_use_offset || false,
    // Preserve icon set
    icon_set: ex.icon_set || 'emoji',
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

// ── Ready Check settings ───────────────────────────────────────────────────

async function saveReadyCheckSettings() {
  const ex = state.exercise || {};
  const rcEnabled = document.getElementById('rcEnabled')?.checked || false;
  const rcUseOffset = document.getElementById('rcModeOffset')?.checked || false;
  const rcTimeVal = document.getElementById('rcAbsoluteTime')?.value;
  const rcOffsetMins = parseInt(document.getElementById('rcOffsetMins')?.value || '60', 10);
  const payload = {
    ...ex,
    ready_check_enabled: rcEnabled,
    ready_check_use_offset: rcUseOffset,
    ready_check_time: rcTimeVal ? new Date(rcTimeVal).toISOString() : '',
    ready_check_offset_mins: rcOffsetMins,
  };
  const res = await apiPut('/api/exercise', payload);
  if (res.ok) {
    state.exercise = await res.json();
    showNotification('success', t('notif_saved')||'Saved');
    renderSidebar();
  } else {
    const err = await res.json().catch(()=>({}));
    showError(err.error || 'Failed to save');
  }
}

// ── OIDC settings helpers ──────────────────────────────────────────────────

function _setOIDCStatusBar(enabled, issuer, active) {
  const dot   = document.getElementById('oidcStatusDot');
  const label = document.getElementById('oidcStatusLabel');
  const detail = document.getElementById('oidcStatusDetail');
  if (!dot || !label) return;
  if (active) {
    dot.style.background = '#2ECC71';
    label.textContent = 'SSO Active';
    try {
      detail.textContent = 'Provider: ' + new URL(issuer).hostname;
    } catch { detail.textContent = 'Provider: ' + (issuer || ''); }
  } else if (enabled && issuer) {
    dot.style.background = '#E67E22';
    label.textContent = 'Configured but not yet active';
    detail.textContent = issuer;
  } else {
    dot.style.background = '#888';
    label.textContent = 'Not configured';
    detail.textContent = 'Fill in Issuer URL, Client ID, and Client Secret, then save.';
  }
}

async function _initOIDCSettingsUI() {
  const data = await apiGet('/api/admin/oidc');
  if (!data) return;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  setVal('oidcIssuer', data.issuer);
  setVal('oidcClientID', data.client_id);
  setVal('oidcRedirectURL', data.redirect_url);
  setVal('oidcDefaultRole', data.default_role || 'teammember');
  setChk('oidcExclusive', data.exclusive);
  setChk('oidcEnabled', data.enabled);

  // Clear password field; show hint if secret exists
  const secretEl  = document.getElementById('oidcClientSecret');
  const secretHint = document.getElementById('oidcSecretHint');
  if (secretEl) {
    secretEl.value = '';
    secretEl.placeholder = data.has_secret ? '(secret saved — leave blank to keep)' : '••••••••';
  }
  if (secretHint) {
    secretHint.textContent = data.has_secret
      ? '✓ A client secret is currently saved.'
      : 'No client secret saved yet.';
    secretHint.style.color = data.has_secret ? 'var(--success, #2ecc71)' : 'var(--text-dim)';
  }

  // Determine if OIDC is currently active in-memory (check public config endpoint)
  let active = false;
  try {
    const r = await fetch('/api/auth/oidc-config');
    active = r.ok;
  } catch { /* ok */ }

  _setOIDCStatusBar(data.enabled, data.issuer, active);
}

async function saveOIDCSettings() {
  const getVal = id => document.getElementById(id)?.value?.trim() || '';
  const getChk = id => document.getElementById(id)?.checked || false;
  const payload = {
    enabled:       getChk('oidcEnabled'),
    issuer:        getVal('oidcIssuer'),
    client_id:     getVal('oidcClientID'),
    client_secret: getVal('oidcClientSecret'),
    redirect_url:  getVal('oidcRedirectURL'),
    exclusive:     getChk('oidcExclusive'),
    default_role:  getVal('oidcDefaultRole'),
  };
  const res = await api('PUT', '/api/admin/oidc', payload);
  if (res.ok) {
    showNotification('success', t('notif_saved') || 'Saved');
    setTimeout(_initOIDCSettingsUI, 0);
    // After save, auto-run test so admin sees immediate feedback
    setTimeout(runOIDCTest, 300);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save OIDC settings');
  }
}

// runOIDCTest — calls the backend diagnostic endpoint and renders step-by-step results
async function runOIDCTest() {
  const panel  = document.getElementById('oidcTestResult');
  const steps  = document.getElementById('oidcTestSteps');
  const summary = document.getElementById('oidcTestSummary');
  if (!panel) return;

  panel.style.display = '';
  steps.innerHTML = '<em style="color:var(--text-dim)">Running diagnostics…</em>';
  summary.textContent = '';

  try {
    const res  = await api('POST', '/api/admin/oidc/test', {});
    const data = await res.json().catch(() => ({}));

    if (!data.steps || !Array.isArray(data.steps)) {
      steps.innerHTML = '<span style="color:#E74C3C">Unexpected response from server.</span>';
      return;
    }

    steps.innerHTML = data.steps.map(s => {
      const icon   = s.ok ? '✅' : '❌';
      const color  = s.ok ? '#2ECC71' : '#E74C3C';
      const detail = s.detail ? `<div style="color:var(--text-dim);margin-left:20px;word-break:break-all">${escHtml(s.detail)}</div>` : '';
      return `<div style="margin-bottom:4px">
        ${icon} <span style="color:${color};font-weight:600">${escHtml(s.step)}</span>
        — <span>${escHtml(s.message)}</span>
        ${detail}
      </div>`;
    }).join('');

    const ok = data.overall;
    summary.style.background = ok ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)';
    summary.style.color       = ok ? '#2ECC71' : '#E74C3C';
    summary.textContent       = (ok ? '✅ ' : '❌ ') + (data.summary || (ok ? 'All checks passed.' : 'Some checks failed.'));

    // Update the status bar to reflect test results
    const issuerEl = document.getElementById('oidcIssuer');
    _setOIDCStatusBar(true, issuerEl?.value || '', ok);
  } catch (err) {
    steps.innerHTML = `<span style="color:#E74C3C">Test failed: ${escHtml(String(err))}</span>`;
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
  setVal('profileTelephone',   u.telephone || '');
  setVal('profileCellular',    u.cellular || '');
  setVal('profileTitle',       u.title || '');
  setVal('profileRank',        u.rank || '');
  setVal('profileJobRole',     u.job_role || '');
  setVal('profileExpertise',   u.expertise || '');
  setVal('profileLocation',    u.location || '');
  setVal('profileLatitude',    u.latitude || '');
  setVal('profileLongitude',   u.longitude || '');
  setVal('profileAvailability', u.availability || 'free');
  // Profile photo
  const preview = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('profilePhotoRemove');
  if (u.photo_data_url) {
    if (preview) { preview.src = u.photo_data_url; preview.style.display = ''; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = '';
  } else {
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (placeholder) placeholder.style.display = '';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  // Password policy
  _loadProfilePwdPolicy();

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
  // Reset strength indicator
  const profBar = document.getElementById('profilePwdStrengthBar');
  const profLbl = document.getElementById('profilePwdStrengthLabel');
  if (profBar) { profBar.style.width = '0%'; profBar.style.background = '#ccc'; }
  if (profLbl) profLbl.textContent = '';
  // Show SSO banner for OIDC accounts
  const isSSO = u.is_oidc;
  const ssoBanner   = document.getElementById('profilePwdSSOBanner');
  const pwdFields   = document.getElementById('profilePwdFields');
  if (ssoBanner) ssoBanner.style.display = isSSO ? '' : 'none';
  if (pwdFields) pwdFields.style.display  = isSSO ? 'none' : '';

  // Account info section
  const info = document.getElementById('profileInfo');
  if (info) {
    const groups = u.groups || [];
    const groupList = groups.length
      ? `<p>Groups/Units: ${groups.map(g => `<strong>${escHtml(g.name)}</strong> (${g.role})`).join(', ')}</p>`
      : '';
    const lastLogin = u.last_login_at
      ? `<p>${t('user_last_login')||'Last login'}: ${fmtDateTime(new Date(u.last_login_at))}${u.last_login_domain ? ` ${t('from')||'from'} <em>${escHtml(u.last_login_domain)}</em>` : u.last_login_ip ? ` ${t('from')||'from'} ${escHtml(u.last_login_ip)}` : ''}</p>`
      : '';
    const accountType = u.is_oidc
      ? `<p>${t('user_account_type')||'Account type'}: <span style="color:var(--accent)">SSO / OIDC</span></p>`
      : `<p>${t('user_account_type')||'Account type'}: ${t('user_local_account')||'Local account'}</p>`;
    info.innerHTML = `
      <p>${t('user_member_since')||'Member since'}: ${u.created_at ? fmtDateTime(new Date(u.created_at)) : '—'}</p>
      <p>${t('user_login_count')||'Logins'}: ${u.login_count || 0}</p>
      ${u.nato_designations && u.nato_designations.length ? `<p>${t('user_nato_designations')||'NATO Designations'}: ${u.nato_designations.join(', ')}</p>` : ''}
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

  renderProfileAvatars();
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

  // Save profile fields, communication handles, photo
  const photoPreview = document.getElementById('profilePhotoPreview');
  const photoDataURL = (photoPreview && photoPreview.style.display !== 'none') ? (photoPreview.src || '') : '';
  await api('PUT', '/api/auth/profile', {
    mattermost_handle: val('profileMattermost'),
    discord_handle:    val('profileDiscord'),
    signal_handle:     val('profileSignal'),
    telephone:         val('profileTelephone'),
    cellular:          val('profileCellular'),
    title:             val('profileTitle'),
    rank:              val('profileRank'),
    job_role:          val('profileJobRole'),
    expertise:         val('profileExpertise'),
    photo_data_url:    photoDataURL,
    location:          val('profileLocation'),
    latitude:          parseFloat(val('profileLatitude')) || 0,
    longitude:         parseFloat(val('profileLongitude')) || 0,
    availability:      document.getElementById('profileAvailability')?.value || 'free',
  }).catch(() => {});

  // Save language preference
  if (lang) {
    await setPref('language', lang);
  }

  // Change password if provided
  if (newPw) {
    if (!curPw) { showError(t('current_password_required') || 'Current password is required'); return; }
    if (newPw !== conPw) { showError(t('password_mismatch') || 'Passwords do not match'); return; }
    const res = await apiPost('/api/auth/change-password', {current_password: curPw, new_password: newPw});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err.error || 'Failed to change password').replace(/^password_quality:\s*/,'').replace(/^oidc_account:\s*/,'');
      showError(msg);
      return;
    }
  }

  closeModal('profileModal');
  showNotification('success', 'Profile updated');
}

// ── Profile Photo helpers ─────────────────────────────────────────────────────
function loadProfilePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 1_000_000) { showError('Photo must be under 1 MB'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('profilePhotoPreview');
    const placeholder = document.getElementById('profilePhotoPlaceholder');
    const removeBtn = document.getElementById('profilePhotoRemove');
    if (preview) { preview.src = e.target.result; preview.style.display = ''; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = '';
  };
  reader.readAsDataURL(file);
}

function removeProfilePhoto() {
  const preview = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('profilePhotoRemove');
  const input = document.getElementById('profilePhotoInput');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = '';
  if (removeBtn) removeBtn.style.display = 'none';
  if (input) input.value = '';
}

// ── Default avatar picker ─────────────────────────────────────────────────────
const _DEFAULT_AVATARS = [
  { id: 'person',  label: 'Person',     svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#3a5a8a"/><circle cx="40" cy="30" r="13" fill="#c8a07a"/><ellipse cx="40" cy="72" rx="24" ry="20" fill="#c8a07a"/><rect x="16" y="60" width="48" height="24" rx="4" fill="#3a5a8a"/></svg>` },
  { id: 'soldier', label: 'Soldier',    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#3d5228"/><circle cx="40" cy="30" r="13" fill="#c8a07a"/><rect x="22" y="20" width="36" height="14" rx="4" fill="#253418"/><rect x="18" y="50" width="44" height="30" rx="4" fill="#4a6030"/></svg>` },
  { id: 'tech',    label: 'Tech',       svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#1a304a"/><rect x="24" y="20" width="32" height="28" rx="5" fill="#4090c0"/><circle cx="33" cy="32" r="5" fill="#e0f0ff"/><circle cx="47" cy="32" r="5" fill="#e0f0ff"/><rect x="30" y="42" width="20" height="5" rx="2" fill="#80d0ff"/><rect x="33" y="50" width="6" height="14" rx="3" fill="#4090c0"/><rect x="41" y="50" width="6" height="14" rx="3" fill="#4090c0"/></svg>` },
  { id: 'star',    label: 'Star Badge', svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#1a2a50"/><polygon points="40,16 46,34 65,34 51,46 56,64 40,53 24,64 29,46 15,34 34,34" fill="#f0c030"/></svg>` },
  { id: 'cat',     label: 'Cat',        svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#4a3060"/><polygon points="20,32 28,50 14,50" fill="#c09060"/><polygon points="60,32 66,50 52,50" fill="#c09060"/><circle cx="40" cy="44" r="22" fill="#c09060"/><circle cx="33" cy="42" r="4" fill="#1a0a00"/><circle cx="47" cy="42" r="4" fill="#1a0a00"/><ellipse cx="40" cy="52" rx="5" ry="3" fill="#d08080"/></svg>` },
  { id: 'bear',    label: 'Bear',       svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#3a2010"/><circle cx="26" cy="26" r="10" fill="#8a6040"/><circle cx="54" cy="26" r="10" fill="#8a6040"/><circle cx="40" cy="44" r="22" fill="#8a6040"/><circle cx="33" cy="41" r="4" fill="#1a0a00"/><circle cx="47" cy="41" r="4" fill="#1a0a00"/><ellipse cx="40" cy="52" rx="8" ry="6" fill="#b08060"/><circle cx="40" cy="49" r="3" fill="#1a0a00"/></svg>` },
  { id: 'shield',  label: 'Shield',     svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#2a1a40"/><path d="M40 12 L64 22 L64 44 Q64 64 40 72 Q16 64 16 44 L16 22 Z" fill="#4060c0" stroke="#6080e0" stroke-width="2"/><polygon points="40,28 44,38 55,38 46,44 50,55 40,49 30,55 34,44 25,38 36,38" fill="#f0d060"/></svg>` },
  { id: 'pilot',   label: 'Pilot',      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#202840"/><ellipse cx="40" cy="36" rx="20" ry="22" fill="#3060a0"/><rect x="20" y="28" width="40" height="14" rx="3" fill="#506090"/><rect x="26" y="31" width="28" height="8" rx="2" fill="#80d0ff" opacity=".7"/><ellipse cx="40" cy="62" rx="22" ry="16" fill="#3060a0"/></svg>` },
];

function renderProfileAvatars() {
  const grid = document.getElementById('profileAvatarGrid');
  if (!grid) return;
  grid.innerHTML = _DEFAULT_AVATARS.map(a =>
    `<div title="${escHtml(a.label)}" data-action="selectDefaultAvatar" data-arg="${a.id}"
      class="avatar-pick"
      style="width:32px;height:32px;border-radius:50%;overflow:hidden;cursor:pointer;
             border:2px solid var(--border);transition:border-color .15s,transform .15s;flex-shrink:0">${a.svg}</div>`
  ).join('');
  grid.querySelectorAll('.avatar-pick').forEach(el => {
    el.addEventListener('mouseover', () => { el.style.borderColor = 'var(--accent)'; el.style.transform = 'scale(1.1)'; });
    el.addEventListener('mouseout', () => { el.style.borderColor = 'var(--border)'; el.style.transform = 'scale(1)'; });
  });
  _bindActions(grid);
}

function selectDefaultAvatar(id) {
  const avatar = _DEFAULT_AVATARS.find(a => a.id === id);
  if (!avatar) return;
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatar.svg);
  const preview = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const removeBtn = document.getElementById('profilePhotoRemove');
  if (preview) { preview.src = dataUrl; preview.style.display = ''; }
  if (placeholder) placeholder.style.display = 'none';
  if (removeBtn) removeBtn.style.display = '';
}

// ── Profile language change handler ──────────────────────────────────────────
function onProfileLanguageChange(lang) {
  state.preferences.language = lang;
  applyPreferences();
  updateUILabels();
  // Refresh all data-i18n elements inside the profile modal immediately
  document.querySelectorAll('#profileModal [data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated && translated !== key) el.textContent = translated;
  });
}

// ── Password Policy helpers ───────────────────────────────────────────────────
let _cachedPasswordPolicy = null;

async function _loadProfilePwdPolicy() {
  try {
    if (!_cachedPasswordPolicy) {
      _cachedPasswordPolicy = await apiGet('/api/auth/password-policy').catch(() => null);
    }
    const ss = _cachedPasswordPolicy;
    const infoEl = document.getElementById('profilePwdPolicyInfo');
    if (!infoEl || !ss || !ss.password_policy_enabled) return;
    const rules = [];
    if (ss.min_length > 0) rules.push(`Min. ${ss.min_length} characters`);
    if (ss.require_uppercase) rules.push('Uppercase (A–Z)');
    if (ss.require_lowercase) rules.push('Lowercase (a–z)');
    if (ss.require_numbers)   rules.push('Numbers (0–9)');
    if (ss.require_symbols)   rules.push('Symbols (!@#…)');
    if (rules.length) {
      infoEl.style.display = '';
      infoEl.textContent = '🔐 Password policy: ' + rules.join(' · ');
    }
  } catch { /* policy load is best-effort */ }
}

async function _loadStandalonePwdPolicy() {
  try {
    if (!_cachedPasswordPolicy) {
      _cachedPasswordPolicy = await apiGet('/api/auth/password-policy').catch(() => null);
    }
    const ss = _cachedPasswordPolicy;
    const infoEl = document.getElementById('pwdPolicyInfo');
    if (!infoEl || !ss || !ss.password_policy_enabled) return;
    const rules = [];
    if (ss.min_length > 0) rules.push(`Min. ${ss.min_length} characters`);
    if (ss.require_uppercase) rules.push('Uppercase (A–Z)');
    if (ss.require_lowercase) rules.push('Lowercase (a–z)');
    if (ss.require_numbers)   rules.push('Numbers (0–9)');
    if (ss.require_symbols)   rules.push('Symbols (!@#…)');
    if (rules.length) {
      infoEl.style.display = '';
      infoEl.textContent = '🔐 Password policy: ' + rules.join(' · ');
    }
  } catch { /* best-effort */ }
}

function _generatePassword(policy) {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const syms   = '!@#$%^&*-_=+?';
  const minLen = (policy && policy.min_length > 0) ? Math.max(policy.min_length, 12) : 12;
  let chars = lower + upper + digits;
  let pwd = [];
  if (!policy || policy.require_uppercase) { pwd.push(upper[Math.floor(Math.random()*upper.length)]); }
  if (!policy || policy.require_lowercase) { pwd.push(lower[Math.floor(Math.random()*lower.length)]); }
  if (!policy || policy.require_numbers)   { pwd.push(digits[Math.floor(Math.random()*digits.length)]); }
  if (policy && policy.require_symbols)    { pwd.push(syms[Math.floor(Math.random()*syms.length)]); chars += syms; }
  while (pwd.length < minLen) {
    pwd.push(chars[Math.floor(Math.random()*chars.length)]);
  }
  // Shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}

async function generateProfilePassword() {
  const policy = _cachedPasswordPolicy || await apiGet('/api/auth/password-policy').catch(() => null);
  _cachedPasswordPolicy = policy;
  const pw = _generatePassword(policy);
  const inp = document.getElementById('profilePwdNew');
  const conf = document.getElementById('profilePwdConfirm');
  const copyBtn = document.getElementById('profilePwdCopyBtn');
  if (inp) { inp.value = pw; inp.type = 'text'; updatePwdStrength('profilePwdNew','profilePwdStrengthBar','profilePwdStrengthLabel'); }
  if (conf) conf.value = pw;
  if (copyBtn) copyBtn.style.display = '';
}

function copyProfilePassword() {
  const inp = document.getElementById('profilePwdNew');
  if (!inp || !inp.value) return;
  navigator.clipboard.writeText(inp.value).then(() => showNotification('success', 'Password copied to clipboard')).catch(() => {
    prompt('Copy this password:', inp.value);
  });
}

async function generateStandalonePassword() {
  const policy = _cachedPasswordPolicy || await apiGet('/api/auth/password-policy').catch(() => null);
  _cachedPasswordPolicy = policy;
  const pw = _generatePassword(policy);
  const inp = document.getElementById('pwdNew');
  const conf = document.getElementById('pwdConfirm');
  const copyBtn = document.getElementById('pwdCopyBtn');
  if (inp) { inp.value = pw; inp.type = 'text'; updatePwdStrength('pwdNew','pwdStrengthBar','pwdStrengthLabel'); }
  if (conf) conf.value = pw;
  if (copyBtn) copyBtn.style.display = '';
}

function copyStandalonePassword() {
  const inp = document.getElementById('pwdNew');
  if (!inp || !inp.value) return;
  navigator.clipboard.writeText(inp.value).then(() => showNotification('success', 'Password copied to clipboard')).catch(() => {
    prompt('Copy this password:', inp.value);
  });
}

// ── Password Strength Meter ───────────────────────────────────────────────────
// updatePwdStrength(inputId, barId, labelId) — call from oninput on password fields.
// Computes a 0–4 score and updates the visual bar + label.
function updatePwdStrength(inputId, barId, labelId) {
  const pw  = document.getElementById(inputId)?.value || '';
  const bar = document.getElementById(barId);
  const lbl = document.getElementById(labelId);
  if (!bar || !lbl) return;

  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // clamp to 4
  score = Math.min(score, 4);

  const pct   = pw.length === 0 ? 0 : Math.max(10, score * 25);
  const color = ['#ccc','#e74c3c','#e67e22','#f1c40f','#27ae60'][score];
  const label = ['','Very weak','Weak','Fair','Strong','Very strong'][pw.length === 0 ? 0 : score + (score === 4 ? 0 : 0)];
  // Simpler label map
  const labels = {0:'',1:'Very weak',2:'Weak',3:'Fair',4:'Strong'};
  bar.style.width = pct + '%';
  bar.style.background = color;
  lbl.textContent = pw.length === 0 ? '' : (labels[score] || '');
  lbl.style.color = color;
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

// ── Syslog Config UI ─────────────────────────────────────────────────────────
async function _initSyslogSettingsUI() {
  try {
    const cfg = await apiGet('/api/integrations/syslog');
    if (!cfg) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    const setCb  = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    setCb('syslogEnabled', cfg.enabled);
    setVal('syslogHost',      cfg.host);
    setVal('syslogPort',      cfg.port || '');
    setVal('syslogTransport', cfg.transport || 'udp');
    setVal('syslogFormat',    cfg.format || 'classic');
    setVal('syslogAppName',   cfg.app_name);
    setVal('syslogFacility',  cfg.facility ?? 1);
    setCb('syslogTLSVerify',  cfg.tls_verify !== false);
  } catch { /* syslog not configured yet */ }
}

async function saveSyslogConfig() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const cfg = {
    enabled:    document.getElementById('syslogEnabled')?.checked || false,
    host:       val('syslogHost'),
    port:       parseInt(val('syslogPort'), 10) || 0,
    transport:  val('syslogTransport') || 'udp',
    format:     val('syslogFormat') || 'classic',
    app_name:   val('syslogAppName'),
    facility:   parseInt(val('syslogFacility'), 10) || 1,
    tls_verify: document.getElementById('syslogTLSVerify')?.checked !== false,
  };
  const res = await api('PUT', '/api/integrations/syslog', cfg);
  if (res.ok) {
    showNotification('success', 'Syslog settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save syslog settings');
  }
}

async function testSyslogConfig() {
  const res = await api('POST', '/api/integrations/syslog/test', {});
  if (res.ok) {
    const d = await res.json();
    showNotification('success', `Syslog test message sent via ${d.transport} to ${d.host}`);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Syslog test failed');
  }
}

// ── Security Settings UI ──────────────────────────────────────────────────────
async function _initSecuritySettingsUI() {
  // Wire up geoblocking country names display on input change
  const geoInput = document.getElementById('secGeoCountries');
  if (geoInput) geoInput.addEventListener('input', _updateGeoCountryNames);
  try {
    const ss = await apiGet('/api/admin/security');
    if (!ss) return;
    const setCb  = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setCb('secPolicyEnabled', ss.password_policy_enabled);
    setVal('secMinLength',    ss.min_length || 8);
    setCb('secReqUpper',    ss.require_uppercase);
    setCb('secReqLower',    ss.require_lowercase);
    setCb('secReqNumbers',  ss.require_numbers);
    setCb('secReqSymbols',  ss.require_symbols);
  } catch { /* not configured yet */ }
}

async function saveSecuritySettings() {
  const cb  = id => document.getElementById(id)?.checked || false;
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const ss = {
    password_policy_enabled: cb('secPolicyEnabled'),
    min_length:       parseInt(val('secMinLength'), 10) || 8,
    require_uppercase: cb('secReqUpper'),
    require_lowercase: cb('secReqLower'),
    require_numbers:   cb('secReqNumbers'),
    require_symbols:   cb('secReqSymbols'),
  };
  const res = await api('PUT', '/api/admin/security', ss);
  if (res.ok) {
    showNotification('success', 'Password policy saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save password policy');
  }
}

// ── Security tab action handlers ──────────────────────────────────────────────
function toggleSecTlsDetails() {
  const det = document.getElementById('secTlsDetails');
  const btn = document.getElementById('secTlsToggleDetails');
  if (det && btn) {
    const show = det.style.display === 'none';
    det.style.display = show ? '' : 'none';
    btn.textContent = show ? (t('security_tls_hide_details')||'Hide Details') : (t('security_tls_details')||'Show Details');
  }
}

function toggleSecOidcDetails() {
  const det = document.getElementById('secOidcDetails');
  const btn = document.getElementById('secOidcToggleDetails');
  if (det && btn) {
    const show = det.style.display === 'none';
    det.style.display = show ? '' : 'none';
    btn.textContent = show ? (t('security_oidc_hide_details')||'Hide Details') : (t('security_oidc_details')||'Show Details');
  }
}

async function saveSecSsoEnabled() {
  const enabled = document.getElementById('secSsoEnabled')?.checked || false;
  const res = await api('PUT', '/api/admin/sso-toggle', { enabled });
  if (res.ok) {
    showNotification('success', t('security_sso_saved')||'SSO settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save SSO settings');
  }
}

async function saveSecRateLimits() {
  const val = id => parseInt(document.getElementById(id)?.value || '0', 10);
  const payload = {
    login_limit: val('secRateLogin') || 10,
    registration_limit: val('secRateReg') || 5,
    password_reset_limit: val('secRateReset') || 5,
  };
  const res = await api('PUT', '/api/admin/rate-limits', payload);
  if (res.ok) {
    showNotification('success', t('security_rate_saved')||'Rate limiting settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save rate limits');
  }
}

function _updateGeoCountryNames() {
  const el = document.getElementById('secGeoCountryNames');
  const input = document.getElementById('secGeoCountries');
  if (!el || !input) return;
  const codes = (input.value || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (codes.length === 0) { el.textContent = ''; return; }
  const names = codes.map(c => {
    const name = countryName(c);
    return name !== c ? `${countryAbbr(c)} (${name})` : c;
  });
  el.textContent = names.join(', ');
}

async function saveSecGeoblock() {
  const enabled = document.getElementById('secGeoEnabled')?.checked || false;
  const mode = document.getElementById('secGeoMode')?.value || 'allowlist';
  const countries = (document.getElementById('secGeoCountries')?.value || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  const res = await api('PUT', '/api/admin/geoblocking', { enabled, mode, countries });
  if (res.ok) {
    showNotification('success', t('security_geo_saved')||'Geoblocking settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save geoblocking settings');
  }
}

async function saveSecEncryption() {
  const enabled = document.getElementById('secEncryptionEnabled')?.checked || false;
  const res = await api('PUT', '/api/admin/encryption', { enabled });
  if (res.ok) {
    showNotification('success', t('security_encryption_saved')||'Backup encryption settings saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save encryption settings');
  }
}

async function restartBackend() {
  if (!confirm(t('danger_restart_confirm')||'Are you sure you want to restart? This will interrupt all active sessions.')) return;
  const res = await api('POST', '/api/admin/restart-backend', {});
  if (res.ok) {
    showNotification('success', 'Backend restart initiated. Reconnecting…');
    setTimeout(() => { window.location.reload(); }, 3000);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to restart backend');
  }
}

async function restartServer() {
  if (!confirm(t('danger_server_confirm')||'Are you sure you want to restart the server? ALL services will be down temporarily.')) return;
  const res = await api('POST', '/api/admin/restart-server', {});
  if (res.ok) {
    showNotification('success', 'Server restart initiated. Please wait…');
    setTimeout(() => { window.location.reload(); }, 10000);
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to restart server');
  }
}

// ── TLS Config UI ─────────────────────────────────────────────────────────────
async function _initTLSConfigUI() {
  const statusEl = document.getElementById('tlsCurrentStatus');
  try {
    const cfg = await apiGet('/api/integrations/tls');
    if (!cfg) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('tlsCertFile', cfg.cert_file);
    setVal('tlsKeyFile',  cfg.key_file);
    if (statusEl) {
      const active = cfg.cert_file && cfg.key_file;
      statusEl.innerHTML = active
        ? `<span style="color:#27ae60">✓ TLS configured</span> — cert: <code>${escHtml(cfg.cert_file)}</code>`
        : `<span style="color:var(--text-dim)">TLS not configured (server running on HTTP)</span>`;
    }
  } catch {
    if (statusEl) statusEl.textContent = 'Could not load TLS status.';
  }
}

async function saveTLSConfig() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const cfg = {
    cert_file: val('tlsCertFile'),
    key_file:  val('tlsKeyFile'),
  };
  const res = await api('PUT', '/api/integrations/tls', cfg);
  if (res.ok) {
    showNotification('success', 'TLS config saved — restart the server to apply');
    _initTLSConfigUI();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save TLS config');
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
          <span style="color:var(--text-dim);font-size:var(--fs-xs);display:block">Created: ${k.created_at ? new Date(k.created_at).toLocaleString() : '—'}${k.last_used_at ? ` · Last used: ${new Date(k.last_used_at).toLocaleString()}` : ''}</span>
        </div>
        <button class="btn btn-danger btn-sm" data-action="deleteAPIKey" data-arg="${k.id}">Delete</button>
      </div>
    `).join('');
    _bindActions(listEl);
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
    // Show the key in a modal with a copyable field
    const keyModal = document.createElement('div');
    keyModal.className = 'modal-overlay open';
    keyModal.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header"><h3>${t('api_key_created')||'API Key Created'}</h3>
          <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button></div>
        <div class="modal-body">
          <p style="font-size:var(--fs-sm);margin-bottom:8px">${t('api_key_copy_warning')||'Copy this key now — it will not be shown again.'}</p>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="apiKeyResult" value="${escHtml(key.key)}" readonly
              style="flex:1;font-family:monospace;font-size:var(--fs-sm);padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);user-select:all"
              data-action="selectSelf" data-arg-el data-event="click">
            <button class="btn btn-primary btn-sm" data-action="copyApiKey">📋 ${t('btn_copy')||'Copy'}</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
        </div>
      </div>`;
    document.body.appendChild(keyModal);
    _bindActions(keyModal);
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

// ── Connectors list UI ──────────────────────────────────────────────────────
async function _loadConnectorList() {
  const listEl = document.getElementById('connectorList');
  if (!listEl) return;
  // Connector management requires admin role
  if (state.user?.role !== 'admin') {
    listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-xs)">${t('connectors_admin_only')||'Connector configuration is available to administrators only.'}</p>`;
    return;
  }
  try {
    const configs = await apiGet('/api/integrations/connectors');
    if (!configs || !configs.length) {
      listEl.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-xs)">${t('connectors_none')||'No connectors configured. Available connectors: Google Calendar, STIX/TAXII, RSS, Generic Webhook.'}</p>`;
      return;
    }
    listEl.innerHTML = configs.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(c.name)}</strong>
          <span style="color:${c.enabled ? 'var(--accent)' : 'var(--text-dim)'};font-size:var(--fs-xs);margin-left:6px">${c.enabled ? '● Active' : '○ Disabled'}</span>
        </div>
        <button class="btn btn-sm ${c.enabled ? 'btn-danger' : 'btn-secondary'}" data-action="toggleConnector" data-arg="${c.name}">
          ${c.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
    `).join('');
    _bindActions(listEl);
  } catch {
    listEl.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load connectors.</p>';
  }
}

async function toggleConnector(name) {
  const configs = await apiGet('/api/integrations/connectors').catch(() => []);
  const cfg = (configs || []).find(c => c.name === name);
  if (!cfg) return;
  cfg.enabled = !cfg.enabled;
  const res = await apiPut('/api/integrations/connectors', cfg);
  if (res.ok) {
    showNotification('success', `Connector ${name} ${cfg.enabled ? 'enabled' : 'disabled'}`);
    await _loadConnectorList();
  }
}

// ── Federated IdPs ──────────────────────────────────────────────────────────
async function _loadFederatedIdPs() {
  const el = document.getElementById('federatedIdPList');
  if (!el) return;
  try {
    const idps = await apiGet('/api/federation/idps');
    if (!idps || !idps.length) {
      el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No federated identity providers configured.</p>';
      return;
    }
    el.innerHTML = idps.map(idp => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(idp.name)}</strong>
          <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:4px">(${idp.protocol.toUpperCase()})</span>
          <span style="color:${idp.enabled?'var(--accent)':'var(--text-dim)'};font-size:var(--fs-xs);margin-left:4px">${idp.enabled?'● Active':'○ Disabled'}</span>
          ${idp.trust_realm ? `<br><span style="font-size:10px;color:var(--text-dim)">Realm: ${escHtml(idp.trust_realm)}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-danger" data-action="deleteFederatedIdP" data-arg="${idp.id}">✕</button>
      </div>
    `).join('');
    _bindActions(el);
  } catch {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load IdPs.</p>';
  }
}

async function saveFederatedIdP() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const idp = {
    id: val('fedIdpId'), name: val('fedIdpName'), protocol: val('fedIdpProtocol'),
    issuer: val('fedIdpIssuer'), client_id: val('fedIdpClientId'),
    client_secret: val('fedIdpSecret'), trust_realm: val('fedIdpRealm'),
    default_role: val('fedIdpRole'), enabled: true,
    allowed_domains: val('fedIdpDomains') ? val('fedIdpDomains').split(',').map(d=>d.trim()) : []
  };
  if (!idp.id || !idp.name) { showError('ID and name are required'); return; }
  const res = await apiPut('/api/federation/idps', idp);
  if (res.ok) { showNotification('success','IdP saved'); _loadFederatedIdPs(); }
  else { showError('Failed to save IdP'); }
}

async function deleteFederatedIdP(id) {
  if (!confirm('Delete this identity provider?')) return;
  const res = await api('DELETE', `/api/federation/idps/${id}`, null);
  if (res.ok) { showNotification('success','IdP deleted'); _loadFederatedIdPs(); }
}

async function _loadTrustRealms() {
  const el = document.getElementById('trustRealmList');
  if (!el) return;
  try {
    const realms = await apiGet('/api/federation/realms');
    if (!realms || !realms.length) {
      el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No trust realms configured.</p>';
      return;
    }
    el.innerHTML = realms.map(r => `
      <div style="padding:4px 6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:3px;font-size:var(--fs-xs)">
        <strong>${escHtml(r.name)}</strong> <span style="color:var(--text-dim)">(${escHtml(r.id)})</span>
        <span style="margin-left:6px;color:var(--text-dim)">Max role: ${r.max_role||'teammember'}</span>
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load realms.</p>';
  }
}

// ── Rooms / Resources ────────────────────────────────────────────────────────
async function _loadRoomList() {
  const el = document.getElementById('roomList');
  if (!el) return;
  try {
    const rooms = await apiGet('/api/rooms');
    if (!rooms || !rooms.length) {
      el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No rooms or resources configured.</p>';
      return;
    }
    el.innerHTML = rooms.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px">
        <div>
          <strong style="font-size:var(--fs-sm)">${escHtml(r.name)}</strong>
          <span style="color:var(--text-dim);font-size:var(--fs-xs);margin-left:4px">${r.type||'room'}${r.capacity ? ' ('+r.capacity+' seats)' : ''}</span>
          ${r.location ? `<br><span style="font-size:10px;color:var(--text-dim)">${escHtml(r.location)}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-danger" data-action="deleteRoom" data-arg="${r.id}">✕</button>
      </div>
    `).join('');
    _bindActions(el);
  } catch {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">Failed to load rooms.</p>';
  }
}

async function saveRoom() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const room = {
    name: val('roomName'), type: val('roomType'),
    location: val('roomLocation'),
    capacity: parseInt(val('roomCapacity')) || 0,
    enabled: true
  };
  if (!room.name) { showError('Room name required'); return; }
  const res = await apiPut('/api/rooms', room);
  if (res.ok) { showNotification('success','Room saved'); _loadRoomList(); }
  else { showError('Failed to save room'); }
}

async function deleteRoom(id) {
  if (!confirm('Delete this room/resource?')) return;
  const res = await api('DELETE', `/api/rooms/${id}`, null);
  if (res.ok) { showNotification('success','Room deleted'); _loadRoomList(); }
}

// ── Custom Resource Type actions ────────────────────────────────────────────

async function saveCustomResourceType() {
  const key = (document.getElementById('crtKey')?.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const label = (document.getElementById('crtLabel')?.value || '').trim();
  const icon = (document.getElementById('crtIcon')?.value || '').trim() || '📦';
  if (!key || !label) { showError(t('resource_type_key_label_required')||'Key and display name are required.'); return; }
  const res = await apiPut('/api/custom-resource-types', { key, label, icon });
  if (res.ok) {
    state._customResourceTypes = null; // force reload
    showNotification('success', (t('resource_type_saved')||'Resource type saved'));
    renderSidebar();
  } else {
    const err = await res.json().catch(()=>({}));
    showError(err.error || 'Failed to save');
  }
}

async function deleteCustomResourceType(id) {
  if (!confirm(t('confirm_delete_resource_type')||'Delete this resource type? Resources of this type will remain but the tab will be removed.')) return;
  const res = await api('DELETE', `/api/custom-resource-types/${id}`, null);
  if (res.ok) {
    state._customResourceTypes = null; // force reload
    showNotification('success', (t('resource_type_deleted')||'Resource type deleted'));
    renderSidebar();
  }
}

// ── Ready Check action ──────────────────────────────────────────────────────

async function runReadyCheck() {
  const res = await apiGet('/api/ready-check');
  if (!res) { showError('Failed to run ready check'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  const notReady = res.not_ready || [];
  modal.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header" style="background:${res.ready ? 'var(--success,#27AE60)' : 'var(--warning,#E67E22)'};border-radius:var(--radius) var(--radius) 0 0">
        <h3 style="color:#fff">${res.ready ? '✅ ' + (t('ready_check_pass')||'All Clear') : '⚠ ' + (t('ready_check_fail')||'Not Ready')}</h3>
        <button class="modal-close" style="color:#fff" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);margin-bottom:8px">
          ${res.ready
            ? (t('ready_check_pass_desc')||'All activities have been moved from "planned" status. Preparations appear complete.')
            : (t('ready_check_fail_desc')||'The following activities are still in "planned" status:')}
        </p>
        ${notReady.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
            <thead><tr style="background:var(--bg3)">
              <th style="padding:4px 8px;text-align:left">ID</th>
              <th style="padding:4px 8px;text-align:left">${t('lv_title')||'Title'}</th>
              <th style="padding:4px 8px;text-align:left">${t('lv_status')||'Status'}</th>
              <th style="padding:4px 8px;text-align:left">${t('lv_start')||'Start'}</th>
            </tr></thead>
            <tbody>${notReady.map(ev => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:4px 8px">#${ev.id}</td>
                <td style="padding:4px 8px">${escHtml(ev.title)}</td>
                <td style="padding:4px 8px"><span class="status-badge status-planned">${ev.status}</span></td>
                <td style="padding:4px 8px;color:var(--text-dim)">${ev.start_time ? fmtDateTime(new Date(ev.start_time)) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:8px">${t('ready_check_total')||'Total activities'}: ${res.total}</p>
      </div>
      <div class="modal-footer">
        ${!res.ready && notReady.length > 0 ? `<button class="btn btn-warning btn-sm" id="btnForceActivateAll" style="margin-right:auto;background:#E67E22;color:#fff;border:none">⚡ ${t('ready_check_force_activate')||'Force Activate All Planned'}</button>` : ''}
        <button class="btn btn-primary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  // Force activate button
  const forceBtn = modal.querySelector('#btnForceActivateAll');
  if (forceBtn) {
    forceBtn.addEventListener('click', async () => {
      if (!confirm(t('ready_check_force_confirm') || 'Change all planned activities to active status?')) return;
      let changed = 0;
      for (const ev of notReady) {
        try {
          await patchEventStatus(ev.id, 'active', '');
          changed++;
        } catch (e) { /* skip */ }
      }
      showNotification('success', (t('ready_check_force_done') || 'All planned activities set to active') + ` (${changed})`);
      modal.remove();
      await refreshAll();
    });
  }
}

// ── Ready Check popup (wraps existing runReadyCheck) ────────────────────────
function openReadyCheckPopup() {
  runReadyCheck();
}

// ── Tag Cloud / Tag Input Utilities ────────────────────────────────────────
// Reusable tag cloud component for polls, ready checks, etc.

const _tagCloudColors = [
  '#e57373','#64b5f6','#81c784','#ffb74d','#ba68c8',
  '#4dd0e1','#ff8a65','#aed581','#f06292','#7986cb',
  '#a1887f','#90a4ae','#dce775','#4db6ac','#fff176'
];

function _tagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash) + tag.charCodeAt(i);
  return _tagCloudColors[Math.abs(hash) % _tagCloudColors.length];
}

/**
 * Render a tag input with tag cloud below.
 * @param {HTMLElement} parentEl - container to append into
 * @param {string} inputId - ID for the text input
 * @param {string} placeholder - placeholder text
 * @returns {{ inputEl: HTMLInputElement, getSelectedTags: () => string[] }}
 */
function _renderTagInput(parentEl, inputId, placeholder) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom:8px';

  const label = document.createElement('label');
  label.style.cssText = 'font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;display:block;margin-bottom:4px';
  label.textContent = t('tags_title') || 'Tags';
  wrapper.appendChild(label);

  const chipsRow = document.createElement('div');
  chipsRow.id = inputId + '_chips';
  chipsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px';
  wrapper.appendChild(chipsRow);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.placeholder = placeholder || t('tags_placeholder') || 'Tags (comma-separated)';
  input.style.cssText = 'width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)';
  wrapper.appendChild(input);

  const cloudContainer = document.createElement('div');
  cloudContainer.id = inputId + '_cloud';
  cloudContainer.style.cssText = 'margin-top:6px';
  wrapper.appendChild(cloudContainer);

  parentEl.appendChild(wrapper);

  const selectedTags = new Set();

  function renderChips() {
    chipsRow.innerHTML = '';
    selectedTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.style.cssText = `display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:${_tagColor(tag)};cursor:default`;
      chip.textContent = tag;
      const x = document.createElement('span');
      x.textContent = '\u00d7';
      x.style.cssText = 'cursor:pointer;font-weight:bold;margin-left:2px';
      x.addEventListener('click', () => { selectedTags.delete(tag); renderChips(); });
      chip.appendChild(x);
      chipsRow.appendChild(chip);
    });
  }

  // Handle comma-separated input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.replace(/,/g, '').trim();
      if (val) { selectedTags.add(val); renderChips(); }
      input.value = '';
    }
  });
  input.addEventListener('blur', () => {
    const val = input.value.replace(/,/g, '').trim();
    if (val) { selectedTags.add(val); renderChips(); }
    input.value = '';
  });

  // Fetch and render cloud
  _renderTagCloud(cloudContainer, selectedTags, renderChips);

  return {
    inputEl: input,
    getSelectedTags: () => [...selectedTags],
    addTag: (tag) => { selectedTags.add(tag); renderChips(); }
  };
}

/**
 * Fetch tags from /api/tags/cloud and render as clickable colored chips.
 * Clicking a tag adds it to the selectedTags set and re-renders chips.
 */
async function _renderTagCloud(container, selectedTags, renderChipsCallback) {
  try {
    const resp = await api('GET', '/api/tags/cloud');
    if (!resp.ok) { container.innerHTML = ''; return; }
    const tags = await resp.json();
    if (!tags || tags.length === 0) {
      container.innerHTML = `<span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('tags_no_tags') || 'No tags yet'}</span>`;
      return;
    }
    const cloudLabel = document.createElement('div');
    cloudLabel.style.cssText = 'font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:3px';
    cloudLabel.textContent = t('tags_cloud') || 'Tag Cloud';
    container.appendChild(cloudLabel);

    const cloudRow = document.createElement('div');
    cloudRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
    (Array.isArray(tags) ? tags : []).forEach(tagObj => {
      const tagName = typeof tagObj === 'string' ? tagObj : (tagObj.tag || tagObj.name || '');
      if (!tagName) return;
      const chip = document.createElement('span');
      chip.style.cssText = `display:inline-block;padding:2px 8px;border-radius:12px;font-size:var(--fs-xs);color:#fff;background:${_tagColor(tagName)};cursor:pointer;opacity:0.8;transition:opacity 0.15s`;
      chip.textContent = tagName + (tagObj.count ? ` (${tagObj.count})` : '');
      chip.title = t('tags_add') || 'Add Tag';
      chip.addEventListener('mouseenter', () => { chip.style.opacity = '1'; });
      chip.addEventListener('mouseleave', () => { chip.style.opacity = '0.8'; });
      chip.addEventListener('click', () => {
        selectedTags.add(tagName);
        renderChipsCallback();
      });
      cloudRow.appendChild(chip);
    });
    container.appendChild(cloudRow);
  } catch (e) {
    console.warn('Failed to load tag cloud', e);
    container.innerHTML = '';
  }
}

// ── Person Ready Check ─────────────────────────────────────────────────────
// Tracks per-participant readiness with traffic-light status
let _personReadyChecks = []; // { id, event_id?, created_by, participants: [{user_id, user_name, status}], created_at }

async function openPersonReadyCheckPopup() {
  const isCreator = hasRole2(state.user.role, 'teamlead');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:700px">
      <div class="modal-header">
        <h3>🙋 ${t('person_ready_check_title')||'Person Ready Check'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto" id="personReadyCheckBody">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('person_ready_check_desc')||'Request all participants to confirm their readiness. Each participant shows as a traffic light: green = ready, red = not ready, yellow = pending.'}
        </p>
        ${isCreator ? `
        <div style="border:1px solid var(--accent);border-radius:var(--radius);padding:12px;margin-bottom:12px;background:color-mix(in srgb, var(--accent) 5%, var(--bg2))">
          <h4 style="font-size:var(--fs-sm);margin-bottom:8px">${t('prc_new_check')||'New Ready Check'}</h4>
          <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('prc_select_mode')||'Select by'}:</label>
            <div class="toggle-btn-group" style="font-size:10px">
              <button class="toggle-btn active" id="prcModeIndividual" data-prc-mode="individual">${t('prc_mode_individual')||'Individual'}</button>
              <button class="toggle-btn" id="prcModeGroup" data-prc-mode="group">${t('prc_mode_group')||'Group / Team'}</button>
              <button class="toggle-btn" id="prcModeRole" data-prc-mode="role">${t('prc_mode_role')||'Role'}</button>
            </div>
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:3px;margin-left:auto">
              <input type="checkbox" id="prcSelectAll" style="accent-color:var(--accent);width:12px;height:12px">
              <span style="font-weight:600">${t('prc_select_all')||'Select all'}</span>
            </label>
          </div>
          <div id="prcIndividualSection">
            <div style="margin-bottom:6px;display:flex;gap:8px;align-items:center">
              <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_select_participants')||'Select participants'}:</label>
              <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:3px">
                <input type="checkbox" id="prcOnlineOnly" style="accent-color:var(--accent);width:12px;height:12px">
                <span style="color:var(--accent);font-weight:600">🟢 ${t('prc_filter_online')||'Online only'}</span>
              </label>
              <input type="text" id="prcUserSearch" placeholder="${t('prc_search_users')||'Search users...'}" style="margin-left:auto;padding:3px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);width:140px">
            </div>
            <div id="prcParticipantList" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.users||[]).filter(u => u.id !== state.user.id).map(u => `
                <label class="group-chip prc-user-chip" style="cursor:pointer;font-size:var(--fs-xs)" data-online="${u.availability && u.availability !== 'away' ? 'true' : 'false'}" data-user-id="${u.id}" data-user-name="${escHtml((u.display_name||u.username).toLowerCase())}">
                  <input type="checkbox" class="prc-user-cb" value="${u.id}" style="margin-right:4px">
                  ${u.availability === 'busy' ? '🟡' : u.availability === 'dnd' ? '🔴' : u.availability === 'away' ? '⚪' : '🟢'} ${escHtml(u.display_name||u.username)}
                </label>`).join('')}
            </div>
          </div>
          <div id="prcGroupSection" style="display:none">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_send_to_group')||'Send to group/team'}:</label>
            <div id="prcGroupList" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.groups||[]).map(g => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="prc-group-cb" value="${g.id}" style="margin-right:4px">
                  <span class="group-icon-badge">👥</span> ${escHtml(g.name)}
                </label>`).join('')}
            </div>
          </div>
          <div id="prcRoleSection" style="display:none">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_send_to_role')||'Send to role'}:</label>
            <div id="prcRoleList" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              ${[...new Set((state.users||[]).map(u => u.role).filter(Boolean))].map(role => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="prc-role-cb" value="${role}" style="margin-right:4px">
                  🛡 ${getRoleDisplayName(role)}
                </label>`).join('')}
            </div>
          </div>
          <div style="margin-top:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('prc_message')||'Message (optional)'}:</label>
            <textarea id="prcMessageText" rows="2" placeholder="${t('prc_message_placeholder')||'Add a message to send with the ready check...'}"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;margin-top:2px"></textarea>
          </div>
          <div id="prcTagsContainer" style="margin-top:8px"></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btnCreatePRC">${t('prc_send_request')||'Send Ready Check Request'}</button>
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-dim)">
              <input type="checkbox" id="prcTimedCheck" style="accent-color:var(--accent);width:12px;height:12px">
              ${t('prc_timed_check')||'Timed Ready Check'}
            </label>
            <span id="prcTimedTZInfo" style="display:none;font-size:var(--fs-xs);color:var(--text-dim)"></span>
            <input type="datetime-local" id="prcTimedDateTime" style="display:none;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
        </div>` : ''}
        <div id="prcActiveChecks"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  // Render tags input
  let _prcTagInput = null;
  const prcTagsContainer = modal.querySelector('#prcTagsContainer');
  if (prcTagsContainer) {
    _prcTagInput = _renderTagInput(prcTagsContainer, 'prcTags', t('tags_placeholder') || 'Tags (comma-separated)');
  }

  // Load existing checks
  _loadPersonReadyChecks(modal);

  // PRC mode switching (individual / group / role)
  modal.querySelectorAll('[data-prc-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-prc-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.prcMode;
      const indSec = modal.querySelector('#prcIndividualSection');
      const grpSec = modal.querySelector('#prcGroupSection');
      const rolSec = modal.querySelector('#prcRoleSection');
      if (indSec) indSec.style.display = mode === 'individual' ? '' : 'none';
      if (grpSec) grpSec.style.display = mode === 'group' ? '' : 'none';
      if (rolSec) rolSec.style.display = mode === 'role' ? '' : 'none';
    });
  });

  // Online filter for individual participants
  const onlineFilter = modal.querySelector('#prcOnlineOnly');
  if (onlineFilter) {
    onlineFilter.addEventListener('change', () => {
      _prcFilterUsers(modal);
    });
  }

  // User search filter
  const userSearch = modal.querySelector('#prcUserSearch');
  if (userSearch) {
    userSearch.addEventListener('input', () => _prcFilterUsers(modal));
  }

  // Select all checkbox
  const selectAll = modal.querySelector('#prcSelectAll');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checked = selectAll.checked;
      modal.querySelectorAll('.prc-user-cb').forEach(cb => {
        const chip = cb.closest('.prc-user-chip');
        if (chip && chip.style.display !== 'none') cb.checked = checked;
      });
    });
  }

  // Timed check toggle
  const timedCheck = modal.querySelector('#prcTimedCheck');
  const timedDateTime = modal.querySelector('#prcTimedDateTime');
  const timedTZInfo = modal.querySelector('#prcTimedTZInfo');
  if (timedCheck && timedDateTime) {
    timedCheck.addEventListener('change', () => {
      timedDateTime.style.display = timedCheck.checked ? '' : 'none';
      // Update button text to reflect timed vs immediate mode
      const btn = modal.querySelector('#btnCreatePRC');
      if (btn) {
        btn.textContent = timedCheck.checked
          ? (t('prc_schedule_request')||'Schedule Ready Check')
          : (t('prc_send_request')||'Send Ready Check Request');
      }
      if (timedTZInfo) {
        if (timedCheck.checked) {
          const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          const tzAbbr = new Date().toLocaleTimeString('en-GB', {timeZoneName:'short'}).split(' ').pop() || '';
          timedTZInfo.textContent = tzAbbr + (tzName ? ' (' + tzName + ')' : '');
          timedTZInfo.style.display = '';
        } else {
          timedTZInfo.style.display = 'none';
        }
      }
      if (timedCheck.checked && !timedDateTime.value) {
        const d = new Date(); d.setMinutes(d.getMinutes() + 30);
        timedDateTime.value = fmtDateInput(d);
      }
    });
  }

  // Create new check button
  const createBtn = modal.querySelector('#btnCreatePRC');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const activeMode = modal.querySelector('[data-prc-mode].active')?.dataset?.prcMode || 'individual';
      let selected = [];
      if (activeMode === 'individual') {
        selected = [...modal.querySelectorAll('.prc-user-cb:checked')].map(cb => parseInt(cb.value, 10));
      } else if (activeMode === 'group') {
        const groupIds = [...modal.querySelectorAll('.prc-group-cb:checked')].map(cb => parseInt(cb.value, 10));
        // Resolve group members to user IDs
        const allUsers = state.users || [];
        for (const gid of groupIds) {
          try {
            const members = await apiGet(`/api/groups/${gid}/members`);
            if (members) members.forEach(m => { if (m.user_id && m.user_id !== state.user.id && !selected.includes(m.user_id)) selected.push(m.user_id); });
          } catch {}
        }
      } else if (activeMode === 'role') {
        const roles = [...modal.querySelectorAll('.prc-role-cb:checked')].map(cb => cb.value);
        (state.users || []).forEach(u => {
          if (roles.includes(u.role) && u.id !== state.user.id && !selected.includes(u.id)) selected.push(u.id);
        });
      }
      if (selected.length === 0) { showError(t('prc_no_participants')||'Select at least one participant'); return; }
      const isTimed = modal.querySelector('#prcTimedCheck')?.checked || false;
      const timedAt = isTimed ? modal.querySelector('#prcTimedDateTime')?.value : null;
      if (isTimed && !timedAt) { showError(t('prc_timed_required')||'Please select a date and time for the timed check'); return; }
      const messageText = modal.querySelector('#prcMessageText')?.value?.trim() || '';
      const body = { participant_ids: selected };
      if (messageText) body.message = messageText;
      if (isTimed && timedAt) {
        body.scheduled_at = new Date(timedAt).toISOString();
      }
      // Include tags if any selected
      if (_prcTagInput) {
        const tags = _prcTagInput.getSelectedTags();
        if (tags.length > 0) body.tags = tags;
      }
      const res = await apiPost('/api/person-ready-check', body);
      if (res.ok) {
        if (isTimed) {
          showNotification('success', t('prc_timed_scheduled')||'Timed ready check scheduled');
        } else {
          showNotification('success', t('prc_sent')||'Ready check request sent');
        }
        _loadPersonReadyChecks(modal);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to create ready check');
      }
    });
  }
}

async function _loadPersonReadyChecks(modal) {
  const container = modal.querySelector('#prcActiveChecks');
  if (!container) return;
  try {
    const checks = await apiGet('/api/person-ready-check');
    _personReadyChecks = checks || [];
  } catch { _personReadyChecks = []; }

  if (_personReadyChecks.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);text-align:center;padding:16px">${t('prc_no_active')||'No active ready checks.'}</div>`;
    return;
  }

  // Display checks in reverse chronological order (newest first)
  const sortedChecks = [..._personReadyChecks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = sortedChecks.map(check => {
    const isMyCheck = check.created_by === state.user.id;
    const participants = check.participants || [];
    const checkTime = new Date(check.created_at);
    const readyCount = participants.filter(p => p.status === 'ready').length;
    const notReadyCount = participants.filter(p => p.status === 'not_ready').length;
    const pendingCount = participants.filter(p => p.status === 'pending').length;
    const isScheduled = check.scheduled_at && new Date(check.scheduled_at) > new Date();
    // Sort participants: pending first (actionable), then by response time
    const sortedParticipants = [...participants].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      // Among responded, sort by response time (newest first)
      if (a.responded_at && b.responded_at) return new Date(b.responded_at) - new Date(a.responded_at);
      return 0;
    });
    // For large groups, show summary and collapsible details
    const isLargeGroup = participants.length > 20;
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:var(--bg3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px">
          <span style="font-weight:600;font-size:var(--fs-sm)">
            ${isScheduled ? '⏰ ' : ''}${t('prc_ready_check')||'Ready Check'} #${check.id}
          </span>
          <span style="font-size:var(--fs-xs);color:var(--text-dim)">${check.created_by_name || ''} — ${fmtDateTime(checkTime)}</span>
        </div>
        ${check.message ? `<div style="font-size:var(--fs-sm);padding:6px 8px;margin-bottom:8px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent);color:var(--text)">${escHtml(check.message)}</div>` : ''}
        <div style="font-size:var(--fs-xs);margin-bottom:8px;display:flex;gap:12px;color:var(--text-dim)">
          <span>🟢 ${readyCount}</span> <span>🔴 ${notReadyCount}</span> <span>🟡 ${pendingCount}</span>
          <span style="margin-left:auto">${t('prc_total')||'Total'}: ${participants.length}</span>
          ${isScheduled ? `<span style="color:var(--accent)">⏰ ${t('prc_scheduled_for')||'Scheduled for'}: ${fmtDateTime(new Date(check.scheduled_at))}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;${isLargeGroup ? 'max-height:200px;overflow-y:auto' : ''}">
          ${sortedParticipants.map(p => {
            const color = p.status === 'ready' ? '#27AE60' : p.status === 'not_ready' ? '#E74C3C' : '#F39C12';
            const icon = p.status === 'ready' ? '🟢' : p.status === 'not_ready' ? '🔴' : '🟡';
            const isMe = p.user_id === state.user.id;
            // Calculate response time difference from check creation
            let responseInfo = '';
            if (p.responded_at) {
              const respTime = new Date(p.responded_at);
              const diffMs = respTime - checkTime;
              const diffSec = Math.floor(diffMs / 1000);
              const diffMin = Math.floor(diffSec / 60);
              const diffH = Math.floor(diffMin / 60);
              let diffStr = '';
              if (diffH > 0) diffStr = `${diffH}h ${diffMin % 60}m`;
              else if (diffMin > 0) diffStr = `${diffMin}m ${diffSec % 60}s`;
              else diffStr = `${diffSec}s`;
              responseInfo = `<span style="font-size:9px;color:var(--text-dim);margin-left:2px" title="${fmtDateTime(respTime)}">(+${diffStr})</span>`;
            }
            return `<div style="display:inline-flex;align-items:center;gap:3px;padding:3px 6px;background:var(--bg2);border-radius:var(--radius);border:1px solid ${color};font-size:var(--fs-xs)">
              <span>${icon}</span>
              <span>${escHtml(p.user_name)}</span>${responseInfo}
              ${isMe && p.status === 'pending' ? `
                <button class="btn btn-sm" style="padding:1px 6px;font-size:10px;background:#27AE60;color:#fff;border:none;border-radius:3px;margin-left:2px" data-prc-respond="${check.id}" data-prc-status="ready">✓</button>
                <button class="btn btn-sm" style="padding:1px 6px;font-size:10px;background:#E74C3C;color:#fff;border:none;border-radius:3px" data-prc-respond="${check.id}" data-prc-status="not_ready">✗</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  // Bind response buttons
  container.querySelectorAll('[data-prc-respond]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const checkId = parseInt(btn.dataset.prcRespond, 10);
      const status = btn.dataset.prcStatus;
      const res = await apiPut(`/api/person-ready-check/${checkId}/respond`, { status });
      if (res.ok) {
        _loadPersonReadyChecks(modal);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to respond');
      }
    });
  });
}

// ── PRC Popup (shown to participants when a ready check is created) ──────────
function _prcFilterUsers(modal) {
  const onlyOnline = modal.querySelector('#prcOnlineOnly')?.checked || false;
  const searchTerm = (modal.querySelector('#prcUserSearch')?.value || '').toLowerCase();
  modal.querySelectorAll('.prc-user-chip').forEach(chip => {
    let hidden = false;
    if (onlyOnline && chip.dataset.online !== 'true') hidden = true;
    if (searchTerm && chip.dataset.userName && !chip.dataset.userName.includes(searchTerm)) hidden = true;
    chip.style.display = hidden ? 'none' : '';
  });
}

function _showPRCPopup(check) {
  // Prevent duplicate popups for same check
  if (document.getElementById('prcPopup_' + check.id)) return;
  const overlay = document.createElement('div');
  overlay.id = 'prcPopup_' + check.id;
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '10001';
  const participants = (check.participants || []).map(p => {
    const color = p.status === 'ready' ? '#27AE60' : p.status === 'not_ready' ? '#E74C3C' : '#F39C12';
    const icon = p.status === 'ready' ? '🟢' : p.status === 'not_ready' ? '🔴' : '🟡';
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:var(--bg2);border:1px solid ${color};border-radius:var(--radius);font-size:var(--fs-xs);margin:2px">${icon} ${escHtml(p.user_name)}</span>`;
  }).join('');
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;animation:slideIn .25s ease">
      <div class="modal-header" style="background:#F39C12;color:#000">
        <h3 style="color:#000">🙋 Ready Check Required</h3>
      </div>
      <div class="modal-body">
        <p style="font-size:var(--fs-sm);margin-bottom:8px">
          <b>${escHtml(check.created_by_name || '')}</b> ${t('prc_popup_requested')||'has requested a readiness check.'}
        </p>
        ${check.message ? `<div style="font-size:var(--fs-sm);padding:8px 10px;margin-bottom:10px;background:var(--bg2);border-radius:var(--radius);border-left:3px solid var(--accent);color:var(--text);font-style:italic">${escHtml(check.message)}</div>` : ''}
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:12px">${t('prc_popup_confirm')||'Please confirm your readiness status.'}</p>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px">${participants}</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-primary" id="prcPopupReady_${check.id}" style="background:#27AE60;border-color:#27AE60;padding:8px 24px;font-size:14px">✓ Ready</button>
          <button class="btn btn-secondary" id="prcPopupNotReady_${check.id}" style="background:#E74C3C;border-color:#E74C3C;color:#fff;padding:8px 24px;font-size:14px">✗ Not Ready</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const respond = async (status) => {
    try {
      const res = await apiPut(`/api/person-ready-check/${check.id}/respond`, { status });
      if (res.ok) {
        overlay.remove();
        showNotification('success', status === 'ready' ? 'Marked as ready' : 'Marked as not ready');
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to respond');
      }
    } catch (e) { showError('Error: ' + e.message); }
  };
  document.getElementById('prcPopupReady_' + check.id).addEventListener('click', () => respond('ready'));
  document.getElementById('prcPopupNotReady_' + check.id).addEventListener('click', () => respond('not_ready'));
  // Play notification sound
  _playNotifBellSound();
}

/* ── Poll / Multipoll ── */
async function openPollModal(opts) {
  opts = opts || {};
  const isCreator = hasRole2(state.user.role, 'teamlead');
  const hideCreatePane = opts.hideCreate || false;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';

  const standardQs = [
    { key: 'stress',      label: t('poll_question_stress')||'Personal stress level (0-3)', type: 'scale' },
    { key: 'team_stress', label: t('poll_question_team_stress')||'Team stress level (0-3)', type: 'scale' },
    { key: 'in_control',  label: t('poll_question_in_control')||'Are you in control?', type: 'yes_no' },
    { key: 'need_assist', label: t('poll_question_need_assist')||'Do you need assistance from Operations Lead or other central support?', type: 'yes_no' },
    { key: 'need_assist_teamlead', label: t('poll_question_need_assist_teamlead')||'Do you need assistance from other team leads?', type: 'yes_no' },
    { key: 'other',       label: t('poll_question_other')||'Additional comments', type: 'free_text' },
  ];

  modal.innerHTML = `
    <div class="modal" style="max-width:950px;width:90vw">
      <div class="modal-header">
        <h3>📊 ${t('poll_title')||'Poll / Multipoll'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto" id="pollModalBody">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('poll_desc')||'Poll specific users, groups, or roles with standard or custom questions. All replies are collected and reported.'}
        </p>
        ${isCreator ? `
        <div id="pollCreatePane" style="border:1px solid var(--accent);border-radius:var(--radius);margin-bottom:12px;background:color-mix(in srgb, var(--accent) 5%, var(--bg2));overflow:hidden">
          <div id="pollCreateHeader" style="padding:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <h4 style="font-size:var(--fs-sm);margin:0">${t('poll_create')||'Create New Poll'}</h4>
            <span id="pollCreateToggle" style="font-size:12px;color:var(--text-dim)">${hideCreatePane ? '▶' : '▼'}</span>
          </div>
          <div id="pollCreateBody" style="padding:0 12px 12px 12px;${hideCreatePane ? 'display:none' : ''}">
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('poll_title')||'Poll title'}:</label>
            <input type="text" id="pollTitleInput" placeholder="${t('poll_title')||'Poll title'}..." maxlength="100"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div id="pollTagsContainer" style="margin-bottom:0"></div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-bottom:4px;display:block">${t('poll_questions')||'Questions'}:</label>
            <div style="margin-bottom:4px;display:flex;gap:6px;align-items:center">
              <select id="pollQuestionnaireSelect" style="flex:1;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                <option value="">${t('questionnaire_none')||'Custom questions'}</option>
              </select>
              <button class="btn btn-sm btn-secondary" id="pollUseQuestionnaire">${t('questionnaire_use')||'Use Questionnaire'}</button>
            </div>
            <div id="pollQuestionList">
            </div>
            <button class="btn btn-sm btn-secondary" id="pollAddQuestion" style="margin-top:4px">+ ${t('poll_add_question')||'Add question'}</button>
          </div>
          <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('poll_target')||'Target'}:</label>
            <div class="toggle-btn-group" style="font-size:10px">
              <button class="toggle-btn active" id="pollModeUser" data-poll-mode="users">${t('poll_target_users')||'Users'}</button>
              <button class="toggle-btn" id="pollModeGroup" data-poll-mode="groups">${t('poll_target_groups')||'Groups'}</button>
              <button class="toggle-btn" id="pollModeRole" data-poll-mode="roles">${t('poll_target_roles')||'Roles'}</button>
            </div>
          </div>
          <div id="pollTargetUsers">
            <div id="pollUserList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.users||[]).filter(u => u.id !== state.user.id).map(u => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="poll-user-cb" value="${u.id}" style="margin-right:4px">
                  ${u.availability === 'busy' ? '🟡' : u.availability === 'dnd' ? '🔴' : u.availability === 'away' ? '⚪' : '🟢'} ${escHtml(u.display_name||u.username)}
                </label>`).join('')}
            </div>
          </div>
          <div id="pollTargetGroups" style="display:none">
            <div id="pollGroupList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${(state.groups||[]).map(g => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="poll-group-cb" value="${g.id}" style="margin-right:4px">
                  <span class="group-icon-badge">👥</span> ${escHtml(g.name)}
                </label>`).join('')}
            </div>
          </div>
          <div id="pollTargetRoles" style="display:none">
            <div id="pollRoleList" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${[...new Set((state.users||[]).map(u => u.role).filter(Boolean))].map(role => `
                <label class="group-chip" style="cursor:pointer;font-size:var(--fs-xs)">
                  <input type="checkbox" class="poll-role-cb" value="${role}" style="margin-right:4px">
                  🛡 ${getRoleDisplayName(role)}
                </label>`).join('')}
            </div>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btnCreatePoll">${t('poll_create')||'Create Poll'}</button>
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-dim)">
              <input type="checkbox" id="pollTimedCheck" style="accent-color:var(--accent);width:12px;height:12px">
              ${t('poll_timed')||'Timed Poll'}
            </label>
            <input type="datetime-local" id="pollTimedDateTime" style="display:none;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            <label style="font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-dim)">
              <span>${t('poll_reminder_after')||'Remind after'}:</span>
              <input type="number" id="pollReminderMins" min="0" value="0" placeholder="0" style="width:50px;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
              <span>${t('poll_minutes')||'min'}</span>
            </label>
          </div>
          </div>
        </div>` : ''}
        <div id="pollActiveList"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  // Render tags input for poll
  let _pollTagInput = null;
  const pollTagsContainer = modal.querySelector('#pollTagsContainer');
  if (pollTagsContainer) {
    _pollTagInput = _renderTagInput(pollTagsContainer, 'pollTags', t('tags_placeholder') || 'Tags (comma-separated)');
  }

  // Target mode switching
  modal.querySelectorAll('[data-poll-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-poll-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const m = btn.dataset.pollMode;
      const u = modal.querySelector('#pollTargetUsers');
      const g = modal.querySelector('#pollTargetGroups');
      const r = modal.querySelector('#pollTargetRoles');
      if (u) u.style.display = m === 'users' ? '' : 'none';
      if (g) g.style.display = m === 'groups' ? '' : 'none';
      if (r) r.style.display = m === 'roles' ? '' : 'none';
    });
  });

  // Collapsible create pane toggle
  const pollCreateHeader = modal.querySelector('#pollCreateHeader');
  if (pollCreateHeader) {
    pollCreateHeader.addEventListener('click', () => {
      const body = modal.querySelector('#pollCreateBody');
      const toggle = modal.querySelector('#pollCreateToggle');
      if (body) {
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        if (toggle) toggle.textContent = hidden ? '▼' : '▶';
      }
    });
  }

  // Timed poll toggle
  const pollTimedCheck = modal.querySelector('#pollTimedCheck');
  const pollTimedDateTime = modal.querySelector('#pollTimedDateTime');
  if (pollTimedCheck && pollTimedDateTime) {
    pollTimedCheck.addEventListener('change', () => {
      pollTimedDateTime.style.display = pollTimedCheck.checked ? '' : 'none';
      const btn = modal.querySelector('#btnCreatePoll');
      if (btn) btn.textContent = pollTimedCheck.checked
        ? (t('poll_schedule')||'Schedule Poll')
        : (t('poll_create')||'Create Poll');
      if (pollTimedCheck.checked && !pollTimedDateTime.value) {
        const d = new Date(); d.setMinutes(d.getMinutes() + 30);
        pollTimedDateTime.value = fmtDateInput(d);
      }
    });
  }

  // Load questionnaires into dropdown
  const qSelect = modal.querySelector('#pollQuestionnaireSelect');
  if (qSelect) {
    try {
      const resp = await api('GET', '/api/poll-questionnaires');
      const questionnaires = await resp.json();
      questionnaires.forEach(q => {
        const tq = _translateSQ(q);
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = tq.name + (q.built_in ? ` (${t('questionnaire_builtin')||'Built-in'})` : '');
        opt.dataset.questions = JSON.stringify(tq.questions || []);
        qSelect.appendChild(opt);
      });
    } catch(e) { console.warn('Failed to load questionnaires', e); }
  }
  const useQBtn = modal.querySelector('#pollUseQuestionnaire');
  if (useQBtn) {
    useQBtn.addEventListener('click', () => {
      const list = modal.querySelector('#pollQuestionList');
      if (!list) return;
      const sel = modal.querySelector('#pollQuestionnaireSelect');
      if (!sel || !sel.value) return;
      const opt = sel.selectedOptions[0];
      const questions = JSON.parse(opt.dataset.questions || '[]');
      list.innerHTML = '';
      questions.forEach(q => {
        const typeMap = { scale_0_3: 'scale', yes_no: 'yes_no', free_text: 'free_text' };
        _addPollQuestionRow(list, q.text, typeMap[q.type] || q.type || 'scale');
      });
    });
  }

  // Add question button
  const addBtn = modal.querySelector('#pollAddQuestion');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const list = modal.querySelector('#pollQuestionList');
      if (list) _addPollQuestionRow(list, '', 'scale');
    });
  }

  // Create poll button
  const createBtn = modal.querySelector('#btnCreatePoll');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const title = modal.querySelector('#pollTitleInput')?.value?.trim();
      if (!title) { showError(t('poll_title_required')||'Poll title is required'); return; }
      const questions = [];
      modal.querySelectorAll('.poll-q-row').forEach(row => {
        const text = row.querySelector('.poll-q-text')?.value?.trim();
        const type = row.querySelector('.poll-q-type')?.value || 'scale';
        if (text) questions.push({ text, type });
      });
      if (questions.length === 0) { showError(t('poll_questions_required')||'At least one question is required'); return; }

      // Gather targets — backend expects target_type + target_ids
      const activeMode = modal.querySelector('[data-poll-mode].active')?.dataset?.pollMode || 'users';
      let targetType = 'user';
      let targetIds = [];
      if (activeMode === 'users') {
        targetType = 'user';
        modal.querySelectorAll('.poll-user-cb:checked').forEach(cb => targetIds.push(cb.value));
      } else if (activeMode === 'groups') {
        targetType = 'group';
        modal.querySelectorAll('.poll-group-cb:checked').forEach(cb => targetIds.push(cb.value));
      } else if (activeMode === 'roles') {
        targetType = 'role';
        modal.querySelectorAll('.poll-role-cb:checked').forEach(cb => targetIds.push(cb.value));
      }
      if (targetIds.length === 0) {
        showError(t('poll_target_required')||'Select at least one target'); return;
      }

      // Map question types to backend format and add IDs
      const mappedQs = questions.map((q, i) => ({
        id: 'q_' + i,
        text: q.text,
        type: q.type === 'scale' ? 'scale_0_3' : q.type,
        required: q.type !== 'free_text'
      }));

      try {
        const payload = { title, questions: mappedQs, target_type: targetType, target_ids: targetIds.map(String) };
        // Include tags if any selected
        if (_pollTagInput) {
          const tags = _pollTagInput.getSelectedTags();
          if (tags.length > 0) payload.tags = tags;
        }
        // Timed poll
        const isPollTimed = modal.querySelector('#pollTimedCheck')?.checked || false;
        const pollTimedVal = isPollTimed ? modal.querySelector('#pollTimedDateTime')?.value : null;
        if (isPollTimed && pollTimedVal) {
          payload.scheduled_at = new Date(pollTimedVal).toISOString();
        }
        // Reminder
        const reminderMins = parseInt(modal.querySelector('#pollReminderMins')?.value || '0', 10);
        if (reminderMins > 0) payload.reminder_mins = reminderMins;
        const res = await apiPost('/api/polls', payload);
        if (!res.ok) {
          let errMsg = '';
          try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const err = await res.json();
              errMsg = err.error || '';
            }
          } catch {}
          if (!errMsg) {
            errMsg = res.status === 403 ? (t('poll_no_permission')||'You do not have permission to create polls (requires team lead role)')
              : res.status === 404 ? (t('poll_not_available')||'Poll feature is not available on this server version')
              : (t('poll_create_failed')||'Failed to create poll') + ' (HTTP ' + res.status + ')';
          }
          throw new Error(errMsg);
        }
        showNotification('success',t('poll_created')||'Poll created successfully');
        _loadPolls(modal);
      } catch (e) { showError(e.message); }
    });
  }

  // Load existing polls
  _loadPolls(modal);
}

function _renumberPollQuestions(container) {
  container.querySelectorAll('.poll-q-row').forEach((row, i) => {
    const num = row.querySelector('.poll-q-num');
    if (num) num.textContent = (i + 1) + '.';
  });
}

// Translate built-in questionnaire fields via i18n keys
function _translateSQ(q) {
  if (!q || !q.built_in || q.id >= 0) return q;
  const idx = Math.abs(q.id);
  const tq = Object.assign({}, q);
  tq.name = t('sq' + idx + '_name') || q.name;
  tq.description = t('sq' + idx + '_desc') || q.description;
  if (q.questions) {
    tq.questions = q.questions.map(qu => {
      const tText = t('sq' + idx + '_q_' + qu.id);
      return tText ? Object.assign({}, qu, { text: tText }) : qu;
    });
  }
  return tq;
}

function _addPollQuestionRow(container, text, type) {
  const row = document.createElement('div');
  row.className = 'poll-q-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  const idx = container.querySelectorAll('.poll-q-row').length + 1;
  row.innerHTML = `
    <span class="poll-q-num" style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;min-width:20px;text-align:right;flex-shrink:0">${idx}.</span>
    <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
      <button class="btn btn-ghost poll-q-up" style="padding:0 3px;font-size:9px;line-height:1" title="${t('move_up')||'Move up'}">▲</button>
      <button class="btn btn-ghost poll-q-down" style="padding:0 3px;font-size:9px;line-height:1" title="${t('move_down')||'Move down'}">▼</button>
    </div>
    <textarea class="poll-q-text" placeholder="${t('poll_custom_question')||'Question text...'}"
      style="flex:1;width:auto;min-width:0;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;min-height:32px;height:32px;line-height:1.4">${escHtml(text)}</textarea>
    <select class="poll-q-type" style="width:auto;padding:4px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);flex-shrink:0">
      <option value="scale" ${type==='scale'?'selected':''}>${t('poll_type_scale')||'Scale 0-3'}</option>
      <option value="yes_no" ${type==='yes_no'?'selected':''}>${t('poll_type_yes_no')||'Yes / No'}</option>
      <option value="free_text" ${type==='free_text'?'selected':''}>${t('poll_type_free_text')||'Free text'}</option>
    </select>
    <button class="btn btn-sm btn-danger" style="padding:2px 6px;font-size:10px;flex-shrink:0" title="${t('poll_remove_question')||'Remove'}">✕</button>`;
  row.querySelector('.btn-danger').addEventListener('click', () => { row.remove(); _renumberPollQuestions(container); });
  row.querySelector('.poll-q-up').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev) { container.insertBefore(row, prev); _renumberPollQuestions(container); }
  });
  row.querySelector('.poll-q-down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) { container.insertBefore(next, row); _renumberPollQuestions(container); }
  });
  container.appendChild(row);
}

async function _loadPolls(modal) {
  const wrap = modal.querySelector('#pollActiveList');
  if (!wrap) return;
  try {
    const res = await api('GET', '/api/polls');
    if (!res.ok) { wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('poll_no_polls')||'No polls found.'}</p>`; return; }
    const polls = await res.json();
    if (!polls || polls.length === 0) { wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('poll_no_polls')||'No polls found.'}</p>`; return; }

    // Sort polls: latest (most recently created) first
    polls.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    wrap.innerHTML = polls.map(poll => {
      const isOpen = poll.status === 'open';
      const isCreator = poll.created_by === state.user.id;
      const myResponses = (poll.responses || []).filter(r => r.user_id === state.user.id);
      const hasResponded = myResponses.length > 0;
      const totalTargets = (poll.target_ids || []).length || '?';
      // Count unique users who responded
      const respondedUsers = new Set((poll.responses || []).map(r => r.user_id));
      const totalResponses = respondedUsers.size;
      const statusColor = isOpen ? 'var(--accent)' : 'var(--text-dim)';
      const statusText = isOpen ? (t('poll_status_open')||'Open') : (t('poll_status_closed')||'Closed');

      let questionsHtml = '';
      if (isOpen && !hasResponded) {
        // Show response form
        questionsHtml = `<div class="poll-respond-form" data-poll-id="${poll.id}" style="margin-top:8px">
          ${(poll.questions || []).map((q, qi) => {
            if (q.type === 'scale' || q.type === 'scale_0_3') {
              return `<div style="margin-bottom:6px"><label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(q.text)}</label>
                <div class="toggle-btn-group" style="font-size:10px;margin-top:2px">
                  ${[0,1,2,3].map(v => `<button class="toggle-btn poll-scale-btn" data-qi="${qi}" data-val="${v}">${t('poll_scale_'+v)||['None','Low','Medium','High'][v]}</button>`).join('')}
                </div></div>`;
            } else if (q.type === 'yes_no') {
              return `<div style="margin-bottom:6px"><label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(q.text)}</label>
                <div class="toggle-btn-group" style="font-size:10px;margin-top:2px">
                  <button class="toggle-btn poll-yn-btn" data-qi="${qi}" data-val="yes">${t('yes')||'Yes'}</button>
                  <button class="toggle-btn poll-yn-btn" data-qi="${qi}" data-val="no">${t('no')||'No'}</button>
                </div></div>`;
            } else {
              return `<div style="margin-bottom:6px"><label style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(q.text)}</label>
                <input type="text" class="poll-free-input" data-qi="${qi}" placeholder="${t('poll_type_free_text')||'Your answer...'}"
                  style="width:100%;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);margin-top:2px"></div>`;
            }
          }).join('')}
          <button class="btn btn-primary btn-sm poll-submit-btn" data-poll-id="${poll.id}" style="margin-top:6px">${t('poll_respond')||'Submit Response'}</button>
        </div>`;
      } else if (hasResponded) {
        questionsHtml = `<div style="margin-top:6px;font-size:var(--fs-xs);color:var(--accent);font-weight:600">✅ ${t('poll_responded')||'You have responded'}</div>`;
      }

      // Summary for creator — enhanced with respondent tracking
      let summaryHtml = '';
      if (isCreator) {
        const allTargetIDs = (poll.target_ids || []);
        const allResponses = poll.responses || [];
        const pollCreatedAt = new Date(poll.created_at);
        // Resolve who answered and who didn't
        const answeredMap = {};  // user_id -> { name, answeredAt, questionCount }
        allResponses.forEach(r => {
          if (!answeredMap[r.user_id]) {
            answeredMap[r.user_id] = { name: r.user_name, firstAt: new Date(r.answered_at), count: 0 };
          }
          answeredMap[r.user_id].count++;
          const at = new Date(r.answered_at);
          if (at < answeredMap[r.user_id].firstAt) answeredMap[r.user_id].firstAt = at;
        });
        const totalQuestions = (poll.questions || []).length;
        // Build respondent details
        const answeredUsers = Object.entries(answeredMap).map(([uid, info]) => {
          const diffMs = info.firstAt - pollCreatedAt;
          const diffSec = Math.floor(diffMs / 1000);
          const diffMin = Math.floor(diffSec / 60);
          const diffH = Math.floor(diffMin / 60);
          let diffStr = '';
          if (diffH > 0) diffStr = `${diffH}h ${diffMin % 60}m`;
          else if (diffMin > 0) diffStr = `${diffMin}m ${diffSec % 60}s`;
          else diffStr = `${diffSec}s`;
          const isPartial = info.count < totalQuestions;
          const u = (state.users||[]).find(u => u.id === parseInt(uid));
          const avail = u ? u.availability : '';
          const isRemote = u && u.location === 'remote';
          let statusIcon = '🟢';
          if (!u) statusIcon = '❓';
          else if (avail === 'away') statusIcon = '⚪';
          else if (avail === 'dnd') statusIcon = '🔴';
          else if (avail === 'busy') statusIcon = '🟡';
          else if (isRemote) statusIcon = '🌐';
          return { uid: parseInt(uid), name: info.name, diffStr, isPartial, statusIcon, isRemote };
        });
        // Find non-respondents
        const respondedSet = new Set(Object.keys(answeredMap).map(Number));
        let nonRespondents = [];
        // Try to resolve actual user names for targets
        if (poll.target_type === 'user') {
          allTargetIDs.forEach(idStr => {
            const uid = parseInt(idStr);
            if (!respondedSet.has(uid)) {
              const u = (state.users||[]).find(u => u.id === uid);
              const name = u ? (u.display_name||u.username) : `User #${uid}`;
              const avail = u ? u.availability : '';
              const isRemote = u && u.location === 'remote';
              let statusIcon = '🟢';
              if (!u) statusIcon = '❓';
              else if (avail === 'away') statusIcon = '⚪';
              else if (avail === 'dnd') statusIcon = '🔴';
              else if (avail === 'busy') statusIcon = '🟡';
              else if (isRemote) statusIcon = '🌐';
              nonRespondents.push({ uid, name, statusIcon, isRemote });
            }
          });
        }

        // Standard question table for scale/yes_no
        const standardQs = (poll.questions || []).filter(q => q.type === 'scale' || q.type === 'scale_0_3' || q.type === 'yes_no');
        let tableHtml = '';
        if (standardQs.length > 0 && answeredUsers.length > 0) {
          const headerCells = standardQs.map(q => `<th style="padding:3px 6px;border:1px solid var(--border);font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(q.text)}">${escHtml(q.text.length > 30 ? q.text.slice(0,27)+'...' : q.text)}</th>`).join('');
          const rows = answeredUsers.map(au => {
            const cells = standardQs.map(q => {
              const resp = allResponses.find(r => r.user_id === au.uid && r.question_id === q.id);
              if (!resp) return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;color:var(--text-dim)">—</td>`;
              let val = resp.answer;
              let bg = '';
              if (q.type === 'scale' || q.type === 'scale_0_3') {
                const v = parseInt(val);
                if (v === 0) bg = 'background:#27AE6033';
                else if (v === 1) bg = 'background:#F39C1233';
                else if (v === 2) bg = 'background:#E67E2233';
                else if (v === 3) bg = 'background:#E74C3C33';
                val = t('poll_scale_'+v)||['None','Low','Medium','High'][v]||v;
              } else if (q.type === 'yes_no') {
                bg = val === 'yes' ? 'background:#27AE6022' : 'background:#E74C3C22';
                val = val === 'yes' ? (t('yes')||'Yes') : (t('no')||'No');
              }
              return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;font-size:10px;${bg}">${val}</td>`;
            }).join('');
            return `<tr><td style="padding:3px 6px;border:1px solid var(--border);font-size:10px;white-space:nowrap">${au.statusIcon} ${escHtml(au.name)}${au.isRemote ? ' 🌐' : ''}</td>${cells}</tr>`;
          }).join('');
          tableHtml = `<div style="margin-top:6px;overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:10px">
            <thead><tr><th style="padding:3px 6px;border:1px solid var(--border)"></th>${headerCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
        }

        // Free text responses
        const freeTextQs = (poll.questions || []).filter(q => q.type === 'free_text');
        let freeTextHtml = '';
        if (freeTextQs.length > 0) {
          freeTextHtml = freeTextQs.map(q => {
            const answers = allResponses.filter(r => r.question_id === q.id && r.answer).map(r => `<div style="padding:2px 0"><b>${escHtml(r.user_name)}</b>: ${escHtml(r.answer)}</div>`).join('');
            return answers ? `<div style="margin-top:4px"><em>${escHtml(q.text)}</em>${answers}</div>` : '';
          }).join('');
        }

        summaryHtml = `<div style="margin-top:8px;padding:8px;background:var(--bg3);border-radius:var(--radius);font-size:var(--fs-xs)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${t('poll_responses')||'Responses'}: ${totalResponses}/${totalTargets}</strong>
            <span style="color:var(--text-dim)">${t('poll_started')||'Started'}: ${fmtDateTime(pollCreatedAt)}</span>
          </div>
          ${answeredUsers.length > 0 ? `<div style="margin-bottom:4px"><span style="color:#27AE60;font-weight:600">✅ ${t('poll_answered')||'Answered'}:</span>
            ${answeredUsers.map(au => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #27AE60${au.isPartial ? '80' : ''}">${au.statusIcon} ${escHtml(au.name)}${au.isRemote ? ' 🌐' : ''} <span style="color:var(--text-dim)">(+${au.diffStr})</span>${au.isPartial ? ` <span style="color:#F39C12" title="${t('poll_partial_answer')||'Partial answer'}">⚠</span>` : ''}</span>`).join(' ')}
          </div>` : ''}
          ${nonRespondents.length > 0 ? `<div style="margin-bottom:4px"><span style="color:#E74C3C;font-weight:600">❌ ${t('poll_not_answered')||'Not answered'}:</span>
            ${nonRespondents.map(nr => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #E74C3C">${nr.statusIcon} ${escHtml(nr.name)}${nr.isRemote ? ' 🌐' : ''}</span>`).join(' ')}
          </div>` : ''}
          ${tableHtml}
          ${freeTextHtml}
        </div>`;
      }

      return `<div class="sidebar-section" style="margin-bottom:8px;padding:10px;border:1px solid var(--border);border-radius:var(--radius)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:var(--fs-sm)">📊 ${escHtml(poll.title)}</strong>
          <span style="font-size:var(--fs-xs);color:${statusColor};font-weight:600">${statusText}</span>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">
          ${t('poll_started')||'Started'}: ${fmtDateTime(new Date(poll.created_at))}${isCreator ? ` — ${t('poll_responses')||'Responses'}: ${totalResponses}/${totalTargets}` : ''}
        </div>
        ${questionsHtml}
        ${summaryHtml}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          ${isCreator && isOpen ? `<button class="btn btn-sm btn-danger poll-close-btn" data-poll-id="${poll.id}">${t('poll_close')||'Close Poll'}</button>` : ''}
          ${isCreator && isOpen ? `<button class="btn btn-sm btn-secondary poll-remind-btn" data-poll-id="${poll.id}">${t('poll_send_reminder')||'Send Reminder'}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Bind scale/yn toggle buttons
    wrap.querySelectorAll('.poll-scale-btn, .poll-yn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const grp = btn.parentElement;
        grp.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Bind submit response
    wrap.querySelectorAll('.poll-submit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        const form = wrap.querySelector(`.poll-respond-form[data-poll-id="${pollId}"]`);
        if (!form) return;
        const poll = polls.find(p => p.id === pollId);
        if (!poll) return;
        const answers = (poll.questions || []).map((q, qi) => {
          let answer = '';
          if (q.type === 'scale_0_3' || q.type === 'scale') {
            const active = form.querySelector(`.poll-scale-btn[data-qi="${qi}"].active`);
            answer = active ? active.dataset.val : '';
          } else if (q.type === 'yes_no') {
            const active = form.querySelector(`.poll-yn-btn[data-qi="${qi}"].active`);
            answer = active ? active.dataset.val : '';
          } else {
            const input = form.querySelector(`.poll-free-input[data-qi="${qi}"]`);
            answer = input ? input.value.trim() : '';
          }
          return { question_id: q.id, answer };
        }).filter(a => a.answer);
        try {
          const res = await apiPut(`/api/polls/${pollId}/respond`, { answers });
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          showNotification('success',t('poll_response_saved')||'Response saved');
          _loadPolls(modal);
        } catch (e) { showError(e.message); }
      });
    });

    // Bind close poll
    wrap.querySelectorAll('.poll-close-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        try {
          const res = await apiPut(`/api/polls/${pollId}/close`);
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          showNotification('success',t('poll_closed_success')||'Poll closed');
          _loadPolls(modal);
        } catch (e) { showError(e.message); }
      });
    });

    // Bind send reminder
    wrap.querySelectorAll('.poll-remind-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = parseInt(btn.dataset.pollId);
        try {
          const res = await apiPost(`/api/polls/${pollId}/remind`, {});
          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || 'Failed'); }
          const data = await res.json().catch(()=>({}));
          showNotification('success', (t('poll_reminder_sent')||'Reminder sent') + (data.reminded != null ? ` (${data.reminded})` : ''));
        } catch (e) { showError(e.message); }
      });
    });
  } catch (e) {
    wrap.innerHTML = `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('poll_no_polls')||'No polls found.'}</p>`;
  }
}

// Symbol palettes for each resource type
const _resourceSymbols = {
  room: ['🏠','🚪','🛋','📐','🪑','🖥','📽','🎙','📞','🏫','🏥','🏛','🏗','🔬','🧪'],
  building: ['🏢','🏬','🏭','🏗','🏛','🏤','🏣','🏦','🏨','🏩','🏪','🏫','🏥','⛪','🕌','🕍','🛕','⛩','🏰','🏯','🗼','🏚','🏘','🏙','🌆','🌇','🌃','🗽','🏟','⛲'],
  computer_service: ['💻','🖥','🖨','🖱','⌨','💾','💿','📀','🔌','📡','📶','🌐','🔒','🔑','🛡','⚙','🔧','🧰','📊','📈','🗄','🗃','📁','📂','📧','📨','🔗','🧮','☁','🔄','📲','📱','🤖','🧠','🔬','📟','🎛','📺','🎮','🕹','🌍','🔐','🛜','📳','🏧'],
  data_center: ['🖥','🗄','💾','📡','🔌','⚡','❄','🌡','🔒','🛡','🏗','🏢','📊','🔄','☁','🌐','📶','🧊','🔧','⚙','🖧','📦','🗃','🔋','💡','🌀','🎚','🎛','📟','🧰'],
  vehicle: ['🚗','🚙','🚕','🚌','🚎','🚐','🚑','🚒','🚓','🚔','🚘','🚍','🚖','🛻','🚚','🚛','🚜','✈️','🛩','🚁','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🛤','⛵','🛶','🚤','🛳','⛴','🛥','🏍','🛵','🚲','🛴','🛞','⛽','🚧'],
  equipment: ['🔧','🔨','⚒','🛠','⛏','🔩','⚙','🧰','🪛','🪚','📦','📮','🔐','🔒','🔓','📟','📠','📺','📻','📡','🔋','🔌','💡','🕯','🧲','🧯','🪜','🧱','⛓','🪝','🎖','🏅','🔭','🔬','🧪','⚗','🩺','💉','🩹','⚖','🧭','📐','📏'],
  exercise_area: ['🏋','🤸','🏃','🚴','🧗','🤺','🥊','🥋','⛹','🏊','🎯','🏹','🪂','🏕','🗺','🧭','⛰','🏔','🌲','🌳','🏟','🏜','🌾','🛤'],
  work_area: ['💼','📋','📝','🖊','📎','🗂','📁','🖥','📊','📈','🗃','📐','✏','📌','📍','🖇','📏','🧮','🏢','🏗','🛠','⚙'],
  rest_room: ['🛋','☕','🍵','🧘','😴','🛏','🪑','📺','🎵','📖','🎮','🕹','🍽','🧊','🚰','🚿','🏠','🛁','🌿','🕯'],
  training_ground: ['🎯','🏋','🪖','🔫','🛡','⚔','🏃','🧗','🪂','🏕','⛺','🗺','🧭','🎖','🏹','🥊','🤺','🚁','📡','🔭','⛰','🌲','🏔','🏜']
};

function openRoomModal(argJson) {
  const data = typeof argJson === 'string' ? JSON.parse(argJson) : (argJson || {});
  const isEdit = !!data.id;
  const typeLabel = {room:'Room', building:'Building', computer_service:'IT Service', data_center:'Data Center', exercise_area:'Exercise Area', work_area:'Work Area', rest_room:'Rest Room', training_ground:'Training Ground'};
  // Look up custom resource type label if not a built-in type
  let label = typeLabel[data.type] || 'Resource';
  if (!typeLabel[data.type] && state._customResourceTypes) {
    const ct = state._customResourceTypes.find(c => c.key === data.type);
    if (ct) label = ct.label;
  }
  const symbols = _resourceSymbols[data.type] || _resourceSymbols.room;
  const currentIcon = data.icon || '';
  const hasImage = isEdit && data.image_name;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header"><h3>${isEdit ? (t('btn_edit')||'Edit') : (t('btn_add')||'Add')} ${escHtml(label)}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button></div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <label class="form-label">${t('name')||'Name'}</label>
        <input class="form-input" id="rmName" value="${escHtml(data.name||'')}">
        <label class="form-label" style="margin-top:8px">${t('description')||'Description'}</label>
        <input class="form-input" id="rmDesc" value="${escHtml(data.description||'')}">
        ${data.type === 'room' ? `<label class="form-label" style="margin-top:8px">${t('room_sub_type')||'Room Type'}</label>
        <select class="form-input" id="rmSubType" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px">
          <option value="">${t('room_type_general')||'General'}</option>
          <option value="meeting_room"${data.sub_type==='meeting_room'?' selected':''}>${t('room_type_meeting')||'Meeting Room'}</option>
          <option value="video_room"${data.sub_type==='video_room'?' selected':''}>${t('room_type_video')||'Video Room'}</option>
          <option value="aula"${data.sub_type==='aula'?' selected':''}>${t('room_type_aula')||'Aula / Lecture Hall'}</option>
          <option value="studio"${data.sub_type==='studio'?' selected':''}>${t('room_type_studio')||'Studio'}</option>
          <option value="server_room"${data.sub_type==='server_room'?' selected':''}>${t('room_type_server')||'Server Room'}</option>
          <option value="depot"${data.sub_type==='depot'?' selected':''}>${t('room_type_depot')||'Depot / Storage'}</option>
          <option value="workshop"${data.sub_type==='workshop'?' selected':''}>${t('room_type_workshop')||'Workshop'}</option>
          <option value="lab"${data.sub_type==='lab'?' selected':''}>${t('room_type_lab')||'Laboratory'}</option>
        </select>` : ''}
        <label class="form-label" style="margin-top:8px">${t('location')||'Location'}</label>
        <input class="form-input" id="rmLoc" value="${escHtml(data.location||'')}">
        ${data.type === 'room' ? `<label class="form-label" style="margin-top:8px">${t('capacity')||'Capacity'}</label>
        <input class="form-input" id="rmCap" type="number" value="${data.capacity||0}">` : ''}

        <label class="form-label" style="margin-top:12px">${t('rm_icon')||'Symbol'}</label>
        <div id="rmIconGrid" style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto;padding:4px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
          ${symbols.map(s => `<button type="button" class="rm-icon-btn${currentIcon===s?' rm-icon-selected':''}" data-icon="${s}" style="font-size:20px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:${currentIcon===s?'var(--accent)':'var(--bg2)'};border:1px solid ${currentIcon===s?'var(--accent)':'var(--border)'};border-radius:var(--radius);cursor:pointer">${s}</button>`).join('')}
        </div>
        <input type="hidden" id="rmIcon" value="${escHtml(currentIcon)}">

        <label class="form-label" style="margin-top:12px">${t('rm_image')||'Photo / Image'}</label>
        ${hasImage ? `<div id="rmCurrentImage" style="margin-bottom:6px">
          <img src="/api/rooms/${data.id}/image" alt="Resource image" style="max-width:100%;max-height:150px;border-radius:var(--radius);border:1px solid var(--border)">
        </div>` : ''}
        <input type="file" id="rmImageFile" accept="image/*" style="font-size:var(--fs-xs)">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-action="_closeParentModal" data-arg-el>${t('btn_cancel')||'Cancel'}</button>
        <button class="btn btn-primary" id="rmSaveBtn">${t('btn_save')||'Save'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  // Icon selection
  modal.querySelectorAll('.rm-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.rm-icon-btn').forEach(b => {
        b.style.background = 'var(--bg2)';
        b.style.borderColor = 'var(--border)';
        b.classList.remove('rm-icon-selected');
      });
      btn.style.background = 'var(--accent)';
      btn.style.borderColor = 'var(--accent)';
      btn.classList.add('rm-icon-selected');
      document.getElementById('rmIcon').value = btn.dataset.icon;
    });
  });

  modal.querySelector('#rmSaveBtn').addEventListener('click', async () => {
    const room = {
      name: document.getElementById('rmName').value.trim(),
      type: data.type || 'room',
      sub_type: document.getElementById('rmSubType')?.value || '',
      description: document.getElementById('rmDesc')?.value?.trim() || '',
      location: document.getElementById('rmLoc')?.value?.trim() || '',
      capacity: parseInt(document.getElementById('rmCap')?.value) || 0,
      icon: document.getElementById('rmIcon')?.value || '',
      enabled: true,
    };
    if (isEdit) {
      room.id = data.id;
      room.image_name = data.image_name || '';
    }
    if (!room.name) { showError(t('name')||'Name required'); return; }
    const res = await apiPut('/api/rooms', room);
    if (!res.ok) { showError('Failed to save'); return; }

    // Upload image if selected
    const imgFile = document.getElementById('rmImageFile')?.files?.[0];
    const roomId = isEdit ? data.id : (await (async () => {
      // For new rooms, fetch the room list to find the one we just created
      const rooms = await apiGet('/api/rooms');
      const found = rooms?.find(r => r.name === room.name && r.type === room.type);
      return found?.id;
    })());
    if (imgFile && roomId) {
      const fd = new FormData();
      fd.append('image', imgFile);
      await api('POST', `/api/rooms/${roomId}/image`, fd);
    }

    showNotification('success', `${label} ${t('saved')||'saved'}`);
    modal.remove();
    renderSidebar();
  });
}

// ── Checklists ──────────────────────────────────────────────────────────────

function showChecklistsInSidebar() {
  state.sidebarTab = 'checklists';
  // Activate the tab visually (even though the tab button is removed, renderSidebar handles the content)
  document.querySelectorAll('#sidebarTabs .sidebar-tab').forEach(btn => btn.classList.remove('active'));
  renderSidebar();
}

async function _loadChecklistInstances() {
  const activeEl = document.getElementById('checklistActiveList');
  const completedEl = document.getElementById('checklistCompletedList');
  if (!activeEl || !completedEl) return;
  try {
    const res = await api('GET', '/api/checklist-instances');
    const instances = await res.json();
    const active = instances.filter(i => i.status === 'active');
    const completed = instances.filter(i => i.status === 'completed');
    if (active.length === 0) {
      activeEl.innerHTML = `<p style="color:var(--text-dim);font-style:italic">${t('checklist_no_active')||'No active checklists.'}</p>`;
    } else {
      activeEl.innerHTML = active.map(ci => {
        const total = ci.items.length;
        const checked = ci.items.filter(it => it.checked).length;
        const pct = total > 0 ? Math.round(checked/total*100) : 0;
        return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:8px;margin-bottom:6px;background:var(--bg2);cursor:pointer" data-action="openChecklistInstance" data-arg="${ci.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <strong style="font-size:var(--fs-sm)">${escHtml(ci.name)}</strong>
            <span style="font-size:10px;color:var(--text-dim)">${checked}/${total}</span>
          </div>
          <div style="background:var(--bg3);border-radius:4px;height:6px;overflow:hidden">
            <div style="background:var(--accent);height:100%;width:${pct}%;transition:width .3s"></div>
          </div>
        </div>`;
      }).join('');
    }
    if (completed.length === 0) {
      completedEl.innerHTML = `<p style="color:var(--text-dim);font-style:italic">—</p>`;
    } else {
      completedEl.innerHTML = completed.slice(0, 10).map(ci =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer" data-action="openChecklistInstance" data-arg="${ci.id}">
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:var(--fs-xs)">${escHtml(ci.name)}</span>
            <span style="font-size:10px;color:var(--text-dim)">${ci.completed_at ? new Date(ci.completed_at).toLocaleDateString() : ''}</span>
          </div>
          ${ci.completed_by_name ? `<div style="font-size:10px;color:var(--text-dim)">${t('checklist_completed_by')||'Completed by'}: ${escHtml(ci.completed_by_name)}</div>` : ''}
        </div>`
      ).join('');
    }
    _bindActions(activeEl);
    _bindActions(completedEl);
  } catch(e) {
    activeEl.innerHTML = `<p style="color:var(--danger)">Failed to load checklists</p>`;
    completedEl.innerHTML = '';
  }
}

async function _loadChecklistLog() {
  const container = document.getElementById('checklistLogEntries');
  if (!container) return;
  try {
    const res = await api('GET', '/api/checklist-instances');
    const instances = await res.json();
    const completed = instances.filter(i => i.status === 'completed').sort((a, b) =>
      (b.completed_at ? new Date(b.completed_at) : 0) - (a.completed_at ? new Date(a.completed_at) : 0)
    );
    if (completed.length === 0) {
      container.innerHTML = `<em style="color:var(--text-dim)">${t('checklist_logs_empty')||'No completed checklists yet.'}</em>`;
      return;
    }
    container.innerHTML = completed.map(ci => {
      const total = ci.items ? ci.items.length : 0;
      const checked = ci.items ? ci.items.filter(it => it.checked).length : 0;
      const skipped = ci.items ? ci.items.filter(it => it.skipped).length : 0;
      return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:8px;margin-bottom:6px;background:var(--bg2);cursor:pointer" data-action="openChecklistInstance" data-arg="${ci.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <strong style="font-size:var(--fs-sm)">${escHtml(ci.name)}</strong>
          <span style="font-size:10px;color:var(--text-dim)">${ci.completed_at ? new Date(ci.completed_at).toLocaleString() : ''}</span>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim)">
          ${ci.completed_by_name ? `${t('checklist_completed_by')||'Completed by'}: <strong>${escHtml(ci.completed_by_name)}</strong>` : ''}
          ${ci.created_by_name ? ` · Started by: ${escHtml(ci.created_by_name)}` : ''}
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
          ✅ ${checked} checked · ⏭ ${skipped} skipped · ${total} total
        </div>
      </div>`;
    }).join('');
    _bindActions(container);
  } catch(e) {
    container.innerHTML = `<em style="color:var(--danger)">Failed to load checklist log</em>`;
  }
}

async function openChecklistStart() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px;width:90vw">
      <div class="modal-header">
        <h3>▶ ${t('checklist_start')||'Start Checklist'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('checklist_start')||'Select a checklist template to start:'}
        </p>
        <div id="checklistTemplateList" style="font-size:var(--fs-sm)">Loading...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  try {
    const res = await api('GET', '/api/checklist-templates');
    const templates = await res.json();
    const listEl = modal.querySelector('#checklistTemplateList');
    if (templates.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-dim)">No templates available.</p>';
      return;
    }
    listEl.innerHTML = templates.map(tmpl =>
      `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:6px;background:var(--bg2)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${escHtml(tmpl.name)}</strong>
            ${tmpl.built_in ? `<span style="font-size:10px;color:var(--text-dim);margin-left:4px">(${t('checklist_builtin')||'Built-in'})</span>` : ''}
            <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${escHtml(tmpl.description||'')}</div>
            <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${tmpl.items?.length||0} items</div>
          </div>
          <button class="btn btn-sm btn-primary _cl_start_btn" data-tmpl-id="${tmpl.id}" data-tmpl-name="${escHtml(tmpl.name)}">▶ ${t('checklist_start')||'Start'}</button>
        </div>
      </div>`
    ).join('');
    listEl.querySelectorAll('._cl_start_btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tid = parseInt(btn.dataset.tmplId);
        try {
          await api('POST', '/api/checklist-instances', { template_id: tid, name: btn.dataset.tmplName });
          showNotification('success', 'Checklist started');
          modal.remove();
          _loadChecklistInstances();
        } catch(e) { showError('Failed to start checklist'); }
      });
    });
  } catch(e) {
    modal.querySelector('#checklistTemplateList').innerHTML = '<p style="color:var(--danger)">Failed to load templates</p>';
  }
}

async function openChecklistInstance(idOrStr) {
  const id = typeof idOrStr === 'string' ? parseInt(idOrStr) : idOrStr;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:650px;width:90vw">
      <div class="modal-header">
        <h3>📋 ${t('checklists')||'Checklist'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:75vh;overflow-y:auto" id="checklistInstanceBody">Loading...</div>
      <div class="modal-footer" id="checklistInstanceFooter"></div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  try {
    const res = await api('GET', '/api/checklist-instances');
    const instances = await res.json();
    const ci = instances.find(x => x.id === id);
    if (!ci) { modal.querySelector('#checklistInstanceBody').innerHTML = 'Not found'; return; }

    function renderInstance() {
      const total = ci.items.length;
      const checked = ci.items.filter(it => it.checked).length;
      const skipped = ci.items.filter(it => it.skipped).length;
      const done = checked + skipped;
      const pct = total > 0 ? Math.round(done/total*100) : 0;
      const isComplete = ci.status === 'completed';

      // Group items by category
      const categories = {};
      ci.items.forEach((it, idx) => {
        const cat = it.category || '';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ ...it, _idx: idx });
      });

      let html = `
        <div style="margin-bottom:12px">
          <h4 style="margin:0 0 4px 0;font-size:var(--fs-sm)">${escHtml(ci.name)}</h4>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="flex:1;background:var(--bg3);border-radius:4px;height:8px;overflow:hidden">
              <div style="background:${pct===100?'var(--success)':'var(--accent)'};height:100%;width:${pct}%;transition:width .3s"></div>
            </div>
            <span style="font-size:var(--fs-xs);color:var(--text-dim);white-space:nowrap">${done}/${total} (${pct}%)${skipped?' · '+skipped+' '+(t('checklist_skipped_label')||'skipped'):''}</span>
          </div>
        </div>`;

      for (const [cat, items] of Object.entries(categories)) {
        if (cat) html += `<div style="font-size:var(--fs-xs);color:var(--accent);font-weight:600;margin:8px 0 4px 0;text-transform:uppercase">${escHtml(cat)}</div>`;
        items.forEach(it => {
          const itemBg = it.skipped ? 'color-mix(in srgb, var(--warning) 8%, var(--bg2))' : it.checked ? 'color-mix(in srgb, var(--success) 8%, var(--bg2))' : 'var(--bg2)';
          const itemStyle = it.skipped ? 'text-decoration:line-through;opacity:.5;font-style:italic' : it.checked ? 'text-decoration:line-through;opacity:.6' : '';
          html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:var(--radius);margin-bottom:2px;background:${itemBg}">
            <label style="display:flex;align-items:flex-start;gap:8px;flex:1;cursor:${isComplete||it.skipped?'default':'pointer'};margin:0">
              <input type="checkbox" class="_cl_check" data-idx="${it._idx}" ${it.checked?'checked':''} ${isComplete||it.skipped?'disabled':''}
                style="margin-top:2px;width:16px;height:16px;accent-color:var(--success);flex-shrink:0">
              <span style="font-size:var(--fs-sm);${itemStyle}">${escHtml(it.text)}${it.skipped?' <em style="font-size:var(--fs-xs);color:var(--warning)">('+( t('checklist_skipped_label')||'skipped')+')</em>':''}</span>
            </label>
            ${!isComplete && !it.checked ? `<button class="_cl_skip btn btn-sm" data-idx="${it._idx}" style="padding:1px 6px;font-size:var(--fs-xs);opacity:.7;flex-shrink:0" title="${t('checklist_skip')||'Skip'}">${it.skipped?(t('checklist_unskip')||'Unskip'):(t('checklist_skip')||'Skip')}</button>` : ''}
          </div>`;
        });
      }
      modal.querySelector('#checklistInstanceBody').innerHTML = html;

      // Footer
      const footerEl = modal.querySelector('#checklistInstanceFooter');
      if (isComplete) {
        const completedInfo = ci.completed_by_name ? `<span style="font-size:var(--fs-xs);color:var(--text-dim);margin-right:auto">${t('checklist_completed_by')||'Completed by'}: <strong>${escHtml(ci.completed_by_name)}</strong>${ci.completed_at ? ' · ' + new Date(ci.completed_at).toLocaleString() : ''}</span>` : '';
        footerEl.innerHTML = `
          ${completedInfo}
          <button class="btn btn-sm btn-secondary" id="_cl_reopen">↩ ${t('checklist_reopen')||'Reopen'}</button>
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>`;
        footerEl.querySelector('#_cl_reopen').addEventListener('click', async () => {
          ci.status = 'active';
          ci.completed_at = null;
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          renderInstance();
          _loadChecklistInstances();
        });
      } else {
        footerEl.innerHTML = `
          <button class="btn btn-sm btn-danger" id="_cl_delete">🗑 ${t('checklist_delete')||'Delete'}</button>
          <button class="btn btn-sm btn-primary" id="_cl_complete" ${done<total?'disabled':''}>✅ ${t('checklist_complete')||'Mark Complete'}</button>
          <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>`;
        footerEl.querySelector('#_cl_complete').addEventListener('click', async () => {
          ci.status = 'completed';
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          showNotification('success', 'Checklist completed!');
          renderInstance();
          _loadChecklistInstances();
        });
        footerEl.querySelector('#_cl_delete').addEventListener('click', async () => {
          if (!confirm(t('checklist_delete_confirm')||'Delete this checklist?')) return;
          await api('DELETE', `/api/checklist-instances/${ci.id}`);
          modal.remove();
          _loadChecklistInstances();
        });
      }
      _bindActions(footerEl);

      // Bind checkbox toggles
      modal.querySelectorAll('._cl_check').forEach(cb => {
        cb.addEventListener('change', async () => {
          const idx = parseInt(cb.dataset.idx);
          ci.items[idx].checked = cb.checked;
          if (cb.checked) {
            ci.items[idx].checked_by = state.user?.id || 0;
            const now = new Date().toISOString();
            ci.items[idx].checked_at = now;
          } else {
            ci.items[idx].checked_by = 0;
            ci.items[idx].checked_at = null;
          }
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          renderInstance();
          _loadChecklistInstances();
        });
      });

      // Bind skip toggles
      modal.querySelectorAll('._cl_skip').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const idx = parseInt(btn.dataset.idx);
          const wasSkipped = ci.items[idx].skipped;
          ci.items[idx].skipped = !wasSkipped;
          if (!wasSkipped) {
            ci.items[idx].skipped_by = state.user?.id || 0;
            ci.items[idx].skipped_at = new Date().toISOString();
          } else {
            ci.items[idx].skipped_by = 0;
            ci.items[idx].skipped_at = null;
          }
          await api('PUT', `/api/checklist-instances/${ci.id}`, ci);
          renderInstance();
          _loadChecklistInstances();
        });
      });
    }
    renderInstance();
  } catch(e) {
    modal.querySelector('#checklistInstanceBody').innerHTML = '<p style="color:var(--danger)">Failed to load checklist</p>';
  }
}

function _addChecklistItemRow(container, text, category) {
  const row = document.createElement('div');
  row.className = 'cl-item-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  row.innerHTML = `
    <button class="btn btn-sm cl-move-up" style="padding:1px 4px;font-size:9px;flex-shrink:0;opacity:.6" title="${t('checklist_move_up')||'Move up'}">▲</button>
    <button class="btn btn-sm cl-move-down" style="padding:1px 4px;font-size:9px;flex-shrink:0;opacity:.6" title="${t('checklist_move_down')||'Move down'}">▼</button>
    <input type="text" class="cl-item-text" placeholder="${t('checklist_item_text')||'Item text...'}" value="${escHtml(text)}"
      style="flex:1;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
    <input type="text" class="cl-item-cat" placeholder="${t('checklist_item_category')||'Category'}" value="${escHtml(category||'')}"
      style="width:100px;padding:4px 8px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
    <button class="btn btn-sm btn-danger" style="padding:2px 6px;font-size:10px;flex-shrink:0" title="${t('checklist_remove')||'Remove'}">✕</button>`;
  row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
  row.querySelector('.cl-move-up').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev && prev.classList.contains('cl-item-row')) container.insertBefore(row, prev);
  });
  row.querySelector('.cl-move-down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('cl-item-row')) container.insertBefore(next, row);
  });
  container.appendChild(row);
}

async function openChecklistEditor() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:900px;width:90vw">
      <div class="modal-header">
        <h3>✏ ${t('checklist_editor')||'Checklist Editor'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('checklists_desc')||'Create and manage reusable checklist templates.'}
        </p>
        <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
          <select id="clEditorList" style="flex:1;min-width:200px;padding:6px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            <option value="__new__">── ${t('checklist_new')||'New Checklist'} ──</option>
          </select>
          <button class="btn btn-sm btn-primary" id="clEditorNewBtn">+ ${t('checklist_new')||'New'}</button>
          <button class="btn btn-sm btn-secondary" id="clEditorCloneBtn" style="display:none">📋 ${t('checklist_clone')||'Clone'}</button>
        </div>
        <div id="clEditorForm" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg2)">
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('checklist_template_name')||'Checklist Name'}:</label>
            <input type="text" id="clEditorName" placeholder="${t('checklist_template_name')||'Checklist Name'}..." maxlength="200"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('checklist_template_desc')||'Description'}:</label>
            <input type="text" id="clEditorDesc" placeholder="${t('checklist_template_desc')||'Description'}..." maxlength="500"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-bottom:4px;display:block">${t('checklist_items')||'Items'}:</label>
            <div id="clEditorItems"></div>
            <button class="btn btn-sm btn-secondary" id="clEditorAddItem" style="margin-top:4px">+ ${t('checklist_add_item')||'Add Item'}</button>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-sm btn-danger" id="clEditorDeleteBtn" style="display:none">${t('checklist_delete')||'Delete'}</button>
            <button class="btn btn-sm btn-primary" id="clEditorSaveBtn">${t('checklist_save')||'Save Checklist'}</button>
          </div>
          <div id="clEditorBuiltinNote" style="display:none;margin-top:8px;padding:8px;background:var(--bg3);border-radius:var(--radius);font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('checklist_builtin')||'Built-in'} — read-only
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  let templates = [];
  const listEl = modal.querySelector('#clEditorList');
  const nameEl = modal.querySelector('#clEditorName');
  const descEl = modal.querySelector('#clEditorDesc');
  const itemsEl = modal.querySelector('#clEditorItems');
  const deleteBtn = modal.querySelector('#clEditorDeleteBtn');
  const saveBtn = modal.querySelector('#clEditorSaveBtn');
  const builtinNote = modal.querySelector('#clEditorBuiltinNote');
  const cloneBtn = modal.querySelector('#clEditorCloneBtn');

  async function loadList() {
    try {
      const resp = await api('GET', '/api/checklist-templates');
      templates = await resp.json();
    } catch(e) { templates = []; }
    listEl.innerHTML = `<option value="__new__">── ${t('checklist_new')||'New Checklist'} ──</option>`;
    templates.forEach(tmpl => {
      const opt = document.createElement('option');
      opt.value = tmpl.id;
      opt.textContent = tmpl.name + (tmpl.built_in ? ` (${t('checklist_builtin')||'Built-in'})` : '');
      listEl.appendChild(opt);
    });
  }

  function loadForm(tmpl) {
    const isBuiltIn = tmpl && tmpl.built_in;
    nameEl.value = tmpl ? tmpl.name : '';
    descEl.value = tmpl ? (tmpl.description || '') : '';
    itemsEl.innerHTML = '';
    if (tmpl && tmpl.items) {
      tmpl.items.forEach(it => _addChecklistItemRow(itemsEl, it.text, it.category));
    }
    nameEl.disabled = false;
    descEl.disabled = false;
    deleteBtn.style.display = (tmpl && !isBuiltIn && tmpl.id > 0) ? '' : 'none';
    saveBtn.style.display = '';
    saveBtn.textContent = isBuiltIn ? ('💾 ' + (t('checklist_save')||'Save as Custom')) : ('💾 ' + (t('checklist_save')||'Save Checklist'));
    builtinNote.style.display = isBuiltIn ? '' : 'none';
    builtinNote.innerHTML = isBuiltIn ? `${t('checklist_builtin')||'Built-in'} — ${t('checklist_clone')||'editing will save as a new custom checklist'}` : '';
    cloneBtn.style.display = tmpl ? '' : 'none';
    itemsEl.querySelectorAll('input').forEach(el => el.disabled = false);
    itemsEl.querySelectorAll('.btn-danger').forEach(el => el.style.display = '');
    itemsEl.querySelectorAll('.cl-move-up,.cl-move-down').forEach(el => el.style.display = '');
    modal.querySelector('#clEditorAddItem').style.display = '';
  }

  listEl.addEventListener('change', () => {
    if (listEl.value === '__new__') {
      loadForm(null);
    } else {
      const tmpl = templates.find(x => String(x.id) === listEl.value);
      if (tmpl) loadForm(tmpl);
    }
  });

  modal.querySelector('#clEditorNewBtn').addEventListener('click', () => {
    listEl.value = '__new__';
    loadForm(null);
  });

  modal.querySelector('#clEditorAddItem').addEventListener('click', () => {
    _addChecklistItemRow(itemsEl, '', '');
  });

  saveBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) { showError(t('checklist_template_name')||'Name is required'); return; }
    const items = [];
    itemsEl.querySelectorAll('.cl-item-row').forEach(row => {
      const text = row.querySelector('.cl-item-text')?.value?.trim();
      const cat = row.querySelector('.cl-item-cat')?.value?.trim() || '';
      if (text) items.push({ text, category: cat });
    });
    if (items.length === 0) { showError(t('checklist_add_item')||'Add at least one item'); return; }
    const selectedId = listEl.value;
    const selectedTmpl = templates.find(x => String(x.id) === selectedId);
    const isBuiltIn = selectedTmpl && selectedTmpl.built_in;
    const body = { name, description: descEl.value.trim(), items };
    try {
      if (selectedId === '__new__' || isBuiltIn) {
        // Built-in templates are saved as new custom checklists
        await api('POST', '/api/checklist-templates', body);
        showNotification('success', `${name} created`);
      } else {
        await api('PUT', `/api/checklist-templates/${selectedId}`, body);
        showNotification('success', `${name} updated`);
      }
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to save: ' + (e.message||e)); }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(t('checklist_delete_confirm')||'Are you sure you want to delete this checklist?')) return;
    const selectedId = listEl.value;
    try {
      await api('DELETE', `/api/checklist-templates/${selectedId}`);
      showNotification('success', 'Checklist deleted');
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to delete: ' + (e.message||e)); }
  });

  cloneBtn.addEventListener('click', async () => {
    const selectedId = listEl.value;
    if (selectedId === '__new__') return;
    const tmpl = templates.find(x => String(x.id) === selectedId);
    if (!tmpl) return;
    const cloneName = (t('checklist_clone_name')||'Clone of') + ' ' + tmpl.name;
    const cloneItems = (tmpl.items || []).map(it => ({ text: it.text, category: it.category || '' }));
    try {
      await api('POST', '/api/checklist-templates', { name: cloneName, description: tmpl.description || '', items: cloneItems });
      showNotification('success', `${cloneName} created`);
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to clone: ' + (e.message||e)); }
  });

  await loadList();
  loadForm(null);
}

// ── Poll Questionnaire Editor ────────────────────────────────────────────────

async function openQuestionnaireEditor() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';

  modal.innerHTML = `
    <div class="modal" style="max-width:900px;width:90vw">
      <div class="modal-header">
        <h3>📝 ${t('questionnaire_editor')||'Poll Questions Editor'}</h3>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto">
        <p style="font-size:var(--fs-sm);color:var(--text-dim);margin-bottom:12px">
          ${t('questionnaire_editor_desc')||'Create and manage reusable questionnaires for polls.'}
        </p>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <select id="qEditorList" style="flex:1;padding:6px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
            <option value="__new__">── ${t('questionnaire_new')||'New Questionnaire'} ──</option>
          </select>
          <button class="btn btn-sm btn-primary" id="qEditorNewBtn">+ ${t('questionnaire_new')||'New'}</button>
        </div>
        <div id="qEditorBuiltinWarn" style="display:none;margin-bottom:8px;padding:8px 12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:var(--radius);font-size:var(--fs-xs);color:#8b6914">
          ⚠️ ${t('questionnaire_builtin_edit_warn')||'You are editing a built-in questionnaire. Changes will be saved as a new copy.'}
        </div>
        <div id="qEditorForm" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg2)">
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('questionnaire_name')||'Questionnaire Name'}:</label>
            <input type="text" id="qEditorName" placeholder="${t('questionnaire_name')||'Questionnaire Name'}..." maxlength="200"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('questionnaire_desc')||'Description'}:</label>
            <input type="text" id="qEditorDesc" placeholder="${t('questionnaire_desc')||'Description'}..." maxlength="500"
              style="width:100%;padding:5px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600;margin-bottom:4px;display:block">${t('questionnaire_questions')||'Questions'}:</label>
            <div id="qEditorQuestions"></div>
            <button class="btn btn-sm btn-secondary" id="qEditorAddQ" style="margin-top:4px">+ ${t('questionnaire_add_question')||'Add Question'}</button>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-sm btn-secondary" id="qEditorDuplicateBtn" style="display:none">📋 ${t('questionnaire_duplicate')||'Duplicate'}</button>
            <button class="btn btn-sm btn-danger" id="qEditorDeleteBtn" style="display:none">${t('questionnaire_delete')||'Delete'}</button>
            <button class="btn btn-sm btn-primary" id="qEditorSaveBtn">${t('questionnaire_save')||'Save Questionnaire'}</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);

  let questionnaires = [];
  let _builtinEditAcknowledged = false; // Only show confirmation once per session
  const listEl = modal.querySelector('#qEditorList');
  const nameEl = modal.querySelector('#qEditorName');
  const descEl = modal.querySelector('#qEditorDesc');
  const questionsEl = modal.querySelector('#qEditorQuestions');
  const deleteBtn = modal.querySelector('#qEditorDeleteBtn');
  const duplicateBtn = modal.querySelector('#qEditorDuplicateBtn');
  const saveBtn = modal.querySelector('#qEditorSaveBtn');
  const builtinWarn = modal.querySelector('#qEditorBuiltinWarn');

  async function loadList(selectId) {
    try {
      const resp = await api('GET', '/api/poll-questionnaires');
      questionnaires = await resp.json();
    } catch(e) { questionnaires = []; }
    // Rebuild select
    listEl.innerHTML = `<option value="__new__">── ${t('questionnaire_new')||'New Questionnaire'} ──</option>`;
    questionnaires.forEach(q => {
      const tq = _translateSQ(q);
      const opt = document.createElement('option');
      opt.value = q.id;
      opt.textContent = tq.name + (q.built_in ? ` (${t('questionnaire_builtin')||'Built-in'})` : '');
      listEl.appendChild(opt);
    });
    if (selectId !== undefined) {
      listEl.value = String(selectId);
    }
  }

  function _getCurrentQ() {
    if (listEl.value === '__new__') return null;
    return questionnaires.find(x => String(x.id) === listEl.value) || null;
  }

  function loadForm(q) {
    const isBuiltIn = q && q.built_in;
    _builtinEditAcknowledged = false; // Reset per questionnaire switch
    const tq = _translateSQ(q);
    nameEl.value = tq ? tq.name : '';
    descEl.value = tq ? (tq.description || '') : '';
    questionsEl.innerHTML = '';
    if (tq && tq.questions) {
      const typeMap = { scale_0_3: 'scale', yes_no: 'yes_no', free_text: 'free_text' };
      tq.questions.forEach(qu => _addPollQuestionRow(questionsEl, qu.text, typeMap[qu.type] || qu.type || 'scale'));
    }
    // All fields are always editable — built-in questionnaires can be edited (will save as copy)
    nameEl.disabled = false;
    descEl.disabled = false;
    questionsEl.querySelectorAll('textarea, select').forEach(el => el.disabled = false);
    questionsEl.querySelectorAll('.btn-danger').forEach(el => el.style.display = '');
    modal.querySelector('#qEditorAddQ').style.display = '';

    // Show/hide buttons
    deleteBtn.style.display = (q && !isBuiltIn && q.id > 0) ? '' : 'none';
    duplicateBtn.style.display = (q && q.id > 0) ? '' : 'none'; // Visible for all existing questionnaires
    saveBtn.style.display = '';
    builtinWarn.style.display = isBuiltIn ? '' : 'none';
  }

  // Confirmation guard for built-in edits — returns true if editing can proceed
  function _confirmBuiltinEdit() {
    const q = _getCurrentQ();
    if (!q || !q.built_in) return true;
    if (_builtinEditAcknowledged) return true;
    const msg = t('questionnaire_builtin_edit_confirm') || 'This is a standard questionnaire. Your changes will be saved as a new custom copy. Continue?';
    if (!confirm(msg)) return false;
    _builtinEditAcknowledged = true;
    showNotification('info', t('questionnaire_builtin_acknowledged') || 'Editing acknowledged — changes will create a new copy');
    return true;
  }

  // Attach confirmation guard to editable fields
  function _attachBuiltinGuard() {
    nameEl.addEventListener('focus', (e) => { if (!_confirmBuiltinEdit()) { nameEl.blur(); } });
    descEl.addEventListener('focus', (e) => { if (!_confirmBuiltinEdit()) { descEl.blur(); } });
  }
  _attachBuiltinGuard();

  listEl.addEventListener('change', () => {
    if (listEl.value === '__new__') {
      loadForm(null);
    } else {
      const q = questionnaires.find(x => String(x.id) === listEl.value);
      if (q) loadForm(q);
    }
  });

  modal.querySelector('#qEditorNewBtn').addEventListener('click', () => {
    listEl.value = '__new__';
    loadForm(null);
  });

  modal.querySelector('#qEditorAddQ').addEventListener('click', () => {
    if (!_confirmBuiltinEdit()) return;
    _addPollQuestionRow(questionsEl, '', 'scale');
  });

  // Duplicate button
  duplicateBtn.addEventListener('click', async () => {
    const selectedId = listEl.value;
    if (selectedId === '__new__') return;
    if (!confirm(t('questionnaire_duplicate_confirm') || 'Duplicate this questionnaire?')) return;
    try {
      const resp = await api('POST', `/api/poll-questionnaires/${selectedId}/duplicate`);
      if (resp.ok) {
        const newQ = await resp.json();
        showNotification('success', t('questionnaire_duplicated') || 'Questionnaire duplicated');
        await loadList(newQ.id);
        const q = questionnaires.find(x => x.id === newQ.id);
        if (q) loadForm(q);
      } else {
        const err = await resp.json().catch(() => ({}));
        showError(err.error || 'Failed to duplicate');
      }
    } catch(e) { showError('Failed to duplicate: ' + (e.message||e)); }
  });

  saveBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) { showError(t('questionnaire_name')||'Name is required'); return; }
    const questions = [];
    questionsEl.querySelectorAll('.poll-q-row').forEach(row => {
      const text = row.querySelector('.poll-q-text')?.value?.trim();
      const rawType = row.querySelector('.poll-q-type')?.value || 'scale';
      const typeMap = { scale: 'scale_0_3', yes_no: 'yes_no', free_text: 'free_text' };
      if (text) questions.push({ text, type: typeMap[rawType] || rawType });
    });
    if (questions.length === 0) { showError(t('questionnaire_add_question')||'Add at least one question'); return; }
    const selectedId = listEl.value;
    const currentQ = _getCurrentQ();
    const isBuiltIn = currentQ && currentQ.built_in;
    const body = { name, description: descEl.value.trim(), questions };
    // When saving a built-in questionnaire, add acknowledge flag so backend creates a copy
    if (isBuiltIn) body.acknowledge_builtin = true;
    try {
      if (selectedId === '__new__') {
        await api('POST', '/api/poll-questionnaires', body);
        showNotification('success', `${name} created`);
      } else {
        const resp = await api('PUT', `/api/poll-questionnaires/${selectedId}`, body);
        if (isBuiltIn) {
          // Backend creates a copy — try to select the new copy
          try {
            const newQ = await resp.json();
            if (newQ && newQ.id) {
              showNotification('success', `${name} saved as a new copy`);
              await loadList(newQ.id);
              const q = questionnaires.find(x => x.id === newQ.id);
              if (q) loadForm(q);
              return;
            }
          } catch {}
        }
        showNotification('success', `${name} updated`);
      }
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to save: ' + (e.message||e)); }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(t('questionnaire_delete_confirm')||'Are you sure you want to delete this questionnaire?')) return;
    const selectedId = listEl.value;
    try {
      await api('DELETE', `/api/poll-questionnaires/${selectedId}`);
      showNotification('success', 'Questionnaire deleted');
      await loadList();
      loadForm(null);
      listEl.value = '__new__';
    } catch(e) { showError('Failed to delete: ' + (e.message||e)); }
  });

  await loadList();
  loadForm(null);
}

function _closeParentModal() {
  const m = event?.target?.closest('.modal-overlay');
  if (m) m.remove();
}

/** CSP-safe: select all text in the input that triggered the event */
function selectSelf(el) { if (el && el.select) el.select(); }

/** CSP-safe: copy API key to clipboard */
function copyApiKey() {
  const val = document.getElementById('apiKeyResult')?.value || '';
  navigator.clipboard.writeText(val)
    .then(() => showNotification('success', 'Copied!'))
    .catch(() => { document.getElementById('apiKeyResult')?.select(); document.execCommand('copy'); showNotification('success', 'Copied!'); });
}

// ── Meeting Config ───────────────────────────────────────────────────────────
async function saveMeetingConfig(provider) {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  let cfg;
  if (provider === 'teams') {
    cfg = { teams_enabled: true, teams_tenant_id: val('teamsTenantId'), teams_client_id: val('teamsClientId'), teams_secret: val('teamsSecret') };
  } else {
    cfg = { zoom_enabled: true, zoom_account_id: val('zoomAccountId'), zoom_client_id: val('zoomClientId'), zoom_secret: val('zoomSecret') };
  }
  const res = await apiPut('/api/meeting-config', cfg);
  if (res.ok) showNotification('success', `${provider === 'teams' ? 'Teams' : 'Zoom'} config saved`);
  else showError('Failed to save config');
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
  if (typeof renderListView === 'function') renderListView();
  updateUILabels();
  // Broadcast time_format / time_separator changes to detached windows
  if (key === 'time_format' || key === 'time_separator') {
    updateClock();
    if (typeof _broadcastSync === 'function') {
      _broadcastSync({ type: 'time-format', time_format: state.preferences.time_format, time_separator: state.preferences.time_separator });
    }
  }
}

async function setPrefSelect() {
  const el = event?.target;
  if (!el) return;
  const key = el.dataset.prefKey;
  if (key) state.preferences[key] = el.value;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  renderTimeline();
}

async function setViewSpacing(value) {
  state.preferences.view_spacing = parseFloat(value) || 1;
  applyPreferences();
  await savePreferences();
  renderSidebar();
  renderTimeline();
}

async function setTooltipDelay(value) {
  state.preferences.tooltip_delay = parseInt(value, 10) || 0;
  document.documentElement.style.setProperty('--tooltip-delay', state.preferences.tooltip_delay + 'ms');
  await savePreferences();
  renderSidebar();
}

async function setPrefInput() {
  const el = event?.target;
  if (!el) return;
  const key = el.dataset.prefKey;
  if (key) state.preferences[key] = el.value;
  await savePreferences();
}

// Save welcome/help/training/demo URLs to exercise settings (global, visible to all users)
async function setExerciseURL() {
  const el = event?.target;
  if (!el) return;
  const key = el.dataset.urlKey;
  if (!key) return;
  state.exercise = state.exercise || {};
  state.exercise[key] = el.value;
  try {
    const res = await fetch('/api/exercise', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.exercise)
    });
    if (res.ok) state.exercise = await res.json();
  } catch (e) {
    // Fallback: save to user preferences
    state.preferences[key] = el.value;
    await savePreferences();
  }
}

// Set icon set (emoji or material)
async function setIconSet(_, el) {
  const iconSet = el?.dataset?.arg || 'emoji';
  state.exercise = state.exercise || {};
  state.exercise.icon_set = iconSet;
  try {
    const res = await fetch('/api/exercise', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.exercise)
    });
    if (res.ok) state.exercise = await res.json();
  } catch (e) { console.warn('setIconSet error', e); }
  applyPreferences();
  renderSidebar();
  showNotification('success', t('notif_saved'));
}

// Workspace preset actions
async function saveWorkspacePreset() {
  const name = prompt(t('preset_name') || 'Preset Name:');
  if (!name) return;
  const presets = state.preferences.workspace_presets || [];
  const preset = {
    id: presets.length ? Math.max(...presets.map(p => p.id || 0)) + 1 : 1,
    name,
    view: _listViewActive ? 'list' : 'grid',
    range: state.range,
    resolution: state.resolution,
    zoom_factor: state.zoomFactor || 1.0,
    hidden_layers: [...(state.preferences.hidden_layers || [])],
    sidebar_tab: state.sidebarTab || 'legend',
  };
  state.preferences.workspace_presets = [...presets, preset];
  await savePreferences();
  renderSidebar();
  showNotification('success', t('notif_saved'));
}

async function loadWorkspacePreset(idx) {
  const presets = state.preferences.workspace_presets || [];
  const preset = presets[parseInt(idx, 10)];
  if (!preset) return;
  if (preset.range) { state.range = preset.range; document.getElementById('rangeSelect').value = preset.range; }
  if (preset.resolution) { state.resolution = preset.resolution; document.getElementById('resolutionSelect').value = preset.resolution; }
  if (preset.zoom_factor) state.zoomFactor = preset.zoom_factor;
  if (preset.hidden_layers) state.preferences.hidden_layers = [...preset.hidden_layers];
  if (preset.sidebar_tab) state.sidebarTab = preset.sidebar_tab;
  if (preset.view === 'list' && !_listViewActive) toggleListView();
  else if (preset.view === 'grid' && _listViewActive) toggleListView();
  await savePreferences();
  renderSidebar();
  renderTimeline();
  showNotification('success', t('notif_saved'));
}

async function deleteWorkspacePreset(idx) {
  const presets = state.preferences.workspace_presets || [];
  presets.splice(parseInt(idx, 10), 1);
  state.preferences.workspace_presets = [...presets];
  await savePreferences();
  renderSidebar();
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
  if (typeof renderListView === 'function') renderListView();
  const pop = document.getElementById('layerPopover');
  if (pop && pop.style.display !== 'none') renderLayerPopover();
  savePreferences(); // fire-and-forget
}

function toggleAllLayers() {
  state.preferences.hidden_layers = []; // show all layers
  // Immediate visual update, save in background
  renderSidebar();
  renderTimeline();
  if (typeof renderListView === 'function') renderListView();
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
    if (tab.dataset.tab) tab.textContent = t('tab_'+tab.dataset.tab) || tab.dataset.tab;
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
  setElText('lbl-ev-title', t('ev_title') || 'Title');
  setElText('lbl-ev-type', t('ev_type') || 'Type');
  setElText('lbl-ev-color', t('ev_color') || 'Color');
  setElText('lbl-ev-start', t('ev_start') || 'Start');
  setElText('lbl-ev-end', t('ev_end') || 'End');
  setElText('lbl-ev-layer', t('ev_layer') || 'Layer');
  setElText('lbl-ev-status', t('ev_status') || 'Status');
  setElText('lbl-ev-desc', t('ev_description') || 'Description');
  setElText('lbl-ev-location', t('ev_location') || 'Physical Location');
  setElText('lbl-ev-contact-type', t('ev_contact_type') || 'Contact type');
  setElText('lbl-ev-virtual-type', t('ev_virtual_type') || 'Virtual meeting platform');
  setElText('lbl-ev-participant', t('ev_participant') || 'Participant');
  setElText('lbl-ev-allday', t('ev_allday') || 'Day-only (no specific time)');
  setElText('lbl-ev-recurring', t('ev_recurring') || 'Recurring');
  setElText('lbl-ev-pattern', t('ev_pattern') || 'Pattern');
  setElText('lbl-ev-recend', t('ev_rec_end') || 'Recurrence End');
  setElText('lbl-ev-attach', t('ev_attachment') || 'Attachment');
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
      readwrite:'role_teammember',teammember:'role_teammember',teamlead:'role_teamlead',oplead:'role_oplead',
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
      poll: t('report_poll') || 'Poll Report',
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
    if (translated && translated !== key) {
      // Preserve child elements (e.g. sort indicator spans in list-view table headers)
      const children = Array.from(el.children);
      el.textContent = translated;
      children.forEach(child => { el.appendChild(document.createTextNode(' ')); el.appendChild(child); });
    }
  });

  // Search placeholder
  const si = document.getElementById('searchInput');
  if (si) si.placeholder = t('search_placeholder') || 'Search…';

  // Language flag active state
  updateLangFlags();
}

function updateLangFlags() {
  const lang = (state.preferences && state.preferences.language) || 'en';
  ['EN', 'SV', 'FR', 'FI', 'DA', 'NB', 'ET', 'LV', 'LT', 'IT', 'ES', 'PT', 'PL', 'UK'].forEach(code => {
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
let _sseConnection = null;
let _sseReconnectAttempts = 0;
function connectSSE() {
  if (_sseConnection) {
    _sseConnection.close();
    _sseConnection = null;
  }
  const es = new EventSource('/api/notifications/stream');
  _sseConnection = es;
  es.addEventListener('alarm', e => {
    const data = JSON.parse(e.data);
    playAlarmSound(data.sound || 'klaxon');
    showAlarmNotification(data, 0);
  });
  // Listen for event changes from other users
  let _sseRefreshTimer = null;
  es.addEventListener('event_change', e => {
    const data = JSON.parse(e.data);
    if (data.action === 'deleted' || data.action === 'created' || data.action === 'updated' || data.action === 'status_changed') {
      // Debounce SSE-triggered refreshes: batch rapid events into one refresh
      if (_sseRefreshTimer) clearTimeout(_sseRefreshTimer);
      _sseRefreshTimer = setTimeout(() => { _sseRefreshTimer = null; refreshAll(); }, 300);
      // Record to event log
      _eventLogEntries.push({ timestamp: new Date().toISOString(), source: 'sse', message: `${data.action}: ${data.title||'event #'+data.id}`, summary: data.user_name ? `by ${data.user_name}` : '' });
      // Browser push notification for event changes by others
      if (Notification.permission === 'granted' && state.preferences.push_event_changes !== false && data.user_id !== (state.user && state.user.id)) {
        const actionLabel = { created: 'New event', updated: 'Event updated', deleted: 'Event deleted', status_changed: 'Event status changed' }[data.action] || data.action;
        const title = data.title ? `${actionLabel}: ${data.title}` : actionLabel;
        const body  = data.user_name ? `by ${data.user_name}` : '';
        try { new Notification('Tidslinjal', { body: body ? `${title}\n${body}` : title, icon: '/static/favicon.ico', tag: `event-${data.id}-${data.action}` }); } catch { /* ignore */ }
      }
    }
  });
  // Listen for collaborative editing lock events
  es.addEventListener('editing_lock', e => {
    try {
      const data = JSON.parse(e.data);
      if (window._handleEditingLockEvent) window._handleEditingLockEvent(data);
    } catch { /* ignore parse errors */ }
  });
  // Listen for user changes (role updates, vetting, block/unblock)
  es.addEventListener('user_change', async e => {
    try {
      const data = JSON.parse(e.data);
      // Refresh current user info if it was the affected user
      if (state.user && data.user_id === state.user.id) {
        try {
          const me = await apiGet('/api/auth/me');
          if (me) {
            state.user = me;
            if (typeof applyRoleGatedUI === 'function') applyRoleGatedUI();
          }
        } catch { /* ignore — may have been blocked */ }
      }
      // Refresh user list for everyone
      try {
        const users = await apiGet('/api/users');
        if (users) state.users = users;
      } catch { /* ignore */ }
      renderSidebar();
    } catch { /* ignore parse errors */ }
  });
  // Day labels change
  es.addEventListener('day_labels_change', async () => {
    await fetchDayLabels();
    renderTimeline();
  });
  // Personal notification
  es.addEventListener('personal_notification', e => {
    try {
      const data = JSON.parse(e.data);
      // Play bell sound
      _playNotifBellSound();
      // Browser notification
      if (Notification.permission === 'granted') {
        try { new Notification('Tidslinjal', { body: `${data.title}\n${data.body}`, icon: '/static/favicon.ico', tag: `notif-${data.id}` }); } catch {}
      }
      // Toast — for polls, make it clickable to open the poll modal
      if (data.type === 'poll') {
        showNotification('info', `📊 ${data.title}: ${data.body}`, 8000);
        // Auto-open poll modal so the user can respond immediately
        setTimeout(() => { if (typeof openPollModal === 'function') openPollModal({hideCreate: true}); }, 500);
      } else {
        showNotification('info', `${data.title}: ${data.body}`);
      }
      // Update badge
      _notifUnreadCount++;
      _updateNotifBadge();
      // If panel is open, re-render
      if (_notifPanelOpen) _renderNotifPanel();
    } catch {}
  });
  // Person Ready Check popup — show modal for participants
  es.addEventListener('prc_new_check', e => {
    try {
      const data = JSON.parse(e.data);
      if (!state.user) return;
      const me = (data.participants || []).find(p => p.user_id === state.user.id);
      if (!me || me.status !== 'pending') return;
      _showPRCPopup(data);
    } catch {}
  });
  es.addEventListener('prc_update', e => {
    try {
      const data = JSON.parse(e.data);
      // If there's an open PRC popup for this check, refresh it
      const popup = document.getElementById('prcPopup_' + data.id);
      if (popup) {
        const me = (data.participants || []).find(p => p.user_id === state.user.id);
        if (me && me.status !== 'pending') {
          popup.remove(); // Already responded
        }
      }
      // If the person ready check modal is open, live-update it
      const prcModal = document.getElementById('personReadyCheckBody');
      if (prcModal) {
        const container = prcModal.querySelector('#prcActiveChecks');
        if (container) {
          // Re-load and re-render the active checks
          _loadPersonReadyChecks(prcModal.closest('.modal-overlay'));
        }
      }
    } catch {}
  });
  // Poll response/update — live-refresh the poll modal if it's open
  es.addEventListener('poll_update', e => {
    try {
      const pollModal = document.querySelector('.poll-respond-form, .poll-close-btn, #pollActiveList');
      if (pollModal) {
        const modal = pollModal.closest('.modal-overlay');
        if (modal) _loadPolls(modal);
      }
    } catch {}
  });
  es.addEventListener('poll_closed', e => {
    try {
      const pollModal = document.querySelector('.poll-respond-form, .poll-close-btn, #pollActiveList');
      if (pollModal) {
        const modal = pollModal.closest('.modal-overlay');
        if (modal) _loadPolls(modal);
      }
    } catch {}
  });
  es.addEventListener('poll_new', e => {
    try {
      const pollModal = document.querySelector('#pollActiveList');
      if (pollModal) {
        const modal = pollModal.closest('.modal-overlay');
        if (modal) _loadPolls(modal);
      }
    } catch {}
  });
  // Decision assignment notification
  es.addEventListener('decision_assigned', e => {
    try {
      const data = JSON.parse(e.data);
      if (data.executor_id === state.user?.id) {
        showNotification('info', `${t('decision_executor')||'Decision assigned'}: ${data.title || data.sequence_number} (${t('lb_action')||'by'} ${data.assigned_by})`);
        if (Notification.permission === 'granted') {
          try { new Notification('Tidslinjal', { body: `${data.title || data.sequence_number}\n${t('decision_executor')||'Assigned by'}: ${data.assigned_by}`, icon: '/static/favicon.ico' }); } catch {}
        }
      }
    } catch {}
  });
  es.onopen = () => { _sseReconnectAttempts = 0; };
  es.onerror = () => {
    if (_sseConnection === es) {
      _sseConnection = null;
      es.close();
    }
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, max 30s
    const baseDelay = Math.min(1000 * Math.pow(2, _sseReconnectAttempts), 30000);
    const jitter = Math.random() * 1000;
    _sseReconnectAttempts++;
    setTimeout(connectSSE, baseDelay + jitter);
  };
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
  // Check if event has a meeting URL
  const meetingURL = data.meeting_url || data.contact_url || '';
  const hasMeeting = meetingURL && (meetingURL.startsWith('http://') || meetingURL.startsWith('https://') || meetingURL.startsWith('sip:') || meetingURL.startsWith('tel:'));
  el.innerHTML = `
    <div class="notification-title">${t('notif_alarm_title')}${escHtml(warnings)}</div>
    <div class="notification-msg">${escHtml(data.message)}</div>
    <div class="alarm-since" style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">⏱ 0s ago</div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm notification-close-btn alarm-dismiss-btn">${t('alarm_dismiss')||'Dismiss'}</button>
      <button class="btn btn-secondary btn-sm alarm-show-event-btn">📋 Show event</button>
      ${hasMeeting ? `<a href="${escHtml(meetingURL)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none">${t('alarm_enter_meeting')}</a>` : ''}
      <button class="btn btn-primary btn-sm alarm-ack-btn">✓ ${t('alarm_ack')}</button>
    </div>
  `;
  el.querySelector('.alarm-dismiss-btn').addEventListener('click', () => dismissAlarmNotif(data.alarm_id));
  el.querySelector('.alarm-show-event-btn').addEventListener('click', () => openAlarmEvent(data.event_id));
  el.querySelector('.alarm-ack-btn').addEventListener('click', () => ackAlarm(data.alarm_id, el));
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
  if (level === 0 && Notification.permission === 'granted' && state.preferences.push_alarms !== false) {
    try { new Notification('Tidslinjal — ' + t('notif_alarm_title'), { body: data.message, icon: '/static/favicon.ico', tag: 'alarm-' + data.alarm_id }); } catch { /* ignore */ }
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
  try {
    const res = await apiPost(`/api/alarms/${alarmID}/ack`, {});
    if (res.ok) {
      dismissAlarmNotif(alarmID);
      if (notifEl && notifEl.parentNode) notifEl.remove();
      await fetchAlarms();
      renderSidebar();
      showNotification('success', t('alarm_acked')||'Alarm acknowledged');
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to acknowledge alarm');
    }
  } catch (e) {
    showError(e.message || 'Failed to acknowledge alarm');
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
  // Bind new export buttons
  document.getElementById('btnExportKML')?.addEventListener('click', () => { window.location.href = '/api/export?format=kml'; closeModal('exportModal'); });
  document.getElementById('btnExportXML')?.addEventListener('click', () => { window.location.href = '/api/export?format=xml'; closeModal('exportModal'); });
  document.getElementById('btnExportLog')?.addEventListener('click', () => {
    const logType = document.getElementById('exportLogType')?.value || 'decision_log';
    const format = document.getElementById('exportLogFormat')?.value || 'json';
    window.location.href = `/api/export/logs?type=${logType}&format=${format}`;
  });
  document.getElementById('btnExportSettings')?.addEventListener('click', () => {
    window.location.href = '/api/export/settings';
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
        <button class="btn btn-primary btn-sm" data-action="openApplyTemplateDialog" data-arg="${tmpl.id}">▶ Apply</button>
        ${(state.user && (state.user.id === tmpl.created_by || hasRole2(state.user.role, 'admin')))
          ? `<button class="btn btn-danger btn-sm" data-action="deleteTemplate" data-arg="${tmpl.id}">Delete</button>`
          : ''}
      </div>
    </div>
  `).join('');
  _bindActions(listEl);
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
  // Build day labels relative to earliest event time
  const dayLabels = (state.dayLabels || [])
    .filter(dl => {
      if (!rangeFrom || !rangeTo) return true;
      const d = new Date(dl.date + 'T00:00:00');
      return d >= rangeFrom && d < rangeTo;
    })
    .map(dl => ({
      day_offset_min: Math.round((new Date(dl.date + 'T00:00:00').getTime() - earliest) / 60000),
      label:          dl.label,
      color:          dl.color || '',
      background:     dl.background || '',
      font_size:      dl.font_size || '',
      font_weight:    dl.font_weight || '',
    }));
  // Capture current theme/terminology settings
  const ex = state.exercise || {};
  const payload = {
    name,
    description: document.getElementById('tmplDescription').value.trim(),
    scope,
    items,
    phases:     phases.length    ? phases    : undefined,
    locks:      locks.length     ? locks     : undefined,
    day_labels: dayLabels.length ? dayLabels : undefined,
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
    const hasLayers = tmpl && tmpl.layers && tmpl.layers.length > 0;
    dbg('[template] openApplyTemplateDialog id=%o name=%o items=%o hasLayers=%o', id, name, itemCount, hasLayers);
    const layerInfo = hasLayers ? ` (${tmpl.layers.length} layer${tmpl.layers.length!==1?'s':''}: ${tmpl.layers.map(l=>l.name).join(', ')})` : '';
    document.getElementById('applyTemplateInfo').textContent =
      `Apply template "${name}" — ${itemCount} event${itemCount!==1?'s':''}${layerInfo}`;
    document.getElementById('applyTemplateBase').value = fmtDateInput(new Date());
    // Multi-layer toggle
    const multiChk = document.getElementById('applyTemplateMultiLayer');
    const modeGroup = document.getElementById('applyTemplateLayerModeGroup');
    const singleGroup = document.getElementById('applyTemplateSingleLayerGroup');
    if (hasLayers) {
      modeGroup.style.display = '';
      multiChk.checked = true;
      singleGroup.style.display = 'none';
    } else {
      modeGroup.style.display = 'none';
      multiChk.checked = false;
      singleGroup.style.display = '';
    }
    multiChk.onchange = () => {
      singleGroup.style.display = multiChk.checked ? 'none' : '';
    };
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
  const multiLayer = document.getElementById('applyTemplateMultiLayer')?.checked || false;
  const layerVal = document.getElementById('applyTemplateLayer').value;
  const payload  = {
    base_time: new Date(baseVal).toISOString(),
    layer_id:  !multiLayer && layerVal ? parseInt(layerVal, 10) : null,
    use_template_layers: multiLayer,
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
    if (tmpl) {
      state.lastAppliedTemplate = tmpl.name;
      state.exercise = state.exercise || {};
      state.exercise.last_template = tmpl.name;
    }
    // Update exercise settings from template application
    if (r.exercise_name) {
      state.exercise = state.exercise || {};
      state.exercise.label = r.exercise_name;
    }
    if (r.startex) {
      state.exercise = state.exercise || {};
      state.exercise.epoch = r.startex;
    }
    if (r.endex) {
      state.exercise = state.exercise || {};
      state.exercise.endex = r.endex;
    }
    if (r.synthetic_enabled) {
      state.exercise = state.exercise || {};
      state.exercise.enabled = true;
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
    // Auto-expand day hours if template events fall outside current day hours
    const dayStart = state.preferences.day_start_hour || 0;
    const dayEnd   = state.preferences.day_end_hour || 24;
    let needsExpand = false;
    let minH = dayStart, maxH = dayEnd;
    (state.events || []).forEach(ev => {
      const st = new Date(ev.start_time);
      const en = ev.end_time ? new Date(ev.end_time) : null;
      if (st.getHours() < minH) { minH = st.getHours(); needsExpand = true; }
      if (en && (en.getHours() > maxH || (en.getHours() === 0 && en.getMinutes() === 0))) { maxH = Math.min(24, en.getHours() || 24); needsExpand = true; }
    });
    if (needsExpand && (minH < dayStart || maxH > dayEnd)) {
      state.preferences.day_start_hour = minH;
      state.preferences.day_end_hour = Math.max(maxH, dayEnd);
      if (!state.preferences.show_out_of_hours) {
        state.preferences.show_out_of_hours = true;
      }
      applyPreferences();
      await savePreferences();
      showNotification('info', t('template_hours_expanded') || 'Day hours expanded to show all template activities');
    }
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
  a.download = `tidslinjal-template-${new Date().toISOString().slice(0,19).replace(/:/g,'')}.json`;
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
      layers:         tmpl.layers         || undefined,
      groups:         tmpl.groups         || undefined,
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
function openReportModal() {
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
    layerList.querySelectorAll('.report-layer-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('.group-chip').classList.toggle('selected', cb.checked);
      });
    });
  }
  openModal('reportModal');
}


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

  } else if (type === 'decisions') {
    // Decisions report: all decision log entries
    try {
      const dlEntries = await apiGet('/api/decision-log') || [];
      const decided = dlEntries.filter(e => !e.status || e.status === 'approved');
      const requested = dlEntries.filter(e => e.status === 'requested');
      const rejected = dlEntries.filter(e => e.status === 'rejected');
      html += `<h2>${t('report_decisions_decided')||'Decisions Made'} (${decided.length})</h2>
      <table><thead><tr><th>#</th><th>${t('report_decisions_seq')||'Seq'}</th><th>${t('report_decisions_decision')||'Decision'}</th><th>${t('report_decisions_by')||'By'}</th><th>${t('report_decisions_time')||'Time'}</th><th>${t('report_decisions_approved_at')||'Decided At'}</th></tr></thead><tbody>
      ${decided.map((e,i) => `<tr>
        <td>${i+1}</td>
        <td>${escHtml(e.sequence_number||'')}</td>
        <td>${escHtml(e.decision)}</td>
        <td>${escHtml(e.display_name || e.user_name)}</td>
        <td>${fmtDateTime(new Date(e.timestamp))}</td>
        <td>${e.decided_at ? fmtDateTime(new Date(e.decided_at)) : e.reviewed_at ? fmtDateTime(new Date(e.reviewed_at)) : '—'}</td>
      </tr>`).join('')}
      </tbody></table>`;
      if (requested.length) {
        html += `<h2>${t('report_decisions_pending')||'Pending Decisions'} (${requested.length})</h2>
        <table><thead><tr><th>#</th><th>${t('report_decisions_seq')||'Seq'}</th><th>${t('report_decisions_request')||'Request'}</th><th>${t('report_decisions_by')||'By'}</th><th>${t('report_decisions_requested_at')||'Requested At'}</th><th>${t('report_decisions_target')||'Requested Of'}</th></tr></thead><tbody>
        ${requested.map((e,i) => `<tr>
          <td>${i+1}</td>
          <td>${escHtml(e.sequence_number||'')}</td>
          <td>${escHtml(e.decision)}</td>
          <td>${escHtml(e.display_name || e.user_name)}</td>
          <td>${e.requested_at ? fmtDateTime(new Date(e.requested_at)) : fmtDateTime(new Date(e.timestamp))}</td>
          <td>${escHtml(e.requested_of_label||'')}</td>
        </tr>`).join('')}
        </tbody></table>`;
      }
      if (rejected.length) {
        html += `<h2>${t('report_decisions_rejected')||'Rejected Decisions'} (${rejected.length})</h2>
        <table><thead><tr><th>#</th><th>${t('report_decisions_decision')||'Decision'}</th><th>${t('report_decisions_by')||'By'}</th><th>${t('report_decisions_reviewed_by')||'Reviewed By'}</th><th>${t('report_decisions_comment')||'Comment'}</th></tr></thead><tbody>
        ${rejected.map((e,i) => `<tr>
          <td>${i+1}</td>
          <td>${escHtml(e.decision)}</td>
          <td>${escHtml(e.display_name || e.user_name)}</td>
          <td>${escHtml(e.reviewed_by_name||'')}</td>
          <td>${escHtml(e.review_comment||'')}</td>
        </tr>`).join('')}
        </tbody></table>`;
      }
    } catch(err) {
      html += '<p>Failed to load decision log data.</p>';
    }

  } else if (type === 'poll') {
    // Poll report
    try {
      const res = await api('GET', '/api/polls/log');
      const polls = res.ok ? await res.json() : [];
      if (!polls || polls.length === 0) {
        html += `<p>${t('poll_no_polls')||'No polls found.'}</p>`;
      } else {
        polls.forEach(poll => {
          const ts = new Date(poll.created_at).toLocaleString();
          const totalR = (poll.responses || []).length;
          const totalT = (poll.target_ids || []).length || '?';
          html += `<h2>📊 ${escHtml(poll.title)} <small style="font-size:11px;color:#888">(${poll.status} — ${ts})</small></h2>`;
          html += `<p>Responses: ${totalR}/${totalT}</p>`;
          if ((poll.questions || []).length && (poll.responses || []).length) {
            html += '<table><thead><tr><th>Question</th><th>Type</th><th>Summary</th></tr></thead><tbody>';
            (poll.questions || []).forEach((q, qi) => {
              const answers = (poll.responses || []).filter(r => r.question_id === q.id).map(r => r.answer).filter(Boolean);
              let summary = '';
              if (q.type === 'scale' || q.type === 'scale_0_3') {
                const counts = [0,0,0,0];
                answers.forEach(a => { const v = parseInt(a); if (v >= 0 && v <= 3) counts[v]++; });
                summary = counts.map((c,i) => `${i}: ${c}`).join(', ');
              } else if (q.type === 'yes_no') {
                const yes = answers.filter(a => a === 'yes').length;
                const no = answers.filter(a => a === 'no').length;
                summary = `Yes: ${yes}, No: ${no}`;
              } else {
                summary = answers.map(a => escHtml(a)).join('; ');
              }
              html += `<tr><td>${escHtml(q.text)}</td><td>${q.type}</td><td>${summary}</td></tr>`;
            });
            html += '</tbody></table>';
          }
        });
      }
    } catch(err) {
      html += '<p>Failed to load poll data.</p>';
    }

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
  const dateStr = new Date().toISOString().slice(0,10);

  if (format === 'print') {
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 500);
    }
  } else if (format === 'docx') {
    const content = _reportToWordXML(html);
    _downloadBlob(content, 'application/msword', `report-${type}-${dateStr}.doc`);
  } else if (format === 'rtf') {
    const content = _reportToRTF(html);
    _downloadBlob(content, 'application/rtf', `report-${type}-${dateStr}.rtf`);
  } else if (format === 'excel') {
    const content = _reportToSpreadsheetML(html);
    _downloadBlob(content, 'application/vnd.ms-excel', `report-${type}-${dateStr}.xls`);
  } else {
    // HTML download
    _downloadBlob(html, 'text/html;charset=utf-8', `report-${type}-${dateStr}.html`);
  }
  closeModal('reportModal');
  showNotification('success', t('report_ready')||'Report downloaded');
}

// ── Report format helpers ────────────────────────────────────────────────────

function _downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], {type: mimeType});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function _parseReportHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.querySelector('h1')?.textContent?.trim() || 'Report';
  const sections = [];
  let cur = null;
  doc.body.childNodes.forEach(node => {
    if (!node.tagName) return;
    if (node.tagName === 'H1') return;
    if (node.tagName === 'H2') {
      cur = { heading: node.textContent.trim(), headers: [], rows: [] };
      sections.push(cur);
    } else if (node.tagName === 'TABLE' && cur) {
      cur.headers = [...node.querySelectorAll('thead th')].map(th => th.textContent.trim());
      cur.rows    = [...node.querySelectorAll('tbody tr')].map(tr =>
        [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      );
    }
  });
  return { title, sections };
}

function _reportToWordXML(html) {
  const { title, sections } = _parseReportHTML(html);
  const x = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><?mso-application progid="Word.Document"?>` +
    `<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">` +
    `<w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${x(title)}</w:t></w:r></w:p>`;
  sections.forEach(s => {
    out += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${x(s.heading)}</w:t></w:r></w:p>`;
    if (s.headers.length) {
      out += `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>`;
      out += `<w:tr>${s.headers.map(h=>`<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${x(h)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
      s.rows.forEach(row => {
        out += `<w:tr>${row.map(c=>`<w:tc><w:p><w:r><w:t>${x(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
      });
      out += `</w:tbl>`;
    }
  });
  return out + `</w:body></w:wordDocument>`;
}

function _reportToRTF(html) {
  const { title, sections } = _parseReportHTML(html);
  const x = s => s.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}')
    .replace(/[^\x00-\x7F]/g, c => `\\'${c.charCodeAt(0).toString(16).padStart(2,'0')}`);
  let out = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}\\widowctrl\n`;
  out += `{\\b\\fs28 ${x(title)}}\\par\\par\n`;
  sections.forEach(s => {
    out += `{\\b\\fs22 ${x(s.heading)}}\\par\n`;
    if (s.headers.length) {
      const cw = Math.floor(9000 / s.headers.length);
      const rowRTF = (cells, bold) => {
        let r = `{\\trowd\\trgaph120`;
        cells.forEach((_,i) => { r += `\\cellx${cw*(i+1)}`; });
        cells.forEach(c => { r += `\\intbl${bold?'{\\b ':'{ '}${x(c)}}\\cell`; });
        return r + `\\row}\n`;
      };
      out += rowRTF(s.headers, true);
      s.rows.forEach(row => { out += rowRTF(row, false); });
    }
    out += `\\par\n`;
  });
  return out + `}`;
}

function _reportToSpreadsheetML(html) {
  const { title, sections } = _parseReportHTML(html);
  const x = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cell = v => `<Cell><Data ss:Type="String">${x(v)}</Data></Cell>`;
  let rows = `<Row>${cell(title)}</Row><Row/>`;
  sections.forEach(s => {
    rows += `<Row>${cell(s.heading)}</Row>`;
    if (s.headers.length) {
      rows += `<Row>${s.headers.map(cell).join('')}</Row>`;
      s.rows.forEach(r => { rows += `<Row>${r.map(cell).join('')}</Row>`; });
    }
    rows += `<Row/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="Report"><Table>${rows}</Table></Worksheet></Workbook>`;
}

// ── Auto Report ─────────────────────────────────────────────────────────────
// Auto-report schedules — stored server-side; localStorage is used as fallback for client-only delivery

function openAutoReportModal() {
  _renderAutoReportList();
  openModal('autoReportModal');
}

async function _renderAutoReportList() {
  const el = document.getElementById('autoReportList');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">Loading…</p>';
  let list = [];
  try { list = await apiGet('/api/auto-report-schedules'); } catch { list = []; }
  if (!list || !list.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm)">No schedules configured yet.</p>';
    return;
  }
  const fmtLabel = {html:'HTML', excel:'Excel', rtf:'RTF', docx:'DOCX'};
  el.innerHTML = list.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:6px">
      <div>
        <strong>${escHtml(r.report_type)}</strong> — ${escHtml(r.frequency)}
        <span style="color:var(--accent);margin-left:6px">${escHtml(r.delivery)}</span>
        <span style="color:var(--text-dim);margin-left:6px;font-size:var(--fs-xs)">[${fmtLabel[r.format||'html']||escHtml(r.format||'html')}]</span>
        ${r.recipient ? `<span style="color:var(--text-dim);margin-left:8px">→ ${escHtml(r.recipient)}</span>` : ''}
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">Next: ${r.next_run ? new Date(r.next_run).toLocaleString() : 'soon'}</div>
      </div>
      <button class="btn btn-danger btn-sm" data-action="deleteAutoReport" data-arg="${r.id}">Remove</button>
    </div>
  `).join('');
  _bindActions(el);
}

async function addAutoReport() {
  const report_type = document.getElementById('arType')?.value || 'timeline';
  const frequency   = document.getElementById('arFrequency')?.value || 'daily';
  const format      = document.getElementById('arFormat')?.value || 'html';
  const delivery    = document.getElementById('arDelivery')?.value || 'download';
  const recipient   = document.getElementById('arRecipient')?.value?.trim() || '';

  if (delivery === 'email' && !recipient) {
    showError('Please enter a recipient email address for email delivery.', 'Validation');
    return;
  }
  if (delivery === 'webhook' && !recipient) {
    showError('Please enter a webhook URL for webhook delivery.', 'Validation');
    return;
  }

  const res = await apiPost('/api/auto-report-schedules', { report_type, frequency, format, delivery, recipient });
  if (res && res.ok !== false) {
    showNotification('success', 'Auto-report schedule added');
    const rec = document.getElementById('arRecipient');
    if (rec) rec.value = '';
    _renderAutoReportList();
  } else {
    showError('Failed to create schedule.', 'Auto-Report');
  }
}

async function deleteAutoReport(id) {
  const res = await api('DELETE', `/api/auto-report-schedules/${id}`, null);
  if (res && res.ok) {
    showNotification('success', 'Schedule removed');
    _renderAutoReportList();
  }
}

// checkAutoReports — server-side schedules are handled by the Go scheduler.
// This client-side check handles legacy localStorage download-only schedules.
function checkAutoReports() {
  // No-op: server-side scheduling handles email/webhook delivery.
  // Download-only schedules created before server-side support remain in localStorage.
  try {
    const list = JSON.parse(localStorage.getItem('autoReports') || '[]');
    const now  = Date.now();
    let changed = false;
    list.forEach((r, i) => {
      if (r.nextRun && r.nextRun <= now) {
        if (r.delivery === 'download') _runAutoReport(r);
        const msBack = r.frequency === 'hourly' ? 3600000 : r.frequency === 'weekly' ? 7*86400000 : 86400000;
        list[i].nextRun = now + msBack;
        changed = true;
      }
    });
    if (changed) localStorage.setItem('autoReports', JSON.stringify(list));
  } catch { /* ignore */ }
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

  const rtype = r.report_type || r.type || 'timeline';
  const title = `Auto ${rtype.toUpperCase()} Report — ${from.toLocaleDateString()} to ${to.toLocaleDateString()}`;
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
    a.download = `auto-report-${rtype}-${new Date().toISOString().slice(0,10)}.html`;
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

  // Highlight active section on scroll (throttled via rAF)
  let _helpScrollRaf = false;
  content.addEventListener('scroll', () => {
    if (_helpScrollRaf) return;
    _helpScrollRaf = true;
    requestAnimationFrame(() => {
      _helpScrollRaf = false;
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

// ── Startup Text ──────────────────────────────────────────────────────────
async function saveStartupText() {
  const input = document.getElementById('startupTextInput');
  if (!input) return;
  const text = input.value.trim();
  const res = await api('PUT', '/api/startup-text', { text });
  if (res.ok) {
    showNotification('success', t('notif_saved')||'Saved');
  } else {
    showError('Failed to save startup text');
  }
}

async function clearStartupText() {
  const input = document.getElementById('startupTextInput');
  if (input) input.value = '';
  const res = await api('PUT', '/api/startup-text', { text: '' });
  if (res.ok) {
    showNotification('success', t('notif_saved')||'Saved');
  } else {
    showError('Failed to clear startup text');
  }
}

// Load startup text into settings textarea when settings tab is shown
async function _loadStartupTextInput() {
  const input = document.getElementById('startupTextInput');
  if (!input) return;
  try {
    const data = await apiGet('/api/startup-text');
    if (data && data.text) input.value = data.text;
  } catch { /* ignore */ }
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

// ── Exercise Index label helper ─────────────────────────────────────────────
function getExIndexLabel(ex) {
  const mode = ex && ex.operation_mode;
  if (mode === 'incident') return t('exercise_index_incident') || 'Incident index';
  if (mode === 'operation') return t('exercise_index_operation') || 'Operation index';
  return t('exercise_index') || 'Exercise index';
}

function getExIndexDescription() {
  return t('exercise_index_info') || 'A sequential number identifying this exercise/operation/incident instance. Used for tracking and reference in official documentation.';
}

function showExIndexInfo() {
  showNotificationHTML(`<div style="max-width:380px"><h3 style="margin:0 0 8px;font-size:14px;color:var(--accent)">${getExIndexLabel(state.exercise||{})}</h3><p style="font-size:var(--fs-sm);color:var(--text-dim);line-height:1.5">${getExIndexDescription()}</p></div>`);
}

// ── Exercise Info Popup ─────────────────────────────────────────────────────
function showExerciseInfoPopup() {
  const ex = state.exercise || {};
  const mode = ex.operation_mode || 'exercise';
  const modeLabel = mode === 'incident' ? (t('mode_incident')||'Incident') : mode === 'operation' ? (t('mode_operation')||'Operation') : (t('mode_exercise')||'Exercise');
  const epoch = ex.epoch ? new Date(ex.epoch) : null;
  const endex = ex.endex ? new Date(ex.endex) : null;
  const fmtDate = d => d ? d.toLocaleString() : '—';
  const duration = (epoch && endex) ? _fmtDuration(endex - epoch) : '—';

  // Compute progressed (synthetic) time
  let progressedTimeStr = '—';
  let elapsedSinceEpoch = '—';
  if (ex.enabled && typeof getNow === 'function') {
    const synNow = getNow();
    progressedTimeStr = fmtDate(synNow);
    if (epoch) {
      const elapsed = synNow.getTime() - epoch.getTime();
      elapsedSinceEpoch = _fmtDuration(Math.abs(elapsed));
      if (elapsed < 0) elapsedSinceEpoch = '-' + elapsedSinceEpoch;
    }
  }

  const html = `
    <div style="max-width:420px">
      <h3 style="margin:0 0 12px;font-size:16px;color:var(--accent)">${escHtml(ex.label || modeLabel)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
        <tr><td style="padding:4px 8px;color:var(--text-dim);white-space:nowrap">${t('settings_operation_mode')||'Mode'}</td><td style="padding:4px 8px;font-weight:600">${escHtml(modeLabel)}</td></tr>
        <tr><td style="padding:4px 8px;color:var(--text-dim)">${getStartexLabel(ex)}</td><td style="padding:4px 8px">${fmtDate(epoch)}</td></tr>
        <tr><td style="padding:4px 8px;color:var(--text-dim)">${getEndexLabel(ex)}</td><td style="padding:4px 8px">${fmtDate(endex)}</td></tr>
        <tr><td style="padding:4px 8px;color:var(--text-dim)">${t('duration')||'Duration'}</td><td style="padding:4px 8px">${duration}</td></tr>
        ${ex.ex_index ? `<tr><td style="padding:4px 8px;color:var(--text-dim)">${getExIndexLabel(ex)}</td><td style="padding:4px 8px">#${ex.ex_index}</td></tr>` : ''}
        <tr><td style="padding:4px 8px;color:var(--text-dim)">${t('settings_exercise_enable')||'Synthetic time'}</td><td style="padding:4px 8px">${ex.enabled ? '✅ ' + (t('enabled')||'Enabled') : '❌ ' + (t('disabled')||'Disabled')}</td></tr>
        ${ex.enabled ? `<tr style="background:var(--bg3)"><td style="padding:6px 8px;color:var(--accent);font-weight:600">${t('progressed_time')||'Progressed Time'}</td><td style="padding:6px 8px;font-weight:700;color:var(--accent);font-size:var(--fs-lg)">${progressedTimeStr}</td></tr>
        <tr style="background:var(--bg3)"><td style="padding:4px 8px;color:var(--text-dim)">${t('elapsed_since')||'Elapsed since'} ${getStartexLabel(ex)}</td><td style="padding:4px 8px;font-weight:600">${elapsedSinceEpoch}</td></tr>` : ''}
        ${ex.day_hours_only ? `<tr><td style="padding:4px 8px;color:var(--text-dim)">${t('synth_day_hours_only')||'Day hours only'}</td><td style="padding:4px 8px">✅</td></tr>` : ''}
        ${ex.include_weekends===false ? `<tr><td style="padding:4px 8px;color:var(--text-dim)">${t('settings_include_weekends')||'Weekends'}</td><td style="padding:4px 8px">❌ ${t('excluded')||'Excluded'}</td></tr>` : ''}
        ${ex.paused ? `<tr><td style="padding:4px 8px;color:var(--text-dim)">${t('freeze_label')||'Frozen'}</td><td style="padding:4px 8px">⏸ ${ex.paused_at ? fmtDate(new Date(ex.paused_at)) : 'Yes'}</td></tr>` : ''}
        ${ex.artificial_time_enabled ? `<tr><td style="padding:4px 8px;color:var(--text-dim)">${t('artificial_time')||'Artificial time'}</td><td style="padding:4px 8px">🕐 ${ex.artificial_time ? fmtDate(new Date(ex.artificial_time)) : '—'}</td></tr>` : ''}
      </table>
    </div>`;
  showNotificationHTML(html);
}

function _fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  const rem = h % 24;
  if (d > 0) return d + 'd ' + rem + 'h';
  return h + 'h';
}

function showNotificationHTML(html) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20000;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,.3);max-width:90vw;max-height:80vh;overflow:auto';
  el.innerHTML = html + '<div style="text-align:right;margin-top:12px"><button class="btn btn-secondary btn-sm" style="min-width:60px">OK</button></div>';
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:19999;background:rgba(0,0,0,.4)';
  const close = () => { el.remove(); backdrop.remove(); };
  backdrop.onclick = close;
  el.querySelector('button').onclick = close;
  document.body.appendChild(backdrop);
  document.body.appendChild(el);
}

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

// ── Analysis Modal ──────────────────────────────────────────────────────────
let _analysisPopout = null;
let _analysisCache = {};
let _analysisActiveTab = 'overview';

async function openAnalysisModal() {
  const html = `
    <div class="modal-overlay" id="analysisModal">
      <div class="modal" style="max-width:1280px;width:96vw;max-height:94vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>${t('analysis_title')||'Analysis'}</h2>
          <div style="display:flex;gap:6px;margin-left:auto;margin-right:8px">
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="detachAnalysis" title="${t('detach_window')||'Detach'}">&#x29C9;</button>
            <select id="analysisExportFmt" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:2px 4px;font-size:11px">
              <option value="csv">CSV</option><option value="json">JSON</option>
            </select>
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="exportAnalysis" title="${t('btn_export')||'Export'}">&#x2B07; ${t('btn_export')||'Export'}</button>
          </div>
          <button class="modal-close" data-action="closeAnalysisModal">&#x2715;</button>
        </div>
        <div style="padding:8px 12px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--border)">
          <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
            ${t('analysis_name')||'Name'}: <input type="text" id="analysisName" value="${escHtml((state.exercise && state.exercise.label) || '')}" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs);width:140px" placeholder="${t('analysis_name_placeholder')||'Analysis name'}">
          </label>
          <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
            ${t('from')||'From'}: <input type="date" id="analysisFrom" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          </label>
          <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
            ${t('to')||'To'}: <input type="date" id="analysisTo" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          </label>
          <button class="btn btn-sm btn-primary" data-action="refreshAnalysis" style="font-size:11px;padding:2px 8px">${t('btn_refresh')||'Refresh'}</button>
          <div style="flex:1"></div>
          <div id="analysisTabBar" style="display:flex;gap:0">
            <button class="btn btn-sm analysisTab active" data-tab="overview" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_overview')||'Overview'}</button>
            <button class="btn btn-sm analysisTab" data-tab="activity" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_activity')||'Activity'}</button>
            <button class="btn btn-sm analysisTab" data-tab="optempo" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_optempo')||'OpTempo'}</button>
            <button class="btn btn-sm analysisTab" data-tab="decisions" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_decisions')||'Decisions'}</button>
            <button class="btn btn-sm analysisTab" data-tab="dependencies" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_dependencies')||'Dependencies'}</button>
            ${state.user && hasRole2(state.user.role, 'oplead') ? `<button class="btn btn-sm analysisTab" data-tab="leadership" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_leadership')||'Leadership'}</button>` : ''}
            <button class="btn btn-sm analysisTab" data-tab="jstaff" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_jstaff')||'J-Staff'}</button>
            <button class="btn btn-sm analysisTab" data-tab="teamleads" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_teamleads')||'TeamLeads'}</button>
            <button class="btn btn-sm analysisTab" data-tab="opsleads" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_opsleads')||'OpsLeads'}</button>
            <button class="btn btn-sm analysisTab" data-tab="teammembers" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_teammembers')||'Team Members'}</button>
            <button class="btn btn-sm analysisTab" data-tab="export" style="border-radius:var(--radius) var(--radius) 0 0;font-size:11px;padding:4px 10px">${t('analysis_tab_export')||'Export'}</button>
          </div>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px" id="analysisContent">
          <div style="text-align:center;padding:40px;color:var(--text-dim)">${t('loading')||'Loading...'}</div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('analysisModal');
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);

  // Tab switching
  modal.querySelectorAll('.analysisTab').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.analysisTab').forEach(b => { b.classList.remove('active'); b.style.background = ''; b.style.color = ''; });
      btn.classList.add('active');
      btn.style.background = 'var(--accent)'; btn.style.color = '#fff';
      _analysisActiveTab = btn.dataset.tab;
      _loadAnalysisTab(btn.dataset.tab);
    });
  });
  // style active tab
  const activeBtn = modal.querySelector('.analysisTab.active');
  if (activeBtn) { activeBtn.style.background = 'var(--accent)'; activeBtn.style.color = '#fff'; }

  // Set default from/to dates from exercise settings (epoch/endex)
  const fromEl = document.getElementById('analysisFrom');
  const toEl = document.getElementById('analysisTo');
  if (state.exercise) {
    if (state.exercise.epoch && fromEl && !fromEl.value) {
      try { fromEl.value = new Date(state.exercise.epoch).toISOString().slice(0, 10); } catch(e) {}
    }
    if (state.exercise.endex && toEl && !toEl.value) {
      try { toEl.value = new Date(state.exercise.endex).toISOString().slice(0, 10); } catch(e) {}
    }
  }

  _analysisCache = {};
  _analysisActiveTab = 'overview';
  await _loadAnalysisTab('overview');
}

function _analysisDateParams() {
  const from = document.getElementById('analysisFrom')?.value || '';
  const to = document.getElementById('analysisTo')?.value || '';
  let qs = '';
  if (from) qs += (qs ? '&' : '?') + 'from=' + encodeURIComponent(from);
  if (to) qs += (qs ? '&' : '?') + 'to=' + encodeURIComponent(to);
  return qs;
}

function _analysisCard(value, label, color) {
  return `<div style="padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);text-align:center">
    <div style="font-size:24px;font-weight:700;color:${color || 'var(--accent)'}">${escHtml(String(value))}</div>
    <div style="font-size:var(--fs-xs);color:var(--text)">${escHtml(label)}</div>
  </div>`;
}

async function _loadAnalysisTab(tab) {
  const container = document.getElementById('analysisContent');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-dim)">${t('loading')||'Loading...'}</div>`;

  try {
    switch(tab) {
      case 'overview': await _renderOverviewTab(container); break;
      case 'activity': await _renderActivityTab(container); break;
      case 'optempo': await _renderOpTempoTab(container); break;
      case 'decisions': await _renderDecisionsTab(container); break;
      case 'dependencies': await _renderDependenciesTab(container); break;
      case 'leadership': await _renderLeadershipTab(container); break;
      case 'jstaff': await _renderJStaffTab(container); break;
      case 'teamleads': await _renderTeamLeadsTab(container); break;
      case 'opsleads': await _renderOpsLeadsTab(container); break;
      case 'teammembers': await _renderTeamMembersTab(container); break;
      case 'export': _renderExportTab(container); break;
    }
  } catch(e) {
    console.warn('Analysis tab error', tab, e);
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#E74C3C">${t('error')||'Error'}: ${escHtml(e.message||String(e))}</div>`;
  }
}

/* ── Overview Tab ──────────────────────────────────────────────────────────── */
async function _renderOverviewTab(container) {
  const qs = _analysisDateParams();
  const [overview, evStatus, evType, workload] = await Promise.all([
    _analysisFetch('/api/stats/overview' + qs),
    _analysisFetch('/api/stats/events/status' + qs),
    _analysisFetch('/api/stats/events/type' + qs),
    _analysisFetch('/api/stats/users/workload' + qs),
  ]);

  const statusLabels = Object.keys(evStatus || {});
  const statusData = Object.values(evStatus || {});
  const statusColors = statusLabels.map(k => ({planned:'#3498DB',active:'#E67E22',completed:'#27AE60',cancelled:'#95A5A6',verified:'#2ECC71',rejected:'#E74C3C'}[k] || '#9B59B6'));

  const typeEntries = Object.entries(evType || {}).sort((a,b) => b[1] - a[1]);
  const typeLabels = typeEntries.map(e => e[0]);
  const typeData = typeEntries.map(e => e[1]);

  const wlEntries = Object.entries(workload || {}).sort((a,b) => (b[1].total||0) - (a[1].total||0)).slice(0, 15);
  const wlLabels = wlEntries.map(e => e[0]);
  const wlData = wlEntries.map(e => e[1].total || 0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(overview?.total_events||0, t('total_events')||'Total Events', 'var(--accent)')}
      ${_analysisCard(overview?.total_users||0, t('total_users')||'Total Users', 'var(--accent)')}
      ${_analysisCard(overview?.active_alarms||0, t('active_alarms')||'Active Alarms', '#E67E22')}
      ${_analysisCard(overview?.pending_decisions||0, t('pending_decisions')||'Pending Decisions', '#E67E22')}
      ${_analysisCard(overview?.approved_decisions||0, t('approved_decisions')||'Approved', '#27AE60')}
      ${_analysisCard(overview?.denied_decisions||0, t('denied_decisions')||'Denied', '#E74C3C')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_status_dist')||'Event Status Distribution'}</div>
        <canvas id="anlPieStatus" height="220"></canvas>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_type_breakdown')||'Event Type Breakdown'}</div>
        <canvas id="anlBarType" height="${Math.max(180, typeLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_workload')||'User Workload (Top 15)'}</div>
      <canvas id="anlBarWorkload" height="${Math.max(180, wlLabels.length * 22 + 20)}"></canvas>
    </div>`;

  requestAnimationFrame(() => {
    if (statusLabels.length) drawPieChart('anlPieStatus', statusLabels, statusData, statusColors);
    if (typeLabels.length) drawBarChart('anlBarType', typeLabels, typeData, { horizontal: true });
    if (wlLabels.length) drawBarChart('anlBarWorkload', wlLabels, wlData, { horizontal: true, colors: '#2980B9' });
  });
}

/* ── Activity Tab ──────────────────────────────────────────────────────────── */
async function _renderActivityTab(container) {
  const qs = _analysisDateParams();
  const [heatmap, timeline] = await Promise.all([
    _analysisFetch('/api/stats/events/heatmap' + qs),
    _analysisFetch('/api/stats/events/timeline' + qs).catch(() => null),
  ]);

  const hmData = heatmap?.data || [];
  const hmDays = heatmap?.days || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const hmHours = Array.from({length:24}, (_, i) => String(i).padStart(2,'0'));

  const tlLabels = timeline?.labels || timeline?.dates || [];
  const tlData = timeline?.data || timeline?.counts || [];

  container.innerHTML = `
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_heatmap')||'Activity Heatmap (Day x Hour)'}</div>
      <canvas id="anlHeatmap" height="${Math.max(200, hmDays.length * 28 + 30)}"></canvas>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_events_timeline')||'Events Over Time'}</div>
      <canvas id="anlAreaTimeline" height="250"></canvas>
    </div>`;

  setTimeout(() => {
    if (hmData.length) {
      drawHeatmap('anlHeatmap', hmDays, hmHours, hmData, { colorLow: '#1a1a2e', colorHigh: '#3498DB' });
    }
    if (tlLabels.length) {
      drawAreaChart('anlAreaTimeline', tlLabels, tlData, { color: '#3498DB' });
    }
  }, 50);
}

/* ── Decisions Tab ─────────────────────────────────────────────────────────── */
async function _renderDecisionsTab(container) {
  const qs = _analysisDateParams();
  const analytics = await _analysisFetch('/api/stats/decision-analytics' + qs).catch(() => ({})) || {};

  const byStatus = analytics.by_status || {};
  const outcomeLabels = Object.keys(byStatus).map(k => k === 'rejected' ? 'Denied' : k.charAt(0).toUpperCase() + k.slice(1));
  const outcomeData = Object.values(byStatus);
  const outcomeColors = Object.keys(byStatus).map(k => ({approved:'#27AE60',rejected:'#E74C3C',pending:'#E67E22',denied:'#E74C3C'}[k] || '#9B59B6'));

  const avgMs = analytics.average_response_ms || analytics.avg_response_ms || 0;
  const avgResponse = avgMs ? (avgMs / 60000).toFixed(1) + ' min' : 'N/A';

  const perReq = analytics.per_requester || analytics.by_requester || {};
  const reqLabels = Object.keys(perReq);
  const reqData = Object.values(perReq);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_approval_rate')||'Approval Rate'}</div>
        <canvas id="anlPieDecisions" height="250"></canvas>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);display:flex;flex-direction:column;justify-content:center;align-items:center">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('avg_response_time')||'Avg Response Time'}</div>
        <div style="font-size:36px;font-weight:700;color:var(--accent)">${escHtml(avgResponse)}</div>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_per_requester')||'Decisions Per Requester'}</div>
      <canvas id="anlBarRequester" height="${Math.max(250, reqLabels.length * 22 + 20)}"></canvas>
    </div>`;

  setTimeout(() => {
    if (outcomeLabels.length) drawPieChart('anlPieDecisions', outcomeLabels, outcomeData, outcomeColors);
    if (reqLabels.length) drawBarChart('anlBarRequester', reqLabels, reqData, { horizontal: true, maxBarWidth: 28 });
  }, 50);
}

/* ── OpTempo Tab ───────────────────────────────────────────────────────────── */
async function _renderOpTempoTab(container) {
  const qs = _analysisDateParams();
  const [opTempo, slipHist] = await Promise.all([
    _analysisFetch('/api/stats/op-tempo' + qs).catch(() => null),
    _analysisFetch('/api/stats/slip-histogram' + qs).catch(() => null),
  ]);

  const tempoLabels = opTempo?.labels || opTempo?.dates || [];
  const tempoDatasets = [];
  if (opTempo?.datasets && Array.isArray(opTempo.datasets)) {
    opTempo.datasets.forEach(ds => tempoDatasets.push({data: ds.data||[], color: ds.color||'#3498DB', label: ds.label||''}));
  } else if (opTempo?.data) {
    tempoDatasets.push({data: opTempo.data, color: '#3498DB', label: t('op_tempo')||'Op Tempo'});
  }

  const slipBuckets = slipHist?.labels || slipHist?.buckets || [];
  const slipValues = slipHist?.data || slipHist?.values || [];

  container.innerHTML = `
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_optempo')||'Operational Tempo'}</div>
      <canvas id="anlLineOpTempo" height="250"></canvas>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('analysis_slip_histogram')||'Slip / Delay Histogram'}</div>
      <canvas id="anlHistSlip" height="250"></canvas>
    </div>`;

  setTimeout(() => {
    if (tempoLabels.length && tempoDatasets.length) {
      drawLineChart('anlLineOpTempo', tempoLabels, tempoDatasets, { showArea: true, showPoints: true });
    }
    if (slipBuckets.length) {
      drawHistogram('anlHistSlip', slipBuckets, slipValues, { color: '#E67E22', showValues: true });
    }
  }, 50);
}

/* ── Dependencies Tab ──────────────────────────────────────────────────────── */
async function _renderDependenciesTab(container) {
  const qs = _analysisDateParams();
  const graph = await _analysisFetch('/api/stats/dependency-graph' + qs).catch(() => null);

  const nodes = (graph?.nodes || []).map(n => ({
    id: n.id, label: n.label || n.title || n.id, x: n.x, y: n.y,
    color: n.critical ? '#E74C3C' : (n.color || '#3498DB'),
    size: n.size || 10,
    _event: { status: n.status, event_type: n.type, start_time: n.start_time, description: n.description, assigned_to: n.assigned_to, layer_name: n.layer_name }
  }));
  const edges = (graph?.edges || []).map(e => ({
    from: e.from, to: e.to,
    color: e.critical ? '#E74C3C' : (e.color || 'rgba(255,255,255,0.3)'),
    critical: !!e.critical
  }));
  const stats = graph?.stats || {};

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(stats.total_nodes || nodes.length, t('total_nodes')||'Nodes', 'var(--accent)')}
      ${_analysisCard(stats.total_edges || edges.length, t('total_edges')||'Edges', 'var(--accent)')}
      ${_analysisCard(stats.longest_chain || 0, t('longest_chain')||'Longest Chain', '#E67E22')}
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">${t('dependency_graph')||'Event Dependency Graph'}</div>
      <div style="font-size:var(--fs-xs);color:var(--text);margin-bottom:6px">${t('drag_nodes_click')||'Drag nodes to reposition. Click a node to see event details. Red = critical path.'}</div>
      <canvas id="anlNetGraph" height="400"></canvas>
    </div>`;

  requestAnimationFrame(() => {
    drawNetworkGraph('anlNetGraph', nodes, edges, { directed: true, interactive: true, nodeRadius: 10 });
  });
}

/* ── Leadership Dashboard Tab ─────────────────────────────────────────────── */
async function _renderLeadershipTab(container) {
  const data = await _analysisFetch('/api/stats/leadership-dashboard');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">No data available.</p>`; return; }

  const T = data.tempo || {};
  const R = data.readiness || {};
  const P = data.progress || {};
  const D = data.delay || {};
  const B = data.bottlenecks || {};
  const DL = data.decision_load || {};
  const I = data.impact || {};
  const C = data.confidence || {};
  const E = data.escalation || {};
  const S = data.summary || {};

  // Color helpers
  const confColor = v => v >= 75 ? '#27AE60' : v >= 50 ? '#E67E22' : '#E74C3C';
  const trendIcon = t => t === 'accelerating' ? '▲' : t === 'decelerating' ? '▼' : '●';
  const trendColor = t => t === 'accelerating' ? '#27AE60' : t === 'decelerating' ? '#E74C3C' : 'var(--text-dim)';
  const prioColor = v => v === 'critical' ? '#E74C3C' : v === 'high' ? '#E67E22' : 'var(--text-dim)';

  // Section helper
  const section = (title, icon, html) => `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">${icon} ${escHtml(title)}</div>
      ${html}
    </div>`;

  const cardRow = (...cards) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:10px">${cards.join('')}</div>`;
  const card = (val, lbl, color) => _analysisCard(val, lbl, color);

  // Build critical delays table
  let critDelayHtml = '';
  if (D.critical_delays && D.critical_delays.length) {
    critDelayHtml = `<div style="margin-top:8px;font-size:var(--fs-xs)"><div style="font-weight:600;margin-bottom:4px;color:var(--text)">Top Delays</div>` +
      D.critical_delays.map(d => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:#E74C3C;font-weight:700;min-width:60px">+${Math.round(d.slip_minutes)}m</span>
        <span>${escHtml(d.title || '#'+d.id)}</span>
      </div>`).join('') + '</div>';
  }

  // Build blocked events list
  let blockedHtml = '';
  if (B.blocked_events && B.blocked_events.length) {
    blockedHtml = `<div style="margin-top:8px;font-size:var(--fs-xs)"><div style="font-weight:600;margin-bottom:4px;color:var(--text)">Blocked Events</div>` +
      B.blocked_events.slice(0, 8).map(b => `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:#E74C3C">⛔</span> ${escHtml(b.title)} <span style="color:var(--text-dim)">← ${escHtml(b.blocked_by_title)}</span>
      </div>`).join('') + '</div>';
  }

  // Build overloaded users list
  let overloadedHtml = '';
  if (B.overloaded_users && B.overloaded_users.length) {
    overloadedHtml = `<div style="margin-top:8px;font-size:var(--fs-xs)"><div style="font-weight:600;margin-bottom:4px;color:var(--text)">Overloaded Personnel</div>` +
      B.overloaded_users.map(u => `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:#E67E22">⚠</span> ${escHtml(u.name)} <span style="color:var(--text-dim)">(${u.count} events)</span>
      </div>`).join('') + '</div>';
  }

  // Impact by type chart data
  const impactByType = I.events_by_type || {};
  const impactByLayer = I.events_by_layer || {};

  container.innerHTML = `
    <!-- Confidence banner -->
    <div style="display:flex;gap:12px;margin-bottom:16px;padding:16px;background:var(--bg3);border-radius:var(--radius);align-items:center;flex-wrap:wrap">
      <div style="text-align:center;min-width:100px">
        <div style="font-size:36px;font-weight:800;color:${confColor(C.overall_confidence||0)}">${Math.round(C.overall_confidence||0)}%</div>
        <div style="font-size:var(--fs-xs);color:var(--text)">${t('ld_overall_confidence')||'Overall Confidence'}</div>
      </div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">
        ${card(Math.round(C.completion_confidence||0)+'%', t('ld_completion')||'Completion', confColor(C.completion_confidence||0))}
        ${card(Math.round(C.readiness_score||0)+'%', t('ld_readiness')||'Readiness', confColor(C.readiness_score||0))}
        ${card(Math.round((C.schedule_adherence||0)*100)+'%', t('ld_on_time')||'On-Time', confColor((C.schedule_adherence||0)*100))}
      </div>
      ${S.phase_name ? `<div style="padding:6px 14px;background:var(--accent);color:#fff;border-radius:var(--radius);font-size:var(--fs-xs);font-weight:700">${escHtml(S.phase_name)}</div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <!-- Left column -->
      <div>
        ${section(t('ld_tempo')||'Tempo', '⚡', `
          ${cardRow(
            card(T.events_last_hour||0, t('ld_last_1h')||'Last 1h'),
            card(T.events_last_4h||0, t('ld_last_4h')||'Last 4h'),
            card(T.events_last_24h||0, t('ld_last_24h')||'Last 24h'),
            card(`<span style="color:${trendColor(T.tempo_trend)}">${trendIcon(T.tempo_trend)} ${T.tempo_trend||'—'}</span>`, t('ld_trend')||'Trend')
          )}
          <div style="font-size:var(--fs-xs);color:var(--text)">${t('ld_concurrent_active')||'Concurrent active'}: <b>${T.concurrent_active||0}</b></div>
        `)}

        ${section(t('ld_progress')||'Progress', '📊', `
          ${cardRow(
            card(P.total_events||0, t('ld_total')||'Total'),
            card(P.completed_count||0, t('ld_completed')||'Completed', '#27AE60'),
            card(Math.round(P.completion_rate||0)+'%', t('ld_completion_rate')||'Rate', confColor(P.completion_rate||0))
          )}
          <canvas id="anlLdStatus" width="300" height="140"></canvas>
        `)}

        ${section(t('ld_delay')||'Delay', '⏱', `
          ${cardRow(
            card(Math.round(D.mean_slip_minutes||0)+'m', t('ld_mean_slip')||'Mean Slip', D.mean_slip_minutes > 15 ? '#E74C3C' : '#27AE60'),
            card(Math.round(D.median_slip_minutes||0)+'m', t('ld_median_slip')||'Median', D.median_slip_minutes > 15 ? '#E74C3C' : '#27AE60'),
            card(D.delayed_count||0, t('ld_delayed')||'Delayed', '#E67E22'),
            card(Math.round((D.delayed_rate||0)*100)+'%', t('ld_delayed_rate')||'Delay Rate', D.delayed_rate > 0.2 ? '#E74C3C' : '#27AE60')
          )}
          ${critDelayHtml}
        `)}

        ${section(t('ld_impact')||'Impact', '💥', `
          <canvas id="anlLdTypeChart" width="300" height="140"></canvas>
          <canvas id="anlLdLayerChart" width="300" height="140" style="margin-top:8px"></canvas>
        `)}
      </div>

      <!-- Right column -->
      <div>
        ${section(t('ld_readiness_title')||'Readiness', '✅', `
          ${cardRow(
            card(Math.round(R.latest_check_readiness||0)+'%', t('ld_latest_readiness')||'Latest Check', confColor(R.latest_check_readiness||0)),
            card(R.total_checks||0, t('ld_total_checks')||'Total Checks'),
            card(Math.round((R.avg_response_rate||0)*100)+'%', t('ld_avg_response')||'Avg Response', confColor((R.avg_response_rate||0)*100))
          )}
        `)}

        ${section(t('ld_decision_load')||'Decision Load', '⚖', `
          ${cardRow(
            card(DL.total_decisions||0, t('ld_total')||'Total'),
            card(DL.pending||0, t('ld_pending')||'Pending', DL.pending > 5 ? '#E74C3C' : '#E67E22'),
            card(DL.approved||0, t('ld_approved')||'Approved', '#27AE60'),
            card(DL.rejected||0, t('ld_rejected')||'Rejected', '#E74C3C')
          )}
          <div style="display:flex;gap:12px;font-size:var(--fs-xs);color:var(--text)">
            <span>${t('ld_last_1h')||'Last 1h'}: <b>${DL.decisions_last_hour||0}</b></span>
            <span>${t('ld_last_4h')||'Last 4h'}: <b>${DL.decisions_last_4h||0}</b></span>
            <span>${t('ld_avg_response_time')||'Avg response'}: <b>${Math.round(DL.avg_response_time_minutes||0)}m</b></span>
            <span>${t('ld_velocity')||'Velocity'}: <b>${(DL.decision_velocity||0).toFixed(1)}/h</b></span>
          </div>
        `)}

        ${section(t('ld_bottlenecks')||'Bottlenecks', '🚧', `
          ${cardRow(
            card(B.pending_decisions||0, t('ld_pending_decisions')||'Pending Dec.', B.pending_decisions > 3 ? '#E74C3C' : '#E67E22'),
            card(B.unacknowledged_alarms||0, t('ld_unack_alarms')||'Unack. Alarms', B.unacknowledged_alarms > 0 ? '#E74C3C' : '#27AE60'),
            card((B.stale_events||[]).length, t('ld_stale_events')||'Stale (>2h)', (B.stale_events||[]).length > 0 ? '#E67E22' : '#27AE60'),
            card((B.blocked_events||[]).length, t('ld_blocked')||'Blocked', (B.blocked_events||[]).length > 0 ? '#E74C3C' : '#27AE60')
          )}
          ${overloadedHtml}
          ${blockedHtml}
        `)}

        ${section(t('ld_escalation')||'Escalation', '🔺', `
          ${cardRow(
            card(E.escalated_decisions||0, t('ld_escalated')||'Escalated'),
            card(E.quick_responses||0, t('ld_quick_resp')||'Quick Resp.'),
            card(E.quick_reports||0, t('ld_quick_reports')||'Quick Reports'),
            card((E.escalation_rate||0).toFixed(1)+'/h', t('ld_esc_rate')||'Rate')
          )}
        `)}

        ${section(t('ld_summary')||'Summary', '📋', `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:var(--fs-xs);color:var(--text)">
            <div>${t('ld_active_users')||'Active users'}: <b>${S.active_users_count||0}</b></div>
            <div>${t('ld_groups')||'Groups'}: <b>${S.total_groups||0}</b></div>
            <div>${t('ld_layers')||'Layers'}: <b>${S.total_layers||0}</b></div>
            <div>${t('ld_logbook_24h')||'Logbook (24h)'}: <b>${S.logbook_entries_24h||0}</b></div>
            <div>${t('ld_locks')||'Locks'}: <b>${S.lock_count||0}</b></div>
          </div>
        `)}
      </div>
    </div>`;

  // Render charts after DOM is ready
  setTimeout(() => {
    // Status distribution pie
    const statusMap = P.events_by_status || {};
    const statusLabels = Object.keys(statusMap);
    const statusVals = Object.values(statusMap);
    const statusColors = {planned:'#4A90D9', active:'#E67E22', completed:'#27AE60', verified:'#2ECC71', responded_to:'#3498DB', submitted:'#9B59B6', rejected:'#E74C3C', cancelled:'#95A5A6'};
    if (statusLabels.length && typeof drawPieChart === 'function') {
      drawPieChart('anlLdStatus', statusLabels, statusVals, statusLabels.map(s => statusColors[s] || '#666'));
    }

    // Type breakdown bar chart
    const typeLabels = Object.keys(impactByType);
    const typeVals = Object.values(impactByType);
    if (typeLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlLdTypeChart', typeLabels, typeVals, {horizontal: true, maxBarWidth: 22});
    }

    // Layer breakdown bar chart
    const layerLabels = Object.keys(impactByLayer);
    const layerVals = Object.values(impactByLayer);
    if (layerLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlLdLayerChart', layerLabels, layerVals, {horizontal: true, maxBarWidth: 22});
    }
  }, 50);
}

/* ── Personnel Performance Helper ─────────────────────────────────────────── */
function _perfTable(users, title) {
  if (!users || !users.length) return `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`;
  const rows = users.map(u => `<tr>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border)">${escHtml(u.display_name||'')}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.total_events||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:#27AE60">${u.completed||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:#E67E22">${u.active||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.planned||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;color:${u.completion_rate >= 75 ? '#27AE60' : u.completion_rate >= 50 ? '#E67E22' : '#E74C3C'}">${(u.completion_rate||0).toFixed(1)}%</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center;color:${Math.abs(u.avg_slip_minutes||0) > 15 ? '#E74C3C' : 'var(--text)'}">${(u.avg_slip_minutes||0).toFixed(1)}m</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.decisions_made||0}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:center">${u.audit_actions||0}</td>
  </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
    <thead><tr style="background:var(--bg2)">
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid var(--border)">${t('name')||'Name'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('total')||'Total'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('completed')||'Done'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('active')||'Active'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('planned')||'Planned'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('completion_rate')||'Rate'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('avg_slip')||'Avg Slip'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('decisions')||'Decisions'}</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid var(--border)">${t('actions')||'Actions'}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ── J-Staff Performance Tab ──────────────────────────────────────────────── */
async function _renderJStaffTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const byType = data.j_staff_by_type || [];
  const individuals = data.j_staff_individual || [];

  // J-staff type summary cards
  const typeCards = byType.map(jt => _analysisCard(
    `${jt.user_count} / ${jt.total_events}`,
    `${jt.designation} (${(jt.completion_rate||0).toFixed(0)}%)`,
    jt.completion_rate >= 75 ? '#27AE60' : jt.completion_rate >= 50 ? '#E67E22' : '#E74C3C'
  )).join('');

  // Chart data for type breakdown
  const typeLabels = byType.map(jt => jt.designation);
  const typeData = byType.map(jt => jt.total_events);

  container.innerHTML = `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">⭐ ${t('jstaff_type_performance')||'J-Staff Performance by Designation'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">${typeCards}</div>
      <canvas id="anlJStaffTypeChart" height="${Math.max(180, typeLabels.length * 28 + 20)}"></canvas>
    </div>
    <div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('jstaff_individual_performance')||'Individual J-Staff Officer Performance'}</div>
      ${_perfTable(individuals)}
    </div>`;

  setTimeout(() => {
    if (typeLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlJStaffTypeChart', typeLabels, typeData, { horizontal: true, maxBarWidth: 28 });
    }
  }, 50);
}

/* ── TeamLeads Performance Tab ────────────────────────────────────────────── */
async function _renderTeamLeadsTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const leads = data.team_leads || [];
  const deputies = data.deputy_team_leads || [];
  const allLeads = leads.concat(deputies);

  // Aggregate by role type
  const tlTotal = leads.reduce((s,u) => s + (u.total_events||0), 0);
  const tlCompleted = leads.reduce((s,u) => s + (u.completed||0), 0);
  const dtlTotal = deputies.reduce((s,u) => s + (u.total_events||0), 0);
  const dtlCompleted = deputies.reduce((s,u) => s + (u.completed||0), 0);
  const tlRate = tlTotal > 0 ? (tlCompleted/tlTotal*100) : 0;
  const dtlRate = dtlTotal > 0 ? (dtlCompleted/dtlTotal*100) : 0;

  const chartLabels = allLeads.map(u => u.display_name);
  const chartData = allLeads.map(u => u.total_events||0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">🧰 ${t('teamlead_type_perf')||'TeamLead Performance (by type)'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${_analysisCard(leads.length, t('teamleads')||'TeamLeads', 'var(--accent)')}
          ${_analysisCard(deputies.length, t('deputy_teamleads')||'Deputy TeamLeads', 'var(--accent)')}
          ${_analysisCard(tlRate.toFixed(0)+'%', t('tl_completion')||'TL Completion', tlRate >= 75 ? '#27AE60' : '#E67E22')}
          ${_analysisCard(dtlRate.toFixed(0)+'%', t('dtl_completion')||'DTL Completion', dtlRate >= 75 ? '#27AE60' : '#E67E22')}
        </div>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">📊 ${t('event_distribution')||'Event Distribution'}</div>
        <canvas id="anlTLChart" height="${Math.max(180, chartLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('individual_teamlead_perf')||'Individual TeamLead & Deputy TeamLead Performance'}</div>
      ${_perfTable(allLeads)}
    </div>`;

  setTimeout(() => {
    if (chartLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlTLChart', chartLabels, chartData, { horizontal: true, maxBarWidth: 22 });
    }
  }, 50);
}

/* ── OpsLeads Performance Tab ─────────────────────────────────────────────── */
async function _renderOpsLeadsTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const leads = data.ops_leads || [];
  const deputies = data.deputy_ops_leads || [];
  const allLeads = leads.concat(deputies);

  const olTotal = leads.reduce((s,u) => s + (u.total_events||0), 0);
  const olCompleted = leads.reduce((s,u) => s + (u.completed||0), 0);
  const dolTotal = deputies.reduce((s,u) => s + (u.total_events||0), 0);
  const dolCompleted = deputies.reduce((s,u) => s + (u.completed||0), 0);
  const olRate = olTotal > 0 ? (olCompleted/olTotal*100) : 0;
  const dolRate = dolTotal > 0 ? (dolCompleted/dolTotal*100) : 0;

  const chartLabels = allLeads.map(u => u.display_name);
  const chartData = allLeads.map(u => u.total_events||0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">⚙ ${t('opslead_type_perf')||'OperationsLead Performance (by type)'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${_analysisCard(leads.length, t('opsleads')||'OpsLeads', 'var(--accent)')}
          ${_analysisCard(deputies.length, t('deputy_opsleads')||'Deputy OpsLeads', 'var(--accent)')}
          ${_analysisCard(olRate.toFixed(0)+'%', t('ol_completion')||'OL Completion', olRate >= 75 ? '#27AE60' : '#E67E22')}
          ${_analysisCard(dolRate.toFixed(0)+'%', t('dol_completion')||'DOL Completion', dolRate >= 75 ? '#27AE60' : '#E67E22')}
        </div>
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
        <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">📊 ${t('event_distribution')||'Event Distribution'}</div>
        <canvas id="anlOLChart" height="${Math.max(180, chartLabels.length * 22 + 20)}"></canvas>
      </div>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('individual_opslead_perf')||'Individual OperationsLead & Deputy OperationsLead Performance'}</div>
      ${_perfTable(allLeads)}
    </div>`;

  setTimeout(() => {
    if (chartLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlOLChart', chartLabels, chartData, { horizontal: true, maxBarWidth: 22 });
    }
  }, 50);
}

/* ── Team Members Performance Tab ─────────────────────────────────────────── */
async function _renderTeamMembersTab(container) {
  const data = await _analysisFetch('/api/stats/personnel-performance');
  if (!data) { container.innerHTML = `<p style="color:var(--text-dim)">${t('no_data')||'No data available.'}</p>`; return; }

  const members = data.team_members || [];

  const chartLabels = members.slice(0, 20).map(u => u.display_name);
  const chartData = members.slice(0, 20).map(u => u.total_events||0);

  const totalEvents = members.reduce((s,u) => s + (u.total_events||0), 0);
  const totalCompleted = members.reduce((s,u) => s + (u.completed||0), 0);
  const overallRate = totalEvents > 0 ? (totalCompleted/totalEvents*100) : 0;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      ${_analysisCard(members.length, t('total_members')||'Team Members', 'var(--accent)')}
      ${_analysisCard(totalEvents, t('total_events')||'Total Events', 'var(--accent)')}
      ${_analysisCard(totalCompleted, t('completed')||'Completed', '#27AE60')}
      ${_analysisCard(overallRate.toFixed(0)+'%', t('overall_completion')||'Overall Completion', overallRate >= 75 ? '#27AE60' : '#E67E22')}
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:8px;font-size:var(--fs-sm)">📊 ${t('member_workload')||'Member Workload (Top 20)'}</div>
      <canvas id="anlMemberChart" height="${Math.max(180, chartLabels.length * 22 + 20)}"></canvas>
    </div>
    <div style="padding:12px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:10px;font-size:var(--fs-sm)">👤 ${t('individual_member_perf')||'Individual Team Member Performance'}</div>
      ${_perfTable(members)}
    </div>`;

  setTimeout(() => {
    if (chartLabels.length && typeof drawBarChart === 'function') {
      drawBarChart('anlMemberChart', chartLabels, chartData, { horizontal: true, colors: '#2980B9', maxBarWidth: 22 });
    }
  }, 50);
}

/* ── Export Tab ────────────────────────────────────────────────────────────── */
function _renderExportTab(container) {
  const qs = _analysisDateParams();
  container.innerHTML = `
    <div style="padding:16px;background:var(--bg3);border-radius:var(--radius);margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:12px;font-size:var(--fs-sm)">📄 ${t('analysis_export_data')||'Export Data'}</div>
      <p style="font-size:var(--fs-xs);color:var(--text);margin-bottom:16px">${t('analysis_export_desc')||'Download analysis data in your preferred format.'}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="csv" style="min-width:90px">📋 CSV</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="json" style="min-width:90px">📋 JSON</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="xml" style="min-width:90px">📋 XML</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="txt" style="min-width:90px">📋 TXT</button>
        <button class="btn btn-primary" data-action="_downloadAnalysisExport" data-arg="xlsx" style="min-width:90px">📋 XLSX</button>
      </div>
    </div>
    <div style="padding:16px;background:var(--bg3);border-radius:var(--radius)">
      <div style="font-weight:700;margin-bottom:12px;font-size:var(--fs-sm)">🖼 ${t('analysis_export_visual')||'Export Visuals'}</div>
      <p style="font-size:var(--fs-xs);color:var(--text);margin-bottom:16px">${t('analysis_export_visual_desc')||'Capture the current analysis view as an image or document.'}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="png" style="min-width:90px">🖼 PNG</button>
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="jpeg" style="min-width:90px">🖼 JPEG</button>
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="svg" style="min-width:90px">🖼 SVG</button>
        <button class="btn btn-primary" data-action="_exportAnalysisVisual" data-arg="pdf" style="min-width:90px">📑 PDF</button>
      </div>
    </div>`;
  _bindActions(container);
}

function _downloadAnalysisExport(format) {
  const from = document.getElementById('analysisFrom')?.value || '';
  const to = document.getElementById('analysisTo')?.value || '';
  let url = '/api/stats/export?format=' + encodeURIComponent(format);
  if (from) url += '&from=' + encodeURIComponent(from);
  if (to) url += '&to=' + encodeURIComponent(to);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tidslinjal-analysis-' + new Date().toISOString().slice(0,19).replace(/:/g,'') + '.' + format;
  a.click();
  showNotification('success', t('export_started')||'Export started');
}

function _exportAnalysisVisual(format) {
  const contentEl = document.getElementById('analysisContent') || document.querySelector('.anl-content');
  if (!contentEl) { showNotification('error', 'No analysis content found'); return; }
  const canvases = contentEl.querySelectorAll('canvas');
  if (!canvases.length) { showNotification('warning', t('no_charts')||'No charts to export. Switch to a tab with charts first.'); return; }

  const dateStr = new Date().toISOString().slice(0,10);
  const fname = 'tidslinjal-analysis-' + dateStr;

  if (format === 'png' || format === 'jpeg') {
    // Merge all canvases into one image
    const merged = document.createElement('canvas');
    const gap = 20;
    let totalH = gap;
    let maxW = 0;
    canvases.forEach(c => { totalH += c.height / (window.devicePixelRatio||1) + gap; maxW = Math.max(maxW, c.width / (window.devicePixelRatio||1)); });
    const dpr = window.devicePixelRatio || 1;
    merged.width = maxW * dpr;
    merged.height = totalH * dpr;
    const mctx = merged.getContext('2d');
    mctx.scale(dpr, dpr);
    mctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg') || '#0f1923';
    mctx.fillRect(0, 0, maxW, totalH);
    let yOff = gap;
    canvases.forEach(c => {
      const cw = c.width / dpr, ch = c.height / dpr;
      mctx.drawImage(c, 0, 0, c.width, c.height, 0, yOff, cw, ch);
      yOff += ch + gap;
    });
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    merged.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname + '.' + format; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, mimeType, 0.95);
    showNotification('success', t('export_started')||'Export started');
  } else if (format === 'svg') {
    // Convert canvases to an SVG with embedded images
    let svgParts = [];
    const gap = 20;
    let totalH = gap, maxW = 0;
    const dpr = window.devicePixelRatio || 1;
    canvases.forEach(c => { const cw = c.width/dpr, ch = c.height/dpr; totalH += ch + gap; maxW = Math.max(maxW, cw); });
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}" height="${totalH}">`);
    svgParts.push(`<rect width="100%" height="100%" fill="${getComputedStyle(document.body).getPropertyValue('--bg')||'#0f1923'}"/>`);
    let yOff = gap;
    canvases.forEach(c => {
      const cw = c.width/dpr, ch = c.height/dpr;
      const dataUrl = c.toDataURL('image/png');
      svgParts.push(`<image x="0" y="${yOff}" width="${cw}" height="${ch}" href="${dataUrl}"/>`);
      yOff += ch + gap;
    });
    svgParts.push('</svg>');
    const blob = new Blob([svgParts.join('\n')], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fname + '.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showNotification('success', t('export_started')||'Export started');
  } else if (format === 'pdf') {
    // Simple PDF with embedded images
    _exportAnalysisPDF(canvases, fname);
  }
}

function _exportAnalysisPDF(canvases, fname) {
  const dpr = window.devicePixelRatio || 1;
  const pageW = 595.28, pageH = 841.89; // A4 in points
  const margin = 40;
  const contentW = pageW - margin * 2;

  // Collect canvas images
  const images = [];
  canvases.forEach(c => {
    const cw = c.width / dpr, ch = c.height / dpr;
    const scale = Math.min(contentW / cw, 1);
    const imgW = cw * scale, imgH = ch * scale;
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    // Extract base64 data
    const b64 = dataUrl.split(',')[1];
    images.push({ b64, w: imgW, h: imgH, rawW: c.width, rawH: c.height });
  });

  // Build minimal PDF
  const objects = [];
  let objId = 0;
  function addObj(content) { objId++; objects.push({ id: objId, content }); return objId; }

  const catalogId = addObj(''); // placeholder
  const pagesId = addObj('');   // placeholder
  const pageIds = [];
  const gap = 20;

  // Create pages with images
  let currentY = margin;
  let currentPageStreams = [];
  let currentPageImages = [];
  let pageCount = 0;

  function finalizePage() {
    if (currentPageImages.length === 0) return;
    pageCount++;
    const imgObjIds = [];
    currentPageImages.forEach((img, i) => {
      const imgObjId = addObj(`<< /Type /XObject /Subtype /Image /Width ${img.rawW} /Height ${img.rawH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${atob(img.b64).length} >>`);
      imgObjIds.push({ objId: imgObjId, img, idx: i });
    });
    // Build content stream
    let stream = '';
    let yPos = pageH - margin;
    currentPageImages.forEach((img, i) => {
      yPos -= img.h;
      stream += `q ${img.w} 0 0 ${img.h} ${margin} ${yPos} cm /Img${i} Do Q\n`;
      yPos -= gap;
    });
    const streamBytes = new TextEncoder().encode(stream);
    const contentId = addObj(`<< /Length ${streamBytes.length} >>`);
    // Resources
    let resImgs = '';
    imgObjIds.forEach((io, i) => { resImgs += `/Img${i} ${io.objId} 0 R `; });
    const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /XObject << ${resImgs} >> >> >>`);
    pageIds.push(pageId);
    // Store stream and image data for writing
    objects[contentId - 1]._stream = stream;
    imgObjIds.forEach(io => { objects[io.objId - 1]._imgB64 = io.img.b64; });
    currentPageImages = [];
    currentY = margin;
  }

  images.forEach(img => {
    if (currentY + img.h + gap > pageH - margin && currentPageImages.length > 0) {
      finalizePage();
    }
    currentPageImages.push(img);
    currentY += img.h + gap;
  });
  finalizePage();

  // Update catalog and pages
  objects[catalogId - 1].content = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1].content = `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;

  // Serialize PDF
  const parts = ['%PDF-1.4\n'];
  const offsets = [];
  objects.forEach(obj => {
    offsets.push(parts.join('').length);
    parts.push(`${obj.id} 0 obj\n${obj.content}\n`);
    if (obj._stream) {
      parts.push(`stream\n${obj._stream}endstream\n`);
    }
    if (obj._imgB64) {
      const bin = atob(obj._imgB64);
      parts.push('stream\n');
      // We'll handle binary separately
      obj._binOffset = parts.join('').length;
      parts.push(bin);
      parts.push('\nendstream\n');
    }
    parts.push('endobj\n');
  });
  const xrefOffset = parts.join('').length;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach(off => { parts.push(String(off).padStart(10, '0') + ' 00000 n \n'); });
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const blob = new Blob(parts, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname + '.pdf'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showNotification('success', t('export_started')||'Export started');
}

/* ── Analysis Helpers ──────────────────────────────────────────────────────── */
async function _analysisFetch(url) {
  if (_analysisCache[url]) return _analysisCache[url];
  const res = await apiGet(url);
  _analysisCache[url] = res;
  return res;
}

/* — kept for backward compat with old template references — */
function closeAnalysisModal() {
  const el = document.getElementById('analysisModal');
  if (el) el.remove();
  _analysisCache = {};
}

async function refreshAnalysis() {
  _analysisCache = {};
  const tab = _analysisActiveTab || 'overview';
  await _loadAnalysisTab(tab);
}

function detachAnalysis() {
  if (_analysisPopout && !_analysisPopout.closed) {
    _analysisPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 1400);
  const h = Math.min(window.screen.availHeight - 60, 1000);
  _analysisPopout = window.open('/static/analysis-popup.html', 'tidslinjal-analysis',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  closeAnalysisModal();
}

async function exportAnalysis() {
  const fmt = document.getElementById('analysisExportFmt')?.value || 'csv';
  _downloadAnalysisExport(fmt);
}

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

// ── Narrative / Storyline Modal ──────────────────────────────────────────────
let _narrativePopout = null;
let _narrativeAutoScroll = true;
let _narrativeAutoRefreshTimer = null;
let _narrativeSortNewestFirst = true;

async function openNarrativeModal() {
  // Default to last 24 hours
  const now = new Date();
  const from = new Date(now.getTime() - 24*60*60*1000);
  let entries = [];
  try {
    entries = await apiGet(`/api/narrative?from=${from.toISOString()}&to=${now.toISOString()}&limit=200`) || [];
  } catch(e) { console.warn('Narrative fetch error', e); }

  const html = `
    <div class="modal-overlay" id="narrativeModal">
      <div class="modal" style="max-width:750px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>📰 ${t('narrative_title')||'Narrative / Storyline'}</h2>
          <div style="display:flex;gap:6px;margin-left:auto;margin-right:8px">
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="detachNarrative">⧉</button>
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="refreshNarrative">${t('btn_refresh')||'Refresh'}</button>
          </div>
          <button class="modal-close" data-action="closeNarrativeModal">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('from')||'From'}: <input type="datetime-local" id="narrativeFrom" value="${from.toISOString().slice(0,16)}"
                style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('to')||'To'}: <input type="datetime-local" id="narrativeTo" value="${now.toISOString().slice(0,16)}"
                style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('narrative_detail_level')||'Detail level'}:
              <select id="narrativeCategory" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
                <option value="all">${t('narrative_cat_all')||'All events'}</option>
                <option value="external">${t('narrative_cat_external')||'External events'}</option>
                <option value="operational">${t('narrative_cat_operational')||'Operational events'}</option>
                <option value="security">${t('narrative_cat_security')||'Security events'}</option>
              </select>
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px;cursor:pointer">
              <input type="checkbox" id="narrativeAutoScroll" ${_narrativeAutoScroll ? 'checked' : ''}
                style="accent-color:var(--accent)" data-action="_setNarrativeAutoScroll" data-arg-checked data-event="change">
              ${t('narrative_autoscroll')||'Autoscroll'}
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('narrative_sort_order')||'Order'}:
              <select id="narrativeSortOrder" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
                <option value="newest" ${_narrativeSortNewestFirst ? 'selected' : ''}>${t('narrative_sort_newest')||'Newest first'}</option>
                <option value="oldest" ${!_narrativeSortNewestFirst ? 'selected' : ''}>${t('narrative_sort_oldest')||'Oldest first'}</option>
              </select>
            </label>
            <button class="btn btn-sm btn-primary" data-action="refreshNarrative">${t('btn_refresh')||'Refresh'}</button>
          </div>
          <div id="narrativeEntries" style="font-family:var(--font-mono,monospace);font-size:var(--fs-xs)">
            ${_renderNarrativeEntries(entries)}
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('narrativeModal');
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);
  // Category change triggers refresh
  const catEl = document.getElementById('narrativeCategory');
  if (catEl) catEl.addEventListener('change', () => refreshNarrative());
  // Sort order change triggers refresh
  const sortEl = document.getElementById('narrativeSortOrder');
  if (sortEl) sortEl.addEventListener('change', () => { _narrativeSortNewestFirst = sortEl.value === 'newest'; refreshNarrative(); });
  // Autoscroll to bottom on open
  _narrativeScrollToTop();
  // Start auto-refresh (every 15s)
  _narrativeAutoRefreshTimer = setInterval(() => {
    if (document.getElementById('narrativeModal')) refreshNarrative();
    else clearInterval(_narrativeAutoRefreshTimer);
  }, 15000);
}

function _renderNarrativeEntries(entries) {
  if (!entries || !entries.length) return `<p style="color:var(--text-dim)">${t('narrative_empty')||'No events in this time range.'}</p>`;
  // Sort entries based on user preference (newest first or oldest first)
  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return _narrativeSortNewestFirst ? (tb - ta) : (ta - tb);
  });
  return sorted.map(e => {
    const ts = fmtDateTime(new Date(e.timestamp));
    const timeStr = new Date(e.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    const severityColors = {info:'var(--text-dim)', warning:'#E67E22', critical:'#E74C3C'};
    const severityColor = severityColors[e.severity] || 'var(--text-dim)';
    const typeIcons = {
      event_started: '📌', decision_requested: '❓', decision_approved: '✅',
      decision_rejected: '❌', decision_: '⚖', audit_created: '➕',
      audit_updated: '✏', audit_deleted: '🗑', audit_status_changed: '🔄',
      audit_login: '🔑', audit_co_signed: '👁',
    };
    let icon = '•';
    for (const [prefix, ic] of Object.entries(typeIcons)) {
      if (e.type.startsWith(prefix)) { icon = ic; break; }
    }
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:flex-start">
      <span style="color:${severityColor};font-weight:700;min-width:42px">${timeStr}</span>
      <span style="font-size:14px">${icon}</span>
      <div style="flex:1">
        <span style="color:var(--text)">${escHtml(e.summary)}</span>
        ${e.user_name ? `<span style="color:var(--text-dim);margin-left:6px">— ${escHtml(e.user_name)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _setNarrativeAutoScroll(val) { _narrativeAutoScroll = val; }

function closeNarrativeModal() {
  if (_narrativeAutoRefreshTimer) { clearInterval(_narrativeAutoRefreshTimer); _narrativeAutoRefreshTimer = null; }
  const el = document.getElementById('narrativeModal');
  if (el) el.remove();
}

async function refreshNarrative() {
  const fromEl = document.getElementById('narrativeFrom');
  const toEl = document.getElementById('narrativeTo');
  const catEl = document.getElementById('narrativeCategory');
  let from = fromEl ? new Date(fromEl.value).toISOString() : new Date(Date.now()-24*60*60*1000).toISOString();
  let to = toEl ? new Date(toEl.value).toISOString() : new Date().toISOString();
  const category = catEl ? catEl.value : 'all';
  try {
    const entries = await apiGet(`/api/narrative?from=${from}&to=${to}&limit=200&category=${category}`) || [];
    const el = document.getElementById('narrativeEntries');
    if (el) el.innerHTML = _renderNarrativeEntries(entries);
    _narrativeScrollToTop();
  } catch(e) { showError('Failed to refresh: ' + e.message); }
}

function _narrativeScrollToTop() {
  if (!_narrativeAutoScroll) return;
  const el = document.getElementById('narrativeEntries');
  if (el) el.scrollTop = 0;
  // Also scroll the modal body
  const body = el && el.closest('.modal-body');
  if (body) body.scrollTop = 0;
}

function detachNarrative() {
  if (_narrativePopout && !_narrativePopout.closed) {
    _narrativePopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 800);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _narrativePopout = window.open('/static/narrative-popup.html', 'tidslinjal-narrative',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  closeNarrativeModal();
}

// ── Resources Window (detached) ──────────────────────────────────────────────
let _resourcesPopout = null;

function openDetachedResources() {
  if (_resourcesPopout && !_resourcesPopout.closed) {
    _resourcesPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 600);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _resourcesPopout = window.open('/static/resources-popup.html', 'tidslinjal-resources',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
}

// ── References Window (detached) ────────────────────────────────────────────
let _referencesPopout = null;
function openDetachedReferences() {
  if (_referencesPopout && !_referencesPopout.closed) {
    _referencesPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 700);
  const h = Math.min(window.screen.availHeight - 100, 800);
  _referencesPopout = window.open('/static/references-popup.html', 'tidslinjal-references',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
}

// ── Map Window (detached) ────────────────────────────────────────────────────
let _mapPopout = null;

function openDetachedMap() {
  if (_mapPopout && !_mapPopout.closed) {
    _mapPopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 1024);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _mapPopout = window.open('/static/map-popup.html', 'tidslinjal-map',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
}

// ── Detachable Tools Window ──────────────────────────────────────────────────
let _toolsPopout = null;
let _toolsPopoutMonitor = null;

function openDetachedTools() {
  if (_toolsPopout && !_toolsPopout.closed) {
    _toolsPopout.focus();
    return;
  }
  // Render tools content via the sidebar renderer
  const tempDiv = document.createElement('div');
  const prevTab = state.sidebarTab;
  state.sidebarTab = 'tools';
  renderSidebar();
  const srcContent = document.getElementById('sidebarContent');
  const toolsHTML = srcContent ? srcContent.innerHTML : '';
  state.sidebarTab = prevTab;
  renderSidebar();

  const theme = document.body.className || '';
  const w = Math.min(window.screen.availWidth, 420);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _toolsPopout = window.open('', 'tidslinjal-tools',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_toolsPopout) return;

  _toolsPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Tools</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<div id="toolsWrap"></div>' +
    '</body></html>');
  _toolsPopout.document.close();

  const wrapEl = _toolsPopout.document.getElementById('toolsWrap');
  if (wrapEl) wrapEl.innerHTML = toolsHTML;

  // Bind data-action buttons to opener functions
  function rebindActions() {
    if (!_toolsPopout || _toolsPopout.closed) return;
    const wrap = _toolsPopout.document.getElementById('toolsWrap');
    if (!wrap) return;
    wrap.querySelectorAll('[data-action]').forEach(function(el) {
      el.onclick = function() {
        try {
          window.focus();
          var fn = el.dataset.action;
          if (typeof window[fn] === 'function') window[fn]();
        } catch(e) {}
      };
    });
  }
  rebindActions();

  if (_toolsPopoutMonitor) clearInterval(_toolsPopoutMonitor);
  _toolsPopoutMonitor = setInterval(() => {
    if (!_toolsPopout || _toolsPopout.closed) {
      clearInterval(_toolsPopoutMonitor);
      _toolsPopoutMonitor = null;
      _toolsPopout = null;
    }
  }, 1000);
}

// ── Detachable Log Book Window ────────────────────────────────────────────────
let _logBookPopout = null;
let _logBookPopoutMonitor = null;

function openDetachedLogBook() {
  if (_logBookPopout && !_logBookPopout.closed) {
    _logBookPopout.focus();
    return;
  }

  // Build logbook categories
  const cats = [
    {v:'incoming',l:t('lb_incoming')||'Incoming matter'},
    {v:'outgoing',l:t('lb_outgoing')||'Outgoing matter'},
    {v:'incident',l:t('lb_incident')||'Special incident'},
    {v:'directive',l:t('lb_directive')||'Directive'},
    {v:'decision',l:t('lb_decision')||'Decision'},
    {v:'action',l:t('lb_action')||'Action taken'},
    {v:'briefing',l:t('lb_briefing')||'Briefing content'},
    {v:'situation',l:t('lb_situation')||'Situation change'},
    {v:'logistics',l:t('lb_logistics')||'Logistics'},
    {v:'meeting',l:t('lb_meeting')||'Meeting protocol'},
    {v:'other',l:t('lb_other')||'Other'}
  ].filter(c => !(c.v === 'decision' && state.preferences && state.preferences.logbook_hide_decisions));

  const theme = document.body.className || '';
  const w = Math.min(window.screen.availWidth, 700);
  const h = Math.min(window.screen.availHeight - 100, 800);
  _logBookPopout = window.open('', 'tidslinjal-logbook',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!_logBookPopout) return;

  _logBookPopout.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Log Book</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    'h3{margin:0 0 12px;font-size:16px;color:var(--accent)}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<h3>📖 ' + escHtml(t('tab_log_book')||'Log Book') + '</h3>' +
    '<div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:8px">' +
    '<select id="lbCategory" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">' +
    cats.map(c => '<option value="' + c.v + '">' + escHtml(c.l) + '</option>').join('') +
    '</select>' +
    '<input type="text" id="lbSubject" placeholder="' + escHtml(t('lb_subject')||'Subject') + '" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">' +
    '<textarea id="lbBody" rows="3" placeholder="' + escHtml(t('lb_body')||'Details (optional)') + '" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);resize:vertical;margin-bottom:4px"></textarea>' +
    '<div style="display:flex;gap:6px;align-items:center">' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">📎 <input type="file" id="lbAttachFile" style="max-width:200px;font-size:10px" multiple></label>' +
    '<span style="flex:1"></span>' +
    '<button class="btn btn-primary btn-sm" id="lbAddBtn">' + escHtml(t('btn_add')||'Add') + '</button>' +
    '</div></div>' +
    '<div id="logBookEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">' + escHtml(t('lb_loading')||'Loading…') + '</em></div>' +
    '</body></html>');
  _logBookPopout.document.close();

  // Bind add button
  const addBtn = _logBookPopout.document.getElementById('lbAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const doc = _logBookPopout.document;
      const category = doc.getElementById('lbCategory')?.value || 'other';
      const subject = doc.getElementById('lbSubject')?.value?.trim();
      if (!subject) { alert(t('lb_subject_required')||'Subject is required'); return; }
      const body = doc.getElementById('lbBody')?.value?.trim() || '';
      const res = await apiPost('/api/log-book', {category, subject, body});
      if (res.ok) {
        const created = await res.json().catch(() => null);
        const fileInput = doc.getElementById('lbAttachFile');
        if (created && created.id && fileInput && fileInput.files.length > 0) {
          for (const file of fileInput.files) {
            const fd = new FormData();
            fd.append('file', file);
            await api('POST', '/api/log-book/' + created.id + '/attachment', fd);
          }
        }
        doc.getElementById('lbSubject').value = '';
        doc.getElementById('lbBody').value = '';
        if (fileInput) fileInput.value = '';
        _refreshLogBookPopout();
        showNotification('success', t('lb_added')||'Log book entry added');
      }
    });
  }

  _refreshLogBookPopout();

  // Close any modal that launched this
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if (m.querySelector('[data-action="openDetachedLogBook"]')) m.remove();
  });

  if (_logBookPopoutMonitor) clearInterval(_logBookPopoutMonitor);
  _logBookPopoutMonitor = setInterval(() => {
    if (!_logBookPopout || _logBookPopout.closed) {
      clearInterval(_logBookPopoutMonitor);
      _logBookPopoutMonitor = null;
      _logBookPopout = null;
    }
  }, 1000);
}

async function _refreshLogBookPopout() {
  if (!_logBookPopout || _logBookPopout.closed) return;
  try {
    const entries = await apiGet('/api/log-book') || [];
    const el = _logBookPopout.document.getElementById('logBookEntries');
    if (!el) return;
    const isAdmin = state.user && (state.user.role === 'admin' || hasRole2(state.user.role, 'oplead'));
    if (entries.length === 0) {
      el.innerHTML = '<em style="color:var(--text-dim)">' + escHtml(t('lb_empty')||'No log book entries yet.') + '</em>';
      return;
    }
    el.innerHTML = entries.slice().reverse().map(e => {
      const ts = e.created_at ? new Date(e.created_at).toLocaleString() : '';
      const attachments = (e.attachments||[]).map(a =>
        '<a href="/api/log-book/' + e.id + '/attachment/' + encodeURIComponent(a.stored_name) + '" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none">📎 ' + escHtml(a.filename) + '</a>'
      ).join(' ');
      return '<div style="border-bottom:1px solid var(--border);padding:6px 0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-weight:600;color:var(--text)">[' + escHtml(e.category||'') + '] ' + escHtml(e.subject||'') + '</span>' +
        '<span style="color:var(--text-dim);font-size:10px">' + escHtml(ts) + '</span></div>' +
        (e.body ? '<div style="color:var(--text-dim);margin-top:2px;white-space:pre-line">' + escHtml(e.body) + '</div>' : '') +
        (attachments ? '<div style="margin-top:2px">' + attachments + '</div>' : '') +
        '<div style="font-size:10px;color:var(--text-dim);margin-top:2px">' + escHtml(e.created_by_name||'') + '</div>' +
        '</div>';
    }).join('');
  } catch(e) { /* ignore */ }
}

// ── Critical Line Analysis ──────────────────────────────────────────────────
function openCriticalLineModal() {
  const events = (state.events || []).filter(e => !isTypeHidden(e.event_type) && e.start_time);
  // Build a dependency graph and find the critical path
  const evMap = {};
  events.forEach(e => { evMap[e.id] = e; });

  // Find events with dependencies
  const withDeps = events.filter(e => e.depends_on && e.depends_on.length > 0);
  // Find event chains (longest path through dependencies)
  function findLongestPath(evId, visited) {
    if (visited.has(evId)) return [];
    visited.add(evId);
    const ev = evMap[evId];
    if (!ev) return [];
    const start = new Date(ev.start_time).getTime();
    const end = ev.end_time ? new Date(ev.end_time).getTime() : start;
    const duration = end - start;
    let longestDown = [];
    (ev.depends_on || []).forEach(depId => {
      const path = findLongestPath(depId, new Set(visited));
      if (path.length > longestDown.length) longestDown = path;
    });
    return [...longestDown, { id: evId, title: ev.title, start, end, duration, status: ev.status, type: ev.event_type }];
  }

  // Find all leaf events (not depended upon by others)
  const dependedUpon = new Set();
  events.forEach(e => (e.depends_on || []).forEach(d => dependedUpon.add(d)));
  const leaves = events.filter(e => !dependedUpon.has(e.id));

  let criticalPath = [];
  leaves.forEach(ev => {
    const path = findLongestPath(ev.id, new Set());
    if (path.length > criticalPath.length) criticalPath = path;
  });

  // If no dependency chains, show timeline-based analysis
  const sorted = [...events].sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
  const totalSpan = sorted.length > 1
    ? (new Date(sorted[sorted.length-1].end_time || sorted[sorted.length-1].start_time) - new Date(sorted[0].start_time))
    : 0;

  // Identify overlapping events (resource conflicts)
  const overlaps = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i+1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const aEnd = new Date(a.end_time || a.start_time);
      const bStart = new Date(b.start_time);
      if (aEnd > bStart && a.responsible_id && a.responsible_id === b.responsible_id) {
        overlaps.push({a, b});
      }
    }
    if (overlaps.length >= 20) break;
  }

  // Status distribution
  const statusCounts = {};
  events.forEach(e => { statusCounts[e.status || 'planned'] = (statusCounts[e.status || 'planned'] || 0) + 1; });

  const fmtDur = ms => {
    if (ms < 3600000) return Math.round(ms/60000) + ' min';
    if (ms < 86400000) return (ms/3600000).toFixed(1) + ' h';
    return (ms/86400000).toFixed(1) + ' d';
  };

  // Remove any existing modal to prevent duplicates
  const old = document.getElementById('criticalLineModal');
  if (old) old.remove();

  const el = document.createElement('div');
  el.className = 'modal-overlay open';
  el.id = 'criticalLineModal';
  el.innerHTML = `
      <div class="modal" style="max-width:750px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>📈 ${t('critical_line_title')||'Critical Line Analysis'}</h2>
          <button class="modal-close" data-action="closeCriticalLineModal">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px">Summary</h3>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:var(--fs-sm)">
              <span style="color:var(--text-dim)">Total events:</span><span>${events.length}</span>
              <span style="color:var(--text-dim)">Total span:</span><span>${totalSpan > 0 ? fmtDur(totalSpan) : '—'}</span>
              <span style="color:var(--text-dim)">With dependencies:</span><span>${withDeps.length}</span>
              <span style="color:var(--text-dim)">Resource conflicts:</span><span style="color:${overlaps.length?'var(--danger)':'var(--text)'}">${overlaps.length}</span>
            </div>
          </div>
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px">Status Distribution</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${Object.entries(statusCounts).map(([s,c]) =>
                `<span style="padding:2px 8px;border-radius:var(--radius);background:var(--bg3);font-size:var(--fs-xs)">${s}: <strong>${c}</strong></span>`
              ).join('')}
            </div>
          </div>
          ${criticalPath.length > 1 ? `
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px;color:var(--danger)">Critical Path (${criticalPath.length} events)</h3>
            <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
              ${criticalPath.map((cp,i) => `
                <div style="padding:6px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:var(--fs-xs)">
                  <span style="font-weight:700;color:var(--accent);min-width:20px">${i+1}</span>
                  <span style="flex:1">${escHtml(cp.title)}</span>
                  <span style="color:var(--text-dim)">${fmtDur(cp.duration)}</span>
                  <span class="role-badge role-${cp.status==='completed'?'admin':cp.status==='active'?'teamlead':'observer'}" style="font-size:10px;padding:1px 5px">${cp.status||'planned'}</span>
                </div>`).join('')}
            </div>
          </div>` : `
          <div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:var(--radius)">
            <p style="font-size:var(--fs-xs);color:var(--text-dim)">No dependency chains found. Add dependencies between events (via the "Depends On" field) to see the critical path analysis.</p>
          </div>`}
          ${overlaps.length ? `
          <div style="margin-bottom:12px">
            <h3 style="font-size:var(--fs-sm);margin-bottom:6px;color:#E67E22">Resource Conflicts (${overlaps.length})</h3>
            ${overlaps.slice(0,10).map(o => `
              <div style="font-size:var(--fs-xs);padding:4px 0;border-bottom:1px solid var(--border)">
                <span style="color:var(--danger)">⚠</span>
                <strong>${escHtml(o.a.title)}</strong> overlaps with <strong>${escHtml(o.b.title)}</strong>
                ${o.a.responsible_name ? ` (${escHtml(o.a.responsible_name)})` : ''}
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
  document.body.appendChild(el);
  _bindActions(el);
}

function closeCriticalLineModal() {
  const el = document.getElementById('criticalLineModal');
  if (el) el.remove();
}

// ── Offline Mode ────────────────────────────────────────────────────────────
window._offlineMode = false;
window._offlineModeForced = false;
window._offlineCache = {};

function _initOfflineMode() {
  // Restore forced offline preference
  try {
    window._offlineModeForced = localStorage.getItem('tidslinjal_offline_forced') === 'true';
    if (window._offlineModeForced) window._offlineMode = true;
  } catch {}

  // Auto-detect network status
  window.addEventListener('online', () => {
    if (!window._offlineModeForced) {
      window._offlineMode = false;
      _updateOfflineIndicator();
      showNotification('success', 'Connection restored — syncing data…');
      // Sync: push any queued offline actions, then pull fresh data
      _syncOfflineQueue().then(() => {
        refreshAll();
        _cacheDataForOffline();
        showNotification('success', 'Data synchronized');
      }).catch(() => {
        showNotification('warning', 'Sync partially failed — retrying…');
        setTimeout(() => _syncOfflineQueue().then(refreshAll), 5000);
      });
    }
  });
  window.addEventListener('offline', () => {
    window._offlineMode = true;
    _updateOfflineIndicator();
    if (state.sidebarTab === 'legend') renderSidebar();
    showNotification('warning', 'Network lost — offline mode active');
  });

  // Check initial state
  if (!navigator.onLine) {
    window._offlineMode = true;
  }

  // Periodically cache key data
  setInterval(_cacheDataForOffline, 60000);
  _cacheDataForOffline();
}

function _cacheDataForOffline() {
  if (window._offlineMode) return;
  try {
    if (state.events) localStorage.setItem('tidslinjal_cache_events', JSON.stringify(state.events));
    if (state.eventTypes) localStorage.setItem('tidslinjal_cache_eventTypes', JSON.stringify(state.eventTypes));
    if (state.user) localStorage.setItem('tidslinjal_cache_user', JSON.stringify(state.user));
    if (state.preferences) localStorage.setItem('tidslinjal_cache_preferences', JSON.stringify(state.preferences));
    if (state.layers) localStorage.setItem('tidslinjal_cache_layers', JSON.stringify(state.layers));
    if (state.exercise) localStorage.setItem('tidslinjal_cache_exercise', JSON.stringify(state.exercise));
  } catch {}
}

function _loadOfflineCache() {
  try {
    const events = localStorage.getItem('tidslinjal_cache_events');
    if (events) state.events = JSON.parse(events);
    const types = localStorage.getItem('tidslinjal_cache_eventTypes');
    if (types) state.eventTypes = JSON.parse(types);
    const user = localStorage.getItem('tidslinjal_cache_user');
    if (user) state.user = JSON.parse(user);
    const prefs = localStorage.getItem('tidslinjal_cache_preferences');
    if (prefs) state.preferences = JSON.parse(prefs);
    const layers = localStorage.getItem('tidslinjal_cache_layers');
    if (layers) state.layers = JSON.parse(layers);
    const exercise = localStorage.getItem('tidslinjal_cache_exercise');
    if (exercise) state.exercise = JSON.parse(exercise);
  } catch {}
}

function _updateOfflineIndicator() {
  const el = document.getElementById('offlineStatus');
  if (el) {
    el.innerHTML = window._offlineMode
      ? '<span style="color:#e05252">● Offline</span>'
      : '<span style="color:#27ae60">● Online</span>';
  }
  // Show/hide offline banner in header
  let banner = document.getElementById('offlineBanner');
  if (window._offlineMode && !banner) {
    banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#e05252;color:#fff;text-align:center;font-size:11px;padding:3px;letter-spacing:.05em';
    banner.textContent = '📡 OFFLINE MODE — Working with cached data';
    document.body.prepend(banner);
  } else if (!window._offlineMode && banner) {
    banner.remove();
  }
}

function toggleOfflineMode() {
  window._offlineModeForced = !window._offlineModeForced;
  window._offlineMode = window._offlineModeForced || !navigator.onLine;
  try { localStorage.setItem('tidslinjal_offline_forced', window._offlineModeForced); } catch {}
  _updateOfflineIndicator();
  renderSidebar();
  if (window._offlineModeForced) {
    showNotification('warning', 'Offline mode enabled — using cached data');
  } else if (navigator.onLine) {
    showNotification('success', 'Online mode restored');
    refreshAll();
  }
}

// Wrap apiGet to use cache when offline
const _origApiGet = typeof apiGet === 'function' ? apiGet : null;
if (_origApiGet) {
  window.apiGet = async function(url) {
    if (window._offlineMode) {
      _loadOfflineCache();
      throw new Error('offline');
    }
    return _origApiGet(url);
  };
}

// Offline action queue — stores API calls made while offline for later replay
window._offlineActionQueue = JSON.parse(localStorage.getItem('tidslinjal_offline_queue') || '[]');

function _queueOfflineAction(method, path, body) {
  window._offlineActionQueue.push({ method, path, body, timestamp: Date.now() });
  try { localStorage.setItem('tidslinjal_offline_queue', JSON.stringify(window._offlineActionQueue)); } catch {}
}

async function _syncOfflineQueue() {
  const queue = window._offlineActionQueue.slice();
  if (queue.length === 0) return;
  const failed = [];
  for (const action of queue) {
    try {
      const res = await api(action.method, action.path, action.body);
      if (!res.ok && res.status !== 409) failed.push(action); // 409 = conflict, skip
    } catch {
      failed.push(action);
    }
  }
  window._offlineActionQueue = failed;
  try { localStorage.setItem('tidslinjal_offline_queue', JSON.stringify(failed)); } catch {}
}

// Wrap apiPost to queue when offline
const _origApiPost = typeof apiPost === 'function' ? apiPost : null;
if (_origApiPost) {
  window.apiPost = async function(url, body) {
    if (window._offlineMode) {
      _queueOfflineAction('POST', url, body);
      return new Response(JSON.stringify({queued:true}), {status:202});
    }
    return _origApiPost(url, body);
  };
}

// Initialize offline mode detection
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', _initOfflineMode);
}

// ── Artificial Time ─────────────────────────────────────────────────────────
async function toggleArtificialTimeSetting() {
  const enabled = document.getElementById('settingsArtTimeEnabled')?.checked || false;
  state.exercise = state.exercise || {};
  state.exercise.artificial_time_enabled = enabled;
  await saveExercise();
  renderSidebar();
}

async function saveArtificialTimeSetting() {
  const enabled = document.getElementById('settingsArtTimeEnabled')?.checked || false;
  const val = document.getElementById('settingsArtTime')?.value;
  state.exercise = state.exercise || {};
  state.exercise.artificial_time_enabled = enabled;
  state.exercise.artificial_time = val ? new Date(val).toISOString() : '';
  await saveExercise();
  showNotification('success', t('notif_saved')||'Saved');
  renderSidebar();
}

async function setArtificialTime() {
  const val = document.getElementById('exArtificialTime')?.value;
  const enabled = document.getElementById('exArtificialTimeEnabled')?.checked || false;
  state.exercise = state.exercise || {};
  state.exercise.artificial_time = val ? new Date(val).toISOString() : '';
  state.exercise.artificial_time_enabled = enabled;
  await saveExercise();
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
    } else if (entry.action === 'create_layer') {
      await apiDel('/api/layers/' + entry.data.id);
      await fetchLayers();
    } else if (entry.action === 'delete_layer') {
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.created_at;
      await apiPost('/api/layers', payload);
      await fetchLayers();
    } else if (entry.action === 'update_layer') {
      const payload = { ...entry.data.old };
      delete payload.created_at;
      await apiPut('/api/layers/' + entry.data.id, payload);
      await fetchLayers();
    } else if (entry.action === 'create_group') {
      await apiDel('/api/groups/' + entry.data.id);
      await fetchGroups();
    } else if (entry.action === 'delete_group') {
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.created_at;
      await apiPost('/api/groups', payload);
      await fetchGroups();
    } else if (entry.action === 'create_event_type') {
      await apiDel('/api/event-types/' + entry.data.id);
      state.eventTypes = await apiGet('/api/event-types');
    } else if (entry.action === 'delete_event_type') {
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.created_at;
      await apiPost('/api/event-types', payload);
      state.eventTypes = await apiGet('/api/event-types');
    } else if (entry.action === 'update_event_type') {
      const payload = { ...entry.data.old };
      delete payload.created_at;
      await apiPut('/api/event-types/' + entry.data.id, payload);
      state.eventTypes = await apiGet('/api/event-types');
    } else if (entry.action === 'create_phase') {
      await apiDel('/api/phases/' + entry.data.id);
      await fetchPhases();
    } else if (entry.action === 'delete_phase') {
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.created_at;
      await apiPost('/api/phases', payload);
      await fetchPhases();
    } else if (entry.action === 'update_phase') {
      const payload = { ...entry.data.old };
      delete payload.created_at;
      await apiPut('/api/phases/' + entry.data.id, payload);
      await fetchPhases();
    } else if (entry.action === 'create_alarm') {
      await apiDel('/api/alarms/' + entry.data.id);
      await fetchAlarms();
    } else if (entry.action === 'delete_alarm') {
      const payload = { ...entry.data };
      delete payload.id;
      delete payload.created_at;
      await apiPost('/api/alarms', payload);
      await fetchAlarms();
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
      <button class="btn btn-ghost btn-sm" style="font-size:var(--fs-xs);padding:2px 6px;text-align:left" data-action="loadFilterPreset" data-arg="${p.id}">${escHtml(p.name)}</button>
      <button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:10px" data-action="deleteFilterPreset" data-arg="${p.id}">×</button>
    </div>
  `).join('');
  _bindActions(listEl);
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
let _sidebarResizeSetup = false;
function setupSidebarResize() {
  if (_sidebarResizeSetup) return;
  _sidebarResizeSetup = true;
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
  { key: 'observer',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, decision_log: true, view_free_busy: true } },
  { key: 'read',              display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, decision_log: true, view_free_busy: true } },
  { key: 'reporter',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, decision_log: true, comment: true, manage_alarms: true, view_free_busy: true } },
  { key: 'readwrite',         display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, decision_log: true, comment: true, manage_alarms: true, view_free_busy: true, import_export: true } },
  { key: 'teammember',        display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, delete_events: true, decision_log: true, comment: true, manage_alarms: true, view_free_busy: true, import_export: true } },
  { key: 'teamlead',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'deputy_teamlead',   display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'oplead',            display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'deputy_oplead',     display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'staffofficer',      display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, confidential_read: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'staff_assistant',   display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'staffofficer_full', display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, confidential_read: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true, manage_integrations: true } },
];

// Merge saved role configs with built-in defaults so capabilities work even
// when the admin has never opened the Role Editor (roles.json is empty).
function mergeRoleConfigs(saved) {
  const builtinKeys = DEFAULT_ROLE_CONFIGS.map(d => d.key);
  const merged = DEFAULT_ROLE_CONFIGS.map(def => {
    const s = (saved || []).find(c => c.key === def.key);
    return s ? { ...def, ...s } : { ...def };
  });
  for (const c of (saved || [])) {
    if (!builtinKeys.includes(c.key) && c.key !== 'admin') merged.push(c);
  }
  return merged;
}

// Ordered list of all capabilities shown in role editor
const ALL_CAPABILITIES = [
  'see_groups', 'see_users', 'view_events', 'create_events', 'edit_own', 'edit_all', 'delete_events',
  'manage_layers', 'manage_groups', 'manage_users', 'approve_users', 'manage_templates', 'lock_slots', 'view_audit', 'exercise',
  'report', 'auto_report',
  'decision_log', 'decision_log_readwrite', 'confidential_read', 'see_location', 'critical_line_analysis',
  'manage_rooms', 'view_free_busy', 'manage_integrations', 'import_export', 'manage_alarms', 'comment',
  'manage_notes', 'manage_stars'
];

async function openRoleEditor() {
  let configs = [];
  try {
    const data = await apiGet('/api/roles');
    configs = data || [];
  } catch { /* use defaults */ }

  const merged = mergeRoleConfigs(configs);
  state.roleConfigs = merged;
  state._roleEditorCustomCounter = 0;

  _renderRoleEditorTable(merged);
  openModal('roleEditorModal');
}

function _roleEditorInputStyle() {
  return 'width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 7px;font-size:var(--fs-sm)';
}

const _ROLE_CAP_LABELS = {
  see_groups:'Groups', see_users:'Users',
  view_events:'View', create_events:'Create', edit_own:'Edit Own', edit_all:'Edit All',
  delete_events:'Delete', manage_layers:'Layers', manage_groups:'Mgr Groups',
  manage_users:'Mgr Users', approve_users:'Approve', manage_templates:'Tmpls', lock_slots:'Lock', view_audit:'Audit', exercise:'Exercise',
  report:'Report', auto_report:'Auto Rpt',
  decision_log:'Dec.Log', decision_log_readwrite:'Dec.Log RW', confidential_read:'Confid.', see_location:'See Loc.', critical_line_analysis:'Crit.Line',
  manage_rooms:'Rooms', view_free_busy:'Free/Busy', manage_integrations:'Integr.', import_export:'Imp/Exp', manage_alarms:'Alarms', comment:'Comment',
  manage_notes:'Notes', manage_stars:'Stars'
};

const _ROLE_CAP_DESCRIPTIONS = {
  see_groups:       'View groups/units and their members',
  see_users:        'View the list of registered users',
  view_events:      'View timeline events and their details',
  create_events:    'Create new events on the timeline',
  edit_own:         'Edit events that you created',
  edit_all:         'Edit any event, regardless of creator',
  delete_events:    'Delete events from the timeline',
  manage_layers:    'Create, edit, and delete timeline layers',
  manage_groups:    'Create and manage groups/units',
  manage_users:     'Add, edit roles, and remove users',
  approve_users:    'Approve or vet new user registrations',
  manage_templates: 'Create and manage event templates',
  lock_slots:       'Lock time slots to prevent event creation',
  view_audit:       'View the audit log of all system actions',
  exercise:         'Configure exercise settings (epoch, ENDEX, labels)',
  report:           'Generate and export reports',
  auto_report:      'Create automated/scheduled reports',
  decision_log:     'View the decision log',
  decision_log_readwrite: 'Create, edit, and review decision log entries',
  confidential_read:      'View confidential/classified events and data',
  see_location:     'View user locations on the map and in profiles',
  critical_line_analysis: 'Access critical path/line analysis tools',
  manage_rooms:     'Create and manage bookable rooms and resources',
  view_free_busy:   'View availability/free-busy status of users and rooms',
  manage_integrations: 'Configure connectors, webhooks, and external integrations',
  import_export:    'Import and export events (CSV, ICS, STIX)',
  manage_alarms:    'Create and manage alarms for events',
  comment:          'Add comments and notes to events',
  manage_notes:     'Add and manage notes on resources (users, groups)',
  manage_stars:     'Add and manage star ratings on resources'
};

function _renderRoleEditorTable(roles) {
  const tableEl = document.getElementById('roleEditorTable');
  if (!tableEl) return;
  const _ROLE_LANGS = [
    {code:'en',flag:'🇬🇧'},{code:'sv',flag:'🇸🇪'},{code:'fr',flag:'🇫🇷'},{code:'fi',flag:'🇫🇮'},
    {code:'da',flag:'🇩🇰'},{code:'nb',flag:'🇳🇴'},{code:'et',flag:'🇪🇪'},{code:'lv',flag:'🇱🇻'},
    {code:'lt',flag:'🇱🇹'},{code:'it',flag:'🇮🇹'},{code:'es',flag:'🇪🇸'},{code:'pt',flag:'🇵🇹'},
    {code:'pl',flag:'🇵🇱'},{code:'uk',flag:'🇺🇦'}
  ];
  const builtinKeys = DEFAULT_ROLE_CONFIGS.map(d => d.key).concat(['admin']);
  tableEl.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)" id="roleEditorGrid">
      <thead>
        <tr style="background:var(--bg2)">
          <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:100px;white-space:nowrap;position:sticky;left:0;background:var(--bg2);z-index:1">Key</th>
          ${_ROLE_LANGS.map(l => `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:100px">${l.flag} ${l.code.toUpperCase()}</th>`).join('')}
          ${ALL_CAPABILITIES.map(cap =>
            `<th class="role-cap-header" data-cap="${cap}" style="padding:4px 3px;border-bottom:2px solid var(--border);font-size:10px;text-align:center;min-width:48px;cursor:pointer;user-select:none;vertical-align:bottom" title="${escHtml(_ROLE_CAP_DESCRIPTIONS[cap]||cap)}">
              <div>${_ROLE_CAP_LABELS[cap]||cap}</div>
              <div style="font-size:9px;color:var(--text-dim);cursor:help" title="${escHtml(_ROLE_CAP_DESCRIPTIONS[cap]||cap)}">ⓘ</div>
            </th>`
          ).join('')}
          <th style="padding:6px 4px;border-bottom:2px solid var(--border);min-width:36px"></th>
        </tr>
      </thead>
      <tbody id="roleEditorTbody">
        ${roles.map(role => _renderRoleRow(role, builtinKeys.includes(role.key))).join('')}
        <tr style="opacity:0.4">
          <td style="padding:8px 10px;font-family:monospace;font-size:var(--fs-sm);color:var(--text-dim);position:sticky;left:0;background:var(--bg2)">admin</td>
          <td style="padding:8px 10px;font-size:var(--fs-sm)">${t('role_admin')||'Admin'} 🔒</td>
          ${_ROLE_LANGS.slice(1).map(() => '<td></td>').join('')}
          ${ALL_CAPABILITIES.map(() => `<td style="text-align:center;padding:4px"><input type="checkbox" checked disabled></td>`).join('')}
          <td></td>
        </tr>
      </tbody>
    </table>
    </div>
  `;
  // Bind column header click to toggle all checkboxes in that column
  tableEl.querySelectorAll('.role-cap-header').forEach(th => {
    th.addEventListener('click', () => {
      const cap = th.dataset.cap;
      const cbs = tableEl.querySelectorAll(`.role-cap-cb[data-cap="${cap}"]`);
      // If all checked, uncheck all; otherwise check all
      const allChecked = Array.from(cbs).every(cb => cb.checked);
      cbs.forEach(cb => { cb.checked = !allChecked; });
    });
  });
  const body = document.getElementById('roleEditorBody');
  if (body) _bindActions(body);
}

// Proper translated role name placeholders
const _ROLE_PLACEHOLDERS = {
  observer:          { en:'Observer', sv:'Observatör', fr:'Observateur', fi:'Tarkkailija', da:'Observatør', nb:'Observatør', et:'Vaatleja', lv:'Novērotājs', lt:'Stebėtojas', it:'Osservatore', es:'Observador', pt:'Observador', pl:'Obserwator', uk:'Спостерігач' },
  read:              { en:'Read', sv:'Läs', fr:'Lecture', fi:'Luku', da:'Læs', nb:'Les', et:'Lugemine', lv:'Lasīt', lt:'Skaityti', it:'Lettura', es:'Lectura', pt:'Leitura', pl:'Odczyt', uk:'Читання' },
  reporter:          { en:'Reporter', sv:'Rapportör', fr:'Rapporteur', fi:'Raportoija', da:'Rapportør', nb:'Rapportør', et:'Reporter', lv:'Ziņotājs', lt:'Pranešėjas', it:'Reporter', es:'Reportero', pt:'Repórter', pl:'Reporter', uk:'Репортер' },
  readwrite:         { en:'Read/Write', sv:'Läs/Skriv', fr:'Lecture/Écriture', fi:'Luku/Kirjoitus', da:'Læs/Skriv', nb:'Les/Skriv', et:'Lugemine/Kirjutamine', lv:'Lasīt/Rakstīt', lt:'Skaityti/Rašyti', it:'Lettura/Scrittura', es:'Lectura/Escritura', pt:'Leitura/Escrita', pl:'Odczyt/Zapis', uk:'Читання/Запис' },
  teammember:        { en:'Team Member', sv:'Teammedlem', fr:'Membre d\'équipe', fi:'Tiimin jäsen', da:'Teammedlem', nb:'Teammedlem', et:'Meeskonnaliige', lv:'Komandas loceklis', lt:'Komandos narys', it:'Membro del team', es:'Miembro del equipo', pt:'Membro da equipe', pl:'Członek zespołu', uk:'Член команди' },
  teamlead:          { en:'Team Lead', sv:'Gruppledare', fr:'Chef d\'équipe', fi:'Tiiminvetäjä', da:'Holdleder', nb:'Lagleder', et:'Meeskonnajuht', lv:'Komandas vadītājs', lt:'Komandos vadovas', it:'Capo squadra', es:'Líder de equipo', pt:'Líder de equipe', pl:'Lider zespołu', uk:'Лідер команди' },
  deputy_teamlead:   { en:'Deputy Team Lead', sv:'Vice gruppledare', fr:'Chef d\'équipe adjoint', fi:'Varatiiminvetäjä', da:'Stedfortræder holdleder', nb:'Viselagleder', et:'Asemeeskonnajuht', lv:'Komandas vad. vietnieks', lt:'Komandos vadovo pav.', it:'Vice capo squadra', es:'Sublíder de equipo', pt:'Vice-líder de equipe', pl:'Zastępca lidera', uk:'Заступник лідера' },
  oplead:            { en:'Ops Lead', sv:'Insatsledare', fr:'Chef des opérations', fi:'Operaatiojohtaja', da:'Operationsleder', nb:'Operasjonsleder', et:'Operatsioonijuht', lv:'Operāciju vadītājs', lt:'Operacijų vadovas', it:'Capo operazioni', es:'Líder de operaciones', pt:'Líder de operações', pl:'Lider operacyjny', uk:'Керівник операцій' },
  deputy_oplead:     { en:'Deputy Ops Lead', sv:'Vice insatsledare', fr:'Adj. chef des opérations', fi:'Varaoperaatiojohtaja', da:'Stedfortræder operationsleder', nb:'Viseoperasjonsleder', et:'Aseoperatsioonijuht', lv:'Operāc. vad. vietnieks', lt:'Operacijų vad. pav.', it:'Vice capo operazioni', es:'Sublíder de operaciones', pt:'Vice-líder de operações', pl:'Zastępca lidera oper.', uk:'Заступник кер. операцій' },
  staffofficer:      { en:'Staff Officer', sv:'Stabsofficer', fr:'Officier d\'état-major', fi:'Esikuntaupseeri', da:'Stabsofficer', nb:'Stabsoffiser', et:'Staabiohvitser', lv:'Štāba virsnieks', lt:'Štabo karininkas', it:'Ufficiale di stato maggiore', es:'Oficial de estado mayor', pt:'Oficial de estado-maior', pl:'Oficer sztabowy', uk:'Штабний офіцер' },
  staff_assistant:   { en:'Staff Assistant', sv:'Stabsassistent', fr:'Assistant d\'état-major', fi:'Esikunta-avustaja', da:'Stabsassistent', nb:'Stabsassistent', et:'Staabiassistent', lv:'Štāba palīgs', lt:'Štabo asistentas', it:'Assistente di stato maggiore', es:'Asistente de estado mayor', pt:'Assistente de estado-maior', pl:'Asystent sztabowy', uk:'Штабний помічник' },
  staffofficer_full: { en:'Staff Officer Full', sv:'Stabsofficer Full', fr:'Officier d\'état-major complet', fi:'Esikuntaupseeri täysi', da:'Stabsofficer fuld', nb:'Stabsoffiser full', et:'Staabiohvitser täis', lv:'Štāba virsnieks pilns', lt:'Štabo karininkas pilnas', it:'Ufficiale di SM completo', es:'Oficial de EM completo', pt:'Oficial de EM completo', pl:'Oficer sztabowy pełny', uk:'Штабний офіцер повний' },
};

function _renderRoleRow(role, isBuiltin) {
  const dn = role.display_names || {};
  const key = role.key;
  const s = _roleEditorInputStyle();
  const ph = _ROLE_PLACEHOLDERS[key] || {};
  const _RL = ['en','sv','fr','fi','da','nb','et','lv','lt','it','es','pt','pl','uk'];
  return `
    <tr data-role-key="${escHtml(key)}" data-custom="${isBuiltin ? 'false' : 'true'}">
      <td style="padding:6px 10px;position:sticky;left:0;background:var(--bg2);z-index:1">
        ${isBuiltin
          ? `<span style="font-family:monospace;color:var(--text-dim);font-size:var(--fs-sm)">${escHtml(key)}</span>`
          : `<input type="text" class="role-key-input" value="${escHtml(key)}" placeholder="e.g. analyst" style="${s};font-family:monospace">`}
      </td>
      ${_RL.map(lang => {
        const val = lang === 'en' ? (dn.en || role.display_name || '') : (dn[lang] || '');
        const placeholder = ph[lang] || key;
        return `<td style="padding:5px 6px"><input type="text" class="role-name-${lang}" data-key="${escHtml(key)}" value="${escHtml(val)}" placeholder="${escHtml(placeholder)}" style="${s}"></td>`;
      }).join('')}
      ${ALL_CAPABILITIES.map(cap => {
        const checked = role.capabilities && role.capabilities[cap];
        return `<td style="text-align:center;padding:4px"><input type="checkbox" class="role-cap-cb" data-role="${escHtml(key)}" data-cap="${escHtml(cap)}" ${checked ? 'checked' : ''} title="${escHtml(_ROLE_CAP_DESCRIPTIONS[cap]||cap)}"></td>`;
      }).join('')}
      <td style="text-align:center;padding:4px">
        ${isBuiltin ? '' : `<button class="btn btn-danger btn-xs" data-action="removeRoleRow" data-arg-el title="Remove" style="padding:2px 7px;font-size:12px">✕</button>`}
      </td>
    </tr>`;
}

function addNewRoleRow() {
  const tbody = document.getElementById('roleEditorTbody');
  if (!tbody) return;
  state._roleEditorCustomCounter = (state._roleEditorCustomCounter || 0) + 1;
  const key = `custom_role_${state._roleEditorCustomCounter}`;
  // All new custom roles start with see_groups and see_users enabled by default
  const role = { key, display_name: '', display_names: {}, capabilities: { see_groups: true, see_users: true, view_events: true, decision_log: true, comment: true, view_free_busy: true } };
  const adminRow = tbody.querySelector('tr[style*="opacity"]');
  const tmp = document.createElement('tbody');
  tmp.innerHTML = _renderRoleRow(role, false);
  const newRow = tmp.firstElementChild;
  _bindActions(newRow);
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
    const _RL = ['en','sv','fr','fi','da','nb','et','lv','lt','it','es','pt','pl','uk'];
    const display_names = {};
    _RL.forEach(lang => {
      const el = row.querySelector('.role-name-' + lang);
      const val = el ? el.value.trim() : '';
      if (val) display_names[lang] = val;
    });
    const en = display_names.en || '';
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
      <button class="btn btn-danger btn-sm" data-action="removeDependency" data-arg="${id}">✕</button>
    </div>`;
  }).join('');
  _bindActions(el);
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
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:var(--radius);background:var(--bg3);margin-bottom:4px;cursor:pointer" data-action="addDependency" data-arg="${ev.id}">
      <span>${escHtml(ev.title)}</span>
      <span style="font-size:var(--fs-xs);color:var(--text-dim)">${fmtDateTime(new Date(ev.start_time))}</span>
    </div>
  `).join('');
  _bindActions(el);
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

// ── Gradual Backup Settings (admin) ───────────────────────────────────────────

async function openGradualBackupModal() {
  openModal('gradualBackupModal');
  await loadGradualBackupData();
}

async function loadGradualBackupData() {
  const data = await apiGet('/api/admin/gradual-backup').catch(() => null);
  if (!data) return;
  const cfg = data.settings || {};
  const snaps = data.snapshots || [];

  const en = document.getElementById('gbEnabled');
  const interval = document.getElementById('gbInterval');
  const maxSnaps = document.getElementById('gbMaxSnapshots');
  if (en) en.checked = cfg.enabled !== false;
  if (interval) interval.value = cfg.interval_minutes || 15;
  if (maxSnaps) maxSnaps.value = cfg.max_snapshots || 48;
  renderGradualBackupSnapshots(snaps);
}

function renderGradualBackupSnapshots(snaps) {
  const el = document.getElementById('gbSnapshotsList');
  if (!el) return;
  if (!snaps || !snaps.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs)">No snapshots yet. They will be created automatically once the feature is enabled.</p>';
    return;
  }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
    <thead><tr style="background:var(--bg3)">
      <th style="padding:4px 8px;text-align:left">Snapshot</th>
      <th style="padding:4px 8px;text-align:right">Size</th>
      <th style="padding:4px 8px;text-align:right">Actions</th>
    </tr></thead><tbody>
    ${snaps.map(s => `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 8px;font-family:monospace">${escHtml(s.filename)}<br>
        <span style="color:var(--text-dim)">${new Date(s.created_at).toLocaleString()}</span></td>
      <td style="padding:4px 8px;text-align:right;white-space:nowrap">${fmtFileSize(s.size_bytes||0)}</td>
      <td style="padding:4px 8px;text-align:right;white-space:nowrap">
        <button class="btn btn-secondary btn-sm" data-action="downloadGradualSnapshot" data-arg="${escHtml(s.filename)}" title="Download this snapshot as a ZIP file">⬇</button>
        <button class="btn btn-secondary btn-sm" data-action="restoreGradualSnapshot" data-arg="${escHtml(s.filename)}" title="Restore data from this snapshot" style="color:var(--warning,#f39c12)">↩ Restore</button>
        <button class="btn btn-secondary btn-sm" data-action="deleteGradualSnapshot" data-arg="${escHtml(s.filename)}" title="Delete this snapshot" style="color:var(--danger)">🗑</button>
      </td>
    </tr>`).join('')}
    </tbody></table>`;
  _bindActions(el);
}

async function saveGradualBackupSettings() {
  const enabled = document.getElementById('gbEnabled')?.checked ?? true;
  const interval = parseInt(document.getElementById('gbInterval')?.value||'15', 10);
  const max = parseInt(document.getElementById('gbMaxSnapshots')?.value||'48', 10);
  const res = await api('PUT', '/api/admin/gradual-backup', {
    enabled, interval_minutes: interval, max_snapshots: max
  });
  if (res.ok) {
    showNotification('success', 'Gradual backup settings saved');
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Failed to save settings');
  }
}

async function createGradualSnapshotNow() {
  const btn = document.getElementById('btnSnapshotNow');
  if (btn) btn.disabled = true;
  const res = await api('POST', '/api/admin/gradual-backup/snapshot', {});
  if (btn) btn.disabled = false;
  if (res.ok) {
    const d = await res.json().catch(()=>({}));
    showNotification('success', `Snapshot created: ${d.filename||''}`);
    renderGradualBackupSnapshots(d.snapshots || []);
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Failed to create snapshot');
  }
}

function downloadGradualSnapshot(filename) {
  window.location.href = `/api/admin/gradual-backup/download/${encodeURIComponent(filename)}`;
}

async function restoreGradualSnapshot(filename) {
  if (!confirm(`Restore from snapshot "${filename}"?\n\nThis will overwrite current data. A server restart is recommended after restore.`)) return;
  const res = await api('POST', `/api/admin/gradual-backup/restore/${encodeURIComponent(filename)}`, {});
  if (res.ok) {
    const d = await res.json().catch(()=>({}));
    showNotification('success', d.message || 'Restored successfully');
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Restore failed');
  }
}

async function deleteGradualSnapshot(filename) {
  if (!confirm(`Delete snapshot "${filename}"? This cannot be undone.`)) return;
  const res = await apiDel(`/api/admin/gradual-backup/snapshots/${encodeURIComponent(filename)}`);
  if (res.ok) {
    showNotification('success', 'Snapshot deleted');
    await loadGradualBackupData();
  } else {
    const e = await res.json().catch(()=>({}));
    showError(e.error || 'Delete failed');
  }
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

// ── Bulk Event Actions (Tools panel, admin) ────────────────────────────────

function openBulkActionsModal() {
  // Populate event type dropdown
  const sel = document.getElementById('baNewType');
  if (sel) {
    sel.innerHTML = (state.eventTypes || []).map(et =>
      `<option value="${escHtml(et.key)}">${escHtml(et.label || et.key)}</option>`
    ).join('');
  }
  // Reset result
  const res = document.getElementById('baResult');
  if (res) { res.style.display = 'none'; res.textContent = ''; }
  const delConf = document.getElementById('baDeleteConfirm');
  if (delConf) delConf.value = '';
  updateBulkActionUI();
  openModal('bulkActionsModal');
}

function switchBulkTab(tab, btn) {
  document.querySelectorAll('.ba-pane').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.ba-tab-btn').forEach(b => b.classList.remove('active'));
  const pane = document.getElementById('baPane_' + tab);
  if (pane) pane.style.display = '';
  if (btn) btn.classList.add('active');
}

function updateBulkActionUI() {
  const f = document.getElementById('baFilter')?.value || 'all';
  const hints = {
    all:    'Applies to ALL events (use time range to narrow down)',
    type:   'Event type key, e.g. "event", "decision", "activity"',
    user:   'Username or display name (autocomplete available)',
    group:  'Group name or numeric ID',
    role:   'Role: observer, read, reporter, teammember, teamlead, oplead, admin',
    status: 'Current status: planned, active, completed, cancelled…',
    layer:  'Layer numeric ID (see Layers tab)',
  };
  const hintEl = document.getElementById('baFilterHint');
  if (hintEl) hintEl.textContent = hints[f] || '';
  const vg = document.getElementById('baValueGroup');
  if (vg) vg.style.display = f === 'all' ? 'none' : '';
}

function updateBulkUserAutocomplete() {
  const f = document.getElementById('baFilter')?.value || '';
  if (f !== 'user') { _closeBulkDrop(); return; }
  const q = (document.getElementById('baValue')?.value || '').toLowerCase();
  if (!q) { _closeBulkDrop(); return; }
  const users = (state.users || []).filter(u =>
    (u.username && u.username.toLowerCase().includes(q)) ||
    (u.display_name && u.display_name.toLowerCase().includes(q))
  ).slice(0, 8);
  const drop = document.getElementById('baMentionDrop');
  if (!drop) return;
  if (!users.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = users.map(u =>
    `<div class="mention-item" data-action="_selectBulkUser" data-arg="${escHtml(u.username)}" style="padding:6px 10px;cursor:pointer;font-size:var(--fs-sm)">${escHtml(u.display_name||u.username)} <span style="color:var(--text-dim);font-size:var(--fs-xs)">@${escHtml(u.username)}</span></div>`
  ).join('');
  _bindActions(drop);
  drop.style.display = '';
}

function _selectBulkUser(username) {
  const inp = document.getElementById('baValue');
  if (inp) inp.value = username;
  _closeBulkDrop();
}

function _closeBulkDrop() {
  const drop = document.getElementById('baMentionDrop');
  if (drop) drop.style.display = 'none';
}

function _getBulkFilterParams() {
  const filter = document.getElementById('baFilter')?.value || 'all';
  const value  = document.getElementById('baValue')?.value?.trim() || '';
  const from   = document.getElementById('baTimeFrom')?.value || '';
  const to     = document.getElementById('baTimeTo')?.value   || '';
  const payload = { filter, value };
  if (from) payload.time_from = new Date(from).toISOString();
  if (to)   payload.time_to   = new Date(to).toISOString();
  return payload;
}

function _showBulkResult(el, ok, text) {
  if (!el) return;
  el.style.display = '';
  el.style.color = ok ? 'var(--green)' : 'var(--danger)';
  el.style.background = ok ? 'rgba(39,174,96,.1)' : 'rgba(231,76,60,.1)';
  el.style.border = `1px solid ${ok ? 'rgba(39,174,96,.3)' : 'rgba(231,76,60,.3)'}`;
  el.textContent = text;
}

async function executeBulkStatus() {
  const params = _getBulkFilterParams();
  const status = document.getElementById('baNewStatus')?.value;
  if (!status) return;
  if (!confirm(`Set all matching events to status "${status}"?`)) return;
  const res = document.getElementById('baResult');
  try {
    const r = await api('POST', '/api/admin/bulk/status', { ...params, status });
    if (r.ok) {
      const d = await r.json();
      _showBulkResult(res, true, `✓ Updated ${d.updated} event(s) to status "${status}".`);
      await refreshAll();
    } else {
      const d = await r.json().catch(()=>({}));
      _showBulkResult(res, false, `✗ ${d.error||'Error'}`);
    }
  } catch(e) { _showBulkResult(res, false, '✗ ' + e.message); }
}

async function executeBulkType() {
  const params = _getBulkFilterParams();
  const eventType = document.getElementById('baNewType')?.value;
  if (!eventType) return;
  if (!confirm(`Change event type of all matching events to "${eventType}"?`)) return;
  const res = document.getElementById('baResult');
  try {
    const r = await api('POST', '/api/admin/bulk/type', { ...params, event_type: eventType });
    if (r.ok) {
      const d = await r.json();
      _showBulkResult(res, true, `✓ Changed type of ${d.updated} event(s) to "${eventType}".`);
      await refreshAll();
    } else {
      const d = await r.json().catch(()=>({}));
      _showBulkResult(res, false, `✗ ${d.error||'Error'}`);
    }
  } catch(e) { _showBulkResult(res, false, '✗ ' + e.message); }
}

async function executeBulkDelete() {
  const params = _getBulkFilterParams();
  const conf = document.getElementById('baDeleteConfirm')?.value;
  if (conf !== 'DELETE') { showError('Type DELETE to confirm deletion.'); return; }
  const res = document.getElementById('baResult');
  try {
    const r = await api('POST', '/api/admin/bulk/delete', { ...params, confirm: 'DELETE' });
    if (r.ok) {
      const d = await r.json();
      _showBulkResult(res, true, `✓ Deleted ${d.deleted} event(s).`);
      document.getElementById('baDeleteConfirm').value = '';
      await refreshAll();
    } else {
      const d = await r.json().catch(()=>({}));
      _showBulkResult(res, false, `✗ ${d.error||'Error'}`);
    }
  } catch(e) { _showBulkResult(res, false, '✗ ' + e.message); }
}

// ── Bulk Operations (legacy selection-based) ──────────────────────────────

function openBulkStatusDialog() {
  const count = (state.selectedEventIds || []).length;
  if (!count) return;
  const countEl = document.getElementById('bulkStatusCount');
  if (countEl) countEl.textContent = `${count} event${count !== 1 ? 's' : ''} selected`;
  openModal('bulkStatusModal');
}

async function confirmBulkStatus() {
  const newStatus = document.getElementById('bulkStatusSelect')?.value;
  if (!newStatus) return;
  const ids = state.selectedEventIds || [];
  if (!ids.length) { closeModal('bulkStatusModal'); return; }
  const selectedEvs = state.events.filter(e => ids.includes(e.id));
  try {
    await Promise.all(selectedEvs.map(ev => {
      pushUndo('update_event', { id: ev.id, old: { ...ev } });
      return api('PATCH', `/api/events/${ev.id}/status`, { status: newStatus });
    }));
    closeModal('bulkStatusModal');
    clearSelection();
    await refreshAll();
    showNotification('success', `Status changed to ${newStatus} for ${selectedEvs.length} event${selectedEvs.length !== 1 ? 's' : ''}`);
  } catch {
    showError('Failed to change status for some events.', 'Bulk Status');
  }
}

async function bulkDeleteSelected() {
  const ids = state.selectedEventIds || [];
  if (!ids.length) return;
  const selectedEvs = state.events.filter(e => ids.includes(e.id));
  if (!confirm(`Delete ${selectedEvs.length} selected event${selectedEvs.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  try {
    await Promise.all(selectedEvs.map(ev => apiDel(`/api/events/${ev.id}`)));
    clearSelection();
    await refreshAll();
    showNotification('success', `Deleted ${selectedEvs.length} event${selectedEvs.length !== 1 ? 's' : ''}`);
  } catch {
    showError('Failed to delete some events.', 'Bulk Delete');
  }
}

// ── Audit Log ─────────────────────────────────────────────────────────────
async function refreshAuditLog() {
  const container = document.getElementById('auditLog');
  if (!container) return;
  const search     = document.getElementById('auditSearch')?.value?.trim() || '';
  const action     = document.getElementById('auditFilterAction')?.value || '';
  const dateFrom   = document.getElementById('auditDateFrom')?.value || '';
  const dateTo     = document.getElementById('auditDateTo')?.value || '';
  let url = '/api/audit?limit=500';
  if (search)   url += `&search=${encodeURIComponent(search)}`;
  if (action)   url += `&action=${encodeURIComponent(action)}`;
  if (dateFrom) url += `&date_from=${encodeURIComponent(dateFrom)}`;
  if (dateTo)   url += `&date_to=${encodeURIComponent(dateTo)}`;
  container.innerHTML = `<em style="color:var(--text-dim)">Loading…</em>`;
  const entries = await apiGet(url);
  if (!entries || entries.length === 0) {
    container.innerHTML = `<em style="color:var(--text-dim)">${t('audit_empty')||'No entries found.'}</em>`;
    return;
  }
  const _auditActionLabels = {
    created: t('audit_created')||'Created', updated: t('audit_updated')||'Updated',
    deleted: t('audit_deleted')||'Deleted', status_changed: t('audit_status_changed')||'Status Changed',
    login: t('audit_login')||'Login', login_failed: t('audit_login_failed')||'Login Failed',
    login_blocked: t('audit_login_blocked')||'Login Blocked', reset: t('audit_reset')||'Reset',
    verified: t('audit_verified')||'Verified', rejected: t('audit_rejected')||'Rejected',
    blocked: t('audit_user_blocked')||'User Blocked', unblocked: t('audit_user_unblocked')||'User Unblocked',
    acknowledged: t('audit_acknowledged')||'Acknowledged',
  };
  container.innerHTML = `<div class="audit-list">${entries.map(e => `
    <div class="audit-item">
      <span class="audit-ts">${fmtDateTime(new Date(e.timestamp))}</span>
      <span class="audit-user">${escHtml(e.user_name)}</span>
      <span class="audit-action audit-action-${e.action}">${escHtml(_auditActionLabels[e.action] || e.action)}</span>
      <span class="audit-summary">${escHtml(e.summary)}</span>
    </div>`).join('')}
  </div>`;
}

function exportAuditLog(format) {
  format = format || 'csv';
  const search     = document.getElementById('auditSearch')?.value?.trim() || '';
  const action     = document.getElementById('auditFilterAction')?.value || '';
  const dateFrom   = document.getElementById('auditDateFrom')?.value || '';
  const dateTo     = document.getElementById('auditDateTo')?.value || '';
  let url = `/api/audit?limit=5000&format=${encodeURIComponent(format)}`;
  if (search)   url += `&search=${encodeURIComponent(search)}`;
  if (action)   url += `&action=${encodeURIComponent(action)}`;
  if (dateFrom) url += `&date_from=${encodeURIComponent(dateFrom)}`;
  if (dateTo)   url += `&date_to=${encodeURIComponent(dateTo)}`;
  const ext = format === 'docx' ? 'docx' : format;
  const a = document.createElement('a');
  a.href = url;
  const _auditTs = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const _auditHost = window.location.hostname || 'localhost';
  a.download = `${_auditTs}-${_auditHost}-audit-log.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Push Notification Permission ──────────────────────────────────────────
async function requestPushPermission() {
  if (!('Notification' in window)) {
    showError('Browser notifications are not supported in this browser.', 'Push Notifications');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    showNotification('success', 'Browser notifications enabled');
    // Re-render settings to update status display
    if (state.sidebarTab === 'settings') renderSidebar();
  } else if (result === 'denied') {
    showError('Notifications blocked. Please allow them in your browser settings and reload.', 'Push Notifications');
  }
}

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

// ── Task-Time Matrix ──────────────────────────────────────────────────────────
function _renderTaskTimeMatrixTable(dateFrom, dateTo) {
  const el = document.getElementById('taskTimeMatrixContent');
  if (!el) return;
  const events = (state.events || []).filter(ev => ev.start_time && ev.title);
  if (!events.length) {
    el.innerHTML = `<p style="color:var(--text-dim)">${t('ttm_no_events')||'No events to display in the matrix.'}</p>`;
    return;
  }
  const sorted = events.slice().sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
  let minT = dateFrom ? new Date(dateFrom) : new Date(sorted[0].start_time);
  let maxT = dateTo ? new Date(dateTo + 'T23:59:59') : new Date(sorted[sorted.length-1].end_time || sorted[sorted.length-1].start_time);
  minT = new Date(minT.getFullYear(), minT.getMonth(), minT.getDate(), minT.getHours());
  maxT = new Date(maxT.getFullYear(), maxT.getMonth(), maxT.getDate(), maxT.getHours()+1);
  const hours = [];
  for (let tm = new Date(minT); tm < maxT; tm = new Date(tm.getTime() + 3600000)) {
    hours.push(new Date(tm));
    if (hours.length > 336) break; // max 2 weeks
  }
  if (hours.length === 0) { el.innerHTML = `<p style="color:var(--text-dim)">${t('ttm_no_range')||'No valid time range.'}</p>`; return; }
  // Build phase lookup for the matrix time range
  const phases = (state.phases || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
  const _phaseForHour = (hTime) => {
    for (const ph of phases) {
      const ps = new Date(ph.start_time).getTime();
      const pe = new Date(ph.end_time).getTime();
      if (hTime >= ps && hTime < pe) return ph;
    }
    return null;
  };
  let html = `<table class="ttm-table" style="border-collapse:collapse;font-size:var(--fs-sm,11px);width:100%"><thead>`;
  // Phase row
  if (phases.length > 0) {
    html += `<tr><th style="padding:2px 6px;position:sticky;left:0;background:var(--bg2);z-index:2;min-width:180px;text-align:left;font-size:9px;color:var(--text-dim)">${t('ttm_phase')||'Phase'}</th>`;
    let i = 0;
    while (i < hours.length) {
      const ph = _phaseForHour(hours[i].getTime());
      if (ph) {
        let span = 1;
        while (i + span < hours.length && _phaseForHour(hours[i + span].getTime())?.id === ph.id) span++;
        html += `<th colspan="${span}" style="padding:2px 4px;text-align:center;font-size:9px;font-weight:600;color:#fff;background:${escHtml(ph.color || 'var(--accent)')};border-left:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(ph.name)}</th>`;
        i += span;
      } else {
        html += `<th style="padding:2px;border-left:1px solid var(--border)"></th>`;
        i++;
      }
    }
    html += '</tr>';
  }
  // Time header row
  html += `<tr><th style="padding:4px 6px;position:sticky;left:0;background:var(--bg2);z-index:2;min-width:180px;text-align:left">${t('ttm_task')||'Task'}</th>`;
  hours.forEach(h => {
    const dayChanged = h.getHours() === 0;
    const lbl = dayChanged ? h.toLocaleDateString(undefined,{month:'short',day:'numeric'}) + ' 00' : String(h.getHours()).padStart(2,'0');
    const ph = _phaseForHour(h.getTime());
    const phBg = ph ? `background:color-mix(in srgb, ${ph.color} 15%, var(--bg2));` : '';
    html += `<th style="padding:3px 2px;min-width:28px;text-align:center;border-left:${dayChanged?'2':'1'}px solid var(--border);font-weight:${dayChanged?700:400};color:${dayChanged?'var(--accent)':'var(--text-dim)'};${phBg}">${lbl}</th>`;
  });
  html += '</tr></thead><tbody>';
  const etMap = {};
  (state.eventTypes||[]).forEach(et => etMap[et.id] = et);
  sorted.forEach(ev => {
    const evStart = new Date(ev.start_time).getTime();
    const evEnd = new Date(ev.end_time || ev.start_time).getTime();
    if (evEnd < minT.getTime() || evStart > maxT.getTime()) return; // outside range
    const et = etMap[ev.event_type_id];
    const color = et?.color || ev.color || 'var(--accent)';
    html += `<tr><td style="padding:4px 6px;position:sticky;left:0;background:var(--bg2);z-index:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px" title="${escHtml(ev.title)}">${escHtml(ev.title)}</td>`;
    hours.forEach(h => {
      const hStart = h.getTime();
      const hEnd = hStart + 3600000;
      const active = evStart < hEnd && evEnd > hStart;
      html += `<td style="padding:0;border-left:1px solid var(--border);${active ? 'background:'+color+';opacity:0.8' : ''}">&nbsp;</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;

  // ── Current time line in task-time matrix ──
  const p = state.preferences || {};
  if (p.red_line_enabled !== false) {
    const now = typeof getNow === 'function' ? getNow() : new Date();
    const nowMs = now.getTime();
    if (nowMs >= minT.getTime() && nowMs <= maxT.getTime()) {
      const table = el.querySelector('.ttm-table');
      if (table) {
        const headerCells = table.querySelectorAll('thead th');
        // Find which column the current time falls into
        for (let i = 0; i < hours.length; i++) {
          const hStart = hours[i].getTime();
          const hEnd = hStart + 3600000;
          if (nowMs >= hStart && nowMs < hEnd) {
            const fraction = (nowMs - hStart) / 3600000;
            const colIdx = i + 1; // +1 for the task name column
            const lineColor = p.red_line_color || '#E74C3C';
            const lineWidth = p.red_line_width || 2;
            const lineStyle = p.red_line_style || 'solid';
            // Add a marker line via CSS overlay
            table.style.position = 'relative';
            const marker = document.createElement('div');
            marker.className = 'ttm-now-line';
            marker.style.cssText = `position:absolute;top:0;bottom:0;width:${lineWidth}px;border-left:${lineWidth}px ${lineStyle} ${lineColor};z-index:5;pointer-events:none`;
            // Calculate left position based on column offset
            const thEl = headerCells[colIdx];
            if (thEl) {
              const tableRect = table.getBoundingClientRect();
              const thRect = thEl.getBoundingClientRect();
              const leftPx = (thRect.left - tableRect.left) + (thRect.width * fraction);
              marker.style.left = leftPx + 'px';
              // Now label
              const label = document.createElement('span');
              label.textContent = '▶ ' + (t('ttm_now') || 'Now');
              label.style.cssText = `position:absolute;top:-2px;left:2px;font-size:9px;color:${lineColor};background:var(--bg2);padding:0 3px;white-space:nowrap;z-index:6`;
              marker.appendChild(label);
              table.parentElement.style.position = 'relative';
              table.parentElement.appendChild(marker);
              // Recalculate on scroll
              const wrapper = el;
              const recalc = () => {
                const tr2 = table.getBoundingClientRect();
                const th2 = thEl.getBoundingClientRect();
                marker.style.left = ((th2.left - tr2.left) + (th2.width * fraction)) + 'px';
                marker.style.top = '0';
                marker.style.height = table.offsetHeight + 'px';
              };
              wrapper.addEventListener('scroll', recalc);
              setTimeout(recalc, 50);
            }
            break;
          }
        }
      }
    }
  }
}

function openTaskTimeMatrix() {
  const events = (state.events || []).filter(ev => ev.start_time && ev.title);
  if (events.length) {
    const sorted = events.slice().sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
    const fromEl = document.getElementById('ttmDateFrom');
    const toEl = document.getElementById('ttmDateTo');
    if (fromEl && !fromEl.value) fromEl.value = new Date(sorted[0].start_time).toISOString().slice(0,10);
    if (toEl && !toEl.value) toEl.value = new Date(sorted[sorted.length-1].end_time || sorted[sorted.length-1].start_time).toISOString().slice(0,10);
  }
  _renderTaskTimeMatrixTable(document.getElementById('ttmDateFrom')?.value, document.getElementById('ttmDateTo')?.value);
  openModal('taskTimeMatrixModal');
  // Bind date apply
  document.getElementById('ttmApplyDates')?.addEventListener('click', () => {
    _renderTaskTimeMatrixTable(document.getElementById('ttmDateFrom')?.value, document.getElementById('ttmDateTo')?.value);
  });
  // Bind detach
  document.getElementById('ttmDetach')?.addEventListener('click', _detachTaskTimeMatrix);
  // Bind print
  document.getElementById('ttmPrint')?.addEventListener('click', _printTaskTimeMatrix);
}

function _detachTaskTimeMatrix() {
  const content = document.getElementById('taskTimeMatrixContent')?.innerHTML || '';
  const theme = document.body.className || 'theme-dark';
  const w = window.open('', 'ttm-' + Date.now(), 'width=1400,height=700,menubar=no,toolbar=no');
  if (!w) return;
  const css = document.querySelector('link[href*="style.css"]');
  const cssHref = css ? css.href : '/static/style.css';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${t('btn_task_time_matrix')||'Task-Time Matrix'}</title>
<link rel="stylesheet" href="${cssHref}">
<style>
body{padding:20px;overflow:auto}
.ttm-table{border-collapse:collapse;font-size:11px;width:100%}
.ttm-table th,.ttm-table td{border:1px solid var(--border)}
@media print{body{background:#fff;color:#000} .ttm-table th{background:#eee!important;color:#000!important} .no-print{display:none!important}}
</style></head><body class="${theme}">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px" class="no-print">
  <h2>${t('btn_task_time_matrix')||'Task-Time Matrix'}</h2>
  <button class="btn btn-primary btn-sm" id="ttmPrintBtn">🖨 ${t('btn_print')||'Print'}</button>
</div>
${content}
</body></html>`);
  w.document.close();
  const printBtn = w.document.getElementById('ttmPrintBtn');
  if (printBtn) printBtn.addEventListener('click', () => w.print());
}

function _printTaskTimeMatrix() {
  _detachTaskTimeMatrix();
}

// ── Personal Notifications ─────────────────────────────────────────────────
let _notifUnreadCount = 0;
let _notifPanelOpen = false;
let _notifCache = [];

function _playNotifBellSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    // Two-tone bell chime
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1100;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.31);
    }
    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

function _updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (_notifUnreadCount > 0) {
    badge.textContent = _notifUnreadCount > 99 ? '99+' : _notifUnreadCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

async function _loadNotifications() {
  try {
    const data = await apiGet('/api/personal-notifications');
    if (data) {
      _notifCache = data;
      _notifUnreadCount = data.filter(n => !n.read).length;
      _updateNotifBadge();
    }
  } catch {}
}

function _formatNotifTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _renderNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;

  const typeIcons = { event: '📋', prc: '✅', alarm: '⏰', timer: '⏱', system: '🔧' };

  let html = '<div class="notif-panel-header"><span>Notifications</span></div>';
  if (_notifCache.length === 0) {
    html += '<div class="notif-empty">No notifications</div>';
  } else {
    for (const n of _notifCache) {
      const icon = typeIcons[n.type] || '🔔';
      const unreadClass = n.read ? '' : ' unread';
      const ackBtn = n.acknowledged ? '' :
        `<div class="notif-item-actions"><button class="notif-ack-btn" data-action="_ackNotification" data-arg="${n.id}" data-stop-prop>Acknowledge</button></div>`;
      html += `<div class="notif-item${unreadClass}" data-notif-id="${n.id}">
        <div class="notif-item-title">${icon} ${escHtml(n.title)}</div>
        <div class="notif-item-body">${escHtml(n.body)}</div>
        <div class="notif-item-time">${_formatNotifTime(n.created_at)}</div>
        ${ackBtn}
      </div>`;
    }
  }
  panel.innerHTML = html;
  _bindActions(panel);
}

function _toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  _notifPanelOpen = !_notifPanelOpen;
  if (_notifPanelOpen) {
    _loadNotifications().then(() => _renderNotifPanel());
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

async function _ackNotification(id) {
  try {
    await apiPost(`/api/personal-notifications/${id}/ack`, {});
    // Update cache
    for (const n of _notifCache) {
      if (n.id === id) {
        n.acknowledged = true;
        n.read = true;
        break;
      }
    }
    _notifUnreadCount = _notifCache.filter(n => !n.read).length;
    _updateNotifBadge();
    _renderNotifPanel();
  } catch {}
}

// Init: wire up button click and load initial data
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnNotifications');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleNotifPanel();
    });
  }
  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (_notifPanelOpen) {
      const panel = document.getElementById('notifPanel');
      const btn = document.getElementById('btnNotifications');
      if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        _notifPanelOpen = false;
        panel.style.display = 'none';
      }
    }
  });
  // Load notifications on page load (after a short delay to let auth settle)
  setTimeout(() => _loadNotifications(), 1500);
});

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
    exercise_documents: t('ref_category_exercise_documents') || 'Exercise Documents',
    other: t('ref_category_other') || 'Other'
  };
  const catColors = { handbook:'#3498DB', sop:'#E67E22', policy:'#9B59B6', map:'#2ECC71', reference:'#1ABC9C', checklist:'#27AE60', faq:'#F39C12', objectives:'#E74C3C', exercise_documents:'#8E44AD', other:'#95A5A6' };
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
        <span>${t('references_title') || 'References'}</span>
        <span style="display:flex;gap:4px;align-items:center">
          ${canEdit ? '<button class="btn btn-primary btn-sm" id="btnAddReference">+ Add</button>' : ''}
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" id="btnRefIndex" title="${t('ref_index')||'Document Index'}">Index</button>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" id="btnDetachReferences" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        </span>
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
    </div>`;
  _loadAndRenderReferences();
  // Check if GitHub is enabled for refs
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
}

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
    const catColors = { handbook:'#3498DB', sop:'#E67E22', policy:'#9B59B6', map:'#2ECC71', reference:'#1ABC9C', checklist:'#27AE60', faq:'#F39C12', objectives:'#E74C3C', other:'#95A5A6' };
    const catCounts = {};
    (state.references || []).forEach(r => {
      const c = r.category || 'other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const total = (state.references || []).length;
    const catKeys = ['handbook','sop','policy','map','reference','checklist','faq','objectives','other'];
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
  const ct = (ref.content_type || ref.filename || '').toLowerCase();
  const isPDF = ct.includes('pdf') || (ref.original_name || '').toLowerCase().endsWith('.pdf');
  if (isPDF) {
    // Open PDF in a detached window with an embedded iframe for reliable rendering
    const pdfUrl = '/api/references/' + ref.id + '/download?inline=1';
    const w = window.open('', 'tidslinjal-ref-' + ref.id, 'width=900,height=700,resizable=yes,scrollbars=yes');
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(ref.title || 'PDF')}</title>
<style>*{margin:0;padding:0}body,html{width:100%;height:100%;overflow:hidden}iframe{border:none;width:100%;height:100%}</style>
</head><body><iframe src="${escHtml(pdfUrl)}"></iframe></body></html>`);
      w.document.close();
    }
  } else {
    window.open('/api/references/' + ref.id + '/download?inline=1', '_blank', 'width=900,height=700,resizable=yes,scrollbars=yes');
  }
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
            <option value="exercise_documents">${t('ref_category_exercise_documents') || 'Exercise Documents'}</option>
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
          <button class="btn btn-secondary" data-close-ref-modal>${t('btn_cancel') || 'Cancel'}</button>
          <button class="btn btn-primary" id="btnDoUploadRef">${t('btn_save') || 'Save'}</button>
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
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert('Failed: ' + (err.error || 'Unknown error')); return; }
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
      document.getElementById('referenceUploadModal').classList.remove('open');
      _loadAndRenderReferences();
    } catch (e) { alert('Error: ' + e.message); }
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
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert('Failed: ' + (err.error || 'Unknown error')); return; }
      document.getElementById('referenceUploadModal').classList.remove('open');
      _loadAndRenderReferences();
    } catch (e) { alert('Error: ' + e.message); }
  } else {
    // File upload (original behavior)
    const file = document.getElementById('refUpFile').files[0];
    if (!file) { alert('File is required'); return; }
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
      const res = await fetch('/api/references', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!res.ok) { let txt = ''; try { const ct = res.headers.get('content-type')||''; if (ct.includes('application/json')) { const j = await res.json(); txt = j.error||''; } } catch {} showError(txt || ('Upload failed — HTTP ' + res.status)); return; }
      document.getElementById('referenceUploadModal').classList.remove('open');
      _loadAndRenderReferences();
    } catch (e) { alert('Upload error: ' + e.message); }
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
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="max-width:460px">
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
        ${[{v:'handbook',l:t('ref_category_handbook')||'Handbook'},{v:'sop',l:t('ref_category_sop')||'SOP'},{v:'policy',l:t('ref_category_policy')||'Policy'},{v:'map',l:t('ref_category_map')||'Map'},{v:'reference',l:t('ref_category_reference')||'Reference'},{v:'checklist',l:t('ref_category_checklist')||'Checklist'},{v:'faq',l:t('ref_category_faq')||'FAQ'},{v:'objectives',l:t('ref_category_objectives')||'Objectives'},{v:'exercise_documents',l:t('ref_category_exercise_documents')||'Exercise Documents'},{v:'other',l:t('ref_category_other')||'Other'}].map(o => `<option value="${o.v}"${o.v === (ref.category || 'other') ? ' selected' : ''}>${o.l}</option>`).join('')}
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
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-close-overlay>${t('btn_cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" id="btnSaveRefEdit">${t('btn_save') || 'Save'}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // Populate owner/custodian user selects with current values
  _populateRefUserSelects(['refEditOwner', 'refEditCustodian'], { refEditOwner: ref.owner || '', refEditCustodian: ref.custodian || '' });
  overlay.querySelectorAll('[data-close-overlay]').forEach(b => b.addEventListener('click', () => overlay.remove()));
  document.getElementById('btnSaveRefEdit').addEventListener('click', async () => {
    const body = {
      title: document.getElementById('refEditTitle').value.trim(),
      description: document.getElementById('refEditDesc').value.trim(),
      category: document.getElementById('refEditCategory').value,
      language: document.getElementById('refEditLang').value,
      owner: document.getElementById('refEditOwner').value.trim(),
      authors: document.getElementById('refEditAuthors')?.value?.trim() || '',
      custodian: document.getElementById('refEditCustodian').value.trim(),
      copy_mode: document.getElementById('refEditCopyMode').value,
      tags: document.getElementById('refEditTags').value.trim().split(',').map(t => t.trim()).filter(Boolean),
    };
    try {
      const res = await api('PUT', '/api/references/' + id, body);
      if (res.ok) { overlay.remove(); _loadAndRenderReferences(); }
      else { const err = await res.json().catch(() => ({})); alert('Failed: ' + (err.error || 'Unknown')); }
    } catch (e) { alert('Error: ' + e.message); }
  });
}
