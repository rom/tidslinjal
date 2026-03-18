/* ── Help Navigation, Mobile Nav, Reset Database, Startup Text ── */
// ── Help modal left-pane navigation ────────────────────────────────────────
// old conflict started here: old code

function initHelpNav() {
  const toc     = document.querySelector('.help-toc');
  const content = document.querySelector('.help-content');
  if (!toc || !content) return;

  const links = toc.querySelectorAll('.help-toc-link');
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('href')?.replace('#', '');
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  });

  // Highlight active section on scroll (throttled via rAF)
  let _helpScrollRaf = false;
  content.addEventListener('scroll', () => {
    if (_helpScrollRaf) return;
    _helpScrollRaf = true;
    requestAnimationFrame(() => {
      _helpScrollRaf = false;
      let activeId = null;
      links.forEach(link => {
        const id = link.getAttribute('href')?.replace('#', '');
        if (!id) return;
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - content.getBoundingClientRect().top < 80) {
          activeId = id;
        }
      });
      links.forEach(link => {
        const id = link.getAttribute('href')?.replace('#', '');
        link.classList.toggle('active', id === activeId);
      });
    });
  });

  // Activate first link by default
  if (links.length > 0) links[0].classList.add('active');
}

// Call when help modal opens
document.addEventListener('DOMContentLoaded', () => {
  const helpBtn = document.getElementById('btnHelp');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      setTimeout(initHelpNav, 50);
    });
  }
});

// old conflict ended here for old code =======
// new code start here
// ── Reset Database ──────────────────────────────────────────────────────────
async function resetDatabase() {
  if (!confirm('WARNING: This will permanently delete ALL data except the audit trail. Are you sure?')) return;
  if (!confirm('This action CANNOT be undone. Type "RESET" in the next prompt to confirm.')) return;
  const confirmation = prompt('Type RESET to confirm database reset:');
  if (confirmation !== 'RESET') { showNotification('info', 'Reset cancelled.'); return; }
  const res = await apiPost('/api/reset', {});
  if (res.ok) {
    showNotification('success', 'Database has been reset to empty.');
    // Clear extra clocks from local state
    if (state.preferences) state.preferences.extra_clocks = [];
    await refreshAll();
    renderSidebar();
  } else {
    const err = await res.json();
    showError(err.error || 'Reset failed');
  }
}

// ── Startup Text ──────────────────────────────────────────────────────────
async function saveStartupText() {
  const input = document.getElementById('startupTextInput');
  if (!input) return;
  const text = input.value.trim();
  const res = await api('PUT', '/api/startup-text', { text });
  if (res.ok) {
    showNotification('success', t('notif_saved')||'Saved');
  } else {
    showError('Failed to save startup text');
  }
}

async function clearStartupText() {
  const input = document.getElementById('startupTextInput');
  if (input) input.value = '';
  const res = await api('PUT', '/api/startup-text', { text: '' });
  if (res.ok) {
    showNotification('success', t('notif_saved')||'Saved');
  } else {
    showError('Failed to clear startup text');
  }
}

// Load startup text into settings textarea when settings tab is shown
async function _loadStartupTextInput() {
  const input = document.getElementById('startupTextInput');
  if (!input) return;
  try {
    const data = await apiGet('/api/startup-text');
    if (data && data.text) input.value = data.text;
  } catch { /* ignore */ }
}

