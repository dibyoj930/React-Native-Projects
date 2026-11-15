import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import type { PlanOutcome } from '../replan';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type PlanOutcomeSummaryProps = {
  outcome: PlanOutcome | null;
  title?: string;
  /**
   * The session log cannot speak for this day, so focus is unknown rather than
   * zero. Rendered as such instead of printing a misleading `0 min`.
   */
  focusUnavailable?: boolean;
};

export function PlanOutcomeSummary({
  outcome,
  title = "Plan vs actual",
  focusUnavailable = false,
}: PlanOutcomeSummaryProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  if (!outcome) return null;
  const s = outcome.summary;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        <View style={styles.tile}>
          <MaterialCommunityIcons name="check-circle" size={18} color={t.colors.primary} />
          <Text style={styles.value}>{s.completed}/{s.totalPlanned}</Text>
          <Text style={styles.label}>Done</Text>
        </View>
        <View style={styles.tile}>
          <MaterialCommunityIcons name="clock-check" size={18} color={t.colors.primary} />
          <Text style={styles.value}>{s.completedOnTime}</Text>
          <Text style={styles.label}>On-time</Text>
        </View>
        <View style={styles.tile}>
          <MaterialCommunityIcons name="clock-alert" size={18} color={t.colors.warningText} />
          <Text style={styles.value}>{s.completedLate}</Text>
          <Text style={styles.label}>Late</Text>
        </View>
        <View style={styles.tile}>
          <MaterialCommunityIcons name="calendar-arrow-right" size={18} color={t.colors.primary} />
          <Text style={styles.value}>{s.postponed}</Text>
          <Text style={styles.label}>Postponed</Text>
        </View>
      </View>
      {(focusUnavailable ||
        s.totalActualFocusMins !== undefined ||
        s.totalPlannedFocusMins !== undefined) && (
        <Text style={styles.footer}>
          {focusUnavailable
            ? 'Focus: unavailable'
            : [
                s.totalActualFocusMins !== undefined
                  ? `focused ${s.totalActualFocusMins} min`
                  : null,
                s.totalPlannedFocusMins !== undefined
                  ? `planned ${s.totalPlannedFocusMins} min`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </Text>
      )}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  tile: { flex: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: 16, fontWeight: '700', color: t.colors.text },
  label: { fontSize: 11, color: t.colors.textMuted },
  footer: { fontSize: 12, color: t.colors.textMuted, marginTop: 8 },
});
