import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDayRange, useProductivity } from '../productivity';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

/**
 * History: the streak and the day-wise focus chart.
 *
 * This used to be the whole productivity readout — a 0–100 momentum score with a
 * breakdown of its five weighted components, a mission ladder with two progress
 * bars, the streak, and the chart. Momentum and progress now live in
 * `TodayCard`, above the task list, because they answer "how am I doing today?"
 * and that question should not require scrolling past every task to reach.
 *
 * What remains here answers a different question — "have I been consistent?" —
 * and is the kind of thing worth keeping but not worth foregrounding.
 *
 * Every figure is derived on read, never a stored counter, so this cannot drift
 * out of sync with the logs behind it.
 */
export function ProductivityDashboard() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { snapshot } = useProductivity();
  const { streak, recentDays } = snapshot;

  // Names the span the bars cover. The bars themselves are labelled with bare
  // day numbers — 14 columns are too narrow for `Mar 6` and anything wider
  // would truncate — so without this a window straddling a month reads
  // `28 1 2` with no way to tell which month the `1` belongs to.
  const rangeLabel =
    recentDays.length > 1
      ? formatDayRange(recentDays[0].day, recentDays[recentDays.length - 1].day)
      : '';

  return (
    <View style={styles.panel}>
      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Streak</Text>
        <View style={styles.streakRow}>
          <Stat
            value={String(streak.current)}
            caption={streak.current === 1 ? 'day' : 'days'}
            styles={styles}
          />
          <Stat value={String(streak.longest)} caption="best" styles={styles} />
          <Stat
            value={String(streak.freezesRemaining)}
            caption={streak.freezesRemaining === 1 ? 'freeze' : 'freezes'}
            styles={styles}
            accent={streak.freezesRemaining > 0}
          />
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Recent focus</Text>
        {recentDays.length === 0 ? (
          <Text style={styles.hint}>
            No focus logged yet. Start a timer to begin building history.
          </Text>
        ) : (
          <>
            <View style={styles.journeyBars}>
              {/*
                Reversed for render. `recentDays` is newest-first, which is the
                right contract for a "recent" list but the wrong one for a time
                axis: mapped in array order the bars ran today → 13 days ago, so
                the dates read 06 05 04 03 02 01 28 and time appeared to travel
                backwards. A chart's x-axis runs oldest → newest like every
                calendar, so the direction is fixed here rather than by changing
                the selector and its tests.
              */}
              {[...recentDays].reverse().map((rollup) => (
                <View key={rollup.day} style={styles.journeyColumn}>
                  <View style={styles.journeyBarTrack}>
                    <View
                      style={[
                        styles.journeyBarFill,
                        {
                          height: `${barHeightPercent(rollup.focusedSeconds)}%`,
                          backgroundColor: rollup.isFocusCompleted
                            ? t.colors.primary
                            : t.colors.textMuted,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.journeyLabel}>{dayLabel(rollup.day)}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.hint}>
              {rangeLabel} · taller bars are more focus, filled bars closed a
              task
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function Stat({
  value,
  caption,
  styles,
  accent = false,
}: {
  value: string;
  caption: string;
  styles: ReturnType<typeof createStyles>;
  accent?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

/**
 * Bar height as a percentage, scaled against a 90-minute day.
 *
 * Capped so one very long day cannot flatten every other bar to nothing — the
 * point of the chart is comparison between days, and a single 6-hour outlier
 * would destroy that.
 */
function barHeightPercent(focusedSeconds: number): number {
  const minutes = focusedSeconds / 60;
  if (minutes <= 0) return 2;
  return Math.min(100, Math.max(6, (minutes / 90) * 100));
}

/**
 * `2026-05-04` -> `4`. The day of the month.
 *
 * This was a month *letter*, which collided: a two-week window routinely spans
 * two months, so the strip could render `A A` and give the user no way to tell
 * which day either bar was. Day numbers are unique across any window shorter than
 * four weeks, and they actually say when the focus happened.
 */
function dayLabel(day: string): string {
  const [, , dayOfMonth] = day.split('-');
  return dayOfMonth ?? '';
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    panel: {
      borderRadius: 16,
      padding: 16,
      // Breathing room between the last task row and the panel above it.
      marginTop: 20,
      // Section gap to the Tags block, which follows in the list footer. Larger
      // than the internal divider spacing on purpose: this separates two
      // unrelated features, where a hairline only separates two parts of one.
      marginBottom: 32,
      backgroundColor: t.colors.surface,
      borderWidth: t.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: t.colors.border,
    },
    sectionLabel: {
      color: t.colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.divider,
      marginVertical: 20,
    },
    block: {
      gap: 10,
    },

    streakRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    stat: {
      alignItems: 'center',
      flex: 1,
    },
    statValue: {
      color: t.colors.text,
      fontSize: 22,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    statValueAccent: {
      color: t.colors.primary,
    },
    statCaption: {
      color: t.colors.textMuted,
      fontSize: 11,
    },

    journeyBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 76,
      gap: 3,
    },
    journeyColumn: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    journeyBarTrack: {
      width: '100%',
      flex: 1,
      justifyContent: 'flex-end',
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: t.colors.progressTrack,
    },
    journeyBarFill: {
      width: '100%',
      borderRadius: 3,
    },
    journeyLabel: {
      color: t.colors.textMuted,
      fontSize: 9,
    },

    hint: {
      color: t.colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
  });
