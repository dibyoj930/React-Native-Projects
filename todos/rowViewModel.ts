/**
 * The task row's view model.
 *
 * `TodoRow` renders exactly what it is handed, so its props type is the contract
 * the row's controller (`useTaskScreen.rowPropsFor`) builds to and the row's
 * tests use. It lives here rather than in the component for the same reason
 * `TodoDraft` lives in the model: the controller that builds these rows must not
 * import a component to name its output, and a components directory is the wrong
 * home for the type of a promise between controller and view.
 *
 * `components/TodoRow.tsx` re-exports it so the row keeps its public shape.
 */
import type { Todo } from './model';

export type TodoRowProps = {
  todo: Todo;
  /** A focus timer is attached to this task. */
  hasTimer: boolean;
  /** That timer is counting down, rather than paused. */
  isRunning: boolean;
  /** Remaining time, already formatted. Only read when `hasTimer` is true. */
  timerLabel: string;
  /** A finished focus session closed this task. */
  isLocked: boolean;
  /**
   * Whether the checkbox must not respond: a live timer in either direction, or a
   * finished timer's lock on reopening.
   */
  completionDisabled: boolean;
  onToggleComplete: () => void;
  onStartFocus: () => void;
  onToggleTimerRunning: () => void;
  onStopTimer: () => void;
  /**
   * Opens the edit sheet for this task.
   *
   * Editing used to happen inline in the row — a `TextInput` that swapped in for the
   * title. It could only ever hold the title, and the requirement is that a task's
   * date, title and notes are all editable, so the sheet took it over: same three
   * fields as creation, prefilled, one path for both. That leaves this component with
   * no form state at all, which is what the `editing` props used to be.
   */
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Human-readable due date, e.g. `Due Fri`. Absent when the task has no date.
   *
   * Passed in already formatted rather than derived here: this component has no
   * business calling `Date`, and the day key it would parse is deliberately
   * timezone-free.
   */
  dueLabel?: string;
  /**
   * Whether that date is in the past. Only read when `dueLabel` is present.
   *
   * Passed in for the same reason as `dueLabel`: answering it needs today's day
   * key, and the row has no clock. The controller derives it from the task, so
   * the row only decides how an overdue date *looks*.
   */
  overdue: boolean;
};