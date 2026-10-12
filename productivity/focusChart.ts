/**
 * The day-wise focus chart's view model.
 *
 * A bar per day of the window and the numbers behind each bar's height: how
 * full it should read, how tall the opened fill is in points, and how tall the
 * orange task tip is. Building these here — rather than inside the component —
 * is what lets the chart maths be tested with plain `expect` calls, and it
 * keeps `ProductivityDashboard` a renderer of values it was handed.
 *
 * Pure. No React Native, no storage.
 */

import { formatDuration, formatWeekday } from './format';
import { focusFillPercent, focusTargetMinutes, reachedMilestoneMinutes } from './milestones';
import type { DayRollup } from './rollups';
import type { DayKey } from './types';

/**
 * Height of a bar track, in px.
 *
 * Shared between the style and the fill maths: the opened bar animates its
 * height in points, so both have to agree on how tall a full track is.
 */
export const FOCUS_BAR_TRACK_HEIGHT = 64;

/**
 * Width of a bar, in px.
 *
 * Each bar sits in a `flex: 1` column, so a full-width track stretches to
 * whatever share of the panel that column gets — a slab per day, seven times
 * over. A fixed, centred width keeps the seven columns evenly spaced while the
 * sticks themselves stay thin.
 */
export const FOCUS_BAR_WIDTH = 16;

/** One bar's readout: everything a day's column needs in order to be drawn. */
export type FocusBarViewModel = {
  /** The day this bar stands for. Also its React key. */
  day: DayKey;
  /** The weekday shown under the bar (`Mon`, `Tue`). */
  weekdayLabel: string;
  /**
   * The pressable's accessibility label — `Mon, 30m, 2 tasks`. Ends with the
   * task count so a reader can tell bars apart from the streak tile.
   */
  label: string;
  /** The time shown above the bar, already formatted (`30m`, `1h 42m`). */
  durationLabel: string;
  /** The task sentence: `2 tasks`, or `1 task`. Shown only while open. */
  tasksLabel: string;
  /** The resting fill as a percentage of the track (0..100, never 100 by design). */
  fillPercent: number;
  /** The opened bar's fill height in px, leaving room for the task tip. */
  fillHeight: number;
  /** The orange tip height in px; 0 when the day closed no tasks. */
  tipHeight: number;
};

/** The whole chart: the bars plus the two milestone figures the celebration reads. */
export type FocusChartViewModel = {
  /** Oldest → newest, ready to render left-to-right. */
  bars: FocusBarViewModel[];
  /** The next-rung target a full bar stands for, in minutes. */
  targetMinutes: number;
  /** The highest rung the best day crossed, or `null` below the first. */
  reachedMinutes: number | null;
};

/**
 * Builds the chart's bars from the window's rollups.
 *
 * `days` is newest-first — the `recentDays` contract — and is reversed here, so
 * a chart's x-axis runs oldest → newest like every calendar. Mapped in array
 * order the bars would run today → six days ago, the dates would read
 * `06 05 04 03 02 01 28`, and time would appear to travel backwards.
 *
 * The target is the rung above the window's best day, so every bar falls short
 * of 100% and the celebration is armed only once a milestone has genuinely been
 * crossed.
 */
export function buildFocusChart(days: readonly DayRollup[]): FocusChartViewModel {
  // The bars' scale is a focus milestone, not the window's own max: a day reads
  // as "how much of the next target is this". The target is the rung just above
  // the window's best day, so even that best day falls short of a full bar — and
  // a consistent routine fills the chart instead of petering out at the bottom.
  const windowMaxMinutes = days.reduce(
    (max, rollup) => Math.max(max, rollup.focusedSeconds / 60),
    0,
  );
  const targetMinutes = focusTargetMinutes(windowMaxMinutes);
  const reachedMinutes = reachedMilestoneMinutes(windowMaxMinutes);

  const bars = [...days].reverse().map((rollup) => {
    const fillPercent = focusFillPercent(rollup.focusedSeconds, targetMinutes);
    const tipHeight = taskTipHeight(rollup.tasksCompleted);
    const durationLabel = formatDuration(rollup.focusedSeconds);
    const tasksLabel = `${rollup.tasksCompleted} ${
      rollup.tasksCompleted === 1 ? 'task' : 'tasks'
    }`;
    const weekdayLabel = formatWeekday(rollup.day);

    return {
      day: rollup.day,
      weekdayLabel,
      label: `${weekdayLabel}, ${durationLabel}, ${tasksLabel}`,
      durationLabel,
      tasksLabel,
      fillPercent,
      fillHeight: fillHeightPx(fillPercent, tipHeight),
      tipHeight,
    };
  });

  return { bars, targetMinutes, reachedMinutes };
}

/**
 * Fill height, in px, for the opened bar.
 *
 * The orange task tip sits above the green fill inside the same fixed track, so
 * a full day's green stops short to leave the cap room to sit.
 */
function fillHeightPx(percent: number, tipHeight: number): number {
  const ratio = percent / 100;
  const room = FOCUS_BAR_TRACK_HEIGHT - tipHeight;
  return Math.max(0, Math.min(room, ratio * FOCUS_BAR_TRACK_HEIGHT));
}

/**
 * Orange tip height, in px, from the tasks closed that day.
 *
 * None at zero; otherwise ~3px per task, capped so a very productive day cannot
 * overflow the track it sits in.
 */
function taskTipHeight(tasksCompleted: number): number {
  if (!(tasksCompleted > 0)) return 0;
  return Math.min(12, tasksCompleted * 3);
}