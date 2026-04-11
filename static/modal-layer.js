/* ── Layer Modal ── */
// ── Layer Modal, Event Type Modal, Phase Modal ────────────────────────────
// ── Layer Modal ────────────────────────────────────────────────────────────
function openLayerModal(layer) {
  const isEdit = !!layer;
  document.getElementById('layerModalTitle').textContent = isEdit ? (t('layer_edit')||'Edit Layer') : t('layers_add').replace('+ ','');
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

  // Show event count for existing layers
  const countEl = document.getElementById('layerEventCount');
  if (countEl) {
    if (isEdit && layer && state.events) {
      const evCount = state.events.filter(e => e.layer_id === layer.id).length;
      if (evCount > 0) {
        countEl.style.display = '';
        countEl.style.background = 'var(--bg3)';
        countEl.style.color = 'var(--text)';
        countEl.innerHTML = `📊 <strong>${(t('layer_event_count')||'This layer contains {n} events').replace('{n}', evCount)}</strong>`;
      } else {
        countEl.style.display = '';
        countEl.style.background = 'var(--bg3)';
        countEl.style.color = 'var(--text-dim)';
        countEl.innerHTML = t('layer_no_events')||'This layer has no events.';
      }
    } else {
      countEl.style.display = 'none';
    }
  }

  const delBtn = document.getElementById('btnDeleteLayer');
  delBtn.style.display = isEdit ? '' : 'none';
  delBtn.onclick = isEdit ? () => deleteLayer(layer.id) : null;
  openModal('layerModal');
}

let _layerSaving = false;
document.getElementById('btnSaveLayer').addEventListener('click', async () => {
  if (_layerSaving) return; // Prevent double-submit
  const id = document.getElementById('layerId').value;
  const name = document.getElementById('layerName').value.trim();
  if (!name) { showError('Name required', 'Validation'); return; }
  _layerSaving = true;
  const saveBtn = document.getElementById('btnSaveLayer');
  if (saveBtn) saveBtn.disabled = true;
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
            await fetchLayers(); // Backend may have linked the new group to the existing layer
            renderSidebar();
            renderTimeline();
            showNotification('success', `Group "${name}" created.`);
          }
        }
      }
    }
  } else { const err = await res.json(); showError(err.error); }
  _layerSaving = false;
  const _saveBtn = document.getElementById('btnSaveLayer');
  if (_saveBtn) _saveBtn.disabled = false;
});

async function deleteLayer(id) {
  const layerToDelete = state.layers.find(l => l.id === parseInt(id, 10));
  const evCount = state.events ? state.events.filter(e => e.layer_id === parseInt(id, 10)).length : 0;
  if (evCount > 0) {
    const msg = (t('confirm_delete_layer_with_events')||'This layer contains {n} events.\n\nDeleting it will move all events to the Master Timeline.\n\nAre you sure you want to delete this layer?').replace('{n}', evCount);
    if (!confirm(msg)) return;
  } else {
    if (!confirm(t('confirm_delete_layer')||'Delete this layer?')) return;
  }
  const res = await apiDel(`/api/layers/${id}`);
  if (res.ok) {
    if (layerToDelete) pushUndo('delete_layer', { ...layerToDelete });
    closeModal('layerModal'); await fetchLayers();
    state.preferences.active_layers = (state.preferences.active_layers||[]).filter(x => x!==id);
    await savePreferences(); renderSidebar(); renderTimeline();
    showNotification('success', t('notif_saved'));
  }
}

// ── Bulk Move Events Between Layers ───────────────────────────────────────
async function _bulkMoveLayerEvents() {
  const srcEl = document.getElementById('bulkMoveSource');
  const tgtEl = document.getElementById('bulkMoveTarget');
  if (!srcEl || !tgtEl) return;
  const sourceId = parseInt(srcEl.value, 10);
  const targetId = parseInt(tgtEl.value, 10);
  if (sourceId === targetId) {
    showError(t('layers_move_same')||'Source and target layers must be different.');
    return;
  }
  const srcName = srcEl.options[srcEl.selectedIndex].textContent;
  const tgtName = tgtEl.options[tgtEl.selectedIndex].textContent;
  if (!confirm((t('layers_move_confirm')||'Move all events from "{src}" to "{tgt}"?').replace('{src}', srcName).replace('{tgt}', tgtName))) {
    return;
  }
  try {
    const res = await apiPost('/api/layers/bulk-move', {
      source_layer_id: sourceId,
      target_layer_id: targetId,
    });
    if (res.ok) {
      const data = await res.json();
      showNotification('success', (t('layers_move_done')||'{n} events moved.').replace('{n}', data.moved));
      await refreshAll();
    } else {
      const err = await res.json();
      showError(err.error);
    }
  } catch (e) {
    showError(e.message);
  }
}
