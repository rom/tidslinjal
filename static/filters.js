/* ── Filter System ── */
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

