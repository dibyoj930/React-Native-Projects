/**
 * The settings screen's controller: the cross-domain intent behind the controls.
 *
 * Settings reaches into four domains — the theme's override, the notification
 * permission, the task list and the productivity log — so the confirmations and
 * the actions they gate live here rather than in the view. `SettingsScreen` stays
 * presentational: it prints the state it is given and reports what was tapped.
 *
 * Task clearing is *passed in* rather than reached for here. Emptying the list
 * also owes every task's timer and session a cleanup, and that cross-domain rule
 * belongs to `useTaskScreen`, which holds the list and the timers together. A
 * second `useTasks()` here would be a second source of truth for the same list.
 *
 * Pattern note: same shape as the other controllers — plain callbacks, no
 * context. One screen consumes it.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useNotifications, type PermissionState } from '../notifications';
import { useProductivity } from '../productivity';
import { useThemeControls, type ThemePreference } from '../theme/useTheme';

export type Settings = {
  /** The persisted appearance choice, `system` included. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** The OS notification permission, as last observed. */
  notificationPermission: PermissionState;
  /** Re-asks the OS for notification permission. */
  requestNotifications: () => void;
  /** How many tasks a full delete would remove, for the confirm copy. */
  taskCount: number;
  /** Confirms, then empties the list. */
  confirmClearTasks: () => void;
  /** Confirms, then wipes the focus history. */
  confirmClearProductivity: () => void;
};

export type SettingsDeps = {
  taskCount: number;
  /** The task controller's full-cleanup delete; see the note above. */
  onClearTasks: () => void;
};

export function useSettings({ taskCount, onClearTasks }: SettingsDeps): Settings {
  const { preference, setPreference } = useThemeControls();
  const { permission, requestPermission } = useNotifications();
  const { resetProductivity } = useProductivity();

  // The provider normalises the promise and stores the answer; the view only
  // needs to fire the request, so nothing here waits on the result.
  const requestNotifications = useCallback(() => {
    requestPermission();
  }, [requestPermission]);

  const confirmClearTasks = useCallback(() => {
    Alert.alert(
      'Delete all tasks?',
      `This removes all ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} for good. It cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete all', style: 'destructive', onPress: onClearTasks },
      ],
    );
  }, [onClearTasks, taskCount]);

  const confirmClearProductivity = useCallback(() => {
    Alert.alert(
      'Clear focus history?',
      'This removes your focus sessions, streak and momentum. Your tasks are kept. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: resetProductivity },
      ],
    );
  }, [resetProductivity]);

  return {
    preference,
    setPreference,
    notificationPermission: permission,
    requestNotifications,
    taskCount,
    confirmClearTasks,
    confirmClearProductivity,
  };
}
