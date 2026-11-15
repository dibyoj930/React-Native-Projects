/**
 * The scheduling engine — `buildReplanProposal`.
 *
 * PURE. No React, no RN, no storage, no Notifee, no `Date.now()` (now is passed
 * in). Identical normalised input => identical placements, classifications and
 * reason codes. Integer minutes only; half-open `[start, end)`.
 *
 * This file composes the other pure modules: interval.ts, rank.ts, placement.ts,
 * normalize.ts, validate.ts and explain.ts.
 */

import { MINUTE_MS, subtractIntervals } from './interval';
import { rankSchedulableTasks } from './rank';
import { scheduleBlocks, type BlockRequest } from './placement';
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

  // 4. Placement order: a hard deadline dominates priority (see rank.ts), so an
  //    urgent task is never crowded out by a non-urgent higher-priority one.
  const ranked = rankSchedulableTasks(flexible);

  // Mode B: defer low-priority tasks even when time remains. Never a silent
  // default — it requires both `mode === 'protect'` and the explicit toggle.
  const deferLow = mode === 'protect' && lowPriorityDeferral;

  // 5. The placeable set: a valid duration and a deadline that is still
  //    reachable from `now`. Everything else is classified without a placement
  //    attempt (missing duration, past/too-soon deadline, or Mode B deferral).
  const placeable = ranked.filter((task) => {
    if (task.estimatedMinutes === undefined) return false;
    const durationMs = task.estimatedMinutes * MINUTE_MS;
    if (task.deadlineAt !== undefined && task.deadlineAt <= nowRounded) return false;
    if (task.deadlineAt !== undefined && nowRounded + durationMs > task.deadlineAt) {
      return false;
    }
    if (deferLow && task.priority === 'low') return false;
    return true;
  });

  // 6. Build the block list in placement order, inserting the single break once
  //    cumulative work first reaches the threshold.
  const blocks: BlockRequest[] = [];
  let cumulativeWork = 0;
  let breakInserted = false;
  for (const task of placeable) {
    const estimatedMinutes = task.estimatedMinutes as number;
    blocks.push({
      id: task.id,
      durationMs: estimatedMinutes * MINUTE_MS,
      deadlineAt: task.deadlineAt,
      plannedStartAt: task.plannedStartAt,
    });
    cumulativeWork += estimatedMinutes;
    if (!breakInserted && breakMinutes > 0 && cumulativeWork >= breakAfterMinutes) {
      blocks.push({ id: BREAK_ID, durationMs: breakMinutes * MINUTE_MS });
      breakInserted = true;
    }
  }

  // 7. Stage A + Stage B: choose positions that spread the work across the free
  //    time while honouring commitments, buffers, deadlines and existing plans.
  const scheduled = scheduleBlocks(blocks, {
    segments,
    protectedIntervals,
    effectiveStart,
    bufferMinutes,
  });

  const placements: Placement[] = [];
  const placedByTask = new Map<string, PlacedTask>();
  for (const block of blocks) {
    const placement = scheduled.get(block.id);
    if (placement === undefined) continue;
    const kind = block.id === BREAK_ID ? 'break' : 'task';
    placements.push({
      taskId: block.id,
      start: placement.start,
      end: placement.end,
      kind,
    });
    if (kind === 'task') {
      placedByTask.set(block.id, {
        taskId: block.id,
        start: placement.start,
        end: placement.end,
      });
    }
  }

  placements.sort((a, b) => a.start - b.start || a.end - b.end);

  // 8. Classify every task into one outcome.
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

  // 9. Explanations: machine-typed records; human copy lives in explain.ts.
  const explanations = outcomes.map((outcome) => {
    const task = input.tasks.find((candidate) => candidate.id === outcome.taskId);
    return explainOutcome(outcome, task?.plannedStartAt);
  });

  // 10. Validate the finished schedule — the engine ships `ok === true`.
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