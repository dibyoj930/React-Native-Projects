/**
 * The productivity storage boundary.
 *
 * One key holds the closed log, the open sessions, the ledger and momentum. The
 * only interesting behaviour is on the way in: stored data outlives app
 * versions, so a read must repair or drop anything malformed rather than let a
 * `NaN` poison today's totals — and must never throw, because a failed read
 * would stop the app from starting.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialProductivityState, type ProductivityState } from '../../productivity/reducer';
import { loadProductivity, saveProductivity } from '../../productivity/storage';
import { closeSession, startSession } from '../../productivity/domain';

const KEY = '@productivity/v1';
const T0 = new Date(2026, 4, 10, 9, 0, 0, 0).getTime();

function state(overrides: Partial<ProductivityState> = {}): ProductivityState {
  return { ...initialProductivityState, hydrated: true, ...overrides };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('saveProductivity / loadProductivity', () => {
  it('round-trips an open session so focus survives a relaunch', async () => {
    const open = startSession('s1', 'task-1', T0, T0 + 25 * 60_000);
    await saveProductivity(state({ active: { 'task-1': open } }));

    const loaded = await loadProductivity();
    expect(loaded.active['task-1']).toEqual(open);
    expect(loaded.active['task-1'].expiresAt).toBe(T0 + 25 * 60_000);
  });

  it('loads an active map of {} from a document written before they were persisted', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        sessions: [],
        ledger: { freezesEarned: 3, freezesSpent: 1 },
        memory: { lastEventAt: null, previousDayScore: 0 },
      }),
    );

    const loaded = await loadProductivity();
    expect(loaded.active).toEqual({});
    expect(loaded.ledger.freezesEarned).toBe(3);
  });

  it('drops a malformed open session instead of feeding NaN forward', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        sessions: [],
        active: {
          good: startSession('s1', 'task-1', T0),
          bad: { id: 's2', taskId: 'task-2', startedAt: 'nope' },
          worse: { id: 's3', taskId: 'task-3', startedAt: T0, accumulatedSeconds: -5 },
        },
        ledger: { freezesEarned: 0, freezesSpent: 0 },
        memory: { lastEventAt: null, previousDayScore: 0 },
      }),
    );

    const loaded = await loadProductivity();
    expect(Object.keys(loaded.active)).toEqual(['good']);
  });

  it('reads nothing as a clean slate rather than throwing', async () => {
    await AsyncStorage.setItem(KEY, '{ not json');
    const loaded = await loadProductivity();
    expect(loaded.sessions).toEqual([]);
    expect(loaded.active).toEqual({});
  });

  it('preserves career attribution on open and closed sessions', async () => {
    const career = { goalId: 'goal-1', milestoneId: 'm-1', skillIds: ['s-1'] };
    const open = startSession('s1', 'task-1', T0, undefined, career);
    const closed = closeSession(
      startSession('s2', 'task-2', T0, undefined, career),
      'stopped',
      T0 + 60_000,
    );

    await saveProductivity(
      state({ active: { 'task-1': open }, sessions: [closed] }),
    );

    const loaded = await loadProductivity();
    expect(loaded.active['task-1'].career).toEqual(career);
    expect(loaded.sessions[0].career).toEqual(career);
  });

  it('repairs a malformed stored career link instead of trusting it', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        sessions: [
          {
            id: 's1',
            taskId: 'task-1',
            startedAt: T0,
            endedAt: T0 + 60_000,
            focusedSeconds: 60,
            status: 'stopped',
            career: { milestoneId: 'm-1', skillIds: ['  ', 2] },
          },
        ],
        active: {},
        ledger: { freezesEarned: 0, freezesSpent: 0 },
        memory: { lastEventAt: null, previousDayScore: 0 },
      }),
    );

    const loaded = await loadProductivity();
    expect(loaded.sessions[0].career).toBeUndefined();
  });
});
