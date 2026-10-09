/**
 * The task screen controller: the rules that need both a task and its timer.
 *
 * The integration suite walks the app through storage, editing and tags, but it
 * never starts a focus timer — so the guards at this seam are pinned here. They
 * are the ones whose failure is silent: a checkbox that completes a task
 * mid-focus would count the day's work twice, and a deletion that forgot its
 * timer would leave a countdown running against a task that no longer exists.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Alert, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTaskScreen } from '../../hooks/useTaskScreen';
import { NotificationProvider } from '../../notifications';
import { ProductivityProvider } from '../../productivity';
import { addDays, todayKey } from '../../productivity/domain';
import type { Todo } from '../../todos/model';
import { render } from '../support/render';

type Controller = ReturnType<typeof useTaskScreen>;

let api: Controller | undefined;

/** Reads the controller on every render, so tests act on the live value. */
function Probe() {
  api = useTaskScreen();
  return null;
}

function controllerTree() {
  return (
    <NotificationProvider>
      <ProductivityProvider>
        <Probe />
      </ProductivityProvider>
    </NotificationProvider>
  );
}

const act = (body: () => void) => ReactTestRenderer.act(body);
/** Lets the todos and productivity hydration settle. */
const settle = () => ReactTestRenderer.act(async () => undefined);

/** Adds one task and starts a 25-minute focus timer on it, as a tap-through would. */
async function focusedTask(): Promise<Todo> {
  // Creation goes through the sheet's own open/submit pair, which is the only
  // creation path the controller exposes.
  await act(() => api!.openCreate());
  await act(() => api!.submitTask({ text: 'Write the report' }));
  const todo = api!.todos[0];
  // The row's focus button opens the picker; confirming it starts the timer.
  await act(() => api!.rowPropsFor(todo).onStartFocus());
  await act(() => api!.handleTimerConfirm({ minutes: 25 }));
  return todo;
}

beforeEach(async () => {
  jest.useFakeTimers();
  api = undefined;
  // The AsyncStorage mock's store is module-level, so each test must start from
  // an empty one rather than inheriting the previous test's list.
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useTaskScreen — completion guards', () => {
  beforeEach(async () => {
    await render(controllerTree());
    await settle();
  });

  it('refuses to complete a task while a focus timer holds it', async () => {
    const todo = await focusedTask();

    // The row reports the same reason the tap has to obey.
    expect(api!.rowPropsFor(todo).hasTimer).toBe(true);
    expect(api!.rowPropsFor(todo).completionDisabled).toBe(true);

    await act(() => api!.rowPropsFor(todo).onToggleComplete());

    // Unchanged: the timer owns this completion, not the tap.
    expect(api!.todos[0].completed).toBe(false);
  });

  it('completes the task once its timer has been stopped', async () => {
    const todo = await focusedTask();
    await act(() => api!.rowPropsFor(todo).onStopTimer());

    expect(api!.rowPropsFor(todo).hasTimer).toBe(false);
    expect(api!.rowPropsFor(todo).completionDisabled).toBe(false);

    await act(() => api!.rowPropsFor(todo).onToggleComplete());
    expect(api!.todos[0].completed).toBe(true);
  });
});

describe('useTaskScreen — deletion', () => {
  beforeEach(async () => {
    await render(controllerTree());
    await settle();
  });

  it('removes the task and forgets its timer', async () => {
    const todo = await focusedTask();

    await act(() => api!.rowPropsFor(todo).onDelete());

    expect(api!.todos).toHaveLength(0);
    // The deleted task's row no longer believes a timer is attached.
    expect(api!.rowPropsFor(todo).hasTimer).toBe(false);
  });
});

describe('useTaskScreen — export', () => {
  beforeEach(async () => {
    await render(controllerTree());
    await settle();
  });

  it('alerts instead of opening the share sheet when there is nothing to export', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const share = jest.spyOn(Share, 'share');

    await act(async () => {
      await api!.exportTodos();
    });

    expect(alert).toHaveBeenCalledWith(
      'Nothing to export',
      'Add a task before exporting your list.',
    );
    expect(share).not.toHaveBeenCalled();
  });

  it('hands the list to the share sheet as a named JSON file', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as const);
    await act(() => api!.openCreate());
    await act(() => api!.submitTask({ text: 'Ship the release' }));

    await act(async () => {
      await api!.exportTodos();
    });

    expect(share).toHaveBeenCalledTimes(1);
    const [content] = share.mock.calls[0];
    expect(content.title).toBe('Export tasks');
    expect(content.message).toContain('todos-');
    expect(content.message).toContain('Ship the release');
  });
});

describe('useTaskScreen — clearing everything', () => {
  beforeEach(async () => {
    await render(controllerTree());
    await settle();
  });

  it('empties the list and forgets every task’s timer', async () => {
    const todo = await focusedTask();
    await act(() => api!.openCreate());
    await act(() => api!.submitTask({ text: 'Second' }));
    expect(api!.todos).toHaveLength(2);

    await act(() => api!.clearAllTasks());

    expect(api!.todos).toHaveLength(0);
    // The per-task cleanup ran before the list emptied: the focused task's row no
    // longer believes a timer is attached.
    expect(api!.rowPropsFor(todo).hasTimer).toBe(false);
  });
});

describe('useTaskScreen — due-date status', () => {
  beforeEach(async () => {
    await render(controllerTree());
    await settle();
  });

  it('flags an overdue task on its row, and stops once it is done', async () => {
    const yesterday = addDays(todayKey(), -1);
    await act(() => api!.openCreate());
    await act(() => api!.submitTask({ text: 'Pay the bill', dueDate: yesterday }));
    const todo = api!.todos[0];

    expect(api!.rowPropsFor(todo).overdue).toBe(true);
    expect(api!.rowPropsFor(todo).dueLabel).toBe('Yesterday');

    await act(() => api!.rowPropsFor(todo).onToggleComplete());
    expect(api!.todos[0].completed).toBe(true);
    // A done task is never nagged about, so the row drops the flag.
    expect(api!.rowPropsFor(api!.todos[0]).overdue).toBe(false);
  });
});
