/**
 * Development areas.
 *
 * Areas are optional lenses on a career, not a taxonomy the user must accept.
 * Disabling one hides it from pickers without touching any linked history;
 * removing one unlinks goals and skills but never deletes them.
 */

import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import type { CareerDoc, DevelopmentDomain } from '../../career';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerActions,
  CareerBody,
  CareerButton,
  CareerCard,
  CareerEmptyState,
  CareerField,
  CareerMuted,
  CareerScreen,
  CareerSectionLabel,
} from './CareerUI';

export type CareerDomainsScreenProps = {
  doc: CareerDoc;
  onBack: () => void;
  onAdd: (name: string, description: string) => void;
  onEdit: (id: string, name: string, description: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onRestoreSuggested: () => void;
};

export function CareerDomainsScreen({
  doc,
  onBack,
  onAdd,
  onEdit,
  onToggle,
  onRemove,
  onRestoreSuggested,
}: CareerDomainsScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | undefined>();

  const domains = [...doc.domains].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );

  const beginEdit = (domain: DevelopmentDomain) => {
    setEditingId(domain.id);
    setEditName(domain.name);
    setEditDescription(domain.description);
    setEditError(undefined);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditError(undefined);
  };

  const saveEdit = (domain: DevelopmentDomain) => {
    const nextName = editName.trim();
    if (nextName.length === 0) {
      setEditError('Give the area a name.');
      return;
    }
    const duplicate = doc.domains.some(
      (entry) =>
        entry.id !== domain.id && entry.name.toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      setEditError('An area with that name already exists.');
      return;
    }
    onEdit(domain.id, nextName, editDescription);
    cancelEdit();
  };

  const add = () => {
    if (name.trim().length === 0) {
      setError('Give the area a name.');
      return;
    }
    if (doc.domains.some((domain) => domain.name.toLowerCase() === name.trim().toLowerCase())) {
      setError('An area with that name already exists.');
      return;
    }
    onAdd(name, description);
    setName('');
    setDescription('');
    setError(undefined);
    setAdding(false);
  };

  const confirmRemove = (domain: DevelopmentDomain) => {
    Alert.alert(
      `Remove ${domain.name}?`,
      'Goals and skills in this area keep their history. They are only unlinked from the area.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove area', style: 'destructive', onPress: () => onRemove(domain.id) },
      ],
    );
  };

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="Optional lenses for grouping goals and skills"
      title="Development areas"
    >
      <CareerCard>
        <CareerBody>
          These are suggested areas, not requirements. Rename a custom area,
          disable one you do not use, or ignore the whole idea. Removing an area
          never deletes the goals, skills or evidence beneath it.
        </CareerBody>
      </CareerCard>

      {domains.length === 0 ? (
        <CareerEmptyState
          actionLabel="Add an area"
          body="No development areas are enabled. You can add your own or restore the suggested set."
          onAction={() => setAdding(true)}
          title="Nothing here yet"
        />
      ) : (
        <CareerCard>
          {domains.map((domain, index) => (
            <View
              key={domain.id}
              style={editingId === domain.id ? styles.editItem : styles.row}
            >
              {index > 0 ? <View style={styles.divider} /> : null}
              {editingId === domain.id ? (
                <>
                  <CareerField
                    error={editError}
                    label="Area name"
                    onChangeText={(value) => {
                      setEditName(value);
                      if (editError) setEditError(undefined);
                    }}
                    value={editName}
                  />
                  <CareerField
                    label="Description (optional)"
                    multiline
                    onChangeText={setEditDescription}
                    value={editDescription}
                  />
                  <CareerActions>
                    <CareerButton label="Save area" onPress={() => saveEdit(domain)} />
                    <CareerButton
                      label="Cancel"
                      onPress={cancelEdit}
                      variant="secondary"
                    />
                  </CareerActions>
                </>
              ) : (
                <>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{domain.name}</Text>
                    <CareerMuted>{domain.description || 'No description'}</CareerMuted>
                    <Text style={styles.rowMeta}>
                      {domain.isCustom ? 'Custom area' : 'Suggested area'}
                      {domain.isEnabled ? '' : ' · hidden from pickers'}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Switch
                      accessibilityLabel={`${domain.name} enabled`}
                      accessibilityRole="switch"
                      onValueChange={(enabled) => onToggle(domain.id, enabled)}
                      thumbColor={domain.isEnabled ? t.colors.primary : t.colors.surfaceMuted}
                      trackColor={{ false: t.colors.border, true: t.colors.primary }}
                      value={domain.isEnabled}
                    />
                    <CareerButton
                      accessibilityLabel={`Edit ${domain.name}`}
                      label="Edit"
                      onPress={() => beginEdit(domain)}
                      variant="secondary"
                    />
                    <CareerButton
                      accessibilityLabel={`Remove ${domain.name}`}
                      label="Remove"
                      onPress={() => confirmRemove(domain)}
                      variant="danger"
                    />
                  </View>
                </>
              )}
            </View>
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Manage</CareerSectionLabel>
      {adding ? (
        <CareerCard>
          <CareerField
            error={error}
            label="Area name"
            onChangeText={(value) => {
              setName(value);
              if (error) setError(undefined);
            }}
            placeholder="e.g. Client relationships"
            value={name}
          />
          <CareerField
            label="Why this area matters (optional)"
            multiline
            onChangeText={setDescription}
            placeholder="A sentence you will understand later."
            value={description}
          />
          <CareerActions>
            <CareerButton label="Add area" onPress={add} />
            <CareerButton
              label="Cancel"
              onPress={() => {
                setAdding(false);
                setError(undefined);
              }}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      ) : (
        <CareerActions>
          <CareerButton label="Add a custom area" onPress={() => setAdding(true)} />
          <CareerButton
            label="Restore suggested areas"
            onPress={onRestoreSuggested}
            variant="secondary"
          />
        </CareerActions>
      )}
    </CareerScreen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 8,
    },
    editItem: {
      gap: 8,
      paddingVertical: 8,
    },
    rowText: {
      flex: 1,
      gap: 3,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
    },
    rowMeta: {
      fontSize: 12,
      color: t.colors.textDisabled,
    },
    rowActions: {
      alignItems: 'flex-end',
      gap: 8,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.divider,
      marginVertical: 6,
    },
  });
