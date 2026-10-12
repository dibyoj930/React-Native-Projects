/**
 * Reason codes -> calm, human sentences.
 *
 * Pure and locale-free (built by hand, like formatTimeLabel in
 * todos/timeKey.ts:50 and the daily-goals copy). No guilt-inducing language, no
 * exclamation marks, no punctuation that scolds. This is the ONLY place the
 * replan feature turns machine reasons into words.
 *
 * Copy is a product decision: keep it here so it can be reviewed and tested
 * without rendering anything.
 */

import { formatTimeLabel, timeKeyFromDate } from '../todos/timeKey';
import type { Explanation, ReasonCode, TaskOutcome } from './types';

/**
 * One instant as a 12-hour clock label, e.g. `2:30 PM`.
 *
 * Built from the app's existing wall-clock helpers rather than
 * `toLocaleTimeString`, so the wording cannot drift between devices.
 */
export function formatClock(epochMs: number): string {
  return formatTimeLabel(timeKeyFromDate(new Date(epochMs)));
}

/** Read a numeric param, or `null` when it is missing or the wrong shape. */
function clockParam(
  params: Record<string, string | number> | undefined,
  key: string,
): string | null {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? formatClock(value) : null;
}

/** `2:00 PM-2:45 PM`, or a neutral fallback when the params are absent. */
function windowParam(params: Record<string, string | number> | undefined): string {
  const start = clockParam(params, 'start');
  const end = clockParam(params, 'end');
  if (start && end) return `${start}-${end}`;
  return 'a time that works';
}

/**
 * One calm sentence for a reason code.
 *
 * Unknown codes degrade to a neutral line rather than throwing: an explanation
 * is cosmetic, and a schedule must never fail to display over copy.
 */
export function describeExplanation(
  code: ReasonCode,
  params?: Record<string, string | number>,
): string {
  switch (code) {
    case 'scheduled':
      return `Planned for ${windowParam(params)}.`;
    case 'scheduled_after_commitment':
      return `After a fixed block, planned for ${windowParam(params)}.`;
    case 'moved': {
      const from = clockParam(params, 'from');
      const to = clockParam(params, 'to');
      if (from && to) return `Moved from ${from} to ${to}.`;
      return 'Moved to a new time.';
    }
    case 'kept':
      return 'Unchanged from your current plan.';
    case 'deferred_no_time':
      return 'No room left today; kept for another day.';
    case 'deferred_low_priority':
      return 'Lower priority, so left out for now.';
    case 'infeasible_deadline_passed':
      return 'Its time has passed; still on your list.';
    case 'infeasible_deadline_too_soon':
      return 'Not enough time before it is due.';
    case 'infeasible_no_free_time':
      return 'Does not fit in the time left today.';
    case 'needs_duration':
      return 'Add an estimated length to schedule this.';
    case 'conflicting_commitments':
      return 'Two fixed blocks overlap.';
    case 'completed':
    case 'active_timer':
    case 'fixed':
      return 'Already handled; left as is.';
    default:
      return 'Left as is.';
  }
}

/**
 * The machine-readable record one outcome produces, params as numbers so tests
 * can pin them (copy is applied later by `describeExplanation`).
 */
export function explainOutcome(
  outcome: TaskOutcome,
  plannedStartAt?: number,
): Explanation {
  const { taskId, reasonCode, start, end } = outcome;
  let params: Record<string, string | number> | undefined;
  if (reasonCode === 'scheduled' || reasonCode === 'scheduled_after_commitment') {
    params = { start: start ?? 0, end: end ?? 0 };
  } else if (reasonCode === 'moved') {
    params = { from: plannedStartAt ?? 0, to: start ?? 0 };
  }
  return { taskId, code: reasonCode, params };
}
