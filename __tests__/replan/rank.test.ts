/**
 * The deterministic task ordering.
 *
 * Placement follows this comparator and nothing else, so these tests pin the full
 * precedence — priority, then deadline, then planned start, then a stable
 * tie-break — and the property that matters most: shuffling the input cannot
 * change the order.
 */

import { compareReplanTasks, rankFlexibleTasks } from '../../replan/rank';
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
