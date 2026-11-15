import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReflectionEntry, ReflectionsStore } from './types';

export const REFLECTIONS_KEY = '@reflections/v1';

export async function loadReflections(): Promise<ReflectionsStore> {
  try {
    const raw = await AsyncStorage.getItem(REFLECTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReflectionsStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveReflections(store: ReflectionsStore): Promise<void> {
  try {
    await AsyncStorage.setItem(REFLECTIONS_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export async function loadReflectionForDay(dayKey: string): Promise<ReflectionEntry | null> {
  const store = await loadReflections();
  return store[dayKey] ?? null;
}

export async function saveReflectionForDay(entry: ReflectionEntry): Promise<void> {
  const store = await loadReflections();
  store[entry.dayKey] = entry;
  await saveReflections(store);
}
