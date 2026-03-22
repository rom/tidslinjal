/* ── Narrative / Storyline Modal ── */
// ── Narrative / Storyline Modal ──────────────────────────────────────────────
let _narrativePopout = null;
let _narrativeAutoScroll = true;
let _narrativeAutoRefreshTimer = null;
let _narrativeSortNewestFirst = true;

async function openNarrativeModal() {
  // Default to last 24 hours
  const now = new Date();
  const from = new Date(now.getTime() - 24*60*60*1000);
  let entries = [];
  try {
    entries = await apiGet(`/api/narrative?from=${from.toISOString()}&to=${now.toISOString()}&limit=200`) || [];
  } catch(e) { console.warn('Narrative fetch error', e); }

  const tzAbbr = new Date().toLocaleTimeString('en-GB', {timeZoneName:'short'}).split(' ').pop() || '';
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const tzLabel = tzAbbr + (tzName ? ' (' + tzName + ')' : '');

  const html = `
    <div class="modal-overlay" id="narrativeModal">
      <div class="modal" style="max-width:750px;width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column">
        <div class="modal-header">
          <h2>📰 ${t('narrative_title')||'Narrative / Storyline'}</h2>
          <div style="display:flex;gap:6px;margin-left:auto;margin-right:8px">
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="detachNarrative">⧉</button>
            <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:2px 8px" data-action="refreshNarrative">${t('btn_refresh')||'Refresh'}</button>
          </div>
          <button class="modal-close" data-action="closeNarrativeModal">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:12px">
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('from')||'From'}: <input type="datetime-local" id="narrativeFrom" value="${fmtDateInput(from)}"
                style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('to')||'To'}: <input type="datetime-local" id="narrativeTo" value="${fmtDateInput(now)}"
                style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
            </label>
            <span style="font-size:10px;color:var(--text-dim)">${escHtml(tzLabel)}</span>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('narrative_detail_level')||'Detail level'}:
              <select id="narrativeCategory" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
                <option value="all">${t('narrative_cat_all')||'All events'}</option>
                <option value="external">${t('narrative_cat_external')||'External events'}</option>
                <option value="operational">${t('narrative_cat_operational')||'Operational events'}</option>
                <option value="security">${t('narrative_cat_security')||'Security events'}</option>
              </select>
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px;cursor:pointer">
              <input type="checkbox" id="narrativeAutoScroll" ${_narrativeAutoScroll ? 'checked' : ''}
                style="accent-color:var(--accent)" data-action="_setNarrativeAutoScroll" data-arg-checked data-event="change">
              ${t('narrative_autoscroll')||'Autoscroll'}
            </label>
            <label style="font-size:var(--fs-xs);display:flex;align-items:center;gap:4px">
              ${t('narrative_sort_order')||'Order'}:
              <select id="narrativeSortOrder" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)">
                <option value="newest" ${_narrativeSortNewestFirst ? 'selected' : ''}>${t('narrative_sort_newest')||'Newest first'}</option>
                <option value="oldest" ${!_narrativeSortNewestFirst ? 'selected' : ''}>${t('narrative_sort_oldest')||'Oldest first'}</option>
              </select>
            </label>
            <button class="btn btn-sm btn-primary" data-action="refreshNarrative">${t('btn_refresh')||'Refresh'}</button>
          </div>
          <div id="narrativeEntries" style="font-family:var(--font-mono,monospace);font-size:var(--fs-xs)">
            ${_renderNarrativeEntries(entries)}
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('narrativeModal');
  void modal.offsetHeight;
  modal.classList.add('open');
  _bindActions(modal);
  // Category change triggers refresh
  const catEl = document.getElementById('narrativeCategory');
  if (catEl) catEl.addEventListener('change', () => refreshNarrative());
  // Sort order change triggers refresh
  const sortEl = document.getElementById('narrativeSortOrder');
  if (sortEl) sortEl.addEventListener('change', () => { _narrativeSortNewestFirst = sortEl.value === 'newest'; refreshNarrative(); });
  // Autoscroll to bottom on open
  _narrativeScrollToTop();
  // Start auto-refresh (every 10s)
  if (_narrativeAutoRefreshTimer) clearInterval(_narrativeAutoRefreshTimer);
  _narrativeAutoRefreshTimer = setInterval(() => {
    if (document.getElementById('narrativeModal')) refreshNarrative();
    else { clearInterval(_narrativeAutoRefreshTimer); _narrativeAutoRefreshTimer = null; }
  }, 10000);

  // Also listen for SSE events to trigger immediate refresh
  if (typeof _sseConnection !== 'undefined' && _sseConnection) {
    const _nrSSEHandler = () => {
      if (document.getElementById('narrativeModal')) refreshNarrative();
    };
    ['event_change', 'decision_new', 'decision_update', 'poll_new', 'poll_update'].forEach(evName => {
      _sseConnection.addEventListener(evName, _nrSSEHandler);
    });
    // Clean up SSE listeners when modal closes
    const _origClose = closeNarrativeModal;
    closeNarrativeModal = function() {
      ['event_change', 'decision_new', 'decision_update', 'poll_new', 'poll_update'].forEach(evName => {
        _sseConnection.removeEventListener(evName, _nrSSEHandler);
      });
      closeNarrativeModal = _origClose;
      _origClose();
    };
  }
}

function _renderNarrativeEntries(entries) {
  if (!entries || !entries.length) return `<p style="color:var(--text-dim)">${t('narrative_empty')||'No events in this time range.'}</p>`;
  // Sort entries based on user preference (newest first or oldest first)
  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return _narrativeSortNewestFirst ? (tb - ta) : (ta - tb);
  });
  return sorted.map(e => {
    const d = new Date(e.timestamp);
    const timeStr = d.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    const dateStr = d.toLocaleDateString('en-GB', {day:'2-digit',month:'short'});
    const severityColors = {info:'var(--text-dim)', warning:'#E67E22', critical:'#E74C3C'};
    const severityColor = severityColors[e.severity] || 'var(--text-dim)';
    const typeIcons = {
      event_started: '📌', decision_requested: '❓', decision_approved: '✅',
      decision_rejected: '❌', decision_: '⚖', audit_created: '➕',
      audit_updated: '✏', audit_deleted: '🗑', audit_status_changed: '🔄',
      audit_login: '🔑', audit_co_signed: '👁',
    };
    let icon = '•';
    for (const [prefix, ic] of Object.entries(typeIcons)) {
      if (e.type.startsWith(prefix)) { icon = ic; break; }
    }
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:flex-start">
      <span style="color:${severityColor};font-weight:700;min-width:80px;white-space:nowrap">${dateStr} ${timeStr}</span>
      <span style="font-size:14px">${icon}</span>
      <div style="flex:1">
        <span style="color:var(--text)">${escHtml(e.summary)}</span>
        ${e.user_name ? `<span style="color:var(--text-dim);margin-left:6px">— ${escHtml(e.user_name)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _setNarrativeAutoScroll(val) { _narrativeAutoScroll = val; }

function closeNarrativeModal() {
  if (_narrativeAutoRefreshTimer) { clearInterval(_narrativeAutoRefreshTimer); _narrativeAutoRefreshTimer = null; }
  const el = document.getElementById('narrativeModal');
  if (el) el.remove();
}

async function refreshNarrative() {
  const fromEl = document.getElementById('narrativeFrom');
  const toEl = document.getElementById('narrativeTo');
  const catEl = document.getElementById('narrativeCategory');
  const sortEl = document.getElementById('narrativeSortOrder');
  // Sync sort order from dropdown in case it was changed
  if (sortEl) _narrativeSortNewestFirst = sortEl.value === 'newest';
  let from = fromEl ? new Date(fromEl.value).toISOString() : new Date(Date.now()-24*60*60*1000).toISOString();
  let to = toEl ? new Date(toEl.value).toISOString() : new Date().toISOString();
  const category = catEl ? catEl.value : 'all';
  try {
    const entries = await apiGet(`/api/narrative?from=${from}&to=${to}&limit=200&category=${category}`) || [];
    const el = document.getElementById('narrativeEntries');
    if (el) el.innerHTML = _renderNarrativeEntries(entries);
    _narrativeScrollToTop();
  } catch(e) { showError('Failed to refresh: ' + e.message); }
}

function _narrativeScrollToTop() {
  if (!_narrativeAutoScroll) return;
  const el = document.getElementById('narrativeEntries');
  if (el) el.scrollTop = 0;
  // Also scroll the modal body
  const body = el && el.closest('.modal-body');
  if (body) body.scrollTop = 0;
}

function detachNarrative() {
  if (_narrativePopout && !_narrativePopout.closed) {
    _narrativePopout.focus();
    return;
  }
  const w = Math.min(window.screen.availWidth, 800);
  const h = Math.min(window.screen.availHeight - 100, 700);
  _narrativePopout = window.open('/static/narrative-popup.html', 'tidslinjal-narrative',
    `width=${w},height=${h},resizable=yes,scrollbars=yes`);
  closeNarrativeModal();
}

