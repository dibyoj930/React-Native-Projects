import { progressRatio } from '../productivity/domain';
import type { DayRollup } from '../productivity/domain';

/**
 * The user's own daily targets: how many tasks to close and how much focus to
 * bank in a day.
 *
 * Pure on purpose — no React, no storage. Everything here is a function over
 * plain values, so the validation, the progress maths and the encouragement line
 * are all testable without mounting anything. `goalsStorage.ts` is the only file
 * in this folder that touches AsyncStorage, and `useDailyGoals` is the only one
 * that touches React.
 *
 * These goals replace the *display* targets on the home tile only. The mission
 * ladder still decides the streak and momentum, because those are a difficulty
 * knob rather than a statement about how much work a day holds.
 */

export type DailyGoals = {
  focusMinutes: number;
  tasksCompleted: number;
};

/**
 * What an existing user gets before they ever open the editor.
 *
 * These match the first rung of the mission ladder (25 min · 1 task), so a fresh
 * install and an install upgrading to this feature both see the same starting
 * point the tile has always shown at level 0.
 */
export const DEFAULT_DAILY_GOALS: DailyGoals = {
  focusMinutes: 25,
  tasksCompleted: 1,
};

/** Bounds that keep the goal a real target and the tile's numbers from wrapping. */
export const MAX_TASKS_GOAL = 99;
export const MAX_FOCUS_GOAL_MINUTES = 1440;

/** Quick-pick focus durations, in minutes. The custom field can still say anything. */
export const FOCUS_GOAL_PRESETS = [15, 25, 45, 60, 90] as const;

/**
 * A whole non-negative integer, or `null`.
 *
 * `Number('')` is `0` and `parseInt('3abc')` is `3`, both of which would silently
 * accept garbage — an explicit `^\d+$` on the trimmed string is the only thing
 * that treats a typed field honestly.
 */
function toWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** A task goal is a whole number of tasks, 1..`MAX_TASKS_GOAL`. */
export function parseTaskGoal(raw: string): number | null {
  const value = toWholeNumber(raw);
  if (value === null || value < 1 || value > MAX_TASKS_GOAL) return null;
  return value;
}

/** A focus goal is a whole number of minutes, 1..`MAX_FOCUS_GOAL_MINUTES`. */
export function parseFocusGoal(raw: string): number | null {
  const value = toWholeNumber(raw);
  if (value === null || value < 1 || value > MAX_FOCUS_GOAL_MINUTES) return null;
  return value;
}

/**
 * Repairs a stored goals value field by field.
 *
 * Storage outlives app versions and is user-writable, so nothing in it is
 * trusted: a bad field costs that field (its default), never the whole record.
 * This is what lets an install with no key, or a corrupt one, read as the
 * shipped defaults rather than as `NaN` goals.
 */
export function sanitizeGoals(value: unknown): DailyGoals {
  const candidate = (value ?? {}) as Partial<DailyGoals>;
  return {
    focusMinutes: sanitizeOne(
      candidate.focusMinutes,
      DEFAULT_DAILY_GOALS.focusMinutes,
      MAX_FOCUS_GOAL_MINUTES,
    ),
    tasksCompleted: sanitizeOne(
      candidate.tasksCompleted,
      DEFAULT_DAILY_GOALS.tasksCompleted,
      MAX_TASKS_GOAL,
    ),
  };
}

function sanitizeOne(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded < 1 || rounded > max) return fallback;
  return rounded;
}

/** A day's actuals, its goals, and each half as a clamped 0..1 ratio. */
export type GoalsProgress = {
  tasksCompleted: number;
  tasksGoal: number;
  focusMinutes: number;
  focusGoalMinutes: number;
  tasksRatio: number;
  focusRatio: number;
};

/**
 * Measures a day's rollup against the user's goals.
 *
 * A missing rollup is a zero-progress day, not an error. The ratios reuse
 * `progressRatio`, so a goal beaten by any margin clamps to 1 and a bar can
 * never overrun its track — while the displayed actual (e.g. `3 / 2`) still
 * reports the overshoot.
 */
export function goalsProgress(
  rollup: DayRollup | undefined,
  goals: DailyGoals,
): GoalsProgress {
  const focusMinutes = Math.round((rollup?.focusedSeconds ?? 0) / 60);
  const tasksCompleted = rollup?.tasksCompleted ?? 0;
  return {
    tasksCompleted,
    tasksGoal: goals.tasksCompleted,
    focusMinutes,
    focusGoalMinutes: goals.focusMinutes,
    tasksRatio: progressRatio(tasksCompleted, goals.tasksCompleted),
    focusRatio: progressRatio(focusMinutes, goals.focusMinutes),
  };
}

/** Coarse progress buckets the encouragement line is chosen from. */
export type MotivationState =
  | 'gettingStarted'
  | 'inProgress'
  | 'almostThere'
  | 'tasksMet'
  | 'focusMet'
  | 'bothMet';

/** Which bucket today falls in. Deterministic and pure, so it is testable alone. */
export function motivationStateFor(progress: GoalsProgress): MotivationState {
  const tasksMet = progress.tasksCompleted >= progress.tasksGoal;
  const focusMet = progress.focusMinutes >= progress.focusGoalMinutes;
  if (tasksMet && focusMet) return 'bothMet';
  if (focusMet) return 'focusMet';
  if (tasksMet) return 'tasksMet';

  const closest = Math.max(progress.tasksRatio, progress.focusRatio);
  if (closest >= 0.75) return 'almostThere';
  if (progress.tasksCompleted > 0 || progress.focusMinutes > 0) return 'inProgress';
  return 'gettingStarted';
}

/** Keep it short, positive and non-judgmental — nothing here scolds a quiet day. */
const MOTIVATION_LINES: Record<MotivationState, string> = {
  gettingStarted: 'One step at a time. Keep going.',
  inProgress: "You're building momentum.",
  almostThere: "You're getting closer to today's goal.",
  tasksMet: 'Every completed task counts. Goal met!',
  focusMet: "You've hit your daily focus goal. Nice work!",
  bothMet: "You've hit both goals. Nice work!",
};

/** The motivational line for today's progress. */
export function motivationFor(progress: GoalsProgress): string {
  return MOTIVATION_LINES[motivationStateFor(progress)];
}
