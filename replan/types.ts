/**
 * Adaptive Daily Replanning — shared types (contracts only).
 *
 * This file declares the shapes the engine, storage and UI all agree on. It holds
 * NO scheduling logic: `replan/engine.ts` consumes these types, and
 * `replan/planStorage.ts` persists them into `ReplanDoc`.
 *
 * Purity rule (see docs/ARCHITECTURE.md and productivity/domain.ts): nothing in
 * `replan/` may import React, React Native, AsyncStorage or Notifee except
 * `replan/planStorage.ts`. This file imports types only, so it is erased at build
 * time and stays inside the no-mocks test boundary.
 *
 * Conventions (keep exact — tests depend on them):
 *   - Intervals are half-open `[start, end)`, in epoch milliseconds.
 *   - Day keys are local `YYYY-MM-DD` (productivity/dateKey.ts:17).
 *   - Times are local `HH:mm` (todos/timeKey.ts:17).
 *   - `deadlineAt` is derived from a task's dueDate + dueTime and is NEVER mutated.
 */

import type { DayKey } from '../productivity/domain';
import type { TimeKey } from '../todos/timeKey';

/** Scheduling priority. Absent on a task normalises to `'low'` (see normalize.ts). */
export type Priority = 'high' | 'medium' | 'low';

/** Whether a task can be moved by the scheduler or is anchored in time. */
export type SchedulingMode = 'flexible' | 'fixed';

/** Which scheduling policy the user selected. `'fit'` is the recommended default. */
export type ReplanningMode = 'fit' | 'protect';

/** The bucket a task fell into for one proposal. */
export type Classification =
  | 'scheduled'
  | 'deferred'
  | 'infeasible'
  | 'needsInformation'
  | 'protected';

/**
 * Machine-readable reason attached to a task's outcome. The UI maps these to calm
 * sentences via `replan/explain.ts`; no user-facing copy lives in this type.
 */
export type ReasonCode =
  | 'scheduled'
  | 'scheduled_after_commitment'
  | 'moved'
  | 'kept'
  | 'deferred_no_time'
  | 'deferred_low_priority'
  | 'infeasible_deadline_passed'
  | 'infeasible_deadline_too_soon'
  | 'infeasible_no_free_time'
  | 'needs_duration'
  | 'conflicting_commitments'
  | 'completed'
  | 'active_timer'
  | 'fixed';

/** Half-open `[start, end)` in epoch ms. `start <= end` always. */
export type Interval = {
  start: number;
  end: number;
};

/** The resolved workday window for one local day, as epoch ms. */
export type Workday = Interval;

/** User preferences for replanning. Persisted inside `ReplanDoc`. */
export type ReplanPreferences = {
  /** Local wall-clock start of the workday, `'HH:mm'`. */
  workdayStart: TimeKey;
  /** Local wall-clock end of the workday, `'HH:mm'`. */
  workdayEnd: TimeKey;
  /** Minutes reserved after a task/break before the next block. */
  bufferMinutes: number;
  /** Length of the single break, in minutes. */
  breakMinutes: number;
  /** Cumulative work (minutes) after which the break is inserted. */
  breakAfterMinutes: number;
  /** Selected policy: `'fit'` schedules everything feasible; `'protect'` is opt-in. */
  mode: ReplanningMode;
  /** When true, low-priority tasks may be deferred even if time remains (Mode B). */
  lowPriorityDeferral: boolean;
  /**
   * Opt-in: schedule a notification at each approved task's planned start.
   *
   * Off by default. A planned start is a suggestion, not a deadline, so nudging
   * about it is a product decision the user makes rather than a silent default.
   */
  notifyPlannedStarts: boolean;
};

/**
 * The engine's view of one task. A structural subset of `Todo` (todos/model.ts:14)
 * with scheduling inputs resolved by `replan/normalize.ts`.
 */
export type ReplanTask = {
  id: string;
  text: string;
  /** Absent normalises to `'low'`; never guessed into a higher priority. */
  priority?: Priority;
  /** Whole minutes > 0. Absent => the task is `needsInformation` (never guessed). */
  estimatedMinutes?: number;
  completed: boolean;
  /** Absent normalises to `'flexible'`. */
  schedulingMode?: SchedulingMode;
  /** Hard deadline as epoch ms (from dueDate + dueTime). Never mutated. */
  deadlineAt?: number;
  /** Anchor for a fixed task/commitment, as epoch ms. */
  fixedStartAt?: number;
  /** Stable tie-break input (todos/model.ts:19). */
  createdAt?: number;
  /** Current approved planned start, if any — ranking input only. */
  plannedStartAt?: number;
  /** True when a running focus timer protects this task. */
  hasActiveTimer: boolean;
};

/**
 * A protected, immovable interval. Sources: a fixed commitment, a running focus
 * timer, or a fixed task's anchored window.
 */
export type ProtectedInterval = {
  id: string;
  kind: 'commitment' | 'activeTimer' | 'fixedTask';
  start: number;
  end: number;
};

/** One block the proposal places on the timeline. */
export type Placement = {
  taskId: string;
  start: number;
  end: number;
  kind: 'task' | 'break';
};

/** The engine's verdict for a single task. */
export type TaskOutcome = {
  taskId: string;
  classification: Classification;
  reasonCode: ReasonCode;
  /** Present only when `classification === 'scheduled'`. */
  start?: number;
  end?: number;
};

/** A structured explanation; the UI turns `code` + `params` into calm copy. */
export type Explanation = {
  taskId: string;
  code: ReasonCode;
  params?: Record<string, string | number>;
};

/** A single validation failure produced by `replan/validate.ts`. */
export type ScheduleViolation = {
  code: string;
  message: string;
  taskIds?: string[];
};

/** Result of validating a whole proposal. `ok` must be true before Apply. */
export type ValidationResult = {
  ok: boolean;
  violations: ScheduleViolation[];
};

/** Everything the engine needs. `now` is always injected, never read inside. */
export type ReplanInput = {
  now: number;
  day: DayKey;
  workday: Workday;
  tasks: ReplanTask[];
  commitments: ProtectedInterval[];
  busy: ProtectedInterval[];
  preferences: ReplanPreferences;
  /** Staleness fingerprint (see `replan/signature` / engine notes). */
  signature: string;
};

/** The engine's output. PURE data — never persisted and never mutates tasks. */
export type ReplanProposal = {
  generatedAt: number;
  signature: string;
  mode: ReplanningMode;
  placements: Placement[];
  outcomes: TaskOutcome[];
  explanations: Explanation[];
  /** Task ids left untouched (completed, active-timer, fixed). */
  unchangedTaskIds: string[];
  validation: ValidationResult;
};

/** One task's approved window inside a persisted `DayPlan`. */
export type DayPlanPlacement = {
  taskId: string;
  start: number;
  end: number;
};

/** The approved plan for a single local day. */
export type DayPlan = {
  dayKey: DayKey;
  approvedAt: number;
  signature: string;
  placements: DayPlanPlacement[];
};

/**
 * The single persisted replan document (AsyncStorage key `@replan/v1`).
 *
 * Preferences and the approved plan travel together so an Apply is ONE write.
 * The plan is stored separately from the task list on purpose: task deadlines
 * (dueDate/dueTime) are never mutated by replanning.
 */
export type ReplanDoc = {
  version: 1;
  preferences: ReplanPreferences;
  plan: DayPlan | null;
};
