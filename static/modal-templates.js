/* ── Templates ── */
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

