/**
 * Wall-clock time stored on a task, as local `'HH:mm'`.
 *
 * A time is not a day key. A day key is a calendar day with no instant; a time
 * is a point on the clock with no date of its own. They are stored as two fields
 * — `dueDate` and `dueTime` — and only combine into an instant when a reminder
 * needs scheduling, so neither has to pretend to be the other.
 *
 * Kept as a string rather than an epoch for the reason `dateKey.ts` keeps day
 * keys as strings: a stored wall-clock time never goes stale across a timezone
 * change, and it stays readable in storage and in an export.
 *
 * Pure: no React, no React Native, so a test of this file needs no renderer.
 */

/** A local wall-clock time, `'HH:mm'` (24-hour). */
export type TimeKey = string;

/** Exactly `'HH:mm'`, 24-hour. Nothing looser is accepted. */
const TIME_KEY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Whether a value is a usable time key.
 *
 * Storage is user-writable, so a task can carry a time that never came out of
 * `timeKeyFromDate`. Shape-checking is enough here: a malformed value costs the
 * field, never the task.
 */
export function isValidTimeKey(value: unknown): value is TimeKey {
  return typeof value === 'string' && TIME_KEY_PATTERN.test(value);
}

/** Local `'HH:mm'` for a `Date`, zero-padded to two digits each. */
export function timeKeyFromDate(date: Date): TimeKey {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 12-hour clock label, e.g. `'2:30 PM'`.
 *
 * Formatted by hand rather than through `toLocaleTimeString`, so the output does
 * not depend on the host's locale or ICU data. The sheet is English throughout,
 * and a test can assert an exact string instead of tolerating a range.
 *
 * Returns `''` for anything that is not a time key, which callers treat as "no
 * time to show" — the same way `formatDueLabel` returns `''` for a bad day.
 */
export function formatTimeLabel(key: unknown): string {
  if (!isValidTimeKey(key)) return '';
  const [hours, minutes] = key.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
}
