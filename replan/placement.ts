/**
 * Placement: the two-stage, constraint-aware assignment used by the engine.
 *
 * PURE. No React, no RN, no storage, no clock. Integer minutes only; half-open
 * `[start, end)`. Identical input => identical placements (every choice is a
 * total order over a finite candidate set).
 *
 * Why this exists
 * ---------------
 * The original engine placed each task at the earliest free slot at or after a
 * single monotonic cursor. That is deterministic and safe, but it front-loads
 * the day (all work crammed after `now`, the whole tail idle) and a global
 * cursor can never reuse a gap it has already passed. This module replaces only
 * that selection step:
 *
 *   Stage A — enumerate a finite set of *candidate* starts per block from the
 *             free segments (segment edges, the balanced target, the existing
 *             plan, and the space just after/before an already-placed block).
 *   Stage B — score the admissible candidates and choose one, spreading work
 *             evenly across the available *free* time (commitments excluded)
 *             but capping the spread so a light day stays compact.
 *
 * Hard constraints (never before `effectiveStart`, never outside the workday,
 * never overlapping a commitment or another block, buffers honoured, deadlines
 * met) are enforced by `isAdmissible`, independently of the score. A block with
 * no admissible candidate is left unplaced and reported by the engine.
 */

import { MINUTE_MS } from './interval';
import type { Interval, ProtectedInterval } from './types';

/** One block the engine asks to place: a flexible task or the single break. */
export type BlockRequest = {
  /** Task id, or the engine's break id. */
  id: string;
  /** Length in epoch ms; always > 0. */
  durationMs: number;
  /** Hard deadline (epoch ms) the block must end by, when it has one. */
  deadlineAt?: number;
  /** The approved start of this block, if any — the stability anchor. */
  plannedStartAt?: number;
};

/** A chosen block position, half-open `[start, end)`. */
export type BlockPlacement = {
  id: string;
  start: number;
  end: number;
};

/** The immutable geometry a placement pass reasons about. */
export type PlacementContext = {
  /** Free segments inside the workday, sorted, commitments removed. */
  segments: readonly Interval[];
  /** Commitments + busy + active-timer windows to protect. */
  protectedIntervals: readonly ProtectedInterval[];
  /** Earliest allowed start (now rounded up, at least the workday start). */
  effectiveStart: number;
  /** Minutes reserved between adjacent blocks (unless a protected span splits them). */
  bufferMinutes: number;
};

/**
 * Fraction of the free time that may remain as spread-out idle. The horizon a
 * schedule spreads across is `min(F, work + SPREAD_FILL * F)`, so a light day
 * is never smeared across the entire workday while a heavy day still uses all
 * of it. Dimensionless on purpose — this is the one tunable.
 */
export const SPREAD_FILL = 0.5;

/** True when a protected interval lies wholly within `[from, to]`. */
function separatedByProtected(
  from: number,
  to: number,
  protectedIntervals: readonly ProtectedInterval[],
): boolean {
  return protectedIntervals.some(
    (interval) => interval.start >= from && interval.end <= to,
  );
}

/** True when `[start, start + durationMs)` lies inside one free segment. */
function fitsInSegments(
  segments: readonly Interval[],
  start: number,
  durationMs: number,
): boolean {
  const end = start + durationMs;
  return segments.some((segment) => start >= segment.start && end <= segment.end);
}

/**
 * The hard admissibility test for a candidate start.
 *
 * Mirrors `validate.ts`'s buffer rule exactly: the buffer is required between
 * *adjacent* blocks, but a protected interval sitting between them excusing the
 * gap (a task may begin the moment a commitment ends, with no extra wait).
 */
export function isAdmissible(
  start: number,
  durationMs: number,
  placed: readonly BlockPlacement[],
  context: PlacementContext,
): boolean {
  if (start < context.effectiveStart) return false;
  if (!fitsInSegments(context.segments, start, durationMs)) return false;

  const end = start + durationMs;

  for (const interval of context.protectedIntervals) {
    if (start < interval.end && interval.start < end) return false;
  }
  for (const block of placed) {
    if (start < block.end && block.start < end) return false;
  }

  const bufferMs = context.bufferMinutes * MINUTE_MS;
  if (bufferMs > 0) {
    let predecessorEnd = Number.NEGATIVE_INFINITY;
    let successorStart = Number.POSITIVE_INFINITY;
    for (const block of placed) {
      if (block.end <= start && block.end > predecessorEnd) predecessorEnd = block.end;
      if (block.start >= end && block.start < successorStart) successorStart = block.start;
    }
    if (
      predecessorEnd > Number.NEGATIVE_INFINITY &&
      start - predecessorEnd < bufferMs &&
      !separatedByProtected(predecessorEnd, start, context.protectedIntervals)
    ) {
      return false;
    }
    if (
      successorStart < Number.POSITIVE_INFINITY &&
      successorStart - end < bufferMs &&
      !separatedByProtected(end, successorStart, context.protectedIntervals)
    ) {
      return false;
    }
  }

  return true;
}

/** Total length of the free axis, in ms. */
function axisLength(segments: readonly Interval[]): number {
  let total = 0;
  for (const segment of segments) total += segment.end - segment.start;
  return total;
}

/** A free-axis offset (from the first free instant) -> wall-clock epoch ms. */
function offsetToWall(segments: readonly Interval[], offset: number): number {
  if (segments.length === 0) return 0;
  let remaining = Math.max(0, offset);
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (remaining <= length) return segment.start + remaining;
    remaining -= length;
  }
  return segments[segments.length - 1].end;
}

/** A wall-clock instant -> its free-axis offset (commitments add no distance). */
function wallToOffset(segments: readonly Interval[], instant: number): number {
  let offset = 0;
  for (const segment of segments) {
    if (instant <= segment.end) return offset + Math.max(0, instant - segment.start);
    offset += segment.end - segment.start;
  }
  return offset;
}

/**
 * Stage A: the finite candidate set for one block, ascending.
 *
 * Sources: each segment's start and latest-fitting start, the balanced target
 * snapped into each segment, the approved start, and the space immediately
 * after/before each already-placed block (so buffers can be respected without
 * losing usable room). Positions that fall outside a free segment, before
 * `effectiveStart`, or past the deadline are dropped.
 */
export function candidateStarts(
  block: BlockRequest,
  ideal: number,
  placed: readonly BlockPlacement[],
  context: PlacementContext,
): number[] {
  const { durationMs } = block;
  const bufferMs = context.bufferMinutes * MINUTE_MS;
  const raw: number[] = [];

  for (const segment of context.segments) {
    if (segment.end - segment.start < durationMs) continue;
    const latest = segment.end - durationMs;
    raw.push(segment.start);
    raw.push(latest);
    raw.push(Math.min(Math.max(ideal, segment.start), latest));
  }

  if (block.plannedStartAt !== undefined) raw.push(block.plannedStartAt);

  for (const placedBlock of placed) {
    raw.push(placedBlock.end + bufferMs);
    raw.push(placedBlock.start - bufferMs - durationMs);
  }

  const seen = new Set<number>();
  const candidates: number[] = [];
  for (const start of raw) {
    if (!Number.isFinite(start)) continue;
    if (start < context.effectiveStart) continue;
    if (!fitsInSegments(context.segments, start, durationMs)) continue;
    if (block.deadlineAt !== undefined && start + durationMs > block.deadlineAt) continue;
    if (seen.has(start)) continue;
    seen.add(start);
    candidates.push(start);
  }
  candidates.sort((a, b) => a - b);
  return candidates;
}

/**
 * Stage B: choose a position for every block, in the order given.
 *
 * The order is the scheduler's (deadlines first — see `rank.ts`). Blocks are
 * spread across a horizon `H = min(F, work + SPREAD_FILL * F)` of the free
 * axis: with `k` blocks, each gap (between blocks and the trailing gap) is
 * `slack / k`. Each block takes the admissible candidate nearest its balanced
 * target, except that an approved start within one gap of the target is kept
 * (stability: no needless churn between identical runs).
 *
 * Blocks with no admissible candidate are omitted from the result; the caller
 * classifies them.
 */
export function scheduleBlocks(
  blocks: readonly BlockRequest[],
  context: PlacementContext,
): Map<string, BlockPlacement> {
  const result = new Map<string, BlockPlacement>();
  if (blocks.length === 0) return result;

  const placed: BlockPlacement[] = [];
  const freeMs = axisLength(context.segments);

  let workMs = 0;
  for (const block of blocks) workMs += block.durationMs;

  const horizonMs = Math.min(freeMs, workMs + Math.floor(freeMs * SPREAD_FILL));
  const slackMs = Math.max(0, horizonMs - workMs);
  // One gap after each block: the trailing gap plus the gaps between blocks.
  // Snapped to whole minutes so every placement stays on the minute grid.
  const gapMs = Math.round(slackMs / blocks.length / MINUTE_MS) * MINUTE_MS;

  let cumulativeMs = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const idealOffset = cumulativeMs + index * gapMs;
    cumulativeMs += block.durationMs;
    const ideal = offsetToWall(context.segments, idealOffset);

    let chosen: number | null = null;

    // Stability first: keep an approved start that is already close to the
    // balanced position (within one gap). This is what makes an unchanged plan
    // stay unchanged between runs.
    if (
      block.plannedStartAt !== undefined &&
      isAdmissible(block.plannedStartAt, block.durationMs, placed, context)
    ) {
      const distance = Math.abs(
        wallToOffset(context.segments, block.plannedStartAt) - idealOffset,
      );
      if (distance <= gapMs) chosen = block.plannedStartAt;
    }

    // Otherwise take the admissible candidate nearest the balanced target;
    // ties go to the earlier start, then the lower candidate index.
    if (chosen === null) {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const start of candidateStarts(block, ideal, placed, context)) {
        if (!isAdmissible(start, block.durationMs, placed, context)) continue;
        const distance = Math.abs(wallToOffset(context.segments, start) - idealOffset);
        if (distance < bestDistance) {
          bestDistance = distance;
          chosen = start;
        }
      }
    }

    if (chosen === null) continue;
    const placement: BlockPlacement = {
      id: block.id,
      start: chosen,
      end: chosen + block.durationMs,
    };
    placed.push(placement);
    result.set(block.id, placement);
  }

  return result;
}
