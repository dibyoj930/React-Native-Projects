/**
 * `usePlanReview`: the rolling 7-day review controller.
 *
 * The pieces it composes are tested in isolation (`rollover`, `planFocus`,
 * `learning`, `planOutcome`); what these pin is the assembly — that a past day's
 * stored outcome is re-finalised against the session log and the rollover, that
 * today comes from the live plan, and that calibration is advisory until the
 * user applies it.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { usePlanReview, type PlanReview } from '../../hooks/usePlanReview';
import { PLAN_OUTCOMES_KEY } from '../../replan/planOutcomeStorage';
import type { DayPlan, PlanOutcome, PlannedTaskResult } from '../../replan/types';
import type { Todo } from '../../todos/model';
import type { FocusSession } from '../../productivity/domain';
import { render } from '../support/render';

const TODAY = '2026-05-04';

function at(day: number, hours: number, minutes = 0): number {
  return new Date(2026, 4, day, hours, minutes, 0, 0).getTime();
}

const NOW = at(4, 12);

function result(overrides: Partial<PlannedTaskResult> = {}): PlannedTaskResult {
  return {
    taskId: 't1',
    wasScheduled: true,
    completed: false,
    status: 'ongoing',
    plannedStart: at(2, 10),
    plannedEnd: at(2, 10, 30),
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
      completedLate: 0,
      postponed: 0,
      missed: 0,
    },
  };
}

function session(id: string, taskId: string | null, startedAt: number, focusedSeconds: number): FocusSession {
  return {
    id,
    taskId,
    startedAt,
    endedAt: startedAt + focusedSeconds * 1000,
    focusedSeconds,
    status: 'completed',
  };
}

function todo(id: string, estimatedMinutes?: number): Todo {
  return { id, text: id, completed: false, tags: [], createdAt: 1, estimatedMinutes };
}

let api: PlanReview | undefined;
let tree: ReactTestRenderer.ReactTestRenderer | undefined;

type ProbeProps = {
  plan?: DayPlan | null;
  todos?: readonly Todo[];
  sessions?: readonly FocusSession[];
  onApply?: (taskId: string, minutes: number) => void;
};

function Probe({ plan = null, todos = [], sessions = [], onApply = () => {} }: ProbeProps) {
  api = usePlanReview({
    hydrated: true,
    today: TODAY,
    plan,
    todos,
    sessions,
    onApplyEstimate: onApply,
    now: NOW,
  });
  return null;
}

async function renderProbe(props: ProbeProps = {}): Promise<void> {
  tree = await render(<Probe {...props} />);
  // The outcome store loads in an effect; let its promise chain settle.
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 4, 12, 0, 0));
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api = undefined;
  tree = undefined;
});

afterEach(async () => {
  if (tree) {
    await ReactTestRenderer.act(async () => {
      tree?.unmount();
    });
  }
  jest.useRealTimers();
});

describe('usePlanReview — the window', () => {
  it('covers seven local days, today last', async () => {
    await renderProbe();
    expect(api?.days).toHaveLength(7);
    expect(api?.days[0].dayKey).toBe('2026-04-28');
    expect(api?.days[6]).toMatchObject({ dayKey: TODAY, isToday: true });
  });

  it('flags a day the session log cannot speak for', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({ '2026-05-02': outcome('2026-05-02', [result()]) }),
    );
    await renderProbe();
    const day = api?.days.find((d) => d.dayKey === '2026-05-02');
    expect(day?.focusAvailable).toBe(false);
  });
});

describe('usePlanReview — rollover', () => {
  it('turns a stored ongoing task into postponed when a later plan holds it', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({
        '2026-05-02': outcome('2026-05-02', [result({ taskId: 't1' })]),
        '2026-05-03': outcome('2026-05-03', [
          result({ taskId: 't1', plannedStart: at(3, 9), plannedEnd: at(3, 9, 30) }),
          result({ taskId: 't2', plannedStart: at(3, 10), plannedEnd: at(3, 10, 30) }),
        ]),
      }),
    );
    const livePlan: DayPlan = {
      dayKey: TODAY,
      approvedAt: 1,
      signature: 's',
      placements: [{ taskId: 't2', start: at(4, 9), end: at(4, 9, 30) }],
    };

    await renderProbe({ plan: livePlan });

    const day2 = api?.days.find((d) => d.dayKey === '2026-05-02');
    const day3 = api?.days.find((d) => d.dayKey === '2026-05-03');
    expect(day2?.outcome?.results[0].status).toBe('postponed');
    const day3Statuses = day3?.outcome?.results.map((r) => r.status);
    expect(day3Statuses).toEqual(['missed', 'postponed']);
    expect(api?.aggregate.postponedOccurrences).toBe(2);
  });
});

describe('usePlanReview — focus overlay', () => {
  it('recomputes a past day’s focus from the session log', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({ '2026-05-02': outcome('2026-05-02', [result({ taskId: 't1' })]) }),
    );
    await renderProbe({
      sessions: [session('s1', 't1', at(2, 10), 1500)],
    });

    const day2 = api?.days.find((d) => d.dayKey === '2026-05-02');
    expect(day2?.focusAvailable).toBe(true);
    expect(day2?.outcome?.results[0].actualFocusSeconds).toBe(1500);
  });
});

describe('usePlanReview — calibration', () => {
  function completed(day: number, taskId: string, plannedMins: number, actualMins: number): PlannedTaskResult {
    return result({
      taskId,
      completed: true,
      status: 'completed-on-time',
      plannedStart: at(day, 9),
      plannedEnd: at(day, 9) + plannedMins * 60_000,
      actualFocusSeconds: actualMins * 60,
    });
  }

  it('suggests a better estimate once there is enough history', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({
        '2026-05-01': outcome('2026-05-01', [completed(1, 't9', 10, 20)]),
        '2026-05-02': outcome('2026-05-02', [completed(2, 't9', 10, 20)]),
        '2026-05-03': outcome('2026-05-03', [completed(3, 't9', 10, 20)]),
      }),
    );

    await renderProbe({
      todos: [todo('t9', 10)],
      sessions: [
        session('s1', 't9', at(1, 10), 1200),
        session('s2', 't9', at(2, 10), 1200),
        session('s3', 't9', at(3, 10), 1200),
      ],
    });

    expect(api?.calibration.planningFactor).toBe(2);
    expect(api?.calibration.adjustments).toEqual([
      { taskId: 't9', currentMinutes: 10, suggestedMinutes: 20, ratio: 2, basis: 'task' },
    ]);
  });

  it('applies an adjustment only through the injected write', async () => {
    await AsyncStorage.setItem(
      PLAN_OUTCOMES_KEY,
      JSON.stringify({
        '2026-05-01': outcome('2026-05-01', [completed(1, 't9', 10, 20)]),
        '2026-05-02': outcome('2026-05-02', [completed(2, 't9', 10, 20)]),
        '2026-05-03': outcome('2026-05-03', [completed(3, 't9', 10, 20)]),
      }),
    );
    const onApply = jest.fn();
    await renderProbe({
      todos: [todo('t9', 10)],
      sessions: [
        session('s1', 't9', at(1, 10), 1200),
        session('s2', 't9', at(2, 10), 1200),
        session('s3', 't9', at(3, 10), 1200),
      ],
      onApply,
    });

    // Nothing is written until the user asks for it.
    expect(onApply).not.toHaveBeenCalled();

    api?.applyAdjustment('t9');
    expect(onApply).toHaveBeenCalledWith('t9', 20);

    // A task with no suggestion is a no-op.
    api?.applyAdjustment('never-suggested');
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
