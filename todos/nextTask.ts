/**
 * "What should I do next?" — the one task the home screen leads with.
 *
 * This is a *decision*, so it is a pure function with an injected clock, not a
 * line of JSX. The rules it applies are the app's existing ones, reused rather
 * than reinvented:
 *
 *   1. The approved plan for today, if there is one. A task whose window is
 *      happening right now wins; failing that, the soonest window still to come.
 *      A plan the user approved is the strongest statement of intent they have
 *      made, so it leads.
 *   2. Otherwise the list's own order, via `groupTodos` — overdue, then today,
 *      then upcoming, then undated. The same order the task list draws, so the
 *      card can never point somewhere the list disagrees with.
 *
 * Completed tasks are never chosen, and a plan from another day is ignored: it
 * says nothing about today.
 */
import type { DayPlan } from '../replan';
import type { Todo } from './model';
import { groupTodos } from './taskSelectors';

export type NextTaskSource = 'scheduled' | 'list';

export type NextTaskSelection = {
  todo: Todo;
  /** Whether the task was chosen from the approved plan or from the list order. */
  source: NextTaskSource;
  /** The task's approved window for today, when it has one. */
  window?: { start: number; end: number };
  /** True when `now` falls inside the approved window. */
  isNow: boolean;
};

export function selectNextTask(input: {
  todos: readonly Todo[];
  today: string;
  plan: DayPlan | null;
  now: number;
}): NextTaskSelection | null {
  const open = input.todos.filter((todo) => !todo.completed);
  if (open.length === 0) return null;

  const openById = new Map(open.map((todo) => [todo.id, todo]));

  // Only today's plan speaks for today. A stale document from yesterday would
  // otherwise point at windows that have already elapsed.
  const placements =
    input.plan && input.plan.dayKey === input.today ? input.plan.placements : [];

  const planRows = placements
    .filter((row) => openById.has(row.taskId))
    .slice()
    .sort((a, b) => a.start - b.start);

  const current = planRows.find((row) => row.start <= input.now && input.now < row.end);
  if (current) {
    return {
      todo: openById.get(current.taskId)!,
      source: 'scheduled',
      window: { start: current.start, end: current.end },
      isNow: true,
    };
  }

  const upcoming = planRows.find((row) => row.start >= input.now);
  if (upcoming) {
    return {
      todo: openById.get(upcoming.taskId)!,
      source: 'scheduled',
      window: { start: upcoming.start, end: upcoming.end },
      isNow: false,
    };
  }

  // Nothing scheduled: fall back to the list's own grouping order.
  const first = groupTodos(open, input.today)[0]?.data[0];
  if (!first) return null;

  return { todo: first, source: 'list', isNow: false };
}
