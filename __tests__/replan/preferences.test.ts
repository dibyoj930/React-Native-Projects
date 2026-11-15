/**
 * Replan preferences: defaults, repair and the workday window.
 *
 * The store is user-writable, so `sanitizeReplanPreferences` has to make a hostile
 * or half-written object safe without throwing and without losing the good fields.
 */

import {
  DEFAULT_REPLAN_PREFERENCES,
  parseClockMinutes,
  resolveWorkday,
  sanitizeReplanPreferences,
} from '../../replan/preferences';

describe('DEFAULT_REPLAN_PREFERENCES', () => {
  it('ships a 9-to-6 day with a 10-minute buffer and one 15-minute break', () => {
    expect(DEFAULT_REPLAN_PREFERENCES).toEqual({
      workdayStart: '09:00',
      workdayEnd: '18:00',
      bufferMinutes: 10,
      breakMinutes: 15,
      breakAfterMinutes: 60,
      mode: 'fit',
      lowPriorityDeferral: false,
      notifyPlannedStarts: false,
    });
  });
});

describe('parseClockMinutes', () => {
  it('turns a time key into minutes since midnight', () => {
    expect(parseClockMinutes('00:00')).toBe(0);
    expect(parseClockMinutes('09:30')).toBe(570);
    expect(parseClockMinutes('16:00')).toBe(960);
    expect(parseClockMinutes('23:59')).toBe(1439);
  });

  it('returns NaN for a malformed key', () => {
    expect(Number.isNaN(parseClockMinutes('25:00'))).toBe(true);
    expect(Number.isNaN(parseClockMinutes('nope'))).toBe(true);
  });
});

describe('resolveWorkday', () => {
  it('combines the day and both times into local epoch bounds', () => {
    const workday = resolveWorkday('2026-05-04', '09:00', '18:00');
    expect(workday).toEqual({
      start: new Date(2026, 4, 4, 9, 0, 0, 0).getTime(),
      end: new Date(2026, 4, 4, 18, 0, 0, 0).getTime(),
    });
  });

  it('returns an empty window when the end is not after the start', () => {
    const workday = resolveWorkday('2026-05-04', '18:00', '09:00');
    expect(workday.start).toBe(workday.end);
  });

  it('falls back to the default time for an invalid key', () => {
    const workday = resolveWorkday('2026-05-04', 'nope', '18:00');
    expect(workday.start).toBe(new Date(2026, 4, 4, 9, 0, 0, 0).getTime());
  });
});

describe('sanitizeReplanPreferences', () => {
  it('returns the defaults for a non-object', () => {
    expect(sanitizeReplanPreferences(null)).toEqual(DEFAULT_REPLAN_PREFERENCES);
    expect(sanitizeReplanPreferences('nope')).toEqual(DEFAULT_REPLAN_PREFERENCES);
  });

  it('keeps good fields and repairs only the bad ones', () => {
    const repaired = sanitizeReplanPreferences({
      workdayStart: '08:00',
      workdayEnd: 'not a time',
      bufferMinutes: 20,
      breakMinutes: -5,
      breakAfterMinutes: 90,
      mode: 'protect',
      lowPriorityDeferral: true,
    });
    expect(repaired).toEqual({
      ...DEFAULT_REPLAN_PREFERENCES,
      workdayStart: '08:00',
      bufferMinutes: 20,
      breakAfterMinutes: 90,
      mode: 'protect',
      lowPriorityDeferral: true,
    });
  });

  it('rejects out-of-range and non-integer minute values', () => {
    const repaired = sanitizeReplanPreferences({
      bufferMinutes: 10_000,
      breakMinutes: 12.5,
      breakAfterMinutes: -1,
    });
    expect(repaired.bufferMinutes).toBe(DEFAULT_REPLAN_PREFERENCES.bufferMinutes);
    expect(repaired.breakMinutes).toBe(DEFAULT_REPLAN_PREFERENCES.breakMinutes);
    expect(repaired.breakAfterMinutes).toBe(DEFAULT_REPLAN_PREFERENCES.breakAfterMinutes);
  });

  it('coerces an unknown mode to fit', () => {
    expect(sanitizeReplanPreferences({ mode: 'chaos' }).mode).toBe('fit');
  });

  it('treats a truthy non-boolean toggle as off', () => {
    expect(sanitizeReplanPreferences({ lowPriorityDeferral: 'yes' }).lowPriorityDeferral).toBe(
      false,
    );
  });
});
