/* ── charts.js — lightweight canvas charting (no external deps) ────────────── */
(function() {
'use strict';

const DEFAULT_COLORS = ['#3498DB','#E67E22','#27AE60','#E74C3C','#9B59B6','#1ABC9C','#F39C12','#2980B9','#D35400','#16A085'];
const TEXT_COLOR = '#ccc';
const GRID_COLOR = 'rgba(255,255,255,0.08)';
const FONT = '12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif';

/* ── helpers ───────────────────────────────────────────────────────────────── */

function setupCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = parent ? parent.clientWidth : canvas.width;
  const h = canvas.height || 300;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  return { canvas, ctx, w, h, dpr };
}

function pickColor(i, colors) {
  if (Array.isArray(colors) && colors.length) return colors[i % colors.length];
  if (typeof colors === 'string') return colors;
  return DEFAULT_COLORS[i % DEFAULT_COLORS.length];
}

function lerpColor(a, b, t) {
  // a,b are hex strings like '#rrggbb'
  const ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16);
  const br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16);
  const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), bl = Math.round(ab + (bb-ab)*t);
  return '#' + [r,g,bl].map(c => c.toString(16).padStart(2,'0')).join('');
}

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

function truncText(ctx, text, maxW) {
  const s = String(text);
  if (ctx.measureText(s).width <= maxW) return s;
  for (let i = s.length - 1; i > 0; i--) {
    const t = s.slice(0, i) + '…';
    if (ctx.measureText(t).width <= maxW) return t;
  }
  return '…';
}

/* ── drawPieChart ──────────────────────────────────────────────────────────── */

function drawPieChart(canvasId, labels, data, colors) {
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const total = data.reduce((a,b) => a + b, 0) || 1;
  const cx = w / 2, cy = (h - 40) / 2;
  const r = Math.min(cx, cy) - 20;
  const innerR = r * 0.5;
  let angle = -Math.PI / 2;

  for (let i = 0; i < data.length; i++) {
    const slice = (data[i] / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.arc(cx, cy, innerR, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = pickColor(i, colors);
    ctx.fill();
    angle += slice;
  }

  // Legend
  const legendY = h - 30;
  ctx.font = '11px sans-serif';
  let lx = 10;
  for (let i = 0; i < labels.length; i++) {
    ctx.fillStyle = pickColor(i, colors);
    ctx.fillRect(lx, legendY, 10, 10);
    ctx.fillStyle = TEXT_COLOR;
    const pct = ((data[i] / total) * 100).toFixed(0);
    const lbl = labels[i] + ' (' + pct + '%)';
    ctx.fillText(lbl, lx + 14, legendY + 9);
    lx += ctx.measureText(lbl).width + 26;
    if (lx > w - 40) { lx = 10; /* wrap handled by clipping */ }
  }
}

/* ── drawBarChart ──────────────────────────────────────────────────────────── */

function drawBarChart(canvasId, labels, data, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const horiz = !!options.horizontal;
  const maxVal = niceMax(Math.max(...data, 1));
  const maxBarW = options.maxBarWidth || 999;

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '11px sans-serif';

  if (horiz) {
    const labelW = 100;
    const barArea = w - labelW - 50;
    const barH = Math.min(maxBarW, Math.max(10, (h - 20) / labels.length - 4));
    for (let i = 0; i < labels.length; i++) {
      const y = 10 + i * (barH + 4);
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncText(ctx, labels[i], labelW - 8), labelW - 4, y + barH / 2);
      const bw = (data[i] / maxVal) * barArea;
      ctx.fillStyle = pickColor(i, options.colors);
      ctx.beginPath();
      ctx.roundRect(labelW, y, bw, barH, 3);
      ctx.fill();
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'left';
      ctx.fillText(String(data[i]), labelW + bw + 4, y + barH / 2);
    }
  } else {
    const padding = 40;
    const bottom = h - 30;
    const top = 10;
    const barArea = w - padding * 2;
    const barW = Math.min(maxBarW, Math.max(6, barArea / labels.length - 4));
    // grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = top + (bottom - top) * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - 10, y); ctx.stroke();
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxVal * i / 4)), padding - 4, y + 4);
    }
    for (let i = 0; i < labels.length; i++) {
      const x = padding + (barArea / labels.length) * i + (barArea / labels.length - barW) / 2;
      const bh = (data[i] / maxVal) * (bottom - top);
      ctx.fillStyle = pickColor(i, options.colors);
      ctx.beginPath();
      ctx.roundRect(x, bottom - bh, barW, bh, [3, 3, 0, 0]);
      ctx.fill();
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'center';
      ctx.font = '10px sans-serif';
      ctx.save();
      ctx.translate(x + barW / 2, bottom + 4);
      ctx.rotate(labels.length > 10 ? -0.5 : 0);
      ctx.fillText(truncText(ctx, labels[i], 60), 0, 10);
      ctx.restore();
      ctx.font = '11px sans-serif';
    }
  }
}

/* ── drawLineChart ─────────────────────────────────────────────────────────── */

function drawLineChart(canvasId, labels, datasets, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const padL = 45, padR = 15, padT = 15, padB = 35;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  let allMax = 0;
  datasets.forEach(ds => { ds.data.forEach(v => { if (v > allMax) allMax = v; }); });
  allMax = niceMax(allMax) || 1;

  // grid
  ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
  ctx.fillStyle = TEXT_COLOR; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(allMax * i / 4)), padL - 4, y + 3);
  }
  // x labels
  ctx.textAlign = 'center'; ctx.fillStyle = TEXT_COLOR;
  const step = Math.max(1, Math.floor(labels.length / 10));
  for (let i = 0; i < labels.length; i += step) {
    const x = padL + (i / (labels.length - 1 || 1)) * plotW;
    ctx.fillText(truncText(ctx, labels[i], 50), x, h - 5);
  }

  datasets.forEach((ds, di) => {
    const color = ds.color || pickColor(di);
    const pts = ds.data.map((v, i) => ({
      x: padL + (i / (ds.data.length - 1 || 1)) * plotW,
      y: padT + plotH * (1 - v / allMax)
    }));
    // area
    if (options.showArea) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padT + plotH);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length-1].x, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = color + '30';
      ctx.fill();
    }
    // line
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    // points
    if (options.showPoints !== false) {
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
      });
    }
  });

  // legend
  if (datasets.length > 1) {
    ctx.font = '11px sans-serif';
    let lx = padL;
    datasets.forEach((ds, di) => {
      const c = ds.color || pickColor(di);
      ctx.fillStyle = c;
      ctx.fillRect(lx, 2, 10, 10);
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'left';
      ctx.fillText(ds.label || '', lx + 14, 11);
      lx += ctx.measureText(ds.label || '').width + 28;
    });
  }
}

/* ── drawHeatmap ───────────────────────────────────────────────────────────── */

function drawHeatmap(canvasId, rowLabels, colLabels, data, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const colorLow = options.colorLow || '#1a1a2e';
  const colorHigh = options.colorHigh || '#3498DB';
  const cellSize = options.cellSize || Math.min(
    (w - 60) / (colLabels.length || 1),
    (h - 30) / (rowLabels.length || 1)
  );
  const labelW = 50;
  let allMax = 0;
  data.forEach(row => row.forEach(v => { if (v > allMax) allMax = v; }));
  allMax = allMax || 1;

  ctx.font = '10px sans-serif';
  // col headers
  ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'center';
  for (let c = 0; c < colLabels.length; c++) {
    ctx.fillText(truncText(ctx, colLabels[c], cellSize - 2), labelW + c * cellSize + cellSize / 2, 10);
  }
  // rows
  for (let r = 0; r < rowLabels.length; r++) {
    ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'right';
    ctx.fillText(truncText(ctx, rowLabels[r], labelW - 4), labelW - 4, 22 + r * cellSize + cellSize / 2 + 3);
    for (let c = 0; c < colLabels.length; c++) {
      const v = (data[r] && data[r][c]) || 0;
      const t = v / allMax;
      ctx.fillStyle = lerpColor(colorLow, colorHigh, t);
      ctx.fillRect(labelW + c * cellSize + 1, 16 + r * cellSize + 1, cellSize - 2, cellSize - 2);
      if (v > 0 && cellSize >= 18) {
        ctx.fillStyle = t > 0.5 ? '#fff' : TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText(String(v), labelW + c * cellSize + cellSize / 2, 16 + r * cellSize + cellSize / 2 + 4);
      }
    }
  }
}

/* ── drawStackedBar ────────────────────────────────────────────────────────── */

function drawStackedBar(canvasId, labels, datasets, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const padL = 45, padR = 15, padT = 20, padB = 35;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  // compute totals per label
  const totals = labels.map((_, i) => datasets.reduce((sum, ds) => sum + (ds.data[i] || 0), 0));
  const maxVal = niceMax(Math.max(...totals, 1));
  const barW = Math.max(6, plotW / labels.length - 4);

  // grid
  ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
  ctx.fillStyle = TEXT_COLOR; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(maxVal * i / 4)), padL - 4, y + 3);
  }

  for (let li = 0; li < labels.length; li++) {
    let base = padT + plotH;
    const x = padL + (plotW / labels.length) * li + (plotW / labels.length - barW) / 2;
    for (let di = 0; di < datasets.length; di++) {
      const v = datasets[di].data[li] || 0;
      const bh = (v / maxVal) * plotH;
      base -= bh;
      ctx.fillStyle = datasets[di].color || pickColor(di);
      ctx.fillRect(x, base, barW, bh);
    }
    ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'center'; ctx.font = '10px sans-serif';
    ctx.fillText(truncText(ctx, labels[li], 50), x + barW / 2, h - 5);
  }

  // legend
  ctx.font = '11px sans-serif'; let lx = padL;
  datasets.forEach((ds, di) => {
    const c = ds.color || pickColor(di);
    ctx.fillStyle = c; ctx.fillRect(lx, 2, 10, 10);
    ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'left';
    ctx.fillText(ds.label || '', lx + 14, 11);
    lx += ctx.measureText(ds.label || '').width + 28;
  });
}

/* ── drawHistogram ─────────────────────────────────────────────────────────── */

function drawHistogram(canvasId, bucketLabels, values, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const color = options.color || DEFAULT_COLORS[0];
  const showValues = options.showValues !== false;
  const padL = 45, padR = 15, padT = 15, padB = 35;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = niceMax(Math.max(...values, 1));
  const barW = plotW / values.length;

  // grid
  ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
  ctx.fillStyle = TEXT_COLOR; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(maxVal * i / 4)), padL - 4, y + 3);
  }

  for (let i = 0; i < values.length; i++) {
    const bh = (values[i] / maxVal) * plotH;
    const x = padL + i * barW;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, padT + plotH - bh, barW - 2, bh);
    if (showValues && values[i] > 0) {
      ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'center';
      ctx.fillText(String(values[i]), x + barW / 2, padT + plotH - bh - 4);
    }
    ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'center'; ctx.font = '9px sans-serif';
    ctx.fillText(truncText(ctx, bucketLabels[i] || '', barW - 2), x + barW / 2, h - 5);
    ctx.font = '10px sans-serif';
  }
}

/* ── drawSparkline ─────────────────────────────────────────────────────────── */

function drawSparkline(canvasId, data, options) {
  options = options || {};
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const sw = options.width || canvas.parentElement.clientWidth || 80;
  const sh = options.height || 24;
  canvas.width = sw * dpr; canvas.height = sh * dpr;
  canvas.style.width = sw + 'px'; canvas.style.height = sh + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, sw, sh);

  if (!data || !data.length) return;
  const color = options.color || DEFAULT_COLORS[0];
  const maxV = Math.max(...data) || 1;
  const minV = Math.min(...data);
  const range = maxV - minV || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1 || 1)) * sw,
    y: sh - ((v - minV) / range) * (sh - 4) - 2
  }));

  if (options.fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, sh);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length-1].x, sh);
    ctx.closePath();
    ctx.fillStyle = color + '30';
    ctx.fill();
  }
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
}

/* ── drawNetworkGraph ──────────────────────────────────────────────────────── */

function drawNetworkGraph(canvasId, nodes, edges, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { canvas, ctx, w, h } = s;
  const nodeR = options.nodeRadius || 12;
  const directed = options.directed !== false;

  if (!nodes.length) {
    ctx.fillStyle = TEXT_COLOR; ctx.textAlign = 'center';
    ctx.fillText('No dependency data', w / 2, h / 2);
    return;
  }

  // Init positions if not set
  nodes.forEach((n, i) => {
    if (n.x == null) n.x = w * 0.2 + Math.random() * w * 0.6;
    if (n.y == null) n.y = h * 0.2 + Math.random() * h * 0.6;
    n.vx = 0; n.vy = 0;
  });

  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  // Simple force simulation
  function simulate(iterations) {
    for (let iter = 0; iter < iterations; iter++) {
      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx*dx + dy*dy) || 1;
          let force = 3000 / (dist * dist);
          let fx = dx / dist * force;
          let fy = dy / dist * force;
          nodes[i].vx -= fx; nodes[i].vy -= fy;
          nodes[j].vx += fx; nodes[j].vy += fy;
        }
      }
      // spring (edges)
      edges.forEach(e => {
        const a = nodeMap[e.from], b = nodeMap[e.to];
        if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx*dx + dy*dy) || 1;
        let force = (dist - 80) * 0.05;
        let fx = dx / dist * force, fy = dy / dist * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });
      // center gravity
      nodes.forEach(n => {
        n.vx += (w/2 - n.x) * 0.002;
        n.vy += (h/2 - n.y) * 0.002;
        n.vx *= 0.8; n.vy *= 0.8;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(nodeR, Math.min(w - nodeR, n.x));
        n.y = Math.max(nodeR, Math.min(h - nodeR, n.y));
      });
    }
  }

  simulate(80);

  function render() {
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // edges
    edges.forEach(e => {
      const a = nodeMap[e.from], b = nodeMap[e.to];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.color || 'rgba(255,255,255,0.3)';
      ctx.lineWidth = e.critical ? 2.5 : 1;
      ctx.stroke();
      if (directed) {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const ax = b.x - Math.cos(angle) * (nodeR + 4);
        const ay = b.y - Math.sin(angle) * (nodeR + 4);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(angle - 0.4) * 8, ay - Math.sin(angle - 0.4) * 8);
        ctx.lineTo(ax - Math.cos(angle + 0.4) * 8, ay - Math.sin(angle + 0.4) * 8);
        ctx.closePath();
        ctx.fillStyle = e.color || 'rgba(255,255,255,0.3)';
        ctx.fill();
      }
    });

    // nodes
    nodes.forEach(n => {
      const r = n.size || nodeR;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.color || DEFAULT_COLORS[0];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (n.label) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.font = '10px sans-serif';
        ctx.fillText(truncText(ctx, n.label, 60), n.x, n.y + r + 12);
      }
    });

    ctx.restore();
  }

  render();

  // Interactive drag
  if (options.interactive) {
    let dragging = null;
    const rect = () => canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.addEventListener('mousedown', e => {
      const r = rect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      for (const n of nodes) {
        const dx = n.x - mx, dy = n.y - my;
        if (dx*dx + dy*dy < (n.size||nodeR) * (n.size||nodeR) * 1.5) {
          dragging = n; canvas.style.cursor = 'grabbing'; break;
        }
      }
    });
    canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      const r = rect();
      dragging.x = e.clientX - r.left;
      dragging.y = e.clientY - r.top;
      render();
    });
    canvas.addEventListener('mouseup', e => {
      if (dragging) { dragging = null; canvas.style.cursor = 'default'; return; }
    });
    canvas.addEventListener('mouseleave', () => { dragging = null; canvas.style.cursor = 'default'; });

    // Click to show node info
    let _downPos = null;
    canvas.addEventListener('mousedown', e2 => { _downPos = { x: e2.clientX, y: e2.clientY }; }, true);
    canvas.addEventListener('click', e2 => {
      // Only trigger if not a drag (moved < 5px)
      if (_downPos) {
        const dx = e2.clientX - _downPos.x, dy = e2.clientY - _downPos.y;
        if (dx*dx + dy*dy > 25) return;
      }
      const r2 = rect();
      const mx = e2.clientX - r2.left, my = e2.clientY - r2.top;
      for (const n of nodes) {
        const ddx = n.x - mx, ddy = n.y - my;
        if (ddx*ddx + ddy*ddy < (n.size||nodeR) * (n.size||nodeR) * 1.5) {
          _showNodeInfoPopup(canvas, n, mx, my);
          break;
        }
      }
    });
  }
}

function _showNodeInfoPopup(canvas, node, mx, my) {
  // Remove any existing popup
  const existing = document.getElementById('_nodeInfoPopup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = '_nodeInfoPopup';
  popup.style.cssText = 'position:absolute;z-index:9999;background:var(--bg2,#162030);border:1px solid var(--border,#2a3f56);border-radius:6px;padding:10px 14px;max-width:320px;font-size:11px;color:var(--text,#cfd8e3);box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:auto;';

  const title = node.label || node.id;
  const info = node._event || node._data || {};
  let html = '<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:var(--text-bright,#f0f4f8)">' + _escForPopup(String(title)) + '</div>';
  html += '<div style="font-size:10px;color:var(--text-dim,#7a8fa6);margin-bottom:4px">ID: ' + _escForPopup(String(node.id)) + '</div>';

  if (info.status) html += '<div><b>Status:</b> ' + _escForPopup(info.status) + '</div>';
  if (info.event_type || info.type) html += '<div><b>Type:</b> ' + _escForPopup(info.event_type || info.type) + '</div>';
  if (info.start_time || info.start) html += '<div><b>Start:</b> ' + _escForPopup(String(info.start_time || info.start).slice(0,16).replace('T',' ')) + '</div>';
  if (info.end_time || info.end) html += '<div><b>End:</b> ' + _escForPopup(String(info.end_time || info.end).slice(0,16).replace('T',' ')) + '</div>';
  if (info.description) html += '<div style="margin-top:4px;color:var(--text-dim)">' + _escForPopup(info.description).slice(0,200) + '</div>';
  if (info.assigned_to) html += '<div><b>Assigned:</b> ' + _escForPopup(info.assigned_to) + '</div>';
  if (info.layer_name) html += '<div><b>Layer:</b> ' + _escForPopup(info.layer_name) + '</div>';

  html += '<div style="margin-top:8px;text-align:right"><button onclick="this.parentElement.parentElement.remove()" style="background:var(--bg3,#1e2d40);border:1px solid var(--border,#2a3f56);border-radius:4px;color:var(--text,#cfd8e3);padding:2px 10px;font-size:10px;cursor:pointer">✕ Close</button></div>';
  popup.innerHTML = html;

  // Position relative to canvas parent
  const parent = canvas.parentElement;
  if (parent) {
    parent.style.position = 'relative';
    popup.style.left = Math.min(mx, parent.clientWidth - 330) + 'px';
    popup.style.top = Math.max(0, my - 60) + 'px';
    parent.appendChild(popup);
  } else {
    document.body.appendChild(popup);
  }

  // Close on outside click
  setTimeout(() => {
    const handler = (ev) => {
      if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', handler); }
    };
    document.addEventListener('mousedown', handler);
  }, 100);
}

function _escForPopup(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

/* ── drawAreaChart ─────────────────────────────────────────────────────────── */

function drawAreaChart(canvasId, labels, data, options) {
  options = options || {};
  const s = setupCanvas(canvasId);
  if (!s) return;
  const { ctx, w, h } = s;
  const color = options.color || DEFAULT_COLORS[0];
  const padL = 45, padR = 15, padT = 15, padB = 35;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = niceMax(Math.max(...data, 1));

  // grid
  ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
  ctx.fillStyle = TEXT_COLOR; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(maxVal * i / 4)), padL - 4, y + 3);
  }
  // x labels
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(labels.length / 10));
  for (let i = 0; i < labels.length; i += step) {
    const x = padL + (i / (labels.length - 1 || 1)) * plotW;
    ctx.fillText(truncText(ctx, labels[i], 50), x, h - 5);
  }

  const pts = data.map((v, i) => ({
    x: padL + (i / (data.length - 1 || 1)) * plotW,
    y: padT + plotH * (1 - v / maxVal)
  }));

  // fill
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT + plotH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = color + '35';
  ctx.fill();

  // line
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();

  // points
  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  });
}

/* ── Exports ───────────────────────────────────────────────────────────────── */

window.drawPieChart     = drawPieChart;
window.drawBarChart     = drawBarChart;
window.drawLineChart    = drawLineChart;
window.drawHeatmap      = drawHeatmap;
window.drawStackedBar   = drawStackedBar;
window.drawHistogram    = drawHistogram;
window.drawSparkline    = drawSparkline;
window.drawNetworkGraph = drawNetworkGraph;
window.drawAreaChart    = drawAreaChart;

})();
