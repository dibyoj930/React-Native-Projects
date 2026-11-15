/**
 * Estimate calibration from plan-vs-actual history.
 *
 * These pin the two things that make the suggestions trustworthy: only
 * *completed* work with usable numbers is evidence, and a task's own history
 * outranks the shared window factor. The last test asserts the property the
 * whole feature rests on — it advises, it never mutates.
 */

import { suggestAdjustments, type TaskDurationSample } from '../../reflections/learning';

function sample(overrides: Partial<TaskDurationSample> = {}): TaskDurationSample {
  return {
    taskId: 't1',
    plannedMinutes: 30,
    actualMinutes: 30,
    completed: true,
    ...overrides,
  };
}

describe('suggestAdjustments — the window factor', () => {
  it('offers no factor below the minimum sample count', () => {
    const result = suggestAdjustments({
      samples: [sample(), { taskId: 't2', plannedMinutes: 30, actualMinutes: 30, completed: true }],
      candidates: [],
      minSamples: 3,
    });
    expect(result.planningFactor).toBeNull();
    expect(result.sampleCount).toBe(2);
  });

  it('uses the median actual/planned of completed samples', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 'a', plannedMinutes: 10, actualMinutes: 20, completed: true }, // 2.0
        { taskId: 'b', plannedMinutes: 10, actualMinutes: 30, completed: true }, // 3.0
        { taskId: 'c', plannedMinutes: 10, actualMinutes: 10, completed: true }, // 1.0
      ],
      candidates: [],
    });
    expect(result.planningFactor).toBe(2);
    expect(result.sampleCount).toBe(3);
  });

  it('ignores incomplete samples and pairs with no ratio', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 'a', plannedMinutes: 10, actualMinutes: 20, completed: true },
        { taskId: 'b', plannedMinutes: 10, actualMinutes: 30, completed: true },
        { taskId: 'c', plannedMinutes: 10, actualMinutes: 100, completed: false }, // unfinished
        { taskId: 'd', plannedMinutes: 0, actualMinutes: 50, completed: true }, // no ratio
        { taskId: 'e', plannedMinutes: 30, actualMinutes: 0, completed: true }, // no evidence
      ],
      candidates: [],
    });
    expect(result.sampleCount).toBe(2);
    expect(result.planningFactor).toBeNull();
  });

  it('clamps an absurd window factor', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 'a', plannedMinutes: 1, actualMinutes: 100, completed: true },
        { taskId: 'b', plannedMinutes: 1, actualMinutes: 100, completed: true },
        { taskId: 'c', plannedMinutes: 1, actualMinutes: 100, completed: true },
      ],
      candidates: [],
    });
    expect(result.planningFactor).toBe(4);
  });
});

describe('suggestAdjustments — adjustments', () => {
  it('prefers the task’s own completed history when it has enough', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 't1', plannedMinutes: 10, actualMinutes: 20, completed: true }, // 2.0
        { taskId: 't1', plannedMinutes: 10, actualMinutes: 20, completed: true }, // 2.0
        { taskId: 't2', plannedMinutes: 10, actualMinutes: 30, completed: true }, // 3.0
      ],
      candidates: [{ taskId: 't1', estimatedMinutes: 10 }],
    });
    expect(result.planningFactor).toBe(2);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({
      taskId: 't1',
      currentMinutes: 10,
      suggestedMinutes: 20,
      ratio: 2,
      basis: 'task',
    });
  });

  it('falls back to the window factor when a task has too little history', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 't1', plannedMinutes: 10, actualMinutes: 20, completed: true },
        { taskId: 't2', plannedMinutes: 10, actualMinutes: 20, completed: true },
        { taskId: 't3', plannedMinutes: 10, actualMinutes: 20, completed: true },
      ],
      candidates: [{ taskId: 't9', estimatedMinutes: 10 }],
    });
    expect(result.planningFactor).toBe(2);
    expect(result.adjustments[0]).toMatchObject({
      taskId: 't9',
      suggestedMinutes: 20,
      basis: 'window',
    });
  });

  it('skips tasks with no estimate, and suggestions that change nothing', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 'a', plannedMinutes: 30, actualMinutes: 30, completed: true },
        { taskId: 'b', plannedMinutes: 30, actualMinutes: 30, completed: true },
        { taskId: 'c', plannedMinutes: 30, actualMinutes: 30, completed: true },
      ],
      candidates: [
        { taskId: 'no-estimate', estimatedMinutes: 0 },
        { taskId: 'already-right', estimatedMinutes: 30 },
      ],
    });
    expect(result.planningFactor).toBe(1);
    expect(result.adjustments).toEqual([]);
  });

  it('clamps a suggested estimate to a sane floor', () => {
    const result = suggestAdjustments({
      samples: [
        { taskId: 'a', plannedMinutes: 5, actualMinutes: 20, completed: true }, // 4.0
        { taskId: 'b', plannedMinutes: 5, actualMinutes: 20, completed: true },
        { taskId: 'c', plannedMinutes: 5, actualMinutes: 20, completed: true },
      ],
      candidates: [{ taskId: 'tiny', estimatedMinutes: 1 }],
    });
    expect(result.planningFactor).toBe(4);
    // 1 × 4 = 4, lifted to the 5-minute floor.
    expect(result.adjustments[0]).toMatchObject({ taskId: 'tiny', suggestedMinutes: 5 });
  });

  it('is advisory only — it does not touch its inputs', () => {
    const samples = [
      { taskId: 'a', plannedMinutes: 10, actualMinutes: 30, completed: true },
      { taskId: 'b', plannedMinutes: 10, actualMinutes: 30, completed: true },
      { taskId: 'c', plannedMinutes: 10, actualMinutes: 30, completed: true },
    ];
    const candidates = [{ taskId: 'a', estimatedMinutes: 10 }];
    const snapshot = JSON.parse(JSON.stringify({ samples, candidates }));

    suggestAdjustments({ samples, candidates });

    expect({ samples, candidates }).toEqual(snapshot);
  });
});
