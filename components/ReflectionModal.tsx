import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';
import type { EstimateAccuracy } from '../reflections';

export type ReflectionModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    estimatesAccurate: EstimateAccuracy;
    notes?: string;
  }) => Promise<void> | void;
};

export function ReflectionModal({ visible, onClose, onSubmit }: ReflectionModalProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [accuracy, setAccuracy] = useState<EstimateAccuracy>('unsure');
  const [notes, setNotes] = useState('');

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      {/* The form sits at the bottom of the sheet, so without this the keyboard
          would cover the notes field and the Submit/Cancel buttons. The scroll
          view is what keeps all of it reachable on a short screen once the
          keyboard is up; `handled` lets a tap on Submit land on the first press
          rather than being eaten by the dismiss-keyboard gesture. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.screen}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>End-of-day reflection</Text>
          <Text style={styles.label}>Were your time estimates accurate?</Text>
          <View style={styles.row}>
            {(['yes', 'mostly', 'no', 'unsure'] as EstimateAccuracy[]).map((a) => (
              <TouchableOpacity
                key={a}
                accessibilityRole="button"
                style={[styles.chip, accuracy === a && styles.chipActive]}
                onPress={() => setAccuracy(a)}
              >
                <Text style={[styles.chipText, accuracy === a && styles.chipTextActive]}>
                  {a}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
            placeholder="What went well, what got in the way?"
            placeholderTextColor={t.colors.textMuted}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primary}
              onPress={async () => {
                await onSubmit({ estimatesAccurate: accuracy, notes: notes || undefined });
                onClose();
              }}
            >
              <Text style={styles.primaryText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.colors.background },
  container: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '600', color: t.colors.text, marginBottom: 16 },
  label: { fontSize: 14, color: t.colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: t.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  chipActive: { backgroundColor: t.colors.primary },
  chipText: { fontSize: 13, color: t.colors.text },
  chipTextActive: { color: t.colors.primaryText },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, borderRadius: 8, padding: 10, color: t.colors.text, backgroundColor: t.colors.surface, marginBottom: 20, minHeight: 80, textAlignVertical: 'top' },
  actions: { gap: 10, marginBottom: 40 },
  primary: { backgroundColor: t.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: t.colors.primaryText, fontSize: 16, fontWeight: '600' },
  secondary: { padding: 12, alignItems: 'center' },
  secondaryText: { color: t.colors.primary, fontSize: 15 },
});
