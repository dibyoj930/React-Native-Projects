/**
 * The scheduling engine — `buildReplanProposal`.
 *
 * PURE. No React, no RN, no storage, no Notifee, no `Date.now()` (now is passed
 * in). Identical normalised input => identical placements, classifications and
 * reason codes. Integer minutes only; half-open `[start, end)`.
 *
 * This file composes the other pure modules: interval.ts, rank.ts, normalize.ts,
 * validate.ts and explain.ts.
 */

import { MINUTE_MS, subtractIntervals } from './interval';
import { rankFlexibleTasks } from './rank';
import { validateSchedule } from './validate';
import { explainOutcome } from './explain';
import type {
  Interval,
  Placement,
  ProtectedInterval,
  ReasonCode,
  ReplanInput,
  ReplanProposal,
  ReplanTask,
  TaskOutcome,
} from './types';

/** The pseudo task id a break placement uses; never a real task id. */
export const BREAK_ID = 'break';

/** The engine's internal record of one placed task. */
type PlacedTask = {
  taskId: string;
  start: number;
  end: number;
};

/**
 * The earliest `start >= desiredStart` in a free segment that fits `durationMs`
 * and, when the task has a deadline, ends by it. `null` when no such slot exists.
 */
function findSlot(
  segments: readonly Interval[],
  desiredStart: number,
  durationMs: number,
  deadlineAt?: number,
): number | null {
  for (const segment of segments) {
    // A segment that ends before the desired point cannot hold the block; one
    // that starts after it is fine — the cursor fell inside a commitment, so the
    // next free window begins where the commitment ends. That is the "no buffer
    // after a commitment" rule: skipping forward costs no buffer of its own.
    const start = Math.max(desiredStart, segment.start);
    if (start + durationMs > segment.end) continue;
    if (deadlineAt !== undefined && start + durationMs > deadlineAt) {
      // Segments are sorted by start, so every later segment is worse.
      break;
    }
    return start;
  }
  return null;
}

/** True when the block starting at `start` follows a protected interval directly. */
function startsRightAfterProtected(
  start: number,
  protectedIntervals: readonly ProtectedInterval[],
): boolean {
  return protectedIntervals.some((interval) => interval.end === start);
}

/**
 * Build a full proposal for the rest of the local day.
 *
 * NEVER mutates tasks and NEVER persists; the caller owns both.
 */
export function buildReplanProposal(input: ReplanInput): ReplanProposal {
  const {
    bufferMinutes,
    breakMinutes,
    breakAfterMinutes,
    mode,
    lowPriorityDeferral,
  } = input.preferences;

  // 1. Completed / active-timer / fixed tasks are protected: never placed, never
  //    moved, and their ids are reported as unchanged.
  const protectedIds = new Set<string>();
  const flexible = input.tasks.filter((task) => {
    if (task.completed || task.hasActiveTimer || task.schedulingMode === 'fixed') {
      protectedIds.add(task.id);
      return false;
    }
    return true;
  });

  const protectedIntervals: ProtectedInterval[] = [
    ...input.commitments,
    ...input.busy,
  ];

  // 2. The usable window: never before now, and now is rounded up to the next
  //    whole minute so nothing can start in the past.
  const nowRounded = Math.ceil(input.now / MINUTE_MS) * MINUTE_MS;
  const effectiveStart = Math.max(nowRounded, input.workday.start);
  const workday: Interval = { start: effectiveStart, end: input.workday.end };

  // 3. Free segments inside the workday, after commitments and busy windows.
  const segments = subtractIntervals(workday, protectedIntervals);

  // 4. Rank the flexible tasks once; placement order is the ranking order.
  const ranked = rankFlexibleTasks(flexible);

  const placements: Placement[] = [];
  const placedByTask = new Map<string, PlacedTask>();
  let cursor: number | null = null;
  let workMinutes = 0;
  let breakPlaced = false;

  const nextCursor = (): number => (cursor === null ? effectiveStart : cursor);

  // Mode B: defer low-priority tasks even when time remains. Never a silent
  // default — it requires both `mode === 'protect'` and the explicit toggle.
  const deferLow = mode === 'protect' && lowPriorityDeferral;

  /**
   * Insert ONE break once cumulative work first reaches the threshold, placed at
   * the current cursor and separated from neighbouring blocks like a work block.
   * If it cannot fit, it is retried ahead of the next task.
   */
  const maybePlaceBreak = (): void => {
    if (breakPlaced || breakMinutes <= 0) return;
    if (workMinutes < breakAfterMinutes) return;
    const slot = findSlot(segments, nextCursor(), breakMinutes * MINUTE_MS);
    if (slot === null) return;
    placements.push({
      taskId: BREAK_ID,
      start: slot,
      end: slot + breakMinutes * MINUTE_MS,
      kind: 'break',
    });
    cursor = slot + (breakMinutes + bufferMinutes) * MINUTE_MS;
    breakPlaced = true;
  };

  // 5–8. Earliest-fit placement in ranking order: a buffer between work blocks,
  //       deadlines respected, and the single break once work adds up.
  for (const task of ranked) {
    if (task.estimatedMinutes === undefined) continue; // -> needsInformation
    const durationMs = task.estimatedMinutes * MINUTE_MS;

    // Infeasible before any placement attempt: never schedule in the past, never
    // promise a finish after a deadline.
    if (task.deadlineAt !== undefined && task.deadlineAt <= nowRounded) continue;
    if (task.deadlineAt !== undefined && nowRounded + durationMs > task.deadlineAt) {
      continue;
    }

    // Deferral is checked after the deadline guards so a low task that cannot
    // fit anyway reports the real infeasibility rather than a deferral.
    if (deferLow && task.priority === 'low') continue;

    maybePlaceBreak();

    const slot = findSlot(
      segments,
      Math.max(nextCursor(), effectiveStart),
      durationMs,
      task.deadlineAt,
    );
    if (slot === null) continue;

    const end = slot + durationMs;
    placements.push({ taskId: task.id, start: slot, end, kind: 'task' });
    placedByTask.set(task.id, { taskId: task.id, start: slot, end });
    cursor = end + bufferMinutes * MINUTE_MS;
    workMinutes += task.estimatedMinutes;
  }

  maybePlaceBreak();

  // 9. Classify every task into one outcome.
  const outcomes: TaskOutcome[] = [];
  const unchangedTaskIds: string[] = [];

  for (const task of input.tasks) {
    let code: ReasonCode;
    let classification: TaskOutcome['classification'];

    if (task.completed) {
      code = 'completed';
      classification = 'protected';
      unchangedTaskIds.push(task.id);
    } else if (task.hasActiveTimer) {
      code = 'active_timer';
      classification = 'protected';
      unchangedTaskIds.push(task.id);
    } else if (task.schedulingMode === 'fixed') {
      code = fixedConflictsWith(task, protectedIntervals)
        ? 'conflicting_commitments'
        : 'fixed';
      classification = 'protected';
      unchangedTaskIds.push(task.id);
    } else {
      const placed = placedByTask.get(task.id);
      if (placed === undefined) {
        if (task.estimatedMinutes === undefined) {
          code = 'needs_duration';
          classification = 'needsInformation';
        } else if (task.deadlineAt !== undefined && task.deadlineAt <= nowRounded) {
          code = 'infeasible_deadline_passed';
          classification = 'infeasible';
        } else if (
          task.deadlineAt !== undefined &&
          nowRounded + task.estimatedMinutes * MINUTE_MS > task.deadlineAt
        ) {
          code = 'infeasible_deadline_too_soon';
          classification = 'infeasible';
        } else if (deferLow && task.priority === 'low') {
          code = 'deferred_low_priority';
          classification = 'deferred';
        } else if (task.deadlineAt !== undefined) {
          code = 'infeasible_no_free_time';
          classification = 'infeasible';
        } else {
          code = 'deferred_no_time';
          classification = 'deferred';
        }
      } else {
        classification = 'scheduled';
        if (task.plannedStartAt !== undefined && task.plannedStartAt === placed.start) {
          code = 'kept';
        } else if (task.plannedStartAt !== undefined) {
          code = 'moved';
        } else if (startsRightAfterProtected(placed.start, protectedIntervals)) {
          code = 'scheduled_after_commitment';
        } else {
          code = 'scheduled';
        }
      }
    }

    const outcome: TaskOutcome = { taskId: task.id, classification, reasonCode: code };
    const placed = placedByTask.get(task.id);
    if (placed !== undefined && classification === 'scheduled') {
      outcome.start = placed.start;
      outcome.end = placed.end;
    }
    outcomes.push(outcome);
  }

  // 10. Explanations: machine-typed records; human copy lives in explain.ts.
  const explanations = outcomes.map((outcome) => {
    const task = input.tasks.find((candidate) => candidate.id === outcome.taskId);
    return explainOutcome(outcome, task?.plannedStartAt);
  });

  // 11. Validate the finished schedule — the engine ships `ok === true`.
  const proposal: ReplanProposal = {
    generatedAt: input.now,
    signature: input.signature,
    mode: input.preferences.mode,
    placements,
    outcomes,
    explanations,
    unchangedTaskIds,
    validation: { ok: true, violations: [] },
  };
  proposal.validation = validateSchedule(proposal, input);

  return proposal;
}

/** True when a fixed task's anchored window collides with another protected span. */
function fixedConflictsWith(
  task: ReplanTask,
  protectedIntervals: readonly ProtectedInterval[],
): boolean {
  if (task.fixedStartAt === undefined || task.estimatedMinutes === undefined) return false;
  const window = {
    start: task.fixedStartAt,
    end: task.fixedStartAt + task.estimatedMinutes * MINUTE_MS,
  };
  return protectedIntervals.some(
    (interval) => interval.id !== task.id && windowsOverlap(window, interval),
  );
}

function windowsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}