import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventType, type Event } from '@notifee/react-native';
import {
  ensurePermission,
  onForegroundEvent,
  type PermissionState,
} from './notificationService';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export interface BannerNotification {
  id: string;
  title: string;
  body: string;
}

interface NotificationContextValue {
  permission: PermissionState;
  /** Re-asks the OS for notification permission. */
  requestPermission: () => Promise<PermissionState>;
  banner: BannerNotification | null;
  dismissBanner: () => void;
}

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

/**
 * Shown when a notification is delivered while the app is already open, so the
 * user gets feedback without leaving the screen they are on.
 */
function NotificationBanner({
  banner,
  onDismiss,
}: {
  banner: BannerNotification;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const bannerStyles = useMemo(() => createStyles(t), [t]);
  const slide = useRef(new Animated.Value(-160)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();

    const timeout = setTimeout(() => {
      Animated.timing(slide, {
        toValue: -160,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => finished && onDismiss());
    }, 4000);

    return () => clearTimeout(timeout);
  }, [banner.id, onDismiss, slide]);

  return (
    <Animated.View
      style={[
        bannerStyles.banner,
        { top: insets.top + 8, transform: [{ translateY: slide }] },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onDismiss}
        style={bannerStyles.bannerInner}
      >
        <Text style={bannerStyles.bannerTitle} numberOfLines={1}>
          {banner.title}
        </Text>
        {!!banner.body && (
          <Text style={bannerStyles.bannerBody} numberOfLines={2}>
            {banner.body}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/**
 * Owns the app-wide notification lifecycle: runtime permission and foreground
 * delivery events. Mount once, as high in the tree as possible (see `App.tsx`).
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  useEffect(() => {
    let active = true;
    ensurePermission().then((result) => {
      if (active) setPermission(result);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onForegroundEvent((event: Event) => {
      if (event.type !== EventType.DELIVERED) return;
      const { notification } = event.detail;
      if (!notification?.title) return;

      setBanner({
        id: notification.id ?? String(Date.now()),
        title: notification.title,
        body: notification.body ?? '',
      });
    });
    return unsubscribe;
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await ensurePermission();
    setPermission(result);
    return result;
  }, []);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const value = useMemo(
    () => ({ permission, requestPermission, banner, dismissBanner }),
    [permission, requestPermission, banner, dismissBanner],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {banner && <NotificationBanner banner={banner} onDismiss={dismissBanner} />}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside a <NotificationProvider>');
  }
  return context;
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  // The banner reads as a raised toast in light mode and as a lifted surface in
  // dark mode, rather than a near-black slab on a black screen.
  const background = t.mode === 'dark' ? c.surfaceMuted : '#1C1C1E';
  const title = t.mode === 'dark' ? c.text : '#FFFFFF';
  const body = t.mode === 'dark' ? c.textMuted : '#D1D1D6';

  return StyleSheet.create({
    banner: {
      position: 'absolute',
      left: 12,
      right: 12,
      borderRadius: 12,
      backgroundColor: background,
      borderWidth: t.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: t.mode === 'dark' ? 0.5 : 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      zIndex: 100,
    },
    bannerInner: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    bannerTitle: {
      color: title,
      fontSize: 15,
      fontWeight: '600',
    },
    bannerBody: {
      color: body,
      fontSize: 13,
      marginTop: 2,
    },
  });
};