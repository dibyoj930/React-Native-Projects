/**
 * Storage for plan outcomes (separate key to preserve history).
 *
 * Two things make this more than a JSON round-trip:
 *
 *   - **Sanitize on read.** AsyncStorage is user-writable on a rooted device, so
 *     a stored outcome is untrusted input. Anything malformed is dropped rather
 *     than allowed to flow into the review maths as `NaN` or a stray type.
 *   - **Windowed load.** Plan review only ever looks at a rolling 7 days. A
 *     helper that returns just those days keeps callers from pulling the whole
 *     history into memory to throw most of it away.
 *
 * Sanitizing here (the persistence edge) keeps every consumer honest: once data
 * is in a `PlanOutcome`, its shape is guaranteed, so no downstream code needs to
 * defend against it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isValidDayKey, type DayKey } from '../shared/date';
import { sanitizeCareerLink } from '../shared/careerLink';
import type {
  PlanOutcome,
  PlannedTaskResult,
  PlannedTaskResultStatus,
} from './types';

export const PLAN_OUTCOMES_KEY = '@replan-outcomes/v1';

export type PlanOutcomesStore = Record<string, PlanOutcome>;

const STATUSES: readonly PlannedTaskResultStatus[] = [
  'completed-on-time',
  'completed-late',
  'postponed',
  'missed',
  'ongoing',
  'infeasible',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNum(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sanitizeStatus(value: unknown): PlannedTaskResultStatus | null {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
    ? (value as PlannedTaskResultStatus)
    : null;
}

function sanitizeResult(value: unknown): PlannedTaskResult | null {
  if (!isRecord(value)) return null;
  const taskId = value.taskId;
  if (typeof taskId !== 'string' || taskId.length === 0) return null;
  const status = sanitizeStatus(value.status);
  if (!status) return null;
  const career = sanitizeCareerLink(value.career);
  return {
    taskId,
    taskText: optionalString(value.taskText),
    plannedStart: optionalNum(value.plannedStart),
    plannedEnd: optionalNum(value.plannedEnd),
    wasScheduled: value.wasScheduled === true,
    completed: value.completed === true,
    completedAt: optionalNum(value.completedAt),
    actualFocusSeconds: optionalNum(value.actualFocusSeconds),
    status,
    reason: optionalString(value.reason),
    ...(career ? { career } : {}),
  };
}

function sanitizeSummary(value: unknown): PlanOutcome['summary'] {
  const record = isRecord(value) ? value : {};
  return {
    totalPlanned: num(record.totalPlanned, 0),
    completed: num(record.completed, 0),
    completedOnTime: num(record.completedOnTime, 0),
    completedLate: num(record.completedLate, 0),
    postponed: num(record.postponed, 0),
    missed: num(record.missed, 0),
    totalPlannedFocusMins: optionalNum(record.totalPlannedFocusMins),
    totalActualFocusMins: optionalNum(record.totalActualFocusMins),
  };
}

function sanitizeOutcome(value: unknown): PlanOutcome | null {
  if (!isRecord(value)) return null;
  const dayKey = value.dayKey;
  if (!isValidDayKey(dayKey)) return null;

  const rawResults = Array.isArray(value.results) ? value.results : [];
  const results: PlannedTaskResult[] = [];
  for (const raw of rawResults) {
    const clean = sanitizeResult(raw);
    if (clean) results.push(clean);
  }

  return {
    dayKey,
    planApprovedAt: num(value.planApprovedAt, 0),
    generatedAt: num(value.generatedAt, 0),
    planSignature: optionalString(value.planSignature) ?? '',
    results,
    summary: sanitizeSummary(value.summary),
  };
}

export async function loadPlanOutcomes(): Promise<PlanOutcomesStore> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_OUTCOMES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const store: PlanOutcomesStore = {};
    for (const value of Object.values(parsed)) {
      const clean = sanitizeOutcome(value);
      if (clean) store[clean.dayKey] = clean;
    }
    return store;
  } catch {
    return {};
  }
}

/**
 * Only the outcomes for the given day keys.
 *
 * The loader keys every outcome by its own `dayKey`, so filtering on the store's
 * key set is the same as filtering on the outcome's day — and the requested
 * window, not a possibly hand-edited record, decides what is included.
 */
export async function loadPlanOutcomesForDays(
  dayKeys: readonly DayKey[],
): Promise<PlanOutcomesStore> {
  const wanted = new Set(dayKeys);
  const store = await loadPlanOutcomes();
  const windowed: PlanOutcomesStore = {};
  for (const [key, outcome] of Object.entries(store)) {
    if (wanted.has(key)) windowed[key] = outcome;
  }
  return windowed;
}

export async function savePlanOutcomes(store: PlanOutcomesStore): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAN_OUTCOMES_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export async function loadPlanOutcomeForDay(dayKey: string): Promise<PlanOutcome | null> {
  const store = await loadPlanOutcomes();
  return store[dayKey] ?? null;
}

export async function savePlanOutcomeForDay(outcome: PlanOutcome): Promise<void> {
  const store = await loadPlanOutcomes();
  store[outcome.dayKey] = outcome;
  await savePlanOutcomes(store);
}
