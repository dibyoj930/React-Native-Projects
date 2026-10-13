import { suggestAdjustments } from '../../reflections/learning';

describe('reflection learning', () => {
  it('suggests adjustments from actual durations', () => {
    const suggestions = suggestAdjustments({
      dayKey: '2025-01-01',
      createdAt: 1,
      completed: [],
      moved: [],
      estimatesAccurate: 'no',
      actualDurations: { t1: 25 },
    } as any);
    expect(suggestions[0].taskId).toBe('t1');
    expect(suggestions[0].suggestedMinutes).toBe(25);
  });
});
