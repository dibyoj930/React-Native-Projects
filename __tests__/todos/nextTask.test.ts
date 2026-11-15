/**
 * The next-task selector.
 *
 * This decides the one thing the home screen leads with, so the cases that
 * matter are the boundaries of the two rules: which plan window wins when the
 * clock is inside one, what happens when the plan is stale or names a task that
 * is already done, and where selection falls back to the list's own order.
 *
 * Pure data in, pure data out — no renderer, no clock of its own.
 */

import { selectNextTask } from '../../todos/nextTask';
import type { Todo } from '../../todos/model';
import type { DayPlan } from '../../replan/types';

const TODAY = '2026-05-10';
const T0 = new Date(2026, 4, 10, 9, 0, 0, 0).getTime();
const MINUTE = 60_000;

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    text: `Task ${overrides.id}`,
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

function plan(placements: DayPlan['placements'], dayKey = TODAY): DayPlan {
  return { dayKey, approvedAt: T0, signature: 'sig', placements };
}

const list = [
  todo({ id: 'undated' }),
  todo({ id: 'overdue', dueDate: '2026-05-08' }),
  todo({ id: 'today', dueDate: TODAY }),
  todo({ id: 'upcoming', dueDate: '2026-05-12' }),
];

describe('selectNextTask — with no plan', () => {
  it('takes the first task in the list order, overdue first', () => {
    const choice = selectNextTask({ todos: list, today: TODAY, plan: null, now: T0 });
    // `groupTodos` orders overdue → today → upcoming → undated, so the overdue
    // task leads even though it is not first in the array.
    expect(choice?.todo.id).toBe('overdue');
    expect(choice?.source).toBe('list');
    expect(choice?.isNow).toBe(false);
  });

  it('never picks a completed task', () => {
    const todos = [
      todo({ id: 'done', completed: true, dueDate: '2026-05-01' }),
      todo({ id: 'open' }),
    ];
    const choice = selectNextTask({ todos, today: TODAY, plan: null, now: T0 });
    expect(choice?.todo.id).toBe('open');
  });

  it('returns null when there is nothing open, and for an empty list', () => {
    expect(
      selectNextTask({
        todos: [todo({ id: 'done', completed: true })],
        today: TODAY,
        plan: null,
        now: T0,
      }),
    ).toBeNull();
    expect(selectNextTask({ todos: [], today: TODAY, plan: null, now: T0 })).toBeNull();
  });
});

describe('selectNextTask — with a plan', () => {
  it('prefers the window happening right now, and marks it current', () => {
    const p = plan([
      { taskId: 'undated', start: T0 - 60 * MINUTE, end: T0 - 30 * MINUTE },
      { taskId: 'upcoming', start: T0, end: T0 + 25 * MINUTE },
    ]);
    const choice = selectNextTask({ todos: list, today: TODAY, plan: p, now: T0 + 5 * MINUTE });
    expect(choice).toMatchObject({
      source: 'scheduled',
      isNow: true,
      window: { start: T0, end: T0 + 25 * MINUTE },
    });
    expect(choice?.todo.id).toBe('upcoming');
  });

  it('falls to the soonest upcoming window when none is current', () => {
    const p = plan([
      { taskId: 'undated', start: T0 + 90 * MINUTE, end: T0 + 120 * MINUTE },
      { taskId: 'upcoming', start: T0 + 30 * MINUTE, end: T0 + 55 * MINUTE },
    ]);
    const choice = selectNextTask({ todos: list, today: TODAY, plan: p, now: T0 });
    expect(choice?.todo.id).toBe('upcoming');
    expect(choice?.isNow).toBe(false);
  });

  it('skips windows whose task is already completed, then falls back to the list', () => {
    const p = plan([{ taskId: 'done', start: T0 + 10 * MINUTE, end: T0 + 25 * MINUTE }]);
    const choice = selectNextTask({
      todos: [...list, todo({ id: 'done', completed: true })],
      today: TODAY,
      plan: p,
      now: T0,
    });
    // The only scheduled task is done, so there is nothing to schedule —
    // selection drops to the list order rather than pointing at finished work.
    expect(choice?.source).toBe('list');
    expect(choice?.todo.id).toBe('overdue');
  });

  it('ignores a plan from another day', () => {
    const p = plan(
      [{ taskId: 'undated', start: T0, end: T0 + 25 * MINUTE }],
      '2026-05-09',
    );
    const choice = selectNextTask({ todos: list, today: TODAY, plan: p, now: T0 + 5 * MINUTE });
    expect(choice?.source).toBe('list');
  });

  it('ignores a window that has already passed and has no successor', () => {
    const p = plan([{ taskId: 'undated', start: T0 - 60 * MINUTE, end: T0 - 30 * MINUTE }]);
    const choice = selectNextTask({ todos: list, today: TODAY, plan: p, now: T0 });
    expect(choice?.source).toBe('list');
    expect(choice?.todo.id).toBe('overdue');
  });
});
