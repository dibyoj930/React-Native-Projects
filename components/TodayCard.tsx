import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  MOMENTUM_BAND_LABELS,
  formatDuration,
  progressRatio,
  useProductivity,
} from '../productivity';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

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
 * The score is still computed, with the same weights and decay. It is simply not
 * something the user has to study.
 *
 * Mounted *outside* the task list, where the old "N of M tasks done" row lived,
 * so it stays put rather than scrolling away.
 */
export function TodayCard() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { snapshot } = useProductivity();
  const { todayRollup, missionToday, momentum } = snapshot;

  const focusedSeconds = todayRollup?.focusedSeconds ?? 0;

  // Both targets come from the mission ladder, which escalates with the streak
  // (25–60 min, 1–4 tasks). That ladder is a streak *difficulty* knob rather than
  // a statement about how much work a day holds, so the focus target is low for
  // anyone actually working: 90 minutes reads as a permanently full bar. Both
  // numbers are read from `missionToday` in one place, so replacing the focus
  // target with a user-set daily goal is a change to this block only.
  const focusGoalSeconds = missionToday.focusTarget * 60;
  const focusDone = formatDuration(focusedSeconds);
  const focusGoal = formatDuration(focusGoalSeconds);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Today</Text>

      <Meter
        label="Focus time"
        value={`${focusDone} / ${focusGoal}`}
        ratio={progressRatio(focusedSeconds, focusGoalSeconds)}
        styles={styles}
        tint={t.colors.primary}
      />

      <Meter
        label="Tasks"
        value={`${missionToday.tasksCompleted} / ${missionToday.tasksTarget}`}
        ratio={missionToday.tasksRatio}
        styles={styles}
        tint={missionToday.tasksRatio >= 1 ? t.colors.primary : t.colors.textMuted}
      />

      <Text style={styles.momentum}>{MOMENTUM_BAND_LABELS[momentum.band]}</Text>
    </View>
  );
}

/**
 * One goal: a name, a bar, and the actual-versus-target numbers.
 *
 * Both meters measure the same thing — progress toward a goal — so they share a
 * component rather than each carrying their own bar markup. The bar stays visible
 * past 100% of the target instead of clipping, so overshooting reads as beating
 * the goal rather than as a full bar that stopped moving.
 */
function Meter({
  label,
  value,
  ratio,
  tint,
  styles,
}: {
  label: string;
  value: string;
  ratio: number;
  tint: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.meter}>
      <Text style={styles.meterLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: Math.max(ratio, 0.02), backgroundColor: tint }]} />
        <View style={[styles.rest, { flex: Math.max(1 - ratio, 0) }]} />
      </View>
      <Text style={styles.meterValue}>{value}</Text>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: 16,
      padding: 16,
      gap: 8,
      borderWidth: t.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: t.colors.border,
    },
    label: {
      color: t.colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    meter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    meterLabel: {
      color: t.colors.text,
      fontSize: 13,
      fontWeight: '600',
      width: 74,
    },
    track: {
      flex: 1,
      flexDirection: 'row',
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
    },
    rest: {
      height: '100%',
      backgroundColor: t.colors.progressTrack,
    },
    meterValue: {
      color: t.colors.textMuted,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      minWidth: 86,
      textAlign: 'right',
    },
    momentum: {
      color: t.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
  });
