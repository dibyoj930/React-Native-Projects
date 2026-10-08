import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { TimerPickerModal } from 'react-native-timer-picker';
import { cancelTimerNotification, useNotifications } from './notifications';
import { TodoRow } from './components/TodoRow';
import { AllTasksScreen } from './components/AllTasksScreen';
import { AddTodoModal, type TodoDraft } from './components/AddTodoModal';
import { HomeScreen } from './components/HomeScreen';
import type { TimerState } from './hooks/useFocusTimer';
import { useTimerOrchestration } from './hooks/useTimerOrchestration';
import { useProductivity, formatDueLabel, todayKey } from './productivity';
import { type Todo } from './todos/model';
import { buildExportPayload, exportFilename } from './todos/taskRepository';
import { findTodo } from './todos/taskSelectors';
import { useTasks } from './todos/useTasks';
import { triggerHaptic } from './haptics';
import { useTheme } from './theme/useTheme';
import type { Theme } from './theme/theme';

// The task model, the tag vocabulary and the storage boundary all live under
// `todos/`. Nothing is re-exported from here: the components that need them
// import the domain directly, and this module's own surface is the screen.

/**
 * Where the duration picker opens.
 *
 * These minutes used to drive a global "25 / 30 / 60 min" chip row above the
 * task list. That path is gone because it could not know which task it was for:
 * it fell back to `unfinished[unfinished.length - 1]` — the most recently *added*
 * task, silently — and when nothing was open it created a task literally named
 * "25 min focus" and started the timer on it.
 *
 * Choosing a duration now happens per task, via the picker, so the work being
 * focused on is never ambiguous. The picker library renders no custom content
 * slot, so the old three-chip shortcut is genuinely gone rather than relocated —
 * the picker opens on this value instead of zero, which reads as "nothing chosen".
 */
const DEFAULT_FOCUS_MINUTES = 25;

/**
 * Where the app is showing.
 *
 * A union rather than three booleans: exactly one screen is up at a time, and a
 * tag view that forgot which tag it is showing would render an unfiltered list
 * while looking perfectly correct. `name` carries which, and the tag carries its
 * own filter, so an impossible state cannot be built.
 */
export type Screen =
  | { name: 'home' }
  | { name: 'tasks' }
  | { name: 'tag'; tag: string };

export type WelcomeComponentProps = {
  /** Which screen to show. The union is on the `Screen` type above. */
  screen: Screen;
  onNavigate: (screen: Screen) => void;
};

/**
 * The composition point: where the screens are chosen, and where the rules that
 * cross two domains are written.
 *
 * Everything single-domain now has a home of its own. The list, its persistence
 * and its CRUD are `todos/useTasks`; the countdown, its picker and the row's
 * timer controls are `hooks/useTimerOrchestration`; the dashboard column and the
 * task list are presentational screens under `components/`. What is left here is
 * only the crossing: a timer's expiry decides both what happens to its task and
 * which way the session is closed; a deletion owes the timer a cancellation; a
 * completion must clear the timer and lock guards before it may write. None of
 * those rules can sit on one side without the other, which is why they have not
 * been pushed into either hook.
 *
 * The screens are still one component rather than three over a provider, and
 * that remains deliberate: there is one piece of navigation state (the `screen`
 * prop) and a provider would be a second way to reach what is already here. What
 * that buys is that the task list exists in exactly one place — the tasks screen
 * and its tag views are the same list under a predicate — instead of two.
 */
export default function WelcomeComponent({ screen, onNavigate }: WelcomeComponentProps) {
  const t = useTheme();
  // Styles are theme-derived, so they are built per theme rather than once at
  // module scope. `useTheme` returns a stable object, so this only recomputes
  // when the system colour scheme actually flips.
  const styles = useMemo(() => createStyles(t), [t]);
  // Owning the list — state, load/save, create/edit/delete and the two
  // completion writes — is `todos/useTasks`'s job. What stays here are the rules
  // that need *both* sides: a timer and a task, a session log and a task.
  const { todos, createTodo, updateTodo, removeTodo, completeTodos, setCompleted } = useTasks();
  // The notification layer already asks the OS for permission on mount — above
  // this component, in `NotificationProvider` — and owns the answer. Keeping a
  // second copy here meant two identical requests and two states for one fact.
  const { permission } = useNotifications();
  // Which task the edit sheet is open for, if any. The sheet holds the form state
  // itself — the old inline rename kept `editIndex` *and* `editText` here, a
  // second copy of what was already typed, and could only carry a title.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The task sheet: creating and editing both. A boolean rather than a navigation
  // library — there is no router in this app, and one sheet is not a reason to
  // add one.
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
   * component supplies is the *other* side of every timer event — what a start,
   * a pause, a stop and an expiry each mean for the task and the session log.
   * Those five are the cross-domain rules and they stay here, where both the
   * productivity layer and the task list are in reach.
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
   * Whether the completion checkbox is inert, for two different reasons:
   *
   *  - a live focus timer is attached, running or paused. The task is mid-focus,
   *    and completing it by hand would count the work twice — once now, and once
   *    again when the timer reaches zero and completes it.
   *  - a finished timer already locked it. That one only blocks *reopening*: a
   *    locked task that is somehow still open can still be completed, so marking
   *    every locked task disabled would be wrong.
   *
   * Defined once and used for both the dimmed look and the accessibility state,
   * so the checkbox cannot look disabled while still reporting itself enabled
   * to VoiceOver.
   */
  const isCompletionDisabled = useCallback(
    (id: string, completed: boolean): boolean =>
      hasTimer(id) || (completed && isLocked(id)),
    [hasTimer, isLocked],
  );

  /**
   * The task the edit sheet is open for, or null in create mode.
   *
   * Derived rather than stored: the sheet needs a `Todo` to prefill from, and
   * storing it would be a second reference to an object the list already owns — one
   * that silently went stale the moment anything else rewrote that task.
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
    // Both are cleared together. Leaving an id behind would make the *next* open of
    // the sheet save over a task the user is not looking at.
    setShowTaskSheet(false);
    setEditingId(null);
  }, []);

  /**
   * Applies the sheet's draft: creates a task, or rewrites an existing one.
   *
   * One submit path for both jobs, because they are the same fields. The merge
   * rules — which fields an edit may overwrite, which are facts about the task,
   * that a draft with no tag leaves the task's own tag alone — are the domain's
   * and live with `taskOperations`. What only this component can do happens
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

  const deleteTodo = (id: string) => {
    triggerHaptic('taskDeleted');
    cancelTimerNotification(id);
    // Before removing the task, so a running timer cannot outlive its subject.
    clearTimer(id);
    // The focus really was spent, it just never produced a completion.
    finishFocus(id, 'stopped');
    removeTodo(id);
  };

  const toggleComplete = (id: string) => {
    const target = findTodo(todos, id);
    const nowCompleted = !(target?.completed ?? false);

    // A task with a live focus timer is mid-session, and its checkbox is shown
    // disabled. The rule lives here rather than only in the render so that a
    // checkbox which merely *looks* disabled cannot be completed by a stray tap:
    // completing now would bank the completion immediately and then bank the
    // focus time again when the timer reached zero, counting one piece of work
    // twice. Either the timer completes the task, or stopping it hands the
    // decision back to the user.
    if (hasTimer(id)) {
      return;
    }

    // A task whose timer ran all the way to zero is locked. The focus time was
    // already spent, so letting a tap undo it would silently rewrite the day's
    // statistics — the streak and mission would drop for work that genuinely
    // happened. Return before touching any state, so a locked task is a true
    // no-op rather than an undo queued behind a guard.
    if (!nowCompleted && attributionFor(id).isTimerCompleted) {
      return;
    }

    triggerHaptic(nowCompleted ? 'taskCompleted' : 'taskUncompleted');
    cancelTimerNotification(id);
    clearTimer(id);
    // Both guards are checked, so the write happens only for a task that is
    // allowed to move; `setCompleted` stamps the time itself.
    setCompleted(id, nowCompleted);
    // Ticking by hand mid-timer still earns focus credit, but it is recorded as
    // `finished` rather than `completed`: the user chose to complete it, so the
    // completion stays correctable. Only a timer running out locks.
    finishFocus(id, nowCompleted ? 'finished' : 'stopped');
    noteActivity();
  };

  /**
   * One task row, for whichever list is asking.
   *
   * A single function rather than a prop-drilled pile of handlers, because the
   * unfiltered list and each tag view must show identical rows: same checkbox
   * rules, same timer controls, same inline rename. Every behaviour a row has is
   * a closure over the state above, so there is nothing here that could be
   * defined twice and drift.
   *
   * Also the reason `AllTasksScreen` takes a renderer instead of the handlers
   * themselves — it has no opinion about how a task behaves.
   */
  const renderRow = (todo: Todo) => (
    <TodoRow
      completionDisabled={isCompletionDisabled(todo.id, todo.completed)}
      dueLabel={todo.dueDate ? formatDueLabel(todo.dueDate, today) : undefined}
      hasTimer={hasTimer(todo.id)}
      isLocked={isLocked(todo.id)}
      isRunning={isRunning(todo.id)}
      onDelete={() => deleteTodo(todo.id)}
      onEdit={() => openEdit(todo.id)}
      onStartFocus={() => openTimerPicker(todo.id)}
      onStopTimer={() => stopTimer(todo.id)}
      onToggleComplete={() => toggleComplete(todo.id)}
      onToggleTimerRunning={() => toggleTimerRunning(todo.id)}
      timerLabel={formatTimeForTodo(todo.id)}
      todo={todo}
    />
  );

  const exportTodos = async () => {
    if (todos.length === 0) {
      Alert.alert('Nothing to export', 'Add a task before exporting your list.');
      return;
    }

    // The body and the filename are the domain's, not this component's: the
    // same shape is asserted in `todos/taskRepository`, so an export written
    // here cannot drift from the one the rest of the app expects.
    const payload = buildExportPayload(todos, snapshot);
    const fileName = exportFilename(payload);
    const json = JSON.stringify(payload, null, 2);

    try {
      // iOS/Android share sheet: lets the user save to Files, send to mail, etc.
      // The filename is passed through the message so it survives the round trip.
      await Share.share({
        title: 'Export tasks',
        message: `${fileName}\n\n${json}`,
      }, { subject: fileName });
    } catch (error) {
      console.error('Failed to export todos:', error);
      Alert.alert('Export failed', 'Could not open the share sheet.');
    }
  };

  // Both sheets are built here, outside the branch, and rendered in both screens.
  // The add sheet has to work from either screen — you can be mid-focus with the
  // timer sheet open — and a `Modal` does not remount when its parent re-renders,
  // which matters because this component re-renders once a second while a timer
  // runs. Building them once also keeps the two screens from drifting.
  const sheets = (
    <>
      {/* Opened per task, so the work being focused on is never ambiguous.

          Opens on 25 minutes rather than 00:00 — the picker's zero state reads
          as "you picked nothing", and 25 is the shortest duration the presets
          ever offered. */}
      <TimerPickerModal
        closeOnOverlayPress
        hideDays
        initialValue={{ minutes: DEFAULT_FOCUS_MINUTES }}
        LinearGradient=""
        modalProps={{
          overlayOpacity: 0.2,
        }}
        modalTitle="How long will you focus?"
        onCancel={handleTimerCancel}
        onConfirm={(picked) => handleTimerConfirm(picked as TimerState)}
        setIsVisible={setPickerVisible}
        styles={{
          theme: t.mode,
        }}
        visible={pickerVisible}
      />
      <AddTodoModal
        defaultTag={screen.name === 'tag' ? screen.tag : undefined}
        onClose={closeTaskSheet}
        onSubmit={submitTask}
        task={editingTodo}
        visible={showTaskSheet}
      />
    </>
  );

  if (screen.name !== 'home') {
    // A full screen swap rather than a `Modal`. It is the app's only task list, so
    // it is a destination with somewhere to come back to, not a layer over the
    // dashboard — and it gets its own header with a back control, which a
    // `pageSheet` only offers on iOS via a swipe.
    //
    // The unfiltered list and the tag view are this one branch. Both are the same
    // screen over the same rows; only the predicate differs, and `AllTasksScreen`
    // owns that predicate for exactly this reason.
    const tag = screen.name === 'tag' ? screen.tag : undefined;

    return (
      <View style={styles.screen}>
        <AllTasksScreen
          filterTag={tag}
          title={tag ?? 'All tasks'}
          onAddTask={openCreate}
          onBack={() => onNavigate({ name: 'home' })}
          renderRow={renderRow}
          todos={todos}
        />
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <HomeScreen
        notificationsBlocked={permission === 'denied'}
        onAddTask={openCreate}
        onExport={exportTodos}
        onOpenTag={(tag) => onNavigate({ name: 'tag', tag })}
        onOpenTasks={() => onNavigate({ name: 'tasks' })}
        todos={todos}
      />
      {sheets}
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    /**
     * The shared root of both screens.
     *
     * Deliberately un-padded: each screen now applies its own insets, because the
     * tasks screen is edge-to-edge with a hairline-divided header while the home
     * screen keeps a 16px gutter. A single padded root could only suit one of them.
     *
     * The home screen's own styles went with it into `components/HomeScreen.tsx`;
     * nothing rendered here needs anything beyond the root.
     */
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
  });
};
