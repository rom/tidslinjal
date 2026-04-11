/* bindings.js -- CSP-safe event bindings (replaces all inline handlers)
 * Loaded after app.js so every function referenced here is already defined.
 */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // ---------- helpers --------------------------------------------------------
  function q(sel)  { return document.querySelector(sel); }
  function qa(sel) { return document.querySelectorAll(sel); }

  function on(sel, evt, fn) {
    var el = typeof sel === 'string' ? q(sel) : sel;
    if (el) el.addEventListener(evt, fn);
  }

  // ---------- closeModal delegation ------------------------------------------
  // Every element with data-close-modal="xxx" calls closeModal(xxx)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-close-modal]');
    if (btn) { closeModal(btn.getAttribute('data-close-modal')); }
  });

  // ---------- Header: language flags -----------------------------------------
  on('#flagEN', 'click', function () { setPref('language', 'en'); });
  on('#flagSV', 'click', function () { setPref('language', 'sv'); });
  on('#flagFR', 'click', function () { setPref('language', 'fr'); });
  on('#flagDE', 'click', function () { setPref('language', 'de'); });
  on('#flagNL', 'click', function () { setPref('language', 'nl'); });
  on('#flagFI', 'click', function () { setPref('language', 'fi'); });
  on('#flagIS', 'click', function () { setPref('language', 'is'); });
  on('#flagDA', 'click', function () { setPref('language', 'da'); });
  on('#flagNB', 'click', function () { setPref('language', 'nb'); });
  on('#flagET', 'click', function () { setPref('language', 'et'); });
  on('#flagLV', 'click', function () { setPref('language', 'lv'); });
  on('#flagLT', 'click', function () { setPref('language', 'lt'); });
  on('#flagIT', 'click', function () { setPref('language', 'it'); });
  on('#flagES', 'click', function () { setPref('language', 'es'); });
  on('#flagPT', 'click', function () { setPref('language', 'pt'); });
  on('#flagPL', 'click', function () { setPref('language', 'pl'); });
  on('#flagUK', 'click', function () { setPref('language', 'uk'); });
  on('#flagJA', 'click', function () { setPref('language', 'ja'); });
  on('#flagKO', 'click', function () { setPref('language', 'ko'); });

  // ---------- Header: clock area ---------------------------------------------
  on('#clockDetachedIndicator', 'click', function () {
    if (_clockPopout && !_clockPopout.closed) { _clockPopout.focus(); }
    else { _setClockAreaDetached(false); }
  });
  // btnOpenDetachedClock removed — only ⧉ (btnDetachClock) is used now
  on('#btnAddClock',    'click', function () { openAddClockPopover(this); });
  on('#btnDetachClock', 'click', function () { detachClock(); });
  on('#clockDisplay',   'click', function () { toggleClockTZ(); });

  // ---------- Add-clock popover ----------------------------------------------
  on('#btnClockPopCancel',  'click', function () { closeAddClockPopover(); });
  on('#btnClockPopConfirm', 'click', function () { confirmAddClock(); });
  on('#newClockSearch', 'input',   function () { filterTzSuggestions(this.value); });
  on('#newClockSearch', 'keydown', function (e) { tzSuggestionsKey(e); });

  // ---------- Header: user area ----------------------------------------------
  on('#userBadge',  'click', function () { openProfileModal(); });
  on('#btnHelp',    'click', function () { openModal('helpModal'); });

  // ---------- Date picker ----------------------------------------------------
  on('#datePickerInput', 'change', function () { goToDate(this.value); });

  // ---------- List view toolbar ----------------------------------------------
  var _listSearchDebounce = null;
  on('#listSearch',       'input',  function () {
    if (_listSearchDebounce) clearTimeout(_listSearchDebounce);
    _listSearchDebounce = setTimeout(renderListView, 300);
  });
  on('#listStatusFilter', 'change', function () { renderListView(); });
  on('#listTypeFilter',   'change', function () { renderListView(); });
  on('#listDateFrom',     'change', function () { renderListView(); });
  on('#listDateTo',       'change', function () { renderListView(); });
  on('#listResponsibleFilter', 'change', function () { renderListView(); });
  on('#listLayerFilter',      'change', function () { renderListView(); });

  // ---------- List view sort headers (event delegation) ----------------------
  document.addEventListener('click', function (e) {
    var th = e.target.closest('[data-sort]');
    if (th) listSortBy(th.getAttribute('data-sort'));
  });

  // ---------- Nav jump menu (event delegation) -------------------------------
  document.addEventListener('click', function (e) {
    var item = e.target.closest('[data-jump]');
    if (item) navJump(Number(item.getAttribute('data-jump')));
  });

  // ---------- Filter popover -------------------------------------------------
  on('#btnApplyFilters',     'click', function () { applyFilters(); });
  on('#btnClearFilters',     'click', function () { clearFilters(); });
  on('#btnSaveFilterPreset', 'click', function () { saveFilterPreset(); });

  // ---------- Context menu (event delegation) --------------------------------
  document.addEventListener('click', function (e) {
    var item = e.target.closest('[data-ctx-action]');
    if (item) {
      var action = item.getAttribute('data-ctx-action');
      var param  = item.getAttribute('data-ctx-param') || undefined;
      ctxAction(action, param);
    }
  });

  // ---------- Slot context menu (event delegation) ---------------------------
  document.addEventListener('click', function (e) {
    var item = e.target.closest('[data-ctx-slot-action]');
    if (item) ctxSlotAction(item.getAttribute('data-ctx-slot-action'));
  });

  // ---------- Mobile nav (event delegation) ----------------------------------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mobile-tab]');
    if (btn) mobileNavTab(btn.getAttribute('data-mobile-tab'));
  });

  // ---------- Sidebar backdrop -----------------------------------------------
  on('#sidebarBackdrop', 'click', function () { closeMobileSidebar(); });

  // ---------- Event modal ----------------------------------------------------
  on('#eventContactType',         'change', function () { onContactTypeChange(); });
  on('#eventVirtualMeetingType',  'change', function () { onVirtualMeetingTypeChange(); });
  on('#btnGenerateMeetingLink',   'click',  function () { generateMeetingLink(); });
  on('#btnEventHistory',          'click',  function () { openEventHistory(); });
  on('#btnEventDeps',             'click',  function () { openDependenciesModal(); });
  on('#btnOpenMapForEvent',       'click',  function () { openMapForEvent(); });

  // ---------- Invited filter buttons (event delegation) ----------------------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-invited-filter]');
    if (btn) setInvitedFilter(btn.getAttribute('data-invited-filter'));
  });

  // ---------- Lock modal -----------------------------------------------------
  on('#lockScope', 'change', function () { onLockScopeChange(); });

  // ---------- Profile modal --------------------------------------------------
  on('#profilePhotoInput',   'change', function () { loadProfilePhoto(this); });
  on('#profilePhotoRemove',  'click',  function () { removeProfilePhoto(); });
  on('#profileLanguage',     'change', function () { onProfileLanguageChange(this.value); });
  on('#profilePwdNew',       'input',  function () {
    updatePwdStrength('profilePwdNew', 'profilePwdStrengthBar', 'profilePwdStrengthLabel');
  });
  on('#btnGenerateProfilePwd', 'click', function () { generateProfilePassword(); });
  on('#btnCopyProfilePwd',     'click', function () { copyProfilePassword(); });
  on('#btnGenWebCalToken',     'click', function () { generateWebCalToken(); });
  on('#btnSaveProfile',        'click', function () { saveProfile(); });

  // ---------- Password modal -------------------------------------------------
  on('#pwdNew', 'input', function () {
    updatePwdStrength('pwdNew', 'pwdStrengthBar', 'pwdStrengthLabel');
  });
  on('#pwdNewEye',     'click', function () { togglePwdVisibility('pwdNew', 'pwdNewEye'); });
  on('#btnGenStandalonePwd',  'click', function () { generateStandalonePassword(); });
  on('#btnCopyStandalonePwd', 'click', function () { copyStandalonePassword(); });
  on('#pwdConfirmEye', 'click', function () { togglePwdVisibility('pwdConfirm', 'pwdConfirmEye'); });

  // ---------- Templates modal ------------------------------------------------
  on('#btnImportTemplate',  'click',  function () { importTemplateFromFile(); });
  on('#btnExportTemplates', 'click',  function () { exportTemplatesToFile(); });
  on('#templateFileInput',  'change', function () { handleTemplateFileLoad(this); });

  // ---------- Report modal ---------------------------------------------------
  on('#lbl-report-generate', 'click', function () { generateReport(); });

  // ---------- Auto report modal ----------------------------------------------
  on('#btnAddAutoReport', 'click', function () { addAutoReport(); });

  // ---------- Dependencies modal ---------------------------------------------
  on('#depSearch',        'input', function () { filterDepSearch(); });
  on('#btnSaveDeps',      'click', function () { saveDependencies(); });

  // ---------- Map modal ------------------------------------------------------
  on('#btnSaveMapLocation', 'click', function () { saveMapLocation(); });

  // ---------- Backup modal ---------------------------------------------------
  on('#btnDownloadBackup', 'click', function () { downloadBackup(); });
  on('#btnUploadRestore',  'click', function () { uploadRestore(); });

  // ---------- Gradual backup modal -------------------------------------------
  on('#btnSaveGradualSettings', 'click', function () { saveGradualBackupSettings(); });
  on('#btnSnapshotNow',         'click', function () { createGradualSnapshotNow(); });

  // ---------- PVA modal ------------------------------------------------------
  on('#btnExportPVA', 'click', function () { exportPVAReport(); });

  // ---------- Export modal ---------------------------------------------------
  on('#btnExportJSON', 'click', function () { doExport('json'); });
  on('#btnExportICS',  'click', function () { doExport('ics'); });
  on('#btnExportCSV',  'click', function () { doExport('csv'); });

  // ---------- Import modal ---------------------------------------------------
  on('#btnDoImport', 'click', function () { doImport(); });

  // ---------- Role editor modal ----------------------------------------------
  on('#btnAddNewRole', 'click', function () { addNewRoleRow(); });
  on('#btnSaveRoles',  'click', function () { saveRoles(); });
  on('#btnResetRoleDefaults', 'click', function () { resetRoleDefaults(); });
  on('#btnShowRoleChanges', 'click', function () { showRoleChanges(); });
  on('#btnRoleEditorHelp', 'click', function () { roleEditorHelp(); });

  // ---------- Move event modal -----------------------------------------------
  on('#btnConfirmMove', 'click', function () { confirmMoveEvents(); });

  // ---------- Bulk status modal ----------------------------------------------
  on('#btnConfirmBulkStatus', 'click', function () { confirmBulkStatus(); });

  // ---------- Bulk actions modal ---------------------------------------------
  on('#baFilter', 'change', function () { updateBulkActionUI(); });
  on('#baValue',  'input',  function () { updateBulkUserAutocomplete(); });

  // Bulk action tabs (event delegation)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-bulk-tab]');
    if (btn) switchBulkTab(btn.getAttribute('data-bulk-tab'), btn);
  });

  on('#btnExecBulkStatus', 'click', function () { executeBulkStatus(); });
  on('#btnExecBulkType',   'click', function () { executeBulkType(); });
  on('#btnExecBulkDelete', 'click', function () { executeBulkDelete(); });

  // ---------- Multi-select bar -----------------------------------------------
  on('#btnMoveSelected',       'click', function () { openMoveSelectedDialog(); });
  on('#btnBulkStatusSelected', 'click', function () { openBulkStatusDialog(); });
  on('#btnBulkDeleteSelected', 'click', function () { bulkDeleteSelected(); });
  on('#btnClearSelection',     'click', function () { clearSelection(); });

  // ---------- Help modal -----------------------------------------------------
  on('#btnDetachHelp',  'click', function () { detachHelp(); });
  on('#helpSearchInput', 'input', function () { filterHelp(this.value); });

  // ---------- Icon picker (event delegation) ---------------------------------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-icon]');
    if (btn && btn.classList.contains('icon-pick-btn')) {
      pickEtypeIcon(btn.getAttribute('data-icon'));
    }
  });

});
