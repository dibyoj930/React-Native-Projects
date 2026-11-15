/**
 * Cross-day rollover: which unfinished planned tasks were carried into a later
 * plan.
 *
 * Pure. The single persisted `DayPlan` is only ever today's; every earlier day's
 * plan survives only as that day's stored `PlanOutcome.results` (which record
 * each planned task's window). "Postponed" is therefore derived by comparing a
 * day's recorded plan against later recorded plans, and it is only asserted when
 * a later plan actually exists to compare against — a missing day is unknown,
 * never "nothing was planned".
 */

import type { DayKey } from '../productivity/domain';
import type { DayPlan, PlanOutcome } from './types';

export type RolloverEdge = {
  taskId: string;
  fromDay: DayKey;
  toDay: DayKey;
};

export type RolloverReport = {
  /** Per past day, the task ids that were carried into a later plan. */
  carriedForwardByDay: Map<DayKey, Set<string>>;
  edges: RolloverEdge[];
};

export type DeriveRolloverInput = {
  /** Recorded outcomes by day. A missing day is unknown, not empty. */
  outcomesByDay: Record<DayKey, PlanOutcome | undefined>;
  /** Today's live plan, the newest comparison target. */
  livePlan: DayPlan | null;
  liveDayKey: DayKey;
  /** Ascending day keys of the window, today inclusive. */
  days: readonly DayKey[];
  /**
   * Task ids considered planned on `liveDayKey`. Defaults to the live plan's
   * placements. Supplied when a rebuild may have dropped completed work from the
   * live plan: a task finished today was still planned today, even if the current
   * plan no longer holds it.
   */
  livePlannedTaskIds?: ReadonlySet<string>;
};

/** Planned task ids for a day, or null when that day's plan is unknown. */
function plannedTaskIds(
  day: DayKey,
  input: DeriveRolloverInput,
): Set<string> | null {
  if (day === input.liveDayKey) {
    if (input.livePlannedTaskIds !== undefined) {
      return new Set(input.livePlannedTaskIds);
    }
    if (!input.livePlan || input.livePlan.dayKey !== day) return null;
    return new Set(input.livePlan.placements.map((p) => p.taskId));
  }
  const outcome = input.outcomesByDay[day];
  if (!outcome) return null;
  return new Set(
    outcome.results.filter((r) => r.wasScheduled).map((r) => r.taskId),
  );
}

/**
 * For each past day with a recorded outcome, the tasks that were planned there,
 * left unfinished, and appear again in a later day's plan within the window.
 */
export function deriveRollover(input: DeriveRolloverInput): RolloverReport {
  const days = [...input.days].sort();
  const plans = new Map<DayKey, Set<string> | null>();
  for (const day of days) plans.set(day, plannedTaskIds(day, input));

  const carriedForwardByDay = new Map<DayKey, Set<string>>();
  const edges: RolloverEdge[] = [];

  for (const fromDay of days) {
    // Only a finished day can be postponed, and nothing is planned after today.
    if (fromDay === input.liveDayKey) continue;
    const outcome = input.outcomesByDay[fromDay];
    if (!outcome) continue;

    const unfinished = outcome.results.filter(
      (r) => r.wasScheduled && !r.completed,
    );
    for (const result of unfinished) {
      const toDay = days.find(
        (d) => d > fromDay && plans.get(d)?.has(result.taskId) === true,
      );
      if (!toDay) continue;

      const carried = carriedForwardByDay.get(fromDay) ?? new Set<string>();
      carried.add(result.taskId);
      carriedForwardByDay.set(fromDay, carried);
      edges.push({ taskId: result.taskId, fromDay, toDay });
    }
  }

  return { carriedForwardByDay, edges };
}

/**
 * Re-derive a stored outcome for review.
 *
 * A record saved during its day can be out of date by the time it is reviewed:
 * it may still hold `ongoing` for a window that has since closed, and its focus
 * figures came from whatever source was available at save time. This overlays
 * the two facts review can establish better — the current clock and the session
 * log — while leaving completion, which only that day can know, exactly as
 * recorded.
 *
 * `focusByTask` is `null` when the session log cannot speak for the day; then
 * the stored focus figures are kept. An empty map means the log *can* speak and
 * the honest answer is zero.
 */
export type FinalizeOptions = {
  now: number;
  focusByTask?: Map<string, number> | null;
  carriedForward?: ReadonlySet<string>;
};

export function finalizeOutcome(
  outcome: PlanOutcome,
  options: FinalizeOptions,
): PlanOutcome {
  const { now } = options;
  const carriedForward = options.carriedForward;
  const focusByTask = options.focusByTask ?? null;

  let completed = 0;
  let completedOnTime = 0;
  let completedLate = 0;
  let postponed = 0;
  let missed = 0;
  let actualFocusMins = 0;
  let plannedFocusMins = 0;

  const results = outcome.results.map((result) => {
    let status = result.status;

    if (result.completed) {
      // Completion is the day's own fact and is never recomputed; only a
      // missing on-time/late label is repaired from the recorded timestamps.
      if (status !== 'completed-on-time' && status !== 'completed-late') {
        const onTime =
          result.plannedEnd != null &&
          result.completedAt != null &&
          result.completedAt <= result.plannedEnd;
        status = onTime ? 'completed-on-time' : 'completed-late';
      }
    } else if (result.wasScheduled) {
      // A window that has since ended, or one already recorded as missed, is
      // settled — and settled as postponed only when a later plan holds it.
      const windowEnded = result.plannedEnd != null && result.plannedEnd < now;
      if (windowEnded || status === 'missed' || status === 'postponed') {
        status = carriedForward?.has(result.taskId) ? 'postponed' : 'missed';
      }
    }

    const actualFocusSeconds =
      focusByTask !== null ? focusByTask.get(result.taskId) ?? 0 : result.actualFocusSeconds;

    if (result.completed) completed += 1;
    if (status === 'completed-on-time') completedOnTime += 1;
    if (status === 'completed-late') completedLate += 1;
    if (status === 'postponed') postponed += 1;
    if (status === 'missed') missed += 1;
    if (actualFocusSeconds) actualFocusMins += actualFocusSeconds / 60;
    if (result.plannedStart != null && result.plannedEnd != null) {
      plannedFocusMins += (result.plannedEnd - result.plannedStart) / 60_000;
    }

    return { ...result, status, actualFocusSeconds };
  });

  const round1 = (n: number): number => Math.round(n * 10) / 10;

  return {
    ...outcome,
    results,
    summary: {
      ...outcome.summary,
      totalPlanned: results.length,
      completed,
      completedOnTime,
      completedLate,
      postponed,
      missed,
      totalPlannedFocusMins:
        plannedFocusMins > 0 ? round1(plannedFocusMins) : outcome.summary.totalPlannedFocusMins,
      totalActualFocusMins:
        focusByTask !== null ? round1(actualFocusMins) : outcome.summary.totalActualFocusMins,
    },
  };
}

export type WindowAggregate = {
  /** Days in the window that had a recorded outcome. */
  daysWithData: number;
  plannedOccurrences: number;
  distinctPlannedTasks: number;
  completedOccurrences: number;
  distinctCompletedTasks: number;
  postponedOccurrences: number;
  distinctPostponedTasks: number;
  missedOccurrences: number;
  distinctMissedTasks: number;
  plannedFocusMins: number;
  actualFocusMins: number;
};

/**
 * Aggregate a window without double-counting a task carried through several
 * plans: occurrences count each day it was planned, distinct counts it once.
 */
export function aggregateOutcomes(
  outcomes: readonly (PlanOutcome | undefined)[],
): WindowAggregate {
  const planned = new Set<string>();
  const completed = new Set<string>();
  const postponed = new Set<string>();
  const missed = new Set<string>();

  let daysWithData = 0;
  let plannedOccurrences = 0;
  let completedOccurrences = 0;
  let postponedOccurrences = 0;
  let missedOccurrences = 0;
  let plannedFocusMins = 0;
  let actualFocusMins = 0;

  for (const outcome of outcomes) {
    if (!outcome) continue;
    daysWithData += 1;
    plannedFocusMins += outcome.summary.totalPlannedFocusMins ?? 0;
    actualFocusMins += outcome.summary.totalActualFocusMins ?? 0;
    for (const r of outcome.results) {
      // Only a row that was actually scheduled counts as planned. A completed
      // task carried into the comparison without a placement (`wasScheduled`
      // false) is real work, but it was not part of the plan being measured.
      if (r.wasScheduled) {
        plannedOccurrences += 1;
        planned.add(r.taskId);
      }
      if (r.completed) {
        completedOccurrences += 1;
        completed.add(r.taskId);
      }
      if (r.status === 'postponed') {
        postponedOccurrences += 1;
        postponed.add(r.taskId);
      }
      if (r.status === 'missed') {
        missedOccurrences += 1;
        missed.add(r.taskId);
      }
    }
  }

  const round1 = (n: number): number => Math.round(n * 10) / 10;
  return {
    daysWithData,
    plannedOccurrences,
    distinctPlannedTasks: planned.size,
    completedOccurrences,
    distinctCompletedTasks: completed.size,
    postponedOccurrences,
    distinctPostponedTasks: postponed.size,
    missedOccurrences,
    distinctMissedTasks: missed.size,
    plannedFocusMins: round1(plannedFocusMins),
    actualFocusMins: round1(actualFocusMins),
  };
}
