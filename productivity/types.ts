/**
 * Domain types for the productivity system.
 *
 * Nothing in `productivity/` imports React Native or AsyncStorage, and every
 * function that depends on the current time takes `now` as an argument. That
 * keeps the whole scoring layer testable with plain `expect` calls — no mocks,
 * no fake timers, no simulator.
 */

import type { CareerLink } from '../shared/careerLink';

/** `YYYY-MM-DD` in the device's *local* calendar. See `shared/date.ts`. */
export type { DayKey } from '../shared/date';

/**
 * Why a focus session ended.
 *
 * `completed` is deliberately narrow: the timer ran to zero *and* the task it
 * was attached to actually got completed. It is the only status that locks a
 * completion, because it is the only one where the app decided — the time was
 * spent, so the completion is spent too.
 *
 * This distinction is what lets the app answer "was this completed by the timer?"
 * without a stored flag. The old `completedByTimer` field claimed that and
 * nothing ever set it, so every statistic it fed was permanently empty. Here the
 * answer is read off the session log, where the two outcomes are recorded
 * separately and cannot be confused.
 */
export type FocusSessionStatus =
  /** The timer ran to zero and completed the task. The only *committed* status. */
  | 'completed'
  /**
   * The user completed the task by hand while the timer was still running.
   *
   * Distinct from `completed` because the two carry different consequences.
   * Focus clearly led to this completion, so it earns credit — but the user
   * still chose to tick it off, so it stays correctable. A mis-tapped checkbox
   * is a real mistake, and permanently locking every manual completion would
   * make the app hostile the first time it happens.
   */
  | 'finished'
  /** Ended early by the user — stop button, or task deleted mid-timer. */
  | 'stopped';

/** A finished stretch of focus. Immutable once closed. */
export type FocusSession = {
  id: string;
  /** Task the session was attached to, or null for unattributed focus. */
  taskId: string | null;
  startedAt: number;
  endedAt: number;
  /** Seconds actually spent focusing. Excludes every paused interval. */
  focusedSeconds: number;
  status: FocusSessionStatus;
  /**
   * Career work the focused task was linked to when the session started.
   *
   * A snapshot, not a live join: the task may be edited or deleted while the
   * focus log remains. Keeping the link here is what lets career practice count
   * focus the user genuinely spent even after the task is gone, without a career
   * record ever pointing back at a task.
   */
  career?: CareerLink;
};

/**
 * A session that is still open.
 *
 * Persisted alongside the closed log so an app kill during a focus block does
 * not silently drop the minutes it banked: the session is re-adopted on the next
 * launch and closed by whichever timer event finishes it. To keep that safe,
 * `expiresAt` records the end of the timer that opened it, and every credit
 * calculation is clamped to it — a session restored days later can never claim
 * more focus than the timer it belonged to could have run for.
 */
export type ActiveSession = {
  id: string;
  taskId: string | null;
  startedAt: number;
  /** Focused seconds banked by earlier run segments, before the current one. */
  accumulatedSeconds: number;
  /** Start of the current run segment, or null while paused. */
  segmentStartedAt: number | null;
  /**
   * Epoch ms the timer was scheduled to end, when known.
   *
   * Bounds credited focus so a session that outlives its timer cannot accrue
   * wall-clock time. Absent for a session with no timer (legacy data), in which
   * case credit is unbounded as it always was.
   */
  expiresAt?: number;
  /** The task's career link at the moment this session started, if any. */
  career?: CareerLink;
};

/**
 * The slice of a task the scoring layer needs. Declared structurally rather than
 * imported so `productivity/` stays free of UI types — `WelcomeComponent`'s
 * `Todo` satisfies it without either module depending on the other.
 */
export type CompletionRecord = {
  id: string;
  completed: boolean;
  completedAt?: number;
  createdAt?: number;
};

/** Persisted streak ledger. The streak itself is always recomputed. */
export type StreakLedger = {
  /** Total freezes granted, ever. */
  freezesEarned: number;
  /** Total freezes spent, ever. */
  freezesSpent: number;
};

/**
 * The only momentum state that survives a restart.
 *
 * `previousDayScore` exists so yesterday's finish can nudge today. Everything
 * else about momentum is recomputed from sessions and tasks on every read,
 * because an incrementally-updated score drifts out of sync the moment any
 * single event is missed, double-counted, or replayed after reinstall.
 */
export type MomentumMemory = {
  /** When the user last did anything at all, or null if never. */
  lastEventAt: number | null;
  /** Momentum total at the end of the previous local day. */
  previousDayScore: number;
};
