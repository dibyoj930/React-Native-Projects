/**
 * Small formatting helpers shared by career screens.
 *
 * Day keys are local calendar dates. They are turned into a date for display
 * only; no date arithmetic happens here.
 */

import { localDateFromDayKey, type DayKey } from '../shared/date';

export function formatCareerDate(key: DayKey | undefined, fallback = 'No date'): string {
  if (!key) return fallback;
  return localDateFromDayKey(key).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDayKeyShort(key: DayKey | undefined, fallback = '—'): string {
  if (!key) return fallback;
  return localDateFromDayKey(key).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
