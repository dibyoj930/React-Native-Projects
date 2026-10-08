import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { TimerPickerModal } from 'react-native-timer-picker';
import {
  cancelTimerNotification,
  ensurePermission,
  syncTimerNotification,
} from './notifications';
import { TodoRow } from './components/TodoRow';
import { AllTasksScreen } from './components/AllTasksScreen';
import { AddTodoModal, type TodoDraft } from './components/AddTodoModal';
import { ProductivityDashboard } from './components/ProductivityDashboard';
import { TodayCard } from './components/TodayCard';
import { useFocusTimer, type TimerState } from './hooks/useFocusTimer';
import { useProductivity, formatDueLabel, todayKey } from './productivity';
import { type Todo } from './todos/model';
import { useTasks } from './todos/useTasks';
import { AVAILABLE_TAGS, tintOf } from './todos/tags';
import { triggerHaptic } from './haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme/useTheme';
import type { Theme } from './theme/theme';

// The task model moved to `todos/model.ts` so the shared row, the All Tasks
// screen and the Add Todo modal can use it without importing a type out of this
// component. Re-exported here because it was part of this module's public shape
// and something outside may already import it from this path.
export type { Todo } from './todos/model';
export { migrateTodos } from './todos/model';

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

// The tag vocabulary and its colour derivation now live in `todos/tags.ts`,
// because the task row renders tag chips too and a second copy of this table is
// precisely how the old `TAG_COLORS` / `getTagColor` lookup ended up diverging
// from `AVAILABLE_TAGS` in the first place.
//
// NOTE: that old lookup table is now gone too. It was superseded by
// `AVAILABLE_TAGS` + `TAG_ACCENTS` and had no callers, so it was removed rather
// than left behind as a second, silently-diverging colour map.
//
// The chips themselves moved into the Add Todo sheet, where the choice applies to a
// task. Here they looked like a filter — sitting above the list, styled like one —
// but the list was `data={todos}`, unfiltered, so all they ever did was supply the
// default tag for the next task created. With the list on its own screen, a filter
// control over someone else's screen had nothing left to filter.

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
 * The app's state owner, and the switch between its screens.
 *
 * The screens live in one component rather than in three components over a shared
 * provider, and that is a deliberate choice against the obvious one. Task state,
 * the focus timers keyed by task id, the productivity wiring and the row renderer
 * are all entangled here: a timer's running state changes a row's controls, and
 * completing a task has to reach both the storage effect and the productivity
 * layer. Splitting this would mean either lifting a dozen pieces of state into a
 * context or threading them through as props, and both cost more than the
 * duplication they avoid.
 *
 * So the state stays put and only the *view* is chosen. What this buys is that the
 * task list can exist in exactly one place — the tasks screen and its tag views are
 * the same list under a predicate — instead of two, which is the whole point of
 * moving it there.
 */
export default function WelcomeComponent({ screen, onNavigate }: WelcomeComponentProps) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  // Styles are theme-derived, so they are built per theme rather than once at
  // module scope. `useTheme` returns a stable object, so this only recomputes
  // when the system colour scheme actually flips.
  const styles = useMemo(() => createStyles(t), [t]);
  // Owning the list — state, load/save, create/edit/delete and the two
  // completion writes — is `todos/useTasks`'s job. What stays here are the rules
  // that need *both* sides: a timer and a task, a session log and a task.
  const { todos, createTodo, updateTodo, removeTodo, completeTodos, setCompleted } = useTasks();
  // Which task the edit sheet is open for, if any. The sheet holds the form state
  // itself — the old inline rename kept `editIndex` *and* `editText` here, a
  // second copy of what was already typed, and could only carry a title.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
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

  const {
    hasTimer,
    isRunning,
    start: startTimer,
    pause: pauseTimer,
    resume: resumeTimer,
    clearTimer,
    remainingSecondsFor,
  } = useFocusTimer({ onExpire: handleTimerExpired });

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

  useEffect(() => {
    (async () => {
      const status = await ensurePermission();
      setPermissionStatus(status);
    })();
  }, []);

  /**
   * The task the edit sheet is open for, or null in create mode.
   *
   * Derived rather than stored: the sheet needs a `Todo` to prefill from, and
   * storing it would be a second reference to an object the list already owns — one
   * that silently went stale the moment anything else rewrote that task.
   */
  const editingTodo = editingId
    ? todos.find((todo) => todo.id === editingId) ?? null
    : null;

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
    const target = todos.find((todo) => todo.id === id);
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

  const openTimerPicker = (id: string) => {
    setPickerTargetId(id);
    setPickerVisible(true);
  };

  const handleTimerConfirm = (picked: TimerState) => {
    if (pickerTargetId) {
      const endPicker = startTimer(pickerTargetId, picked);
      if (endPicker !== null) {
        startFocus(pickerTargetId);
        syncTimerNotification({ timerId: pickerTargetId, title: 'Timer done', body: 'Time is up', fireAt: endPicker });
      }
    }
    setPickerVisible(false);
    setPickerTargetId(null);
  };

  const handleTimerCancel = () => {
    setPickerVisible(false);
    setPickerTargetId(null);
  };

  const stopTimer = (id: string) => {
    cancelTimerNotification(id);
    clearTimer(id);
    // Deliberate early stop — the focus was real, the completion was not.
    finishFocus(id, 'stopped');
  };

  const toggleTimerRunning = (id: string) => {
    if (isRunning(id)) {
      pauseTimer(id);
      // Banks the elapsed segment. Without this the time focused before a pause
      // would be unrecoverable, which was the original data-loss bug.
      pauseFocus(id);
      cancelTimerNotification(id);
      return;
    }
    const end = resumeTimer(id);
    if (end !== null) {
      resumeFocus(id);
      syncTimerNotification({ timerId: id, title: 'Timer done', body: 'Time is up', fireAt: end });
    }
  };

  const formatTimeForTodo = (id: string): string => {
    const total = remainingSecondsFor(id);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  /**
   * One task row, for whichever list is asking.
   *
   * A single function rather than a prop-drilled pile of handlers, because the home
   * list and the All Tasks sheet must show identical rows: same checkbox rules,
   * same timer controls, same inline rename. Every behaviour a row has is a closure
   * over the state above, so there is nothing here that could be defined twice and
   * drift.
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

    const payload = {
      exportedAt: new Date().toISOString(),
      totalTasks: todos.length,
      completedTasks: todos.filter((todo) => todo.completed).length,
      tasks: todos.map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        // Null rather than a guessed value: a task that predates these fields
        // genuinely has no known completion time, and an invented one would be
        // indistinguishable from a real one in the export.
        completedAt: todo.completedAt ?? null,
        createdAt: todo.createdAt ?? null,
        tags: todo.tags ?? [],
      })),
      // Statistics, so an export explains the user's own history rather than
      // just listing tasks. Everything here is recomputed, never a stored count.
      statistics: {
        momentum: {
          total: snapshot.momentum.total,
          band: snapshot.momentum.band,
        },
        streak: {
          current: snapshot.streak.current,
          longest: snapshot.streak.longest,
          freezesRemaining: snapshot.streak.freezesRemaining,
        },
        mission: {
          goal: snapshot.mission.goal,
          complete: snapshot.missionToday.complete,
          progress: snapshot.missionToday.ratio,
        },
        today: {
          day: snapshot.today,
          focusedSeconds: snapshot.todayRollup?.focusedSeconds ?? 0,
          tasksCompleted: snapshot.todayRollup?.tasksCompleted ?? 0,
        },
        daysTracked: snapshot.rollups.length,
      },
    };

    const fileName = `todos-${payload.exportedAt.slice(0, 10)}.json`;
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

  const openCount = todos.filter((todo) => !todo.completed).length;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.homeContent,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Today</Text>
        </View>

        {permissionStatus === 'denied' && (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>
              Notifications are off, so timer alerts will not reach you.
            </Text>
          </View>
        )}

        {/* The way to the work. It sits above the progress card rather than below
            it because a person opening this app is usually asking "what now?",
            and this is the answer to that question.

            The `+` sits beside it rather than in the header, because it belongs to
            this pair: add a task, then see your tasks. Both parts are the way into
            the list, so they share a row. */}
        <View style={styles.tileRow}>
          <TouchableOpacity
            accessibilityLabel="Open all tasks"
            accessibilityRole="button"
            onPress={() => onNavigate({ name: 'tasks' })}
            style={styles.allTasksTile}
          >
            <View style={styles.allTasksTextGroup}>
              <Text style={styles.allTasksTitle}>
                {todos.length === 0
                  ? 'Add your first task'
                  : openCount === 0
                    ? `All ${todos.length} done`
                    : `${openCount} open of ${todos.length}`}
              </Text>
              <Text style={styles.allTasksBody}>See every task you have written down.</Text>
            </View>
            <MaterialCommunityIcons
              color={t.colors.textMuted}
              name="chevron-right"
              size={20}
            />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Add a task"
            accessibilityRole="button"
            onPress={openCreate}
            style={styles.addButton}
          >
            <MaterialCommunityIcons
              color={t.colors.primaryText}
              name="plus"
              size={24}
            />
          </TouchableOpacity>
        </View>

        {/* Replaced a "3 of 7 tasks done" row, which counted every task ever
            added — including ones completed weeks ago — and so answered a
            question nobody was asking. */}
        <TodayCard />

        {/* Always here, between the two cards — and every tag is always here,
            not just the ones in use. A tag with nothing behind it opens an
            empty screen whose `+` creates its first task, which is the only way
            a task can come to carry a tag: the chips left the create sheet, so
            a vocabulary entry that disappeared because nothing used it would be
            gone for good. Empty when unused, never missing. */}
        <View style={styles.tagsSection}>
          <View style={styles.tagsHeadingRow}>
            <Text style={styles.tagsHeader}>Tags</Text>
            <Text style={styles.tagsHint}>Open one to see its tasks</Text>
          </View>
          <View style={styles.tagsChipRow}>
            {AVAILABLE_TAGS.map((tag) => (
              <TouchableOpacity
                key={tag.label}
                accessibilityLabel={`Show tasks tagged ${tag.label}`}
                accessibilityRole="button"
                activeOpacity={0.7}
                onPress={() => onNavigate({ name: 'tag', tag: tag.label })}
                style={[
                  styles.tagChip,
                  {
                    backgroundColor: tintOf(tag.accent),
                    borderColor: tintOf(tag.accent),
                  },
                ]}
              >
                <Text style={[styles.tagChipText, { color: tag.accent }]}>{tag.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Replaces the old `completedByTimer` progress bar, which was driven by
            a flag nothing ever set and so always rendered empty. */}
        <ProductivityDashboard />
      </ScrollView>

      {/* Fixed footer: always anchored to the bottom of the screen, outside the
          scrollable content so it stays put no matter how long the page is.
          Padded by the bottom safe-area inset so the home indicator never clips
          the button. */}
      <View
        style={[
          styles.exportFooter,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            marginBottom: insets.bottom > 0 ? 0 : 4,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.exportButton,
            todos.length === 0 && styles.exportButtonDisabled,
          ]}
          onPress={exportTodos}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="download"
            size={18}
            color={todos.length === 0 ? t.colors.textDisabled : t.colors.primaryText}
          />
          <Text
            style={[
              styles.exportButtonText,
              todos.length === 0 && styles.exportButtonTextDisabled,
            ]}
          >
            Download / Export{'\n'}({todos.length}{' '}
            {todos.length === 1 ? 'task' : 'tasks'})
          </Text>
        </TouchableOpacity>
      </View>

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
     */
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    /**
     * The scrolling home page.
     *
     * A `ScrollView` rather than the `FlatList` this replaced. The list moved to
     * its own screen, so what is left here is a fixed, short column of cards —
     * nothing on it is data-driven or unbounded, so a virtualised list would be
     * machinery with nothing to virtualise. The bottom padding is what keeps the
     * export footer from overlapping the last card when the page does scroll.
     */
    homeContent: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 0,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.text,
    },
    permissionBanner: {
      backgroundColor: c.warningSurface,
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.warningBorder,
    },
    permissionText: {
      fontSize: 13,
      color: c.warningText,
    },
    /**
     * Round. It opens the task sheet, so it is a navigation control rather than
     * the submit half of a form.
     */
    addButton: {
      backgroundColor: c.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    /**
     * The tile and its `+`, as one row.
     *
     * The tile flexes so the count inside it can wrap to a second line while the
     * button stays 44px and square — giving it a percentage width instead would
     * have made the `+` grow and shrink with the text next to it.
     */
    tileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    /**
     * The way into the task list.
     *
     * Styled as a row rather than a button so it reads as a panel rather than an
     * action competing with the `+` beside it.
     */
    allTasksTile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    allTasksTextGroup: {
      flex: 1,
      gap: 2,
    },
    allTasksTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    allTasksBody: {
      fontSize: 13,
      color: c.textMuted,
    },
    /**
     * The tag index, between the two cards.
     *
     * A heading plus a right-aligned hint rather than a heading alone: chips in a
     * row are exactly what the old, non-working filter looked like, and "Open one
     * to see its tasks" is the one line that tells this apart from it.
     */
    tagsSection: {
      marginBottom: 16,
      marginTop: 4,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    tagsHeadingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 10,
    },
    tagsHeader: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    tagsHint: {
      fontSize: 12,
      color: c.textMuted,
    },
    tagsChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagChip: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    tagChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    exportFooter: {
      borderTopWidth: 1,
      borderTopColor: c.divider,
      paddingTop: 12,
      marginTop: 12,
      backgroundColor: c.background,
    },
    exportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    /**
     * Disabled state for the export bar.
     *
     * Was a hardcoded pair, `'#1C3A5E'` and `'#A5C9F5'`, neither of which existed
     * anywhere else in the app. It is now `surfaceMuted`, which is what every other
     * disabled surface in the design already uses, and the label moves to
     * `textDisabled` to go with it — white on `surfaceMuted` is unreadable in light
     * mode, so dimming the fill alone would have fixed the theming and left the
     * contrast broken.
     */
    exportButtonDisabled: {
      backgroundColor: c.surfaceMuted,
    },
    exportButtonText: {
      color: c.primaryText,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    exportButtonTextDisabled: {
      color: c.textDisabled,
    },
  });
};