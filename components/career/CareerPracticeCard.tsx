/**
 * The task-and-focus practice block shown on a career record.
 *
 * It displays only facts the app actually holds: how many tasks point at the
 * record, how many of those are complete, how much explicitly attributed focus
 * time there is, and the latest day either happened. There is no percentage
 * here, because "two linked tasks" has no meaningful maximum to divide by.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import {
  formatCareerDate,
  pluralise,
  type CareerPractice,
} from '../../career';
import { formatDuration } from '../../productivity/domain';
import type { Todo } from '../../todos/model';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import { CareerCard, CareerDivider, CareerMuted } from './CareerUI';

export type CareerPracticeCardProps = {
  practice: CareerPractice;
  tasks: readonly Todo[];
  /** Shown when there is neither a linked task nor attributed focus. */
  emptyBody?: string;
};

export function CareerPracticeCard({
  practice,
  tasks,
  emptyBody = 'No linked tasks or attributed focus yet. Link a task to this work from the task sheet, and the focus you spend on it will appear here.',
}: CareerPracticeCardProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  if (tasks.length === 0 && practice.focusSessionCount === 0) {
    return (
      <CareerCard>
        <CareerMuted>{emptyBody}</CareerMuted>
      </CareerCard>
    );
  }

  return (
    <CareerCard>
      <Text style={styles.summary}>{summaryFor(practice)}</Text>
      {tasks.map((task, index) => (
        <View key={task.id} style={styles.item}>
          {index > 0 ? <CareerDivider /> : null}
          <View style={styles.taskRow}>
            <MaterialCommunityIcons
              color={task.completed ? t.colors.primary : t.colors.textMuted}
              name={task.completed ? 'check-circle-outline' : 'circle-outline'}
              size={16}
            />
            <Text
              numberOfLines={2}
              style={[styles.taskText, task.completed && styles.taskTextDone]}
            >
              {task.text}
            </Text>
            <Text style={styles.taskStatus}>
              {task.completed ? 'Complete' : 'Open'}
            </Text>
          </View>
        </View>
      ))}
    </CareerCard>
  );
}

function summaryFor(practice: CareerPractice): string {
  const parts: string[] = [];

  if (practice.linkedTaskCount > 0) {
    parts.push(
      `${practice.completedTaskCount} of ${pluralise(
        practice.linkedTaskCount,
        'linked task',
      )} complete`,
    );
  }

  if (practice.focusSessionCount > 0) {
    parts.push(
      `${pluralise(practice.focusSessionCount, 'focus session')} · ${formatDuration(
        practice.focusedSeconds,
      )} focused`,
    );
  }

  if (practice.lastPractisedOn) {
    parts.push(`Last practised ${formatCareerDate(practice.lastPractisedOn)}`);
  }

  return parts.join(' · ');
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    summary: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    item: {
      marginTop: 10,
    },
    taskRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingTop: 10,
    },
    taskText: {
      color: c.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    taskTextDone: {
      color: c.textMuted,
    },
    taskStatus: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
  });
};
