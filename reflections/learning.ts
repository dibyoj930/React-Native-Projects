/**
 * Estimate calibration from plan-vs-actual history (pure).
 *
 * The insight is simple: if a task was planned as a 30-minute block and took 55
 * minutes of focus, the estimate was too low. Across several such samples we can
 * suggest a better number — but a suggestion is only ever *advisory*. Nothing
 * here mutates a task; the caller decides whether the user asked for the change.
 *
 * Two levels of evidence, in priority order:
 *   1. The task's own completed history, when there is enough of it.
 *   2. A single window-wide planning factor (median actual/planned), used for
 *      tasks that are too new to have history of their own.
 *
 * The estimate source is the *placement duration* (`plannedMinutes`), not the
 * task's current `estimatedMinutes`. Using the current value would make the
 * ratio drift as the estimate is edited, so the same history could suggest
 * different things on different days.
 */

/** One day's evidence for one task. */
export type TaskDurationSample = {
  taskId: string;
  /** The estimate as planned that day, in minutes (the placement duration). */
  plannedMinutes: number;
  /** Focus actually recorded for the task that day, in minutes. */
  actualMinutes: number;
  /** Only completed work is evidence of how long the task really takes. */
  completed: boolean;
};

/** A suggested change to a task's estimate, with the reasoning behind it. */
export type EstimateAdjustment = {
  taskId: string;
  currentMinutes: number;
  suggestedMinutes: number;
  /** Multiplier applied to the estimate; actual / planned. */
  ratio: number;
  /** `'task'` when the task's own history drove it, `'window'` for the shared factor. */
  basis: 'task' | 'window';
};

export type CalibrationInput = {
  /** Estimate-vs-actual samples across the window (all days, all tasks). */
  samples: readonly TaskDurationSample[];
  /** Tasks that carry an estimate and could be adjusted. */
  candidates: readonly { taskId: string; estimatedMinutes: number }[];
  /** Completed samples needed before a window factor is offered at all. */
  minSamples?: number;
};

export type CalibrationResult = {
  /** Median actual/planned across completed samples, or null when too thin. */
  planningFactor: number | null;
  /** How many completed samples the factor was computed from. */
  sampleCount: number;
  adjustments: EstimateAdjustment[];
};

const DEFAULT_MIN_SAMPLES = 3;
/** A task needs this many of its own completed samples before it outranks the window. */
const TASK_BASIS_MIN_SAMPLES = 2;
/** Guardrails so one wild sample cannot push a ratio to something absurd. */
const MIN_RATIO = 0.25;
const MAX_RATIO = 4;
const MIN_SUGGESTED_MINUTES = 5;
const MAX_SUGGESTED_MINUTES = 480;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Median of a non-empty list. Sorts a copy so the caller's array is untouched. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function suggestAdjustments(input: CalibrationInput): CalibrationResult {
  const minSamples = input.minSamples ?? DEFAULT_MIN_SAMPLES;

  // Only usable pairs can say anything: a zero estimate gives no ratio, and a
  // day with no recorded focus is not evidence the task took no time.
  const usable = input.samples.filter(
    (s) => s.plannedMinutes > 0 && s.actualMinutes > 0,
  );
  const completedSamples = usable.filter((s) => s.completed);
  const sampleCount = completedSamples.length;

  const planningFactor =
    sampleCount >= minSamples
      ? clamp(
          median(completedSamples.map((s) => s.actualMinutes / s.plannedMinutes)),
          MIN_RATIO,
          MAX_RATIO,
        )
      : null;

  const adjustments: EstimateAdjustment[] = [];
  for (const candidate of input.candidates) {
    if (!(candidate.estimatedMinutes > 0)) continue;

    const own = completedSamples.filter((s) => s.taskId === candidate.taskId);
    let ratio: number | null = null;

    if (own.length >= TASK_BASIS_MIN_SAMPLES) {
      ratio = clamp(
        median(own.map((s) => s.actualMinutes / s.plannedMinutes)),
        MIN_RATIO,
        MAX_RATIO,
      );
    } else if (planningFactor !== null) {
      ratio = planningFactor;
    }

    if (ratio === null) continue;

    const suggestedMinutes = clamp(
      Math.round(candidate.estimatedMinutes * ratio),
      MIN_SUGGESTED_MINUTES,
      MAX_SUGGESTED_MINUTES,
    );
    // A "suggestion" that matches the current value is noise, not advice.
    if (suggestedMinutes === candidate.estimatedMinutes) continue;

    adjustments.push({
      taskId: candidate.taskId,
      currentMinutes: candidate.estimatedMinutes,
      suggestedMinutes,
      ratio,
      basis: own.length >= TASK_BASIS_MIN_SAMPLES ? 'task' : 'window',
    });
  }

  return { planningFactor, sampleCount, adjustments };
}
