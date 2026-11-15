/**
 * Deterministic daily development recommendations.
 *
 * The engine is a pure function over what the app already knows: the career
 * record, the task/focus practice derived by `linkage.ts`, and the previous plan
 * review. It uses no network, no model and no hidden state.
 *
 * Every candidate is anchored to a real fact — an open milestone, a skill with a
 * gap, a goal with a type of assessment, a postponed activity. When the facts run
 * out, it returns nothing rather than inventing an objective. Durations are
 * capped by the open time the caller measured, and a recommendation is never
 * added to the plan here: the UI opens the existing task sheet for the user to
 * accept, edit or skip.
 */

import {
  addDays,
  daysBetween,
  localDateKey,
  type DayKey,
} from '../shared/date';
import type { CareerLink } from '../shared/careerLink';

import { formatCareerDate, pluralise } from './format';
import type { CareerDevelopment } from './linkage';
import type { CareerPlanReview } from './planReview';
import { activeCareerGoals, milestonesForGoal } from './selectors';
import type {
  CareerDoc,
  CareerGoal,
  CareerMilestone,
  CareerSkill,
  Importance,
  Priority,
} from './types';

export type CareerRecommendationKind =
  | 'learn'
  | 'practise'
  | 'milestone'
  | 'project'
  | 'assessment'
  | 'achievement'
  | 'review'
  | 'improve-process';

export type CareerRecommendation = {
  /** Stable for the day and target, so a skip stays skipped until tomorrow. */
  id: string;
  kind: CareerRecommendationKind;
  title: string;
  /** What to do, in one sentence the task sheet can carry into its notes. */
  objective: string;
  expectedMinutes: number;
  /** Why this surfaced, based only on recorded facts. */
  rationale: string;
  completionCriteria: string;
  expectedEvidence: string;
  /** The task title to prefill when the user accepts. */
  taskText: string;
  career: CareerLink;
  goalId?: string;
  milestoneId?: string;
  skillId?: string;
  /** Internal ordering only; never shown as a score. */
  score: number;
};

export type CareerRecommendations = {
  /** The day this set belongs to; ids are scoped to it. */
  forDay: DayKey;
  /** Sorted best first. The overview renders the first three. */
  items: CareerRecommendation[];
  /** Candidates before dismissals, so the UI can distinguish "all skipped". */
  totalCandidates: number;
  availableMinutes?: number;
  snoozedUntil?: DayKey;
  /** True when there is not enough open time left for a meaningful action. */
  noTime: boolean;
  /** True when every candidate has been skipped today. */
  allDismissed: boolean;
  /** False when there is nothing to recommend from yet. */
  hasContext: boolean;
};

export type CareerRecommendationInput = {
  doc: CareerDoc;
  development: CareerDevelopment;
  today: DayKey;
  /** Open minutes left in today's approved plan, when one exists. */
  availableMinutes?: number;
  /** The window just reviewed, used to surface stalled work. */
  planReview?: CareerPlanReview;
};

const MIN_MINUTES = 10;
const DEFAULT_DURATION = {
  learn: 30,
  practise: 25,
  milestone: 45,
  project: 45,
  assessment: 40,
  achievement: 15,
  review: 15,
  'improve-process': 15,
} as const satisfies Record<CareerRecommendationKind, number>;

const PRIORITY_SCORE: Record<Priority, number> = { high: 30, medium: 20, low: 10 };
const IMPORTANCE_SCORE: Record<Importance, number> = { high: 30, medium: 20, low: 10 };

export function buildCareerRecommendations({
  doc,
  development,
  today,
  availableMinutes,
  planReview,
}: CareerRecommendationInput): CareerRecommendations {
  const snoozedUntil = doc.recommendations.snoozedUntil;
  const dismissed = new Set(doc.recommendations.dismissedIds);
  const hasContext = activeCareerGoals(doc).length > 0 || doc.skills.length > 0;
  const base = {
    forDay: today,
    totalCandidates: 0,
    ...(availableMinutes !== undefined ? { availableMinutes } : {}),
    ...(snoozedUntil ? { snoozedUntil } : {}),
    noTime: false,
    allDismissed: false,
    hasContext,
  };

  // A snooze is a whole-section decision, not a per-card one. The section shows
  // the pause and offers to resume; it does not quietly keep recommending.
  if (snoozedUntil && snoozedUntil > today) {
    return { ...base, items: [], snoozedUntil };
  }

  // Nothing useful fits in less than ten minutes. Saying so is more honest than
  // shrinking every suggestion into a token gesture.
  if (availableMinutes !== undefined && availableMinutes < MIN_MINUTES) {
    return { ...base, items: [], noTime: true };
  }

  const lastByGoal = lastActivityByGoal(doc, development);
  const lastBySkill = lastPracticeBySkill(doc, development);
  const activeGoals = activeCareerGoals(doc);
  const goalById = new Map(doc.goals.map((goal) => [goal.id, goal]));
  const skillById = new Map(doc.skills.map((skill) => [skill.id, skill]));
  const postponed = new Set(planReview?.postponedGoalIds ?? []);
  const missed = new Set(planReview?.missedGoalIds ?? []);

  const candidates: CareerRecommendation[] = [];
  const add = (candidate: CandidateDraft) => {
    const { baseMinutes, ...rest } = candidate;
    const minutes = fitDuration(baseMinutes, availableMinutes);
    if (minutes === null) return;
    candidates.push({
      ...rest,
      id: `${candidate.id}:${today}`,
      expectedMinutes: minutes,
    });
  };

  for (const goal of activeGoals) {
    const goalScore = scoreGoal(goal, today, doc, lastByGoal.get(goal.id));
    const openMilestones = milestonesForGoal(doc, goal.id).filter(
      (milestone) =>
        milestone.status === 'not-started' ||
        milestone.status === 'in-progress' ||
        milestone.status === 'blocked',
    );

    if (openMilestones.length > 0) {
      for (const milestone of openMilestones) {
        // An open linked task means the user already has this work queued. Do
        // not recommend duplicating it.
        if (development.practiceForMilestone(milestone.id).openTaskCount > 0) continue;
        const skillIds = relatedSkillIds(goal, milestone, skillById);
        add({
          id: `career-rec:milestone:${milestone.id}`,
          kind: 'milestone',
          title: `Work on “${milestone.title}”`,
          taskText: `Career: ${milestone.title}`,
          objective: `Take one concrete step towards “${milestone.title}” for a focused block.`,
          baseMinutes: DEFAULT_DURATION.milestone,
          rationale: milestoneRationale(milestone, goal, today),
          completionCriteria:
            'One step is finished, or the next blocker is written down clearly.',
          expectedEvidence:
            'A note, artefact or evidence record that shows the step you completed.',
          career: {
            goalId: goal.id,
            milestoneId: milestone.id,
            ...(skillIds.length > 0 ? { skillIds } : {}),
          },
          goalId: goal.id,
          milestoneId: milestone.id,
          ...(skillIds[0] ? { skillId: skillIds[0] } : {}),
          score:
            goalScore +
            milestoneScore(milestone, today) +
            (postponed.has(goal.id) ? 18 : 0) +
            (missed.has(goal.id) ? 12 : 0),
        });
      }
    } else {
      const allMilestones = milestonesForGoal(doc, goal.id).filter(
        (milestone) => milestone.status !== 'archived',
      );
      const hasCompleted = allMilestones.some(
        (milestone) => milestone.status === 'completed',
      );
      if (hasCompleted) {
        add({
          id: `career-rec:review-goal:${goal.id}`,
          kind: 'review',
          title: `Review “${goal.title}”`,
          taskText: `Career review: ${goal.title}`,
          objective:
            'Review what is complete, capture what you learned, and decide the next milestone or whether the goal is achieved.',
          baseMinutes: 20,
          rationale: `Every milestone for “${goal.title}” is complete or closed.`,
          completionCriteria:
            'The goal has a next milestone, a revised direction, or is marked achieved.',
          expectedEvidence:
            'A new milestone, an updated goal, or an evidence record from the review.',
          career: { goalId: goal.id },
          goalId: goal.id,
          score: goalScore + 8,
        });
      } else {
        add({
          id: `career-rec:project:${goal.id}`,
          kind: 'project',
          title: `Start a tangible step for “${goal.title}”`,
          taskText: `Career: first step for ${goal.title}`,
          objective:
            'Turn the goal into one visible piece of work you can finish and point to.',
          baseMinutes: DEFAULT_DURATION.project,
          rationale: `“${goal.title}” has no open milestones yet.`,
          completionCriteria:
            'A first draft, outline or prototype exists, or the first milestone is defined.',
          expectedEvidence:
            'The artefact itself, or an evidence record that links to it.',
          career: { goalId: goal.id },
          goalId: goal.id,
          score: goalScore + 5,
        });
      }
    }

    if (goal.goalType === 'assessment' || goal.goalType === 'certification') {
      const latestAssessment = doc.assessments
        .filter((assessment) => assessment.goalId === goal.id)
        .map((assessment) => assessment.assessedOn)
        .sort()
        .at(-1);
      const daysSinceAssessment = latestAssessment
        ? daysBetween(latestAssessment, today)
        : null;
      if (daysSinceAssessment === null || daysSinceAssessment > 14) {
        add({
          id: `career-rec:assessment:${goal.id}`,
          kind: 'assessment',
          title: `Prepare for “${goal.title}”`,
          taskText: `Career: prepare for ${goal.title}`,
          objective:
            'Review the assessment criteria and complete one realistic practice exercise.',
          baseMinutes: DEFAULT_DURATION.assessment,
          rationale:
            daysSinceAssessment === null
              ? `“${goal.title}” is an assessment or certification goal with no recorded assessment yet.`
              : `The last assessment for “${goal.title}” was ${pluralise(daysSinceAssessment, 'day')} ago.`,
          completionCriteria:
            'One practice exercise is finished and reviewed against the criteria.',
          expectedEvidence:
            'Practice notes, feedback, or an assessment result recorded in the career log.',
          career: { goalId: goal.id },
          goalId: goal.id,
          score: goalScore + 12,
        });
      }
    }

    if (postponed.has(goal.id) || missed.has(goal.id)) {
      const stalled = postponed.has(goal.id) ? 'postponed' : 'missed';
      add({
        id: `career-rec:process:${goal.id}`,
        kind: 'improve-process',
        title: `Decide the next step for “${goal.title}”`,
        taskText: `Career: unblock ${goal.title}`,
        objective:
          'Decide whether to reschedule, split, or deliberately drop one stalled activity, then make that change.',
        baseMinutes: DEFAULT_DURATION['improve-process'],
        rationale: `A career activity for “${goal.title}” was ${stalled} in the last plan review.`,
        completionCriteria:
          'The activity has a new date, a smaller first step, or is deliberately dropped.',
        expectedEvidence:
          'An updated task or milestone. This is a decision, not a new achievement claim.',
        career: { goalId: goal.id },
        goalId: goal.id,
        score: goalScore + (stalled === 'postponed' ? 32 : 26),
      });
    }
  }

  for (const skill of doc.skills) {
    if (skill.targetLevel <= skill.currentLevel) continue;
    const lastPractised = lastBySkill.get(skill.id);
    const daysSince = lastPractised ? daysBetween(lastPractised, today) : null;
    // Recent practice is already visible to the user; a recommendation adds
    // noise rather than value.
    if (daysSince !== null && daysSince >= 0 && daysSince <= 2) continue;

    const gap = skill.targetLevel - skill.currentLevel;
    const relatedGoal = activeGoals.find((goal) =>
      goal.relatedSkillIds.includes(skill.id),
    );
    const goalScore = relatedGoal
      ? scoreGoal(relatedGoal, today, doc, lastByGoal.get(relatedGoal.id))
      : 0;
    const skillScore =
      IMPORTANCE_SCORE[skill.futureImportance] +
      Math.round(IMPORTANCE_SCORE[skill.roleImportance] * 0.4) +
      gap * 6 +
      neglectScore(daysSince) +
      domainScore(doc, skill.domainId);

    const neverUsed = daysSince === null;
    const learning =
      neverUsed &&
      gap >= 2 &&
      doc.evidence.every((entry) => !entry.skillIds.includes(skill.id)) &&
      doc.assessments.every((entry) => !entry.skillIds.includes(skill.id));

    add({
      id: `${learning ? 'career-rec:learn' : 'career-rec:practise'}:${skill.id}`,
      kind: learning ? 'learn' : 'practise',
      title: `${learning ? 'Learn' : 'Practise'} ${skill.name}`,
      taskText: `Career: ${learning ? 'learn' : 'practise'} ${skill.name}`,
      objective: learning
        ? `Learn one practical idea in ${skill.name} that you can use in real work, then explain it in your own words.`
        : `Use ${skill.name} on a real piece of work, then note what you did and what changed.`,
      baseMinutes: learning ? DEFAULT_DURATION.learn : DEFAULT_DURATION.practise,
      rationale: practiceRationale(skill, relatedGoal, daysSince),
      completionCriteria: learning
        ? 'You can explain one new idea in your own words and name a situation where it applies.'
        : 'One real use is finished, or one deliberate practice exercise is completed and reviewed.',
      expectedEvidence: learning
        ? 'A learning note or evidence record. No score is required.'
        : 'An evidence record with the situation, what you did, and the outcome.',
      career: {
        ...(relatedGoal ? { goalId: relatedGoal.id } : {}),
        skillIds: [skill.id],
      },
      ...(relatedGoal ? { goalId: relatedGoal.id } : {}),
      skillId: skill.id,
      score: skillScore + goalScore,
    });
  }

  // Recent work deserves a moment of capture. Prefer the achievement action
  // when there is none recently; otherwise ask for evidence after completed work.
  const recentAchievement = doc.achievements
    .map((entry) => entry.date)
    .sort()
    .at(-1);
  const achievementDays = recentAchievement
    ? daysBetween(recentAchievement, today)
    : null;
  if (doc.evidence.length > 0 && (achievementDays === null || achievementDays > 30)) {
    const latestEvidence = [...doc.evidence].sort(
      (a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt - a.createdAt,
    )[0];
    const goal = latestEvidence.goalId ? goalById.get(latestEvidence.goalId) : undefined;
    add({
      id: 'career-rec:achievement',
      kind: 'achievement',
      title: 'Record a professional achievement',
      taskText: 'Career: record an achievement',
      objective:
        'Turn one piece of recorded evidence into an achievement entry that says what changed.',
      baseMinutes: DEFAULT_DURATION.achievement,
      rationale:
        achievementDays === null
          ? 'You have evidence recorded but no achievements yet.'
          : `Your last achievement was recorded ${pluralise(achievementDays, 'day')} ago.`,
      completionCriteria:
        'The achievement names the work, the outcome, and who or what it affected.',
      expectedEvidence:
        'A saved achievement entry, using only details you can support. No invented metrics.',
      career: {
        ...(goal ? { goalId: goal.id } : {}),
        ...(latestEvidence.skillIds.length > 0
          ? { skillIds: latestEvidence.skillIds }
          : {}),
      },
      ...(goal ? { goalId: goal.id } : {}),
      score: 18 + (goal ? PRIORITY_SCORE[goal.priority] : 0),
    });
  } else {
    const goalToCapture = activeGoals.find((goal) => {
      const practice = development.practiceForGoal(goal.id);
      if (practice.completedTaskCount === 0 || !practice.lastPractisedOn) return false;
      const latestEvidence = doc.evidence
        .filter((entry) => entry.goalId === goal.id)
        .map((entry) => entry.occurredOn)
        .sort()
        .at(-1);
      return !latestEvidence || latestEvidence < practice.lastPractisedOn;
    });
    if (goalToCapture) {
      add({
        id: `career-rec:capture:${goalToCapture.id}`,
        kind: 'review',
        title: `Capture what you completed for “${goalToCapture.title}”`,
        taskText: `Career: capture evidence for ${goalToCapture.title}`,
        objective:
          'Review the linked work you completed and record one honest piece of evidence.',
        baseMinutes: DEFAULT_DURATION.review,
        rationale: `You completed linked work for “${goalToCapture.title}” but have not recorded evidence since.`,
        completionCriteria:
          'One evidence record describes what you did and what it changed.',
        expectedEvidence:
          'An evidence record, or a note that explains why the work is not worth recording.',
        career: { goalId: goalToCapture.id },
        goalId: goalToCapture.id,
        score: scoreGoal(
          goalToCapture,
          today,
          doc,
          lastByGoal.get(goalToCapture.id),
        ) + 14,
      });
    }
  }

  const unique = [...new Map(candidates.map((entry) => [entry.id, entry])).values()]
    .filter((entry) => !dismissed.has(entry.id))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    ...base,
    totalCandidates: candidates.length,
    items: unique,
    allDismissed: candidates.length > 0 && unique.length === 0,
  };
}

type CandidateDraft = Omit<CareerRecommendation, 'id' | 'expectedMinutes'> & {
  /** Base id before the day suffix is added. */
  id: string;
  baseMinutes: number;
};

/** Cap to the open time while keeping a realistic five-minute granularity. */
function fitDuration(baseMinutes: number, availableMinutes?: number): number | null {
  if (availableMinutes === undefined) return baseMinutes;
  if (availableMinutes < MIN_MINUTES) return null;
  const rounded = Math.floor(availableMinutes / 5) * 5;
  return Math.max(MIN_MINUTES, Math.min(baseMinutes, rounded));
}

function scoreGoal(
  goal: CareerGoal,
  today: DayKey,
  doc: CareerDoc,
  lastActivity: DayKey | undefined,
): number {
  let score = PRIORITY_SCORE[goal.priority];
  if (goal.status === 'active') score += 5;
  if (goal.targetDate) {
    const distance = daysBetween(today, goal.targetDate);
    if (distance < 0) score += 40;
    else if (distance <= 7) score += 30;
    else if (distance <= 30) score += 15;
  }
  score += domainScore(doc, goal.domainId);
  if (lastActivity) {
    const days = daysBetween(lastActivity, today);
    if (days <= 3) score -= 10;
    else if (days <= 7) score -= 5;
  }
  return score;
}

function milestoneScore(milestone: CareerMilestone, today: DayKey): number {
  let score = milestone.status === 'in-progress' ? 12 : 6;
  if (milestone.status === 'blocked') score += 8;
  if (milestone.targetDate) {
    const distance = daysBetween(today, milestone.targetDate);
    if (distance < 0) score += 50;
    else if (distance <= 7) score += 32;
    else if (distance <= 30) score += 16;
  }
  return score;
}

function milestoneRationale(
  milestone: CareerMilestone,
  goal: CareerGoal,
  today: DayKey,
): string {
  if (milestone.targetDate) {
    const distance = daysBetween(today, milestone.targetDate);
    if (distance < 0) {
      return `“${milestone.title}” for “${goal.title}” was due ${formatCareerDate(milestone.targetDate)} and is still open.`;
    }
    if (distance <= 7) {
      return `“${milestone.title}” is due ${formatCareerDate(milestone.targetDate)}.`;
    }
    return `“${milestone.title}” is an open milestone for “${goal.title}”.`;
  }
  return `“${milestone.title}” is an open milestone for “${goal.title}”.`;
}

function practiceRationale(
  skill: CareerSkill,
  goal: CareerGoal | undefined,
  daysSince: number | null,
): string {
  const gap = skill.targetLevel - skill.currentLevel;
  const context = goal ? ` It supports “${goal.title}”.` : '';
  if (daysSince === null) {
    return `No practice is recorded for ${skill.name}, and it is ${gap} level${gap === 1 ? '' : 's'} below your target.${context}`;
  }
  return `It has been ${pluralise(daysSince, 'day')} since ${skill.name} was practised.${context}`;
}

function neglectScore(daysSince: number | null): number {
  if (daysSince === null) return 35;
  if (daysSince >= 30) return 30;
  if (daysSince >= 14) return 20;
  if (daysSince >= 7) return 10;
  return 0;
}

function domainScore(doc: CareerDoc, domainId: string | undefined): number {
  if (!domainId) return 0;
  const domain = doc.domains.find((entry) => entry.id === domainId);
  if (!domain) return 0;
  return domain.isEnabled ? 5 : -5;
}

function relatedSkillIds(
  goal: CareerGoal,
  milestone: CareerMilestone,
  skills: ReadonlyMap<string, CareerSkill>,
): string[] {
  const ids = milestone.relatedSkillIds.length
    ? milestone.relatedSkillIds
    : goal.relatedSkillIds;
  return [...new Set(ids)].filter((id) => skills.has(id));
}

function lastActivityByGoal(
  doc: CareerDoc,
  development: CareerDevelopment,
): Map<string, DayKey> {
  const latest = new Map<string, DayKey>();
  const add = (goalId: string | undefined, day: DayKey | undefined | null) => {
    if (!goalId || !day) return;
    const current = latest.get(goalId);
    if (!current || day > current) latest.set(goalId, day);
  };

  for (const goal of doc.goals) {
    add(goal.id, development.practiceForGoal(goal.id).lastPractisedOn);
  }
  for (const evidence of doc.evidence) add(evidence.goalId, evidence.occurredOn);
  for (const achievement of doc.achievements) add(achievement.goalId, achievement.date);
  for (const assessment of doc.assessments) add(assessment.goalId, assessment.assessedOn);
  for (const milestone of doc.milestones) {
    if (milestone.status !== 'completed' || milestone.completedAt === undefined) continue;
    add(milestone.goalId, localDateKey(milestone.completedAt));
  }
  return latest;
}

function lastPracticeBySkill(
  doc: CareerDoc,
  development: CareerDevelopment,
): Map<string, DayKey> {
  const latest = new Map<string, DayKey>();
  const add = (skillId: string | undefined, day: DayKey | undefined | null) => {
    if (!skillId || !day) return;
    const current = latest.get(skillId);
    if (!current || day > current) latest.set(skillId, day);
  };

  for (const skill of doc.skills) {
    add(skill.id, development.practiceForSkill(skill.id).lastPractisedOn);
  }
  for (const evidence of doc.evidence) {
    for (const skillId of evidence.skillIds) add(skillId, evidence.occurredOn);
  }
  for (const assessment of doc.assessments) {
    for (const skillId of assessment.skillIds) add(skillId, assessment.assessedOn);
  }
  for (const achievement of doc.achievements) {
    for (const skillId of achievement.demonstratedSkillIds) add(skillId, achievement.date);
  }
  return latest;
}

/**
 * Public helper for the section's "when do they return?" copy. Kept here so the
 * component does not reimplement date arithmetic.
 */
export function recommendationsResumeOn(today: DayKey): DayKey {
  return addDays(today, 1);
}

/** The overview shows the best few; skipping one reveals the next candidate. */
export function topRecommendations(
  items: readonly CareerRecommendation[],
  limit = 3,
): CareerRecommendation[] {
  return items.slice(0, limit);
}

export const VISIBLE_RECOMMENDATIONS = 3;
