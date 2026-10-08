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

import {
  useTimerOrchestration,
  type TimerOrchestrationDeps,
} from '../../hooks/useTimerOrchestration';
import type { TimerState } from '../../hooks/useFocusTimer';

type Orchestration = ReturnType<typeof useTimerOrchestration>;

let api: Orchestration | undefined;
let deps: jest.Mocked<TimerOrchestrationDeps>;

/** Reads the hook's return value on every render, so tests act on the live one. */
function Probe() {
  api = useTimerOrchestration(deps);
  return null;
}

const act = (body: () => void) => ReactTestRenderer.act(body);

beforeEach(() => {
  jest.useFakeTimers();
  api = undefined;
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
