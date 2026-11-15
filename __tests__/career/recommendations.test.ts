/**
 * Daily development recommendations.
 *
 * These tests protect the contract that makes the feature safe:
 *   - every candidate is tied to a recorded fact and a real link;
 *   - available time caps the action rather than being ignored;
 *   - a skip is scoped to the day, while a snooze pauses the whole section;
 *   - recent practice and already-planned milestones are not duplicated.
 */

import {
  buildCareerDevelopment,
  buildCareerRecommendations,
  careerReducer,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  type CareerDoc,
  type CareerPlanReview,
  type CareerRecommendations,
} from '../../career';
import type { FocusSession } from '../../productivity/types';
import type { Todo } from '../../todos/model';

const TODAY = '2026-03-10';
const NOW = new Date(2026, 2, 10, 12).getTime();

function seed() {
  const skill = createCareerSkill(
    {
      name: 'Facilitation',
      description: '',
      currentLevel: 2,
      targetLevel: 4,
      confidence: 2,
      roleImportance: 'medium',
      futureImportance: 'high',
    },
    NOW,
  );
  const goal = createCareerGoal(
    {
      title: 'Lead a small project',
      description: '',
      goalType: 'skill',
      priority: 'high',
      status: 'active',
      successCriteria: 'I can lead a small project end to end.',
      relatedSkillIds: [skill.id],
    },
    NOW,
  );
  const milestone = createCareerMilestone(
    goal.id,
    {
      title: 'Run the first session',
      description: '',
      targetDate: '2026-03-12',
      status: 'in-progress',
      relatedSkillIds: [skill.id],
    },
    NOW,
  );
  const doc: CareerDoc = {
    ...createInitialCareerDoc(NOW),
    goals: [goal],
    skills: [skill],
    milestones: [milestone],
  };
  return { doc, goal, skill, milestone };
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: 'Career task',
    completed: false,
    createdAt: NOW,
    ...overrides,
  };
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's1',
    taskId: 't1',
    startedAt: new Date(2026, 2, 10, 9).getTime(),
    endedAt: new Date(2026, 2, 10, 9, 25).getTime(),
    focusedSeconds: 25 * 60,
    status: 'stopped',
    ...overrides,
  };
}

function build(
  doc: CareerDoc,
  overrides: Partial<Parameters<typeof buildCareerRecommendations>[0]> = {},
): CareerRecommendations {
  return buildCareerRecommendations({
    doc,
    development: buildCareerDevelopment(doc, [], []),
    today: TODAY,
    ...overrides,
  });
}

function planReview(overrides: Partial<CareerPlanReview> = {}): CareerPlanReview {
  return {
    days: [],
    planned: 0,
    completed: 0,
    postponed: 0,
    missed: 0,
    plannedFocusMins: 0,
    actualFocusMins: 0,
    hasActivity: true,
    goalIds: [],
    postponedGoalIds: [],
    missedGoalIds: [],
    milestoneCompleted: 0,
    milestoneTotal: 0,
    ...overrides,
  };
}

describe('buildCareerRecommendations', () => {
  it('turns an open milestone into a linked task the user can accept', () => {
    const { doc, goal, milestone } = seed();
    const model = build(doc);
    const recommendation = model.items.find((item) => item.kind === 'milestone');

    expect(recommendation).toMatchObject({
      goalId: goal.id,
      milestoneId: milestone.id,
      expectedMinutes: 45,
      career: { goalId: goal.id, milestoneId: milestone.id },
    });
    expect(recommendation?.taskText).toContain(milestone.title);
    expect(recommendation?.completionCriteria.length).toBeGreaterThan(0);
    expect(recommendation?.expectedEvidence.length).toBeGreaterThan(0);
  });

  it('recommends learning a skill that has never been practised and has a gap', () => {
    const { doc, skill } = seed();
    const model = build(doc);
    const recommendation = model.items.find((item) => item.skillId === skill.id);

    expect(recommendation?.kind).toBe('learn');
    expect(recommendation?.career).toEqual({
      goalId: doc.goals[0].id,
      skillIds: [skill.id],
    });
    expect(recommendation?.rationale).toContain('No practice');
  });

  it('does not recommend a skill practised in the last two days', () => {
    const { doc, skill } = seed();
    const development = buildCareerDevelopment(doc, [], [
      session({ career: { skillIds: [skill.id] } }),
    ]);
    const model = build(doc, { development });

    expect(
      model.items.some(
        (item) =>
          (item.kind === 'learn' || item.kind === 'practise') &&
          item.skillId === skill.id,
      ),
    ).toBe(false);
  });

  it('caps every action to the open time, and refuses to suggest a token action', () => {
    const { doc } = seed();
    const model = build(doc, { availableMinutes: 25 });
    const tooShort = build(doc, { availableMinutes: 5 });

    expect(model.noTime).toBe(false);
    expect(model.availableMinutes).toBe(25);
    expect(model.items.every((item) => item.expectedMinutes <= 25)).toBe(true);
    expect(tooShort.items).toEqual([]);
    expect(tooShort.noTime).toBe(true);
  });

  it('skips a recommendation already dismissed today, but keeps the rest', () => {
    const { doc } = seed();
    const first = build(doc);
    const dismissed = first.items.find((item) => item.kind === 'milestone');
    expect(dismissed).toBeDefined();

    const model = build({
      ...doc,
      recommendations: {
        ...doc.recommendations,
        dismissedIds: [dismissed!.id],
      },
    });

    expect(model.items.some((item) => item.id === dismissed!.id)).toBe(false);
    expect(model.items.length).toBeGreaterThan(0);
  });

  it('pauses the whole section until the snooze date', () => {
    const { doc } = seed();
    const model = build({
      ...doc,
      recommendations: { dismissedIds: [], snoozedUntil: '2026-03-11' },
    });

    expect(model.items).toEqual([]);
    expect(model.snoozedUntil).toBe('2026-03-11');
  });

  it('does not duplicate a milestone whose task is already open', () => {
    const { doc, goal, milestone } = seed();
    const development = buildCareerDevelopment(
      doc,
      [todo({ career: { goalId: goal.id, milestoneId: milestone.id } })],
      [],
    );
    const model = build(doc, { development });

    expect(model.items.some((item) => item.kind === 'milestone')).toBe(false);
  });

  it('surfaces a stalled goal from the last plan review', () => {
    const { doc, goal } = seed();
    const model = build(doc, {
      planReview: planReview({ goalIds: [goal.id], postponedGoalIds: [goal.id] }),
    });
    const recommendation = model.items.find((item) => item.kind === 'improve-process');

    expect(recommendation?.goalId).toBe(goal.id);
    expect(recommendation?.rationale).toContain('postponed');
  });

  it('prepares for an assessment goal without inventing a result', () => {
    const doc = {
      ...createInitialCareerDoc(NOW),
      goals: [
        createCareerGoal(
          {
            title: 'Pass the certification',
            description: '',
            goalType: 'certification',
            priority: 'high',
            status: 'active',
            successCriteria: '',
            relatedSkillIds: [],
          },
          NOW,
        ),
      ],
    };
    const model = build(doc);
    const recommendation = model.items.find((item) => item.kind === 'assessment');

    expect(recommendation).toBeDefined();
    expect(recommendation?.expectedEvidence).toContain('assessment result');
    expect(recommendation?.expectedEvidence).not.toContain('passed');
  });

  it('is deterministic for the same facts', () => {
    const { doc } = seed();
    expect(build(doc)).toEqual(build(doc));
  });

  it('does not recommend a paused goal', () => {
    const { doc, goal } = seed();
    const paused = { ...goal, status: 'paused' as const };
    const model = build({ ...doc, goals: [paused] });

    expect(model.items.some((item) => item.goalId === goal.id)).toBe(false);
  });
});

describe('careerReducer — recommendation decisions', () => {
  it('dismisses once and snoozes until a day, then resumes', () => {
    const { doc } = seed();
    const initial = { doc, hydrated: true };

    const dismissed = careerReducer(initial, {
      type: 'dismissRecommendation',
      id: 'rec-1',
    });
    expect(dismissed.doc.recommendations.dismissedIds).toEqual(['rec-1']);

    const again = careerReducer(dismissed, {
      type: 'dismissRecommendation',
      id: 'rec-1',
    });
    expect(again).toBe(dismissed);
    expect(again.doc.recommendations.dismissedIds).toHaveLength(1);

    const snoozed = careerReducer(dismissed, {
      type: 'snoozeRecommendations',
      until: '2026-03-11',
    });
    expect(snoozed.doc.recommendations.snoozedUntil).toBe('2026-03-11');

    const resumed = careerReducer(snoozed, { type: 'resumeRecommendations' });
    expect(resumed.doc.recommendations).not.toHaveProperty('snoozedUntil');
    expect(resumed.doc.recommendations.dismissedIds).toEqual(['rec-1']);
  });
});
