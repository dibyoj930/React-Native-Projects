/**
 * Settings: appearance, notifications, and the two data resets.
 *
 * Presentational in the same sense as `HomeScreen` — it renders the state it is
 * handed and reports what was tapped. Every confirmation lives in
 * `hooks/useSettings`, because confirming a delete is a decision about whether
 * the action happens, not a way of drawing it.
 *
 * The appearance control is the first UI for the persisted theme override. The
 * override has existed in `ThemeProvider` (and survived a relaunch) all along;
 * until now no screen reached it, so the app was locked to the system scheme.
 */
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PermissionState } from '../notifications';
import { useTheme, type ThemePreference } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type SettingsScreenProps = {
  /** The persisted appearance choice. */
  preference: ThemePreference;
  onSetPreference: (next: ThemePreference) => void;
  /** The OS notification permission, as last observed. */
  notificationPermission: PermissionState;
  /** Asks the OS for notification permission. */
  onRequestNotifications: () => void;
  /** How many tasks a full delete would remove. */
  taskCount: number;
  /** Confirmed elsewhere; this just reports the tap. */
  onClearTasks: () => void;
  /** Confirmed elsewhere; this just reports the tap. */
  onClearProductivity: () => void;
  onBack: () => void;
};

const APPEARANCE: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** A settings row that performs a destructive action. */
function ActionButton({
  label,
  detail,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.actionDisabled]}
    >
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>
          {label}
        </Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <MaterialCommunityIcons
        color={disabled ? t.colors.textDisabled : t.colors.danger}
        name="chevron-right"
        size={20}
      />
    </TouchableOpacity>
  );
}

export function SettingsScreen({
  preference,
  onSetPreference,
  notificationPermission,
  onRequestNotifications,
  taskCount,
  onClearTasks,
  onClearProductivity,
  onBack,
}: SettingsScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  const notificationsOn = notificationPermission === 'granted';
  const notificationDetail = notificationsOn
    ? 'On. Timer alerts and reminders can reach you.'
    : notificationPermission === 'denied'
      ? 'Off. Timer alerts will not reach you until you turn them on.'
      : 'Not decided yet. Turn them on so timer alerts can reach you.';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          accessibilityLabel="Back to today"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onBack}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            color={t.colors.text}
            name="chevron-left"
            size={26}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <Text style={styles.cardBody}>
            Follow your phone, or pin the app to light or dark.
          </Text>
          <View style={styles.segmentRow}>
            {APPEARANCE.map((option) => {
              const selected = option.value === preference;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityLabel={`Use ${option.value} appearance`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  activeOpacity={0.7}
                  onPress={() => onSetPreference(option.value)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Text
                    style={[styles.segmentText, selected && styles.segmentTextSelected]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <Text style={styles.cardBody}>{notificationDetail}</Text>
          {!notificationsOn && (
            <TouchableOpacity
              accessibilityLabel="Turn on notifications"
              accessibilityRole="button"
              activeOpacity={0.8}
              onPress={onRequestNotifications}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Turn on notifications</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <ActionButton
            label="Delete all tasks"
            detail={
              taskCount === 0
                ? 'No tasks to delete.'
                : `Removes all ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} for good.`
            }
            disabled={taskCount === 0}
            onPress={onClearTasks}
          />
          <View style={styles.divider} />
          <ActionButton
            label="Clear focus history"
            detail="Removes focus sessions, streak and momentum. Keeps your tasks."
            onPress={onClearProductivity}
          />
        </View>

        <Text style={styles.about}>
          Local-first: your tasks and focus history stay on this device.
        </Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    backButton: {
      width: 40,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 32,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 20,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    cardBody: {
      fontSize: 14,
      lineHeight: 19,
      color: c.textMuted,
      marginBottom: 4,
    },
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      backgroundColor: c.surfaceMuted,
    },
    segmentSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    segmentTextSelected: {
      color: c.primaryText,
    },
    primaryButton: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: c.primary,
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.primaryText,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 10,
    },
    actionDisabled: {
      opacity: 0.6,
    },
    actionText: {
      flex: 1,
      gap: 2,
    },
    actionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.danger,
    },
    actionLabelDisabled: {
      color: c.textDisabled,
    },
    actionDetail: {
      fontSize: 13,
      color: c.textMuted,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.divider,
    },
    about: {
      marginTop: 24,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
      color: c.textDisabled,
    },
  });
};
