import {
  careerReducer,
  createCareerAssessment,
  createCareerGoal,
  createInitialCareerDoc,
  sanitizeCareerDoc,
  type CareerDoc,
  type CareerState,
} from '../../career';

const NOW = 1_760_000_000_000;

function docWith(overrides: Partial<CareerDoc>): CareerDoc {
  return { ...createInitialCareerDoc(NOW), ...overrides };
}

function state(doc: CareerDoc): CareerState {
  return { doc, hydrated: true };
}

describe('assessments via reducer', () => {
  it('creates an assessment through saveAssessment', () => {
    const goal = createCareerGoal(
      {
        title: 'Learn the trade',
        description: '',
        goalType: 'skill',
        priority: 'medium',
        status: 'active',
        successCriteria: 'Done.',
        relatedSkillIds: [],
      },
      NOW,
    );
    const doc = docWith({ goals: [goal] });

    const next = careerReducer(state(doc), {
      type: 'upsertAssessment',
      assessment: createCareerAssessment(
        {
          title: 'Handover check',
          type: 'practical',
          assessedOn: '2026-03-03',
          skillIds: [],
          goalId: goal.id,
          score: 4,
          maxScore: 5,
          proficiencyLevel: 3,
          timeTakenMins: 15,
          difficulty: 'medium',
          notes: '',
        },
        NOW,
      ),
    });

    expect(next.doc.assessments).toHaveLength(1);
    expect(next.doc.assessments[0].title).toBe('Handover check');
    expect(next.doc.assessments[0].goalId).toBe(goal.id);
    expect(next.doc.assessments[0].score).toBe(4);
  });

  it('updates an existing assessment by id', () => {
    const existing = createCareerAssessment(
      {
        title: 'Original',
        type: 'self',
        assessedOn: '2026-03-01',
        skillIds: [],
        score: null,
        maxScore: null,
        proficiencyLevel: null,
        timeTakenMins: null,
        difficulty: 'medium',
        notes: '',
      },
      NOW,
    );
    const doc = docWith({ assessments: [existing] });

    const next = careerReducer(state(doc), {
      type: 'upsertAssessment',
      assessment: { ...existing, score: 7, maxScore: 10, notes: 'improved' },
    });

    expect(next.doc.assessments).toHaveLength(1);
    expect(next.doc.assessments[0].score).toBe(7);
    expect(next.doc.assessments[0].notes).toBe('improved');
    expect(next.doc.assessments[0].updatedAt).toBe(NOW);
  });

  it('deletes an assessment', () => {
    const a = createCareerAssessment(
      {
        title: 'A',
        type: 'self',
        assessedOn: '2026-03-01',
        skillIds: [],
        score: null,
        maxScore: null,
        proficiencyLevel: null,
        timeTakenMins: null,
        difficulty: 'medium',
        notes: '',
      },
      NOW,
    );
    const b = createCareerAssessment(
      {
        title: 'B',
        type: 'self',
        assessedOn: '2026-03-02',
        skillIds: [],
        score: null,
        maxScore: null,
        proficiencyLevel: null,
        timeTakenMins: null,
        difficulty: 'medium',
        notes: '',
      },
      NOW + 1,
    );
    const doc = docWith({ assessments: [a, b] });

    const next = careerReducer(state(doc), { type: 'deleteAssessment', id: a.id });

    expect(next.doc.assessments.map((entry) => entry.id)).toEqual([b.id]);
  });

  it('deleteAssessment is a no-op for an unknown id', () => {
    const doc = docWith({ assessments: [] });
    const next = careerReducer(state(doc), { type: 'deleteAssessment', id: 'missing' });
    expect(next.doc.assessments).toEqual([]);
  });
});

describe('sanitizeCareerDoc assessments', () => {
  it('keeps a well-formed assessment', () => {
    const doc = sanitizeCareerDoc(
      {
        version: 2,
        profile: null,
        domains: [],
        goals: [],
        skills: [],
        milestones: [],
        evidence: [],
        achievements: [],
        assessments: [
          {
            id: 'as1',
            title: 'Practical check',
            type: 'practical',
            assessedOn: '2026-03-03',
            skillIds: [],
            score: 4,
            maxScore: 5,
            proficiencyLevel: 3,
            timeTakenMins: 15,
            difficulty: 'medium',
            notes: 'Good.',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        reviews: [],
        recommendations: { dismissedIds: [] },
      },
      NOW,
    );

    expect(doc.assessments).toHaveLength(1);
    expect(doc.assessments[0].score).toBe(4);
  });

  it('drops an assessment without a title', () => {
    const doc = sanitizeCareerDoc(
      {
        version: 2,
        profile: null,
        domains: [],
        goals: [],
        skills: [],
        milestones: [],
        evidence: [],
        achievements: [],
        assessments: [
          {
            id: 'as1',
            title: '',
            type: 'self',
            assessedOn: '2026-03-03',
            skillIds: [],
            score: null,
            maxScore: null,
            proficiencyLevel: null,
            timeTakenMins: null,
            difficulty: 'medium',
            notes: '',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        reviews: [],
        recommendations: { dismissedIds: [] },
      },
      NOW,
    );

    expect(doc.assessments).toEqual([]);
  });

  it('drops an assessment without a valid assessedOn', () => {
    const doc = sanitizeCareerDoc(
      {
        version: 2,
        profile: null,
        domains: [],
        goals: [],
        skills: [],
        milestones: [],
        evidence: [],
        achievements: [],
        assessments: [
          {
            id: 'as1',
            title: 'Practical check',
            type: 'self',
            assessedOn: 'not-a-date',
            skillIds: [],
            score: null,
            maxScore: null,
            proficiencyLevel: null,
            timeTakenMins: null,
            difficulty: 'medium',
            notes: '',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        reviews: [],
        recommendations: { dismissedIds: [] },
      },
      NOW,
    );

    expect(doc.assessments).toEqual([]);
  });

  it('drops an impossible score and max score pairing', () => {
    const doc = sanitizeCareerDoc(
      {
        version: 2,
        profile: null,
        domains: [],
        goals: [],
        skills: [],
        milestones: [],
        evidence: [],
        achievements: [],
        assessments: [
          {
            id: 'as1',
            title: 'Practical check',
            type: 'self',
            assessedOn: '2026-03-03',
            skillIds: [],
            score: 10,
            maxScore: 5,
            proficiencyLevel: null,
            timeTakenMins: null,
            difficulty: 'medium',
            notes: '',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        reviews: [],
        recommendations: { dismissedIds: [] },
      },
      NOW,
    );

    expect(doc.assessments).toHaveLength(1);
    expect(doc.assessments[0].score).toBeNull();
  });

  it('clamps proficiency to 0-5', () => {
    const doc = sanitizeCareerDoc(
      {
        version: 2,
        profile: null,
        domains: [],
        goals: [],
        skills: [],
        milestones: [],
        evidence: [],
        achievements: [],
        assessments: [
          {
            id: 'as1',
            title: 'Practical check',
            type: 'self',
            assessedOn: '2026-03-03',
            skillIds: [],
            score: null,
            maxScore: null,
            proficiencyLevel: 9,
            timeTakenMins: null,
            difficulty: 'medium',
            notes: '',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        reviews: [],
        recommendations: { dismissedIds: [] },
      },
      NOW,
    );

    expect(doc.assessments[0].proficiencyLevel).toBeNull();
  });
});
