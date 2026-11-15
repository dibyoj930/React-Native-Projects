/**
 * Whole-proposal validation — the safety net under the placement loop.
 *
 * Each case hands validation a deliberately broken proposal and asks it to name
 * the break, because the point of the validator is to catch what the engine got
 * wrong rather than to agree with it.
 */

import { assertNoViolations, validateSchedule } from '../../replan/validate';
import { DEFAULT_REPLAN_PREFERENCES } from '../../replan/preferences';
import type {
  Placement,
  ReplanInput,
  ReplanProposal,
  TaskOutcome,
} from '../../replan/types';

function input(overrides: Partial<ReplanInput> = {}): ReplanInput {
  return {
    now: 0,
    day: '2026-05-04',
    workday: { start: 0, end: 600_000 },
    tasks: [],
    commitments: [],
    busy: [],
    preferences: { ...DEFAULT_REPLAN_PREFERENCES, bufferMinutes: 0 },
    signature: 'sig',
    ...overrides,
  };
}

function proposal(
  placements: Placement[],
  outcomes: TaskOutcome[] = [],
): ReplanProposal {
  return {
    generatedAt: 0,
    signature: 'sig',
    mode: 'fit',
    placements,
    outcomes,
    explanations: [],
    unchangedTaskIds: [],
    validation: { ok: true, violations: [] },
  };
}

function codes(result: { violations: { code: string }[] }): string[] {
  return result.violations.map((violation) => violation.code);
}

describe('validateSchedule', () => {
  it('passes a clean, ordered proposal', () => {
    const result = validateSchedule(
      proposal([{ taskId: 'a', start: 0, end: 60_000, kind: 'task' }], [
        { taskId: 'a', classification: 'scheduled', reasonCode: 'scheduled', start: 0, end: 60_000 },
      ]),
      input(),
    );
    expect(result).toEqual({ ok: true, violations: [] });
  });

  it('flags a placement that starts before now', () => {
    const result = validateSchedule(
      proposal([{ taskId: 'a', start: 0, end: 60_000, kind: 'task' }], [
        { taskId: 'a', classification: 'scheduled', reasonCode: 'scheduled', start: 0, end: 60_000 },
      ]),
      input({ now: 30_000 }),
    );
    expect(codes(result)).toContain('starts_in_past');
  });

  it('flags a placement outside the workday', () => {
    const result = validateSchedule(
      proposal([{ taskId: 'a', start: 0, end: 900_000, kind: 'task' }], []),
      input(),
    );
    expect(codes(result)).toContain('outside_workday');
  });

  it('flags overlapping placements', () => {
    const result = validateSchedule(
      proposal([
        { taskId: 'a', start: 0, end: 60_000, kind: 'task' },
        { taskId: 'b', start: 30_000, end: 90_000, kind: 'task' },
      ]),
      input(),
    );
    expect(codes(result)).toContain('overlap');
  });

  it('flags a placement that overlaps a commitment', () => {
    const result = validateSchedule(
      proposal([{ taskId: 'a', start: 0, end: 60_000, kind: 'task' }], []),
      input({
        commitments: [{ id: 'c', kind: 'commitment', start: 30_000, end: 90_000 }],
      }),
    );
    expect(codes(result)).toContain('overlaps_protected');
  });

  it('flags blocks that are closer than the buffer', () => {
    const result = validateSchedule(
      proposal([
        { taskId: 'a', start: 0, end: 60_000, kind: 'task' },
        { taskId: 'b', start: 60_000, end: 120_000, kind: 'task' },
      ]),
      input({ preferences: { ...DEFAULT_REPLAN_PREFERENCES, bufferMinutes: 10 } }),
    );
    expect(codes(result)).toContain('missing_buffer');
  });

  it('allows a zero gap when a commitment separates the blocks', () => {
    const result = validateSchedule(
      proposal([
        { taskId: 'a', start: 0, end: 60_000, kind: 'task' },
        { taskId: 'b', start: 120_000, end: 180_000, kind: 'task' },
      ]),
      input({
        preferences: { ...DEFAULT_REPLAN_PREFERENCES, bufferMinutes: 10 },
        commitments: [{ id: 'c', kind: 'commitment', start: 60_000, end: 120_000 }],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('flags a scheduled task that ends after its deadline', () => {
    const result = validateSchedule(
      proposal([{ taskId: 'a', start: 0, end: 60_000, kind: 'task' }], [
        { taskId: 'a', classification: 'scheduled', reasonCode: 'scheduled', start: 0, end: 60_000 },
      ]),
      input({
        tasks: [
          { id: 'a', text: 'a', completed: false, hasActiveTimer: false, deadlineAt: 30_000 },
        ],
      }),
    );
    expect(codes(result)).toContain('past_deadline');
  });

  it('flags a scheduled outcome with no placement', () => {
    const result = validateSchedule(
      proposal([], [{ taskId: 'a', classification: 'scheduled', reasonCode: 'scheduled' }]),
      input(),
    );
    expect(codes(result)).toContain('scheduled_without_placement');
  });

  it('flags a placement for a task that is not scheduled', () => {
    const result = validateSchedule(
      proposal([{ taskId: 'a', start: 0, end: 60_000, kind: 'task' }], [
        { taskId: 'a', classification: 'deferred', reasonCode: 'deferred_no_time' },
      ]),
      input(),
    );
    expect(codes(result)).toContain('placement_without_schedule');
  });
});

describe('assertNoViolations', () => {
  it('is silent for a clean result', () => {
    expect(() => assertNoViolations({ ok: true, violations: [] })).not.toThrow();
  });

  it('throws with the violation messages when broken', () => {
    expect(() =>
      assertNoViolations({
        ok: false,
        violations: [{ code: 'x', message: 'something broke' }],
      }),
    ).toThrow('something broke');
  });
});
