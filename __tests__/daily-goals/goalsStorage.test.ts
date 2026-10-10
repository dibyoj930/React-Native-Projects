/**
 * The daily-goals storage boundary.
 *
 * Reads must never throw: a missing key, malformed JSON, or a hand-edited value
 * has to degrade to the defaults rather than to a failed launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_DAILY_GOALS,
  DAILY_GOALS_STORAGE_KEY,
  loadDailyGoals,
  saveDailyGoals,
} from '../../daily-goals';

beforeEach(async () => {
  // The AsyncStorage mock's store is module-level, so start each test empty.
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('loadDailyGoals', () => {
  it('returns the shipped defaults when nothing is stored', async () => {
    expect(await loadDailyGoals()).toEqual(DEFAULT_DAILY_GOALS);
  });

  it('reads back what was saved', async () => {
    await saveDailyGoals({ focusMinutes: 45, tasksCompleted: 3 });
    expect(await loadDailyGoals()).toEqual({ focusMinutes: 45, tasksCompleted: 3 });
  });

  it('degrades to defaults on malformed JSON', async () => {
    await AsyncStorage.setItem(DAILY_GOALS_STORAGE_KEY, '{not json');
    expect(await loadDailyGoals()).toEqual(DEFAULT_DAILY_GOALS);
  });

  it('repairs a hand-edited record field by field', async () => {
    await AsyncStorage.setItem(
      DAILY_GOALS_STORAGE_KEY,
      JSON.stringify({ focusMinutes: 90, tasksCompleted: 'lots' }),
    );
    expect(await loadDailyGoals()).toEqual({
      focusMinutes: 90,
      tasksCompleted: DEFAULT_DAILY_GOALS.tasksCompleted,
    });
  });
});

describe('saveDailyGoals', () => {
  it('writes the goals under their own key', async () => {
    await saveDailyGoals({ focusMinutes: 60, tasksCompleted: 4 });
    expect(await AsyncStorage.getItem(DAILY_GOALS_STORAGE_KEY)).toBe(
      JSON.stringify({ focusMinutes: 60, tasksCompleted: 4 }),
    );
  });
});
