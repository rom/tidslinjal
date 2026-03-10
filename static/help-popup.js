'use strict';

/* ── i18n: read translations from opener ── */
function _t(key) {
  try {
    const lang = window.opener?.state?.preferences?.language || 'en';
    const TRANSLATIONS = window.opener?.TRANSLATIONS;
    if (TRANSLATIONS && TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) return TRANSLATIONS[lang][key];
    if (TRANSLATIONS && TRANSLATIONS.en && TRANSLATIONS.en[key]) return TRANSLATIONS.en[key];
  } catch(e) {}
  const fb = { help_title:'Help', help_search:'Search\u2026' };
  return fb[key] || key;
}

/* ── Theme sync: use class-based theming matching style.css ── */
const _themeClasses = ['light-mode', 'city-camo', 'urban-camo'];
function syncTheme() {
  try {
    const t = window.opener?.state?.preferences?.theme || 'dark';
    // Map theme name to CSS class (dark = no class)
    const wantClass = t === 'light' ? 'light-mode' : t === 'city-camo' ? 'city-camo' : t === 'urban-camo' ? 'urban-camo' : '';
    // Remove all theme classes first
    _themeClasses.forEach(c => document.body.classList.remove(c));
    if (wantClass) document.body.classList.add(wantClass);
    // Also set data-theme for any data-attribute-based styling
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
}

/* ── Language sync ── */
let _lastLang = '';
function syncLanguage() {
  try {
    const lang = window.opener?.state?.preferences?.language || 'en';
    if (lang === _lastLang) return;
    _lastLang = lang;
    // Update title
    const titleEl = document.querySelector('.help-win-title');
    if (titleEl) titleEl.textContent = 'Tidslinjal \u2014 ' + _t('help_title');
    document.title = 'Tidslinjal \u2014 ' + _t('help_title');
    // Update search placeholder
    const searchEl = document.getElementById('helpWinSearch');
    if (searchEl) searchEl.placeholder = _t('help_search');
  } catch(e) {}
}

// Initial sync + periodic polling
syncTheme();
syncLanguage();
setInterval(function() { syncTheme(); syncLanguage(); }, 2000);

// Bind search input (CSP-safe)
document.getElementById('helpWinSearch').addEventListener('input', function() { filterHelpWin(this.value); });

function filterHelpWin(q) {
  const sections = document.querySelectorAll('.help-section');
  const status = document.getElementById('helpWinStatus');
  if (!q.trim()) {
    sections.forEach(s => { s.classList.remove('hidden'); clearMarks(s); });
    if (status) status.textContent = '';
    return;
  }
  const lq = q.toLowerCase();
  let shown = 0;
  sections.forEach(s => {
    const text = s.textContent.toLowerCase();
    if (text.includes(lq)) {
      s.classList.remove('hidden');
      highlightMarks(s, q);
      shown++;
    } else {
      s.classList.add('hidden');
      clearMarks(s);
    }
  });
  if (status) status.textContent = shown + ' section' + (shown===1?'':'s');
}

function clearMarks(el) {
  el.querySelectorAll('mark').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
}

function highlightMarks(el, q) {
  clearMarks(el);
  const lq = q.toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(node => {
    const idx = node.nodeValue.toLowerCase().indexOf(lq);
    if (idx < 0) return;
    const before = document.createTextNode(node.nodeValue.slice(0, idx));
    const mark   = document.createElement('mark');
    mark.textContent = node.nodeValue.slice(idx, idx + q.length);
    const after  = document.createTextNode(node.nodeValue.slice(idx + q.length));
    const parent = node.parentNode;
    parent.insertBefore(before, node);
    parent.insertBefore(mark, node);
    parent.insertBefore(after, node);
    parent.removeChild(node);
  });
}
