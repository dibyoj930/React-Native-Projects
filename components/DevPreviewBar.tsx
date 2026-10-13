/**
 * A development-only way to see the contextual UI without waiting for the clock.
 *
 * The suggestion banner and the reflection prompt are both gated on the time of
 * day (a planned block in the past, or the end of the workday). That makes them
 * tedious to exercise by hand — you either wait, or edit your device clock. This
 * bar renders fixed sample data through the real `ReplanSuggestionSheet` and
 * `ReflectionModal`, so their layout and copy can be checked in seconds.
 *
 * It is rendered only when `__DEV__` is true (see `HomeScreen`), so it is absent
 * from release builds. It carries no state the app cares about and never touches
 * storage: pressing "Adjust plan" simply closes the sheet.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ReplanSuggestionSheet } from './ReplanSuggestionSheet';
import { ReflectionModal } from './ReflectionModal';
import type { ReplanSuggestion } from '../replan';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

const SAMPLE_SUGGESTION: ReplanSuggestion = {
  id: 'dev-preview',
  type: 'planned-block-missed',
  dayKey: 'dev-preview',
  taskId: 'dev-preview',
  reason: 'Planned block for "Draft the report" ended at 2:00 PM but it\'s not done.',
  createdAt: 0,
  metadata: {},
};

export function DevPreviewBar() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [reflectionVisible, setReflectionVisible] = useState(false);

  const close = () => {
    setSheetVisible(false);
    setReflectionVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Dev preview</Text>
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityLabel="Preview suggestion"
          accessibilityRole="button"
          onPress={() => setSheetVisible(true)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Suggestion</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Preview reflection"
          accessibilityRole="button"
          onPress={() => setReflectionVisible(true)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Reflection</Text>
        </TouchableOpacity>
      </View>

      <ReplanSuggestionSheet
        visible={sheetVisible}
        suggestion={SAMPLE_SUGGESTION}
        onClose={close}
        onActionPrimary={close}
        onDismiss={close}
        onRemindLater={close}
      />
      <ReflectionModal
        visible={reflectionVisible}
        onClose={close}
        onSubmit={close}
      />
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      marginBottom: 12,
      padding: 10,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderStyle: 'dashed',
      backgroundColor: t.colors.surface,
    },
    label: {
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
      marginBottom: 6,
    },
    row: {
      flexDirection: 'row',
      gap: 8,
    },
    button: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: t.colors.surfaceMuted,
    },
    buttonText: {
      fontSize: 13,
      color: t.colors.text,
    },
  });
