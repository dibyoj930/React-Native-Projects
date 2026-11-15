/**
 * The task model and its storage migration.
 *
 * Extracted from `WelcomeComponent.tsx` so that the pieces which need a task —
 * the shared row, the All Tasks screen, the Add Todo modal — do not have to
 * import a type out of an 1100-line component to get one. Nothing here imports
 * React or React Native; `productivity/` is pure for the same reason, and a test
 * of this file must not need a renderer.
 */

import { sanitizeCareerLink, type CareerLink } from '../shared/careerLink';
import { isValidDayKey, type DayKey } from '../shared/date';
import { isValidTimeKey, type TimeKey } from './timeKey';

export type Todo = {
  id: string;
  text: string;
  completed: boolean;
  tags?: string[];
  /** Epoch ms the task was created. Backfilled for tasks saved before this existed. */
  createdAt?: number;
  /**
   * Epoch ms the task was completed, or undefined while it is open.
   *
   * `completedByTimer` was removed: nothing in the app ever set it to true, so
   * the progress bar it drove was permanently empty. Whether focus led to a
   * completion is now derived by joining completed tasks against focus
   * sessions, rather than asserted by a flag on the task.
   */
  completedAt?: number;
  /**
   * Free-text detail, added by the Add Todo modal.
   *
   * Optional and stored absent rather than as `''`, so "no notes" stays
   * distinguishable from "notes were cleared". There is nowhere to show them yet;
   * they are written now so a task's detail survives until there is a detail view.
   */
  notes?: string;
  /**
   * Local calendar day associated with the task, `'YYYY-MM-DD'`.
   *
   * A day key rather than an epoch, and the same `DayKey` the productivity layer
   * already uses. Two reasons, both load-bearing:
   *
   *  - a due date is a calendar day, not an instant. There is no meaningful
   *    time-of-day, so a timestamp would be false precision.
   *  - lexicographic order on a day key *is* chronological order, so every
   *    future filter (`dueDate >= today`, `dueDate === addDays(today, 1)`) is
   *    plain string comparison with no `Date` parsing and no timezone involved.
   *    An epoch would reintroduce exactly the UTC drift that `shared/date.ts`
   *    documents, where a task completed at 9pm IST lands on the previous day.
   *
   * Absent means "no date" and must stay distinguishable from today, or "upcoming"
   * filtering cannot be built later.
   */
  dueDate?: DayKey;
  /**
   * Local wall-clock time associated with `dueDate`, `'HH:mm'`.
   *
   * Stored beside the day rather than folded into it, because a day is not an
   * instant and a time is not a date. The pair is what a task reminder schedules
   * from: only when both are present does the task name a specific moment, and
   * only then does a notification have somewhere to fire.
   *
   * Meaningless without `dueDate`, and absent means "no time" — which keeps a
   * date-only task distinguishable from one that reminds at an hour.
   */
  dueTime?: TimeKey;
  /**
   * Scheduling priority for the daily replan, `'high' | 'medium' | 'low'`.
   *
   * Optional, and absent is not a value: the replan engine reads an absent
   * priority as `'low'` because that is the only honest reading of "the user did
   * not say". It is stored absent rather than written as `'low'` so a legacy task
   * is distinguishable from one the user explicitly marked low.
   */
  priority?: 'high' | 'medium' | 'low';
  /**
   * How long the task is expected to take, in whole minutes.
   *
   * Optional, and absent means the replan engine cannot place the task: it
   * classifies it `needsInformation` rather than guessing a length that would
   * silently change the shape of the day.
   */
  estimatedMinutes?: number;
  /**
   * Whether the replan engine may move this task, or must leave it anchored.
   *
   * Absent reads as `'flexible'`. A `'fixed'` task is protected at its
   * `fixedStartAt`; the engine treats its window as immovable, like a commitment.
   */
  schedulingMode?: 'flexible' | 'fixed';
  /**
   * Epoch ms a `'fixed'` task is anchored at. Meaningless on a flexible task, and
   * never derived from `dueDate`/`dueTime` — a deadline and a start are different
   * facts, and conflating them would make a deadline look movable.
   */
  fixedStartAt?: number;
  /**
   * Optional career work this task contributes to.
   *
   * The link is one-way on purpose: a task may point at a goal, milestone or
   * skill, but a career record never points at a task. Deleting a task therefore
   * cannot delete career history, and career progress is always derived from the
   * tasks that currently point at it rather than stored as a second count.
   *
   * Absent means "not linked". A malformed or empty link is dropped by
   * `migrateTodos`, never kept as a half-valid reference.
   */
  career?: CareerLink;
};

/**
 * What the add/edit sheet hands back. Deliberately not a `Todo`: the id is the
 * caller's, and `id`/`createdAt`/`completed`/`completedAt` are facts about a
 * task rather than form data, so a draft can never overwrite them.
 *
 * This lives in the model rather than in `AddTodoModal` because the operations
 * that apply a draft are domain logic. When it sat in the component, the domain
 * had to import the UI to name its own input type — the dependency ran the
 * wrong way.
 */
export type TodoDraft = {
  text: string;
  notes?: string;
  dueDate?: DayKey;
  /** The reminder time beside `dueDate`, or absent for a date-only task. */
  dueTime?: TimeKey;
  /**
   * The chosen tag, or absent for none.
   *
   * One tag or none — the `#` control offers the vocabulary and takes a single
   * pick, which is the one-element contract `Todo.tags` already speaks. The sheet
   * prefills it from the task being edited, or from the tag screen a new task is
   * being born on.
   *
   * `undefined` on an edit means "keep whatever the task already had"; a label
   * means "replace it".
   */
  tag?: string;
  /** Scheduling priority, or absent for none (the engine reads absent as low). */
  priority?: 'high' | 'medium' | 'low';
  /** Estimated length in whole minutes, or absent for "not estimated yet". */
  estimatedMinutes?: number;
  /** Whether the engine may move the task. Absent clears back to flexible. */
  schedulingMode?: 'flexible' | 'fixed';
  /**
   * Career work this task contributes to, or absent for none.
   *
   * Form data like the rest of the draft: the sheet always returns its current
   * selection, so an empty draft clears the previous link. The sheet prefills it
   * from the task being edited, which makes that safe.
   */
  career?: CareerLink;
};

/**
 * Repairs whatever is in storage into a valid `Todo[]`.
 *
 * On read rather than through a version bump, because the only persisted key has
 * never been versioned. Two legacy shapes have needed repair so far, and each
 * field is copied *explicitly* rather than spread, so the whitelist doubles as
 * the thing that drops unknown stale shapes instead of carrying them forward into
 * every future export:
 *
 *  - `completedByTimer` is dropped. It was only ever written as `false`, so
 *    nothing meaningful is lost.
 *  - `createdAt` did not exist. Backfilled with load time, the only honest option
 *    for a task of unknown age.
 *  - `notes` and `dueDate` did not exist. Left absent, which is the honest
 *    reading: an old task genuinely has neither, and inventing either would be
 *    worse than admitting it.
 *  - `career` did not exist. Left absent for the same reason: an old task was
 *    not linked to career work, and a guessed link would inflate practice.
 *
 * `dueDate` is shape-checked rather than trusted. Storage is user-writable, and
 * its consumers are string comparisons like `dueDate >= today`, which a
 * malformed key would silently corrupt rather than crash. A bad value costs the
 * field; it never costs the task. `dueTime` is checked the same way, for the same
 * reason: it becomes the instant of a scheduled notification, so a malformed one
 * would fail to schedule rather than merely look wrong.
 *
 * `completedAt` is deliberately left undefined rather than guessed, because an
 * invented completion timestamp would corrupt daily statistics.
 *
 * `now` is passed rather than read from the clock so the function stays pure and
 * the test can assert an exact backfill instead of tolerating a range.
 */
export function migrateTodos(parsed: readonly unknown[], now: number): Todo[] {
  return parsed.map((entry) => {
    // `?? {}` because reading `.id` off `null` throws, and a single null in the
    // stored array would otherwise take out the whole load. Strings and numbers
    // are safe to read a property from, so they need no special case.
    const legacy = (entry ?? {}) as Partial<Todo> & { completedByTimer?: unknown };
    return {
      id: String(legacy.id ?? ''),
      text: String(legacy.text ?? ''),
      completed: legacy.completed === true,
      completedAt:
        typeof legacy.completedAt === 'number' ? legacy.completedAt : undefined,
      createdAt: typeof legacy.createdAt === 'number' ? legacy.createdAt : now,
      tags: Array.isArray(legacy.tags) ? legacy.tags.map(String) : [],
      notes: typeof legacy.notes === 'string' ? legacy.notes : undefined,
      dueDate: isValidDayKey(legacy.dueDate) ? legacy.dueDate : undefined,
      dueTime: isValidTimeKey(legacy.dueTime) ? legacy.dueTime : undefined,
      priority: isPriority(legacy.priority) ? legacy.priority : undefined,
      estimatedMinutes: isPositiveWholeNumber(legacy.estimatedMinutes)
        ? legacy.estimatedMinutes
        : undefined,
      schedulingMode:
        legacy.schedulingMode === 'fixed' || legacy.schedulingMode === 'flexible'
          ? legacy.schedulingMode
          : undefined,
      fixedStartAt: isFiniteNumber(legacy.fixedStartAt) ? legacy.fixedStartAt : undefined,
      career: sanitizeCareerLink(legacy.career),
    };
  });
}

/** A stored priority, or false for anything else so the field is dropped. */
function isPriority(value: unknown): value is 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A usable estimate: a whole number of minutes greater than zero. */
function isPositiveWholeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

/**
 * Monotonic id source. `Date.now()` alone collides when two tasks are created
 * in the same millisecond, which the old code did — and ids are now referenced
 * by focus sessions, so a collision would corrupt history rather than just an
 * index. The counter guarantees uniqueness within an install; the timestamp
 * keeps ids roughly sortable.
 */
let idSequence = 0;
export const nextTodoId = (): string => {
  idSequence += 1;
  return `${Date.now().toString(36)}-${idSequence.toString(36)}`;
};

/**
 * Persists under a single AsyncStorage key, so future productivity data lives in
 * its own key rather than being folded into this array.
 *
 * Lives here rather than in the component because it is the storage key for the
 * model above, not a detail of one screen.
 */
export const TODOS_STORAGE_KEY = 'todos';