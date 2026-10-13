import React, { useMemo } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ReplanSuggestion } from '../replan';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type ReplanSuggestionSheetProps = {
  visible: boolean;
  suggestion: ReplanSuggestion | null;
  onClose: () => void;
  onActionPrimary: (suggestion: ReplanSuggestion) => void;
  onDismiss: (suggestion: ReplanSuggestion) => void;
  onRemindLater: (suggestion: ReplanSuggestion) => void;
};

export function ReplanSuggestionSheet({
  visible,
  suggestion,
  onClose,
  onActionPrimary,
  onDismiss,
  onRemindLater,
}: ReplanSuggestionSheetProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  if (!suggestion) return null;

  const title =
    suggestion.type === 'planned-block-missed'
      ? 'Planned block missed'
      : "You're behind schedule";

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.body}>{suggestion.reason}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => {
              onActionPrimary(suggestion);
              onClose();
            }}
          >
            <Text style={styles.primaryText}>Adjust plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => {
              onRemindLater(suggestion);
              onClose();
            }}
          >
            <Text style={styles.secondaryText}>Remind me later</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => {
              onDismiss(suggestion);
              onClose();
            }}
          >
            <Text style={styles.secondaryText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.colors.background,
      padding: 16,
      justifyContent: 'flex-end',
    },
    header: {
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: t.colors.text,
    },
    body: {
      fontSize: 14,
      color: t.colors.text,
      marginBottom: 20,
      lineHeight: 20,
    },
    actions: {
      gap: 10,
      marginBottom: 40,
    },
    primary: {
      backgroundColor: t.colors.primary,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryText: {
      color: t.colors.primaryText,
      fontSize: 16,
      fontWeight: '600',
    },
    secondary: {
      padding: 12,
      alignItems: 'center',
    },
    secondaryText: {
      color: t.colors.primary,
      fontSize: 15,
    },
  });
