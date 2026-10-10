/**
 * `formatWeekday` — the label under each focus bar.
 *
 * The chart used to print the day of the month (`4`), which is unique but says
 * nothing about *when*. Seven consecutive days are seven distinct weekday names,
 * so the name is both unique across the window and the thing a person reads a
 * week by. The arithmetic is the same timezone-free count `formatDueLabel` uses,
 * so an off-by-one weekday is a real failure rather than a platform quirk — and
 * the cross-check below proves the anchor against the platform clock, the same
 * way the due-date tests do.
 */

import { formatWeekday } from '../../productivity/domain';

describe('formatWeekday', () => {
  it('names the weekday, Sunday first', () => {
    // 2026-10-05 is a Monday.
    expect(formatWeekday('2026-10-05')).toBe('Mon');
    expect(formatWeekday('2026-10-06')).toBe('Tue');
    expect(formatWeekday('2026-10-11')).toBe('Sun');
  });

  it('agrees with the platform clock across a year', () => {
    for (let offset = 0; offset < 366; offset += 1) {
      const date = new Date(2026, 0, 1 + offset);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const key = `${date.getFullYear()}-${month}-${day}`;
      const expected = date.toLocaleDateString('en-US', { weekday: 'short' });
      expect(formatWeekday(key)).toBe(expected);
    }
  });

  it('returns an empty string for a malformed key', () => {
    expect(formatWeekday('not-a-day')).toBe('');
    expect(formatWeekday('')).toBe('');
  });
});
