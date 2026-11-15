/**
 * Reason codes -> calm sentences, and the clock label they use.
 *
 * Copy is a product decision, so it is pinned exactly: no exclamation marks, no
 * scolding, and the same `H:MM AM/PM` label the rest of the app shows.
 */

import { describeExplanation, explainOutcome, formatClock } from '../../replan/explain';
import type { TaskOutcome } from '../../replan/types';

/** 4 May 2026 at `hours:minutes` local. */
function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

describe('formatClock', () => {
  it('prints a 12-hour label without leading zeros', () => {
    expect(formatClock(at(14, 0))).toBe('2:00 PM');
    expect(formatClock(at(9, 5))).toBe('9:05 AM');
    expect(formatClock(at(0, 0))).toBe('12:00 AM');
    expect(formatClock(at(12, 30))).toBe('12:30 PM');
  });
});

describe('describeExplanation', () => {
  it('describes a scheduled window from numeric params', () => {
    expect(describeExplanation('scheduled', { start: at(14, 0), end: at(14, 45) })).toBe(
      'Planned for 2:00 PM-2:45 PM.',
    );
  });

  it('describes a moved task with both endpoints', () => {
    expect(describeExplanation('moved', { from: at(15, 0), to: at(14, 0) })).toBe(
      'Moved from 3:00 PM to 2:00 PM.',
    );
  });

  it('has calm copy for every deferral and infeasibility', () => {
    expect(describeExplanation('deferred_no_time')).toBe(
      'No room left today; kept for another day.',
    );
    expect(describeExplanation('deferred_low_priority')).toBe(
      'Lower priority, so left out for now.',
    );
    expect(describeExplanation('infeasible_deadline_passed')).toBe(
      'Its time has passed; still on your list.',
    );
    expect(describeExplanation('infeasible_deadline_too_soon')).toBe(
      'Not enough time before it is due.',
    );
    expect(describeExplanation('infeasible_no_free_time')).toBe(
      'Does not fit in the time left today.',
    );
    expect(describeExplanation('needs_duration')).toBe(
      'Add an estimated length to schedule this.',
    );
  });

  it('never scolds and never uses an exclamation mark', () => {
    const codes = [
      'scheduled',
      'deferred_no_time',
      'infeasible_deadline_passed',
      'needs_duration',
      'conflicting_commitments',
      'completed',
    ] as const;
    for (const code of codes) {
      expect(describeExplanation(code)).not.toContain('!');
    }
  });
});

describe('explainOutcome', () => {
  const outcome = (overrides: Partial<TaskOutcome>): TaskOutcome => ({
    taskId: 't1',
    classification: 'scheduled',
    reasonCode: 'scheduled',
    ...overrides,
  });

  it('carries the window for a scheduled task', () => {
    expect(
      explainOutcome(outcome({ start: at(14, 0), end: at(14, 45) })),
    ).toEqual({
      taskId: 't1',
      code: 'scheduled',
      params: { start: at(14, 0), end: at(14, 45) },
    });
  });

  it('uses the earlier planned start for a moved task', () => {
    expect(explainOutcome(outcome({ reasonCode: 'moved', start: at(14, 0) }), at(15, 0))).toEqual({
      taskId: 't1',
      code: 'moved',
      params: { from: at(15, 0), to: at(14, 0) },
    });
  });

  it('attaches no params to a plain explanation', () => {
    expect(explainOutcome(outcome({ reasonCode: 'deferred_no_time' }))).toEqual({
      taskId: 't1',
      code: 'deferred_no_time',
      params: undefined,
    });
  });
});
