/**
 * Task mutation operations and rules (business logic extracted from UI).
 */
import type { Todo, TodoDraft } from './model';

export type TaskContext = {
  now: () => number;
};

/**
 * Merges an edit sheet draft into an existing task.
 *
 * `text`, `notes`, `dueDate` and — when the draft carries one — the tag. `id`,
 * `createdAt`, `completed` and `completedAt` are facts about the task rather
 * than form data, so they are not in the draft and cannot be overwritten by it;
 * that is what makes saving a task from the sheet safe for a completed one.
 *
 * The tag rule is the subtle one: the sheet prefills the current tag when one
 * exists, so a saved task keeps its tag without the user lifting a finger, and a
 * tag picked in the sheet replaces it. Only a draft *without* a tag leaves the
 * task's own alone — which is what keeps a legacy tag (one not in the
 * vocabulary, so not showable as a chip) from being deleted by the act of
 * editing something else.
 *
 * No `ctx`: an edit copies form fields and stamps nothing, so there is no clock
 * to inject. The operations that do need the time take it.
 */
export function applyDraftToTodo(todo: Todo, draft: TodoDraft): Todo {
  return {
    ...todo,
    text: draft.text,
    notes: draft.notes,
    dueDate: draft.dueDate,
    // Preserve existing tag unless draft carries one; keeps legacy unknown tags.
    tags: draft.tag ? [draft.tag] : todo.tags,
  };
}

/**
 * Builds a new, open task from a sheet draft.
 *
 * A task carries the tag the person chose, and nothing more: creating from a
 * tag view prefills that choice with the view's own tag, so the born-on-`#gym`
 * task stays on the `#gym` screen — visibly, changeably, opted into by looking
 * at the sheet rather than applied after the fact. An empty draft makes a tagless
 * task.
 *
 * The id and the creation time come from the caller's `ctx`, so tests can pin
 * them instead of chasing `Date.now`.
 */
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
