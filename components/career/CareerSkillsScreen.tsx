/**
 * Skills list.
 *
 * Proficiency is deliberately coarse and self-reported. The list surfaces the
 * gap to the target and the last recorded practice, but it does not turn either
 * into a readiness score.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CONFIDENCE_LABELS,
  IMPORTANCE_LABELS,
  IMPORTANCE_VALUES,
  PROFICIENCY_LABELS,
  careerDomainById,
  formatCareerDate,
  skillProgressRows,
  type CareerDoc,
  type CareerSkillDraft,
  type Confidence,
  type Importance,
  type SkillLevel,
} from '../../career';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerActions,
  CareerButton,
  CareerCard,
  CareerCardTitle,
  CareerChoiceRow,
  CareerEmptyState,
  CareerField,
  CareerLinkRow,
  CareerMuted,
  CareerScreen,
  CareerSectionLabel,
  CareerTag,
} from './CareerUI';

export type CareerSkillsScreenProps = {
  doc: CareerDoc;
  onBack: () => void;
  onOpenSkill: (skillId: string) => void;
  onCreate: (draft: CareerSkillDraft) => void;
};

const LEVEL_OPTIONS: readonly SkillLevel[] = [0, 1, 2, 3, 4, 5];
const CONFIDENCE_OPTIONS: readonly Confidence[] = [1, 2, 3, 4, 5];

type FormState = {
  name: string;
  description: string;
  domainId: string;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel;
  confidence: Confidence;
  roleImportance: Importance;
  futureImportance: Importance;
};

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    domainId: '',
    currentLevel: 0,
    targetLevel: 3,
    confidence: 3,
    roleImportance: 'medium',
    futureImportance: 'medium',
  };
}

export function CareerSkillsScreen({
  doc,
  onBack,
  onOpenSkill,
  onCreate,
}: CareerSkillsScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | undefined>();

  const rows = skillProgressRows(doc);
  const enabledDomains = doc.domains.filter((domain) => domain.isEnabled);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    if (form.name.trim().length === 0) {
      setError('A skill needs a name.');
      return;
    }
    if (
      doc.skills.some(
        (skill) => skill.name.toLowerCase() === form.name.trim().toLowerCase(),
      )
    ) {
      setError('A skill with that name already exists.');
      return;
    }
    onCreate({
      name: form.name.trim(),
      description: form.description.trim(),
      ...(form.domainId ? { domainId: form.domainId } : {}),
      currentLevel: form.currentLevel,
      targetLevel: form.targetLevel,
      confidence: form.confidence,
      roleImportance: form.roleImportance,
      futureImportance: form.futureImportance,
    });
    setForm(emptyForm());
    setError(undefined);
    setFormOpen(false);
  };

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="What you can do now and what you want to grow"
      title="Skills"
    >
      <CareerCard>
        <CareerCardTitle>Skills are descriptions, not scores</CareerCardTitle>
        <CareerMuted>
          The level is a starting point for a conversation with yourself. Evidence
          and assessments are what make progress visible; neither is required to
          start tracking a skill.
        </CareerMuted>
      </CareerCard>

      {rows.length === 0 ? (
        <CareerEmptyState
          actionLabel="Add a skill"
          body="Track a skill you want to develop or one you already rely on. You can add evidence later."
          onAction={() => setFormOpen(true)}
          title="No skills tracked yet"
        />
      ) : null}

      {!formOpen ? (
        <CareerActions>
          <CareerButton label="Add a skill" onPress={() => setFormOpen(true)} />
        </CareerActions>
      ) : null}

      {formOpen ? (
        <CareerCard>
          <CareerCardTitle>New skill</CareerCardTitle>
          <CareerField
            error={error}
            label="Name"
            onChangeText={(value) => {
              set('name', value);
              if (error) setError(undefined);
            }}
            placeholder="e.g. negotiation, data analysis, patient handover"
            value={form.name}
          />
          <CareerField
            label="Why it matters (optional)"
            multiline
            onChangeText={(value) => set('description', value)}
            value={form.description}
          />
          <CareerChoiceRow
            label="Development area (optional)"
            labelFor={(value) =>
              value ? careerDomainById(doc, value)?.name ?? 'Unknown area' : 'No area'
            }
            onSelect={(value) => set('domainId', value)}
            options={['', ...enabledDomains.map((domain) => domain.id)]}
            selected={form.domainId}
          />
          <CareerChoiceRow
            label="Current level"
            labelFor={(value) => PROFICIENCY_LABELS[value]}
            onSelect={(value) => set('currentLevel', value)}
            options={LEVEL_OPTIONS}
            selected={form.currentLevel}
          />
          <CareerChoiceRow
            label="Target level"
            labelFor={(value) => PROFICIENCY_LABELS[value]}
            onSelect={(value) => set('targetLevel', value)}
            options={LEVEL_OPTIONS}
            selected={form.targetLevel}
          />
          <CareerChoiceRow
            label="Confidence"
            labelFor={(value) => CONFIDENCE_LABELS[value - 1]}
            onSelect={(value) => set('confidence', value)}
            options={CONFIDENCE_OPTIONS}
            selected={form.confidence}
          />
          <CareerChoiceRow
            label="Importance to your current role"
            labelFor={(value) => IMPORTANCE_LABELS[value]}
            onSelect={(value) => set('roleImportance', value)}
            options={IMPORTANCE_VALUES}
            selected={form.roleImportance}
          />
          <CareerChoiceRow
            label="Importance to your future direction"
            labelFor={(value) => IMPORTANCE_LABELS[value]}
            onSelect={(value) => set('futureImportance', value)}
            options={IMPORTANCE_VALUES}
            selected={form.futureImportance}
          />
          <CareerMuted>
            These two can differ. A skill can be central to the job you have and
            irrelevant to the one you want, or the other way round.
          </CareerMuted>
          <CareerActions>
            <CareerButton label="Save skill" onPress={save} />
            <CareerButton
              label="Cancel"
              onPress={() => {
                setForm(emptyForm());
                setError(undefined);
                setFormOpen(false);
              }}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      ) : null}

      {rows.length > 0 ? (
        <>
          <CareerSectionLabel>Tracked skills</CareerSectionLabel>
          <CareerCard>
            {rows.map((row, index) => (
              <View key={row.skill.id} style={styles.item}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <SkillRow
                  doc={doc}
                  onOpen={() => onOpenSkill(row.skill.id)}
                  row={row}
                />
              </View>
            ))}
          </CareerCard>
        </>
      ) : null}
    </CareerScreen>
  );
}

function SkillRow({
  doc,
  row,
  onOpen,
}: {
  doc: CareerDoc;
  row: ReturnType<typeof skillProgressRows>[number];
  onOpen: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const domain = careerDomainById(doc, row.skill.domainId);
  const gapLabel =
    row.gap > 0
      ? `${PROFICIENCY_LABELS[row.skill.currentLevel]} → ${
          PROFICIENCY_LABELS[row.skill.targetLevel]
        }`
      : PROFICIENCY_LABELS[row.skill.currentLevel];

  return (
    <View style={styles.skill}>
      <CareerLinkRow
        accessibilityLabel={`Open skill ${row.skill.name}`}
        detail={`${domain?.name ?? 'No area'} · ${gapLabel}`}
        label={row.skill.name}
        onPress={onOpen}
      />
      <View style={styles.tags}>
        <CareerTag label={`Role: ${IMPORTANCE_LABELS[row.skill.roleImportance]}`} />
        <CareerTag label={`Future: ${IMPORTANCE_LABELS[row.skill.futureImportance]}`} />
        {row.evidenceCount > 0 ? (
          <CareerTag label={`${row.evidenceCount} evidence`} tone="muted" />
        ) : null}
        {row.lastPractisedOn ? (
          <CareerTag
            label={`Practised ${formatCareerDate(row.lastPractisedOn)}`}
            tone="muted"
          />
        ) : (
          <CareerTag label="No practice recorded" tone="muted" />
        )}
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    item: {
      gap: 7,
    },
    skill: {
      gap: 7,
    },
    tags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.divider,
      marginVertical: 8,
    },
  });
