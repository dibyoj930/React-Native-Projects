import { attributeToTask } from './attribution';
import { addDays, dayKeyRange, localDateKey } from './dateKey';
import type { CompletionRecord, DayKey, FocusSession } from './types';

/**
 * Per-day aggregates.
 *
 * Every rollup is *recomputed* from the full session and task logs, never
 * incremented in place. Incrementing means a single missed or replayed event
 * silently skews a number forever, and there is no way to detect or repair it
 * later. Recomputation is O(sessions + tasks), which is nothing at this scale,
 * and it makes the whole statistics layer a pure function of its inputs.
 */
export type DayRollup = {
  day: DayKey;
  /** Total focused seconds logged on this day. */
  focusedSeconds: number;
  /** Every session that started on this day, whatever its ending. */
  totalSessions: number;
  /** Sessions that ran to zero *and* completed their task. */
  completedSessions: number;
  /** Tasks ticked off on this day. */
  tasksCompleted: number;
  /**
   * True when at least one task completed on this day was completed by focus.
   *
   * Note this is resolved against the *whole* session log, not just this day's
   * sessions: a session begun at 23:50 and finished after midnight is what
   * completed the task, and the credit belongs to the day the task closed.
   */
  isFocusCompleted: boolean;
};

/**
 * A zeroed rollup for a day with no recorded activity.
 *
 * `computeRollups` only creates entries for days that actually have a session or
 * a completion, so this exists for callers that need to render *calendar* days
 * rather than active ones — the focus graph, chiefly. Omitting empty days there
 * compresses gaps out of the axis, which makes a two-week break look like
 * consecutive days and destroys the one thing the chart exists to show.
 */
export function emptyRollup(day: DayKey): DayRollup {
  return {
    day,
    focusedSeconds: 0,
    totalSessions: 0,
    completedSessions: 0,
    tasksCompleted: 0,
    isFocusCompleted: false,
  };
}

/**
 * Which day a session belongs to.
 *
 * Attributed to the day it *started*, not the day it ended. A 25-minute session
 * begun at 23:50 counts entirely against the previous day. This is a deliberate
 * simplification: splitting a session across the midnight boundary needs
 * per-second slicing and would make the number depend on how long you happened
 * to sit in a session, which is worse for a motivational metric than a small
 * amount of edge imprecision.
 */
export function rollupDayForSession(session: FocusSession): DayKey {
  return localDateKey(session.startedAt);
}

/**
 * Recomputes every day that has activity. Days with none are simply absent,
 * which is how the streak logic distinguishes "nothing happened" from
 * "something happened and it was not enough".
 *
 * Returns days in ascending order.
 */
export function computeRollups(
  sessions: readonly FocusSession[],
  tasks: readonly CompletionRecord[],
): DayRollup[] {
  const byDay = new Map<DayKey, DayRollup>();
  const ensure = (day: DayKey): DayRollup => {
    let rollup = byDay.get(day);
    if (!rollup) {
      rollup = emptyRollup(day);
      byDay.set(day, rollup);
    }
    return rollup;
  };

  for (const session of sessions) {
    const rollup = ensure(rollupDayForSession(session));
    rollup.focusedSeconds += session.focusedSeconds;
    rollup.totalSessions += 1;
    if (session.status === 'completed') rollup.completedSessions += 1;
  }

  for (const task of tasks) {
    if (!task.completed || task.completedAt === undefined) continue;
    ensure(localDateKey(task.completedAt)).tasksCompleted += 1;
  }

  // Second pass: credit a day for a task that focus actually completed. Kept
  // separate from the counting above because it needs the full session log to
  // join against, which may contain sessions from other days.
  for (const task of tasks) {
    if (!task.completed || task.completedAt === undefined) continue;
    const attribution = attributeToTask(sessions, task.id, task.completedAt);
    if (!attribution.isFocusCompleted) continue;
    ensure(localDateKey(task.completedAt)).isFocusCompleted = true;
  }

  return [...byDay.values()]
    .map((rollup) => ({ ...rollup }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Index for O(1) lookup by day. Days with no activity are absent. */
export function indexRollups(rollups: readonly DayRollup[]): Map<DayKey, DayRollup> {
  return new Map(rollups.map((rollup) => [rollup.day, rollup]));
}

/**
 * The last `count` **calendar** days ending at `endDay`, newest first.
 *
 * Every day in the window is present, zero-filled where nothing happened. This
 * is deliberately not `rollups.slice(-count)`, which returns the last `count`
 * days that *had* activity: it silently compresses gaps out of the axis, so a
 * fortnight off renders as two bars shoulder to shoulder and the chart can no
 * longer answer the only question it exists to answer.
 *
 * Newest first, matching the order the chart has always used.
 */
export function recentDayWindow(
  rollups: readonly DayRollup[],
  endDay: DayKey,
  count: number,
): DayRollup[] {
  const size = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const byDay = indexRollups(rollups);
  return dayKeyRange(addDays(endDay, -(size - 1)), endDay)
    .map((day) => byDay.get(day) ?? emptyRollup(day))
    .reverse();
}
