/**
 * `usePlanOutcome`: the plan-vs-actual controller.
 *
 * The classification is pure and tested in `replan/planOutcome.test.ts`; what
 * these pin is the controller — that it derives from the approved plan and the
 * attribution map, that "yesterday" is the day before the outcome's own day key,
 * and that saving lands under that key.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { usePlanOutcome, type PlanOutcomeController } from '../../hooks/usePlanOutcome';
import { PLAN_OUTCOMES_KEY } from '../../replan/planOutcomeStorage';
import type { DayPlan, PlanOutcome } from '../../replan/types';
import type { Todo } from '../../todos/model';
import type { Attribution } from '../../productivity/domain';
import { render } from '../support/render';

const DAY = '2026-05-04';

/** 4 May 2026 at `hours:minutes` local. */
function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

const PLAN: DayPlan = {
  dayKey: DAY,
  approvedAt: at(9),
  signature: 'sig',
  placements: [
    { taskId: 'a', start: at(10), end: at(11) },
    { taskId: 'b', start: at(11), end: at(12) },
  ],
};

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return { text: overrides.id, completed: false, tags: [], createdAt: 0, ...overrides };
}

function attributionWith(focusedSecondsByTask: Record<string, number>) {
  const map = new Map<string, Attribution>();
  for (const [taskId, focusedSeconds] of Object.entries(focusedSecondsByTask)) {
    map.set(taskId, {
      taskId,
      focusedSeconds,
      sessionCount: 1,
      isFocusCompleted: true,
      isTimerCompleted: true,
      firstSessionAt: at(10),
      lastSessionAt: at(11),
    });
  }
  return map;
}

let api: PlanOutcomeController | undefined;

function Probe({ now }: { now: number }) {
  api = usePlanOutcome({
    hydrated: true,
    dayKey: DAY,
    plan: PLAN,
    todos: [
      todo({ id: 'a', completed: true, completedAt: at(10, 30) }),
      todo({ id: 'b' }),
    ],
    attribution: attributionWith({ a: 1500 }),
    now,
  });
  return null;
}

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePlanOutcome', () => {
  it('classifies on-time, missed and focus minutes from the plan and attribution', async () => {
    await render(<Probe now={at(13)} />);

    expect(api?.outcome.summary).toMatchObject({
      totalPlanned: 2,
      completed: 1,
      completedOnTime: 1,
      missed: 1,
      totalActualFocusMins: 25,
    });
    expect(api?.outcome.results.map((r) => r.status)).toEqual([
      'completed-on-time',
      'missed',
    ]);
  });

  it('reports an empty comparison when there is no plan for the day', async () => {
    function NoPlanProbe() {
      api = usePlanOutcome({
        hydrated: true,
        dayKey: DAY,
        plan: null,
        todos: [],
        attribution: undefined,
        now: at(13),
      });
      return null;
    }
    await render(<NoPlanProbe />);
    expect(api?.outcome.summary.totalPlanned).toBe(0);
    expect(api?.outcome.results).toEqual([]);
  });

  it('saves under the outcome day and reads the previous day back', async () => {
    await render(<Probe now={at(13)} />);

    const yesterday: PlanOutcome = { ...api!.outcome, dayKey: '2026-05-03' };
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({ '2026-05-03': yesterday }),
    );

    await ReactTestRenderer.act(async () => {
      await api?.saveOutcome();
    });

    const loaded = await api!.loadYesterday();
    expect(loaded?.dayKey).toBe('2026-05-03');

    const raw = await AsyncStorage.getItem(PLAN_OUTCOMES_KEY);
    const store = JSON.parse(raw as string) as Record<string, PlanOutcome>;
    expect(store[DAY].summary.completed).toBe(1);
  });
});
