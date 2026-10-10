/**
 * `useDailyGoals`: hydration and persistence for the user's daily targets.
 *
 * The two things that must hold: an existing install with no stored goals reads
 * as the shipped defaults (so the tile looks unchanged), and saving a goal
 * updates state and the store without touching the productivity history.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DAILY_GOALS_STORAGE_KEY,
  DEFAULT_DAILY_GOALS,
  useDailyGoals,
} from '../../daily-goals';
import { render } from '../support/render';

type Api = ReturnType<typeof useDailyGoals>;

let api: Api | undefined;

function Probe() {
  api = useDailyGoals();
  return null;
}

const act = (body: () => void) => ReactTestRenderer.act(body);
/** Lets the storage hydration settle. */
const settle = () => ReactTestRenderer.act(async () => undefined);

beforeEach(async () => {
  api = undefined;
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('useDailyGoals — hydration', () => {
  it('uses the shipped defaults when an existing install has no goals', async () => {
    await render(<Probe />);
    await settle();
    expect(api?.goals).toEqual(DEFAULT_DAILY_GOALS);
  });

  it('restores saved goals', async () => {
    await AsyncStorage.setItem(
      DAILY_GOALS_STORAGE_KEY,
      JSON.stringify({ focusMinutes: 60, tasksCompleted: 4 }),
    );
    await render(<Probe />);
    await settle();
    expect(api?.goals).toEqual({ focusMinutes: 60, tasksCompleted: 4 });
  });

  it('repairs a malformed stored record', async () => {
    await AsyncStorage.setItem(DAILY_GOALS_STORAGE_KEY, JSON.stringify({ tasksCompleted: -3 }));
    await render(<Probe />);
    await settle();
    expect(api?.goals).toEqual(DEFAULT_DAILY_GOALS);
  });
});

describe('useDailyGoals — saving', () => {
  it('updates state and writes the goals under their own key', async () => {
    await render(<Probe />);
    await settle();

    await act(() => api?.setGoals({ focusMinutes: 45, tasksCompleted: 3 }));
    await settle();

    expect(api?.goals).toEqual({ focusMinutes: 45, tasksCompleted: 3 });
    expect(await AsyncStorage.getItem(DAILY_GOALS_STORAGE_KEY)).toBe(
      JSON.stringify({ focusMinutes: 45, tasksCompleted: 3 }),
    );
  });

  it('leaves the productivity history untouched when a goal changes', async () => {
    const history = JSON.stringify({ sessions: [], ledger: {}, memory: {} });
    await AsyncStorage.setItem('@productivity/v1', history);

    await render(<Probe />);
    await settle();
    await act(() => api?.setGoals({ focusMinutes: 90, tasksCompleted: 5 }));
    await settle();

    expect(await AsyncStorage.getItem('@productivity/v1')).toBe(history);
  });
});
