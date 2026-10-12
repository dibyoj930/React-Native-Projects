/**
 * The replan controller: proposal generation, approval and apply.
 *
 * Plain hook, no context (same shape as daily-goals/useDailyGoals.ts) — it is
 * consumed by the composition point (WelcomeComponent.tsx) and by the Replan
 * screen.
 *
 * Mounted beside `useTaskScreen` so it can read the task list and the timer
 * state from one place, and it owns the `usePlanReminders` effect so reminders
 * reconcile only after a successful persist.
 *
 * ## Invariants
 *
 *   - Never mutates tasks; never touches dueDate/dueTime.
 *   - Never reconciles reminders before a successful persist.
 *   - Never cancels `timer-*` notifications (running focus is untouchable).
 *   - Re-checks `now` on apply: if the workday has ended, it refuses instead of
 *     persisting a plan that has already begun to lapse.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatClock } from '../replan/explain';
import { buildReplanProposal } from '../replan/engine';
import {
  normalizeReplanInput,
  normalizeReplanTasks,
  type RawTimerWindow,
} from '../replan/normalize';
import { loadReplanDoc, savePlan, saveReplanDoc } from '../replan/planStorage';
import { DEFAULT_REPLAN_PREFERENCES, resolveWorkday } from '../replan/preferences';
import type { ReplanDoc, ReplanPreferences, ReplanProposal, ReplanTask } from '../replan';
import type { Todo } from '../todos/model';
import { usePlanReminders } from './usePlanReminders';

/** What the composition point hands the controller. */
export type UseReplanOptions = {
  todos: readonly Todo[];
  /** Storage has loaded; gates anything that would otherwise act on an empty list. */
  hydrated: boolean;
  /** Today's local day key (WelcomeComponent/useTaskScreen). */
  today: string;
  /**
   * The running timer's window `[start, end)` as epoch ms, or null.
   *
   * This is also what marks a task as having an active timer: a non-null window
   * becomes a protected interval, and the engine reads `hasActiveTimer` from
   * exactly those intervals, so a separate boolean would be a second source of
   * truth for one fact.
   */
  timerWindowFor: (taskId: string) => { start: number; end: number } | null;
};

/** What the Replan screen and rows read. */
export type ReplanController = {
  /** The in-memory proposal, or null before generate()/after cancel(). */
  proposal: ReplanProposal | null;
  preferences: ReplanPreferences;
  /** True when the current proposal no longer matches task/timer state. */
  stale: boolean;
  generate: () => ReplanProposal;
  apply: () => Promise<void>;
  cancel: () => void;
  setPreferences: (next: ReplanPreferences) => void;
  /** Row label for an approved window, or undefined when none. */
  plannedLabelFor: (taskId: string) => string | undefined;
  /** Whether an approved plan exists for today. */
  hasPlan: boolean;
  /** Engine-view tasks by id, for the screen's timeline and task list. */
  tasksById: Record<string, ReplanTask>;
};

export function useReplan(options: UseReplanOptions): ReplanController {
  const { todos, hydrated, today, timerWindowFor } = options;

  const [doc, setDoc] = useState<ReplanDoc | null>(null);
  const [proposal, setProposal] = useState<ReplanProposal | null>(null);
  const [stale, setStale] = useState(false);

  // Hydrate the document exactly once, after storage is known to have loaded.
  // A read that resolves after unmount must not call setState.
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

  /** Preferences are the document's own; before hydration they are the defaults. */
  const preferences: ReplanPreferences = doc?.preferences ?? DEFAULT_REPLAN_PREFERENCES;

  /** The currently approved plan, only usable while its day is today. */
  const currentPlan = doc?.plan?.dayKey === today ? doc.plan : null;

  /** Running-timer windows, which the scheduler must treat as protected. */
  const timerWindows = useMemo<RawTimerWindow[]>(() => {
    const windows: RawTimerWindow[] = [];
    for (const todo of todos) {
      const window = timerWindowFor(todo.id);
      if (window && window.end > window.start) {
        windows.push({ taskId: todo.id, start: window.start, end: window.end });
      }
    }
    return windows;
  }, [todos, timerWindowFor]);

  /** Engine-view tasks, also the shape the reminder planner reads. */
  const replanTasks = useMemo(
    () => normalizeReplanTasks(todos, timerWindows, currentPlan),
    [todos, timerWindows, currentPlan],
  );

  // Reminders reconcile whenever the approved plan or the task list changes —
  // which is exactly "after a successful persist", because the plan only changes
  // when apply() persists it. The opt-in switch lives in the preferences.
  usePlanReminders({
    plan: currentPlan,
    tasks: replanTasks,
    hydrated: hydrated && doc !== null,
    enabled: preferences.notifyPlannedStarts,
  });

  /** Engine-view tasks indexed by id, for the Replan screen's lookups. */
  const tasksById = useMemo(() => {
    const byId: Record<string, ReplanTask> = {};
    for (const task of replanTasks) byId[task.id] = task;
    return byId;
  }, [replanTasks]);

  /** Build the normalised engine input from the current state and one `now`. */
  const buildInput = useCallback(
    (now: number) => {
      const workday = resolveWorkday(
        today,
        preferences.workdayStart,
        preferences.workdayEnd,
      );
      return normalizeReplanInput({
        now,
        day: today,
        workday,
        todos,
        timerWindows,
        preferences,
        commitments: [],
        busy: [],
        approvedPlan: currentPlan,
      });
    },
    [today, preferences, todos, timerWindows, currentPlan],
  );

  /** Generate a FRESH proposal from the CURRENT state; nothing is persisted. */
  const generate = useCallback((): ReplanProposal => {
    const next = buildReplanProposal(buildInput(Date.now()));
    setProposal(next);
    setStale(false);
    return next;
  }, [buildInput]);

  /**
   * Apply: re-check the state right now and only persist when the proposal is
   * still an exact match. A mismatch (a task added, a timer started, a minute
   * crossed) marks the proposal stale and refuses rather than persisting a plan
   * that no longer matches the day.
   */
  const apply = useCallback(async () => {
    if (!proposal) return;

    const now = Date.now();
    const workdayEnd = resolveWorkday(
      today,
      preferences.workdayStart,
      preferences.workdayEnd,
    ).end;
    // The day is over (or the workday window is empty): persisting now would
    // immediately be wrong, so refuse and let the UI offer a rebuild.
    if (now >= workdayEnd) {
      setStale(true);
      return;
    }

    const fresh = buildInput(now);
    if (fresh.signature !== proposal.signature) {
      setStale(true);
      return;
    }

    const plan = {
      dayKey: today,
      approvedAt: now,
      signature: proposal.signature,
      placements: proposal.placements
        .filter((placement) => placement.kind === 'task')
        .map((placement) => ({
          taskId: placement.taskId,
          start: placement.start,
          end: placement.end,
        })),
    };

    await savePlan(preferences, plan);
    setDoc({ version: 1, preferences, plan });
    // A persisted plan is no longer stale by definition.
    setStale(false);
  }, [proposal, preferences, today, buildInput]);

  /** Drop the in-memory proposal; nothing was persisted, so nothing to undo. */
  const cancel = useCallback(() => {
    setProposal(null);
    setStale(false);
  }, []);

  /**
   * Persist preference changes immediately (they are small and cheap), and drop
   * any in-memory proposal: a plan built under the old settings no longer
   * matches, so the copy's "change any of these and build again" is honoured by
   * construction.
   */
  const setPreferences = useCallback(
    (next: ReplanPreferences) => {
      const updated: ReplanDoc = { version: 1, preferences: next, plan: doc?.plan ?? null };
      setDoc(updated);
      saveReplanDoc(updated).catch(() => {});
      setProposal(null);
      setStale(false);
    },
    [doc],
  );

  /** The approved window label for a row, or undefined when it has none. */
  const plannedLabelFor = useCallback(
    (taskId: string): string | undefined => {
      const plan = currentPlan;
      if (!plan) return undefined;
      const placement = plan.placements.find((row) => row.taskId === taskId);
      if (!placement) return undefined;
      return `${formatClock(placement.start)} – ${formatClock(placement.end)}`;
    },
    [currentPlan],
  );

  return {
    proposal,
    preferences,
    stale,
    generate,
    apply,
    cancel,
    setPreferences,
    plannedLabelFor,
    hasPlan: currentPlan !== null,
    tasksById,
  };
}