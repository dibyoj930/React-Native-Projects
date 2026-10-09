/**
 * Pure decision rules at the seam between a task and its focus timer.
 *
 * These are the task half of rules whose other half is the focus log. They live
 * as plain predicates rather than inside the controller so that the reasons a
 * completion checkbox can be inert, and what a manual toggle records, are
 * decided in one place that can be tested without a renderer or a provider.
 *
 * Nothing here imports a `Todo` or a session: the caller reads the flags off
 * both sides and passes booleans, which keeps this module free of either
 * domain's imports.
 */

/**
 * Whether a completion toggle must be ignored.
 *
 * Two reasons, and the asymmetry between them is the whole point:
 *
 *  - a live focus timer is attached, running or paused. The task is mid-focus,
 *    and completing it by hand would count the work twice — once now, and again
 *    when the timer reaches zero and completes it.
 *  - a finished timer already locked the task *and* the task is already
 *    complete. That only blocks *reopening*: a locked task that is somehow still
 *    open can still be completed, so testing the lock alone would be wrong.
 *
 * `completed` is the task's current state, not the state a press would move it
 * to. (The two read the same because the reopen guard is `completed && locked`.)
 */
export function isCompletionDisabled(
  hasTimer: boolean,
  completed: boolean,
  isLocked: boolean,
): boolean {
  return hasTimer || (completed && isLocked);
}

/**
 * The status a manual completion writes to the focus log.
 *
 * Completing by hand while a timer runs still earns focus credit, but it is
 * recorded as `finished` rather than `completed`: the user chose to complete it,
 * so the completion stays correctable. Only a timer running out locks, and that
 * path does not go through here.
 */
export function manualToggleStatus(nowCompleted: boolean): 'finished' | 'stopped' {
  return nowCompleted ? 'finished' : 'stopped';
}
