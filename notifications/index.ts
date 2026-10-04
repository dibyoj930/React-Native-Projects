export {
  cancelTimerNotification,
  ensurePermission,
  onForegroundEvent,
  registerBackgroundHandler,
  scheduleTimerNotification,
  syncTimerNotification,
  type PermissionState,
  type TimerNotificationInput,
} from './notificationService';

export {
  NotificationProvider,
  useNotifications,
  type BannerNotification,
} from './NotificationProvider';