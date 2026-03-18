/* ── Multi-Select Events ── */
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
