'use strict';
// Sync theme from opener
function syncTheme() {
  try {
    const t = window.opener?.state?.preferences?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
}
syncTheme();
setInterval(syncTheme, 2000);

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
