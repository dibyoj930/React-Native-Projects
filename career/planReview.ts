/**
 * The career view of a plan-review window.
 *
 * Plan Review already answers "what was planned versus what happened" for the
 * whole day. This module narrows the same facts to career-linked work, without
 * changing the plan or writing a second history:
 *
 *   - planned / completed / postponed / missed come from the plan outcome rows,
 *     using the career link snapshotted when the comparison was recorded;
 *   - recorded focus comes from sessions that carried an explicit career link;
 *   - milestone progress is read from the current career document for the goals
 *     that actually appeared in the window.
 *
 * Pure. No storage, no React, no clock. A day with no career activity is kept in
 * the window with zero counts so the UI can say "none" rather than omit a day.
 */

import { localDateKey, type DayKey } from '../shared/date';
import { sanitizeCareerLink, type CareerLink } from '../shared/careerLink';
import type { FocusSession } from '../productivity/types';
import type { PlanOutcome } from '../replan/types';

import type { CareerDoc } from './types';

export type CareerPlanReviewDay = {
  dayKey: DayKey;
  planned: number;
  completed: number;
  postponed: number;
  missed: number;
  plannedFocusMins: number;
  actualFocusMins: number;
};

export type CareerPlanReview = {
  /** Ascending, matching the requested window. */
  days: CareerPlanReviewDay[];
  planned: number;
  completed: number;
  postponed: number;
  missed: number;
  plannedFocusMins: number;
  actualFocusMins: number;
  /** Any career-linked plan row or attributed session in the window. */
  hasActivity: boolean;
  /** Goals that appeared in a career-linked row, deduplicated. */
  goalIds: string[];
  /** Goals with at least one postponed career activity. */
  postponedGoalIds: string[];
  /** Goals with at least one missed career activity. */
  missedGoalIds: string[];
  /** Milestones belonging to goals with activity; archived ones are excluded. */
  milestoneCompleted: number;
  milestoneTotal: number;
};

export type CareerPlanReviewInput = {
  doc: CareerDoc;
  /** The window's day keys, ascending. */
  days: readonly DayKey[];
  /** One outcome per day, or undefined for a day with no record. */
  outcomes: readonly (PlanOutcome | undefined)[];
  /** The full session log; only attributed sessions inside the window count. */
  sessions: readonly FocusSession[];
};

type LinkIndex = {
  goalIds: Set<string>;
  skillIds: Set<string>;
  milestoneGoal: Map<string, string>;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function buildCareerPlanReview({
  doc,
  days,
  outcomes,
  sessions,
}: CareerPlanReviewInput): CareerPlanReview {
  const index = indexLinks(doc);
  const wantedDays = new Set(days);
  const byDay = new Map<DayKey, CareerPlanReviewDay>();
  for (const dayKey of days) {
    byDay.set(dayKey, {
      dayKey,
      planned: 0,
      completed: 0,
      postponed: 0,
      missed: 0,
      plannedFocusMins: 0,
      actualFocusMins: 0,
    });
  }

  const goalIds = new Set<string>();
  const postponedGoalIds = new Set<string>();
  const missedGoalIds = new Set<string>();
  let hasActivity = false;

  for (const outcome of outcomes) {
    if (!outcome) continue;
    const day = byDay.get(outcome.dayKey);
    if (!day) continue;

    for (const result of outcome.results) {
      const link = resolvableLink(result.career, index);
      if (!link) continue;
      hasActivity = true;
      if (link.goalId) goalIds.add(link.goalId);

      if (result.wasScheduled) day.planned += 1;
      if (result.completed) day.completed += 1;
      if (result.status === 'postponed') {
        day.postponed += 1;
        if (link.goalId) postponedGoalIds.add(link.goalId);
      }
      if (result.status === 'missed') {
        day.missed += 1;
        if (link.goalId) missedGoalIds.add(link.goalId);
      }
      if (result.plannedStart != null && result.plannedEnd != null) {
        day.plannedFocusMins += Math.max(0, result.plannedEnd - result.plannedStart) / 60_000;
      }
    }
  }

  // Recorded focus relies on the session's own snapshot, not on the task's
  // current link. That keeps this figure consistent with the career-practice
  // rule: time is career practice only when it was attributed when it ran.
  for (const session of sessions) {
    if (!Number.isFinite(session.focusedSeconds) || session.focusedSeconds <= 0) continue;
    if (!Number.isFinite(session.endedAt)) continue;
    const dayKey = localDateKey(session.endedAt);
    if (!wantedDays.has(dayKey)) continue;
    if (!resolvableLink(session.career, index)) continue;
    const day = byDay.get(dayKey);
    if (!day) continue;
    day.actualFocusMins += session.focusedSeconds / 60;
    hasActivity = true;
  }

  const reviewDays = days.map((dayKey) => byDay.get(dayKey) as CareerPlanReviewDay);
  for (const day of reviewDays) {
    day.plannedFocusMins = round1(day.plannedFocusMins);
    day.actualFocusMins = round1(day.actualFocusMins);
  }

  const totals = reviewDays.reduce(
    (acc, day) => ({
      planned: acc.planned + day.planned,
      completed: acc.completed + day.completed,
      postponed: acc.postponed + day.postponed,
      missed: acc.missed + day.missed,
      plannedFocusMins: acc.plannedFocusMins + day.plannedFocusMins,
      actualFocusMins: acc.actualFocusMins + day.actualFocusMins,
    }),
    {
      planned: 0,
      completed: 0,
      postponed: 0,
      missed: 0,
      plannedFocusMins: 0,
      actualFocusMins: 0,
    },
  );

  let milestoneCompleted = 0;
  let milestoneTotal = 0;
  for (const goalId of goalIds) {
    for (const milestone of doc.milestones) {
      if (milestone.goalId !== goalId || milestone.status === 'archived') continue;
      milestoneTotal += 1;
      if (milestone.status === 'completed') milestoneCompleted += 1;
    }
  }

  return {
    days: reviewDays,
    planned: totals.planned,
    completed: totals.completed,
    postponed: totals.postponed,
    missed: totals.missed,
    plannedFocusMins: round1(totals.plannedFocusMins),
    actualFocusMins: round1(totals.actualFocusMins),
    hasActivity,
    goalIds: [...goalIds],
    postponedGoalIds: [...postponedGoalIds],
    missedGoalIds: [...missedGoalIds],
    milestoneCompleted,
    milestoneTotal,
  };
}

function indexLinks(doc: CareerDoc): LinkIndex {
  return {
    goalIds: new Set(doc.goals.map((goal) => goal.id)),
    skillIds: new Set(doc.skills.map((skill) => skill.id)),
    milestoneGoal: new Map(
      doc.milestones.map((milestone) => [milestone.id, milestone.goalId]),
    ),
  };
}

/**
 * A link still counts when at least one part resolves. A goal deleted after the
 * day was recorded does not erase the skills that were genuinely exercised; a
 * completely dangling link contributes nothing.
 */
function resolvableLink(
  value: CareerLink | undefined,
  index: LinkIndex,
): CareerLink | undefined {
  const clean = sanitizeCareerLink(value);
  if (!clean) return undefined;

  const goalId =
    clean.goalId && index.goalIds.has(clean.goalId) ? clean.goalId : undefined;
  const milestoneId =
    goalId &&
    clean.milestoneId &&
    index.milestoneGoal.get(clean.milestoneId) === goalId
      ? clean.milestoneId
      : undefined;
  const skillIds = (clean.skillIds ?? []).filter((id) => index.skillIds.has(id));
  if (!goalId && skillIds.length === 0) return undefined;

  return {
    ...(goalId ? { goalId } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    ...(skillIds.length > 0 ? { skillIds } : {}),
  };
}
