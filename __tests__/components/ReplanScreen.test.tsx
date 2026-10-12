/**
 * The Replan screen.
 *
 * Presentational, like GoalsScreen/SettingsScreen: it renders the proposal and
 * preferences it is handed and reports intent. What is worth pinning down is the
 * contract with the controller — the buttons that build, rebuild and apply, the
 * Edit escape hatch for tasks that cannot be placed, and the preference chips
 * reporting whole-objects back through `onSetPreferences`.
 *
 * Times are built from the local clock (`new Date(...).setHours`) rather than
 * written as epochs, so the expected labels do not depend on the suite's timezone.
 */

import React from 'react';

import { ReplanScreen, type ReplanScreenProps } from '../../components/ReplanScreen';
import type { ReplanPreferences, ReplanProposal, ReplanTask } from '../../replan';
import { byLabel, press, visibleText, withRendered } from '../support/render';

/** Today at `hours:minutes` local, as epoch ms. */
function at(hours: number, minutes = 0): number {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

const PREFS: ReplanPreferences = {
  workdayStart: '09:00',
  workdayEnd: '18:00',
  bufferMinutes: 10,
  breakMinutes: 15,
  breakAfterMinutes: 60,
  mode: 'fit',
  lowPriorityDeferral: false,
  notifyPlannedStarts: false,
};

const TASKS: Record<string, ReplanTask> = {
  t1: { id: 't1', text: 'Project report', completed: false, hasActiveTimer: false },
  t2: { id: 't2', text: 'Review PRs', completed: false, hasActiveTimer: false },
  t3: { id: 't3', text: 'Deep clean', completed: false, hasActiveTimer: false },
  t4: { id: 't4', text: 'Write spec', completed: false, hasActiveTimer: false },
};

const PROPOSAL: ReplanProposal = {
  generatedAt: at(14, 0),
  signature: 'sig-1',
  mode: 'fit',
  placements: [
    { taskId: 't1', start: at(14, 0), end: at(14, 45), kind: 'task' },
    { taskId: 'break', start: at(15, 35), end: at(15, 50), kind: 'break' },
  ],
  outcomes: [
    { taskId: 't1', classification: 'scheduled', reasonCode: 'scheduled', start: at(14, 0), end: at(14, 45) },
    { taskId: 't2', classification: 'deferred', reasonCode: 'deferred_no_time' },
    { taskId: 't3', classification: 'infeasible', reasonCode: 'infeasible_no_free_time' },
    { taskId: 't4', classification: 'needsInformation', reasonCode: 'needs_duration' },
  ],
  explanations: [],
  unchangedTaskIds: [],
  validation: { ok: true, violations: [] },
};

function props(overrides: Partial<ReplanScreenProps> = {}): ReplanScreenProps {
  return {
    proposal: PROPOSAL,
    preferences: PREFS,
    tasksById: TASKS,
    commitments: [{ id: 'c1', label: 'Standup', start: at(16, 0), end: at(16, 30) }],
    stale: false,
    onGenerate: () => {},
    onApply: () => {},
    onCancel: () => {},
    onSetPreferences: () => {},
    onEditTask: () => {},
    onBack: () => {},
    ...overrides,
  };
}

const screen = (overrides: Partial<ReplanScreenProps> = {}) => (
  <ReplanScreen {...props(overrides)} />
);

describe('ReplanScreen — before a plan exists', () => {
  it('offers to build a plan and reports the tap', async () => {
    const onGenerate = jest.fn();
    await withRendered(screen({ proposal: null, onGenerate }), async (renderer) => {
      expect(visibleText(renderer)).toContain('Build a plan');
      await press(renderer, 'Build a plan');
    });
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('holds the build button while a build is in flight', async () => {
    await withRendered(screen({ proposal: null, busy: true }), (renderer) => {
      expect(byLabel(renderer, 'Build a plan').props.accessibilityState).toEqual({
        disabled: true,
      });
      expect(visibleText(renderer)).toContain('Building…');
    });
  });
});

describe('ReplanScreen — the proposal preview', () => {
  it('draws the placed task and the commitment on the timeline', async () => {
    await withRendered(screen(), (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('Project report');
      expect(text).toContain('Standup');
      expect(text).toContain('2:00 PM – 2:45 PM');
    });
  });

  it('summarises what happens to each task', async () => {
    await withRendered(screen(), (renderer) => {
      expect(visibleText(renderer)).toContain('Planned');
      expect(visibleText(renderer)).toContain('Deferred');
      expect(visibleText(renderer)).toContain("Can't fit today");
      expect(visibleText(renderer)).toContain('Needs a length');
    });
  });

  it('offers an edit path for tasks that cannot be placed', async () => {
    const onEditTask = jest.fn<void, [string]>();
    await withRendered(screen({ onEditTask }), async (renderer) => {
      await press(renderer, 'Edit Deep clean');
      await press(renderer, 'Edit Write spec');
    });
    expect(onEditTask).toHaveBeenNthCalledWith(1, 't3');
    expect(onEditTask).toHaveBeenNthCalledWith(2, 't4');
  });

  it('offers no edit path for a task that is merely deferred', async () => {
    await withRendered(screen(), (renderer) => {
      expect(visibleText(renderer)).toContain('Review PRs');
      expect(() => byLabel(renderer, 'Edit Review PRs')).toThrow();
    });
  });
});

describe('ReplanScreen — applying', () => {
  it('applies a fresh proposal', async () => {
    const onApply = jest.fn();
    await withRendered(screen({ onApply }), async (renderer) => {
      expect(byLabel(renderer, 'Apply plan').props.accessibilityState).toEqual({
        disabled: false,
      });
      await press(renderer, 'Apply plan');
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('refuses to apply a stale proposal and asks for a rebuild', async () => {
    const onApply = jest.fn();
    const onGenerate = jest.fn();
    await withRendered(screen({ stale: true, onApply, onGenerate }), async (renderer) => {
      expect(byLabel(renderer, 'Apply plan').props.accessibilityState).toEqual({
        disabled: true,
      });
      expect(visibleText(renderer)).toContain('Rebuild it before applying');
      await press(renderer, 'Rebuild the plan');
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('discards without applying', async () => {
    const onCancel = jest.fn();
    const onApply = jest.fn();
    await withRendered(screen({ onCancel, onApply }), async (renderer) => {
      await press(renderer, 'Discard this plan');
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('ReplanScreen — preferences', () => {
  it('reports a new workday start as a whole preferences object', async () => {
    const onSetPreferences = jest.fn<void, [ReplanPreferences]>();
    await withRendered(screen({ onSetPreferences }), async (renderer) => {
      await press(renderer, 'Workday starts 8:00 AM');
    });
    expect(onSetPreferences).toHaveBeenCalledWith({ ...PREFS, workdayStart: '08:00' });
  });

  it('reports a new buffer', async () => {
    const onSetPreferences = jest.fn<void, [ReplanPreferences]>();
    await withRendered(screen({ onSetPreferences }), async (renderer) => {
      await press(renderer, '15m buffer');
    });
    expect(onSetPreferences).toHaveBeenCalledWith({ ...PREFS, bufferMinutes: 15 });
  });

  it('shows the low-priority control only in protect mode', async () => {
    await withRendered(screen(), (renderer) => {
      expect(() => byLabel(renderer, 'Defer low-priority tasks')).toThrow();
    });
    await withRendered(screen({ preferences: { ...PREFS, mode: 'protect' } }), (renderer) => {
      expect(byLabel(renderer, 'Defer low-priority tasks').props.accessibilityState).toEqual({
        selected: false,
      });
    });
  });

  it('reports a mode change', async () => {
    const onSetPreferences = jest.fn<void, [ReplanPreferences]>();
    await withRendered(screen({ onSetPreferences }), async (renderer) => {
      await press(renderer, 'Use protect priorities mode');
    });
    expect(onSetPreferences).toHaveBeenCalledWith({ ...PREFS, mode: 'protect' });
  });
});

describe('ReplanScreen — leaving', () => {
  it('reports the header back control', async () => {
    const onBack = jest.fn();
    await withRendered(screen({ onBack }), async (renderer) => {
      await press(renderer, 'Back to today');
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
