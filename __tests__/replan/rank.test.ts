/**
 * The deterministic task ordering.
 *
 * Placement follows this comparator and nothing else, so these tests pin the full
 * precedence — priority, then deadline, then planned start, then a stable
 * tie-break — and the property that matters most: shuffling the input cannot
 * change the order.
 */

import {
  compareForScheduling,
  compareReplanTasks,
  rankFlexibleTasks,
  rankSchedulableTasks,
} from '../../replan/rank';
import type { ReplanTask } from '../../replan/types';

function task(overrides: Partial<ReplanTask> & { id: string }): ReplanTask {
  return { text: overrides.id, completed: false, hasActiveTimer: false, ...overrides };
}

describe('compareReplanTasks', () => {
  it('orders high before medium before low', () => {
    const low = task({ id: 'low', priority: 'low' });
    const high = task({ id: 'high', priority: 'high' });
    const medium = task({ id: 'medium', priority: 'medium' });
    expect([low, high, medium].sort(compareReplanTasks).map((entry) => entry.id)).toEqual([
      'high',
      'medium',
      'low',
    ]);
  });

  it('treats an absent priority as low', () => {
    const absent = task({ id: 'absent' });
    const medium = task({ id: 'medium', priority: 'medium' });
    expect(compareReplanTasks(absent, medium)).toBeGreaterThan(0);
  });

  it('breaks a priority tie by the earliest deadline', () => {
    const later = task({ id: 'later', priority: 'high', deadlineAt: 200 });
    const sooner = task({ id: 'sooner', priority: 'high', deadlineAt: 100 });
    expect([later, sooner].sort(compareReplanTasks)[0].id).toBe('sooner');
  });

  it('sorts a task with no deadline after one that has one', () => {
    const none = task({ id: 'none', priority: 'high' });
    const dated = task({ id: 'dated', priority: 'high', deadlineAt: 100 });
    expect([none, dated].sort(compareReplanTasks)[0].id).toBe('dated');
  });

  it('breaks a deadline tie by the earliest planned start', () => {
    const later = task({ id: 'later', plannedStartAt: 200 });
    const sooner = task({ id: 'sooner', plannedStartAt: 100 });
    expect([later, sooner].sort(compareReplanTasks)[0].id).toBe('sooner');
  });

  it('falls back to createdAt, then id, for a total order', () => {
    const first = task({ id: 'b', createdAt: 1 });
    const second = task({ id: 'a', createdAt: 1 });
    const older = task({ id: 'c', createdAt: 0 });
    expect([first, second, older].sort(compareReplanTasks).map((entry) => entry.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});

describe('rankFlexibleTasks', () => {
  it('returns a new array and leaves the input untouched', () => {
    const input = [task({ id: 'b', priority: 'low' }), task({ id: 'a', priority: 'high' })];
    const ranked = rankFlexibleTasks(input);
    expect(ranked.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(input.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('is shuffle-invariant', () => {
    const tasks = [
      task({ id: 'a', priority: 'medium', deadlineAt: 300 }),
      task({ id: 'b', priority: 'high' }),
      task({ id: 'c', priority: 'low' }),
      task({ id: 'd', priority: 'medium', deadlineAt: 100 }),
    ];
    const expected = rankFlexibleTasks(tasks).map((entry) => entry.id);
    const shuffled = [...tasks].reverse();
    expect(rankFlexibleTasks(shuffled).map((entry) => entry.id)).toEqual(expected);
  });
});

describe('compareForScheduling', () => {
  it('puts a hard deadline ahead of priority', () => {
    // The whole point: the urgent low-priority task must be placed first, or a
    // non-urgent high-priority task can consume its only window.
    const urgent = task({ id: 'urgent', priority: 'low', deadlineAt: 100 });
    const casual = task({ id: 'casual', priority: 'high' });
    expect([casual, urgent].sort(compareForScheduling)[0].id).toBe('urgent');
  });

  it('orders two deadlines earliest first', () => {
    const later = task({ id: 'later', priority: 'high', deadlineAt: 200 });
    const sooner = task({ id: 'sooner', priority: 'low', deadlineAt: 100 });
    expect([later, sooner].sort(compareForScheduling)[0].id).toBe('sooner');
  });

  it('sorts a deadline-less task after one that has a deadline', () => {
    const none = task({ id: 'none', priority: 'high' });
    const dated = task({ id: 'dated', priority: 'low', deadlineAt: 100 });
    expect([none, dated].sort(compareForScheduling)[0].id).toBe('dated');
  });

  it('falls back to priority when both deadlines are absent', () => {
    const low = task({ id: 'low', priority: 'low' });
    const high = task({ id: 'high', priority: 'high' });
    expect([low, high].sort(compareForScheduling).map((entry) => entry.id)).toEqual([
      'high',
      'low',
    ]);
  });

  it('falls back to planned start, then createdAt, then id', () => {
    const later = task({ id: 'later', plannedStartAt: 200 });
    const sooner = task({ id: 'sooner', plannedStartAt: 100 });
    expect([later, sooner].sort(compareForScheduling)[0].id).toBe('sooner');

    const first = task({ id: 'b', createdAt: 1 });
    const second = task({ id: 'a', createdAt: 1 });
    expect([first, second].sort(compareForScheduling).map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('rankSchedulableTasks', () => {
  it('is shuffle-invariant and does not mutate the input', () => {
    const tasks = [
      task({ id: 'a', priority: 'high' }),
      task({ id: 'b', priority: 'low', deadlineAt: 300 }),
      task({ id: 'c', priority: 'medium', deadlineAt: 100 }),
    ];
    const expected = rankSchedulableTasks(tasks).map((entry) => entry.id);
    expect(expected).toEqual(['c', 'b', 'a']);
    expect(rankSchedulableTasks([...tasks].reverse()).map((entry) => entry.id)).toEqual(expected);
    expect(tasks.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });
});
