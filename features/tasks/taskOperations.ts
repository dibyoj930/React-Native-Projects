/**
 * Task mutation operations and rules (business logic extracted from UI).
 */
import type { Todo } from '../../todos/model';
import type { TodoDraft } from '../../components/AddTodoModal';

export type TaskContext = {
  now: () => number;
};

export function applyDraftToTodo(todo: Todo, draft: TodoDraft, ctx: TaskContext): Todo {
  return {
    ...todo,
    text: draft.text,
    notes: draft.notes,
    dueDate: draft.dueDate,
    // Preserve existing tag unless draft carries one; keeps legacy unknown tags.
    tags: draft.tag ? [draft.tag] : todo.tags,
  };
}

export function createTodoFromDraft(draft: TodoDraft, id: string, ctx: TaskContext): Todo {
  return {
    id,
    text: draft.text,
    completed: false,
    tags: draft.tag ? [draft.tag] : [],
    createdAt: ctx.now(),
    notes: draft.notes,
    dueDate: draft.dueDate,
  };
}

export function toggleCompleteTodo(todo: Todo, ctx: TaskContext): Todo {
  const nowCompleted = !todo.completed;
  return {
    ...todo,
    completed: nowCompleted,
    completedAt: nowCompleted ? ctx.now() : undefined,
  };
}
