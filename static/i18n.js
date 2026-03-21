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
function _loadLang(code) {
  if (_langLoaded[code]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/static/lang/' + code + '.js';
    s.onload = () => { _langLoaded[code] = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function t(key) {
  const lang = (window.state && window.state.preferences && window.state.preferences.language) || 'en';
  // Auto-load missing language
  if (!TRANSLATIONS[lang] && !_langLoaded[lang]) {
    _loadLang(lang).then(() => {
      if (typeof updateUILabels === 'function') updateUILabels();
    });
  }
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

function getLocale() {
  const lang = (window.state && window.state.preferences && window.state.preferences.language) || 'en';
  const map = { en: 'en-GB', sv: 'sv-SE', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL', fi: 'fi-FI', da: 'da-DK', nb: 'nb-NO', et: 'et-EE', lv: 'lv-LV', lt: 'lt-LT', it: 'it-IT', es: 'es-ES', pt: 'pt-PT', pl: 'pl-PL', uk: 'uk-UA' };
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
