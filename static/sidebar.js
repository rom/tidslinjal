/* ── Sidebar ── */

// ── Silent API helper for optional endpoints (avoids console.warn on 404) ─
async function _optionalApiGet(url) {
  try {
    const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Exercise mode label helpers ───────────────────────────────────────────
function getOperationNameLabel(ex) {
  const mode = (ex && ex.operation_mode) || 'exercise';
  if (mode === 'incident') return t('mode_incident') || 'Incident';
  if (mode === 'operation') return t('mode_operation') || 'Operation';
  return t('settings_exercise_label') || 'Exercise name';
}
function getStartexLabel(ex) {
  const mode = (ex && ex.operation_mode) || 'exercise';
  if (mode === 'incident') return t('start_of_incident') || 'Start of incident';
  if (mode === 'operation') return t('start_of_operation') || 'Start of operation';
  return t('settings_exercise_epoch') || 'STARTEX (Day 1 T+0)';
}
function getEndexLabel(ex) {
  const mode = (ex && ex.operation_mode) || 'exercise';
  if (mode === 'incident') return t('end_of_incident') || 'End of incident';
  if (mode === 'operation') return t('end_of_operation') || 'End of operation';
  return t('settings_exercise_endex') || 'ENDEX (End of exercise)';
}
function getExIndexLabel(ex) {
  const mode = (ex && ex.operation_mode) || 'exercise';
  if (mode === 'incident') return t('exercise_index_incident') || 'Incident index';
  if (mode === 'operation') return t('exercise_index_operation') || 'Operation index';
  return t('exercise_index') || 'Exercise index';
}

// ── Sidebar Resize Handle ─────────────────────────────────────────────────
function setupSidebarResize() {
  const handle = document.getElementById('sidebarResizeHandle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;

  let dragging = false, startX = 0, startWidth = 0;

  handle.addEventListener('pointerdown', e => {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    // Sidebar is on the right, so dragging left increases width
    const delta = startX - e.clientX;
    const newWidth = Math.max(180, Math.min(startWidth + delta, window.innerWidth * 0.5));
    sidebar.style.width = newWidth + 'px';
  });

  handle.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ── renderSidebar ─────────────────────────────────────────────────────────
// ── Sidebar ────────────────────────────────────────────────────────────────
function _bindResSubTabs(el) {
  el.querySelectorAll('[data-res-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      el.dataset.resSubTab = btn.dataset.resSub;
      renderSidebar();
    });
  });
}

function _bindLogSubTabs(el) {
  el.querySelectorAll('[data-log-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      el.dataset.logSubTab = btn.dataset.logSub;
      renderSidebar();
    });
  });
}

let _detachedDecisionLogWin = null;
function detachDecisionLog() {
  if (_detachedDecisionLogWin && !_detachedDecisionLogWin.closed) {
    _detachedDecisionLogWin.focus();
    return;
  }
  _detachedDecisionLogWin = window.open('/static/decision-log-popup.html', 'tidslinjal-decisionlog',
    'width=600,height=700,menubar=no,toolbar=no,scrollbars=yes');
}

// Event log: external events received via SSE/webhook
let _eventLogEntries = [];

async function _loadEventLog() {
  const el = document.getElementById('eventLogEntries');
  if (!el) return;
  try {
    const entries = await apiGet('/api/event-log');
    if (entries && entries.length) _eventLogEntries = entries;
  } catch {}
  if (_eventLogEntries.length === 0) {
    el.innerHTML = `<em style="color:var(--text-dim)">${t('event_log_empty')||'No external events received yet.'}</em>`;
    return;
  }
  el.innerHTML = _eventLogEntries.slice().reverse().map(e => `
    <div style="padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-dim)">${new Date(e.timestamp).toLocaleString()}</span>
      <strong>${escHtml(e.source||'external')}</strong>: ${escHtml(e.message||e.summary||'')}
    </div>`).join('');
}

// ── Pollster Log ────────────────────────────────────────────────────────────
async function _loadPollsterLog(container) {
  const el = container.querySelector ? container.querySelector('#pollsterLogEntries') : document.getElementById('pollsterLogEntries');
  if (!el) return;
  try {
    const res = await api('GET', '/api/polls/log');
    if (!res.ok) throw new Error('Failed');
    const polls = await res.json();
    if (!polls || polls.length === 0) {
      el.innerHTML = `<em style="color:var(--text-dim)">${t('pollster_log_empty')||'No polls recorded yet.'}</em>`;
      return;
    }
    el.innerHTML = polls.map(poll => {
      const ts = fmtDateTime(new Date(poll.created_at));
      const closedTs = poll.closed_at ? fmtDateTime(new Date(poll.closed_at)) : '';
      const statusColor = poll.status === 'open' ? 'var(--accent)' : poll.status === 'scheduled' ? '#E67E22' : 'var(--text-dim)';
      const statusLabel = poll.status === 'scheduled' ? (t('poll_status_scheduled')||'Scheduled') : poll.status;
      const scheduledTs = poll.status === 'scheduled' && poll.scheduled_at ? fmtDateTime(new Date(poll.scheduled_at)) : '';
      const allResponses = poll.responses || [];
      const respondedUserSet = new Set(allResponses.map(r => r.user_id));
      const totalR = respondedUserSet.size;
      const totalT = (poll.target_ids || []).length || '?';
      const pollCreatedAt = new Date(poll.created_at);
      const totalQuestions = (poll.questions || []).length;

      // Build respondent details
      const answeredMap = {};
      allResponses.forEach(r => {
        if (!answeredMap[r.user_id]) {
          answeredMap[r.user_id] = { name: r.user_name, firstAt: new Date(r.answered_at), count: 0 };
        }
        answeredMap[r.user_id].count++;
        const at = new Date(r.answered_at);
        if (at < answeredMap[r.user_id].firstAt) answeredMap[r.user_id].firstAt = at;
      });
      const partialTitle = t('poll_partial_answer')||'Partial';
      const answeredUsers = Object.entries(answeredMap).map(([uid, info]) => {
        const diffMs = info.firstAt - pollCreatedAt;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffH = Math.floor(diffMin / 60);
        let diffStr = '';
        if (diffH > 0) diffStr = `${diffH}h ${diffMin % 60}m`;
        else if (diffMin > 0) diffStr = `${diffMin}m ${diffSec % 60}s`;
        else diffStr = `${diffSec}s`;
        const isPartial = info.count < totalQuestions;
        return { uid: parseInt(uid), name: info.name, diffStr, isPartial };
      });

      // Non-respondents
      const respondedSet = new Set(Object.keys(answeredMap).map(Number));
      let nonRespondents = [];
      if (poll.target_type === 'user') {
        (poll.target_ids || []).forEach(idStr => {
          const uid = parseInt(idStr);
          if (!respondedSet.has(uid)) {
            const u = (state.users||[]).find(u => u.id === uid);
            nonRespondents.push({ uid, name: u ? (u.display_name||u.username) : `User #${uid}` });
          }
        });
      }

      // Standard question table
      const standardQs = (poll.questions || []).filter(q => q.type === 'scale' || q.type === 'scale_0_3' || q.type === 'yes_no');
      let tableHtml = '';
      if (standardQs.length > 0 && answeredUsers.length > 0) {
        const headerCells = standardQs.map(q => `<th style="padding:3px 6px;border:1px solid var(--border);font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(q.text)}">${escHtml(q.text.length > 30 ? q.text.slice(0,27)+'...' : q.text)}</th>`).join('');
        const rows = answeredUsers.map(au => {
          const cells = standardQs.map(q => {
            const resp = allResponses.find(r => r.user_id === au.uid && r.question_id === q.id);
            if (!resp) return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;color:var(--text-dim)">—</td>`;
            let val = resp.answer;
            let bg = '';
            if (q.type === 'scale' || q.type === 'scale_0_3') {
              const v = parseInt(val);
              if (v === 0) bg = 'background:#27AE6033';
              else if (v === 1) bg = 'background:#F39C1233';
              else if (v === 2) bg = 'background:#E67E2233';
              else if (v === 3) bg = 'background:#E74C3C33';
              val = t('poll_scale_'+v)||['None','Low','Medium','High'][v]||v;
            } else if (q.type === 'yes_no') {
              bg = val === 'yes' ? 'background:#27AE6022' : 'background:#E74C3C22';
              val = val === 'yes' ? (t('yes')||'Yes') : (t('no')||'No');
            }
            return `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center;font-size:10px;${bg}">${val}</td>`;
          }).join('');
          return `<tr><td style="padding:3px 6px;border:1px solid var(--border);font-size:10px;white-space:nowrap">${escHtml(au.name)} <span style="color:var(--text-dim)">(+${au.diffStr})</span>${au.isPartial ? ' ⚠' : ''}</td>${cells}</tr>`;
        }).join('');
        tableHtml = `<div style="margin-top:6px;overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:10px">
          <thead><tr><th style="padding:3px 6px;border:1px solid var(--border)"></th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
      }

      // Free text responses
      const freeTextQs = (poll.questions || []).filter(q => q.type === 'free_text');
      let freeTextHtml = '';
      if (freeTextQs.length > 0) {
        freeTextHtml = freeTextQs.map(q => {
          const answers = allResponses.filter(r => r.question_id === q.id && r.answer).map(r => `<div style="padding:2px 0"><b>${escHtml(r.user_name)}</b>: ${escHtml(r.answer)}</div>`).join('');
          return answers ? `<div style="margin-top:4px"><em>${escHtml(q.text)}</em>${answers}</div>` : '';
        }).join('');
      }

      // Resolve receiver display
      let receiversHtml = '';
      if (poll.target_type && poll.target_ids && poll.target_ids.length > 0) {
        let targetLabel = '';
        if (poll.target_type === 'user') {
          const names = poll.target_ids.map(idStr => {
            const u = (state.users||[]).find(u => u.id === parseInt(idStr));
            return u ? (u.display_name||u.username) : `#${idStr}`;
          });
          targetLabel = names.join(', ');
        } else if (poll.target_type === 'group') {
          const names = poll.target_ids.map(idStr => {
            const g = (state.groups||[]).find(g => String(g.id) === String(idStr));
            return g ? g.name : `Group #${idStr}`;
          });
          targetLabel = '👥 ' + names.join(', ');
        } else if (poll.target_type === 'role') {
          targetLabel = '🛡 ' + poll.target_ids.map(r => typeof getRoleDisplayName === 'function' ? getRoleDisplayName(r) : r).join(', ');
        }
        if (targetLabel) receiversHtml = `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">📨 ${t('poll_receivers')||'Receivers'}: ${escHtml(targetLabel)}</div>`;
      }

      return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>📊 ${escHtml(poll.title)}</strong>
          <span style="font-size:10px;color:${statusColor}">${statusLabel}</span>
        </div>
        <div style="color:var(--text-dim);font-size:var(--fs-xs)">
          📅 ${t('poll_started')||'Started'}: ${ts}
          ${scheduledTs ? `<br>⏱ ${t('poll_scheduled_for')||'Scheduled for'}: ${scheduledTs}` : ''}
          ${closedTs ? `<br>🔒 ${t('poll_closed')||'Closed'}: ${closedTs}` : ''}
        </div>
        ${receiversHtml}
        <div style="font-size:var(--fs-xs);margin-top:4px">
          <strong>${t('poll_responses')||'Responses'}: ${totalR}/${totalT}</strong>
        </div>
        ${answeredUsers.length > 0 ? `<div style="font-size:var(--fs-xs);margin-top:4px"><span style="color:#27AE60;font-weight:600">✅ ${t('poll_answered')||'Answered'}:</span>
          ${answeredUsers.map(au => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #27AE60${au.isPartial ? '80' : ''}">${escHtml(au.name)} <span style="color:var(--text-dim)">(+${au.diffStr})</span>${au.isPartial ? ' <span style="color:#F39C12" title="' + partialTitle + '">⚠</span>' : ''}</span>`).join(' ')}
        </div>` : ''}
        ${nonRespondents.length > 0 ? `<div style="font-size:var(--fs-xs);margin-top:2px"><span style="color:#E74C3C;font-weight:600">❌ ${t('poll_not_answered')||'Not answered'}:</span>
          ${nonRespondents.map(nr => `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;margin:1px;background:var(--bg2);border-radius:var(--radius);border:1px solid #E74C3C">${escHtml(nr.name)}</span>`).join(' ')}
        </div>` : ''}
        ${tableHtml || freeTextHtml ? `<div style="margin-top:4px;padding:6px;background:var(--bg3);border-radius:var(--radius)">${tableHtml}${freeTextHtml}</div>` : ''}
        ${(state.user && (poll.created_by === state.user.id || state.user.role === 'admin')) ? `<div style="margin-top:6px;display:flex;gap:6px"><button class="btn btn-sm" style="color:var(--danger);font-size:10px;padding:2px 8px" onclick="deletePoll(${poll.id})">🗑 ${t('btn_delete')||'Delete'}</button></div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<em style="color:var(--text-dim)">${t('pollster_log_empty')||'No polls recorded yet.'}</em>`;
  }

  // Search filter
  const searchEl = container.querySelector ? container.querySelector('#pollsterSearch') : document.getElementById('pollsterSearch');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.toLowerCase();
      el.querySelectorAll(':scope > div').forEach(div => {
        div.style.display = div.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Export CSV
  const csvBtn = container.querySelector ? container.querySelector('#pollsterExportCSV') : document.getElementById('pollsterExportCSV');
  if (csvBtn) {
    csvBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        let csv = 'Poll,Status,Created,Questions,Responses\n';
        (polls || []).forEach(p => {
          csv += `"${(p.title||'').replace(/"/g,'""')}","${p.status}","${p.created_at}","${(p.questions||[]).length}","${(p.responses||[]).length}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.csv';
        a.click();
      } catch {}
    });
  }

  // Export JSON
  const jsonBtn = container.querySelector ? container.querySelector('#pollsterExportJSON') : document.getElementById('pollsterExportJSON');
  if (jsonBtn) {
    jsonBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        const blob = new Blob([JSON.stringify(polls, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.json';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {}
    });
  }

  // Export RTF
  const rtfBtn = container.querySelector ? container.querySelector('#pollsterExportRTF') : document.getElementById('pollsterExportRTF');
  if (rtfBtn) {
    rtfBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        const esc = s => String(s||'').replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}');
        let rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\n';
        rtf += '\\f0\\fs24\\b Pollster Log\\b0\\par\\par\n';
        rtf += '\\trowd\\trgaph100\\cellx3000\\cellx5000\\cellx7500\\cellx9000\\cellx11000\\pard\\intbl\n';
        rtf += '\\b Poll\\cell Status\\cell Created\\cell Questions\\cell Responses\\cell\\b0\\row\n';
        (polls || []).forEach(p => {
          rtf += '\\trowd\\trgaph100\\cellx3000\\cellx5000\\cellx7500\\cellx9000\\cellx11000\\pard\\intbl\n';
          rtf += `${esc(p.title)}\\cell ${esc(p.status)}\\cell ${esc(p.created_at)}\\cell ${(p.questions||[]).length}\\cell ${(p.responses||[]).length}\\cell\\row\n`;
        });
        rtf += '}';
        const blob = new Blob([rtf], { type: 'application/rtf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.rtf';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {}
    });
  }

  // Export DOCX
  const docxBtn = container.querySelector ? container.querySelector('#pollsterExportDOCX') : document.getElementById('pollsterExportDOCX');
  if (docxBtn) {
    docxBtn.addEventListener('click', async () => {
      try {
        const res = await api('GET', '/api/polls/log');
        if (!res.ok) return;
        const polls = await res.json();
        const xe = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const headers = ['Poll','Status','Created','Questions','Responses'];
        let rows = '';
        (polls || []).forEach(p => {
          const cells = [p.title, p.status, p.created_at, String((p.questions||[]).length), String((p.responses||[]).length)];
          rows += '<w:tr>' + cells.map(c => `<w:tc><w:p><w:r><w:t>${xe(c)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>';
        });
        const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          '<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Pollster Log</w:t></w:r></w:p>' +
          '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
          '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '</w:tblBorders></w:tblPr>' +
          '<w:tr>' + headers.map(h => `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xe(h)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>' +
          rows + '</w:tbl></w:body></w:document>';
        const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>';
        const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>';
        const drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
        // Build ZIP using minimal PKZIP structure
        const enc = new TextEncoder();
        const files = [
          { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
          { name: '_rels/.rels', data: enc.encode(rels) },
          { name: 'word/_rels/document.xml.rels', data: enc.encode(drels) },
          { name: 'word/document.xml', data: enc.encode(docXml) },
        ];
        const parts = [];
        const centralDir = [];
        let offset = 0;
        for (const f of files) {
          const nameBytes = enc.encode(f.name);
          // Local file header
          const lh = new Uint8Array(30 + nameBytes.length);
          const lv = new DataView(lh.buffer);
          lv.setUint32(0, 0x04034b50, true); // signature
          lv.setUint16(4, 20, true); // version
          lv.setUint16(8, 0, true); // compression: store
          lv.setUint16(12, 0, true); // mod time
          lv.setUint16(14, 0, true); // mod date
          const crc = _crc32(f.data);
          lv.setUint32(16, crc, true);
          lv.setUint32(20, f.data.length, true);
          lv.setUint32(24, f.data.length, true);
          lv.setUint16(26, nameBytes.length, true);
          lh.set(nameBytes, 30);
          parts.push(lh, f.data);
          // Central directory entry
          const cd = new Uint8Array(46 + nameBytes.length);
          const cv = new DataView(cd.buffer);
          cv.setUint32(0, 0x02014b50, true);
          cv.setUint16(4, 20, true);
          cv.setUint16(6, 20, true);
          cv.setUint16(12, 0, true); // compression
          cv.setUint32(16, crc, true);
          cv.setUint32(20, f.data.length, true);
          cv.setUint32(24, f.data.length, true);
          cv.setUint16(28, nameBytes.length, true);
          cv.setUint32(42, offset, true);
          cd.set(nameBytes, 46);
          centralDir.push(cd);
          offset += lh.length + f.data.length;
        }
        const cdOffset = offset;
        let cdSize = 0;
        centralDir.forEach(c => cdSize += c.length);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true);
        ev.setUint32(12, cdSize, true);
        ev.setUint32(16, cdOffset, true);
        const blob = new Blob([...parts, ...centralDir, eocd], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pollster_log.docx';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) { showError(e.message); }
    });
  }

  // Print
  const printBtn = container.querySelector ? container.querySelector('#pollsterPrint') : document.getElementById('pollsterPrint');
  if (printBtn) {
    printBtn.addEventListener('click', () => { window.print(); });
  }
}

async function deletePoll(pollId) {
  if (!confirm(t('confirm_delete')||'Delete this poll?')) return;
  try {
    const res = await api('DELETE', '/api/polls/' + pollId);
    if (res.ok) {
      showNotification('success', t('notif_deleted')||'Deleted');
      pushUndo('delete_poll', { id: pollId });
      renderSidebar();
    } else {
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Failed to delete poll');
    }
  } catch (e) {
    showError('Failed to delete poll: ' + e.message);
  }
}

// ── CRC32 for client-side ZIP generation ──────────────────────────────────
const _crc32 = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  return data => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
})();

// ── Log Book ───────────────────────────────────────────────────────────────
let _logBookEntries = [];
async function _loadLogBook() {
  const el = document.getElementById('logBookEntries');
  if (!el) return;
  try {
    _logBookEntries = await apiGet('/api/log-book') || [];
  } catch { _logBookEntries = []; }
  if (_logBookEntries.length === 0) {
    el.innerHTML = `<em style="color:var(--text-dim)">${t('lb_empty')||'No log book entries yet.'}</em>`;
    return;
  }
  const isAdmin = state.user?.role === 'admin';
  const catIcons = {incoming:'📥',outgoing:'📤',incident:'🚨',directive:'🎯',decision:'⚖️',action:'✅',briefing:'📊',situation:'🔄',meeting:'📝',other:'📌'};
  el.innerHTML = _logBookEntries.slice().reverse().map(e => {
    const ts = new Date(e.timestamp).toLocaleString();
    const icon = catIcons[e.category] || '📌';
    const attHtml = (e.attachments && e.attachments.length) ? `<div style="margin-top:2px">${e.attachments.map(a =>
      `<a href="/api/log-book/${e.id}/attachment/${encodeURIComponent(a.stored_name)}" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none">📎 ${escHtml(a.filename)}</a>`
    ).join(' ')}</div>` : '';
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span>${icon}</span>
          <span style="font-weight:600;font-size:var(--fs-xs)">${escHtml(e.subject)}</span>
          <span style="color:var(--text-dim);font-size:10px;margin-left:4px">${escHtml(e.display_name||e.user_name)} — ${ts}</span>
        </div>
        ${isAdmin ? `<button class="btn btn-danger btn-sm" style="padding:0 4px;font-size:10px" data-action="deleteLogBookEntry" data-arg="${e.id}">×</button>` : ''}
      </div>
      ${e.body ? `<div style="margin-top:2px;white-space:pre-wrap;color:var(--text-dim)">${escHtml(e.body)}</div>` : ''}
      ${attHtml}
    </div>`;
  }).join('');
  _bindActions(el);
}

async function addLogBookEntry() {
  const category = document.getElementById('lbCategory')?.value || 'other';
  const subject = document.getElementById('lbSubject')?.value?.trim();
  const body = document.getElementById('lbBody')?.value?.trim() || '';
  if (!subject) { showError(t('lb_subject_required')||'Subject is required'); return; }
  const res = await apiPost('/api/log-book', {category, subject, body});
  if (res.ok) {
    const created = await res.json().catch(() => null);
    // Upload attachments
    const fileInput = document.getElementById('lbAttachFile');
    if (created && fileInput?.files?.length) {
      for (const f of fileInput.files) {
        const fd = new FormData();
        fd.append('file', f);
        await api('POST', `/api/log-book/${created.id}/attachment`, fd);
      }
      fileInput.value = '';
    }
    document.getElementById('lbSubject').value = '';
    document.getElementById('lbBody').value = '';
    showNotification('success', t('lb_added')||'Log book entry added');
    await _loadLogBook();
  } else {
    const err = await res.json().catch(() => ({}));
    showError(err.error || 'Failed to add entry');
  }
}

async function deleteLogBookEntry(id) {
  if (!confirm(t('lb_delete_confirm')||'Delete this log book entry?')) return;
  const res = await api('DELETE', `/api/log-book/${id}`);
  if (res.ok) {
    showNotification('success', t('lb_deleted')||'Entry deleted');
    await _loadLogBook();
  }
}

// ── Log Book modal (accessible from Tools) ──
function openLogBookModal() {
  const cats = [
    {v:'incoming',l:t('lb_incoming')||'Incoming matter'},
    {v:'outgoing',l:t('lb_outgoing')||'Outgoing matter'},
    {v:'incident',l:t('lb_incident')||'Special incident'},
    {v:'directive',l:t('lb_directive')||'Directive'},
    {v:'decision',l:t('lb_decision')||'Decision'},
    {v:'action',l:t('lb_action')||'Action taken'},
    {v:'briefing',l:t('lb_briefing')||'Briefing content'},
    {v:'situation',l:t('lb_situation')||'Situation change'},
    {v:'logistics',l:t('lb_logistics')||'Logistics'},
    {v:'meeting',l:t('lb_meeting')||'Meeting protocol'},
    {v:'other',l:t('lb_other')||'Other'}
  ].filter(c => !(c.v === 'decision' && state.preferences && state.preferences.logbook_hide_decisions));
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:700px">
      <div class="modal-header">
        <h3>📖 ${t('tab_log_book')||'Log Book'}</h3>
        <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6;margin-right:8px" data-action="openDetachedLogBook" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        <button class="modal-close" data-action="_closeParentModal" data-arg-el>&times;</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:8px">
          <select id="lbCategory" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
            ${cats.map(c=>`<option value="${c.v}">${c.l}</option>`).join('')}
          </select>
          <input type="text" id="lbSubject" placeholder="${t('lb_subject')||'Subject'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
          <textarea id="lbBody" rows="2" placeholder="${t('lb_body')||'Details (optional)'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);resize:vertical;margin-bottom:4px"></textarea>
          <div style="display:flex;gap:6px;align-items:center">
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">
              📎 <input type="file" id="lbAttachFile" style="max-width:120px;font-size:10px" multiple>
            </label>
            <span style="flex:1"></span>
            <button class="btn btn-primary btn-sm" data-action="addLogBookEntry">${t('btn_add')||'Add'}</button>
          </div>
        </div>
        <div id="logBookEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="_closeParentModal" data-arg-el>${t('btn_close')||'Close'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _bindActions(modal);
  _loadLogBook();
}

// Detach sidebar into separate window
let _detachedSidebarWin = null;
function detachSidebar() {
  // If on resources tab, open standalone resources popup (CSP-safe)
  if (state.sidebarTab === 'resources') {
    openDetachedResources();
    return;
  }
  // If on references tab, open standalone references popup
  if (state.sidebarTab === 'references') {
    openDetachedReferences();
    return;
  }
  // If on tools tab, open standalone tools popup
  if (state.sidebarTab === 'tools') {
    openDetachedTools();
    return;
  }
  if (_detachedSidebarWin && !_detachedSidebarWin.closed) {
    _detachedSidebarWin.focus();
    return;
  }
  const sidebar = document.getElementById('sidebar');
  // Save sidebar content BEFORE hiding (so innerHTML is populated)
  const sidebarHTML = sidebar.innerHTML;
  sidebar.classList.add('hidden');
  const w = window.open('', 'tidslinjal-sidebar',
    'width=350,height=700,menubar=no,toolbar=no,scrollbars=yes');
  if (!w) { sidebar.classList.remove('hidden'); return; }
  _detachedSidebarWin = w;
  const theme = document.body.className || '';
  const reattachLabel = t('btn_reattach_menu') || 'Reattach Menu';
  // Write document shell first (no dynamic content in template)
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tidslinjal \u2014 Menu</title>' +
    '<link rel="stylesheet" href="/static/style.css">' +
    '<style>' +
    'body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}' +
    '.detached-sidebar{display:flex;flex-direction:column;height:calc(100vh - 38px);overflow-y:auto}' +
    '.detached-sidebar .sidebar-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap}' +
    '.detached-sidebar .sidebar-content{flex:1;overflow-y:auto;padding:12px}' +
    '.reattach-bar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg2);border-bottom:1px solid var(--border)}' +
    '.reattach-bar button{background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px}' +
    '</style></head><body class="' + escHtml(theme) + '">' +
    '<div class="reattach-bar">' +
    '<button id="btnReattach">\u2B05 ' + escHtml(reattachLabel) + '</button>' +
    '<span style="flex:1"></span>' +
    '<span style="font-size:11px;color:var(--text-dim)">Tidslinjal Menu</span>' +
    '</div>' +
    '<div class="detached-sidebar" id="detachedWrap"></div>' +
    '</body></html>');
  w.document.close();

  // Inject sidebar content safely via DOM (not template literal)
  const wrapEl = w.document.getElementById('detachedWrap');
  if (wrapEl) wrapEl.innerHTML = sidebarHTML;

  // Bind reattach button
  w.document.getElementById('btnReattach').onclick = function() {
    try { window._reattachSidebar(); } catch(e) {}
    w.close();
  };

  // Sync + rebind function
  function syncContent() {
    try {
      if (!w || w.closed) return;
      const wrap = w.document.getElementById('detachedWrap');
      if (!wrap) return;
      // Re-render sidebar in opener
      try { renderSidebar(); } catch(e) {}
      const srcSidebar = document.getElementById('sidebar');
      if (srcSidebar) {
        wrap.innerHTML = srcSidebar.innerHTML;
      }
      // Re-bind tab clicks to talk to opener
      wrap.querySelectorAll('.sidebar-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          try { state.sidebarTab = tab.dataset.tab; renderSidebar(); } catch(e) {}
          setTimeout(syncContent, 100);
        });
      });
      // Re-bind all data-action buttons
      wrap.querySelectorAll('[data-action]').forEach(function(el) {
        el.addEventListener('click', function(evt) {
          try {
            window.focus();
            var fn = el.dataset.action;
            var arg = el.dataset.arg;
            if (typeof window[fn] === 'function') window[fn](arg === 'null' ? null : arg);
          } catch(e) {}
        });
      });
      // Re-bind sub-tab buttons
      wrap.querySelectorAll('[data-res-sub]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          try {
            var el = wrap.closest('[data-resSubTab]') || wrap;
            el.dataset.resSubTab = btn.dataset.resSub;
            renderSidebar();
            setTimeout(syncContent, 100);
          } catch(e) {}
        });
      });
      wrap.querySelectorAll('[data-log-sub]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          try {
            var el = wrap.closest('[data-logSubTab]') || wrap;
            el.dataset.logSubTab = btn.dataset.logSub;
            renderSidebar();
            setTimeout(syncContent, 100);
          } catch(e) {}
        });
      });
      // Re-bind selects and inputs to proxy change events
      wrap.querySelectorAll('select[data-action-change]').forEach(function(sel) {
        sel.addEventListener('change', function() {
          try {
            var fn = sel.dataset.actionChange;
            if (typeof window[fn] === 'function') window[fn](sel.value);
          } catch(e) {}
        });
      });
    } catch(e) {}
  }
  syncContent();
  var _sidebarSyncInterval = setInterval(function() {
    if (!w || w.closed) {
      clearInterval(_sidebarSyncInterval);
      _reattachSidebar();
      return;
    }
    syncContent();
  }, 2000);
  w.addEventListener('beforeunload', function() {
    try { _reattachSidebar(); } catch(e) {}
  });
}

function _reattachSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('hidden');
  _detachedSidebarWin = null;
}

function renderSidebar() {
  const tab  = state.sidebarTab;
  const el   = document.getElementById('sidebarContent');
  const lang = state.preferences.language || 'en';

  if (tab === 'legend') {
    const activeLayers = state.layers.filter(l => isLayerActive(l.id));
    const isSynthActive = synthActive ? synthActive() : false;
    const lastTemplate = (state.exercise && state.exercise.last_template) || state.lastAppliedTemplate || null;
    const langLabel = {en:'English 🇬🇧', sv:'Svenska 🇸🇪', fr:'Français 🇫🇷', fi:'Suomi 🇫🇮', da:'Dansk 🇩🇰'}[lang] || lang;
    const vInfo = state._versionInfo || {};
    const gbStatus = state._gradualBackupStatus || null;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('event_types_title')}
          ${state.user&&hasRole2(state.user.role,'readwrite') ? `<button class="btn btn-primary btn-sm" data-action="openEtypeModal" data-arg="null">${t('event_types_add')}</button>` : ''}
        </div>
        <div class="legend-list">
          ${[...state.eventTypes].sort((a,b) => {
            const la = (lang==='sv'&&a.label_sv?a.label_sv:lang==='fr'&&a.label_fr?a.label_fr:a.label).toLowerCase();
            const lb = (lang==='sv'&&b.label_sv?b.label_sv:lang==='fr'&&b.label_fr?b.label_fr:b.label).toLowerCase();
            return la.localeCompare(lb);
          }).map(et => {
            const lbl = lang==='sv'&&et.label_sv ? et.label_sv : lang==='fr'&&et.label_fr ? et.label_fr : et.label;
            const hidden = isTypeHidden(et.key);
            const _builtinTypeIcons = { mote:'🤝', decision:'⚖️', deadline:'⏰', standup:'🧍', reporting:'📊',
              instant:'⚡', repeated:'🔄', physical_meeting:'🏢', assigned_task:'📌', pause:'⏸' };
            const etIcon = et.icon || _builtinTypeIcons[et.key] || '';
            return `<div class="legend-item${hidden?' hidden-type':''}" data-action="toggleType" data-arg="${et.key}">
              <div class="legend-swatch" style="background:${cbSafeColor(et.color)}"></div>
              ${etIcon ? `<span class="legend-type-icon">${etIcon}</span>` : ''}
              <span class="legend-label">${escHtml(lbl)}</span>
              <span class="legend-eye">${hidden?'👁‍🗨':'👁'}</span>
              ${state.user&&(state.user.role==='admin'||(et.created_by&&et.created_by===state.user.id)) ?
                `<button class="btn btn-ghost btn-icon" style="font-size:11px;padding:0 3px" data-edit-etype='${escAttr(JSON.stringify(et))}' data-stop-prop-only>✏️</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('legend_status')||'Event Status'}</div>
        <div class="legend-list">
          ${[
            {key:'planned',   color:'var(--text-dim)',  label: t('status_planned')||'Planned'},
            {key:'active',    color:'var(--accent)',    label: t('status_active')||'Active'},
            {key:'completed', color:'var(--green)',     label: t('status_completed')||'Completed'},
            {key:'rejected',  color:'var(--red)',       label: t('status_rejected')||'Rejected'},
            {key:'cancelled', color:'var(--red)',       label: t('status_cancelled')||'Cancelled'}
          ].map(s => `<div class="legend-item" style="cursor:default">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
            <span class="legend-label">${s.label}</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('info_range')}</div>
        <div style="font-size:var(--fs-sm);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
          <span style="color:var(--text-dim)">${t('info_from')}:</span><span>${fmtDateTime(state.startDate)}</span>
          <span style="color:var(--text-dim)">${t('info_to')}:</span><span>${fmtDateTime(addDays(state.startDate, getRangeDays()-1))}</span>
          <span style="color:var(--text-dim)">${t('info_events')}:</span><span>${state.events.filter(e=>!isTypeHidden(e.event_type)).length}</span>
          <span style="color:var(--text-dim)">${t('info_locks')}:</span><span>${state.locks.length}</span>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">👤 ${t('info_roles_users')||'Roles, Users & Groups'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin-bottom:8px">
          <span style="color:var(--text-dim)">${t('info_users')||'Users'}:</span><span>${state.users.length}</span>
          <span style="color:var(--text-dim)">${t('info_groups')||'Groups'}:</span><span>${state.groups.length}</span>
        </div>
        ${(() => {
          const roleOrder = ['admin','staffofficer_full','staffofficer','oplead','teamlead','teammember','readwrite','reporter','read','observer'];
          const roleCounts = {};
          (state.users||[]).forEach(u => { roleCounts[u.role] = (roleCounts[u.role]||0)+1; });
          const rows = roleOrder.filter(r => roleCounts[r]).map(r =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid var(--border)">
              <span class="role-badge role-${r}" style="font-size:10px;padding:1px 5px">${getRoleDisplayName(r)}</span>
              <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text)">${roleCounts[r]}</span>
            </div>`
          ).join('');
          return rows ? `<div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">${rows}</div>` : `<span style="color:var(--text-dim);font-size:var(--fs-xs)">No users yet</span>`;
        })()}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('info_system')||'System'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
          <span style="color:var(--text-dim)">${t('info_language')||'Language'}:</span><span>${langLabel}</span>
          <span style="color:var(--text-dim)">${t('info_active_layers')||'Active layers'}:</span><span>${activeLayers.length > 0 ? activeLayers.map(l=>escHtml(l.name)).join(', ') : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_synth_time')||'Synthetic time'}:</span><span>${isSynthActive ? '✓ On' : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_last_template')||'Last template'}:</span><span>${lastTemplate ? escHtml(lastTemplate) : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_version')||'Version'}:</span><span>${vInfo.version ? 'v'+vInfo.version : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_uptime')||'Server Uptime'}:</span><span>${vInfo.uptime || '—'}</span>
          <span style="color:var(--text-dim)">${t('info_tool_started')||'Tool Started'}:</span><span>${vInfo.started_at ? fmtDateTime(new Date(vInfo.started_at)) : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_server_booted')||'Server Booted'}:</span><span>${vInfo.server_booted_at ? fmtDateTime(new Date(vInfo.server_booted_at)) : '—'}</span>
          <span style="color:var(--text-dim)">${t('info_connection')||'Connection'}:</span><span>${window._offlineModeForced ? '<span style="color:#f59e0b">● ' + (t('info_forced_offline')||'Forced Offline') + '</span>' : navigator.onLine ? '<span style="color:#22c55e">● ' + (t('info_online')||'Online') + '</span>' : '<span style="color:var(--red,#E74C3C)">● ' + (t('info_offline')||'Offline') + '</span>'}</span>
          ${gbStatus !== null ? `<span style="color:var(--text-dim)">Gradual backup:</span><span>${gbStatus.enabled ? `<span style="color:#22c55e">✓ Active</span> (every ${gbStatus.interval_minutes||15} min, ${gbStatus.snapshot_count||0} snapshots)` : '<span style="color:var(--text-dim)">— Disabled</span>'}</span>` : ''}
        </div>
      </div>
      ${(() => {
        // Database statistics panel
        const db = state._dbStats || null;
        if (db) {
          const sizeStr = db.size_bytes < 1024 ? db.size_bytes + ' B'
            : db.size_bytes < 1048576 ? (db.size_bytes/1024).toFixed(1) + ' KB'
            : (db.size_bytes/1048576).toFixed(1) + ' MB';
          const createdStr = db.created_at ? fmtDateTime(new Date(db.created_at)) : '—';
          return `<div class="sidebar-section">
            <div class="sidebar-section-title">💾 ${t('legend_database')||'Database'}</div>
            <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
              <span style="color:var(--text-dim)">${t('legend_db_created')||'Created'}:</span><span>${createdStr}</span>
              <span style="color:var(--text-dim)">${t('legend_db_size')||'Size'}:</span><span>${sizeStr}</span>
              <span style="color:var(--text-dim)">${t('info_events')||'Events'}:</span><span>${db.events||0}</span>
              <span style="color:var(--text-dim)">${t('info_users')||'Users'}:</span><span>${db.users||0}</span>
              <span style="color:var(--text-dim)">${t('info_groups')||'Groups'}:</span><span>${db.groups||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_layers')||'Layers'}:</span><span>${db.layers||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_alarms')||'Alarms'}:</span><span>${db.alarms||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_phases')||'Phases'}:</span><span>${db.phases||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_audit')||'Audit entries'}:</span><span>${db.audit_entries||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_attachments')||'Attachments'}:</span><span>${db.attachments||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_comments')||'Comments'}:</span><span>${db.comments||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_templates')||'Templates'}:</span><span>${db.templates||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_polls')||'Polls'}:</span><span>${db.polls||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_log_book')||'Log book'}:</span><span>${db.log_book||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_decisions')||'Decisions'}:</span><span>${db.decision_log||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_locations')||'Map locations'}:</span><span>${db.map_locations||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_rooms')||'Rooms'}:</span><span>${db.rooms||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_notifications')||'Notifications'}:</span><span>${db.notifications||0}</span>
              <span style="color:var(--text-dim)">${t('legend_db_references')||'Reference docs'}:</span><span>${db.reference_docs||0}</span>
            </div>
          </div>`;
        }
        return '';
      })()}
      ${(() => {
        // Test statistics panel — admin only
        if (state.user && state.user.role === 'admin') {
          const ts = state._testStats || null;
          if (ts) {
            return `<div class="sidebar-section">
              <div class="sidebar-section-title">🧪 ${t('legend_test_stats')||'Test Statistics'}</div>
              <div style="font-size:var(--fs-xs);color:var(--text);display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
                <span style="color:var(--text-dim)">${t('legend_test_cases')||'Test cases'}:</span><span>${ts.test_cases || 0}</span>
                <span style="color:var(--text-dim)">${t('legend_unit_tests')||'Unit tests'}:</span><span>${ts.unit_tests || 0}</span>
                <span style="color:var(--text-dim)">${t('legend_tests_run')||'Tests performed'}:</span><span>${ts.tests_run || 0}</span>
              </div>
            </div>`;
          }
        }
        return '';
      })()}
      ${(() => {
        // Integration status panel — admin only
        const st = (state.user && state.user.role === 'admin') ? (state._integrationStatus || null) : null;
        if (!st) return '';
        const pill = (ok, label, detail) => {
          const col = ok ? '#22c55e' : '#6b7280';
          return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border)">
            <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></span>
            <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text);min-width:80px">${label}</span>
            <span style="font-size:10px;color:var(--text-dim);word-break:break-all">${escHtml(detail||'')}</span>
          </div>`;
        };
        const sso = st.sso || {};
        const tls = st.tls || {};
        const sys = st.syslog || {};
        const smtp = st.smtp || {};
        const mm = st.mattermost || {};
        const ak = st.api_keys || {};
        return `
        <div class="sidebar-section">
          <div class="sidebar-section-title">🔌 ${t('info_integrations')||'Integrations'}</div>
          <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;padding:0 4px">
            ${pill(sso.active, 'SSO / OIDC', sso.active ? (sso.issuer||'active') + (sso.exclusive?' · excl.':'') : sso.enabled ? 'configured, inactive' : 'disabled')}
            ${pill(tls.configured, 'TLS', tls.configured ? (tls.cert_file||'cert set') : 'not configured')}
            ${pill(sys.enabled, 'Syslog', sys.enabled ? `${escHtml(sys.host||'')}:${sys.port||514} (${sys.transport||'udp'}, ${sys.format||'classic'})` : 'disabled')}
            ${pill(smtp.enabled, 'SMTP/Mail', smtp.enabled ? `${escHtml(smtp.host||'')}:${smtp.port||587} ${smtp.tls_mode||''}` : 'disabled')}
            ${pill((mm.mattermost_users||0)>0, 'Mattermost', (mm.webhook_users||0)>0 ? `${mm.webhook_users} webhook user${mm.webhook_users!==1?'s':''}, ${mm.mattermost_users} Mattermost` : 'no webhooks')}
            ${pill((ak.count||0)>0, 'API Keys', `${ak.count||0} key${(ak.count||0)!==1?'s':''} active`)}
          </div>
        </div>`;
      })()}
      ${vInfo.github ? `
      <div class="sidebar-section" style="padding-top:6px">
        <a href="${escHtml(vInfo.github)}" target="_blank" rel="noopener" style="font-size:var(--fs-xs);color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:5px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          ${t('github_link')||'GitHub Repository'}
        </a>
      </div>` : ''}
    `;
  } else if (tab === 'alarms') {
    const active = state.alarms.filter(a => !a.fired);

    // Collect scheduled (queued) polls and PRCs to show in alarms
    let queuedHtml = '';
    const _fetchQueued = async () => {
      let items = [];
      // Scheduled polls
      try {
        const pollRes = await api('GET', '/api/polls');
        if (pollRes.ok) {
          const polls = await pollRes.json();
          (polls || []).forEach(p => {
            if (p.status === 'scheduled' && p.scheduled_at) {
              items.push({ type: 'poll', title: p.title, time: p.scheduled_at, id: p.id });
            }
          });
        }
      } catch {}
      // Scheduled PRCs
      try {
        const prcs = await apiGet('/api/person-ready-check');
        (prcs || []).forEach(c => {
          if (c.scheduled_at && !c.fired && new Date(c.scheduled_at) > new Date()) {
            items.push({ type: 'prc', title: (t('prc_ready_check')||'Ready Check') + ' #' + c.id, time: c.scheduled_at, id: c.id });
          }
        });
      } catch {}
      const queueEl = document.getElementById('alarmQueuedItems');
      if (!queueEl) return;
      if (items.length === 0) {
        queueEl.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-xs)">${t('alarms_no_queued')||'No queued items.'}</div>`;
        return;
      }
      items.sort((a, b) => new Date(a.time) - new Date(b.time));
      queueEl.innerHTML = items.map(it => `
        <div class="alarm-item" style="border-left:3px solid ${it.type === 'poll' ? 'var(--accent)' : '#F39C12'}">
          <div class="alarm-title">${it.type === 'poll' ? '📊' : '🙋'} ${escHtml(it.title)}</div>
          <div class="alarm-meta">⏰ ${t('prc_scheduled_for')||'Scheduled for'}: ${fmtDateTime(new Date(it.time))}</div>
        </div>`).join('');
    };

    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('tab_alarms')}</div>
        ${active.length === 0
          ? `<div style="color:var(--text-dim);font-size:var(--fs-sm);white-space:pre-line">${t('alarms_none')}</div>`
          : `<div class="alarm-list">${active.map(a => `
            <div class="alarm-item">
              <div class="alarm-title">${escHtml(a.event_title)}</div>
              <div class="alarm-meta">📅 ${fmtDateTime(new Date(a.event_time))}<br>🔔 ${a.lead_time>0?a.lead_time+' min before':'At event time'}</div>
              <div class="alarm-actions"><button class="btn btn-danger btn-sm" data-action="deleteAlarm" data-arg="${a.id}">${t('btn_remove')}</button></div>
            </div>`).join('')}</div>`
        }
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">⏰ ${t('alarms_queued')||'Queued Timed Items'}</div>
        <div id="alarmQueuedItems"><em style="color:var(--text-dim);font-size:var(--fs-xs)">${t('lb_loading')||'Loading…'}</em></div>
      </div>
    `;
    _fetchQueued();
  } else if (tab === 'layers') {
    const myLayers     = state.layers.filter(l => l.owner_id === state.user.id);
    const sharedLayers = state.layers.filter(l => l.owner_id !== state.user.id);
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_master')}
        </div>
        <div class="layer-list">
          <div class="layer-item${!(state.preferences.hidden_layers&&state.preferences.hidden_layers.length>0)?' active':''}" data-action="toggleAllLayers">
            <div class="layer-swatch" style="background:var(--accent)"></div>
            <span class="layer-name">${t('layers_master')}</span>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('layers_my')}
          <button class="btn btn-primary btn-sm" data-action="openLayerModal" data-arg="null">${t('layers_add')}</button>
        </div>
        <div class="layer-list">
          ${myLayers.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No layers yet.</div>` : ''}
          ${myLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" data-action="toggleLayer" data-arg="${l.id}">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${l.visibility}</span>
              <button class="btn btn-ghost btn-icon" style="font-size:11px" data-edit-layer='${escAttr(JSON.stringify(l))}' data-stop-prop-only>✏️</button>
            </div>`;
          }).join('')}
        </div>
      </div>
      ${sharedLayers.length ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('layers_shared')}</div>
        <div class="layer-list">
          ${sharedLayers.map(l => {
            const active = isLayerActive(l.id);
            return `<div class="layer-item${active?' active':''}" data-action="toggleLayer" data-arg="${l.id}">
              <div class="layer-swatch" style="background:${l.color||'#4A90D9'}"></div>
              <span class="layer-name">${escHtml(l.name)}</span>
              <span class="layer-vis">${escHtml(l.owner_name||'')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  } else if (tab === 'resources' && state.user && (state.user.role==='admin' || state.user.role==='developer')) {
    const canSeeLoc = userHasCapability('see_location');
    const gl = getGroupLabel();
    // Sub-tab state
    const resSubTab = el.dataset.resSubTab || 'users';
    const subBtn = (key, label, icon) =>
      `<button class="toggle-btn${resSubTab===key?' active':''}" data-res-sub="${key}">${icon} ${label}</button>`;
    // Build sub-tab bar with built-in types + custom types
    const customTypes = state._customResourceTypes || [];
    let subTabBar = `<div class="toggle-btn-group" style="margin-bottom:10px;flex-wrap:wrap">
      ${subBtn('users', t('tab_users')||'Users', '👤')}
      ${subBtn('groups', gl.plural, '👥')}
      ${subBtn('rooms', t('resource_rooms')||'Rooms', '🏠')}
      ${subBtn('buildings', t('resource_buildings')||'Buildings', '🏢')}
      ${subBtn('computers', t('resource_computer_services')||'IT Services', '💻')}
      ${subBtn('datacenters', t('resource_data_centers')||'Data Centers', '🖥')}
      ${subBtn('work_areas', t('resource_work_areas')||'Work Areas', '💼')}
      ${subBtn('alliance_partners', t('resource_alliance_partners')||'Alliance Partners', '🤝')}
      ${subBtn('capabilities', t('resource_capabilities')||'Capabilities', '🎯')}
      ${subBtn('applications', t('resource_applications')||'Applications', '📱')}
      ${subBtn('infrastructure', t('resource_infrastructure')||'Infrastructure', '🏗')}
      ${customTypes.map(ct => subBtn('custom_'+ct.key, ct.label, ct.icon||'📦')).join('')}
      ${subBtn('resource_list', t('resource_list')||'Resource List', '📋')}
      ${subBtn('resource_plan', t('resource_plan')||'Resource Plan', '📅')}
      <button class="toggle-btn" data-action="openDetachedResources" title="${t('detach_window')||'Open in separate window'}" style="margin-left:auto">⧉</button>
    </div>`;
    // Load custom resource types if not cached
    if (!state._customResourceTypes) {
      apiGet('/api/custom-resource-types').then(types => {
        state._customResourceTypes = types || [];
        renderSidebar();
      });
      el.innerHTML = `<div style="color:var(--text-dim);font-size:var(--fs-sm);padding:8px">Loading…</div>`;
      return;
    }
    if (resSubTab === 'users') {
      apiGet('/api/users').then(users => {
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">
              ${t('tab_users')}
              <button class="btn btn-primary btn-sm" data-action="openUserModal" data-arg="null">${t('btn_add')}</button>
            </div>
            <div class="user-list">
              ${(users||[]).map(u => `
                <div class="user-item" style="cursor:pointer;flex-wrap:wrap${u.blocked ? ';background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25)' : ''}" data-action="openUserModal" data-arg='${escAttr(JSON.stringify(u))}' data-arg-el>
                  <div class="user-name" style="min-width:120px">
                    <div>${u.blocked ? '<span title="${t("user_blocked")||"Blocked"}" style="color:var(--red,#E74C3C)">🚫 </span>' : ''}${escHtml(u.display_name||u.username)}${u.is_oidc ? ' <span title="SSO / OIDC user" style="font-size:var(--fs-xs);background:var(--accent-muted,rgba(0,120,255,.15));color:var(--accent);border:1px solid var(--accent);border-radius:3px;padding:0 4px;vertical-align:middle;font-weight:600">SSO</span>' : ''}</div>
                    <div style="font-size:var(--fs-xs);color:var(--text-dim)">@${escHtml(u.username)}${canSeeLoc && u.location ? ' · 📍 '+escHtml(u.location) : ''}</div>
                  </div>
                  <span class="role-badge role-${u.role}">${getRoleDisplayName(u.role)}</span>
                  ${u.can_lock?'<span title="Can lock">🔒</span>':''}
                  ${(u.nato_designations && u.nato_designations.length) ? `<span style="font-size:var(--fs-sm);color:var(--accent);font-weight:600;letter-spacing:.04em">${u.nato_designations.join(' ')}</span>` : ''}
                  ${(u.labels && u.labels.length) ? `<div style="width:100%;display:flex;gap:3px;flex-wrap:wrap;margin-top:2px">${u.labels.map(l => `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${l.color||'var(--accent)'};color:#fff;font-weight:600" title="${escHtml((l.set_by_name||'')+' · '+(l.set_at?new Date(l.set_at).toLocaleDateString():''))}">${escHtml(l.text)}</span>`).join('')}</div>` : ''}
                  <div style="width:100%;display:flex;gap:10px;font-size:10px;color:var(--text-dim);margin-top:2px;padding-left:2px;flex-wrap:wrap">
                    <span title="${t('user_created_at')||'Created'}">${t('user_created_at')||'Created'}: ${u.created_at ? fmtDateTime(new Date(u.created_at)) : '—'}</span>
                    <span title="${t('user_last_login')||'Last login'}">${t('user_last_login')||'Last login'}: ${u.last_login_at ? fmtDateTime(new Date(u.last_login_at)) : '—'}</span>
                    <span title="${t('user_login_count')||'Logins'}">${t('user_login_count')||'Logins'}: ${u.login_count || 0}</span>
                  </div>
                  <button class="btn btn-ghost btn-icon" data-action="openUserModal" data-arg='${escAttr(JSON.stringify(u))}' data-arg-el data-stop-prop>✏️</button>
                </div>`).join('')}
            </div>
          </div>
          <div class="sidebar-section">
            <div class="sidebar-section-title">🛡 ${t('role_editor_title')||'Role Editor'}</div>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('role_editor_desc')||'Edit role display names and capabilities.'}</p>
            <button class="btn btn-secondary btn-sm" data-action="openRoleEditor">🛡 ${t('role_editor_title')||'Role Editor'}…</button>
          </div>`;
        _bindResSubTabs(el);
        _bindActions(el);
      });
    } else if (resSubTab === 'groups') {
      el.innerHTML = subTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span class="group-icon-badge">👥</span> ${gl.plural}
            <button class="btn btn-primary btn-sm" data-action="openGroupModal" data-arg="null">+ ${t('btn_add')||'Add'} ${gl.singular}</button>
          </div>
          <div class="group-list">
            ${state.groups.length===0 ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">No ${gl.plural.toLowerCase()} yet.</div>` : ''}
            ${state.groups.map(g => `
              <div class="group-item" style="cursor:pointer" data-action="openGroupModal" data-arg='${escAttr(JSON.stringify(g))}' data-arg-el>
                <div class="group-name">
                  <div>${escHtml(g.name)}</div>
                  ${g.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(g.description)}</div>` : ''}
                </div>
                <button class="btn btn-ghost btn-icon btn-sm" data-action="openMemberModal" data-arg='${escAttr(JSON.stringify(g))}' data-arg-el title="${t('groups_members')}" data-stop-prop>👥</button>
                <button class="btn btn-ghost btn-icon" data-action="openGroupModal" data-arg='${escAttr(JSON.stringify(g))}' data-arg-el title="Edit" data-stop-prop>✏️</button>
              </div>`).join('')}
          </div>
        </div>`;
      _bindResSubTabs(el);
      _bindActions(el);
    } else if (resSubTab === 'rooms' || resSubTab === 'buildings' || resSubTab === 'computers' || resSubTab === 'datacenters' || resSubTab === 'work_areas' || resSubTab === 'alliance_partners' || resSubTab === 'capabilities' || resSubTab === 'applications' || resSubTab === 'infrastructure' || resSubTab.startsWith('custom_')) {
      const builtinTypeMap = {rooms:'room', buildings:'building', computers:'computer_service', datacenters:'data_center', work_areas:'work_area', alliance_partners:'alliance_partner', capabilities:'capability', applications:'application', infrastructure:'infrastructure'};
      const builtinLabelMap = {rooms:t('resource_rooms')||'Rooms', buildings:t('resource_buildings')||'Buildings', computers:t('resource_computer_services')||'Computer Services', datacenters:t('resource_data_centers')||'Data Centers', work_areas:t('resource_work_areas')||'Work Areas', alliance_partners:t('resource_alliance_partners')||'Alliance Partners', capabilities:t('resource_capabilities')||'Capabilities', applications:t('resource_applications')||'Applications', infrastructure:t('resource_infrastructure')||'Infrastructure'};
      const builtinIconMap = {rooms:'🏠', buildings:'🏢', computers:'💻', datacenters:'🖥', work_areas:'💼', alliance_partners:'🤝', capabilities:'🎯', applications:'📱', infrastructure:'🏗'};
      let roomType, sectionLabel, sectionIcon;
      if (resSubTab.startsWith('custom_')) {
        const customKey = resSubTab.replace('custom_', '');
        const ct = customTypes.find(c => c.key === customKey);
        roomType = customKey;
        sectionLabel = ct ? ct.label : customKey;
        sectionIcon = ct ? (ct.icon||'📦') : '📦';
      } else {
        roomType = builtinTypeMap[resSubTab];
        sectionLabel = builtinLabelMap[resSubTab];
        sectionIcon = builtinIconMap[resSubTab];
      }
      apiGet('/api/rooms').then(rooms => {
        const filtered = (rooms||[]).filter(r => r.type === roomType);
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">${sectionIcon} ${sectionLabel}
              <button type="button" class="btn btn-primary btn-sm" data-action="openRoomModal" data-arg='{"type":"${roomType}"}'>${t('btn_add')||'Add'}</button>
            </div>
            ${filtered.length === 0 ? `<p style="color:var(--text-dim);font-size:var(--fs-sm)">No ${sectionLabel.toLowerCase()} yet.</p>` : ''}
            ${filtered.map(r => `
              <div style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px;cursor:pointer" data-action="openRoomModal" data-arg='${escAttr(JSON.stringify(r))}'>
                ${r.image_name ? `<img src="/api/rooms/${r.id}/image" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border)">` :
                  `<span style="font-size:24px;width:48px;text-align:center">${r.icon || sectionIcon}</span>`}
                <div style="flex:1;min-width:0">
                  <div style="font-size:var(--fs-sm);font-weight:600">${r.icon && !r.image_name ? r.icon+' ' : ''}${escHtml(r.name)}</div>
                  ${r.sub_type ? `<div style="font-size:var(--fs-xs);color:var(--accent);font-weight:600">${t('room_type_'+r.sub_type)||r.sub_type.replace(/_/g,' ')}</div>` : ''}
                  ${r.zone ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">\u{1F310} ${escHtml(r.zone)}</div>` : ''}
                  ${r.responsibility ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">\u{1F464} ${escHtml(r.responsibility)}</div>` : ''}
                  ${r.status && r.type === 'capability' ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${{'working':'\u{1F7E2}','degraded':'\u{1F7E1}','down':'\u{1F534}','unknown':'\u26AA'}[r.status]||'\u26AA'} ${r.status}</div>` : ''}
                  ${r.location ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">\u{1F4CD} ${escHtml(r.location)}</div>` : ''}
                  ${r.capacity ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${t('capacity')||'Capacity'}: ${r.capacity}</div>` : ''}
                  ${r.description ? `<div style="font-size:var(--fs-xs);color:var(--text-dim)">${escHtml(r.description)}</div>` : ''}
                </div>
                <button class="btn btn-ghost btn-icon btn-sm" data-action="openRoomModal" data-arg='${escAttr(JSON.stringify(r))}' data-stop-prop>✏️</button>
                <button class="btn btn-danger btn-icon btn-sm" data-delete-room="${r.id}" data-room-name="${escAttr(r.name)}" data-stop-prop title="${t('btn_delete')||'Delete'}" style="padding:2px 6px;font-size:var(--fs-xs)">✕</button>
              </div>`).join('')}
          </div>`;
        _bindResSubTabs(el);
        _bindActions(el);
        // Bind delete buttons for resources
        el.querySelectorAll('[data-delete-room]').forEach(btn => {
          btn.addEventListener('click', async e => {
            e.stopPropagation();
            const roomId = parseInt(btn.dataset.deleteRoom, 10);
            const roomName = btn.dataset.roomName || '';
            if (!confirm((t('confirm_delete_resource')||'Delete this resource?') + (roomName ? ' (' + roomName + ')' : ''))) return;
            const res = await apiDel('/api/rooms/' + roomId);
            if (res.ok) {
              showNotification('success', t('resource_deleted')||'Resource deleted');
              renderSidebar();
            } else {
              const err = await res.json().catch(() => ({}));
              showError(err.error || 'Failed to delete');
            }
          });
        });
      });
    } else if (resSubTab === 'manage_types') {
      // Manage custom resource types
      el.innerHTML = subTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">⚙ ${t('manage_resource_types')||'Manage Resource Types'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('manage_resource_types_desc')||'Create custom resource categories. Resources of each type appear as their own tab.'}</p>
          <div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:10px">
            <label class="form-label" style="font-size:var(--fs-xs)">${t('resource_type_key')||'Key (machine name)'}</label>
            <input class="form-input" id="crtKey" placeholder="e.g. vehicle" style="margin-bottom:4px;font-size:var(--fs-sm)">
            <label class="form-label" style="font-size:var(--fs-xs)">${t('resource_type_label')||'Display Name'}</label>
            <input class="form-input" id="crtLabel" placeholder="e.g. Vehicles" style="margin-bottom:4px;font-size:var(--fs-sm)">
            <label class="form-label" style="font-size:var(--fs-xs)">${t('resource_type_icon')||'Icon (emoji)'}</label>
            <input class="form-input" id="crtIcon" placeholder="e.g. 🚗" style="margin-bottom:6px;font-size:var(--fs-sm);width:60px">
            <button class="btn btn-primary btn-sm" data-action="saveCustomResourceType">${t('btn_add')||'Add'}</button>
          </div>
          ${customTypes.length === 0 ? `<p style="color:var(--text-dim);font-size:var(--fs-sm)">${t('no_custom_types')||'No custom resource types defined yet.'}</p>` : ''}
          ${customTypes.map(ct => `
            <div style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:4px" data-crt-id="${ct.id}">
              <span style="font-size:20px" class="crt-icon">${ct.icon||'📦'}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--fs-sm);font-weight:600" class="crt-label">${escHtml(ct.label)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-dim)">key: ${escHtml(ct.key)}</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-crt-edit="${ct.id}" data-crt-key="${escAttr(ct.key)}" data-crt-label="${escAttr(ct.label)}" data-crt-icon="${escAttr(ct.icon||'')}" style="padding:2px 8px;font-size:var(--fs-xs)" title="${t('btn_edit')||'Edit'}">✏️</button>
              <button class="btn btn-danger btn-sm" data-action="deleteCustomResourceType" data-arg="${ct.id}" style="padding:2px 8px;font-size:var(--fs-xs)">✕</button>
            </div>`).join('')}
        </div>`;
      _bindResSubTabs(el);
      _bindActions(el);
      // Bind edit buttons for custom resource types
      el.querySelectorAll('[data-crt-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const keyInput = el.querySelector('#crtKey');
          const labelInput = el.querySelector('#crtLabel');
          const iconInput = el.querySelector('#crtIcon');
          const addBtn = el.querySelector('[data-action="saveCustomResourceType"]');
          if (keyInput) { keyInput.value = btn.dataset.crtKey; keyInput.readOnly = true; }
          if (labelInput) labelInput.value = btn.dataset.crtLabel;
          if (iconInput) iconInput.value = btn.dataset.crtIcon;
          if (addBtn) addBtn.textContent = t('btn_save') || 'Save';
          keyInput?.scrollIntoView({behavior:'smooth', block:'nearest'});
        });
      });
    } else if (resSubTab === 'resource_list') {
      // Resource list: shows all users, groups, and rooms in a combined view
      const canEdit = hasRole2(state.user.role, 'teamlead');
      Promise.all([apiGet('/api/users'), apiGet('/api/rooms').catch(()=>[])]).then(([users, rooms]) => {
        const allResources = [];
        (users||[]).forEach(u => allResources.push({type:'user', name: u.display_name||u.username, role: u.role, detail: '@'+u.username}));
        state.groups.forEach(g => allResources.push({type:'group', name: g.name, detail: g.description||''}));
        const typeIcons = {room:'🏠', building:'🏢', computer_service:'💻', data_center:'🖥', exercise_area:'🏋', work_area:'💼', rest_room:'☕', training_ground:'🎯'};
        (rooms||[]).forEach(r => allResources.push({type: r.type||'room', name: r.name, detail: (r.location||'') + (r.capacity ? ' (cap:'+r.capacity+')' : ''), icon: typeIcons[r.type]||'🏠', _roomData: r}));
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">📋 ${t('resource_list')||'Resource List'}
              ${hasRole2(state.user.role, 'teamlead') ? `<button class="btn btn-secondary btn-sm" data-res-sub="manage_types" style="font-size:var(--fs-xs)">⚙ ${t('manage_resource_types')||'Manage Types'}</button>` : ''}
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">
              <thead><tr style="background:var(--bg3)">
                <th style="padding:4px 8px;text-align:left">${t('resource_type')||'Type'}</th>
                <th style="padding:4px 8px;text-align:left">${t('resource_name')||'Name'}</th>
                <th style="padding:4px 8px;text-align:left">${t('resource_detail')||'Detail'}</th>
                ${canEdit ? `<th style="padding:4px 8px;text-align:center;width:70px">${t('actions')||'Actions'}</th>` : ''}
              </tr></thead><tbody>
              ${allResources.map(r => `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:4px 8px">${r.icon||(r.type==='user'?'👤':'<span class="group-icon-badge">👥</span>')} ${({user:t('tab_users')||'User',group:t('tab_groups')||'Group',room:t('resource_rooms')||'Room',building:t('resource_buildings')||'Building',computer_service:t('resource_computer_services')||'IT Service',data_center:t('resource_data_centers')||'Data Center'})[r.type]||r.type}</td>
                <td style="padding:4px 8px">${escHtml(r.name)}</td>
                <td style="padding:4px 8px;color:var(--text-dim)">${escHtml(r.detail)}${r.role?' <span class="role-badge role-'+r.role+'">'+getRoleDisplayName(r.role)+'</span>':''}</td>
                ${canEdit && r._roomData ? `<td style="padding:4px 8px;text-align:center;white-space:nowrap">
                  <button class="btn btn-ghost btn-icon btn-sm" data-rl-edit='${escAttr(JSON.stringify(r._roomData))}' title="${t('btn_edit')||'Edit'}">✏️</button>
                  <button class="btn btn-ghost btn-icon btn-sm" data-rl-delete="${r._roomData.id}" title="${t('btn_delete')||'Delete'}" style="color:var(--danger)">🗑</button>
                </td>` : (canEdit ? '<td></td>' : '')}
              </tr>`).join('')}
              </tbody></table>
          </div>`;
        _bindResSubTabs(el);
        // Bind edit/delete actions for resources
        if (canEdit) {
          el.querySelectorAll('[data-rl-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
              const roomData = JSON.parse(btn.dataset.rlEdit);
              openRoomModal(roomData);
            });
          });
          el.querySelectorAll('[data-rl-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(t('confirm_delete_resource')||'Delete this resource?')) return;
              try {
                const res = await api('DELETE', '/api/rooms/' + btn.dataset.rlDelete, null);
                if (res.ok) {
                  showNotification('success', t('resource_deleted')||'Resource deleted');
                  renderSidebar();
                } else {
                  showError(t('resource_delete_failed')||'Failed to delete resource');
                }
              } catch (e) { showError(e.message); }
            });
          });
        }
      });
    } else if (resSubTab === 'resource_plan') {
      // Resource plan: shows who is assigned to what events
      apiGet('/api/users').then(users => {
        const evByUser = {};
        (state.events||[]).forEach(ev => {
          const key = ev.participant || ev.user_name || 'Unassigned';
          if (!evByUser[key]) evByUser[key] = [];
          evByUser[key].push(ev);
        });
        const userNames = Object.keys(evByUser).sort();
        el.innerHTML = subTabBar + `
          <div class="sidebar-section">
            <div class="sidebar-section-title">📅 ${t('resource_plan')||'Resource Plan'}</div>
            ${userNames.length === 0 ? '<p style="color:var(--text-dim);font-size:var(--fs-sm)">No event assignments found.</p>' : ''}
            ${userNames.map(name => `
              <div style="margin-bottom:10px">
                <div style="font-weight:600;font-size:var(--fs-sm);margin-bottom:4px">👤 ${escHtml(name)} <span style="color:var(--text-dim);font-weight:400">(${evByUser[name].length})</span></div>
                ${evByUser[name].sort((a,b)=>new Date(a.start_time)-new Date(b.start_time)).slice(0,10).map(ev => `
                  <div style="font-size:var(--fs-xs);padding:2px 0 2px 12px;color:var(--text-dim)">
                    ${fmtDateTime(new Date(ev.start_time))} — ${escHtml(ev.title)}
                  </div>`).join('')}
              </div>`).join('')}
          </div>`;
        _bindResSubTabs(el);
      });
    }
  } else if (tab === 'logs' && state.user && hasRole2(state.user.role, 'teamlead')) {
    const logSub = el.dataset.logSubTab || 'decision';
    const logSubBtn = (key, label) =>
      `<button class="toggle-btn${logSub===key?' active':''}" data-log-sub="${key}">${label}</button>`;
    const logTabBar = `<div class="toggle-btn-group" style="margin-bottom:10px">
      ${logSubBtn('decision', t('decisions_title')||'Decisions')}
      ${logSubBtn('logbook', t('tab_log_book')||'Log Book')}
      ${logSubBtn('checklists', t('checklist_logs')||'Checklist Log')}
      ${logSubBtn('audit', t('tab_audit_log')||'Audit Log')}
      ${logSubBtn('eventlog', t('tab_event_log')||'Event Log')}
      ${logSubBtn('pollster', t('tab_pollster_log')||'Pollster Log')}
    </div>`;
    if (logSub === 'decision') {
      el.innerHTML = logTabBar + `<div class="sidebar-section">
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="openDecisionLogModal">⚖ ${t('decisions_title')||'Decisions'}</button>
          <button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="detachDecisionLog">⧉ ${t('detach_window')||'Detach Window'}</button>
        </div>
      </div>`;
      _bindLogSubTabs(el);
    } else if (logSub === 'audit') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">${t('tab_audit_log')||'Audit Log'}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <input type="text" id="auditSearch" placeholder="🔍 Search…" style="flex:1;min-width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="oninput">
            <select id="auditFilterAction" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
              <option value="">${t('audit_all_actions')||'All actions'}</option>
              <option value="created">${t('audit_created')||'Created'}</option>
              <option value="updated">${t('audit_updated')||'Updated'}</option>
              <option value="deleted">${t('audit_deleted')||'Deleted'}</option>
              <option value="status_changed">${t('audit_status_changed')||'Status Changed'}</option>
              <option value="login">${t('audit_login')||'Login'}</option>
              <option value="login_failed">${t('audit_login_failed')||'Login Failed'}</option>
              <option value="login_blocked">${t('audit_login_blocked')||'Login Blocked'}</option>
              <option value="blocked">${t('audit_user_blocked')||'User Blocked'}</option>
              <option value="unblocked">${t('audit_user_unblocked')||'User Unblocked'}</option>
              <option value="reset">${t('audit_reset')||'Reset'}</option>
            </select>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
            <input type="date" id="auditDateFrom" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
            <span style="color:var(--text-dim);font-size:var(--fs-xs)">–</span>
            <input type="date" id="auditDateTo" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="csv" title="Export to CSV">⬇ CSV</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="json" title="Export to JSON">⬇ JSON</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="rtf" title="Export to RTF">⬇ RTF</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="docx" title="Export to DOCX">⬇ DOCX</button>
          </div>
          <div id="auditLog" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">Loading…</em></div>
        </div>`;
      _bindLogSubTabs(el);
      refreshAuditLog();
    } else if (logSub === 'eventlog') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">${t('tab_event_log')||'Event Log'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">External events received via pub/sub or webhook.</p>
          <div id="eventLogEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('event_log_empty')||'No external events received yet.'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _loadEventLog();
    } else if (logSub === 'logbook') {
      const cats = [
        {v:'incoming',l:t('lb_incoming')||'Incoming matter'},
        {v:'outgoing',l:t('lb_outgoing')||'Outgoing matter'},
        {v:'incident',l:t('lb_incident')||'Special incident'},
        {v:'directive',l:t('lb_directive')||'Directive'},
        {v:'decision',l:t('lb_decision')||'Decision'},
        {v:'action',l:t('lb_action')||'Action taken'},
        {v:'briefing',l:t('lb_briefing')||'Briefing content'},
        {v:'situation',l:t('lb_situation')||'Situation change'},
        {v:'logistics',l:t('lb_logistics')||'Logistics'},
        {v:'meeting',l:t('lb_meeting')||'Meeting protocol'},
        {v:'other',l:t('lb_other')||'Other'}
      ].filter(c => !(c.v === 'decision' && state.preferences && state.preferences.logbook_hide_decisions));
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">📖 ${t('tab_log_book')||'Log Book'}
            <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6;margin-left:auto" data-action="openDetachedLogBook" title="${t('btn_detach')||'Detach to window'}">⧉</button>
          </div>
          <div style="background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:8px">
            <select id="lbCategory" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
              ${cats.map(c=>`<option value="${c.v}">${c.l}</option>`).join('')}
            </select>
            <input type="text" id="lbSubject" placeholder="${t('lb_subject')||'Subject'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);margin-bottom:4px">
            <textarea id="lbBody" rows="2" placeholder="${t('lb_body')||'Details (optional)'}" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs);resize:vertical;margin-bottom:4px"></textarea>
            <div style="display:flex;gap:6px;align-items:center">
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--text-dim);cursor:pointer">
                📎 <input type="file" id="lbAttachFile" style="max-width:120px;font-size:10px" multiple>
              </label>
              <span style="flex:1"></span>
              <button class="btn btn-primary btn-sm" data-action="addLogBookEntry">${t('btn_add')||'Add'}</button>
            </div>
          </div>
          <div id="logBookEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _bindActions(el);
      _loadLogBook();
    } else if (logSub === 'checklists') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">📋 ${t('checklist_logs')||'Checklist Log'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('checklist_logs_desc')||'All completed checklists with details and timestamps.'}</p>
          <div id="checklistLogEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _loadChecklistLog();
    } else if (logSub === 'pollster') {
      el.innerHTML = logTabBar + `
        <div class="sidebar-section">
          <div class="sidebar-section-title">📊 ${t('pollster_log_title')||'Pollster Log'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('pollster_log_desc')||'View, search, and export poll results.'}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <input type="text" id="pollsterSearch" placeholder="🔍 ${t('search')||'Search'}…" style="flex:1;min-width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)">
            <button class="btn btn-secondary btn-sm" id="pollsterExportCSV" title="Export to CSV">⬇ CSV</button>
            <button class="btn btn-secondary btn-sm" id="pollsterExportJSON" title="Export to JSON">⬇ JSON</button>
            <button class="btn btn-secondary btn-sm" id="pollsterExportRTF" title="Export to RTF">⬇ RTF</button>
            <button class="btn btn-secondary btn-sm" id="pollsterExportDOCX" title="Export to DOCX">⬇ DOCX</button>
            <button class="btn btn-secondary btn-sm" id="pollsterPrint" title="Print">🖨</button>
          </div>
          <div id="pollsterLogEntries" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">${t('lb_loading')||'Loading…'}</em></div>
        </div>`;
      _bindLogSubTabs(el);
      _loadPollsterLog(el);
    }
  } else if (tab === 'phases' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          ${t('tab_phases')||'Exercise Phases'}
          <button class="btn btn-primary btn-sm" data-action="openPhaseModal" data-arg="null">${t('btn_add')||'+ Add'}</button>
        </div>
        <div class="phase-list">
          ${state.phases.length === 0
            ? `<div style="color:var(--text-dim);font-size:var(--fs-sm)">${t('phases_none')||'No phases defined.'}</div>`
            : state.phases.sort((a,b)=>a.order-b.order).map(ph => {
              const canEdit = state.user && (hasRole2(state.user.role,'oplead') || ph.created_by === state.user.id);
              return `<div class="phase-item" style="border-left:4px solid ${ph.color};padding:6px 8px;margin-bottom:6px;background:var(--bg2);border-radius:var(--radius);${canEdit?'cursor:pointer':'cursor:default'}" ${canEdit?`data-action="openPhaseModal" data-arg='${escAttr(JSON.stringify(ph))}' data-arg-el`:''}>
                <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text)">${escHtml(ph.name)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-dim)">${fmtDateTime(new Date(ph.start_time))} – ${fmtDateTime(new Date(ph.end_time))}</div>
                ${canEdit ? `<div style="display:flex;gap:4px;margin-top:4px" data-stop-prop-only>
                  <button class="btn btn-ghost btn-sm" data-action="openPhaseModal" data-arg='${escAttr(JSON.stringify(ph))}' data-arg-el>✏️</button>
                  <button class="btn btn-danger btn-sm" data-action="deletePhase" data-arg="${ph.id}">✕</button>
                </div>` : ''}
              </div>`;
            }).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'audit' && state.user && hasRole2(state.user.role, 'teamlead')) {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('tab_audit')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <input type="text" id="auditSearch" placeholder="🔍 Search…" style="flex:1;min-width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 8px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="oninput">
          <select id="auditFilterAction" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
            <option value="">${t('audit_all_actions')||'All actions'}</option>
            <option value="created">${t('audit_created')||'Created'}</option>
            <option value="updated">${t('audit_updated')||'Updated'}</option>
            <option value="deleted">${t('audit_deleted')||'Deleted'}</option>
            <option value="status_changed">${t('audit_status_changed')||'Status Changed'}</option>
            <option value="login">${t('audit_login')||'Login'}</option>
            <option value="login_failed">${t('audit_login_failed')||'Login Failed'}</option>
            <option value="login_blocked">${t('audit_login_blocked')||'Login Blocked'}</option>
            <option value="blocked">${t('audit_user_blocked')||'User Blocked'}</option>
            <option value="unblocked">${t('audit_user_unblocked')||'User Unblocked'}</option>
            <option value="reset">${t('audit_reset')||'Reset'}</option>
          </select>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
          <input type="date" id="auditDateFrom" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
          <span style="color:var(--text-dim);font-size:var(--fs-xs)">–</span>
          <input type="date" id="auditDateTo" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)" data-action="refreshAuditLog" data-event="change">
          <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="csv" title="Export to CSV">⬇ CSV</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="json" title="Export to JSON">⬇ JSON</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="rtf" title="Export to RTF">⬇ RTF</button>
            <button class="btn btn-secondary btn-sm" data-action="exportAuditLog" data-arg="docx" title="Export to DOCX">⬇ DOCX</button>
        </div>
        <div id="auditLog" style="font-size:var(--fs-xs)"><em style="color:var(--text-dim)">Loading…</em></div>
      </div>`;
    refreshAuditLog();
  } else if (tab === 'integrations' && state.user && (state.user.role === 'admin' || state.user.role === 'developer')) {
    const p = state.preferences;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔔 ${t('settings_webhook')||'Notifications / Webhook'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure a webhook to receive real-time alarm notifications from Tidslinjal.
          When an alarm fires, a JSON payload is POST-ed to this URL. Changes are audited.
        </p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)" title="Choose the payload format that matches your target service">
            Format
            <span style="opacity:.55;font-style:italic;margin-left:4px">— how the notification is structured</span>
          </label>
          <select id="prefWebhookType" style="width:100%;margin-bottom:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)"
            title="Generic JSON: raw payload with all alarm fields. Mattermost/Slack: formatted text message compatible with Mattermost and Slack incoming webhooks.">
            <option value="generic"${p.webhook_type==='generic'||!p.webhook_type?' selected':''}>Generic JSON</option>
            <option value="mattermost"${p.webhook_type==='mattermost'?' selected':''}>Mattermost / Slack</option>
          </select>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)" title="The URL that will receive the notification POST request">
            Webhook URL
          </label>
          <input type="url" id="prefWebhookURL" placeholder="https://…/webhook" value="${escHtml(p.webhook_url||'')}"
            title="Paste the full HTTPS URL of your webhook endpoint. It must respond with HTTP 2xx to acknowledge receipt."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveWebhookPref" title="Save the webhook URL and format. Changes take effect immediately.">${t('btn_save')}</button>
          <button class="btn btn-secondary btn-sm" data-action="testWebhook" title="Send a test notification to the configured URL and check if it responds correctly.">${t('settings_webhook_test')}</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">💬 ${t('settings_mattermost_dm')||'Mattermost Direct Messages'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_mattermost_dm_desc')||'Configure the Mattermost DM base URL for the Staff Toolbox. Users with a Mattermost handle will get clickable DM links.'}
        </p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_mattermost_dm_url')||'Mattermost DM Base URL'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— team messages path without trailing slash or username</span>
          </label>
          <input type="url" id="prefMattermostDMURL" placeholder="https://mattermost.example.com/team/messages"
            value="${escHtml((state.exercise && state.exercise.mattermost_dm_url) || '')}"
            title="The base URL for Mattermost direct messages. The username (@handle) will be appended automatically."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:6px 8px;font-size:var(--fs-sm)">
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
            e.g. <code style="opacity:.7">https://mm.example.com/myteam/messages</code> — DM links become <code style="opacity:.7">…/messages/@username</code>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveMattermostDMPref">${t('btn_save')||'Save'}</button>
        </div>
      </div>

      <div class="sidebar-section" id="oidcSettingsSection">
        <div class="sidebar-section-title">🔐 ${t('settings_oidc')||'Single Sign-On (OIDC)'}</div>

        <!-- Status bar -->
        <div id="oidcStatusBar" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;margin-bottom:10px;background:var(--bg3);border:1px solid var(--border)">
          <span id="oidcStatusDot" style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#888"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--fs-xs);font-weight:600" id="oidcStatusLabel">Checking…</div>
            <div style="font-size:10px;color:var(--text-dim);word-break:break-all" id="oidcStatusDetail"></div>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="runOIDCTest"
            title="Run a live connectivity check: verifies discovery document, credentials, and route registration."
            style="flex-shrink:0;white-space:nowrap">🔍 Test</button>
        </div>

        <!-- OIDC test result panel -->
        <div id="oidcTestResult" style="display:none;margin-bottom:10px;border-radius:6px;overflow:hidden;border:1px solid var(--border)">
          <div style="padding:8px 10px;font-size:var(--fs-xs);font-weight:600;background:var(--bg3)">
            OIDC Diagnostics
            <button data-close-oidc-test
              style="float:right;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px">✕</button>
          </div>
          <div id="oidcTestSteps" style="padding:8px 10px;font-size:11px;line-height:1.7"></div>
          <div id="oidcTestSummary" style="padding:8px 10px;font-size:var(--fs-xs);font-weight:600;border-top:1px solid var(--border)"></div>
        </div>

        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:10px">
          OpenID Connect (OIDC) enables Single Sign-On: users are authenticated by an external
          Identity Provider (IdP) such as Keycloak, Azure AD, Okta, or Google Workspace, and
          automatically provisioned in Tidslinjal on first login.
        </p>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_issuer')||'Issuer URL'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— the base URL of your identity provider</span>
          </label>
          <input type="url" id="oidcIssuer" placeholder="https://accounts.example.com"
            title="The Issuer URL (also called the Realm URL in Keycloak). Tidslinjal appends /.well-known/openid-configuration to discover all endpoints automatically. Example: https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
            e.g. <code style="opacity:.7">https://login.microsoftonline.com/&lt;tenant&gt;/v2.0</code> (Azure AD),
            <code style="opacity:.7">https://accounts.google.com</code> (Google),
            <code style="opacity:.7">https://keycloak.example.com/realms/myrealm</code> (Keycloak)
          </div>
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_client_id')||'Client ID'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— provided by your IdP when you registered the application</span>
          </label>
          <input type="text" id="oidcClientID" placeholder="tidslinjal-client"
            title="The client ID (also called Application ID in Azure AD) assigned to Tidslinjal by your identity provider."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_client_secret')||'Client Secret'}
            <span style="opacity:.6;margin-left:4px">(leave blank to keep current)</span>
          </label>
          <input type="password" id="oidcClientSecret" placeholder="••••••••"
            title="The client secret issued by your identity provider. This is stored encrypted. Leave blank to keep the existing secret unchanged."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div id="oidcSecretHint" style="font-size:10px;color:var(--text-dim);margin-top:2px"></div>
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_redirect_url')||'Redirect URL'}
            <span style="opacity:.6;margin-left:4px">(leave blank for auto)</span>
          </label>
          <input type="url" id="oidcRedirectURL" placeholder="https://your-server/auth/oidc/callback"
            title="The URL that the identity provider redirects back to after authentication. Must exactly match a redirect URI registered in your IdP. Usually: https://your-server/auth/oidc/callback. If blank, defaults to http://localhost:8080/auth/oidc/callback."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
            Register this exact URL in your IdP's allowed redirect URIs list.
          </div>
        </div>

        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${t('settings_oidc_default_role')||'Default role for new users'}
            <span style="opacity:.55;font-style:italic;margin-left:4px">— applied when an SSO user is auto-created</span>
          </label>
          <select id="oidcDefaultRole"
            title="When a user logs in via SSO for the first time and no local account exists, they are automatically created with this role."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="teammember">Team Member — can create and edit events</option>
            <option value="teamlead">Team Lead — can manage events for their group</option>
            <option value="oplead">Op Lead — operational leadership role</option>
          </select>
        </div>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px"
          title="When enabled, only the built-in admin account can use local username/password login. All other users must authenticate via SSO.">
          <input type="checkbox" id="oidcExclusive" style="width:14px;height:14px;accent-color:var(--accent)">
          <span>
            ${t('settings_oidc_exclusive')||'Exclusive mode (disable local login)'}
            <span style="font-size:10px;color:var(--text-dim);display:block;margin-top:1px">
              ⚠ The built-in <code>admin</code> account is always exempt so you can recover if SSO breaks.
            </span>
          </span>
        </label>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:10px"
          title="Master switch — must be checked for OIDC SSO to be active. Saved settings are preserved when disabled.">
          <input type="checkbox" id="oidcEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          <span>Enable OIDC SSO</span>
        </label>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-action="saveOIDCSettings"
            title="Save configuration and immediately apply it. If the settings are invalid, an error will be shown."
            >${t('settings_oidc_save')||'Save & Apply'}</button>
          <button class="btn btn-secondary btn-sm" data-action="runOIDCTest"
            title="Run a live diagnostic check against the configured OIDC provider to verify connectivity and configuration."
            >🔍 Test Connection</button>
          <a href="/auth/oidc/login" target="_blank" class="btn btn-secondary btn-sm"
            title="Open the SSO login flow in a new tab to verify the end-to-end login experience."
            >↗ Try SSO Login</a>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📧 Mail Setup</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure SMTP to send alarm notifications, scheduled reports, and user invitation emails.
          Without mail, password reset tokens are shown inline and must be copied manually.
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px"
          title="Master switch. When off, email delivery is disabled but settings are preserved.">
          <input type="checkbox" id="mailEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Email Delivery
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Hostname or IP address of your SMTP server. Must be reachable from the Tidslinjal server.">SMTP Host</label>
          <input type="text" id="mailHost" placeholder="smtp.example.com"
            title="Examples: smtp.gmail.com, smtp.office365.com, mail.company.internal"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="SMTP port. Common values: 587 (STARTTLS), 465 (TLS/SSL), 25 (legacy/no TLS)">Port</label>
            <input type="number" id="mailPort" placeholder="587" value="587"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Encryption method. STARTTLS upgrades a plain connection to encrypted (port 587). TLS uses encryption from the start (port 465). None sends in plain text — not recommended.">TLS Mode</label>
            <select id="mailTLS" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
              <option value="starttls">STARTTLS (recommended, port 587)</option>
              <option value="tls">TLS / SSL (port 465)</option>
              <option value="none">None (plain, not recommended)</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="SMTP authentication username — usually your email address.">Username</label>
          <input type="text" id="mailUsername" placeholder="user@example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            Password <span style="opacity:.6">(leave blank to keep)</span>
          </label>
          <input type="password" id="mailPassword" placeholder="••••••••"
            title="SMTP authentication password. Leave blank to keep the currently saved password."
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="The email address that appears in the From field of outgoing messages.">From Address</label>
          <input type="email" id="mailFrom" placeholder="tidslinjal@example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="The human-readable name shown in the From field (e.g. 'Tidslinjal Notifications').">From Name</label>
          <input type="text" id="mailFromName" placeholder="Tidslinjal"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveMailConfig"
            title="Save SMTP settings.">Save</button>
          <button class="btn btn-secondary btn-sm" data-action="testMailConfig"
            title="Send a test email to the From address to verify that SMTP settings are correct.">Send Test Email</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📡 Syslog Forwarding</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Forward application log messages to a remote syslog server.
          Supports UDP, TCP, and TLS transports with classic (RFC 3164) or JSON formats.
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px"
          title="Enable syslog forwarding. When off, logs are written to stderr only.">
          <input type="checkbox" id="syslogEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Syslog Forwarding
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Hostname or IP of the remote syslog server.">Syslog Host</label>
          <input type="text" id="syslogHost" placeholder="syslog.example.com"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Port: default 514 for UDP/TCP, 6514 for TLS.">Port</label>
            <input type="number" id="syslogPort" placeholder="514"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Transport protocol. UDP is fire-and-forget. TCP guarantees delivery. TLS encrypts the channel.">Transport</label>
            <select id="syslogTransport" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
              <option value="udp">UDP (RFC 3164, port 514)</option>
              <option value="tcp">TCP (RFC 6587, port 514)</option>
              <option value="tls">TLS (RFC 5425, port 6514)</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Message format. Classic uses RFC 3164 syslog format. JSON sends structured JSON objects.">Log Format</label>
          <select id="syslogFormat" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="classic">Classic (RFC 3164)</option>
            <option value="json">JSON (structured)</option>
          </select>
        </div>
        <div class="form-row" style="gap:8px">
          <div class="form-group" style="flex:2;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Application name / tag appearing in syslog messages. Defaults to 'tidslinjal'.">App Name / Tag</label>
            <input type="text" id="syslogAppName" placeholder="tidslinjal"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)"
              title="Syslog facility (0–23). Default 1 = user-level. 16–23 = local0–local7.">Facility</label>
            <input type="number" id="syslogFacility" placeholder="1" min="0" max="23" value="1"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px"
          title="When enabled, the TLS server certificate must be signed by a trusted CA. Disable only for self-signed certs in private networks.">
          <input type="checkbox" id="syslogTLSVerify" checked style="width:14px;height:14px;accent-color:var(--accent)">
          Verify TLS certificate
        </label>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="saveSyslogConfig"
            title="Save syslog settings and apply immediately.">Save</button>
          <button class="btn btn-secondary btn-sm" data-action="testSyslogConfig"
            title="Send a test message to the syslog server.">Send Test Message</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">💼 Microsoft Teams Integration</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure Teams and Zoom to automatically attach meeting links to Meeting-type events.
          Notifications can also be sent to a Teams channel via an Incoming Webhook.
        </p>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Paste the Incoming Webhook URL from your Teams channel connector settings. Alarm and event notifications will be posted there.">
            Teams Webhook URL
            <span style="opacity:.55;font-style:italic;margin-left:4px">— for channel notifications</span>
          </label>
          <input type="url" id="teamsWebhookURL" placeholder="https://…/IncomingWebhook/…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="A base Teams meeting URL. Event title and time will be appended as query parameters when a meeting link is generated.">
            Teams Meeting URL Template
            <span style="opacity:.55;font-style:italic;margin-left:4px">— base URL for auto-generated meeting links</span>
          </label>
          <input type="url" id="teamsMeetingTemplate" placeholder="https://teams.microsoft.com/l/meetup-join/…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="A Zoom meeting URL to attach to Meeting-type events.">
            Zoom Meeting URL
            <span style="opacity:.55;font-style:italic;margin-left:4px">— for Meeting-type events</span>
          </label>
          <input type="text" id="zoomMeetingBase" placeholder="https://zoom.us/j/1234567890"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveTeamsConfig"
          title="Save Teams and Zoom integration settings.">Save Teams/Zoom Config</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 TLS / HTTPS Configuration</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          Configure TLS certificate and key file paths for HTTPS.
          CLI flags <code>--tls-cert</code> / <code>--tls-key</code> and environment variables
          <code>TLS_CERT</code> / <code>TLS_KEY</code> always take priority over settings stored here.
        </p>
        <div id="tlsCurrentStatus" style="margin-bottom:10px;padding:8px 10px;border-radius:var(--radius);background:var(--bg3);border:1px solid var(--border);font-size:var(--fs-xs)">
          Checking TLS status…
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Absolute path to the PEM-encoded TLS certificate file on the server.">Certificate File (cert.pem)</label>
          <input type="text" id="tlsCertFile" placeholder="/etc/ssl/certs/tidslinjal.crt"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)"
            title="Absolute path to the PEM-encoded private key file on the server.">Private Key File (key.pem)</label>
          <input type="text" id="tlsKeyFile" placeholder="/etc/ssl/private/tidslinjal.key"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="padding:8px 10px;border-radius:var(--radius);background:rgba(255,165,0,.12);border:1px solid rgba(255,165,0,.4);font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ⚠️ Changes to TLS configuration require a <strong>server restart</strong> to take effect.
          The server validates that both file paths are accessible before saving.
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveTLSConfig"
          title="Save TLS file paths. The server will use them on next restart.">Save TLS Config</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔑 API Keys</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          API keys allow external tools (scripts, monitoring systems, integrations) to access
          Tidslinjal without a user session. Use <code>Authorization: Bearer &lt;key&gt;</code> in HTTP requests.
          Keys are shown only once after creation — store them securely.
        </p>
        <div id="apiKeyList" style="margin-bottom:8px">Loading…</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="newAPIKeyName" placeholder="Key name"
              title="Give the key a descriptive name so you can identify which system uses it (e.g. 'Monitoring Script', 'CI Pipeline')."
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <button class="btn btn-primary btn-sm" data-action="createAPIKey"
              title="Generate a new API key. The key value will be shown once — copy it immediately.">+ Create</button>
          </div>
          <input type="text" id="newAPIKeyComment" placeholder="Comment (optional) — e.g. what system uses this key"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-xs)">
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔌 ${t('settings_connectors')||'Connectors / Plugins'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_connectors_desc')||'Configure external system connectors. Each connector can poll external services and push events into Tidslinjal.'}
        </p>
        <div id="connectorList" style="margin-bottom:8px">Loading…</div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📤 ${t('settings_event_bus')||'Outbound Event Bus'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_event_bus_desc')||'The event bus broadcasts lifecycle events (created, updated, deleted) to all registered connectors and webhook endpoints in real-time.'}
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius);color:var(--text-dim)">
          ${t('settings_event_bus_status')||'Status: Active — events are routed to configured connectors and webhooks automatically.'}
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📥 ${t('settings_ingest_api')||'Inbound Ingestion API'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_ingest_api_desc')||'External systems can push events into Tidslinjal via the Ingestion API. Authenticate with an API key using Authorization: Bearer <key>.'}
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius)">
          <code style="color:var(--accent);font-size:11px">POST /api/ingest</code>
          <span style="color:var(--text-dim);margin-left:8px">${t('settings_ingest_format')||'JSON payload with title, start, end, type fields'}</span>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📨 ${t('settings_report_webhook')||'Incoming Report Interface'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          External systems can submit reports (JSON, PDF, CSV) to the report archive via webhook.
          Authenticate with an API key using <code>Authorization: Bearer &lt;key&gt;</code>.
          Reports are tagged with sender, timestamp, subject, and type.
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius);margin-bottom:8px">
          <div style="margin-bottom:6px"><code style="color:var(--accent);font-size:11px">POST /api/reports/ingest</code>
            <span style="color:var(--text-dim);margin-left:8px">— Submit a report</span></div>
          <div style="margin-bottom:4px;font-weight:600;color:var(--text-dim)">JSON body:</div>
          <pre style="margin:0;padding:6px;background:var(--bg2);border-radius:4px;font-size:10px;overflow-x:auto;color:var(--text)">{
  "subject": "Daily status report",
  "sender": "external-system-name",
  "type": "sitrep",
  "description": "Optional description",
  "tags": ["daily", "sector-3"]
}</pre>
          <div style="margin-top:6px;font-weight:600;color:var(--text-dim)">Multipart (PDF/CSV):</div>
          <pre style="margin:0;padding:6px;background:var(--bg2);border-radius:4px;font-size:10px;overflow-x:auto;color:var(--text)">POST /api/reports/ingest
Content-Type: multipart/form-data
Fields: file, subject, sender, type, tags</pre>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="reportIngestEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable incoming report interface
        </label>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" data-action="saveReportIngestConfig">Save</button>
        </div>
      </div>

      ${state.user?.role === 'admin' ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔐 ${t('settings_federation')||'Federation / Trust Realms'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_federation_desc')||'Configure multiple identity providers (IdPs) for partner organizations. Each IdP belongs to a trust realm that controls access levels.'}
        </p>
        <div id="federatedIdPList" style="margin-bottom:8px">Loading…</div>
        <details style="margin-bottom:8px">
          <summary style="cursor:pointer;font-size:var(--fs-xs);color:var(--accent);font-weight:600">+ Add Identity Provider</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
            <input type="text" id="fedIdpId" placeholder="ID slug (e.g. partner-nato)" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpName" placeholder="Display name" style="font-size:var(--fs-xs)">
            <select id="fedIdpProtocol" style="font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px">
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
            <input type="text" id="fedIdpIssuer" placeholder="Issuer URL" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpClientId" placeholder="Client ID" style="font-size:var(--fs-xs)">
            <input type="password" id="fedIdpSecret" placeholder="Client Secret" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpRealm" placeholder="Trust realm slug" style="font-size:var(--fs-xs)">
            <input type="text" id="fedIdpDomains" placeholder="Allowed domains (comma-sep)" style="font-size:var(--fs-xs)">
            <select id="fedIdpRole" style="font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px">
              <option value="readonly">Read Only</option>
              <option value="readwrite">Read/Write</option>
              <option value="teammember" selected>Team Member</option>
              <option value="teamlead">Team Lead</option>
            </select>
            <button class="btn btn-secondary btn-sm" data-action="saveFederatedIdP">Save IdP</button>
          </div>
        </details>
        <details>
          <summary style="cursor:pointer;font-size:var(--fs-xs);color:var(--accent);font-weight:600">Trust Realms</summary>
          <div id="trustRealmList" style="margin-top:6px">Loading…</div>
        </details>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🏢 ${t('settings_rooms')||'Rooms & Resources'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_rooms_desc')||'Manage bookable rooms, vehicles, and equipment. Resources can be assigned to events for automatic scheduling.'}
        </p>
        <div id="roomList" style="margin-bottom:8px">Loading…</div>
        <details>
          <summary style="cursor:pointer;font-size:var(--fs-xs);color:var(--accent);font-weight:600">+ Add Room/Resource</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
            <input type="text" id="roomName" placeholder="Room/resource name" style="font-size:var(--fs-xs)">
            <select id="roomType" style="font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:4px">
              <option value="room">${t('resource_rooms')||'Room'}</option>
              <option value="building">${t('resource_buildings')||'Building'}</option>
              <option value="computer_service">${t('resource_computer_services')||'Computer Service'}</option>
              <option value="data_center">${t('resource_data_centers')||'Data Center'}</option>
              <option value="vehicle">${t('vehicle')||'Vehicle'}</option>
              <option value="equipment">${t('equipment')||'Equipment'}</option>
            </select>
            <input type="text" id="roomLocation" placeholder="Location" style="font-size:var(--fs-xs)">
            <input type="number" id="roomCapacity" placeholder="Capacity" min="1" style="font-size:var(--fs-xs)">
            <button class="btn btn-secondary btn-sm" data-action="saveRoom">Save</button>
          </div>
        </details>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📞 ${t('settings_meetings')||'Meeting Integration'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('settings_meetings_desc')||'Configure automatic meeting creation for Microsoft Teams and Zoom. Meeting links are auto-generated when creating virtual meeting events.'}
        </p>
        <div id="meetingConfigUI" style="font-size:var(--fs-xs)">
          <details>
            <summary style="cursor:pointer;color:var(--accent);font-weight:600">Microsoft Teams</summary>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
              <input type="text" id="teamsTenantId" placeholder="Tenant ID" style="font-size:var(--fs-xs)">
              <input type="text" id="teamsClientId" placeholder="Client ID" style="font-size:var(--fs-xs)">
              <input type="password" id="teamsSecret" placeholder="Client Secret" style="font-size:var(--fs-xs)">
              <button class="btn btn-secondary btn-sm" data-action="saveMeetingConfig" data-arg="teams">Save Teams Config</button>
            </div>
          </details>
          <details style="margin-top:6px">
            <summary style="cursor:pointer;color:var(--accent);font-weight:600">Zoom</summary>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
              <input type="text" id="zoomAccountId" placeholder="Account ID" style="font-size:var(--fs-xs)">
              <input type="text" id="zoomClientId" placeholder="Client ID" style="font-size:var(--fs-xs)">
              <input type="password" id="zoomSecret" placeholder="Client Secret" style="font-size:var(--fs-xs)">
              <button class="btn btn-secondary btn-sm" data-action="saveMeetingConfig" data-arg="zoom">Save Zoom Config</button>
            </div>
          </details>
        </div>
      </div>
      ` : ''}
    `;
    // Load current OIDC settings into the form
    setTimeout(_initOIDCSettingsUI, 0);
    setTimeout(_initMailSettingsUI, 0);
    setTimeout(_initSyslogSettingsUI, 0);
    setTimeout(_initReportIngestConfigUI, 0);
    setTimeout(_initTLSConfigUI, 0);
    setTimeout(_loadAPIKeys, 0);
    setTimeout(_loadTeamsConfigUI, 0);
    setTimeout(_loadConnectorList, 0);
    if (state.user?.role === 'admin') {
      setTimeout(_loadFederatedIdPs, 0);
      setTimeout(_loadTrustRealms, 0);
      setTimeout(_loadRoomList, 0);
    }
  } else if (tab === 'tools') {
    const role          = state.user?.role || '';
    const isAdminOrOplead = hasRole2(role, 'oplead');
    const isTeamLead    = hasRole2(role, 'teamlead');
    const canReport     = role === 'admin' || isAdminOrOplead || isTeamLead || userHasCapability('report');
    const canAutoReport = role === 'admin' || isAdminOrOplead || userHasCapability('auto_report');
    const toolBtn = (icon, label, fnName) =>
      `<button class="btn btn-secondary" style="text-align:left;padding:8px 12px;width:100%" data-action="${fnName.replace(/\(\)/,'')}">${icon} ${label}</button>`;
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>🛠 ${t('tab_tools')||'Tools'}</span>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" data-action="openDetachedTools" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(hasRole2(role, 'staffofficer') || userHasCapability('staff_toolbox')) ? toolBtn('\u{1F396}', t('staff_toolbox_title')||'Staff Toolbox', 'openStaffToolbox()') : ''}
          ${(isTeamLead || isAdminOrOplead || userHasCapability('teamlead_toolbox')) ? toolBtn('🧰', t('teamlead_toolbox_title')||'TeamLead Toolbox', 'openTeamLeadToolbox()') : ''}
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('📊', t('btn_task_time_matrix')||'Task-Time Matrix', 'openTaskTimeMatrix()') : ''}
          ${toolBtn('📊', t('poll_title')||'Poll / Multipoll', 'openPollModal()')}
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('📝', t('questionnaire_editor')||'Poll Questions Editor', 'openQuestionnaireEditor()') : ''}
          ${toolBtn('🙋', t('person_ready_check_title')||'Person Ready Check', 'openPersonReadyCheckPopup()')}
          ${toolBtn('✅', t('ready_check_title')||'Ready Check', 'openReadyCheckPopup()')}
          ${(role === 'admin' || role === 'developer') ? toolBtn('🔧', t('btn_bulk_actions')||'Bulk Event Actions', 'openBulkActionsModal()') : ''}
          ${toolBtn('📊', t('dashboard_title')||'Dashboard', 'openDashboard()')}
          ${toolBtn('📌', t('board_title')||'Boards', 'openBoardsModal()')}
          ${toolBtn('🏔️', t('kt_title')||'Key Terrain Board', 'openKeyTerrainBoard()')}
          ${toolBtn('⚖', t('decisions_title')||'Decisions', 'openDecisionLogModal()')}
          ${toolBtn('📔', t('diary_title')||'Diary', 'openDiaryModal()')}
          ${toolBtn('📋', t('checklists')||'Checklists', 'showChecklistsInSidebar()')}
          ${toolBtn('🗺', t('btn_map')||'Map', 'openDetachedMap()')}
          ${isTeamLead || isAdminOrOplead ? toolBtn('📖', t('tab_log_book')||'Log Book', 'openLogBookModal()') : ''}
          ${canReport ? toolBtn('📄', t('btn_report')||'Report', 'openReportModal()') : ''}
          ${canAutoReport ? toolBtn('⏰', t('btn_auto_report')||'Auto reports', 'openAutoReportModal()') : ''}
          ${toolBtn('📰', t('narrative_title')||'Narrative / Storyline', 'openNarrativeModal()')}
          ${(isTeamLead || isAdminOrOplead) ? toolBtn('📊', t('btn_pva')||'Plan vs Actual', 'openPVAModal()') : ''}
          ${(isTeamLead || isAdminOrOplead || userHasCapability('critical_line_analysis')) ? toolBtn('📈', t('btn_critical_line')||'Critical Line', 'openCriticalLineModal()') : ''}
          ${(isTeamLead || isAdminOrOplead || userHasCapability('analysis')) ? toolBtn('📈', t('analysis_title')||'Analysis', 'openAnalysisModal()') : ''}
          ${toolBtn('🖨', t('btn_print')||'Print', 'printTimeline()')}
          ${isAdminOrOplead ? toolBtn('📋', t('btn_templates')||'Templates', 'openTemplatesModal()') : ''}
          ${isAdminOrOplead ? toolBtn('⬇', t('btn_export')||'Export', 'openExportModal()') : ''}
          ${isAdminOrOplead ? toolBtn('⬆', t('btn_import')||'Import', 'openImportModal()') : ''}
          ${(role === 'admin' || role === 'developer') ? toolBtn('🐛', t('debug_title')||'Debug Console', 'openDebugConsole()') : ''}
          ${(role === 'admin' || role === 'developer') ? toolBtn('💾', t('btn_backup')||'Backup', 'openBackupModal()') : ''}
          ${(role === 'admin' || role === 'developer') ? toolBtn('🔄', t('btn_gradual_backup')||'Gradual Backup', 'openGradualBackupModal()') : ''}
        </div>
      </div>
    `;
  } else if (tab === 'checklists') {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>📋 ${t('checklists')||'Checklists'}</span>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px;opacity:.6" data-action="openDetachedChecklists" title="${t('btn_detach')||'Detach to window'}">⧉</button>
        </div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('checklists_desc')||'Create, manage, and track checklists for operational tasks.'}
        </p>
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" data-action="openChecklistStart" style="flex:1">▶ ${t('checklist_start')||'Start Checklist'}</button>
          ${hasRole2(state.user?.role||'','teamlead') ? `<button class="btn btn-sm btn-secondary" data-action="openChecklistEditor">✏ ${t('checklist_editor')||'Editor'}</button>` : ''}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">✅ ${t('checklist_active')||'Active Checklists'}</div>
        <div id="checklistActiveList" style="font-size:var(--fs-xs);color:var(--text-dim)">Loading...</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('checklist_completed')||'Completed'}</div>
        <div id="checklistCompletedList" style="font-size:var(--fs-xs);color:var(--text-dim)">Loading...</div>
      </div>
    `;
    _bindActions(el);
    _loadChecklistInstances();
  } else if (tab === 'security' && state.user && state.user.role === 'admin') {
    el.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🛡 ${t('tab_security')||'Security'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_overview_desc')||'Security configuration and status overview for Tidslinjal.'}
        </p>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 ${t('security_tls')||'TLS / HTTPS Configuration'}</div>
        <div id="secTlsCurrentStatus" style="margin-bottom:8px;padding:8px 10px;border-radius:var(--radius);background:var(--bg3);border:1px solid var(--border);font-size:var(--fs-xs)">
          ${t('checking')||'Checking TLS status…'}
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secTlsEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_tls_enabled')||'Enable TLS'}
        </label>
        <button class="btn btn-secondary btn-sm" id="secTlsToggleDetails" data-action="toggleSecTlsDetails" style="margin-bottom:8px">${t('security_tls_details')||'Show Details'}</button>
        <div id="secTlsDetails" style="display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
            ${t('security_tls_desc')||'Configure TLS certificate and key file paths for HTTPS.'}
          </p>
          <div class="form-group" style="margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_cert_file')||'Certificate File (cert.pem)'}</label>
            <input type="text" id="secTlsCertFile" placeholder="/etc/ssl/certs/tidslinjal.crt"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div class="form-group" style="margin-bottom:6px">
            <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_key_file')||'Private Key File (key.pem)'}</label>
            <input type="text" id="secTlsKeyFile" placeholder="/etc/ssl/private/tidslinjal.key"
              style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div style="padding:8px 10px;border-radius:var(--radius);background:rgba(255,165,0,.12);border:1px solid rgba(255,165,0,.4);font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
            ⚠️ ${t('security_tls_restart')||'Changes to TLS configuration require a server restart to take effect.'}
          </div>
          <button class="btn btn-secondary btn-sm" data-action="saveTLSConfig">${t('btn_save')||'Save'} TLS</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔐 ${t('security_oidc')||'Single Sign-On (OIDC)'}</div>
        <div id="secOidcStatus" style="padding:8px 10px;border-radius:var(--radius);background:var(--bg3);border:1px solid var(--border);font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('checking')||'Checking…'}
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secSsoEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_sso_enabled')||'Enable SSO'}
        </label>
        <button class="btn btn-secondary btn-sm" id="secOidcToggleDetails" data-action="toggleSecOidcDetails" style="margin-bottom:8px">${t('security_oidc_details')||'Show Details'}</button>
        <div id="secOidcDetails" style="display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
            ${t('security_oidc_desc')||'OIDC/SSO configuration. Full configuration is in the Integrations tab.'}
          </p>
          <div id="secOidcDetailContent" style="font-size:var(--fs-xs);padding:8px 10px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);color:var(--text-dim)">
            ${t('checking')||'Loading…'}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveSecSsoEnabled" style="margin-top:4px">${t('btn_save')||'Save'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🚦 ${t('security_rate_limiting')||'Rate Limiting'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_rate_limiting_desc')||'Built-in per-IP rate limiting protects authentication endpoints against brute-force attacks.'}
        </p>
        <div style="font-size:var(--fs-xs);display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-bottom:8px">
          <label style="font-weight:600">${t('security_login')||'Login'}:</label>
          <input type="number" id="secRateLogin" min="1" max="1000" value="10" style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <label style="font-weight:600">${t('security_registration')||'Registration'}:</label>
          <input type="number" id="secRateReg" min="1" max="1000" value="5" style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <label style="font-weight:600">${t('security_password_reset')||'Password Reset'}:</label>
          <input type="number" id="secRateReset" min="1" max="1000" value="5" style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
        </div>
        <span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_per_minute')||'requests / minute / IP'}</span>
        <button class="btn btn-secondary btn-sm" data-action="saveSecRateLimits" style="margin-top:6px">${t('security_rate_save')||'Save Rate Limits'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🌐 ${t('security_geoblocking')||'Geoblocking'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_geoblocking_desc')||'Restrict access by geographic location using IP-based geoblocking.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secGeoEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_geo_enabled')||'Enable geoblocking'}
        </label>
        <div style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_geo_mode')||'Mode'}</label>
          <select id="secGeoMode" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value="allowlist">${t('security_geo_allowlist')||'Allowlist (only these countries)'}</option>
            <option value="blocklist">${t('security_geo_blocklist')||'Blocklist (block these countries)'}</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_geo_countries')||'Country codes (ISO 3166-1, comma-separated, e.g. SE,NO,FI)'}</label>
          <input type="text" id="secGeoCountries" placeholder="SE,NO,FI,DK"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <div id="secGeoCountryNames" style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px"></div>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveSecGeoblock">${t('security_geo_save')||'Save Geoblocking'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🚫 ${t('security_ip_blacklist')||'IP Blacklist / Deny List'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_ip_blacklist_desc')||'Block specific IP addresses or CIDR ranges from connecting to this server. Blocked IPs receive a 403 Forbidden response.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secIpBlEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_ip_bl_enabled')||'Enable IP blacklist'}
        </label>
        <div style="margin-bottom:6px">
          <div style="display:flex;gap:6px;margin-bottom:6px">
            <input type="text" id="secIpBlNewIp" placeholder="${t('security_ip_bl_placeholder')||'IP address or CIDR (e.g. 192.168.1.1 or 10.0.0.0/8)'}"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-xs)">
            <select id="secIpBlNewReason"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-xs)">
              <option value="Attacking and scanning" selected>${t('security_ip_bl_reason_attacking')||'Attacking and scanning'}</option>
              <option value="Misbehaving">${t('security_ip_bl_reason_misbehaving')||'Misbehaving'}</option>
              <option value="Other">${t('security_ip_bl_reason_other')||'Other'}</option>
            </select>
            <button class="btn btn-sm" style="background:#E74C3C;color:#fff" data-action="addIpBlacklistEntry">+ ${t('btn_add')||'Add'}</button>
          </div>
          <div id="secIpBlEntries" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg)">
            <p style="font-size:var(--fs-xs);color:var(--text-dim);padding:8px;text-align:center">${t('loading')||'Loading...'}</p>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-secondary btn-sm" data-action="saveIpBlacklist">${t('security_ip_bl_save')||'Save'}</button>
          <button class="btn btn-secondary btn-sm" data-action="exportIpBlacklist">📥 ${t('security_ip_bl_export')||'Export JSON'}</button>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">
            📤 ${t('security_ip_bl_import')||'Import JSON'}
            <input type="file" id="secIpBlImportFile" accept=".json" style="display:none">
          </label>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔑 ${t('security_password_policy')||'Password Policy'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secPolicyEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enable Password Quality Policy
        </label>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('security_min_length')||'Minimum Length'}</label>
          <input type="number" id="secMinLength" placeholder="8" min="4" max="128" value="8"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqUpper" style="accent-color:var(--accent)"> ${t('security_require_uppercase')||'Require uppercase (A–Z)'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqLower" style="accent-color:var(--accent)"> ${t('security_require_lowercase')||'Require lowercase (a–z)'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqNumbers" style="accent-color:var(--accent)"> ${t('security_require_numbers')||'Require numbers (0–9)'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-xs)">
            <input type="checkbox" id="secReqSymbols" style="accent-color:var(--accent)"> ${t('security_require_symbols')||'Require symbols (!@#…)'}
          </label>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveSecuritySettings">${t('btn_save')||'Save'} Policy</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">⏱ Session Management</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="secSessionTimeEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enforce maximum session duration
        </label>
        <div class="form-group" style="margin-bottom:6px;display:flex;align-items:center;gap:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);white-space:nowrap">Max session (hours)</label>
          <input type="number" id="secSessionTimeHours" placeholder="100" min="1" max="8760" value="100"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="secIdleTimeoutEnabled" style="width:14px;height:14px;accent-color:var(--accent)">
          Enforce idle timeout
        </label>
        <div class="form-group" style="margin-bottom:6px;display:flex;align-items:center;gap:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);white-space:nowrap">Idle timeout (hours)</label>
          <input type="number" id="secIdleTimeoutHours" placeholder="100" min="1" max="8760" value="100"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="secLogoffOnPwChange" checked style="width:14px;height:14px;accent-color:var(--accent)">
          Auto-logoff other devices on password change
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secRotateOnRoleChange" checked style="width:14px;height:14px;accent-color:var(--accent)">
          Rotate session on role change
        </label>
        <button class="btn btn-secondary btn-sm" data-action="saveSecuritySettings">${t('btn_save')||'Save'} Session Settings</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 SSO-Only Login</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">When enabled, password login is disabled for all users except the built-in admin account. Requires SSO/OIDC to be configured.</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secDisablePasswordLogin" style="width:14px;height:14px;accent-color:var(--accent)">
          Disable password login (SSO only)
        </label>
        <button class="btn btn-secondary btn-sm" data-action="saveSecuritySettings">Save</button>
      </div>

      <div class="sidebar-section" id="enrollmentSettingsSection">
        <div class="sidebar-section-title">🚪 ${t('settings_enrollment')||'User Enrollment'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_enrollment_desc')||'Controls how new users can register for access.'}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap;gap:4px" id="enrollModeGroup">
          ${[['off','Off'],['open','Open'],['generic_invitation','Shared code'],['personal_invitation','Personal invite'],['vetted','Vetted'],['oidc_auto_enroll','SSO auto']].map(([v,l]) =>
            `<button class="toggle-btn" id="enrollBtn_${v}" data-action="setEnrollMode" data-arg="${v}">${l}</button>`
          ).join('')}
        </div>
        <div id="enrollCodeGroup" style="margin-top:8px;display:none">
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="enrollCodeInput" placeholder="Shared invite code"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
          </div>
        </div>
        <div id="enrollVettedInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">New users must be approved by an admin.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
        <div id="enrollPersonalInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Users must be invited individually with a unique code.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
        <div id="enrollOpenInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Anyone can create an account freely.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
        <div id="enrollOffInfo" style="margin-top:8px;display:none">
          <p style="font-size:var(--fs-xs);color:var(--text-dim)">Registration is disabled. Only admins can create accounts.</p>
          <button class="btn btn-secondary btn-sm" data-action="saveEnrollSettings">Save</button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🔒 ${t('security_encryption')||'Backup Encryption'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">
          ${t('security_encryption_desc')||'Backups are encrypted with AES-256-GCM using PBKDF2-SHA256 key derivation (100,000 iterations).'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="secEncryptionEnabled" checked style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('security_encryption_toggle')||'Enable backup encryption'}
        </label>
        <button class="btn btn-secondary btn-sm" data-action="saveSecEncryption">${t('btn_save')||'Save'}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">🛡 ${t('security_headers_title')||'Security Headers'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('security_headers_desc')||'The following security headers are automatically applied to all responses:'}
        </p>
        <div style="font-size:11px;padding:8px 10px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);line-height:1.8;font-family:monospace">
          <div>X-Frame-Options: <strong>DENY</strong></div>
          <div>X-Content-Type-Options: <strong>nosniff</strong></div>
          <div>Referrer-Policy: <strong>strict-origin-when-cross-origin</strong></div>
          <div>Content-Security-Policy: <strong>default-src 'self'; …</strong></div>
          <div>Permissions-Policy: <strong>camera=(), microphone=(), …</strong></div>
          <div style="color:var(--accent)">Strict-Transport-Security: <strong>max-age=63072000</strong> (HTTPS only)</div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-title">📋 ${t('security_sessions')||'Active Sessions'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('security_sessions_desc')||'Session cookies use HttpOnly, Secure (HTTPS), and SameSite=Lax attributes.'}
        </p>
        <div style="font-size:var(--fs-xs);padding:6px 8px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border);color:var(--text-dim)">
          ${t('security_session_info')||'Sessions expire after inactivity. Token-based authentication with cryptographically random IDs.'}
        </div>
      </div>
    `;
    // Load TLS status for security tab (optional endpoint, silence 404)
    _optionalApiGet('/api/tls/status').then(tls => {
      const el = document.getElementById('secTlsCurrentStatus');
      if (el) {
        const configured = tls && tls.configured;
        el.innerHTML = configured
          ? `<span style="color:#27AE60">✅ ${t('security_tls_active')||'TLS is active'}</span> — ${escHtml(tls.cert_file||'')}`
          : `<span style="color:var(--red,#E74C3C)">❌ ${t('security_tls_inactive')||'TLS not configured'}</span> — ${t('security_tls_inactive_desc')||'HTTPS is not enabled.'}`;
        const enableCb = document.getElementById('secTlsEnabled');
        if (enableCb) enableCb.checked = !!configured;
        if (tls) {
          const certInput = document.getElementById('secTlsCertFile');
          const keyInput = document.getElementById('secTlsKeyFile');
          if (certInput && tls.cert_file) certInput.value = tls.cert_file;
          if (keyInput && tls.key_file) keyInput.value = tls.key_file;
        }
      }
    }).catch(() => {});
    // Load OIDC status (optional endpoint, silence 404)
    _optionalApiGet('/api/oidc/config').then(oidc => {
      const statusEl = document.getElementById('secOidcStatus');
      const enableCb = document.getElementById('secSsoEnabled');
      const detailEl = document.getElementById('secOidcDetailContent');
      const configured = oidc && oidc.issuer;
      if (statusEl) {
        statusEl.innerHTML = configured
          ? `<span style="color:#27AE60">✅ ${t('security_oidc_active')||'OIDC configured'}</span> — ${escHtml(oidc.issuer)}${oidc.exclusive_mode ? ' <strong>(Exclusive)</strong>' : ''}`
          : `<span style="color:var(--text-dim)">— ${t('security_oidc_not_configured')||'OIDC not configured'}</span>`;
      }
      if (enableCb) enableCb.checked = !!configured && oidc.sso_enabled !== false;
      if (detailEl && configured) {
        detailEl.innerHTML = `
          <div>${t('security_oidc_issuer')||'Issuer'}: <strong>${escHtml(oidc.issuer)}</strong></div>
          <div>Client ID: <strong>${escHtml(oidc.client_id || '***')}</strong></div>
          <div>Redirect URL: <strong>${escHtml(oidc.redirect_url || '')}</strong></div>
          <div>Exclusive: <strong>${oidc.exclusive_mode ? 'Yes' : 'No'}</strong></div>
          <div>Default role: <strong>${escHtml(oidc.default_role || 'teammember')}</strong></div>`;
      } else if (detailEl) {
        detailEl.innerHTML = `<span style="color:var(--text-dim)">${t('security_oidc_not_configured')||'Not configured'}</span>`;
      }
    }).catch(() => {});
    // Load password policy (optional endpoint, silence 404)
    _optionalApiGet('/api/security/policy').then(policy => {
      const el = document.getElementById('secPasswordPolicy');
      if (el && policy) {
        // Already have form fields, just update them
      }
    }).catch(() => {});
    // Load rate limiting settings
    apiGet('/api/admin/rate-limits').then(rl => {
      if (!rl) return;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      setVal('secRateLogin', rl.login_limit || 10);
      setVal('secRateReg', rl.registration_limit || 5);
      setVal('secRateReset', rl.password_reset_limit || 5);
    }).catch(() => {});
    // Load geoblocking settings
    apiGet('/api/admin/geoblocking').then(geo => {
      if (!geo) return;
      const setCb = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      setCb('secGeoEnabled', geo.enabled);
      setVal('secGeoMode', geo.mode || 'allowlist');
      setVal('secGeoCountries', (geo.countries || []).join(','));
      _updateGeoCountryNames();
    }).catch(() => {});
    // Load backup encryption settings
    apiGet('/api/admin/encryption').then(enc => {
      if (!enc) return;
      const cb = document.getElementById('secEncryptionEnabled');
      if (cb) cb.checked = enc.enabled !== false;
    }).catch(() => {});
    // Load IP blacklist settings
    if (typeof loadIpBlacklist === 'function') loadIpBlacklist();
    if (typeof _setupIpBlImport === 'function') setTimeout(_setupIpBlImport, 100);
    // Init enrollment UI (moved from settings)
    setTimeout(_initEnrollmentUI, 0);
    setTimeout(_initSecuritySettingsUI, 0);
    _bindActions(el);
  } else if (tab === 'references') {
    _renderReferencesTab(el);

  } else if (tab === 'settings') {
    const p  = state.preferences;
    const ex = state.exercise || {};
    el.innerHTML = `
      <div style="padding:10px 12px;margin:0 0 12px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px">${t('settings_global_header')||'Global Settings'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${t('settings_global_desc')||'Shared with all users — changes here affect everyone'}</div>
      </div>
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_exercise')}</div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${getOperationNameLabel(ex)}</label>
          <input type="text" id="exLabel" value="${escHtml(ex.label||'')}" placeholder="${getOperationNameLabel(ex)}…"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">${getStartexLabel(ex)}</label>
          <input type="datetime-local" id="exEpoch" value="${ex.epoch ? fmtDateInput(new Date(ex.epoch)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:700">${getEndexLabel(ex)}</label>
          <input type="datetime-local" id="exEndex" value="${ex.endex ? fmtDateInput(new Date(ex.endex)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">
            ${getExIndexLabel(ex)}
            <span data-action="showExIndexInfo" style="cursor:pointer;margin-left:4px;opacity:.6" title="${t('exercise_index_info_tip')||'What is this?'}">ℹ️</span>
          </label>
          <input type="number" id="exIndex" value="${ex.ex_index||0}" min="0"
            style="width:80px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('artificial_time')||'Artificial time'}</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="exArtificialTimeEnabled" ${ex.artificial_time_enabled?'checked':''}
              data-action="setArtificialTime" data-event="change"
              style="width:14px;height:14px;accent-color:var(--accent)">
            <input type="datetime-local" id="exArtificialTime" value="${ex.artificial_time ? fmtDateInput(new Date(ex.artificial_time)) : ''}"
              style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          </div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${t('artificial_time_desc')||'Set a custom "current time" for exercise simulation'}</div>
        </div>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="exEnabled" ${ex.enabled?'checked':''}>
          <label for="exEnabled" style="font-size:var(--fs-sm)">${t('settings_exercise_enable')}</label>
          <span title="${t('settings_exercise_enable_info')||'Enable the synthetic time display, showing H+N elapsed time on the timeline.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent);margin-left:4px">ℹ️</span>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exDayHoursOnly" ${ex.day_hours_only?'checked':''}>
          <label for="exDayHoursOnly" style="font-size:var(--fs-sm)">${t('synth_day_hours_only')||'Day hours only'}</label>
          <span title="${t('settings_synth_day_only_info')||'Only count daytime hours in synthetic elapsed time. Night hours are skipped.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent);margin-left:4px">ℹ️</span>
        </div>
        <div class="form-check" style="margin-bottom:8px">
          <input type="checkbox" id="exIncludeWeekends" ${ex.include_weekends!==false?'checked':''}>
          <label for="exIncludeWeekends" style="font-size:var(--fs-sm)">${t('settings_include_weekends')||'Include weekends'}</label>
          <span title="${t('settings_include_weekends_info')||'Show weekends on the timeline and count them in synthetic time calculations.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent);margin-left:4px">ℹ️</span>
        </div>
        <button class="btn btn-primary btn-sm" data-action="saveExercise">${t('btn_save')}</button>
        ${state.user.role==='admin' ? `<a href="/admin-view" class="btn btn-secondary btn-sm" style="margin-left:4px">${t('admin_view')||'Admin View'}</a>` : ''}
      </div>` : ''}
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_urls')||'Links & URLs'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_urls_desc')||'URLs shown on the welcome screen and help buttons. Visible to all users.'}</p>
        <div class="sidebar-section-title" style="font-size:var(--fs-xs)">${t('settings_welcome_url')||'Welcome URL'}</div>
        <input type="url" value="${escHtml(ex.welcome_url||p.welcome_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="welcome_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
        <div class="sidebar-section-title" style="margin-top:6px;font-size:var(--fs-xs)">${t('settings_help_url')||'Help URL'}</div>
        <input type="url" value="${escHtml(ex.help_url||p.help_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="help_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
        <div class="sidebar-section-title" style="margin-top:6px;font-size:var(--fs-xs)">${t('settings_training_url')||'Training URL'}</div>
        <input type="url" value="${escHtml(ex.training_url||p.training_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="training_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
        <div class="sidebar-section-title" style="margin-top:6px;font-size:var(--fs-xs)">${t('settings_demo_url')||'Demo URL'}</div>
        <input type="url" value="${escHtml(ex.demo_url||p.demo_url||'')}" placeholder="https://..."
          data-action="setExerciseURL" data-event="change" data-url-key="demo_url"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        ${state.user && (state.user.role==='admin' || hasRole2(state.user.role, 'oplead')) ? `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          <div class="sidebar-section-title" style="font-size:var(--fs-xs)">📢 ${t('startup_text')||'Startup Message'}</div>
          <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('startup_text_desc')||'Text displayed to all users when they start the application'}</p>
          <textarea id="startupTextInput" rows="3" placeholder="${t('startup_text_placeholder')||'Enter a message to display on startup...'}"
            style="width:100%;padding:6px 8px;font-size:var(--fs-sm);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-primary btn-sm" data-action="saveStartupText">${t('startup_text_save')||'Save'}</button>
            <button class="btn btn-secondary btn-sm" data-action="clearStartupText">${t('startup_text_clear')||'Clear'}</button>
          </div>
        </div>` : ''}
      </div>
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🎨 ${t('settings_icon_set')||'Icon Set'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_icon_set_desc')||'Choose which icon set to use for symbols and icons across the application (maps, resources, user icons, etc.)'}</p>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(ex.icon_set||'emoji')==='emoji'?' active':''}" data-action="setIconSet" data-arg="emoji">😀 ${t('icon_set_emoji')||'Emoji'}</button>
          <button class="toggle-btn${ex.icon_set==='material'?' active':''}" data-action="setIconSet" data-arg="material"><span class="material-icons" style="font-size:16px;vertical-align:middle">star</span> ${t('icon_set_material')||'Material Icons'}</button>
        </div>
        ${ex.icon_set==='material' ? `
        <div style="margin-top:8px;padding:8px;background:var(--bg2);border-radius:var(--radius);border:1px solid var(--border)">
          <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('material_icons_preview')||'Preview — Google Material Icons'}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:24px">
            <span class="material-icons" title="Home">home</span>
            <span class="material-icons" title="Person">person</span>
            <span class="material-icons" title="Star">star</span>
            <span class="material-icons" title="Warning">warning</span>
            <span class="material-icons" title="Flag">flag</span>
            <span class="material-icons" title="Place">place</span>
            <span class="material-icons" title="Build">build</span>
            <span class="material-icons" title="Security">security</span>
            <span class="material-icons" title="Settings">settings</span>
            <span class="material-icons-outlined" title="Military Tech">military_tech</span>
            <span class="material-icons" title="Groups">groups</span>
            <span class="material-icons" title="Assignment">assignment</span>
          </div>
          <p style="font-size:10px;color:var(--text-dim);margin-top:6px"><a href="https://fonts.google.com/icons" target="_blank" rel="noopener" style="color:var(--accent)">${t('browse_material_icons')||'Browse all Material Icons'}</a></p>
        </div>` : ''}
      </div>` : ''}
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">🎖 ${t('settings_tactical_font')||'Tactical Task Graphics Font'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_tactical_font_desc')||'Use the NDU Tactical Task Graphics font for military symbols and icons. The font is not distributed with Tidslinjal due to licensing — download it from the official source, then install it locally.'}</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <a href="http://ndupress.ndu.edu/Portals/68/Images/jfq/jfq-85/cyberspace-graphics/Tactical-Task-Graphics-to-Cyber.zip" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="text-align:center;text-decoration:none">⬇ ${t('settings_tactical_font_download')||'Download Font (NDU Press)'}</a>
          <p style="font-size:10px;color:var(--text-dim);line-height:1.5">${t('settings_tactical_font_install')||'After downloading, extract the ZIP and install the .ttf/.otf font files on your operating system. Then enable the font below.'}</p>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
            <input type="checkbox" id="prefTacticalFont" ${p.tactical_font_enabled?'checked':''} data-action="setTacticalFontPref" data-event="change" data-arg-checked
              style="width:14px;height:14px;accent-color:var(--accent)">
            ${t('settings_tactical_font_enable')||'Enable Tactical Task Graphics font'}
          </label>
          <input type="text" id="prefTacticalFontFamily" value="${escHtml(p.tactical_font_family || 'Tactical Task Graphics to Cyber')}" data-action="setTacticalFontFamily" data-event="change" data-arg-value
            style="font-size:var(--fs-xs);padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)" placeholder="Font family name">
          <p style="font-size:10px;color:var(--text-dim)">${t('settings_tactical_font_family_desc')||'CSS font-family name (must match the installed font name).'}</p>
        </div>
      </div>` : ''}
      <div style="padding:10px 12px;margin:16px 0 12px;background:var(--bg3);border-left:3px solid var(--text-dim);border-radius:0 var(--radius) var(--radius) 0">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.5px">${t('settings_personal_header')||'Personal Preferences'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${t('settings_personal_desc')||'Only affects your view — other users have their own settings'}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_theme')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.theme==='light'?' active':''}" data-action="setPref" data-args='["theme","light"]' >${t('theme_light')||'Light'}</button>
          <button class="toggle-btn${p.theme==='dark'?' active':''}" data-action="setPref" data-args='["theme","dark"]' >${t('theme_dark')||'Dark'}</button>
          <button class="toggle-btn${p.theme==='city-camo'?' active':''}" data-action="setPref" data-args='["theme","city-camo"]'  title="Camouflage (greens/grays)">🏕 Camo</button>
          <button class="toggle-btn${p.theme==='urban-camo'?' active':''}" data-action="setPref" data-args='["theme","urban-camo"]'  title="Urban warfare (blues)">🌆 Urban Camo</button>
          <button class="toggle-btn${p.theme==='sand'?' active':''}" data-action="setPref" data-args='["theme","sand"]' title="Warm desert tones">🏜 Sand</button>
          <button class="toggle-btn${p.theme==='matrix'?' active':''}" data-action="setPref" data-args='["theme","matrix"]' title="Green-on-black terminal">💻 Matrix</button>
          <button class="toggle-btn${p.theme==='sunset'?' active':''}" data-action="setPref" data-args='["theme","sunset"]' title="Warm orange and amber">🌅 Sunset</button>
          <button class="toggle-btn${p.theme==='light-blue-sky'?' active':''}" data-action="setPref" data-args='["theme","light-blue-sky"]' title="Bright sky-blue light theme">🌤 Light Blue Sky</button>
          <button class="toggle-btn${p.theme==='ocean'?' active':''}" data-action="setPref" data-args='["theme","ocean"]' title="Deep ocean blues and teals">🌊 Ocean</button>
          <button class="toggle-btn${p.theme==='forest'?' active':''}" data-action="setPref" data-args='["theme","forest"]' title="Deep greens and earthy tones">🌲 Forest</button>
          <button class="toggle-btn${p.theme==='accessible'?' active':''}" data-action="setPref" data-args='["theme","accessible"]' title="High-contrast accessible theme">♿ Accessible</button>
          <button class="toggle-btn${p.theme==='crimson'?' active':''}" data-action="setPref" data-args='["theme","crimson"]' title="Dark theme with crimson accents">🔴 Crimson</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_size')}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${p.size==='small'?' active':''}" data-action="setPref" data-args='["size","small"]' >${t('size_small')}</button>
          <button class="toggle-btn${p.size==='normal'?' active':''}" data-action="setPref" data-args='["size","normal"]' >${t('size_normal')}</button>
          <button class="toggle-btn${p.size==='large'?' active':''}" data-action="setPref" data-args='["size","large"]' >${t('size_large')}</button>
          <button class="toggle-btn${p.size==='huge'?' active':''}" data-action="setPref" data-args='["size","huge"]' >${t('size_huge')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_language')}</div>
        <div class="toggle-btn-group">
          ${[
            {code:'en',name:'English'},{code:'sv',name:'Svenska'},{code:'fr',name:'Français'},
            {code:'de',name:'Deutsch'},{code:'nl',name:'Nederlands'},
            {code:'fi',name:'Suomi'},{code:'is',name:'Íslenska'},{code:'da',name:'Dansk'},{code:'nb',name:'Norsk (Bokmål)'},
            {code:'et',name:'Eesti'},{code:'lv',name:'Latviešu'},{code:'lt',name:'Lietuvių'},
            {code:'it',name:'Italiano'},{code:'es',name:'Español'},{code:'pt',name:'Português'},
            {code:'pl',name:'Polski'},{code:'uk',name:'Українська'},
            {code:'ja',name:'日本語'},{code:'ko',name:'한국어'}
          ].filter(l => isLangEnabled(l.code)).map(l =>
            `<button class="toggle-btn${p.language===l.code?' active':''}" data-action="setPref" data-args='["language","${l.code}"]' title="${l.name}">${langAbbr(l.code)}</button>`
          ).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:var(--fs-sm);cursor:pointer">
          <input type="checkbox" ${p.show_lang_flags!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_lang_flags"
            style="accent-color:var(--accent)">
          ${t('settings_show_lang_flags')||'Show language flags in toolbar'}
        </label>
        <div style="margin-top:8px">
          <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_country_code_format')||'Country code format (ISO 3166-1)'}</div>
          <div class="toggle-btn-group">
            <button class="toggle-btn${(p.country_code_format||'alpha2')==='alpha2'?' active':''}" data-action="setPref" data-args='["country_code_format","alpha2"]' title="ISO 3166-1 alpha-2 (e.g. SE, GB, FR)">${t('settings_alpha2')||'2-letter'}</button>
            <button class="toggle-btn${p.country_code_format==='alpha3'?' active':''}" data-action="setPref" data-args='["country_code_format","alpha3"]' title="ISO 3166-1 alpha-3 (e.g. SWE, GBR, FRA)">${t('settings_alpha3')||'3-letter'}</button>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_date_format')||'Date / Time Format'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${[['iso','ISO 8601'],['uk','UK'],['fr','FR'],['sv','SV'],['dtg','DTG']].map(([v,l]) =>
            `<button class="toggle-btn${(p.date_format||'iso')===v?' active':''}" data-action="setPref" data-args='["date_format","${v}"]' title="${v==='dtg'?'Date-Time Group (DDHHMMZmmmYY)':''}">${l}</button>`
          ).join('')}
        </div>
        <div class="hour-range" style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_day_hours')}:</span>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH" style="width:52px" data-action="setHourPref" data-event="change">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH" style="width:52px" data-action="setHourPref" data-event="change">
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_timezone')||'Timezone'}:</span>
          <select id="prefTimezone" data-action="setTimezonePref" data-event="change" data-arg-value
            style="margin-top:4px;width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
            <option value=""${!state.timezone?' selected':''}>Browser Default</option>
            ${['UTC','Europe/London','Europe/Paris','Europe/Stockholm','Europe/Berlin','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Tokyo','Asia/Shanghai','Australia/Sydney'].map(tz =>
              `<option value="${tz}"${state.timezone===tz?' selected':''}>${tz}</option>`
            ).join('')}
          </select>
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">Real time clock time format:</span>
          <div class="toggle-btn-group" style="margin-top:4px">
            <button class="toggle-btn${!_clockUTC?' active':''}" id="clockFmtLocal" data-action="setClockFormat" data-arg="local">Local time</button>
            <button class="toggle-btn${_clockUTC?' active':''}"  id="clockFmtZulu"  data-action="setClockFormat" data-arg="zulu">ZULU / UTC</button>
          </div>
        </div>
        <div style="margin-top:10px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">Additional timezone clocks:</span>
          <div style="margin-top:4px">
            ${(p.extra_clocks||[]).length === 0
              ? `<div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">No extra clocks. Use the + button next to the clock to add one.</div>`
              : (p.extra_clocks||[]).map(ec => `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:var(--fs-xs)">
                  <span style="flex:1;color:var(--text)">${escHtml(ec.label)} <span style="color:var(--text-dim)">(${escHtml(ec.timezone)})</span></span>
                  <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" data-action="removeExtraClock" data-arg="${ec.id}">× Remove</button>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_time_format')||'Time Format'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.time_format||'24h')==='24h'?' active':''}" data-action="setPref" data-args='["time_format","24h"]'>${t('time_format_24h')}</button>
          <button class="toggle-btn${p.time_format==='12h'?' active':''}" data-action="setPref" data-args='["time_format","12h"]'>${t('time_format_12h')}</button>
        </div>
        <div style="margin-top:8px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_time_separator')||'Time Separator'}</span>
          <div class="toggle-btn-group" style="margin-top:4px">
            <button class="toggle-btn${(p.time_separator||'colon')==='colon'?' active':''}" data-action="setPref" data-args='["time_separator","colon"]'>${t('time_sep_colon')||': separation'}</button>
            <button class="toggle-btn${p.time_separator==='dot'?' active':''}" data-action="setPref" data-args='["time_separator","dot"]'>${t('time_sep_dot')||'. separation'}</button>
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_week_start')||'Week Starts On'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.week_start_day||'monday')==='monday'?' active':''}" data-action="setPref" data-args='["week_start_day","monday"]'>${t('week_start_monday')}</button>
          <button class="toggle-btn${p.week_start_day==='sunday'?' active':''}" data-action="setPref" data-args='["week_start_day","sunday"]'>${t('week_start_sunday')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_range')||'Default Timeline Range'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','3days','week','2weeks','month'].map(v =>
            `<button class="toggle-btn${(p.default_range||'week')===v?' active':''}" data-action="setPref" data-args='["default_range","${v}"]'>${t('range_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_resolution')||'Default Time-slot Resolution'}</div>
        <div class="toggle-btn-group">
          ${[['ten','10 min'],['quarter','15 min'],['hour',t('res_hour')],['day',t('res_day')]].map(([v,l]) =>
            `<button class="toggle-btn${(p.default_resolution||'hour')===v?' active':''}" data-action="setPref" data-args='["default_resolution","${v}"]'>${l}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">♿ ${t('settings_accessibility')||'Accessibility'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_a11y_desc')||'Configure accessibility features for keyboard navigation, screen readers, and visual preferences.'}</p>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" ${p.a11y_focus_indicators?'checked':''} data-action="setPref" data-event="change" data-pref-checked="a11y_focus_indicators"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('a11y_focus_indicators')||'Enhanced keyboard focus indicators'}
        </label>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" ${p.a11y_reduced_motion?'checked':''} data-action="setPref" data-event="change" data-pref-checked="a11y_reduced_motion"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('a11y_reduced_motion')||'Reduce animations and motion'}
        </label>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" ${p.a11y_screen_reader?'checked':''} data-action="setPref" data-event="change" data-pref-checked="a11y_screen_reader"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('a11y_screen_reader')||'Screen reader announcements'}
          <span title="${t('a11y_screen_reader_info')||'Enables ARIA live region announcements for navigation, modal changes, and status updates.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" ${p.a11y_skip_links?'checked':''} data-action="setPref" data-event="change" data-pref-checked="a11y_skip_links"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('a11y_skip_links')||'Show skip navigation links'}
        </label>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" ${p.a11y_large_click_targets?'checked':''} data-action="setPref" data-event="change" data-pref-checked="a11y_large_click_targets"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('a11y_large_targets')||'Large click/touch targets (44px)'}
        </label>

        <div style="margin-bottom:4px;font-size:var(--fs-sm);color:var(--text-dim)">${t('a11y_font_scaling')||'Text scaling'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(p.a11y_font_scaling||'100')==='100'?' active':''}" data-action="setPref" data-args='["a11y_font_scaling","100"]'>100%</button>
          <button class="toggle-btn${p.a11y_font_scaling==='125'?' active':''}" data-action="setPref" data-args='["a11y_font_scaling","125"]'>125%</button>
          <button class="toggle-btn${p.a11y_font_scaling==='150'?' active':''}" data-action="setPref" data-args='["a11y_font_scaling","150"]'>150%</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_high_contrast')||'High Contrast'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_high_contrast_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.high_contrast?'checked':''} data-action="setPref" data-event="change" data-pref-checked="high_contrast"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_high_contrast')||'High Contrast'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_color_blind')||'Color-blind Safe Palette'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_color_blind_desc')}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          <button class="toggle-btn${(p.color_blind_mode||'off')==='off'?' active':''}" data-action="setPref" data-args='["color_blind_mode","off"]'>${t('cb_off')}</button>
          <button class="toggle-btn${p.color_blind_mode==='protanopia'?' active':''}" data-action="setPref" data-args='["color_blind_mode","protanopia"]'>${t('cb_protanopia')}</button>
          <button class="toggle-btn${p.color_blind_mode==='deuteranopia'?' active':''}" data-action="setPref" data-args='["color_blind_mode","deuteranopia"]'>${t('cb_deuteranopia')}</button>
          <button class="toggle-btn${p.color_blind_mode==='tritanopia'?' active':''}" data-action="setPref" data-args='["color_blind_mode","tritanopia"]'>${t('cb_tritanopia')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_landing_view')||'Default Landing View'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_landing_view_desc')}</p>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['grid','list','log_book','decisions','map','reports'].map(v =>
            `<button class="toggle-btn${(p.default_landing_view||'grid')===v?' active':''}" data-action="setPref" data-args='["default_landing_view","${v}"]'>${t('landing_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_auto_follow')||'Auto-follow "Now"'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_auto_follow_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.auto_follow_now?'checked':''} data-action="setPref" data-event="change" data-pref-checked="auto_follow_now"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_auto_follow')||'Auto-follow "Now"'}
          <span title="${t('settings_auto_follow_info')||'When enabled, the timeline automatically scrolls to keep the current time visible as time progresses.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_tooltip_delay')||'Tooltip Hover Delay'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.tooltip_delay||0)===0?' active':''}" data-action="setTooltipDelay" data-arg="0">${t('tooltip_instant')}</button>
          <button class="toggle-btn${p.tooltip_delay===200?' active':''}" data-action="setTooltipDelay" data-arg="200">${t('tooltip_200ms')}</button>
          <button class="toggle-btn${p.tooltip_delay===500?' active':''}" data-action="setTooltipDelay" data-arg="500">${t('tooltip_500ms')}</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_confirm_drag')||'Confirm Before Drag-Move'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_confirm_drag_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.confirm_drag_move?'checked':''} data-action="setPref" data-event="change" data-pref-checked="confirm_drag_move"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_confirm_drag')||'Confirm Before Drag-Move'}
          <span title="${t('settings_confirm_drag_info')||'Shows a confirmation dialog before moving an event via drag-and-drop, preventing accidental reschedules.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_event_type')||'Default Event Type'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_default_event_type_desc')}</p>
        <select data-action="setPrefSelect" data-event="change" data-pref-key="default_event_type"
          style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <option value=""${!p.default_event_type?' selected':''}>—</option>
          ${(state.eventTypes||[]).map(et =>
            `<option value="${et.key}"${p.default_event_type===et.key?' selected':''}>${escHtml(et.label||et.key)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_workspace_presets')||'Workspace Presets'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_workspace_presets_desc')}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" ${p.workspace_presets_enabled?'checked':''} data-action="setPref" data-event="change" data-pref-checked="workspace_presets_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_workspace_presets')||'Enable Workspace Presets'}
        </label>
        ${p.workspace_presets_enabled ? `
        <div style="margin-bottom:6px">
          ${(p.workspace_presets||[]).map((ws, i) => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:var(--fs-xs)">
              <span style="flex:1;color:var(--text)">${escHtml(ws.name)}</span>
              <button class="btn btn-secondary btn-sm" style="padding:1px 6px;font-size:10px" data-action="loadWorkspacePreset" data-arg="${i}">${t('preset_load')}</button>
              <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" data-action="deleteWorkspacePreset" data-arg="${i}">${t('preset_delete')}</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveWorkspacePreset">${t('preset_save')||'Save Current'}</button>
        ` : ''}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_logbook_decisions')||'Log Book — Decisions'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_logbook_decisions_desc')||'When enabled, the "Decision" category is hidden from Log Book. Decisions will only appear in the dedicated Decisions Log.'}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.logbook_hide_decisions?'checked':''} data-action="setPref" data-event="change" data-pref-checked="logbook_hide_decisions"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_logbook_hide_decisions')||'Hide decisions from Log Book'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_clock_flags')||'Clock Flags'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_clock_flags_desc')||'Show national flags on timezone clocks based on the city of each timezone.'}</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.show_clock_flags?'checked':''} data-action="setPref" data-event="change" data-pref-checked="show_clock_flags"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_clock_flags')||'Add flags on clocks'}
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_default_view')||'Default View'}</div>
        <div class="toggle-btn-group" style="flex-wrap:wrap">
          ${['day','2days','3days','4days','5days','week','2weeks','3weeks'].map(v =>
            `<button class="toggle-btn${(p.default_view||'week')===v?' active':''}" data-action="setDefaultView" data-arg="${v}">${t('range_'+v)||v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_day_visualisation')||'Day Visualisation'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefShowOOH" ${p.show_out_of_hours!==false?'checked':''} data-action="setOOHPref" data-event="change" data-arg-checked
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_out_of_hours')||'Show time outside day hours'}
        </label>
        <div class="hour-range" style="margin-bottom:6px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);font-weight:600">${t('settings_day_hours')}:</span>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_start')}</label>
          <input type="number" min="0" max="23" value="${p.day_start_hour||0}" id="prefStartH2" style="width:52px" data-action="setHourPref" data-event="change">
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">–</label>
          <label style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_end')}</label>
          <input type="number" min="1" max="24" value="${p.day_end_hour||24}" id="prefEndH2" style="width:52px" data-action="setHourPref" data-event="change">
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefIncludeWeekends2" ${(ex.include_weekends!==false)?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="include_weekends"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_include_weekends')||'Include weekends'}
          <span style="font-size:9px;padding:1px 5px;background:var(--accent);color:white;border-radius:8px;margin-left:2px;vertical-align:middle;font-weight:600">${t('settings_tag_global')||'GLOBAL'}</span>
          <span title="${t('settings_include_weekends_info')||'Show weekends on the timeline and count them in synthetic time calculations.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        ${synthActive() ? `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefSynthLabel2" ${p.synth_label?'checked':''} data-action="setSynthLabelPref" data-event="change" data-arg-checked
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
          <span title="${t('settings_synth_label_info')||'Shows elapsed time (H+N) label next to the current-time line.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefSynthDayOnly2" ${ex.day_hours_only?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="synth_day_hours_only"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('synth_day_hours_only')||'Synthetic time: day hours only'}
          <span style="font-size:9px;padding:1px 5px;background:var(--accent);color:white;border-radius:8px;margin-left:2px;vertical-align:middle;font-weight:600">${t('settings_tag_global')||'GLOBAL'}</span>
          <span title="${t('settings_synth_day_only_info')||'Only count daytime hours in synthetic elapsed time. Night hours are skipped.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>` : ''}
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowDayOfYear" ${p.show_day_of_year?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_day_of_year"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_day_of_year')||'Show day-of-year number (1–365)'}
          <span title="${t('settings_show_day_of_year_info')||'Display the ordinal day number (1–365) in the timeline header.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowDayName" ${p.show_day_name!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_day_name"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_day_name')||'Show name of day'}
          <span title="${t('settings_show_day_name_info')||'Display the weekday name (e.g. Monday, Tuesday) in timeline column headers.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowDaysToEpoch" ${p.show_days_to_epoch!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_days_to_epoch"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_days_to_epoch')||'Days to epoch (Day N)'}
          <span title="${t('settings_show_days_to_epoch_info')||'Show the day count relative to exercise epoch (Day -2, Day 0, Day 1, etc.) in the timeline header when synthetic time is active.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowWelcomeMessage" ${p.show_welcome_message!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_welcome_message"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_welcome_message')||'Show welcome message'}
          <span title="${t('settings_show_welcome_message_info')||'Display the welcome window when logging in.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-top:6px">
          <input type="checkbox" id="prefShowWeekNumbers" ${p.show_week_numbers?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_week_numbers"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_week_numbers')||'Show week numbers'}
          <span title="${t('settings_show_week_numbers_info')||'Display ISO week numbers (W1–W52) in the timeline header.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        ${p.show_week_numbers ? `
        <div style="margin-top:4px;margin-left:22px">
          <span style="font-size:var(--fs-xs);color:var(--text-dim)">${t('settings_week_style')||'Week number style'}:</span>
          <select id="prefWeekStyle" data-action="setPrefSelect" data-event="change" data-pref-key="week_number_style"
            style="margin-left:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            <option value="iso"${(p.week_number_style||'iso')==='iso'?' selected':''}>ISO (W1–W52)</option>
            <option value="year_week"${p.week_number_style==='year_week'?' selected':''}>Year+Week (6-W01)</option>
          </select>
        </div>` : ''}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_ticker')||'Narrative Ticker'} <span title="${t('settings_ticker_info')||'Show a scrolling ticker bar at the bottom of the screen with the latest narrative entries (events, decisions, audit).'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefTickerEnabled" ${p.ticker_enabled?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="ticker_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_ticker_enable')||'Show narrative ticker'}
        </label>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:var(--fs-sm)">
          <label style="color:var(--text-dim)">${t('settings_ticker_count')||'Number of entries'}:</label>
          <input type="number" id="prefTickerCount" min="3" max="50" value="${p.ticker_count||10}"
            style="width:60px;padding:3px 6px;font-size:var(--fs-xs);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"
            data-action="setTickerCount" data-event="change" data-arg-value>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">🚨 ${t('settings_quick_response_receiver')||'Quick Response Receiver'} <span title="${t('settings_quick_response_receiver_info')||'Configure who receives quick response and decision-needed alerts from the TeamLead Toolbox.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('settings_quick_response_receiver_desc')||'Choose which roles and groups should receive flash alerts when a quick response or escalation is sent.'}</p>
        <div style="margin-bottom:6px">
          <label style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim)">${t('settings_qr_roles')||'Roles'}:</label>
          <div id="prefQRRoles" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
            ${(() => {
              const currentRoles = (p.quick_response_roles || []);
              const builtinRoles = [
                {key:'observer', label:'Observer'}, {key:'read', label:'Read'},
                {key:'reporter', label:'Reporter'}, {key:'teammember', label:'Team Member'},
                {key:'teamlead', label:'Team Lead'}, {key:'deputy_teamlead', label:'Deputy Team Lead'},
                {key:'oplead', label:'Operations Lead'}, {key:'deputy_oplead', label:'Deputy Operations Lead'},
                {key:'staffofficer', label:'Staff Officer Assistant'}, {key:'staff_assistant', label:'Staff Assistant'},
                {key:'staffofficer_full', label:'Staff Officer'}, {key:'admin', label:'Admin'},
              ];
              const allRoles = [...builtinRoles];
              (state.roleConfigs || []).forEach(rc => {
                if (!allRoles.find(r => r.key === rc.key)) allRoles.push({key: rc.key, label: rc.display_name || rc.key});
              });
              return allRoles.map(r => {
                const active = currentRoles.includes(r.key);
                return '<label style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer;font-size:var(--fs-xs);white-space:nowrap;' + (active ? 'background:var(--accent-muted,rgba(0,120,255,.12));border-color:var(--accent)' : '') + '">' +
                  '<input type="checkbox" class="prefQRRole" value="' + escHtml(r.key) + '" ' + (active ? 'checked' : '') + ' data-action="_saveQRRoles" data-event="change" style="accent-color:var(--accent);width:12px;height:12px">' +
                  (getRoleDisplayName(r.key) || r.label) + '</label>';
              }).join('');
            })()}
          </div>
        </div>
        <div>
          <label style="font-size:var(--fs-xs);font-weight:600;color:var(--text-dim)">${t('settings_qr_groups')||'Groups'}:</label>
          <div id="prefQRGroups" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
            ${(state.groups||[]).map(g => {
              const active = (p.quick_response_groups || []).includes(g.id);
              return '<label style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer;font-size:var(--fs-xs);white-space:nowrap;' + (active ? 'background:var(--accent-muted,rgba(0,120,255,.12));border-color:var(--accent)' : '') + '">' +
                '<input type="checkbox" class="prefQRGroup" value="' + g.id + '" ' + (active ? 'checked' : '') + ' data-action="_saveQRGroups" data-event="change" style="accent-color:var(--accent);width:12px;height:12px">' +
                escHtml(g.name) + '</label>';
            }).join('') || '<span style="font-size:var(--fs-xs);color:var(--text-dim)">No groups</span>'}
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_view_spacing')||'Vertical Spacing'} <span title="${t('settings_view_spacing_info')||'Adjust the vertical spacing between rows on the timeline.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">${t('settings_view_spacing_desc')||'Vertical spacing multiplier for timeline rows.'}</p>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(p.view_spacing||1)===1?' active':''}" data-action="setViewSpacing" data-arg="1">1×</button>
          <button class="toggle-btn${p.view_spacing===1.5?' active':''}" data-action="setViewSpacing" data-arg="1.5">1.5×</button>
          <button class="toggle-btn${p.view_spacing===2?' active':''}" data-action="setViewSpacing" data-arg="2">2×</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_event_icons')||'Event Icons'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefShowEventIcons" ${p.show_event_icons!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="show_event_icons"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_show_event_icons')||'Show icons on events (type, attachments, etc.)'}
          <span title="${t('settings_show_event_icons_info')||'Display small icons on timeline events indicating their type, attachments, and other attributes.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_hover_zoom')||'Hover Zoom'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefHoverZoom" ${p.hover_zoom_enabled!==false?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="hover_zoom_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_hover_zoom_desc')||'Enlarge calendar events on hover'}
          <span title="${t('settings_hover_zoom_info')||'When enabled, hovering over a timeline event will enlarge it for easier reading.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_red_line')||'Current-time Line'}</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefRedLine" ${p.red_line_enabled!==false?'checked':''} data-action="setRedLinePref" data-event="change"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_red_line_enabled')||'Show current-time line'}
          <span title="${t('settings_red_line_enabled_info')||'Displays a vertical line on the timeline at the current time position.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:8px">
          <input type="checkbox" id="prefSynthLabel" ${p.synth_label?'checked':''} data-action="setSynthLabelPref" data-event="change" data-arg-checked
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_synth_label')||'Show H+N label on red line'}
          <span title="${t('settings_synth_label_info')||'Shows elapsed time (H+N) label next to the current-time line.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;font-size:var(--fs-xs);color:var(--text-dim)">
          <span>${t('settings_red_line_color_label')||'Color'}: <span title="${t('settings_red_line_color_label')||'Color of the current-time line.'}" style="cursor:help;color:var(--accent)">ℹ️</span></span>
          <input type="color" id="prefLineColor" value="${p.red_line_color||'#E74C3C'}" data-action="setRedLinePref" data-event="change"
            style="width:32px;height:22px;padding:0;border:none;background:transparent;cursor:pointer">
          <span>${t('settings_red_line_width_label')||'Width (px)'}: <span title="${t('settings_red_line_width_label')||'Width of the current-time line in pixels.'}" style="cursor:help;color:var(--accent)">ℹ️</span></span>
          <input type="number" id="prefLineWidth" min="1" max="8" value="${p.red_line_width||5}" data-action="setRedLinePref" data-event="change"
            style="width:52px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
          <span>${t('settings_red_line_style_label')||'Line style'}: <span title="${t('settings_red_line_style_label')||'Style of the current-time line.'}" style="cursor:help;color:var(--accent)">ℹ️</span></span>
          <select id="prefLineStyle" data-action="setRedLinePref" data-event="change"
            style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:3px 6px;font-size:var(--fs-xs)">
            <option value="solid" ${(p.red_line_style||'dashed')==='solid'?'selected':''}>${t('settings_red_line_style_solid')||'Solid'}</option>
            <option value="dashed" ${(p.red_line_style||'dashed')==='dashed'?'selected':''}>${t('settings_red_line_style_dashed')||'Dashed'}</option>
            <option value="dotted" ${(p.red_line_style||'dashed')==='dotted'?'selected':''}>${t('settings_red_line_style_dotted')||'Dotted'}</option>
          </select>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">🔔 ${t('settings_push_notifications')||'Browser Notifications'}</div>
        <div id="pushNotifStatus" style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${Notification.permission === 'granted' ? '✅ ' + (t('settings_push_enabled')||'Notifications are enabled') : Notification.permission === 'denied' ? '🚫 ' + (t('settings_push_blocked')||'Blocked — allow in browser settings') : '⚠️ ' + (t('settings_push_not_granted')||'Permission not granted yet')}
        </div>
        ${Notification.permission === 'denied' ? `
        <details style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px;cursor:pointer">
          <summary style="font-weight:600">${t('settings_push_howto')||'How to enable in your browser'}</summary>
          <div style="margin-top:6px;line-height:1.6">
            <p><strong>Chrome:</strong> ${t('push_chrome')||'Click the lock/tune icon in the address bar → Site settings → Notifications → Allow'}</p>
            <p><strong>Edge:</strong> ${t('push_edge')||'Click the lock icon → Permissions for this site → Notifications → Allow'}</p>
            <p><strong>Firefox:</strong> ${t('push_firefox')||'Click the lock icon → Connection secure → More Information → Permissions → Notifications → Allow'}</p>
            <p><strong>Safari:</strong> ${t('push_safari')||'Safari menu → Settings → Websites → Notifications → find this site → Allow'}</p>
          </div>
        </details>` : ''}
        ${Notification.permission !== 'denied' ? `<button class="btn btn-secondary btn-sm" style="margin-bottom:8px" data-action="requestPushPermission">${Notification.permission === 'granted' ? '✓ Granted' : 'Enable Notifications'}</button>` : ''}
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:4px">
          <input type="checkbox" ${p.push_alarms!==false?'checked':''} data-action="setPref" data-event="change" data-pref-checked="push_alarms"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_push_alarms')||'Alarm notifications'}
          <span title="${t('settings_push_alarms_info')||'Receive browser notifications when alarms trigger.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" ${p.push_event_changes!==false?'checked':''} data-action="setPref" data-event="change" data-pref-checked="push_event_changes"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_push_event_changes')||'Event changes by other users'}
          <span title="${t('settings_push_event_info')||'Receive browser notifications when other users modify events.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">📅 ${t('settings_auto_busy')||'Auto-busy on activities'} <span title="${t('settings_auto_busy_info')||'When enabled, your status changes to busy during scheduled activities and returns to your previous status afterward.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('settings_auto_busy_desc')||'Automatically set your availability to "busy" while a scheduled activity you are invited to is ongoing.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
          <input type="checkbox" id="prefAutoBusy" ${p.auto_busy_enabled?'checked':''}
            data-action="setPref" data-event="change" data-pref-checked="auto_busy_enabled"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_auto_busy')||'Auto-busy on activities'}
          <span title="${t('settings_auto_busy_info')||'When enabled, your status changes to busy during scheduled activities and returns afterward.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">📡 ${t('settings_offline_mode')||'Offline Mode'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:6px">
          ${t('settings_offline_desc')||'When enabled or when network is unavailable, the tool works with locally cached data. Integrations and advanced features are disabled.'}
        </p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm);margin-bottom:6px">
          <input type="checkbox" id="prefOfflineMode" ${window._offlineModeForced?'checked':''}
            data-action="toggleOfflineMode" data-event="change"
            style="width:14px;height:14px;accent-color:var(--accent)">
          ${t('settings_force_offline')||'Force offline mode'}
          <span title="${t('settings_force_offline_info')||'Force the application into offline mode, using locally cached data only.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span>
        </label>
        <div id="offlineStatus" style="font-size:var(--fs-xs);padding:4px 8px;background:var(--bg3);border-radius:var(--radius)">
          ${window._offlineMode ? '<span style="color:#e05252">● Offline</span>' : '<span style="color:#27ae60">● Online</span>'}
        </div>
      </div>
      <div style="padding:10px 12px;margin:16px 0 12px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px">${t('settings_global_header')||'Global Settings'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:2px">${t('settings_global_desc')||'Shared with all users — changes here affect everyone'}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('artificial_time')||'Artificial Time'} <span title="${t('settings_artificial_time_info')||'Override the current time for exercise simulation purposes.'}" style="cursor:help;font-size:var(--fs-xs);color:var(--accent)">ℹ️</span></div>
        ${hasRole2(state.user?.role, 'teamlead') ? `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-sm)">
            <input type="checkbox" id="settingsArtTimeEnabled" ${ex.artificial_time_enabled?'checked':''}
              data-action="toggleArtificialTimeSetting" data-event="change"
              style="width:14px;height:14px;accent-color:var(--accent)">
            ${t('artificial_time_enable')||'Enable artificial time'}
          </label>
        </div>
        <div style="margin-bottom:6px">
          <input type="datetime-local" id="settingsArtTime" value="${ex.artificial_time ? fmtDateInput(new Date(ex.artificial_time)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
        </div>
        <button class="btn btn-secondary btn-sm" data-action="saveArtificialTimeSetting">${t('btn_save')||'Save'}</button>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px">${t('artificial_time_desc')||'Set a custom "current time" for exercise simulation'}</div>
        ` : `
        <div style="font-size:var(--fs-sm);color:var(--text)">
          ${ex.artificial_time_enabled
            ? `<span style="color:#27AE60">✓ Active</span> — ${ex.artificial_time ? new Date(ex.artificial_time).toLocaleString() : 'Not set'}`
            : `<span style="color:var(--text-dim)">— Disabled</span>`}
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${t('artificial_time_readonly')||'Contact a team lead or admin to change artificial time settings.'}</div>
        `}
      </div>
      ${synthActive() ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('freeze_label')||'Timeline Freeze'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin:0 0 8px">${state.timelinePaused ? (t('freeze_active')||'Timeline is frozen.') : (t('freeze_desc')||'Freeze progression for exercise review.')}</p>
        <button class="btn btn-sm ${state.timelinePaused?'btn-danger':'btn-secondary'}" data-action="toggleFreeze">
          ${state.timelinePaused ? ('▶ '+(t('btn_resume')||'Resume')) : ('⏸ '+(t('btn_freeze')||'Freeze'))}
        </button>
      </div>` : ''}
      <div class="sidebar-section">
        <div class="sidebar-section-title">${t('settings_terminology')||'Terminology'}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_group_label')||'Group label'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(ex.group_label||'group')==='group'?' active':''}" data-action="setGroupLabel" data-arg="group">Group</button>
          <button class="toggle-btn${ex.group_label==='unit'?' active':''}" data-action="setGroupLabel" data-arg="unit">Unit</button>
          <button class="toggle-btn${ex.group_label==='team'?' active':''}" data-action="setGroupLabel" data-arg="team">Team</button>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_user_label')||'User label'}</div>
        <div class="toggle-btn-group" style="margin-bottom:8px">
          <button class="toggle-btn${(ex.user_label||'users')==='users'?' active':''}" data-action="setUserLabel" data-arg="users">Users</button>
          <button class="toggle-btn${ex.user_label==='soldiers'?' active':''}" data-action="setUserLabel" data-arg="soldiers">Soldiers</button>
          <button class="toggle-btn${ex.user_label==='personnel'?' active':''}" data-action="setUserLabel" data-arg="personnel">Personnel</button>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:4px">${t('settings_operation_mode')||'Operation mode'}</div>
        <div class="toggle-btn-group">
          <button class="toggle-btn${(ex.operation_mode||'exercise')==='exercise'?' active':''}" data-action="setOperationMode" data-arg="exercise">Exercise</button>
          <button class="toggle-btn${ex.operation_mode==='incident'?' active':''}" data-action="setOperationMode" data-arg="incident">Incident</button>
          <button class="toggle-btn${ex.operation_mode==='operation'?' active':''}" data-action="setOperationMode" data-arg="operation">Operation</button>
        </div>
      </div>
      ${state.user && hasRole2(state.user.role, 'oplead') ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">✅ ${t('ready_check_title')||'Ready Check'}</div>
        <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-bottom:8px">${t('ready_check_desc')||'Verify that all activities have been moved from "planned" status before the operation starts. Useful to confirm all preparations are complete.'}</p>
        <div class="form-check" style="margin-bottom:6px">
          <input type="checkbox" id="rcEnabled" ${ex.ready_check_enabled?'checked':''}>
          <label for="rcEnabled" style="font-size:var(--fs-sm)">${t('ready_check_enable')||'Enable ready check'}</label>
        </div>
        <div style="margin-bottom:6px">
          <div class="form-check" style="margin-bottom:4px">
            <input type="radio" name="rcMode" id="rcModeAbsolute" value="absolute" ${!ex.ready_check_use_offset?'checked':''}>
            <label for="rcModeAbsolute" style="font-size:var(--fs-sm)">${t('ready_check_absolute')||'At specific time'}</label>
          </div>
          <input type="datetime-local" id="rcAbsoluteTime" value="${ex.ready_check_time ? fmtDateInput(new Date(ex.ready_check_time)) : ''}"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm);margin-bottom:6px">
          <div class="form-check" style="margin-bottom:4px">
            <input type="radio" name="rcMode" id="rcModeOffset" value="offset" ${ex.ready_check_use_offset?'checked':''}>
            <label for="rcModeOffset" style="font-size:var(--fs-sm)">${t('ready_check_offset')||'Minutes before epoch'}</label>
          </div>
          <input type="number" id="rcOffsetMins" min="0" value="${ex.ready_check_offset_mins||60}" placeholder="60"
            style="width:100px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:5px 8px;font-size:var(--fs-sm)">
          <span style="font-size:var(--fs-xs);color:var(--text-dim);margin-left:4px">${t('minutes')||'minutes'}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-action="saveReadyCheckSettings">${t('btn_save')||'Save'}</button>
          <button class="btn btn-secondary btn-sm" data-action="runReadyCheck">▶ ${t('ready_check_run')||'Run Now'}</button>
        </div>
      </div>` : ''}
      ${state.user && state.user.role==='admin' ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title" style="color:var(--danger)">${t('settings_danger_zone')||'Danger Zone'}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div>
            <button class="btn btn-danger btn-sm" data-action="resetDatabase">${t('settings_reset')||'Reset to Empty'}</button>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('settings_reset_desc')||'Removes all data except the audit trail.'}</p>
          </div>
          <div>
            <button class="btn btn-danger btn-sm" data-action="restartBackend">${t('danger_restart_backend')||'Restart Backend'}</button>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('danger_restart_backend_desc')||'Restart the Tidslinjal backend service.'}</p>
          </div>
          <div>
            <button class="btn btn-danger btn-sm" data-action="restartServer">${t('danger_restart_server')||'Restart Server'}</button>
            <p style="font-size:var(--fs-xs);color:var(--text-dim);margin-top:4px">${t('danger_restart_server_desc')||'Restart the server host. All services will be temporarily unavailable.'}</p>
          </div>
        </div>
      </div>` : ''}
    `;
  }
  // Bind all data-action handlers on the sidebar (CSP-safe)
  _bindActions(el);

  // Load startup text into settings textarea if settings tab is active
  if (tab === 'settings') {
    setTimeout(_loadStartupTextInput, 50);
  }
}

