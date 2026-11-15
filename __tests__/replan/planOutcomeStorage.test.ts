/**
 * The plan-outcome storage boundary.
 *
 * AsyncStorage is user-writable on a rooted device, so reads are untrusted
 * input. These pin the two guarantees the review maths relies on: malformed
 * records are dropped rather than allowed to poison it, and the windowed load
 * trusts the requested key set over each record's own `dayKey`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadPlanOutcomeForDay,
  loadPlanOutcomes,
  loadPlanOutcomesForDays,
  PLAN_OUTCOMES_KEY,
  savePlanOutcomeForDay,
} from '../../replan/planOutcomeStorage';
import type { PlanOutcome } from '../../replan/types';

function outcome(dayKey: string): PlanOutcome {
  return {
    dayKey,
    planApprovedAt: 1,
    generatedAt: 2,
    planSignature: 'sig',
    results: [
      {
        taskId: 't1',
        taskText: 'Task',
        plannedStart: 0,
        plannedEnd: 600_000,
        wasScheduled: true,
        completed: true,
        completedAt: 300_000,
        actualFocusSeconds: 1200,
        status: 'completed-on-time',
      },
    ],
    summary: {
      totalPlanned: 1,
      completed: 1,
      completedOnTime: 1,
      completedLate: 0,
      postponed: 0,
      missed: 0,
      totalPlannedFocusMins: 10,
      totalActualFocusMins: 20,
    },
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('loadPlanOutcomes — sanitize on read', () => {
  it('returns an empty store when nothing is stored', async () => {
    expect(await loadPlanOutcomes()).toEqual({});
  });

  it('degrades to an empty store on malformed JSON', async () => {
    await AsyncStorage.setItem(PLAN_OUTCOMES_KEY, '{not json');
    expect(await loadPlanOutcomes()).toEqual({});
  });

  it('drops unshaped records and re-keys the rest by their own day', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({
        '2026-05-01': outcome('2026-05-01'),
        '2026-05-02': { nope: true },
        'wrong-key': outcome('2026-05-03'),
        '2026-05-04': 'a string',
      }),
    );

    const store = await loadPlanOutcomes();
    expect(Object.keys(store).sort()).toEqual(['2026-05-01', '2026-05-03']);
    expect(store['2026-05-03'].dayKey).toBe('2026-05-03');
  });

  it('drops malformed results but keeps the rest of the record', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({
        '2026-05-01': {
          ...outcome('2026-05-01'),
          results: [
            { taskId: 't1', status: 'completed-on-time', wasScheduled: true, completed: true },
            { taskId: 't2', status: 'not-a-status' },
            { status: 'missed' },
          ],
        },
      }),
    );

    const store = await loadPlanOutcomes();
    expect(store['2026-05-01'].results.map((r) => r.taskId)).toEqual(['t1']);
  });

  it('round-trips a sanitized career snapshot on a result', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({
        '2026-05-01': {
          ...outcome('2026-05-01'),
          results: [
            {
              ...outcome('2026-05-01').results[0],
              career: {
                goalId: 'goal-1',
                milestoneId: 'milestone-1',
                skillIds: ['skill-1', 'skill-1'],
              },
            },
          ],
        },
      }),
    );

    const store = await loadPlanOutcomes();
    expect(store['2026-05-01'].results[0].career).toEqual({
      goalId: 'goal-1',
      milestoneId: 'milestone-1',
      skillIds: ['skill-1'],
    });
  });
});

describe('loadPlanOutcomesForDays', () => {
  it('returns only the requested days, keyed by the request', async () => {
    await savePlanOutcomeForDay(outcome('2026-05-01'));
    await savePlanOutcomeForDay(outcome('2026-05-02'));
    await savePlanOutcomeForDay(outcome('2026-05-03'));

    const windowed = await loadPlanOutcomesForDays(['2026-05-01', '2026-05-03']);
    expect(Object.keys(windowed).sort()).toEqual(['2026-05-01', '2026-05-03']);
  });
});

describe('savePlanOutcomeForDay / loadPlanOutcomeForDay', () => {
  it('round-trips one day and preserves the others', async () => {
    await savePlanOutcomeForDay(outcome('2026-05-01'));
    await savePlanOutcomeForDay(outcome('2026-05-02'));

    const loaded = await loadPlanOutcomeForDay('2026-05-01');
    expect(loaded?.dayKey).toBe('2026-05-01');
    expect(await loadPlanOutcomes()).toHaveProperty('2026-05-02');
  });
});
