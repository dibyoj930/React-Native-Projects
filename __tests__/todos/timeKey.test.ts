/**
 * Wall-clock time keys.
 *
 * These are pure string helpers, so the suite needs no renderer. The tests pin
 * the shape-checking (`'HH:mm'`, 24-hour) and the deterministic 12-hour label,
 * because both are user-visible: a malformed key must cost only the field, and
 * the label must read the same regardless of the host's locale or ICU data.
 */

import { formatTimeLabel, isValidTimeKey, timeKeyFromDate } from '../../todos/timeKey';

describe('isValidTimeKey', () => {
  it.each(['00:00', '09:05', '12:00', '23:59'])('accepts %p', (value) => {
    expect(isValidTimeKey(value)).toBe(true);
  });

  it.each([
    ['24:00', 'hour out of range'],
    ['9:05', 'unpadded hour'],
    ['23:60', 'minute out of range'],
    ['14:3', 'unpadded minute'],
    ['2:30 PM', 'a formatted label, not a key'],
    ['', 'empty'],
  ])('rejects %p (%s)', (value) => {
    expect(isValidTimeKey(value)).toBe(false);
  });

  it.each([null, undefined, 0, 42, true, [], {}])(
    'rejects the non-string value %p',
    (value) => {
      expect(isValidTimeKey(value)).toBe(false);
    },
  );
});

describe('timeKeyFromDate', () => {
  it('pads the hour and minute to two digits', () => {
    expect(timeKeyFromDate(new Date(2026, 4, 4, 9, 5))).toBe('09:05');
    expect(timeKeyFromDate(new Date(2026, 4, 4, 0, 0))).toBe('00:00');
    expect(timeKeyFromDate(new Date(2026, 4, 4, 23, 59))).toBe('23:59');
  });
});

describe('formatTimeLabel', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['00:30', '12:30 AM'],
    ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'],
    ['13:05', '1:05 PM'],
    ['23:59', '11:59 PM'],
  ])('renders %p as %p', (key, label) => {
    expect(formatTimeLabel(key)).toBe(label);
  });

  it('renders a malformed key as nothing rather than throwing', () => {
    expect(formatTimeLabel('nonsense')).toBe('');
    expect(formatTimeLabel(undefined)).toBe('');
  });
});
