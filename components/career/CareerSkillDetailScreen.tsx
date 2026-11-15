/**
 * A single skill and the records that support it.
 *
 * The screen shows evidence, achievements and assessments as separate kinds of
 * support. It does not collapse them into one score, and an empty skill is
 * allowed to look empty rather than being padded with a synthetic baseline.
 */

import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  ACHIEVEMENT_CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  EVIDENCE_TYPE_LABELS,
  IMPORTANCE_LABELS,
  IMPORTANCE_VALUES,
  PROFICIENCY_LABELS,
  assessmentsForSkill,
  careerDomainById,
  evidenceForSkill,
  formatCareerDate,
  goalsForSkill,
  lastPractisedOn,
  skillGap,
  type CareerDevelopment,
  type CareerDoc,
  type CareerSkill,
  type CareerSkillDraft,
  type Confidence,
  type Importance,
  type SkillLevel,
} from '../../career';
import type { DayKey } from '../../shared/date';
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
import { CareerPracticeCard } from './CareerPracticeCard';

export type CareerSkillDetailScreenProps = {
  doc: CareerDoc;
  skillId: string;
  /** Derived task/focus practice, when the cross-domain controller is mounted. */
  development?: CareerDevelopment;
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGoals: () => void;
  onSave: (draft: CareerSkillDraft, id: string) => void;
  onDelete: (id: string) => void;
};

const LEVEL_OPTIONS: readonly SkillLevel[] = [0, 1, 2, 3, 4, 5];
const CONFIDENCE_OPTIONS: readonly Confidence[] = [1, 2, 3, 4, 5];

export function CareerSkillDetailScreen({
  doc,
  skillId,
  development,
  onBack,
  onOpenGoal,
  onOpenGoals,
  onSave,
  onDelete,
}: CareerSkillDetailScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const skill = doc.skills.find((entry) => entry.id === skillId);
  const [editing, setEditing] = useState(false);

  if (!skill) {
    return (
      <CareerScreen backLabel="Back to skills" onBack={onBack} title="Skill not found">
        <CareerEmptyState
          body="This skill may have been deleted. Evidence and achievements that mentioned it are still kept."
          title="That skill is no longer here"
        />
      </CareerScreen>
    );
  }

  const domain = careerDomainById(doc, skill.domainId);
  const relatedGoals = goalsForSkill(doc, skill.id);
  const evidence = evidenceForSkill(doc, skill.id);
  const achievements = doc.achievements
    .filter((entry) => entry.demonstratedSkillIds.includes(skill.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const assessments = assessmentsForSkill(doc, skill.id);
  const practice = development?.practiceForSkill(skill.id);
  const recordedPractice = lastPractisedOn(doc, skill.id);
  const practised = latestDay(recordedPractice, practice?.lastPractisedOn ?? null);
  const linkedTasks = development?.tasksForSkill(skill.id) ?? [];
  const gap = skillGap(skill);

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${skill.name}?`,
      'Goals, evidence and achievements that mention this skill keep their history. They are only unlinked from it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete skill',
          style: 'destructive',
          onPress: () => {
            onDelete(skill.id);
            onBack();
          },
        },
      ],
    );
  };

  return (
    <CareerScreen
      backLabel="Back to skills"
      onBack={onBack}
      subtitle={domain?.name ?? 'No development area'}
      title={skill.name}
    >
      <CareerCard>
        <View style={styles.tagRow}>
          <CareerTag
            label={`Current: ${PROFICIENCY_LABELS[skill.currentLevel]}`}
            tone="muted"
          />
          <CareerTag
            label={`Target: ${PROFICIENCY_LABELS[skill.targetLevel]}`}
            tone={gap > 0 ? 'primary' : 'muted'}
          />
          <CareerTag label={`Role: ${IMPORTANCE_LABELS[skill.roleImportance]}`} />
          <CareerTag label={`Future: ${IMPORTANCE_LABELS[skill.futureImportance]}`} />
        </View>
        <CareerMuted>
          Importance to your current role and to your future direction are shown
          separately. Confidence: {CONFIDENCE_LABELS[skill.confidence - 1]} ·{' '}
          {practised ? `last practised ${formatCareerDate(practised)}` : 'no practice recorded'}
        </CareerMuted>
        {skill.description ? <Text style={styles.paragraph}>{skill.description}</Text> : null}
        <CareerMuted>
          {gap > 0
            ? `A ${gap}-level gap to the target you set. This is not a readiness score.`
            : 'Current level meets or exceeds the target you set.'}
        </CareerMuted>
        <CareerActions>
          <CareerButton
            label={editing ? 'Close editor' : 'Edit skill'}
            onPress={() => setEditing((value) => !value)}
            variant="secondary"
          />
          <CareerButton label="Delete" onPress={confirmDelete} variant="danger" />
        </CareerActions>
      </CareerCard>

      {editing ? (
        <SkillEditor
          doc={doc}
          skill={skill}
          onCancel={() => setEditing(false)}
          onSave={(draft) => {
            onSave(draft, skill.id);
            setEditing(false);
          }}
        />
      ) : null}

      <CareerSectionLabel>Related goals</CareerSectionLabel>
      {relatedGoals.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            This skill is not linked to a goal yet. Link it from a goal's editor,
            or create a goal that needs it.
          </CareerMuted>
          <CareerActions>
            <CareerButton label="Open goals" onPress={onOpenGoals} variant="secondary" />
          </CareerActions>
        </CareerCard>
      ) : (
        <CareerCard>
          {relatedGoals.map((goal) => (
            <CareerLinkRow
              key={goal.id}
              accessibilityLabel={`Open goal ${goal.title}`}
              detail={goal.successCriteria || 'No success criteria yet'}
              label={goal.title}
              onPress={() => onOpenGoal(goal.id)}
            />
          ))}
        </CareerCard>
      )}

      {development && practice ? (
        <>
          <CareerSectionLabel>Linked tasks and focus</CareerSectionLabel>
          <CareerPracticeCard
            emptyBody="No tasks are linked to this skill yet. Link one from the task sheet to connect daily work to this skill."
            practice={practice}
            tasks={linkedTasks}
          />
        </>
      ) : null}

      <CareerSectionLabel>Evidence</CareerSectionLabel>
      {evidence.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No evidence recorded for this skill. A small, real example is more
            useful than a dramatic claim.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {evidence.map((entry, index) => (
            <View key={entry.id} style={styles.item}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Text style={styles.itemTitle}>{entry.title}</Text>
              <CareerMuted>
                {EVIDENCE_TYPE_LABELS[entry.type]} · {formatCareerDate(entry.occurredOn)}
                {entry.score !== undefined ? ` · score ${entry.score}` : ''}
              </CareerMuted>
              {entry.goalTitleSnapshot ? (
                <CareerMuted>For: {entry.goalTitleSnapshot}</CareerMuted>
              ) : null}
            </View>
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Achievements</CareerSectionLabel>
      {achievements.length === 0 ? (
        <CareerCard>
          <CareerMuted>No achievements demonstrate this skill yet.</CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {achievements.map((achievement) => (
            <View key={achievement.id} style={styles.item}>
              <Text style={styles.itemTitle}>{achievement.title}</Text>
              <CareerMuted>
                {ACHIEVEMENT_CATEGORY_LABELS[achievement.category]} ·{' '}
                {formatCareerDate(achievement.date)}
              </CareerMuted>
            </View>
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Assessments</CareerSectionLabel>
      <CareerCard>
        <CareerMuted>
          {assessments.length === 0
            ? 'No assessments recorded yet. Assessment tools arrive in a later phase.'
            : `${assessments.length} assessment${
                assessments.length === 1 ? '' : 's'
              } recorded. Detailed assessment tools arrive in a later phase.`}
        </CareerMuted>
      </CareerCard>
    </CareerScreen>
  );
}

function latestDay(current: DayKey | null, candidate: DayKey | null): DayKey | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

function SkillEditor({
  doc,
  skill,
  onSave,
  onCancel,
}: {
  doc: CareerDoc;
  skill: CareerSkill;
  onSave: (draft: CareerSkillDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [domainId, setDomainId] = useState(skill.domainId ?? '');
  const [currentLevel, setCurrentLevel] = useState<SkillLevel>(skill.currentLevel);
  const [targetLevel, setTargetLevel] = useState<SkillLevel>(skill.targetLevel);
  const [confidence, setConfidence] = useState<Confidence>(skill.confidence);
  const [roleImportance, setRoleImportance] = useState<Importance>(skill.roleImportance);
  const [futureImportance, setFutureImportance] = useState<Importance>(
    skill.futureImportance,
  );
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (name.trim().length === 0) {
      setError('A skill needs a name.');
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      ...(domainId ? { domainId } : {}),
      currentLevel,
      targetLevel,
      confidence,
      roleImportance,
      futureImportance,
    });
  };

  return (
    <CareerCard>
      <CareerCardTitle>Edit skill</CareerCardTitle>
      <CareerField
        error={error}
        label="Name"
        onChangeText={(value) => {
          setName(value);
          if (error) setError(undefined);
        }}
        value={name}
      />
      <CareerField
        label="Why it matters"
        multiline
        onChangeText={setDescription}
        value={description}
      />
      <CareerChoiceRow
        label="Development area"
        labelFor={(value) =>
          value ? careerDomainById(doc, value)?.name ?? 'Unknown area' : 'No area'
        }
        onSelect={setDomainId}
        options={['', ...doc.domains.filter((entry) => entry.isEnabled).map((entry) => entry.id)]}
        selected={domainId}
      />
      <CareerChoiceRow
        label="Current level"
        labelFor={(value) => PROFICIENCY_LABELS[value]}
        onSelect={setCurrentLevel}
        options={LEVEL_OPTIONS}
        selected={currentLevel}
      />
      <CareerChoiceRow
        label="Target level"
        labelFor={(value) => PROFICIENCY_LABELS[value]}
        onSelect={setTargetLevel}
        options={LEVEL_OPTIONS}
        selected={targetLevel}
      />
      <CareerChoiceRow
        label="Confidence"
        labelFor={(value) => CONFIDENCE_LABELS[value - 1]}
        onSelect={setConfidence}
        options={CONFIDENCE_OPTIONS}
        selected={confidence}
      />
      <CareerChoiceRow
        label="Importance to your current role"
        labelFor={(value) => IMPORTANCE_LABELS[value]}
        onSelect={setRoleImportance}
        options={IMPORTANCE_VALUES}
        selected={roleImportance}
      />
      <CareerChoiceRow
        label="Importance to your future direction"
        labelFor={(value) => IMPORTANCE_LABELS[value]}
        onSelect={setFutureImportance}
        options={IMPORTANCE_VALUES}
        selected={futureImportance}
      />
      <CareerActions>
        <CareerButton label="Save changes" onPress={save} />
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
    paragraph: {
      fontSize: 14,
      lineHeight: 20,
      color: t.colors.text,
    },
    item: {
      gap: 5,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.divider,
      marginVertical: 7,
    },
  });
