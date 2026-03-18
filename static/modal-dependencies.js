/* ── Event Dependencies Modal ── */
// ── Event Dependencies ─────────────────────────────────────────────────────────

let _depsEventId = null;
let _currentDeps = []; // array of event IDs

function openDependenciesModal() {
  const evId = parseInt(document.getElementById('eventId')?.value, 10);
  if (!evId) return;
  _depsEventId = evId;

  const ev = state.events.find(e => e.id === evId);
  _currentDeps = ev?.depends_on ? [...ev.depends_on] : [];

  const titleEl = document.getElementById('dependencyEventTitle');
  if (titleEl) titleEl.textContent = ev ? ev.title : `Event #${evId}`;

  renderDependencyList();
  filterDepSearch();
  openModal('dependenciesModal');
}

function renderDependencyList() {
  const el = document.getElementById('dependencyList');
  if (!el) return;
  if (!_currentDeps.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-sm);padding:8px">No dependencies set.</p>';
    return;
  }
  el.innerHTML = _currentDeps.map(id => {
    const dep = state.events.find(e => e.id === id);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:var(--radius);background:var(--bg3);margin-bottom:4px">
      <span>${dep ? escHtml(dep.title) : `Event #${id}`}</span>
      <button class="btn btn-danger btn-sm" data-action="removeDependency" data-arg="${id}">✕</button>
    </div>`;
  }).join('');
  _bindActions(el);
}

function removeDependency(id) {
  _currentDeps = _currentDeps.filter(d => d !== id);
  renderDependencyList();
}

function filterDepSearch() {
  const q = (document.getElementById('depSearch')?.value || '').toLowerCase();
  const el = document.getElementById('depSearchResults');
  if (!el) return;
  const candidates = state.events.filter(ev =>
    ev.id !== _depsEventId &&
    !_currentDeps.includes(ev.id) &&
    (q === '' || ev.title.toLowerCase().includes(q))
  ).slice(0, 20);
  if (!candidates.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:var(--fs-xs);padding:6px">No matching events.</p>';
    return;
  }
  el.innerHTML = candidates.map(ev => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:var(--radius);background:var(--bg3);margin-bottom:4px;cursor:pointer" data-action="addDependency" data-arg="${ev.id}">
      <span>${escHtml(ev.title)}</span>
      <span style="font-size:var(--fs-xs);color:var(--text-dim)">${fmtDateTime(new Date(ev.start_time))}</span>
    </div>
  `).join('');
  _bindActions(el);
}

function addDependency(id) {
  if (!_currentDeps.includes(id)) {
    _currentDeps.push(id);
    renderDependencyList();
    filterDepSearch();
  }
}

async function saveDependencies() {
  const evId = _depsEventId;
  if (!evId) return;
  const ev = state.events.find(e => e.id === evId);
  if (!ev) return;

  const payload = {...ev, depends_on: _currentDeps};
  delete payload.attachment_count; delete payload.comment_count;
  const res = await apiPut(`/api/events/${evId}`, payload);
  if (res.ok) {
    const updated = await res.json();
    const idx = state.events.findIndex(e => e.id === evId);
    if (idx >= 0) state.events[idx] = updated;
    closeModal('dependenciesModal');
    showNotification('success', 'Dependencies saved');
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to save dependencies');
  }
}

