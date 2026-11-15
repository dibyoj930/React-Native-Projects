import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FOCUS_BAR_TRACK_HEIGHT, FOCUS_BAR_WIDTH } from '../productivity';
import type { HistoryViewModel } from '../hooks/useProductivityView';
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
 *
 * The panel is a dumb view: it renders the `model` it is handed and reports
 * taps. The bar maths (target, fill percentages, heights), the range label, the
 * milestone celebration sentence and the streak reduction all live in the
 * productivity controller (`useProductivityView`), and the pure half of that is
 * under `productivity/focusChart.ts` and `productivity/milestones.ts` — so this
 * component keeps only the view state a chart needs: which bar is open, and
 * which milestone banners have been patted away.
 */
export type ProductivityDashboardProps = {
  /** Everything the panel prints, prepared above the view. */
  model: HistoryViewModel;
};

export function ProductivityDashboard({ model }: ProductivityDashboardProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  // Milestone congratulations are dismissible, one rung at a time — patting away
  // the 6h banner must not silence the 8h one later. View state only; the target
  // itself is derived from history, so it needs no storage.
  const [dismissedMilestones, setDismissedMilestones] = useState(() => new Set<number>());

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
            <Text style={styles.streakFlame}>{model.streak.current > 0 ? '🔥' : '🌱'}</Text>
            <View style={styles.streakHeroText}>
              <Text style={styles.streakHeroValue}>
                {model.streak.current} {model.streak.current === 1 ? 'day' : 'days'}
              </Text>
              <Text style={styles.streakHeroLabel}>current streak</Text>
            </View>
          </View>

          <View style={styles.streakFacts}>
            <Fact value={String(model.streak.longest)} label="best" styles={styles} />
            <View style={styles.factDivider} />
            <Fact
              value={String(model.streak.freezesRemaining)}
              label={model.streak.freezesRemaining === 1 ? 'freeze' : 'freezes'}
              styles={styles}
              accent={model.streak.freezesRemaining > 0}
            />
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Recent focus</Text>
        {model.bars.length === 0 ? (
          <Text style={styles.hint}>
            No focus logged yet. Start a timer to begin building history.
          </Text>
        ) : (
          <>
            {model.celebration !== null &&
              !dismissedMilestones.has(model.celebration.reachedMinutes) && (
                <View style={styles.celebration}>
                  <Text style={styles.celebrationText}>{model.celebration.message}</Text>
                  <TouchableOpacity
                    accessibilityLabel="Got it"
                    accessibilityRole="button"
                    activeOpacity={0.8}
                    onPress={() =>
                      setDismissedMilestones((prev) => {
                        const next = new Set(prev);
                        next.add(model.celebration!.reachedMinutes);
                        return next;
                      })
                    }
                    style={styles.celebrationDismiss}
                  >
                    <Text style={styles.celebrationDismissText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              )}
            <View style={styles.journeyBars}>
              {/* The bars arrive oldest → newest from the model, ready to render
                  left-to-right — the reversal that production charts need is the
                  controller's job, not this view's.

                  Each column is a tap target. At rest every day shows a pale bar;
                  tapping one grows it back to solid green, wakes the orange task
                  tip above the fill, and adds the task count beside the time. */}
              {model.bars.map((bar) => {
                const isSelected = bar.day === selectedDay;
                return (
                  <Pressable
                    key={bar.day}
                    style={styles.journeyColumn}
                    onPress={() => setSelectedDay(isSelected ? null : bar.day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={bar.label}
                  >
                    <View style={styles.journeyValueZone}>
                      <Text style={styles.journeyValue} numberOfLines={1}>
                        {bar.durationLabel}
                      </Text>
                      {isSelected && (
                        <Text style={styles.journeyTask} numberOfLines={1}>
                          {bar.tasksLabel}
                        </Text>
                      )}
                    </View>
                    <View style={styles.journeyBarTrack}>
                      {isSelected ? (
                        <>
                          {bar.tipHeight > 0 && (
                            <View style={[styles.journeyTip, { height: bar.tipHeight }]} />
                          )}
                          <Animated.View
                            style={[
                              styles.journeyBarFill,
                              {
                                height: grow.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, bar.fillHeight],
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
                              height: `${bar.fillPercent}%`,
                              backgroundColor: t.colors.focusBarIdle,
                            },
                          ]}
                        />
                      )}
                    </View>
                    <Text style={styles.journeyLabel}>{bar.weekdayLabel}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {model.rangeLabel} · green fill is focus time, a full bar is the next focus milestone
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
      width: FOCUS_BAR_WIDTH,
      height: FOCUS_BAR_TRACK_HEIGHT,
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

    /**
     * The milestone celebration.
     *
     * `surfaceMuted` like the streak tile, so the banner lifts off the panel
     * without a border; the dismissal reads as a quiet button beside the
     * message rather than a second utterance.
     */
    celebration: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    celebrationText: {
      flex: 1,
      color: t.colors.text,
      fontSize: 12,
      lineHeight: 16,
    },
    celebrationDismiss: {
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: t.colors.primary,
    },
    celebrationDismissText: {
      color: t.colors.primaryText,
      fontSize: 12,
      fontWeight: '600',
    },

    hint: {
      color: t.colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
  });