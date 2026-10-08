import { projectOpenSessions } from './sessions';
import type { ActiveSession, CompletionRecord, FocusSession } from './types';

/**
 * Was a completion actually driven by focus?
 *
 * This replaces the deleted `completedByTimer` flag. The flag was a claim the
 * task made about its own history, and nothing in the app ever set it to true —
 * so the progress bar it drove was permanently empty. Attribution inverts the
 * direction: instead of the task asserting that focus happened, the session log
 * is joined against completed tasks to discover whether it did.
 *
 * The join is the point. It means the answer is recomputed from evidence on
 * every read, so a task cannot claim credit for focus that is not in the log,
 * and a session cannot credit a task that was never completed.
 */
export type Attribution = {
  taskId: string;
  /** Total focused seconds across every session attributed to this task. */
  focusedSeconds: number;
  sessionCount: number;
  /**
   * True when focus led to the completion in any form — the timer ran out, or
   * the user ticked the task off while a timer was running. This is the
   * predicate behind the Momentum bonus.
   */
  isFocusCompleted: boolean;
  /**
   * True only when a timer ran all the way to zero and completed the task.
   *
   * Narrower than `isFocusCompleted`, and deliberately so. This is what locks a
   * completion against being un-ticked, because a finished timer is a
   * commitment the user made and the app honoured; twenty minutes of focus is
   * not something an accidental tap should give back.
   */
  isTimerCompleted: boolean;
  firstSessionAt: number | null;
  lastSessionAt: number | null;
};

const EMPTY_ATTRIBUTION = (taskId: string): Attribution => ({
  taskId,
  focusedSeconds: 0,
  sessionCount: 0,
  isFocusCompleted: false,
  isTimerCompleted: false,
  firstSessionAt: null,
  lastSessionAt: null,
});

/**
 * Joins every session for one task.
 *
 * `completedAt` bounds the join to sessions that began before the completion —
 * focus logged *after* a task was ticked off did not cause that completion, and
 * counting it would let a later session retroactively justify an earlier tick.
 * Omit it (or pass undefined) to attribute regardless of ordering.
 */
export function attributeToTask(
  sessions: readonly FocusSession[],
  taskId: string,
  completedAt?: number,
): Attribution {
  const matching = sessions.filter(
    (session) =>
      session.taskId === taskId &&
      (completedAt === undefined || session.startedAt <= completedAt),
  );
  if (matching.length === 0) return EMPTY_ATTRIBUTION(taskId);

  let focusedSeconds = 0;
  let isFocusCompleted = false;
  let isTimerCompleted = false;
  let firstSessionAt: number | null = null;
  let lastSessionAt: number | null = null;

  for (const session of matching) {
    focusedSeconds += session.focusedSeconds;
    // Either way focus drove the completion, so both count toward momentum.
    if (session.status === 'completed' || session.status === 'finished') {
      isFocusCompleted = true;
    }
    // Only a timer that actually ran out locks the completion.
    if (session.status === 'completed') isTimerCompleted = true;
    if (firstSessionAt === null || session.startedAt < firstSessionAt) {
      firstSessionAt = session.startedAt;
    }
    if (lastSessionAt === null || session.endedAt > lastSessionAt) {
      lastSessionAt = session.endedAt;
    }
  }

  return {
    taskId,
    focusedSeconds,
    sessionCount: matching.length,
    isFocusCompleted,
    isTimerCompleted,
    firstSessionAt,
    lastSessionAt,
  };
}

/**
 * Attribution for every task that has any focus history, plus every completed
 * task — the latter matter because a task completed with no focus at all must
 * still appear, with zeroes, so the UI can honestly show "no focus logged".
 *
 * Open (still-running) sessions are included at their current value so a
 * journey view reflects focus happening right now.
 */
export function buildAttribution(
  sessions: readonly FocusSession[],
  active: readonly ActiveSession[],
  tasks: readonly CompletionRecord[],
  now: number,
): Map<string, Attribution> {
  const all = [...sessions, ...projectOpenSessions(active, now)];
  const result = new Map<string, Attribution>();

  for (const task of tasks) {
    if (!task.completed) continue;
    result.set(task.id, attributeToTask(all, task.id, task.completedAt));
  }

  // Tasks with focus but no completion are still worth surfacing.
  for (const session of all) {
    if (session.taskId === null) continue;
    if (result.has(session.taskId)) continue;
    result.set(session.taskId, attributeToTask(all, session.taskId));
  }

  return result;
}
