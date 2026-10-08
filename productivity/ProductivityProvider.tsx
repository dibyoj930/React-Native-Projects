import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import type { Attribution } from './attribution';
import { localDateKey, startOfDay } from './dateKey';
import {
  buildSnapshot,
  closingScoreFor,
  DEFAULT_RECENT_DAYS,
  type ProductivitySnapshot,
} from './selectors';
import {
  initialProductivityState,
  productivityReducer,
} from './reducer';
import { closeSession, nextSessionId, pauseSession, resumeSession, startSession } from './sessions';
import { loadProductivity, saveProductivity } from './storage';
import type { ActiveSession, CompletionRecord, FocusSessionStatus } from './types';

/**
 * Owns the productivity system: the focus-session log, the streak ledger, and
 * every figure derived from them.
 *
 * Mirrors `NotificationProvider` deliberately — a plain Context plus a reducer,
 * mounted once in `App.tsx`. No Redux and no navigation library: the state is a
 * single flat object with five event types, and all reading happens through one
 * memoised snapshot, so a store library would add a dependency and a build step
 * without removing any real complexity.
 *
 * Task data is *fed in* rather than owned here. `WelcomeComponent` holds the
 * task list, and calling `setTasks` keeps one source of truth for tasks while
 * still letting the scoring layer read them. Passing the array through by
 * reference means this costs one extra render per task edit, which only happens
 * on a tap.
 */

interface ProductivityContextValue {
  snapshot: ProductivitySnapshot;
  /** Feeds the current task list into the scoring layer. */
  setTasks: (tasks: readonly CompletionRecord[]) => void;
  /** Opens a focus session for a task. Closes any session it already had. */
  startFocus: (taskId: string) => void;
  pauseFocus: (taskId: string) => void;
  resumeFocus: (taskId: string) => void;
  /** Closes the task's open session. A no-op when none is open. */
  finishFocus: (taskId: string, status: FocusSessionStatus) => void;
  /** Records a task-level event (add, edit, complete) for idle decay. */
  noteActivity: () => void;
  /** Focus history for one task. Always returns a value, even with no history. */
  attributionFor: (taskId: string) => Attribution;
}

const ProductivityContext = React.createContext<ProductivityContextValue | null>(null);

/** How often the derived snapshot is rebuilt. Momentum decays, so it is not static. */
const RECOMPUTE_INTERVAL_MS = 60_000;

/** Writes are coalesced; a burst of timer events should not mean a burst of IO. */
const SAVE_DEBOUNCE_MS = 800;

export function ProductivityProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(productivityReducer, initialProductivityState);
  const [tasks, setTasksState] = useState<readonly CompletionRecord[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Latest-everything refs. The timer lifecycle callbacks and the day-rollover
  // check fire from intervals and gestures, where a captured closure would be
  // one render stale — and a stale session map means losing focus time.
  const stateRef = useRef(state);
  const tasksRef = useRef(tasks);
  stateRef.current = state;
  tasksRef.current = tasks;

  // --- hydration -----------------------------------------------------------

  useEffect(() => {
    let active = true;
    loadProductivity().then((data) => {
      if (!active) return;
      dispatch({ type: 'hydrated', ...data });
    });
    return () => {
      active = false;
    };
  }, []);

  // --- recompute clock -----------------------------------------------------

  useEffect(() => {
    const interval = setInterval(
      () => setNowTick(Date.now()),
      RECOMPUTE_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  // --- day rollover --------------------------------------------------------

  const lastDayRef = useRef<string | null>(null);

  useEffect(() => {
    const checkRollover = () => {
      const today = localDateKey(Date.now());
      const previous = lastDayRef.current;

      // First observation only establishes the baseline; there is no "yesterday"
      // to score yet on a fresh install.
      if (previous === null) {
        lastDayRef.current = today;
        return;
      }
      if (previous === today) return;

      const { sessions, ledger, memory } = stateRef.current;
      // Score the day that just ended using its own data, pinned to the last
      // instant of that day. Scored "now" it would mix in whatever has happened
      // since midnight and hand tomorrow a carry it never earned.
      const closingScore = closingScoreFor({
        sessions,
        active: Object.values(stateRef.current.active),
        tasks: tasksRef.current,
        ledger,
        memory,
        dayEndedAt: startOfDay(Date.now()) - 1,
      });

      dispatch({
        type: 'setMemory',
        memory: {
          // Preserved verbatim. Re-anchoring this to the rollover instant would
          // reset the idle decay for someone who has genuinely been away for
          // days, quietly resetting their momentum every midnight.
          lastEventAt: memory.lastEventAt,
          previousDayScore: closingScore,
        },
      });
      lastDayRef.current = today;
    };

    checkRollover();
    const interval = setInterval(checkRollover, RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // --- persistence ---------------------------------------------------------

  useEffect(() => {
    if (!state.hydrated) return undefined;
    const timeout = setTimeout(() => {
      saveProductivity(state);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [state]);

  // --- snapshot ------------------------------------------------------------

  const snapshot = useMemo(
    () =>
      buildSnapshot({
        sessions: state.sessions,
        active: Object.values(state.active),
        tasks,
        ledger: state.ledger,
        memory: state.memory,
        now: nowTick,
        recentDayCount: DEFAULT_RECENT_DAYS,
      }),
    [state.sessions, state.active, state.ledger, state.memory, tasks, nowTick],
  );

  // The ledger can gain freezes during a recompute; persisting it keeps the
  // grant from being re-awarded on every launch.
  useEffect(() => {
    if (!state.hydrated) return;
    if (
      snapshot.streak.ledger.freezesEarned !== state.ledger.freezesEarned ||
      snapshot.streak.ledger.freezesSpent !== state.ledger.freezesSpent
    ) {
      dispatch({ type: 'setLedger', ledger: snapshot.streak.ledger });
    }
  }, [snapshot.streak.ledger, state.ledger, state.hydrated]);

  // --- focus lifecycle -----------------------------------------------------

  const setTasks = useCallback((next: readonly CompletionRecord[]) => {
    // Identity check: the caller passes the same array reference between
    // renders, so this is a genuine no-op unless the task list really changed.
    setTasksState((prev) => (prev === next ? prev : next));
  }, []);

  const startFocus = useCallback((taskId: string) => {
    const now = Date.now();
    const existing = stateRef.current.active[taskId];

    // Re-picking a duration must not discard focus already banked, so the
    // in-flight session is closed and kept rather than overwritten.
    if (existing) {
      dispatch({
        type: 'closeFocus',
        taskId,
        session: closeSession(existing, 'stopped', now),
        at: now,
      });
    }

    const session = startSession(nextSessionId(now), taskId, now);
    dispatch({ type: 'startFocus', taskId, session });
  }, []);

  const pauseFocus = useCallback((taskId: string) => {
    const existing = stateRef.current.active[taskId];
    if (!existing) return;
    dispatch({ type: 'updateFocus', taskId, session: pauseSession(existing, Date.now()) });
  }, []);

  const resumeFocus = useCallback((taskId: string) => {
    const existing = stateRef.current.active[taskId];
    if (!existing) return;
    dispatch({ type: 'updateFocus', taskId, session: resumeSession(existing, Date.now()) });
  }, []);

  const finishFocus = useCallback((taskId: string, status: FocusSessionStatus) => {
    const now = Date.now();
    const existing = stateRef.current.active[taskId];
    if (!existing) return;
    dispatch({
      type: 'closeFocus',
      taskId,
      session: closeSession(existing, status, now),
      at: now,
    });
  }, []);

  const noteActivity = useCallback(() => {
    dispatch({ type: 'noteEvent', at: Date.now() });
  }, []);

  const attributionFor = useCallback(
    (taskId: string): Attribution =>
      snapshot.attribution.get(taskId) ?? {
        taskId,
        focusedSeconds: 0,
        sessionCount: 0,
        isFocusCompleted: false,
        isTimerCompleted: false,
        firstSessionAt: null,
        lastSessionAt: null,
      },
    [snapshot.attribution],
  );

  const value = useMemo(
    () => ({
      snapshot,
      setTasks,
      startFocus,
      pauseFocus,
      resumeFocus,
      finishFocus,
      noteActivity,
      attributionFor,
    }),
    [
      snapshot,
      setTasks,
      startFocus,
      pauseFocus,
      resumeFocus,
      finishFocus,
      noteActivity,
      attributionFor,
    ],
  );

  return (
    <ProductivityContext.Provider value={value}>
      {children}
    </ProductivityContext.Provider>
  );
}

export function useProductivity(): ProductivityContextValue {
  const context = useContext(ProductivityContext);
  if (!context) {
    throw new Error('useProductivity must be used inside a <ProductivityProvider>');
  }
  return context;
}

export type { ActiveSession, FocusSessionStatus };
