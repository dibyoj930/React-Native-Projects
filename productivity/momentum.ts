import { missionProgress, type DailyMission } from './mission';
import type { DayRollup } from './rollups';
import type { MomentumMemory } from './types';

/**
 * Momentum: a single 0–100 number summarising how productive today has been.
 *
 * It is *derived*, never stored. The only two things that persist are
 * `lastEventAt` (to know how long you have been idle) and `previousDayScore`
 * (so yesterday can nudge today). Everything else is recomputed from the session
 * and task logs on every read.
 *
 * The reason is that a stored score needs perfect event delivery to stay
 * correct. One dropped write, one replayed event, one reinstall, and it is
 * permanently wrong with no way to tell. Derived state cannot drift, and it is
 * cheap: the inputs are already in memory.
 */

export type MomentumBand = 'dormant' | 'warming' | 'steady' | 'strong' | 'peak';

export type MomentumScore = {
  /** 0–100, already decayed. */
  total: number;
  band: MomentumBand;
  /** Undecayed component breakdown, for explaining the number in the UI. */
  focusPoints: number;
  taskPoints: number;
  missionPoints: number;
  streakPoints: number;
  carryPoints: number;
  rawTotal: number;
  decayMultiplier: number;
  hoursSinceEvent: number | null;
  focusMinutes: number;
  tasksCompleted: number;
  missionComplete: boolean;
  streak: number;
};

/** Point weights. Sum to 100 before carry-over, so a perfect day is 110 raw. */
const POINTS_FOCUS = 40;
const POINTS_TASKS = 25;
const POINTS_MISSION = 20;
const POINTS_STREAK_MAX = 15;
const POINTS_CARRY_MAX = 10;

/** Idle time before decay starts. Below this, a full day of credit stands. */
const GRACE_HOURS = 12;

/** Additional idle hours from grace to the floor. */
const HOURS_TO_FLOOR = 60;

/** Momentum never decays below this fraction, so it is discouraging, not destructive. */
const IDLE_FLOOR = 0.5;

export type MomentumInput = {
  today: DayRollup | undefined;
  mission: DailyMission;
  streak: number;
  memory: MomentumMemory;
  now: number;
};

export function computeMomentum({
  today,
  mission,
  streak,
  memory,
  now,
}: MomentumInput): MomentumScore {
  const progress = missionProgress(today, mission);

  const focusPoints = POINTS_FOCUS * progress.focusRatio;
  const taskPoints = POINTS_TASKS * progress.tasksRatio;
  const missionPoints = progress.complete ? POINTS_MISSION : 0;
  const streakPoints = Math.min(POINTS_STREAK_MAX, Math.max(0, streak) * 1.5);
  const carryPoints = POINTS_CARRY_MAX * clamp01(memory.previousDayScore / 100);

  const rawTotal =
    focusPoints + taskPoints + missionPoints + streakPoints + carryPoints;

  const hoursSinceEvent =
    memory.lastEventAt === null ? null : Math.max(0, (now - memory.lastEventAt) / 3_600_000);

  // Never having done anything is treated as fully idle rather than as fresh,
  // which is why it reads the floor instead of no penalty at all.
  const idleHours = hoursSinceEvent ?? Number.POSITIVE_INFINITY;
  const overGrace = Math.max(0, idleHours - GRACE_HOURS);
  const decayMultiplier = Math.max(IDLE_FLOOR, 1 - overGrace / HOURS_TO_FLOOR);

  const total = clampScore(rawTotal * decayMultiplier);

  return {
    total,
    band: bandFor(total),
    focusPoints,
    taskPoints,
    missionPoints,
    streakPoints,
    carryPoints,
    rawTotal,
    decayMultiplier,
    hoursSinceEvent,
    focusMinutes: progress.focusMinutes,
    tasksCompleted: progress.tasksCompleted,
    missionComplete: progress.complete,
    streak,
  };
}

export function bandFor(total: number): MomentumBand {
  if (total < 20) return 'dormant';
  if (total < 40) return 'warming';
  if (total < 60) return 'steady';
  if (total < 80) return 'strong';
  return 'peak';
}

/**
 * How each band is described to the user.
 *
 * Deliberately sentences rather than labels. This used to be
 * `Dormant / Warming up / Steady / Strong / Peak` — a vocabulary the user had to
 * learn, and `Dormant` in particular reads as a verdict on the person rather than
 * an instruction. Momentum is meant to be encouragement, so every band now says
 * something encouraging, and the lowest one says what to do next.
 *
 * The score behind these is unchanged and still computed; only the words changed.
 */
export const MOMENTUM_BAND_LABELS: Record<MomentumBand, string> = {
  peak: '🔥 You’re in the flow',
  strong: '⚡ Great momentum',
  steady: '👍 You’re making good progress',
  warming: '🌱 Just getting started',
  dormant: '💪 Let’s get going',
};

/**
 * What `previousDayScore` should be saved as when the day rolls over.
 *
 * Called with the score at the final moment of a day. `previousDayScore` is
 * scaled by `POINTS_CARRY_MAX / 100` when read back, so storing the raw 0–100
 * keeps the carry contribution bounded at 10 points.
 */
export function endOfDayScore(score: MomentumScore): number {
  return clampScore(score.total);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? 1 : value;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 100 ? 100 : Math.round(value);
}
