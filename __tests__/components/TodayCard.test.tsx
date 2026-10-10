/**
 * The Today tile.
 *
 * The tile is presentational now: the goals arrive as a prop (the one source of
 * truth lives in `useDailyGoals`, above both the tile and the editor screen), and
 * tapping the whole tile reports a navigation intent instead of opening an
 * editor. So the tests pin the two things a presentational component owns: what
 * it prints for the goals it is handed, and the one thing it reports back.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TodayCard } from '../../components/TodayCard';
import { DEFAULT_DAILY_GOALS } from '../../daily-goals';
import { ProductivityProvider } from '../../productivity';
import { byLabel, labels, press, visibleText, withRendered } from '../support/render';

/** The productivity store key. Private to `productivity/storage.ts`, named here to seed a day. */
const PRODUCTIVITY_KEY = '@productivity/v1';

/** A focused session logged today, worth `minutes`. */
function sessionToday(minutes: number) {
  const startedAt = Date.now() - minutes * 60 * 1000;
  return {
    id: 'seed-session',
    taskId: null,
    startedAt,
    endedAt: startedAt + minutes * 60 * 1000,
    focusedSeconds: minutes * 60,
    status: 'stopped',
  };
}

async function seedProductivity(sessions: unknown[]): Promise<void> {
  await AsyncStorage.setItem(
    PRODUCTIVITY_KEY,
    JSON.stringify({
      sessions,
      ledger: { freezesEarned: 0, freezesSpent: 0 },
      memory: { lastEventAt: null, previousDayScore: 0 },
    }),
  );
}

function tile(goals = DEFAULT_DAILY_GOALS, onOpenGoals = () => {}) {
  return (
    <ProductivityProvider>
      <TodayCard goals={goals} onOpenGoals={onOpenGoals} />
    </ProductivityProvider>
  );
}

/** Lets the productivity hydration settle. */
const settle = () => ReactTestRenderer.act(async () => undefined);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('TodayCard — the meters', () => {
  it('measures today against the goals it is handed', async () => {
    await seedProductivity([sessionToday(30)]);

    await withRendered(tile({ focusMinutes: 45, tasksCompleted: 2 }), async (renderer) => {
      await settle();
      const text = visibleText(renderer);
      // 30 minutes banked against a 45-minute goal, and no tasks yet.
      expect(text).toContain('30m / 45m');
      expect(text).toContain('0 / 2');
    });
  });

  it('shows a quiet day as zero progress against the default goals', async () => {
    await withRendered(tile(), async (renderer) => {
      await settle();
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
    await withRendered(tile(DEFAULT_DAILY_GOALS, onOpenGoals), async (renderer) => {
      await settle();
      await press(renderer, 'Open goals and preferences');
      expect(onOpenGoals).toHaveBeenCalledTimes(1);
    });
  });

  it('no longer hosts the editor itself', async () => {
    await withRendered(tile(), async (renderer) => {
      await settle();
      expect(labels(renderer)).not.toContain('Daily task goal');
      expect(labels(renderer)).not.toContain('Save daily goals');
      expect(byLabel(renderer, 'Open goals and preferences')).toBeDefined();
    });
  });
});