/**
 * The recent-focus chart's tap-to-open.
 *
 * The bars are the dashboard's only interactive part. At rest every day shows a
 * pale bar and its time; opening one grows it back to green, wakes the orange
 * task tip and adds the task count. These pin what a finger can perceive — which
 * bar is marked selected, and what it then reads — not the pixels the animation
 * passes through on the way.
 *
 * The panel is a dumb view, so every test builds its `HistoryViewModel` with the
 * controller's pure `buildHistoryViewModel` (a literal streak and a literal
 * window) and renders the panel directly — no provider, no storage, and a best
 * day that never depends on the clock.
 */
import React from 'react';

import { ProductivityDashboard } from '../../components/ProductivityDashboard';
import { buildHistoryViewModel } from '../../hooks/useProductivityView';
import { addDays, type DayRollup, type StreakResult } from '../../productivity';
import {
  byLabel,
  press,
  rerender,
  visibleText,
  withRendered,
  type Rendered,
} from '../support/render';

/** The newest day of the fixed seven-day window. A Friday. */
const WEEK_START = '2026-03-06';

/** A zeroed streak: no history means no streak, and nothing to print. */
function emptyStreak(): StreakResult {
  return {
    current: 0,
    longest: 0,
    freezesRemaining: 0,
    ledger: { freezesEarned: 0, freezesSpent: 0 },
    lastCountedDay: null,
    frozenDays: [],
    isTodayComplete: false,
    firstActiveDay: null,
  };
}

/**
 * A seven-day window, newest-first (the `recentDays` contract), with the given
 * activity overlaid on the newest days. Day `0` is today; a day with no entry
 * is a quiet day.
 */
function recentWindow(
  days: Record<number, { minutes?: number; tasks?: number }> = {},
): DayRollup[] {
  return Array.from({ length: 7 }, (_, i) => {
    const spec = days[i] ?? {};
    const seconds = (spec.minutes ?? 0) * 60;
    return {
      day: addDays(WEEK_START, -i),
      focusedSeconds: seconds,
      totalSessions: seconds > 0 ? 1 : 0,
      completedSessions: 0,
      tasksCompleted: spec.tasks ?? 0,
      isFocusCompleted: false,
    };
  });
}

/** The model the panel renders for this window. */
function screenModel(
  days: Record<number, { minutes?: number; tasks?: number }> = {},
) {
  return buildHistoryViewModel({ streak: emptyStreak(), recentDays: recentWindow(days) });
}

/**
 * The resting bars' fill heights as numbers, in render order.
 *
 * A resting bar sets `height` to a percentage string; the opened bar animates a
 * number instead. Reading the strings is how "never reaches 100%" is pinned.
 */
function restingFillPercents(renderer: Rendered): number[] {
  return renderer.root
    .findAll((node) => {
      if (typeof node.type !== 'string') return false;
      const style = node.props?.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
      return typeof flat?.height === 'string' && flat.height.endsWith('%');
    })
    .map((node) => {
      const style = node.props.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
      return Number.parseFloat(flat.height);
    });
}

/**
 * Every focus bar's accessibility label, in order — e.g. `Fri, 0m, 0 tasks`.
 *
 * A bar always ends its label with its task count, which is what separates it
 * from the streak tile and the hint sitting around it.
 */
function barLabels(renderer: Rendered): string[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props?.accessibilityLabel === 'string' &&
        / tasks?$/.test(node.props.accessibilityLabel),
    )
    .map((node) => node.props.accessibilityLabel as string);
}

describe('ProductivityDashboard — the focus bars', () => {
  it('shows one bar per day of the window, none open', async () => {
    await withRendered(<ProductivityDashboard model={screenModel()} />, (renderer) => {
      const bars = barLabels(renderer);
      expect(bars).toHaveLength(7);
      // The task count only appears once a bar is opened.
      expect(visibleText(renderer)).not.toContain('0 tasks');
    });
  });

  it('opens a bar on tap, moves the selection, and closes it again', async () => {
    await withRendered(<ProductivityDashboard model={screenModel()} />, async (renderer) => {
      const [first, second] = barLabels(renderer);

      await press(renderer, first);
      expect(visibleText(renderer)).toContain('0 tasks');
      expect(byLabel(renderer, first).props.accessibilityState).toMatchObject({
        selected: true,
      });

      // Opening another moves the selection rather than opening a second bar.
      await press(renderer, second);
      expect(byLabel(renderer, second).props.accessibilityState).toMatchObject({
        selected: true,
      });
      expect(byLabel(renderer, first).props.accessibilityState).toMatchObject({
        selected: false,
      });

      // Tapping the open bar again closes it.
      await press(renderer, second);
      expect(visibleText(renderer)).not.toContain('0 tasks');
      expect(byLabel(renderer, second).props.accessibilityState).toMatchObject({
        selected: false,
      });
    });
  });

  it('shows a hint instead of bars when there is no history', async () => {
    const empty = buildHistoryViewModel({ streak: emptyStreak(), recentDays: [] });
    await withRendered(<ProductivityDashboard model={empty} />, (renderer) => {
      expect(visibleText(renderer)).toContain(
        'No focus logged yet. Start a timer to begin building history.',
      );
    });
  });
});

describe('ProductivityDashboard — the focus milestones', () => {
  it('sizes bars to the next milestone, so the best day never reads a full 100%', async () => {
    await withRendered(
      <ProductivityDashboard
        model={screenModel({ 0: { minutes: 6 * 60 }, 1: { minutes: 30 }, 2: { minutes: 45 } })}
      />,
      (renderer) => {
        const percents = restingFillPercents(renderer);
        expect(percents).toHaveLength(7);
        expect(percents).not.toContain(100);
        // The best day is a 6h day against an 8h target: 75%, not 100%.
        expect(Math.max(...percents)).toBe(75);
      },
    );
  });

  it('celebrates reaching the 6h milestone and names the next target', async () => {
    await withRendered(
      <ProductivityDashboard model={screenModel({ 1: { minutes: 6 * 60 } })} />,
      (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('You hit 6h of focus in a day');
        expect(text).toContain('next target: 8h');
      },
    );
  });

  it('stays quiet below the first milestone', async () => {
    await withRendered(
      <ProductivityDashboard model={screenModel({ 0: { minutes: 5 * 60 } })} />,
      (renderer) => {
        expect(visibleText(renderer)).not.toContain('You hit');
      },
    );
  });

  it('dismisses the celebration, which returns for the next rung', async () => {
    await withRendered(
      <ProductivityDashboard
        model={screenModel({ 0: { minutes: 30 }, 1: { minutes: 6 * 60 } })}
      />,
      async (renderer) => {
        await press(renderer, 'Got it');
        expect(visibleText(renderer)).not.toContain('You hit 6h of focus in a day');

        // A best day of 8h is the next rung: the celebration is back, aimed higher.
        await rerender(
          renderer,
          <ProductivityDashboard model={screenModel({ 0: { minutes: 8 * 60 } })} />,
        );
        const text = visibleText(renderer);
        expect(text).toContain('You hit 8h of focus in a day');
        expect(text).toContain('next target: 10h');
      },
    );
  });
});