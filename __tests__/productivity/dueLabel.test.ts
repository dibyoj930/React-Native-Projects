/**
 * Due-date labelling.
 *
 * Separate from `dates.test.ts` even though both concern day keys, because this
 * file exists to pin down one specific piece of arithmetic: the weekday index
 * derived by counting whole days from the Unix epoch. That is easy to get
 * subtly wrong (off by one, wrong anchor weekday, or negative for a pre-epoch
 * day) and impossible to check by reading, so several expectations below are
 * cross-checked against an independent source rather than against the
 * implementation's own logic.
 */

import { formatDueLabel } from '../../productivity/domain';

describe('formatDueLabel — relative offsets', () => {
  it('names today and tomorrow in words', () => {
    expect(formatDueLabel('2026-10-05', '2026-10-05')).toBe('Today');
    expect(formatDueLabel('2026-10-06', '2026-10-05')).toBe('Tomorrow');
  });

  it('names yesterday, because a task can slip past its date', () => {
    expect(formatDueLabel('2026-10-04', '2026-10-05')).toBe('Yesterday');
  });

  it('does not call a distant date "tomorrow" across a month boundary', () => {
    // The obvious off-by-one: if this said Tomorrow, the comparison had become
    // arithmetic on the day-of-month rather than a real day difference.
    expect(formatDueLabel('2026-11-01', '2026-10-31')).toBe('Tomorrow');
    expect(formatDueLabel('2026-11-01', '2026-10-30')).toBe('Sun');
  });

  it('crosses a year boundary', () => {
    expect(formatDueLabel('2027-01-01', '2026-12-31')).toBe('Tomorrow');
    expect(formatDueLabel('2026-12-31', '2027-01-01')).toBe('Yesterday');
    // A year apart is a date, not a relative word — 2026-01-01 is a whole year
    // before 2026-12-31, and calling that "Yesterday" would be nonsense.
    expect(formatDueLabel('2026-01-01', '2026-12-31')).toBe('Jan 1');
  });
});

describe('formatDueLabel — the weekday window', () => {
  it('uses the weekday for the five days between tomorrow and a week out', () => {
    // 2026-10-05 is a Monday. +1 is 'Tomorrow', +2..+6 are weekdays, +7 is a
    // date. Expectations are read off `Date` rather than hand-listed, because a
    // hand-listed sequence of five weekday names is exactly the kind of
    // expectation that is off by one and still looks plausible.
    const window = [2, 3, 4, 5, 6];
    const names = window.map((offset) => {
      const probe = new Date(2026, 9, 5 + offset);
      return `${probe.toLocaleDateString('en-US', { weekday: 'short' })} (offset ${offset})`;
    });
    window.forEach((offset, index) => {
      const due = String(5 + offset).padStart(2, '0');
      expect({ label: formatDueLabel(`2026-10-${due}`, '2026-10-05'), expect: names[index] }).toEqual({
        label: names[index].split(' ')[0],
        expect: names[index],
      });
    });
    // A week out, the weekday would be ambiguous — which "Fri" next month is not.
    expect(formatDueLabel('2026-10-12', '2026-10-05')).toBe('Oct 12');
  });

  it('wraps the week correctly across a Sunday-to-Monday boundary', () => {
    // Sun 2026-10-04 -> Mon 2026-10-05, so Sunday is the last name in the window
    // and Monday does not appear in it at all.
    expect(formatDueLabel('2026-10-11', '2026-10-05')).toBe('Sun');
    expect(formatDueLabel('2026-10-06', '2026-10-04')).toBe('Tue');
  });

  it('handles a leap day without shifting the weekday', () => {
    // 2024-02-29 was a Thursday, so +1 is 'Tomorrow' and +2 is Saturday. If the
    // day arithmetic treated 29 February as an ordinary day it would drift here.
    expect(formatDueLabel('2024-03-01', '2024-02-29')).toBe('Tomorrow');
    expect(formatDueLabel('2024-03-02', '2024-02-29')).toBe('Sat');
  });
});

describe('formatDueLabel — the weekday anchor is right', () => {
  it('agrees with Date across a whole month, for every offset from -30 to +30', () => {
    // Independent cross-check. `Date` is unsafe for *deciding* what local day a
    // key names, but for a weekday number it only needs a well-formed local
    // constructor, and here both sides are given the same explicit Y/M/D. If the
    // epoch anchor were off by one, this loop would disagree on all 61 cases.
    let mismatches = 0;
    for (let offset = -30; offset <= 30; offset += 1) {
      const probe = new Date(2026, 9, 5);
      probe.setDate(probe.getDate() + offset);
      const y = probe.getFullYear();
      const m = String(probe.getMonth() + 1).padStart(2, '0');
      const d = String(probe.getDate()).padStart(2, '0');
      const dueKey = `${y}-${m}-${d}`;
      const todayKey = '2026-10-05';

      // Only the six-day window produces a weekday; outside it the date wins.
      if (offset < 2 || offset > 6) continue;
      const expected = probe.toLocaleDateString('en-US', { weekday: 'short' });
      expect(formatDueLabel(dueKey, todayKey)).toBe(expected);
      if (formatDueLabel(dueKey, todayKey) !== expected) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });

  it('does not go negative for a day before 1970', () => {
    // The `%` in the implementation is guarded with `+ 7` precisely so this case
    // cannot wrap into a plausible-looking weekday index. `today` has to be far
    // enough back that `daysBetween('1970-01-01', dueDate) + 4` is negative:
    // 1969-12-23 is 9 days before the epoch, so the unguarded sum is -5 and
    // `WEEKDAYS[-5]` is `undefined`. 1969-12-23 was a Tuesday.
    expect(formatDueLabel('1969-12-23', '1969-12-20')).toBe('Tue');
    // One nearer the epoch, where the sum is already positive, still agrees.
    expect(formatDueLabel('1969-12-31', '1969-12-28')).toBe('Wed');
  });
});

describe('formatDueLabel — far and past dates', () => {
  it('falls back to the date past a week', () => {
    expect(formatDueLabel('2026-12-25', '2026-10-05')).toBe('Dec 25');
  });

  it('keeps a plain date for anything already past', () => {
    expect(formatDueLabel('2026-09-20', '2026-10-05')).toBe('Sep 20');
    expect(formatDueLabel('2026-09-04', '2026-10-05')).toBe('Sep 4');
    // A month old: no "overdue" wording, because the app has no status concept
    // for it and inventing one here would be a quiet extra rule.
    expect(formatDueLabel('2026-09-05', '2026-10-05')).toBe('Sep 5');
  });

  it('shows a month boundary unambiguously', () => {
    // Bare day numbers would give 'Mar 1 – Feb 28' the same shape as 'Mar 1 – 28'.
    expect(formatDueLabel('2026-03-01', '2026-02-20')).toBe('Mar 1');
  });
});

describe('formatDueLabel — bad input', () => {
  it('returns an empty string rather than rendering nonsense', () => {
    expect(formatDueLabel('nonsense', '2026-10-05')).toBe('');
    expect(formatDueLabel('2026-13-01', '2026-10-05')).toBe('');
    expect(formatDueLabel('2026-10-32', '2026-10-05')).toBe('');
    expect(formatDueLabel('2026-1-5', '2026-10-05')).toBe('');
    expect(formatDueLabel('', '2026-10-05')).toBe('');
  });

  it('rejects a bad "today" too, since both arguments must be trusted', () => {
    // Asymmetric handling here would mean one malformed key produced a label and
    // the other silently did not — which is the kind of difference nobody notices
    // until a row renders a date nobody set.
    expect(formatDueLabel('2026-10-06', 'garbage')).toBe('');
    expect(formatDueLabel('2026-10-06', '2026-99-99')).toBe('');
  });
});