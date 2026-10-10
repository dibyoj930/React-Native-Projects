/**
 * The Goals & Preferences screen.
 *
 * Presentational, like Settings: it prefills from the goals it is handed, holds
 * a local draft, and reports the two exits — a validated save and a discard via
 * cancel/back. The preview is the one thing it computes: `goalsProgress` against
 * today's rollup, following the draft while it is valid.
 */

import React from 'react';

import {
  GoalsScreen,
  type GoalsScreenProps,
} from '../../components/GoalsScreen';
import type { DailyGoals } from '../../daily-goals';
import type { DayRollup } from '../../productivity';
import { byLabel, press, typeText, visibleText, withRendered } from '../support/render';

/** A day with 30 minutes of focus and one completed task. */
const busyDay: DayRollup = {
  day: '2026-10-10',
  focusedSeconds: 1800,
  totalSessions: 1,
  completedSessions: 0,
  tasksCompleted: 1,
  isFocusCompleted: false,
};

function props(overrides: Partial<GoalsScreenProps> = {}): GoalsScreenProps {
  return {
    goals: { focusMinutes: 25, tasksCompleted: 1 },
    todayRollup: busyDay,
    onBack: () => {},
    onSave: () => {},
    ...overrides,
  };
}

const screen = (overrides: Partial<GoalsScreenProps> = {}) => (
  <GoalsScreen {...props(overrides)} />
);

describe('GoalsScreen — opens on the saved goals', () => {
  it('prefills both fields from the goals', async () => {
    await withRendered(screen(), (renderer) => {
      expect(byLabel(renderer, 'Daily task goal').props.value).toBe('1');
      expect(byLabel(renderer, 'Daily focus goal in minutes').props.value).toBe('25');
    });
  });

  it('marks the preset matching the saved focus goal as selected', async () => {
    await withRendered(
      screen({ goals: { focusMinutes: 45, tasksCompleted: 2 } }),
      (renderer) => {
        expect(byLabel(renderer, '45m focus goal').props.accessibilityState).toEqual({
          selected: true,
        });
        expect(byLabel(renderer, '25m focus goal').props.accessibilityState).toEqual({
          selected: false,
        });
      },
    );
  });
});

describe('GoalsScreen — preview', () => {
  it('shows today against the saved goals', async () => {
    await withRendered(screen(), (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('30m / 25m');
      expect(text).toContain('1 / 1');
    });
  });

  it('follows the draft while both fields are valid', async () => {
    await withRendered(screen(), async (renderer) => {
      await typeText(renderer, 'Daily task goal', '3');
      expect(visibleText(renderer)).toContain('1 / 3');
    });
  });
});

describe('GoalsScreen — saving', () => {
  it('saves the values the user typed', async () => {
    const onSave = jest.fn<void, [DailyGoals]>();
    await withRendered(screen({ onSave }), async (renderer) => {
      await typeText(renderer, 'Daily task goal', '3');
      await typeText(renderer, 'Daily focus goal in minutes', '90');
      await press(renderer, 'Save daily goals');
    });
    expect(onSave).toHaveBeenCalledWith({ tasksCompleted: 3, focusMinutes: 90 });
  });

  it('lets a preset chip set the focus goal', async () => {
    const onSave = jest.fn<void, [DailyGoals]>();
    await withRendered(screen({ onSave }), async (renderer) => {
      await press(renderer, '1h 30m focus goal');
      await press(renderer, 'Save daily goals');
    });
    expect(onSave).toHaveBeenCalledWith({ tasksCompleted: 1, focusMinutes: 90 });
  });
});

describe('GoalsScreen — leaving without saving', () => {
  it('discards on Cancel without calling save', async () => {
    const onBack = jest.fn();
    const onSave = jest.fn();
    await withRendered(screen({ onBack, onSave }), async (renderer) => {
      await press(renderer, 'Cancel daily goals');
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reports the header back control', async () => {
    const onBack = jest.fn();
    await withRendered(screen({ onBack }), async (renderer) => {
      await press(renderer, 'Back to today');
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});

describe('GoalsScreen — validation', () => {
  it('disables Save and keeps the value out when the task goal is zero', async () => {
    const onSave = jest.fn();
    await withRendered(screen({ onSave }), async (renderer) => {
      await typeText(renderer, 'Daily task goal', '0');
      expect(byLabel(renderer, 'Save daily goals').props.accessibilityState).toEqual({
        disabled: true,
      });
      expect(visibleText(renderer)).toContain('Enter a whole number from 1 to 99.');
      await press(renderer, 'Save daily goals');
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a fractional or out-of-range focus goal', async () => {
    const onSave = jest.fn<void, [DailyGoals]>();
    await withRendered(screen({ onSave }), async (renderer) => {
      await typeText(renderer, 'Daily focus goal in minutes', '2.5');
      expect(byLabel(renderer, 'Save daily goals').props.accessibilityState).toEqual({
        disabled: true,
      });

      await typeText(renderer, 'Daily focus goal in minutes', '9999');
      expect(byLabel(renderer, 'Save daily goals').props.accessibilityState).toEqual({
        disabled: true,
      });

      await press(renderer, 'Save daily goals');
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('re-enables Save once both fields are valid again', async () => {
    await withRendered(screen(), async (renderer) => {
      await typeText(renderer, 'Daily task goal', '0');
      expect(byLabel(renderer, 'Save daily goals').props.accessibilityState).toEqual({
        disabled: true,
      });
      await typeText(renderer, 'Daily task goal', '4');
      expect(byLabel(renderer, 'Save daily goals').props.accessibilityState).toEqual({
        disabled: false,
      });
    });
  });
});