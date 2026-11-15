import { sanitizeCareerLink, type CareerLink } from '../shared/careerLink';

import type { ActiveSession, FocusSession, FocusSessionStatus } from './types';

/**
 * Focus session lifecycle.
 *
 * An active session accumulates focused seconds in *segments*. Pausing closes
 * the current segment and banks its length; resuming opens a new one. This is
 * what makes the old data-loss bug impossible: the previous code overwrote the
 * timer's remaining time on pause and deleted its end timestamp, so every
 * minute already focused was thrown away.
 */

let sessionSequence = 0;

/**
 * Session ids. Same shape as task ids: a base36 timestamp for rough sortability
 * plus a monotonic counter, because two sessions opened in the same millisecond
 * would otherwise collide and merge into one.
 */
export function nextSessionId(now: number): string {
  sessionSequence += 1;
  return `s${now.toString(36)}-${sessionSequence.toString(36)}`;
}

/** Opens a running session, optionally bound to a timer's end and career work. */
export function startSession(
  id: string,
  taskId: string | null,
  now: number,
  expiresAt?: number,
  career?: CareerLink,
): ActiveSession {
  const link = sanitizeCareerLink(career);
  return {
    id,
    taskId,
    startedAt: now,
    accumulatedSeconds: 0,
    segmentStartedAt: now,
    ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
    ...(link ? { career: link } : {}),
  };
}

/**
 * `now`, clamped to the session's timer end when it has one.
 *
 * This is the single place the expiry bound is applied, so pause, projection and
 * close all agree. A session restored long after its timer ran out settles at the
 * timer's end instead of at wall-clock now.
 */
function boundedNow(session: ActiveSession, now: number): number {
  return session.expiresAt !== undefined ? Math.min(now, session.expiresAt) : now;
}

/**
 * Banks the in-flight segment and stops the clock.
 *
 * A no-op if already paused, so a redundant pause can never double-count.
 */
export function pauseSession(session: ActiveSession, now: number): ActiveSession {
  if (session.segmentStartedAt === null) return session;

  const elapsed = Math.max(0, (boundedNow(session, now) - session.segmentStartedAt) / 1000);
  return {
    ...session,
    accumulatedSeconds: session.accumulatedSeconds + elapsed,
    segmentStartedAt: null,
  };
}

/** Reopens the clock from a paused session. A no-op if already running. */
export function resumeSession(session: ActiveSession, now: number): ActiveSession {
  if (session.segmentStartedAt !== null) return session;
  return { ...session, segmentStartedAt: now };
}

/**
 * Total focused seconds as of `now`, including the segment still in flight.
 *
 * Clamped at zero so a backwards system clock cannot subtract focus the user
 * genuinely spent.
 */
export function focusedSecondsAt(session: ActiveSession, now: number): number {
  if (session.segmentStartedAt === null) return session.accumulatedSeconds;
  const elapsed = Math.max(0, (boundedNow(session, now) - session.segmentStartedAt) / 1000);
  return session.accumulatedSeconds + elapsed;
}

/** Converts an open session into its immutable, persistable form. */
export function closeSession(
  session: ActiveSession,
  status: FocusSessionStatus,
  now: number,
): FocusSession {
  return {
    id: session.id,
    taskId: session.taskId,
    startedAt: session.startedAt,
    // Never earlier than the start, even under clock skew, and never later than
    // the timer that opened it could have run.
    endedAt: Math.max(boundedNow(session, now), session.startedAt),
    focusedSeconds: Math.max(0, Math.round(focusedSecondsAt(session, now))),
    status,
    ...(session.career ? { career: session.career } : {}),
  };
}

/**
 * Projects open sessions to their value right now, so in-flight focus counts
 * toward today instead of appearing only after the timer ends.
 *
 * The status is hardcoded to `stopped` on purpose: an open session has not run
 * to zero, so it must never satisfy the focus-completion predicate. Otherwise a
 * timer that is merely *running* would read as a completed focus session, which
 * is precisely the false claim the deleted `completedByTimer` flag used to make.
 */
export function projectOpenSessions(
  active: readonly ActiveSession[],
  now: number,
): FocusSession[] {
  return active.map((session) =>
    closeSession(session, 'stopped', now),
  );
}
