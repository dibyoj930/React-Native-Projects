/**
 * Domain tests for the productivity layer.
 *
 * These import only pure `.ts` modules — no React Native, no AsyncStorage, no
 * component rendering. That is the whole reason the scoring layer was kept free
 * of framework imports, so this file runs in milliseconds on any machine.
 *
 * Timestamps are built from local components rather than literals, because
 * `localDateKey` is local-calendar by design and a hardcoded UTC-looking
 * timestamp would silently test the wrong day in most of the world.
 */

import {
  addDays,
  attributeToTask,
  buildAttribution,
  buildSnapshot,
  closeSession,
  computeMomentum,
  computeRollups,
  computeStreak,
  dayKeyRange,
  daysBetween,
  isMissionComplete,
  localDateKey,
  missionForLevel,
  missionProgress,
  formatCount,
  formatDayRange,
  formatDuration,
  formatElapsed,
  pauseSession,
  progressRatio,
  qualifiesForFreeze,
  recentDayWindow,
  resumeSession,
  startSession,
  type DayKey,
  type FocusSession,
  type FocusSessionStatus,
  type StreakLedger,
} from '../../productivity/domain';

/** Epoch ms for a local wall-clock time. */
const at = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number => new Date(year, month - 1, day, hour, minute, second, 0).getTime();

const MINUTE = 60_000;

/** Builds a closed session with sane defaults, so tests only state what matters. */
const session = (
  overrides: Partial<FocusSession> & { startedAt: number },
): FocusSession => ({
  id: `s-${overrides.startedAt}-${Math.random()}`,
  taskId: null,
  endedAt: overrides.startedAt + MINUTE,
  focusedSeconds: 60,
  status: 'completed' as FocusSessionStatus,
  ...overrides,
});

const emptyLedger: StreakLedger = { freezesEarned: 0, freezesSpent: 0 };

describe('localDateKey', () => {
  it('uses the local calendar day, not UTC', () => {
    // 23:30 local on the 4th. In any timezone at or east of UTC-3:30 this is
    // still the 4th locally while `toISOString()` would report the 5th.
    const lateEvening = at(2026, 3, 4, 23, 30);
    expect(localDateKey(lateEvening)).toBe('2026-03-04');
  });

  it('pads single-digit months and days', () => {
    expect(localDateKey(at(2026, 1, 7))).toBe('2026-01-07');
  });

  it('assigns 00:00 and 23:59 to the same day', () => {
    expect(localDateKey(at(2026, 6, 15, 0, 0, 0))).toBe('2026-06-15');
    expect(localDateKey(at(2026, 6, 15, 23, 59, 59))).toBe('2026-06-15');
  });
});

describe('day arithmetic', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('goes backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('measures inclusive ranges', () => {
    expect(dayKeyRange('2026-03-01', '2026-03-04')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
  });

  it('returns nothing when the range is inverted', () => {
    expect(dayKeyRange('2026-03-04', '2026-03-01')).toEqual([]);
  });

  it('counts whole days between keys', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
  });

  it('survives a DST transition without skipping a day', () => {
    // US DST ends 2026-11-01. A naive +24h arithmetic would land on the 1st
    // twice or skip it entirely.
    const keys = dayKeyRange('2026-10-31', '2026-11-02');
    expect(keys).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('session lifecycle', () => {
  it('accumulates only focused time, excluding pauses', () => {
    let s = startSession('s1', 'task-1', at(2026, 5, 1, 10, 0));
    // Ten minutes of focus.
    s = pauseSession(s, at(2026, 5, 1, 10, 10));
    expect(s.accumulatedSeconds).toBe(600);

    // An hour of pause must contribute nothing at all.
    s = resumeSession(s, at(2026, 5, 1, 11, 10));
    s = pauseSession(s, at(2026, 5, 1, 11, 15));
    expect(s.accumulatedSeconds).toBe(900);
  });

  it('ignores a redundant pause', () => {
    let s = startSession('s1', 'task-1', at(2026, 5, 1, 10, 0));
    s = pauseSession(s, at(2026, 5, 1, 10, 5));
    const afterFirstPause = s.accumulatedSeconds;
    s = pauseSession(s, at(2026, 5, 1, 10, 9));
    expect(s.accumulatedSeconds).toBe(afterFirstPause);
  });

  it('ignores a redundant resume', () => {
    const s = startSession('s1', 'task-1', at(2026, 5, 1, 10, 0));
    const resumed = resumeSession(s, at(2026, 5, 1, 12, 0));
    expect(resumed.segmentStartedAt).toBe(s.segmentStartedAt);
  });

  it('clamps a backwards clock instead of losing focus', () => {
    const s = startSession('s1', 'task-1', at(2026, 5, 1, 10, 0));
    const closed = closeSession(s, 'stopped', at(2026, 5, 1, 9, 0));
    expect(closed.focusedSeconds).toBe(0);
    expect(closed.endedAt).toBeGreaterThanOrEqual(closed.startedAt);
  });

  it('never reports negative focused seconds', () => {
    const s = pauseSession(startSession('s1', 't', at(2026, 5, 1, 10)), at(2026, 5, 1, 9));
    expect(closeSession(s, 'stopped', at(2026, 5, 1, 9)).focusedSeconds).toBe(0);
  });
});

describe('attribution replaces the completedByTimer flag', () => {
  it('reports focus that actually completed the task', () => {
    const sessions = [
      session({
        startedAt: at(2026, 5, 1, 9),
        taskId: 'task-1',
        status: 'completed',
        focusedSeconds: 1500,
      }),
    ];
    const result = attributeToTask(sessions, 'task-1', at(2026, 5, 1, 10));
    expect(result.isFocusCompleted).toBe(true);
    expect(result.focusedSeconds).toBe(1500);
    expect(result.sessionCount).toBe(1);
  });

  it('does not credit a task completed by hand with no focus', () => {
    const result = attributeToTask([], 'task-1', at(2026, 5, 1, 10));
    expect(result.isFocusCompleted).toBe(false);
    expect(result.focusedSeconds).toBe(0);
  });

  it('does not credit focus that ended without completing the task', () => {
    // Time genuinely spent, but stopped early — so it counts as focus without
    // counting as a completion.
    const sessions = [
      session({
        startedAt: at(2026, 5, 1, 9),
        taskId: 'task-1',
        status: 'stopped',
        focusedSeconds: 1500,
      }),
    ];
    const result = attributeToTask(sessions, 'task-1', at(2026, 5, 1, 10));
    expect(result.isFocusCompleted).toBe(false);
    expect(result.isTimerCompleted).toBe(false);
    expect(result.focusedSeconds).toBe(1500);
  });

  it('credits focus but does not lock when the user ticked the task by hand', () => {
    // `finished` is the middle ground: focus led to the completion, so momentum
    // counts it, but the user chose to tick it, so it stays correctable.
    const sessions = [
      session({
        startedAt: at(2026, 5, 1, 9),
        taskId: 'task-1',
        status: 'finished',
        focusedSeconds: 1200,
      }),
    ];
    const result = attributeToTask(sessions, 'task-1', at(2026, 5, 1, 10));
    expect(result.isFocusCompleted).toBe(true);
    expect(result.isTimerCompleted).toBe(false);
  });

  it('locks only when the timer itself ran to zero', () => {
    const sessions = [
      session({
        startedAt: at(2026, 5, 1, 9),
        taskId: 'task-1',
        status: 'completed',
        focusedSeconds: 1500,
      }),
    ];
    const result = attributeToTask(sessions, 'task-1', at(2026, 5, 1, 10));
    expect(result.isFocusCompleted).toBe(true);
    expect(result.isTimerCompleted).toBe(true);
  });

  it('leaves both predicates false with no history', () => {
    const result = attributeToTask([], 'task-1', at(2026, 5, 1, 10));
    expect(result.isFocusCompleted).toBe(false);
    expect(result.isTimerCompleted).toBe(false);
  });

  it('does not lock from a session that started after the completion', () => {
    // A later session cannot retroactively justify, or lock, an earlier tick.
    const sessions = [
      session({
        startedAt: at(2026, 5, 1, 15),
        taskId: 'task-1',
        status: 'completed',
      }),
    ];
    const result = attributeToTask(sessions, 'task-1', at(2026, 5, 1, 10));
    expect(result.isTimerCompleted).toBe(false);
  });

  it('never counts an in-flight session as a lock', () => {
    // A running timer has not run to zero, so it must not read as a finished
    // one — that was exactly the false claim the deleted flag used to make.
    const now = at(2026, 5, 1, 9, 30);
    const tasks = [{ id: 'task-1', completed: true, completedAt: at(2026, 5, 1, 9, 31) }];
    const map = buildAttribution([], [startSession('open', 'task-1', at(2026, 5, 1, 9))], tasks, now);
    expect(map.get('task-1')?.isFocusCompleted).toBe(false);
    expect(map.get('task-1')?.isTimerCompleted).toBe(false);
  });

  it('excludes focus that started after the completion', () => {
    // Focus logged later cannot be the cause of an earlier tick, and counting
    // it would let a session retroactively justify a completion.
    const sessions = [
      session({ startedAt: at(2026, 5, 1, 15), taskId: 'task-1', status: 'completed' }),
    ];
    expect(attributeToTask(sessions, 'task-1', at(2026, 5, 1, 10)).sessionCount).toBe(0);
  });

  it('sums several sessions for one task', () => {
    const sessions = [
      session({ startedAt: at(2026, 5, 1, 9), taskId: 't', focusedSeconds: 600 }),
      session({ startedAt: at(2026, 5, 1, 14), taskId: 't', focusedSeconds: 900 }),
    ];
    const result = attributeToTask(sessions, 't');
    expect(result.focusedSeconds).toBe(1500);
    expect(result.sessionCount).toBe(2);
    expect(result.firstSessionAt).toBe(at(2026, 5, 1, 9));
    expect(result.lastSessionAt).toBe(at(2026, 5, 1, 14, 1));
  });
});

describe('rollups recompute rather than accumulate', () => {
  it('aggregates focus and completions per local day', () => {
    const sessions = [
      session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 600, status: 'completed' }),
      session({ startedAt: at(2026, 5, 1, 11), focusedSeconds: 300, status: 'stopped' }),
      session({ startedAt: at(2026, 5, 2, 9), focusedSeconds: 900, status: 'completed' }),
    ];
    const tasks = [
      { id: 'a', completed: true, completedAt: at(2026, 5, 1, 9, 30) },
      { id: 'b', completed: true, completedAt: at(2026, 5, 2, 10) },
      { id: 'c', completed: true, completedAt: at(2026, 5, 2, 12) },
      { id: 'd', completed: false },
    ];

    const rollups = computeRollups(sessions, tasks);
    expect(rollups).toHaveLength(2);

    const [first, second] = rollups;
    expect(first.day).toBe('2026-05-01');
    expect(first.focusedSeconds).toBe(900);
    expect(first.tasksCompleted).toBe(1);

    expect(second.day).toBe('2026-05-02');
    expect(second.focusedSeconds).toBe(900);
    expect(second.tasksCompleted).toBe(2);
  });

  it('is a pure function of its inputs — same answer every time', () => {
    const sessions = [
      session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 600, status: 'completed' }),
    ];
    const tasks = [{ id: 'a', completed: true, completedAt: at(2026, 5, 1, 10) }];
    expect(computeRollups(sessions, tasks)).toEqual(computeRollups(sessions, tasks));
  });

  it('omits days with no activity so absence stays distinguishable', () => {
    const rollups = computeRollups(
      [session({ startedAt: at(2026, 5, 1, 9) })],
      [],
    );
    expect(rollups.map((r) => r.day)).toEqual(['2026-05-01']);
  });

  it('credits the day a task closed, even for focus begun the day before', () => {
    const sessions = [
      session({
        startedAt: at(2026, 5, 1, 23, 50),
        taskId: 'a',
        status: 'completed',
        focusedSeconds: 1500,
      }),
    ];
    const tasks = [{ id: 'a', completed: true, completedAt: at(2026, 5, 2, 0, 15) }];
    const byDay = new Map(computeRollups(sessions, tasks).map((r) => [r.day, r]));
    expect(byDay.get('2026-05-02')?.isFocusCompleted).toBe(true);
  });
});

describe('daily mission', () => {
  const mission = missionForLevel(0); // 25 min, 1 task

  it('requires both halves, taking the weaker one', () => {
    const focusOnly = computeRollups(
      [session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 3600 })],
      [],
    )[0];
    expect(missionProgress(focusOnly, mission).complete).toBe(false);

    const tasksOnly = computeRollups(
      [],
      [
        { id: 'a', completed: true, completedAt: at(2026, 5, 1, 10) },
        { id: 'b', completed: true, completedAt: at(2026, 5, 1, 11) },
      ],
    )[0];
    expect(missionProgress(tasksOnly, mission).complete).toBe(false);
  });

  it('passes when both halves are met', () => {
    const rollup = computeRollups(
      [session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 25 * 60 })],
      [{ id: 'a', completed: true, completedAt: at(2026, 5, 1, 10) }],
    )[0];
    expect(isMissionComplete(rollup, mission)).toBe(true);
  });

  it('treats a missing day as zero progress, not a failure', () => {
    const progress = missionProgress(undefined, mission);
    expect(progress.ratio).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it('never reports a ratio above 1', () => {
    const rollup = computeRollups(
      [session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 99_999 })],
      Array.from({ length: 20 }, (_, i) => ({
        id: `t${i}`,
        completed: true,
        completedAt: at(2026, 5, 1, 10),
      })),
    )[0];
    const progress = missionProgress(rollup, mission);
    expect(progress.focusRatio).toBe(1);
    expect(progress.tasksRatio).toBe(1);
  });

  it('escalates with streak and clamps at the top rung', () => {
    expect(missionForLevel(0).goal.focusMinutes).toBeLessThan(
      missionForLevel(3).goal.focusMinutes,
    );
    expect(missionForLevel(999).level).toBe(missionForLevel(999).level);
    expect(missionForLevel(-5).level).toBe(0);
  });
});

describe('streak', () => {
  /**
   * A day that clears the *top* mission rung (60 min, 4 tasks).
   *
   * Deliberately not a level-0 day: the mission escalates with the streak, so a
   * helper producing "25 min, 1 task" would quietly start failing from day six
   * onward and make long-run tests untestable. Clearing every level keeps these
   * tests about streak mechanics rather than about the ladder.
   */
  const completeDay = (day: DayKey) => {
    const date = Number(day.split('-')[2]);
    const sessions: FocusSession[] = [
      session({
        id: `full-${day}`,
        startedAt: at(2026, 5, date, 9),
        taskId: `task-${day}-a`,
        status: 'completed',
        focusedSeconds: 60 * 60,
      }),
    ];
    const tasks = ['a', 'b', 'c', 'd'].map((suffix) => ({
      id: `task-${day}-${suffix}`,
      completed: true,
      completedAt: at(2026, 5, date, 10),
    }));
    return { sessions, tasks };
  };

  const streakFor = (days: DayKey[], today: DayKey, ledger = emptyLedger) => {
    const sessions = days.flatMap((d) => completeDay(d).sessions);
    const tasks = days.flatMap((d) => completeDay(d).tasks);
    return computeStreak({ rollups: computeRollups(sessions, tasks), today, ledger });
  };

  it('counts consecutive completed days', () => {
    const result = streakFor(
      ['2026-05-01', '2026-05-02', '2026-05-03'],
      '2026-05-03',
    );
    expect(result.current).toBe(3);
    expect(result.isTodayComplete).toBe(true);
  });

  it('does not count today until it is actually done', () => {
    const result = streakFor(['2026-05-01', '2026-05-02'], '2026-05-03');
    expect(result.current).toBe(2);
    expect(result.isTodayComplete).toBe(false);
  });

  it('breaks on a genuinely absent day', () => {
    // 05-03 has no entry at all — not an insufficient day, simply nothing.
    const result = streakFor(
      ['2026-05-01', '2026-05-02', '2026-05-04', '2026-05-05'],
      '2026-05-05',
    );
    expect(result.current).toBe(2);
  });

  it('tracks the longest run even after it breaks', () => {
    const result = streakFor(
      ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-10', '2026-05-11'],
      '2026-05-11',
    );
    expect(result.longest).toBe(4);
    expect(result.current).toBe(2);
  });

  it('returns zeros when there is no history', () => {
    const result = computeStreak({ rollups: [], today: '2026-05-01', ledger: emptyLedger });
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
    expect(result.firstActiveDay).toBeNull();
  });

  it('grants a freeze every seven consecutive days', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `2026-05-0${i + 1}`);
    const result = streakFor(seven, '2026-05-07');
    expect(result.current).toBe(7);
    expect(result.freezesRemaining).toBe(1);
  });

  it('spends a freeze on an insufficient day but keeps the streak', () => {
    // Seven good days earns the freeze; day 8 focuses hard but closes nothing,
    // which is exactly what a freeze exists for. Day 9 is "today" — a day only
    // becomes freeze-eligible once it is actually over.
    const days = [
      ...Array.from({ length: 7 }, (_, i) => `2026-05-0${i + 1}`),
      '2026-05-08',
    ];
    const sessions = [
      ...days.slice(0, 7).flatMap((d) => completeDay(d).sessions),
      session({
        id: 'hard-day',
        startedAt: at(2026, 5, 8, 9),
        taskId: 'task-hard',
        status: 'stopped',
        focusedSeconds: 40 * 60,
      }),
    ];
    const tasks = days.slice(0, 7).flatMap((d) => completeDay(d).tasks);

    const result = computeStreak({
      rollups: computeRollups(sessions, tasks),
      today: '2026-05-09',
      ledger: emptyLedger,
    });

    expect(result.frozenDays).toEqual(['2026-05-08']);
    expect(result.current).toBe(7);
    expect(result.freezesRemaining).toBe(0);
  });

  it('never spends a freeze on an unfinished today', () => {
    // Same insufficient day, but it is still today. Breaking or freezing on a
    // day that has not ended yet would punish the user mid-morning.
    const sessions = [
      ...Array.from({ length: 7 }, (_, i) => completeDay(`2026-05-0${i + 1}`).sessions[0]),
      session({
        id: 'hard-day',
        startedAt: at(2026, 5, 8, 9),
        taskId: 'task-hard',
        status: 'stopped',
        focusedSeconds: 40 * 60,
      }),
    ];
    const tasks = Array.from({ length: 7 }, (_, i) =>
      completeDay(`2026-05-0${i + 1}`).tasks,
    ).flat();

    const result = computeStreak({
      rollups: computeRollups(sessions, tasks),
      today: '2026-05-08',
      ledger: emptyLedger,
    });

    expect(result.frozenDays).toEqual([]);
    expect(result.current).toBe(7);
    expect(result.freezesRemaining).toBe(1);
  });

  it('never spends a freeze on a day with no effort at all', () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      session({
        id: `s${i}`,
        startedAt: at(2026, 5, i + 1, 9),
        taskId: `t${i}`,
        status: 'completed',
        focusedSeconds: 25 * 60,
      }),
    );
    const tasks = sessions.flatMap((s, i) =>
      ['a', 'b', 'c', 'd'].map((suffix) => ({
        id: `t${i}-${suffix}`,
        completed: true,
        completedAt: at(2026, 5, i + 1, 10),
      })),
    );

    // 05-08 is simply missing: neither focus nor a task, so no freeze.
    const result = computeStreak({
      rollups: computeRollups(sessions, tasks),
      today: '2026-05-09',
      ledger: emptyLedger,
    });
    expect(result.frozenDays).toEqual([]);
    expect(result.current).toBe(0);
  });

  it('never lets a frozen day advance the counter', () => {
    // If a frozen day incremented the streak, the run would claim more days
    // than were actually completed.
    expect(
      qualifiesForFreeze({
        day: 'd',
        focusedSeconds: 300,
        totalSessions: 1,
        completedSessions: 0,
        tasksCompleted: 0,
        isFocusCompleted: false,
      }),
    ).toBe(true);
    expect(
      qualifiesForFreeze({
        day: 'd',
        focusedSeconds: 0,
        totalSessions: 0,
        completedSessions: 0,
        tasksCompleted: 0,
        isFocusCompleted: false,
      }),
    ).toBe(false);
  });
});

describe('momentum', () => {
  const base = {
    mission: missionForLevel(0),
    streak: 0,
    freezesRemaining: 0,
    memory: { lastEventAt: null, previousDayScore: 0 },
  };

  it('scores a strong day highly', () => {
    const today = computeRollups(
      [session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 25 * 60 })],
      [{ id: 'a', completed: true, completedAt: at(2026, 5, 1, 10) }],
    )[0];
    const score = computeMomentum({
      ...base,
      today,
      memory: { lastEventAt: at(2026, 5, 1, 10), previousDayScore: 0 },
      now: at(2026, 5, 1, 11),
    });
    expect(score.total).toBeGreaterThan(60);
    expect(score.missionComplete).toBe(true);
  });

  it('decays after a long absence but never below the floor', () => {
    const today = computeRollups(
      [session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 25 * 60 })],
      [{ id: 'a', completed: true, completedAt: at(2026, 5, 1, 10) }],
    )[0];
    const memory = { lastEventAt: at(2026, 5, 1, 10), previousDayScore: 0 };

    const fresh = computeMomentum({ ...base, today, memory, now: at(2026, 5, 1, 11) });
    const stale = computeMomentum({
      ...base,
      today,
      memory,
      now: at(2026, 5, 10, 11),
    });

    expect(stale.total).toBeLessThan(fresh.total);
    expect(stale.decayMultiplier).toBeGreaterThanOrEqual(0.5);
  });

  it('holds full credit inside the grace window', () => {
    const memory = { lastEventAt: at(2026, 5, 1, 8), previousDayScore: 0 };
    const score = computeMomentum({
      ...base,
      today: undefined,
      memory,
      now: at(2026, 5, 1, 18), // 10 idle hours
    });
    expect(score.decayMultiplier).toBe(1);
  });

  it('treats a never-active user as idle rather than fresh', () => {
    const score = computeMomentum({
      ...base,
      today: undefined,
      memory: { lastEventAt: null, previousDayScore: 0 },
      now: at(2026, 5, 1, 12),
    });
    expect(score.decayMultiplier).toBe(0.5);
    expect(score.hoursSinceEvent).toBeNull();
  });

  it('stays within 0–100 no matter the inputs', () => {
    const huge = computeMomentum({
      ...base,
      streak: 10_000,
      today: computeRollups(
        [session({ startedAt: at(2026, 5, 1, 9), focusedSeconds: 10_000_000 })],
        [{ id: 'a', completed: true, completedAt: at(2026, 5, 1, 10) }],
      )[0],
      memory: { lastEventAt: at(2026, 5, 1, 10), previousDayScore: 100 },
      now: at(2026, 5, 1, 10),
    });
    expect(huge.total).toBeLessThanOrEqual(100);
    expect(huge.total).toBeGreaterThanOrEqual(0);
  });
});

describe('buildSnapshot', () => {
  it('derives today, mission, streak and momentum in one pass', () => {
    const now = at(2026, 5, 3, 14);
    const sessions = [
      session({
        id: 'today',
        startedAt: at(2026, 5, 3, 9),
        taskId: 'a',
        status: 'completed',
        focusedSeconds: 25 * 60,
      }),
    ];
    const tasks = [{ id: 'a', completed: true, completedAt: at(2026, 5, 3, 10) }];

    const snapshot = buildSnapshot({
      sessions,
      active: [],
      tasks,
      ledger: emptyLedger,
      memory: { lastEventAt: at(2026, 5, 3, 10), previousDayScore: 0 },
      now,
    });

    expect(snapshot.today).toBe('2026-05-03');
    expect(snapshot.streak.current).toBe(1);
    expect(snapshot.missionToday.complete).toBe(true);
    expect(snapshot.attribution.get('a')?.isFocusCompleted).toBe(true);
    expect(snapshot.momentum.total).toBeGreaterThan(0);
  });

  it('handles an empty install without throwing', () => {
    const snapshot = buildSnapshot({
      sessions: [],
      active: [],
      tasks: [],
      ledger: emptyLedger,
      memory: { lastEventAt: null, previousDayScore: 0 },
      now: at(2026, 5, 3, 14),
    });
    expect(snapshot.rollups).toEqual([]);
    expect(snapshot.streak.current).toBe(0);
    expect(snapshot.momentum.total).toBe(0);
    expect(snapshot.momentum.band).toBe('dormant');
  });

  it('counts an open session toward today without claiming completion', () => {
    const now = at(2026, 5, 3, 14);
    const active = [startSession('open', 'a', at(2026, 5, 3, 13, 30))];

    const snapshot = buildSnapshot({
      sessions: [],
      active,
      tasks: [],
      ledger: emptyLedger,
      memory: { lastEventAt: at(2026, 5, 3, 13, 30), previousDayScore: 0 },
      now,
    });

    expect(snapshot.todayRollup?.focusedSeconds).toBe(1800);
    // An in-flight session has not run to zero, so it must not satisfy the
    // completion predicate.
    expect(snapshot.todayRollup?.isFocusCompleted).toBe(false);
  });
});

describe('recentDayWindow', () => {
  const day = (n: number): DayKey => localDateKey(at(2026, 5, n, 12));

  /** Sessions on the 1st, 8th and 15th — gaps of a week between each. */
  const gapped = computeRollups(
    [1, 8, 15].map((n) => session({ startedAt: at(2026, 5, n, 9), focusedSeconds: 1800 })),
    [],
  );

  it('returns calendar days, not just the days that had activity', () => {
    const window = recentDayWindow(gapped, day(16), 14);

    expect(window).toHaveLength(14);
    // Newest first, ending on the day asked for.
    expect(window[0].day).toBe(day(16));
    expect(window[window.length - 1].day).toBe(day(3));
  });

  it('keeps empty days as zeroed placeholders instead of dropping them', () => {
    // The bug: `rollups.slice(-14)` returns only the days that had activity, so
    // a gap collapses and the chart cannot show that focus stopped at all.
    // A 14-day window ending on the 16th starts on the 3rd, so the 8th and 15th
    // are the only active days inside it.
    const window = recentDayWindow(gapped, day(16), 14);

    expect(window.filter((r) => r.focusedSeconds > 0)).toHaveLength(2);
    expect(window.filter((r) => r.focusedSeconds === 0)).toHaveLength(12);

    const eighth = window.find((r) => r.day === day(8));
    expect(eighth?.focusedSeconds).toBe(1800);
    // The day after the 8th is silent, but still present and countable.
    const ninth = window.find((r) => r.day === day(9));
    expect(ninth).toBeDefined();
    expect(ninth?.focusedSeconds).toBe(0);
    expect(ninth?.totalSessions).toBe(0);
    expect(ninth?.isFocusCompleted).toBe(false);
  });

  it('excludes active days that fall before the window rather than padding the front', () => {
    // Otherwise the window would silently grow to include them, which is how the
    // old slice-based version could return more days than it was asked for.
    const keys = recentDayWindow(gapped, day(16), 14).map((r) => r.day);
    expect(keys).not.toContain(day(1));
  });

  it('never returns two days with the same key', () => {
    // This is what makes the labels meaningful: a gap that duplicated a label
    // made two adjacent bars indistinguishable.
    const keys = recentDayWindow(gapped, day(16), 14).map((r) => r.day);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('spans a month boundary without losing or repeating a day', () => {
    // The label bug lived here. A 14-day window ending 2 May starts 19 April, so
    // it straddles the boundary — under the old month-letter labels the 30th and
    // the 1st rendered as the same letter on adjacent bars.
    const window = recentDayWindow(gapped, day(2), 14);
    const keys = window.map((r) => r.day);

    expect(window).toHaveLength(14);
    expect(new Set(keys).size).toBe(14);
    expect(keys).toContain(day(2)); // 2026-05-02
    expect(keys).toContain('2026-04-30');
    expect(keys).toContain('2026-05-01');
    expect(keys).toContain('2026-04-19'); // the oldest day in the window
  });

  it('handles a brand new user with no sessions at all', () => {
    const window = recentDayWindow([], day(16), 7);

    expect(window).toHaveLength(7);
    expect(window.every((r) => r.focusedSeconds === 0)).toBe(true);
    expect(window.every((r) => r.day !== undefined)).toBe(true);
  });

  it('treats a single-day window as just that day', () => {
    const window = recentDayWindow(gapped, day(8), 1);
    expect(window).toHaveLength(1);
    expect(window[0].day).toBe(day(8));
    expect(window[0].focusedSeconds).toBe(1800);
  });

  it('clamps a nonsensical window size instead of returning nothing', () => {
    expect(recentDayWindow(gapped, day(16), 0)).toHaveLength(1);
    expect(recentDayWindow(gapped, day(16), -5)).toHaveLength(1);
    expect(recentDayWindow(gapped, day(16), Number.NaN)).toHaveLength(1);
  });
});

describe('formatDuration', () => {
  it('reads the way a person would say it', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45 * 60)).toBe('45m');
    expect(formatDuration(60 * 60)).toBe('1h');
    expect(formatDuration(102 * 60)).toBe('1h 42m');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3h 5m');
  });

  it('rounds to whole minutes rather than showing false precision', () => {
    // A session is accounted for in seconds, but "8s" would imply a precision the
    // data does not have.
    expect(formatDuration(8)).toBe('0m');
    expect(formatDuration(89)).toBe('1m');
    expect(formatDuration(91)).toBe('2m');
  });

  it('treats negative and non-finite input as no time at all', () => {
    expect(formatDuration(-600)).toBe('0m');
    expect(formatDuration(Number.NaN)).toBe('0m');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0m');
  });
});

describe('formatElapsed', () => {
  it('switches units so the number stays small', () => {
    expect(formatElapsed(0.5)).toBe('30 min');
    expect(formatElapsed(3)).toBe('3h');
    expect(formatElapsed(50)).toBe('2 days');
    expect(formatElapsed(24)).toBe('1 day');
  });

  it('never reports zero minutes for a positive gap', () => {
    // A 20-second idle period is not "0 min ago"; that reads as no gap at all.
    expect(formatElapsed(0.005)).toBe('1 min');
    expect(formatElapsed(0)).toBe('0 min');
  });
});

describe('progressRatio', () => {
  it('clamps above 1 so finishing the goal reads as overshooting', () => {
    expect(progressRatio(30, 60)).toBe(0.5);
    expect(progressRatio(90, 60)).toBe(1);
    expect(progressRatio(600, 60)).toBe(1);
  });

  it('is zero rather than NaN when the goal is missing', () => {
    // A corrupt stored goal must not produce NaN, which React Native cannot lay out.
    expect(progressRatio(30, 0)).toBe(0);
    expect(progressRatio(30, Number.NaN)).toBe(0);
    expect(progressRatio(Number.NaN, 60)).toBe(0);
  });
});

describe('formatCount', () => {
  it('agrees in number', () => {
    expect(formatCount(1, 'task')).toBe('1 task');
    expect(formatCount(3, 'task')).toBe('3 tasks');
    expect(formatCount(0, 'freeze')).toBe('0 freezes');
  });
});

describe('formatDayRange', () => {
  it('names the month on both sides when the window straddles one', () => {
    // The case that made bare day numbers unreadable: `28 1 2` with no way to
    // tell which month the 1 belongs to.
    expect(formatDayRange('2025-03-06', '2025-02-21')).toBe('Feb 21 – Mar 6');
    expect(formatDayRange('2025-01-02', '2024-12-29')).toBe('Dec 29 – Jan 2');
  });

  it('names the month once when both ends are in the same month', () => {
    expect(formatDayRange('2025-03-06', '2025-03-02')).toBe('Mar 2 – 6');
  });

  it('names the month on both sides when the ends are the same day', () => {
    // Degenerate, but reachable if a chart is ever asked for a single column.
    expect(formatDayRange('2025-03-06', '2025-03-06')).toBe('Mar 6 – Mar 6');
  });

  it('spans a leap day without drifting', () => {
    expect(formatDayRange('2024-03-01', '2024-02-26')).toBe('Feb 26 – Mar 1');
  });

  it('returns empty rather than NaN for a malformed day key', () => {
    expect(formatDayRange('2025-13-06', '2025-02-21')).toBe('');
    expect(formatDayRange('2025-03-06', 'not-a-day')).toBe('');
    expect(formatDayRange('', '')).toBe('');
    expect(formatDayRange('2025-03-32', '2025-03-01')).toBe('');
  });
});
