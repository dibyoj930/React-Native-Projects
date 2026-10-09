export {
  cancelTimerNotification,
  ensurePermission,
  getPendingTimers,
  onForegroundEvent,
  registerBackgroundHandler,
  scheduleTimerNotification,
  syncTimerNotification,
  type PendingTimer,
  type PermissionState,
  type TimerNotificationInput,
} from './notificationService';

export {
  NotificationProvider,
  useNotifications,
  type BannerNotification,
} from './NotificationProvider';