/**
 * Input normalisation: raw app state -> a validated `ReplanInput`.
 *
 * Pure: no React, no RN, no storage, no clock (the caller passes `now`). This is
 * phase 1 of the engine's pipeline and the ONLY place raw `Todo`s are read.
 */

import type { DayKey } from '../productivity/domain';
import type { Todo } from '../todos/model';
import { dueAt } from '../todos/taskReminders';
import { MINUTE_MS } from './interval';
import { sanitizeReplanPreferences } from './preferences';
import type {
  DayPlan,
  Priority,
  ProtectedInterval,
  ReplanInput,
  ReplanPreferences,
  ReplanTask,
  SchedulingMode,
  Workday,
} from './types';

/** One running focus timer's protected window, in epoch ms. */
export type RawTimerWindow = {
  taskId: string;
  start: number;
  end: number;
};

/** Everything the composition point can hand the normaliser. */
export type RawReplanInput = {
  now: number;
  day: DayKey;
  workday: Workday;
  todos: readonly Todo[];
  /** Running timers, whose windows cannot be scheduled over. */
  timerWindows: readonly RawTimerWindow[];
  preferences: ReplanPreferences;
  /** User commitments (meetings, appointments). */
  commitments?: readonly ProtectedInterval[];
  /** Other known busy windows the engine must avoid. */
  busy?: readonly ProtectedInterval[];
  /** The currently approved plan, used only to seed `plannedStartAt`. */
  approvedPlan?: DayPlan | null;
};

/** `'high' | 'medium' | 'low'`, or `'low'` for anything else. */
function normalizePriority(value: unknown): Priority {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

/** `'fixed'` only when explicitly set; everything else is flexible. */
function normalizeMode(value: unknown): SchedulingMode {
  return value === 'fixed' ? 'fixed' : 'flexible';
}

/** A finite whole number of minutes > 0, or undefined (never a guess). */
function normalizeEstimate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Merge two lists of protected intervals, keeping only well-formed ones. */
function validIntervals(
  values: readonly ProtectedInterval[] | undefined,
): ProtectedInterval[] {
  if (!values) return [];
  return values.filter(
    (interval) =>
      typeof interval === 'object' &&
      interval !== null &&
      typeof interval.start === 'number' &&
      typeof interval.end === 'number' &&
      interval.start < interval.end,
  );
}

/**
 * Map raw tasks to the engine's view.
 *
 * Every default the engine relies on is applied here and nowhere else: absent
 * priority becomes `'low'`, absent mode becomes `'flexible'`, a missing or
 * malformed estimate stays undefined so the task classifies `needsInformation`,
 * and the deadline is derived from `dueDate` + `dueTime` without ever writing
 * back to either.
 */
export function normalizeReplanTasks(
  todos: readonly Todo[],
  timerWindows: readonly RawTimerWindow[],
  approvedPlan?: DayPlan | null,
): ReplanTask[] {
  const plannedStarts = new Map<string, number>();
  for (const placement of approvedPlan?.placements ?? []) {
    plannedStarts.set(placement.taskId, placement.start);
  }
  const timerIds = new Set(timerWindows.map((window) => window.taskId));

  return todos.map((todo) => {
    const mode = normalizeMode(todo.schedulingMode);
    return {
      id: todo.id,
      text: todo.text,
      priority: normalizePriority(todo.priority),
      estimatedMinutes: normalizeEstimate(todo.estimatedMinutes),
      completed: todo.completed === true,
      schedulingMode: mode,
      deadlineAt: dueAt(todo) ?? undefined,
      // An anchor only counts while the task is actually fixed; a leftover one on a
      // flexible task would otherwise become a phantom commitment.
      fixedStartAt: mode === 'fixed' ? finiteNumber(todo.fixedStartAt) : undefined,
      createdAt: finiteNumber(todo.createdAt),
      plannedStartAt: plannedStarts.get(todo.id),
      hasActiveTimer: timerIds.has(todo.id),
    };
  });
}

/**
 * The immovable intervals implied by the task list and the running timers.
 *
 * Fixed tasks become `fixedTask` spans; a running timer becomes an `activeTimer`
 * span. Kept unmerged and sorted by start so the caller can still decide what to
 * do about the conflict the spec asks to report.
 */
export function collectCommitments(
  tasks: readonly ReplanTask[],
  timerWindows: readonly RawTimerWindow[],
): ProtectedInterval[] {
  const fixed: ProtectedInterval[] = [];
  for (const task of tasks) {
    if (task.schedulingMode !== 'fixed') continue;
    if (task.fixedStartAt === undefined || task.estimatedMinutes === undefined) continue;
    fixed.push({
      id: task.id,
      kind: 'fixedTask',
      start: task.fixedStartAt,
      end: task.fixedStartAt + task.estimatedMinutes * MINUTE_MS,
    });
  }

  const timers: ProtectedInterval[] = timerWindows
    .filter((window) => window.end > window.start)
    .map((window) => ({
      id: `timer-${window.taskId}`,
      kind: 'activeTimer' as const,
      start: window.start,
      end: window.end,
    }));

  return [...fixed, ...timers].sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * True when any two protected intervals genuinely overlap (not merely touch).
 *
 * Touching blocks are two commitments back to back, not a conflict; only a real
 * overlap means the day contains a moment that is committed twice.
 */
export function commitmentsConflict(
  intervals: readonly ProtectedInterval[],
): boolean {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .slice()
    .sort((a, b) => a.start - b.start);
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const interval of sorted) {
    if (interval.start < maxEnd) return true;
    if (interval.end > maxEnd) maxEnd = interval.end;
  }
  return false;
}

/** Stable fingerprint over everything that changes the schedule's shape. */
export function computeSignature(input: ReplanInput): string {
  const tasks = input.tasks
    .map((task) =>
      [
        task.id,
        task.priority ?? 'low',
        task.estimatedMinutes ?? '',
        task.completed ? 1 : 0,
        task.schedulingMode ?? 'flexible',
        task.deadlineAt ?? '',
        task.fixedStartAt ?? '',
      ].join(':'),
    )
    .sort();

  const commitments = input.commitments
    .map((interval) => [interval.id, interval.kind, interval.start, interval.end].join(':'))
    .sort();

  const busy = input.busy
    .map((interval) => [interval.id, interval.start, interval.end].join(':'))
    .sort();

  const p = input.preferences;
  return [
    'replan-v1',
    input.day,
    input.workday.start,
    input.workday.end,
    Math.floor(input.now / MINUTE_MS),
    tasks.join('|'),
    commitments.join('|'),
    busy.join('|'),
    [p.workdayStart, p.workdayEnd, p.bufferMinutes, p.breakMinutes, p.breakAfterMinutes]
      .join(':'),
    p.mode,
    p.lowPriorityDeferral ? 1 : 0,
    p.notifyPlannedStarts ? 1 : 0,
  ].join('~');
}

/** Build the engine input, flagging nothing and guessing nothing. */
export function normalizeReplanInput(raw: RawReplanInput): ReplanInput {
  const tasks = normalizeReplanTasks(raw.todos, raw.timerWindows, raw.approvedPlan);
  const derived = collectCommitments(tasks, raw.timerWindows);
  const commitments = [...validIntervals(raw.commitments), ...derived];
  const busy = validIntervals(raw.busy);

  // An inverted or zero-width workday yields no free time: the engine defers or
  // reports everything rather than scheduling across midnight.
  const workday: Workday =
    raw.workday.end > raw.workday.start
      ? { start: raw.workday.start, end: raw.workday.end }
      : { start: raw.workday.start, end: raw.workday.start };

  const input: ReplanInput = {
    now: raw.now,
    day: raw.day,
    workday,
    tasks,
    commitments,
    busy,
    preferences: sanitizeReplanPreferences(raw.preferences),
    signature: '',
  };
  input.signature = computeSignature(input);
  return input;
}
