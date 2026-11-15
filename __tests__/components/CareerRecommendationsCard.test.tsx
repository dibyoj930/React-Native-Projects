/**
 * The recommendation card.
 *
 * The card is where the engine's honesty becomes visible: it shows why a
 * suggestion exists, what "done" means and what evidence would be recorded. The
 * actions are intents only — accepting still opens the ordinary task sheet.
 */

import React from 'react';

import {
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  type CareerDoc,
  type CareerRecommendation,
  type CareerRecommendations,
} from '../../career';
import { CareerRecommendationsCard } from '../../components/career/CareerRecommendationsCard';
import { press, visibleText, withRendered } from '../support/render';

const NOW = new Date(2026, 2, 10, 12).getTime();
const TODAY = '2026-03-10';

function seed(): { doc: CareerDoc; recommendation: CareerRecommendation } {
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
      successCriteria: '',
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
  const recommendation: CareerRecommendation = {
    id: `career-rec:milestone:${milestone.id}:${TODAY}`,
    kind: 'milestone',
    title: 'Work on “Run the first session”',
    objective: 'Take one concrete step towards the milestone.',
    expectedMinutes: 45,
    rationale: '“Run the first session” is due 12 Mar 2026.',
    completionCriteria: 'One step is finished.',
    expectedEvidence: 'A note or artefact from the step.',
    taskText: 'Career: Run the first session',
    career: {
      goalId: goal.id,
      milestoneId: milestone.id,
      skillIds: [skill.id],
    },
    goalId: goal.id,
    milestoneId: milestone.id,
    skillId: skill.id,
    score: 50,
  };
  return { doc, recommendation };
}

const FIXTURE = seed();

function model(overrides: Partial<CareerRecommendations> = {}): CareerRecommendations {
  return {
    forDay: TODAY,
    items: [FIXTURE.recommendation],
    totalCandidates: 1,
    availableMinutes: 60,
    noTime: false,
    allDismissed: false,
    hasContext: true,
    ...overrides,
  };
}

describe('CareerRecommendationsCard', () => {
  it('shows the why, the finish line and the evidence before any action', async () => {
    await withRendered(
      <CareerRecommendationsCard
        doc={FIXTURE.doc}
        onAccept={jest.fn()}
        onDismiss={jest.fn()}
        onResume={jest.fn()}
        onSnooze={jest.fn()}
        recommendations={model()}
      />,
      (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('Today\'s development');
        expect(text).toContain('45 min');
        expect(text).toContain('Lead a small project · Run the first session · Facilitation');
        expect(text).toContain('Why this:');
        expect(text).toContain('“Run the first session” is due 12 Mar 2026.');
        expect(text).toContain('Finish when:');
        expect(text).toContain('One step is finished.');
        expect(text).toContain('Evidence:');
        expect(text).toContain('A note or artefact from the step.');
      },
    );
  });

  it('reports accept, skip and pause without changing a task itself', async () => {
    const { doc, recommendation } = FIXTURE;
    const onAccept = jest.fn();
    const onDismiss = jest.fn();
    const onSnooze = jest.fn();
    await withRendered(
      <CareerRecommendationsCard
        doc={doc}
        onAccept={onAccept}
        onDismiss={onDismiss}
        onResume={jest.fn()}
        onSnooze={onSnooze}
        recommendations={model()}
      />,
      async (renderer) => {
        await press(renderer, 'Add recommendation to plan: Work on “Run the first session”');
        expect(onAccept).toHaveBeenCalledWith(recommendation);

        await press(renderer, 'Skip recommendation: Work on “Run the first session”');
        expect(onDismiss).toHaveBeenCalledWith(recommendation.id);

        await press(renderer, 'Pause career recommendations until tomorrow');
        expect(onSnooze).toHaveBeenCalledWith('2026-03-11');
      },
    );
  });

  it('shows a pause and a way back instead of quietly recommending', async () => {
    const { doc } = FIXTURE;
    const onResume = jest.fn();
    await withRendered(
      <CareerRecommendationsCard
        doc={doc}
        onAccept={jest.fn()}
        onDismiss={jest.fn()}
        onResume={onResume}
        onSnooze={jest.fn()}
        recommendations={model({ items: [], snoozedUntil: '2026-03-11' })}
      />,
      async (renderer) => {
        expect(visibleText(renderer)).toContain('Paused until tomorrow');
        await press(renderer, 'Resume recommendations');
        expect(onResume).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('says when the day has no open time rather than shortening the work', async () => {
    const { doc } = FIXTURE;
    await withRendered(
      <CareerRecommendationsCard
        doc={doc}
        onAccept={jest.fn()}
        onDismiss={jest.fn()}
        onResume={jest.fn()}
        onSnooze={jest.fn()}
        recommendations={model({
          items: [],
          availableMinutes: 0,
          noTime: true,
        })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('No open time left today');
      },
    );
  });

  it('distinguishes "all skipped" from "nothing recorded yet"', async () => {
    const { doc } = FIXTURE;
    await withRendered(
      <CareerRecommendationsCard
        doc={doc}
        onAccept={jest.fn()}
        onDismiss={jest.fn()}
        onResume={jest.fn()}
        onSnooze={jest.fn()}
        recommendations={model({
          items: [],
          allDismissed: true,
          totalCandidates: 1,
        })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('You have reviewed today\'s suggestions');
      },
    );

    await withRendered(
      <CareerRecommendationsCard
        doc={doc}
        onAccept={jest.fn()}
        onDismiss={jest.fn()}
        onResume={jest.fn()}
        onSnooze={jest.fn()}
        recommendations={model({
          items: [],
          hasContext: false,
          totalCandidates: 0,
        })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('Nothing to recommend yet');
        expect(visibleText(renderer)).toContain('Add a goal or skill first');
      },
    );
  });
});
