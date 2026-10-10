/**
 * The daily-goals domain, in isolation.
 *
 * Pure functions, so these are plain `expect` calls — no mocks, no fake timers.
 * The cases that matter are the ones a typed field or a hand-edited store can
 * actually produce: blank, zero, negative, fractional, out of range, and a goal
 * that has already been beaten.
 */

import type { DayRollup } from '../../productivity/domain';
import {
  DEFAULT_DAILY_GOALS,
  MAX_FOCUS_GOAL_MINUTES,
  MAX_TASKS_GOAL,
  goalsProgress,
  motivationFor,
  motivationStateFor,
  parseFocusGoal,
  parseTaskGoal,
  sanitizeGoals,
} from '../../daily-goals/goals';

function rollup(overrides: Partial<DayRollup> = {}): DayRollup {
  return {
    day: '2025-03-06',
    focusedSeconds: 0,
    totalSessions: 0,
    completedSessions: 0,
    tasksCompleted: 0,
    isFocusCompleted: false,
    ...overrides,
  };
}

describe('parseTaskGoal', () => {
  it('accepts whole numbers within range', () => {
    expect(parseTaskGoal('1')).toBe(1);
    expect(parseTaskGoal('3')).toBe(3);
    expect(parseTaskGoal(' 12 ')).toBe(12);
    expect(parseTaskGoal(String(MAX_TASKS_GOAL))).toBe(MAX_TASKS_GOAL);
  });

  it('rejects zero, negatives, fractions and anything non-numeric', () => {
    expect(parseTaskGoal('0')).toBeNull();
    expect(parseTaskGoal('-2')).toBeNull();
    expect(parseTaskGoal('2.5')).toBeNull();
    expect(parseTaskGoal('1e2')).toBeNull();
    expect(parseTaskGoal('3 tasks')).toBeNull();
    expect(parseTaskGoal('')).toBeNull();
    expect(parseTaskGoal('   ')).toBeNull();
  });

  it('rejects a value above the cap', () => {
    expect(parseTaskGoal(String(MAX_TASKS_GOAL + 1))).toBeNull();
  });
});

describe('parseFocusGoal', () => {
  it('accepts whole minutes within range', () => {
    expect(parseFocusGoal('25')).toBe(25);
    expect(parseFocusGoal(' 45 ')).toBe(45);
    expect(parseFocusGoal(String(MAX_FOCUS_GOAL_MINUTES))).toBe(MAX_FOCUS_GOAL_MINUTES);
  });

  it('rejects zero, negatives, fractions and anything non-numeric', () => {
    expect(parseFocusGoal('0')).toBeNull();
    expect(parseFocusGoal('-25')).toBeNull();
    expect(parseFocusGoal('30m')).toBeNull();
    expect(parseFocusGoal('1.5')).toBeNull();
    expect(parseFocusGoal('')).toBeNull();
  });

  it('rejects a value above the cap', () => {
    expect(parseFocusGoal(String(MAX_FOCUS_GOAL_MINUTES + 1))).toBeNull();
  });
});

describe('sanitizeGoals', () => {
  it('falls back to the shipped defaults for a missing or non-object value', () => {
    expect(sanitizeGoals(undefined)).toEqual(DEFAULT_DAILY_GOALS);
    expect(sanitizeGoals(null)).toEqual(DEFAULT_DAILY_GOALS);
    expect(sanitizeGoals(42)).toEqual(DEFAULT_DAILY_GOALS);
    expect(sanitizeGoals('5')).toEqual(DEFAULT_DAILY_GOALS);
  });

  it('keeps valid fields', () => {
    expect(sanitizeGoals({ focusMinutes: 45, tasksCompleted: 3 })).toEqual({
      focusMinutes: 45,
      tasksCompleted: 3,
    });
  });

  it('repairs a bad field without discarding the good one', () => {
    expect(sanitizeGoals({ focusMinutes: 45, tasksCompleted: 0 })).toEqual({
      focusMinutes: 45,
      tasksCompleted: DEFAULT_DAILY_GOALS.tasksCompleted,
    });
    expect(sanitizeGoals({ focusMinutes: Number.NaN, tasksCompleted: 4 })).toEqual({
      focusMinutes: DEFAULT_DAILY_GOALS.focusMinutes,
      tasksCompleted: 4,
    });
  });

  it('truncates fractions and clamps out-of-range values to the default', () => {
    expect(sanitizeGoals({ focusMinutes: 45.9, tasksCompleted: 2.9 })).toEqual({
      focusMinutes: 45,
      tasksCompleted: 2,
    });
    expect(sanitizeGoals({ focusMinutes: -10, tasksCompleted: MAX_TASKS_GOAL + 1 })).toEqual(
      DEFAULT_DAILY_GOALS,
    );
  });
});

describe('goalsProgress', () => {
  it('treats a missing day as zero progress against the goals', () => {
    expect(goalsProgress(undefined, { focusMinutes: 25, tasksCompleted: 2 })).toEqual({
      tasksCompleted: 0,
      tasksGoal: 2,
      focusMinutes: 0,
      focusGoalMinutes: 25,
      tasksRatio: 0,
      focusRatio: 0,
    });
  });

  it('measures a partly finished day', () => {
    const progress = goalsProgress(
      rollup({ focusedSeconds: 10 * 60, tasksCompleted: 1 }),
      { focusMinutes: 25, tasksCompleted: 4 },
    );
    expect(progress.focusMinutes).toBe(10);
    expect(progress.focusRatio).toBeCloseTo(0.4);
    expect(progress.tasksRatio).toBe(0.25);
  });

  it('clamps a beaten goal to 1 while still reporting the overshoot', () => {
    const progress = goalsProgress(
      rollup({ focusedSeconds: 60 * 60, tasksCompleted: 3 }),
      { focusMinutes: 25, tasksCompleted: 2 },
    );
    expect(progress.focusMinutes).toBe(60);
    expect(progress.focusRatio).toBe(1);
    expect(progress.tasksCompleted).toBe(3);
    expect(progress.tasksRatio).toBe(1);
  });
});

describe('motivation', () => {
  const at = (
    tasksCompleted: number,
    focusMinutes: number,
  ) =>
    goalsProgress(rollup({ tasksCompleted, focusedSeconds: focusMinutes * 60 }), {
      focusMinutes: 30,
      tasksCompleted: 3,
    });

  it('starts with an encouraging line at zero', () => {
    expect(
      motivationStateFor(goalsProgress(undefined, { focusMinutes: 25, tasksCompleted: 1 })),
    ).toBe('gettingStarted');
    expect(
      motivationFor(goalsProgress(undefined, { focusMinutes: 25, tasksCompleted: 1 })),
    ).toBe('One step at a time. Keep going.');
  });

  it('recognises progress that is underway', () => {
    expect(motivationStateFor(at(1, 0))).toBe('inProgress');
    expect(motivationFor(at(1, 0))).toBe("You're building momentum.");
  });

  it('recognises being close to a goal', () => {
    // 24 of 30 minutes is 0.8 — past the "close" threshold.
    expect(motivationStateFor(at(0, 24))).toBe('almostThere');
    expect(motivationFor(at(0, 24))).toBe("You're getting closer to today's goal.");
  });

  it('distinguishes each single goal met from both', () => {
    expect(motivationStateFor(at(3, 0))).toBe('tasksMet');
    expect(motivationFor(at(3, 0))).toBe('Every completed task counts. Goal met!');
    expect(motivationStateFor(at(0, 30))).toBe('focusMet');
    expect(motivationFor(at(0, 30))).toBe("You've hit your daily focus goal. Nice work!");
    expect(motivationStateFor(at(3, 30))).toBe('bothMet');
    expect(motivationFor(at(3, 30))).toBe("You've hit both goals. Nice work!");
  });

  it('still counts a goal that was beaten', () => {
    expect(motivationStateFor(at(9, 300))).toBe('bothMet');
  });
});
