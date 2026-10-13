/**
 * `computeSuggestions`: the pure detection rules.
 *
 * Two triggers — a planned block that ended without its task being done, and
 * progress that has fallen behind the workday — plus the global guard that
 * nothing is suggested while a focus timer runs.
 */

import { computeSuggestions, type SuggestionContext } from '../../replan/suggestions';
import type { DayPlan } from '../../replan/types';
import type { Todo } from '../../todos/model';

const DAY = '2026-05-04';

function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

const PLAN: DayPlan = {
  dayKey: DAY,
  approvedAt: at(9),
  signature: 's',
  placements: [{ taskId: 'report', start: at(10), end: at(11) }],
};

const REPORT: Todo = { id: 'report', text: 'Project report', completed: false, tags: [] };

function context(overrides: Partial<SuggestionContext> = {}): SuggestionContext {
  return {
    now: at(12),
    dayKey: DAY,
    plan: PLAN,
    replanTasks: [],
    todos: [REPORT],
    anyTimerRunning: false,
    workdayStart: '09:00',
    workdayEnd: '18:00',
    ...overrides,
  };
}

describe('computeSuggestions', () => {
  it('returns nothing while a focus timer runs', () => {
    expect(computeSuggestions(context({ anyTimerRunning: true }), [])).toEqual([]);
  });

  it('returns nothing without a plan for the day', () => {
    expect(computeSuggestions(context({ plan: null }), [])).toEqual([]);
    expect(
      computeSuggestions(context({ plan: { ...PLAN, dayKey: '2026-05-03' } }), []),
    ).toEqual([]);
  });

  it('flags a planned block that ended with the task still open', () => {
    const [first] = computeSuggestions(context(), []);
    expect(first).toMatchObject({
      type: 'planned-block-missed',
      taskId: 'report',
      dayKey: DAY,
    });
    expect(first.metadata.missedByMs).toBe(at(12) - at(11));
  });

  it('does not flag a block whose task is already done', () => {
    const done = computeSuggestions(
      context({ todos: [{ ...REPORT, completed: true }] }),
      [],
    );
    expect(done).toEqual([]);
  });

  it('does not flag a block that has not ended yet', () => {
    expect(computeSuggestions(context({ now: at(10, 30) }), [])).toEqual([]);
  });

  it('honours a dismissal by id', () => {
    expect(
      computeSuggestions(context(), ['planned-block-missed:report']),
    ).toEqual([]);
  });

  it('flags falling behind once enough of the workday has passed', () => {
    // 16:00 is ~78% through a 09:00–18:00 workday, with nothing completed.
    const found = computeSuggestions(context({ now: at(16) }), []);
    const behind = found.find((s) => s.type === 'behind-schedule');
    expect(behind).toBeDefined();
    // Minutes, not milliseconds: the whole workday is 540, and ~420 have elapsed.
    expect(behind?.metadata.behindByMins).toBeGreaterThan(300);
    expect(behind?.metadata.behindByMins).toBeLessThanOrEqual(540);
  });

  it('stays quiet when progress keeps pace with the clock', () => {
    const found = computeSuggestions(
      context({ now: at(16), completedPlannedCount: 1, totalPlannedCount: 1 }),
      [],
    );
    expect(found.find((s) => s.type === 'behind-schedule')).toBeUndefined();
  });

  it('stays quiet early in the day even with nothing done', () => {
    // 11:30 is only ~28% through the workday.
    const found = computeSuggestions(context({ now: at(11, 30) }), []);
    expect(found.find((s) => s.type === 'behind-schedule')).toBeUndefined();
  });
});
