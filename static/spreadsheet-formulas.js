/* ── Spreadsheet Formula Engine ─────────────────────────────────────────────
 * Provides the global `formula` function required by jspreadsheet CE v5.
 * Must be loaded BEFORE jspreadsheet.min.js.
 * ──────────────────────────────────────────────────────────────────────────── */
'use strict';

(function(global) {

// Registry of formula functions (case-insensitive)
const F = {};

// ── Math / Arithmetic ────────────────────────────────────────────────────────
F.SUM      = function() { return _nums(arguments).reduce((a,b)=>a+b, 0); };
F.AVERAGE  = function() { const n = _nums(arguments); return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0; };
F.MIN      = function() { const n = _nums(arguments); return n.length ? Math.min(...n) : 0; };
F.MAX      = function() { const n = _nums(arguments); return n.length ? Math.max(...n) : 0; };
F.COUNT    = function() { return _nums(arguments).length; };
F.COUNTA   = function() { let c=0; for(let i=0;i<arguments.length;i++){const v=arguments[i];if(v!==''&&v!==null&&v!==undefined)c++;} return c; };
F.ABS      = function(v) { return Math.abs(_n(v)); };
F.SQRT     = function(v) { return Math.sqrt(_n(v)); };
F.POWER    = function(b,e) { return Math.pow(_n(b),_n(e)); };
F.ROUND    = function(v,d) { const f=Math.pow(10,_n(d)||0); return Math.round(_n(v)*f)/f; };
F.ROUNDUP  = function(v,d) { const f=Math.pow(10,_n(d)||0); return Math.ceil(_n(v)*f)/f; };
F.ROUNDDOWN= function(v,d) { const f=Math.pow(10,_n(d)||0); return Math.floor(_n(v)*f)/f; };
F.INT      = function(v) { return Math.floor(_n(v)); };
F.MOD      = function(a,b) { return _n(a) % _n(b); };
F.PI       = function() { return Math.PI; };
F.RAND     = function() { return Math.random(); };
F.CEILING  = function(v,s) { s=_n(s)||1; return Math.ceil(_n(v)/s)*s; };
F.FLOOR    = function(v,s) { s=_n(s)||1; return Math.floor(_n(v)/s)*s; };
F.LOG      = function(v,b) { return b ? Math.log(_n(v))/Math.log(_n(b)) : Math.log(_n(v)); };
F.LOG10    = function(v) { return Math.log10(_n(v)); };
F.EXP      = function(v) { return Math.exp(_n(v)); };
F.SIGN     = function(v) { return Math.sign(_n(v)); };

// ── Statistical ──────────────────────────────────────────────────────────────
F.MEDIAN   = function() { const n=_nums(arguments).sort((a,b)=>a-b); if(!n.length) return 0; const m=Math.floor(n.length/2); return n.length%2?n[m]:(n[m-1]+n[m])/2; };
F.STDEV    = function() { const n=_nums(arguments); if(n.length<2)return 0; const avg=n.reduce((a,b)=>a+b,0)/n.length; return Math.sqrt(n.reduce((s,v)=>s+Math.pow(v-avg,2),0)/(n.length-1)); };
F.VAR      = function() { const n=_nums(arguments); if(n.length<2)return 0; const avg=n.reduce((a,b)=>a+b,0)/n.length; return n.reduce((s,v)=>s+Math.pow(v-avg,2),0)/(n.length-1); };
F.LARGE    = function() { const args=[...arguments]; const k=_n(args.pop()); const n=_nums(args).sort((a,b)=>b-a); return k>0&&k<=n.length?n[k-1]:'#VALUE!'; };
F.SMALL    = function() { const args=[...arguments]; const k=_n(args.pop()); const n=_nums(args).sort((a,b)=>a-b); return k>0&&k<=n.length?n[k-1]:'#VALUE!'; };
F.PRODUCT  = function() { const n=_nums(arguments); return n.length?n.reduce((a,b)=>a*b,1):0; };

// ── Conditional / Logic ──────────────────────────────────────────────────────
F.IF       = function(cond,vt,vf) { return cond ? vt : vf; };
F.AND      = function() { for(let i=0;i<arguments.length;i++) if(!arguments[i]) return false; return true; };
F.OR       = function() { for(let i=0;i<arguments.length;i++) if(arguments[i]) return true; return false; };
F.NOT      = function(v) { return !v; };
F.IFERROR  = function(v,fallback) { return (v==='#ERROR'||v==='#VALUE!'||v==='#REF!'||v==='#DIV/0!') ? fallback : v; };
F.ISBLANK  = function(v) { return v===''||v===null||v===undefined; };
F.ISNUMBER = function(v) { return typeof v==='number'||(!isNaN(v)&&v!==''); };

// ── Conditional Aggregation ──────────────────────────────────────────────────
F.SUMIF    = function() { const args=[...arguments]; const crit=args.pop(); const vals=args; let s=0; for(const v of vals){if(_matchCrit(v,crit))s+=_n(v);} return s; };
F.COUNTIF  = function() { const args=[...arguments]; const crit=args.pop(); let c=0; for(let i=0;i<args.length;i++){if(_matchCrit(args[i],crit))c++;} return c; };
F.AVERAGEIF= function() { const args=[...arguments]; const crit=args.pop(); const vals=[]; for(const v of args){if(_matchCrit(v,crit))vals.push(_n(v));} return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0; };

// ── String / Text ────────────────────────────────────────────────────────────
F.CONCAT      = function() { return [...arguments].map(String).join(''); };
F.CONCATENATE = F.CONCAT;
F.LEFT     = function(t,n) { return String(t||'').substring(0, _n(n)||1); };
F.RIGHT    = function(t,n) { const s=String(t||''); return s.substring(s.length-(_n(n)||1)); };
F.MID      = function(t,start,len) { return String(t||'').substring((_n(start)||1)-1, (_n(start)||1)-1+(_n(len)||1)); };
F.LEN      = function(t) { return String(t||'').length; };
F.UPPER    = function(t) { return String(t||'').toUpperCase(); };
F.LOWER    = function(t) { return String(t||'').toLowerCase(); };
F.PROPER   = function(t) { return String(t||'').replace(/\b\w/g, c=>c.toUpperCase()); };
F.TRIM     = function(t) { return String(t||'').trim(); };
F.SUBSTITUTE = function(t,old,rep) { return String(t||'').split(String(old||'')).join(String(rep||'')); };
F.REPT     = function(t,n) { return String(t||'').repeat(Math.max(0,_n(n)||0)); };
F.FIND     = function(needle,hay,start) { const i=String(hay||'').indexOf(String(needle||''), (_n(start)||1)-1); return i>=0?i+1:'#VALUE!'; };
F.SEARCH   = function(needle,hay,start) { const i=String(hay||'').toLowerCase().indexOf(String(needle||'').toLowerCase(), (_n(start)||1)-1); return i>=0?i+1:'#VALUE!'; };
F.REPLACE  = function(t,start,len,rep) { const s=String(t||''); return s.substring(0,(_n(start)||1)-1)+String(rep||'')+s.substring((_n(start)||1)-1+(_n(len)||0)); };
F.TEXT     = function(v,fmt) { return String(v||''); };
F.VALUE    = function(t) { const n=parseFloat(t); return isNaN(n)?'#VALUE!':n; };
F.CHAR     = function(n) { return String.fromCharCode(_n(n)); };
F.CODE     = function(t) { return String(t||'').charCodeAt(0)||0; };
F.EXACT    = function(a,b) { return String(a)===String(b); };

// ── Date / Time ──────────────────────────────────────────────────────────────
F.TODAY    = function() { return new Date().toISOString().split('T')[0]; };
F.NOW      = function() { return new Date().toLocaleString(); };
F.DATE     = function(y,m,d) { return new Date(_n(y),_n(m)-1,_n(d)).toISOString().split('T')[0]; };
F.YEAR     = function(d) { return new Date(d).getFullYear(); };
F.MONTH    = function(d) { return new Date(d).getMonth()+1; };
F.DAY      = function(d) { return new Date(d).getDate(); };
F.HOUR     = function(d) { return new Date(d).getHours(); };
F.MINUTE   = function(d) { return new Date(d).getMinutes(); };
F.SECOND   = function(d) { return new Date(d).getSeconds(); };
F.WEEKDAY  = function(d) { return new Date(d).getDay()+1; };
F.DAYS     = function(end,start) { return Math.round((new Date(end)-new Date(start))/86400000); };

// ── Lookup / Reference ───────────────────────────────────────────────────────
F.CHOOSE   = function(idx) { idx=_n(idx); return idx>=1&&idx<arguments.length?arguments[idx]:'#VALUE!'; };

// ── Utility ──────────────────────────────────────────────────────────────────
F.TYPE     = function(v) { if(typeof v==='number')return 1; if(typeof v==='string')return 2; if(typeof v==='boolean')return 4; return 0; };
F.N        = function(v) { return _n(v); };

// ── Helpers ──────────────────────────────────────────────────────────────────
function _n(v) { const n=parseFloat(v); return isNaN(n)?0:n; }

function _nums(args) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const v = args[i];
    if (Array.isArray(v)) {
      for (const item of v) { const n = parseFloat(item); if (!isNaN(n)) result.push(n); }
    } else {
      const n = parseFloat(v);
      if (!isNaN(n)) result.push(n);
    }
  }
  return result;
}

function _matchCrit(val, crit) {
  const s = String(crit);
  if (s.startsWith('>=')) return _n(val) >= _n(s.substring(2));
  if (s.startsWith('<=')) return _n(val) <= _n(s.substring(2));
  if (s.startsWith('<>')) return String(val) !== s.substring(2);
  if (s.startsWith('>'))  return _n(val) > _n(s.substring(1));
  if (s.startsWith('<'))  return _n(val) < _n(s.substring(1));
  if (s.startsWith('='))  return String(val) === s.substring(1);
  return String(val) === s;
}

// ── Main formula evaluator ───────────────────────────────────────────────────
// Called by jspreadsheet with the expression (without leading =),
// a map of cell references to values, and coordinates.

function formulaEngine(expression, variables, x, y, instance) {
  // Replace cell references with their values (already done by jspreadsheet,
  // but function calls like SUM(...) need to be resolved)
  let expr = expression;

  // Replace function calls with F.FUNCNAME calls (case-insensitive)
  expr = expr.replace(/([A-Z_][A-Z0-9_]*)\s*\(/gi, function(match, name) {
    const upper = name.toUpperCase();
    if (F[upper]) return 'F.' + upper + '(';
    return match; // leave unknown functions as-is
  });

  try {
    // Use Function constructor with F in scope (avoids global eval)
    const fn = new Function('F', 'return (' + expr + ')');
    return fn(F);
  } catch (e) {
    return '#ERROR';
  }
}

// Register as global — jspreadsheet checks for `formula` var
global.formula = formulaEngine;

// Also expose F for direct use
global.F = F;

})(typeof window !== 'undefined' ? window : globalThis);
