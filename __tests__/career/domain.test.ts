/**
 * The career domain, without React or storage.
 *
 * These tests pin the promises the rest of the module is allowed to assume:
 * malformed records degrade field by field, archiving keeps history, hard
 * deletes unlink rather than erase, and progress only appears where a real
 * denominator exists.
 */

import {
  buildCareerHomeSummary,
  buildCareerOverview,
  buildCareerSuggestions,
  careerReducer,
  createCareerAchievement,
  createCareerAssessment,
  createCareerEvidence,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createDevelopmentDomain,
  createInitialCareerDoc,
  goalProgress,
  goalTimeline,
  lastPractisedOn,
  sanitizeCareerDoc,
  skillGap,
  skillProgressRows,
  upcomingMilestones,
  overdueMilestones,
  type CareerDoc,
  type CareerState,
} from '../../career';

const NOW = 1_760_000_000_000;
const TODAY = '2026-03-10';

function goalDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A direction',
    description: '',
    goalType: 'skill' as const,
    priority: 'medium' as const,
    status: 'active' as const,
    successCriteria: 'I can describe what changed.',
    relatedSkillIds: [],
    ...overrides,
  };
}

function docWith(overrides: Partial<CareerDoc>): CareerDoc {
  return { ...createInitialCareerDoc(NOW), ...overrides };
}

function state(doc: CareerDoc): CareerState {
  return { doc, hydrated: true };
}

describe('sanitizeCareerDoc', () => {
  it('turns a missing document into the usable seeded document', () => {
    expect(sanitizeCareerDoc(null, NOW)).toEqual(createInitialCareerDoc(NOW));
  });

  it('repairs bad fields without discarding a meaningful record', () => {
    const doc = sanitizeCareerDoc(
      {
        profile: { currentRole: 42, experienceYears: -8, strengths: 'calm' },
        goals: [
          {
            id: 'g1',
            title: '  Learn a trade  ',
            status: 'not-a-status',
            category: 'not-a-category',
            priority: 'urgent',
            targetDate: '30/02/2026',
            relatedSkillIds: ['s1', 's1', 7],
          },
        ],
      },
      NOW,
    );

    expect(doc.version).toBe(2);
    expect(doc.profile?.designation).toBe('');
    expect(doc.profile?.experienceYears).toBeNull();
    expect(doc.profile?.strengths).toBe('calm');
    expect(doc.goals).toHaveLength(1);
    expect(doc.goals[0]).toMatchObject({
      id: 'g1',
      title: 'Learn a trade',
      status: 'active',
      goalType: 'custom',
      priority: 'medium',
      relatedSkillIds: ['s1'],
    });
    expect(doc.goals[0].targetDate).toBeUndefined();
  });

  it('drops records that cannot be meaningful and keeps the rest', () => {
    const doc = sanitizeCareerDoc(
      {
        goals: [null, { id: 'g1', title: '   ' }, { id: 'g2', title: 'Real goal' }],
        skills: [{ id: 's1' }, { id: 's2', name: 'Real skill' }],
        milestones: [
          { id: 'm1', title: 'No goal' },
          { id: 'm2', goalId: 'g2', title: 'Real milestone' },
        ],
        evidence: [
          { id: 'e1', title: 'No date' },
          { id: 'e2', title: 'Real evidence', occurredOn: TODAY },
        ],
        achievements: [
          { id: 'a1', title: 'No date' },
          { id: 'a2', title: 'Real achievement', date: TODAY },
        ],
        assessments: [
          { id: 'as1', title: 'No date' },
          { id: 'as2', title: 'Real assessment', assessedOn: TODAY },
        ],
      },
      NOW,
    );

    expect(doc.goals.map((goal) => goal.id)).toEqual(['g2']);
    expect(doc.skills.map((skill) => skill.id)).toEqual(['s2']);
    expect(doc.milestones.map((milestone) => milestone.id)).toEqual(['m2']);
    expect(doc.evidence.map((entry) => entry.id)).toEqual(['e2']);
    expect(doc.achievements.map((entry) => entry.id)).toEqual(['a2']);
    expect(doc.assessments.map((entry) => entry.id)).toEqual(['as2']);
  });

  it('keeps a stored empty domain list instead of reseeding it', () => {
    expect(sanitizeCareerDoc({ domains: [] }, NOW).domains).toEqual([]);
  });

  it('deduplicates records and relationship ids', () => {
    const doc = sanitizeCareerDoc(
      {
        goals: [
          { id: 'g1', title: 'First' },
          { id: 'g1', title: 'Duplicate' },
        ],
        evidence: [
          {
            id: 'e1',
            title: 'Evidence',
            occurredOn: TODAY,
            skillIds: ['s1', 's1', 's2'],
          },
        ],
      },
      NOW,
    );

    expect(doc.goals).toHaveLength(1);
    expect(doc.goals[0].title).toBe('First');
    expect(doc.evidence[0].skillIds).toEqual(['s1', 's2']);
  });

  it('never turns an impossible assessment result into a plausible one', () => {
    const doc = sanitizeCareerDoc(
      {
        assessments: [
          {
            id: 'as1',
            title: 'Too high',
            assessedOn: TODAY,
            score: 30,
            maxScore: 20,
            proficiencyLevel: 9,
            timeTakenMins: 0,
          },
        ],
      },
      NOW,
    );

    expect(doc.assessments[0]).toMatchObject({
      score: null,
      maxScore: 20,
      proficiencyLevel: null,
      timeTakenMins: null,
    });
  });
});

describe('careerReducer — history survives goal changes', () => {
  const goal = createCareerGoal(goalDraft({ title: 'Learn the trade' }), NOW);
  const otherGoal = createCareerGoal(
    goalDraft({ title: 'A different direction', priority: 'low' }),
    NOW + 1,
  );
  const skill = createCareerSkill(
    {
      name: 'Handover',
      description: '',
      currentLevel: 1,
      targetLevel: 4,
      confidence: 3,
      roleImportance: 'high',
      futureImportance: 'high',
    },
    NOW,
  );
  const milestone = createCareerMilestone(
    goal.id,
    {
      title: 'First checkpoint',
      description: '',
      status: 'in-progress',
      relatedSkillIds: [skill.id],
    },
    NOW,
  );
  const evidence = createCareerEvidence(
    {
      title: 'Observed handover',
      description: '',
      type: 'practice',
      occurredOn: '2026-03-01',
      skillIds: [skill.id, skill.id],
      goalId: goal.id,
      milestoneId: milestone.id,
    },
    NOW,
  );
  const achievement = createCareerAchievement(
    {
      title: 'Handover improved',
      description: '',
      category: 'impact',
      date: '2026-03-02',
      impact: '',
      metrics: '',
      demonstratedSkillIds: [skill.id],
      evidenceIds: [evidence.id],
      goalId: goal.id,
    },
    NOW,
  );
  const assessment = createCareerAssessment(
    {
      title: 'Handover check',
      type: 'practical',
      assessedOn: '2026-03-03',
      skillIds: [skill.id],
      goalId: goal.id,
      score: 4,
      maxScore: 5,
      proficiencyLevel: 3,
      timeTakenMins: 15,
      difficulty: 'medium',
      notes: '',
    },
    NOW,
  );

  const doc = docWith({
    goals: [goal, otherGoal],
    skills: [skill],
    milestones: [milestone],
    evidence: [evidence],
    achievements: [achievement],
    assessments: [assessment],
  });

  it('archives a goal without touching its milestones or evidence', () => {
    const next = careerReducer(state(doc), {
      type: 'deleteGoal',
      id: goal.id,
      mode: 'archive',
      at: NOW + 10,
    });

    expect(next.doc.goals.find((entry) => entry.id === goal.id)?.status).toBe('archived');
    expect(next.doc.milestones).toEqual([milestone]);
    expect(next.doc.evidence).toEqual([evidence]);
    expect(next.doc.achievements).toEqual([achievement]);
    expect(next.doc.assessments).toEqual([assessment]);
  });

  it('hard-deletes a goal and its milestones but keeps evidence and achievements', () => {
    const next = careerReducer(state(doc), {
      type: 'deleteGoal',
      id: goal.id,
      mode: 'delete',
      at: NOW + 10,
    });

    expect(next.doc.goals.map((entry) => entry.id)).toEqual([otherGoal.id]);
    expect(next.doc.milestones).toEqual([]);
    expect(next.doc.evidence[0]).toMatchObject({
      title: 'Observed handover',
      goalId: undefined,
      milestoneId: undefined,
      goalTitleSnapshot: 'Learn the trade',
    });
    expect(next.doc.achievements[0]).toMatchObject({
      title: 'Handover improved',
      goalId: undefined,
      goalTitleSnapshot: 'Learn the trade',
    });
    expect(next.doc.assessments[0]).toMatchObject({
      title: 'Handover check',
      goalId: undefined,
      goalTitleSnapshot: 'Learn the trade',
    });
  });

  it('removes a deleted skill from references without deleting the records', () => {
    const next = careerReducer(state(doc), { type: 'deleteSkill', id: skill.id });

    expect(next.doc.skills).toEqual([]);
    expect(next.doc.goals[0].relatedSkillIds).toEqual([]);
    expect(next.doc.milestones[0].relatedSkillIds).toEqual([]);
    expect(next.doc.evidence).toHaveLength(1);
    expect(next.doc.evidence[0].skillIds).toEqual([]);
    expect(next.doc.achievements).toHaveLength(1);
    expect(next.doc.achievements[0].demonstratedSkillIds).toEqual([]);
    expect(next.doc.assessments).toHaveLength(1);
    expect(next.doc.assessments[0].skillIds).toEqual([]);
  });

  it('unlinks evidence when its milestone is deleted', () => {
    const next = careerReducer(state(doc), { type: 'deleteMilestone', id: milestone.id });

    expect(next.doc.milestones).toEqual([]);
    expect(next.doc.evidence[0].milestoneId).toBeUndefined();
    expect(next.doc.evidence[0].goalId).toBe(goal.id);
  });

  it('unlinks goals and skills when a development area is removed', () => {
    const domain = createDevelopmentDomain(
      {
        id: 'domain_custom',
        name: 'Custom area',
        description: '',
        isCustom: true,
        isEnabled: true,
        order: 0,
      },
      NOW,
    );
    const next = careerReducer(
      state({
        ...doc,
        domains: [domain],
        goals: [{ ...goal, domainId: domain.id }],
        skills: [{ ...skill, domainId: domain.id }],
      }),
      { type: 'removeDomain', id: domain.id },
    );

    expect(next.doc.domains).toEqual([]);
    expect(next.doc.goals[0].domainId).toBeUndefined();
    expect(next.doc.skills[0].domainId).toBeUndefined();
    expect(next.doc.goals).toHaveLength(1);
    expect(next.doc.skills).toHaveLength(1);
  });

  it('removes a deleted evidence id from achievements but keeps the achievement', () => {
    const next = careerReducer(state(doc), { type: 'deleteEvidence', id: evidence.id });

    expect(next.doc.evidence).toEqual([]);
    expect(next.doc.achievements).toHaveLength(1);
    expect(next.doc.achievements[0].evidenceIds).toEqual([]);
  });
});

describe('progress and derived views', () => {
  const goal = createCareerGoal(goalDraft({ title: 'Goal', targetDate: '2026-03-20' }), NOW);
  const skill = createCareerSkill(
    {
      name: 'Skill',
      description: '',
      currentLevel: 2,
      targetLevel: 5,
      confidence: 2,
      roleImportance: 'high',
      futureImportance: 'high',
    },
    NOW,
  );
  const completed = createCareerMilestone(
    goal.id,
    {
      title: 'Done',
      description: '',
      status: 'completed',
      targetDate: '2026-03-01',
      relatedSkillIds: [skill.id],
    },
    NOW,
  );
  const future = createCareerMilestone(
    goal.id,
    {
      title: 'Ahead',
      description: '',
      status: 'not-started',
      targetDate: '2026-03-20',
      relatedSkillIds: [],
    },
    NOW,
  );
  const archived = createCareerMilestone(
    goal.id,
    {
      title: 'Ignored',
      description: '',
      status: 'archived',
      relatedSkillIds: [],
    },
    NOW,
  );

  const doc = docWith({
    goals: [{ ...goal, relatedSkillIds: [skill.id] }],
    skills: [skill],
    milestones: [completed, future, archived],
    evidence: [
      createCareerEvidence(
        {
          title: 'Practice',
          description: '',
          type: 'practice',
          occurredOn: '2026-03-05',
          skillIds: [skill.id],
          goalId: goal.id,
        },
        NOW,
      ),
    ],
    assessments: [
      createCareerAssessment(
        {
          title: 'Assessment',
          type: 'self',
          assessedOn: '2026-03-07',
          skillIds: [skill.id],
          goalId: goal.id,
          score: null,
          maxScore: null,
          proficiencyLevel: 3,
          timeTakenMins: null,
          difficulty: 'medium',
          notes: '',
        },
        NOW,
      ),
    ],
    achievements: [
      createCareerAchievement(
        {
          title: 'A claim',
          description: '',
          category: 'impact',
          date: '2026-03-09',
          impact: '',
          metrics: '',
          demonstratedSkillIds: [skill.id],
          evidenceIds: [],
          goalId: goal.id,
        },
        NOW,
      ),
    ],
  });

  it('has no milestone ratio when no milestones exist', () => {
    const empty = createCareerGoal(goalDraft({ title: 'Empty' }), NOW);
    expect(goalProgress(docWith({ goals: [empty] }), empty.id)).toEqual({
      total: 0,
      completed: 0,
      ratio: null,
    });
  });

  it('ignores archived milestones in a goal ratio', () => {
    expect(goalProgress(doc, goal.id)).toEqual({ total: 2, completed: 1, ratio: 0.5 });
  });

  it('derives the latest practice date from evidence and assessments, not achievements', () => {
    expect(lastPractisedOn(doc, skill.id)).toBe('2026-03-07');

    const evidenceOnly = docWith({
      ...doc,
      assessments: [],
      achievements: doc.achievements.map((entry) => ({
        ...entry,
        date: '2026-04-01',
      })),
    });
    expect(lastPractisedOn(evidenceOnly, skill.id)).toBe('2026-03-05');
  });

  it('sorts skills by gap, then importance, and reports their support', () => {
    const rows = skillProgressRows(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gap: 3,
      evidenceCount: 1,
      assessmentCount: 1,
      demonstrationCount: 1,
      relatedGoalCount: 1,
      lastPractisedOn: '2026-03-07',
    });
    expect(skillGap(skill)).toBe(3);
  });

  it('ranks future importance ahead of current-role importance', () => {
    const futureSkill = createCareerSkill(
      {
        name: 'Future skill',
        description: '',
        currentLevel: 1,
        targetLevel: 3,
        confidence: 2,
        roleImportance: 'low',
        futureImportance: 'high',
      },
      NOW,
    );
    const roleSkill = createCareerSkill(
      {
        name: 'Role skill',
        description: '',
        currentLevel: 1,
        targetLevel: 3,
        confidence: 2,
        roleImportance: 'high',
        futureImportance: 'low',
      },
      NOW,
    );

    const rows = skillProgressRows(docWith({ skills: [roleSkill, futureSkill] }));
    expect(rows.map((row) => row.skill.id)).toEqual([futureSkill.id, roleSkill.id]);
  });

  it('separates upcoming from overdue milestones and only shows open ones', () => {
    expect(upcomingMilestones(doc, TODAY).map((entry) => entry.milestone.id)).toEqual([
      future.id,
    ]);
    expect(overdueMilestones(doc, TODAY)).toEqual([]);

    const overdueDoc = docWith({
      ...doc,
      milestones: [{ ...future, targetDate: '2026-03-01' }],
    });
    expect(overdueMilestones(overdueDoc, TODAY).map((entry) => entry.milestone.id)).toEqual([
      future.id,
    ]);
  });

  it('builds a deterministic history newest first', () => {
    const events = goalTimeline(doc, goal.id);
    expect(events.map((event) => event.kind)).toEqual([
      'achievement',
      'assessment',
      'evidence',
      'goal-created',
      'milestone-completed',
    ]);
    expect(events[0].date).toBe('2026-03-09');
  });

  it('offers the same ordered suggestions for the same document', () => {
    const once = buildCareerSuggestions(doc, TODAY);
    const twice = buildCareerSuggestions(doc, TODAY);
    expect(once).toEqual(twice);
    expect(once.length).toBeLessThanOrEqual(3);
  });

  it('summarises the home entry without inventing progress', () => {
    const summary = buildCareerHomeSummary(docWith({}), TODAY);
    expect(summary).toMatchObject({
      hasProfile: false,
      activeGoalCount: 0,
      skillCount: 0,
      nextMilestone: null,
      suggestion: 'Set up your career profile',
    });

    const overview = buildCareerOverview(doc, TODAY);
    expect(overview).toMatchObject({
      activeGoalCount: 1,
      skillCount: 1,
      skillGapCount: 1,
      evidenceCount: 1,
      achievementCount: 1,
      milestoneTotal: 2,
      milestoneCompleted: 1,
    });
  });
});
