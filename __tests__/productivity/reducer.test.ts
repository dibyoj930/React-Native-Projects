/**
 * Reducer tests.
 *
 * The reducer is pure, so this needs no renderer and no provider — which is the
 * main reason the productivity state machine lives behind `useReducer` rather
 * than being scattered across `useState` calls in a component.
 */

import {
  closeSession,
  initialProductivityState,
  MAX_RETAINED_SESSIONS,
  nextSessionId,
  pauseSession,
  productivityReducer,
  resumeSession,
  startSession,
  type ProductivityAction,
  type ProductivityState,
} from '../../productivity/domain';

const MINUTE = 60_000;
const T0 = new Date(2026, 4, 10, 9, 0, 0, 0).getTime();

const apply = (state: ProductivityState, ...actions: ProductivityAction[]) =>
  actions.reduce(productivityReducer, state);

describe('productivityReducer', () => {
  it('starts empty and unhydrated', () => {
    expect(initialProductivityState.sessions).toEqual([]);
    expect(initialProductivityState.active).toEqual({});
    expect(initialProductivityState.hydrated).toBe(false);
  });

  it('opens a session and stamps the last event', () => {
    const session = startSession('s1', 'task-1', T0);
    const next = apply(initialProductivityState, {
      type: 'startFocus',
      taskId: 'task-1',
      session,
    });

    expect(next.active['task-1']).toEqual(session);
    expect(next.memory.lastEventAt).toBe(T0);
  });

  it('banks paused time rather than discarding it', () => {
    let session = startSession('s1', 'task-1', T0);
    session = pauseSession(session, T0 + 10 * MINUTE);

    const next = apply(initialProductivityState, {
      type: 'updateFocus',
      taskId: 'task-1',
      session,
    });

    expect(next.active['task-1'].accumulatedSeconds).toBe(600);
  });

  it('closes a session into the log and frees the slot', () => {
    const session = startSession('s1', 'task-1', T0);
    const closed = closeSession(pauseSession(session, T0 + 25 * MINUTE), 'completed', T0 + 25 * MINUTE);

    const next = apply(
      initialProductivityState,
      { type: 'startFocus', taskId: 'task-1', session },
      { type: 'closeFocus', taskId: 'task-1', session: closed, at: T0 + 25 * MINUTE },
    );

    expect(next.active['task-1']).toBeUndefined();
    expect(next.sessions).toHaveLength(1);
    expect(next.sessions[0].status).toBe('completed');
    expect(next.sessions[0].focusedSeconds).toBe(25 * 60);
  });

  it('replaces a session with the same id instead of double-counting', () => {
    // A retried dispatch must not inflate the day's total. Since rollups are
    // recomputed from this array, a duplicate here would be undetectable later.
    const session = startSession('same-id', 'task-1', T0);
    const closed = closeSession(session, 'completed', T0 + MINUTE);

    const next = apply(
      initialProductivityState,
      { type: 'closeFocus', taskId: 'task-1', session: closed, at: T0 + MINUTE },
      { type: 'closeFocus', taskId: 'task-1', session: closed, at: T0 + MINUTE },
    );

    expect(next.sessions).toHaveLength(1);
  });

  it('keeps sessions in chronological order', () => {
    const first = closeSession(startSession('a', 't', T0), 'stopped', T0 + MINUTE);
    const second = closeSession(
      startSession('b', 't', T0 + 60 * MINUTE),
      'stopped',
      T0 + 61 * MINUTE,
    );

    const next = apply(
      initialProductivityState,
      { type: 'closeFocus', taskId: 't', session: second, at: T0 + 61 * MINUTE },
      { type: 'closeFocus', taskId: 't', session: first, at: T0 + MINUTE },
    );

    // Rollups sort defensively, but keeping the log ordered means the retention
    // trim can drop the oldest without re-sorting.
    expect(next.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('drops the oldest sessions past the retention cap', () => {
    const full = Array.from({ length: MAX_RETAINED_SESSIONS }, (_, i) => ({
      id: `s${i}`,
      taskId: 't',
      startedAt: T0 + i,
      endedAt: T0 + i + 1,
      focusedSeconds: 1,
      status: 'stopped' as const,
    }));

    const seeded: ProductivityState = {
      ...initialProductivityState,
      hydrated: true,
      sessions: full,
    };

    const overflow = closeSession(
      startSession('newest', 't', T0 + 999_999),
      'stopped',
      T0 + 999_999,
    );

    const next = productivityReducer(seeded, {
      type: 'closeFocus',
      taskId: 't',
      session: overflow,
      at: T0 + 999_999,
    });

    expect(next.sessions).toHaveLength(MAX_RETAINED_SESSIONS);
    // The newest survives; the oldest is the one sacrificed.
    expect(next.sessions[next.sessions.length - 1].id).toBe('newest');
    expect(next.sessions.some((s) => s.id === 's0')).toBe(false);
  });

  it('hydrates in one shot', () => {
    const next = apply(initialProductivityState, {
      type: 'hydrated',
      sessions: [],
      ledger: { freezesEarned: 2, freezesSpent: 1 },
      memory: { lastEventAt: T0, previousDayScore: 72 },
    });

    expect(next.hydrated).toBe(true);
    expect(next.ledger.freezesEarned).toBe(2);
    expect(next.memory.previousDayScore).toBe(72);
  });

  it('records task-level activity without opening a session', () => {
    const next = apply(initialProductivityState, { type: 'noteEvent', at: T0 });
    expect(next.memory.lastEventAt).toBe(T0);
    expect(next.sessions).toEqual([]);
  });

  it('ignores an unknown action rather than corrupting state', () => {
    const next = productivityReducer(initialProductivityState, {
      type: 'nope',
    } as unknown as ProductivityAction);
    expect(next).toBe(initialProductivityState);
  });

  it('resumes without double-counting an already-running session', () => {
    const session = startSession('s1', 'task-1', T0);
    const resumed = resumeSession(session, T0 + 5 * MINUTE);
    expect(resumed.segmentStartedAt).toBe(T0);
  });
});

describe('session ids', () => {
  it('never collide within a millisecond', () => {
    // Task ids are referenced by sessions; a collision would merge two sessions
    // into one and quietly lose focus time.
    const ids = new Set(Array.from({ length: 1000 }, () => nextSessionId(T0)));
    expect(ids.size).toBe(1000);
  });
});
