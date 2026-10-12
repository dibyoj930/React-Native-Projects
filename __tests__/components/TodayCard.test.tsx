/**
 * The Today tile.
 *
 * The tile is a dumb view now: everything it prints arrives as a `model` built
 * by the productivity controller, and tapping the whole tile reports a
 * navigation intent instead of opening an editor. So the tests pin the two
 * things a presentational component owns: what it prints for the model it is
 * handed, and the one thing it reports back.
 *
 * The model is built with the controller's pure `buildTodayViewModel` — a
 * literal rollup, a momentum band and the goals — so no provider or storage is
 * involved, and the "today" a test measures never depends on the clock.
 */
import React from 'react';

import { TodayCard } from '../../components/TodayCard';
import { buildTodayViewModel } from '../../hooks/useProductivityView';
import { MOMENTUM_BAND_LABELS } from '../../productivity';
import type { DayRollup } from '../../productivity';
import { DEFAULT_DAILY_GOALS } from '../../daily-goals';
import { byLabel, labels, press, visibleText, withRendered } from '../support/render';

/** A day's rollup with `seconds` of focus and `tasks` closed, on a fixed day. */
function rollup(seconds: number, tasks: number, day = '2026-03-06'): DayRollup {
  return {
    day,
    focusedSeconds: seconds,
    totalSessions: seconds > 0 ? 1 : 0,
    completedSessions: 0,
    tasksCompleted: tasks,
    isFocusCompleted: false,
  };
}

function tile(
  todayRollup: DayRollup | undefined,
  goals = DEFAULT_DAILY_GOALS,
  onOpenGoals = () => {},
) {
  const model = buildTodayViewModel({
    todayRollup,
    momentumBand: 'steady',
    goals,
  });
  return <TodayCard model={model} onOpenGoals={onOpenGoals} />;
}

describe('TodayCard — the meters', () => {
  it('measures today against the goals it is handed', async () => {
    await withRendered(tile(rollup(30 * 60, 0), { focusMinutes: 45, tasksCompleted: 2 }), (renderer) => {
      const text = visibleText(renderer);
      // 30 minutes banked against a 45-minute goal, and no tasks yet.
      expect(text).toContain('30m / 45m');
      expect(text).toContain('0 / 2');
    });
  });

  it('leads with the momentum sentence for the band it is handed', async () => {
    await withRendered(tile(rollup(30 * 60, 0)), (renderer) => {
      expect(visibleText(renderer)).toContain(MOMENTUM_BAND_LABELS.steady);
    });
  });

  it('shows a quiet day as zero progress against the default goals', async () => {
    await withRendered(tile(undefined), (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('0 / 1');
      expect(text).toContain(`0m / ${DEFAULT_DAILY_GOALS.focusMinutes}m`);
      expect(text).toContain('One step at a time. Keep going.');
    });
  });
});

describe('TodayCard — it is the way into the goals screen', () => {
  it('reports a tap as a request to open the goals screen', async () => {
    const onOpenGoals = jest.fn();
    await withRendered(tile(rollup(30 * 60, 0), DEFAULT_DAILY_GOALS, onOpenGoals), async (renderer) => {
      await press(renderer, 'Open goals and preferences');
      expect(onOpenGoals).toHaveBeenCalledTimes(1);
    });
  });

  it('no longer hosts the editor itself', async () => {
    await withRendered(tile(undefined), (renderer) => {
      expect(labels(renderer)).not.toContain('Daily task goal');
      expect(labels(renderer)).not.toContain('Save daily goals');
      expect(byLabel(renderer, 'Open goals and preferences')).toBeDefined();
    });
  });
});