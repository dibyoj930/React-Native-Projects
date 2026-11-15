/**
 * Derived views over the career document.
 *
 * All pure: no storage, no React, no clock unless a caller passes a day key.
 * Screens render these models rather than reaching into arrays and re-deriving
 * counts, which keeps the home card and the module's dashboard consistent.
 *
 * None of these selectors invents a readiness score or a percentage that claims
 * to mean more than it does. A progress ratio appears only where the
 * denominator is real (milestones completed out of milestones planned).
 */

import type { DayKey } from '../shared/date';

import type {
  CareerAchievement,
  CareerAssessment,
  CareerDoc,
  CareerEvidence,
  CareerGoal,
  CareerMilestone,
  CareerSkill,
  DevelopmentDomain,
} from './types';

const PRIORITY_RANK: Record<CareerGoal['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export type MilestoneWithGoal = {
  milestone: CareerMilestone;
  goal: CareerGoal;
};

export type CareerSuggestionKind =
  | 'profile'
  | 'goal'
  | 'milestone'
  | 'evidence'
  | 'achievement'
  | 'skill'
  | 'domain';

export type CareerSuggestion = {
  id: string;
  kind: CareerSuggestionKind;
  title: string;
  body: string;
  goalId?: string;
  skillId?: string;
  milestoneId?: string;
};

export type CareerHomeSummary = {
  hasProfile: boolean;
  activeGoalCount: number;
  skillCount: number;
  nextMilestone: MilestoneWithGoal | null;
  suggestion: string;
};

export type CareerOverviewModel = {
  hasProfile: boolean;
  activeDomainCount: number;
  activeGoalCount: number;
  skillCount: number;
  skillGapCount: number;
  evidenceCount: number;
  achievementCount: number;
  milestoneTotal: number;
  milestoneCompleted: number;
  focusGoals: CareerGoal[];
  nextMilestones: MilestoneWithGoal[];
  overdueMilestones: MilestoneWithGoal[];
  recentAchievements: CareerAchievement[];
  suggestions: CareerSuggestion[];
};

export function careerGoalById(doc: CareerDoc, id: string): CareerGoal | undefined {
  return doc.goals.find((goal) => goal.id === id);
}

export function careerSkillById(doc: CareerDoc, id: string): CareerSkill | undefined {
  return doc.skills.find((skill) => skill.id === id);
}

export function careerDomainById(
  doc: CareerDoc,
  id: string | undefined,
): DevelopmentDomain | undefined {
  if (!id) return undefined;
  return doc.domains.find((domain) => domain.id === id);
}

export function careerMilestoneById(
  doc: CareerDoc,
  id: string,
): CareerMilestone | undefined {
  return doc.milestones.find((milestone) => milestone.id === id);
}

function compareGoals(a: CareerGoal, b: CareerGoal): number {
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority !== 0) return priority;

  // A dated goal comes before an undated one at the same priority. Undated goals
  // are not "someday" by definition; they simply have no deadline yet.
  if (a.targetDate && b.targetDate) {
    const date = a.targetDate.localeCompare(b.targetDate);
    if (date !== 0) return date;
  } else if (a.targetDate) {
    return -1;
  } else if (b.targetDate) {
    return 1;
  }

  return a.createdAt - b.createdAt;
}

/** Goals still being worked on, excluding paused, achieved and archived. */
export function activeCareerGoals(doc: CareerDoc): CareerGoal[] {
  return doc.goals
    .filter((goal) => goal.status === 'active' || goal.status === 'not-started')
    .sort(compareGoals);
}

/** Every goal that has not been archived or achieved, paused included. */
export function openCareerGoals(doc: CareerDoc): CareerGoal[] {
  return doc.goals
    .filter(
      (goal) =>
        goal.status === 'active' ||
        goal.status === 'not-started' ||
        goal.status === 'paused',
    )
    .sort(compareGoals);
}

export function goalsByStatus(doc: CareerDoc, status: CareerGoal['status']): CareerGoal[] {
  return doc.goals.filter((goal) => goal.status === status).sort(compareGoals);
}

export function achievedCareerGoals(doc: CareerDoc): CareerGoal[] {
  return doc.goals
    .filter((goal) => goal.status === 'achieved')
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function archivedCareerGoals(doc: CareerDoc): CareerGoal[] {
  return doc.goals
    .filter((goal) => goal.status === 'archived')
    .sort((a, b) => (b.archivedAt ?? b.updatedAt) - (a.archivedAt ?? a.updatedAt));
}

export function milestonesForGoal(doc: CareerDoc, goalId: string): CareerMilestone[] {
  return doc.milestones
    .filter((milestone) => milestone.goalId === goalId)
    .sort(compareMilestones);
}

export function compareMilestones(a: CareerMilestone, b: CareerMilestone): number {
  const order: Record<CareerMilestone['status'], number> = {
    'in-progress': 0,
    'not-started': 1,
    blocked: 2,
    completed: 3,
    archived: 4,
  };
  const status = order[a.status] - order[b.status];
  if (status !== 0) return status;
  if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
  if (a.targetDate) return -1;
  if (b.targetDate) return 1;
  return a.createdAt - b.createdAt;
}

export function skillsForDomain(doc: CareerDoc, domainId: string | undefined): CareerSkill[] {
  if (domainId === undefined) {
    return doc.skills.filter((skill) => !skill.domainId);
  }
  return doc.skills.filter((skill) => skill.domainId === domainId);
}

export function goalsForSkill(doc: CareerDoc, skillId: string): CareerGoal[] {
  return doc.goals
    .filter((goal) => goal.relatedSkillIds.includes(skillId))
    .sort(compareGoals);
}

export function relatedSkillsForGoal(doc: CareerDoc, goal: CareerGoal): CareerSkill[] {
  const ids = new Set(goal.relatedSkillIds);
  for (const milestone of doc.milestones) {
    if (milestone.goalId !== goal.id) continue;
    milestone.relatedSkillIds.forEach((id) => ids.add(id));
  }
  return doc.skills
    .filter((skill) => ids.has(skill.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function evidenceForGoal(doc: CareerDoc, goalId: string): CareerEvidence[] {
  return doc.evidence
    .filter((entry) => entry.goalId === goalId)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt - a.createdAt);
}

export function evidenceForSkill(doc: CareerDoc, skillId: string): CareerEvidence[] {
  return doc.evidence
    .filter((entry) => entry.skillIds.includes(skillId))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt - a.createdAt);
}

export function evidenceForMilestone(
  doc: CareerDoc,
  milestoneId: string,
): CareerEvidence[] {
  return doc.evidence
    .filter((entry) => entry.milestoneId === milestoneId)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt - a.createdAt);
}

export function achievementsForGoal(doc: CareerDoc, goalId: string): CareerAchievement[] {
  return doc.achievements
    .filter((entry) => entry.goalId === goalId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function achievementsForSkill(
  doc: CareerDoc,
  skillId: string,
): CareerAchievement[] {
  return doc.achievements
    .filter((entry) => entry.demonstratedSkillIds.includes(skillId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function assessmentsForGoal(
  doc: CareerDoc,
  goalId: string,
): CareerAssessment[] {
  return doc.assessments
    .filter((entry) => entry.goalId === goalId)
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn) || b.createdAt - a.createdAt);
}

export function assessmentsForSkill(
  doc: CareerDoc,
  skillId: string,
): CareerAssessment[] {
  return doc.assessments
    .filter((entry) => entry.skillIds.includes(skillId))
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn) || b.createdAt - a.createdAt);
}

export function recentAchievements(doc: CareerDoc, limit = 5): CareerAchievement[] {
  return [...doc.achievements]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Milestones still open, with a target date on or after today. */
export function upcomingMilestones(
  doc: CareerDoc,
  today: DayKey,
  limit = 5,
): MilestoneWithGoal[] {
  return milestonesWithGoal(doc)
    .filter(
      ({ milestone }) =>
        (milestone.status === 'not-started' ||
          milestone.status === 'in-progress' ||
          milestone.status === 'blocked') &&
        milestone.targetDate !== undefined &&
        milestone.targetDate >= today,
    )
    .sort((a, b) => (a.milestone.targetDate ?? '').localeCompare(b.milestone.targetDate ?? ''))
    .slice(0, limit);
}

/** Open milestones whose target date has passed. */
export function overdueMilestones(
  doc: CareerDoc,
  today: DayKey,
  limit = 5,
): MilestoneWithGoal[] {
  return milestonesWithGoal(doc)
    .filter(
      ({ milestone }) =>
        (milestone.status === 'not-started' ||
          milestone.status === 'in-progress' ||
          milestone.status === 'blocked') &&
        milestone.targetDate !== undefined &&
        milestone.targetDate < today,
    )
    .sort((a, b) => (a.milestone.targetDate ?? '').localeCompare(b.milestone.targetDate ?? ''))
    .slice(0, limit);
}

function milestonesWithGoal(doc: CareerDoc): MilestoneWithGoal[] {
  const goals = new Map(doc.goals.map((goal) => [goal.id, goal]));
  return doc.milestones.flatMap((milestone): MilestoneWithGoal[] => {
    const goal = goals.get(milestone.goalId);
    return goal ? [{ milestone, goal }] : [];
  });
}

function firstGoalWithout(
  goals: readonly CareerGoal[],
  predicate: (goal: CareerGoal) => boolean,
): CareerGoal | undefined {
  return goals.find(predicate);
}

/**
 * Deterministic next steps.
 *
 * The order is deliberate: establish a direction, then create a goal, then
 * break it down, then record what happened. Nothing here is generated or
 * personalised by an API, and nothing changes a plan on its own.
 */
export function buildCareerSuggestions(doc: CareerDoc, today: DayKey): CareerSuggestion[] {
  const suggestions: CareerSuggestion[] = [];
  const open = openCareerGoals(doc);
  const active = activeCareerGoals(doc);

  if (!doc.profile) {
    suggestions.push({
      id: 'career-suggestion-profile',
      kind: 'profile',
      title: 'Set up your career profile',
      body: 'Record where you are now and what you are working towards. You can change it at any time.',
    });
  }

  if (open.length === 0) {
    suggestions.push({
      id: 'career-suggestion-first-goal',
      kind: 'goal',
      title: 'Create a career goal',
      body: 'Choose one direction worth working on. A goal can be small; it just needs a finish line.',
    });
  }

  const goalWithoutMilestones = firstGoalWithout(active, (goal) =>
    !doc.milestones.some(
      (milestone) => milestone.goalId === goal.id && milestone.status !== 'archived',
    ),
  );
  if (goalWithoutMilestones) {
    suggestions.push({
      id: `career-suggestion-milestone-${goalWithoutMilestones.id}`,
      kind: 'milestone',
      title: 'Break your goal into a first milestone',
      body: `“${goalWithoutMilestones.title}” has no milestones yet.`,
      goalId: goalWithoutMilestones.id,
    });
  }

  const goalWithoutCriteria = firstGoalWithout(
    active,
    (goal) => goal.successCriteria.trim().length === 0,
  );
  if (goalWithoutCriteria) {
    suggestions.push({
      id: `career-suggestion-criteria-${goalWithoutCriteria.id}`,
      kind: 'goal',
      title: 'Define what done looks like',
      body: `Add success criteria to “${goalWithoutCriteria.title}”.`,
      goalId: goalWithoutCriteria.id,
    });
  }

  const skillWithoutEvidence = doc.skills.find(
    (skill) =>
      skill.targetLevel > skill.currentLevel &&
      doc.evidence.every((entry) => !entry.skillIds.includes(skill.id)),
  );
  if (skillWithoutEvidence) {
    suggestions.push({
      id: `career-suggestion-evidence-${skillWithoutEvidence.id}`,
      kind: 'evidence',
      title: 'Record evidence for a skill',
      body: `“${skillWithoutEvidence.name}” has no evidence yet. A small, real example is enough.`,
      skillId: skillWithoutEvidence.id,
    });
  }

  const overdue = overdueMilestones(doc, today, 1)[0];
  if (overdue) {
    suggestions.push({
      id: `career-suggestion-overdue-${overdue.milestone.id}`,
      kind: 'milestone',
      title: 'Review an overdue milestone',
      body: `“${overdue.milestone.title}” was due on ${overdue.milestone.targetDate}. Move it, split it, or mark it blocked.`,
      goalId: overdue.goal.id,
      milestoneId: overdue.milestone.id,
    });
  }

  if (doc.achievements.length === 0 && doc.evidence.length > 0) {
    suggestions.push({
      id: 'career-suggestion-first-achievement',
      kind: 'achievement',
      title: 'Turn evidence into an achievement',
      body: 'You have evidence recorded. Note what changed because of it, without inventing numbers.',
    });
  }

  return suggestions.slice(0, 3);
}

export function buildCareerHomeSummary(doc: CareerDoc, today: DayKey): CareerHomeSummary {
  const goals = activeCareerGoals(doc);
  const next = upcomingMilestones(doc, today, 1)[0] ?? null;
  const suggestions = buildCareerSuggestions(doc, today);
  return {
    hasProfile: doc.profile !== null,
    activeGoalCount: goals.length,
    skillCount: doc.skills.length,
    nextMilestone: next,
    suggestion:
      suggestions[0]?.title ??
      (next ? next.milestone.title : 'Keep building your career evidence'),
  };
}

export function buildCareerOverview(doc: CareerDoc, today: DayKey): CareerOverviewModel {
  const goals = activeCareerGoals(doc);
  const goalIds = new Set(goals.map((goal) => goal.id));
  const relevantMilestones = doc.milestones.filter(
    (milestone) => goalIds.has(milestone.goalId) && milestone.status !== 'archived',
  );
  const milestoneCompleted = relevantMilestones.filter(
    (milestone) => milestone.status === 'completed',
  ).length;

  return {
    hasProfile: doc.profile !== null,
    activeDomainCount: doc.domains.filter((domain) => domain.isEnabled).length,
    activeGoalCount: goals.length,
    skillCount: doc.skills.length,
    skillGapCount: doc.skills.filter((skill) => skill.targetLevel > skill.currentLevel).length,
    evidenceCount: doc.evidence.length,
    achievementCount: doc.achievements.length,
    milestoneTotal: relevantMilestones.length,
    milestoneCompleted,
    focusGoals: goals.slice(0, 3),
    nextMilestones: upcomingMilestones(doc, today, 3),
    overdueMilestones: overdueMilestones(doc, today, 3),
    recentAchievements: recentAchievements(doc, 3),
    suggestions: buildCareerSuggestions(doc, today),
  };
}
