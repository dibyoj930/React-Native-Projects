import type { DayKey } from './types';

/**
 * Local-calendar day keys.
 *
 * Every day boundary in this app is *local*. `toISOString()` is deliberately
 * absent from this file: it converts to UTC, so a task completed at 9pm in
 * IST (UTC+5:30) lands on the previous day key and silently corrupts daily
 * rollups, streaks and the momentum graph. That exact bug already exists in
 * `exportTodos`, which uses `exportedAt.slice(0, 10)` for its filename.
 *
 * Keys are `YYYY-MM-DD`, which sorts lexicographically in chronological order —
 * so plain string comparison is a valid date comparison.
 */

/** Epoch ms -> local `YYYY-MM-DD`. */
export function localDateKey(timestamp: number): DayKey {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a day key back to a Date pinned at local noon.
 *
 * Noon is not arbitrary: `setDate` does local-calendar arithmetic, and anchoring
 * at the middle of the day means a DST transition (±1h) can never push the
 * anchor across midnight and skip or repeat a day.
 *
 * Exported because a `DateTimePicker` demands a `Date` as its value, which makes
 * this the inverse of `localDateKey` and the one place a day key has to become an
 * instant. It is exported rather than reimplemented at the call site because the
 * obvious one-liner is wrong: `new Date('2026-03-06')` parses as UTC midnight,
 * which in any negative-offset zone is the *previous* local day — a picker seeded
 * that way displays the day before the one it was asked for, and the user confirms
 * the wrong date.
 */
export function localDateFromDayKey(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

const keyToNoonDate = localDateFromDayKey;

/** Shifts a day key by whole local calendar days. Handles month and year rollover. */
export function addDays(key: DayKey, delta: number): DayKey {
  const date = keyToNoonDate(key);
  date.setDate(date.getDate() + delta);
  return localDateKey(date.getTime());
}

/** Whole local days from `a` to `b`. Positive when `b` is later. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((keyToNoonDate(b).getTime() - keyToNoonDate(a).getTime()) / msPerDay);
}

/**
 * Epoch ms of the first instant of the local day containing `timestamp`.
 *
 * Local midnight, never `timestamp - timestamp % 86400000`: the UTC-based
 * version is wrong by the zone offset for most of the world.
 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Every day key from `from` to `to` inclusive. Empty when `to` precedes `from`. */
export function dayKeyRange(from: DayKey, to: DayKey): DayKey[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const days: DayKey[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    days.push(addDays(from, offset));
  }
  return days;
}

/**
 * Shifts a day key by whole years.
 *
 * Exists because `Date.setFullYear` is not usable for this: called on 29 February
 * in a non-leap target year, it rolls over to 1 March, so the picker's maximum
 * date would land a day *earlier* than intended and the app would quietly refuse
 * a due date a user could reasonably pick.
 *
 * Written on the key string rather than on a `Date` for the same reason
 * `formatDayRange` is: the year field can be replaced without the caller having to
 * think about what time of day the `Date` happened to be anchored at.
 */
export function addYears(key: DayKey, years: number): DayKey {
  const year = Number(key.slice(0, 4)) + years;
  const rest = key.slice(4);
  if (rest === '-02-29' && !isLeapYear(year)) {
    // 29 February does not exist in the target year. The 28th is the nearest real
    // day before it, so the range ends on the day the user meant rather than
    // skipping to March.
    return `${year}-02-28`;
  }
  return `${year}${rest}`;
}

/** Proleptic Gregorian leap year. Matches `Date`'s own rule for the years JS can hold. */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** The day key for today, local calendar. Convenience for filters that need it. */
export function todayKey(): DayKey {
  return localDateKey(Date.now());
}

/** `'YYYY-MM-DD'`, exactly. Nothing looser is accepted. */
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether a value is a usable day key.
 *
 * Day keys reach the app from two untrusted directions: a `DateTimePicker`
 * result, and whatever is sitting in AsyncStorage. AsyncStorage is
 * user-writable on a jailbroken device, so a stored task can carry a key that
 * never came out of `localDateKey`.
 *
 * Shape-checking rather than calendar-checking on purpose. This answers "is this
 * shaped like a day key", which is what a caller needs in order to decide
 * whether to *keep* a stored value. It is deliberately not `Date`-based:
 * `new Date('2025-02-30')` silently rolls over to 2 March, so a validity check
 * built on `Date` would accept a key that names a day which does not exist and
 * disagree with the calendar the rest of this file builds.
 */
export function isValidDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const match = DAY_KEY_PATTERN.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}
