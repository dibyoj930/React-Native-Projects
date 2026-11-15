/**
 * Placement — Stage A (candidate slots) and Stage B (scored selection).
 *
 * The engine-level scenarios live in scheduling-scenarios.test.ts; these tests
 * pin the primitives: admissibility (the hard constraints, independent of any
 * score) and the spread/stability behaviour of `scheduleBlocks`.
 */

import {
  candidateStarts,
  isAdmissible,
  scheduleBlocks,
  type BlockPlacement,
  type BlockRequest,
  type PlacementContext,
} from '../../replan/placement';
import type { Interval, ProtectedInterval } from '../../replan/types';

const MINUTE = 60_000;
const m = (minutes: number) => minutes * MINUTE;

/** A context with no commitments and one segment `[0, lengthMinutes)`. */
function context(
  lengthMinutes: number,
  overrides: Partial<PlacementContext> = {},
): PlacementContext {
  return {
    segments: [{ start: 0, end: m(lengthMinutes) }],
    protectedIntervals: [],
    effectiveStart: 0,
    bufferMinutes: 0,
    ...overrides,
  };
}

function block(id: string, minutes: number, extra: Partial<BlockRequest> = {}): BlockRequest {
  return { id, durationMs: m(minutes), ...extra };
}

function place(
  blocks: readonly BlockRequest[],
  ctx: PlacementContext,
): Map<string, BlockPlacement> {
  return scheduleBlocks(blocks, ctx);
}

function at(map: Map<string, BlockPlacement>, id: string) {
  const p = map.get(id);
  return p ? [p.start / MINUTE, p.end / MINUTE] : undefined;
}

describe('isAdmissible', () => {
  it('rejects a start before the effective start', () => {
    expect(isAdmissible(-1, m(30), [], context(120, { effectiveStart: 0 }))).toBe(false);
  });

  it('rejects a block that does not fit a free segment', () => {
    const ctx = context(60);
    expect(isAdmissible(m(40), m(30), [], ctx)).toBe(false);
    expect(isAdmissible(m(30), m(30), [], ctx)).toBe(true);
  });

  it('rejects an overlap with a protected interval', () => {
    const ctx = context(120, {
      protectedIntervals: [{ id: 'c', kind: 'commitment', start: m(30), end: m(60) }],
    });
    expect(isAdmissible(m(20), m(30), [], ctx)).toBe(false);
    expect(isAdmissible(m(60), m(30), [], ctx)).toBe(true);
  });

  it('rejects an overlap with an already-placed block', () => {
    const placed: BlockPlacement[] = [{ id: 'a', start: 0, end: m(30) }];
    expect(isAdmissible(m(15), m(30), placed, context(120))).toBe(false);
    expect(isAdmissible(m(30), m(30), placed, context(120))).toBe(true);
  });

  it('requires the buffer between adjacent blocks', () => {
    const placed: BlockPlacement[] = [{ id: 'a', start: 0, end: m(30) }];
    const ctx = context(120, { bufferMinutes: 10 });
    expect(isAdmissible(m(35), m(30), placed, ctx)).toBe(false);
    expect(isAdmissible(m(40), m(30), placed, ctx)).toBe(true);
  });

  it('allows a zero gap when a protected interval fills the gap', () => {
    const placed: BlockPlacement[] = [{ id: 'a', start: 0, end: m(30) }];
    const ctx = context(120, {
      bufferMinutes: 10,
      // The commitment consumes the whole 30->35 gap, so the next block may
      // begin the moment it ends without waiting out the buffer.
      protectedIntervals: [{ id: 'c', kind: 'commitment', start: m(30), end: m(35) }],
    });
    expect(isAdmissible(m(35), m(30), placed, ctx)).toBe(true);
    // Without the commitment filling that gap the buffer is required.
    const bare = context(120, { bufferMinutes: 10 });
    expect(isAdmissible(m(35), m(30), placed, bare)).toBe(false);
  });
});

describe('candidateStarts', () => {
  it('offers the segment start, the latest fit, and the balanced target', () => {
    const ctx = context(120);
    const starts = candidateStarts(block('a', 30), m(45), [], ctx);
    expect(starts).toEqual([0, m(45), m(90)]);
  });

  it('drops candidates past the deadline or outside the workday', () => {
    const ctx = context(120);
    const starts = candidateStarts(block('a', 30, { deadlineAt: m(70) }), m(100), [], ctx);
    // 90 and 100 end after 70 and are dropped; 0 remains.
    expect(starts).toEqual([0]);
  });

  it('offers the space just after an already-placed block, buffer included', () => {
    const placed: BlockPlacement[] = [{ id: 'a', start: 0, end: m(30) }];
    const ctx = context(120, { bufferMinutes: 10 });
    const starts = candidateStarts(block('b', 20), m(60), placed, ctx);
    expect(starts).toContain(m(40)); // 30 + 10
  });
});

describe('scheduleBlocks — spreading', () => {
  it('starts the first block at the effective start and spaces the rest', () => {
    const result = place([block('a', 40), block('b', 40)], context(200));
    expect(at(result, 'a')).toEqual([0, 40]);
    // work 80 across F=200: horizon 180, slack 100, one gap 50 => b at 90.
    expect(at(result, 'b')).toEqual([90, 130]);
  });

  it('skips commitments without counting them as distance', () => {
    const ctx = context(0, {
      segments: [
        { start: m(0), end: m(60) },
        { start: m(120), end: m(240) },
      ] as Interval[],
      protectedIntervals: [
        { id: 'c', kind: 'commitment', start: m(60), end: m(120) },
      ] as ProtectedInterval[],
    });
    const result = place([block('a', 30), block('b', 30)], ctx);
    for (const p of result.values()) {
      expect(p.start >= m(120) || p.end <= m(60)).toBe(true);
    }
  });

  it('honours the buffer between blocks', () => {
    const result = place([block('a', 30), block('b', 30)], context(180, { bufferMinutes: 10 }));
    const a = result.get('a');
    const b = result.get('b');
    expect(a && b).toBeTruthy();
    expect(b!.start - a!.end).toBeGreaterThanOrEqual(m(10));
  });

  it('omits a block that cannot fit at all', () => {
    const result = place([block('big', 200)], context(60));
    expect(result.has('big')).toBe(false);
  });
});

describe('scheduleBlocks — stability', () => {
  it('keeps an approved start within one gap of the balanced position', () => {
    // Single block: F=200, W=40, horizon 140, slack 100, gap 100, target 0.
    // An approved start at 50 is within the gap, so it is kept.
    const result = place([block('a', 40, { plannedStartAt: m(50) })], context(200));
    expect(at(result, 'a')).toEqual([50, 90]);
  });

  it('re-balances an approved start that is far from the balanced position', () => {
    const result = place([block('a', 40, { plannedStartAt: m(150) })], context(200));
    expect(at(result, 'a')).toEqual([0, 40]);
  });
});

describe('scheduleBlocks — determinism', () => {
  it('treats the block list order as the placement order', () => {
    // The engine always hands blocks over in a canonical order (see rank.ts),
    // so the placement order is stable regardless of how tasks arrived.
    const forward = place([block('a', 40), block('b', 40)], context(200));
    expect(at(forward, 'a')).toEqual([0, 40]);
    expect(at(forward, 'b')).toEqual([90, 130]);
  });

  it('produces identical results across repeated identical calls', () => {
    const ctx = context(300, { bufferMinutes: 5 });
    const blocks = [block('a', 30), block('b', 45), block('c', 20)];
    const first = place(blocks, ctx);
    const second = place(blocks, ctx);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});
