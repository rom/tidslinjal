/* ============================================================
   Tidslinjal i18n — Dynamic language loader
   English is loaded inline; other languages loaded on demand.
   ============================================================ */

'use strict';

const TRANSLATIONS = {};

// Enabled languages (fetched from server; default to all until loaded)
window.enabledLanguages = null; // null = all enabled (not yet loaded)
fetch('/api/languages').then(r => r.json()).then(langs => {
  if (Array.isArray(langs)) window.enabledLanguages = langs;
}).catch(() => {});

function isLangEnabled(code) {
  if (!window.enabledLanguages) return true; // not loaded yet = show all
  return window.enabledLanguages.includes(code);
}

// Load a language file dynamically (returns a promise)
const _langLoaded = { en: true };
const _langLoading = {}; // in-flight promises to prevent duplicate loads
function _loadLang(code) {
  if (_langLoaded[code]) return Promise.resolve();
  if (_langLoading[code]) return _langLoading[code]; // reuse in-flight promise
  _langLoading[code] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/static/lang/' + code + '.js';
    s.onload = () => { _langLoaded[code] = true; delete _langLoading[code]; resolve(); };
    s.onerror = () => { delete _langLoading[code]; reject(); };
    document.head.appendChild(s);
  });
  return _langLoading[code];
}

function t(key) {
  const lang = (window.state && window.state.preferences && window.state.preferences.language) || 'en';
  // Auto-load missing language
  if (!TRANSLATIONS[lang] && !_langLoaded[lang]) {
    _loadLang(lang).then(() => {
      if (typeof updateUILabels === 'function') updateUILabels();
      // Re-render sidebar so dynamically generated content (settings, tools) gets translated
      var se = document.getElementById('sidebarContent');
      if (se) delete se.dataset.renderedTab;
      if (typeof renderSidebar === 'function') renderSidebar();
    });
  }
  // Return the localized value, falling back to English, and finally
  // to an empty string when the key is missing everywhere. Returning
  // "" instead of the raw key lets call sites chain `t(key) || 'default'`
  // to provide a hardcoded English fallback that survives missing keys.
  // Before: a missing key returned its own name so `t('foo') || 'bar'`
  // kept the raw literal "foo" visible in the UI (non-empty strings are
  // truthy) — which is exactly what the kt_help_br bug report showed.
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS.en && TRANSLATIONS.en[key]) || '';
}

function getLocale() {
  const lang = (window.state && window.state.preferences && window.state.preferences.language) || 'en';
  const map = { en: 'en-GB', sv: 'sv-SE', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL', fi: 'fi-FI', da: 'da-DK', nb: 'nb-NO', et: 'et-EE', lv: 'lv-LV', lt: 'lt-LT', it: 'it-IT', es: 'es-ES', pt: 'pt-PT', pl: 'pl-PL', uk: 'uk-UA', is: 'is-IS', ko: 'ko-KR', ja: 'ja-JP', hu: 'hu-HU' };
  return map[lang] || 'en-GB';
}

// Localised weekday name (full, e.g. "Monday", "Tuesday")
function localDayName(date) {
  return date.toLocaleDateString(getLocale(), { weekday: 'long' });
}

// Localised short month+day
function localShortDate(date) {
  return date.toLocaleDateString(getLocale(), { day: '2-digit', month: 'short' });
}
