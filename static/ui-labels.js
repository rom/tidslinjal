/* ── UI Labels ── */
// ── updateUILabels, updateLangFlags ───────────────────────────────────────
function updateUILabels() {
  // Header buttons
  document.getElementById('btnToday').textContent    = t('today');
  const znBtn = document.getElementById('btnZoomNow');
  if (znBtn) znBtn.title = t('zoom_now');
  setElText('btnAddEvent', t('add_event'));
  setElText('btnAddLock', t('lock_slot'));
  setElText('btnLogout', t('logout'));
  setElText('btnExport', t('btn_export'));
  setElText('btnReport', t('btn_report'));
  setElText('lbl-show', t('show')+':');
  setElText('lbl-res', t('resolution')+':');

  // Toolbar group buttons
  setElText('btnTemplates', '📋 ' + (t('btn_templates')||'Templates'));
  setElText('btnLayerToggle', '🗂 ' + (t('btn_layers')||'Layers'));
  setElText('btnImport', t('btn_import')||'⬆ Import');
  setElText('btnSyntheticTime', t('btn_synth_time')||'⏱ T+');
  setElText('btnPrint', '🖨 ' + (t('btn_print')||'Print'));
  setElText('btnFilter', '🔍 ' + (t('btn_filter')||'Filter'));
  const undoEl = document.getElementById('btnUndo');
  if (undoEl) undoEl.textContent = '↩ ' + (t('btn_undo')||'Undo');

  // Range select options
  const rs = document.getElementById('rangeSelect');
  const rangeKeys = ['day','2days','3days','4days','5days','week','2weeks','3weeks','month','2months','3months'];
  [...rs.options].forEach(opt => { opt.text = t('range_'+opt.value) || opt.text; });

  // Resolution select
  const res = document.getElementById('resolutionSelect');
  [...res.options].forEach(opt => { opt.text = t('res_'+opt.value); });

  // Sidebar tabs — use dynamic group terminology for the groups tab
  const gl = getGroupLabel();
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    if (tab.dataset.tab) tab.textContent = t('tab_'+tab.dataset.tab) || tab.dataset.tab;
  });

  // Invited filter "Groups" button uses group terminology
  const filterGroupsBtn = document.querySelector('.inv-filter-btn[data-filter="groups"]');
  if (filterGroupsBtn) filterGroupsBtn.textContent = gl.plural;

  // Move event dialog labels
  setElText('lbl-move-event-time', t('move_event_new_time')||'New date and time');
  setElText('btnConfirmMove', t('move_event_btn')||'Move');
  setElText('lbl-role-editor-title', t('role_editor_title')||'🛡 Role Editor');
  setElText('lbl-role-editor-desc', t('role_editor_desc')||'Edit display names for each role.');
  setElText('btnSaveRoles', t('role_editor_save')||'Save Roles');

  // Alarm modal
  setElText('lbl-alarm-cancel', t('btn_cancel'));
  setElText('btnSaveAlarm', t('alarm_set'));

  // Lock modal
  setElText('lbl-lock-cancel', t('btn_cancel'));
  setElText('btnSaveLock', t('btn_lock'));

  // Event modal
  setElText('lbl-btn-cancel', t('btn_cancel'));
  setElText('btnSaveEvent', t('btn_save'));
  setElText('btnDeleteEvent', t('btn_delete'));
  setElText('lbl-ev-title', t('ev_title') || 'Title');
  setElText('lbl-ev-type', t('ev_type') || 'Type');
  setElText('lbl-ev-color', t('ev_color') || 'Color');
  setElText('lbl-ev-start', t('ev_start') || 'Start');
  setElText('lbl-ev-end', t('ev_end') || 'End');
  setElText('lbl-ev-layer', t('ev_layer') || 'Layer');
  setElText('lbl-ev-status', t('ev_status') || 'Status');
  setElText('lbl-ev-desc', t('ev_description') || 'Description');
  setElText('lbl-ev-location', t('ev_location') || 'Physical Location');
  setElText('lbl-ev-contact-type', t('ev_contact_type') || 'Contact type');
  setElText('lbl-ev-virtual-type', t('ev_virtual_type') || 'Virtual meeting platform');
  setElText('lbl-ev-participant', t('ev_participant') || 'Participant');
  setElText('lbl-ev-allday', t('ev_allday') || 'Day-only (no specific time)');
  setElText('lbl-ev-recurring', t('ev_recurring') || 'Recurring');
  setElText('lbl-ev-pattern', t('ev_pattern') || 'Pattern');
  setElText('lbl-ev-recend', t('ev_rec_end') || 'Recurrence End');
  setElText('lbl-ev-attach', t('ev_attachment') || 'Attachment');
  setElText('lbl-ev-responsible', t('ev_responsible') || 'Responsible');
  setElText('lbl-ev-invited', t('ev_invited') || 'Invited (notify on creation)');
  setElText('lbl-report-layers', t('report_layers') || 'Layers to include');
  // Status options
  const evStatus = document.getElementById('eventStatus');
  if (evStatus) {
    [...evStatus.options].forEach(opt => { opt.text = t('status_'+opt.value) || opt.text; });
  }
  // Recurrence pattern options
  const evPat = document.getElementById('eventRecurrencePattern');
  if (evPat) {
    [...evPat.options].forEach(opt => { opt.text = t('event_pattern_'+opt.value) || opt.text; });
  }

  // User modal
  setElText('lbl-u-username', t('user_username_lbl') || t('user_username'));
  setElText('lbl-u-password', t('user_password'));
  setElText('lbl-u-display', t('user_display'));
  setElText('lbl-u-role', t('user_role'));
  setElText('lbl-u-canlock', t('user_can_lock'));
  setElText('lbl-u-groups', t('user_groups'));
  setElText('lbl-u-changepwd', t('change_password'));
  setElText('lbl-u-cancel', t('btn_cancel'));
  setElText('btnSaveUser', t('btn_save'));
  setElText('btnDeleteUser', t('user_delete'));
  const uRole = document.getElementById('uRole');
  if (uRole) {
    const roleMap = {
      observer:'role_observer',read:'role_read',reporter:'role_reporter',
      readwrite:'role_teammember',teammember:'role_teammember',teamlead:'role_teamlead',oplead:'role_oplead',
      staffofficer:'role_staffofficer',staffofficer_full:'role_staffofficer_full',admin:'role_admin'
    };
    [...uRole.options].forEach(opt => { const k = roleMap[opt.value]; if (k) opt.text = t(k) || opt.text; });
  }

  // Password modal
  setElText('lbl-pwd-title', t('change_password'));
  setElText('lbl-pwd-current', t('current_password'));
  setElText('lbl-pwd-new', t('new_password'));
  setElText('lbl-pwd-confirm', t('confirm_password'));
  setElText('lbl-pwd-cancel', t('btn_cancel'));
  setElText('btnSavePassword', t('change_password'));

  // Phase modal
  setElText('lbl-phase-name', t('phase_name'));
  setElText('lbl-phase-color', t('phase_color'));
  setElText('lbl-phase-start', t('phase_start'));
  setElText('lbl-phase-end', t('phase_end'));
  setElText('lbl-phase-order', t('phase_order_lbl') || 'Order (0-9)');
  setElText('lbl-phase-layer', t('phase_layer_lbl') || 'Layer (empty = master timeline)');
  setElText('lbl-phase-cancel', t('btn_cancel'));
  setElText('btnSavePhase', t('btn_save'));
  setElText('btnDeletePhase', t('btn_delete'));

  // Group modal
  setElText('lbl-group-name', t('group_name_lbl') || 'Name *');
  setElText('lbl-group-desc', t('event_description'));
  setElText('lbl-group-cancel', t('btn_cancel'));
  setElText('btnSaveGroup', t('btn_save'));
  setElText('btnDeleteGroup', t('btn_delete'));

  // Layer modal
  setElText('lbl-layer-name', t('layer_name_lbl') || 'Name *');
  setElText('lbl-layer-color', t('event_type_color'));
  setElText('lbl-layer-desc', t('event_description'));
  setElText('lbl-layer-vis', t('layer_visibility') || 'Visibility');
  setElText('lbl-vis-private', t('layer_visibility_private') || 'Private');
  setElText('lbl-vis-groups', t('layer_visibility_groups') || 'Groups');
  setElText('lbl-vis-public', t('layer_visibility_public') || 'Public');
  setElText('lbl-layer-perm', t('layer_perm_lbl') || 'Group Permission');
  setElText('lbl-layer-groups', t('layer_shared_groups'));
  setElText('lbl-layer-cancel', t('btn_cancel'));
  setElText('btnSaveLayer', t('btn_save'));
  setElText('btnDeleteLayer', t('btn_delete'));
  const lVis = document.getElementById('layerVisibility');
  if (lVis) {
    const visMap = {private:'layer_visibility_private',groups:'layer_visibility_groups',public:'layer_visibility_public'};
    [...lVis.options].forEach(opt => { opt.text = t(visMap[opt.value]) || opt.text; });
  }
  const lPerm = document.getElementById('layerPermission');
  if (lPerm) {
    const permMap = {read:'layer_permission_read',readwrite:'layer_permission_readwrite'};
    [...lPerm.options].forEach(opt => { opt.text = t(permMap[opt.value]) || opt.text; });
  }

  // Event type modal
  setElText('lbl-etype-key', t('event_type_key'));
  setElText('lbl-etype-color', t('event_type_color'));
  setElText('lbl-etype-label', t('event_type_label'));
  setElText('lbl-etype-label-sv', t('event_type_label_sv'));
  setElText('lbl-etype-label-fr', t('event_type_label_fr'));
  setElText('lbl-etype-cancel', t('btn_cancel'));
  setElText('btnSaveEtype', t('btn_save'));
  setElText('btnDeleteEtype', t('btn_delete'));

  // Report modal
  setElText('lbl-report-title', '📄 ' + (t('report_title') || 'Generate Report'));
  setElText('lbl-report-type', t('report_type_label') || 'Report type');
  setElText('lbl-report-format', t('report_format_label') || 'Format');
  setElText('lbl-report-from', t('event_start'));
  setElText('lbl-report-to', t('event_end'));
  setElText('lbl-report-cancel', t('btn_cancel'));
  setElText('lbl-report-generate', t('report_generate'));
  const rType = document.getElementById('reportType');
  if (rType) {
    const typeMap = {
      aar: t('report_type_aar'),
      timeline: t('report_type_timeline'),
      per_layer: t('report_type_perlayer') || 'Per-Layer Activity',
      status_summary: t('report_type_status') || 'Status Summary',
      daily_briefing: t('report_type_daily') || 'Daily Briefing',
      type_breakdown: t('report_type_type') || 'Event Type Breakdown',
      responsible: t('report_type_responsible') || 'Responsible / Resource Report',
      planned_vs_actual: t('report_type_pva') || 'Planned vs. Actual',
      critical_path: t('report_type_cp') || 'Critical Path Analysis',
      poll: t('report_poll') || 'Poll Report',
    };
    [...rType.options].forEach(opt => { opt.text = typeMap[opt.value] || opt.text; });
  }
  const rFmt = document.getElementById('reportFormat');
  if (rFmt) {
    const fmtMap = {html: t('report_format_html_opt') || t('report_format_html'), print: t('report_format_print_opt') || t('report_format_pdf')};
    [...rFmt.options].forEach(opt => { opt.text = fmtMap[opt.value] || opt.text; });
  }

  // Member modal
  setElText('lbl-member-close', t('btn_close'));

  // Context menu
  setElText('ctxEdit', '✏️ ' + t('ctx_edit'));
  setElText('ctxDuplicate', '⧉ ' + t('ctx_duplicate'));
  setElText('ctxAlarm', '🔔 ' + t('ctx_alarm'));
  setElText('ctxMove', '📅 ' + t('ctx_move'));
  setElText('ctxDelete', '🗑 ' + t('ctx_delete'));
  setElText('ctxStatusPlanned', t('ctx_set_planned'));
  setElText('ctxStatusActive', t('ctx_set_active'));
  setElText('ctxStatusCompleted', t('ctx_set_completed'));
  setElText('ctxStatusCancelled', t('ctx_set_cancelled'));
  // Slot context menu
  const slotCtx = document.getElementById('slotContextMenu');
  if (slotCtx) {
    const items = slotCtx.querySelectorAll('.context-menu-item');
    if (items[0]) items[0].textContent = t('ctx_add_event_here');
    if (items[1]) items[1].textContent = t('ctx_lock_this_slot');
  }

  // Mobile nav
  setElText('mnTimeline', '📅' + t('mobile_timeline'));
  setElText('mnList', '📋' + t('mobile_list'));
  setElText('mnLegend', '🏷️' + t('mobile_legend'));
  setElText('mnLayers', '📂' + t('mobile_layers'));
  setElText('mnSettings', '⚙️' + t('mobile_settings'));
  setElText('mnMenu', '☰' + t('mobile_more'));

  // Filter panel
  const filterPanel = document.getElementById('filterPanel');
  if (filterPanel) {
    const filterLabels = filterPanel.querySelectorAll('.filter-section-title');
    // These are set via IDs below instead
  }
  setElText('filterStatusLabel', t('filter_by_status'));
  setElText('filterResponsibleLabel', t('filter_by_responsible'));
  setElText('filterLayerLabel', t('filter_by_layer'));
  setElText('btnApplyFilter', t('filter_apply'));
  setElText('btnSaveFilterPreset', t('filter_preset_save'));
  const presetInput = document.getElementById('filterPresetName');
  if (presetInput) presetInput.placeholder = t('filter_preset_name_ph');

  // Templates modal
  setElText('btnSaveTemplate', '💾 ' + t('tmpl_save_current'));
  setElText('btnImportTemplate', '📂 ' + t('tmpl_load_file'));
  setElText('btnExportTemplates', '⬇ ' + t('tmpl_save_file'));

  // Recurring event modals
  setElText('recurEditThis', t('recur_edit_this'));
  setElText('recurEditFuture', t('recur_edit_future'));
  setElText('recurEditAll', t('recur_edit_all'));
  setElText('recurDelThis', t('recur_delete_this'));
  setElText('recurDelFuture', t('recur_delete_future'));
  setElText('recurDelAll', t('recur_delete_all'));

  // Alarm modal extras
  setElText('lbl-alarm-title', t('alarm_title'));
  setElText('lbl-alarm-event', t('alarm_event'));
  setElText('lbl-alarm-time', t('alarm_time'));
  setElText('lbl-alarm-remind', t('alarm_remind'));
  setElText('lbl-alarm-sound', t('alarm_sound'));
  setElText('lbl-alarm-webhook', t('alarm_webhook'));
  const alarmLead = document.getElementById('alarmLeadTime');
  if (alarmLead) {
    const alarmMap = {'0':'alarm_at_time','5':'alarm_5min','10':'alarm_10min','15':'alarm_15min','30':'alarm_30min','60':'alarm_1hr'};
    [...alarmLead.options].forEach(opt => { const k = alarmMap[opt.value]; if (k) opt.text = t(k); });
  }
  const alarmSound = document.getElementById('alarmSound');
  if (alarmSound) {
    const sndMap = {klaxon:'🔊 '+t('alarm_sound_klaxon'),alert:'🔔 '+t('alarm_sound_alert'),siren:'🚨 '+t('alarm_sound_siren'),chime:'🎵 '+t('alarm_sound_chime'),beep:'📢 '+t('alarm_sound_beep'),none:'🔇 '+t('alarm_sound_silent')};
    [...alarmSound.options].forEach(opt => { if (sndMap[opt.value]) opt.text = sndMap[opt.value]; });
  }

  // Lock modal extras
  setElText('lbl-lock-title', t('lock_title'));
  setElText('lbl-existing-locks', t('lock_active_locks'));
  setElText('lbl-add-lock', t('lock_add_new'));
  setElText('lbl-lock-start', t('lock_start') + ' *');
  setElText('lbl-lock-end', t('lock_end') + ' *');
  setElText('lbl-lock-scope', t('lock_scope'));
  setElText('lbl-lock-layer', t('lock_layer'));
  setElText('lbl-lock-reason', t('lock_reason'));
  const lockScope = document.getElementById('lockScope');
  if (lockScope) {
    const scopeMap = {all:'lock_scope_all',master:'lock_scope_master',layer:'lock_scope_layer'};
    [...lockScope.options].forEach(opt => { const k = scopeMap[opt.value]; if (k) opt.text = t(k); });
  }

  // Error modal
  setElText('errorModalTitle', t('error_title'));

  // Translate any element with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated && translated !== key) {
      // Preserve child elements (e.g. sort indicator spans in list-view table headers)
      const children = Array.from(el.children);
      el.textContent = translated;
      children.forEach(child => { el.appendChild(document.createTextNode(' ')); el.appendChild(child); });
    }
  });

  // Search placeholder
  const si = document.getElementById('searchInput');
  if (si) si.placeholder = t('search_placeholder') || 'Search…';

  // Language flag active state
  updateLangFlags();
}

function updateLangFlags() {
  const lang = (state.preferences && state.preferences.language) || 'en';
  ['EN', 'SV', 'FR', 'DE', 'NL', 'FI', 'IS', 'DA', 'NB', 'ET', 'LV', 'LT', 'IT', 'ES', 'PT', 'PL', 'UK', 'JA', 'KO'].forEach(code => {
    const btn = document.getElementById('flag'+code);
    if (btn) btn.classList.toggle('active', lang === code.toLowerCase());
  });
}

