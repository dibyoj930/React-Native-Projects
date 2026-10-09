/**
 * The OS is the source of truth for a running timer.
 *
 * A timer's notification trigger lives in the native layer, so it is the only
 * timer state that survives a relaunch. `getPendingTimers` is the read side of
 * that contract: it must hand back exactly the timers the OS will still fire —
 * nothing dropped, nothing mislabelled — because everything the restore path
 * does is derived from this list.
 */

import notifee from '@notifee/react-native';

import {
  cancelReminder,
  getPendingReminders,
  getPendingTimers,
  scheduleReminder,
} from '../../notifications/notificationService';

const getTriggerNotifications = notifee.getTriggerNotifications as unknown as jest.Mock;
const createTriggerNotification = notifee.createTriggerNotification as unknown as jest.Mock;
const cancelTriggerNotification = notifee.cancelTriggerNotification as unknown as jest.Mock;
const requestPermission = notifee.requestPermission as unknown as jest.Mock;

beforeEach(() => {
  getTriggerNotifications.mockReset();
  createTriggerNotification.mockReset();
  createTriggerNotification.mockResolvedValue('trigger');
  cancelTriggerNotification.mockReset();
  cancelTriggerNotification.mockResolvedValue(undefined);
  requestPermission.mockReset();
  requestPermission.mockResolvedValue({ authorizationStatus: 1 });
});

/** A trigger-notification shaped like the one the timer path schedules. */
function timerNotification(todoId: string, timestamp: number) {
  return { notification: { data: { todoId } }, trigger: { timestamp } };
}

describe('getPendingTimers', () => {
  it('returns the task and fire time for every pending timer', async () => {
    getTriggerNotifications.mockResolvedValueOnce([
      timerNotification('task-1', 1_000),
      timerNotification('task-2', 2_000),
    ]);

    await expect(getPendingTimers()).resolves.toEqual([
      { taskId: 'task-1', fireAt: 1_000 },
      { taskId: 'task-2', fireAt: 2_000 },
    ]);
  });

  it('ignores notifications that are not timers', async () => {
    getTriggerNotifications.mockResolvedValueOnce([
      // A future reminder, with no task attached.
      { notification: { data: { reminder: 'daily' } }, trigger: { timestamp: 5_000 } },
      // A timer notification whose trigger carries no timestamp.
      { notification: { data: { todoId: 'task-3' } }, trigger: {} },
    ]);

    await expect(getPendingTimers()).resolves.toEqual([]);
  });

  it('returns nothing when the OS query fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    getTriggerNotifications.mockRejectedValueOnce(new Error('native gone'));

    await expect(getPendingTimers()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('getPendingReminders', () => {
  it('returns the id and fire time of every pending reminder', async () => {
    getTriggerNotifications.mockResolvedValueOnce([
      { notification: { data: { reminder: 'daily-2026-05-04' } }, trigger: { timestamp: 1_000 } },
      { notification: { data: { reminder: 'streak-2026-05-04' } }, trigger: { timestamp: 2_000 } },
      // A timer notification is not a reminder.
      { notification: { data: { todoId: 'task-1' } }, trigger: { timestamp: 3_000 } },
    ]);

    await expect(getPendingReminders()).resolves.toEqual([
      { id: 'daily-2026-05-04', fireAt: 1_000 },
      { id: 'streak-2026-05-04', fireAt: 2_000 },
    ]);
  });
});

describe('scheduleReminder', () => {
  it('schedules a one-shot trigger under a prefixed id', async () => {
    const fireAt = Date.now() + 60_000;

    await scheduleReminder({ id: 'daily-2026-05-04', title: 'Plan', body: 'Go', fireAt });

    expect(createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notification, trigger] = createTriggerNotification.mock.calls[0];
    expect(notification).toMatchObject({
      id: 'reminder-daily-2026-05-04',
      title: 'Plan',
      body: 'Go',
      data: { reminder: 'daily-2026-05-04' },
    });
    expect(trigger).toMatchObject({ type: 0, timestamp: fireAt });
  });

  it('schedules nothing without permission', async () => {
    requestPermission.mockResolvedValueOnce({ authorizationStatus: 0 });

    await scheduleReminder({ id: 'daily-2026-05-04', title: 'Plan', body: 'Go', fireAt: Date.now() + 1 });

    expect(createTriggerNotification).not.toHaveBeenCalled();
  });
});

describe('cancelReminder', () => {
  it('cancels the trigger by its prefixed id', async () => {
    await cancelReminder('daily-2026-05-04');

    expect(cancelTriggerNotification).toHaveBeenCalledWith('reminder-daily-2026-05-04');
  });
});
