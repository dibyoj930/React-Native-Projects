/**
 * Scheduling scenarios.
 *
 * These are end-to-end through the real engine (normalize -> rank -> place ->
 * classify -> validate). They pin the *behaviour* the brief asks for, not just
 * single blocks:
 *
 *   A  a plain workday is spread out instead of front-loaded
 *   B  a midday commitment splits the day and both sides are used
 *   C  tight availability: work tucks into every gap, never overlapping
 *   D  a hard deadline outranks priority (no invented infeasibility)
 *   E  an approved plan is kept when it is still reasonable, moved when not
 *   F  too little time: the engine says so honestly rather than overlapping
 *   G  identical input -> identical output, whatever order tasks arrive in
 *   H  break and buffer edges: never over a commitment, never closer than the buffer
 *
 * Invariants (`valid` / `no overlap` / `block buffer`) are checked everywhere; a
 * few scenarios also pin exact times, derived by hand in the comments.
 */

import { DEFAULT_REPLAN_PREFERENCES } from '../../replan/preferences';
import { buildReplanProposal, BREAK_ID } from '../../replan/engine';
import { normalizeReplanInput, type RawReplanInput } from '../../replan/normalize';
import type { ProtectedInterval, ReplanProposal } from '../../replan/types';
import type { Todo } from '../../todos/model';

const DAY = '2026-05-04';
const MINUTE = 60_000;

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

function commitment(id: string, start: number, end: number): ProtectedInterval {
  return { id, kind: 'commitment', start, end };
}

function build(overrides: Partial<RawReplanInput> = {}): ReplanProposal {
  const raw: RawReplanInput = {
    now: at(9, 0),
    day: DAY,
    workday: { start: at(9, 0), end: at(18, 0) },
    todos: [],
    timerWindows: [],
    preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    commitments: [],
    busy: [],
    ...overrides,
  };
  return buildReplanProposal(normalizeReplanInput(raw));
}

/** A placement as a compact, readable tuple. */
function blockTuple(proposal: ReplanProposal): Array<[string, number, number]> {
  return proposal.placements.map((placement) => [
    placement.kind === 'break' ? BREAK_ID : placement.taskId,
    placement.start,
    placement.end,
  ]);
}

function taskPlacements(proposal: ReplanProposal) {
  return proposal.placements.filter((placement) => placement.kind === 'task');
}

/** The engine must always ship a clean schedule. */
function expectValid(proposal: ReplanProposal) {
  expect(proposal.validation.violations).toEqual([]);
  expect(proposal.validation.ok).toBe(true);
}

/** No two placements may overlap in time. */
function expectNoOverlap(proposal: ReplanProposal) {
  const ordered = [...proposal.placements].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i += 1) {
    expect(ordered[i].start).toBeGreaterThanOrEqual(ordered[i - 1].end);
  }
}

/**
 * The buffer is required between adjacent *blocks* (tasks and the break). A
 * commitment filling the gap is the documented exception. This mirrors
 * `validate.ts` so a regression in either shows up here.
 */
function expectBlockBuffer(
  proposal: ReplanProposal,
  commitments: readonly ProtectedInterval[],
  bufferMinutes = 10,
) {
  const ordered = [...proposal.placements].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = ordered[i].start - ordered[i - 1].end;
    if (gap >= bufferMinutes * MINUTE) continue;
    const spanned = commitments.some(
      (interval) => interval.start >= ordered[i - 1].end && interval.end <= ordered[i].start,
    );
    expect(spanned).toBe(true);
  }
}

describe('A — a plain workday is spread out', () => {
  const todos = [
    todo({ id: 'a', text: 'Focus block', estimatedMinutes: 60, priority: 'high' }),
    todo({ id: 'b', text: 'Secondary', estimatedMinutes: 30, priority: 'medium' }),
    todo({ id: 'c', text: 'Admin', estimatedMinutes: 25, priority: 'low' }),
  ];

  it('places the work across the morning and early afternoon, not all at 9am', () => {
    const proposal = build({ todos });
    expectValid(proposal);
    expectNoOverlap(proposal);
    expectBlockBuffer(proposal, []);
    // work 60+30+25+break15 = 130; F=540; horizon=min(540,130+270)=400; slack 270;
    // 4 blocks => gap 68. a@9:00, break@11:08, b@12:31, c@14:09.
    expect(blockTuple(proposal)).toEqual([
      ['a', at(9, 0), at(10, 0)],
      [BREAK_ID, at(11, 8), at(11, 23)],
      ['b', at(12, 31), at(13, 1)],
      ['c', at(14, 9), at(14, 34)],
    ]);
  });

  it('keeps the last block out of the crowded first hour', () => {
    const proposal = build({ todos });
    const last = taskPlacements(proposal).at(-1)!;
    // The old greedy cursor finished all work before ~11:00.
    expect(last.start).toBeGreaterThan(at(13, 0));
  });
});

describe('B — a midday commitment splits the day', () => {
  it('uses both sides of the commitment and never overlaps it', () => {
    const lunch = commitment('lunch', at(12, 0), at(13, 0));
    const proposal = build({
      todos: [
        todo({ id: 'report', estimatedMinutes: 45, priority: 'high' }),
        todo({ id: 'prs', estimatedMinutes: 30, priority: 'medium' }),
      ],
      commitments: [lunch],
    });
    expectValid(proposal);
    expectNoOverlap(proposal);
    expectBlockBuffer(proposal, [lunch]);

    const before = taskPlacements(proposal).filter((placement) => placement.end <= lunch.start);
    const after = proposal.placements.filter((placement) => placement.start >= lunch.end);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const placement of proposal.placements) {
      expect(placement.end <= lunch.start || placement.start >= lunch.end).toBe(true);
    }
  });
});

describe('C — tight availability tucks work into every gap', () => {
  const commitments = [
    commitment('c1', at(9, 30), at(10, 30)),
    commitment('c2', at(12, 0), at(13, 0)),
    commitment('c3', at(15, 0), at(16, 0)),
  ];

  it('schedules every task around the commitments', () => {
    const proposal = build({
      todos: [
        todo({ id: 'x', estimatedMinutes: 60, priority: 'high' }),
        todo({ id: 'y', estimatedMinutes: 45, priority: 'medium' }),
        todo({ id: 'z', estimatedMinutes: 40, priority: 'low' }),
      ],
      commitments,
    });
    expectValid(proposal);
    expectNoOverlap(proposal);
    expectBlockBuffer(proposal, commitments);
    for (const id of ['x', 'y', 'z']) {
      expect(proposal.outcomes.find((outcome) => outcome.taskId === id)?.classification).toBe(
        'scheduled',
      );
    }
  });

  it('rules out a task that genuinely cannot fit any gap', () => {
    const walls = [
      commitment('c1', at(9, 0), at(10, 0)),
      commitment('c2', at(11, 0), at(12, 0)),
      commitment('c3', at(13, 0), at(14, 0)),
      commitment('c4', at(15, 0), at(16, 0)),
      commitment('c5', at(17, 0), at(18, 0)),
    ];
    const proposal = build({
      todos: [todo({ id: 'huge', estimatedMinutes: 120, priority: 'high' })],
      commitments: walls,
    });
    expectValid(proposal);
    expect(proposal.outcomes.find((outcome) => outcome.taskId === 'huge')?.classification).toBe(
      'deferred',
    );
  });
});

describe('D — a hard deadline outranks priority', () => {
  it('places an urgent low-priority task before a non-urgent high-priority one', () => {
    const proposal = build({
      todos: [
        todo({ id: 'H', estimatedMinutes: 120, priority: 'high' }),
        todo({
          id: 'L',
          estimatedMinutes: 60,
          priority: 'low',
          dueDate: DAY,
          dueTime: '11:30',
        }),
      ],
    });
    expectValid(proposal);
    expectNoOverlap(proposal);

    const l = proposal.placements.find((placement) => placement.taskId === 'L')!;
    const h = proposal.placements.find((placement) => placement.taskId === 'H')!;
    expect(l.end).toBeLessThanOrEqual(at(11, 30));
    expect(l.start).toBeLessThan(h.start);
    expect(proposal.outcomes.find((outcome) => outcome.taskId === 'L')?.classification).toBe(
      'scheduled',
    );
    expect(proposal.outcomes.find((outcome) => outcome.taskId === 'H')?.classification).toBe(
      'scheduled',
    );
  });
});

describe('E — an approved plan is respected', () => {
  it('keeps approved starts that are still near the balanced plan', () => {
    const proposal = build({
      now: at(14, 0),
      todos: [
        todo({ id: 'near', estimatedMinutes: 45, priority: 'high' }),
        todo({ id: 'far', estimatedMinutes: 30, priority: 'medium' }),
      ],
      approvedPlan: {
        dayKey: DAY,
        approvedAt: at(13, 0),
        signature: 'sig',
        placements: [
          { taskId: 'near', start: at(14, 5), end: at(14, 50) },
          { taskId: 'far', start: at(15, 30), end: at(16, 0) },
        ],
      },
    });
    expectValid(proposal);
    expect(proposal.outcomes.find((outcome) => outcome.taskId === 'near')?.reasonCode).toBe('kept');
    expect(proposal.outcomes.find((outcome) => outcome.taskId === 'far')?.reasonCode).toBe('kept');
  });

  it('is an identity operation when regenerating an already-spread plan', () => {
    const todos = [
      todo({ id: 'report', text: 'Project report', estimatedMinutes: 45, priority: 'high' }),
      todo({ id: 'prs', text: 'Review PRs', estimatedMinutes: 30, priority: 'medium' }),
      todo({ id: 'notes', text: 'Prepare notes', estimatedMinutes: 25, priority: 'low' }),
    ];
    const first = build({ todos });
    const plan = {
      dayKey: DAY,
      approvedAt: first.generatedAt,
      signature: first.signature,
      placements: taskPlacements(first).map((placement) => ({
        taskId: placement.taskId,
        start: placement.start,
        end: placement.end,
      })),
    };
    const second = build({ todos, approvedPlan: plan });
    expectNoOverlap(second);
    expect(second.placements).toEqual(first.placements);
    for (const outcome of second.outcomes) {
      expect(outcome.reasonCode).toBe('kept');
    }
  });
});

describe('F — too little time is reported honestly', () => {
  it('schedules what fits and defers the rest without overlapping', () => {
    const proposal = build({
      now: at(16, 0),
      todos: [
        todo({ id: 'big', estimatedMinutes: 90, priority: 'high' }),
        todo({ id: 'big2', estimatedMinutes: 90, priority: 'medium' }),
      ],
    });
    expectValid(proposal);
    expectNoOverlap(proposal);

    const scheduled = taskPlacements(proposal);
    expect(scheduled.map((placement) => placement.taskId)).toEqual(['big']);
    expect(proposal.outcomes.find((outcome) => outcome.taskId === 'big2')?.classification).toBe(
      'deferred',
    );
    const scheduledMinutes = scheduled.reduce(
      (total, placement) => total + (placement.end - placement.start) / MINUTE,
      0,
    );
    expect(scheduledMinutes).toBeLessThanOrEqual(120);
    for (const placement of proposal.placements) {
      expect(placement.start).toBeGreaterThanOrEqual(at(16, 0));
    }
  });
});

describe('G — determinism', () => {
  const todos = [
    todo({ id: 'a', estimatedMinutes: 40, priority: 'low' }),
    todo({ id: 'b', estimatedMinutes: 25, priority: 'high' }),
    todo({ id: 'c', estimatedMinutes: 50, priority: 'medium', dueDate: DAY, dueTime: '15:00' }),
  ];

  it('produces identical output for identical input', () => {
    const one = build({ todos });
    const two = build({ todos });
    expect(two.placements).toEqual(one.placements);
    expect(two.outcomes).toEqual(one.outcomes);
    expect(two.explanations).toEqual(one.explanations);
  });

  it('is independent of the order tasks arrive in', () => {
    const inOrder = build({ todos });
    const reversed = build({ todos: [...todos].reverse() });
    // Placements are time-ordered; outcomes are keyed on the input order, so
    // compare them as a map to assert the *content* is shuffle-invariant.
    expect(reversed.placements).toEqual(inOrder.placements);
    const outcomeMap = (proposal: ReplanProposal) =>
      Object.fromEntries(proposal.outcomes.map((outcome) => [outcome.taskId, outcome]));
    expect(outcomeMap(reversed)).toEqual(outcomeMap(inOrder));
  });
});

describe('H — break and buffer edges', () => {
  it('never drops the break onto a commitment', () => {
    const meeting = commitment('meeting', at(11, 0), at(11, 30));
    const proposal = build({
      todos: [
        todo({ id: 'a', estimatedMinutes: 45, priority: 'high' }),
        todo({ id: 'b', estimatedMinutes: 45, priority: 'medium' }),
      ],
      commitments: [meeting],
    });
    expectValid(proposal);
    const rest = proposal.placements.find((placement) => placement.kind === 'break');
    expect(rest).toBeDefined();
    expect(rest!.end <= meeting.start || rest!.start >= meeting.end).toBe(true);
  });

  it('separates adjacent blocks by the buffer', () => {
    const proposal = build({
      todos: [
        todo({ id: 'a', estimatedMinutes: 45, priority: 'high' }),
        todo({ id: 'b', estimatedMinutes: 45, priority: 'medium' }),
      ],
    });
    expectValid(proposal);
    expectNoOverlap(proposal);
    expectBlockBuffer(proposal, [], 10);
  });

  it('places no break when the work never reaches the threshold', () => {
    const proposal = build({
      todos: [todo({ id: 'small', estimatedMinutes: 20, priority: 'high' })],
    });
    expectValid(proposal);
    expect(proposal.placements.some((placement) => placement.kind === 'break')).toBe(false);
  });
});
