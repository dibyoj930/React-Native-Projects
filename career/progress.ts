/**
 * Honest progress maths for career records.
 *
 * A ratio only exists when there is a real denominator. A goal with no
 * milestones has no milestone percentage — not 0%, which would read as "you
 * have done nothing" when the plan simply has not been written yet.
 *
 * Practice dates are derived, never stored twice: evidence and assessments are
 * the authoritative career records. Linked tasks and attributed focus sessions
 * are derived by `linkage.ts` and combined with these dates at the screen, rather
 * than writing a second `lastPractisedAt` field.
 */

import { localDateKey, type DayKey } from '../shared/date';

import {
  achievementsForSkill,
  assessmentsForGoal,
  assessmentsForSkill,
  evidenceForGoal,
  evidenceForSkill,
  goalsForSkill,
  milestonesForGoal,
} from './selectors';
import type { CareerDoc, CareerSkill } from './types';

export type GoalProgress = {
  total: number;
  completed: number;
  ratio: number | null;
};

export type SkillProgressRow = {
  skill: CareerSkill;
  gap: number;
  evidenceCount: number;
  assessmentCount: number;
  demonstrationCount: number;
  relatedGoalCount: number;
  lastPractisedOn: DayKey | null;
};

export type CareerTimelineKind =
  | 'goal-created'
  | 'milestone-completed'
  | 'evidence'
  | 'achievement'
  | 'assessment';

export type CareerTimelineEvent = {
  id: string;
  kind: CareerTimelineKind;
  date: DayKey;
  title: string;
  detail?: string;
};

export function goalProgress(doc: CareerDoc, goalId: string): GoalProgress {
  const milestones = milestonesForGoal(doc, goalId).filter(
    (milestone) => milestone.status !== 'archived',
  );
  const completed = milestones.filter((milestone) => milestone.status === 'completed').length;
  return {
    total: milestones.length,
    completed,
    ratio: milestones.length === 0 ? null : completed / milestones.length,
  };
}

export function skillGap(skill: CareerSkill): number {
  return Math.max(0, skill.targetLevel - skill.currentLevel);
}

/**
 * The latest day on which this skill was practised.
 *
 * Evidence is a record of work done; an assessment is a record of performance
 * under some condition. Achievements are deliberately excluded: an achievement
 * is a claim about the past, not necessarily a practice session, and counting it
 * as practice would make a skill look recently exercised when it was not.
 */
export function lastPractisedOn(doc: CareerDoc, skillId: string): DayKey | null {
  const evidence = evidenceForSkill(doc, skillId)[0]?.occurredOn;
  const assessment = assessmentsForSkill(doc, skillId)[0]?.assessedOn;
  if (!evidence) return assessment ?? null;
  if (!assessment) return evidence;
  return evidence >= assessment ? evidence : assessment;
}

export function skillProgressRows(doc: CareerDoc): SkillProgressRow[] {
  return doc.skills
    .map((skill) => ({
      skill,
      gap: skillGap(skill),
      evidenceCount: evidenceForSkill(doc, skill.id).length,
      assessmentCount: assessmentsForSkill(doc, skill.id).length,
      demonstrationCount: achievementsForSkill(doc, skill.id).length,
      relatedGoalCount: goalsForSkill(doc, skill.id).length,
      lastPractisedOn: lastPractisedOn(doc, skill.id),
    }))
    .sort((a, b) => {
      if (b.gap !== a.gap) return b.gap - a.gap;
      // Future importance sorts first: a gap that matters to where the user is
      // going is more urgent than one that only matters to today's role. The
      // current role breaks ties, then the name keeps the order stable.
      const importance = { high: 0, medium: 1, low: 2 };
      const byFuture =
        importance[a.skill.futureImportance] - importance[b.skill.futureImportance];
      if (byFuture !== 0) return byFuture;
      const byRole =
        importance[a.skill.roleImportance] - importance[b.skill.roleImportance];
      if (byRole !== 0) return byRole;
      return a.skill.name.localeCompare(b.skill.name);
    });
}

/**
 * A goal's recorded history, newest first.
 *
 * Derived from the records themselves so it cannot drift from the lists it
 * summarises. `completedAt` is an epoch timestamp; evidence and assessments
 * already carry local day keys.
 */
export function goalTimeline(doc: CareerDoc, goalId: string): CareerTimelineEvent[] {
  const goal = doc.goals.find((entry) => entry.id === goalId);
  if (!goal) return [];

  const events: CareerTimelineEvent[] = [
    {
      id: `goal-created-${goal.id}`,
      kind: 'goal-created',
      date: localDateKey(goal.createdAt),
      title: 'Goal created',
    },
  ];

  for (const milestone of milestonesForGoal(doc, goalId)) {
    if (milestone.status !== 'completed') continue;
    events.push({
      id: `milestone-${milestone.id}`,
      kind: 'milestone-completed',
      date: localDateKey(milestone.completedAt ?? milestone.updatedAt),
      title: milestone.title,
      detail: 'Milestone completed',
    });
  }

  for (const entry of evidenceForGoal(doc, goalId)) {
    events.push({
      id: `evidence-${entry.id}`,
      kind: 'evidence',
      date: entry.occurredOn,
      title: entry.title,
      detail: 'Evidence recorded',
    });
  }

  for (const achievement of doc.achievements.filter((entry) => entry.goalId === goalId)) {
    events.push({
      id: `achievement-${achievement.id}`,
      kind: 'achievement',
      date: achievement.date,
      title: achievement.title,
      detail: 'Achievement recorded',
    });
  }

  for (const assessment of assessmentsForGoal(doc, goalId)) {
    events.push({
      id: `assessment-${assessment.id}`,
      kind: 'assessment',
      date: assessment.assessedOn,
      title: assessment.title,
      detail: 'Assessment recorded',
    });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
