/**
 * Per-day focus from the session log.
 *
 * The load-bearing fact is the day boundary: a session belongs to the local day
 * it *started* on, matching `rollupDayForSession`, so a session that runs past
 * midnight is not split. Everything else is straightforward aggregation.
 */

import {
  focusedSecondsByTaskForDay,
  focusedSecondsForDay,
  hasSessionsForDay,
  sessionsForDay,
} from '../../productivity/planFocus';
import type { FocusSession } from '../../productivity/domain';

function at(day: number, hours: number, minutes = 0): number {
  return new Date(2026, 4, day, hours, minutes, 0, 0).getTime();
}

function session(overrides: Partial<FocusSession>): FocusSession {
  return {
    id: 's',
    taskId: 't1',
    startedAt: at(4, 10),
    endedAt: at(4, 11),
    focusedSeconds: 3600,
    status: 'completed',
    ...overrides,
  };
}

const DAY = '2026-05-04';

describe('sessionsForDay', () => {
  it('keeps only sessions that started on the local day', () => {
    const day1 = session({ id: 'a', startedAt: at(4, 9) });
    const day2 = session({ id: 'b', startedAt: at(5, 9) });
    expect(sessionsForDay([day1, day2], DAY).map((s) => s.id)).toEqual(['a']);
  });

  it('buckets a session that runs past midnight by the day it started', () => {
    const overnight = session({ id: 'o', startedAt: at(4, 23, 30), endedAt: at(5, 0, 30) });
    expect(sessionsForDay([overnight], DAY).map((s) => s.id)).toEqual(['o']);
  });
});

describe('focusedSecondsForDay', () => {
  it('sums only the day’s sessions', () => {
    const sessions = [
      session({ id: 'a', focusedSeconds: 1200 }),
      session({ id: 'b', focusedSeconds: 600 }),
      session({ id: 'c', startedAt: at(5, 9), focusedSeconds: 9999 }),
    ];
    expect(focusedSecondsForDay(sessions, DAY)).toBe(1800);
  });

  it('is zero for a day with no sessions', () => {
    expect(focusedSecondsForDay([session({ startedAt: at(6, 9) })], DAY)).toBe(0);
  });
});

describe('focusedSecondsByTaskForDay', () => {
  it('sums multiple sessions for one task', () => {
    const sessions = [
      session({ id: 'a', taskId: 't1', focusedSeconds: 1200 }),
      session({ id: 'b', taskId: 't1', focusedSeconds: 600 }),
      session({ id: 'c', taskId: 't2', focusedSeconds: 300 }),
    ];
    const byTask = focusedSecondsByTaskForDay(sessions, DAY);
    expect(byTask.get('t1')).toBe(1800);
    expect(byTask.get('t2')).toBe(300);
  });

  it('excludes unattributed sessions and other days', () => {
    const sessions = [
      session({ id: 'a', taskId: null, focusedSeconds: 1200 }),
      session({ id: 'b', taskId: 't1', startedAt: at(5, 9), focusedSeconds: 600 }),
    ];
    expect(focusedSecondsByTaskForDay(sessions, DAY).size).toBe(0);
  });
});

describe('hasSessionsForDay', () => {
  it('distinguishes a quiet day from a day with focus', () => {
    expect(hasSessionsForDay([session({ startedAt: at(5, 9) })], DAY)).toBe(false);
    expect(hasSessionsForDay([session({ startedAt: at(4, 9) })], DAY)).toBe(true);
  });
});
