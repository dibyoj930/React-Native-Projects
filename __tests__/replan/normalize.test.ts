/**
 * Input normalisation: the one place raw `Todo`s become engine tasks.
 *
 * The invariants here are the promises the engine leans on: absent priority is
 * `low`, an unusable estimate is dropped rather than guessed, a deadline is
 * derived from `dueDate`/`dueTime` without writing to either, and the signature
 * is stable and order-independent.
 */

import {
  collectCommitments,
  commitmentsConflict,
  computeSignature,
  normalizeReplanInput,
  normalizeReplanTasks,
  type RawReplanInput,
} from '../../replan/normalize';
import { DEFAULT_REPLAN_PREFERENCES } from '../../replan/preferences';
import type { Todo } from '../../todos/model';
import type { DayPlan, ProtectedInterval } from '../../replan/types';

const DAY = '2026-05-04';

function todo(overrides: Partial<Todo> = {}): Todo {
  return { id: 't1', text: 'Task', completed: false, tags: [], createdAt: 1, ...overrides };
}

describe('normalizeReplanTasks', () => {
  it('defaults an absent priority to low and an absent mode to flexible', () => {
    const [task] = normalizeReplanTasks([todo()], []);
    expect(task.priority).toBe('low');
    expect(task.schedulingMode).toBe('flexible');
    expect(task.estimatedMinutes).toBeUndefined();
  });

  it('keeps an explicit priority and mode', () => {
    const [task] = normalizeReplanTasks(
      [todo({ priority: 'high', schedulingMode: 'fixed', fixedStartAt: 123 })],
      [],
    );
    expect(task.priority).toBe('high');
    expect(task.schedulingMode).toBe('fixed');
    expect(task.fixedStartAt).toBe(123);
  });

  it('drops an invalid estimate rather than guessing one', () => {
    expect(normalizeReplanTasks([todo({ estimatedMinutes: 0 })], [])[0].estimatedMinutes).toBeUndefined();
    expect(normalizeReplanTasks([todo({ estimatedMinutes: 12.5 })], [])[0].estimatedMinutes).toBeUndefined();
    expect(normalizeReplanTasks([todo({ estimatedMinutes: 30 })], [])[0].estimatedMinutes).toBe(30);
  });

  it('derives a deadline from the due day and time without altering them', () => {
    const source = todo({ dueDate: DAY, dueTime: '14:30' });
    const [task] = normalizeReplanTasks([source], []);
    expect(task.deadlineAt).toBe(new Date(2026, 4, 4, 14, 30, 0, 0).getTime());
    expect(source.dueDate).toBe(DAY);
    expect(source.dueTime).toBe('14:30');
  });

  it('ignores a fixed anchor left on a flexible task', () => {
    const [task] = normalizeReplanTasks([todo({ fixedStartAt: 999 })], []);
    expect(task.fixedStartAt).toBeUndefined();
  });

  it('flags a task whose timer is running', () => {
    const [task] = normalizeReplanTasks([todo({ id: 'a' })], [
      { taskId: 'a', start: 1, end: 2 },
    ]);
    expect(task.hasActiveTimer).toBe(true);
  });

  it('seeds the planned start from the approved plan', () => {
    const plan: DayPlan = {
      dayKey: DAY,
      approvedAt: 1,
      signature: 's',
      placements: [{ taskId: 'a', start: 500, end: 600 }],
    };
    const [task] = normalizeReplanTasks([todo({ id: 'a' })], [], plan);
    expect(task.plannedStartAt).toBe(500);
  });
});

describe('collectCommitments', () => {
  it('turns a fixed task into a protected window', () => {
    const tasks = normalizeReplanTasks(
      [todo({ id: 'fixed', schedulingMode: 'fixed', fixedStartAt: 1000, estimatedMinutes: 30 })],
      [],
    );
    expect(collectCommitments(tasks, [])).toEqual([
      { id: 'fixed', kind: 'fixedTask', start: 1000, end: 1000 + 30 * 60_000 },
    ]);
  });

  it('turns a running timer into a protected window', () => {
    expect(collectCommitments([], [{ taskId: 'a', start: 10, end: 20 }])).toEqual([
      { id: 'timer-a', kind: 'activeTimer', start: 10, end: 20 },
    ]);
  });

  it('drops a zero-width timer window', () => {
    expect(collectCommitments([], [{ taskId: 'a', start: 10, end: 10 }])).toEqual([]);
  });
});

describe('commitmentsConflict', () => {
  const interval = (id: string, start: number, end: number): ProtectedInterval => ({
    id,
    kind: 'commitment',
    start,
    end,
  });

  it('is false when blocks merely touch', () => {
    expect(commitmentsConflict([interval('a', 0, 10), interval('b', 10, 20)])).toBe(false);
  });

  it('is true when blocks genuinely overlap', () => {
    expect(commitmentsConflict([interval('a', 0, 10), interval('b', 5, 20)])).toBe(true);
  });
});

describe('computeSignature', () => {
  function raw(overrides: Partial<RawReplanInput> = {}): RawReplanInput {
    return {
      now: 1000,
      day: DAY,
      workday: { start: 0, end: 1000 },
      todos: [todo({ id: 'a', estimatedMinutes: 30, priority: 'high' })],
      timerWindows: [],
      preferences: { ...DEFAULT_REPLAN_PREFERENCES },
      ...overrides,
    };
  }

  it('is stable for the same input', () => {
    expect(computeSignature(normalizeReplanInput(raw()))).toBe(
      computeSignature(normalizeReplanInput(raw())),
    );
  });

  it('is independent of task array order', () => {
    const forward = normalizeReplanInput(
      raw({ todos: [todo({ id: 'a' }), todo({ id: 'b' })] }),
    );
    const reversed = normalizeReplanInput(
      raw({ todos: [todo({ id: 'b' }), todo({ id: 'a' })] }),
    );
    expect(computeSignature(forward)).toBe(computeSignature(reversed));
  });

  it('changes when an estimate changes', () => {
    const before = normalizeReplanInput(raw());
    const after = normalizeReplanInput(
      raw({ todos: [todo({ id: 'a', estimatedMinutes: 45, priority: 'high' })] }),
    );
    expect(computeSignature(before)).not.toBe(computeSignature(after));
  });
});

describe('normalizeReplanInput', () => {
  it('yields an empty workday when the window is inverted', () => {
    const input = normalizeReplanInput({
      now: 0,
      day: DAY,
      workday: { start: 100, end: 50 },
      todos: [],
      timerWindows: [],
      preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    });
    expect(input.workday).toEqual({ start: 100, end: 100 });
  });

  it('fills in the signature', () => {
    const input = normalizeReplanInput({
      now: 0,
      day: DAY,
      workday: { start: 0, end: 1000 },
      todos: [],
      timerWindows: [],
      preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    });
    expect(input.signature).toContain('replan-v1');
  });
});
