import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { PlanOutcome, PlannedTaskResult } from '../replan';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type PlanOutcomeListProps = {
  outcome: PlanOutcome | null;
};

function statusLabel(r: PlannedTaskResult): string {
  switch (r.status) {
    case 'completed-on-time':
      return 'On-time';
    case 'completed-late':
      return 'Late';
    case 'postponed':
      return 'Postponed';
    case 'missed':
      return 'Missed';
    case 'ongoing':
      return 'Ongoing';
    case 'infeasible':
      return 'Infeasible';
    default:
      return r.status;
  }
}

export function PlanOutcomeList({ outcome }: PlanOutcomeListProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  if (!outcome || outcome.results.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Per-task</Text>
      <FlatList
        data={outcome.results}
        keyExtractor={(item) => item.taskId}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.task} numberOfLines={1}>
              {item.taskText || item.taskId}
            </Text>
            <Text style={styles.status}>{statusLabel(item)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    marginBottom: 12,
  },
  title: { fontSize: 14, fontWeight: '600', color: t.colors.text, marginBottom: 8 },
  item: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  task: { flex: 1, fontSize: 13, color: t.colors.text },
  status: { fontSize: 12, color: t.colors.textMuted },
});
