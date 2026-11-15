/**
 * The career storage boundary.
 *
 * This is the only file under `career/` allowed to touch AsyncStorage. One key
 * holds the whole document so that an edit touching several collections (for
 * example hard-deleting a goal while unlinking its evidence) is a single atomic
 * `setItem`, not a multi-key write that can partially fail.
 *
 * Reads never throw. A missing key seeds the suggested development areas; a
 * malformed value degrades to that same usable document rather than preventing
 * the app from launching.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { createInitialCareerDoc } from './factory';
import { sanitizeCareerDoc } from './sanitize';
import type { CareerDoc } from './types';

export const CAREER_STORAGE_KEY = '@career/v1';

/**
 * Serialise writes.
 *
 * The provider debounces, so writes are normally sequential anyway. The queue is
 * what makes an explicit reset safe: the remove must happen before a delayed
 * save from the previous state can land, and a kill inside that window must not
 * resurrect data the user just cleared.
 */
let mutationQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function loadCareerDoc(now: number = Date.now()): Promise<CareerDoc> {
  try {
    const raw = await AsyncStorage.getItem(CAREER_STORAGE_KEY);
    if (!raw) return createInitialCareerDoc(now);

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('[career] stored value is not an object, using suggested areas');
      return createInitialCareerDoc(now);
    }
    return sanitizeCareerDoc(parsed, now);
  } catch (error) {
    console.warn('[career] could not read stored data, using suggested areas', error);
    return createInitialCareerDoc(now);
  }
}

export async function saveCareerDoc(doc: CareerDoc): Promise<void> {
  return serialized(async () => {
    try {
      await AsyncStorage.setItem(
        CAREER_STORAGE_KEY,
        JSON.stringify(sanitizeCareerDoc(doc)),
      );
    } catch (error) {
      console.error('[career] could not save:', error);
    }
  });
}

/**
 * Remove the document.
 *
 * The caller replaces the in-memory document with a fresh one. Removing first
 * means a kill inside a debounced save window cannot restore the deleted data.
 */
export async function clearCareerDoc(): Promise<void> {
  return serialized(async () => {
    try {
      await AsyncStorage.removeItem(CAREER_STORAGE_KEY);
    } catch (error) {
      console.error('[career] could not clear:', error);
    }
  });
}
