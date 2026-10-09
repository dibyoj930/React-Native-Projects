import notifee, {
  AuthorizationStatus,
  EventType,
  TriggerType,
  type Event,
  type Notification,
} from '@notifee/react-native';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface TimerNotificationInput {
  timerId: string;
  title: string;
  body: string;
  /** Date.now() based epoch ms for when it should fire. */
  fireAt: number;
}

export async function ensurePermission(): Promise<PermissionState> {
  try {
    const { authorizationStatus } = await notifee.requestPermission();

    if (
      authorizationStatus === AuthorizationStatus.AUTHORIZED ||
      authorizationStatus === AuthorizationStatus.PROVISIONAL
    ) {
      return 'granted';
    }
    if (authorizationStatus === AuthorizationStatus.DENIED) return 'denied';
    return 'undetermined';
  } catch (error) {
    console.warn('[notifications] requestPermission failed:', error);
    return 'undetermined';
  }
}

function buildNotification(input: TimerNotificationInput): Notification {
  return {
    // Notifee keys notifications by id, so reusing the todo id replaces the
    // pending notification instead of stacking copies.
    id: `timer-${input.timerId}`,
    title: input.title,
    body: input.body,
    data: { todoId: input.timerId },
    ios: {
      foregroundPresentationOptions: {
        banner: true,
        sound: true,
        list: true,
      },
    },
  };
}

/**
 * Schedules the OS-level notification for a timer.
 *
 * The trigger lives in the native layer, so it still fires when the JS countdown
 * interval is suspended (app backgrounded or killed).
 */
export async function scheduleTimerNotification(
  input: TimerNotificationInput,
): Promise<void> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return;

  try {
    await notifee.createTriggerNotification(buildNotification(input), {
      type: TriggerType.TIMESTAMP,
      // Notifee throws on a timestamp in the past.
      timestamp: Math.max(input.fireAt, Date.now() + 1000),
    });
  } catch (error) {
    console.warn('[notifications] scheduleTimerNotification failed:', error);
  }
}

/** Removes a pending timer notification (pause, stop, delete, or early finish). */
export async function cancelTimerNotification(timerId: string): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(`timer-${timerId}`);
  } catch (error) {
    console.warn('[notifications] cancelTimerNotification failed:', error);
  }
}

/** Replaces the pending notification for a timer with a fresh one. */
export async function syncTimerNotification(input: TimerNotificationInput): Promise<void> {
  await cancelTimerNotification(input.timerId);
  await scheduleTimerNotification(input);
}

/** A timer the OS is still counting down, and when it will fire. */
export type PendingTimer = {
  /** The task the timer belongs to; timers are keyed by task id. */
  taskId: string;
  /** Epoch ms the OS will deliver the notification. */
  fireAt: number;
};

/**
 * The timer notifications the OS still holds.
 *
 * The native trigger is the only part of a timer that outlives the JS context,
 * so it — not a second store — is what a relaunch restores from. Notifee drops
 * one-shot timestamp triggers as they fire, so an entry here is a timer that has
 * not run out yet; an end time already in the past is handled defensively by the
 * caller rather than living here.
 */
export async function getPendingTimers(): Promise<PendingTimer[]> {
  try {
    const triggers = await notifee.getTriggerNotifications();
    return triggers.flatMap((entry) => {
      const { notification, trigger } = entry;
      const taskId = notification.data?.todoId;
      const fireAt = (trigger as { timestamp?: number }).timestamp;
      if (typeof taskId !== 'string' || typeof fireAt !== 'number') return [];
      return [{ taskId, fireAt }];
    });
  } catch (error) {
    console.warn('[notifications] getPendingTimers failed:', error);
    return [];
  }
}

/** Fires while the app is in the foreground. Returns an unsubscribe function. */
export function onForegroundEvent(handler: (event: Event) => void): () => void {
  return notifee.onForegroundEvent(handler);
}

/**
 * The task id from the notification that launched the app, if it was a tap.
 *
 * A press that starts the app from cold is not a foreground event — there is no
 * JS running to receive one — so Notifee surfaces it on its own. Returns null
 * for a normal launch, or a notification that carries no task.
 */
export async function getInitialPressedTodoId(): Promise<string | null> {
  try {
    const initial = await notifee.getInitialNotification();
    const todoId = initial?.notification?.data?.todoId;
    return typeof todoId === 'string' ? todoId : null;
  } catch (error) {
    console.warn('[notifications] getInitialNotification failed:', error);
    return null;
  }
}

/**
 * Must be registered from the app entry file so the headless JS task exists.
 * See `index.js`.
 */
export function registerBackgroundHandler(): void {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (
      type === EventType.DELIVERED ||
      type === EventType.PRESS ||
      type === EventType.ACTION_PRESS
    ) {
      console.log('[notifications] background event', type, detail.notification?.data);
    }
  });
}