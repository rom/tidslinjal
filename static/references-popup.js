'use strict';
const catColors = { handbook:'#3498DB', sop:'#E67E22', policy:'#9B59B6', map:'#2ECC71', reference:'#1ABC9C', checklist:'#27AE60', faq:'#F39C12', objectives:'#E74C3C', presentation_material:'#E91E63', exercise_documents:'#8E44AD', other:'#95A5A6' };
let references = [];
let gitEnabled = false;

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function getOpener() {
  try { return window.opener && !window.opener.closed ? window.opener : null; } catch(e) { return null; }
}

function syncTheme() {
  try {
    const t = window.opener?.state?.preferences?.theme || 'dark';
    document.body.className = 'theme-' + t;
  } catch(e) {}
}

// BroadcastChannel for theme sync
try {
  var _refBC = new BroadcastChannel('tidslinjal-sync');
  _refBC.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      document.body.className = 'theme-' + (e.data.theme || 'dark');
    }
  };
} catch(e) {}

async function loadReferences() {
  try {
    const res = await fetch('/api/references');
    if (res.ok) references = await res.json() || [];
  } catch { references = []; }
  render();
}

async function checkGitIntegration() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      if (data.github_enabled) {
        gitEnabled = true;
        document.getElementById('gitBar').style.display = '';
      }
    }
  } catch {}
}

async function gitSaveRefs() {
  const btn = document.getElementById('btnGitSave');
  btn.textContent = '⏳ Saving...';
  try {
    const _csrfSave = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const _hdrsSave = {'X-Requested-With': 'XMLHttpRequest'};
    if (_csrfSave) _hdrsSave['X-CSRF-Token'] = _csrfSave[1];
    const res = await fetch('/api/references/git/save', { method: 'POST', headers: _hdrsSave });
    if (res.ok) {
      document.getElementById('gitStatus').textContent = '✓ Saved at ' + new Date().toLocaleTimeString();
    } else {
      const err = await res.json().catch(() => ({}));
      document.getElementById('gitStatus').textContent = '✗ ' + (err.error || 'Save failed');
    }
  } catch(e) {
    document.getElementById('gitStatus').textContent = '✗ Error: ' + e.message;
  }
  btn.textContent = '💾 Save to Git';
}

async function gitLoadRefs() {
  const btn = document.getElementById('btnGitLoad');
  btn.textContent = '⏳ Loading...';
  try {
    const _csrfLoad = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const _hdrsLoad = {'X-Requested-With': 'XMLHttpRequest'};
    if (_csrfLoad) _hdrsLoad['X-CSRF-Token'] = _csrfLoad[1];
    const res = await fetch('/api/references/git/load', { method: 'POST', headers: _hdrsLoad });
    if (res.ok) {
      document.getElementById('gitStatus').textContent = '✓ Loaded at ' + new Date().toLocaleTimeString();
      await loadReferences();
    } else {
      const err = await res.json().catch(() => ({}));
      document.getElementById('gitStatus').textContent = '✗ ' + (err.error || 'Load failed');
    }
  } catch(e) {
    document.getElementById('gitStatus').textContent = '✗ Error: ' + e.message;
  }
  btn.textContent = '📥 Load from Git';
}

const _langNames = {en:'English',sv:'Svenska',fr:'Français',fi:'Suomi',de:'Deutsch',no:'Norsk',nb:'Norsk (Bokmål)',da:'Dansk',es:'Español',it:'Italiano',pt:'Português',nl:'Nederlands',pl:'Polski',ru:'Русский',et:'Eesti',lv:'Latviešu',lt:'Lietuvių'};

function updateInfoBar() {
  const infoBar = document.getElementById('refInfoBar');
  if (!infoBar) return;
  const catCounts = {};
  references.forEach(r => { const c = r.category || 'other'; catCounts[c] = (catCounts[c] || 0) + 1; });
  const total = references.length;
  const catKeys = ['handbook','sop','policy','map','reference','checklist','faq','objectives','other'];
  const badges = catKeys.filter(k => catCounts[k]).map(k =>
    `<span class="ref-cat" style="background:${catColors[k]}">${escHtml(k)} ${catCounts[k]}</span>`
  ).join('');
  infoBar.innerHTML = `<b>Total: ${total}</b> &nbsp; ${badges}`;
}

function updateLangFilter() {
  const langFilter = document.getElementById('refLangFilter');
  if (!langFilter) return;
  const usedLangs = new Set();
  references.forEach(r => { if (r.language) usedLangs.add(r.language); });
  const currentVal = langFilter.value || '';
  langFilter.innerHTML = '<option value="">All languages</option>';
  [...usedLangs].sort().forEach(lang => {
    langFilter.innerHTML += `<option value="${lang}"${lang === currentVal ? ' selected' : ''}>${_langNames[lang] || lang}</option>`;
  });
}

function render() {
  updateInfoBar();
  updateLangFilter();
  const el = document.getElementById('refContent');
  const search = (document.getElementById('refSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('refCatFilter')?.value || '';
  const lang = document.getElementById('refLangFilter')?.value || '';
  const filtered = references.filter(r => {
    if (cat && r.category !== cat) return false;
    if (lang && r.language !== lang) return false;
    if (search && !(r.title + ' ' + (r.description || '') + ' ' + (r.tags || []).join(' ')).toLowerCase().includes(search)) return false;
    return true;
  });
  if (filtered.length === 0) {
    el.innerHTML = '<div class="ref-empty">No references found.</div>';
    return;
  }
  el.innerHTML = filtered.map(r => {
    const sizeStr = r.size ? (r.size < 1024 ? r.size + ' B' : r.size < 1048576 ? (r.size/1024).toFixed(1) + ' KB' : (r.size/1048576).toFixed(1) + ' MB') : '';
    const dateStr = r.uploaded_at ? new Date(r.uploaded_at).toLocaleString() : '';
    return `<div class="ref-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span class="ref-cat" style="background:${catColors[r.category] || '#95A5A6'}">${escHtml(r.category || 'other')}</span>
          ${r.language ? `<span class="ref-tag" title="Language">${escHtml(_langNames[r.language] || r.language)}</span>` : ''}
          <b>${escHtml(r.title)}</b>
        </div>
        <div style="display:flex;gap:4px">
          ${r.ref_type === 'url' ? `<a href="${escHtml(r.url || '')}" target="_blank" rel="noopener" class="btn">🔗 Open</a>` :
            `<a href="/api/references/${r.id}/download" target="_blank" class="btn">⬇ Download</a>`}
        </div>
      </div>
      ${r.description ? `<div style="font-size:12px;color:var(--text-dim);margin-top:4px">${escHtml(r.description)}</div>` : ''}
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px">
        ${escHtml(r.original_name || '')} ${sizeStr} · Owner: ${escHtml(r.owner || r.uploaded_by_name || '—')} · Added: ${dateStr}
      </div>
      ${(r.tags || []).length ? `<div style="margin-top:4px">${r.tags.map(tg => `<span class="ref-tag">${escHtml(tg)}</span>`).join('')}</div>` : ''}
      ${r.checksum_md5 ? `<details style="margin-top:4px;font-size:10px;color:var(--text-dim)"><summary style="cursor:pointer;font-weight:600">Checksums</summary><div style="font-family:monospace;font-size:9px;word-break:break-all;margin-top:2px;padding:4px;background:var(--bg2);border-radius:3px;line-height:1.6">MD5: ${escHtml(r.checksum_md5)}<br>SHA-1: ${escHtml(r.checksum_sha1 || '')}<br>SHA-256: ${escHtml(r.checksum_sha256 || '')}<br>SHA-512: ${escHtml(r.checksum_sha512 || '')}</div></details>` : ''}
    </div>`;
  }).join('');
}

// Events
document.getElementById('btnRefresh').addEventListener('click', loadReferences);
document.getElementById('refSearch').addEventListener('input', render);
document.getElementById('refCatFilter').addEventListener('change', render);
document.getElementById('refLangFilter').addEventListener('change', render);
document.getElementById('btnGitSave').addEventListener('click', gitSaveRefs);
document.getElementById('btnGitLoad').addEventListener('click', gitLoadRefs);

// Theme sync
syncTheme();
setInterval(syncTheme, 3000);

// Init
loadReferences();
checkGitIntegration();
setInterval(loadReferences, 30000);
