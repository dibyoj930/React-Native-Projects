/**
 * What planned-start reminders *should* be scheduled, as a pure function.
 *
 * Pure: no Notifee, no React. Sibling of todos/taskReminders.ts — but a DIFFERENT
 * concern. taskReminders is about a task's deadline (dueDate + dueTime); this is
 * about the moment the user approved a task to START. Keeping them separate is
 * what stops a planned start from ever being confused with a deadline.
 */

import { formatClock } from './explain';
import type { DayPlan, ReplanTask } from './types';

/** One reminder to fire when an approved task is supposed to start. */
export type PlannedStartReminder = {
  taskId: string;
  fireAt: number;
  title: string;
  body: string;
};

/**
 * One reminder per planned placement whose start is in the FUTURE (`start > now`)
 * for an open, non-completed task. A start already gone is history, not a
 * reminder. Pure and order-independent (sorted by taskId for stability).
 *
 * Invariants:
 *   - never emits a reminder for a completed task;
 *   - never emits for a start in the past;
 *   - this planner is OFF unless the planned-start preference is enabled — that
 *     opt-in gate lives at the hook, not here, so this stays pure.
 */
export function planStartReminders(
  plan: DayPlan | null,
  tasks: readonly ReplanTask[],
  now: number,
): PlannedStartReminder[] {
  if (!plan) return [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  const reminders: PlannedStartReminder[] = [];
  for (const placement of plan.placements) {
    if (placement.start <= now) continue;
    const task = tasksById.get(placement.taskId);
    if (!task || task.completed) continue;
    reminders.push({
      taskId: placement.taskId,
      fireAt: placement.start,
      title: task.text,
      body: `Planned: ${formatClock(placement.start)}`,
    });
  }

  return reminders.sort((a, b) => a.taskId.localeCompare(b.taskId));
}