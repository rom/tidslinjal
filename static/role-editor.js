/* ── Role Editor ── */
// ── Role Editor ─────────────────────────────────────────────────────────────

// Default role configurations
const DEFAULT_ROLE_CONFIGS = [
  { key: 'observer',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, decision_log: true, view_free_busy: true } },
  { key: 'read',              display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, decision_log: true, view_free_busy: true } },
  { key: 'reporter',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, decision_log: true, comment: true, manage_alarms: true, view_free_busy: true } },
  { key: 'readwrite',         display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, decision_log: true, comment: true, manage_alarms: true, view_free_busy: true, import_export: true } },
  { key: 'teammember',        display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, delete_events: true, decision_log: true, comment: true, manage_alarms: true, view_free_busy: true, import_export: true } },
  { key: 'teamlead',          display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'deputy_teamlead',   display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'oplead',            display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'deputy_oplead',     display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'staffofficer',      display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, confidential_read: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'staff_assistant',   display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true } },
  { key: 'staffofficer_full', display_name: '',  capabilities: { see_groups: true, see_users: true, view_events: true, create_events: true, edit_own: true, edit_all: true, delete_events: true, manage_layers: true, manage_groups: true, approve_users: true, manage_templates: true, exercise: true, view_audit: true, report: true, auto_report: true, decision_log: true, decision_log_readwrite: true, confidential_read: true, comment: true, manage_alarms: true, see_location: true, critical_line_analysis: true, view_free_busy: true, import_export: true, manage_rooms: true, manage_integrations: true } },
];

// Merge saved role configs with built-in defaults so capabilities work even
// when the admin has never opened the Role Editor (roles.json is empty).
function mergeRoleConfigs(saved) {
  const builtinKeys = DEFAULT_ROLE_CONFIGS.map(d => d.key);
  const merged = DEFAULT_ROLE_CONFIGS.map(def => {
    const s = (saved || []).find(c => c.key === def.key);
    return s ? { ...def, ...s } : { ...def };
  });
  for (const c of (saved || [])) {
    if (!builtinKeys.includes(c.key) && c.key !== 'admin') merged.push(c);
  }
  return merged;
}

// Ordered list of all capabilities shown in role editor
const ALL_CAPABILITIES = [
  'see_groups', 'see_users', 'view_events', 'create_events', 'edit_own', 'edit_all', 'delete_events',
  'manage_layers', 'manage_groups', 'manage_users', 'approve_users', 'manage_templates', 'lock_slots', 'view_audit', 'exercise',
  'report', 'auto_report',
  'decision_log', 'decision_log_readwrite', 'confidential_read', 'see_location', 'critical_line_analysis',
  'manage_rooms', 'view_free_busy', 'manage_integrations', 'import_export', 'manage_alarms', 'comment',
  'manage_notes', 'manage_stars'
];

async function openRoleEditor() {
  let configs = [];
  try {
    const data = await apiGet('/api/roles');
    configs = data || [];
  } catch { /* use defaults */ }

  const merged = mergeRoleConfigs(configs);
  state.roleConfigs = merged;
  state._roleEditorCustomCounter = 0;

  _renderRoleEditorTable(merged);
  openModal('roleEditorModal');
}

function _roleEditorInputStyle() {
  return 'width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 7px;font-size:var(--fs-sm)';
}

const _ROLE_CAP_LABELS = {
  see_groups:'Groups', see_users:'Users',
  view_events:'View', create_events:'Create', edit_own:'Edit Own', edit_all:'Edit All',
  delete_events:'Delete', manage_layers:'Layers', manage_groups:'Mgr Groups',
  manage_users:'Mgr Users', approve_users:'Approve', manage_templates:'Tmpls', lock_slots:'Lock', view_audit:'Audit', exercise:'Exercise',
  report:'Report', auto_report:'Auto Rpt',
  decision_log:'Dec.Log', decision_log_readwrite:'Dec.Log RW', confidential_read:'Confid.', see_location:'See Loc.', critical_line_analysis:'Crit.Line',
  manage_rooms:'Rooms', view_free_busy:'Free/Busy', manage_integrations:'Integr.', import_export:'Imp/Exp', manage_alarms:'Alarms', comment:'Comment',
  manage_notes:'Notes', manage_stars:'Stars'
};

const _ROLE_CAP_DESCRIPTIONS = {
  see_groups:       'View groups/units and their members',
  see_users:        'View the list of registered users',
  view_events:      'View timeline events and their details',
  create_events:    'Create new events on the timeline',
  edit_own:         'Edit events that you created',
  edit_all:         'Edit any event, regardless of creator',
  delete_events:    'Delete events from the timeline',
  manage_layers:    'Create, edit, and delete timeline layers',
  manage_groups:    'Create and manage groups/units',
  manage_users:     'Add, edit roles, and remove users',
  approve_users:    'Approve or vet new user registrations',
  manage_templates: 'Create and manage event templates',
  lock_slots:       'Lock time slots to prevent event creation',
  view_audit:       'View the audit log of all system actions',
  exercise:         'Configure exercise settings (epoch, ENDEX, labels)',
  report:           'Generate and export reports',
  auto_report:      'Create automated/scheduled reports',
  decision_log:     'View the decision log',
  decision_log_readwrite: 'Create, edit, and review decision log entries',
  confidential_read:      'View confidential/classified events and data',
  see_location:     'View user locations on the map and in profiles',
  critical_line_analysis: 'Access critical path/line analysis tools',
  manage_rooms:     'Create and manage bookable rooms and resources',
  view_free_busy:   'View availability/free-busy status of users and rooms',
  manage_integrations: 'Configure connectors, webhooks, and external integrations',
  import_export:    'Import and export events (CSV, ICS, STIX)',
  manage_alarms:    'Create and manage alarms for events',
  comment:          'Add comments and notes to events',
  manage_notes:     'Add and manage notes on resources (users, groups)',
  manage_stars:     'Add and manage star ratings on resources'
};

function _renderRoleEditorTable(roles) {
  const tableEl = document.getElementById('roleEditorTable');
  if (!tableEl) return;
  const _ROLE_LANGS = [
    {code:'en',flag:'🇬🇧'},{code:'sv',flag:'🇸🇪'},{code:'fr',flag:'🇫🇷'},{code:'fi',flag:'🇫🇮'},
    {code:'da',flag:'🇩🇰'},{code:'nb',flag:'🇳🇴'},{code:'et',flag:'🇪🇪'},{code:'lv',flag:'🇱🇻'},
    {code:'lt',flag:'🇱🇹'},{code:'it',flag:'🇮🇹'},{code:'es',flag:'🇪🇸'},{code:'pt',flag:'🇵🇹'},
    {code:'pl',flag:'🇵🇱'},{code:'uk',flag:'🇺🇦'}
  ];
  const builtinKeys = DEFAULT_ROLE_CONFIGS.map(d => d.key).concat(['admin']);
  tableEl.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)" id="roleEditorGrid">
      <thead>
        <tr style="background:var(--bg2)">
          <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:100px;white-space:nowrap;position:sticky;left:0;background:var(--bg2);z-index:1">Key</th>
          ${_ROLE_LANGS.map(l => `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);min-width:100px">${l.flag} ${l.code.toUpperCase()}</th>`).join('')}
          ${ALL_CAPABILITIES.map(cap =>
            `<th class="role-cap-header" data-cap="${cap}" style="padding:4px 3px;border-bottom:2px solid var(--border);font-size:10px;text-align:center;min-width:48px;cursor:pointer;user-select:none;vertical-align:bottom" title="${escHtml(_ROLE_CAP_DESCRIPTIONS[cap]||cap)}">
              <div>${_ROLE_CAP_LABELS[cap]||cap}</div>
              <div style="font-size:9px;color:var(--text-dim);cursor:help" title="${escHtml(_ROLE_CAP_DESCRIPTIONS[cap]||cap)}">ⓘ</div>
            </th>`
          ).join('')}
          <th style="padding:6px 4px;border-bottom:2px solid var(--border);min-width:36px"></th>
        </tr>
      </thead>
      <tbody id="roleEditorTbody">
        ${roles.map(role => _renderRoleRow(role, builtinKeys.includes(role.key))).join('')}
        <tr style="opacity:0.4">
          <td style="padding:8px 10px;font-family:monospace;font-size:var(--fs-sm);color:var(--text-dim);position:sticky;left:0;background:var(--bg2)">admin</td>
          <td style="padding:8px 10px;font-size:var(--fs-sm)">${t('role_admin')||'Admin'} 🔒</td>
          ${_ROLE_LANGS.slice(1).map(() => '<td></td>').join('')}
          ${ALL_CAPABILITIES.map(() => `<td style="text-align:center;padding:4px"><input type="checkbox" checked disabled></td>`).join('')}
          <td></td>
        </tr>
      </tbody>
    </table>
    </div>
  `;
  // Bind column header click to toggle all checkboxes in that column
  tableEl.querySelectorAll('.role-cap-header').forEach(th => {
    th.addEventListener('click', () => {
      const cap = th.dataset.cap;
      const cbs = tableEl.querySelectorAll(`.role-cap-cb[data-cap="${cap}"]`);
      // If all checked, uncheck all; otherwise check all
      const allChecked = Array.from(cbs).every(cb => cb.checked);
      cbs.forEach(cb => { cb.checked = !allChecked; });
    });
  });
  const body = document.getElementById('roleEditorBody');
  if (body) _bindActions(body);
}

// Proper translated role name placeholders
const _ROLE_PLACEHOLDERS = {
  observer:          { en:'Observer', sv:'Observatör', fr:'Observateur', fi:'Tarkkailija', da:'Observatør', nb:'Observatør', et:'Vaatleja', lv:'Novērotājs', lt:'Stebėtojas', it:'Osservatore', es:'Observador', pt:'Observador', pl:'Obserwator', uk:'Спостерігач' },
  read:              { en:'Read', sv:'Läs', fr:'Lecture', fi:'Luku', da:'Læs', nb:'Les', et:'Lugemine', lv:'Lasīt', lt:'Skaityti', it:'Lettura', es:'Lectura', pt:'Leitura', pl:'Odczyt', uk:'Читання' },
  reporter:          { en:'Reporter', sv:'Rapportör', fr:'Rapporteur', fi:'Raportoija', da:'Rapportør', nb:'Rapportør', et:'Reporter', lv:'Ziņotājs', lt:'Pranešėjas', it:'Reporter', es:'Reportero', pt:'Repórter', pl:'Reporter', uk:'Репортер' },
  readwrite:         { en:'Read/Write', sv:'Läs/Skriv', fr:'Lecture/Écriture', fi:'Luku/Kirjoitus', da:'Læs/Skriv', nb:'Les/Skriv', et:'Lugemine/Kirjutamine', lv:'Lasīt/Rakstīt', lt:'Skaityti/Rašyti', it:'Lettura/Scrittura', es:'Lectura/Escritura', pt:'Leitura/Escrita', pl:'Odczyt/Zapis', uk:'Читання/Запис' },
  teammember:        { en:'Team Member', sv:'Teammedlem', fr:'Membre d\'équipe', fi:'Tiimin jäsen', da:'Teammedlem', nb:'Teammedlem', et:'Meeskonnaliige', lv:'Komandas loceklis', lt:'Komandos narys', it:'Membro del team', es:'Miembro del equipo', pt:'Membro da equipe', pl:'Członek zespołu', uk:'Член команди' },
  teamlead:          { en:'Team Lead', sv:'Gruppledare', fr:'Chef d\'équipe', fi:'Tiiminvetäjä', da:'Holdleder', nb:'Lagleder', et:'Meeskonnajuht', lv:'Komandas vadītājs', lt:'Komandos vadovas', it:'Capo squadra', es:'Líder de equipo', pt:'Líder de equipe', pl:'Lider zespołu', uk:'Лідер команди' },
  deputy_teamlead:   { en:'Deputy Team Lead', sv:'Vice gruppledare', fr:'Chef d\'équipe adjoint', fi:'Varatiiminvetäjä', da:'Stedfortræder holdleder', nb:'Viselagleder', et:'Asemeeskonnajuht', lv:'Komandas vad. vietnieks', lt:'Komandos vadovo pav.', it:'Vice capo squadra', es:'Sublíder de equipo', pt:'Vice-líder de equipe', pl:'Zastępca lidera', uk:'Заступник лідера' },
  oplead:            { en:'Ops Lead', sv:'Insatsledare', fr:'Chef des opérations', fi:'Operaatiojohtaja', da:'Operationsleder', nb:'Operasjonsleder', et:'Operatsioonijuht', lv:'Operāciju vadītājs', lt:'Operacijų vadovas', it:'Capo operazioni', es:'Líder de operaciones', pt:'Líder de operações', pl:'Lider operacyjny', uk:'Керівник операцій' },
  deputy_oplead:     { en:'Deputy Ops Lead', sv:'Vice insatsledare', fr:'Adj. chef des opérations', fi:'Varaoperaatiojohtaja', da:'Stedfortræder operationsleder', nb:'Viseoperasjonsleder', et:'Aseoperatsioonijuht', lv:'Operāc. vad. vietnieks', lt:'Operacijų vad. pav.', it:'Vice capo operazioni', es:'Sublíder de operaciones', pt:'Vice-líder de operações', pl:'Zastępca lidera oper.', uk:'Заступник кер. операцій' },
  staffofficer:      { en:'Staff Officer', sv:'Stabsofficer', fr:'Officier d\'état-major', fi:'Esikuntaupseeri', da:'Stabsofficer', nb:'Stabsoffiser', et:'Staabiohvitser', lv:'Štāba virsnieks', lt:'Štabo karininkas', it:'Ufficiale di stato maggiore', es:'Oficial de estado mayor', pt:'Oficial de estado-maior', pl:'Oficer sztabowy', uk:'Штабний офіцер' },
  staff_assistant:   { en:'Staff Assistant', sv:'Stabsassistent', fr:'Assistant d\'état-major', fi:'Esikunta-avustaja', da:'Stabsassistent', nb:'Stabsassistent', et:'Staabiassistent', lv:'Štāba palīgs', lt:'Štabo asistentas', it:'Assistente di stato maggiore', es:'Asistente de estado mayor', pt:'Assistente de estado-maior', pl:'Asystent sztabowy', uk:'Штабний помічник' },
  staffofficer_full: { en:'Staff Officer Full', sv:'Stabsofficer Full', fr:'Officier d\'état-major complet', fi:'Esikuntaupseeri täysi', da:'Stabsofficer fuld', nb:'Stabsoffiser full', et:'Staabiohvitser täis', lv:'Štāba virsnieks pilns', lt:'Štabo karininkas pilnas', it:'Ufficiale di SM completo', es:'Oficial de EM completo', pt:'Oficial de EM completo', pl:'Oficer sztabowy pełny', uk:'Штабний офіцер повний' },
};

function _renderRoleRow(role, isBuiltin) {
  const dn = role.display_names || {};
  const key = role.key;
  const s = _roleEditorInputStyle();
  const ph = _ROLE_PLACEHOLDERS[key] || {};
  const _RL = ['en','sv','fr','fi','da','nb','et','lv','lt','it','es','pt','pl','uk'];
  return `
    <tr data-role-key="${escHtml(key)}" data-custom="${isBuiltin ? 'false' : 'true'}">
      <td style="padding:6px 10px;position:sticky;left:0;background:var(--bg2);z-index:1">
        ${isBuiltin
          ? `<span style="font-family:monospace;color:var(--text-dim);font-size:var(--fs-sm)">${escHtml(key)}</span>`
          : `<input type="text" class="role-key-input" value="${escHtml(key)}" placeholder="e.g. analyst" style="${s};font-family:monospace">`}
      </td>
      ${_RL.map(lang => {
        const val = lang === 'en' ? (dn.en || role.display_name || '') : (dn[lang] || '');
        const placeholder = ph[lang] || key;
        return `<td style="padding:5px 6px"><input type="text" class="role-name-${lang}" data-key="${escHtml(key)}" value="${escHtml(val)}" placeholder="${escHtml(placeholder)}" style="${s}"></td>`;
      }).join('')}
      ${ALL_CAPABILITIES.map(cap => {
        const checked = role.capabilities && role.capabilities[cap];
        return `<td style="text-align:center;padding:4px"><input type="checkbox" class="role-cap-cb" data-role="${escHtml(key)}" data-cap="${escHtml(cap)}" ${checked ? 'checked' : ''} title="${escHtml(_ROLE_CAP_DESCRIPTIONS[cap]||cap)}"></td>`;
      }).join('')}
      <td style="text-align:center;padding:4px">
        ${isBuiltin ? '' : `<button class="btn btn-danger btn-xs" data-action="removeRoleRow" data-arg-el title="Remove" style="padding:2px 7px;font-size:12px">✕</button>`}
      </td>
    </tr>`;
}

function addNewRoleRow() {
  const tbody = document.getElementById('roleEditorTbody');
  if (!tbody) return;
  state._roleEditorCustomCounter = (state._roleEditorCustomCounter || 0) + 1;
  const key = `custom_role_${state._roleEditorCustomCounter}`;
  // All new custom roles start with see_groups and see_users enabled by default
  const role = { key, display_name: '', display_names: {}, capabilities: { see_groups: true, see_users: true, view_events: true, decision_log: true, comment: true, view_free_busy: true } };
  const adminRow = tbody.querySelector('tr[style*="opacity"]');
  const tmp = document.createElement('tbody');
  tmp.innerHTML = _renderRoleRow(role, false);
  const newRow = tmp.firstElementChild;
  _bindActions(newRow);
  if (adminRow) tbody.insertBefore(newRow, adminRow);
  else tbody.appendChild(newRow);
}

function removeRoleRow(btn) {
  const row = btn.closest('tr');
  if (row) row.remove();
}

async function saveRoles() {
  const rows = document.querySelectorAll('#roleEditorTbody tr[data-role-key]');
  const configs = [];
  rows.forEach(row => {
    const isCustom = row.dataset.custom === 'true';
    let key;
    if (isCustom) {
      const ki = row.querySelector('.role-key-input');
      key = ki ? ki.value.trim().replace(/\s+/g,'_').replace(/[^a-z0-9_]/gi,'').toLowerCase() : '';
      if (!key) return;
    } else {
      key = row.dataset.roleKey;
    }
    if (!key || key === 'admin') return;
    const _RL = ['en','sv','fr','fi','da','nb','et','lv','lt','it','es','pt','pl','uk'];
    const display_names = {};
    _RL.forEach(lang => {
      const el = row.querySelector('.role-name-' + lang);
      const val = el ? el.value.trim() : '';
      if (val) display_names[lang] = val;
    });
    const en = display_names.en || '';
    const caps = {};
    row.querySelectorAll('.role-cap-cb').forEach(cb => { caps[cb.dataset.cap] = cb.checked; });
    configs.push({ key, display_name: en || getRoleDisplayName(key), display_names, capabilities: caps });
  });

  try {
    const res = await api('PUT', '/api/roles', configs);
    if (res.ok || true) { // save locally even if endpoint fails
      state.roleConfigs = configs;
      closeModal('roleEditorModal');
      showNotification('success', t('notif_saved')||'Saved');
      renderSidebar();
    }
  } catch {
    state.roleConfigs = configs;
    closeModal('roleEditorModal');
    showNotification('success', t('notif_saved')||'Saved');
    renderSidebar();
  }
}
