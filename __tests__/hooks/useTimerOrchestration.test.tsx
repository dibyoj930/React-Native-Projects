/**
 * Timer orchestration: the seam between the countdown engine and the session
 * log.
 *
 * The engine (`useFocusTimer`) is exercised through the hook rather than beside
 * it, because what these tests are really pinning is the *contract* the
 * container relies on: a start starts, a pause hands the elapsed segment to the
 * session log, a stop closes the session as stopped, and an expiry is reported
 * once. Those five callbacks are the only thing `WelcomeComponent` supplies, so
 * if they drift, the app's focus accounting drifts with them.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import notifee from '@notifee/react-native';

import {
  useTimerOrchestration,
  type TimerOrchestrationDeps,
} from '../../hooks/useTimerOrchestration';
import type { TimerState } from '../../hooks/useFocusTimer';

type Orchestration = ReturnType<typeof useTimerOrchestration>;

let api: Orchestration | undefined;
let deps: jest.Mocked<TimerOrchestrationDeps>;

const getTriggerNotifications = notifee.getTriggerNotifications as unknown as jest.Mock;

/** A pending timer trigger, as `getPendingTimers` reads it back from the OS. */
function pendingTimer(todoId: string, fireAt: number) {
  return { notification: { data: { todoId } }, trigger: { timestamp: fireAt } };
}

/** Mounts the probe, letting the mount-time restore read from the OS mock. */
async function mount() {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<Probe />);
  });
  await ReactTestRenderer.act(async () => undefined);
}

/** Reads the hook's return value on every render, so tests act on the live one. */
function Probe() {
  api = useTimerOrchestration(deps);
  return null;
}

const act = (body: () => void) => ReactTestRenderer.act(body);

beforeEach(() => {
  jest.useFakeTimers();
  api = undefined;
  // No timers pending unless a test says so.
  getTriggerNotifications.mockReset();
  getTriggerNotifications.mockResolvedValue([]);
  deps = {
    onTimerExpired: jest.fn(),
    onStartFocus: jest.fn(),
    onPauseFocus: jest.fn(),
    onResumeFocus: jest.fn(),
    onStopFocus: jest.fn(),
  };
});

afterEach(() => {
  jest.useRealTimers();
});

/** Opens the picker and picks a duration, as a tap-through would. */
async function pick(duration: TimerState) {
  await act(() => {
    api!.openTimerPicker('task-1');
  });
  await act(() => {
    api!.handleTimerConfirm(duration);
  });
}

describe('useTimerOrchestration — starting', () => {
  it('starts the countdown, tells the session log, and shows the time left', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Probe />);
    });

    await pick({ minutes: 25 });

    expect(api!.pickerVisible).toBe(false);
    expect(deps.onStartFocus).toHaveBeenCalledWith('task-1');
    expect(api!.hasTimer('task-1')).toBe(true);
    expect(api!.isRunning('task-1')).toBe(true);
    expect(api!.formatTimeForTodo('task-1')).toBe('00:25:00');
  });

  it('rejects a zero-length pick without starting anything', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Probe />);
    });

    await pick({ seconds: 0 });

    expect(api!.pickerVisible).toBe(false);
    expect(deps.onStartFocus).not.toHaveBeenCalled();
    expect(api!.hasTimer('task-1')).toBe(false);
  });

  it('cancelling the picker starts nothing', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Probe />);
    });

    await act(() => {
      api!.openTimerPicker('task-1');
    });
    await act(() => {
      api!.handleTimerCancel();
    });

    expect(api!.pickerVisible).toBe(false);
    expect(deps.onStartFocus).not.toHaveBeenCalled();
    expect(api!.hasTimer('task-1')).toBe(false);
  });
});

describe('useTimerOrchestration — pausing and resuming', () => {
  beforeEach(async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Probe />);
    });
    await pick({ minutes: 25 });
  });

  it('banks the elapsed segment with the session log and freezes the countdown', async () => {
    await act(() => {
      jest.advanceTimersByTime(2_000);
    });
    await act(() => {
      api!.toggleTimerRunning('task-1');
    });

    // The session log must hear about the pause, or the time focused before it
    // is unrecoverable — an original data-loss bug.
    expect(deps.onPauseFocus).toHaveBeenCalledWith('task-1');
    expect(api!.isRunning('task-1')).toBe(false);
    expect(api!.hasTimer('task-1')).toBe(true);
    expect(api!.formatTimeForTodo('task-1')).toBe('00:24:58');
  });

  it('resumes from the frozen remainder and tells the session log', async () => {
    await act(() => {
      api!.toggleTimerRunning('task-1');
    });
    await act(() => {
      api!.toggleTimerRunning('task-1');
    });

    expect(deps.onResumeFocus).toHaveBeenCalledWith('task-1');
    expect(api!.isRunning('task-1')).toBe(true);
    expect(api!.formatTimeForTodo('task-1')).toBe('00:25:00');
  });
});

describe('useTimerOrchestration — stopping and expiry', () => {
  it('closes the session as stopped and forgets the timer', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Probe />);
    });
    await pick({ minutes: 25 });

    await act(() => {
      api!.stopTimer('task-1');
    });

    expect(deps.onStopFocus).toHaveBeenCalledWith('task-1', 'stopped');
    expect(api!.hasTimer('task-1')).toBe(false);
  });

  it('reports a timer that runs out, exactly once, and clears it', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<Probe />);
    });
    await pick({ seconds: 5 });

    await act(() => {
      jest.advanceTimersByTime(5_000);
    });

    // Once, with this timer's id — the container completes the task from this
    // callback, so a duplicate or a miss would corrupt the day's statistics.
    expect(deps.onTimerExpired).toHaveBeenCalledTimes(1);
    expect(deps.onTimerExpired).toHaveBeenCalledWith(['task-1']);
    expect(api!.hasTimer('task-1')).toBe(false);
  });
});

describe('useTimerOrchestration — restoring from the OS', () => {
  it('re-adopts a timer whose notification is still pending', async () => {
    getTriggerNotifications.mockResolvedValueOnce([
      pendingTimer('task-1', Date.now() + 60_000),
    ]);

    await mount();

    expect(api!.hasTimer('task-1')).toBe(true);
    expect(api!.isRunning('task-1')).toBe(true);
    expect(api!.formatTimeForTodo('task-1')).toBe('00:01:00');
    // Re-adopting is not a fresh start: the session was opened before the restart
    // and re-opening it here would double-count the focus.
    expect(deps.onStartFocus).not.toHaveBeenCalled();
  });

  it('reports a pending timer whose end time has already passed as an expiry', async () => {
    getTriggerNotifications.mockResolvedValueOnce([
      pendingTimer('task-1', Date.now() - 1_000),
    ]);

    await mount();

    expect(deps.onTimerExpired).toHaveBeenCalledWith(['task-1']);
    expect(api!.hasTimer('task-1')).toBe(false);
  });

  it('restores only once, even if the hook re-renders', async () => {
    getTriggerNotifications.mockResolvedValue([
      pendingTimer('task-1', Date.now() + 60_000),
    ]);

    await mount();

    // The query is made once per mount; a re-render must not re-adopt the same
    // trigger and re-open a session (or re-fire an expiry) for it.
    expect(getTriggerNotifications).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when the OS holds no pending timer', async () => {
    await mount();

    expect(api!.hasTimer('task-1')).toBe(false);
    expect(deps.onTimerExpired).not.toHaveBeenCalled();
  });
});
