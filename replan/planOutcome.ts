/**
 * Pure plan-outcome comparison logic.
 */

import type { DayKey } from '../productivity/domain';
import type { Todo } from '../todos/model';
import type { Attribution } from '../productivity/attribution';
import type { FocusSession } from '../productivity';
import type { DayPlan, PlannedTaskResult, PlanOutcome, PlannedTaskResultStatus } from './types';

export type OutcomeContext = {
  dayKey: DayKey;
  plan: DayPlan | null;
  todos: readonly Todo[];
  attribution?: Map<string, Attribution> | Record<string, Attribution>;
  focusSessionsForDay?: FocusSession[];
  now: number;
};

function getAttributionSeconds(taskId: string, attribution: any): number {
  if (!attribution) return 0;
  const read = (v: any): number =>
    v && typeof v.focusedSeconds === 'number' ? v.focusedSeconds : 0;
  if (attribution instanceof Map) return read(attribution.get(taskId));
  return read(attribution[taskId]);
}

function classify(
  taskId: string,
  plan: DayPlan | null,
  todos: readonly Todo[],
  now: number,
): {
  wasScheduled: boolean;
  completed: boolean;
  completedAt?: number;
  plannedStart?: number;
  plannedEnd?: number;
  status: PlannedTaskResultStatus;
} {
  const todo = todos.find((t) => t.id === taskId);
  const placement = plan?.placements.find((p) => p.taskId === taskId);
  const completed = !!todo?.completed;
  const completedAt = todo?.completedAt;
  const plannedStart = placement?.start;
  const plannedEnd = placement?.end;

  if (!placement) {
    return {
      wasScheduled: false,
      completed,
      completedAt,
      status: completed ? 'completed-on-time' : 'ongoing',
    };
  }

  if (completed && completedAt) {
    if (plannedEnd != null && completedAt <= plannedEnd) {
      return {
        wasScheduled: true,
        completed,
        completedAt,
        plannedStart,
        plannedEnd,
        status: 'completed-on-time',
      };
    }
    return {
      wasScheduled: true,
      completed,
      completedAt,
      plannedStart,
      plannedEnd,
      status: 'completed-late',
    };
  }

  if (plannedEnd != null && plannedEnd < now) {
    // Not completed and window ended
    return {
      wasScheduled: true,
      completed: false,
      plannedStart,
      plannedEnd,
      status: 'missed',
    };
  }

  return {
    wasScheduled: true,
    completed: false,
    plannedStart,
    plannedEnd,
    status: 'ongoing',
  };
}

export function computePlanOutcome(ctx: OutcomeContext): PlanOutcome {
  const plan = ctx.plan;
  const now = ctx.now;
  const dayKey = ctx.dayKey;
  const attribution = ctx.attribution || {};

  if (!plan || plan.dayKey !== dayKey) {
    return {
      dayKey,
      planApprovedAt: plan?.approvedAt ?? 0,
      generatedAt: now,
      planSignature: plan?.signature ?? '',
      results: [],
      summary: {
        totalPlanned: 0,
        completed: 0,
        completedOnTime: 0,
        completedLate: 0,
        postponed: 0,
        missed: 0,
        totalPlannedFocusMins: undefined,
        totalActualFocusMins: undefined,
      },
    };
  }

  const results: PlannedTaskResult[] = [];
  const seen = new Set<string>();
  for (const p of plan.placements) {
    if (seen.has(p.taskId)) continue;
    seen.add(p.taskId);
    const cls = classify(p.taskId, plan, ctx.todos, now);
    const todo = ctx.todos.find((t) => t.id === p.taskId);
    const secs = getAttributionSeconds(p.taskId, attribution);
    results.push({
      taskId: p.taskId,
      taskText: todo?.text,
      plannedStart: cls.plannedStart,
      plannedEnd: cls.plannedEnd,
      wasScheduled: true,
      completed: cls.completed,
      completedAt: cls.completedAt,
      actualFocusSeconds: secs || undefined,
      status: cls.status,
    });
  }

  let completed = 0;
  let completedOnTime = 0;
  let completedLate = 0;
  let postponed = 0;
  let missed = 0;
  let totalActualFocusMins = 0;
  for (const r of results) {
    if (r.actualFocusSeconds) totalActualFocusMins += r.actualFocusSeconds / 60;
    if (r.completed) completed++;
    if (r.status === 'completed-on-time') completedOnTime++;
    if (r.status === 'completed-late') completedLate++;
    if (r.status === 'postponed') postponed++;
    if (r.status === 'missed') missed++;
  }

  const totalPlanned = plan.placements.length;
  return {
    dayKey,
    planApprovedAt: plan.approvedAt,
    generatedAt: now,
    planSignature: plan.signature,
    results,
    summary: {
      totalPlanned,
      completed,
      completedOnTime,
      completedLate,
      postponed,
      missed,
      totalPlannedFocusMins: undefined,
      totalActualFocusMins: totalActualFocusMins > 0 ? Math.round(totalActualFocusMins * 10) / 10 : undefined,
    },
  };
}
