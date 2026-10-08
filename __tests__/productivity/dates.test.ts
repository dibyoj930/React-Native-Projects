/**
 * Day-key validation and local-calendar conversion.
 *
 * Separate from `domain.test.ts` because this file guards a specific hazard:
 * UTC. Everything here is about a day key naming the day the *user* meant, on
 * the device they are standing in. A test that ran only in UTC would pass while
 * the bug it exists to prevent shipped to every negative-offset timezone.
 *
 * The timezone is pinned to Asia/Kolkata (UTC+5:30, no DST) in `jest.setup.js`,
 * not here — `import` declarations are hoisted above any statement in this file,
 * so assigning `process.env.TZ` locally would run after the module under test
 * had already been evaluated.
 */

import {
  addDays,
  addYears,
  daysBetween,
  isValidDayKey,
  localDateFromDayKey,
  localDateKey,
  startOfDay,
} from '../../productivity/domain';

describe('the timezone this file runs under', () => {
  it('is really pinned to UTC+5:30', () => {
    // Guards the guard. If the `jest.setup.js` pin ever stopped taking effect —
    // moved into a test file, where hoisted imports would defeat it, say — every
    // UTC assertion below would quietly pass in the developer's own timezone and
    // stop testing anything. Better to fail loudly.
    expect(new Date(2026, 9, 5).getTimezoneOffset()).toBe(-330);
  });
});

describe('isValidDayKey', () => {
  it('accepts a well-formed day key', () => {
    expect(isValidDayKey('2026-10-05')).toBe(true);
    expect(isValidDayKey('2024-02-29')).toBe(true);
    expect(isValidDayKey('2026-01-01')).toBe(true);
    expect(isValidDayKey('2026-12-31')).toBe(true);
  });

  it('rejects anything that is not exactly YYYY-MM-DD', () => {
    // The picker and `localDateKey` both emit zero-padded months and days, so
    // an unpadded value could only come from hand-edited storage.
    expect(isValidDayKey('2026-1-5')).toBe(false);
    expect(isValidDayKey('26-10-05')).toBe(false);
    expect(isValidDayKey('2026/10/05')).toBe(false);
    expect(isValidDayKey('2026-10-05T00:00:00Z')).toBe(false);
    expect(isValidDayKey(' 2026-10-05')).toBe(false);
    expect(isValidDayKey('2026-10-05 ')).toBe(false);
    expect(isValidDayKey('')).toBe(false);
  });

  it('rejects impossible months and days', () => {
    expect(isValidDayKey('2026-13-01')).toBe(false);
    expect(isValidDayKey('2026-00-10')).toBe(false);
    expect(isValidDayKey('2026-10-00')).toBe(false);
    expect(isValidDayKey('2026-10-32')).toBe(false);
    expect(isValidDayKey('2026-10-99')).toBe(false);
  });

  it('rejects non-strings rather than coercing them', () => {
    // Storage can hold anything JSON can express. `null` and `0` are the shapes
    // a naive `if (legacy.dueDate)` guard would let through.
    expect(isValidDayKey(null)).toBe(false);
    expect(isValidDayKey(undefined)).toBe(false);
    expect(isValidDayKey(0)).toBe(false);
    expect(isValidDayKey(20261005)).toBe(false);
    expect(isValidDayKey(true)).toBe(false);
    expect(isValidDayKey(['2026-10-05'])).toBe(false);
    expect(isValidDayKey({ day: '2026-10-05' })).toBe(false);
  });
});

describe('localDateKey', () => {
  it('names the local day, never the UTC one', () => {
    // 20:00 in IST is 14:30 UTC on the same day; 02:00 IST is 20:30 UTC on the
    // *previous* day. `toISOString().slice(0, 10)` gets the second one wrong.
    expect(localDateKey(new Date(2026, 9, 5, 20, 0, 0).getTime())).toBe('2026-10-05');
    expect(localDateKey(new Date(2026, 9, 5, 2, 0, 0).getTime())).toBe('2026-10-05');
  });

  it('resolves a bare UTC instant to the day the user is standing in', () => {
    // 2026-10-05T18:30:00Z is 2026-10-06 00:00 in IST — the next calendar day.
    const lateUtc = Date.UTC(2026, 9, 5, 18, 30, 0);
    expect(new Date(lateUtc).toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(localDateKey(lateUtc)).toBe('2026-10-06');
  });

  it('zero-pads months and days', () => {
    expect(localDateKey(new Date(2026, 0, 5, 12, 0, 0).getTime())).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 8, 9, 12, 0, 0).getTime())).toBe('2026-09-09');
  });

  it('is exactly the inverse of what isValidDayKey accepts', () => {
    // Anything this function produces must survive validation, or a task saved
    // today could fail to load back tomorrow.
    const key = localDateKey(new Date(2026, 9, 5, 12, 0, 0).getTime());
    expect(isValidDayKey(key)).toBe(true);
  });
});

describe('startOfDay', () => {
  it('is local midnight, not midnight UTC', () => {
    const noon = new Date(2026, 9, 5, 12, 0, 0).getTime();
    const start = new Date(startOfDay(noon));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    // The UTC-based shortcut `timestamp - timestamp % 86400000` would land here
    // in UTC, i.e. 05:30 the previous day in IST.
    expect(localDateKey(startOfDay(noon))).toBe('2026-10-05');
  });
});

describe('addDays across boundaries', () => {
  it('rolls months over', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('rolls years over', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day in both directions', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    // 2026 is not a leap year, so the same walk must skip 29 February entirely.
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('always lands on a valid day key', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 800; i += 1) {
      key = addDays(key, 1);
      expect(isValidDayKey(key)).toBe(true);
    }
  });
});

describe('localDateFromDayKey', () => {
  it('is the exact inverse of localDateKey', () => {
    // The picker's value comes from here and the stored key comes back out via
    // `localDateKey`, so a round-trip mismatch would silently move every date a
    // user picks.
    const days = ['2026-10-05', '2026-01-01', '2026-12-31', '2024-02-29', '2026-03-01'];
    days.forEach((day) => {
      expect(localDateKey(localDateFromDayKey(day).getTime())).toBe(day);
    });
  });

  it('lands on the named local day, not the day before', () => {
    // The reason this function exists. A date picker seeded from `new Date(key)`
    // shows the user whatever local day that UTC midnight falls on, which is the
    // previous day in every negative-offset zone — and the user confirms it.
    //
    // The three component assertions are the whole invariant: they are what the
    // picker renders. Note that under this file's pinned +05:30 zone,
    // `new Date('2026-03-06')` would coincidentally also be the 6th, so a
    // side-by-side comparison against it would pass here while the bug shipped to
    // the Americas. Asserting the components is zone-independent.
    const parsed = localDateFromDayKey('2026-03-06');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(6);
  });

  it('anchors at local noon, so no DST shift can cross a day boundary', () => {
    // A midnight anchor plus a ±1h transition can land on the neighbouring day,
    // which would make `daysBetween` skip or repeat a day. Noon cannot.
    expect(localDateFromDayKey('2026-03-08').getHours()).toBe(12);
    // 8 March 2026 is a DST transition in several zones.
    expect(localDateKey(localDateFromDayKey('2026-03-08').getTime())).toBe('2026-03-08');
    expect(localDateKey(localDateFromDayKey('2026-11-01').getTime())).toBe('2026-11-01');
  });
});

describe('addYears', () => {
  it('shifts the year and keeps the month and day', () => {
    expect(addYears('2026-10-05', 5)).toBe('2031-10-05');
    expect(addYears('2026-10-05', -1)).toBe('2025-10-05');
  });

  it('keeps a leap day when the target year is also a leap year', () => {
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('clamps to the 28th when the target year has no 29 February', () => {
    // `Date.setFullYear` here would roll forward to 1 March, so a picker's maximum
    // date would land a day earlier than intended and refuse a date the user could
    // reasonably want. 2025 and 2100 are both non-leap; 2025 is not divisible by 4,
    // 2100 is divisible by 4 but is a century year.
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 76)).toBe('2100-02-28');
    // 2000 is divisible by 400, so it *is* a leap year.
    expect(addYears('2024-02-29', -24)).toBe('2000-02-29');
  });

  it('leaves every other day alone', () => {
    expect(addYears('2024-02-28', 1)).toBe('2025-02-28');
    expect(addYears('2024-03-01', 1)).toBe('2025-03-01');
  });

  it('always produces a valid day key', () => {
    let key = '2024-02-29';
    for (let i = 0; i < 40; i += 1) {
      key = addYears(key, 1);
      expect(isValidDayKey(key)).toBe(true);
    }
  });
});

describe('daysBetween', () => {
  it('counts whole local days and signs the direction', () => {
    expect(daysBetween('2026-10-01', '2026-10-06')).toBe(5);
    expect(daysBetween('2026-10-06', '2026-10-01')).toBe(-5);
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
  });

  it('is unaffected by a DST transition because keys carry no time', () => {
    // A +/-1h shift cannot change a calendar-day difference when both endpoints
    // are day keys, which is the property that makes keys safe to store.
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });
});

describe('future filtering', () => {
  it('sorts and buckets by plain string comparison', () => {
    // The reason `dueDate` is a day key rather than an epoch: no Date parsing,
    // no timezone, no off-by-one at the boundary.
    const dates = ['2026-10-05', '2026-09-30', '2026-10-01', '2026-11-01'];
    expect([...dates].sort()).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-05',
      '2026-11-01',
    ]);
    const today = '2026-10-05';
    expect(dates.filter((d) => d >= today)).toEqual(['2026-10-05', '2026-11-01']);
    expect(dates.filter((d) => d < today)).toEqual(['2026-09-30', '2026-10-01']);
  });
});