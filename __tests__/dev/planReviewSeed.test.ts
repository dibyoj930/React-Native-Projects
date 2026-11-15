/**
 * The plan-review dev fixture.
 *
 * A rolling 7-day window of outcomes is otherwise only reachable after a week of
 * real use, which makes the review tedious to exercise by hand. The risk with a
 * hand-written fixture is that it quietly stops resembling what the pipeline
 * expects — so these tests pin the facts the review depends on:
 *
 *   - seven days ending today, keyed on local days,
 *   - the postponed/missed contrast that only lands when one day's plan reads
 *     another day's outcome,
 *   - a day the session log cannot account for, which must read as unavailable,
 *   - an untracked session, which must never attach to a plan row,
 *   - a storage round-trip, so seeding and clearing touch the app's own
 *     persistence rather than a private copy.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildPlanReviewSeed,
  clearPlanReviewSeed,
  seedPlanReview,
} from '../../dev/planReviewSeed';
import { loadProductivity } from '../../productivity/storage';
import { loadPlanOutcomes } from '../../replan/planOutcomeStorage';
import { loadReplanDoc } from '../../replan/planStorage';
import { loadTodos } from '../../todos/taskRepository';

/** A fixed local noon, so the window is deterministic and DST-free. */
const NOW = new Date(2026, 4, 4, 12, 0, 0).getTime();

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('buildPlanReviewSeed — shape', () => {
  it('covers the six past local days plus the live day', () => {
    const seed = buildPlanReviewSeed(NOW);

    expect(Object.keys(seed.outcomes).sort()).toEqual([
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]);
    for (const outcome of Object.values(seed.outcomes)) {
      expect(outcome.results.length).toBeGreaterThan(0);
    }

    expect(seed.plan.dayKey).toBe('2026-05-04');
    expect(seed.plan.placements.map((placement) => placement.taskId)).toEqual([
      'seed-report',
      'seed-sprint',
      'seed-deep',
    ]);
  });

  it('leaves focus undefined on the day with no sessions', () => {
    const seed = buildPlanReviewSeed(NOW);

    expect(seed.outcomes['2026-04-28'].summary.totalActualFocusMins).toBeUndefined();
  });

  it('records an untracked session with no task', () => {
    const seed = buildPlanReviewSeed(NOW);
    expect(seed.sessions.some((session) => session.taskId === null)).toBe(true);
  });

  it('uses a mix of finished and unfinished statuses', () => {
    const seed = buildPlanReviewSeed(NOW);
    const statuses = Object.values(seed.outcomes).flatMap((outcome) =>
      outcome.results.map((result) => result.status),
    );

    expect(statuses).toContain('completed-on-time');
    expect(statuses).toContain('completed-late');
    expect(statuses).toContain('ongoing');
  });

  it('plans an unfinished task again later, so review reads it postponed', () => {
    const seed = buildPlanReviewSeed(NOW);

    const unfinished = seed.outcomes['2026-05-03'].results.find(
      (result) => result.taskId === 'seed-sprint',
    );
    expect(unfinished?.completed).toBe(false);

    expect(
      seed.plan.placements.some((placement) => placement.taskId === 'seed-sprint'),
    ).toBe(true);
  });
});

describe('seedPlanReview — storage round-trip', () => {
  it('writes the fixture through the app persistence and reads it back', async () => {
    const seed = buildPlanReviewSeed(NOW);
    await seedPlanReview(NOW);

    const outcomes = await loadPlanOutcomes();
    expect(Object.keys(outcomes).sort()).toEqual(Object.keys(seed.outcomes).sort());

    const todos = await loadTodos();
    expect(todos.map((todo) => todo.id)).toEqual([
      'seed-report',
      'seed-review',
      'seed-sprint',
      'seed-inbox',
      'seed-deep',
    ]);

    const productivity = await loadProductivity();
    expect(productivity.sessions.length).toBe(seed.sessions.length);

    const { plan } = await loadReplanDoc();
    expect(plan?.dayKey).toBe('2026-05-04');
    expect(plan?.placements).toHaveLength(3);
  });

  it('clears everything it wrote', async () => {
    await seedPlanReview(NOW);
    await clearPlanReviewSeed();

    expect(await loadPlanOutcomes()).toEqual({});
    expect(await loadTodos()).toEqual([]);
    expect((await loadProductivity()).sessions).toEqual([]);
    expect((await loadReplanDoc()).plan).toBeNull();
  });
});
