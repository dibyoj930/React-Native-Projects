/**
 * Contextual suggestions for replanning.
 *
 * Pure domain logic: no React, no React Native, no AsyncStorage. Deterministic.
 */

import type { DayKey } from '../productivity/domain';
import type { Todo } from '../todos/model';
import type { DayPlan, ReplanTask } from './types';

export type SuggestionType = 'planned-block-missed' | 'behind-schedule';

export type SuggestionId = string;

export type ReplanSuggestion = {
  id: SuggestionId;
  type: SuggestionType;
  dayKey: DayKey;
  taskId?: string;
  reason: string;
  createdAt: number;
  expiresAt?: number;
  metadata: {
    plannedStart?: number;
    plannedEnd?: number;
    missedByMs?: number;
    behindByPercent?: number;
    behindByMins?: number;
  };
};

export type SuggestionContext = {
  now: number;
  dayKey: DayKey;
  plan: DayPlan | null;
  replanTasks: readonly ReplanTask[];
  todos: readonly Todo[];
  anyTimerRunning: boolean;
  workdayStart: string;
  workdayEnd: string;
  plannedFocusMinsSoFar?: number;
  actualFocusMinsSoFar?: number;
  completedPlannedCount?: number;
  totalPlannedCount?: number;
};

function makeId(type: SuggestionType, taskId?: string): string {
  const base = taskId ? `${type}:${taskId}` : type;
  return base;
}

function hourOnDay(day: string, hourStr: string): number {
  const [h, m] = hourStr.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h || 0, m || 0, 0, 0).getTime();
}

function instantOnDay(day: string, key: string): number {
  if (!key || key.indexOf(':') === -1) return hourOnDay(day, '09:00');
  return hourOnDay(day, key);
}

export function computeSuggestions(
  ctx: SuggestionContext,
  dismissedIds: string[],
): ReplanSuggestion[] {
  const suggestions: ReplanSuggestion[] = [];
  if (ctx.anyTimerRunning) return suggestions;
  if (!ctx.plan || ctx.plan.dayKey !== ctx.dayKey) return suggestions;

  const now = ctx.now;
  const day = ctx.dayKey;

  // Planned block missed
  for (const p of ctx.plan.placements) {
    if (p.end >= now) continue;
    const id = makeId('planned-block-missed', p.taskId);
    if (dismissedIds.includes(id)) continue;
    const task = ctx.todos.find((t) => t.id === p.taskId);
    if (!task || task.completed) continue;
    const missedByMs = now - p.end;
    suggestions.push({
      id,
      type: 'planned-block-missed',
      dayKey: day,
      taskId: p.taskId,
      reason: task.text
        ? `Planned block for "${task.text}" ended at ${new Date(p.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} but it's not done.`
        : `Planned block ended but task not done.`,
      createdAt: now,
      metadata: {
        plannedStart: p.start,
        plannedEnd: p.end,
        missedByMs,
      },
    });
  }

  // Behind schedule. Everything here is in minutes; `now - start` is ms, so it
  // is converted before clamping against the workday length.
  const workdayStartMs = instantOnDay(day, ctx.workdayStart);
  const workdayEndMs = instantOnDay(day, ctx.workdayEnd);
  const totalWorkdayMins = Math.max(1, (workdayEndMs - workdayStartMs) / 60000);
  const elapsedMins = Math.max(
    0,
    Math.min((now - workdayStartMs) / 60000, totalWorkdayMins),
  );
  const timeElapsedFraction = elapsedMins / totalWorkdayMins;

  const totalPlanned = ctx.totalPlannedCount ?? ctx.plan.placements.length;
  const completedPlanned = ctx.completedPlannedCount ?? 0;
  const completionFraction = totalPlanned > 0 ? completedPlanned / totalPlanned : 0;

  if (timeElapsedFraction > 0.4 && completionFraction < timeElapsedFraction - 0.25) {
    const id = makeId('behind-schedule');
    if (!dismissedIds.includes(id)) {
      suggestions.push({
        id,
        type: 'behind-schedule',
        dayKey: day,
        reason: `You're behind schedule (about ${Math.round(elapsedMins)} min elapsed, ${Math.round(completionFraction * 100)}% of planned done).`,
        createdAt: now,
        metadata: {
          behindByPercent: Math.round((timeElapsedFraction - completionFraction) * 100),
          behindByMins: Math.round((timeElapsedFraction * totalWorkdayMins) - (completionFraction * totalWorkdayMins)),
        },
      });
    }
  }

  // Prioritize missed blocks
  suggestions.sort((a, b) => {
    if (a.type === 'planned-block-missed' && b.type !== 'planned-block-missed') return -1;
    if (b.type === 'planned-block-missed' && a.type !== 'planned-block-missed') return 1;
    return a.createdAt - b.createdAt;
  });

  return suggestions.slice(0, 2);
}
