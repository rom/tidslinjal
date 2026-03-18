/* ── Context Menu System ── */
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

