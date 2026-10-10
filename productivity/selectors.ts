import { buildAttribution, type Attribution } from './attribution';
import { localDateKey } from './dateKey';
import { computeMomentum, endOfDayScore, type MomentumScore } from './momentum';
import { missionForDay, missionProgress, type DailyMission, type MissionProgress } from './mission';
import { computeRollups, indexRollups, recentDayWindow, type DayRollup } from './rollups';
import { projectOpenSessions } from './sessions';
import { computeStreak, type StreakResult } from './streak';
import type {
  ActiveSession,
  CompletionRecord,
  DayKey,
  FocusSession,
  MomentumMemory,
  StreakLedger,
} from './types';

/**
 * Composes the individual scorers into one snapshot.
 *
 * This is the only place the order of operations is decided, and the order
 * matters: the mission a day is judged against is derived from the streak the
 * day *started* with, which is only knowable after the streak walk has run.
 */
export type ProductivitySnapshot = {
  /** The `now` this snapshot was built from. */
  now: number;
  /** Local day key for `now`. */
  today: DayKey;
  rollups: DayRollup[];
  todayRollup: DayRollup | undefined;
  streak: StreakResult;
  mission: DailyMission;
  missionToday: MissionProgress;
  momentum: MomentumScore;
  attribution: Map<string, Attribution>;
  /** Recent days, newest first. Feeds the Focus Journey view. */
  recentDays: DayRollup[];
};

export type SnapshotInput = {
  sessions: readonly FocusSession[];
  active: readonly ActiveSession[];
  tasks: readonly CompletionRecord[];
  ledger: StreakLedger;
  memory: MomentumMemory;
  now: number;
  /** How many days of history the journey view shows. */
  recentDayCount?: number;
};

export const DEFAULT_RECENT_DAYS = 7;

export function buildSnapshot({
  sessions,
  active,
  tasks,
  ledger,
  memory,
  now,
  recentDayCount = DEFAULT_RECENT_DAYS,
}: SnapshotInput): ProductivitySnapshot {
  const today = localDateKey(now);

  // In-flight focus counts toward today, otherwise a running timer would show
  // zero progress for the whole of its duration — the user would only see the
  // number move after the session they are watching had already ended.
  const withOpen = [...sessions, ...projectOpenSessions(active, now)];

  const rollups = computeRollups(withOpen, tasks);
  const streak = computeStreak({ rollups, today, ledger });

  // The walk already resolved today against the streak as it stood this morning.
  // Undoing today's own contribution recovers that morning value, which is the
  // only honest input for choosing today's target.
  const streakBeforeToday = Math.max(0, streak.current - (streak.isTodayComplete ? 1 : 0));
  const mission = missionForDay(today, streakBeforeToday);

  const byDay = indexRollups(rollups);

  return {
    now,
    today,
    rollups,
    todayRollup: byDay.get(today),
    streak,
    mission,
    missionToday: missionProgress(byDay.get(today), mission),
    momentum: computeMomentum({
      today: byDay.get(today),
      mission,
      streak: streak.current,
      memory,
      now,
    }),
    attribution: buildAttribution(withOpen, active, tasks, now),
    recentDays: recentDayWindow(rollups, today, recentDayCount),
  };
}

/**
 * Scores a day at the moment it ends, for carry-over into the next one.
 *
 * Separate from `buildSnapshot` because the closing score must be computed with
 * `now` pinned to the *end* of the finished day, not the present — otherwise a
 * day that ended three weeks ago gets re-scored against three weeks of history.
 */
export function closingScoreFor(
  input: Omit<SnapshotInput, 'now'> & { dayEndedAt: number },
): number {
  const snapshot = buildSnapshot({ ...input, now: input.dayEndedAt });
  return endOfDayScore(snapshot.momentum);
}
