/**
 * Whole-proposal validation.
 *
 * Pure. This is the safety net: it re-checks the finished schedule rather than
 * trusting the placement loop. `replan/engine.ts` calls it as phase 11 and must
 * return `validation.ok === true`.
 */

import { MINUTE_MS, overlaps } from './interval';
import type {
  ProtectedInterval,
  ReplanInput,
  ReplanProposal,
  ScheduleViolation,
  ValidationResult,
} from './types';

const BREAK_ID = 'break';

/**
 * True when at least one protected interval sits wholly between two blocks, which
 * is what makes a gap a *commitment* rather than a missing buffer.
 */
function separatedByProtected(
  from: number,
  to: number,
  protectedIntervals: readonly ProtectedInterval[],
): boolean {
  return protectedIntervals.some(
    (interval) => interval.start >= from && interval.end <= to,
  );
}

/**
 * Collect one `ScheduleViolation` per broken invariant; never throws. `ok` is
 * true only when nothing was collected.
 */
export function validateSchedule(
  proposal: ReplanProposal,
  input: ReplanInput,
): ValidationResult {
  const violations: ScheduleViolation[] = [];
  const bufferMs = input.preferences.bufferMinutes * MINUTE_MS;
  const protectedIntervals: ProtectedInterval[] = [...input.commitments, ...input.busy];

  const placements = [...proposal.placements].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  for (const placement of placements) {
    if (placement.end <= placement.start) {
      violations.push({
        code: 'empty_placement',
        message: `Placement for ${placement.taskId} is zero-width or negative.`,
        taskIds: [placement.taskId],
      });
      continue;
    }
    if (placement.start < input.workday.start || placement.end > input.workday.end) {
      violations.push({
        code: 'outside_workday',
        message: `Placement for ${placement.taskId} lies outside the workday.`,
        taskIds: [placement.taskId],
      });
    }
    if (placement.start < input.now) {
      violations.push({
        code: 'starts_in_past',
        message: `Placement for ${placement.taskId} starts before now.`,
        taskIds: [placement.taskId],
      });
    }

    for (const interval of protectedIntervals) {
      if (overlaps(placement, interval)) {
        violations.push({
          code: 'overlaps_protected',
          message: `Placement for ${placement.taskId} overlaps protected interval ${interval.id}.`,
          taskIds: [placement.taskId],
        });
      }
    }
  }

  // No two placements may overlap, and no task may appear twice.
  const seenTaskIds = new Set<string>();
  for (let i = 0; i < placements.length; i += 1) {
    const a = placements[i];
    if (a.taskId !== BREAK_ID) {
      if (seenTaskIds.has(a.taskId)) {
        violations.push({
          code: 'duplicate_task',
          message: `Task ${a.taskId} was placed more than once.`,
          taskIds: [a.taskId],
        });
      }
      seenTaskIds.add(a.taskId);
    }
    for (let j = i + 1; j < placements.length; j += 1) {
      const b = placements[j];
      if (overlaps(a, b)) {
        violations.push({
          code: 'overlap',
          message: `Placements for ${a.taskId} and ${b.taskId} overlap.`,
          taskIds: [a.taskId, b.taskId],
        });
      }
    }
  }

  // Buffers between adjacent work blocks, unless a commitment separates them.
  if (bufferMs > 0) {
    for (let i = 1; i < placements.length; i += 1) {
      const previous = placements[i - 1];
      const current = placements[i];
      if (separatedByProtected(previous.end, current.start, protectedIntervals)) {
        continue;
      }
      if (current.start - previous.end < bufferMs) {
        violations.push({
          code: 'missing_buffer',
          message: `Blocks ${previous.taskId} and ${current.taskId} are closer than the buffer.`,
          taskIds: [previous.taskId, current.taskId],
        });
      }
    }
  }

  // Every scheduled task must end by its own deadline.
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  for (const outcome of proposal.outcomes) {
    if (outcome.classification !== 'scheduled' || outcome.end === undefined) continue;
    const task = tasksById.get(outcome.taskId);
    if (task?.deadlineAt !== undefined && outcome.end > task.deadlineAt) {
      violations.push({
        code: 'past_deadline',
        message: `Task ${outcome.taskId} ends after its deadline.`,
        taskIds: [outcome.taskId],
      });
    }
  }

  // A task classified scheduled must actually have a placement, and vice versa.
  const placedTaskIds = new Set(
    placements.filter((placement) => placement.taskId !== BREAK_ID).map((p) => p.taskId),
  );
  for (const outcome of proposal.outcomes) {
    const scheduled = outcome.classification === 'scheduled';
    const placed = placedTaskIds.has(outcome.taskId);
    if (scheduled && !placed) {
      violations.push({
        code: 'scheduled_without_placement',
        message: `Task ${outcome.taskId} is scheduled but has no placement.`,
        taskIds: [outcome.taskId],
      });
    }
    if (!scheduled && placed) {
      violations.push({
        code: 'placement_without_schedule',
        message: `Task ${outcome.taskId} has a placement but is not scheduled.`,
        taskIds: [outcome.taskId],
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Throw with the violation list when `!ok`. Used by tests / dev only. */
export function assertNoViolations(result: ValidationResult): void {
  if (result.ok) return;
  const detail = result.violations.map((violation) => violation.message).join('; ');
  throw new Error(`Schedule validation failed (${result.violations.length}): ${detail}`);
}
