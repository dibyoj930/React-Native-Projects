import {
  assessmentsForGoal,
  buildCareerOverview,
  createCareerAssessment,
  createCareerEvidence,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  goalProgress,
  lastPractisedOn,
  skillGap,
  type CareerDoc,
  type Confidence,
  type SkillLevel,
} from '../../career';

const NOW = 1_760_000_000_000;
const TODAY = '2026-03-10';

function docWith(overrides: Partial<CareerDoc>): CareerDoc {
  return { ...createInitialCareerDoc(NOW), ...overrides };
}

function skillDraft(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Negotiation',
    description: '',
    currentLevel: 1 as SkillLevel,
    targetLevel: 3 as SkillLevel,
    confidence: 3 as Confidence,
    roleImportance: 'medium' as const,
    futureImportance: 'medium' as const,
    ...overrides,
  };
}

function milestoneDraft(goalId: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Checkpoint',
    description: '',
    status: 'not-started' as const,
    relatedSkillIds: [],
    ...overrides,
  };
}

function evidenceDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Practice session',
    description: '',
    type: 'practice' as const,
    occurredOn: '2026-03-01',
    skillIds: [],
    ...overrides,
  };
}

function assessmentDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Check',
    type: 'self' as const,
    assessedOn: '2026-03-01',
    skillIds: [],
    score: null,
    maxScore: null,
    proficiencyLevel: null,
    timeTakenMins: null,
    difficulty: 'medium' as const,
    notes: '',
    ...overrides,
  };
}

describe('goalProgress', () => {
  it('is null when a goal has no milestones', () => {
    const goal = createCareerGoal(
      {
        title: 'Direction',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: '',
        relatedSkillIds: [],
      },
      NOW,
    );
    const doc = docWith({ goals: [goal] });

    expect(goalProgress(doc, goal.id)).toEqual({
      total: 0,
      completed: 0,
      ratio: null,
    });
  });

  it('completes the ratio from milestones', () => {
    const goal = createCareerGoal(
      {
        title: 'Direction',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: '',
        relatedSkillIds: [],
      },
      NOW,
    );
    const done = createCareerMilestone(
      goal.id,
      { ...milestoneDraft(goal.id), status: 'completed' },
      NOW,
    );
    const open = createCareerMilestone(
      goal.id,
      { ...milestoneDraft(goal.id), status: 'in-progress' },
      NOW + 1,
    );
    const doc = docWith({ goals: [goal], milestones: [done, open] });

    expect(goalProgress(doc, goal.id)).toEqual({
      total: 2,
      completed: 1,
      ratio: 0.5,
    });
  });
});

describe('skillGap', () => {
  it('is target minus current when there is a gap', () => {
    const skill = createCareerSkill(skillDraft(), NOW);
    expect(skillGap(skill)).toBe(2);
  });

  it('is zero when target is met', () => {
    const skill = createCareerSkill(
      { ...skillDraft(), currentLevel: 4, targetLevel: 4 },
      NOW,
    );
    expect(skillGap(skill)).toBe(0);
  });
});

describe('lastPractisedOn', () => {
  it('returns the latest of evidence and assessment dates', () => {
    const skill = createCareerSkill(skillDraft(), NOW);
    const doc = docWith({
      skills: [skill],
      evidence: [createCareerEvidence(evidenceDraft({ skillIds: [skill.id] }), NOW)],
      assessments: [
        createCareerAssessment(
          assessmentDraft({ skillIds: [skill.id], assessedOn: '2026-03-05' }),
          NOW,
        ),
      ],
    });

    expect(lastPractisedOn(doc, skill.id)).toBe('2026-03-05');
  });

  it('falls back to assessment date when there is no evidence', () => {
    const skill = createCareerSkill(skillDraft(), NOW);
    const doc = docWith({
      skills: [skill],
      assessments: [
        createCareerAssessment(
          assessmentDraft({ skillIds: [skill.id], assessedOn: '2026-03-05' }),
          NOW,
        ),
      ],
    });

    expect(lastPractisedOn(doc, skill.id)).toBe('2026-03-05');
  });

  it('is null when nothing has been recorded', () => {
    const skill = createCareerSkill(skillDraft(), NOW);
    const doc = docWith({ skills: [skill] });

    expect(lastPractisedOn(doc, skill.id)).toBeNull();
  });
});

describe('assessmentsForGoal', () => {
  it('returns only assessments linked to the goal, newest first', () => {
    const goal = createCareerGoal(
      {
        title: 'Direction',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: '',
        relatedSkillIds: [],
      },
      NOW,
    );
    const other = createCareerGoal(
      {
        title: 'Other',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: '',
        relatedSkillIds: [],
      },
      NOW + 1,
    );
    const a1 = createCareerAssessment(
      assessmentDraft({ goalId: goal.id, assessedOn: '2026-03-01', title: 'First' }),
      NOW,
    );
    const a2 = createCareerAssessment(
      assessmentDraft({ goalId: goal.id, assessedOn: '2026-03-05', title: 'Second' }),
      NOW + 2,
    );
    const a3 = createCareerAssessment(
      assessmentDraft({ goalId: other.id, assessedOn: '2026-03-04', title: 'Other goal' }),
      NOW + 3,
    );
    const doc = docWith({
      goals: [goal, other],
      assessments: [a1, a2, a3],
    });

    const result = assessmentsForGoal(doc, goal.id);
    expect(result.map((entry) => entry.title)).toEqual(['Second', 'First']);
  });
});

describe('buildCareerOverview readiness surface', () => {
  it('does not invent a universal readiness percentage', () => {
    const skill = createCareerSkill(skillDraft(), NOW);
    const doc = docWith({ skills: [skill] });

    const model = buildCareerOverview(doc, TODAY);

    expect(model.skillGapCount).toBe(1);
    expect(model.skillCount).toBe(1);
  });
});
