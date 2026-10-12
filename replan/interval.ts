/**
 * Interval algebra for the replan engine — half-open `[start, end)` in epoch ms.
 *
 * Pure: no React, no RN, no storage, no clock. Every function returns data. Date
 * construction lives in productivity/dateKey.ts; this file only reasons about
 * integer bounds. These are the primitives the placement phases build on.
 *
 * Invariants: never return zero-width or negative intervals; drop empties. All
 * arithmetic is integer minutes.
 */

import type { Interval } from './types';

/** One minute in epoch milliseconds. */
export const MINUTE_MS = 60_000;

/** Normalise a candidate interval. Guarantees `start <= end`. */
export function asInterval(start: number, end: number): Interval {
  return start <= end ? { start, end } : { start: end, end: start };
}

/**
 * True iff the half-open intervals intersect.
 *
 * Touching (`a.end === b.start`) is NOT an overlap — the whole scheduler depends
 * on this rule, because a block ending exactly when the next begins is adjacent,
 * not conflicting.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True iff `inner` lies wholly within `outer` (touching edges allowed). */
export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * Sort by start, coalesce overlapping OR touching intervals.
 *
 * Used to protect conflicting commitments without double-counting them: two
 * back-to-back commitments become one protected span, so the free time between
 * them is not mistaken for a scheduling gap.
 */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list
    .map((interval) => asInterval(interval.start, interval.end))
    .filter((interval) => interval.start < interval.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    // `<=` rather than `<`: touching intervals coalesce, which is what makes a
    // merged list safe to subtract without leaving zero-width slivers.
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

/**
 * The sub-intervals of `base` not covered by `remove`, sorted and merged.
 *
 * This yields the free segments in phase 3 of the engine. `remove` is merged
 * first, so overlapping inputs cannot punch the same hole twice.
 */
export function subtractIntervals(
  base: Interval,
  remove: readonly Interval[],
): Interval[] {
  const holes = mergeIntervals(remove);
  const free: Interval[] = [];
  let cursor = base.start;

  for (const hole of holes) {
    if (hole.end <= cursor) continue;
    if (hole.start >= base.end) break;
    if (hole.start > cursor) {
      free.push({ start: cursor, end: hole.start });
    }
    cursor = hole.end;
    if (cursor >= base.end) break;
  }

  if (cursor < base.end) free.push({ start: cursor, end: base.end });
  return free.filter((interval) => interval.start < interval.end);
}

/** True iff `[start, start + minutes)` lies inside `segment`. */
export function fits(segment: Interval, start: number, minutes: number): boolean {
  const end = start + minutes * MINUTE_MS;
  return start >= segment.start && end <= segment.end;
}
