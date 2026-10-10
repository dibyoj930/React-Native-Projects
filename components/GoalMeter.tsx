import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type GoalMeterProps = {
  /** What is being measured — "Focus time", "Tasks". */
  label: string;
  /** The actual-versus-target readout, already formatted by the caller. */
  value: string;
  /** Progress toward the goal as a 0..1 ratio; clamped by the caller's selector. */
  ratio: number;
  /** The fill colour, which differs per meter (focus vs tasks). */
  tint: string;
};

/**
 * One goal: a name, a bar, and the actual-versus-target numbers.
 *
 * Both the home tile and the goals screen measure the same thing — progress
 * toward a target — so they share this component rather than each carrying their
 * own bar markup. A tiny minimum fill keeps a just-started meter visible, and the
 * bar stays visible past 100% of the target instead of clipping, so overshooting
 * reads as beating the goal rather than as a full bar that stopped moving.
 */
export function GoalMeter({ label, value, ratio, tint }: GoalMeterProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

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
