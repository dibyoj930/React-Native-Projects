/**
 * Replan screen: the proposal preview and the approval surface.
 *
 * Presentational in the sense this app uses the word (see GoalsScreen): it holds
 * no scheduling state, generates nothing and persists nothing. It renders what the
 * controller hands it and reports intent — Build, Apply, Regenerate, Cancel, and
 * preference edits. All of that lives in hooks/useReplan.ts and the pure engine in
 * replan/, which this screen deliberately does not touch.
 *
 * Shape follows GoalsScreen/SettingsScreen: a back-chevron header and sections in
 * surface cards. Theme tokens only (no colour literals; enforced by
 * __tests__/theme.test.ts).
 *
 * The proposal is only ever *shown* here. Applying is a separate, explicit tap,
 * and it is disabled while the proposal is stale or a rebuild is in flight — the
 * brief's "apply only after explicit confirmation" is drawn as a disabled button
 * rather than trusted to copy.
 *
 * Reasoning sentences themselves come from `replan/explain.ts` once it exists;
 * this screen carries only the short status labels it needs to draw.
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

import { formatDuration } from '../productivity';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';
import { formatTimeLabel } from '../todos/timeKey';
import type {
  Classification,
  ReplanPreferences,
  ReplanProposal,
  ReplanTask,
  ReplanningMode,
} from '../replan';
import { formatClock, ReplanTimeline } from './ReplanTimeline';

export type ReplanScreenProps = {
  /** The in-memory proposal, or null before a build / after Cancel. */
  proposal: ReplanProposal | null;
  /** Current preferences; the chips reflect these. */
  preferences: ReplanPreferences;
  /** Task text lookup for the timeline and the task list. */
  tasksById: Record<string, ReplanTask>;
  /** Protected commitments to show as fixed rows, if the caller has them. */
  commitments?: ReadonlyArray<{ id: string; label: string; start: number; end: number }>;
  /** The proposal no longer matches current state; Apply is blocked until rebuilt. */
  stale: boolean;
  /** A build or apply is in flight; the actions are held. */
  busy?: boolean;
  onGenerate: () => void;
  onApply: () => void;
  onCancel: () => void;
  onSetPreferences: (next: ReplanPreferences) => void;
  /** Open the existing task sheet for a task that needs info / cannot fit. */
  onEditTask: (taskId: string) => void;
  onBack: () => void;
};

/** Counts drawn in the summary row. Purely derived from `proposal.outcomes`. */
export type ReplanSummary = {
  unchanged: number;
  moved: number;
  deferred: number;
  infeasible: number;
  needsInformation: number;
};

const WORKDAY_START_OPTIONS = ['07:00', '08:00', '09:00', '10:00'] as const;
const WORKDAY_END_OPTIONS = ['18:00', '19:00','20:00','21:00','22:00'] as const;
const BUFFER_OPTIONS = [0, 5, 10, 15] as const;
const BREAK_OPTIONS = [0, 10, 15, 30] as const;
const BREAK_AFTER_OPTIONS = [45, 60, 90] as const;

const MODE_OPTIONS: readonly { value: ReplanningMode; label: string }[] = [
  { value: 'fit', label: 'Fit everything' },
  { value: 'protect', label: 'Protect priorities' },
];

/**
 * Short status words for the task list.
 *
 * Deliberately terse labels, not the full explanations `replan/explain.ts` will
 * produce — a badge is a word, an explanation is a sentence.
 */
const STATUS: Record<Classification, { label: string; tone: StatusTone }> = {
  scheduled: { label: 'Planned', tone: 'primary' },
  deferred: { label: 'Deferred', tone: 'muted' },
  infeasible: { label: "Can't fit today", tone: 'danger' },
  needsInformation: { label: 'Needs a length', tone: 'warning' },
  protected: { label: 'Kept', tone: 'muted' },
};

type StatusTone = 'primary' | 'muted' | 'warning' | 'danger';

export function ReplanScreen({
  proposal,
  preferences,
  tasksById,
  commitments,
  stale,
  busy = false,
  onGenerate,
  onApply,
  onCancel,
  onSetPreferences,
  onEditTask,
  onBack,
}: ReplanScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  const toneColor = (tone: StatusTone): string => {
    if (tone === 'primary') return t.colors.primary;
    if (tone === 'danger') return t.colors.danger;
    if (tone === 'warning') return t.colors.warningText;
    return t.colors.textMuted;
  };

  const summary = useMemo<ReplanSummary>(() => {
    const acc: ReplanSummary = {
      unchanged: 0,
      moved: 0,
      deferred: 0,
      infeasible: 0,
      needsInformation: 0,
    };
    for (const outcome of proposal?.outcomes ?? []) {
      if (outcome.classification === 'scheduled') acc.moved += 1;
      else if (outcome.classification === 'deferred') acc.deferred += 1;
      else if (outcome.classification === 'infeasible') acc.infeasible += 1;
      else if (outcome.classification === 'needsInformation') acc.needsInformation += 1;
      else acc.unchanged += 1;
    }
    return acc;
  }, [proposal]);

  /** Task rows the user needs to see; kept/protected tasks are summarised only. */
  const listedOutcomes = (proposal?.outcomes ?? []).filter(
    (outcome) => outcome.classification !== 'protected',
  );

  const applyDisabled = busy || stale || !proposal;

  const setPreference = <K extends keyof ReplanPreferences>(
    key: K,
    value: ReplanPreferences[K],
  ) => {
    onSetPreferences({ ...preferences, [key]: value });
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
        <Text style={styles.title}>Replan your day</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <Text style={styles.sectionLabel}>Today</Text>

        {proposal === null ? (
          <View style={styles.card}>
            <Text style={styles.cardBody}>
              Build a plan for the rest of today from the tasks you have left. Nothing
              changes until you apply it.
            </Text>
            <TouchableOpacity
              accessibilityLabel="Build a plan"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              activeOpacity={0.8}
              disabled={busy}
              onPress={onGenerate}
              style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
            >
              <Text style={[styles.primaryButtonText, busy && styles.primaryButtonTextDisabled]}>
                {busy ? 'Building…' : 'Build a plan'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {stale && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  Things changed since this plan was built. Rebuild it before applying.
                </Text>
              </View>
            )}

            <View style={styles.card}>
              <ReplanTimeline
                commitments={commitments}
                placements={proposal.placements}
                tasksById={tasksById}
              />
            </View>

            <View style={styles.summaryRow}>
              <SummaryItem label="Kept" styles={styles} value={summary.unchanged} />
              <SummaryItem label="Planned" styles={styles} value={summary.moved} />
              <SummaryItem label="Deferred" styles={styles} value={summary.deferred} />
              <SummaryItem label="Can't fit" styles={styles} value={summary.infeasible} />
              <SummaryItem label="Needs info" styles={styles} value={summary.needsInformation} />
            </View>

            <Text style={styles.sectionLabel}>What changes</Text>
            <View style={styles.card}>
              {listedOutcomes.length === 0 ? (
                <Text style={styles.cardBody}>Nothing to change — the day already fits.</Text>
              ) : (
                listedOutcomes.map((outcome) => {
                  const task = tasksById[outcome.taskId];
                  const status = STATUS[outcome.classification];
                  const canEdit =
                    outcome.classification === 'infeasible' ||
                    outcome.classification === 'needsInformation';
                  const title = task ? task.text : 'Task';
                  return (
                    <View key={outcome.taskId} style={styles.taskRow}>
                      <View style={styles.taskMain}>
                        <Text numberOfLines={2} style={styles.taskText}>
                          {title}
                        </Text>
                        <View style={styles.taskMeta}>
                          <Text style={[styles.badge, { color: toneColor(status.tone) }]}>
                            {status.label}
                          </Text>
                          {outcome.start !== undefined && outcome.end !== undefined && (
                            <Text style={styles.taskTime}>
                              {`${formatClock(outcome.start)} – ${formatClock(outcome.end)}`}
                            </Text>
                          )}
                        </View>
                      </View>
                      {canEdit && (
                        <TouchableOpacity
                          accessibilityLabel={`Edit ${title}`}
                          accessibilityRole="button"
                          activeOpacity={0.7}
                          onPress={() => onEditTask(outcome.taskId)}
                          style={styles.editButton}
                        >
                          <Text style={styles.editText}>Edit</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityLabel="Discard this plan"
                accessibilityRole="button"
                activeOpacity={0.7}
                onPress={onCancel}
                style={[styles.button, styles.cancelButton]}
              >
                <Text style={styles.cancelText}>Discard</Text>
              </TouchableOpacity>

              {stale && (
                <TouchableOpacity
                  accessibilityLabel="Rebuild the plan"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                  disabled={busy}
                  onPress={onGenerate}
                  style={[styles.button, styles.rebuildButton]}
                >
                  <Text style={styles.rebuildText}>Rebuild</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                accessibilityLabel="Apply plan"
                accessibilityRole="button"
                accessibilityState={{ disabled: applyDisabled }}
                activeOpacity={0.8}
                disabled={applyDisabled}
                onPress={onApply}
                style={[styles.button, styles.applyButton, applyDisabled && styles.applyDisabled]}
              >
                <Text style={[styles.applyText, applyDisabled && styles.applyTextDisabled]}>
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.card}>
          <Text style={styles.cardBody}>
            How the plan is built. Change any of these and build again.
          </Text>

          <Text style={styles.label}>Workday starts</Text>
          <View style={styles.chipRow}>
            {WORKDAY_START_OPTIONS.map((option) => {
              const selected = preferences.workdayStart === option;
              return (
                <Chip
                  key={option}
                  label={`Workday starts ${formatTimeLabel(option)}`}
                  onPress={() => setPreference('workdayStart', option)}
                  selected={selected}
                  styles={styles}
                  text={formatTimeLabel(option)}
                />
              );
            })}
          </View>

          <Text style={styles.label}>Workday ends</Text>
          <View style={styles.chipRow}>
            {WORKDAY_END_OPTIONS.map((option) => {
              const selected = preferences.workdayEnd === option;
              return (
                <Chip
                  key={option}
                  label={`Workday ends ${formatTimeLabel(option)}`}
                  onPress={() => setPreference('workdayEnd', option)}
                  selected={selected}
                  styles={styles}
                  text={formatTimeLabel(option)}
                />
              );
            })}
          </View>

          <Text style={styles.label}>Buffer between tasks</Text>
          <View style={styles.chipRow}>
            {BUFFER_OPTIONS.map((option) => {
              const selected = preferences.bufferMinutes === option;
              return (
                <Chip
                  key={option}
                  label={`${formatDuration(option * 60)} buffer`}
                  onPress={() => setPreference('bufferMinutes', option)}
                  selected={selected}
                  styles={styles}
                  text={formatDuration(option * 60)}
                />
              );
            })}
          </View>

          <Text style={styles.label}>Break length</Text>
          <View style={styles.chipRow}>
            {BREAK_OPTIONS.map((option) => {
              const selected = preferences.breakMinutes === option;
              return (
                <Chip
                  key={option}
                  label={`${formatDuration(option * 60)} break`}
                  onPress={() => setPreference('breakMinutes', option)}
                  selected={selected}
                  styles={styles}
                  text={formatDuration(option * 60)}
                />
              );
            })}
          </View>

          <Text style={styles.label}>Break after</Text>
          <View style={styles.chipRow}>
            {BREAK_AFTER_OPTIONS.map((option) => {
              const selected = preferences.breakAfterMinutes === option;
              return (
                <Chip
                  key={option}
                  label={`Break after ${formatDuration(option * 60)}`}
                  onPress={() => setPreference('breakAfterMinutes', option)}
                  selected={selected}
                  styles={styles}
                  text={formatDuration(option * 60)}
                />
              );
            })}
          </View>

          <Text style={styles.label}>When time is short</Text>
          <View style={styles.segmentRow}>
            {MODE_OPTIONS.map((option) => {
              const selected = preferences.mode === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityLabel={`Use ${option.label.toLowerCase()} mode`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  activeOpacity={0.7}
                  onPress={() => setPreference('mode', option.value)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {preferences.mode === 'protect' && (
            <>
              <Chip
                label="Defer low-priority tasks"
                onPress={() =>
                  setPreference('lowPriorityDeferral', !preferences.lowPriorityDeferral)
                }
                selected={preferences.lowPriorityDeferral}
                styles={styles}
                text="Defer low-priority tasks"
              />
              <Text style={styles.hint}>
                Lower-priority tasks are left out first when the day does not fit. They stay on
                your list.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** One count in the summary row. */
function SummaryItem({
  label,
  value,
  styles,
}: {
  label: string;
  value: number;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

/** One selectable preference chip. */
function Chip({
  label,
  text,
  selected,
  onPress,
  styles,
}: {
  label: string;
  text: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{text}</Text>
    </TouchableOpacity>
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
    banner: {
      marginBottom: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.warningBorder,
      backgroundColor: c.warningSurface,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    bannerText: {
      fontSize: 13,
      lineHeight: 18,
      color: c.warningText,
    },
    primaryButton: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: c.primary,
    },
    primaryButtonDisabled: {
      backgroundColor: c.surfaceMuted,
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.primaryText,
    },
    primaryButtonTextDisabled: {
      color: c.textDisabled,
    },
    summaryRow: {
      flexDirection: 'row',
      marginTop: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
      paddingVertical: 12,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    summaryLabel: {
      fontSize: 11,
      color: c.textMuted,
      textAlign: 'center',
    },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    taskMain: {
      flex: 1,
      gap: 3,
    },
    taskText: {
      fontSize: 15,
      color: c.text,
    },
    taskMeta: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    badge: {
      fontSize: 12,
      fontWeight: '600',
    },
    taskTime: {
      fontSize: 12,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    editButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
    },
    editText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 16,
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
    rebuildButton: {
      backgroundColor: c.surfaceMuted,
    },
    rebuildText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    applyButton: {
      backgroundColor: c.primary,
    },
    applyDisabled: {
      backgroundColor: c.surfaceMuted,
    },
    applyText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.primaryText,
    },
    applyTextDisabled: {
      color: c.textDisabled,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
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
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      backgroundColor: c.surfaceMuted,
    },
    segmentSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
      textAlign: 'center',
    },
    segmentTextSelected: {
      color: c.primaryText,
    },
    hint: {
      fontSize: 12,
      lineHeight: 17,
      color: c.textMuted,
    },
  });
};
