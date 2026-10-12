/**
 * The focus-milestone ladder.
 *
 * A full bar is the next rung *above* the window's best day, starting at six
 * hours and stepping up two at a time — 6h, 8h, 10h and on. The scale always
 * sits ahead of the record, so no day can ever fill its bar to exactly 100%:
 * reaching a milestone is celebrated and the target moves on.
 *
 * Pure, like the rest of `productivity/` — no React, no storage — so the ladder
 * maths is testable with plain `expect` calls. This used to live inside
 * `components/ProductivityDashboard.tsx` as private functions, which meant the
 * only way to check it was to render a chart.
 */

/** The first rung of the ladder, in minutes. */
export const FOCUS_MILESTONE_START_MINUTES = 6 * 60;

/** The gap between rungs, in minutes. */
export const FOCUS_MILESTONE_STEP_MINUTES = 2 * 60;

/**
 * The target a full bar stands for, in minutes: the next rung strictly above
 * the window's best day.
 *
 * The ladder starts at `FOCUS_MILESTONE_START_MINUTES` and climbs in
 * `FOCUS_MILESTONE_STEP_MINUTES` steps. Taking the rung *above* the record —
 * never the record itself — is what keeps every bar under 100%: the scale
 * always sits one milestone ahead of the best day.
 */
export function focusTargetMinutes(maxMinutes: number): number {
  if (maxMinutes < FOCUS_MILESTONE_START_MINUTES) return FOCUS_MILESTONE_START_MINUTES;
  const rungs = Math.floor(
    (maxMinutes - FOCUS_MILESTONE_START_MINUTES) / FOCUS_MILESTONE_STEP_MINUTES,
  );
  return FOCUS_MILESTONE_START_MINUTES + (rungs + 1) * FOCUS_MILESTONE_STEP_MINUTES;
}

/**
 * The highest milestone a day's focus has crossed, in minutes, or `null` below
 * the first rung.
 *
 * Drives the celebration: a best day of 9h has cleared 6h and 8h, so it
 * celebrates 8h with the next target of 10h. The rung celebrated is the last
 * one crossed, not the one currently in view.
 */
export function reachedMilestoneMinutes(maxMinutes: number): number | null {
  if (maxMinutes < FOCUS_MILESTONE_START_MINUTES) return null;
  const rungs = Math.floor(
    (maxMinutes - FOCUS_MILESTONE_START_MINUTES) / FOCUS_MILESTONE_STEP_MINUTES,
  );
  return FOCUS_MILESTONE_START_MINUTES + rungs * FOCUS_MILESTONE_STEP_MINUTES;
}

/**
 * Focus fill as a percentage of the target milestone.
 *
 * The track is a fixed height and only the fill moves, so a day reads as "how
 * much of the next focus target is this" rather than "how big is this bar".
 * The target is the rung above the window's best day, so a fill approaches but
 * never reaches a full 100%.
 */
export function focusFillPercent(focusedSeconds: number, targetMinutes: number): number {
  const minutes = focusedSeconds / 60;
  if (!(minutes > 0) || !(targetMinutes > 0)) return 0;
  return Math.min(100, (minutes / targetMinutes) * 100);
}