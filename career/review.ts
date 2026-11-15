/**
 * Weekly and monthly career reviews.
 *
 * Everything is derived from the career document plus the execution records
 * that already exist — tasks, focus sessions and plan outcomes. Nothing is
 * invented: a window with no activity shows zero counts, and "neglected" means
 * a real capability gap with no recent practice, not a guess.
 *
 * Pure. No storage, no React, no clock unless the caller passes today.
 */

import { addDays, dayKeyRange, localDateFromDayKey, localDateKey, type DayKey } from '../shared/date';
import type { FocusSession } from '../productivity/types';
import type { PlanOutcome } from '../replan/types';
import type { Todo } from '../todos/model';

import type {
  CareerAchievement,
  CareerAssessment,
  CareerDoc,
  CareerGoal,
  CareerMilestone,
  CareerSkill,
  ReviewPeriod,
} from './types';
import { buildCareerPlanReview } from './planReview';
import { goalProgress, skillGap } from './progress';

export type GoalReview = {
  goal: CareerGoal;
  progress: { total: number; completed: number; ratio: number | null };
  milestonesCompleted: number;
  evidenceCount: number;
  achievementCount: number;
  assessmentCount: number;
  completedLinkedTaskCount: number;
  focusSeconds: number;
};

export type SkillReview = {
  skill: CareerSkill;
  gap: number;
  evidenceCount: number;
  assessmentCount: number;
  focusSeconds: number;
  completedTaskCount: number;
};

export type MilestoneReview = {
  milestone: CareerMilestone;
  goal: CareerGoal;
  completedDay: DayKey;
};

export type CareerReview = {
  period: ReviewPeriod;
  periodStart: DayKey;
  periodEnd: DayKey;
  days: DayKey[];
  goalsProgressed: GoalReview[];
  skillsPractised: SkillReview[];
  milestonesCompleted: MilestoneReview[];
  achievements: CareerAchievement[];
  assessments: CareerAssessment[];
  focusedSeconds: number;
  focusSessionCount: number;
  planned: number;
  completed: number;
  postponed: number;
  missed: number;
  plannedFocusMins: number;
  actualFocusMins: number;
  postponedGoalIds: string[];
  neglectedSkills: CareerSkill[];
  goalProgressSnapshots: {
    goalId: string;
    progress: { total: number; completed: number; ratio: number | null };
  }[];
};

function zeroGoalPractice() {
  return {
    milestonesCompleted: 0,
    evidenceCount: 0,
    achievementCount: 0,
    assessmentCount: 0,
    completedLinkedTaskCount: 0,
    focusSeconds: 0,
  };
}

function zeroSkillPractice() {
  return {
    evidenceCount: 0,
    assessmentCount: 0,
    completedTaskCount: 0,
    focusSeconds: 0,
  };
}

function weekBounds(today: DayKey): { start: DayKey; end: DayKey } {
  const day = localDateFromDayKey(today).getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDays(today, mondayOffset);
  const end = addDays(start, 6);
  return { start, end };
}

function monthBounds(today: DayKey): { start: DayKey; end: DayKey } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextFirst = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  const end = addDays(nextFirst, -1);
  return { start, end };
}

export function buildCareerReview({
  doc,
  tasks,
  sessions,
  outcomes,
  period,
  today,
}: {
  doc: CareerDoc;
  tasks: readonly Todo[];
  sessions: readonly FocusSession[];
  outcomes: readonly (PlanOutcome | undefined)[];
  period: ReviewPeriod;
  today: DayKey;
}): CareerReview {
  const bounds = period === 'week' ? weekBounds(today) : monthBounds(today);
  const { start: periodStart, end: periodEnd } = bounds;
  const days = dayKeyRange(periodStart, periodEnd);
  const inWindow = new Set(days);

  const planReview = buildCareerPlanReview({ doc, days, outcomes, sessions });

  const goalIndex = new Map(doc.goals.map((goal) => [goal.id, goal]));

  const goalPractice = new Map<string, ReturnType<typeof zeroGoalPractice>>();
  const skillPractice = new Map<string, ReturnType<typeof zeroSkillPractice>>();

  const accGoal = (id: string) =>
    goalPractice.get(id) ?? (() => { const v = zeroGoalPractice(); goalPractice.set(id, v); return v; })();
  const accSkill = (id: string) =>
    skillPractice.get(id) ?? (() => { const v = zeroSkillPractice(); skillPractice.set(id, v); return v; })();

  // Evidence: each entry names the day it occurred.
  for (const entry of doc.evidence) {
    if (!inWindow.has(entry.occurredOn)) continue;
    if (entry.goalId) accGoal(entry.goalId).evidenceCount += 1;
    for (const skillId of entry.skillIds) accSkill(skillId).evidenceCount += 1;
  }

  // Assessments: each names the day it was assessed.
  for (const entry of doc.assessments) {
    if (!inWindow.has(entry.assessedOn)) continue;
    if (entry.goalId) accGoal(entry.goalId).assessmentCount += 1;
    for (const skillId of entry.skillIds) accSkill(skillId).assessmentCount += 1;
  }

  // Achievements: each names the day it happened.
  for (const entry of doc.achievements) {
    if (!inWindow.has(entry.date)) continue;
    if (entry.goalId) accGoal(entry.goalId).achievementCount += 1;
  }

  // Linked task completions: completedAt's local day.
  for (const task of tasks) {
    if (!task.completed || typeof task.completedAt !== 'number') continue;
    const completedDay = localDateKey(task.completedAt);
    if (!inWindow.has(completedDay)) continue;
    const link = task.career;
    if (!link) continue;
    if (link.goalId) accGoal(link.goalId).completedLinkedTaskCount += 1;
    for (const skillId of link.skillIds ?? []) accSkill(skillId).completedTaskCount += 1;
  }

  // Attributed focus sessions: endedAt's local day.
  for (const session of sessions) {
    if (!Number.isFinite(session.focusedSeconds) || session.focusedSeconds <= 0) continue;
    if (!Number.isFinite(session.endedAt)) continue;
    const dayKey = localDateKey(session.endedAt);
    if (!inWindow.has(dayKey)) continue;
    const link = session.career;
    if (!link) continue;
    if (link.goalId) accGoal(link.goalId).focusSeconds += session.focusedSeconds;
    for (const skillId of link.skillIds ?? []) accSkill(skillId).focusSeconds += session.focusedSeconds;
  }

  // Goals progressed: any window activity on the goal.
  const activeOrOpenGoals = doc.goals.filter(
    (goal) =>
      goal.status === 'active' || goal.status === 'not-started' || goal.status === 'paused',
  );
  const goalsProgressed: GoalReview[] = [];
  for (const goal of activeOrOpenGoals) {
    const practice = goalPractice.get(goal.id);
    if (!practice) continue;
    const {
      milestonesCompleted: mc,
      evidenceCount: ec,
      achievementCount: ac,
      assessmentCount: asc,
      completedLinkedTaskCount: lt,
      focusSeconds: fs,
    } = practice;
    const anyActivity =
      mc > 0 || ec > 0 || ac > 0 || asc > 0 || lt > 0 || fs > 0;
    if (!anyActivity) continue;
    goalsProgressed.push({
      goal,
      progress: goalProgress(doc, goal.id),
      milestonesCompleted: mc,
      evidenceCount: ec,
      achievementCount: ac,
      assessmentCount: asc,
      completedLinkedTaskCount: lt,
      focusSeconds: fs,
    });
  }
  goalsProgressed.sort((a, b) => b.focusSeconds - a.focusSeconds || b.milestonesCompleted - a.milestonesCompleted);

  // Skills practised: any window activity on the skill.
  const skillsPractised: SkillReview[] = [];
  for (const skill of doc.skills) {
    const practice = skillPractice.get(skill.id);
    if (!practice) continue;
    const { evidenceCount: ec, assessmentCount: asc, completedTaskCount: lt, focusSeconds: fs } = practice;
    if (ec === 0 && asc === 0 && lt === 0 && fs === 0) continue;
    skillsPractised.push({
      skill,
      gap: skillGap(skill),
      evidenceCount: ec,
      assessmentCount: asc,
      focusSeconds: fs,
      completedTaskCount: lt,
    });
  }
  skillsPractised.sort((a, b) => b.focusSeconds - a.focusSeconds || b.gap - a.gap);

  // Milestones completed in the window.
  const milestonesCompleted: MilestoneReview[] = [];
  for (const milestone of doc.milestones) {
    if (milestone.status !== 'completed') continue;
    const completedDay = localDateKey(milestone.completedAt ?? milestone.updatedAt);
    if (!inWindow.has(completedDay)) continue;
    const goal = goalIndex.get(milestone.goalId);
    if (!goal) continue;
    milestonesCompleted.push({ milestone, goal, completedDay });
  }
  milestonesCompleted.sort(
    (a, b) => b.completedDay.localeCompare(a.completedDay) || b.milestone.createdAt - a.milestone.createdAt,
  );

  // Achievements and assessments recorded in the window.
  const achievements = doc.achievements
    .filter((entry) => inWindow.has(entry.date))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const assessments = doc.assessments
    .filter((entry) => inWindow.has(entry.assessedOn))
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn) || b.createdAt - a.createdAt);

  // Neglected skills: a real gap and no practice in the window.
  const practisedSkillIds = new Set(skillsPractised.map(({ skill }) => skill.id));
  const neglectedSkills = doc.skills.filter(
    (skill) => skillGap(skill) > 0 && !practisedSkillIds.has(skill.id),
  );

  return {
    period,
    periodStart,
    periodEnd,
    days,
    goalsProgressed,
    skillsPractised,
    milestonesCompleted,
    achievements,
    assessments,
    focusedSeconds: planReview.actualFocusMins * 60,
    focusSessionCount: sessions.filter(
      (session) =>
        Number.isFinite(session.focusedSeconds) &&
        session.focusedSeconds > 0 &&
        Number.isFinite(session.endedAt) &&
        inWindow.has(localDateKey(session.endedAt)) &&
        !!session.career,
    ).length,
    planned: planReview.planned,
    completed: planReview.completed,
    postponed: planReview.postponed,
    missed: planReview.missed,
    plannedFocusMins: planReview.plannedFocusMins,
    actualFocusMins: planReview.actualFocusMins,
    postponedGoalIds: planReview.postponedGoalIds,
    neglectedSkills,
    goalProgressSnapshots: doc.goals.map((goal) => ({
      goalId: goal.id,
      progress: goalProgress(doc, goal.id),
    })),
  };
}
