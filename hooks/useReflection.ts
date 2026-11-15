/**
 * Controller for end-of-day reflection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayKey } from '../productivity/domain';
import type { ReflectionEntry } from '../reflections';
import { loadReflectionForDay, saveReflectionForDay } from '../reflections';
import { todayKey } from '../productivity';
import { useNow } from './useNow';

export type ReflectionController = {
  reflection: ReflectionEntry | null;
  canReflect: boolean;
  submit: (entry: Partial<ReflectionEntry>) => Promise<void>;
  dismiss: () => void;
  hasReflectedToday: boolean;
};

export type UseReflectionArgs = {
  hydrated: boolean;
  dayKey?: DayKey;
  workdayEnd: string;
  anyTimerRunning: boolean;
  hasPlanToday?: boolean;
  taskCount?: number;
};

function hourOnDay(day: string, hourStr: string): number {
  const [h, m] = hourStr.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h || 0, m || 0, 0, 0).getTime();
}

export function useReflection(args: UseReflectionArgs): ReflectionController {
  const { hydrated, workdayEnd, anyTimerRunning, hasPlanToday, taskCount } = args;
  const day = args.dayKey || todayKey();
  const now = useNow();
  const [reflection, setReflection] = useState<ReflectionEntry | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    loadReflectionForDay(day).then((r) => {
      if (!cancelled) setReflection(r);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, day]);

  const hasReflectedToday = reflection !== null;

  const canReflect = useMemo(() => {
    if (!hydrated || anyTimerRunning || dismissed || hasReflectedToday) return false;
    const end = hourOnDay(day, workdayEnd);
    // End of day only: the last 15 minutes of the workday or later. A reflection
    // asked for at 10am is a nag, not a reflection.
    const pastEnd = now >= end - 15 * 60 * 1000;
    const hasActivity = !!hasPlanToday || (taskCount ?? 0) > 0;
    return pastEnd && hasActivity;
  }, [hydrated, anyTimerRunning, dismissed, hasReflectedToday, day, workdayEnd, hasPlanToday, taskCount, now]);

  const submit = useCallback(
    async (entry: Partial<ReflectionEntry>) => {
      const full: ReflectionEntry = {
        dayKey: day,
        createdAt: Date.now(),
        completed: entry.completed ?? [],
        moved: entry.moved ?? [],
        estimatesAccurate: entry.estimatesAccurate ?? 'unsure',
        actualDurations: entry.actualDurations,
        notes: entry.notes,
      };
      await saveReflectionForDay(full);
      setReflection(full);
    },
    [day],
  );

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return { reflection, canReflect, submit, dismiss, hasReflectedToday };
}
