/**
 * `computePlanOutcome`: the pure plan-vs-actual classification.
 *
 * Each placement is classified against the task's completion time and the
 * current clock, and the per-task focus attribution (in seconds) rolls up into
 * the comparison's focus minutes.
 */

import { computePlanOutcome } from '../../replan/planOutcome';
import type { DayPlan } from '../../replan/types';
import type { Todo } from '../../todos/model';
import type { Attribution } from '../../productivity/domain';

const dayKey = '2026-05-04';

function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

function makePlan(): DayPlan {
  return {
    dayKey,
    approvedAt: at(9),
    signature: 'sig',
    placements: [{ taskId: 't1', start: at(10), end: at(11) }],
  };
}

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 't1',
    text: 'Task',
    completed: false,
    tags: [],
    ...overrides,
  };
}

function attribution(focusedSeconds: number): Map<string, Attribution> {
  return new Map([
    [
      't1',
      {
        taskId: 't1',
        focusedSeconds,
        sessionCount: 1,
        isFocusCompleted: true,
        isTimerCompleted: true,
        firstSessionAt: at(10),
        lastSessionAt: at(11),
      },
    ],
  ]);
}

describe('planOutcome', () => {
  it('marks completed on time when the task closed within its window', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30) })],
      now: at(15),
    });
    expect(res.summary.completed).toBe(1);
    expect(res.results[0].status).toBe('completed-on-time');
  });

  it('marks completed late when the task closed after its window', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(12) })],
      now: at(15),
    });
    expect(res.results[0].status).toBe('completed-late');
  });

  it('marks missed when the window ended and the task is still open', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: false })],
      now: at(15),
    });
    expect(res.results[0].status).toBe('missed');
  });

  it('marks ongoing while the window has not ended and the task is open', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: false })],
      now: at(10, 30),
    });
    expect(res.results[0].status).toBe('ongoing');
  });

  it('rolls per-task focus seconds up into minutes', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30) })],
      attribution: attribution(1500), // 25 minutes
      now: at(15),
    });
    expect(res.summary.totalActualFocusMins).toBe(25);
    expect(res.results[0].actualFocusSeconds).toBe(1500);
  });

  it('returns an empty comparison when the plan is for another day', () => {
    const res = computePlanOutcome({
      dayKey: '2026-05-05',
      plan: makePlan(),
      todos: [makeTodo({})],
      now: at(15),
    });
    expect(res.summary.totalPlanned).toBe(0);
    expect(res.results).toEqual([]);
  });
});
