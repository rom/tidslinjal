/* ── Undo System ── */
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

