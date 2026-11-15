/**
 * The cross-domain controller for daily career recommendations.
 *
 * The engine itself (`career/recommendations.ts`) is pure. This hook is the only
 * place that joins it to the clock and the approved plan, so the recommendation
 * set can use the time actually left in the day without making career records
 * depend on productivity state.
 */

import { useMemo } from 'react';

import { useCareer } from '../career/CareerProvider';
import type { CareerDevelopment } from '../career/linkage';
import type { CareerPlanReview } from '../career/planReview';
import {
  buildCareerRecommendations,
  type CareerRecommendations,
} from '../career/recommendations';
import { resolveWorkday } from '../replan/preferences';
import type { DayPlan, ReplanPreferences } from '../replan/types';
import type { DayKey } from '../shared/date';
import type { Todo } from '../todos/model';

import { useNow } from './useNow';

export type CareerRecommendationsInput = {
  development: CareerDevelopment;
  tasks: readonly Todo[];
  today: DayKey;
  plan: DayPlan | null;
  preferences: ReplanPreferences;
  planReview?: CareerPlanReview;
};

export function useCareerRecommendations({
  development,
  tasks,
  today,
  plan,
  preferences,
  planReview,
}: CareerRecommendationsInput): CareerRecommendations {
  const { doc } = useCareer();
  const now = useNow();

  // Round to five-minute buckets so a 30-second clock tick does not create a new
  // recommendation set. The engine uses the same granularity when it caps a
  // candidate to the open time.
  const availableMinutes = useMemo(
    () => openMinutes(now, plan, tasks, preferences, today),
    [now, plan, tasks, preferences, today],
  );

  return useMemo(
    () =>
      buildCareerRecommendations({
        doc,
        development,
        today,
        ...(availableMinutes !== undefined ? { availableMinutes } : {}),
        ...(planReview ? { planReview } : {}),
      }),
    [doc, development, today, availableMinutes, planReview],
  );
}

/**
 * Open minutes left in today's approved plan.
 *
 * `undefined` means there is no plan for today, so no honest time estimate can
 * be made. Zero means the plan is today's but has no usable space left.
 */
function openMinutes(
  now: number,
  plan: DayPlan | null,
  tasks: readonly Todo[],
  preferences: ReplanPreferences,
  today: DayKey,
): number | undefined {
  if (!plan || plan.dayKey !== today) return undefined;

  const workday = resolveWorkday(
    today,
    preferences.workdayStart,
    preferences.workdayEnd,
  );
  if (now >= workday.end) return 0;

  const openTaskIds = new Set(
    tasks.filter((task) => !task.completed).map((task) => task.id),
  );
  let reservedMs = 0;
  for (const placement of plan.placements) {
    if (!openTaskIds.has(placement.taskId)) continue;
    const start = Math.max(now, placement.start);
    const end = Math.min(workday.end, placement.end);
    if (end > start) reservedMs += end - start;
  }

  const remainingMinutes =
    (workday.end - now) / 60_000 - reservedMs / 60_000;
  return Math.max(0, Math.floor(remainingMinutes / 5) * 5);
}
