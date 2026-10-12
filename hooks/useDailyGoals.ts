import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_DAILY_GOALS, type DailyGoals } from '../daily-goals/goals';
import { loadDailyGoals, saveDailyGoals } from '../daily-goals/goalsStorage';

/**
 * The user's daily goals: state and persistence.
 *
 * Mirrors `./useCustomTags` — a plain hook, not a context, because the tile
 * that reads it is the only consumer. Hydration is one read on mount; writes are
 * explicit and fire-and-forget, since the in-memory value is already correct and
 * a failed write is survivable.
 */
export function useDailyGoals(): {
  goals: DailyGoals;
  setGoals: (next: DailyGoals) => void;
} {
  const [goals, setGoalsState] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);

  useEffect(() => {
    let active = true;
    loadDailyGoals().then((stored) => {
      // The component can unmount before the read resolves; dropping the result
      // then is cheaper than guarding a state update that no longer matters.
      if (active) setGoalsState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setGoals = useCallback((next: DailyGoals) => {
    setGoalsState(next);
    saveDailyGoals(next);
  }, []);

  return { goals, setGoals };
}
