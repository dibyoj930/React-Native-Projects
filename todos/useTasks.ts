/**
 * Task state, persistence and the CRUD rules that belong to the task domain.
 *
 * What stays *out* is the interesting part: whether a task may be completed
 * while a focus timer holds it, what a timer's expiry does to its task, and the
 * cleanup a deletion owes the timer and the session log all span domains, so
 * they stay in the container that owns both sides. This hook owns the list and
 * nothing but the list — create, edit, delete, the two completion writes, and
 * the read/write pair against storage.
 *
 * Pattern note: same shape as `useFocusTimer` — plain state plus named
 * operations, no context. One component consumes it, so a provider would be a
 * second way to reach the same state.
 */
import { useCallback, useEffect, useState } from 'react';

import { nextTodoId, type Todo, type TodoDraft } from './model';
import { applyDraftToTodo, createTodoFromDraft } from './taskOperations';
import { loadTodos, saveTodos } from './taskRepository';

export function useTasks() {
  const [todos, setTodos] = useState<Todo[]>([]);
  // Guards the save effect below. Without it, the first render writes an empty
  // array over the stored list before `loadTodos` resolves — a narrow window in
  // which killing the app destroys every task.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // `loadTodos` repairs whatever is stored; on a missing key, corrupt
        // value or read failure it hands back an empty list rather than
        // throwing, so a broken store degrades to an empty app instead of a
        // spinner that never resolves.
        setTodos(await loadTodos());
      } finally {
        // Set even on failure or corrupt data: refusing to save afterwards would
        // turn a recoverable read error into permanent data loss.
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveTodos(todos);
  }, [todos, hydrated]);

  /** New task from the sheet. The id and the creation time are the model's. */
  const createTodo = useCallback((draft: TodoDraft) => {
    const todo = createTodoFromDraft(draft, nextTodoId(), { now: Date.now });
    setTodos((prev) => [...prev, todo]);
  }, []);

  /**
   * Applies an edit sheet draft to the task it was opened for.
   *
   * Only tasks with that id are touched, so an edit cannot land on a task the
   * user is no longer looking at.
   */
  const updateTodo = useCallback((id: string, draft: TodoDraft) => {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? applyDraftToTodo(todo, draft) : todo)),
    );
  }, []);

  /** Drops the task itself. Whatever the task owed other domains is the caller's. */
  const removeTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  }, []);

  /**
   * Completes several tasks at one instant — the expiry path, where every task
   * a timer was attached to finishes together and must share one timestamp.
   *
   * Tasks that are already complete are left alone, so re-firing an expiry
   * cannot restamp a completion time it did not cause.
   */
  const completeTodos = useCallback((ids: string[], completedAt: number) => {
    const finished = new Set(ids);
    setTodos((prev) =>
      prev.map((todo) =>
        finished.has(todo.id) && !todo.completed
          ? { ...todo, completed: true, completedAt }
          : todo,
      ),
    );
  }, []);

  /**
   * Writes one task's completion.
   *
   * Deliberately *not* `toggle`: the caller has already decided which way the
   * flag is going, after checking the timer and lock guards. A completion time
   * is stamped when completing and cleared when reopening, so a task that was
   * finished and then undone does not claim a completion it no longer earned.
   */
  const setCompleted = useCallback((id: string, completed: boolean) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              completed,
              completedAt: completed ? Date.now() : undefined,
            }
          : todo,
      ),
    );
  }, []);

  return {
    todos,
    hydrated,
    createTodo,
    updateTodo,
    removeTodo,
    completeTodos,
    setCompleted,
  };
}
