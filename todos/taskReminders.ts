/**
 * What task reminders *should* be scheduled, as a pure function of the list.
 *
 * A task gets a reminder when it has both a day and a time and is still open. A
 * reminder whose moment has already passed is history rather than something to
 * schedule, and a completed task has nothing to be nudged about.
 *
 * Pure on purpose: no Notifee, no React. The instant is built from the same
 * local-date helpers the rest of the app uses, so a task's reminder cannot land
 * on a different day from the one its row shows.
 */
import { localDateFromDayKey } from '../productivity/domain';
import type { Todo } from './model';
import { isValidTimeKey } from './timeKey';

export type PlannedTaskReminder = {
  /** The task the reminder belongs to; it is also the notification's identity. */
  taskId: string;
  fireAt: number;
  title: string;
  body: string;
};

/**
 * Epoch ms a task is due, or null when it has no day and time to combine.
 *
 * `localDateFromDayKey` anchors at local noon, and `setHours` then overrides the
 * time of day, so the resulting instant is a local-calendar day plus a
 * wall-clock time with no timezone arithmetic in sight.
 */
export function dueAt(todo: Todo): number | null {
  if (!todo.dueDate || !isValidTimeKey(todo.dueTime)) return null;
  const date = localDateFromDayKey(todo.dueDate);
  const [hours, minutes] = todo.dueTime.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

export function planTaskReminders(
  todos: readonly Todo[],
  now: number,
): PlannedTaskReminder[] {
  return todos.flatMap((todo) => {
    // A finished task is not nagged about.
    if (todo.completed) return [];
    const fireAt = dueAt(todo);
    // A moment already gone is not scheduled; the mapping is desired state, not
    // a catch-up queue.
    if (fireAt === null || fireAt <= now) return [];
    return [{ taskId: todo.id, fireAt, title: todo.text, body: 'Task reminder' }];
  });
}
