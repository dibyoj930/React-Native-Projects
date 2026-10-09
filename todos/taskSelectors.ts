/**
 * Pure task selection helpers.
 *
 * Every filter, search and grouping the list screen offers is here rather than in
 * the component, for the same reason `formatDueLabel` lives in `productivity/`:
 * "what counts as overdue", "does search look at notes" and "which group a task
 * lands in" are decisions, and a decision can be tested with plain `expect` calls.
 * The screen supplies the list and today's day key; it does not decide.
 *
 * Day keys are `YYYY-MM-DD`, so ordering is plain string comparison — the same
 * property `productivity/dateKey.ts` documents. No `Date` is constructed here, so
 * no timezone can shift an overdue task back onto today.
 */
import type { DayKey } from '../productivity';
import type { Todo } from './model';

export function openCount(todos: readonly Todo[]): number {
  return todos.filter((todo) => !todo.completed).length;
}

export function completedCount(todos: readonly Todo[]): number {
  return todos.filter((todo) => todo.completed).length;
}

export function findTodo(todos: readonly Todo[], id: string): Todo | undefined {
  return todos.find((todo) => todo.id === id);
}

/**
 * Tasks carrying any of `tags`, in list order.
 *
 * A union, not an intersection: two selected tags means "show me the coding work
 * *or* the gym work", which is what a row of toggle chips reads as. Intersection
 * would narrow to tasks carrying both, which with one tag per task would almost
 * always be empty — the chips would look broken.
 *
 * No tags selected is a pass-through, copied so a caller cannot mutate the list
 * it was handed.
 */
export function filterByTags(todos: readonly Todo[], tags: readonly string[]): Todo[] {
  if (tags.length === 0) return todos.slice();
  return todos.filter((todo) => {
    const taskTags = todo.tags ?? [];
    return tags.some((tag) => taskTags.includes(tag));
  });
}

/**
 * Tasks carrying one tag, or every task when no tag is given.
 *
 * The single-tag case is what a tag view on home opens with; it stays a thin
 * wrapper so there is one implementation of "does this task carry this tag".
 */
export function filterByTag(todos: readonly Todo[], tag: string | undefined): Todo[] {
  return filterByTags(todos, tag ? [tag] : []);
}

/**
 * Tasks whose title or notes contain `query`, case-insensitively.
 *
 * Notes are searched as well as the title: a person who wrote a phone number in
 * the detail line expects to find the task by it. A blank query (or one that is
 * only spaces) is a pass-through, again copied.
 */
export function searchTodos(todos: readonly Todo[], query: string): Todo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return todos.slice();
  return todos.filter(
    (todo) =>
      todo.text.toLowerCase().includes(needle) ||
      (todo.notes ?? '').toLowerCase().includes(needle),
  );
}

/**
 * The tags actually carried by at least one task, in first-seen order.
 *
 * The filter offers only these, unlike the home tag index which lists the whole
 * vocabulary so an unused tag can still be opened and given its first task. A
 * *filter* that shows eight chips when two tags exist is mostly noise, and each
 * unused chip would filter the list down to nothing.
 */
export function tagsInUse(todos: readonly Todo[]): string[] {
  const seen: string[] = [];
  for (const todo of todos) {
    for (const tag of todo.tags ?? []) {
      if (!seen.includes(tag)) seen.push(tag);
    }
  }
  return seen;
}

/**
 * Whether a task's due date has passed and it is still open.
 *
 * A completed task is never overdue: the work is done, so a red date would be
 * nagging about something that is not outstanding. Grouping puts those tasks
 * under Completed regardless of their date, and this predicate agrees with it.
 */
export function isOverdue(todo: Todo, today: DayKey): boolean {
  return !todo.completed && todo.dueDate !== undefined && todo.dueDate < today;
}

export type TaskGroupKey =
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'undated'
  | 'completed';

export type TaskGroup = {
  key: TaskGroupKey;
  title: string;
  data: Todo[];
};

const GROUP_TITLES: Record<TaskGroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  undated: 'No date',
  completed: 'Completed',
};

/** The order the sections appear in: what needs attention, then the rest. */
const GROUP_ORDER: TaskGroupKey[] = ['overdue', 'today', 'upcoming', 'undated', 'completed'];

function groupKeyFor(todo: Todo, today: DayKey): TaskGroupKey {
  if (todo.completed) return 'completed';
  if (!todo.dueDate) return 'undated';
  if (todo.dueDate < today) return 'overdue';
  if (todo.dueDate === today) return 'today';
  return 'upcoming';
}

/**
 * Buckets tasks by due date, dropping empty groups.
 *
 * Empty groups are dropped rather than rendered as bare headers: a heading over
 * nothing reads as a bug. Order within a group is the list's own order, so the
 * arrangement only ever moves a task between groups, never shuffles it.
 */
export function groupTodos(todos: readonly Todo[], today: DayKey): TaskGroup[] {
  const buckets: Record<TaskGroupKey, Todo[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    undated: [],
    completed: [],
  };
  for (const todo of todos) {
    buckets[groupKeyFor(todo, today)].push(todo);
  }
  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: GROUP_TITLES[key],
    data: buckets[key],
  }));
}
