/**
 * Reminder reconciliation: the plan against what the OS already holds.
 *
 * The planner is pure and tested beside this; what these tests pin is the
 * *reconcile* step — schedule what is missing, leave what matches alone, and
 * cancel what is no longer wanted — because that is where duplicate or orphaned
 * notifications would come from. Time is pinned so the plan is deterministic.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useReminders } from '../../hooks/useReminders';
import { NotificationProvider } from '../../notifications';
import { ProductivityProvider } from '../../productivity';
import { render } from '../support/render';

function Probe() {
  useReminders();
  return null;
}

const createTriggerNotification = notifee.createTriggerNotification as unknown as jest.Mock;
const cancelTriggerNotification = notifee.cancelTriggerNotification as unknown as jest.Mock;
const getTriggerNotifications = notifee.getTriggerNotifications as unknown as jest.Mock;
const requestPermission = notifee.requestPermission as unknown as jest.Mock;

function tree() {
  return (
    <NotificationProvider>
      <ProductivityProvider>
        <Probe />
      </ProductivityProvider>
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

/** A pending reminder trigger, as `getPendingReminders` reads it back. */
function heldReminder(id: string, fireAt: number) {
  return { notification: { data: { reminder: id } }, trigger: { timestamp: fireAt } };
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 4, 8, 0, 0));
  await AsyncStorage.clear();
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

describe('useReminders', () => {
  it('schedules the daily window when the OS holds nothing', async () => {
    await render(tree());
    await settle();

    const ids = createTriggerNotification.mock.calls.map(([notification]) => notification.id);
    expect(ids).toContain('reminder-daily-2026-05-04');
    expect(ids).toContain('reminder-daily-2026-05-10');
  });

  it('leaves a reminder the OS already holds for the right time', async () => {
    getTriggerNotifications.mockResolvedValue([
      heldReminder('daily-2026-05-04', new Date(2026, 4, 4, 9, 0, 0).getTime()),
    ]);

    await render(tree());
    await settle();

    const ids = createTriggerNotification.mock.calls.map(([notification]) => notification.id);
    expect(ids).not.toContain('reminder-daily-2026-05-04');
  });

  it('cancels a pending reminder that is no longer wanted', async () => {
    // A streak warning, when the current streak is zero: the plan wants none.
    getTriggerNotifications.mockResolvedValue([
      heldReminder('streak-2026-05-04', new Date(2026, 4, 4, 20, 0, 0).getTime()),
    ]);

    await render(tree());
    await settle();

    expect(cancelTriggerNotification).toHaveBeenCalledWith('reminder-streak-2026-05-04');
  });

  it('schedules nothing while permission is not granted', async () => {
    requestPermission.mockResolvedValue({ authorizationStatus: 0 });

    await render(tree());
    await settle();

    expect(createTriggerNotification).not.toHaveBeenCalled();
  });
});
