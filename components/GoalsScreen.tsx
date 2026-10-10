import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FOCUS_GOAL_PRESETS,
  goalsProgress,
  MAX_FOCUS_GOAL_MINUTES,
  MAX_TASKS_GOAL,
  motivationFor,
  parseFocusGoal,
  parseTaskGoal,
  type DailyGoals,
} from '../daily-goals';
import { formatDuration } from '../productivity';
import type { DayRollup } from '../productivity';
import { GoalMeter } from './GoalMeter';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type GoalsScreenProps = {
  /** The goals currently saved; the fields open prefilled from these. */
  goals: DailyGoals;
  /** Today's activity, for the progress preview. Absent means a quiet day. */
  todayRollup: DayRollup | undefined;
  /** Discard the edits and return. Also what the header back does. */
  onBack: () => void;
  /** Commit validated goals (the caller persists and navigates home). */
  onSave: (goals: DailyGoals) => void;
};

/**
 * The dedicated Goals & Preferences screen.
 *
 * A full destination rather than the centred dialog this replaced: the tile that
 * opens it is a way in, and a screen has room for a preview and, later, further
 * preference rows without the scrim squeezing them into a card. It follows the
 * Settings screen's shape — a back-chevron header and sections in surface cards —
 * so the two settings surfaces read as one family.
 *
 * The screen is presentational: it holds only the draft text, reports the
 * validated result through `onSave`, and reports "leave" through `onBack`. The
 * goals themselves live once, above it, in `useDailyGoals`.
 *
 * Validation is the pure `parse*` functions, and Save is disabled until both
 * pass — an invalid value cannot be committed because the only path out with a
 * value is a valid one (or Save is not available at all).
 */
export function GoalsScreen({ goals, todayRollup, onBack, onSave }: GoalsScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  const [taskText, setTaskText] = useState(String(goals.tasksCompleted));
  const [focusText, setFocusText] = useState(String(goals.focusMinutes));

  // Re-seed whenever the saved goals change. On mount this is a no-op; it earns
  // its keep when hydration lands after the screen has already painted, so the
  // fields catch up rather than showing the shipped defaults.
  useEffect(() => {
    setTaskText(String(goals.tasksCompleted));
    setFocusText(String(goals.focusMinutes));
  }, [goals]);

  const parsedTasks = parseTaskGoal(taskText);
  const parsedFocus = parseFocusGoal(focusText);
  const valid = parsedTasks !== null && parsedFocus !== null;

  // The preview follows the draft while it is valid, so a person can see the
  // effect of a change before committing it; while a field is mid-edit and
  // invalid it falls back to what is actually saved.
  const previewGoals: DailyGoals =
    parsedTasks !== null && parsedFocus !== null
      ? { tasksCompleted: parsedTasks, focusMinutes: parsedFocus }
      : goals;

  const progress = goalsProgress(todayRollup, previewGoals);
  const focusedSeconds = todayRollup?.focusedSeconds ?? 0;

  const commit = () => {
    if (parsedTasks === null || parsedFocus === null) return;
    onSave({ tasksCompleted: parsedTasks, focusMinutes: parsedFocus });
  };

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
          <MaterialCommunityIcons color={t.colors.text} name="chevron-left" size={26} />
        </TouchableOpacity>
        <Text style={styles.title}>Goals &amp; Preferences</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <Text style={styles.sectionLabel}>Today</Text>
        <View style={styles.card}>
          <Text style={styles.cardBody}>
            How today is going against the goals below.
          </Text>
          <GoalMeter
            label="Focus time"
            value={`${formatDuration(focusedSeconds)} / ${formatDuration(
              previewGoals.focusMinutes * 60,
            )}`}
            ratio={progress.focusRatio}
            tint={t.colors.primary}
          />
          <GoalMeter
            label="Tasks"
            value={`${progress.tasksCompleted} / ${previewGoals.tasksCompleted}`}
            ratio={progress.tasksRatio}
            tint={progress.tasksRatio >= 1 ? t.colors.primary : t.colors.textMuted}
          />
          <Text style={styles.motivation}>{motivationFor(progress)}</Text>
        </View>

        <Text style={styles.sectionLabel}>Daily goals</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Tasks per day</Text>
          <TextInput
            accessibilityLabel="Daily task goal"
            keyboardType="number-pad"
            onChangeText={setTaskText}
            placeholder={String(goals.tasksCompleted)}
            placeholderTextColor={t.colors.textDisabled}
            style={styles.input}
            value={taskText}
          />
          {taskText.trim().length > 0 && parsedTasks === null && (
            <Text style={styles.error}>
              {`Enter a whole number from 1 to ${MAX_TASKS_GOAL}.`}
            </Text>
          )}

          <Text style={[styles.label, styles.labelSpaced]}>Focus per day</Text>
          <View style={styles.chipRow}>
            {FOCUS_GOAL_PRESETS.map((preset) => {
              const selected = parsedFocus === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  accessibilityLabel={`${formatDuration(preset * 60)} focus goal`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  activeOpacity={0.7}
                  onPress={() => setFocusText(String(preset))}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {formatDuration(preset * 60)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="Daily focus goal in minutes"
            keyboardType="number-pad"
            onChangeText={setFocusText}
            placeholder={String(goals.focusMinutes)}
            placeholderTextColor={t.colors.textDisabled}
            style={styles.input}
            value={focusText}
          />
          {focusText.trim().length > 0 && parsedFocus === null && (
            <Text style={styles.error}>
              {`Enter whole minutes from 1 to ${MAX_FOCUS_GOAL_MINUTES}.`}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityLabel="Cancel daily goals"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={onBack}
            style={[styles.button, styles.cancelButton]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Save daily goals"
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid }}
            activeOpacity={0.8}
            disabled={!valid}
            onPress={commit}
            style={[styles.button, styles.saveButton, !valid && styles.saveButtonDisabled]}
          >
            <Text style={[styles.saveText, !valid && styles.saveTextDisabled]}>Save</Text>
          </TouchableOpacity>
        </View>
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
      paddingVertical: 14,
      paddingHorizontal: 14,
      gap: 12,
    },
    cardBody: {
      fontSize: 14,
      lineHeight: 19,
      color: c.textMuted,
    },
    motivation: {
      color: c.textMuted,
      fontSize: 12,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
    },
    /** Extra air above the second field so the two goals read as separate blocks. */
    labelSpaced: {
      marginTop: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.background,
    },
    error: {
      marginTop: -4,
      fontSize: 12,
      color: c.danger,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.surfaceMuted,
    },
    chipSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    chipTextSelected: {
      color: c.primaryText,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 24,
    },
    button: {
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: c.surfaceMuted,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    saveButton: {
      backgroundColor: c.primary,
    },
    saveButtonDisabled: {
      backgroundColor: c.surfaceMuted,
    },
    saveText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.primaryText,
    },
    saveTextDisabled: {
      color: c.textDisabled,
    },
  });
};
