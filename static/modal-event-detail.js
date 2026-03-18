/* ── Event Detail Modal ── */

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
