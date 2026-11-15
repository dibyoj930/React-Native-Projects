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

/**
 * Serialises the read-modify-write helpers below.
 *
 * `savePlan`, `savePreferences` and `saveSuggestions` each load the document,
 * merge their field and write the whole thing back. Two running at once would
 * each read the pre-merge document and the second write would erase the first's
 * field — an Apply landing beside a suggestion dismissal would silently drop one
 * of them. Chaining them means every merge sees the previous write's result.
 *
 * `saveReplanDoc` is deliberately *outside* the chain: it is a bare single write
 * and the helpers above call it from inside their own turn, so queuing it too
 * would deadlock the helper waiting on a slot its own turn holds.
 */
let mutationQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(task, task);
  // Keep the chain alive regardless of outcome; a rejected write must not wedge
  // every later one.
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** `{ version: 1, preferences: defaults, plan: null }`. */
export function emptyReplanDoc(): ReplanDoc {
  return {
    version: 1,
    preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    plan: null,
    suggestions: undefined,
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
  const plan = sanitizeDayPlan(raw.plan);
  const suggestions = raw.suggestions as any;
  let cleanedSuggestions: ReplanDoc['suggestions'];
  if (suggestions && typeof suggestions === 'object') {
    cleanedSuggestions = {
      dayKey: typeof suggestions.dayKey === 'string' ? suggestions.dayKey : plan?.dayKey ?? '',
      dismissedIds: Array.isArray(suggestions.dismissedIds) ? suggestions.dismissedIds.filter((x: any) => typeof x === 'string') : [],
      snoozedUntil: typeof suggestions.snoozedUntil === 'object' && suggestions.snoozedUntil ? suggestions.snoozedUntil : undefined,
      lastEvaluatedAt: typeof suggestions.lastEvaluatedAt === 'number' ? suggestions.lastEvaluatedAt : Date.now(),
    };
  }
  return {
    version: 1,
    preferences: sanitizeReplanPreferences(raw.preferences),
    plan,
    suggestions: cleanedSuggestions,
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
  return serialized(async () => {
    const current = await loadReplanDoc();
    await saveReplanDoc({
      ...current,
      version: 1,
      preferences: sanitizeReplanPreferences(preferences),
      plan: sanitizeDayPlan(plan),
    });
  });
}

/** Persist preference changes, preserving plan and suggestions. */
export async function savePreferences(
  preferences: ReplanPreferences,
): Promise<void> {
  return serialized(async () => {
    const current = await loadReplanDoc();
    await saveReplanDoc({
      ...current,
      version: 1,
      preferences: sanitizeReplanPreferences(preferences),
    });
  });
}

/** Persist suggestions state, preserving preferences and plan. */
export async function saveSuggestions(
  suggestions: ReplanDoc['suggestions'],
): Promise<void> {
  return serialized(async () => {
    const current = await loadReplanDoc();
    await saveReplanDoc({
      ...current,
      version: 1,
      suggestions,
    });
  });
}

/** Keep preferences, drop the approved plan (an Apply is undone by re-planning). */
export async function clearPlan(): Promise<void> {
  return serialized(async () => {
    const doc = await loadReplanDoc();
    await saveReplanDoc({ ...doc, plan: null });
  });
}