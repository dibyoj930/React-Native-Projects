/**
 * Dev-only fixture: a realistic week of plans, outcomes and focus sessions.
 *
 * Plan review is impossible to eyeball on a fresh install — it needs six days of
 * history it cannot have. Waiting a week is not a test, so this module fabricates
 * a week that exercises every branch the screen has: on-time and late
 * completions, a genuinely missed task, a task postponed into a later plan (the
 * one fact only cross-day data can show), a day whose focus the session log
 * cannot account for, and an unattributed session that must not appear against
 * any task.
 *
 * The split matters: `buildPlanReviewSeed` is pure (a clock in, plain data out)
 * so it can be asserted in tests, and only `seedPlanReview` touches storage. The
 * fixture is written through the *real* persistence functions — never by reaching
 * into AsyncStorage keys directly — so it cannot drift from the shapes the app
 * actually reads.
 *
 * Everything here is `__DEV__`-gated by its only caller (`DevPreviewBar`), which
 * is itself rendered only in development.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialProductivityState } from '../productivity/reducer';
import { clearProductivity, saveProductivity } from '../productivity/storage';
import type { FocusSession } from '../productivity/types';
import { DEFAULT_REPLAN_PREFERENCES } from '../replan/preferences';
import { clearPlan, saveReplanDoc } from '../replan/planStorage';
import {
  PLAN_OUTCOMES_KEY,
  savePlanOutcomes,
  type PlanOutcomesStore,
} from '../replan/planOutcomeStorage';
import type { DayPlan, PlanOutcome, PlannedTaskResult } from '../replan/types';
import { localDateKey, startOfDay } from '../shared/date';
import { TODOS_STORAGE_KEY, type Todo } from '../todos/model';
import { saveTodos } from '../todos/taskRepository';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;

/** Ratio of focus recorded to time planned, by how the task finished. */
const FOCUS_RATIO = {
  'completed-on-time': 1.3,
  'completed-late': 1.7,
  missed: 0,
  ongoing: 0,
} as const;

type RowStatus = keyof typeof FOCUS_RATIO;

type RowSpec = {
  taskId: string;
  hour: number;
  minute?: number;
  plannedMins: number;
  /** As recorded during the day; review re-settles unfinished rows. */
  status: RowStatus;
};

type DaySpec = {
  /** Whole days before today (>= 1). */
  offset: number;
  rows: RowSpec[];
  /** False makes the session log silent for the day, so focus reads unavailable. */
  withSessions: boolean;
  /** Add a session with no task, which must never land on a plan row. */
  unattributed?: boolean;
};

/** The five tasks every seeded plan draws from. */
const TASKS: readonly { id: string; text: string; estimatedMinutes: number }[] = [
  { id: 'seed-report', text: 'Draft quarterly report', estimatedMinutes: 60 },
  { id: 'seed-review', text: 'Review open PRs', estimatedMinutes: 30 },
  { id: 'seed-sprint', text: 'Plan next sprint', estimatedMinutes: 45 },
  { id: 'seed-inbox', text: 'Clear inbox', estimatedMinutes: 15 },
  { id: 'seed-deep', text: 'Deep work: auth refactor', estimatedMinutes: 90 },
];

const TEXT_BY_ID = new Map(TASKS.map((task) => [task.id, task.text]));

/**
 * Six past days, oldest first (offset 6 = a week ago, offset 1 = yesterday).
 *
 * The carries are deliberate: `seed-sprint` and `seed-deep` are left unfinished
 * yesterday and appear in today's live plan, so review resolves them as
 * postponed; `seed-report` is left unfinished three days ago and is never planned
 * again, so it stays missed — the contrast is the point.
 */
const DAY_SPECS: readonly DaySpec[] = [
  {
    offset: 6,
    withSessions: false,
    rows: [
      { taskId: 'seed-report', hour: 9, plannedMins: 60, status: 'completed-on-time' },
      { taskId: 'seed-review', hour: 10, minute: 30, plannedMins: 30, status: 'ongoing' },
    ],
  },
  {
    offset: 5,
    withSessions: true,
    rows: [
      { taskId: 'seed-inbox', hour: 9, plannedMins: 15, status: 'completed-on-time' },
      { taskId: 'seed-review', hour: 10, plannedMins: 30, status: 'completed-on-time' },
    ],
  },
  {
    offset: 4,
    withSessions: true,
    unattributed: true,
    rows: [
      { taskId: 'seed-deep', hour: 9, plannedMins: 90, status: 'completed-on-time' },
      { taskId: 'seed-review', hour: 10, minute: 30, plannedMins: 30, status: 'ongoing' },
    ],
  },
  {
    offset: 3,
    withSessions: true,
    rows: [
      { taskId: 'seed-report', hour: 9, plannedMins: 60, status: 'ongoing' },
      { taskId: 'seed-inbox', hour: 10, minute: 30, plannedMins: 15, status: 'completed-on-time' },
      { taskId: 'seed-review', hour: 11, plannedMins: 30, status: 'completed-on-time' },
    ],
  },
  {
    offset: 2,
    withSessions: true,
    rows: [
      { taskId: 'seed-review', hour: 9, plannedMins: 30, status: 'completed-late' },
      { taskId: 'seed-sprint', hour: 10, plannedMins: 45, status: 'ongoing' },
    ],
  },
  {
    offset: 1,
    withSessions: true,
    rows: [
      { taskId: 'seed-sprint', hour: 9, plannedMins: 45, status: 'ongoing' },
      { taskId: 'seed-deep', hour: 10, plannedMins: 90, status: 'ongoing' },
      { taskId: 'seed-inbox', hour: 12, plannedMins: 15, status: 'completed-on-time' },
    ],
  },
];

export type PlanReviewSeed = {
  todos: Todo[];
  sessions: FocusSession[];
  /** Stored outcomes for the six past days, keyed by day. */
  outcomes: PlanOutcomesStore;
  /** Today's approved plan, for the live half of the review. */
  plan: DayPlan;
};

function dayStartOf(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function atTime(dayKey: string, hour: number, minute = 0): number {
  return dayStartOf(dayKey) + hour * HOUR + minute * MINUTE;
}

function dayKeyAgo(now: number, offset: number): string {
  return localDateKey(startOfDay(now) - offset * DAY);
}

/** Build a single past day: its outcome rows plus the sessions behind them. */
function buildPastDay(
  dayKey: string,
  spec: DaySpec,
): { outcome: PlanOutcome; sessions: FocusSession[] } {
  const results: PlannedTaskResult[] = [];
  const sessions: FocusSession[] = [];

  for (const row of spec.rows) {
    const start = atTime(dayKey, row.hour, row.minute ?? 0);
    const end = start + row.plannedMins * MINUTE;
    const completed = row.status === 'completed-on-time' || row.status === 'completed-late';

    let completedAt: number | undefined;
    if (row.status === 'completed-on-time') {
      completedAt = start + Math.round(row.plannedMins * 0.9) * MINUTE;
    } else if (row.status === 'completed-late') {
      completedAt = end + 20 * MINUTE;
    }

    // No sessions means the log cannot account for the day; the row carries no
    // focus either, so nothing implies focus that was never recorded.
    const focusedSeconds = spec.withSessions
      ? Math.round(row.plannedMins * FOCUS_RATIO[row.status]) * 60
      : 0;

    if (spec.withSessions && focusedSeconds > 0) {
      sessions.push({
        id: `seed-${dayKey}-${row.taskId}`,
        taskId: row.taskId,
        startedAt: start,
        endedAt: start + focusedSeconds * 1000,
        focusedSeconds,
        status: 'completed',
      });
    }

    results.push({
      taskId: row.taskId,
      taskText: TEXT_BY_ID.get(row.taskId),
      plannedStart: start,
      plannedEnd: end,
      wasScheduled: true,
      completed,
      completedAt,
      actualFocusSeconds: focusedSeconds,
      status: row.status,
    });
  }

  if (spec.withSessions && spec.unattributed) {
    sessions.push({
      id: `seed-${dayKey}-untracked`,
      taskId: null,
      startedAt: atTime(dayKey, 14),
      endedAt: atTime(dayKey, 14) + 25 * MINUTE,
      focusedSeconds: 25 * 60,
      status: 'stopped',
    });
  }

  const totalActualFocusMins = results.reduce(
    (sum, r) => sum + (r.actualFocusSeconds ?? 0) / 60,
    0,
  );
  const totalPlannedFocusMins = results.reduce(
    (sum, r) => sum + (r.plannedEnd! - r.plannedStart!) / MINUTE,
    0,
  );

  return {
    outcome: {
      dayKey,
      planApprovedAt: atTime(dayKey, 8),
      generatedAt: atTime(dayKey, 18),
      planSignature: 'dev-seed',
      results,
      summary: {
        totalPlanned: results.length,
        completed: results.filter((r) => r.completed).length,
        completedOnTime: results.filter((r) => r.status === 'completed-on-time').length,
        completedLate: results.filter((r) => r.status === 'completed-late').length,
        postponed: 0,
        missed: 0,
        totalPlannedFocusMins,
        // Undefined when the log cannot speak for the day — the seed's stand-in
        // for "focus unknown", which the screen renders as "unavailable".
        totalActualFocusMins: spec.withSessions ? totalActualFocusMins : undefined,
      },
    },
    sessions,
  };
}

/** Today's live plan, anchored to `now` so some of it is always done and some ahead. */
function buildToday(
  now: number,
  dayKey: string,
): { plan: DayPlan; todos: Todo[]; sessions: FocusSession[] } {
  const rows = [
    { taskId: 'seed-report', start: now - 3 * HOUR, mins: 60 },
    { taskId: 'seed-sprint', start: now - 1 * HOUR, mins: 45 },
    { taskId: 'seed-deep', start: now + 20 * MINUTE, mins: 90 },
  ];

  const plan: DayPlan = {
    dayKey,
    approvedAt: atTime(dayKey, 8),
    signature: 'dev-seed',
    placements: rows.map((r) => ({
      taskId: r.taskId,
      start: r.start,
      end: r.start + r.mins * MINUTE,
    })),
  };

  const completedAt = now - 3 * HOUR + 50 * MINUTE;
  const todos: Todo[] = TASKS.map((task) => {
    const done = task.id === 'seed-report';
    return {
      id: task.id,
      text: task.text,
      completed: done,
      completedAt: done ? completedAt : undefined,
      tags: [],
      createdAt: startOfDay(now) - 8 * DAY,
      estimatedMinutes: task.estimatedMinutes,
      schedulingMode: 'flexible',
    };
  });

  const sessions: FocusSession[] = [
    {
      id: `seed-${dayKey}-seed-report`,
      taskId: 'seed-report',
      startedAt: now - 3 * HOUR,
      endedAt: now - 3 * HOUR + 78 * MINUTE,
      focusedSeconds: 78 * 60,
      status: 'completed',
    },
  ];

  return { plan, todos, sessions };
}

/** The whole fixture, from a clock. Pure and deterministic given `now`. */
export function buildPlanReviewSeed(now: number): PlanReviewSeed {
  const todayKey = dayKeyAgo(now, 0);

  const outcomes: PlanOutcomesStore = {};
  const pastSessions: FocusSession[] = [];
  for (const spec of DAY_SPECS) {
    const dayKey = dayKeyAgo(now, spec.offset);
    const built = buildPastDay(dayKey, spec);
    outcomes[dayKey] = built.outcome;
    pastSessions.push(...built.sessions);
  }

  const today = buildToday(now, todayKey);

  return {
    todos: today.todos,
    sessions: [...pastSessions, ...today.sessions],
    outcomes,
    plan: today.plan,
  };
}

/**
 * Write the fixture through the app's own persistence.
 *
 * Tasks, focus log, plan and outcomes are each written by the function the app
 * itself uses, so a change to any stored shape is reflected here automatically.
 */
export async function seedPlanReview(now: number = Date.now()): Promise<void> {
  const seed = buildPlanReviewSeed(now);
  await saveTodos(seed.todos);
  await saveProductivity({ ...initialProductivityState, sessions: seed.sessions });
  await savePlanOutcomes(seed.outcomes);
  await saveReplanDoc({
    version: 1,
    preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    plan: seed.plan,
  });
}

/**
 * Remove everything the seeder wrote.
 *
 * Tasks, focus log, plan and outcomes are all seeded, so all four are cleared —
 * a partial clear would leave the app showing half a fabricated week. This wipes
 * real user data too; it is a development tool.
 */
export async function clearPlanReviewSeed(): Promise<void> {
  await Promise.all([
    clearProductivity(),
    clearPlan(),
    AsyncStorage.removeItem(PLAN_OUTCOMES_KEY),
    AsyncStorage.removeItem(TODOS_STORAGE_KEY),
  ]);
}
