/**
 * Task-reminder reconciliation: the plan against what the OS already holds.
 *
 * The planner is pure and tested beside this; what these tests pin is the
 * *reconcile* step — schedule what is missing, leave what matches alone, cancel
 * what is no longer wanted or has moved — because that is where duplicate or
 * orphaned notifications would come from. The hydration guard is here too: an
 * empty list must not be allowed to cancel reminders before storage has loaded.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import notifee from '@notifee/react-native';

import { useTaskReminders } from '../../hooks/useTaskReminders';
import { NotificationProvider } from '../../notifications';
import type { Todo } from '../../todos/model';
import { render } from '../support/render';

function Probe({ todos, hydrated = true }: { todos: Todo[]; hydrated?: boolean }) {
  useTaskReminders(todos, hydrated);
  return null;
}

const createTriggerNotification = notifee.createTriggerNotification as unknown as jest.Mock;
const cancelTriggerNotification = notifee.cancelTriggerNotification as unknown as jest.Mock;
const getTriggerNotifications = notifee.getTriggerNotifications as unknown as jest.Mock;
const requestPermission = notifee.requestPermission as unknown as jest.Mock;

function tree(todos: Todo[], hydrated = true) {
  return (
    <NotificationProvider>
      <Probe todos={todos} hydrated={hydrated} />
    </NotificationProvider>
  );
}

/** Lets the permission request and the reconcile promise chain settle. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

/** A pending task reminder trigger, as `getPendingTaskReminders` reads it back. */
function heldTaskReminder(taskId: string, fireAt: number) {
  return { notification: { data: { taskReminder: taskId } }, trigger: { timestamp: fireAt } };
}

/** The open task the tests mostly plan around: due today at 09:00. */
const TASK: Todo = {
  id: 't1',
  text: 'Write the report',
  completed: false,
  tags: [],
  createdAt: 1,
  dueDate: '2026-05-04',
  dueTime: '09:00',
};

const FIRE_AT = new Date(2026, 4, 4, 9, 0, 0).getTime();

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 4, 8, 0, 0));
  createTriggerNotification.mockReset();
  createTriggerNotification.mockResolvedValue('trigger');
  cancelTriggerNotification.mockReset();
  cancelTriggerNotification.mockResolvedValue(undefined);
  getTriggerNotifications.mockReset();
  getTriggerNotifications.mockResolvedValue([]);
  requestPermission.mockReset();
  requestPermission.mockResolvedValue({ authorizationStatus: 1 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTaskReminders', () => {
  it('schedules a reminder for an open task when the OS holds nothing', async () => {
    await render(tree([TASK]));
    await settle();

    expect(createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notification, trigger] = createTriggerNotification.mock.calls[0];
    expect(notification).toMatchObject({
      id: 'task-reminder-t1',
      title: 'Write the report',
      body: 'Task reminder',
      data: { taskReminder: 't1' },
    });
    expect(trigger).toMatchObject({ type: 0, timestamp: FIRE_AT });
  });

  it('leaves a reminder the OS already holds for the right time', async () => {
    getTriggerNotifications.mockResolvedValue([heldTaskReminder('t1', FIRE_AT)]);

    await render(tree([TASK]));
    await settle();

    expect(createTriggerNotification).not.toHaveBeenCalled();
    expect(cancelTriggerNotification).not.toHaveBeenCalled();
  });

  it('cancels a pending reminder for a task that is no longer in the list', async () => {
    getTriggerNotifications.mockResolvedValue([heldTaskReminder('t1', FIRE_AT)]);

    await render(tree([]));
    await settle();

    expect(cancelTriggerNotification).toHaveBeenCalledWith('task-reminder-t1');
  });

  it('cancels and reschedules when a task’s moment moves', async () => {
    // The OS holds a stale 09:30 trigger; the task now wants 09:00.
    getTriggerNotifications.mockResolvedValue([
      heldTaskReminder('t1', new Date(2026, 4, 4, 9, 30, 0).getTime()),
    ]);

    await render(tree([TASK]));
    await settle();

    expect(cancelTriggerNotification).toHaveBeenCalledWith('task-reminder-t1');
    expect(createTriggerNotification).toHaveBeenCalledTimes(1);
    expect(createTriggerNotification.mock.calls[0][1]).toMatchObject({ timestamp: FIRE_AT });
  });

  it('does not schedule a completed task', async () => {
    await render(tree([{ ...TASK, completed: true }]));
    await settle();

    expect(createTriggerNotification).not.toHaveBeenCalled();
  });

  it('schedules nothing while permission is not granted', async () => {
    requestPermission.mockResolvedValue({ authorizationStatus: 0 });

    await render(tree([TASK]));
    await settle();

    expect(createTriggerNotification).not.toHaveBeenCalled();
  });

  it('does not cancel stored reminders before the list has hydrated', async () => {
    // The first render has an empty list by definition; reconciling then would
    // wipe a reminder the OS is holding for a task that has not loaded yet.
    getTriggerNotifications.mockResolvedValue([heldTaskReminder('t1', FIRE_AT)]);

    await render(tree([], false));
    await settle();

    expect(getTriggerNotifications).not.toHaveBeenCalled();
    expect(cancelTriggerNotification).not.toHaveBeenCalled();
    expect(createTriggerNotification).not.toHaveBeenCalled();
  });
});
