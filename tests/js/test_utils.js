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
