/**
 * Replanning preferences: defaults, validation and time helpers.
 *
 * Pure: no React, no RN, no storage. Mirrors daily-goals/goals.ts — a plain model
 * plus a `sanitize*` repair whose job is to make a user-writable store safe. The
 * persistence boundary is replan/planStorage.ts.
 */

import type { DayKey } from '../productivity/domain';
import { localDateFromDayKey } from '../productivity/domain';
import { isValidTimeKey, type TimeKey } from '../todos/timeKey';
import type { ReplanPreferences, ReplanningMode, Workday } from './types';

/** A day of replanning before the user has touched anything. */
export const DEFAULT_REPLAN_PREFERENCES: ReplanPreferences = {
  workdayStart: '09:00',
  workdayEnd: '18:00',
  bufferMinutes: 10,
  breakMinutes: 15,
  breakAfterMinutes: 60,
  mode: 'fit',
  lowPriorityDeferral: false,
  notifyPlannedStarts: false,
};

/** Upper bounds that keep a user-typed number from producing a silly schedule. */
const MAX_BUFFER_MINUTES = 120;
const MAX_BREAK_MINUTES = 240;
const MAX_BREAK_AFTER_MINUTES = 480;

/** Non-negative integer within a bound, or the fallback. Fractions are invalid. */
function sanitizeMinutes(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  if (value < 0 || value > max) return fallback;
  return value;
}

function sanitizeMode(value: unknown): ReplanningMode {
  return value === 'protect' ? 'protect' : 'fit';
}

/**
 * Field-by-field repair for a preferences object that came out of storage.
 *
 * Storage is user-writable, so every field is repaired independently: one bad
 * value costs that field, never the whole document. Never throws.
 */
export function sanitizeReplanPreferences(value: unknown): ReplanPreferences {
  const raw = (value ?? {}) as Partial<ReplanPreferences>;
  return {
    workdayStart: isValidTimeKey(raw.workdayStart)
      ? raw.workdayStart
      : DEFAULT_REPLAN_PREFERENCES.workdayStart,
    workdayEnd: isValidTimeKey(raw.workdayEnd)
      ? raw.workdayEnd
      : DEFAULT_REPLAN_PREFERENCES.workdayEnd,
    bufferMinutes: sanitizeMinutes(
      raw.bufferMinutes,
      DEFAULT_REPLAN_PREFERENCES.bufferMinutes,
      MAX_BUFFER_MINUTES,
    ),
    breakMinutes: sanitizeMinutes(
      raw.breakMinutes,
      DEFAULT_REPLAN_PREFERENCES.breakMinutes,
      MAX_BREAK_MINUTES,
    ),
    breakAfterMinutes: sanitizeMinutes(
      raw.breakAfterMinutes,
      DEFAULT_REPLAN_PREFERENCES.breakAfterMinutes,
      MAX_BREAK_AFTER_MINUTES,
    ),
    mode: sanitizeMode(raw.mode),
    lowPriorityDeferral: raw.lowPriorityDeferral === true,
    notifyPlannedStarts: raw.notifyPlannedStarts === true,
  };
}

/**
 * `'HH:mm'` -> minutes since local midnight (e.g. `'16:00'` -> 960).
 *
 * Returns `NaN` for anything that is not a valid time key; callers validate
 * first, and the two that do not fall back to the opposing default.
 */
export function parseClockMinutes(key: TimeKey): number {
  if (!isValidTimeKey(key)) return Number.NaN;
  const [hours, minutes] = key.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Epoch ms of a clock time on the local day named by `day`. */
function instantOnDay(day: DayKey, key: TimeKey): number {
  const date = localDateFromDayKey(day);
  const minutes = parseClockMinutes(key);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getTime();
}

/**
 * Combine a local day key with the two clock times into epoch bounds.
 *
 * If `end <= start` the window is empty and is returned as a zero-width interval
 * anchored at `start`: the caller sees "no time today" rather than a schedule
 * that silently crosses midnight into tomorrow. An invalid time key falls back
 * to the shipped default for that edge.
 */
export function resolveWorkday(day: DayKey, start: TimeKey, end: TimeKey): Workday {
  const safeStart = isValidTimeKey(start) ? start : DEFAULT_REPLAN_PREFERENCES.workdayStart;
  const safeEnd = isValidTimeKey(end) ? end : DEFAULT_REPLAN_PREFERENCES.workdayEnd;
  const startAt = instantOnDay(day, safeStart);
  const endAt = instantOnDay(day, safeEnd);
  if (endAt <= startAt) return { start: startAt, end: startAt };
  return { start: startAt, end: endAt };
}
