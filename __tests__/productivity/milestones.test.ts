/**
 * The focus-milestone ladder.
 *
 * A full bar is the next rung *above* the window's best day, starting at six
 * hours and stepping up two at a time — 6h, 8h, 10h and on. The scale always
 * sits ahead of the record, so no day can ever fill its bar to exactly 100%:
 * reaching a milestone is celebrated and the target moves on.
 *
 * These were private functions inside `ProductivityDashboard` until the
 * MVC refactor lifted them out; the tests that used to need a rendered chart
 * are now plain `expect` calls.
 */

import {
  FOCUS_MILESTONE_START_MINUTES,
  FOCUS_MILESTONE_STEP_MINUTES,
  focusFillPercent,
  focusTargetMinutes,
  reachedMilestoneMinutes,
} from '../../productivity/domain';

describe('focusTargetMinutes — a full bar is the next rung above the record', () => {
  it('defaults to the first rung below it', () => {
    expect(focusTargetMinutes(0)).toBe(6 * 60);
    expect(focusTargetMinutes(5 * 60)).toBe(6 * 60);
  });

  it('targets the rung strictly above the record, never the record itself', () => {
    // A best day exactly on a rung keeps climbing — which is what keeps every
    // bar from ever reading a full 100%.
    expect(focusTargetMinutes(6 * 60)).toBe(8 * 60);
    expect(focusTargetMinutes(8 * 60)).toBe(10 * 60);
  });

  it('targets the next rung above a record between rungs', () => {
    expect(focusTargetMinutes(7 * 60)).toBe(8 * 60);
    expect(focusTargetMinutes(9 * 60)).toBe(10 * 60);
  });
});

describe('reachedMilestoneMinutes — the highest rung crossed', () => {
  it('is null below the first rung', () => {
    expect(reachedMilestoneMinutes(0)).toBeNull();
    expect(reachedMilestoneMinutes(5 * 60)).toBeNull();
  });

  it('returns the last rung a day has cleared', () => {
    // A best day of 9h has cleared 6h and 8h, so it celebrates 8h — the last
    // one crossed, not the one currently in view.
    expect(reachedMilestoneMinutes(6 * 60)).toBe(6 * 60);
    expect(reachedMilestoneMinutes(7 * 60)).toBe(6 * 60);
    expect(reachedMilestoneMinutes(9 * 60)).toBe(8 * 60);
  });
});

describe('focusFillPercent — the day over the target', () => {
  it('is zero for no focus or no target', () => {
    expect(focusFillPercent(0, 6 * 60)).toBe(0);
    expect(focusFillPercent(30 * 60, 0)).toBe(0);
  });

  it('is the day as a share of the target, capped at 100', () => {
    // First argument is seconds: six hours against an eight-hour target.
    expect(focusFillPercent(6 * 60 * 60, 8 * 60)).toBe(75);
    expect(focusFillPercent(8 * 60 * 60, 8 * 60)).toBe(100);
    expect(focusFillPercent(100 * 60 * 60, 8 * 60)).toBe(100);
  });
});

describe('the ladder constants', () => {
  it('starts at six hours and climbs two at a time', () => {
    expect(FOCUS_MILESTONE_START_MINUTES).toBe(360);
    expect(FOCUS_MILESTONE_STEP_MINUTES).toBe(120);
  });
});