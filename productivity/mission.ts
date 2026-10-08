import type { DayRollup } from './rollups';
import type { DayKey } from './types';

/**
 * The Daily Mission: the one concrete target a day is measured against.
 *
 * The streak is gated on this rather than on raw focus time, because "25
 * minutes" alone is trivially gamed by leaving a timer running on a task you
 * never touch. Requiring a task to actually close ties the streak to output.
 */
export type MissionGoal = {
  focusMinutes: number;
  tasksCompleted: number;
};

export type DailyMission = {
  /** Index into the ladder, 0-based. */
  level: number;
  goal: MissionGoal;
  label: string;
};

/**
 * Difficulty ladder, indexed by streak level.
 *
 * Both halves must be met — `missionProgress` takes the *minimum* of the two
 * ratios. A day with three tasks closed and two minutes of focus is not a
 * success, and neither is forty minutes of staring at one task.
 */
const MISSION_LADDER: readonly MissionGoal[] = [
  { focusMinutes: 25, tasksCompleted: 1 },
  { focusMinutes: 25, tasksCompleted: 2 },
  { focusMinutes: 30, tasksCompleted: 2 },
  { focusMinutes: 45, tasksCompleted: 3 },
  { focusMinutes: 60, tasksCompleted: 4 },
];

/** Consecutive completed days needed to reach the next rung. */
export const MISSIONS_PER_LEVEL = 5;

export const MAX_MISSION_LEVEL = MISSION_LADDER.length - 1;

/** Streak -> ladder index. Clamped, so a long streak maxes out rather than overflowing. */
export function missionLevelForStreak(streak: number): number {
  const safeStreak = Number.isFinite(streak) ? Math.max(0, streak) : 0;
  return Math.min(MAX_MISSION_LEVEL, Math.floor(safeStreak / MISSIONS_PER_LEVEL));
}

export function missionForLevel(level: number): DailyMission {
  const clamped = Math.min(MAX_MISSION_LEVEL, Math.max(0, level));
  const goal = MISSION_LADDER[clamped];
  return {
    level: clamped,
    goal,
    label: `${goal.focusMinutes} min focus · ${goal.tasksCompleted} ${
      goal.tasksCompleted === 1 ? 'task' : 'tasks'
    }`,
  };
}

/**
 * Today's mission, chosen from the streak as it stood *before* today.
 *
 * Using the pre-today streak is what keeps this non-circular. If today's target
 * depended on a streak that today itself extends, completing the mission would
 * change the target that was being measured, and the completion would be
 * scored against a goal the user never saw.
 */
export function missionForDay(day: DayKey, streakBeforeToday: number): DailyMission {
  return missionForLevel(missionLevelForStreak(streakBeforeToday));
}

export type MissionProgress = {
  focusMinutes: number;
  tasksCompleted: number;
  focusTarget: number;
  tasksTarget: number;
  /** 0..1 for each half. */
  focusRatio: number;
  tasksRatio: number;
  /** min(focusRatio, tasksRatio) — both halves are required. */
  ratio: number;
  complete: boolean;
};

/** Measures a day against a mission. A missing rollup is a zero-progress day, not an error. */
export function missionProgress(
  rollup: DayRollup | undefined,
  mission: DailyMission,
): MissionProgress {
  const focusMinutes = Math.round((rollup?.focusedSeconds ?? 0) / 60);
  const tasksCompleted = rollup?.tasksCompleted ?? 0;

  const focusRatio = clamp01(focusMinutes / Math.max(1, mission.goal.focusMinutes));
  const tasksRatio = clamp01(tasksCompleted / Math.max(1, mission.goal.tasksCompleted));
  const ratio = Math.min(focusRatio, tasksRatio);

  return {
    focusMinutes,
    tasksCompleted,
    focusTarget: mission.goal.focusMinutes,
    tasksTarget: mission.goal.tasksCompleted,
    focusRatio,
    tasksRatio,
    ratio,
    complete: ratio >= 1,
  };
}

export function isMissionComplete(rollup: DayRollup | undefined, mission: DailyMission): boolean {
  return missionProgress(rollup, mission).complete;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? 1 : value;
}
