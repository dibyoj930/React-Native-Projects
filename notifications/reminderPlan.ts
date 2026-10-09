/**
 * What reminders *should* be scheduled, as a pure function of the day and the
 * streak.
 *
 * Two reminders, with different jobs. A **daily** prompt is a fixed-time nudge
 * to show up at all, so it is laid down as a rolling window of several days and
 * does not depend on progress. A **streak** reminder is the evening warning
 * that only means something when there is a run to lose and today is not yet
 * done. Both are one-shot notifications — Notifee repeating triggers are
 * Android-only — so the window is re-laid each time the app opens, and
 * reconciling that plan against what the OS already holds is what keeps it
 * honest.
 *
 * Pure on purpose: no Notifee, no React. The day keys come from the same
 * productivity helpers the rest of the app uses, so "today" here cannot disagree
 * with "today" anywhere else.
 */
import { addDays, localDateFromDayKey, localDateKey } from '../productivity/domain';

/** Local hour the daily prompt fires. */
export const DAILY_REMINDER_HOUR = 9;

/** Local hour the streak warning fires. */
export const STREAK_REMINDER_HOUR = 20;

/** How many days of the rolling daily window to keep scheduled. */
export const DAILY_REMINDER_WINDOW = 7;

export type PlannedReminder = {
  /** Stable identity; the OS notification id is this, prefixed. */
  id: string;
  fireAt: number;
  title: string;
  body: string;
};

export type ReminderPlanInput = {
  now: number;
  /** Consecutive completed days, today included only if it is already complete. */
  streak: number;
  /** Whether today's mission is already done. */
  todayComplete: boolean;
};

/** Epoch ms of `hour`:00 local on the day named by `day`. */
function hourOnDay(day: string, hour: number): number {
  const date = localDateFromDayKey(day);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

export function planReminders({
  now,
  streak,
  todayComplete,
}: ReminderPlanInput): PlannedReminder[] {
  const today = localDateKey(now);
  const reminders: PlannedReminder[] = [];

  for (let offset = 0; offset < DAILY_REMINDER_WINDOW; offset += 1) {
    const day = addDays(today, offset);
    const fireAt = hourOnDay(day, DAILY_REMINDER_HOUR);
    // A prompt whose hour has already gone by is not worth scheduling; the
    // notification would either be clamped to "now" or arrive as history.
    if (fireAt <= now) continue;
    reminders.push({
      id: `daily-${day}`,
      fireAt,
      title: 'Plan your day',
      body: 'Pick a task and start a focus timer.',
    });
  }

  // Only warn about losing something. A zero streak has nothing at risk, and a
  // finished day has nothing left to protect.
  if (streak >= 1 && !todayComplete) {
    const fireAt = hourOnDay(today, STREAK_REMINDER_HOUR);
    if (fireAt > now) {
      reminders.push({
        id: `streak-${today}`,
        fireAt,
        title: `Keep your ${streak}-day streak`,
        body: 'Finish today’s mission before the day is out.',
      });
    }
  }

  return reminders;
}
