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
 * The card reads top-down as one sentence: how it feels (momentum), then the two
 * numbers behind that feeling. It deliberately no longer prints its own "Today"
 * heading — the screen is already titled "Today", and the repeat pushed the two
 * bars into a narrow strip that was harder to read at a glance than the numbers
 * it drew. Letting each meter own a full-width pair of lines — name and value
 * together, then a bar the width of the card — costs one extra line and buys a
 * track you can actually measure progress against.
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
      {/* The momentum line leads. It is the one sentence on this card a person
          actually reads, and it answers the same "how is today going?" question
          the page title already asks — so the card no longer repeats "Today"
          above its own numbers. */}
      <Text style={styles.momentum}>{MOMENTUM_BAND_LABELS[momentum.band]}</Text>

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
      <View style={styles.meterTop}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>{value}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: Math.max(ratio, 0.02), backgroundColor: tint }]} />
        <View style={[styles.rest, { flex: Math.max(1 - ratio, 0) }]} />
      </View>
    </View>
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
    /**
     * One goal: its name and numbers on one line, its bar full-width below.
     *
     * The value shares the name's line rather than trailing the bar, which is
     * what frees the track to span the whole card instead of the narrow strip
     * left between a fixed-width label and a fixed-width readout.
     */
    meter: {
      gap: 6,
    },
    meterTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    meterLabel: {
      color: t.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    track: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
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
      textAlign: 'right',
    },
  });
