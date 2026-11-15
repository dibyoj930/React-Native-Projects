import {
  buildIntelligenceReport,
  createCareerAchievement,
  createCareerAssessment,
  createCareerEvidence,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  insightKindLabel,
  insightSeverityTone,
  type CareerDoc,
} from '../../career';
import { localDateFromDayKey, type DayKey } from '../../shared/date';
import type { FocusSession } from '../../productivity/types';
import type { PlanOutcome } from '../../replan/types';
import type { Todo } from '../../todos/model';

const TODAY: DayKey = '2026-03-15';

function epochFor(day: DayKey): number {
  return localDateFromDayKey(day).getTime();
}

function makeDoc(): CareerDoc {
  const goal = createCareerGoal(
    {
      title: 'Learn the trade',
      description: '',
      goalType: 'skill',
      priority: 'medium',
      status: 'active',
      successCriteria: '',
      relatedSkillIds: [],
    },
    epochFor(TODAY),
  );
  const metSkill = createCareerSkill(
    {
      name: 'Negotiation',
      description: '',
      currentLevel: 4,
      targetLevel: 4,
      confidence: 4,
      roleImportance: 'medium',
      futureImportance: 'medium',
    },
    epochFor(TODAY),
  );
  const gapSkill = createCareerSkill(
    {
      name: 'Spanish',
      description: '',
      currentLevel: 1,
      targetLevel: 3,
      confidence: 2,
      roleImportance: 'low',
      futureImportance: 'medium',
    },
    epochFor(TODAY),
  );
  const metWithPractice = createCareerSkill(
    {
      name: 'Writing',
      description: '',
      currentLevel: 3,
      targetLevel: 3,
      confidence: 3,
      roleImportance: 'medium',
      futureImportance: 'medium',
    },
    epochFor(TODAY),
  );

  const evidence = createCareerEvidence(
    {
      title: 'Practice session',
      description: '',
      type: 'practice',
      occurredOn: '2026-03-10',
      skillIds: [metWithPractice.id],
      goalId: goal.id,
    },
    epochFor(TODAY),
  );
  const assessment = createCareerAssessment(
    {
      title: 'Practical check',
      type: 'practical',
      assessedOn: '2026-03-11',
      skillIds: [metWithPractice.id],
      goalId: goal.id,
      score: 4,
      maxScore: 5,
      proficiencyLevel: 3,
      timeTakenMins: 15,
      difficulty: 'medium',
      notes: '',
    },
    epochFor(TODAY),
  );
  const achievement = createCareerAchievement(
    {
      title: 'Shipped the thing',
      description: '',
      category: 'impact',
      date: '2026-03-12',
      demonstratedSkillIds: [metWithPractice.id],
      impact: 'Faster sign-off',
      metrics: 'Closed 20% more tickets',
      evidenceIds: [],
      goalId: goal.id,
    },
    epochFor(TODAY),
  );
  const milestone = createCareerMilestone(
    goal.id,
    { title: 'First checkpoint', description: '', status: 'completed', relatedSkillIds: [] },
    epochFor(TODAY),
  );

  return {
    ...createInitialCareerDoc(epochFor(TODAY)),
    goals: [goal],
    skills: [metSkill, gapSkill, metWithPractice],
    milestones: [milestone],
    evidence: [evidence],
    assessments: [assessment],
    achievements: [achievement],
  };
}

function makeTasks(goalId: string): Todo[] {
  return [
    {
      id: 't1',
      text: 'Career task',
      completed: true,
      completedAt: epochFor('2026-03-10'),
      career: { goalId },
    } as unknown as Todo,
    {
      id: 't2',
      text: 'Plain task',
      completed: true,
      completedAt: epochFor(TODAY),
    } as unknown as Todo,
  ];
}

function makeSessions(): FocusSession[] {
  return [
    {
      id: 's1',
      focusedSeconds: 900,
      endedAt: epochFor(TODAY),
      career: { goalId: makeDoc().goals[0].id },
    } as unknown as FocusSession,
  ];
}

function makeOutcomes(goalId: string): PlanOutcome[] {
  return [
    {
      dayKey: TODAY,
      planApprovedAt: epochFor(TODAY),
      generatedAt: epochFor(TODAY),
      planSignature: 'sig',
      results: [
        {
          taskId: 't1',
          taskText: 'Career work',
          wasScheduled: true,
          completed: true,
          status: 'completed-on-time',
          career: { goalId },
          plannedStart: epochFor(TODAY),
          plannedEnd: epochFor(TODAY) + 3_600_000,
          actualFocusSeconds: 900,
        },
      ],
      summary: { totalPlanned: 1, completed: 1, completedOnTime: 1, completedLate: 0, postponed: 0, missed: 0 },
    },
  ];
}

describe('buildIntelligenceReport', () => {
  it('surfaces a strength for a met skill practised recently', () => {
    const doc = makeDoc();
    const report = buildIntelligenceReport({
      doc,
      tasks: makeTasks(doc.goals[0].id),
      sessions: makeSessions(),
      outcomes: makeOutcomes(doc.goals[0].id),
      today: TODAY,
    });

    const strengths = report.insights.filter((i) => i.kind === 'strength');
    expect(strengths.length).toBeGreaterThan(0);
    expect(strengths[0].title).toContain('is at target');
    expect(strengths[0].severity).toBe('low');
  });

  it('surfaces an underdeveloped skill with no recent practice', () => {
    const doc = makeDoc();
    const report = buildIntelligenceReport({
      doc,
      tasks: makeTasks(doc.goals[0].id),
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    const gaps = report.insights.filter((i) => i.kind === 'underdeveloped');
    const spanish = gaps.find((i) => i.title.includes('Spanish'));
    expect(spanish).toBeDefined();
    expect(spanish?.severity).toBe('medium');
  });

  it('surfaces a neglected active goal with no activity', () => {
    const goal = createCareerGoal(
      {
        title: 'Neglected goal',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: '',
        relatedSkillIds: [],
      },
      epochFor(TODAY),
    );
    const doc = { ...makeDoc(), goals: [makeDoc().goals[0], goal] };
    const report = buildIntelligenceReport({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    const neglected = report.insights.filter((i) => i.kind === 'neglectedGoal');
    expect(neglected.some((i) => i.title.includes('Neglected goal'))).toBe(true);
  });

  it('reports learning consistency', () => {
    const doc = makeDoc();
    const report = buildIntelligenceReport({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    const consistency = report.insights.find((i) => i.kind === 'learningConsistency');
    expect(consistency).toBeDefined();
    expect(consistency?.body).toContain('of the last 30 days');
  });

  it('reports completion pattern when milestones exist', () => {
    const doc = makeDoc();
    const report = buildIntelligenceReport({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    const pattern = report.insights.find((i) => i.kind === 'completionPattern');
    expect(pattern).toBeDefined();
    expect(pattern?.title).toContain('% of milestones complete');
  });

  it('reports achievement trend when achievements exist in window', () => {
    const doc = makeDoc();
    const report = buildIntelligenceReport({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    const trend = report.insights.find((i) => i.kind === 'achievementTrend');
    expect(trend).toBeDefined();
  });

  it('reports repeatedly postponed goals with overdue open milestones', () => {
    const goal = createCareerGoal(
      {
        title: 'Slipping goal',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: '',
        relatedSkillIds: [],
      },
      epochFor(TODAY),
    );
    const milestone = createCareerMilestone(
      goal.id,
      {
        title: 'Overdue checkpoint',
        description: '',
        status: 'in-progress',
        relatedSkillIds: [],
        targetDate: '2026-02-20',
      },
      epochFor(TODAY),
    );
    const doc = { ...makeDoc(), goals: [makeDoc().goals[0], goal], milestones: [milestone] };
    const report = buildIntelligenceReport({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    const postponed = report.insights.filter((i) => i.kind === 'repeatedlyPostponed');
    expect(postponed.some((i) => i.title.includes('Slipping goal'))).toBe(true);
  });

  it('produces no insights for an empty doc', () => {
    const doc = createInitialCareerDoc(epochFor(TODAY));
    const report = buildIntelligenceReport({
      doc,
      tasks: [],
      sessions: [],
      outcomes: [],
      today: TODAY,
    });

    expect(report.insights.length).toBe(0);
  });
});

describe('insightKindLabel', () => {
  it('labels every kind', () => {
    expect(insightKindLabel('strength')).toBe('Strength');
    expect(insightKindLabel('underdeveloped')).toBe('Capability gap');
    expect(insightKindLabel('neglectedGoal')).toBe('Neglected goal');
    expect(insightKindLabel('learningConsistency')).toBe('Learning consistency');
    expect(insightKindLabel('completionPattern')).toBe('Completion pattern');
    expect(insightKindLabel('achievementTrend')).toBe('Achievement trend');
    expect(insightKindLabel('repeatedlyPostponed')).toBe('Repeatedly postponed');
  });
});

describe('insightSeverityTone', () => {
  it('maps severity to tone', () => {
    expect(insightSeverityTone('high')).toBe('danger');
    expect(insightSeverityTone('medium')).toBe('primary');
    expect(insightSeverityTone('low')).toBe('muted');
  });
});
