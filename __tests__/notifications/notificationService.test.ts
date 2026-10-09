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

import { getPendingTimers } from '../../notifications/notificationService';

const getTriggerNotifications = notifee.getTriggerNotifications as unknown as jest.Mock;

beforeEach(() => {
  getTriggerNotifications.mockReset();
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
