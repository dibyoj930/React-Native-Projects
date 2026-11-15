/**
 * The replan timeline: one proposed day, drawn as ordered blocks.
 *
 * Presentational only. It takes the engine's placements (plus a task lookup) and
 * turns them into rows — it makes no scheduling decisions, because the engine has
 * already made them. Fixed commitments are shown as read-only rows so the plan
 * reads as "against your day", not "against nothing".
 *
 * Theme tokens only (no colour literals; enforced by __tests__/theme.test.ts).
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';
import { formatTimeLabel, timeKeyFromDate } from '../todos/timeKey';
import type { Placement, ReplanTask } from '../replan';

/**
 * One instant as a 12-hour clock label, e.g. `2:30 PM`.
 *
 * Built from the app's existing wall-clock helpers rather than
 * `toLocaleTimeString`, so the wording cannot drift between devices.
 */
export function formatClock(epochMs: number): string {
  return formatTimeLabel(timeKeyFromDate(new Date(epochMs)));
}

export type ReplanTimelineProps = {
  /** The engine's placements (tasks + break), in any order. */
  placements: readonly Placement[];
  /** Lookup for task text, keyed by id. */
  tasksById: Record<string, ReplanTask>;
  /** Protected commitment rows to show between task rows. */
  commitments?: ReadonlyArray<{ id: string; label: string; start: number; end: number }>;
  /** Label used for the break row. */
  breakLabel?: string;
};

type Row = {
  key: string;
  start: number;
  end: number;
  kind: 'task' | 'break' | 'commitment';
  label: string;
};

export function ReplanTimeline({
  placements,
  tasksById,
  commitments = [],
  breakLabel = 'Break',
}: ReplanTimelineProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  const rows = useMemo<Row[]>(() => {
    const taskRows: Row[] = placements.map((p) => {
      const isBreak = p.kind === 'break';
      return {
        key: `${p.kind}-${p.taskId}-${p.start}`,
        start: p.start,
        end: p.end,
        kind: isBreak ? 'break' : 'task',
        label: isBreak ? breakLabel : tasksById[p.taskId]?.text ?? 'Task',
      };
    });

    const commitmentRows: Row[] = commitments.map((c) => ({
      key: `commitment-${c.id}`,
      start: c.start,
      end: c.end,
      kind: 'commitment',
      label: c.label,
    }));

    return [...taskRows, ...commitmentRows].sort(
      (a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key),
    );
  }, [placements, commitments, tasksById, breakLabel]);

  const tintFor = (kind: Row['kind']): string => {
    if (kind === 'task') return t.colors.primary;
    if (kind === 'commitment') return t.colors.textMuted;
    return t.colors.progressTrack;
  };

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nothing planned yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View
          key={row.key}
          accessibilityLabel={`${row.label}, ${formatClock(row.start)} to ${formatClock(
            row.end,
          )}`}
          style={styles.row}
        >
          <View style={[styles.bar, { backgroundColor: tintFor(row.kind) }]} />
          <View style={styles.body}>
            <Text style={styles.time}>
              {`${formatClock(row.start)} – ${formatClock(row.end)}`}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.label, row.kind === 'commitment' && styles.labelFixed]}
            >
              {row.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    list: {
      gap: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
      paddingVertical: 7,
    },
    /** A thin colour spine per row: primary for work, muted for fixed time. */
    bar: {
      width: 3,
      borderRadius: 2,
    },
    body: {
      flex: 1,
      gap: 1,
    },
    time: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    label: {
      fontSize: 15,
      color: c.text,
    },
    labelFixed: {
      color: c.textMuted,
    },
    empty: {
      paddingVertical: 10,
    },
    emptyText: {
      fontSize: 14,
      color: c.textMuted,
    },
  });
};
