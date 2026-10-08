/**
 * The timer, its picker and the row controls around them.
 *
 * `useFocusTimer` is the engine underneath and stays untouched: it owns the
 * countdown, the expiry tick and the "running" definition. This hook owns the
 * wiring around it — which task the picker is open for, which notification is
 * armed for which end time, the format a row prints — and takes the five things
 * it cannot know as callbacks: what a start, a pause, a resume, a stop and an
 * expiry each mean for the task and the session log. Those belong to whoever
 * holds both the timer and the productivity layer, which is the container.
 */
import { useCallback, useState } from 'react';

import { useFocusTimer, type TimerState } from './useFocusTimer';
import type { FocusSessionStatus } from '../productivity';
import { syncTimerNotification, cancelTimerNotification } from '../notifications';

export type TimerOrchestrationDeps = {
  onTimerExpired: (ids: string[]) => void;
  onStartFocus: (taskId: string) => void;
  onPauseFocus: (taskId: string) => void;
  onResumeFocus: (taskId: string) => void;
  onStopFocus: (taskId: string, status: FocusSessionStatus) => void;
};

export function useTimerOrchestration(deps: TimerOrchestrationDeps) {
  // Read out once so the callbacks below depend on the five functions rather
  // than on the wrapper object. The caller is free to rebuild that object every
  // render; as long as the functions themselves are stable (useCallback on the
  // caller's side), these callbacks stay stable too.
  const { onTimerExpired, onStartFocus, onPauseFocus, onResumeFocus, onStopFocus } = deps;

  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const {
    hasTimer,
    isRunning,
    start: startTimer,
    pause: pauseTimer,
    resume: resumeTimer,
    clearTimer,
    remainingSecondsFor,
  } = useFocusTimer({ onExpire: onTimerExpired });

  const openTimerPicker = useCallback((id: string) => {
    setPickerTargetId(id);
    setPickerVisible(true);
  }, []);

  const handleTimerConfirm = useCallback(
    (picked: TimerState) => {
      if (pickerTargetId) {
        const endPicker = startTimer(pickerTargetId, picked);
        if (endPicker !== null) {
          onStartFocus(pickerTargetId);
          syncTimerNotification({
            timerId: pickerTargetId,
            title: 'Timer done',
            body: 'Time is up',
            fireAt: endPicker,
          });
        }
      }
      setPickerVisible(false);
      setPickerTargetId(null);
    },
    [onStartFocus, pickerTargetId, startTimer],
  );

  const handleTimerCancel = useCallback(() => {
    setPickerVisible(false);
    setPickerTargetId(null);
  }, []);

  /**
   * Ends a task's timer early and closes the session.
   *
   * The caller decides the status it passes: a deliberate stop is `'stopped'` —
   * the focus was real, the completion was not.
   */
  const stopTimer = useCallback(
    (id: string) => {
      cancelTimerNotification(id);
      clearTimer(id);
      onStopFocus(id, 'stopped');
    },
    [clearTimer, onStopFocus],
  );

  /**
   * Pause/resume a running timer.
   *
   * The pause callback is not decoration: it banks the elapsed segment with the
   * productivity layer. Without it the time focused before a pause would be
   * unrecoverable, which was an original data-loss bug. Resume re-arms the
   * "timer done" notification for the new end time.
   */
  const toggleTimerRunning = useCallback(
    (id: string) => {
      if (isRunning(id)) {
        pauseTimer(id);
        onPauseFocus(id);
        cancelTimerNotification(id);
        return;
      }
      const end = resumeTimer(id);
      if (end !== null) {
        onResumeFocus(id);
        syncTimerNotification({
          timerId: id,
          title: 'Timer done',
          body: 'Time is up',
          fireAt: end,
        });
      }
    },
    [onPauseFocus, onResumeFocus, isRunning, pauseTimer, resumeTimer],
  );

  const formatTimeForTodo = useCallback(
    (id: string): string => {
      const total = remainingSecondsFor(id);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    },
    [remainingSecondsFor],
  );

  return {
    pickerVisible,
    setPickerVisible,
    handleTimerConfirm,
    handleTimerCancel,
    openTimerPicker,
    stopTimer,
    toggleTimerRunning,
    hasTimer,
    isRunning,
    remainingSecondsFor,
    formatTimeForTodo,
    clearTimer,
  };
}
