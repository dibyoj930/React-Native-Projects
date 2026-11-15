/**
 * Personal development intelligence.
 *
 * An optional offline layer built on top of accumulated career records. Nothing
 * here is AI-powered, nothing changes the plan, and nothing is required for the
 * app to work. Every insight is derived from records the user actually made,
 * and every insight states what it measures so nothing is presented as a
 * universal score or a causal claim.
 *
 * Pure. No storage, no React, no clock unless the caller passes today.
 */

import { addDays, type DayKey } from '../shared/date';
import type { FocusSession } from '../productivity/types';
import type { PlanOutcome } from '../replan/types';
import type { Todo } from '../todos/model';

import type { CareerDoc } from './types';
import { lastPractisedOn, skillGap } from './progress';
import { assessmentsForGoal, evidenceForGoal } from './selectors';

export type InsightKind =
  | 'strength'
  | 'underdeveloped'
  | 'neglectedGoal'
  | 'learningConsistency'
  | 'completionPattern'
  | 'achievementTrend'
  | 'repeatedlyPostponed';

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  /** Higher means more urgent to act on. */
  severity: 'low' | 'medium' | 'high';
  relatedGoalIds: string[];
  relatedSkillIds: string[];
};

export type IntelligenceReport = {
  today: DayKey;
  windowStart: DayKey;
  windowEnd: DayKey;
  insights: Insight[];
};

function todayWindow(today: DayKey, daysBack: number): { start: DayKey; end: DayKey } {
  const start = addDays(today, -daysBack + 1);
  return { start, end: today };
}

function daysWithActivity(doc: CareerDoc): DayKey[] {
  const days = new Set<DayKey>();
  for (const entry of doc.evidence) days.add(entry.occurredOn);
  for (const entry of doc.assessments) days.add(entry.assessedOn);
  for (const entry of doc.achievements) days.add(entry.date);
  return [...days].sort();
}

function countInWindow(
  entries: readonly { occurredOn?: DayKey; assessedOn?: DayKey; date?: DayKey }[],
  windowStart: DayKey,
  windowEnd: DayKey,
): number {
  let count = 0;
  for (const entry of entries) {
    const day = entry.occurredOn ?? entry.assessedOn ?? entry.date;
    if (!day) continue;
    if (day >= windowStart && day <= windowEnd) count += 1;
  }
  return count;
}

export function buildIntelligenceReport({
  doc,
  tasks: _tasks,
  sessions: _sessions,
  outcomes: _outcomes,
  today,
}: {
  doc: CareerDoc;
  tasks: readonly Todo[];
  sessions: readonly FocusSession[];
  outcomes: readonly (PlanOutcome | undefined)[];
  today: DayKey;
}): IntelligenceReport {
  const { start: windowStart, end: windowEnd } = todayWindow(today, 30);
  const insights: Insight[] = [];

  // --- Consistent strengths: target met AND practised in the window ---
  for (const skill of doc.skills) {
    if (skillGap(skill) !== 0) continue;
    const practisedOn = lastPractisedOn(doc, skill.id);
    if (!practisedOn || practisedOn < windowStart) continue;
    const relatedGoals = doc.goals.filter((goal) =>
      goal.relatedSkillIds.includes(skill.id),
    );
    insights.push({
      id: `intel-strength-${skill.id}`,
      kind: 'strength',
      title: `${skill.name} is at target`,
      body: `You are proficient at the target level (${skill.currentLevel}) and practised ${skill.name} most recently on ${practisedOn}.`,
      severity: 'low',
      relatedGoalIds: relatedGoals.map((goal) => goal.id),
      relatedSkillIds: [skill.id],
    });
  }

  // --- Underdeveloped competencies: a real gap with no recent practice ---
  for (const skill of doc.skills) {
    const gap = skillGap(skill);
    if (gap === 0) continue;
    const practisedOn = lastPractisedOn(doc, skill.id);
    if (practisedOn && practisedOn >= windowStart) continue;
    const relatedGoals = doc.goals.filter((goal) =>
      goal.relatedSkillIds.includes(skill.id),
    );
    insights.push({
      id: `intel-underdeveloped-${skill.id}`,
      kind: 'underdeveloped',
      title: `${skill.name} has a ${gap}-level gap`,
      body: `Target is ${skill.targetLevel}, current is ${skill.currentLevel}${
        practisedOn ? `; last practised ${practisedOn}.` : "; it hasn't been practised."
      }`,
      severity: gap >= 3 ? 'high' : 'medium',
      relatedGoalIds: relatedGoals.map((goal) => goal.id),
      relatedSkillIds: [skill.id],
    });
  }

  // --- Neglected development goals: active goals with no activity in the window ---
  const activeGoals = doc.goals.filter(
    (goal) =>
      goal.status === 'active' || goal.status === 'not-started' || goal.status === 'paused',
  );
  for (const goal of activeGoals) {
    const evidence = countInWindow(evidenceForGoal(doc, goal.id), windowStart, windowEnd);
    const assessments = countInWindow(
      assessmentsForGoal(doc, goal.id),
      windowStart,
      windowEnd,
    );
    const activity = evidence + assessments;
    if (activity > 0) continue;
    insights.push({
      id: `intel-neglected-goal-${goal.id}`,
      kind: 'neglectedGoal',
      title: `No activity on “${goal.title}” this month`,
      body: 'A goal without recent practice is not failing — it is simply waiting for a next step. Add a milestone, record evidence, or run a focus session.',
      severity: 'medium',
      relatedGoalIds: [goal.id],
      relatedSkillIds: [],
    });
  }

  // --- Learning consistency: distinct days with any career record in the window ---
  const hasAnyRecord =
    doc.skills.length > 0 ||
    doc.goals.length > 0 ||
    doc.milestones.length > 0 ||
    doc.evidence.length > 0 ||
    doc.assessments.length > 0 ||
    doc.achievements.length > 0;
  if (hasAnyRecord) {
    const activeDays = daysWithActivity(doc).filter(
      (day) => day >= windowStart && day <= windowEnd,
    );
    const consistencyCount = activeDays.length;
    const consistencyPct = Math.round((consistencyCount / 30) * 100);
    if (consistencyPct >= 50) {
      insights.push({
        id: 'intel-consistency-strong',
        kind: 'learningConsistency',
        title: 'Steady development rhythm',
        body: `You recorded career activity on ${consistencyCount} of the last 30 days.`,
        severity: 'low',
        relatedGoalIds: [],
        relatedSkillIds: [],
      });
    } else if (consistencyPct > 0) {
      insights.push({
        id: 'intel-consistency-soft',
        kind: 'learningConsistency',
        title: 'Light development rhythm',
        body: `You recorded career activity on ${consistencyCount} of the last 30 days.`,
        severity: 'medium',
        relatedGoalIds: [],
        relatedSkillIds: [],
      });
    } else {
      insights.push({
        id: 'intel-consistency-none',
        kind: 'learningConsistency',
        title: 'No recorded development activity this month',
        body: 'No evidence, assessments or achievements were logged in the last 30 days.',
        severity: 'medium',
        relatedGoalIds: [],
        relatedSkillIds: [],
      });
    }
  }

  // --- Goal completion pattern: milestones completed vs planned ---
  const activeNonArchivedMilestones = doc.milestones.filter(
    (m) => m.status !== 'archived',
  );
  const totalMilestones = activeNonArchivedMilestones.length;
  const completedMilestones = activeNonArchivedMilestones.filter(
    (m) => m.status === 'completed',
  ).length;
  if (totalMilestones > 0) {
    const pct = Math.round((completedMilestones / totalMilestones) * 100);
    insights.push({
      id: 'intel-completion-pattern',
      kind: 'completionPattern',
      title: `${pct}% of milestones complete`,
      body: `${completedMilestones} of ${totalMilestones} milestones are done.`,
      severity: pct >= 75 ? 'low' : pct >= 25 ? 'medium' : 'high',
      relatedGoalIds: [],
      relatedSkillIds: [],
    });
  }

  // --- Achievement trend: achievements recorded in the window ---
  const achievementCount = countInWindow(
    doc.achievements,
    windowStart,
    windowEnd,
  );
  if (achievementCount > 0) {
    insights.push({
      id: 'intel-achievement-trend',
      kind: 'achievementTrend',
      title: `${achievementCount} achievement${achievementCount === 1 ? '' : 's'} recorded this month`,
      body: 'These are real examples you can reuse in performance reviews, promotion discussions and interviews.',
      severity: 'low',
      relatedGoalIds: [],
      relatedSkillIds: [],
    });
  }

  // --- Repeatedly postponed: goals whose milestones keep slipping past their target ---
  for (const goal of doc.goals) {
    if (goal.status === 'archived' || goal.status === 'achieved') continue;
    const milestones = doc.milestones.filter(
      (m) => m.goalId === goal.id && m.status !== 'archived',
    );
    const overdueOpen = milestones.filter(
      (m) =>
        (m.status === 'not-started' || m.status === 'in-progress' || m.status === 'blocked') &&
        m.targetDate !== undefined &&
        m.targetDate < today,
    );
    if (overdueOpen.length === 0) continue;
    insights.push({
      id: `intel-postponed-${goal.id}`,
      kind: 'repeatedlyPostponed',
      title: `“${goal.title}” has ${overdueOpen.length} overdue milestone${overdueOpen.length === 1 ? '' : 's'}`,
      body: 'Move it, split it, or mark it blocked — an overdue date that never changes stops being informative.',
      severity: 'medium',
      relatedGoalIds: [goal.id],
      relatedSkillIds: [],
    });
  }

  insights.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    const s = rank[a.severity] - rank[b.severity];
    if (s !== 0) return s;
    return a.title.localeCompare(b.title);
  });

  return {
    today,
    windowStart,
    windowEnd,
    insights,
  };
}

/** A human-readable kind label, never a score or a percentage that claims more than it is. */
export function insightKindLabel(kind: InsightKind): string {
  switch (kind) {
    case 'strength':
      return 'Strength';
    case 'underdeveloped':
      return 'Capability gap';
    case 'neglectedGoal':
      return 'Neglected goal';
    case 'learningConsistency':
      return 'Learning consistency';
    case 'completionPattern':
      return 'Completion pattern';
    case 'achievementTrend':
      return 'Achievement trend';
    case 'repeatedlyPostponed':
      return 'Repeatedly postponed';
  }
}

/** A severity chip tone. */
export function insightSeverityTone(severity: Insight['severity']): 'neutral' | 'primary' | 'danger' | 'muted' {
  switch (severity) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'primary';
    case 'low':
      return 'muted';
  }
}

export function totalFocusSeconds(sessions: readonly FocusSession[]): number {
  let total = 0;
  for (const session of sessions) {
    if (Number.isFinite(session.focusedSeconds) && session.focusedSeconds > 0) {
      total += session.focusedSeconds;
    }
  }
  return total;
}

export function plannedVsActualFocusMins(
  outcomes: readonly PlanOutcome[],
): { planned: number; actual: number } {
  let planned = 0;
  let actual = 0;
  for (const outcome of outcomes) {
    for (const result of outcome.results) {
      if (result.plannedStart != null && result.plannedEnd != null) {
        planned += Math.max(0, result.plannedEnd - result.plannedStart) / 60_000;
      }
      if (result.actualFocusSeconds != null && result.actualFocusSeconds > 0) {
        actual += result.actualFocusSeconds / 60;
      }
    }
  }
  return { planned: Math.round(planned * 10) / 10, actual: Math.round(actual * 10) / 10 };
}

export type EstimateAccuracy = {
  goalId: string;
  goalTitle: string;
  plannedMinutes: number;
  actualMinutes: number;
  ratio: number | null;
};

export function estimateAccuracyForGoal(
  goalId: string,
  doc: CareerDoc,
  outcomes: readonly PlanOutcome[],
): EstimateAccuracy | null {
  const goal = doc.goals.find((entry) => entry.id === goalId);
  if (!goal) return null;
  let plannedMinutes = 0;
  let actualMinutes = 0;
  for (const outcome of outcomes) {
    for (const result of outcome.results) {
      if (result.career?.goalId !== goalId) continue;
      if (result.plannedStart != null && result.plannedEnd != null) {
        plannedMinutes += Math.max(0, result.plannedEnd - result.plannedStart) / 60_000;
      }
      if (result.actualFocusSeconds != null && result.actualFocusSeconds > 0) {
        actualMinutes += result.actualFocusSeconds / 60;
      }
    }
  }
  if (plannedMinutes === 0 && actualMinutes === 0) return null;
  return {
    goalId,
    goalTitle: goal.title,
    plannedMinutes: Math.round(plannedMinutes * 10) / 10,
    actualMinutes: Math.round(actualMinutes * 10) / 10,
    ratio: plannedMinutes === 0 ? null : actualMinutes / plannedMinutes,
  };
}
