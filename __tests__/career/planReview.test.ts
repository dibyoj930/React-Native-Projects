/**
 * The career slice of Plan Review.
 *
 * The assertions pin the two honesty rules that matter:
 *   - a row counts only when it carried a career snapshot, and
 *   - recorded focus counts only when the session itself carried a career link.
 *
 * A later task edit or deletion must not be able to rewrite the day.
 */

import {
  buildCareerPlanReview,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  type CareerDoc,
} from '../../career';
import type { FocusSession } from '../../productivity/types';
import type { PlanOutcome, PlannedTaskResult } from '../../replan/types';

const DAY_1 = '2026-03-09';
const DAY_2 = '2026-03-10';

function seed() {
  const goal = createCareerGoal(
    {
      title: 'Lead a small project',
      description: '',
      goalType: 'skill',
      priority: 'high',
      status: 'active',
      successCriteria: '',
      relatedSkillIds: [],
    },
    1,
  );
  const skill = createCareerSkill(
    {
      name: 'Facilitation',
      description: '',
      currentLevel: 2,
      targetLevel: 4,
      confidence: 3,
      roleImportance: 'medium',
      futureImportance: 'high',
    },
    1,
  );
  const done = createCareerMilestone(
    goal.id,
    {
      title: 'Run the first session',
      description: '',
      status: 'completed',
      relatedSkillIds: [skill.id],
    },
    1,
  );
  const open = createCareerMilestone(
    goal.id,
    {
      title: 'Hand over the work',
      description: '',
      status: 'in-progress',
      relatedSkillIds: [skill.id],
    },
    1,
  );
  const doc: CareerDoc = {
    ...createInitialCareerDoc(1),
    goals: [goal],
    skills: [skill],
    milestones: [done, open],
  };
  return { doc, goal, skill, done, open };
}

function result(overrides: Partial<PlannedTaskResult> = {}): PlannedTaskResult {
  return {
    taskId: 't1',
    taskText: 'A career task',
    plannedStart: 0,
    plannedEnd: 30 * 60_000,
    wasScheduled: true,
    completed: false,
    status: 'ongoing',
    ...overrides,
  };
}

function outcome(dayKey: string, results: PlannedTaskResult[]): PlanOutcome {
  return {
    dayKey,
    planApprovedAt: 1,
    generatedAt: 1,
    planSignature: 'sig',
    results,
    summary: {
      totalPlanned: results.length,
      completed: results.filter((entry) => entry.completed).length,
      completedOnTime: 0,
      completedLate: 0,
      postponed: results.filter((entry) => entry.status === 'postponed').length,
      missed: results.filter((entry) => entry.status === 'missed').length,
    },
  };
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's1',
    taskId: 't1',
    startedAt: new Date(2026, 2, 9, 9).getTime(),
    endedAt: new Date(2026, 2, 9, 9, 25).getTime(),
    focusedSeconds: 25 * 60,
    status: 'stopped',
    ...overrides,
  };
}

describe('buildCareerPlanReview', () => {
  it('counts only career-linked rows, and snapshots decide the day', () => {
    const { doc, goal, skill } = seed();
    const days = [DAY_1, DAY_2];
    const outcomes = [
      outcome(DAY_1, [
        result({
          taskId: 'career',
          completed: true,
          completedAt: 2,
          status: 'completed-on-time',
          career: { goalId: goal.id, skillIds: [skill.id] },
        }),
        result({ taskId: 'plain', completed: true, status: 'completed-on-time' }),
      ]),
      outcome(DAY_2, [
        result({
          taskId: 'postponed',
          wasScheduled: true,
          status: 'postponed',
          career: { goalId: goal.id },
        }),
        result({
          taskId: 'dangling',
          wasScheduled: true,
          status: 'missed',
          career: { goalId: 'missing-goal' },
        }),
      ]),
    ];

    const review = buildCareerPlanReview({
      doc,
      days,
      outcomes,
      sessions: [],
    });

    expect(review.hasActivity).toBe(true);
    expect(review.planned).toBe(2);
    expect(review.completed).toBe(1);
    expect(review.postponed).toBe(1);
    expect(review.missed).toBe(0);
    expect(review.plannedFocusMins).toBe(60);
    expect(review.goalIds).toEqual([goal.id]);
    expect(review.postponedGoalIds).toEqual([goal.id]);
    expect(review.days.map((day) => day.dayKey)).toEqual(days);
    // The dangling link contributes nothing; it is not a second missed row.
    expect(review.days[1].missed).toBe(0);
  });

  it('uses attributed sessions for recorded focus, not the task current link', () => {
    const { doc, goal } = seed();
    const review = buildCareerPlanReview({
      doc,
      days: [DAY_1, DAY_2],
      outcomes: [],
      sessions: [
        session({ career: { goalId: goal.id }, focusedSeconds: 25 * 60 }),
        // Same task id, no career snapshot: old focus must not be backfilled.
        session({ id: 's2', focusedSeconds: 30 * 60 }),
        // A deleted goal no longer resolves.
        session({
          id: 's3',
          focusedSeconds: 30 * 60,
          endedAt: new Date(2026, 2, 10, 10).getTime(),
          career: { goalId: 'missing' },
        }),
      ],
    });

    expect(review.actualFocusMins).toBe(25);
    expect(review.hasActivity).toBe(true);
  });

  it('reports milestone progress only for goals with career activity', () => {
    const { doc, goal } = seed();
    const review = buildCareerPlanReview({
      doc,
      days: [DAY_1],
      outcomes: [
        outcome(DAY_1, [
          result({
            taskId: 'career',
            status: 'completed-on-time',
            completed: true,
            career: { goalId: goal.id },
          }),
        ]),
      ],
      sessions: [],
    });

    expect(review.milestoneCompleted).toBe(1);
    expect(review.milestoneTotal).toBe(2);
  });

  it('says there is no activity when every row and session is unlinked', () => {
    const { doc } = seed();
    const review = buildCareerPlanReview({
      doc,
      days: [DAY_1],
      outcomes: [outcome(DAY_1, [result({ completed: true, status: 'completed-on-time' })])],
      sessions: [session()],
    });

    expect(review.hasActivity).toBe(false);
    expect(review.planned).toBe(0);
    expect(review.completed).toBe(0);
    expect(review.actualFocusMins).toBe(0);
    expect(review.milestoneTotal).toBe(0);
  });
});
