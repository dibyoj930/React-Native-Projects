/**
 * Achievements: supported claims about outcomes.
 *
 * The screen asks for evidence and metrics rather than generating them. Empty
 * impact and metrics fields stay empty; the UI never fills them with a plausible
 * number.
 */

import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_CATEGORY_LABELS,
  careerGoalById,
  formatCareerDate,
  type CareerAchievement,
  type CareerAchievementDraft,
  type CareerDoc,
  type AchievementCategory,
} from '../../career';
import { isValidDayKey, type DayKey } from '../../shared/date';
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
  CareerMultiChoiceRow,
  CareerMuted,
  CareerScreen,
  CareerSectionLabel,
  CareerTag,
} from './CareerUI';

export type CareerAchievementsScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onSave: (draft: CareerAchievementDraft, id?: string) => void;
  onDelete: (id: string) => void;
};

export function CareerAchievementsScreen({
  doc,
  today,
  onBack,
  onOpenGoal,
  onSave,
  onDelete,
}: CareerAchievementsScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CareerAchievement | null>(null);

  const achievements = [...doc.achievements].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (achievement: CareerAchievement) => {
    setEditing(achievement);
    setEditorOpen(true);
  };

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="What changed, and how you know"
      title="Achievements"
    >
      <CareerCard>
        <CareerCardTitle>Record outcomes you can support</CareerCardTitle>
        <CareerMuted>
          An achievement is more than a task completed. Describe what changed and
          link the evidence that shows it. Leave metrics blank when you do not
          have real measurements.
        </CareerMuted>
      </CareerCard>

      {achievements.length === 0 && !editorOpen ? (
        <CareerEmptyState
          actionLabel="Record an achievement"
          body="No achievements recorded yet. Evidence can exist without an achievement, and that is fine."
          onAction={openNew}
          title="Nothing recorded yet"
        />
      ) : null}

      {!editorOpen ? (
        <CareerActions>
          <CareerButton label="Record an achievement" onPress={openNew} />
        </CareerActions>
      ) : null}

      {editorOpen ? (
        <AchievementEditor
          key={editing?.id ?? `new-${today}`}
          doc={doc}
          initial={editing}
          today={today}
          onCancel={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSave={(draft) => {
            onSave(draft, editing?.id);
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      {achievements.length > 0 ? (
        <>
          <CareerSectionLabel>Recorded</CareerSectionLabel>
          {achievements.map((achievement) => (
            <CareerCard key={achievement.id}>
              <View style={styles.tagRow}>
                <CareerTag label={ACHIEVEMENT_CATEGORY_LABELS[achievement.category]} />
                <CareerTag label={formatCareerDate(achievement.date)} tone="muted" />
              </View>
              <Text style={styles.title}>{achievement.title}</Text>
              {achievement.description ? (
                <Text style={styles.paragraph}>{achievement.description}</Text>
              ) : null}
              {achievement.impact ? (
                <CareerMuted>Impact: {achievement.impact}</CareerMuted>
              ) : (
                <CareerMuted>Impact not recorded.</CareerMuted>
              )}
              {achievement.metrics ? (
                <CareerMuted>Metrics: {achievement.metrics}</CareerMuted>
              ) : (
                <CareerMuted>No metrics recorded.</CareerMuted>
              )}
              {achievement.evidenceIds.length > 0 ? (
                <CareerMuted>
                  {achievement.evidenceIds.length} linked evidence item
                  {achievement.evidenceIds.length === 1 ? '' : 's'}.
                </CareerMuted>
              ) : null}
              {achievement.goalId ? (
                <CareerLinkRow
                  accessibilityLabel="Open linked goal"
                  detail="Linked goal"
                  label={
                    careerGoalById(doc, achievement.goalId)?.title ??
                    achievement.goalTitleSnapshot ??
                    'A goal that was deleted'
                  }
                  onPress={() => {
                    if (achievement.goalId) onOpenGoal(achievement.goalId);
                  }}
                />
              ) : achievement.goalTitleSnapshot ? (
                <CareerMuted>Originally for: {achievement.goalTitleSnapshot}</CareerMuted>
              ) : null}
              <CareerActions>
                <CareerButton
                  label="Edit"
                  onPress={() => openEdit(achievement)}
                  variant="secondary"
                />
                <CareerButton
                  label="Delete"
                  onPress={() =>
                    Alert.alert(
                      `Delete ${achievement.title}?`,
                      'This permanently removes the achievement. Linked evidence stays in the career record.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => onDelete(achievement.id),
                        },
                      ],
                    )
                  }
                  variant="danger"
                />
              </CareerActions>
            </CareerCard>
          ))}
        </>
      ) : null}
    </CareerScreen>
  );
}

function AchievementEditor({
  doc,
  initial,
  today,
  onSave,
  onCancel,
}: {
  doc: CareerDoc;
  initial: CareerAchievement | null;
  today: DayKey;
  onSave: (draft: CareerAchievementDraft) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<AchievementCategory>(
    initial?.category ?? 'impact',
  );
  const [date, setDate] = useState(initial?.date ?? today);
  const [impact, setImpact] = useState(initial?.impact ?? '');
  const [metrics, setMetrics] = useState(initial?.metrics ?? '');
  const [goalId, setGoalId] = useState(initial?.goalId ?? '');
  const [skillIds, setSkillIds] = useState<string[]>(
    initial?.demonstratedSkillIds ?? [],
  );
  const [evidenceIds, setEvidenceIds] = useState<string[]>(initial?.evidenceIds ?? []);
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (title.trim().length === 0) {
      setError('An achievement needs a title.');
      return;
    }
    if (!isValidDayKey(date.trim())) {
      setError('Use a real date in YYYY-MM-DD format.');
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim(),
      category,
      date: date.trim(),
      impact: impact.trim(),
      metrics: metrics.trim(),
      demonstratedSkillIds: skillIds,
      evidenceIds,
      ...(goalId ? { goalId } : {}),
    });
  };

  return (
    <CareerCard>
      <CareerCardTitle>{initial ? 'Edit achievement' : 'New achievement'}</CareerCardTitle>
      <CareerField
        error={error}
        label="Title"
        onChangeText={(value) => {
          setTitle(value);
          if (error) setError(undefined);
        }}
        placeholder="What did you achieve?"
        value={title}
      />
      <CareerField
        label="Description"
        multiline
        onChangeText={setDescription}
        placeholder="What did you do, and in what context?"
        value={description}
      />
      <CareerChoiceRow
        label="Category"
        labelFor={(value) => ACHIEVEMENT_CATEGORY_LABELS[value]}
        onSelect={setCategory}
        options={ACHIEVEMENT_CATEGORIES}
        selected={category}
      />
      <CareerField
        label="Date"
        onChangeText={(value) => {
          setDate(value);
          if (error) setError(undefined);
        }}
        placeholder="YYYY-MM-DD"
        value={date}
      />
      <CareerField
        label="Impact (optional)"
        multiline
        onChangeText={setImpact}
        placeholder="What changed? Describe it only as far as you can support it."
        value={impact}
      />
      <CareerField
        label="Metrics (optional)"
        multiline
        onChangeText={setMetrics}
        placeholder="Real measurements only. Leave blank if none exist."
        value={metrics}
      />
      <CareerChoiceRow
        label="Linked goal (optional)"
        labelFor={(value) =>
          value ? careerGoalById(doc, value)?.title ?? 'Unknown goal' : 'No goal'
        }
        onSelect={setGoalId}
        options={['', ...doc.goals.map((goal) => goal.id)]}
        selected={goalId}
      />
      <CareerMultiChoiceRow
        emptyLabel="Add skills first to link them here."
        label="Skills demonstrated (optional)"
        labelFor={(value) => doc.skills.find((skill) => skill.id === value)?.name ?? value}
        onToggle={(value) =>
          setSkillIds((current) =>
            current.includes(value)
              ? current.filter((id) => id !== value)
              : [...current, value],
          )
        }
        options={doc.skills.map((skill) => skill.id)}
        selected={skillIds}
      />
      <CareerMultiChoiceRow
        emptyLabel="Record evidence first to link it here."
        label="Supporting evidence (optional)"
        labelFor={(value) =>
          doc.evidence.find((entry) => entry.id === value)?.title ?? value
        }
        onToggle={(value) =>
          setEvidenceIds((current) =>
            current.includes(value)
              ? current.filter((id) => id !== value)
              : [...current, value],
          )
        }
        options={doc.evidence.map((entry) => entry.id)}
        selected={evidenceIds}
      />
      <CareerActions>
        <CareerButton
          label={initial ? 'Save changes' : 'Save achievement'}
          onPress={save}
        />
        <CareerButton label="Cancel" onPress={onCancel} variant="secondary" />
      </CareerActions>
    </CareerCard>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.text,
    },
    paragraph: {
      fontSize: 14,
      lineHeight: 20,
      color: t.colors.text,
    },
  });
