/* ============================================================
   Tidslinjal — Responsive & Touch Support
   Covers: pointer events, pinch-to-zoom, swipe navigation,
   long-press drag, sidebar gestures, FAB, adaptive view range,
   vertical day layout (phone), bottom sheet modals, long-press
   context menu.
   Load after: state.js, utils.js, timeline.js, app.js
   ============================================================ */
'use strict';

// ── Feature detection ────────────────────────────────────────────────────────
const _isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const _isPhone = () => window.innerWidth < 600;
const _isTablet = () => window.innerWidth >= 600 && window.innerWidth <= 1024;
const _isMobile = () => window.innerWidth <= 1024;

// ── P1: Pointer Events — replace mouse events in interaction setup ──────────
// We wrap the existing setup functions with pointer-event-aware versions.
// The original mouse-based handlers in timeline.js remain for fallback;
// this module adds pointer (touch+stylus) support on top.

let _pointerSetupDone = false;

function setupPointerEvents() {
  if (_pointerSetupDone) return;
  _pointerSetupDone = true;

  const container = document.getElementById('timeline-container');
  if (!container) return;

  // Disable browser-level touch scroll during gestures
  container.style.touchAction = 'pan-y';

  // ── Pinch-to-zoom ──────────────────────────────────────────────────────
  let _pinchActive = false;
  let _pinchStartDist = 0;
  let _pinchStartZoom = 1;
  const _activeTouches = new Map();

  container.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) _activeTouches.set(t.identifier, t);
    if (_activeTouches.size === 2) {
      _pinchActive = true;
      const pts = [..._activeTouches.values()];
      _pinchStartDist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      _pinchStartZoom = state.zoomFactor;
      e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) _activeTouches.set(t.identifier, t);
    if (_pinchActive && _activeTouches.size >= 2) {
      const pts = [..._activeTouches.values()];
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const scale = dist / _pinchStartDist;
      const newZoom = Math.max(0.2, Math.min(6.0, _pinchStartZoom * scale));
      if (Math.abs(newZoom - state.zoomFactor) > 0.02) {
        state.zoomFactor = newZoom;
        renderTimeline();
      }
      e.preventDefault();
    }
  }, { passive: false });

  const _endPinch = e => {
    for (const t of e.changedTouches) _activeTouches.delete(t.identifier);
    if (_activeTouches.size < 2) _pinchActive = false;
  };
  container.addEventListener('touchend', _endPinch);
  container.addEventListener('touchcancel', _endPinch);

  // ── Swipe navigation ──────────────────────────────────────────────────
  let _swipeStartX = 0, _swipeStartY = 0, _swipeStartTime = 0;
  let _swipeTracking = false;

  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { _swipeTracking = false; return; }
    // Don't swipe from event blocks (they can be dragged)
    if (e.target.closest('.event-block')) return;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipeStartTime = Date.now();
    _swipeTracking = true;
  }, { passive: true });

  container.addEventListener('touchend', e => {
    if (!_swipeTracking || e.changedTouches.length !== 1) return;
    _swipeTracking = false;
    const dx = e.changedTouches[0].clientX - _swipeStartX;
    const dy = e.changedTouches[0].clientY - _swipeStartY;
    const dt = Date.now() - _swipeStartTime;
    // Fast horizontal swipe: >80px, <400ms, more horizontal than vertical
    if (dt < 400 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navigate(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  // ── Long-press to drag events (touch) ──────────────────────────────────
  let _longPressTimer = null;
  let _longPressEvId = null;
  let _longPressBlock = null;
  let _touchDragging = false;
  let _touchGhost = null;
  let _touchGhostHalfW = 0;

  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { _cancelLongPress(); return; }
    const block = e.target.closest('.event-block[data-ev-id]');
    if (!block) return;
    _longPressEvId = parseInt(block.dataset.evId, 10);
    _longPressBlock = block;
    _longPressTimer = setTimeout(() => {
      // Vibrate to signal drag mode
      if (navigator.vibrate) navigator.vibrate(30);
      _touchDragging = true;
      _touchGhostHalfW = block.offsetWidth / 2;
      _touchGhost = block.cloneNode(true);
      _touchGhost.style.cssText = `
        position: fixed; pointer-events: none; z-index: 999; opacity: 0.75;
        width: ${block.offsetWidth}px; box-shadow: 0 4px 20px rgba(0,0,0,.5);
        left: ${e.touches[0].clientX - _touchGhostHalfW}px;
        top:  ${e.touches[0].clientY - 12}px;
      `;
      _touchGhost.classList.add('dragging');
      document.body.appendChild(_touchGhost);
      block.style.opacity = '0.35';
    }, 500);
  }, { passive: true });

  const _cancelLongPress = () => {
    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  };

  container.addEventListener('touchmove', e => {
    if (!_touchDragging) {
      // If significant movement before long-press fires, cancel it
      _cancelLongPress();
      return;
    }
    if (!_touchGhost) return;
    const tp = e.touches[0];
    _touchGhost.style.left = (tp.clientX - _touchGhostHalfW) + 'px';
    _touchGhost.style.top  = (tp.clientY - 12) + 'px';
    // Highlight target cell
    document.querySelectorAll('.tl-cell.drag-target').forEach(c => c.classList.remove('drag-target'));
    _touchGhost.style.display = 'none';
    const els = document.elementsFromPoint(tp.clientX, tp.clientY);
    _touchGhost.style.display = '';
    const cell = els.find(el => el.classList.contains('tl-cell'));
    if (cell) cell.classList.add('drag-target');
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchend', async e => {
    _cancelLongPress();
    if (!_touchDragging) return;
    _touchDragging = false;
    if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
    document.querySelectorAll('.tl-cell.drag-target').forEach(c => c.classList.remove('drag-target'));
    if (_longPressBlock) _longPressBlock.style.opacity = '';

    const tp = e.changedTouches[0];
    const els  = document.elementsFromPoint(tp.clientX, tp.clientY);
    const cell = els.find(el => el.classList.contains('tl-cell'));
    if (!cell || !_longPressEvId) { _longPressEvId = null; _longPressBlock = null; return; }

    const dayIdx  = parseInt(cell.dataset.day,  10);
    const slotIdx = parseInt(cell.dataset.slot, 10);
    if (isNaN(dayIdx) || isNaN(slotIdx)) { _longPressEvId = null; return; }

    const ev = state.events.find(ev => ev.id === _longPressEvId);
    if (!ev) { _longPressEvId = null; return; }

    const days      = getDays();
    const targetDay = days[dayIdx];
    if (!targetDay) { _longPressEvId = null; return; }

    const slotMin  = getSlotMinutes();
    const startOff = getStartHourOffset();
    const newMin   = startOff + slotIdx * slotMin;
    const newStart = new Date(targetDay);
    newStart.setHours(Math.floor(newMin / 60), newMin % 60, 0, 0);

    if (isEventLocked(ev)) {
      showError('This event is in a locked time slot and cannot be moved.');
      _longPressEvId = null; return;
    }

    if (state.preferences?.confirm_drag_move) {
      const _t = typeof t === 'function' ? t : () => '';
      if (!confirm(_t('confirm_drag_move_prompt') || 'Move this event to the new time?')) {
        _longPressEvId = null; return;
      }
    }

    const oldStart = new Date(ev.start_time);
    const oldEnd   = ev.end_time ? new Date(ev.end_time) : null;
    const payload  = { ...ev, start_time: newStart.toISOString() };
    if (oldEnd) {
      const dur = oldEnd - oldStart;
      payload.end_time = new Date(newStart.getTime() + dur).toISOString();
    }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    delete payload.created_by_name; delete payload.verified_by_name;

    if (typeof pushUndo === 'function') pushUndo('update_event', { id: _longPressEvId, old: { ...ev } });

    const res = await apiPut('/api/events/' + _longPressEvId, payload);
    if (res.ok) {
      await refreshAll();
      const _t2 = typeof t === 'function' ? t : () => '';
      showNotification('success', _t2('notif_event_updated') || 'Event moved');
    } else {
      const err = await res.json();
      showError(err.error || 'Could not reschedule');
    }
    _longPressEvId = null; _longPressBlock = null;
  });

  container.addEventListener('touchcancel', () => {
    _cancelLongPress();
    if (_touchDragging) {
      _touchDragging = false;
      if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
      document.querySelectorAll('.tl-cell.drag-target').forEach(c => c.classList.remove('drag-target'));
      if (_longPressBlock) _longPressBlock.style.opacity = '';
    }
  });

  // ── Long-press context menu (replaces right-click on touch) ────────────
  let _ctxLongPressTimer = null;
  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const block = e.target.closest('.event-block[data-ev-id]');
    // Only for non-event areas (events handled by drag long-press above)
    if (block) return;
    const cell = e.target.closest('.tl-cell');
    if (!cell) return;
    const touch = e.touches[0];
    _ctxLongPressTimer = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(20);
      // Show slot context menu at touch point
      const ctx = document.getElementById('slotContextMenu');
      if (ctx) {
        ctx.style.left = touch.clientX + 'px';
        ctx.style.top  = touch.clientY + 'px';
        ctx.style.display = '';
        ctx.dataset.day  = cell.dataset.day;
        ctx.dataset.slot = cell.dataset.slot;
      }
    }, 600);
  }, { passive: true });

  container.addEventListener('touchmove', () => {
    if (_ctxLongPressTimer) { clearTimeout(_ctxLongPressTimer); _ctxLongPressTimer = null; }
  }, { passive: true });
  container.addEventListener('touchend', () => {
    if (_ctxLongPressTimer) { clearTimeout(_ctxLongPressTimer); _ctxLongPressTimer = null; }
  }, { passive: true });
}

// ── P2: Adaptive view range by viewport width ────────────────────────────────
function adaptViewRangeToViewport() {
  const w = window.innerWidth;
  const rangeSelect = document.getElementById('rangeSelect');
  if (!rangeSelect) return;

  // Hide options that don't fit
  const opts = rangeSelect.querySelectorAll('option');
  opts.forEach(opt => {
    const v = opt.value;
    const days = _rangeToDays(v);
    // Approximate minimum: time-col + days * min-col-width
    const minW = 52 + days * 80;
    opt.disabled = minW > w * 1.5; // allow some scrolling
    opt.hidden = minW > w * 3;     // completely hide extreme options
  });

  // If current selection is too wide, auto-switch
  const currentDays = getRangeDays();
  const currentMinW = 52 + currentDays * 80;
  if (currentMinW > w * 2) {
    // Find the widest suitable range
    let bestRange = 'day';
    for (const opt of opts) {
      if (opt.hidden || opt.disabled) continue;
      bestRange = opt.value;
    }
    if (state.range !== bestRange) {
      state.range = bestRange;
      rangeSelect.value = bestRange;
      if (typeof refreshAll === 'function') refreshAll();
    }
  }
}

function _rangeToDays(range) {
  const map = { day:1, '2days':2, '3days':3, '4days':4, '5days':5, week:7, '2weeks':14, '3weeks':21, month:30, '2months':60, '3months':90 };
  return map[range] || 7;
}

// ── P2: Collapsible header toolbar (overflow menu) ──────────────────────────
function setupToolbarOverflow() {
  const header = document.getElementById('header');
  if (!header) return;

  // Add overflow toggle button if not present
  if (!document.getElementById('btnToolbarOverflow')) {
    const btn = document.createElement('button');
    btn.id = 'btnToolbarOverflow';
    btn.className = 'btn btn-secondary btn-icon toolbar-btn toolbar-overflow-btn';
    btn.innerHTML = '⋯';
    btn.title = 'More controls';
    btn.style.display = 'none';
    // Insert before header-right
    const headerRight = header.querySelector('.header-right');
    if (headerRight) headerRight.insertBefore(btn, headerRight.firstChild);

    btn.addEventListener('click', () => {
      const menu = document.getElementById('toolbarOverflowMenu');
      if (menu) menu.classList.toggle('visible');
    });
  }

  // Create overflow menu container if not present
  if (!document.getElementById('toolbarOverflowMenu')) {
    const menu = document.createElement('div');
    menu.id = 'toolbarOverflowMenu';
    menu.className = 'toolbar-overflow-menu';
    document.body.appendChild(menu);

    // Close on click outside
    document.addEventListener('click', e => {
      if (!e.target.closest('#toolbarOverflowMenu, #btnToolbarOverflow')) {
        menu.classList.remove('visible');
      }
    });
  }

  _updateToolbarOverflow();
}

function _updateToolbarOverflow() {
  const w = window.innerWidth;
  const overflowBtn = document.getElementById('btnToolbarOverflow');
  const overflowMenu = document.getElementById('toolbarOverflowMenu');
  if (!overflowBtn || !overflowMenu) return;

  if (w > 1024) {
    overflowBtn.style.display = 'none';
    overflowMenu.classList.remove('visible');
    // Ensure all toolbar groups visible
    document.querySelectorAll('.header-controls .toolbar-group').forEach(g => g.classList.remove('toolbar-hidden'));
    document.querySelectorAll('.header-controls .toolbar-sep').forEach(s => s.classList.remove('toolbar-hidden'));
    return;
  }

  overflowBtn.style.display = '';

  // On tablet: hide groups 5+ (language, secondary controls)
  // On phone: hide groups 3+ (search, view controls)
  const groups = [...document.querySelectorAll('.header-controls .toolbar-group')];
  const seps = [...document.querySelectorAll('.header-controls .toolbar-sep')];

  const hideFrom = w <= 600 ? 2 : w <= 768 ? 3 : 4;

  // Build overflow menu content from hidden groups
  overflowMenu.innerHTML = '';

  groups.forEach((g, i) => {
    if (i >= hideFrom) {
      g.classList.add('toolbar-hidden');
      // Clone into overflow menu
      const clone = g.cloneNode(true);
      clone.classList.remove('toolbar-hidden');
      clone.classList.add('toolbar-overflow-group');
      overflowMenu.appendChild(clone);
    } else {
      g.classList.remove('toolbar-hidden');
    }
  });

  seps.forEach((s, i) => {
    s.classList.toggle('toolbar-hidden', i >= hideFrom - 1);
  });

  // Re-bind event listeners in cloned elements
  _rebindOverflowMenuListeners(overflowMenu);
}

function _rebindOverflowMenuListeners(menu) {
  // Language flags in overflow
  menu.querySelectorAll('.lang-flag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.id;
      const orig = document.querySelector('.header-controls #' + id);
      if (orig) orig.click();
    });
  });

  // Buttons — dispatch click on original
  menu.querySelectorAll('button[id]').forEach(btn => {
    if (btn.id.startsWith('flag')) return; // handled above
    btn.addEventListener('click', () => {
      const orig = document.querySelector('.header-controls #' + btn.id);
      if (orig) orig.click();
    });
  });

  // Select elements — sync with original
  menu.querySelectorAll('select[id]').forEach(sel => {
    sel.addEventListener('change', () => {
      const orig = document.querySelector('.header-controls #' + sel.id);
      if (orig) { orig.value = sel.value; orig.dispatchEvent(new Event('change')); }
    });
  });

  // Search input
  menu.querySelectorAll('input[id]').forEach(inp => {
    inp.addEventListener('input', () => {
      const orig = document.querySelector('.header-controls #' + inp.id);
      if (orig) { orig.value = inp.value; orig.dispatchEvent(new Event('input')); }
    });
  });
}

// ── P2: Vertical day layout for phone ────────────────────────────────────────
// When on phone (<600px), transform the horizontal multi-day grid into a
// single-column vertical scroll where each day stacks below the previous.
// This is done by adjusting the CSS grid template at render time.

let _verticalDayActive = false;

function isVerticalDayLayout() {
  return window.innerWidth < 600 && getRangeDays() >= 2;
}

function setupVerticalDayLayoutObserver() {
  // Patch renderTimeline to apply vertical layout when needed
  const _origRenderTimeline = window.renderTimeline;
  if (!_origRenderTimeline || _origRenderTimeline._responsivePatched) return;

  window.renderTimeline = function() {
    _origRenderTimeline.apply(this, arguments);
    if (isVerticalDayLayout()) {
      _applyVerticalDayLayout();
    }
  };
  window.renderTimeline._responsivePatched = true;
}

function _applyVerticalDayLayout() {
  const tl = document.getElementById('timeline');
  if (!tl) return;
  _verticalDayActive = true;

  // Override the grid template: single time column + one day column
  // Then duplicate rows for each day with day-header separators
  tl.style.gridTemplateColumns = 'var(--time-col-w) 1fr';
  tl.classList.add('vertical-day-layout');
}

// ── P3: Swipe-to-open sidebar ────────────────────────────────────────────────
function setupSidebarSwipe() {
  let _sideSwipeStartX = 0;
  let _sideSwipeTracking = false;

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const x = e.touches[0].clientX;
    // Only detect swipes from right edge (within 20px of screen edge)
    if (x > window.innerWidth - 20) {
      _sideSwipeStartX = x;
      _sideSwipeTracking = true;
    }
    // Also detect swipe from left edge to close sidebar if it's open
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('visible') && x < 40) {
      _sideSwipeStartX = x;
      _sideSwipeTracking = true;
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!_sideSwipeTracking) return;
    _sideSwipeTracking = false;
    const dx = e.changedTouches[0].clientX - _sideSwipeStartX;
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar) return;

    if (dx < -60 && !sidebar.classList.contains('visible')) {
      // Swipe left from right edge → open sidebar
      sidebar.classList.add('visible');
      if (backdrop) backdrop.classList.add('visible');
    } else if (dx > 60 && sidebar.classList.contains('visible')) {
      // Swipe right → close sidebar
      sidebar.classList.remove('visible');
      if (backdrop) backdrop.classList.remove('visible');
    }
  }, { passive: true });
}

// ── P3: Bottom sheet modal behavior ──────────────────────────────────────────
function setupBottomSheetModals() {
  // Add drag-to-dismiss on modal overlays for touch devices
  document.addEventListener('touchstart', e => {
    if (!_isMobile()) return;
    const overlay = e.target.closest('.modal-overlay.open');
    if (!overlay) return;
    const modal = overlay.querySelector('.modal');
    if (!modal) return;

    let startY = e.touches[0].clientY;
    let modalStartTop = 0;
    let dragging = false;

    const onMove = ev => {
      const dy = ev.touches[0].clientY - startY;
      if (dy > 10) {
        dragging = true;
        modal.style.transform = `translateY(${Math.max(0, dy)}px)`;
      }
    };
    const onEnd = ev => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      if (!dragging) return;
      const dy = ev.changedTouches[0].clientY - startY;
      modal.style.transform = '';
      if (dy > 150) {
        // Dismiss
        const id = overlay.id;
        if (id && typeof closeModal === 'function') closeModal(id);
      }
    };
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
  }, { passive: true });
}

// ── P3: Floating Action Button ───────────────────────────────────────────────
function setupFAB() {
  if (document.getElementById('fab-add-event')) return;

  const fab = document.createElement('button');
  fab.id = 'fab-add-event';
  fab.className = 'fab-btn';
  fab.innerHTML = '+';
  fab.title = 'Add Event';
  fab.style.display = 'none'; // shown by CSS media query
  document.body.appendChild(fab);

  fab.addEventListener('click', () => {
    if (typeof openEventModal === 'function') openEventModal(null);
  });
}

// ── P5: Phone defaults ──────────────────────────────────────────────────────
function applyPhoneDefaults() {
  if (!_isPhone()) return;

  // Default to 1-day view on phone if current range is too wide
  if (getRangeDays() > 3) {
    state.range = 'day';
    const sel = document.getElementById('rangeSelect');
    if (sel) sel.value = 'day';
  }

  // Default to list view on phone if user preference says so
  // (only on initial load, not on resize)
  if (!state._phoneDefaultsApplied) {
    state._phoneDefaultsApplied = true;
    const landingView = state.preferences?.default_landing_view;
    if (!landingView || landingView === 'grid') {
      // On phone, list view is more useful by default
      // But respect user's explicit preference
    }
  }
}

// ── P5: Enhanced mobile nav ──────────────────────────────────────────────────
function setupMobileNav() {
  const mobileNav = document.getElementById('mobileNav');
  if (!mobileNav) return;

  mobileNav.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.mobileTab;
      // Clear active state
      mobileNav.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebarBackdrop');

      switch (tab) {
        case 'timeline':
          // Show timeline, hide list view, close sidebar
          if (typeof toggleListView === 'function' && _listViewActive) toggleListView();
          if (sidebar) sidebar.classList.remove('visible');
          if (backdrop) backdrop.classList.remove('visible');
          break;
        case 'list':
          if (typeof toggleListView === 'function' && !_listViewActive) toggleListView();
          if (sidebar) sidebar.classList.remove('visible');
          if (backdrop) backdrop.classList.remove('visible');
          break;
        case 'legend':
        case 'layers':
        case 'settings':
          // Open sidebar to this tab
          if (sidebar) sidebar.classList.add('visible');
          if (backdrop) backdrop.classList.add('visible');
          state.sidebarTab = tab;
          document.querySelectorAll('.sidebar-tab').forEach(t2 => t2.classList.remove('active'));
          const sTab = document.querySelector(`.sidebar-tab[data-tab="${tab}"]`);
          if (sTab) sTab.classList.add('active');
          if (typeof renderSidebar === 'function') renderSidebar();
          break;
        case 'menu':
          // Toggle toolbar overflow menu
          const overflowMenu = document.getElementById('toolbarOverflowMenu');
          if (overflowMenu) overflowMenu.classList.toggle('visible');
          break;
      }
    });
  });
}

// ── Responsive resize handler ────────────────────────────────────────────────
let _resizeDebounce = null;
function onResponsiveResize() {
  if (_resizeDebounce) clearTimeout(_resizeDebounce);
  _resizeDebounce = setTimeout(() => {
    adaptViewRangeToViewport();
    _updateToolbarOverflow();
    _updateFABVisibility();
    _updateMobileNavVisibility();
  }, 150);
}

function _updateFABVisibility() {
  const fab = document.getElementById('fab-add-event');
  if (!fab) return;
  const canWrite = state.user && typeof hasRole2 === 'function' && hasRole2(state.user.role, 'readwrite');
  fab.style.display = (_isMobile() && canWrite) ? '' : 'none';
}

function _updateMobileNavVisibility() {
  const nav = document.getElementById('mobileNav');
  if (nav) nav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
}

// ── Init all responsive features ─────────────────────────────────────────────
function initResponsive() {
  setupPointerEvents();
  setupToolbarOverflow();
  setupSidebarSwipe();
  setupBottomSheetModals();
  setupFAB();
  setupMobileNav();
  adaptViewRangeToViewport();
  applyPhoneDefaults();
  setupVerticalDayLayoutObserver();
  _updateFABVisibility();
  _updateMobileNavVisibility();

  window.addEventListener('resize', onResponsiveResize);

  // Also re-check on orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(onResponsiveResize, 300);
  });
}

// Auto-init after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initResponsive, 100));
} else {
  setTimeout(initResponsive, 100);
}
