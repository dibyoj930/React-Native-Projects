/**
 * The cross-domain bridge between tasks, focus sessions and the career record.
 *
 * The career document never stores task ids or task counts. Everything here is
 * derived: a task points at career work, a focus session carries the link it saw
 * when it started, and the career side reads those facts without writing back.
 * That is what keeps deleting a task from being able to damage career history.
 *
 * The functions are pure. `hooks/useCareerDevelopment` is the React wrapper that
 * memoises them for the app; tests can call this file directly.
 */

import { localDateKey, type DayKey } from '../shared/date';
import {
  sanitizeCareerLink,
  type CareerLink,
  type CareerLinkOptions,
} from '../shared/careerLink';
import type { FocusSession } from '../productivity/types';
import type { Todo } from '../todos/model';

import type { CareerDoc } from './types';

export type CareerPractice = {
  /** Tasks currently linked to this record. */
  linkedTaskCount: number;
  /** Linked tasks still open. */
  openTaskCount: number;
  /** Linked tasks completed. */
  completedTaskCount: number;
  /** Explicitly attributed focus sessions with real time in them. */
  focusSessionCount: number;
  /** Focused seconds from those sessions. Never estimated. */
  focusedSeconds: number;
  /**
   * The latest day this record was practised, as far as the app can honestly
   * tell: a linked completion or an attributed focus session. `null` means no
   * practice is recorded, not zero practice.
   */
  lastPractisedOn: DayKey | null;
};

export type CareerDevelopment = {
  /** Picker options for the task sheet. Archived goals are not offered. */
  options: CareerLinkOptions;
  /** The number of distinct tasks carrying a link that still resolves. */
  linkedTaskCount: number;
  practiceForGoal: (goalId: string) => CareerPractice;
  practiceForSkill: (skillId: string) => CareerPractice;
  practiceForMilestone: (milestoneId: string) => CareerPractice;
  tasksForGoal: (goalId: string) => Todo[];
  tasksForSkill: (skillId: string) => Todo[];
  tasksForMilestone: (milestoneId: string) => Todo[];
  /** A one-line description of a task's link, or undefined when it resolves to nothing. */
  labelForLink: (link: CareerLink | undefined) => string | undefined;
};

type PracticeAccumulator = {
  tasks: Todo[];
  openTaskCount: number;
  completedTaskCount: number;
  focusSessionCount: number;
  focusedSeconds: number;
  lastPractisedOn: DayKey | null;
};

type LinkIndexes = {
  goalIds: Set<string>;
  milestoneById: Map<string, { goalId: string }>;
  skillIds: Set<string>;
};

export function buildCareerDevelopment(
  doc: CareerDoc,
  tasks: readonly Todo[],
  sessions: readonly FocusSession[],
): CareerDevelopment {
  const indexes = indexCareerLinks(doc);
  const goals = new Map<string, PracticeAccumulator>();
  const skills = new Map<string, PracticeAccumulator>();
  const milestones = new Map<string, PracticeAccumulator>();
  let linkedTaskCount = 0;

  for (const task of tasks) {
    const link = resolveCareerLink(task.career, indexes);
    if (!link) continue;
    linkedTaskCount += 1;

    const completedOn = completedDay(task);
    if (link.goalId) {
      accumulateTask(goals, link.goalId, task, completedOn);
    }
    if (link.milestoneId) {
      accumulateTask(milestones, link.milestoneId, task, completedOn);
    }
    for (const skillId of link.skillIds ?? []) {
      accumulateTask(skills, skillId, task, completedOn);
    }
  }

  for (const session of sessions) {
    const link = resolveCareerLink(session.career, indexes);
    if (!link) continue;
    // A session with no real focus is not practice. Counting it would let an
    // instantly stopped timer claim a practice date the user never earned.
    if (!Number.isFinite(session.focusedSeconds) || session.focusedSeconds <= 0) {
      continue;
    }
    if (!Number.isFinite(session.endedAt)) continue;

    const on = localDateKey(session.endedAt);
    if (link.goalId) {
      accumulateFocus(goals, link.goalId, session.focusedSeconds, on);
    }
    if (link.milestoneId) {
      accumulateFocus(milestones, link.milestoneId, session.focusedSeconds, on);
    }
    for (const skillId of link.skillIds ?? []) {
      accumulateFocus(skills, skillId, session.focusedSeconds, on);
    }
  }

  return {
    options: buildCareerLinkOptions(doc),
    linkedTaskCount,
    practiceForGoal: (goalId) => practice(goals.get(goalId)),
    practiceForSkill: (skillId) => practice(skills.get(skillId)),
    practiceForMilestone: (milestoneId) => practice(milestones.get(milestoneId)),
    tasksForGoal: (goalId) => goals.get(goalId)?.tasks ?? [],
    tasksForSkill: (skillId) => skills.get(skillId)?.tasks ?? [],
    tasksForMilestone: (milestoneId) => milestones.get(milestoneId)?.tasks ?? [],
    labelForLink: (link) => {
      const clean = resolveCareerLink(link, indexes);
      return clean ? labelForResolvedLink(doc, clean) : undefined;
    },
  };
}

/** The task sheet's options: goals that are still open enough to link to. */
export function buildCareerLinkOptions(doc: CareerDoc): CareerLinkOptions {
  const goals = doc.goals
    .filter((goal) => goal.status !== 'archived')
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.title.localeCompare(b.title))
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      milestones: doc.milestones
        .filter(
          (milestone) =>
            milestone.goalId === goal.id && milestone.status !== 'archived',
        )
        .sort(
          (a, b) =>
            (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31') ||
            a.createdAt - b.createdAt,
        )
        .map((milestone) => ({ id: milestone.id, title: milestone.title })),
    }));

  const skills = [...doc.skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ id: skill.id, name: skill.name }));

  return { goals, skills };
}

/**
 * A readable label for a task row.
 *
 * Dangling references are ignored rather than shown as raw ids. If the link no
 * longer names anything, the row shows no career chip at all.
 */
export function careerLinkLabel(
  doc: CareerDoc,
  link: CareerLink | undefined,
): string | undefined {
  const clean = resolveCareerLink(link, indexCareerLinks(doc));
  return clean ? labelForResolvedLink(doc, clean) : undefined;
}

function labelForResolvedLink(doc: CareerDoc, clean: CareerLink): string | undefined {
  const parts: string[] = [];
  const goal = clean.goalId
    ? doc.goals.find((entry) => entry.id === clean.goalId)
    : undefined;
  if (goal) parts.push(goal.title);

  const milestone = clean.milestoneId
    ? doc.milestones.find((entry) => entry.id === clean.milestoneId)
    : undefined;
  if (milestone) parts.push(milestone.title);

  const skillNames = (clean.skillIds ?? [])
    .map((id) => doc.skills.find((skill) => skill.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (skillNames.length === 1) {
    parts.push(skillNames[0]);
  } else if (skillNames.length > 1) {
    parts.push(`${skillNames[0]} +${skillNames.length - 1}`);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function indexCareerLinks(doc: CareerDoc): LinkIndexes {
  return {
    goalIds: new Set(doc.goals.map((goal) => goal.id)),
    milestoneById: new Map(
      doc.milestones.map((milestone) => [milestone.id, { goalId: milestone.goalId }]),
    ),
    skillIds: new Set(doc.skills.map((skill) => skill.id)),
  };
}

/**
 * Keeps only the parts of a link the current document can still explain.
 *
 * A goal can be deleted while a task still points at it, and a milestone can be
 * moved or removed. The goal and its milestone are kept or dropped together;
 * skills are independent, so a task can still count for the skills it exercised
 * even if the goal it was filed under is gone.
 */
function resolveCareerLink(
  link: CareerLink | undefined,
  indexes: LinkIndexes,
): CareerLink | undefined {
  const clean = sanitizeCareerLink(link);
  if (!clean) return undefined;

  const goalId =
    clean.goalId && indexes.goalIds.has(clean.goalId) ? clean.goalId : undefined;
  const milestoneId =
    goalId &&
    clean.milestoneId &&
    indexes.milestoneById.get(clean.milestoneId)?.goalId === goalId
      ? clean.milestoneId
      : undefined;
  const skillIds = (clean.skillIds ?? []).filter((id) => indexes.skillIds.has(id));

  if (!goalId && skillIds.length === 0) return undefined;

  return {
    ...(goalId ? { goalId } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    ...(skillIds.length > 0 ? { skillIds } : {}),
  };
}

function completedDay(task: Todo): DayKey | null {
  if (
    !task.completed ||
    typeof task.completedAt !== 'number' ||
    !Number.isFinite(task.completedAt)
  ) {
    return null;
  }
  return localDateKey(task.completedAt);
}

function accumulateTask(
  map: Map<string, PracticeAccumulator>,
  id: string,
  task: Todo,
  completedOn: DayKey | null,
): void {
  const entry = accumulatorFor(map, id);
  entry.tasks.push(task);
  if (task.completed) entry.completedTaskCount += 1;
  else entry.openTaskCount += 1;
  entry.lastPractisedOn = latestDay(entry.lastPractisedOn, completedOn);
}

function accumulateFocus(
  map: Map<string, PracticeAccumulator>,
  id: string,
  seconds: number,
  on: DayKey,
): void {
  const entry = accumulatorFor(map, id);
  entry.focusSessionCount += 1;
  entry.focusedSeconds += seconds;
  entry.lastPractisedOn = latestDay(entry.lastPractisedOn, on);
}

function accumulatorFor(
  map: Map<string, PracticeAccumulator>,
  id: string,
): PracticeAccumulator {
  const existing = map.get(id);
  if (existing) return existing;

  const created: PracticeAccumulator = {
    tasks: [],
    openTaskCount: 0,
    completedTaskCount: 0,
    focusSessionCount: 0,
    focusedSeconds: 0,
    lastPractisedOn: null,
  };
  map.set(id, created);
  return created;
}

function practice(entry: PracticeAccumulator | undefined): CareerPractice {
  return {
    linkedTaskCount: entry?.tasks.length ?? 0,
    openTaskCount: entry?.openTaskCount ?? 0,
    completedTaskCount: entry?.completedTaskCount ?? 0,
    focusSessionCount: entry?.focusSessionCount ?? 0,
    focusedSeconds: entry?.focusedSeconds ?? 0,
    lastPractisedOn: entry?.lastPractisedOn ?? null,
  };
}

function latestDay(current: DayKey | null, candidate: DayKey | null): DayKey | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

function statusRank(status: CareerDoc['goals'][number]['status']): number {
  switch (status) {
    case 'active':
      return 0;
    case 'not-started':
      return 1;
    case 'paused':
      return 2;
    case 'achieved':
      return 3;
    case 'archived':
      return 4;
  }
}
