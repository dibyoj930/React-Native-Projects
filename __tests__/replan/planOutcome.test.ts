/**
 * `computePlanOutcome`: the pure plan-vs-actual classification.
 *
 * Each placement is classified against the task's completion time and the
 * current clock, and the per-task focus attribution (in seconds) rolls up into
 * the comparison's focus minutes.
 */

import { computePlanOutcome } from '../../replan/planOutcome';
import type { DayPlan, PlanOutcome } from '../../replan/types';
import type { Todo } from '../../todos/model';
import type { Attribution, FocusSession } from '../../productivity/domain';

const dayKey = '2026-05-04';

function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

function makePlan(): DayPlan {
  return {
    dayKey,
    approvedAt: at(9),
    signature: 'sig',
    placements: [{ taskId: 't1', start: at(10), end: at(11) }],
  };
}

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 't1',
    text: 'Task',
    completed: false,
    tags: [],
    ...overrides,
  };
}

function attribution(focusedSeconds: number): Map<string, Attribution> {
  return new Map([
    [
      't1',
      {
        taskId: 't1',
        focusedSeconds,
        sessionCount: 1,
        isFocusCompleted: true,
        isTimerCompleted: true,
        firstSessionAt: at(10),
        lastSessionAt: at(11),
      },
    ],
  ]);
}

describe('planOutcome', () => {
  it('marks completed on time when the task closed within its window', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30) })],
      now: at(15),
    });
    expect(res.summary.completed).toBe(1);
    expect(res.results[0].status).toBe('completed-on-time');
  });

  it('marks completed late when the task closed after its window', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(12) })],
      now: at(15),
    });
    expect(res.results[0].status).toBe('completed-late');
  });

  it('marks missed when the window ended and the task is still open', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: false })],
      now: at(15),
    });
    expect(res.results[0].status).toBe('missed');
  });

  it('marks ongoing while the window has not ended and the task is open', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: false })],
      now: at(10, 30),
    });
    expect(res.results[0].status).toBe('ongoing');
  });

  it('rolls per-task focus seconds up into minutes', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30) })],
      attribution: attribution(1500), // 25 minutes
      now: at(15),
    });
    expect(res.summary.totalActualFocusMins).toBe(25);
    expect(res.results[0].actualFocusSeconds).toBe(1500);
  });

  it('returns an empty comparison when the plan is for another day', () => {
    const res = computePlanOutcome({
      dayKey: '2026-05-05',
      plan: makePlan(),
      todos: [makeTodo({})],
      now: at(15),
    });
    expect(res.summary.totalPlanned).toBe(0);
    expect(res.results).toEqual([]);
  });

  it('sums planned focus minutes from the placements', () => {
    const plan: DayPlan = {
      ...makePlan(),
      placements: [
        { taskId: 't1', start: at(10), end: at(10, 30) },
        { taskId: 't2', start: at(11), end: at(11, 45) },
      ],
    };
    const res = computePlanOutcome({
      dayKey,
      plan,
      todos: [makeTodo({ id: 't1' }), makeTodo({ id: 't2' })],
      now: at(15),
    });
    expect(res.summary.totalPlannedFocusMins).toBe(75);
  });

  it('classifies an unfinished carried task as postponed, not missed', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: false })],
      carriedForwardTaskIds: ['t1'],
      now: at(15),
    });
    expect(res.results[0].status).toBe('postponed');
    expect(res.summary.postponed).toBe(1);
    expect(res.summary.missed).toBe(0);
  });

  it('stays missed when the task was not carried forward', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: false })],
      carriedForwardTaskIds: ['some-other-task'],
      now: at(15),
    });
    expect(res.results[0].status).toBe('missed');
    expect(res.summary.missed).toBe(1);
  });

  it('counts a task planned twice only once', () => {
    const plan: DayPlan = {
      ...makePlan(),
      placements: [
        { taskId: 't1', start: at(10), end: at(10, 30) },
        { taskId: 't1', start: at(11), end: at(11, 30) },
      ],
    };
    const res = computePlanOutcome({
      dayKey,
      plan,
      todos: [makeTodo({ completed: true, completedAt: at(10, 15) })],
      now: at(15),
    });
    expect(res.summary.totalPlanned).toBe(1);
    expect(res.results).toHaveLength(1);
  });

  it('snapshots the task career link on the result', () => {
    const career = { goalId: 'goal-1', skillIds: ['skill-1'] };
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30), career })],
      now: at(15),
    });

    expect(res.results[0].career).toEqual(career);
  });

  it('leaves the career field absent for an unlinked task', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30) })],
      now: at(15),
    });

    expect(res.results[0]).not.toHaveProperty('career');
  });

  it('reads per-task focus from the day’s sessions, overriding attribution', () => {    const sessions: FocusSession[] = [
      {
        id: 's1',
        taskId: 't1',
        startedAt: at(10),
        endedAt: at(10, 20),
        status: 'completed',
        focusedSeconds: 1200,
      },
      {
        id: 's2',
        taskId: 't1',
        startedAt: at(10, 30),
        endedAt: at(10, 40),
        status: 'stopped',
        focusedSeconds: 600,
      },
    ];
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({})],
      attribution: attribution(1500),
      focusSessionsForDay: sessions,
      now: at(15),
    });
    expect(res.results[0].actualFocusSeconds).toBe(1800);
    expect(res.summary.totalActualFocusMins).toBe(30);
  });

  it('treats an empty session list as authoritative zero, not a fallback', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({})],
      attribution: attribution(1500),
      focusSessionsForDay: [],
      now: at(15),
    });
    expect(res.results[0].actualFocusSeconds).toBe(0);
    expect(res.summary.totalActualFocusMins).toBeUndefined();
  });

  it('keeps a task completed today that the current plan no longer holds', () => {
    // The bug: a rebuild protects completed work and drops it from the plan, so
    // a comparison built from placements alone would erase it the moment the
    // user applies. Completion, not the schedule, keeps the row.
    const plan: DayPlan = {
      ...makePlan(),
      placements: [{ taskId: 't2', start: at(14), end: at(14, 30) }],
    };
    const res = computePlanOutcome({
      dayKey,
      plan,
      todos: [
        makeTodo({ id: 'report', text: 'Report', completed: true, completedAt: at(9, 30) }),
        makeTodo({ id: 't2' }),
      ],
      now: at(15),
    });

    expect(res.summary.totalPlanned).toBe(2);
    expect(res.summary.completed).toBe(1);
    expect(res.summary.completedOnTime).toBe(1);
    const report = res.results.find((r) => r.taskId === 'report');
    expect(report?.wasScheduled).toBe(false);
    expect(report?.status).toBe('completed-on-time');
    expect(res.results.find((r) => r.taskId === 't2')?.wasScheduled).toBe(true);
  });

  it('preserves recorded focus for a completed task the plan no longer holds', () => {
    const plan: DayPlan = {
      ...makePlan(),
      placements: [{ taskId: 't2', start: at(14), end: at(14, 30) }],
    };
    const sessions: FocusSession[] = [
      {
        id: 's1',
        taskId: 'report',
        startedAt: at(9),
        endedAt: at(9, 30),
        status: 'completed',
        focusedSeconds: 1800,
      },
    ];
    const res = computePlanOutcome({
      dayKey,
      plan,
      todos: [
        makeTodo({ id: 'report', completed: true, completedAt: at(9, 30) }),
        makeTodo({ id: 't2' }),
      ],
      focusSessionsForDay: sessions,
      now: at(15),
    });

    expect(res.results.find((r) => r.taskId === 'report')?.actualFocusSeconds).toBe(1800);
    expect(res.summary.totalActualFocusMins).toBe(30);
  });

  it('does not add a task completed on another day', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [
        makeTodo({
          id: 'old',
          completed: true,
          completedAt: at(9) - 24 * 60 * 60 * 1000,
        }),
      ],
      now: at(15),
    });

    expect(res.results.map((r) => r.taskId)).toEqual(['t1']);
    expect(res.summary.completed).toBe(0);
  });

  it('does not double-count a completed task that is also planned', () => {
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true, completedAt: at(10, 30) })],
      now: at(15),
    });

    expect(res.results).toHaveLength(1);
    expect(res.summary.totalPlanned).toBe(1);
    expect(res.summary.completed).toBe(1);
  });

  it('treats a legacy completion with no timestamp as done, not missed', () => {
    // A task finished before `completedAt` existed is still completed. Without
    // the timestamp the window can no longer judge on-time vs late, but calling
    // finished work "missed" is simply false.
    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ completed: true })],
      now: at(15),
    });

    expect(res.results).toHaveLength(1);
    expect(res.summary.completed).toBe(1);
    expect(res.summary.missed).toBe(0);
    expect(res.results[0].status).toBe('completed-on-time');
  });

  it('keeps a legacy completion the rebuilt plan no longer holds', () => {
    // A rebuild drops completed work from the plan, and a legacy completion has
    // no `completedAt` to re-bucket it by. The day's stored record is the only
    // remaining evidence that it was finished today.
    const plan: DayPlan = {
      ...makePlan(),
      placements: [{ taskId: 't2', start: at(14), end: at(14, 30) }],
    };
    const previousOutcome: PlanOutcome = {
      dayKey,
      planApprovedAt: at(9),
      generatedAt: at(11),
      planSignature: 'old',
      results: [
        {
          taskId: 'legacy',
          taskText: 'Legacy report',
          plannedStart: at(10),
          plannedEnd: at(11),
          wasScheduled: true,
          completed: true,
          status: 'completed-on-time',
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 1,
        completedOnTime: 1,
        completedLate: 0,
        postponed: 0,
        missed: 0,
      },
    };

    const res = computePlanOutcome({
      dayKey,
      plan,
      todos: [
        makeTodo({ id: 'legacy', text: 'Legacy report', completed: true }),
        makeTodo({ id: 't2' }),
      ],
      previousOutcome,
      now: at(15),
    });

    const legacy = res.results.find((r) => r.taskId === 'legacy');
    expect(legacy?.completed).toBe(true);
    expect(legacy?.wasScheduled).toBe(true);
    expect(res.summary.completed).toBe(1);
    expect(res.summary.totalPlanned).toBe(2);
  });

  it('does not resurrect a stored completion the user has reopened', () => {
    const previousOutcome: PlanOutcome = {
      dayKey,
      planApprovedAt: at(9),
      generatedAt: at(10),
      planSignature: 'old',
      results: [
        {
          taskId: 'reopened',
          wasScheduled: true,
          completed: true,
          status: 'completed-on-time',
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 1,
        completedOnTime: 1,
        completedLate: 0,
        postponed: 0,
        missed: 0,
      },
    };

    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ id: 'reopened', completed: false })],
      previousOutcome,
      now: at(15),
    });

    expect(res.results.find((r) => r.taskId === 'reopened')).toBeUndefined();
    expect(res.summary.completed).toBe(0);
  });

  it('recomputes a merged completion’s focus from the day’s sessions', () => {
    const previousOutcome: PlanOutcome = {
      dayKey,
      planApprovedAt: at(9),
      generatedAt: at(10),
      planSignature: 'old',
      results: [
        {
          taskId: 'legacy',
          wasScheduled: true,
          completed: true,
          status: 'completed-on-time',
          actualFocusSeconds: 999,
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 1,
        completedOnTime: 1,
        completedLate: 0,
        postponed: 0,
        missed: 0,
      },
    };
    const sessions: FocusSession[] = [
      {
        id: 's1',
        taskId: 'legacy',
        startedAt: at(10),
        endedAt: at(10, 30),
        status: 'completed',
        focusedSeconds: 1800,
      },
    ];

    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ id: 'legacy', completed: true })],
      focusSessionsForDay: sessions,
      previousOutcome,
      now: at(15),
    });

    expect(res.results.find((r) => r.taskId === 'legacy')?.actualFocusSeconds).toBe(1800);
    expect(res.summary.totalActualFocusMins).toBe(30);
  });

  it('ignores a stored comparison from another day when merging', () => {
    const previousOutcome: PlanOutcome = {
      dayKey: '2026-05-03',
      planApprovedAt: at(9),
      generatedAt: at(10),
      planSignature: 'old',
      results: [
        {
          taskId: 'legacy',
          wasScheduled: true,
          completed: true,
          status: 'completed-on-time',
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 1,
        completedOnTime: 1,
        completedLate: 0,
        postponed: 0,
        missed: 0,
      },
    };

    const res = computePlanOutcome({
      dayKey,
      plan: makePlan(),
      todos: [makeTodo({ id: 'legacy', completed: true })],
      previousOutcome,
      now: at(15),
    });

    expect(res.results.map((r) => r.taskId)).toEqual(['t1']);
    expect(res.summary.completed).toBe(0);
  });
});
