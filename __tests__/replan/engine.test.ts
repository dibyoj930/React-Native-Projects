/**
 * The scheduling engine.
 *
 * The reference scenario from the brief is the spine here: now 2:00 PM, day ends
 * 6:00 PM, one 4:00–4:30 PM commitment, a 10-minute buffer, one 15-minute break
 * after 60 minutes of work, and three tasks (45m high, 30m medium, 25m low).
 * Everything else pins a hard constraint the engine must never break.
 *
 * Times are built from the local clock, so the expected instants do not depend on
 * the suite's timezone.
 */

import { DEFAULT_REPLAN_PREFERENCES } from '../../replan/preferences';
import { buildReplanProposal, BREAK_ID } from '../../replan/engine';
import { normalizeReplanInput, type RawReplanInput } from '../../replan/normalize';
import type { Todo } from '../../todos/model';
import type { ProtectedInterval } from '../../replan/types';

const DAY = '2026-05-04';

/** Epoch ms for a local time on the fixed test day. */
function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'task',
    text: 'Task',
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

const COMMITMENT: ProtectedInterval = {
  id: 'standup',
  kind: 'commitment',
  start: at(16, 0),
  end: at(16, 30),
};

function build(overrides: Partial<RawReplanInput> = {}) {
  const raw: RawReplanInput = {
    now: at(14, 0),
    day: DAY,
    workday: { start: at(9, 0), end: at(18, 0) },
    todos: [
      todo({ id: 'report', text: 'Project report', estimatedMinutes: 45, priority: 'high' }),
      todo({ id: 'prs', text: 'Review PRs', estimatedMinutes: 30, priority: 'medium' }),
      todo({ id: 'notes', text: 'Prepare notes', estimatedMinutes: 25, priority: 'low' }),
    ],
    timerWindows: [],
    preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    commitments: [COMMITMENT],
    busy: [],
    ...overrides,
  };
  return buildReplanProposal(normalizeReplanInput(raw));
}

/** A placement as a compact, readable tuple. */
function blocks(proposal: ReturnType<typeof build>) {
  return proposal.placements.map((placement) => [
    placement.kind === 'break' ? 'break' : placement.taskId,
    placement.start,
    placement.end,
  ]);
}

describe('buildReplanProposal — the reference scenario', () => {
  it('spreads the three tasks and the break across the free time', () => {
    // No longer front-loaded: the work is distributed between now and the end
    // of the day, with the commitment skipped and blocks kept in order.
    expect(blocks(build())).toEqual([
      ['report', at(14, 0), at(14, 45)],
      ['prs', at(15, 9), at(15, 39)],
      ['break', at(16, 33), at(16, 48)],
      ['notes', at(17, 12), at(17, 37)],
    ]);
  });

  it('does not leave a large tail idle', () => {
    const proposal = build();
    const last = proposal.placements[proposal.placements.length - 1];
    expect(last.end).toBe(at(17, 37));
    // The old front-loaded plan finished at 4:55 PM and left 65 minutes empty.
    expect(at(18, 0) - last.end).toBeLessThan(60 * 60_000);
  });

  it('places a task that fits only after a commitment with the matching code', () => {
    const lunch: ProtectedInterval = {
      id: 'lunch',
      kind: 'commitment',
      start: at(14, 30),
      end: at(15, 0),
    };
    const proposal = build({
      commitments: [lunch],
      todos: [todo({ id: 'after', estimatedMinutes: 45, priority: 'high' })],
    });
    const outcome = proposal.outcomes.find((entry) => entry.taskId === 'after');
    expect(outcome).toMatchObject({
      classification: 'scheduled',
      reasonCode: 'scheduled_after_commitment',
      start: at(15, 0),
      end: at(15, 45),
    });
  });

  it('produces a clean validation result', () => {
    expect(build().validation).toEqual({ ok: true, violations: [] });
  });
});

describe('buildReplanProposal — mode B (protect)', () => {
  it('defers a low-priority task even when it would fit', () => {
    const proposal = build({
      preferences: {
        ...DEFAULT_REPLAN_PREFERENCES,
        mode: 'protect',
        lowPriorityDeferral: true,
      },
    });
    const notes = proposal.outcomes.find((entry) => entry.taskId === 'notes');
    expect(notes).toMatchObject({
      classification: 'deferred',
      reasonCode: 'deferred_low_priority',
    });
    expect(proposal.placements.some((placement) => placement.taskId === 'notes')).toBe(false);
    expect(proposal.validation.ok).toBe(true);
  });
});

describe('buildReplanProposal — hard constraints', () => {
  it('reports a deadline that has already passed as infeasible', () => {
    const proposal = build({
      todos: [todo({ id: 'late', estimatedMinutes: 30, dueDate: DAY, dueTime: '13:00' })],
    });
    expect(proposal.outcomes[0]).toMatchObject({
      classification: 'infeasible',
      reasonCode: 'infeasible_deadline_passed',
    });
    expect(proposal.placements).toEqual([]);
  });

  it('reports a deadline that cannot be met as too soon', () => {
    const proposal = build({
      todos: [todo({ id: 'rush', estimatedMinutes: 30, dueDate: DAY, dueTime: '14:20' })],
    });
    expect(proposal.outcomes[0].reasonCode).toBe('infeasible_deadline_too_soon');
  });

  it('never starts a block in the past', () => {
    const proposal = build({
      now: at(14, 30),
      todos: [todo({ id: 'one', estimatedMinutes: 20 })],
    });
    expect(proposal.placements[0].start).toBe(at(14, 30));
  });

  it('preserves a completed task untouched', () => {
    const proposal = build({ todos: [todo({ id: 'done', completed: true })] });
    expect(proposal.outcomes[0]).toMatchObject({
      classification: 'protected',
      reasonCode: 'completed',
    });
    expect(proposal.unchangedTaskIds).toEqual(['done']);
  });

  it('protects a task with a running timer', () => {
    const proposal = build({
      todos: [todo({ id: 'timed', estimatedMinutes: 30 })],
      timerWindows: [{ taskId: 'timed', start: at(13, 45), end: at(14, 15) }],
    });
    expect(proposal.outcomes[0]).toMatchObject({
      classification: 'protected',
      reasonCode: 'active_timer',
    });
    expect(proposal.placements).toEqual([]);
  });

  it('marks a task with no estimate as needing information, never guessing', () => {
    const proposal = build({ todos: [todo({ id: 'vague', text: 'Read that thing' })] });
    expect(proposal.outcomes[0]).toMatchObject({
      classification: 'needsInformation',
      reasonCode: 'needs_duration',
    });
    expect(proposal.placements).toEqual([]);
  });

  it('defers a task with no room and no deadline', () => {
    const proposal = build({
      now: at(17, 45),
      todos: [todo({ id: 'big', estimatedMinutes: 60 })],
    });
    expect(proposal.outcomes[0]).toMatchObject({
      classification: 'deferred',
      reasonCode: 'deferred_no_time',
    });
  });

  it('reports a task with a deadline and no free window as infeasible', () => {
    const proposal = build({
      now: at(17, 30),
      todos: [todo({ id: 'cutoff', estimatedMinutes: 20, dueDate: DAY, dueTime: '17:45' })],
    });
    expect(proposal.outcomes[0]).toMatchObject({
      classification: 'infeasible',
      reasonCode: 'infeasible_deadline_too_soon',
    });
  });

  it('never overlaps a placed task with a commitment', () => {
    const lunch: ProtectedInterval = {
      id: 'lunch',
      kind: 'commitment',
      start: at(14, 30),
      end: at(15, 0),
    };
    const proposal = build({
      commitments: [COMMITMENT, lunch],
      todos: [todo({ id: 'one', estimatedMinutes: 45 })],
    });
    expect(proposal.validation.ok).toBe(true);
    const [placement] = proposal.placements;
    for (const interval of [COMMITMENT, lunch]) {
      const overlaps = placement.start < interval.end && interval.start < placement.end;
      expect(overlaps).toBe(false);
    }
    // A 45-minute task cannot fit before 2:30 PM (now is 2:00 PM with a buffer),
    // so it lands in the window after lunch.
    expect(placement.start).toBe(at(15, 0));
  });
});

describe('buildReplanProposal — kept and moved', () => {
  it('keeps a task whose approved start is unchanged', () => {
    const plan = {
      dayKey: DAY,
      approvedAt: at(13, 0),
      signature: 'sig',
      placements: [{ taskId: 'report', start: at(14, 0), end: at(14, 45) }],
    };
    const proposal = build({ approvedPlan: plan });
    const outcome = proposal.outcomes.find((entry) => entry.taskId === 'report');
    expect(outcome?.reasonCode).toBe('kept');
  });

  it('keeps a task whose approved start is still near the balanced position', () => {
    // 15:00 is within one gap of the balanced target, so stability wins and the
    // placement is preserved rather than churned.
    const plan = {
      dayKey: DAY,
      approvedAt: at(13, 0),
      signature: 'sig',
      placements: [{ taskId: 'report', start: at(15, 0), end: at(15, 45) }],
    };
    const proposal = build({
      todos: [todo({ id: 'report', text: 'Project report', estimatedMinutes: 45, priority: 'high' })],
      approvedPlan: plan,
    });
    const outcome = proposal.outcomes.find((entry) => entry.taskId === 'report');
    expect(outcome).toMatchObject({ reasonCode: 'kept', start: at(15, 0) });
  });

  it('moves a task whose approved start no longer fits (blocked by a commitment)', () => {
    const plan = {
      dayKey: DAY,
      approvedAt: at(13, 0),
      signature: 'sig',
      // Ends inside the 4:00-4:30 commitment, so it cannot be honoured.
      placements: [{ taskId: 'report', start: at(15, 55), end: at(16, 40) }],
    };
    const proposal = build({ approvedPlan: plan });
    const outcome = proposal.outcomes.find((entry) => entry.taskId === 'report');
    expect(outcome?.reasonCode).toBe('moved');
  });
});

describe('buildReplanProposal — determinism', () => {
  it('is independent of the order tasks arrive in', () => {
    const forward = build();
    const reversed = build({
      todos: [
        todo({ id: 'notes', text: 'Prepare notes', estimatedMinutes: 25, priority: 'low' }),
        todo({ id: 'prs', text: 'Review PRs', estimatedMinutes: 30, priority: 'medium' }),
        todo({ id: 'report', text: 'Project report', estimatedMinutes: 45, priority: 'high' }),
      ],
    });
    expect(blocks(reversed)).toEqual(blocks(forward));
  });

  it('treats an absent priority as low', () => {
    const withAbsent = build({
      todos: [
        todo({ id: 'a', estimatedMinutes: 30 }),
        todo({ id: 'b', estimatedMinutes: 30, priority: 'high' }),
      ],
    });
    // The high-priority task goes first regardless of declaration order.
    expect(withAbsent.placements[0].taskId).toBe('b');
  });
});

describe('buildReplanProposal — the break', () => {
  it('places no break when the work never reaches the threshold', () => {
    const proposal = build({ todos: [todo({ id: 'short', estimatedMinutes: 20 })] });
    expect(proposal.placements.some((placement) => placement.taskId === BREAK_ID)).toBe(false);
  });

  it('places no break when breaks are switched off', () => {
    const proposal = build({
      preferences: { ...DEFAULT_REPLAN_PREFERENCES, breakMinutes: 0 },
    });
    expect(proposal.placements.some((placement) => placement.taskId === BREAK_ID)).toBe(false);
  });
});
