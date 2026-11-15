/**
 * A single career goal and the work attached to it.
 *
 * The detail screen is where the cycle becomes concrete: milestones are the
 * plan, evidence is what happened, achievements are the supported claims, and
 * the timeline is derived from those records rather than stored a second time.
 *
 * Deleting a goal is deliberately hard to do by accident. Archiving is the
 * normal exit; a hard delete removes the goal's milestones but preserves its
 * evidence and achievements with a title snapshot.
 */

import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  ACHIEVEMENT_CATEGORY_LABELS,
  EVIDENCE_TYPES,
  EVIDENCE_TYPE_LABELS,
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  MILESTONE_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  achievementsForGoal,
  careerDomainById,
  evidenceForGoal,
  formatCareerDate,
  goalProgress,
  goalTimeline,
  milestonesForGoal,
  relatedSkillsForGoal,
  type CareerDoc,
  type CareerEvidenceDraft,
  type CareerGoal,
  type CareerGoalDraft,
  type CareerDevelopment,
  type CareerMilestone,
  type CareerMilestoneDraft,
  type CareerSkill,
  type EvidenceType,
  type GoalStatus,
  type GoalType,
  type MilestoneStatus,
  type Priority,
} from '../../career';
import { isValidDayKey } from '../../shared/date';
import type { DayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerActions,
  CareerButton,
  CareerCard,
  CareerCardTitle,
  CareerChoiceRow,
  CareerDivider,
  CareerEmptyState,
  CareerField,
  CareerLinkRow,
  CareerMultiChoiceRow,
  CareerMuted,
  CareerProgressBar,
  CareerScreen,
  CareerSectionLabel,
  CareerTag,
} from './CareerUI';
import { CareerPracticeCard } from './CareerPracticeCard';

export type CareerGoalDetailScreenProps = {
  doc: CareerDoc;
  goalId: string;
  today: DayKey;
  /** Derived task/focus practice, when the cross-domain controller is mounted. */
  development?: CareerDevelopment;
  onBack: () => void;
  onOpenSkill: (skillId: string) => void;
  onOpenAchievements: () => void;
  onSave: (draft: CareerGoalDraft, id: string) => void;
  onSetStatus: (id: string, status: GoalStatus) => void;
  onDelete: (id: string, mode: 'archive' | 'delete') => void;
  onSaveMilestone: (goalId: string, draft: CareerMilestoneDraft, id?: string) => void;
  onSetMilestoneStatus: (id: string, status: MilestoneStatus) => void;
  onDeleteMilestone: (id: string) => void;
  onSaveEvidence: (draft: CareerEvidenceDraft) => void;
  onDeleteEvidence: (id: string) => void;
};

type GoalForm = {
  title: string;
  description: string;
  goalType: GoalType;
  customGoalType: string;
  priority: Priority;
  targetDate: string;
  successCriteria: string;
  domainId: string;
  relatedSkillIds: string[];
};

function goalForm(goal: CareerGoal): GoalForm {
  return {
    title: goal.title,
    description: goal.description,
    goalType: goal.goalType,
    customGoalType: goal.customGoalType ?? '',
    priority: goal.priority,
    targetDate: goal.targetDate ?? '',
    successCriteria: goal.successCriteria,
    domainId: goal.domainId ?? '',
    relatedSkillIds: [...goal.relatedSkillIds],
  };
}

export function CareerGoalDetailScreen({
  doc,
  goalId,
  today,
  development,
  onBack,
  onOpenSkill,
  onOpenAchievements,
  onSave,
  onSetStatus,
  onDelete,
  onSaveMilestone,
  onSetMilestoneStatus,
  onDeleteMilestone,
  onSaveEvidence,
  onDeleteEvidence,
}: CareerGoalDetailScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const goal = doc.goals.find((entry) => entry.id === goalId);
  const [editing, setEditing] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState(false);

  if (!goal) {
    return (
      <CareerScreen backLabel="Back to goals" onBack={onBack} title="Goal not found">
        <CareerEmptyState
          body="This goal may have been deleted. Its evidence and achievements, if any, are still kept in the career record."
          title="That goal is no longer here"
        />
      </CareerScreen>
    );
  }

  const progress = goalProgress(doc, goal.id);
  const domain = careerDomainById(doc, goal.domainId);
  const skills = relatedSkillsForGoal(doc, goal);
  const milestones = milestonesForGoal(doc, goal.id);
  const evidence = evidenceForGoal(doc, goal.id);
  const achievements = achievementsForGoal(doc, goal.id);
  const timeline = goalTimeline(doc, goal.id);
  const practice = development?.practiceForGoal(goal.id);
  const linkedTasks = development?.tasksForGoal(goal.id) ?? [];

  const confirmDelete = () => {
    Alert.alert(
      'Delete this goal?',
      'Its milestones will be removed. Evidence, achievements and assessments stay in your career record and are only unlinked from this goal.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete goal',
          style: 'destructive',
          onPress: () => {
            onDelete(goal.id, 'delete');
            onBack();
          },
        },
      ],
    );
  };

  return (
    <CareerScreen
      backLabel="Back to goals"
      onBack={onBack}
      subtitle={GOAL_STATUS_LABELS[goal.status]}
      title={goal.title}
    >
      <CareerCard>
        <View style={styles.tagRow}>
          <CareerTag label={GOAL_TYPE_LABELS[goal.goalType]} />
          <CareerTag label={PRIORITY_LABELS[goal.priority]} />
          <CareerTag
            label={GOAL_STATUS_LABELS[goal.status]}
            tone={goal.status === 'achieved' ? 'primary' : 'muted'}
          />
        </View>
        <CareerMuted>
          {domain?.name ?? 'No development area'}
          {goal.targetDate ? ` · target ${formatCareerDate(goal.targetDate)}` : ''}
        </CareerMuted>
        {goal.description ? <Text style={styles.paragraph}>{goal.description}</Text> : null}
        <CareerProgressBar
          label={
            progress.ratio === null
              ? 'No milestones yet'
              : `${progress.completed} of ${progress.total} milestones complete`
          }
          ratio={progress.ratio}
        />
        <CareerCardTitle>Success criteria</CareerCardTitle>
        <CareerMuted>
          {goal.successCriteria || 'Not defined yet. Only you can say what done looks like.'}
        </CareerMuted>
        <CareerActions>
          <CareerButton
            label={editing ? 'Close editor' : 'Edit goal'}
            onPress={() => setEditing((value) => !value)}
            variant="secondary"
          />
          <CareerButton
            label="Archive"
            onPress={() => {
              onDelete(goal.id, 'archive');
              onBack();
            }}
            variant="secondary"
          />
          <CareerButton label="Delete" onPress={confirmDelete} variant="danger" />
        </CareerActions>
      </CareerCard>

      <CareerSectionLabel>Status</CareerSectionLabel>
      <CareerCard>
        <CareerChoiceRow
          label="Goal status"
          labelFor={(value) => GOAL_STATUS_LABELS[value]}
          onSelect={(value) => onSetStatus(goal.id, value)}
          options={GOAL_STATUSES}
          selected={goal.status}
        />
        <CareerMuted>
          Archived goals keep every milestone, evidence item and achievement.
          Changing status never deletes history.
        </CareerMuted>
      </CareerCard>

      {editing ? (
        <GoalEditor
          doc={doc}
          form={goalForm(goal)}
          status={goal.status}
          onCancel={() => setEditing(false)}
          onSave={(draft) => {
            onSave(draft, goal.id);
            setEditing(false);
          }}
        />
      ) : null}

      <CareerSectionLabel>Related skills</CareerSectionLabel>
      {skills.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No skills are linked to this goal. Link one while editing the goal, or
            add a skill first.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {skills.map((skill) => (
            <CareerLinkRow
              key={skill.id}
              accessibilityLabel={`Open skill ${skill.name}`}
              detail={`Current ${skill.currentLevel} · target ${skill.targetLevel}`}
              label={skill.name}
              onPress={() => onOpenSkill(skill.id)}
            />
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Milestones</CareerSectionLabel>
      {milestones.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No milestones yet. A milestone is a checkpoint, not a promise; add one
            only when it helps you decide what to do next.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {milestones.map((milestone, index) => (
            <View key={milestone.id} style={styles.item}>
              {index > 0 ? <CareerDivider /> : null}
              <MilestoneRow
                milestone={milestone}
                onDelete={() =>
                  Alert.alert(
                    `Delete ${milestone.title}?`,
                    'The milestone is removed. Evidence linked to it stays and is only unlinked.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => onDeleteMilestone(milestone.id),
                      },
                    ],
                  )
                }
                onSetStatus={(status) => onSetMilestoneStatus(milestone.id, status)}
              />
            </View>
          ))}
        </CareerCard>
      )}
      {addingMilestone ? (
        <MilestoneEditor
          today={today}
          onCancel={() => setAddingMilestone(false)}
          onSave={(draft) => {
            onSaveMilestone(goal.id, draft);
            setAddingMilestone(false);
          }}
        />
      ) : (
        <CareerActions>
          <CareerButton
            label="Add milestone"
            onPress={() => setAddingMilestone(true)}
            variant="secondary"
          />
        </CareerActions>
      )}

      {development && practice ? (
        <>
          <CareerSectionLabel>Linked tasks and focus</CareerSectionLabel>
          <CareerPracticeCard
            emptyBody="No tasks are linked to this goal yet. Link one from the task sheet to connect daily work to this direction."
            practice={practice}
            tasks={linkedTasks}
          />
        </>
      ) : null}

      <CareerSectionLabel>Evidence</CareerSectionLabel>
      {evidence.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No evidence recorded for this goal. Evidence is a concrete example of
            work you did — a project, a task, a piece of learning, feedback or an
            observed result.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {evidence.map((entry, index) => (
            <View key={entry.id} style={styles.item}>
              {index > 0 ? <CareerDivider /> : null}
              <Text style={styles.itemTitle}>{entry.title}</Text>
              <CareerMuted>
                {EVIDENCE_TYPE_LABELS[entry.type]} · {formatCareerDate(entry.occurredOn)}
                {entry.score !== undefined ? ` · score ${entry.score}` : ''}
              </CareerMuted>
              {entry.description ? (
                <Text style={styles.paragraph}>{entry.description}</Text>
              ) : null}
              <CareerActions>
                <CareerButton
                  label="Delete evidence"
                  onPress={() =>
                    Alert.alert(
                      `Delete ${entry.title}?`,
                      'The evidence is removed from the current record. This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => onDeleteEvidence(entry.id),
                        },
                      ],
                    )
                  }
                  variant="danger"
                />
              </CareerActions>
            </View>
          ))}
        </CareerCard>
      )}

      {addingEvidence ? (
        <EvidenceEditor
          skills={doc.skills}
          today={today}
          onCancel={() => setAddingEvidence(false)}
          onSave={(draft) => {
            onSaveEvidence({ ...draft, goalId: goal.id });
            setAddingEvidence(false);
          }}
        />
      ) : (
        <CareerActions>
          <CareerButton
            label="Add evidence"
            onPress={() => setAddingEvidence(true)}
            variant="secondary"
          />
        </CareerActions>
      )}

      <CareerSectionLabel>Related achievements</CareerSectionLabel>
      {achievements.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No achievements are linked to this goal yet. Achievements should be
            supported by evidence; never record an outcome you cannot stand behind.
          </CareerMuted>
          <CareerActions>
            <CareerButton
              label="Open achievements"
              onPress={onOpenAchievements}
              variant="secondary"
            />
          </CareerActions>
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
              {achievement.impact ? (
                <Text style={styles.paragraph}>{achievement.impact}</Text>
              ) : null}
            </View>
          ))}
          <CareerActions>
            <CareerButton
              label="Open achievements"
              onPress={onOpenAchievements}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      )}

      <CareerSectionLabel>Timeline</CareerSectionLabel>
      <CareerCard>
        {timeline.length === 0 ? (
          <CareerMuted>Nothing recorded yet.</CareerMuted>
        ) : (
          timeline.map((event, index) => (
            <View key={event.id} style={styles.item}>
              {index > 0 ? <CareerDivider /> : null}
              <Text style={styles.itemTitle}>{event.title}</Text>
              <CareerMuted>
                {formatCareerDate(event.date)}
                {event.detail ? ` · ${event.detail}` : ''}
              </CareerMuted>
            </View>
          ))
        )}
      </CareerCard>
    </CareerScreen>
  );
}

function GoalEditor({
  doc,
  form: initial,
  status,
  onSave,
  onCancel,
}: {
  doc: CareerDoc;
  form: GoalForm;
  status: GoalStatus;
  onSave: (draft: CareerGoalDraft) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const goal = initial;
  const [form, setForm] = useState<GoalForm>(goal);
  const [errors, setErrors] = useState<{ title?: string; targetDate?: string }>({});

  const set = <K extends keyof GoalForm>(key: K, value: GoalForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    const next: { title?: string; targetDate?: string } = {};
    if (form.title.trim().length === 0) next.title = 'A goal needs a title.';
    if (form.targetDate.trim() && !isValidDayKey(form.targetDate.trim())) {
      next.targetDate = 'Use YYYY-MM-DD, or leave this blank.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      goalType: form.goalType,
      ...(form.goalType === 'custom' && form.customGoalType.trim()
        ? { customGoalType: form.customGoalType.trim() }
        : {}),
      priority: form.priority,
      status,
      ...(form.targetDate.trim() ? { targetDate: form.targetDate.trim() } : {}),
      successCriteria: form.successCriteria.trim(),
      ...(form.domainId ? { domainId: form.domainId } : {}),
      relatedSkillIds: form.relatedSkillIds,
    });
  };

  return (
    <CareerCard>
      <CareerCardTitle>Edit goal</CareerCardTitle>
      <CareerField
        error={errors.title}
        label="Title"
        onChangeText={(value) => set('title', value)}
        value={form.title}
      />
      <CareerField
        label="Why it matters"
        multiline
        onChangeText={(value) => set('description', value)}
        value={form.description}
      />
      <CareerChoiceRow
        label="Goal type"
        labelFor={(value) => GOAL_TYPE_LABELS[value]}
        onSelect={(value) => set('goalType', value)}
        options={GOAL_TYPES}
        selected={form.goalType}
      />
      {form.goalType === 'custom' ? (
        <CareerField
          label="Custom goal type"
          onChangeText={(value) => set('customGoalType', value)}
          value={form.customGoalType}
        />
      ) : null}
      <CareerChoiceRow
        label="Priority"
        labelFor={(value) => PRIORITY_LABELS[value]}
        onSelect={(value) => set('priority', value)}
        options={PRIORITIES}
        selected={form.priority}
      />
      <CareerChoiceRow
        label="Development area"
        labelFor={(value) =>
          value ? careerDomainById(doc, value)?.name ?? 'Unknown area' : 'No area'
        }
        onSelect={(value) => set('domainId', value)}
        options={['', ...doc.domains.filter((entry) => entry.isEnabled).map((entry) => entry.id)]}
        selected={form.domainId}
      />
      <CareerMultiChoiceRow
        emptyLabel="Add skills first to link them here."
        label="Related skills"
        labelFor={(value) => doc.skills.find((skill) => skill.id === value)?.name ?? value}
        onToggle={(value) =>
          setForm((current) => ({
            ...current,
            relatedSkillIds: current.relatedSkillIds.includes(value)
              ? current.relatedSkillIds.filter((id) => id !== value)
              : [...current.relatedSkillIds, value],
          }))
        }
        options={doc.skills.map((skill) => skill.id)}
        selected={form.relatedSkillIds}
      />
      <CareerField
        error={errors.targetDate}
        label="Target date"
        onChangeText={(value) => set('targetDate', value)}
        placeholder="YYYY-MM-DD"
        value={form.targetDate}
      />
      <CareerField
        label="Success criteria"
        multiline
        onChangeText={(value) => set('successCriteria', value)}
        value={form.successCriteria}
      />
      <CareerActions>
        <CareerButton label="Save changes" onPress={save} />
        <CareerButton label="Cancel" onPress={onCancel} variant="secondary" />
      </CareerActions>
      <View style={styles.goalEditorNote}>
        <CareerMuted>
          Status is changed from the status row above, so this editor cannot
          accidentally reopen an archived goal.
        </CareerMuted>
      </View>
    </CareerCard>
  );
}

function MilestoneRow({
  milestone,
  onSetStatus,
  onDelete,
}: {
  milestone: CareerMilestone;
  onSetStatus: (status: MilestoneStatus) => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{milestone.title}</Text>
      <View style={styles.tagRow}>
        <CareerTag
          label={MILESTONE_STATUS_LABELS[milestone.status]}
          tone={milestone.status === 'completed' ? 'primary' : 'muted'}
        />
        {milestone.targetDate ? (
          <CareerTag label={formatCareerDate(milestone.targetDate)} tone="muted" />
        ) : null}
      </View>
      {milestone.description ? (
        <Text style={styles.paragraph}>{milestone.description}</Text>
      ) : null}
      <CareerActions>
        {milestone.status !== 'in-progress' && milestone.status !== 'completed' ? (
          <CareerButton
            label="Start"
            onPress={() => onSetStatus('in-progress')}
            variant="secondary"
          />
        ) : null}
        {milestone.status !== 'completed' ? (
          <CareerButton label="Complete" onPress={() => onSetStatus('completed')} />
        ) : (
          <CareerButton
            label="Reopen"
            onPress={() => onSetStatus('in-progress')}
            variant="secondary"
          />
        )}
        {milestone.status !== 'blocked' ? (
          <CareerButton
            label="Blocked"
            onPress={() => onSetStatus('blocked')}
            variant="secondary"
          />
        ) : null}
        <CareerButton label="Delete" onPress={onDelete} variant="danger" />
      </CareerActions>
    </View>
  );
}

function MilestoneEditor({
  today,
  onSave,
  onCancel,
}: {
  today: DayKey;
  onSave: (draft: CareerMilestoneDraft) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (title.trim().length === 0) {
      setError('A milestone needs a title.');
      return;
    }
    if (targetDate.trim() && !isValidDayKey(targetDate.trim())) {
      setError('Use YYYY-MM-DD, or leave the date blank.');
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim(),
      ...(targetDate.trim() ? { targetDate: targetDate.trim() } : {}),
      status: 'not-started',
      relatedSkillIds: [],
    });
    setTitle('');
    setDescription('');
    setTargetDate('');
    setError(undefined);
  };

  return (
    <CareerCard>
      <CareerCardTitle>New milestone</CareerCardTitle>
      <CareerField
        error={error}
        label="Title"
        onChangeText={(value) => {
          setTitle(value);
          if (error) setError(undefined);
        }}
        placeholder="A checkpoint you can recognise"
        value={title}
      />
      <CareerField
        label="Description (optional)"
        multiline
        onChangeText={setDescription}
        value={description}
      />
      <CareerField
        label="Target date (optional)"
        onChangeText={setTargetDate}
        placeholder="YYYY-MM-DD"
        value={targetDate}
      />
      <CareerMuted>Today is {formatCareerDate(today)}.</CareerMuted>
      <CareerActions>
        <CareerButton label="Save milestone" onPress={save} />
        <CareerButton label="Cancel" onPress={onCancel} variant="secondary" />
      </CareerActions>
    </CareerCard>
  );
}

function EvidenceEditor({
  skills,
  today,
  onSave,
  onCancel,
}: {
  skills: readonly CareerSkill[];
  today: DayKey;
  onSave: (draft: Omit<CareerEvidenceDraft, 'goalId'>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EvidenceType>('practice');
  const [occurredOn, setOccurredOn] = useState(today);
  const [score, setScore] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (title.trim().length === 0) {
      setError('Evidence needs a title.');
      return;
    }
    if (!isValidDayKey(occurredOn.trim())) {
      setError('Use a real date in YYYY-MM-DD format.');
      return;
    }
    const rawScore = score.trim();
    if (rawScore.length > 0) {
      const parsed = Number(rawScore);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Score must be a non-negative number, or left blank.');
        return;
      }
    }
    onSave({
      title: title.trim(),
      description: description.trim(),
      type,
      occurredOn: occurredOn.trim(),
      ...(rawScore.length > 0 ? { score: Number(rawScore) } : {}),
      skillIds,
    });
    setTitle('');
    setDescription('');
    setType('practice');
    setOccurredOn(today);
    setScore('');
    setSkillIds([]);
    setError(undefined);
  };

  return (
    <CareerCard>
      <CareerCardTitle>New evidence</CareerCardTitle>
      <CareerField
        error={error}
        label="Title"
        onChangeText={(value) => {
          setTitle(value);
          if (error) setError(undefined);
        }}
        placeholder="What did you do?"
        value={title}
      />
      <CareerField
        label="Description"
        multiline
        onChangeText={setDescription}
        placeholder="What happened, what changed, and who saw or used it?"
        value={description}
      />
      <CareerChoiceRow
        label="Type"
        labelFor={(value) => EVIDENCE_TYPE_LABELS[value]}
        onSelect={(value) => setType(value)}
        options={EVIDENCE_TYPES}
        selected={type}
      />
      <CareerField
        label="Date"
        onChangeText={(value) => {
          setOccurredOn(value);
          if (error) setError(undefined);
        }}
        placeholder="YYYY-MM-DD"
        value={occurredOn}
      />
      <CareerField
        keyboardType="decimal-pad"
        label="Score (optional)"
        onChangeText={(value) => {
          setScore(value);
          if (error) setError(undefined);
        }}
        placeholder="Use whatever scale you actually used"
        value={score}
      />
      <CareerMuted>
        A score is only shown if you record one. It is never inferred from other
        records or turned into a readiness percentage.
      </CareerMuted>
      <CareerMultiChoiceRow
        emptyLabel="Add skills first to link them here."
        label="Skills demonstrated (optional)"
        labelFor={(value) => skills.find((skill) => skill.id === value)?.name ?? value}
        onToggle={(value) =>
          setSkillIds((current) =>
            current.includes(value)
              ? current.filter((id) => id !== value)
              : [...current, value],
          )
        }
        options={skills.map((skill) => skill.id)}
        selected={skillIds}
      />
      <CareerActions>
        <CareerButton label="Save evidence" onPress={save} />
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
      gap: 6,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
    },
    goalEditorNote: {
      paddingTop: 4,
    },
  });
