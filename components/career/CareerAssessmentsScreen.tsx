/**
 * Assessments: records of performance against a goal or skill.
 *
 * The editor asks for what actually happened — type, score, date — and never
 * invents a result. Empty score, max score, proficiency and time are left
 * empty rather than filled with a plausible value.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  ASSESSMENT_DIFFICULTY_LABELS,
  ASSESSMENT_DIFFICULTIES,
  ASSESSMENT_TYPE_LABELS,
  ASSESSMENT_TYPES,
  careerGoalById,
  formatCareerDate,
  type CareerAssessment,
  type CareerAssessmentDraft,
  type CareerDoc,
  type SkillLevel,
  type AssessmentDifficulty,
  type AssessmentType,
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

export type CareerAssessmentsScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onSave: (draft: CareerAssessmentDraft, id?: string) => void;
  onDelete: (id: string) => void;
  /** When provided, opens the editor for this assessment on mount. */
  assessmentId?: string;
};

export function CareerAssessmentsScreen({
  doc,
  today,
  onBack,
  onOpenGoal,
  onSave,
  onDelete,
  assessmentId,
}: CareerAssessmentsScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CareerAssessment | null>(null);

  const assessments = [...doc.assessments].sort(
    (a, b) => b.assessedOn.localeCompare(a.assessedOn) || b.createdAt - a.createdAt,
  );

  useEffect(() => {
    if (assessmentId && !editing && !editorOpen) {
      const assessment = doc.assessments.find((entry) => entry.id === assessmentId);
      if (assessment) openEdit(assessment);
    }
  }, [assessmentId, doc.assessments, editing, editorOpen]);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (assessment: CareerAssessment) => {
    setEditing(assessment);
    setEditorOpen(true);
  };

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="Records of performance, not promises"
      title="Assessments"
    >
      <CareerCard>
        <CareerCardTitle>Record what you actually did</CareerCardTitle>
        <CareerMuted>
          An assessment captures the result of one exercise, review or
          demonstration. Leave score, proficiency and time blank when you do not
          have real measurements.
        </CareerMuted>
      </CareerCard>

      {assessments.length === 0 && !editorOpen ? (
        <CareerEmptyState
          actionLabel="Record an assessment"
          body="No assessments recorded yet. Add one when you complete a practical exercise, knowledge check or review."
          onAction={openNew}
          title="Nothing recorded yet"
        />
      ) : null}

      {!editorOpen ? (
        <CareerActions>
          <CareerButton label="Record an assessment" onPress={openNew} />
        </CareerActions>
      ) : null}

      {editorOpen ? (
        <AssessmentEditor
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

      {assessments.length > 0 ? (
        <>
          <CareerSectionLabel>Recorded</CareerSectionLabel>
          {assessments.map((assessment) => (
            <CareerCard key={assessment.id}>
              <View style={styles.tagRow}>
                <CareerTag label={ASSESSMENT_TYPE_LABELS[assessment.type]} />
                <CareerTag
                  label={formatCareerDate(assessment.assessedOn)}
                  tone="muted"
                />
              </View>
              <Text style={styles.title}>{assessment.title}</Text>
              {assessment.notes ? (
                <CareerMuted>Notes: {assessment.notes}</CareerMuted>
              ) : (
                <CareerMuted>No notes recorded.</CareerMuted>
              )}
              {assessment.score !== null || assessment.maxScore !== null ? (
                <CareerMuted>
                  Score:{' '}
                  {assessment.score !== null ? String(assessment.score) : '—'}{' / '}
                  {assessment.maxScore !== null ? String(assessment.maxScore) : '—'}
                </CareerMuted>
              ) : (
                <CareerMuted>No score recorded.</CareerMuted>
              )}
              {assessment.proficiencyLevel !== null ? (
                <CareerMuted>
                  Proficiency: {PROFICIENCY_LABELS[assessment.proficiencyLevel]}
                </CareerMuted>
              ) : (
                <CareerMuted>No proficiency recorded.</CareerMuted>
              )}
              {assessment.timeTakenMins !== null ? (
                <CareerMuted>
                  Time taken: {assessment.timeTakenMins} min
                </CareerMuted>
              ) : null}
              {assessment.difficulty ? (
                <CareerMuted>
                  Difficulty: {ASSESSMENT_DIFFICULTY_LABELS[assessment.difficulty]}
                </CareerMuted>
              ) : null}
              {assessment.skillIds.length > 0 ? (
                <CareerMuted>
                  Skills: {assessment.skillIds
                    .map((id) => doc.skills.find((skill) => skill.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </CareerMuted>
              ) : null}
              {assessment.goalId ? (
                <CareerLinkRow
                  accessibilityLabel="Open linked goal"
                  detail="Linked goal"
                  label={
                    careerGoalById(doc, assessment.goalId)?.title ??
                    'A goal that was deleted'
                  }
                  onPress={() => {
                    if (assessment.goalId) onOpenGoal(assessment.goalId);
                  }}
                />
              ) : null}
              <CareerActions>
                <CareerButton
                  label="Edit"
                  onPress={() => openEdit(assessment)}
                  variant="secondary"
                />
                <CareerButton
                  label="Delete"
                  onPress={() =>
                    Alert.alert(
                      `Delete ${assessment.title}?`,
                      'This permanently removes the assessment.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => onDelete(assessment.id),
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

const PROFICIENCY_LABELS: readonly string[] = [
  'Not started',
  'Beginner',
  'Developing',
  'Proficient',
  'Advanced',
  'Expert',
];

function AssessmentEditor({
  doc,
  initial,
  today,
  onSave,
  onCancel,
}: {
  doc: CareerDoc;
  initial: CareerAssessment | null;
  today: DayKey;
  onSave: (draft: CareerAssessmentDraft) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<AssessmentType>(initial?.type ?? 'self');
  const [assessedOn, setAssessedOn] = useState(initial?.assessedOn ?? today);
  const [goalId, setGoalId] = useState(initial?.goalId ?? '');
  const [skillIds, setSkillIds] = useState<string[]>(initial?.skillIds ?? []);
  const scoreValue = initial?.score;
  const [score, setScore] = useState(scoreValue == null ? '' : String(scoreValue));
  const maxScoreValue = initial?.maxScore;
  const [maxScore, setMaxScore] = useState(
    maxScoreValue == null ? '' : String(maxScoreValue),
  );
  const proficiencyValue = initial?.proficiencyLevel;
  const [proficiencyLevel, setProficiencyLevel] = useState(
    proficiencyValue == null ? '' : String(proficiencyValue),
  );
  const timeValue = initial?.timeTakenMins;
  const [timeTakenMins, setTimeTakenMins] = useState(
    timeValue == null ? '' : String(timeValue),
  );
  const [difficulty, setDifficulty] = useState<AssessmentDifficulty>(
    initial?.difficulty ?? 'medium',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (title.trim().length === 0) {
      setError('An assessment needs a title.');
      return;
    }
    if (!isValidDayKey(assessedOn.trim())) {
      setError('Use a real date in YYYY-MM-DD form.');
      return;
    }
    const parsedScore = score.trim().length > 0 ? Number(score) : null;
    if (parsedScore != null && (!Number.isFinite(parsedScore) || parsedScore < 0)) {
      setError('Score must be a non-negative number, or left blank.');
      return;
    }
    const parsedMax = maxScore.trim().length > 0 ? Number(maxScore) : null;
    if (parsedMax != null && (!Number.isFinite(parsedMax) || parsedMax <= 0)) {
      setError('Max score must be a positive number, or left blank.');
      return;
    }
    if (
      parsedScore !== null &&
      parsedMax !== null &&
      parsedScore > parsedMax
    ) {
      setError('Score cannot be greater than max score.');
      return;
    }
    const parsedProficiency =
      proficiencyLevel.trim().length > 0 ? Number(proficiencyLevel) : null;
    if (
      parsedProficiency != null &&
      (!Number.isFinite(parsedProficiency) ||
        parsedProficiency < 0 ||
        parsedProficiency > 5 ||
        !Number.isInteger(parsedProficiency))
    ) {
      setError('Proficiency must be 0-5, or left blank.');
      return;
    }
    const parsedTime =
      timeTakenMins.trim().length > 0 ? Number(timeTakenMins) : null;
    if (
      parsedTime != null && (!Number.isFinite(parsedTime) || parsedTime <= 0)
    ) {
      setError('Time taken must be a positive number, or left blank.');
      return;
    }
    onSave({
      title: title.trim(),
      type,
      assessedOn: assessedOn.trim(),
      ...(goalId ? { goalId } : {}),
      skillIds,
      score: parsedScore,
      maxScore: parsedMax,
      proficiencyLevel:
        parsedProficiency !== null
          ? (Math.round(parsedProficiency) as SkillLevel)
          : null,
      timeTakenMins: parsedTime !== null ? Math.round(parsedTime) : null,
      difficulty,
      notes: notes.trim(),
    });
  };

  return (
    <CareerCard>
      <CareerCardTitle>{initial ? 'Edit assessment' : 'New assessment'}</CareerCardTitle>
      <CareerField
        error={error}
        label="Title"
        onChangeText={(value) => {
          setTitle(value);
          if (error) setError(undefined);
        }}
        placeholder="What did you assess?"
        value={title}
      />
      <CareerChoiceRow
        label="Type"
        labelFor={(value) => ASSESSMENT_TYPE_LABELS[value]}
        onSelect={setType}
        options={ASSESSMENT_TYPES}
        selected={type}
      />
      <CareerChoiceRow
        label="Difficulty"
        labelFor={(value) => ASSESSMENT_DIFFICULTY_LABELS[value]}
        onSelect={setDifficulty}
        options={ASSESSMENT_DIFFICULTIES}
        selected={difficulty}
      />
      <CareerField
        label="Date assessed"
        onChangeText={(value) => {
          setAssessedOn(value);
          if (error) setError(undefined);
        }}
        placeholder="YYYY-MM-DD"
        value={assessedOn}
      />
      <CareerField
        keyboardType="decimal-pad"
        label="Score (optional)"
        onChangeText={(value) => {
          setScore(value);
          if (error) setError(undefined);
        }}
        placeholder="Your score"
        value={score}
      />
      <CareerField
        keyboardType="decimal-pad"
        label="Max score (optional)"
        onChangeText={(value) => {
          setMaxScore(value);
          if (error) setError(undefined);
        }}
        placeholder="Highest possible score"
        value={maxScore}
      />
      <CareerChoiceRow
        label="Proficiency level (optional)"
        labelFor={(value) => PROFICIENCY_LABELS[Number(value)]}
        onSelect={(value) => setProficiencyLevel(value)}
        options={['', '0', '1', '2', '3', '4', '5']}
        selected={proficiencyLevel}
      />
      <CareerField
        keyboardType="decimal-pad"
        label="Time taken, minutes (optional)"
        onChangeText={(value) => {
          setTimeTakenMins(value);
          if (error) setError(undefined);
        }}
        placeholder="How long it took"
        value={timeTakenMins}
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
        label="Skills assessed (optional)"
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
      <CareerField
        label="Notes (optional)"
        multiline
        onChangeText={setNotes}
        placeholder="Strengths, areas to improve, what you would do differently"
        value={notes}
      />
      <CareerMuted>
        Score, proficiency and time are only stored when you record them. They are
        never inferred from other records.
      </CareerMuted>
      <CareerActions>
        <CareerButton
          label={initial ? 'Save changes' : 'Save assessment'}
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
