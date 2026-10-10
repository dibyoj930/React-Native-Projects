import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { goalsProgress, motivationFor, type DailyGoals } from '../daily-goals';
import { MOMENTUM_BAND_LABELS, formatDuration, useProductivity } from '../productivity';
import { GoalMeter } from './GoalMeter';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type TodayCardProps = {
  /** The user's saved targets; the tile measures today against them. */
  goals: DailyGoals;
  /** Opens the Goals & Preferences screen. */
  onOpenGoals: () => void;
};

/**
 * Today, in one glance: how much focus and how many tasks, against the day's two
 * goals.
 *
 * Two meters, not a score. The old Productivity Board answered this question four
 * ways — a 0–100 momentum score, a breakdown of its five weighted components, a
 * mission ladder, and a component summary — which is a dashboard, and reading one
 * takes longer than the answer is worth. A score also had to be explained before
 * it could be acted on. Two goals you can see themselves approaching cannot.
 *
 * The card reads top-down as one sentence: how it feels (momentum), then the two
 * numbers behind that feeling. It deliberately no longer prints its own "Today"
 * heading — the screen is already titled "Today", and the repeat pushed the two
 * bars into a narrow strip that was harder to read at a glance than the numbers
 * it drew. Letting each meter own a full-width pair of lines — name and value
 * together, then a bar the width of the card — costs one extra line and buys a
 * track you can actually measure progress against.
 *
 * The whole tile is the way into the editor: tapping it opens the Goals &
 * Preferences screen rather than editing inline in a dialog. The goals arrive as
 * a prop, so the one source of truth lives above, where the screen that edits
 * them also reads it.
 */
export function TodayCard({ goals, onOpenGoals }: TodayCardProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { snapshot } = useProductivity();

  const { todayRollup, momentum } = snapshot;
  const focusedSeconds = todayRollup?.focusedSeconds ?? 0;

  // The targets are the user's saved goals, measured against today's rollup.
  // They are deliberately *not* the mission ladder's targets: that ladder is a
  // streak *difficulty* knob, not a statement about how much work a day holds,
  // so it stays out of the display. `goalsProgress` clamps each ratio, so a goal
  // passed by any margin fills its bar without overrunning the track.
  const progress = goalsProgress(todayRollup, goals);

  return (
    <TouchableOpacity
      accessibilityLabel="Open goals and preferences"
      accessibilityRole="button"
      activeOpacity={0.8}
      onPress={onOpenGoals}
      style={styles.card}
    >
      {/* The momentum line leads. It is the one sentence on this card a person
          actually reads, and it answers the same "how is today going?" question
          the page title already asks — so the card no longer repeats "Today"
          above its own numbers. The chevron is the affordance that says the card
          is a way in. */}
      <View style={styles.headerRow}>
        <Text style={styles.momentum}>{MOMENTUM_BAND_LABELS[momentum.band]}</Text>
        <MaterialCommunityIcons
          color={t.colors.textMuted}
          name="chevron-right"
          size={20}
        />
      </View>

      <GoalMeter
        label="Focus time"
        value={`${formatDuration(focusedSeconds)} / ${formatDuration(goals.focusMinutes * 60)}`}
        ratio={progress.focusRatio}
        tint={t.colors.primary}
      />

      <GoalMeter
        label="Tasks"
        value={`${progress.tasksCompleted} / ${goals.tasksCompleted}`}
        ratio={progress.tasksRatio}
        tint={progress.tasksRatio >= 1 ? t.colors.primary : t.colors.textMuted}
      />

      {/* The encouragement line, chosen from today's progress by a pure
          selector — deterministic, and never a scold for a quiet day. */}
      <Text style={styles.motivation}>{motivationFor(progress)}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: 16,
      padding: 16,
      gap: 12,
      borderWidth: t.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: t.colors.border,
    },
    /**
     * The card's top line: the momentum sentence and the way-in chevron.
     */
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    /**
     * The encouragement line, which is the first thing the card says.
     *
     * Sits on its own row rather than beside the meters so a full sentence has
     * room to say itself without truncating.
     */
    momentum: {
      color: t.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    /** The contextual encouragement line under the meters. */
    motivation: {
      color: t.colors.textMuted,
      fontSize: 12,
    },
  });
