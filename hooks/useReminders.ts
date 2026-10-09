/**
 * Keeps the OS's reminder notifications in step with where the day stands.
 *
 * Notifee's repeating triggers are Android-only, so reminders are one-shot
 * timestamps laid down as a rolling window. The OS is the source of truth: on
 * every change that matters — permission, the streak, whether today is finished,
 * the date — the desired plan is reconciled against what is actually pending,
 * cancelling anything no longer wanted and scheduling anything missing. That
 * makes the reconciliation idempotent, so a relaunch or a re-render cannot stack
 * duplicate reminders.
 *
 * The plan itself is pure (`notifications/reminderPlan`); this hook owns only
 * the side effects and the timing of when to run them.
 *
 * Pattern note: plain hook, no context. One component consumes it.
 */
import { useEffect } from 'react';

import {
  cancelReminder,
  getPendingReminders,
  planReminders,
  scheduleReminder,
  useNotifications,
} from '../notifications';
import { useProductivity } from '../productivity';

export function useReminders(): void {
  const { permission } = useNotifications();
  const { snapshot } = useProductivity();
  // Only these drive the plan; depending on the whole snapshot would re-run the
  // reconciliation every recompute clock tick.
  const { current, isTodayComplete } = snapshot.streak;
  const today = snapshot.today;

  useEffect(() => {
    if (permission !== 'granted') return;

    const desired = planReminders({
      now: Date.now(),
      streak: current,
      todayComplete: isTodayComplete,
    });

    getPendingReminders()
      .then((pending) => {
        const desiredById = new Map(desired.map((reminder) => [reminder.id, reminder]));
        const pendingById = new Map(pending.map((reminder) => [reminder.id, reminder]));
        const operations: Promise<void>[] = [];

        for (const held of pending) {
          const wanted = desiredById.get(held.id);
          // Cancel anything we no longer want, and any that moved: reusing the
          // id replaces the trigger, but a stale one under the same id would
          // otherwise be cancelled anyway, so cancelling first is harmless.
          if (!wanted || wanted.fireAt !== held.fireAt) {
            operations.push(cancelReminder(held.id));
          }
        }

        for (const wanted of desired) {
          const held = pendingById.get(wanted.id);
          if (!held || held.fireAt !== wanted.fireAt) {
            operations.push(scheduleReminder(wanted));
          }
        }

        return Promise.all(operations);
      })
      .catch((error) => {
        console.warn('[reminders] reconcile failed:', error);
      });
  }, [permission, current, isTodayComplete, today]);
}
