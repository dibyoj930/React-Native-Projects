/**
 * Presentation formatting, kept pure.
 *
 * These live outside the components on purpose: "1h 42m" versus "1:42" versus
 * "102 min" is a decision, and a decision that can be tested. Previously the
 * formatting helpers were private functions inside a component, which meant the
 * only way to check them was to render something.
 *
 * No React Native imports, so this stays inside the layer's no-mocks boundary and
 * is reachable from `domain.ts`.
 */

import { daysBetween } from './dateKey';

/**
 * A duration in seconds as something a person would say.
 *
 * `1h 42m`, `45m`, `0m`. Seconds are deliberately dropped below a minute: focus
 * time is counted in minutes, and showing "8s" implies a precision the underlying
 * data does not have.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * A duration in hours as something a person would say.
 *
 * Used for the idle hint, where the number is large and vague ("3h", "2d")
 * because the point is roughly how long you were away.
 */
export function formatElapsed(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 min';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** Progress as a 0..1 fraction, clamped and guarded against a zero or bad goal. */
export function progressRatio(value: number, goal: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(1, Math.max(0, value / goal));
}

/**
 * Month names, indexed by month number.
 *
 * Spelled out rather than pulled from `Date`, because `Date` would need a
 * timezone to interpret a `YYYY-MM-DD` day key and this layer has no business
 * having one. `new Date('2025-03-06')` parses as UTC midnight, which in any
 * negative-offset zone is the *previous* local day — a bug already documented
 * in `exportTodos`, which has the same mistake and is still unfixed.
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

type ParsedDayKey = { month: number; dayOfMonth: number };

function parseDayKey(day: string): ParsedDayKey | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const dayOfMonth = Number(match[3]);
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;
  return { month, dayOfMonth };
}

/**
 * The span a day-wise chart covers, as `Feb 21 – Mar 6`.
 *
 * A 14-day window routinely straddles a month boundary, and the bars are
 * labelled with bare day numbers because 14 columns are too narrow for anything
 * longer. That leaves `28 1 2` ambiguous: nothing says which month the `1` is in.
 * Naming the range once under the chart anchors all fourteen labels without
 * making any of them wider.
 *
 * When both ends are the same month the month is named once, not twice:
 * `Mar 2 – 6`. An unparseable day key yields an empty string rather than `NaN`
 * or a crash.
 */
export function formatDayRange(newestDay: string, oldestDay: string): string {
  const newest = parseDayKey(newestDay);
  const oldest = parseDayKey(oldestDay);
  if (!newest || !oldest) return '';

  // Month first, as ranges are conventionally written: `Mar 2 – 6`, never
  // `2 – Mar 6`. When both ends fall in one month it is named once, on the left.
  const oldestLabel = `${MONTHS[oldest.month - 1]} ${oldest.dayOfMonth}`;
  const newestLabel =
    newest.month === oldest.month && newest.dayOfMonth !== oldest.dayOfMonth
      ? String(newest.dayOfMonth)
      : `${MONTHS[newest.month - 1]} ${newest.dayOfMonth}`;

  return `${oldestLabel} – ${newestLabel}`;
}

/** `"1 of 3"`, with the noun left to the caller so it can agree in number. */
export function formatCount(value: number, noun: string): string {
  return `${Math.max(0, Math.round(value))} ${noun}${value === 1 ? '' : 's'}`;
}

/**
 * Weekday names, Sunday first, because that is what `daysFromEpoch % 7` lands on.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * How many whole days after 1970-01-01 a day key falls, then its weekday.
 *
 * The anchor is `1970-01-01` itself, which was a Thursday — index 4 with Sunday
 * at zero. Counting whole days from it rather than asking `Date` is the whole
 * point: a `Date` asked for a weekday has to be constructed, and the only
 * constructors available take a timezone, which is the exact ambiguity
 * `formatDayRange` above exists to avoid.
 */
function weekdayIndexFor(day: string): number | null {
  if (!parseDayKey(day)) return null;
  const offset = daysBetween('1970-01-01', day);
  // `+ 7` before the modulo so a pre-epoch day cannot land negative and wrap.
  return ((offset + 4) % 7 + 7) % 7;
}

/** A day key as `Mar 6`. Empty string if unparseable. */
function formatShortDate(day: string): string {
  const parsed = parseDayKey(day);
  if (!parsed) return '';
  return `${MONTHS[parsed.month - 1]} ${parsed.dayOfMonth}`;
}

/**
 * A task's due date as the shortest thing that is still unambiguous.
 *
 * `Today` and `Tomorrow` are what the user actually needs at the two offsets
 * where a date is work to interpret. Just past that, the weekday wins over the
 * date — `Fri` is more useful than `Mar 6` for a task three days out. Beyond a
 * week the weekday stops helping, because "Fri" next month is meaningless, so it
 * falls back to the date.
 *
 * Anything already past keeps its plain date. Past due is arguably worth calling
 * out, but that is a status this app does not otherwise have, and inventing one
 * here would be the kind of quiet extra concept the brief asked to avoid.
 *
 * Both arguments are day keys and are compared by string arithmetic throughout,
 * so no timezone can shift the result. Returns `''` for an unparseable key, which
 * callers treat as "render no date line" rather than as an error.
 */
export function formatDueLabel(dueDate: string, today: string): string {
  if (!parseDayKey(dueDate) || !parseDayKey(today)) return '';
  const offset = daysBetween(today, dueDate);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  if (offset > 1 && offset <= 6) {
    const index = weekdayIndexFor(dueDate);
    return index === null ? '' : WEEKDAYS[index];
  }
  return formatShortDate(dueDate);
}