/**
 * Planned-start reminder reconciliation: the plan against what the OS holds.
 *
 * The planner is pure and tested beside this; what these tests pin is the
 * *reconcile* step under the `plan-` namespace, and — just as important — that it
 * never touches a timer, daily or streak notification it does not own.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import notifee from '@notifee/react-native';

import { usePlanReminders } from '../../hooks/usePlanReminders';
import { NotificationProvider } from '../../notifications';
import type { DayPlan, ReplanTask } from '../../replan';
import { render } from '../support/render';

const createTriggerNotification = notifee.createTriggerNotification as unknown as jest.Mock;
const cancelTriggerNotification = notifee.cancelTriggerNotification as unknown as jest.Mock;
const getTriggerNotifications = notifee.getTriggerNotifications as unknown as jest.Mock;
const requestPermission = notifee.requestPermission as unknown as jest.Mock;

/** 4 May 2026 at `hours:minutes` local. */
function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

const TASK: ReplanTask = {
  id: 't1',
  text: 'Write the report',
  completed: false,
  hasActiveTimer: false,
};

const PLAN: DayPlan = {
  dayKey: '2026-05-04',
  approvedAt: at(13, 0),
  signature: 'sig',
  placements: [{ taskId: 't1', start: at(14, 0), end: at(14, 45) }],
};

type ProbeProps = {
  plan?: DayPlan | null;
  tasks?: readonly ReplanTask[];
  hydrated?: boolean;
  enabled?: boolean;
};

function Probe({ plan = PLAN, tasks = [TASK], hydrated = true, enabled = true }: ProbeProps) {
  usePlanReminders({ plan, tasks, hydrated, enabled });
  return null;
}

function tree(props: ProbeProps) {
  return (
    <NotificationProvider>
      <Probe {...props} />
    </NotificationProvider>
  );
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

/** A pending reminder as `getPendingReminders` reads it back. */
function heldReminder(id: string, fireAt: number) {
  return { notification: { data: { reminder: id } }, trigger: { timestamp: fireAt } };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 4, 13, 0, 0));
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

describe('usePlanReminders', () => {
  it('schedules a planned-start reminder when the OS holds nothing', async () => {
    await render(tree({}));
    await settle();

    expect(createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notification, trigger] = createTriggerNotification.mock.calls[0];
    expect(notification).toMatchObject({
      id: 'reminder-plan-t1',
      title: 'Write the report',
      body: 'Planned: 2:00 PM',
      data: { reminder: 'plan-t1' },
    });
    expect(trigger).toMatchObject({ timestamp: at(14, 0) });
  });

  it('leaves a matching held reminder alone', async () => {
    getTriggerNotifications.mockResolvedValue([heldReminder('plan-t1', at(14, 0))]);

    await render(tree({}));
    await settle();

    expect(createTriggerNotification).not.toHaveBeenCalled();
    expect(cancelTriggerNotification).not.toHaveBeenCalled();
  });

  it('cancels a held planned reminder that is no longer wanted', async () => {
    getTriggerNotifications.mockResolvedValue([heldReminder('plan-t1', at(14, 0))]);

    await render(tree({ plan: null }));
    await settle();

    expect(cancelTriggerNotification).toHaveBeenCalledWith('reminder-plan-t1');
  });

  it('cancels and reschedules when a start moves', async () => {
    getTriggerNotifications.mockResolvedValue([heldReminder('plan-t1', at(15, 0))]);

    await render(tree({}));
    await settle();

    expect(cancelTriggerNotification).toHaveBeenCalledWith('reminder-plan-t1');
    expect(createTriggerNotification).toHaveBeenCalledTimes(1);
  });

  it('never touches a timer, daily or streak notification', async () => {
    getTriggerNotifications.mockResolvedValue([
      heldReminder('timer-t1', at(15, 0)),
      heldReminder('daily-2026-05-04', at(9, 0)),
      heldReminder('streak-2026-05-04', at(20, 0)),
    ]);

    await render(tree({ plan: null }));
    await settle();

    expect(cancelTriggerNotification).not.toHaveBeenCalled();
  });

  it('does nothing while the planned-start preference is off', async () => {
    await render(tree({ enabled: false }));
    await settle();

    expect(getTriggerNotifications).not.toHaveBeenCalled();
    expect(createTriggerNotification).not.toHaveBeenCalled();
  });

  it('does nothing before the plan has hydrated', async () => {
    getTriggerNotifications.mockResolvedValue([heldReminder('plan-t1', at(14, 0))]);

    await render(tree({ hydrated: false }));
    await settle();

    expect(getTriggerNotifications).not.toHaveBeenCalled();
    expect(cancelTriggerNotification).not.toHaveBeenCalled();
  });

  it('does nothing while permission is not granted', async () => {
    requestPermission.mockResolvedValue({ authorizationStatus: 0 });

    await render(tree({}));
    await settle();

    expect(createTriggerNotification).not.toHaveBeenCalled();
  });
});
