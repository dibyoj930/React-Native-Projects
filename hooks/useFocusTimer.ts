import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { TimerPickerModalProps } from 'react-native-timer-picker';

export type TimerState = TimerPickerModalProps['initialValue'];

export function toSeconds(t: TimerState | undefined | null): number {
  if (!t) return 0;
  const hours = t.hours ?? 0;
  const minutes = t.minutes ?? 0;
  const seconds = t.seconds ?? 0;
  return (hours * 60 + minutes) * 60 + seconds;
}

type UseFocusTimerOptions = {
  /**
   * Called once per timer, with every id that reached its end time. Fired from
   * both the 1s tick and the foreground reconcile, so callers must be
   * idempotent — `reportedRef` stops double delivery, but a caller that runs
   * twice for the same id is still a caller bug.
   */
  onExpire: (ids: string[]) => void;
};

/**
 * Owns the lifecycle of per-task countdown timers.
 *
 * The countdown itself is derived from an absolute epoch timestamp
 * (`endsRef[id]`), never from an accumulating interval. The interval exists
 * only to re-render so the display refreshes, and to notice expiry — it is
 * deliberately not the source of truth, which is why backgrounding, locking
 * and JS suspension cannot desynchronise the timer from reality.
 *
 * A timer is considered running iff it has an entry in `endsRef`. There is no
 * separate `running` map: the old `runningTimers` state duplicated this and
 * could disagree with `timerEnds` after a missed write.
 *
 * State is held in refs and mirrored into React state through `commit`. Every
 * mutation goes through `commit`, so the refs — which the interval and AppState
 * handlers read outside of render — can never drift from what is rendered.
 */
export function useFocusTimer({ onExpire }: UseFocusTimerOptions) {
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [timerEnds, setTimerEnds] = useState<Record<string, number>>({});
  // Bumped once a second purely to force a re-render of the countdown text.
  const [, setTick] = useState(0);

  const timersRef = useRef<Record<string, TimerState>>({});
  const endsRef = useRef<Record<string, number>>({});
  // Ids already handed to onExpire, so a tick and a foreground reconcile that
  // land in the same tick cannot report the same timer twice.
  const reportedRef = useRef<Set<string>>(new Set());
  // Latest callback, so the interval is not torn down and rebuilt on every
  // render just because the consumer passed a new closure.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const commit = useCallback(
    (nextTimers: Record<string, TimerState>, nextEnds: Record<string, number>) => {
      timersRef.current = nextTimers;
      endsRef.current = nextEnds;
      setTimers(nextTimers);
      setTimerEnds(nextEnds);
    },
    [],
  );

  /**
   * Removes all timer state for `id` without side effects. Callers that need
   * the notification cancelled or the task completed should do that themselves,
   * so this stays usable from plain "forget this timer" paths.
   */
  const clearTimer = useCallback(
    (id: string) => {
      reportedRef.current.delete(id);
      const nextTimers = { ...timersRef.current };
      delete nextTimers[id];
      const nextEnds = { ...endsRef.current };
      delete nextEnds[id];
      commit(nextTimers, nextEnds);
    },
    [commit],
  );

  /** Starts (or restarts) a timer. Returns the absolute end time, or null if rejected. */
  const start = useCallback(
    (id: string, duration: TimerState): number | null => {
      const seconds = toSeconds(duration);
      if (seconds <= 0) return null;

      const end = Date.now() + seconds * 1000;
      reportedRef.current.delete(id);
      commit(
        { ...timersRef.current, [id]: duration },
        { ...endsRef.current, [id]: end },
      );
      return end;
    },
    [commit],
  );

  /** Freezes the remaining time into `timers[id]` and stops the countdown. */
  const pause = useCallback(
    (id: string) => {
      const end = endsRef.current[id];
      if (end === undefined) return;

      const total = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const frozen = {
        hours: Math.floor(total / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
      } as TimerState;

      reportedRef.current.delete(id);
      const nextEnds = { ...endsRef.current };
      delete nextEnds[id];
      commit({ ...timersRef.current, [id]: frozen }, nextEnds);
    },
    [commit],
  );

  /** Restarts a paused timer from its frozen remainder. Returns the new end time. */
  const resume = useCallback(
    (id: string): number | null => {
      const remaining = timersRef.current[id];
      if (!remaining) return null;
      return start(id, remaining);
    },
    [start],
  );

  /**
   * Reports every timer whose end time has passed and removes it.
   *
   * This runs on the 1s tick *and* on foreground. The foreground pass is the
   * important one: if JS was suspended for ten minutes, the interval never ran,
   * so without this a timer that ended while the app was backgrounded would sit
   * at 00:00:00 and its task would never be completed.
   */
  const checkExpired = useCallback(() => {
    const now = Date.now();
    const expired = Object.keys(endsRef.current).filter(
      (id) => endsRef.current[id] <= now && !reportedRef.current.has(id),
    );
    if (expired.length === 0) return;

    for (const id of expired) {
      reportedRef.current.add(id);
    }
    onExpireRef.current(expired);

    const nextTimers = { ...timersRef.current };
    const nextEnds = { ...endsRef.current };
    for (const id of expired) {
      delete nextTimers[id];
      delete nextEnds[id];
    }
    commit(nextTimers, nextEnds);
  }, [commit]);

  const hasRunning = Object.keys(timerEnds).length > 0;

  useEffect(() => {
    // No active timers means no reason to keep the JS awake every second.
    if (!hasRunning) return;
    const interval = setInterval(() => {
      setTick((n) => n + 1);
      checkExpired();
    }, 1000);
    return () => clearInterval(interval);
  }, [hasRunning, checkExpired]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next !== 'active') return;
        setTick((n) => n + 1);
        checkExpired();
      },
    );
    return () => subscription.remove();
  }, [checkExpired]);

  /** Seconds left. Uses the frozen value when paused, live value when running. */
  const remainingSecondsFor = useCallback((id: string): number => {
    const end = endsRef.current[id];
    if (end !== undefined) {
      return Math.max(0, Math.ceil((end - Date.now()) / 1000));
    }
    return toSeconds(timersRef.current[id]);
  }, []);

  const hasTimer = useCallback((id: string): boolean => {
    return timersRef.current[id] !== undefined;
  }, []);

  const isRunning = useCallback((id: string): boolean => {
    return endsRef.current[id] !== undefined;
  }, []);

  return {
    timers,
    timerEnds,
    hasRunning,
    start,
    pause,
    resume,
    clearTimer,
    remainingSecondsFor,
    hasTimer,
    isRunning,
  };
}
