/**
 * Timer orchestration hook: wires useFocusTimer + productivity + notifications + todos updates.
 * Extracts orchestration logic out of WelcomeComponent while keeping useFocusTimer as engine.
 */
import { useCallback, useState } from 'react';

import { useFocusTimer, type TimerState } from '../../hooks/useFocusTimer';
import type { FocusSessionStatus } from '../../productivity';
import { syncTimerNotification, cancelTimerNotification } from '../../notifications';

export type TimerOrchestrationDeps = {
  onTimerExpired: (ids: string[]) => void;
  onStartFocus: (taskId: string) => void;
  onPauseFocus: (taskId: string) => void;
  onResumeFocus: (taskId: string) => void;
  onStopFocus: (taskId: string, status: FocusSessionStatus) => void;
};

export function useTimerOrchestration(deps: TimerOrchestrationDeps) {
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
  } = useFocusTimer({ onExpire: deps.onTimerExpired });

  const openTimerPicker = useCallback((id: string) => {
    setPickerTargetId(id);
    setPickerVisible(true);
  }, []);

  const handleTimerConfirm = useCallback(
    (picked: TimerState) => {
      if (pickerTargetId) {
        const endPicker = startTimer(pickerTargetId, picked);
        if (endPicker !== null) {
          deps.onStartFocus(pickerTargetId);
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
    [deps, pickerTargetId, startTimer],
  );

  const handleTimerCancel = useCallback(() => {
    setPickerVisible(false);
    setPickerTargetId(null);
  }, []);

  const stopTimer = useCallback(
    (id: string) => {
      cancelTimerNotification(id);
      clearTimer(id);
      deps.onStopFocus(id, 'stopped');
    },
    [clearTimer, deps],
  );

  const toggleTimerRunning = useCallback(
    (id: string) => {
      if (isRunning(id)) {
        pauseTimer(id);
        deps.onPauseFocus(id);
        cancelTimerNotification(id);
        return;
      }
      const end = resumeTimer(id);
      if (end !== null) {
        deps.onResumeFocus(id);
        syncTimerNotification({
          timerId: id,
          title: 'Timer done',
          body: 'Time is up',
          fireAt: end,
        });
      }
    },
    [deps, isRunning, pauseTimer, resumeTimer],
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
    clearTimerForId: clearTimer,
  };
}
