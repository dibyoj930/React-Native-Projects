import type { DayKey } from '../productivity/domain';

export type EstimateAccuracy = 'yes' | 'mostly' | 'no' | 'unsure';

export type ReflectionEntry = {
  dayKey: DayKey;
  createdAt: number;
  completed: string[];
  moved: string[];
  estimatesAccurate: EstimateAccuracy;
  actualDurations?: Record<string, number>;
  notes?: string;
};

export type ReflectionsStore = Record<string, ReflectionEntry>;
