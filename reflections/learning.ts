/**
 * Learning utilities for reflections - pure domain.
 */
import type { ReflectionEntry } from './types';

export type EstimateAdjustment = {
  taskId: string;
  suggestedMinutes: number;
};

export function suggestAdjustments(entry: ReflectionEntry): EstimateAdjustment[] {
  const adjustments: EstimateAdjustment[] = [];
  if (!entry.actualDurations) return adjustments;
  for (const [taskId, mins] of Object.entries(entry.actualDurations)) {
    if (typeof mins === 'number' && mins > 0) {
      adjustments.push({ taskId, suggestedMinutes: Math.round(mins) });
    }
  }
  return adjustments;
}
