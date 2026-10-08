/**
 * The task model and its storage migration.
 *
 * Extracted from `WelcomeComponent.tsx` so that the pieces which need a task —
 * the shared row, the All Tasks screen, the Add Todo modal — do not have to
 * import a type out of an 1100-line component to get one. Nothing here imports
 * React or React Native; `productivity/` is pure for the same reason, and a test
 * of this file must not need a renderer.
 */

import { isValidDayKey, type DayKey } from '../productivity';

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
   *    An epoch would reintroduce exactly the UTC drift that `dateKey.ts`
   *    documents, where a task completed at 9pm IST lands on the previous day.
   *
   * Absent means "no date" and must stay distinguishable from today, or "upcoming"
   * filtering cannot be built later.
   */
  dueDate?: DayKey;
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
 *
 * `dueDate` is shape-checked rather than trusted. Storage is user-writable, and
 * its consumers are string comparisons like `dueDate >= today`, which a
 * malformed key would silently corrupt rather than crash. A bad value costs the
 * field; it never costs the task.
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
    };
  });
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