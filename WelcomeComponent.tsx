import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TimerPickerModal } from 'react-native-timer-picker';

import { AddTodoModal } from './components/AddTodoModal';
import { AllTasksScreen } from './components/AllTasksScreen';
import { HomeScreen } from './components/HomeScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { TodoRow } from './components/TodoRow';
import type { TimerState } from './hooks/useFocusTimer';
import { useSettings } from './hooks/useSettings';
import { useTaskScreen } from './hooks/useTaskScreen';
import type { Todo } from './todos/model';
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
  | { name: 'tag'; tag: string }
  | { name: 'settings' };

export type WelcomeComponentProps = {
  /** Which screen to show. The union is on the `Screen` type above. */
  screen: Screen;
  onNavigate: (screen: Screen) => void;
};

/**
 * The composition point: which screen is showing, the two sheets, and the rows.
 *
 * The task logic — the list and its CRUD, the countdown and its picker, the
 * session log, and the rules that cross them — has a single home in
 * `hooks/useTaskScreen`, which this reads once. What is left here is only
 * composition: the screen switch, the two modals both screens share, and the
 * one-line `renderRow` that binds a task to the controller's row props. Keeping
 * the JSX in the view is why the controller returns `rowPropsFor` rather than a
 * renderer.
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
  const {
    todos,
    today,
    notificationsBlocked,
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
    clearAllTasks,
    tags,
    addTag,
  } = useTaskScreen();

  // Settings reaches across four domains; its controller owns the confirmations
  // and the actions they gate. The task-list cleanup is passed in from the
  // controller above, so both read the one list rather than each keeping a copy.
  const settings = useSettings({
    taskCount: todos.length,
    onClearTasks: clearAllTasks,
  });

  // The one renderer both lists share. It is a one-liner here rather than in the
  // controller because it is JSX: the controller answers "what are this row's
  // props", and the view is what turns that into an element.
  const renderRow = (todo: Todo) => <TodoRow {...rowPropsFor(todo)} />;

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
        tags={tags}
        task={editingTodo}
        visible={showTaskSheet}
      />
    </>
  );

  // Settings is its own destination, back to home, and shares none of the task
  // list. It is a full screen for the same reason the list is: it has somewhere
  // to return to and its own header.
  if (screen.name === 'settings') {
    return (
      <View style={styles.screen}>
        <SettingsScreen
          notificationPermission={settings.notificationPermission}
          onBack={() => onNavigate({ name: 'home' })}
          onClearProductivity={settings.confirmClearProductivity}
          onClearTasks={settings.confirmClearTasks}
          onRequestNotifications={settings.requestNotifications}
          onSetPreference={settings.setPreference}
          preference={settings.preference}
          taskCount={settings.taskCount}
        />
      </View>
    );
  }

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
          today={today}
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
        notificationsBlocked={notificationsBlocked}
        onAddTag={addTag}
        onAddTask={openCreate}
        onExport={exportTodos}
        onOpenSettings={() => onNavigate({ name: 'settings' })}
        onOpenTag={(tag) => onNavigate({ name: 'tag', tag })}
        onOpenTasks={() => onNavigate({ name: 'tasks' })}
        tags={tags}
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
