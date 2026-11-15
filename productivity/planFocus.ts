/**
 * Per-day focus, read from the session log.
 *
 * The session log is the authoritative record of what was actually focused, so
 * plan-vs-actual reads it rather than any stored total. Everything here buckets
 * on `localDateKey(session.startedAt)` — the exact rule `rollupDayForSession`
 * uses in `productivity/rollups.ts` — so a day's plan focus and its rollup can
 * never disagree about which day a session belongs to.
 *
 * Pure: sessions in, numbers out. No clock, no storage.
 */

import { localDateKey, type DayKey } from './dateKey';
import type { FocusSession } from './types';

/** Sessions whose local start day is `dayKey`. */
export function sessionsForDay(
  sessions: readonly FocusSession[],
  dayKey: DayKey,
): FocusSession[] {
  return sessions.filter((session) => localDateKey(session.startedAt) === dayKey);
}

/** Total focused seconds for the local day. 0 when nothing was focused. */
export function focusedSecondsForDay(
  sessions: readonly FocusSession[],
  dayKey: DayKey,
): number {
  let total = 0;
  for (const session of sessions) {
    if (localDateKey(session.startedAt) === dayKey) total += session.focusedSeconds;
  }
  return total;
}

/**
 * Focused seconds per task for the local day.
 *
 * Sessions with no task (idle/untracked focus) are real focus but belong to no
 * plan row, so they are excluded from the per-task map rather than bucketed
 * under a sentinel id. A task with no session is simply absent — callers should
 * read that as 0 for *that task*, while a whole day with no sessions at all is
 * the caller's cue to show focus as unavailable.
 */
export function focusedSecondsByTaskForDay(
  sessions: readonly FocusSession[],
  dayKey: DayKey,
): Map<string, number> {
  const byTask = new Map<string, number>();
  for (const session of sessions) {
    if (!session.taskId) continue;
    if (localDateKey(session.startedAt) !== dayKey) continue;
    byTask.set(
      session.taskId,
      (byTask.get(session.taskId) ?? 0) + session.focusedSeconds,
    );
  }
  return byTask;
}

/**
 * Whether the log can speak for a day at all.
 *
 * `false` does not mean "no focus"; it means the log holds nothing that started
 * that day. A cleared history and a genuinely idle day are indistinguishable
 * here, which is exactly why the UI must not render an absent day as 0.
 */
export function hasSessionsForDay(
  sessions: readonly FocusSession[],
  dayKey: DayKey,
): boolean {
  return sessions.some((session) => localDateKey(session.startedAt) === dayKey);
}
