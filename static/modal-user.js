/* ── User Modal ── */
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
          ${state.user && (state.user.role === 'admin' || hasRole2(state.user.role, 'admin')) && user.id !== state.user.id ? `<button class="btn btn-secondary btn-sm" id="btnAdminChangePassword" title="${t('admin_change_password')||'Change Password'}">🔑 ${t('admin_change_password')||'Change Password'}</button>` : ''}
        </div>
        <div id="uLoginHistoryPanel" style="display:none;margin-top:8px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:6px"></div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
          <strong style="font-size:var(--fs-xs)">\u{1F3F7} ${t('user_labels')||'Labels'}</strong>
          <div id="uLabelsContainer" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
            ${(user.labels||[]).map(l => `<span class="user-label-chip" data-label-text="${escHtml(l.text)}" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 8px;border-radius:3px;background:${l.color||'var(--accent)'};color:#fff;font-weight:600;cursor:default" title="${escHtml((l.set_by_name||'')+' \u00B7 '+(l.set_at?new Date(l.set_at).toLocaleDateString():''))}">${escHtml(l.text)} <span class="user-label-remove" style="cursor:pointer;margin-left:2px;opacity:.7" title="${t('btn_remove')||'Remove'}">\u00D7</span></span>`).join('')}
          </div>
          <div style="display:flex;gap:4px;margin-top:6px;align-items:center">
            <input id="uNewLabelText" class="form-input" style="flex:1;font-size:var(--fs-xs);padding:4px 6px" placeholder="${t('user_label_placeholder')||'Label text...'}">
            <input type="color" id="uNewLabelColor" value="#3498db" style="width:30px;height:24px;border:none;padding:0;cursor:pointer">
            <button class="btn btn-primary btn-sm" id="btnAddLabel" style="font-size:10px;padding:3px 8px">+ ${t('btn_add')||'Add'}</button>
          </div>
        </div>
      `;
      uUserInfo.style.display = '';
      // Bind label add/remove
      const btnAddLabel = document.getElementById('btnAddLabel');
      if (btnAddLabel) btnAddLabel.addEventListener('click', async () => {
        const text = document.getElementById('uNewLabelText')?.value?.trim();
        const color = document.getElementById('uNewLabelColor')?.value || '#3498db';
        if (!text) return;
        const res = await apiPost('/api/users/' + user.id + '/labels', { text, color });
        if (res.ok) {
          document.getElementById('uNewLabelText').value = '';
          showNotification('success', t('user_label_added')||'Label added');
          closeModal('userModal');
          renderSidebar();
        } else { const err = await res.json().catch(()=>({})); showError(err.error || 'Failed'); }
      });
      document.querySelectorAll('.user-label-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const chip = btn.closest('.user-label-chip');
          const text = chip?.dataset?.labelText;
          if (!text || !confirm((t('user_label_remove_confirm')||'Remove label') + ' "' + text + '"?')) return;
          const res = await api('DELETE', '/api/users/' + user.id + '/labels', { text });
          if (res.ok) {
            chip.remove();
            showNotification('success', t('user_label_removed')||'Label removed');
            renderSidebar();
          } else { const err = await res.json().catch(()=>({})); showError(err.error || 'Failed'); }
        });
      });
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
      // Admin change password button
      const btnAdminPwd = document.getElementById('btnAdminChangePassword');
      if (btnAdminPwd) btnAdminPwd.addEventListener('click', (e) => {
        e.stopPropagation();
        _openAdminPasswordModal(user);
      });
    } else {
      uUserInfo.style.display = 'none';
      uUserInfo.innerHTML = '';
    }
  }

  // Populate building selector
  const buildingSel = document.getElementById('uBuildingId');
  if (buildingSel) {
    apiGet('/api/rooms').then(rooms => {
      const buildings = (rooms || []).filter(r => r.type === 'building');
      buildingSel.innerHTML = '<option value="0">— ' + (t('none')||'None') + ' —</option>' +
        buildings.map(b => `<option value="${b.id}" ${user && user.building_id === b.id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('');
    });
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
  const buildingId = parseInt(document.getElementById('uBuildingId')?.value) || 0;
  const payload = {display_name:displayName, email, role, can_lock:canLock, group_ids:groupIDs, nato_designations:natoDesignations, building_id:buildingId};
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

// ── Admin password change modal ──
function _openAdminPasswordModal(user) {
  const existingModal = document.getElementById('adminPwdModal');
  if (existingModal) existingModal.remove();

  const html = `<div class="modal-overlay open" id="adminPwdModal" style="z-index:10002">
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <h2>🔑 ${t('admin_change_password')||'Change Password'}</h2>
        <button class="modal-close" data-action="_closeAdminPwdModal">✕</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:12px;font-size:var(--fs-sm);color:var(--text-dim)">${(t('admin_change_password_confirm')||'Set new password for user "%s"?').replace('%s', escHtml(user.display_name || user.username))}</p>
        <div class="form-group" style="margin-bottom:10px">
          <label>${t('admin_new_password')||'New password'}</label>
          <input type="password" id="adminNewPwd" style="width:100%" placeholder="${t('admin_new_password')||'New password'}">
        </div>
        <div class="form-group">
          <label>${t('admin_confirm_password')||'Confirm password'}</label>
          <input type="password" id="adminConfirmPwd" style="width:100%" placeholder="${t('admin_confirm_password')||'Confirm password'}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeAdminPwdModal">${t('btn_cancel')||'Cancel'}</button>
        <button class="btn btn-primary" id="btnAdminPwdSave">${t('btn_save')||'Save'}</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('adminPwdModal');
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  if (typeof _bindActions === 'function') _bindActions(modal);

  document.getElementById('btnAdminPwdSave').addEventListener('click', async () => {
    const newPwd = document.getElementById('adminNewPwd').value;
    const confirmPwd = document.getElementById('adminConfirmPwd').value;
    if (!newPwd) { showError(t('admin_new_password')||'New password required'); return; }
    if (newPwd !== confirmPwd) { showError(t('admin_passwords_mismatch')||'Passwords do not match'); return; }
    try {
      const res = await apiPut(`/api/users/${user.id}`, { password: newPwd });
      if (res.ok) {
        document.getElementById('adminPwdModal')?.remove();
        showNotification('success', t('admin_password_changed')||'Password changed successfully');
      } else {
        const err = await res.json();
        showError(err.error || 'Failed to change password');
      }
    } catch (e) { showError(e.message || 'Failed to change password'); }
  });

  document.getElementById('adminNewPwd').focus();
}

function _closeAdminPwdModal() {
  document.getElementById('adminPwdModal')?.remove();
}

