/**
 * The reminder plan is the product decision, in one pure place.
 *
 * Scheduling and cancellation are just mechanics around it, so what is pinned
 * here is the *policy*: a rolling window of daily prompts, and an evening
 * warning only when there is a streak to lose and today is still open.
 */

import {
  DAILY_REMINDER_WINDOW,
  planReminders,
} from '../../notifications/reminderPlan';

/** Local epoch ms. Month is 0-based, as `Date` wants. */
const at = (day: number, hour: number, minute = 0): number =>
  new Date(2026, 4, day, hour, minute, 0, 0).getTime();

describe('planReminders — daily window', () => {
  it('schedules the whole window at 09:00, starting today', () => {
    const plan = planReminders({ now: at(4, 8), streak: 0, todayComplete: false });
    const daily = plan.filter((reminder) => reminder.id.startsWith('daily-'));

    expect(daily).toHaveLength(DAILY_REMINDER_WINDOW);
    expect(daily[0]).toMatchObject({
      id: 'daily-2026-05-04',
      fireAt: at(4, 9),
    });
    expect(daily[DAILY_REMINDER_WINDOW - 1].id).toBe('daily-2026-05-10');
  });

  it('drops today’s prompt once its hour has passed, keeping the rest', () => {
    const plan = planReminders({ now: at(4, 10), streak: 0, todayComplete: false });
    const ids = plan.map((reminder) => reminder.id);

    expect(ids).not.toContain('daily-2026-05-04');
    expect(ids).toContain('daily-2026-05-05');
    expect(plan).toHaveLength(DAILY_REMINDER_WINDOW - 1);
  });
});

describe('planReminders — streak warning', () => {
  it('adds an evening warning when there is a run to lose', () => {
    const plan = planReminders({ now: at(4, 12), streak: 4, todayComplete: false });
    const streak = plan.filter((reminder) => reminder.id.startsWith('streak-'));

    expect(streak).toEqual([
      {
        id: 'streak-2026-05-04',
        fireAt: at(4, 20),
        title: 'Keep your 4-day streak',
        body: expect.any(String),
      },
    ]);
  });

  it('omits the warning when the streak is zero', () => {
    const plan = planReminders({ now: at(4, 12), streak: 0, todayComplete: false });
    expect(plan.some((reminder) => reminder.id.startsWith('streak-'))).toBe(false);
  });

  it('omits the warning once today is complete', () => {
    const plan = planReminders({ now: at(4, 12), streak: 4, todayComplete: true });
    expect(plan.some((reminder) => reminder.id.startsWith('streak-'))).toBe(false);
  });

  it('omits the warning once its hour has passed', () => {
    const plan = planReminders({ now: at(4, 21), streak: 4, todayComplete: false });
    expect(plan.some((reminder) => reminder.id.startsWith('streak-'))).toBe(false);
  });
});
