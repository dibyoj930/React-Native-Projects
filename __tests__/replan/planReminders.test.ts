/**
 * The pure planned-start reminder plan.
 *
 * A planned start is not a deadline: this planner only ever fires for a future
 * start of an open task, and it is silent for a plan that does not exist.
 */

import { planStartReminders } from '../../replan/planReminders';
import type { DayPlan, ReplanTask } from '../../replan/types';

/** 4 May 2026 at `hours:minutes` local. */
function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

const NOW = at(14, 0);

function task(overrides: Partial<ReplanTask> & { id: string }): ReplanTask {
  return { text: overrides.id, completed: false, hasActiveTimer: false, ...overrides };
}

function plan(placements: { taskId: string; start: number; end: number }[]): DayPlan {
  return { dayKey: '2026-05-04', approvedAt: NOW, signature: 'sig', placements };
}

describe('planStartReminders', () => {
  it('plans nothing without a plan', () => {
    expect(planStartReminders(null, [task({ id: 'a' })], NOW)).toEqual([]);
  });

  it('plans a reminder for a future start of an open task', () => {
    expect(
      planStartReminders(plan([{ taskId: 'a', start: at(14, 30), end: at(15, 0) }]), [
        task({ id: 'a', text: 'Write the report' }),
      ], NOW),
    ).toEqual([
      {
        taskId: 'a',
        fireAt: at(14, 30),
        title: 'Write the report',
        body: 'Planned: 2:30 PM',
      },
    ]);
  });

  it('drops a start that has already gone', () => {
    expect(
      planStartReminders(plan([{ taskId: 'a', start: at(13, 0), end: at(13, 30) }]), [
        task({ id: 'a' }),
      ], NOW),
    ).toEqual([]);
  });

  it('drops a completed task', () => {
    expect(
      planStartReminders(plan([{ taskId: 'a', start: at(15, 0), end: at(15, 30) }]), [
        task({ id: 'a', completed: true }),
      ], NOW),
    ).toEqual([]);
  });

  it('drops a placement whose task is not in the list', () => {
    expect(
      planStartReminders(plan([{ taskId: 'ghost', start: at(15, 0), end: at(15, 30) }]), [
        task({ id: 'a' }),
      ], NOW),
    ).toEqual([]);
  });

  it('sorts by task id so the plan is order-independent', () => {
    const reminders = planStartReminders(
      plan([
        { taskId: 'c', start: at(16, 0), end: at(16, 30) },
        { taskId: 'a', start: at(15, 0), end: at(15, 30) },
        { taskId: 'b', start: at(17, 0), end: at(17, 30) },
      ]),
      [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
      NOW,
    );
    expect(reminders.map((reminder) => reminder.taskId)).toEqual(['a', 'b', 'c']);
  });
});
