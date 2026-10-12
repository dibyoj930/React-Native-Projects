/**
 * Interval algebra — the half-open primitives the scheduler is built on.
 *
 * The rule the whole engine depends on is here: touching intervals do not
 * overlap. Every other function is a small, pinned consequence of that.
 */

import {
  asInterval,
  contains,
  fits,
  mergeIntervals,
  MINUTE_MS,
  overlaps,
  subtractIntervals,
} from '../../replan/interval';

describe('asInterval', () => {
  it('leaves an ordered pair alone', () => {
    expect(asInterval(10, 20)).toEqual({ start: 10, end: 20 });
  });

  it('swaps an inverted pair so start <= end always holds', () => {
    expect(asInterval(20, 10)).toEqual({ start: 10, end: 20 });
  });
});

describe('overlaps', () => {
  it('is true for a real intersection', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
  });

  it('is false when one merely touches the other', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });

  it('is false for disjoint intervals', () => {
    expect(overlaps({ start: 0, end: 5 }, { start: 10, end: 20 })).toBe(false);
  });
});

describe('contains', () => {
  it('accepts an inner interval with touching edges', () => {
    expect(contains({ start: 0, end: 10 }, { start: 0, end: 10 })).toBe(true);
    expect(contains({ start: 0, end: 10 }, { start: 2, end: 8 })).toBe(true);
  });

  it('rejects an inner interval that pokes out', () => {
    expect(contains({ start: 0, end: 10 }, { start: 5, end: 11 })).toBe(false);
  });
});

describe('mergeIntervals', () => {
  it('coalesces overlapping and touching intervals', () => {
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 15, end: 25 },
      ]),
    ).toEqual([{ start: 0, end: 25 }]);
  });

  it('keeps disjoint intervals separate', () => {
    expect(
      mergeIntervals([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 40 },
    ]);
  });

  it('drops zero-width intervals', () => {
    expect(mergeIntervals([{ start: 5, end: 5 }])).toEqual([]);
  });
});

describe('subtractIntervals', () => {
  it('yields the free segments left by a hole in the middle', () => {
    expect(
      subtractIntervals({ start: 0, end: 60 }, [{ start: 20, end: 30 }]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 60 },
    ]);
  });

  it('returns the base whole when nothing is removed', () => {
    expect(subtractIntervals({ start: 0, end: 60 }, [])).toEqual([
      { start: 0, end: 60 },
    ]);
  });

  it('ignores holes outside the base', () => {
    expect(
      subtractIntervals({ start: 0, end: 60 }, [{ start: 70, end: 80 }]),
    ).toEqual([{ start: 0, end: 60 }]);
  });
});

describe('fits', () => {
  it('is true when the whole block lies inside', () => {
    expect(fits({ start: 0, end: 60_000 }, 0, 1)).toBe(true);
  });

  it('is false when the block would spill past the end', () => {
    expect(fits({ start: 0, end: 60_000 }, 30_000, 1)).toBe(false);
  });

  it('counts minutes, not milliseconds', () => {
    expect(fits({ start: 0, end: 5 * MINUTE_MS }, 0, 5)).toBe(true);
  });
});
