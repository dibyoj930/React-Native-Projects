/**
 * The task screen's controller: everything the screens need that is not
 * presentation.
 *
 * It composes the pieces that already exist — `useTasks` for the list and its
 * CRUD, `useTimerOrchestration` for the countdown and its picker, and
 * `useProductivity` for the session log — and then owns the rules that cross
 * them. Those rules cannot sit on one side without the other: a timer's expiry
 * decides both what happens to its task and which way the session is closed; a
 * deletion owes the timer a cancellation and the log a stop; a completion must
 * clear the timer and check the lock before it may write.
 *
 * The hook returns data and intent handlers, not JSX. `rowPropsFor` answers what
 * one row's props are; turning that into an element is the view's job, which is
 * why this file has no `tsx` and imports no components at runtime.
 *
 * Pattern note: same shape as `useTasks` and `useFocusTimer` — plain state plus
 * named operations, no context. One component consumes it, so a provider would
 * be a second way to reach the same state.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share } from 'react-native';

import { cancelTimerNotification, useNotifications } from '../notifications';
import { formatDueLabel, todayKey, useProductivity } from '../productivity';
import { triggerHaptic } from '../haptics';
import type { TodoRowProps } from '../components/TodoRow';
import type { Todo, TodoDraft } from '../todos/model';
import { buildExportPayload, exportFilename } from '../todos/taskRepository';
import { isCompletionDisabled, manualToggleStatus } from '../todos/taskRules';
import { findTodo } from '../todos/taskSelectors';
import { useTasks } from '../todos/useTasks';
import type { TimerState } from './useFocusTimer';
import { useTimerOrchestration } from './useTimerOrchestration';

/** Everything `WelcomeComponent` reads to compose its screens. */
export type TaskScreen = {
  todos: Todo[];
  /** Notifications were asked for and refused, so a timer's alert will not land. */
  notificationsBlocked: boolean;
  /** The task the edit sheet is open for, or null in create mode. */
  editingTodo: Todo | null;
  /** Whether the add/edit sheet is visible. */
  showTaskSheet: boolean;
  /** Whether the duration picker is visible. */
  pickerVisible: boolean;
  /** Opens and closes the duration picker, for the modal's own visibility prop. */
  setPickerVisible: (visible: boolean) => void;
  handleTimerConfirm: (picked: TimerState) => void;
  handleTimerCancel: () => void;
  /** Opens the create sheet. */
  openCreate: () => void;
  /** Closes the add/edit sheet without saving. */
  closeTaskSheet: () => void;
  /** Applies the sheet's draft: creates a task, or rewrites an existing one. */
  submitTask: (draft: TodoDraft) => void;
  /** Shares the list as JSON. Alerts instead when there is nothing to export. */
  exportTodos: () => Promise<void>;
  /** The props for one task row, wired to this controller's handlers. */
  rowPropsFor: (todo: Todo) => TodoRowProps;
};

export function useTaskScreen(): TaskScreen {
  // Owning the list — state, load/save, create/edit/delete and the two
  // completion writes — is `todos/useTasks`'s job. What stays here are the rules
  // that need *both* sides: a timer and a task, a session log and a task.
  const { todos, createTodo, updateTodo, removeTodo, completeTodos, setCompleted } = useTasks();
  // The notification layer already asks the OS for permission on mount — above
  // this hook, in `NotificationProvider` — and owns the answer. Keeping a second
  // copy here meant two identical requests and two states for one fact.
  const { permission } = useNotifications();

  // Which task the edit sheet is open for, if any. The sheet holds the form state
  // itself, so this carries only the id — the one thing editing needs to
  // remember that the list does not already own.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The task sheet: creating and editing both. A boolean rather than a
  // navigation library — there is no router in this app, and one sheet is not a
  // reason to add one.
  const [showTaskSheet, setShowTaskSheet] = useState(false);

  // Today's day key, once per render and shared by every row. It cannot differ
  // between rows, and `localDateKey` builds a `Date` to do it, so computing it
  // inside the row loop would repeat that work once per task on every tick.
  const today = todayKey();

  const {
    snapshot,
    setTasks,
    startFocus,
    pauseFocus,
    resumeFocus,
    finishFocus,
    noteActivity,
    attributionFor,
  } = useProductivity();

  // Feed the task list to the scoring layer. Passed by reference, so this only
  // costs a recompute when the list genuinely changes — not on the one-second
  // timer re-render below.
  useEffect(() => {
    setTasks(todos);
  }, [todos, setTasks]);

  /**
   * True when a timer on this task ran all the way to zero.
   *
   * Derived from the session log rather than stored on the task, so the lock is
   * a fact about what happened instead of a flag that could drift out of sync
   * with it.
   */
  const isLocked = useCallback(
    (id: string) => attributionFor(id).isTimerCompleted,
    [attributionFor],
  );

  /**
   * Fired when timers reach their end time — from the 1s tick, or on the next
   * foreground if JS was suspended and the interval never ran. The pending
   * notification is not cancelled here: the OS has already delivered it, and
   * Notifee drops one-shot timestamp triggers once they fire.
   */
  const handleTimerExpired = useCallback(
    (ids: string[]) => {
      const completedAt = Date.now();
      completeTodos(ids, completedAt);
      // Option A: a timer that ran to zero completed its task, so the session is
      // closed as `completed` — this is what earns the momentum bonus.
      for (const id of ids) {
        finishFocus(id, 'completed');
      }
    },
    [completeTodos, finishFocus],
  );

  /**
   * The timer, its picker and the row controls around them.
   *
   * The engine (`useFocusTimer`) keeps ticking inside the hook; what this
   * supplies is the *other* side of every timer event — what a start, a pause, a
   * stop and an expiry each mean for the task and the session log. Those five
   * are the cross-domain rules, and they stay here where both the productivity
   * layer and the task list are in reach.
   */
  const {
    hasTimer,
    isRunning,
    clearTimer,
    pickerVisible,
    setPickerVisible,
    openTimerPicker,
    handleTimerConfirm,
    handleTimerCancel,
    stopTimer,
    toggleTimerRunning,
    formatTimeForTodo,
  } = useTimerOrchestration({
    onTimerExpired: handleTimerExpired,
    onStartFocus: startFocus,
    onPauseFocus: pauseFocus,
    onResumeFocus: resumeFocus,
    // A deliberate stop and a natural expiry are both "the session is over";
    // only the *status* differs, which is the argument the hook passes through.
    onStopFocus: finishFocus,
  });

  /**
   * Deletes a task and settles everything it owed the other domains.
   *
   * The notification and the timer are cleared before the task leaves the list,
   * so a running timer cannot outlive its subject, and the session is closed as
   * stopped: the focus really was spent, it just never produced a completion.
   */
  const deleteTodo = useCallback(
    (id: string) => {
      triggerHaptic('taskDeleted');
      cancelTimerNotification(id);
      clearTimer(id);
      finishFocus(id, 'stopped');
      removeTodo(id);
    },
    [clearTimer, finishFocus, removeTodo],
  );

  /**
   * Moves one task's completion, once the guards allow it.
   *
   * A task with a live focus timer is mid-session, and its checkbox is shown
   * disabled. The rule is enforced here as well as in the render so that a
   * checkbox which merely *looks* disabled cannot be completed by a stray tap:
   * completing now would bank the completion immediately and then bank the focus
   * time again when the timer reached zero, counting one piece of work twice.
   * Either the timer completes the task, or stopping it hands the decision back.
   *
   * A task whose timer ran all the way to zero is locked against reopening. The
   * focus time was already spent, so letting a tap undo it would silently rewrite
   * the day's statistics. Return before touching any state, so a locked task is a
   * true no-op rather than an undo queued behind a guard.
   */
  const toggleComplete = useCallback(
    (id: string) => {
      const target = findTodo(todos, id);
      const nowCompleted = !(target?.completed ?? false);

      if (isCompletionDisabled(hasTimer(id), target?.completed ?? false, isLocked(id))) {
        return;
      }

      triggerHaptic(nowCompleted ? 'taskCompleted' : 'taskUncompleted');
      cancelTimerNotification(id);
      clearTimer(id);
      // Both guards are checked, so the write happens only for a task that is
      // allowed to move; `setCompleted` stamps the time itself.
      setCompleted(id, nowCompleted);
      // Ticking by hand mid-timer still earns focus credit, but it is recorded
      // as `finished` rather than `completed`: the user chose to complete it, so
      // the completion stays correctable. Only a timer running out locks.
      finishFocus(id, manualToggleStatus(nowCompleted));
      noteActivity();
    },
    [clearTimer, finishFocus, hasTimer, isLocked, noteActivity, setCompleted, todos],
  );

  /**
   * The task the edit sheet is open for, or null in create mode.
   *
   * Derived rather than stored: the sheet needs a `Todo` to prefill from, and
   * storing it would be a second reference to an object the list already owns —
   * one that silently went stale the moment anything else rewrote that task.
   */
  const editingTodo = editingId ? findTodo(todos, editingId) ?? null : null;

  /** Create mode: no task, so the sheet starts empty. */
  const openCreate = useCallback(() => {
    setEditingId(null);
    setShowTaskSheet(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setShowTaskSheet(true);
  }, []);

  const closeTaskSheet = useCallback(() => {
    // Both are cleared together. Leaving an id behind would make the *next* open
    // of the sheet save over a task the user is not looking at.
    setShowTaskSheet(false);
    setEditingId(null);
  }, []);

  /**
   * Applies the sheet's draft: creates a task, or rewrites an existing one.
   *
   * One submit path for both jobs, because they are the same fields. The merge
   * rules — which fields an edit may overwrite, which are facts about the task,
   * that a draft with no tag leaves the task's own tag alone — are the domain's
   * and live with `taskOperations`. What only this controller can do happens
   * here: the productivity layer is told the list changed, a new task buzzes,
   * and either way the sheet closes.
   */
  const submitTask = useCallback(
    (draft: TodoDraft) => {
      if (editingId) {
        updateTodo(editingId, draft);
        noteActivity();
      } else {
        createTodo(draft);
        triggerHaptic('taskAdded');
        noteActivity();
      }
      closeTaskSheet();
    },
    [closeTaskSheet, createTodo, editingId, noteActivity, updateTodo],
  );

  /**
   * Shares the list as a JSON file, through the OS share sheet.
   *
   * The body and the filename are the domain's, not this controller's: the same
   * shape is asserted in `todos/taskRepository`, so an export written here cannot
   * drift from the one the rest of the app expects.
   */
  const exportTodos = useCallback(async () => {
    if (todos.length === 0) {
      Alert.alert('Nothing to export', 'Add a task before exporting your list.');
      return;
    }

    const payload = buildExportPayload(todos, snapshot);
    const fileName = exportFilename(payload);
    const json = JSON.stringify(payload, null, 2);

    try {
      // iOS/Android share sheet: lets the user save to Files, send to mail, etc.
      // The filename is passed through the message so it survives the round trip.
      await Share.share(
        {
          title: 'Export tasks',
          message: `${fileName}\n\n${json}`,
        },
        { subject: fileName },
      );
    } catch (error) {
      console.error('Failed to export todos:', error);
      Alert.alert('Export failed', 'Could not open the share sheet.');
    }
  }, [snapshot, todos]);

  /**
   * The properties of one task row, for whichever list is asking.
   *
   * A single builder rather than a prop-drilled pile of handlers, because the
   * unfiltered list and each tag view must show identical rows: same checkbox
   * rules, same timer controls, same edit and delete. Every behaviour a row has
   * is a closure over the state above, so there is nothing here that could be
   * defined twice and drift.
   */
  const rowPropsFor = useCallback(
    (todo: Todo): TodoRowProps => ({
      todo,
      completionDisabled: isCompletionDisabled(
        hasTimer(todo.id),
        todo.completed,
        isLocked(todo.id),
      ),
      dueLabel: todo.dueDate ? formatDueLabel(todo.dueDate, today) : undefined,
      hasTimer: hasTimer(todo.id),
      isLocked: isLocked(todo.id),
      isRunning: isRunning(todo.id),
      onDelete: () => deleteTodo(todo.id),
      onEdit: () => openEdit(todo.id),
      onStartFocus: () => openTimerPicker(todo.id),
      onStopTimer: () => stopTimer(todo.id),
      onToggleComplete: () => toggleComplete(todo.id),
      onToggleTimerRunning: () => toggleTimerRunning(todo.id),
      timerLabel: formatTimeForTodo(todo.id),
    }),
    [
      deleteTodo,
      formatTimeForTodo,
      hasTimer,
      isLocked,
      isRunning,
      openEdit,
      openTimerPicker,
      stopTimer,
      today,
      toggleComplete,
      toggleTimerRunning,
    ],
  );

  return {
    todos,
    notificationsBlocked: permission === 'denied',
    editingTodo,
    showTaskSheet,
    pickerVisible,
    setPickerVisible,
    handleTimerConfirm,
    handleTimerCancel,
    openCreate,
    closeTaskSheet,
    submitTask,
    exportTodos,
    rowPropsFor,
  };
}
