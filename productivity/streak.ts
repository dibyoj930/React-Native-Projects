import { dayKeyRange } from './dateKey';
import { isMissionComplete, missionForLevel, missionLevelForStreak } from './mission';
import type { DayRollup } from './rollups';
import { indexRollups } from './rollups';
import type { DayKey, StreakLedger } from './types';

/**
 * Streaks, and the freeze that softens them.
 *
 * A freeze covers a *bad* day, not an *absent* one. A day where you focused for
 * two hours and closed nothing is a day the streak should not survive; a day
 * where you did nothing at all is worse, and must not be papered over. So a
 * freeze is only ever spent on a day that shows genuine, insufficient effort.
 */

/** Consecutive completed days that grant one freeze. */
export const FREEZE_EARN_INTERVAL = 7;

/** A missed day must clear this much focus to be freeze-eligible. */
export const FREEZE_MIN_FOCUSED_SECONDS = 5 * 60;

/** ...and must have closed at least this many tasks. */
export const FREEZE_MIN_TASKS = 1;

/**
 * A missed day is "genuine effort, fell short" if it cleared either bar. Using
 * OR rather than AND keeps the freeze meaningful for a deep-work day that
 * legitimately produced no task closure.
 */
export function qualifiesForFreeze(rollup: DayRollup | undefined): boolean {
  if (!rollup) return false;
  return (
    rollup.focusedSeconds >= FREEZE_MIN_FOCUSED_SECONDS || rollup.tasksCompleted >= FREEZE_MIN_TASKS
  );
}

export type StreakResult = {
  /** Consecutive completed days, not counting today unless today is done. */
  current: number;
  longest: number;
  freezesRemaining: number;
  /** Ledger to persist, including freezes granted during this computation. */
  ledger: StreakLedger;
  /** The day the current run is anchored to, or null when the streak is at zero. */
  lastCountedDay: DayKey | null;
  /** Missed days currently being held together by a freeze. */
  frozenDays: DayKey[];
  isTodayComplete: boolean;
  /** Earliest day with any recorded activity, or null if there is none. */
  firstActiveDay: DayKey | null;
};

export type StreakInput = {
  rollups: readonly DayRollup[];
  /** Local day key for "now". Today never breaks a streak — it is still in play. */
  today: DayKey;
  ledger: StreakLedger;
};

/**
 * Walks every calendar day from the first day with activity through today.
 *
 * Forward, not backward, and not from a stored count. Walking forward is what
 * makes `longest` correct and — critically — lets the freeze earned on day 7 be
 * spent on day 12. A backward walk from today cannot know what was earned
 * earlier without replaying the whole history anyway, and storing a running
 * count means any missed event permanently desynchronises it.
 */
export function computeStreak({ rollups, today, ledger }: StreakInput): StreakResult {
  const firstActiveDay = rollups.length > 0 ? rollups[0].day : null;
  const base: StreakResult = {
    current: 0,
    longest: 0,
    freezesRemaining: Math.max(0, ledger.freezesEarned - ledger.freezesSpent),
    ledger: { ...ledger },
    lastCountedDay: null,
    frozenDays: [],
    isTodayComplete: false,
    firstActiveDay,
  };

  // No history means no streak, and no reason to walk a date range that could
  // span years of an unused install.
  if (firstActiveDay === null || firstActiveDay > today) return base;

  const byDay = indexRollups(rollups);

  let streak = 0;
  let longest = 0;
  let freezesEarned = ledger.freezesEarned;
  let freezesSpent = ledger.freezesSpent;
  let lastCountedDay: DayKey | null = null;
  let isTodayComplete = false;
  const frozenDays: DayKey[] = [];

  for (const day of dayKeyRange(firstActiveDay, today)) {
    const rollup = byDay.get(day);
    // Level is read from the streak *before* this day resolves, so a day's
    // target never moves because of the day being scored.
    const mission = missionForLevel(missionLevelForStreak(streak));

    if (isMissionComplete(rollup, mission)) {
      streak += 1;
      longest = Math.max(longest, streak);
      lastCountedDay = day;
      if (day === today) isTodayComplete = true;
      if (streak % FREEZE_EARN_INTERVAL === 0) {
        freezesEarned += 1;
      }
      continue;
    }

    // Today is unfinished, not missed. It neither extends nor breaks the run.
    if (day === today) continue;

    if (qualifiesForFreeze(rollup) && freezesEarned - freezesSpent > 0) {
      freezesSpent += 1;
      frozenDays.push(day);
      // Held, but a frozen day does not advance the counter — otherwise the
      // streak could be inflated past the number of days actually completed.
      continue;
    }

    streak = 0;
    lastCountedDay = null;
  }

  return {
    current: streak,
    longest,
    freezesRemaining: Math.max(0, freezesEarned - freezesSpent),
    ledger: { freezesEarned, freezesSpent },
    lastCountedDay,
    frozenDays,
    isTodayComplete,
    firstActiveDay,
  };
}
