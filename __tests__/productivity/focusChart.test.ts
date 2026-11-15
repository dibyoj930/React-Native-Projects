/**
 * The day-wise focus chart's view model.
 *
 * `buildFocusChart` turns the window's rollups into the bars a chart renders:
 * order, labels, resting fill, opened fill height and the orange task tip. It
 * was lifted out of `ProductivityDashboard` so the bar maths is testable with
 * plain `expect` calls and the component becomes a renderer of values it was
 * handed.
 */

import {
  buildFocusChart,
  FOCUS_BAR_TRACK_HEIGHT,
  FOCUS_BAR_WIDTH,
  type DayRollup,
} from '../../productivity/domain';

/** A day's rollup with `seconds` of focus and `tasks` closed. */
function rollup(key: string, focusedSeconds: number, tasksCompleted: number): DayRollup {
  return {
    day: key,
    focusedSeconds,
    totalSessions: focusedSeconds > 0 ? 1 : 0,
    completedSessions: 0,
    tasksCompleted,
    isFocusCompleted: false,
  };
}

describe('buildFocusChart — ordering', () => {
  it('renders the window oldest → newest, whatever order it is given', () => {
    // `recentDays` is newest-first; the chart's x-axis must run oldest → newest.
    const chart = buildFocusChart([
      rollup('2026-03-06', 30 * 60, 0),
      rollup('2026-03-05', 15 * 60, 0),
      rollup('2026-03-04', 0, 0),
    ]);
    expect(chart.bars.map((bar) => bar.day)).toEqual([
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
    ]);
  });
});

describe('buildFocusChart — one bar\'s readout', () => {
  it('formats the weekday, duration, tasks and accessibility label', () => {
    const { bars } = buildFocusChart([rollup('2026-03-06', 30 * 60, 2)]);
    const bar = bars[0];
    expect(bar.day).toBe('2026-03-06');
    expect(bar.weekdayLabel).toBe('Fri');
    expect(bar.durationLabel).toBe('30m');
    expect(bar.tasksLabel).toBe('2 tasks');
    // The label ends with the task count, so assistive tech can tell bars apart
    // from the streak tile around them.
    expect(bar.label).toBe('Fri, 30m, 2 tasks');
  });

  it('renders a quiet day as an empty bar', () => {
    const { bars } = buildFocusChart([rollup('2026-03-06', 0, 0)]);
    expect(bars[0].fillPercent).toBe(0);
    expect(bars[0].fillHeight).toBe(0);
    expect(bars[0].tipHeight).toBe(0);
    expect(bars[0].durationLabel).toBe('0m');
    expect(bars[0].tasksLabel).toBe('0 tasks');
  });
});

describe('buildFocusChart — the milestone scale', () => {
  it('arms no celebration below the first rung', () => {
    const { reachedMinutes, targetMinutes } = buildFocusChart([
      rollup('2026-03-06', 5 * 60 * 60, 0),
    ]);
    expect(reachedMinutes).toBeNull();
    expect(targetMinutes).toBe(6 * 60);
  });

  it('sizes to the next rung so the best day never reads a full 100%', () => {
    // A best day exactly on the 6h rung is 75% of the 8h target, not 100%.
    const { bars, targetMinutes, reachedMinutes } = buildFocusChart([
      rollup('2026-03-06', 6 * 60 * 60, 0),
    ]);
    expect(targetMinutes).toBe(8 * 60);
    expect(reachedMinutes).toBe(6 * 60);
    expect(bars[0].fillPercent).toBe(75);
    expect(bars[0].fillPercent).toBeLessThan(100);
  });
});

describe('buildFocusChart — heights', () => {
  it('computes the tip from tasks closed, capped at 12px', () => {
    const three = buildFocusChart([rollup('2026-03-06', 0, 3)]);
    expect(three.bars[0].tipHeight).toBe(9);
    const twelve = buildFocusChart([rollup('2026-03-06', 0, 12)]);
    expect(twelve.bars[0].tipHeight).toBe(12);
  });

  it('clamps the opened fill so the task tip keeps its room', () => {
    // A 6h40 best day is 83⅓% of the 8h target; with a 12px tip the fill must
    // still stop short of the track.
    const { bars } = buildFocusChart([rollup('2026-03-06', 400 * 60, 12)]);
    const bar = bars[0];
    expect(bar.tipHeight).toBe(12);
    expect(bar.fillPercent).toBeCloseTo(83.33, 1);
    expect(bar.fillHeight).toBe(FOCUS_BAR_TRACK_HEIGHT - 12);
  });

  it('reaches a full track only below the tip', () => {
    const { bars } = buildFocusChart([rollup('2026-03-06', 6 * 60 * 60, 3)]);
    // 75% of the 8h target is 48 of 64 points.
    expect(bars[0].fillHeight).toBe(48);
    expect(bars[0].tipHeight).toBe(9);
  });
});

describe('the chart constants', () => {
  it('shares the track and bar widths the panel renders with', () => {
    expect(FOCUS_BAR_TRACK_HEIGHT).toBe(64);
    expect(FOCUS_BAR_WIDTH).toBe(16);
  });
});