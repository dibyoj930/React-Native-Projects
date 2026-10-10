import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_DAILY_GOALS, sanitizeGoals, type DailyGoals } from './goals';

/**
 * Persistence for the daily goals.
 *
 * Its own key, separate from `@productivity/v1`: the focus log is history, and
 * clearing it (Settings → Clear focus history) must not wipe the goals a person
 * set. Two numbers do not need to share a document with a year of sessions.
 *
 * Never throws. A read failure or a missing key degrades to the shipped
 * defaults, so a broken store can delay the goals but cannot stop the app.
 */

export const DAILY_GOALS_STORAGE_KEY = '@daily-goals/v1';

export async function loadDailyGoals(): Promise<DailyGoals> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_GOALS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DAILY_GOALS };
    return sanitizeGoals(JSON.parse(raw));
  } catch (error) {
    console.warn('[daily-goals] could not read stored goals, using defaults', error);
    return { ...DEFAULT_DAILY_GOALS };
  }
}

export async function saveDailyGoals(goals: DailyGoals): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch (error) {
    console.error('[daily-goals] could not save goals:', error);
  }
}
