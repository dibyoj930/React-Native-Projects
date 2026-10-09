/**
 * The completion rules a task and its focus timer disagree about.
 *
 * The truth table is the point: the lock and the live timer both make the
 * checkbox inert, but only the live timer is symmetric. A finished timer locks
 * *reopening*, not completing — a distinction that is easy to flatten into
 * "locked means disabled" and that would then block a legitimate tick.
 */

import { isCompletionDisabled, manualToggleStatus } from '../../todos/taskRules';

describe('isCompletionDisabled', () => {
  it('blocks while a timer is attached, whether or not the task is done', () => {
    // Mid-focus: completing by hand would double-count the work.
    expect(isCompletionDisabled(true, false, false)).toBe(true);
    expect(isCompletionDisabled(true, true, false)).toBe(true);
  });

  it('blocks reopening a task a finished timer locked', () => {
    expect(isCompletionDisabled(false, true, true)).toBe(true);
  });

  it('still lets a locked task that is open be completed', () => {
    // The asymmetry. The lock is about not undoing a completion, so it must not
    // stand in the way of one that has not happened yet.
    expect(isCompletionDisabled(false, false, true)).toBe(false);
  });

  it('leaves an ordinary open task free to move', () => {
    expect(isCompletionDisabled(false, false, false)).toBe(false);
  });
});

describe('manualToggleStatus', () => {
  it('records a hand completion as finished, so it stays correctable', () => {
    // Not `completed`: only a timer running to zero locks, and that path does
    // not come through here.
    expect(manualToggleStatus(true)).toBe('finished');
  });

  it('records a reopen as stopped', () => {
    expect(manualToggleStatus(false)).toBe('stopped');
  });
});
