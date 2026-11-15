/**
 * The next-task card: the answer to "what should I do next?".
 *
 * It leads the home screen on purpose. Before this, the first thing the screen
 * said was a progress summary and a row of destinations, which told the user how
 * the day was going and where they *could* go — not what to actually do. This
 * card names one task and offers one action, so the path from opening the app to
 * being in a focus session is a single tap.
 *
 * A dumb view: the choice of task and the reason for it are decided by
 * `selectNextTask` and `buildNextTaskViewModel`, and arrive as a `model`. The
 * card only renders it and reports the tap.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import type { NextTaskViewModel } from '../hooks/useProductivityView';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type NextTaskCardProps = {
  model: NextTaskViewModel;
  /** Opens the duration picker for a task — the existing Start Focus flow. */
  onStartFocus: (id: string) => void;
  /** Opens the full task list. */
  onOpenTasks: () => void;
  /** Opens the create sheet, for the empty-list state. */
  onAddTask: () => void;
};

export function NextTaskCard({
  model,
  onStartFocus,
  onOpenTasks,
  onAddTask,
}: NextTaskCardProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  if (model.state === 'empty') {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Up next</Text>
        <Text style={styles.title}>Add your first task</Text>
        <Text style={styles.body}>
          Write down one thing you want to get done. Then start a focus timer on it.
        </Text>
        <TouchableOpacity
          accessibilityLabel="Add your first task"
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={onAddTask}
          style={styles.primaryButton}
        >
          <MaterialCommunityIcons color={t.colors.primaryText} name="plus" size={18} />
          <Text style={styles.primaryButtonText}>Add a task</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (model.state === 'allComplete') {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Up next</Text>
        <Text style={styles.title}>You are all caught up</Text>
        <Text style={styles.body}>
          {model.total === 1
            ? 'Your one task is done. Add another whenever you are ready.'
            : `All ${model.total} tasks are done. Add another whenever you are ready.`}
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            accessibilityLabel="Add another task"
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={onAddTask}
            style={[styles.primaryButton, styles.buttonInRow]}
          >
            <MaterialCommunityIcons color={t.colors.primaryText} name="plus" size={18} />
            <Text style={styles.primaryButtonText}>Add a task</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="See all tasks"
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={onOpenTasks}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>See all tasks</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Up next</Text>
        <View style={[styles.reasonChip, model.isNow && styles.reasonChipNow]}>
          <Text style={[styles.reasonText, model.isNow && styles.reasonTextNow]}>
            {model.isNow ? 'Happening now' : model.reason}
          </Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={3}>
        {model.title}
      </Text>

      {model.plannedLabel && (
        <View style={styles.plannedRow}>
          <MaterialCommunityIcons
            color={t.colors.textMuted}
            name="calendar-clock"
            size={16}
          />
          <Text style={styles.plannedText}>Planned {model.plannedLabel}</Text>
        </View>
      )}

      {model.isRunning ? (
        <View
          accessibilityLabel="Focus timer running"
          accessibilityRole="timer"
          style={styles.runningRow}
        >
          <MaterialCommunityIcons color={t.colors.primary} name="timer-outline" size={20} />
          <Text style={styles.runningLabel}>Focusing</Text>
          <Text style={styles.runningTime}>{model.timerLabel}</Text>
        </View>
      ) : (
        <TouchableOpacity
          accessibilityLabel="Start focus"
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => onStartFocus(model.id)}
          style={styles.primaryButton}
        >
          <MaterialCommunityIcons color={t.colors.primaryText} name="play" size={18} />
          <Text style={styles.primaryButtonText}>Start focus</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: 16,
      padding: 16,
      gap: 10,
      marginBottom: 12,
      borderWidth: t.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: t.colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    /** The quiet label that names what the card is, above the task itself. */
    eyebrow: {
      color: t.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    /** The reason the task was chosen — overdue, due today, or simply next. */
    reasonChip: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: t.colors.surfaceMuted,
    },
    reasonChipNow: {
      backgroundColor: t.colors.primary,
    },
    reasonText: {
      color: t.colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    reasonTextNow: {
      color: t.colors.primaryText,
    },
    title: {
      color: t.colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    body: {
      color: t.colors.textMuted,
      fontSize: 13,
    },
    plannedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    plannedText: {
      color: t.colors.textMuted,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    runningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    runningLabel: {
      color: t.colors.text,
      fontSize: 15,
      fontWeight: '600',
      flex: 1,
    },
    runningTime: {
      color: t.colors.primary,
      fontSize: 18,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
    },
    /** Inside a row the two buttons split the width rather than size to text. */
    buttonInRow: {
      flex: 1,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: t.colors.primary,
    },
    primaryButtonText: {
      color: t.colors.primaryText,
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    secondaryButtonText: {
      color: t.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
  });
