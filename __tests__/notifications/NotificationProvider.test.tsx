/**
 * The notification provider turns OS events into two distinct intents.
 *
 * A *delivery* while the app is open is a heads-up — the banner. A *press* is a
 * request to open the task the notification is about, and it arrives either as
 * a foreground event or, when it cold-starts the app, as Notifee's initial
 * notification. Both must surface as a task id the owner of navigation can act
 * on, so the app can open the right place without the provider knowing where
 * that place is.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import notifee, { EventType } from '@notifee/react-native';

import { NotificationProvider, useNotifications } from '../../notifications';
import { withRendered } from '../support/render';

type Notifications = ReturnType<typeof useNotifications>;

let api: Notifications | undefined;

function Probe() {
  api = useNotifications();
  return null;
}

const onForegroundEvent = notifee.onForegroundEvent as unknown as jest.Mock;
const getInitialNotification = notifee.getInitialNotification as unknown as jest.Mock;

const act = (body: () => void) => ReactTestRenderer.act(body);
const settle = () => ReactTestRenderer.act(async () => undefined);

/** Fires the handler the provider registered with the OS, as the OS would. */
function deliver(event: unknown) {
  const handler = onForegroundEvent.mock.calls.at(-1)?.[0];
  if (!handler) throw new Error('no foreground handler was registered');
  return act(() => handler(event));
}

function tree() {
  return (
    <NotificationProvider>
      <Probe />
    </NotificationProvider>
  );
}

beforeEach(() => {
  api = undefined;
  onForegroundEvent.mockClear();
  getInitialNotification.mockReset();
  getInitialNotification.mockResolvedValue(null);
});

describe('NotificationProvider — presses', () => {
  it('surfaces the task id of a pressed notification, then clears it', async () => {
    await withRendered(tree(), async () => {
      await deliver({
        type: EventType.PRESS,
        detail: { notification: { data: { todoId: 'task-1' } } },
      });
      expect(api!.pressedTodoId).toBe('task-1');

      await act(() => api!.clearPressedTodo());
      expect(api!.pressedTodoId).toBeNull();
    });
  });

  it('ignores a press that carries no task id', async () => {
    await withRendered(tree(), async () => {
      await deliver({ type: EventType.PRESS, detail: { notification: { data: {} } } });

      expect(api!.pressedTodoId).toBeNull();
    });
  });

  it('picks up the notification that launched the app from cold', async () => {
    getInitialNotification.mockResolvedValueOnce({
      notification: { data: { todoId: 'task-9' } },
    });

    await withRendered(tree(), async () => {
      await settle();

      expect(api!.pressedTodoId).toBe('task-9');
    });
  });
});

describe('NotificationProvider — foreground delivery', () => {
  it('shows a banner for a delivered notification', async () => {
    await withRendered(tree(), async () => {
      await deliver({
        type: EventType.DELIVERED,
        detail: {
          notification: { id: 'timer-1', title: 'Timer done', body: 'Time is up' },
        },
      });

      expect(api!.banner).toEqual({ id: 'timer-1', title: 'Timer done', body: 'Time is up' });
    });
  });
});
