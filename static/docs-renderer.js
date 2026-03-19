'use strict';

// Minimal markdown-to-HTML renderer for the user manual
function renderMarkdown(md) {
  var html = md;
  // Escape HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre><code>' + code.trim() + '</code></pre>';
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');
  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links (sanitize href to prevent javascript: XSS)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, text, url) {
    var trimmed = url.replace(/\s/g, '').toLowerCase();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
      return text;
    }
    return '<a href="' + url + '">' + text + '</a>';
  });
  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, function(_, header, sep, body) {
    var ths = header.split('|').filter(function(c) { return c.trim(); }).map(function(c) { return '<th>' + c.trim() + '</th>'; }).join('');
    var rows = body.trim().split('\n').map(function(row) {
      var tds = row.split('|').filter(function(c) { return c.trim(); }).map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('');
      return '<tr>' + tds + '</tr>';
    }).join('');
    return '<table><thead><tr>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table>';
  });
  // Unordered lists
  html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Paragraphs (lines not wrapped in tags)
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

(function() {
  var params = new URLSearchParams(window.location.search);
  var lang = params.get('lang') || 'en';
  var url = '/api/docs/user-manual?lang=' + encodeURIComponent(lang);

  fetch(url).then(function(res) {
    if (!res.ok) throw new Error('not found');
    return res.text();
  }).then(function(md) {
    document.getElementById('content').innerHTML = renderMarkdown(md);
  }).catch(function() {
    document.getElementById('content').innerHTML = '<p>Manual not found.</p>';
  });
})();
