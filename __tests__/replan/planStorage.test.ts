/**
 * The replan storage boundary.
 *
 * One key holds preferences and the approved plan together, so an Apply is a
 * single write. Reads must never throw: missing, malformed or hand-edited values
 * degrade to a usable document rather than to a failed launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_REPLAN_PREFERENCES } from '../../replan/preferences';
import {
  clearPlan,
  emptyReplanDoc,
  loadReplanDoc,
  REPLAN_STORAGE_KEY,
  sanitizeReplanDoc,
  savePlan,
  saveReplanDoc,
  saveSuggestions,
} from '../../replan/planStorage';
import type { DayPlan } from '../../replan/types';

const PLAN: DayPlan = {
  dayKey: '2026-05-04',
  approvedAt: 1000,
  signature: 'sig',
  placements: [{ taskId: 'a', start: 2000, end: 3000 }],
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('emptyReplanDoc', () => {
  it('is version 1 with default preferences and no plan', () => {
    expect(emptyReplanDoc()).toEqual({
      version: 1,
      preferences: DEFAULT_REPLAN_PREFERENCES,
      plan: null,
    });
  });
});

describe('loadReplanDoc', () => {
  it('returns the empty document when nothing is stored', async () => {
    expect(await loadReplanDoc()).toEqual(emptyReplanDoc());
  });

  it('reads back a saved plan', async () => {
    await savePlan(DEFAULT_REPLAN_PREFERENCES, PLAN);
    expect(await loadReplanDoc()).toEqual({
      version: 1,
      preferences: DEFAULT_REPLAN_PREFERENCES,
      plan: PLAN,
    });
  });

  it('degrades to the empty document on malformed JSON', async () => {
    await AsyncStorage.setItem(REPLAN_STORAGE_KEY, '{not json');
    expect(await loadReplanDoc()).toEqual(emptyReplanDoc());
  });
});

describe('sanitizeReplanDoc', () => {
  it('rebuilds the empty document for an unknown version', () => {
    expect(sanitizeReplanDoc({ version: 99, plan: PLAN })).toEqual(emptyReplanDoc());
  });

  it('repairs bad preferences field by field and keeps a good plan', () => {
    const repaired = sanitizeReplanDoc({
      version: 1,
      preferences: { workdayStart: '08:00', bufferMinutes: 'nope' },
      plan: PLAN,
    });
    expect(repaired.preferences.workdayStart).toBe('08:00');
    expect(repaired.preferences.bufferMinutes).toBe(DEFAULT_REPLAN_PREFERENCES.bufferMinutes);
    expect(repaired.plan).toEqual(PLAN);
  });

  it('drops a structurally invalid plan to null', () => {
    expect(sanitizeReplanDoc({ version: 1, preferences: {}, plan: { taskId: 'x' } }).plan).toBeNull();
  });

  it('filters out malformed placements', () => {
    const repaired = sanitizeReplanDoc({
      version: 1,
      preferences: {},
      plan: {
        dayKey: '2026-05-04',
        approvedAt: 1,
        signature: 's',
        placements: [
          { taskId: 'a', start: 10, end: 20 },
          { taskId: 'b', start: 30, end: 30 },
          { taskId: 7, start: 1, end: 2 },
        ],
      },
    });
    expect(repaired.plan?.placements).toEqual([{ taskId: 'a', start: 10, end: 20 }]);
  });
});

describe('savePlan', () => {
  it('writes preferences and plan under the one key', async () => {
    await savePlan(DEFAULT_REPLAN_PREFERENCES, PLAN);
    const raw = await AsyncStorage.getItem(REPLAN_STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual({
      version: 1,
      preferences: DEFAULT_REPLAN_PREFERENCES,
      plan: PLAN,
    });
  });
});

describe('clearPlan', () => {
  it('keeps preferences and drops the plan', async () => {
    await saveReplanDoc({
      version: 1,
      preferences: { ...DEFAULT_REPLAN_PREFERENCES, workdayStart: '08:00' },
      plan: PLAN,
    });
    await clearPlan();
    const doc = await loadReplanDoc();
    expect(doc.plan).toBeNull();
    expect(doc.preferences.workdayStart).toBe('08:00');
  });
});

describe('concurrent mutations', () => {
  it('does not let a simultaneous apply and suggestion write clobber each other', async () => {
    // Each helper loads the whole document, merges its own field and writes it
    // back. Started together they would both read the pre-merge document and the
    // second write would erase the first's field — so the merge must be
    // serialised, and both fields must survive.
    const suggestions = { dayKey: PLAN.dayKey, dismissedIds: ['x'], lastEvaluatedAt: 5 };
    await Promise.all([
      savePlan(DEFAULT_REPLAN_PREFERENCES, PLAN),
      saveSuggestions(suggestions),
    ]);

    const doc = await loadReplanDoc();
    expect(doc.plan).toEqual(PLAN);
    expect(doc.suggestions).toEqual(suggestions);
  });
});
