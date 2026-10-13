/**
 * Controller for plan-outcome comparison.
 *
 * Today's comparison is derived from the approved plan, the task list and the
 * per-task focus attribution, so it always reflects the current state. Saving is
 * explicit (`saveOutcome`); the composition point decides when to persist, so
 * this hook stays free of a write policy.
 */
import { useCallback, useMemo } from 'react';

import type {
  Attribution,
  DayKey,
} from '../productivity/domain';
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
  /** Override the clock (tests); defaults to a 30s tick. */
  now?: number;
};

export type PlanOutcomeController = {
  outcome: PlanOutcome;
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
  const { hydrated, dayKey, plan, todos, attribution } = args;
  const ticking = useNow();
  const now = args.now ?? ticking;

  const outcome = useMemo(
    () =>
      computePlanOutcome({
        dayKey,
        plan,
        todos,
        attribution,
        now,
      }),
    [dayKey, plan, todos, attribution, now],
  );

  /** Tomorrow's "yesterday": derived from the same day key the outcome uses. */
  const loadYesterday = useCallback(
    () => loadPlanOutcomeForDay(previousDayKey(dayKey)),
    [dayKey],
  );

  const saveOutcome = useCallback(
    () => savePlanOutcomeForDay(outcome),
    [outcome],
  );

  return { outcome, loadYesterday, saveOutcome };
}
