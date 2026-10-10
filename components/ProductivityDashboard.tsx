import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayRange, formatDuration, formatWeekday, useProductivity } from '../productivity';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

/**
 * Height of a bar track, in px.
 *
 * Shared between the style and the fill maths: the opened bar animates its
 * height in points, so both have to agree on how tall a full track is.
 */
const BAR_TRACK_HEIGHT = 64;

/**
 * Width of a bar, in px.
 *
 * Each bar sits in a `flex: 1` column, so a full-width track stretches to
 * whatever share of the panel that column gets — a slab per day, seven times
 * over. A fixed, centred width keeps the seven columns evenly spaced while the
 * sticks themselves stay thin.
 */
const BAR_WIDTH = 16;

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

  // The day bars are sized against the window's own biggest focus day rather than
  // an absolute "full bar" number. A twelve-hour anchor made every realistic week
  // hug the baseline — an hour of focus read as an eighth of a bar — so bars now
  // answer "how much of my best day is this?" and a consistent routine fills the
  // chart instead of petering out at the bottom of it.
  const maxFocusMinutes = useMemo(
    () =>
      recentDays.reduce(
        (max, rollup) => Math.max(max, rollup.focusedSeconds / 60),
        0,
      ),
    [recentDays],
  );

  // Which bar is open. Null is the resting state: every day shows a pale bar
  // with no tip, and nothing is highlighted.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Only one bar is open at a time, so a single value drives its grow-in. It is
  // reset and replayed on every selection change, which is what makes each tap
  // fill afresh instead of snapping to the new bar already full. Layout effect
  // so the reset lands before the frame paints, or the just-opened bar would
  // flash full for one frame.
  const grow = useRef(new Animated.Value(0)).current;
  useLayoutEffect(() => {
    grow.setValue(0);
    if (selectedDay === null) return;
    Animated.timing(grow, {
      toValue: 1,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [grow, selectedDay]);

  // Names the span the bars cover. The columns carry weekday names — `Mon`,
  // `Tue` — which read as *when* but not as which month, so a window straddling
  // a month boundary still needs this to anchor it.
  const rangeLabel =
    recentDays.length > 1
      ? formatDayRange(recentDays[0].day, recentDays[recentDays.length - 1].day)
      : '';

  return (
    <View style={styles.panel}>
      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Streak</Text>
        {/* A tile rather than a row of three equal numbers. The current streak is
            the number anyone opens this panel to check, so it is the only one
            given size and it leads; best and freezes are context, set beside it
            at a smaller weight. All three used to sit at 22px, which made a
            reader compare them to work out which one was "now". */}
        <View style={styles.streakTile}>
          <View style={styles.streakHero}>
            <Text style={styles.streakFlame}>{streak.current > 0 ? '🔥' : '🌱'}</Text>
            <View style={styles.streakHeroText}>
              <Text style={styles.streakHeroValue}>
                {streak.current} {streak.current === 1 ? 'day' : 'days'}
              </Text>
              <Text style={styles.streakHeroLabel}>current streak</Text>
            </View>
          </View>

          <View style={styles.streakFacts}>
            <Fact value={String(streak.longest)} label="best" styles={styles} />
            <View style={styles.factDivider} />
            <Fact
              value={String(streak.freezesRemaining)}
              label={streak.freezesRemaining === 1 ? 'freeze' : 'freezes'}
              styles={styles}
              accent={streak.freezesRemaining > 0}
            />
          </View>
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
                axis: mapped in array order the bars ran today → six days ago,
                so the dates read 06 05 04 03 02 01 28 and time appeared to
                travel backwards. A chart's x-axis runs oldest → newest like
                every calendar, so the direction is fixed here rather than by
                changing the selector and its tests.

                Each column is a tap target. At rest every day shows a pale bar;
                tapping one grows it back to solid green, wakes the orange task
                tip above the fill, and adds the task count beside the time.
              */}
              {[...recentDays].reverse().map((rollup) => {
                const isSelected = rollup.day === selectedDay;
                const tipHeight = taskTipHeight(rollup.tasksCompleted);
                const fillPercent = focusFillPercent(
                  rollup.focusedSeconds,
                  maxFocusMinutes,
                );
                const fillHeight = fillHeightPx(fillPercent, tipHeight);
                const tasks = `${rollup.tasksCompleted} ${
                  rollup.tasksCompleted === 1 ? 'task' : 'tasks'
                }`;

                return (
                  <Pressable
                    key={rollup.day}
                    style={styles.journeyColumn}
                    onPress={() => setSelectedDay(isSelected ? null : rollup.day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${formatWeekday(rollup.day)}, ${formatDuration(
                      rollup.focusedSeconds,
                    )}, ${tasks}`}
                  >
                    <View style={styles.journeyValueZone}>
                      <Text style={styles.journeyValue} numberOfLines={1}>
                        {formatDuration(rollup.focusedSeconds)}
                      </Text>
                      {isSelected && (
                        <Text style={styles.journeyTask} numberOfLines={1}>
                          {tasks}
                        </Text>
                      )}
                    </View>
                    <View style={styles.journeyBarTrack}>
                      {isSelected ? (
                        <>
                          {tipHeight > 0 && (
                            <View
                              style={[styles.journeyTip, { height: tipHeight }]}
                            />
                          )}
                          <Animated.View
                            style={[
                              styles.journeyBarFill,
                              {
                                height: grow.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, fillHeight],
                                }),
                                backgroundColor: grow.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [
                                    t.colors.focusBarIdle,
                                    t.colors.focusBar,
                                  ],
                                }),
                              },
                            ]}
                          />
                        </>
                      ) : (
                        <View
                          style={[
                            styles.journeyBarFill,
                            {
                              height: `${fillPercent}%`,
                              backgroundColor: t.colors.focusBarIdle,
                            },
                          ]}
                        />
                      )}
                    </View>
                    <Text style={styles.journeyLabel}>{formatWeekday(rollup.day)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {rangeLabel} · green fill is focus time, sized to your biggest focus day
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * One secondary streak figure: the number, then what it counts.
 *
 * `best` and `freezes` are labels rather than sentences, so they read as the
 * two footnotes to the hero streak beside them rather than as a second and
 * third thing to compare against it.
 */
function Fact({
  value,
  label,
  styles,
  accent = false,
}: {
  value: string;
  label: string;
  styles: ReturnType<typeof createStyles>;
  accent?: boolean;
}) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factValue, accent && styles.factValueAccent]}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

/**
 * Focus fill as a percentage of the window's tallest bar.
 *
 * The track is a fixed height and only the fill moves, so a day reads as "how
 * much of my biggest focus day is this" rather than "how big is this bar".
 * Sizing to the window's own maximum rather than an absolute number keeps the
 * chart honest about a quiet week: bars compare a day against the user's actual
 * routine, which is the question "have I been consistent?" is really asking.
 */
function focusFillPercent(focusedSeconds: number, maxFocusMinutes: number): number {
  const minutes = focusedSeconds / 60;
  if (!(minutes > 0) || !(maxFocusMinutes > 0)) return 0;
  return Math.min(100, (minutes / maxFocusMinutes) * 100);
}

/**
 * Fill height, in px, for the opened bar.
 *
 * The orange task tip sits above the green fill inside the same fixed track, so
 * a full day's green stops short to leave the cap room to sit.
 */
function fillHeightPx(percent: number, tipHeight: number): number {
  const ratio = percent / 100;
  const room = BAR_TRACK_HEIGHT - tipHeight;
  return Math.max(0, Math.min(room, ratio * BAR_TRACK_HEIGHT));
}

/**
 * Orange tip height, in px, from the tasks closed that day.
 *
 * None at zero; otherwise ~3px per task, capped so a very productive day cannot
 * overflow the track it sits in.
 */
function taskTipHeight(tasksCompleted: number): number {
  if (!(tasksCompleted > 0)) return 0;
  return Math.min(12, tasksCompleted * 3);
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    panel: {
      borderRadius: 16,
      padding: 16,
      // Breathing room between the tags block above and this history panel.
      marginTop: 12,
      // Section gap to whatever follows. Kept larger than the internal divider
      // spacing on purpose: this separates two unrelated features, where a
      // hairline only separates two parts of one.
      marginBottom: 24,
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

    /**
     * The streak tile.
     *
     * `surfaceMuted` rather than the panel's own `surface`, so it lifts off the
     * card without a border — the same raised-panel treatment used elsewhere.
     */
    streakTile: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    streakHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    streakFlame: {
      fontSize: 22,
    },
    streakHeroText: {
      gap: 1,
    },
    streakHeroValue: {
      color: t.colors.text,
      fontSize: 22,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    streakHeroLabel: {
      color: t.colors.textMuted,
      fontSize: 11,
    },
    streakFacts: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    fact: {
      alignItems: 'center',
    },
    factValue: {
      color: t.colors.text,
      fontSize: 15,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    factValueAccent: {
      color: t.colors.primary,
    },
    factLabel: {
      color: t.colors.textMuted,
      fontSize: 11,
    },
    /** Hairline between the two secondary figures, not around them. */
    factDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: t.colors.border,
    },

    journeyBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
    },
    journeyColumn: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    /**
     * Fixed two-line zone above each bar.
     *
     * The opened bar grows a second line (the task count); reserving room for
     * both lines on every column keeps the tracks from shifting out of line when
     * a bar opens.
     */
    journeyValueZone: {
      height: 26,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    journeyValue: {
      color: t.colors.textMuted,
      fontSize: 10,
      lineHeight: 12,
      fontVariant: ['tabular-nums'],
    },
    journeyTask: {
      color: t.colors.focusTip,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    journeyBarTrack: {
      width: BAR_WIDTH,
      height: BAR_TRACK_HEIGHT,
      justifyContent: 'flex-end',
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: t.colors.progressTrack,
    },
    journeyBarFill: {
      width: '100%',
      borderRadius: 4,
    },
    journeyTip: {
      width: '100%',
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      backgroundColor: t.colors.focusTip,
    },
    journeyLabel: {
      color: t.colors.textMuted,
      fontSize: 11,
    },

    hint: {
      color: t.colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
  });
