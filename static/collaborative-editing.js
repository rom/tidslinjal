/* ── Collaborative Editing ── */
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

