/**
 * `ReplanDoc` persistence — the single replan document.
 *
 * This is the ONLY file in `replan/` allowed to touch AsyncStorage (same rule as
 * productivity/storage.ts and daily-goals/goalsStorage.ts). Key: `@replan/v1`,
 * its own key on purpose so clearing tasks or focus history cannot wipe the plan
 * (and vice versa).
 *
 * ## Why one document
 *
 * Preferences and the approved plan travel together, so an Apply is ONE `setItem`.
 * That is the whole answer to "what if an apply spans multiple keys" — with one
 * document it does not. Preferences are tiny and change rarely; the plan changes
 * only on an explicit Apply.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_REPLAN_PREFERENCES, sanitizeReplanPreferences } from './preferences';
import type { DayPlan, ReplanDoc, ReplanPreferences } from './types';

export const REPLAN_STORAGE_KEY = '@replan/v1';

/** `{ version: 1, preferences: defaults, plan: null }`. */
export function emptyReplanDoc(): ReplanDoc {
  return {
    version: 1,
    preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    plan: null,
  };
}

/** Repair a stored plan's placements: well-formed rows only, sorted by start. */
function sanitizeDayPlan(value: unknown): DayPlan | null {
  const raw = (value ?? {}) as Partial<DayPlan>;
  if (
    typeof raw.dayKey !== 'string' ||
    typeof raw.approvedAt !== 'number' ||
    typeof raw.signature !== 'string' ||
    !Array.isArray(raw.placements)
  ) {
    return null;
  }
  const placements = raw.placements
    .filter(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        typeof (row as DayPlan['placements'][number]).taskId === 'string' &&
        typeof (row as DayPlan['placements'][number]).start === 'number' &&
        typeof (row as DayPlan['placements'][number]).end === 'number' &&
        (row as DayPlan['placements'][number]).start <
          (row as DayPlan['placements'][number]).end,
    )
    .map((row) => ({
      taskId: (row as DayPlan['placements'][number]).taskId,
      start: (row as DayPlan['placements'][number]).start,
      end: (row as DayPlan['placements'][number]).end,
    }))
    .sort((a, b) => a.start - b.start);

  return {
    dayKey: raw.dayKey,
    approvedAt: raw.approvedAt,
    signature: raw.signature,
    placements,
  };
}

/**
 * Field-by-field repair for a document that came out of storage; never throws.
 * A bad preferences block loses its bad fields (via sanitizeReplanPreferences),
 * a bad plan becomes `null`, and an unknown `version` rebuilds the empty doc.
 */
export function sanitizeReplanDoc(value: unknown): ReplanDoc {
  const raw = (value ?? {}) as Partial<ReplanDoc>;
  if (raw.version !== 1) return emptyReplanDoc();
  return {
    version: 1,
    preferences: sanitizeReplanPreferences(raw.preferences),
    plan: sanitizeDayPlan(raw.plan),
  };
}

/**
 * Read the document: getItem + JSON.parse + sanitizeReplanDoc. A missing key or
 * any failure degrades to `emptyReplanDoc()`. Never throws.
 */
export async function loadReplanDoc(): Promise<ReplanDoc> {
  try {
    const raw = await AsyncStorage.getItem(REPLAN_STORAGE_KEY);
    if (!raw) return emptyReplanDoc();
    return sanitizeReplanDoc(JSON.parse(raw));
  } catch (error) {
    console.warn('[replan] could not read the replan document, using defaults', error);
    return emptyReplanDoc();
  }
}

/** Single setItem of the whole document. Never throws (log + swallow). */
export async function saveReplanDoc(doc: ReplanDoc): Promise<void> {
  try {
    await AsyncStorage.setItem(REPLAN_STORAGE_KEY, JSON.stringify(sanitizeReplanDoc(doc)));
  } catch (error) {
    console.warn('[replan] could not save the replan document', error);
  }
}

/** Convenience for an Apply: write preferences + plan in the same doc. */
export async function savePlan(
  preferences: ReplanPreferences,
  plan: DayPlan,
): Promise<void> {
  await saveReplanDoc({
    version: 1,
    preferences: sanitizeReplanPreferences(preferences),
    plan: sanitizeDayPlan(plan),
  });
}

/** Keep preferences, drop the approved plan (an Apply is undone by re-planning). */
export async function clearPlan(): Promise<void> {
  const doc = await loadReplanDoc();
  await saveReplanDoc({ ...doc, plan: null });
}