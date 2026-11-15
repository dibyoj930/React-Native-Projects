import {
  buildCareerReview,
  createCareerAchievement,
  createCareerAssessment,
  createCareerEvidence,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  type CareerDoc,
} from '../../career';
import { localDateFromDayKey, type DayKey } from '../../shared/date';
import type { FocusSession } from '../../productivity/types';
import type { PlanOutcome } from '../../replan/types';
import type { Todo } from '../../todos/model';

const TODAY: DayKey = '2026-03-10'; // Tuesday — week window 2026-03-09 to 2026-03-15
const IN_WINDOW = '2026-03-10';
const OUT_OF_WINDOW = '2026-03-02';

function epochFor(day: DayKey): number {
  return localDateFromDayKey(day).getTime();
}

function makeDoc(): CareerDoc {
  const goal = createCareerGoal(
    { title: 'Learn the trade', description: '', goalType: 'skill', priority: 'medium', status: 'active', successCriteria: '', relatedSkillIds: [] },
    epochFor(IN_WINDOW),
  );
  const skill = createCareerSkill(
    { name: 'Negotiation', description: '', currentLevel: 2, targetLevel: 4, confidence: 3, roleImportance: 'medium', futureImportance: 'medium' },
    epochFor(IN_WINDOW),
  );
  const milestone = createCareerMilestone(
    goal.id,
    { title: 'First checkpoint', description: '', status: 'completed', relatedSkillIds: [] },
    epochFor(IN_WINDOW),
  );
  const evidence = createCareerEvidence(
    {
      title: 'Practice session',
      description: '',
      type: 'practice',
      occurredOn: IN_WINDOW,
      skillIds: [skill.id],
      goalId: goal.id,
    },
    epochFor(IN_WINDOW),
  );
  const achievement = createCareerAchievement(
    {
      title: 'Shipped the thing',
      description: '',
      category: 'impact',
      date: IN_WINDOW,
      demonstratedSkillIds: [skill.id],
      impact: 'Faster sign-off',
      metrics: 'Closed 20% more tickets',
      evidenceIds: [],
    },
    epochFor(IN_WINDOW),
  );
  const assessment = createCareerAssessment(
    { title: 'Practical check', type: 'practical', assessedOn: IN_WINDOW, skillIds: [skill.id], goalId: goal.id, score: 4, maxScore: 5, proficiencyLevel: 3, timeTakenMins: 15, difficulty: 'medium', notes: '' },
    epochFor(IN_WINDOW),
  );

  return {
    ...createInitialCareerDoc(epochFor(IN_WINDOW)),
    goals: [goal],
    skills: [skill],
    milestones: [milestone],
    evidence: [evidence],
    achievements: [achievement],
    assessments: [assessment],
  };
}

function makeTasks(goalId: string, skillId: string): Todo[] {
  const link = { goalId, skillIds: [skillId] };
  const inWindow = {
    id: 't-in',
    text: 'Career task',
    completed: true,
    completedAt: epochFor(IN_WINDOW),
    career: link,
  } as unknown as Todo;
  const outWindow = {
    id: 't-out',
    text: 'Old career task',
    completed: true,
    completedAt: epochFor(OUT_OF_WINDOW),
    career: link,
  } as unknown as Todo;
  const unlinked = {
    id: 't-unlinked',
    text: 'Plain task',
    completed: true,
    completedAt: epochFor(IN_WINDOW),
  } as unknown as Todo;
  return [inWindow, outWindow, unlinked];
}

function makeSessions(goalId: string, skillId: string): FocusSession[] {
  const link = { goalId, skillIds: [skillId] };
  const inWindow = {
    id: 's-in',
    focusedSeconds: 900,
    endedAt: epochFor(IN_WINDOW),
    career: link,
  } as unknown as FocusSession;
  const outWindow = {
    id: 's-out',
    focusedSeconds: 900,
    endedAt: epochFor(OUT_OF_WINDOW),
    career: link,
  } as unknown as FocusSession;
  const empty = {
    id: 's-empty',
    focusedSeconds: 0,
    endedAt: epochFor(IN_WINDOW),
    career: link,
  } as unknown as FocusSession;
  return [inWindow, outWindow, empty];
}

function makeOutcomes(goalId: string): PlanOutcome[] {
  const careerLink = { goalId };
  return [
    {
      dayKey: IN_WINDOW,
      planApprovedAt: epochFor(IN_WINDOW),
      generatedAt: epochFor(IN_WINDOW),
      planSignature: 'sig',
      results: [
        { taskId: 't1', taskText: 'Career work', wasScheduled: true, completed: true, status: 'completed', career: careerLink },
        { taskId: 't2', taskText: 'Postponed work', wasScheduled: true, completed: false, status: 'postponed', career: careerLink },
        { taskId: 't3', taskText: 'No link', wasScheduled: true, completed: true, status: 'completed' },
      ],
      summary: { totalPlanned: 3, completed: 2, completedOnTime: 1, completedLate: 0, missed: 0 },
    },
    {
      dayKey: OUT_OF_WINDOW,
      planApprovedAt: epochFor(OUT_OF_WINDOW),
      generatedAt: epochFor(OUT_OF_WINDOW),
      planSignature: 'sig-old',
      results: [
        { taskId: 't4', taskText: 'Old work', wasScheduled: true, completed: true, status: 'completed', career: careerLink },
      ],
      summary: { totalPlanned: 1, completed: 1, completedOnTime: 1, completedLate: 0, missed: 0 },
    },
  ] as PlanOutcome[];
}

describe('buildCareerReview', () => {
  it('computes the week window', () => {
    const doc = makeDoc();
    const review = buildCareerReview({
      doc,
      tasks: makeTasks(doc.goals[0].id, doc.skills[0].id),
      sessions: makeSessions(doc.goals[0].id, doc.skills[0].id),
      outcomes: makeOutcomes(doc.goals[0].id),
      period: 'week',
      today: TODAY,
    });

    expect(review.period).toBe('week');
    expect(review.days).toHaveLength(7);
    expect(review.periodStart <= IN_WINDOW).toBe(true);
    expect(review.periodEnd >= IN_WINDOW).toBe(true);
    expect(review.periodStart > OUT_OF_WINDOW).toBe(true);
  });

  it('counts in-window activity and excludes out-of-window activity', () => {
    const doc = makeDoc();
    const goalId = doc.goals[0].id;
    const skillId = doc.skills[0].id;
    const review = buildCareerReview({
      doc,
      tasks: makeTasks(goalId, skillId),
      sessions: makeSessions(goalId, skillId),
      outcomes: makeOutcomes(goalId),
      period: 'week',
      today: TODAY,
    });

    // Evidence, assessment, achievement all in window. Evidence is skill-linked
    // (the draft omits goalId), so it shows up on the skill's practice row.
    expect(review.skillsPractised[0]?.evidenceCount).toBe(1);
    expect(review.assessments).toHaveLength(1);
    expect(review.achievements).toHaveLength(1);

    // One milestone completed in window.
    expect(review.milestonesCompleted).toHaveLength(1);

    // One in-window linked task completion; the out-of-window one is excluded.
    expect(review.goalsProgressed[0].completedLinkedTaskCount).toBe(1);

    // One in-window attributed focus session; empty session excluded.
    expect(review.focusSessionCount).toBe(1);
    expect(review.focusedSeconds).toBe(900);

    // Planned vs actual from the in-window outcome only.
    expect(review.planned).toBe(2); // two career-linked scheduled results
    expect(review.completed).toBe(1);
    expect(review.postponed).toBe(1);
    expect(review.missed).toBe(0);
    expect(review.postponedGoalIds).toContain(goalId);
  });

  it('marks a skill neglected when it has a gap and no in-window practice', () => {
    const doc = makeDoc();
    const goalId = doc.goals[0].id;
    const skillId = doc.skills[0].id;

    // Same skill but no practice in window: give it a fresh skill with gap and no records.
    const neglected = createCareerSkill(
      { name: 'Spanish', description: '', currentLevel: 1, targetLevel: 3, confidence: 2, roleImportance: 'low', futureImportance: 'medium' },
      epochFor(IN_WINDOW),
    );
    const doc2 = { ...doc, skills: [doc.skills[0], neglected] };

    const review = buildCareerReview({
      doc: doc2,
      tasks: makeTasks(goalId, skillId),
      sessions: makeSessions(goalId, skillId),
      outcomes: makeOutcomes(goalId),
      period: 'week',
      today: TODAY,
    });

    const neglectedIds = review.neglectedSkills.map((s) => s.id);
    expect(neglectedIds).toContain(neglected.id);
    expect(neglectedIds).not.toContain(skillId);
  });

  it('produces zero counts for an empty window', () => {
    const doc = createInitialCareerDoc(epochFor(IN_WINDOW));
    const review = buildCareerReview({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      period: 'week',
      today: TODAY,
    });

    expect(review.goalsProgressed).toEqual([]);
    expect(review.skillsPractised).toEqual([]);
    expect(review.milestonesCompleted).toEqual([]);
    expect(review.achievements).toEqual([]);
    expect(review.assessments).toEqual([]);
    expect(review.planned).toBe(0);
    expect(review.completed).toBe(0);
    expect(review.postponed).toBe(0);
    expect(review.missed).toBe(0);
  });

  it('computes the month window', () => {
    const doc = makeDoc();
    const review = buildCareerReview({
      doc,
      tasks: makeTasks(doc.goals[0].id, doc.skills[0].id),
      sessions: makeSessions(doc.goals[0].id, doc.skills[0].id),
      outcomes: makeOutcomes(doc.goals[0].id),
      period: 'month',
      today: TODAY,
    });

    expect(review.period).toBe('month');
    expect(review.periodStart).toBe('2026-03-01');
    expect(review.periodEnd).toBe('2026-03-31');
    expect(review.days.length).toBe(31);
  });
});
