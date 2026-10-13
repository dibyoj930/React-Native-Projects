/**
 * Storage for plan outcomes (separate key to preserve history).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PlanOutcome } from './types';

export const PLAN_OUTCOMES_KEY = '@replan-outcomes/v1';

export type PlanOutcomesStore = Record<string, PlanOutcome>;

export async function loadPlanOutcomes(): Promise<PlanOutcomesStore> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_OUTCOMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PlanOutcomesStore;
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

export async function savePlanOutcomes(store: PlanOutcomesStore): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAN_OUTCOMES_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export async function loadPlanOutcomeForDay(dayKey: string): Promise<PlanOutcome | null> {
  const store = await loadPlanOutcomes();
  return store[dayKey] ?? null;
}

export async function savePlanOutcomeForDay(outcome: PlanOutcome): Promise<void> {
  const store = await loadPlanOutcomes();
  store[outcome.dayKey] = outcome;
  await savePlanOutcomes(store);
}
