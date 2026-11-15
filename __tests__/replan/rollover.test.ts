/**
 * Cross-day rollover and outcome finalisation.
 *
 * "Postponed" is the one plan-outcome fact a single day cannot establish: it
 * needs a *later* recorded plan. These tests pin that derivation — including its
 * refusal to invent a carry when the later day is unknown — and the overlay that
 * settles a stored outcome against today's clock and the session log.
 */

import {
  aggregateOutcomes,
  deriveRollover,
  finalizeOutcome,
} from '../../replan/rollover';
import type { PlanOutcome, PlannedTaskResult } from '../../replan/types';

function result(overrides: Partial<PlannedTaskResult> = {}): PlannedTaskResult {
  return {
    taskId: 't1',
    wasScheduled: true,
    completed: false,
    status: 'missed',
    ...overrides,
  };
}

function outcome(dayKey: string, results: PlannedTaskResult[]): PlanOutcome {
  return {
    dayKey,
    planApprovedAt: 1,
    generatedAt: 1,
    planSignature: 'sig',
    results,
    summary: {
      totalPlanned: results.length,
      completed: results.filter((r) => r.completed).length,
      completedOnTime: results.filter((r) => r.status === 'completed-on-time').length,
      completedLate: results.filter((r) => r.status === 'completed-late').length,
      postponed: results.filter((r) => r.status === 'postponed').length,
      missed: results.filter((r) => r.status === 'missed').length,
    },
  };
}

const DAY_1 = '2026-05-01';
const DAY_2 = '2026-05-02';
const DAY_3 = '2026-05-03';

describe('deriveRollover', () => {
  it('carries an unfinished task into the next day that plans it', () => {
    const report = deriveRollover({
      outcomesByDay: {
        [DAY_1]: outcome(DAY_1, [result({ taskId: 't1' })]),
        [DAY_2]: outcome(DAY_2, [result({ taskId: 't1', completed: true, status: 'completed-on-time' })]),
      },
      livePlan: null,
      liveDayKey: DAY_3,
      days: [DAY_1, DAY_2, DAY_3],
    });

    expect(report.carriedForwardByDay.get(DAY_1)).toEqual(new Set(['t1']));
    expect(report.edges).toEqual([{ taskId: 't1', fromDay: DAY_1, toDay: DAY_2 }]);
  });

  it('does not carry a task when the later day has no record', () => {
    // DAY_2 is unknown: a missing outcome means "we cannot say", never "nothing
    // was planned there".
    const report = deriveRollover({
      outcomesByDay: {
        [DAY_1]: outcome(DAY_1, [result({ taskId: 't1' })]),
      },
      livePlan: null,
      liveDayKey: DAY_2,
      days: [DAY_1, DAY_2],
    });

    expect(report.carriedForwardByDay.get(DAY_1)).toBeUndefined();
    expect(report.edges).toEqual([]);
  });

  it('does not double-count a task carried through several plans', () => {
    const report = deriveRollover({
      outcomesByDay: {
        [DAY_1]: outcome(DAY_1, [result({ taskId: 't1' })]),
        [DAY_2]: outcome(DAY_2, [result({ taskId: 't1' })]),
      },
      livePlan: { dayKey: DAY_3, approvedAt: 1, signature: 's', placements: [{ taskId: 't1', start: 1, end: 2 }] },
      liveDayKey: DAY_3,
      days: [DAY_1, DAY_2, DAY_3],
    });

    // One edge per hop, and each day's set holds the task once.
    expect(report.edges).toEqual([
      { taskId: 't1', fromDay: DAY_1, toDay: DAY_2 },
      { taskId: 't1', fromDay: DAY_2, toDay: DAY_3 },
    ]);
    expect(report.carriedForwardByDay.get(DAY_1)).toEqual(new Set(['t1']));
    expect(report.carriedForwardByDay.get(DAY_2)).toEqual(new Set(['t1']));
  });

  it('ignores completed tasks and today as a source', () => {
    const report = deriveRollover({
      outcomesByDay: {
        [DAY_1]: outcome(DAY_1, [result({ taskId: 't1', completed: true, status: 'completed-late' })]),
      },
      livePlan: { dayKey: DAY_2, approvedAt: 1, signature: 's', placements: [{ taskId: 't1', start: 1, end: 2 }] },
      liveDayKey: DAY_2,
      days: [DAY_1, DAY_2],
    });
    expect(report.edges).toEqual([]);
  });
});

describe('finalizeOutcome', () => {
  it('settles a stored ongoing window as missed once it has ended', () => {
    const stored = outcome(DAY_1, [
      result({ taskId: 't1', status: 'ongoing', plannedStart: 0, plannedEnd: 100 }),
    ]);
    const final = finalizeOutcome(stored, { now: 1000 });
    expect(final.results[0].status).toBe('missed');
    expect(final.summary.missed).toBe(1);
  });

  it('settles it as postponed when it was carried forward', () => {
    const stored = outcome(DAY_1, [
      result({ taskId: 't1', status: 'ongoing', plannedStart: 0, plannedEnd: 100 }),
    ]);
    const final = finalizeOutcome(stored, {
      now: 1000,
      carriedForward: new Set(['t1']),
    });
    expect(final.results[0].status).toBe('postponed');
    expect(final.summary.postponed).toBe(1);
    expect(final.summary.missed).toBe(0);
  });

  it('never recomputes completion — the day owns it', () => {
    const stored = outcome(DAY_1, [
      result({ taskId: 't1', completed: true, completedAt: 50, status: 'completed-late' }),
    ]);
    const final = finalizeOutcome(stored, { now: 10_000 });
    expect(final.results[0].completed).toBe(true);
    expect(final.results[0].status).toBe('completed-late');
  });

  it('overlays per-task focus from the session log', () => {
    const stored = outcome(DAY_1, [
      result({ taskId: 't1', status: 'missed', plannedStart: 0, plannedEnd: 600_000 }),
      result({ taskId: 't2', status: 'missed', plannedStart: 0, plannedEnd: 600_000 }),
    ]);
    const final = finalizeOutcome(stored, {
      now: 1000,
      focusByTask: new Map([['t1', 1800]]),
    });
    expect(final.results[0].actualFocusSeconds).toBe(1800);
    expect(final.results[1].actualFocusSeconds).toBe(0);
    expect(final.summary.totalActualFocusMins).toBe(30);
    expect(final.summary.totalPlannedFocusMins).toBe(20);
  });

  it('keeps stored focus when the log cannot speak for the day', () => {
    const stored = outcome(DAY_1, [
      result({ taskId: 't1', status: 'missed', actualFocusSeconds: 900 }),
    ]);
    stored.summary.totalActualFocusMins = 15;
    const final = finalizeOutcome(stored, { now: 1000, focusByTask: null });
    expect(final.results[0].actualFocusSeconds).toBe(900);
    expect(final.summary.totalActualFocusMins).toBe(15);
  });
});

describe('aggregateOutcomes', () => {
  it('counts occurrences per day but distinct tasks once', () => {
    const aggregate = aggregateOutcomes([
      outcome(DAY_1, [result({ taskId: 't1' }), result({ taskId: 't2', completed: true, status: 'completed-on-time' })]),
      outcome(DAY_2, [result({ taskId: 't1', status: 'postponed' })]),
      undefined,
    ]);

    expect(aggregate.daysWithData).toBe(2);
    expect(aggregate.plannedOccurrences).toBe(3);
    expect(aggregate.distinctPlannedTasks).toBe(2);
    expect(aggregate.completedOccurrences).toBe(1);
    expect(aggregate.postponedOccurrences).toBe(1);
    expect(aggregate.distinctPostponedTasks).toBe(1);
  });

  it('does not count an unplanned completed row as planned work', () => {
    // Today's comparison now carries completed tasks the rebuilt plan dropped
    // (`wasScheduled: false`). They are real completions, but they were not part
    // of the plan being measured, so they must not inflate the planned totals.
    const aggregate = aggregateOutcomes([
      outcome(DAY_1, [
        result({ taskId: 't1' }),
        result({
          taskId: 't2',
          wasScheduled: false,
          completed: true,
          status: 'completed-on-time',
        }),
      ]),
    ]);

    expect(aggregate.plannedOccurrences).toBe(1);
    expect(aggregate.distinctPlannedTasks).toBe(1);
    expect(aggregate.completedOccurrences).toBe(1);
    expect(aggregate.distinctCompletedTasks).toBe(1);
  });
});
