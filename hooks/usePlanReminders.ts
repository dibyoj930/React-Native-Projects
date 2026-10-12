/**
 * Keeps the OS's *planned-start* reminders in step with the approved plan.
 *
 * Mirrors hooks/useTaskReminders.ts exactly — a `hydrated` gate, an idempotent
 * reconcile (cancel what moved, schedule what is missing), and no work while
 * permission is not granted. The plan itself is pure
 * (replan/planReminders.ts); this hook owns only the side effects.
 *
 * Distinct from deadline reminders on purpose:
 *   - different id namespace: `plan-<taskId>` (never `timer-*`)
 *   - different body copy ("Planned: ...") so a start is never read as a deadline.
 *
 * Invariants:
 *   - never cancels or reschedules `timer-*` notifications (active focus) or the
 *     daily/streak reminders (`daily-*`, `streak-*`);
 *   - reconciles only after the plan has been persisted (callers mount this with
 *     the stored plan);
 *   - idempotent: a re-render or relaunch must not stack duplicates.
 */
import { useEffect } from 'react';

import {
  cancelReminder,
  getPendingReminders,
  scheduleReminder,
  useNotifications,
} from '../notifications';
import { planStartReminders } from '../replan/planReminders';
import type { DayPlan, ReplanTask } from '../replan';

/** Arguments the controller passes in. */
export type UsePlanRemindersArgs = {
  /** The approved plan for today, or null. */
  plan: DayPlan | null;
  /** Engine-view tasks (for completed/deadline checks). */
  tasks: readonly ReplanTask[];
  /** Storage has loaded — gates the first run. */
  hydrated: boolean;
  /** Opt-in switch for planned-start notifications. */
  enabled: boolean;
};

/** The notification id namespace owned by this hook. */
const PLANNED_ID_PREFIX = 'plan-';

export function usePlanReminders({
  plan,
  tasks,
  hydrated,
  enabled,
}: UsePlanRemindersArgs): void {
  const { permission } = useNotifications();

  useEffect(() => {
    if (!hydrated || permission !== 'granted' || !enabled) return;

    const desired = planStartReminders(plan, tasks, Date.now());
    const desiredById = new Map(
      desired.map((reminder) => [`${PLANNED_ID_PREFIX}${reminder.taskId}`, reminder]),
    );

    getPendingReminders()
      .then((pending) => {
        const pendingById = new Map(pending.map((reminder) => [reminder.id, reminder]));
        const operations: Promise<void>[] = [];

        for (const held of pending) {
          // Only reminders this hook owns; leave timer/daily/streak alerts alone.
          if (!held.id.startsWith(PLANNED_ID_PREFIX)) continue;
          const wanted = desiredById.get(held.id);
          // Cancel anything no longer wanted, and any whose moment moved.
          if (!wanted || wanted.fireAt !== held.fireAt) {
            operations.push(cancelReminder(held.id));
          }
        }

        for (const wanted of desired) {
          const id = `${PLANNED_ID_PREFIX}${wanted.taskId}`;
          const held = pendingById.get(id);
          if (!held || held.fireAt !== wanted.fireAt) {
            operations.push(
              scheduleReminder({
                id,
                title: wanted.title,
                body: wanted.body,
                fireAt: wanted.fireAt,
              }),
            );
          }
        }

        return Promise.all(operations);
      })
      .catch((error) => {
        console.warn('[plan reminders] reconcile failed:', error);
      });
  }, [hydrated, permission, plan, tasks, enabled]);
}