/**
 * Deterministic task ordering for the scheduler.
 *
 * Pure. The comparator is the single source of ordering for placement, so the
 * same tasks always produce the same schedule regardless of array order.
 *
 * Priority ranking lives here, not in normalize — normalize defaults the value,
 * ranking decides order. Keep the two concerns separate.
 */

import type { Priority, ReplanTask } from './types';

/** Lower sorts first. A missing priority is `'low'`, never a guess upward. */
const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Compare two optional numbers, absent sorting last.
 *
 * Deliberately not `(a ?? Infinity) - (b ?? Infinity)`: that is `NaN` when both
 * are absent, and a comparator returning `NaN` is undefined behaviour. Absence is
 * handled explicitly so two missing values compare equal.
 */
function compareOptional(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

/**
 * Documented, total order — evaluated in this precedence:
 *   1. priority: high -> medium -> low (missing priority ranks as low)
 *   2. earliest hard deadline first; tasks with no deadline sort last
 *   3. earliest existing planned start first; tasks with none sort last
 *   4. stable tie-break: createdAt ascending, then id ascending
 *
 * Pure and independent of the input array order (shuffle-invariant).
 */
export function compareReplanTasks(a: ReplanTask, b: ReplanTask): number {
  const priority = PRIORITY_RANK[a.priority ?? 'low'] - PRIORITY_RANK[b.priority ?? 'low'];
  if (priority !== 0) return priority;

  const deadline = compareOptional(a.deadlineAt, b.deadlineAt);
  if (deadline !== 0) return deadline;

  const planned = compareOptional(a.plannedStartAt, b.plannedStartAt);
  if (planned !== 0) return planned;

  const created = compareOptional(a.createdAt, b.createdAt);
  if (created !== 0) return created;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Return a NEW sorted array (does not mutate the input). */
export function rankFlexibleTasks(tasks: readonly ReplanTask[]): ReplanTask[] {
  return [...tasks].sort(compareReplanTasks);
}

/**
 * The placement order for the scheduler.
 *
 * A HARD DEADLINE dominates priority: an urgent low-priority task must be
 * placed before a non-urgent high-priority one, or the high task can consume
 * the only window the urgent one needed and the urgent one is reported
 * infeasible although a valid arrangement exists. Earliest-deadline-first with
 * no inserted idle is feasibility-optimal for jobs that are all available at
 * `now`, so this ordering is what keeps the engine from inventing infeasibility.
 *
 * Precedence after the deadline:
 *   1. earliest hard deadline first; tasks with no deadline sort last
 *   2. priority: high -> medium -> low (missing priority ranks as low)
 *   3. earliest existing planned start first; tasks with none sort last
 *   4. stable tie-break: createdAt ascending, then id ascending
 *
 * Pure and shuffle-invariant, like `compareReplanTasks`.
 */
export function compareForScheduling(a: ReplanTask, b: ReplanTask): number {
  const deadline = compareOptional(a.deadlineAt, b.deadlineAt);
  if (deadline !== 0) return deadline;

  const priority = PRIORITY_RANK[a.priority ?? 'low'] - PRIORITY_RANK[b.priority ?? 'low'];
  if (priority !== 0) return priority;

  const planned = compareOptional(a.plannedStartAt, b.plannedStartAt);
  if (planned !== 0) return planned;

  const created = compareOptional(a.createdAt, b.createdAt);
  if (created !== 0) return created;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Return a NEW scheduler-ordered array (does not mutate the input). */
export function rankSchedulableTasks(tasks: readonly ReplanTask[]): ReplanTask[] {
  return [...tasks].sort(compareForScheduling);
}
