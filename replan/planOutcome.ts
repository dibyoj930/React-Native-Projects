/**
 * Pure plan-outcome comparison logic.
 *
 * For one day: which planned tasks were completed on time, late, postponed
 * (carried into a later plan — injected by `deriveRollover`), missed, or are
 * still ongoing; how much focus the plan intended versus how much was actually
 * recorded.
 *
 * The one fact not derivable from a single day is "postponed": that needs the
 * later plan. It is therefore passed in as `carriedForwardTaskIds` rather than
 * guessed here, so this function stays pure and single-day.
 *
 * A row is emitted per planned task, plus one for any task completed on this
 * day that the current plan no longer holds. The latter is what keeps a rebuild
 * from erasing work already done: the engine protects completed tasks and never
 * re-places them, so the schedule cannot be the only source of the day's count.
 */

import { localDateKey, type DayKey } from '../productivity/domain';
import type { Todo } from '../todos/model';
import type { Attribution } from '../productivity/attribution';
import type { FocusSession } from '../productivity';
import type {
  DayPlan,
  PlannedTaskResult,
  PlanOutcome,
  PlannedTaskResultStatus,
} from './types';

export type OutcomeContext = {
  dayKey: DayKey;
  plan: DayPlan | null;
  todos: readonly Todo[];
  /** All-time per-task focus. Only correct for the current day; see below. */
  attribution?: Map<string, Attribution> | Record<string, Attribution>;
  /**
   * Closed focus sessions for this day, already bucketed by local day.
   *
   * When provided (even empty) it is authoritative: per-task focus is summed
   * from it and a task with no session is honestly 0. When omitted, per-task
   * focus falls back to `attribution`, which is all-time and therefore only
   * true for the day that is happening right now.
   */
  focusSessionsForDay?: readonly FocusSession[];
  /**
   * Task ids planned here, unfinished, and later carried into another plan.
   * Injected by `deriveRollover`; a task in this set classifies as `postponed`
   * rather than `missed`.
   */
  carriedForwardTaskIds?: ReadonlySet<string> | readonly string[];
  /**
   * This day's own previously recorded comparison, when one has been persisted.
   *
   * A rebuild drops completed work from the live plan, and a completion recorded
   * before `Todo.completedAt` existed carries no timestamp to re-bucket it by.
   * For such a task the stored record is the only remaining evidence that it was
   * finished today, so its completed rows are folded back in rather than letting
   * the rebuild erase them. Only completions are merged; the live plan stays the
   * authority on what is scheduled now, and a task the user has reopened is not
   * resurrected.
   */
  previousOutcome?: PlanOutcome | null;
  now: number;
};

const MINUTE_MS = 60_000;
const round1 = (n: number): number => Math.round(n * 10) / 10;

function asSet(
  value: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!value) return new Set<string>();
  return value instanceof Set ? value : new Set(value);
}

/** Focus seconds per task for the day. Sessions with no task are not per-task. */
function focusedSecondsByTask(
  sessions: readonly FocusSession[],
): Map<string, number> {
  const byTask = new Map<string, number>();
  for (const session of sessions) {
    if (!session.taskId) continue;
    byTask.set(session.taskId, (byTask.get(session.taskId) ?? 0) + session.focusedSeconds);
  }
  return byTask;
}

function getAttributionSeconds(taskId: string, attribution: unknown): number {
  if (!attribution) return 0;
  const read = (v: unknown): number => {
    const candidate = v as { focusedSeconds?: unknown } | undefined;
    return candidate && typeof candidate.focusedSeconds === 'number'
      ? candidate.focusedSeconds
      : 0;
  };
  if (attribution instanceof Map) return read(attribution.get(taskId));
  return read((attribution as Record<string, unknown>)[taskId]);
}

type Classification = {
  wasScheduled: boolean;
  completed: boolean;
  completedAt?: number;
  plannedStart?: number;
  plannedEnd?: number;
  status: PlannedTaskResultStatus;
};

function classify(
  taskId: string,
  plan: DayPlan | null,
  todos: readonly Todo[],
  now: number,
  carriedForward: boolean,
): Classification {
  const todo = todos.find((t) => t.id === taskId);
  const placement = plan?.placements.find((p) => p.taskId === taskId);
  const completed = !!todo?.completed;
  const completedAt = todo?.completedAt;
  const plannedStart = placement?.start;
  const plannedEnd = placement?.end;

  if (!placement) {
    return {
      wasScheduled: false,
      completed,
      completedAt,
      status: completed ? 'completed-on-time' : 'ongoing',
    };
  }

  if (completed) {
    // Completion is a fact even when its timestamp is missing — a task finished
    // before `completedAt` existed is still done. Timing can only be judged when
    // both a planned end and a completion time are known; without them the
    // honest reading is simply "done", which the generic on-time bucket carries.
    const onTime =
      plannedEnd == null || completedAt == null || completedAt <= plannedEnd;
    return {
      wasScheduled: true,
      completed,
      completedAt,
      plannedStart,
      plannedEnd,
      status: onTime ? 'completed-on-time' : 'completed-late',
    };
  }

  if (plannedEnd != null && plannedEnd < now) {
    // The window ended without a completion. It is only "postponed" when the
    // caller can show it was carried forward; otherwise it is honestly missed.
    return {
      wasScheduled: true,
      completed: false,
      plannedStart,
      plannedEnd,
      status: carriedForward ? 'postponed' : 'missed',
    };
  }

  return {
    wasScheduled: true,
    completed: false,
    plannedStart,
    plannedEnd,
    status: 'ongoing',
  };
}

function emptyOutcome(
  dayKey: DayKey,
  plan: DayPlan | null,
  now: number,
): PlanOutcome {
  return {
    dayKey,
    planApprovedAt: plan?.approvedAt ?? 0,
    generatedAt: now,
    planSignature: plan?.signature ?? '',
    results: [],
    summary: {
      totalPlanned: 0,
      completed: 0,
      completedOnTime: 0,
      completedLate: 0,
      postponed: 0,
      missed: 0,
      totalPlannedFocusMins: undefined,
      totalActualFocusMins: undefined,
    },
  };
}

export function computePlanOutcome(ctx: OutcomeContext): PlanOutcome {
  const { dayKey, plan, todos, now } = ctx;
  const carried = asSet(ctx.carriedForwardTaskIds);
  // A provided (even empty) session list is authoritative; `null` means the
  // caller did not supply one, so fall back to all-time attribution.
  const focusByTask =
    ctx.focusSessionsForDay !== undefined
      ? focusedSecondsByTask(ctx.focusSessionsForDay)
      : null;

  if (!plan || plan.dayKey !== dayKey) {
    return emptyOutcome(dayKey, plan, now);
  }

  // One row per task: a plan that repeats a placement must not inflate the
  // counts or double-count the same task's focus.
  const seenTasks = new Set<string>();
  const uniquePlacements = plan.placements.filter((p) => {
    if (seenTasks.has(p.taskId)) return false;
    seenTasks.add(p.taskId);
    return true;
  });

  const rowFor = (taskId: string): PlannedTaskResult => {
    const c = classify(taskId, plan, todos, now, carried.has(taskId));
    const todo = todos.find((t) => t.id === taskId);
    const actualFocusSeconds =
      focusByTask !== null
        ? focusByTask.get(taskId) ?? 0
        : getAttributionSeconds(taskId, ctx.attribution);
    return {
      taskId,
      taskText: todo?.text,
      plannedStart: c.plannedStart,
      plannedEnd: c.plannedEnd,
      wasScheduled: c.wasScheduled,
      completed: c.completed,
      completedAt: c.completedAt,
      actualFocusSeconds,
      status: c.status,
      // Snapshot the link with the row. A later edit cannot change what this day
      // meant for career work, and a later deletion cannot erase it.
      ...(todo?.career ? { career: todo.career } : {}),
    };
  };

  const results: PlannedTaskResult[] = uniquePlacements.map((placement) =>
    rowFor(placement.taskId),
  );

  // A task completed on this day belongs to the day's comparison even when the
  // current plan no longer holds it. The engine protects completed work and
  // never places it, so a rebuild drops it from `plan.placements`; without this
  // the tile would erase work already done — and its recorded focus — the moment
  // a new plan is applied. Completion, not the schedule, decides.
  for (const todo of todos) {
    if (!todo.completed || todo.completedAt === undefined) continue;
    if (seenTasks.has(todo.id)) continue;
    if (localDateKey(todo.completedAt) !== dayKey) continue;
    seenTasks.add(todo.id);
    results.push(rowFor(todo.id));
  }

  // The loop above can only date a completion that carries a timestamp. A
  // legacy completion (one recorded before `Todo.completedAt` existed) cannot be
  // bucketed from its task, so a rebuild would drop it again — including on the
  // next launch, when the live plan no longer names it. The day's stored record
  // is the remaining evidence that it was finished today, so its completed rows
  // are folded back in. A task the user has since reopened is not resurrected;
  // a task missing from the list is not proof of reopening, so its recorded
  // completion stands.
  if (ctx.previousOutcome?.dayKey === dayKey) {
    for (const previous of ctx.previousOutcome.results) {
      if (!previous.completed) continue;
      if (seenTasks.has(previous.taskId)) continue;
      const todo = todos.find((t) => t.id === previous.taskId);
      if (todo && !todo.completed) continue;
      seenTasks.add(previous.taskId);
      const actualFocusSeconds =
        focusByTask !== null
          ? focusByTask.get(previous.taskId) ?? 0
          : previous.actualFocusSeconds;
      const stillDone =
        previous.status === 'completed-on-time' ||
        previous.status === 'completed-late';
      results.push({
        ...previous,
        taskText: todo?.text ?? previous.taskText,
        completedAt: todo?.completedAt ?? previous.completedAt,
        actualFocusSeconds,
        // A completion with an unrecognised status (e.g. an early record that
        // stored `ongoing`) still counts as done, in the generic bucket.
        status: stillDone ? previous.status : 'completed-on-time',
      });
    }
  }

  let completed = 0;
  let completedOnTime = 0;
  let completedLate = 0;
  let postponed = 0;
  let missed = 0;
  let totalActualFocusMins = 0;
  let totalPlannedFocusMins = 0;
  for (const r of results) {
    if (r.actualFocusSeconds) totalActualFocusMins += r.actualFocusSeconds / 60;
    if (r.completed) completed++;
    if (r.status === 'completed-on-time') completedOnTime++;
    if (r.status === 'completed-late') completedLate++;
    if (r.status === 'postponed') postponed++;
    if (r.status === 'missed') missed++;
    if (r.plannedStart != null && r.plannedEnd != null) {
      totalPlannedFocusMins += (r.plannedEnd - r.plannedStart) / MINUTE_MS;
    }
  }

  return {
    dayKey,
    planApprovedAt: plan.approvedAt,
    generatedAt: now,
    planSignature: plan.signature,
    results,
    summary: {
      totalPlanned: results.length,
      completed,
      completedOnTime,
      completedLate,
      postponed,
      missed,
      totalPlannedFocusMins:
        totalPlannedFocusMins > 0 ? round1(totalPlannedFocusMins) : undefined,
      totalActualFocusMins:
        totalActualFocusMins > 0 ? round1(totalActualFocusMins) : undefined,
    },
  };
}
