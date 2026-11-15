/**
 * The Plan Review controller: a rolling window of plan-vs-actual outcomes.
 *
 * It assembles three things that only make sense together:
 *
 *   1. **Today**, computed live from the approved plan, the task list and the
 *      session log.
 *   2. **Past days**, read back from the outcome store and re-finalised — their
 *      `ongoing` windows settled, their focus recomputed from the session log
 *      when the log can still speak for the day.
 *   3. **Rollover**, the cross-day fact that turns an unfinished task which
 *      reappears later into `postponed` rather than `missed`.
 *
 * Nothing here writes a task. Calibration suggestions are produced, and the one
 * mutation they can trigger — a changed estimate — goes through the injected
 * `onApplyEstimate`, which the composition point wires to a targeted task write.
 * The user taps; the hook does not.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addDays,
  dayKeyRange,
  focusedSecondsByTaskForDay,
  hasSessionsForDay,
  sessionsForDay,
  localDateKey,
  type DayKey,
  type FocusSession,
} from '../productivity/domain';
import type { Todo } from '../todos/model';
import type { DayPlan, PlanOutcome } from '../replan';
import {
  aggregateOutcomes,
  computePlanOutcome,
  deriveRollover,
  finalizeOutcome,
  loadPlanOutcomesForDays,
  type PlanOutcomesStore,
  type WindowAggregate,
} from '../replan';
import {
  suggestAdjustments,
  type CalibrationResult,
  type TaskDurationSample,
} from '../reflections';
import { useNow } from './useNow';

export type PlanReviewDay = {
  dayKey: DayKey;
  isToday: boolean;
  /** The finalised outcome, or null when that day has no record. */
  outcome: PlanOutcome | null;
  /**
   * The session log can speak for this day.
   *
   * Deliberately separate from `outcome.summary.totalActualFocusMins === 0`: a
   * cleared log and an idle day both read as zero, and only this flag tells the
   * UI which one it is looking at.
   */
  focusAvailable: boolean;
};

export type PlanReview = {
  /** Ascending, oldest first, today last. */
  days: PlanReviewDay[];
  aggregate: WindowAggregate;
  calibration: CalibrationResult;
  /** True until the stored outcomes have loaded at least once. */
  loading: boolean;
  /** Applies one task's suggestion via `onApplyEstimate`. A no-op without one. */
  applyAdjustment: (taskId: string) => void;
};

export type UsePlanReviewArgs = {
  hydrated: boolean;
  today: DayKey;
  /** Today's approved plan, or null. */
  plan: DayPlan | null;
  todos: readonly Todo[];
  /** The full closed focus-session log. */
  sessions: readonly FocusSession[];
  /** The one write calibration may perform: a targeted estimate change. */
  onApplyEstimate: (taskId: string, minutes: number) => void;
  /** Rolling window length, today inclusive. */
  windowDays?: number;
  /** Override the clock (tests); defaults to a 30s tick. */
  now?: number;
};

const DEFAULT_WINDOW_DAYS = 7;
const MINUTES_MS = 60_000;

export function usePlanReview(args: UsePlanReviewArgs): PlanReview {
  const { hydrated, today, plan, todos, sessions, onApplyEstimate } = args;
  const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;
  const ticking = useNow();
  const now = args.now ?? ticking;

  const days = useMemo(
    () => dayKeyRange(addDays(today, -(windowDays - 1)), today),
    [today, windowDays],
  );

  const [stored, setStored] = useState<PlanOutcomesStore>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hydrated) return undefined;
    let cancelled = false;
    setLoading(true);
    loadPlanOutcomesForDays(days).then((loaded) => {
      if (cancelled) return;
      setStored(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, days]);

  const completedTodayIds = useMemo(() => {
    if (plan?.dayKey !== today) return new Set<string>();
    const ids = new Set<string>();
    for (const t of todos) {
      if (t.completed && t.completedAt !== undefined && localDateKey(t.completedAt) === today) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [plan, todos, today]);

  const livePlannedTaskIds = useMemo(() => {
    if (plan?.dayKey !== today) return undefined;
    const ids = new Set(plan.placements.map((p) => p.taskId));
    for (const id of completedTodayIds) ids.add(id);
    return ids;
  }, [plan, completedTodayIds, today]);

  const rollover = useMemo(
    () =>
      deriveRollover({
        outcomesByDay: stored,
        livePlan: plan,
        liveDayKey: today,
        days,
        livePlannedTaskIds,
      }),
    [stored, plan, today, days, livePlannedTaskIds],
  );

  const reviewDays = useMemo<PlanReviewDay[]>(
    () =>
      days.map((dayKey) => {
        const isToday = dayKey === today;
        const focusAvailable = hasSessionsForDay(sessions, dayKey);
        const focusByTask = focusAvailable
          ? focusedSecondsByTaskForDay(sessions, dayKey)
          : null;
        const carriedForward = rollover.carriedForwardByDay.get(dayKey);

        if (isToday) {
          // Live plan wins for today; a stored record is only a fallback for a
          // day that had a plan approved but whose live plan has since gone.
          if (plan && plan.dayKey === dayKey) {
            return {
              dayKey,
              isToday,
              focusAvailable,
              outcome: computePlanOutcome({
                dayKey,
                plan,
                todos,
                focusSessionsForDay: sessionsForDay(sessions, dayKey),
                carriedForwardTaskIds: carriedForward,
                previousOutcome: stored[dayKey],
                now,
              }),
            };
          }
          const storedToday = stored[dayKey];
          return {
            dayKey,
            isToday,
            focusAvailable,
            outcome: storedToday
              ? finalizeOutcome(storedToday, { now, focusByTask, carriedForward })
              : null,
          };
        }

        const base = stored[dayKey];
        return {
          dayKey,
          isToday: false,
          focusAvailable,
          outcome: base
            ? finalizeOutcome(base, { now, focusByTask, carriedForward })
            : null,
        };
      }),
    [days, today, plan, todos, sessions, stored, rollover, now],
  );

  const aggregate = useMemo(
    () => aggregateOutcomes(reviewDays.map((day) => day.outcome ?? undefined)),
    [reviewDays],
  );

  const calibration = useMemo(() => {
    const samples: TaskDurationSample[] = [];
    for (const day of reviewDays) {
      // No outcome, or a log that cannot speak for the day: no evidence either
      // way, so the day contributes no samples rather than zero-valued ones.
      if (!day.outcome || !day.focusAvailable) continue;
      for (const result of day.outcome.results) {
        if (result.plannedStart == null || result.plannedEnd == null) continue;
        samples.push({
          taskId: result.taskId,
          plannedMinutes: (result.plannedEnd - result.plannedStart) / MINUTES_MS,
          actualMinutes: (result.actualFocusSeconds ?? 0) / 60,
          completed: result.completed,
        });
      }
    }

    const candidates = todos
      .filter((t) => (t.estimatedMinutes ?? 0) > 0)
      .map((t) => ({ taskId: t.id, estimatedMinutes: t.estimatedMinutes ?? 0 }));

    return suggestAdjustments({ samples, candidates });
  }, [reviewDays, todos]);

  const applyAdjustment = useCallback(
    (taskId: string) => {
      const adjustment = calibration.adjustments.find((a) => a.taskId === taskId);
      if (!adjustment) return;
      onApplyEstimate(taskId, adjustment.suggestedMinutes);
    },
    [calibration.adjustments, onApplyEstimate],
  );

  return { days: reviewDays, aggregate, calibration, loading, applyAdjustment };
}
