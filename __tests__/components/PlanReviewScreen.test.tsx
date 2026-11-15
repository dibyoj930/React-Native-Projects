/**
 * The Plan Review screen.
 *
 * Presentational: it renders a window of days and the calibration suggestions,
 * and reports two intents — leave, and apply an adjustment. These pin the copy
 * that keeps gaps honest ("unavailable", "No plan recorded") and that the Apply
 * button carries the right task id.
 */

import React from 'react';

import {
  PlanReviewScreen,
  type PlanReviewScreenProps,
} from '../../components/PlanReviewScreen';
import type { PlanReviewDay } from '../../hooks/usePlanReview';
import type { PlanOutcome } from '../../replan/types';
import type { CalibrationResult } from '../../reflections';
import type { CareerPlanReview } from '../../career';
import { byLabel, press, visibleText, withRendered } from '../support/render';

const DAY = '2026-05-04';

function outcome(overrides: Partial<PlanOutcome> = {}): PlanOutcome {
  return {
    dayKey: DAY,
    planApprovedAt: 1,
    generatedAt: 1,
    planSignature: 'sig',
    results: [
      {
        taskId: 't1',
        taskText: 'Write the report',
        plannedStart: 0,
        plannedEnd: 1_800_000,
        wasScheduled: true,
        completed: true,
        completedAt: 1_500_000,
        actualFocusSeconds: 1200,
        status: 'completed-on-time',
      },
    ],
    summary: {
      totalPlanned: 1,
      completed: 1,
      completedOnTime: 1,
      completedLate: 0,
      postponed: 0,
      missed: 0,
      totalPlannedFocusMins: 30,
      totalActualFocusMins: 20,
    },
    ...overrides,
  };
}

function day(overrides: Partial<PlanReviewDay> = {}): PlanReviewDay {
  return {
    dayKey: DAY,
    isToday: false,
    outcome: outcome(),
    focusAvailable: true,
    ...overrides,
  };
}

const calibration: CalibrationResult = {
  planningFactor: 2,
  sampleCount: 3,
  adjustments: [
    {
      taskId: 't1',
      currentMinutes: 10,
      suggestedMinutes: 20,
      ratio: 2,
      basis: 'task',
    },
  ],
};

function careerReview(
  overrides: Partial<CareerPlanReview> = {},
): CareerPlanReview {
  return {
    days: [],
    planned: 2,
    completed: 1,
    postponed: 1,
    missed: 0,
    plannedFocusMins: 45,
    actualFocusMins: 25,
    hasActivity: true,
    goalIds: ['goal-1'],
    postponedGoalIds: ['goal-1'],
    missedGoalIds: [],
    milestoneCompleted: 1,
    milestoneTotal: 2,
    ...overrides,
  };
}

function props(overrides: Partial<PlanReviewScreenProps> = {}): PlanReviewScreenProps {
  return {
    days: [day()],
    aggregate: {
      daysWithData: 1,
      plannedOccurrences: 1,
      distinctPlannedTasks: 1,
      completedOccurrences: 1,
      distinctCompletedTasks: 1,
      postponedOccurrences: 0,
      distinctPostponedTasks: 0,
      missedOccurrences: 0,
      distinctMissedTasks: 0,
      plannedFocusMins: 30,
      actualFocusMins: 20,
    },
    calibration,
    taskTextFor: (id) => (id === 't1' ? 'Write the report' : undefined),
    onApplyAdjustment: () => {},
    onBack: () => {},
    ...overrides,
  };
}

describe('PlanReviewScreen — the window', () => {
  it('summarises the week', async () => {
    await withRendered(<PlanReviewScreen {...props()} />, (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('Planned focus 30 min');
      expect(text).toContain('Focused 20 min');
      expect(text).toContain('1 of 1 days recorded');
    });
  });

  it('shows a plan-less day honestly', async () => {
    await withRendered(
      <PlanReviewScreen {...props({ days: [day({ outcome: null })] })} />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('No plan recorded for this day.');
      },
    );
  });

  it('does not print zero focus when the log cannot speak for the day', async () => {
    await withRendered(
      <PlanReviewScreen
        {...props({ days: [day({ focusAvailable: false })] })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('Focus: unavailable');
      },
    );
  });

  it('empties the overview when nothing was recorded', async () => {
    await withRendered(
      <PlanReviewScreen
        {...props({
          days: [day({ outcome: null })],
          aggregate: {
            daysWithData: 0,
            plannedOccurrences: 0,
            distinctPlannedTasks: 0,
            completedOccurrences: 0,
            distinctCompletedTasks: 0,
            postponedOccurrences: 0,
            distinctPostponedTasks: 0,
            missedOccurrences: 0,
            distinctMissedTasks: 0,
            plannedFocusMins: 0,
            actualFocusMins: 0,
          },
        })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('No plans recorded in the last 7 days');
      },
    );
  });
});

describe('PlanReviewScreen — career activity', () => {
  it('shows career plan, focus and milestone progress', async () => {
    await withRendered(
      <PlanReviewScreen {...props({ careerReview: careerReview() })} />,
      (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('Career activity');
        expect(text).toContain('Career focus planned 45 min · recorded 25 min');
        expect(text).toContain('1 of 2 complete');
      },
    );
  });

  it('does not imply career activity when no row carried a link', async () => {
    await withRendered(
      <PlanReviewScreen
        {...props({ careerReview: careerReview({ hasActivity: false, planned: 0, completed: 0, postponed: 0, plannedFocusMins: 0, actualFocusMins: 0, milestoneTotal: 0, milestoneCompleted: 0 }) })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain(
          'No career-linked plan activity in this window.',
        );
      },
    );
  });
});

describe('PlanReviewScreen — calibration', () => {
  it('states the window factor and offers the adjustment', async () => {
    await withRendered(<PlanReviewScreen {...props()} />, (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('200%');
      expect(text).toContain('10 min → 20 min');
      expect(visibleText(renderer)).toContain('from this task');
    });
  });

  it('reports the adjustment to apply', async () => {
    const onApplyAdjustment = jest.fn();
    await withRendered(
      <PlanReviewScreen {...props({ onApplyAdjustment })} />,
      async (renderer) => {
        await press(renderer, 'Apply 20 minute estimate');
        expect(onApplyAdjustment).toHaveBeenCalledWith('t1');
      },
    );
  });

  it('explains itself when there is nothing to suggest', async () => {
    await withRendered(
      <PlanReviewScreen
        {...props({ calibration: { planningFactor: null, sampleCount: 0, adjustments: [] } })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('Not enough finished work yet');
      },
    );
  });
});

describe('PlanReviewScreen — exits', () => {
  it('reports back', async () => {
    const onBack = jest.fn();
    await withRendered(<PlanReviewScreen {...props({ onBack })} />, async (renderer) => {
      await press(renderer, 'Back to today');
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  it('applies the adjustment under its own label', async () => {
    await withRendered(<PlanReviewScreen {...props()} />, (renderer) => {
      expect(byLabel(renderer, 'Apply 20 minute estimate')).toBeTruthy();
    });
  });
});
