/**
 * Controller for contextual replan suggestions.
 *
 * Owns the per-day dismissal/snooze state that lives on the replan document
 * (`ReplanDoc.suggestions`). Detection itself is pure and lives in
 * `replan/suggestions.ts`; this file only decides when to run it and persists
 * the user's "not now" choices.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ReplanSuggestion } from '../replan';
import { computeSuggestions } from '../replan';
import { loadReplanDoc, saveReplanDoc } from '../replan';
import type {
  DayPlan,
  ReplanDoc,
  ReplanSuggestionsState,
  ReplanTask,
} from '../replan';
import type { Todo } from '../todos/model';
import { todayKey } from '../productivity';
import { useNow } from './useNow';

export type UseReplanSuggestionsArgs = {
  hydrated: boolean;
  plan: DayPlan | null;
  replanTasks: readonly ReplanTask[];
  todos: readonly Todo[];
  anyTimerRunning: boolean;
  today?: string;
  workdayStart: string;
  workdayEnd: string;
  actualFocusMinsSoFar?: number;
  completedPlannedCount?: number;
  totalPlannedCount?: number;
  plannedFocusMinsSoFar?: number;
};

export type ReplanSuggestionsController = {
  suggestions: ReplanSuggestion[];
  dismiss: (suggestionId: string) => void;
  remindLater: (suggestionId: string) => void;
  openAction: (suggestion: ReplanSuggestion) => void;
};

/** Snooze length for "Remind me later". */
export const SUGGESTION_SNOOZE_MS = 15 * 60 * 1000;

/** An empty per-day state for `today`. */
function emptyState(dayKey: string, now: number): ReplanSuggestionsState {
  return { dayKey, dismissedIds: [], snoozedUntil: {}, lastEvaluatedAt: now };
}

export function useReplanSuggestions(
  args: UseReplanSuggestionsArgs,
): ReplanSuggestionsController {
  const {
    hydrated,
    plan,
    replanTasks,
    todos,
    anyTimerRunning,
    workdayStart,
    workdayEnd,
    actualFocusMinsSoFar,
    completedPlannedCount,
    totalPlannedCount,
    plannedFocusMinsSoFar,
  } = args;
  const today = args.today || todayKey();
  const now = useNow();
  const [doc, setDoc] = useState<ReplanDoc | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    loadReplanDoc().then((loaded) => {
      if (!cancelled) setDoc(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  // Dismissals are per-day. A stored state from a previous day is discarded
  // rather than carried forward, so yesterday's "later" does not silence today.
  const state: ReplanSuggestionsState =
    doc?.suggestions && doc.suggestions.dayKey === today
      ? doc.suggestions
      : emptyState(today, now);
  const dismissedIds = state.dismissedIds;
  const snoozedUntil = state.snoozedUntil ?? {};

  const suggestions = useMemo(() => {
    if (!hydrated || anyTimerRunning || !plan) return [];
    const computed = computeSuggestions(
      {
        now,
        dayKey: today,
        plan,
        replanTasks,
        todos,
        anyTimerRunning,
        workdayStart,
        workdayEnd,
        actualFocusMinsSoFar,
        completedPlannedCount,
        totalPlannedCount,
        plannedFocusMinsSoFar,
      },
      dismissedIds,
    );
    return computed.filter(
      (s) => !(snoozedUntil[s.id] && snoozedUntil[s.id] > now),
    );
  }, [
    hydrated,
    anyTimerRunning,
    plan,
    replanTasks,
    todos,
    today,
    now,
    dismissedIds,
    snoozedUntil,
    workdayStart,
    workdayEnd,
    actualFocusMinsSoFar,
    completedPlannedCount,
    totalPlannedCount,
    plannedFocusMinsSoFar,
  ]);

  /**
   * Persist a new per-day state.
   *
   * Guarded on a loaded document: writing before the read resolves would build a
   * doc from nothing and `sanitizeReplanDoc` would drop it (it has no `version`),
   * or worse, replace a real plan. The suggestions are never shown before the
   * plan exists, so this is a narrow window.
   */
  const persist = useCallback(
    (nextState: ReplanSuggestionsState) => {
      if (!doc) return;
      const nextDoc: ReplanDoc = { ...doc, suggestions: nextState };
      setDoc(nextDoc);
      saveReplanDoc(nextDoc).catch(() => {});
    },
    [doc],
  );

  const dismiss = useCallback(
    (suggestionId: string) => {
      persist({
        dayKey: today,
        dismissedIds: [...dismissedIds, suggestionId],
        snoozedUntil: { ...snoozedUntil },
        lastEvaluatedAt: Date.now(),
      });
    },
    [persist, today, dismissedIds, snoozedUntil],
  );

  const remindLater = useCallback(
    (suggestionId: string) => {
      persist({
        dayKey: today,
        dismissedIds,
        snoozedUntil: {
          ...snoozedUntil,
          [suggestionId]: Date.now() + SUGGESTION_SNOOZE_MS,
        },
        lastEvaluatedAt: Date.now(),
      });
    },
    [persist, today, dismissedIds, snoozedUntil],
  );

  const openAction = useCallback((_suggestion: ReplanSuggestion) => {
    // Navigation is the view's job; kept for interface completeness.
  }, []);

  return { suggestions, dismiss, remindLater, openAction };
}
