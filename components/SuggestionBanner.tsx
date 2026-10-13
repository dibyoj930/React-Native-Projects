import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import type { ReplanSuggestion } from '../replan';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type SuggestionBannerProps = {
  suggestion: ReplanSuggestion;
  onAction: () => void;
  onDismiss: () => void;
  onRemindLater: () => void;
};

export function SuggestionBanner({
  suggestion,
  onAction,
  onDismiss,
  onRemindLater,
}: SuggestionBannerProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <MaterialCommunityIcons
          color={t.colors.warningText}
          name="clock-alert-outline"
          size={18}
        />
        <Text style={styles.text} numberOfLines={2}>
          {suggestion.reason}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.actionText}>Adjust plan</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemindLater}>
          <Text style={styles.secondaryText}>Later</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.secondaryText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      marginBottom: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    text: {
      flex: 1,
      fontSize: 13,
      color: t.colors.text,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 6,
      justifyContent: 'flex-end',
    },
    actionText: {
      color: t.colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    secondaryText: {
      color: t.colors.textMuted,
      fontSize: 13,
    },
  });
