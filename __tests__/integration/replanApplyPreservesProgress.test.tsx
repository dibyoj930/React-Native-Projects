/**
 * Applying a rebuilt plan must not erase the day's progress.
 *
 * Regression for the data-integrity bug: the engine protects completed work and
 * never re-places it, so a rebuild produces a plan that no longer holds a task
 * the user already finished. The "Today: plan vs actual" tile reads that plan, so
 * before the fix the completed task — and its recorded focus — vanished the
 * moment the new plan was applied, and the reduced view was then persisted over
 * today's stored outcome.
 *
 * This composes `useReplan` and `usePlanOutcome` the way `WelcomeComponent` does,
 * and drives the real generate/apply path against AsyncStorage.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useReplan, type ReplanController } from '../../hooks/useReplan';
import {
  usePlanOutcome,
  type PlanOutcomeController,
} from '../../hooks/usePlanOutcome';
import { NotificationProvider } from '../../notifications';
import { REPLAN_STORAGE_KEY } from '../../replan/planStorage';
import { PLAN_OUTCOMES_KEY } from '../../replan/planOutcomeStorage';
import type { ReplanDoc } from '../../replan/types';
import type { FocusSession } from '../../productivity/domain';
import type { Todo } from '../../todos/model';
import { render, rerender } from '../support/render';

const TODAY = '2026-05-04';
const NOW = at(14, 0);

function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

const REPORT: Todo = {
  id: 'report',
  text: 'Project report',
  completed: false,
  tags: [],
  createdAt: 1,
  estimatedMinutes: 45,
  priority: 'high',
};

const PRS: Todo = {
  id: 'prs',
  text: 'Review PRs',
  completed: false,
  tags: [],
  createdAt: 2,
  estimatedMinutes: 30,
  priority: 'medium',
};

/** A task completed by an older build, so it carries no `completedAt`. */
const LEGACY: Todo = {
  id: 'legacy',
  text: 'Legacy report',
  completed: false,
  tags: [],
  createdAt: 3,
  estimatedMinutes: 45,
  priority: 'high',
};

const REPORT_SESSION: FocusSession = {
  id: 's-report',
  taskId: 'report',
  startedAt: at(13, 30),
  endedAt: at(14, 0),
  status: 'completed',
  focusedSeconds: 1800,
};

type Harness = {
  replan: ReplanController;
  outcome: PlanOutcomeController;
};

let api: Harness | undefined;

function Probe({ todos, sessions }: { todos: Todo[]; sessions: FocusSession[] }) {
  const replan = useReplan({
    todos,
    hydrated: true,
    today: TODAY,
    timerWindowFor: () => null,
  });
  const outcome = usePlanOutcome({
    hydrated: true,
    dayKey: TODAY,
    plan: replan.plan,
    todos,
    attribution: new Map(),
    focusSessions: sessions,
    now: NOW,
  });
  api = { replan, outcome };
  return null;
}

function tree(todos: Todo[], sessions: FocusSession[] = []) {
  return (
    <NotificationProvider>
      <Probe todos={todos} sessions={sessions} />
    </NotificationProvider>
  );
}

const act = (body: () => void) => ReactTestRenderer.act(body);
const settle = () => ReactTestRenderer.act(async () => undefined);

async function applyCurrent(): Promise<void> {
  act(() => {
    api?.replan.generate();
  });
  await ReactTestRenderer.act(async () => {
    await api?.replan.apply();
  });
}

async function readDoc(): Promise<ReplanDoc | null> {
  const raw = await AsyncStorage.getItem(REPLAN_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ReplanDoc) : null;
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 4, 14, 0, 0));
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('applying a rebuilt plan preserves the day', () => {
  it('keeps a completed task and its recorded focus after the plan is rebuilt', async () => {
    const renderer = await render(tree([REPORT, PRS], [REPORT_SESSION]));
    await settle();

    await applyCurrent();
    expect(api?.outcome.outcome.summary.completed).toBe(0);
    expect(api?.outcome.outcome.summary.totalPlanned).toBe(2);
    expect(api?.outcome.outcome.summary.totalActualFocusMins).toBe(30);

    // The user finishes the report, then rebuilds and applies a new plan.
    await rerender(
      renderer,
      tree([{ ...REPORT, completed: true, completedAt: at(14, 30) }, PRS], [REPORT_SESSION]),
    );
    await settle();

    await applyCurrent();

    const doc = await readDoc();
    // The rebuilt plan genuinely no longer holds the finished task ...
    expect(doc?.plan?.placements.map((p) => p.taskId)).not.toContain('report');

    // ... but the day's comparison still counts it, and its focus.
    const summary = api!.outcome.outcome.summary;
    expect(summary.completed).toBe(1);
    expect(summary.totalPlanned).toBe(2);
    expect(summary.totalActualFocusMins).toBe(30);
    const report = api!.outcome.outcome.results.find((r) => r.taskId === 'report');
    expect(report?.wasScheduled).toBe(false);
    expect(report?.status).toBe('completed-on-time');
  });

  it('keeps a legacy completion with no completedAt across a rebuild', async () => {
    // The completion predates `completedAt`, so the rebuild cannot re-bucket it
    // from the task. The day's stored record is what keeps it — and its focus —
    // from being erased.
    const renderer = await render(tree([LEGACY, PRS], []));
    await settle();
    await applyCurrent();

    await rerender(renderer, tree([{ ...LEGACY, completed: true }, PRS], []));
    await settle();

    // The app auto-saves the day as it evolves; capture it here, because that
    // record is the evidence a rebuild must not overwrite.
    await ReactTestRenderer.act(async () => {
      await api?.outcome.saveOutcome();
    });

    await applyCurrent();

    const doc = await readDoc();
    expect(doc?.plan?.placements.map((p) => p.taskId)).not.toContain('legacy');
    const legacy = api!.outcome.outcome.results.find((r) => r.taskId === 'legacy');
    expect(legacy?.completed).toBe(true);
    expect(api!.outcome.outcome.summary.completed).toBe(1);
  });

  it('does not lose a focus session recorded while the proposal was open', async () => {
    const renderer = await render(tree([REPORT, PRS], []));
    await settle();

    act(() => {
      api?.replan.generate();
    });

    // A session lands before the user taps Apply.
    await rerender(renderer, tree([REPORT, PRS], [REPORT_SESSION]));
    await settle();

    await ReactTestRenderer.act(async () => {
      await api?.replan.apply();
    });

    expect(api?.outcome.outcome.results.find((r) => r.taskId === 'report')?.actualFocusSeconds).toBe(
      1800,
    );
    expect(api?.outcome.outcome.summary.totalActualFocusMins).toBe(30);
  });

  it('applying the same proposal twice does not duplicate the plan', async () => {
    await render(tree([REPORT, PRS]));
    await settle();

    await applyCurrent();
    const first = await readDoc();

    await ReactTestRenderer.act(async () => {
      await api?.replan.apply();
    });
    const second = await readDoc();

    expect(second?.plan?.placements).toEqual(first?.plan?.placements);
    expect(second?.plan?.placements).toHaveLength(2);
  });

  it('persists a today outcome that still counts completed work', async () => {
    const renderer = await render(tree([REPORT, PRS], [REPORT_SESSION]));
    await settle();
    await applyCurrent();

    await rerender(
      renderer,
      tree([{ ...REPORT, completed: true, completedAt: at(14, 30) }, PRS], [REPORT_SESSION]),
    );
    await settle();
    await applyCurrent();

    await ReactTestRenderer.act(async () => {
      await api?.outcome.saveOutcome();
    });

    const raw = await AsyncStorage.getItem(PLAN_OUTCOMES_KEY);
    const store = JSON.parse(raw as string) as Record<string, { summary: { completed: number } }>;
    expect(store[TODAY].summary.completed).toBe(1);
  });
});
