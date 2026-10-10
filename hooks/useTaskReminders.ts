/**
 * Keeps the OS's task reminders in step with the task list.
 *
 * Notifee's repeating triggers are Android-only, so each reminder is a one-shot
 * timestamp scheduled for the task's own date and time. The task list is the
 * source of truth: on every change to it — and once permission is granted — the
 * desired plan is reconciled against what the OS actually holds, cancelling
 * anything no longer wanted and scheduling anything missing. That makes the
 * reconciliation idempotent, so a relaunch or a re-render cannot stack duplicate
 * notifications, and a completed or deleted task cannot leave its reminder
 * behind.
 *
 * `hydrated` gates the first run. Before storage has loaded the list is empty,
 * and reconciling against it would cancel every reminder the OS is holding from
 * the previous session — a reminder the user set would vanish on relaunch.
 *
 * The plan itself is pure (`todos/taskReminders`); this hook owns only the side
 * effects and when to run them.
 *
 * Pattern note: plain hook, no context. One component consumes it.
 */
import { useEffect } from 'react';

import {
  cancelTaskReminder,
  getPendingTaskReminders,
  scheduleTaskReminder,
  useNotifications,
} from '../notifications';
import type { Todo } from '../todos/model';
import { planTaskReminders } from '../todos/taskReminders';

export function useTaskReminders(todos: readonly Todo[], hydrated: boolean): void {
  const { permission } = useNotifications();

  useEffect(() => {
    if (!hydrated || permission !== 'granted') return;

    const desired = planTaskReminders(todos, Date.now());

    getPendingTaskReminders()
      .then((pending) => {
        const desiredById = new Map(desired.map((reminder) => [reminder.taskId, reminder]));
        const pendingById = new Map(pending.map((reminder) => [reminder.taskId, reminder]));
        const operations: Promise<void>[] = [];

        for (const held of pending) {
          const wanted = desiredById.get(held.taskId);
          // Cancel anything no longer wanted, and any whose moment moved: reusing
          // the id replaces the trigger, but a stale one under the same id would
          // otherwise be cancelled anyway, so cancelling first is harmless.
          if (!wanted || wanted.fireAt !== held.fireAt) {
            operations.push(cancelTaskReminder(held.taskId));
          }
        }

        for (const wanted of desired) {
          const held = pendingById.get(wanted.taskId);
          if (!held || held.fireAt !== wanted.fireAt) {
            operations.push(scheduleTaskReminder(wanted));
          }
        }

        return Promise.all(operations);
      })
      .catch((error) => {
        console.warn('[task reminders] reconcile failed:', error);
      });
  }, [hydrated, permission, todos]);
}
