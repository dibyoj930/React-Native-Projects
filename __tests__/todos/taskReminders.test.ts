/**
 * The pure task-reminder plan.
 *
 * "Which tasks deserve an OS notification, and at what instant" is a decision,
 * so it lives in a function that takes the list and the clock and returns data —
 * no Notifee, no renderer. These tests pin the three exclusions that would
 * otherwise be easy to get wrong: a task with no time, a task whose moment has
 * passed, and a task that is already done.
 */

import type { Todo } from '../../todos/model';
import { dueAt, planTaskReminders } from '../../todos/taskReminders';

/** 4 May 2026, 08:00 local — `jest.setup.js` pins the suite to Asia/Kolkata. */
const NOW = new Date(2026, 4, 4, 8, 0, 0, 0).getTime();

/** Epoch ms for a local date and time, so the expected instants read clearly. */
function at(year: number, month: number, day: number, hours: number, minutes: number): number {
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: 'Write the report',
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

describe('dueAt', () => {
  it('combines the day key and the time into a local instant', () => {
    expect(dueAt(todo({ dueDate: '2026-05-04', dueTime: '14:30' }))).toBe(
      at(2026, 5, 4, 14, 30),
    );
  });

  it('is null without a time', () => {
    expect(dueAt(todo({ dueDate: '2026-05-04' }))).toBeNull();
  });

  it('is null without a date', () => {
    expect(dueAt(todo({ dueTime: '14:30' }))).toBeNull();
  });

  it('is null for a malformed time', () => {
    expect(dueAt(todo({ dueDate: '2026-05-04', dueTime: '25:00' }))).toBeNull();
  });
});

describe('planTaskReminders', () => {
  it('schedules an open task whose moment is still ahead', () => {
    const planned = planTaskReminders(
      [todo({ id: 't1', text: 'Write the report', dueDate: '2026-05-04', dueTime: '09:00' })],
      NOW,
    );

    expect(planned).toEqual([
      {
        taskId: 't1',
        fireAt: at(2026, 5, 4, 9, 0),
        title: 'Write the report',
        body: 'Task reminder',
      },
    ]);
  });

  it('drops a task whose moment has already passed', () => {
    const planned = planTaskReminders(
      [todo({ dueDate: '2026-05-04', dueTime: '07:00' })],
      NOW,
    );
    expect(planned).toEqual([]);
  });

  it('drops a task with no time, because there is no instant to fire at', () => {
    const planned = planTaskReminders([todo({ dueDate: '2026-05-04' })], NOW);
    expect(planned).toEqual([]);
  });

  it('drops a completed task even when its moment is still ahead', () => {
    const planned = planTaskReminders(
      [todo({ completed: true, dueDate: '2026-05-04', dueTime: '09:00' })],
      NOW,
    );
    expect(planned).toEqual([]);
  });

  it('keeps the list order of the tasks it schedules', () => {
    const planned = planTaskReminders(
      [
        todo({ id: 'a', dueDate: '2026-05-06', dueTime: '10:00' }),
        todo({ id: 'b', dueDate: '2026-05-05', dueTime: '10:00' }),
        todo({ id: 'c', dueDate: '2026-05-04', dueTime: '10:00' }),
      ],
      NOW,
    );
    expect(planned.map((reminder) => reminder.taskId)).toEqual(['a', 'b', 'c']);
  });

  it('plans nothing for an empty list', () => {
    expect(planTaskReminders([], NOW)).toEqual([]);
  });
});
