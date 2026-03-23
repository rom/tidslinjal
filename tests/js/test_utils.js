/**
 * tests/js/test_utils.js
 * Node.js unit tests for pure utility functions extracted from utils.js and modals.js.
 * No DOM or browser environment required.
 */

'use strict';

// ── Minimal test runner ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message || String(e) });
    process.stdout.write(`  ✗ ${name}\n    → ${e.message || e}\n`);
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeTruthy() {
      if (!value) throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
    },
    toBeFalsy() {
      if (value) throw new Error(`Expected falsy, got ${JSON.stringify(value)}`);
    },
    toBeGreaterThan(n) {
      if (!(value > n)) throw new Error(`Expected ${value} > ${n}`);
    },
    toBeLessThan(n) {
      if (!(value < n)) throw new Error(`Expected ${value} < ${n}`);
    },
    toContain(substr) {
      if (!String(value).includes(substr)) {
        throw new Error(`Expected ${JSON.stringify(value)} to contain ${JSON.stringify(substr)}`);
      }
    },
    not: {
      toBe(expected) {
        if (value === expected) throw new Error(`Expected NOT ${JSON.stringify(expected)}`);
      },
      toContain(substr) {
        if (String(value).includes(substr)) {
          throw new Error(`Expected ${JSON.stringify(value)} NOT to contain ${JSON.stringify(substr)}`);
        }
      },
    },
  };
}

// ── Functions under test (copied verbatim from utils.js / modals.js) ──────────

// escHtml — from utils.js
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// fmtDuration — from utils.js
function fmtDuration(startIso, endIso) {
  if (!endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

// fmtFileSize — from utils.js
function fmtFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

// hasRole2 — from utils.js
function hasRole2(userRole, required) {
  const order = {read:0, reporter:1, readwrite:2, teamlead:3, oplead:4, admin:5};
  return (order[userRole]||0) >= (order[required]||0);
}

// recurStepMs — from utils.js
function recurStepMs(pattern) {
  const map = {
    '15min':    15 * 60000,
    '30min':    30 * 60000,
    'hourly':   60 * 60000,
    '2hours':  120 * 60000,
    '3hours':  180 * 60000,
    '4hours':  240 * 60000,
    'daily':  1440 * 60000,
    'weekly': 7 * 1440 * 60000,
    'monthly':  null,
    'quarterly': null,
  };
  return map[pattern] || null;
}

// Date utilities from utils.js
function startOfDay(d) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth()+n); return r; }
function addHours(d, h) { const r = new Date(d); r.setHours(r.getHours()+h); return r; }
function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function fmtDateInput(d) {
  if (!d) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
}

// toICSDate — from modals.js
function toICSDate(d) {
  const pad = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// escICS — from modals.js
function escICS(s) {
  return (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nescHtml');
test('empty string returns empty', () => expect(escHtml('')).toBe(''));
test('null/undefined returns empty', () => { expect(escHtml(null)).toBe(''); expect(escHtml(undefined)).toBe(''); });
test('ampersand escaped', () => expect(escHtml('a & b')).toBe('a &amp; b'));
test('< and > escaped', () => expect(escHtml('<script>')).toBe('&lt;script&gt;'));
test('double-quote escaped', () => expect(escHtml('"hello"')).toBe('&quot;hello&quot;'));
test('mixed escaping', () => expect(escHtml('<b id="x">a & b</b>')).toBe('&lt;b id=&quot;x&quot;&gt;a &amp; b&lt;/b&gt;'));
test('plain text unchanged', () => expect(escHtml('hello world')).toBe('hello world'));
test('number converted to string', () => expect(escHtml(42)).toBe('42'));

console.log('\nfmtDuration');
test('no endIso returns em-dash', () => expect(fmtDuration('2024-01-01T10:00:00Z', null)).toBe('—'));
test('zero duration returns em-dash', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z')).toBe('—'));
test('negative duration returns em-dash', () => expect(fmtDuration('2024-01-01T11:00:00Z', '2024-01-01T10:00:00Z')).toBe('—'));
test('30 minutes', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z')).toBe('30min'));
test('1 hour exactly', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z')).toBe('1h'));
test('2 hours 30 minutes', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T12:30:00Z')).toBe('2h 30min'));
test('45 minutes (no hours)', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T10:45:00Z')).toBe('45min'));
test('3 hours exact', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T13:00:00Z')).toBe('3h'));
test('1 minute', () => expect(fmtDuration('2024-01-01T10:00:00Z', '2024-01-01T10:01:00Z')).toBe('1min'));

console.log('\nfmtFileSize');
test('bytes under 1024', () => expect(fmtFileSize(512)).toBe('512 B'));
test('exactly 1 byte', () => expect(fmtFileSize(1)).toBe('1 B'));
test('exactly 1 KB', () => expect(fmtFileSize(1024)).toBe('1.0 KB'));
test('1.5 KB', () => expect(fmtFileSize(1536)).toBe('1.5 KB'));
test('exactly 1 MB', () => expect(fmtFileSize(1024*1024)).toBe('1.0 MB'));
test('2.5 MB', () => expect(fmtFileSize(2.5*1024*1024)).toBe('2.5 MB'));
test('1023 bytes', () => expect(fmtFileSize(1023)).toBe('1023 B'));

console.log('\nhasRole2');
test('admin >= admin', () => expect(hasRole2('admin', 'admin')).toBeTruthy());
test('admin >= read', () => expect(hasRole2('admin', 'read')).toBeTruthy());
test('admin >= oplead', () => expect(hasRole2('admin', 'oplead')).toBeTruthy());
test('read < admin', () => expect(hasRole2('read', 'admin')).toBeFalsy());
test('read >= read', () => expect(hasRole2('read', 'read')).toBeTruthy());
test('readwrite >= reporter', () => expect(hasRole2('readwrite', 'reporter')).toBeTruthy());
test('readwrite < teamlead', () => expect(hasRole2('readwrite', 'teamlead')).toBeFalsy());
test('teamlead >= readwrite', () => expect(hasRole2('teamlead', 'readwrite')).toBeTruthy());
test('oplead >= teamlead', () => expect(hasRole2('oplead', 'teamlead')).toBeTruthy());
test('oplead < admin', () => expect(hasRole2('oplead', 'admin')).toBeFalsy());
// Note: 'read' has order value 0 (falsy), so `order['unknown'] || 0` (= 0) >= `order['read'] || 0` (= 0)
// → true. Unknown roles effectively have the same rank as 'read'. This matches source behaviour.
test('unknown role vs read: behaves as equal (0 >= 0)', () => expect(hasRole2('superuser', 'read')).toBeTruthy());
test('unknown role is below reporter', () => expect(hasRole2('superuser', 'reporter')).toBeFalsy());
test('unknown role is below admin', () => expect(hasRole2('superuser', 'admin')).toBeFalsy());

console.log('\nrecurStepMs');
test('15min = 900000ms', () => expect(recurStepMs('15min')).toBe(15 * 60000));
test('30min = 1800000ms', () => expect(recurStepMs('30min')).toBe(30 * 60000));
test('hourly = 3600000ms', () => expect(recurStepMs('hourly')).toBe(3600000));
test('2hours', () => expect(recurStepMs('2hours')).toBe(120 * 60000));
test('3hours', () => expect(recurStepMs('3hours')).toBe(180 * 60000));
test('4hours', () => expect(recurStepMs('4hours')).toBe(240 * 60000));
test('daily = 86400000ms', () => expect(recurStepMs('daily')).toBe(1440 * 60000));
test('weekly = 604800000ms', () => expect(recurStepMs('weekly')).toBe(7 * 1440 * 60000));
test('monthly returns null', () => expect(recurStepMs('monthly')).toBe(null));
test('quarterly returns null', () => expect(recurStepMs('quarterly')).toBe(null));
test('unknown pattern returns null', () => expect(recurStepMs('yearly')).toBe(null));

console.log('\nDate utilities');
test('startOfDay zeroes time', () => {
  const d = new Date('2024-06-15T14:30:00');
  const s = startOfDay(d);
  expect(s.getHours()).toBe(0);
  expect(s.getMinutes()).toBe(0);
  expect(s.getSeconds()).toBe(0);
  expect(s.getDate()).toBe(15);
});
test('startOfDay does not mutate input', () => {
  const d = new Date('2024-06-15T14:30:00');
  startOfDay(d);
  expect(d.getHours()).toBe(14);
});
test('addDays adds days correctly', () => {
  const d = new Date('2024-01-28');
  const result = addDays(d, 5);
  expect(result.getDate()).toBe(2); // Feb 2
});
test('addDays handles month boundary', () => {
  const d = new Date('2024-01-31');
  const r = addDays(d, 1);
  expect(r.getMonth()).toBe(1); // February
});
test('addDays negative (subtract)', () => {
  const d = new Date('2024-06-15');
  const r = addDays(d, -5);
  expect(r.getDate()).toBe(10);
});
test('addMonths adds months', () => {
  const d = new Date('2024-01-15');
  const r = addMonths(d, 3);
  expect(r.getMonth()).toBe(3); // April
});
test('addHours adds hours', () => {
  const d = new Date('2024-06-15T10:00:00');
  const r = addHours(d, 3);
  expect(r.getHours()).toBe(13);
});
test('addHours wraps across midnight', () => {
  const d = new Date('2024-06-15T23:00:00');
  const r = addHours(d, 3);
  expect(r.getHours()).toBe(2);
  expect(r.getDate()).toBe(16);
});

console.log('\nisSameDay');
test('same date is same day', () => {
  expect(isSameDay(new Date('2024-06-15T08:00:00'), new Date('2024-06-15T22:00:00'))).toBeTruthy();
});
test('different date is not same day', () => {
  expect(isSameDay(new Date('2024-06-15'), new Date('2024-06-16'))).toBeFalsy();
});
test('different month is not same day', () => {
  expect(isSameDay(new Date('2024-06-15'), new Date('2024-07-15'))).toBeFalsy();
});
test('different year is not same day', () => {
  expect(isSameDay(new Date('2023-06-15'), new Date('2024-06-15'))).toBeFalsy();
});

console.log('\nfmtDateInput');
test('formats date for datetime-local input', () => {
  const d = new Date(2024, 5, 15, 9, 5, 0); // June 15, 2024 09:05
  expect(fmtDateInput(d)).toBe('2024-06-15T09:05');
});
test('pads single-digit month and day', () => {
  const d = new Date(2024, 0, 5, 8, 3, 0); // Jan 5, 08:03
  expect(fmtDateInput(d)).toBe('2024-01-05T08:03');
});
test('null returns empty string', () => expect(fmtDateInput(null)).toBe(''));

console.log('\ndaysInMonth');
test('January has 31 days', () => expect(daysInMonth(new Date('2024-01-01'))).toBe(31));
test('February 2024 has 29 days (leap year)', () => expect(daysInMonth(new Date('2024-02-01'))).toBe(29));
test('February 2023 has 28 days (non-leap)', () => expect(daysInMonth(new Date('2023-02-01'))).toBe(28));
test('April has 30 days', () => expect(daysInMonth(new Date('2024-04-01'))).toBe(30));
test('December has 31 days', () => expect(daysInMonth(new Date('2024-12-01'))).toBe(31));

console.log('\ntoICSDate');
test('formats UTC date correctly', () => {
  const d = new Date('2024-06-15T10:30:00Z');
  expect(toICSDate(d)).toBe('20240615T103000Z');
});
test('pads single-digit values', () => {
  const d = new Date('2024-01-05T09:05:00Z');
  expect(toICSDate(d)).toBe('20240105T090500Z');
});

console.log('\nescICS');
test('empty string returns empty', () => expect(escICS('')).toBe(''));
test('null/undefined returns empty', () => expect(escICS(null)).toBe(''));
test('semicolon escaped', () => expect(escICS('a;b')).toBe('a\\;b'));
test('comma escaped', () => expect(escICS('a,b')).toBe('a\\,b'));
test('newline escaped', () => expect(escICS('a\nb')).toBe('a\\nb'));
test('backslash escaped', () => expect(escICS('a\\b')).toBe('a\\\\b'));
test('plain text unchanged', () => expect(escICS('hello world')).toBe('hello world'));
test('multiple special chars', () => expect(escICS('a;b,c\nd')).toBe('a\\;b\\,c\\nd'));

// ── Additional escHtml edge cases ────────────────────────────────────────────

console.log('\nescHtml — additional');
test('single quote not escaped (not in spec)', () => expect(escHtml("it's")).toBe("it's"));
test('numeric 0 is falsy — returns empty (consistent with falsy guard)', () => expect(escHtml(0)).toBe(''));
test('false returns empty (falsy)', () => expect(escHtml(false)).toBe(''));
test('nested tags fully escaped', () => expect(escHtml('<a href="x">link</a>')).toBe('&lt;a href=&quot;x&quot;&gt;link&lt;/a&gt;'));
test('multiple ampersands', () => expect(escHtml('a & b & c')).toBe('a &amp; b &amp; c'));

// ── Additional fmtDuration edge cases ────────────────────────────────────────

console.log('\nfmtDuration — additional');
test('exactly 59 minutes', () => expect(fmtDuration('2024-03-01T10:00:00Z', '2024-03-01T10:59:00Z')).toBe('59min'));
test('exactly 24 hours', () => expect(fmtDuration('2024-03-01T00:00:00Z', '2024-03-02T00:00:00Z')).toBe('24h'));
test('1 hour 1 minute', () => expect(fmtDuration('2024-03-01T10:00:00Z', '2024-03-01T11:01:00Z')).toBe('1h 1min'));
test('large duration 48 hours', () => expect(fmtDuration('2024-03-01T00:00:00Z', '2024-03-03T00:00:00Z')).toBe('48h'));
test('same start and end returns em-dash', () => expect(fmtDuration('2024-03-01T10:00:00Z', '2024-03-01T10:00:00Z')).toBe('—'));

// ── Additional fmtFileSize edge cases ────────────────────────────────────────

console.log('\nfmtFileSize — additional');
test('0 bytes', () => expect(fmtFileSize(0)).toBe('0 B'));
test('512 KB formats as KB not MB', () => expect(fmtFileSize(512 * 1024)).toBe('512.0 KB'));
test('1023 KB boundary', () => expect(fmtFileSize(1023 * 1024)).toBe('1023.0 KB'));

// ── Additional hasRole2 edge cases ───────────────────────────────────────────

console.log('\nhasRole2 — additional');
test('observer is not in order map, treated as 0 (== read)', () => expect(hasRole2('observer', 'read')).toBeTruthy());
test('staffofficer not in map, treated as 0, below teamlead', () => expect(hasRole2('staffofficer', 'teamlead')).toBeFalsy());
test('empty string vs read is truthy (0 >= 0)', () => expect(hasRole2('', 'read')).toBeTruthy());
test('admin >= staffofficer_full (unknown, treated as 0)', () => expect(hasRole2('admin', 'staffofficer_full')).toBeTruthy());
test('aplead < admin', () => expect(hasRole2('oplead', 'admin')).toBeFalsy());
test('teamlead >= teamlead', () => expect(hasRole2('teamlead', 'teamlead')).toBeTruthy());

// ── Additional recurStepMs edge cases ────────────────────────────────────────

console.log('\nrecurStepMs — additional');
test('empty string returns null', () => expect(recurStepMs('')).toBe(null));
test('null returns null', () => expect(recurStepMs(null)).toBe(null));
test('15min exact ms', () => expect(recurStepMs('15min')).toBe(900000));
test('4hours in ms', () => expect(recurStepMs('4hours')).toBe(14400000));

// ── Additional date utility edge cases ───────────────────────────────────────

console.log('\nDate utilities — additional');
test('addDays with 0 is identity', () => {
  const d = new Date('2024-06-15');
  expect(addDays(d, 0).getDate()).toBe(15);
});
test('addDays handles leap year Feb 28 + 1 = Feb 29', () => {
  const d = new Date('2024-02-28');
  const r = addDays(d, 1);
  expect(r.getDate()).toBe(29);
  expect(r.getMonth()).toBe(1);
});
test('addMonths with 0 is identity', () => {
  const d = new Date('2024-06-15');
  expect(addMonths(d, 0).getMonth()).toBe(5);
});
test('addMonths wraps to next year', () => {
  const d = new Date('2024-11-01');
  const r = addMonths(d, 3);
  expect(r.getFullYear()).toBe(2025);
  expect(r.getMonth()).toBe(1); // Feb
});
test('startOfDay preserves year/month/day', () => {
  const d = new Date('2024-12-31T23:59:59');
  const s = startOfDay(d);
  expect(s.getFullYear()).toBe(2024);
  expect(s.getMonth()).toBe(11);
  expect(s.getDate()).toBe(31);
  expect(s.getHours()).toBe(0);
  expect(s.getSeconds()).toBe(0);
});

// ── Additional isSameDay edge cases ──────────────────────────────────────────

console.log('\nisSameDay — additional');
test('same timestamp is same day', () => {
  const d = new Date('2024-06-15T12:00:00');
  expect(isSameDay(d, d)).toBeTruthy();
});
test('midnight vs 23:59 is same day', () => {
  expect(isSameDay(new Date('2024-06-15T00:00:00'), new Date('2024-06-15T23:59:59'))).toBeTruthy();
});
test('Dec 31 vs Jan 1 different year is not same day', () => {
  expect(isSameDay(new Date('2024-12-31'), new Date('2025-01-01'))).toBeFalsy();
});

// ── Additional fmtDateInput edge cases ───────────────────────────────────────

console.log('\nfmtDateInput — additional');
test('undefined returns empty string', () => expect(fmtDateInput(undefined)).toBe(''));
test('midnight formats correctly', () => {
  const d = new Date(2024, 0, 1, 0, 0, 0);
  expect(fmtDateInput(d)).toBe('2024-01-01T00:00');
});
test('end of year formats correctly', () => {
  const d = new Date(2024, 11, 31, 23, 59, 0);
  expect(fmtDateInput(d)).toBe('2024-12-31T23:59');
});

// ── Additional daysInMonth edge cases ────────────────────────────────────────

console.log('\ndaysInMonth — additional');
test('March has 31 days', () => expect(daysInMonth(new Date('2024-03-01'))).toBe(31));
test('June has 30 days', () => expect(daysInMonth(new Date('2024-06-01'))).toBe(30));
test('November has 30 days', () => expect(daysInMonth(new Date('2024-11-01'))).toBe(30));
test('February 2100 has 28 days (not a leap year)', () => expect(daysInMonth(new Date('2100-02-01'))).toBe(28));

// ── Additional escICS edge cases ─────────────────────────────────────────────

console.log('\nescICS — additional');
test('caret and pipe are unchanged', () => expect(escICS('a^b|c')).toBe('a^b|c'));
test('tab is unchanged', () => expect(escICS('a\tb')).toBe('a\tb'));
test('windows line ending \\r\\n: \\r unchanged, \\n escaped', () => expect(escICS('a\r\nb')).toBe('a\r\\nb'));
test('double backslash in input', () => expect(escICS('a\\\\b')).toBe('a\\\\\\\\b'));
test('multiple semicolons', () => expect(escICS('a;b;c')).toBe('a\\;b\\;c'));

// ── toICSDate additional ──────────────────────────────────────────────────────

console.log('\ntoICSDate — additional');
test('midnight UTC', () => {
  const d = new Date('2024-01-01T00:00:00Z');
  expect(toICSDate(d)).toBe('20240101T000000Z');
});
test('end of year', () => {
  const d = new Date('2024-12-31T23:59:59Z');
  expect(toICSDate(d)).toBe('20241231T235959Z');
});

// ══════════════════════════════════════════════════════════════════════════════
// ── New test groups: functions not previously covered ────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── escAttr ──────────────────────────────────────────────────────────────────
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

console.log('\nescAttr');
test('empty returns empty', () => expect(escAttr('')).toBe(''));
test('null returns empty', () => expect(escAttr(null)).toBe(''));
test('ampersand escaped', () => expect(escAttr('a & b')).toBe('a &amp; b'));
test('single quote escaped', () => expect(escAttr("it's")).toBe("it&#39;s"));
test('angle brackets escaped', () => expect(escAttr('<div>')).toBe('&lt;div&gt;'));
test('double quote NOT escaped (different from escHtml)', () => expect(escAttr('"hi"')).toBe('"hi"'));
test('combined special chars', () => expect(escAttr("<b class='x'>a & b</b>")).toBe("&lt;b class=&#39;x&#39;&gt;a &amp; b&lt;/b&gt;"));
test('plain text unchanged', () => expect(escAttr('hello world')).toBe('hello world'));

// ── fmtDTG (Date-Time Group format) ─────────────────────────────────────────
function fmtDTG(d) {
  if (!d) return '';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const pad = n => String(n).padStart(2,'0');
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const mon = months[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}${hh}${mm}Z${mon}${yy}`;
}

console.log('\nfmtDTG');
test('null returns empty', () => expect(fmtDTG(null)).toBe(''));
test('formats UTC date correctly', () => {
  const d = new Date('2024-06-15T14:30:00Z');
  expect(fmtDTG(d)).toBe('151430ZJUN24');
});
test('midnight UTC', () => {
  const d = new Date('2024-01-01T00:00:00Z');
  expect(fmtDTG(d)).toBe('010000ZJAN24');
});
test('end of year', () => {
  const d = new Date('2024-12-31T23:59:00Z');
  expect(fmtDTG(d)).toBe('312359ZDEC24');
});
test('single digit day and hour padded', () => {
  const d = new Date('2024-03-05T09:07:00Z');
  expect(fmtDTG(d)).toBe('050907ZMAR24');
});
test('February date', () => {
  const d = new Date('2025-02-28T18:45:00Z');
  expect(fmtDTG(d)).toBe('281845ZFEB25');
});

// ── _fmt24or12 (time formatting) ────────────────────────────────────────────
function _fmt24or12_24h(h, m) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function _fmt24or12_12h(h, m) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

console.log('\n_fmt24or12 (24h mode)');
test('midnight 00:00', () => expect(_fmt24or12_24h(0, 0)).toBe('00:00'));
test('noon 12:00', () => expect(_fmt24or12_24h(12, 0)).toBe('12:00'));
test('afternoon 14:30', () => expect(_fmt24or12_24h(14, 30)).toBe('14:30'));
test('single digit hour padded', () => expect(_fmt24or12_24h(9, 5)).toBe('09:05'));
test('23:59', () => expect(_fmt24or12_24h(23, 59)).toBe('23:59'));

console.log('\n_fmt24or12 (12h mode)');
test('midnight → 12:00 AM', () => expect(_fmt24or12_12h(0, 0)).toBe('12:00 AM'));
test('1am → 1:00 AM', () => expect(_fmt24or12_12h(1, 0)).toBe('1:00 AM'));
test('noon → 12:00 PM', () => expect(_fmt24or12_12h(12, 0)).toBe('12:00 PM'));
test('1pm → 1:00 PM', () => expect(_fmt24or12_12h(13, 0)).toBe('1:00 PM'));
test('11:30pm → 11:30 PM', () => expect(_fmt24or12_12h(23, 30)).toBe('11:30 PM'));
test('11:59am → 11:59 AM', () => expect(_fmt24or12_12h(11, 59)).toBe('11:59 AM'));

// ── getRangeDays (requires state mock) ──────────────────────────────────────
const state = { range: 'week', startDate: new Date('2024-06-01'), exercise: null, resolution: 'hour', preferences: { day_start_hour: 8, day_end_hour: 18 } };
function getRangeDays() {
  switch (state.range) {
    case 'day':     return 1;
    case '2days':   return 2;
    case '3days':   return 3;
    case '4days':   return 4;
    case '5days':   return 5;
    case 'week':    return 7;
    case '2weeks':  return 14;
    case '3weeks':  return 21;
    case 'month':   return daysInMonth(state.startDate);
    case '2months': return daysInMonth(state.startDate) + daysInMonth(addMonths(state.startDate,1));
    default:        return 7;
  }
}

console.log('\ngetRangeDays');
test('day → 1', () => { state.range = 'day'; expect(getRangeDays()).toBe(1); });
test('3days → 3', () => { state.range = '3days'; expect(getRangeDays()).toBe(3); });
test('week → 7', () => { state.range = 'week'; expect(getRangeDays()).toBe(7); });
test('2weeks → 14', () => { state.range = '2weeks'; expect(getRangeDays()).toBe(14); });
test('month for June → 30', () => { state.range = 'month'; state.startDate = new Date('2024-06-01'); expect(getRangeDays()).toBe(30); });
test('month for Feb 2024 (leap) → 29', () => { state.range = 'month'; state.startDate = new Date('2024-02-01'); expect(getRangeDays()).toBe(29); });
test('unknown range → 7 (default)', () => { state.range = 'custom'; expect(getRangeDays()).toBe(7); });
state.range = 'week'; // reset

// ── getSlotMinutes ──────────────────────────────────────────────────────────
function getSlotMinutes() {
  switch (state.resolution) {
    case 'ten':     return 10;
    case 'quarter': return 15;
    case 'hour':    return 60;
    case 'day':     return 1440;
    default:        return 60;
  }
}

console.log('\ngetSlotMinutes');
test('ten → 10', () => { state.resolution = 'ten'; expect(getSlotMinutes()).toBe(10); });
test('quarter → 15', () => { state.resolution = 'quarter'; expect(getSlotMinutes()).toBe(15); });
test('hour → 60', () => { state.resolution = 'hour'; expect(getSlotMinutes()).toBe(60); });
test('day → 1440', () => { state.resolution = 'day'; expect(getSlotMinutes()).toBe(1440); });
test('unknown → 60 (default)', () => { state.resolution = 'xyz'; expect(getSlotMinutes()).toBe(60); });
state.resolution = 'hour'; // reset

// ── isOutOfHours ────────────────────────────────────────────────────────────
function isOutOfHours(slotIdx) {
  if (state.resolution === 'day') return false;
  const min     = slotIdx * getSlotMinutes();
  const startH  = (state.preferences.day_start_hour || 0) * 60;
  const endH    = (state.preferences.day_end_hour   || 24) * 60;
  return min < startH || min >= endH;
}

console.log('\nisOutOfHours');
test('day resolution always false', () => { state.resolution = 'day'; expect(isOutOfHours(0)).toBeFalsy(); state.resolution = 'hour'; });
test('slot at 7:00 (idx 7) before 8:00 start → OOH', () => expect(isOutOfHours(7)).toBeTruthy());
test('slot at 8:00 (idx 8) at start → in hours', () => expect(isOutOfHours(8)).toBeFalsy());
test('slot at 12:00 (idx 12) → in hours', () => expect(isOutOfHours(12)).toBeFalsy());
test('slot at 17:00 (idx 17) → in hours', () => expect(isOutOfHours(17)).toBeFalsy());
test('slot at 18:00 (idx 18) at end → OOH', () => expect(isOutOfHours(18)).toBeTruthy());
test('slot at 23:00 (idx 23) → OOH', () => expect(isOutOfHours(23)).toBeTruthy());

// ── hasRole2 expanded (with full role hierarchy from actual utils.js) ────────
function hasRole2Full(userRole, required) {
  const order = {read:0, reporter:1, readwrite:2, teammember:2, teamlead:3, deputy_teamlead:3, oplead:4, deputy_oplead:4, staffofficer:4, staff_assistant:4, staffofficer_full:4, admin:5};
  return (order[userRole]||0) >= (order[required]||0);
}

console.log('\nhasRole2 — full hierarchy');
test('teammember == readwrite', () => expect(hasRole2Full('teammember', 'readwrite')).toBeTruthy());
test('readwrite == teammember', () => expect(hasRole2Full('readwrite', 'teammember')).toBeTruthy());
test('deputy_teamlead == teamlead', () => expect(hasRole2Full('deputy_teamlead', 'teamlead')).toBeTruthy());
test('deputy_oplead == oplead', () => expect(hasRole2Full('deputy_oplead', 'oplead')).toBeTruthy());
test('staffofficer == oplead', () => expect(hasRole2Full('staffofficer', 'oplead')).toBeTruthy());
test('staff_assistant == oplead', () => expect(hasRole2Full('staff_assistant', 'oplead')).toBeTruthy());
test('staffofficer_full == oplead', () => expect(hasRole2Full('staffofficer_full', 'oplead')).toBeTruthy());
test('staffofficer < admin', () => expect(hasRole2Full('staffofficer', 'admin')).toBeFalsy());
test('teammember < teamlead', () => expect(hasRole2Full('teammember', 'teamlead')).toBeFalsy());
test('admin > all roles', () => {
  for (const r of ['read','reporter','readwrite','teammember','teamlead','oplead','staffofficer','admin']) {
    expect(hasRole2Full('admin', r)).toBeTruthy();
  }
});

// ── getSlotsPerDay ──────────────────────────────────────────────────────────
function getSlotsPerDay() {
  return 1440 / getSlotMinutes();
}

console.log('\ngetSlotsPerDay');
test('10 min → 144 slots', () => { state.resolution = 'ten'; expect(getSlotsPerDay()).toBe(144); state.resolution = 'hour'; });
test('15 min → 96 slots', () => { state.resolution = 'quarter'; expect(getSlotsPerDay()).toBe(96); state.resolution = 'hour'; });
test('60 min → 24 slots', () => { state.resolution = 'hour'; expect(getSlotsPerDay()).toBe(24); });
test('day → 1 slot', () => { state.resolution = 'day'; expect(getSlotsPerDay()).toBe(1); state.resolution = 'hour'; });

// ── _applyTimeSep ──────────────────────────────────────────────────────────
console.log('\n_applyTimeSep (time separator)');
test('dot separator replaces colons', () => {
  const orig = state.preferences;
  state.preferences = { ...orig, time_separator: 'dot' };
  function _getTimeSeparator() { return (state.preferences.time_separator === 'dot') ? '.' : ':'; }
  function _applyTimeSep(str) { if (_getTimeSeparator() === '.') return str.replace(/:/g, '.'); return str; }
  expect(_applyTimeSep('14:30')).toBe('14.30');
  expect(_applyTimeSep('08:05:00')).toBe('08.05.00');
  state.preferences = orig;
});
test('colon separator leaves unchanged', () => {
  function _getTimeSeparator2() { return (state.preferences.time_separator === 'dot') ? '.' : ':'; }
  function _applyTimeSep2(str) { if (_getTimeSeparator2() === '.') return str.replace(/:/g, '.'); return str; }
  expect(_applyTimeSep2('14:30')).toBe('14:30');
});

// ── isCurrentSlot ──────────────────────────────────────────────────────────
console.log('\nisCurrentSlot');
test('current time falls within slot', () => {
  const now = new Date();
  const start = new Date(now.getTime() - 60000);
  const end = new Date(now.getTime() + 60000);
  function isCurrentSlot(s, e) { const n = new Date(); return n >= s && n < e; }
  expect(isCurrentSlot(start, end)).toBeTruthy();
});
test('past slot is not current', () => {
  const now = new Date();
  const start = new Date(now.getTime() - 120000);
  const end = new Date(now.getTime() - 60000);
  function isCurrentSlot(s, e) { const n = new Date(); return n >= s && n < e; }
  expect(isCurrentSlot(start, end)).toBeFalsy();
});

// ── userHasCapability ────────────────────────────────────────────────────────
function userHasCapability(cap) {
  if (!state || !state.user) return false;
  if (state.user.role === 'admin') return true;
  const caps = (state.user.capabilities || []);
  return caps.includes(cap);
}

console.log('\nuserHasCapability');
test('no state.user returns false', () => {
  const saved = state.user;
  delete state.user;
  expect(userHasCapability('edit')).toBeFalsy();
  state.user = saved;
});
test('admin role always true regardless of cap', () => {
  state.user = { role: 'admin', capabilities: [] };
  expect(userHasCapability('anything')).toBeTruthy();
  expect(userHasCapability('nonexistent')).toBeTruthy();
});
test('user with matching capability returns true', () => {
  state.user = { role: 'editor', capabilities: ['edit', 'view'] };
  expect(userHasCapability('edit')).toBeTruthy();
});
test('user without matching capability returns false', () => {
  state.user = { role: 'editor', capabilities: ['view'] };
  expect(userHasCapability('edit')).toBeFalsy();
});
test('empty capabilities array returns false', () => {
  state.user = { role: 'editor', capabilities: [] };
  expect(userHasCapability('edit')).toBeFalsy();
});

// ── stripHTMLTags ────────────────────────────────────────────────────────────
function stripHTMLTags(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]*>/g, '');
}

console.log('\nstripHTMLTags');
test('empty string returns empty', () => expect(stripHTMLTags('')).toBe(''));
test('null returns empty', () => expect(stripHTMLTags(null)).toBe(''));
test('undefined returns empty', () => expect(stripHTMLTags(undefined)).toBe(''));
test('no tags returns unchanged', () => expect(stripHTMLTags('hello world')).toBe('hello world'));
test('simple tag removed', () => expect(stripHTMLTags('<b>bold</b>')).toBe('bold'));
test('nested tags removed', () => expect(stripHTMLTags('<div><span>text</span></div>')).toBe('text'));
test('self-closing tags removed', () => expect(stripHTMLTags('before<br/>after')).toBe('beforeafter'));
test('attributes stripped', () => expect(stripHTMLTags('<a href="x">text</a>')).toBe('text'));
test('script tag content preserved (only tags removed)', () => expect(stripHTMLTags('<script>alert(1)</script>')).toBe('alert(1)'));
test('multiple tags in sequence', () => expect(stripHTMLTags('<p>one</p><p>two</p><p>three</p>')).toBe('onetwothree'));
test('mixed text and tags', () => expect(stripHTMLTags('Hello <b>world</b>!')).toBe('Hello world!'));
test('tag with multiple attributes', () => expect(stripHTMLTags('<div class="a" id="b">content</div>')).toBe('content'));

// ── localDayName ─────────────────────────────────────────────────────────────
function localDayName(d) {
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return names[d.getDay()];
}

console.log('\nlocalDayName');
test('Sunday', () => expect(localDayName(new Date('2024-01-07'))).toBe('Sun'));
test('Monday', () => expect(localDayName(new Date('2024-01-08'))).toBe('Mon'));
test('Tuesday', () => expect(localDayName(new Date('2024-01-09'))).toBe('Tue'));
test('Wednesday', () => expect(localDayName(new Date('2024-01-10'))).toBe('Wed'));
test('Thursday', () => expect(localDayName(new Date('2024-01-11'))).toBe('Thu'));
test('Friday', () => expect(localDayName(new Date('2024-01-12'))).toBe('Fri'));
test('Saturday', () => expect(localDayName(new Date('2024-01-13'))).toBe('Sat'));

// ── isWeekendDay ─────────────────────────────────────────────────────────────
function isWeekendDay(d) {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

console.log('\nisWeekendDay');
test('Saturday is weekend', () => expect(isWeekendDay(new Date('2024-01-13'))).toBeTruthy());
test('Sunday is weekend', () => expect(isWeekendDay(new Date('2024-01-07'))).toBeTruthy());
test('Monday is not weekend', () => expect(isWeekendDay(new Date('2024-01-08'))).toBeFalsy());
test('Tuesday is not weekend', () => expect(isWeekendDay(new Date('2024-01-09'))).toBeFalsy());
test('Wednesday is not weekend', () => expect(isWeekendDay(new Date('2024-01-10'))).toBeFalsy());
test('Thursday is not weekend', () => expect(isWeekendDay(new Date('2024-01-11'))).toBeFalsy());
test('Friday is not weekend', () => expect(isWeekendDay(new Date('2024-01-12'))).toBeFalsy());

// ── synthElapsedHours ────────────────────────────────────────────────────────
function synthElapsedHours(epochMs, nowMs) {
  return Math.floor((nowMs - epochMs) / 3600000);
}

console.log('\nsynthElapsedHours');
test('0 hours elapsed', () => expect(synthElapsedHours(1000, 1000)).toBe(0));
test('1 hour elapsed', () => expect(synthElapsedHours(0, 3600000)).toBe(1));
test('negative hours (before epoch)', () => expect(synthElapsedHours(7200000, 0)).toBe(-2));
test('24 hours = 24', () => expect(synthElapsedHours(0, 24 * 3600000)).toBe(24));
test('fractional hours floor to lower', () => expect(synthElapsedHours(0, 5400000)).toBe(1));
test('just under 1 hour = 0', () => expect(synthElapsedHours(0, 3599999)).toBe(0));
test('48 hours', () => expect(synthElapsedHours(0, 48 * 3600000)).toBe(48));

// ── localShortDate ───────────────────────────────────────────────────────────
function localShortDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
}

console.log('\nlocalShortDate');
test('mid-month date', () => expect(localShortDate(new Date(2024, 5, 15))).toBe('15/06'));
test('single-digit day padded', () => expect(localShortDate(new Date(2024, 0, 5))).toBe('05/01'));
test('single-digit month padded', () => expect(localShortDate(new Date(2024, 2, 1))).toBe('01/03'));
test('Dec 31', () => expect(localShortDate(new Date(2024, 11, 31))).toBe('31/12'));
test('Jan 1', () => expect(localShortDate(new Date(2024, 0, 1))).toBe('01/01'));
test('double-digit month', () => expect(localShortDate(new Date(2024, 10, 22))).toBe('22/11'));

// ── _listWeekLabel ───────────────────────────────────────────────────────────
function _listWeekLabel(d) {
  const _d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  _d.setUTCDate(_d.getUTCDate() + 4 - (_d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(_d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((_d - yearStart) / 86400000 + 1) / 7);
  return ` (W${weekNo})`;
}

console.log('\n_listWeekLabel');
test('Jan 1 2024 (Monday) → W1', () => expect(_listWeekLabel(new Date(2024, 0, 1))).toBe(' (W1)'));
test('Mid-year Jun 15 2024 → W24', () => expect(_listWeekLabel(new Date(2024, 5, 15))).toBe(' (W24)'));
test('End of year Dec 30 2024 → W1 (next year ISO week)', () => expect(_listWeekLabel(new Date(2024, 11, 30))).toBe(' (W1)'));
test('Mar 1 2024 → W9', () => expect(_listWeekLabel(new Date(2024, 2, 1))).toBe(' (W9)'));

// ── Edge cases for existing functions ────────────────────────────────────────

console.log('\naddDays — edge cases');
test('addDays 365 days from Jan 1 2024 (leap year)', () => {
  const d = new Date('2024-01-01');
  const r = addDays(d, 365);
  expect(r.getMonth()).toBe(11); // December
  expect(r.getDate()).toBe(31);
  expect(r.getFullYear()).toBe(2024);
});

console.log('\naddMonths — edge cases');
test('negative months wrapping year: Mar 2024 - 5 months = Oct 2023', () => {
  const d = new Date(2024, 2, 15); // Mar 15 2024
  const r = addMonths(d, -5);
  expect(r.getFullYear()).toBe(2023);
  expect(r.getMonth()).toBe(9); // October
  expect(r.getDate()).toBe(15);
});
test('negative months within same year: Jun - 2 = Apr', () => {
  const d = new Date(2024, 5, 10); // Jun 10
  const r = addMonths(d, -2);
  expect(r.getMonth()).toBe(3); // April
});

console.log('\ndaysInMonth — edge cases');
test('September has 30 days', () => expect(daysInMonth(new Date('2024-09-01'))).toBe(30));
test('July has 31 days', () => expect(daysInMonth(new Date('2024-07-01'))).toBe(31));

console.log('\nfmtFileSize — edge cases');
test('very large: 1 GB', () => expect(fmtFileSize(1024 * 1024 * 1024)).toBe('1024.0 MB'));

console.log('\nhasRole2Full — edge cases');
test('deputy_oplead >= readwrite', () => expect(hasRole2Full('deputy_oplead', 'readwrite')).toBeTruthy());

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.error}`));
  process.exit(1);
} else {
  console.log('All tests passed! ✓');
}
