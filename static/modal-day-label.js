/* ── Day Label Modal ── */
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
