/**
 * Controller for plan-outcome comparison.
 *
 * Today's comparison is derived from the approved plan, the task list and the
 * per-task focus attribution, so it always reflects the current state. Saving is
 * explicit (`saveOutcome`); the composition point decides when to persist, so
 * this hook stays free of a write policy.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  Attribution,
  DayKey,
  FocusSession,
} from '../productivity/domain';
import { sessionsForDay } from '../productivity/domain';
import type { Todo } from '../todos/model';
import type { DayPlan, PlanOutcome } from '../replan';
import {
  computePlanOutcome,
  loadPlanOutcomeForDay,
  savePlanOutcomeForDay,
} from '../replan';
import { useNow } from './useNow';

export type UsePlanOutcomeArgs = {
  hydrated: boolean;
  dayKey: DayKey;
  plan: DayPlan | null;
  todos: readonly Todo[];
  attribution: Map<string, Attribution> | Record<string, Attribution> | undefined;
  /**
   * Closed focus sessions across all days. Today's slice is taken from it and
   * used as the per-task focus source, so the comparison reads the same log the
   * rest of the app trusts rather than an all-time attribution total.
   */
  focusSessions?: readonly FocusSession[];
  /**
   * Tasks planned here, unfinished, and carried into a later plan. Supplied by
   * the review controller; keeps today's unfinished-carried tasks out of the
   * `missed` count.
   */
  carriedForwardTaskIds?: readonly string[];
  /** Override the clock (tests); defaults to a 30s tick. */
  now?: number;
};

export type PlanOutcomeController = {
  outcome: PlanOutcome;
  /**
   * True once this day's stored outcome has been read (or found absent).
   *
   * The composition point waits for it before persisting, so a comparison
   * computed before the stored record loads can never overwrite it — which
   * would erase a legacy completion the record was keeping alive.
   */
  historyLoaded: boolean;
  /** The saved outcome for the previous local day, or null. */
  loadYesterday: () => Promise<PlanOutcome | null>;
  /** Persist `outcome` under its day. */
  saveOutcome: () => Promise<void>;
};

/** `YYYY-MM-DD` for the local day before `dayKey`. */
function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function usePlanOutcome(args: UsePlanOutcomeArgs): PlanOutcomeController {
  const { dayKey, plan, todos, attribution, focusSessions, carriedForwardTaskIds } = args;
  const ticking = useNow();
  const now = args.now ?? ticking;

  // This day's saved comparison, read once per day. It is not a second source
  // of truth for the live comparison: it is the evidence that a completion
  // stripped from the current plan — a rebuild drops completed work — still
  // belongs to the day. `dayKey` is carried beside it so a day rollover can
  // never merge yesterday's record into today.
  const [stored, setStored] = useState<{
    dayKey: DayKey;
    outcome: PlanOutcome | null;
  } | null>(null);

  useEffect(() => {
    if (!args.hydrated) return undefined;
    let cancelled = false;
    loadPlanOutcomeForDay(dayKey)
      .then((loaded) => {
        if (!cancelled) setStored({ dayKey, outcome: loaded });
      })
      .catch(() => {
        if (!cancelled) setStored({ dayKey, outcome: null });
      });
    return () => {
      cancelled = true;
    };
  }, [args.hydrated, dayKey]);

  const previousOutcome = stored?.dayKey === dayKey ? stored.outcome : null;
  const historyLoaded = stored?.dayKey === dayKey;

  const outcome = useMemo(
    () =>
      computePlanOutcome({
        dayKey,
        plan,
        todos,
        attribution,
        // A supplied log (even an empty one) is authoritative for the day;
        // omitting the arg entirely is what falls back to attribution.
        focusSessionsForDay: focusSessions ? sessionsForDay(focusSessions, dayKey) : undefined,
        carriedForwardTaskIds,
        previousOutcome,
        now,
      }),
    [dayKey, plan, todos, attribution, focusSessions, carriedForwardTaskIds, previousOutcome, now],
  );

  /** Tomorrow's "yesterday": derived from the same day key the outcome uses. */
  const loadYesterday = useCallback(
    () => loadPlanOutcomeForDay(previousDayKey(dayKey)),
    [dayKey],
  );

  const saveOutcome = useCallback(async () => {
    await savePlanOutcomeForDay(outcome);
    // Keep the in-memory copy in step with what was just written. A rebuild in
    // this same session then still has the earlier record to merge from; without
    // this it would only learn about the record on the next launch.
    setStored({ dayKey, outcome });
  }, [dayKey, outcome]);

  return { outcome, historyLoaded, loadYesterday, saveOutcome };
}
