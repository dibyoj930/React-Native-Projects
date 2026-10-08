/**
 * Pure task selection helpers.
 */
import type { Todo } from '../../todos/model';

export function openCount(todos: readonly Todo[]): number {
  return todos.filter((todo) => !todo.completed).length;
}

export function completedCount(todos: readonly Todo[]): number {
  return todos.filter((todo) => todo.completed).length;
}

export function findTodo(todos: readonly Todo[], id: string): Todo | undefined {
  return todos.find((todo) => todo.id === id);
}

export function filterByTag(todos: readonly Todo[], tag: string | undefined): Todo[] {
  if (!tag) return todos.slice();
  return todos.filter((todo) => (todo.tags ?? []).includes(tag));
}
