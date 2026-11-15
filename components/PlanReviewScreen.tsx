/**
 * The Plan Review screen: a rolling week of plan-vs-actual, plus calibration.
 *
 * Presentational in the strict sense this app uses: it renders the models the
 * `usePlanReview` controller hands it and reports intent ("apply this
 * adjustment", "go back"). It derives no outcome, reads no storage and owns no
 * state. Reusing `PlanOutcomeSummary` and `PlanOutcomeList` rather than
 * re-drawing the numbers keeps the home card and this screen from ever
 * disagreeing about what a day's outcome says.
 *
 * The copy is deliberately honest about gaps: a day with no record says so, and
 * a day whose focus cannot be established says "unavailable" rather than `0`.
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

import { formatWeekday } from '../productivity';
import type { PlanReviewDay } from '../hooks/usePlanReview';
import type { CareerPlanReview } from '../career';
import type { WindowAggregate } from '../replan';
import type { CalibrationResult } from '../reflections';
import { PlanOutcomeList } from './PlanOutcomeList';
import { PlanOutcomeSummary } from './PlanOutcomeSummary';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type PlanReviewScreenProps = {
  /** Ascending, oldest first, today last. */
  days: PlanReviewDay[];
  aggregate: WindowAggregate;
  calibration: CalibrationResult;
  /** The career slice of the same window, when the career record is mounted. */
  careerReview?: CareerPlanReview;
  /** True until the stored outcomes have loaded at least once. */
  loading?: boolean;
  /** Resolves a task id to its text, for rows whose task was since deleted. */
  taskTextFor: (taskId: string) => string | undefined;
  /** Applies one calibration suggestion. The only mutation this screen can cause. */
  onApplyAdjustment: (taskId: string) => void;
  onBack: () => void;
};

/** `Today`, or `Mon · 10-12`, from a day key. */
function dayLabel(dayKey: string, isToday: boolean): string {
  if (isToday) return 'Today';
  const weekday = formatWeekday(dayKey);
  const monthDay = dayKey.slice(5);
  return weekday ? `${weekday} · ${monthDay}` : monthDay;
}

export function PlanReviewScreen({
  days,
  aggregate,
  calibration,
  careerReview,
  loading = false,
  taskTextFor,
  onApplyAdjustment,
  onBack,
}: PlanReviewScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  // Newest first reads better for "what have I been doing lately"; the model is
  // ascending because comparisons and rollover are chronological.
  const newestFirst = useMemo(() => [...days].slice().reverse(), [days]);

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
          <MaterialCommunityIcons color={t.colors.text} name="chevron-left" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Plan review</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Last 7 days</Text>
        <View style={styles.card}>
          {aggregate.daysWithData === 0 ? (
            <Text style={styles.body}>
              {loading
                ? 'Loading your history…'
                : 'No plans recorded in the last 7 days yet.'}
            </Text>
          ) : (
            <>
              <View style={styles.statRow}>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{aggregate.plannedOccurrences}</Text>
                  <Text style={styles.tileLabel}>Planned</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{aggregate.completedOccurrences}</Text>
                  <Text style={styles.tileLabel}>Done</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{aggregate.postponedOccurrences}</Text>
                  <Text style={styles.tileLabel}>Postponed</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileValue}>{aggregate.missedOccurrences}</Text>
                  <Text style={styles.tileLabel}>Missed</Text>
                </View>
              </View>
              <Text style={styles.body}>
                {`${aggregate.daysWithData} of ${days.length} days recorded.`}
              </Text>
              <Text style={styles.body}>
                {`Planned focus ${aggregate.plannedFocusMins} min · Focused ${aggregate.actualFocusMins} min`}
              </Text>
            </>
          )}
        </View>

        {careerReview ? (
          <>
            <Text style={styles.sectionLabel}>Career activity</Text>
            <View style={styles.card}>
              {careerReview.hasActivity ? (
                <>
                  <View style={styles.statRow}>
                    <View style={styles.tile}>
                      <Text style={styles.tileValue}>{careerReview.planned}</Text>
                      <Text style={styles.tileLabel}>Planned</Text>
                    </View>
                    <View style={styles.tile}>
                      <Text style={styles.tileValue}>{careerReview.completed}</Text>
                      <Text style={styles.tileLabel}>Done</Text>
                    </View>
                    <View style={styles.tile}>
                      <Text style={styles.tileValue}>{careerReview.postponed}</Text>
                      <Text style={styles.tileLabel}>Postponed</Text>
                    </View>
                    <View style={styles.tile}>
                      <Text style={styles.tileValue}>{careerReview.missed}</Text>
                      <Text style={styles.tileLabel}>Missed</Text>
                    </View>
                  </View>
                  <Text style={styles.body}>
                    {`Career focus planned ${careerReview.plannedFocusMins} min · recorded ${careerReview.actualFocusMins} min`}
                  </Text>
                  {careerReview.milestoneTotal > 0 ? (
                    <Text style={styles.body}>
                      {`Milestones for active career goals in this window: ${careerReview.milestoneCompleted} of ${careerReview.milestoneTotal} complete.`}
                    </Text>
                  ) : (
                    <Text style={styles.body}>
                      No milestones belong to the career goals active in this window.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.body}>
                  No career-linked plan activity in this window. Career work counts
                  here only when the task carried a career link when the comparison
                  was recorded.
                </Text>
              )}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Calibration</Text>
        <View style={styles.card}>
          {calibration.planningFactor === null && calibration.adjustments.length === 0 ? (
            <Text style={styles.body}>
              Not enough finished work yet. Once a few planned tasks are done, this
              suggests better estimates — never changes them on its own.
            </Text>
          ) : (
            <>
              {calibration.planningFactor !== null && (
                <Text style={styles.body}>
                  {`Recent work took about ${Math.round(calibration.planningFactor * 100)}% of the time planned, across ${calibration.sampleCount} finished ${calibration.sampleCount === 1 ? 'task' : 'tasks'}.`}
                </Text>
              )}
              {calibration.adjustments.map((adjustment) => (
                <View key={adjustment.taskId} style={styles.adjustRow}>
                  <View style={styles.adjustText}>
                    <Text style={styles.adjustTask} numberOfLines={1}>
                      {taskTextFor(adjustment.taskId) ?? adjustment.taskId}
                    </Text>
                    <Text style={styles.adjustDetail}>
                      {`${adjustment.currentMinutes} min → ${adjustment.suggestedMinutes} min${
                        adjustment.basis === 'task' ? ' · from this task' : ' · from your week'
                      }`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityLabel={`Apply ${adjustment.suggestedMinutes} minute estimate`}
                    accessibilityRole="button"
                    activeOpacity={0.7}
                    onPress={() => onApplyAdjustment(adjustment.taskId)}
                    style={styles.applyButton}
                  >
                    <Text style={styles.applyText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>By day</Text>
        {newestFirst.map((day) => (
          <View key={day.dayKey} style={styles.dayBlock}>
            <Text style={styles.dayHeading}>{dayLabel(day.dayKey, day.isToday)}</Text>
            {day.outcome ? (
              <>
                <PlanOutcomeSummary
                  outcome={day.outcome}
                  title="Plan vs actual"
                  focusUnavailable={!day.focusAvailable}
                />
                <PlanOutcomeList outcome={day.outcome} />
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.body}>No plan recorded for this day.</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
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
    title: { flex: 1, fontSize: 22, fontWeight: '700', color: c.text },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
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
      padding: 14,
      gap: 8,
      marginBottom: 12,
    },
    body: { fontSize: 14, lineHeight: 19, color: c.textMuted },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    tile: { flex: 1, alignItems: 'center', gap: 2 },
    tileValue: { fontSize: 18, fontWeight: '700', color: c.text },
    tileLabel: { fontSize: 11, color: c.textMuted },
    adjustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.divider,
    },
    adjustText: { flex: 1, gap: 2 },
    adjustTask: { fontSize: 14, fontWeight: '600', color: c.text },
    adjustDetail: { fontSize: 12, color: c.textMuted },
    applyButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: c.primary,
    },
    applyText: { fontSize: 13, fontWeight: '600', color: c.primaryText },
    dayBlock: { gap: 0 },
    dayHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      marginBottom: 8,
      marginTop: 4,
    },
  });
};
