/**
 * Career goals: the direction layer.
 *
 * The form is intentionally plain. A goal needs a title; everything else helps
 * later but is optional. Success criteria are a field rather than an automatic
 * score, because only the user can say what "done" means.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  GOAL_STATUS_LABELS,
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  archivedCareerGoals,
  careerDomainById,
  goalProgress,
  openCareerGoals,
  type CareerDoc,
  type CareerGoal,
  type CareerGoalDraft,
  type GoalStatus,
  type GoalType,
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

export type CareerGoalsScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onCreate: (draft: CareerGoalDraft) => void;
  onOpenSettings?: () => void;
};

type FormState = {
  title: string;
  description: string;
  goalType: GoalType;
  customGoalType: string;
  priority: Priority;
  status: GoalStatus;
  targetDate: string;
  successCriteria: string;
  domainId: string;
  relatedSkillIds: string[];
};

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    goalType: 'skill',
    customGoalType: '',
    priority: 'medium',
    status: 'active',
    targetDate: '',
    successCriteria: '',
    domainId: '',
    relatedSkillIds: [],
  };
}

export function CareerGoalsScreen({
  doc,
  today,
  onBack,
  onOpenGoal,
  onCreate,
}: CareerGoalsScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<{ title?: string; targetDate?: string }>({});

  const open = openCareerGoals(doc);
  const achieved = doc.goals
    .filter((goal) => goal.status === 'achieved')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const archived = archivedCareerGoals(doc);
  const enabledDomains = doc.domains.filter((domain) => domain.isEnabled);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleSkill = (skillId: string) => {
    setForm((current) => ({
      ...current,
      relatedSkillIds: current.relatedSkillIds.includes(skillId)
        ? current.relatedSkillIds.filter((id) => id !== skillId)
        : [...current.relatedSkillIds, skillId],
    }));
  };

  const save = () => {
    const nextErrors: { title?: string; targetDate?: string } = {};
    if (form.title.trim().length === 0) nextErrors.title = 'A goal needs a title.';
    const targetDate = form.targetDate.trim();
    if (targetDate.length > 0 && !isValidDayKey(targetDate)) {
      nextErrors.targetDate = 'Use YYYY-MM-DD, or leave this blank.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onCreate({
      title: form.title.trim(),
      description: form.description.trim(),
      goalType: form.goalType,
      ...(form.goalType === 'custom' && form.customGoalType.trim()
        ? { customGoalType: form.customGoalType.trim() }
        : {}),
      priority: form.priority,
      status: form.status,
      ...(targetDate ? { targetDate } : {}),
      successCriteria: form.successCriteria.trim(),
      ...(form.domainId ? { domainId: form.domainId } : {}),
      relatedSkillIds: form.relatedSkillIds,
    });
    setForm(emptyForm());
    setFormOpen(false);
  };

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="Directions worth working towards"
      title="Goals"
    >
      <CareerCard>
        <CareerCardTitle>Goals are yours to define</CareerCardTitle>
        <CareerMuted>
          A goal can be a role change, a skill, a portfolio piece, a
          certification, a relationship or an impact you want to have. There is no
          fixed plan.
        </CareerMuted>
      </CareerCard>

      {open.length === 0 && achieved.length === 0 && archived.length === 0 ? (
        <CareerEmptyState
          actionLabel="Create your first goal"
          body="Start with one direction. You can add detail later, and you can change your mind."
          onAction={() => setFormOpen(true)}
          title="No career goals yet"
        />
      ) : null}

      {!formOpen ? (
        <CareerActions>
          <CareerButton label="Create a goal" onPress={() => setFormOpen(true)} />
        </CareerActions>
      ) : null}

      {formOpen ? (
        <CareerCard>
          <CareerCardTitle>New goal</CareerCardTitle>
          <CareerField
            error={errors.title}
            label="Title"
            onChangeText={(value) => {
              set('title', value);
              if (errors.title) setErrors((current) => ({ ...current, title: undefined }));
            }}
            placeholder="What do you want to make true?"
            value={form.title}
          />
          <CareerField
            label="Why it matters (optional)"
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
              label="Custom goal type (optional)"
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
            label="Development area (optional)"
            labelFor={(value) =>
              value ? careerDomainById(doc, value)?.name ?? 'Unknown area' : 'No area'
            }
            onSelect={(value) => set('domainId', value)}
            options={['', ...enabledDomains.map((domain) => domain.id)]}
            selected={form.domainId}
          />
          <CareerMultiChoiceRow
            emptyLabel="Add skills first to link them here."
            label="Related skills (optional)"
            labelFor={(value) => doc.skills.find((skill) => skill.id === value)?.name ?? value}
            onToggle={toggleSkill}
            options={doc.skills.map((skill) => skill.id)}
            selected={form.relatedSkillIds}
          />
          <CareerField
            error={errors.targetDate}
            label="Target date (optional)"
            onChangeText={(value) => {
              set('targetDate', value);
              if (errors.targetDate) {
                setErrors((current) => ({ ...current, targetDate: undefined }));
              }
            }}
            placeholder="YYYY-MM-DD"
            value={form.targetDate}
          />
          <CareerField
            label="Success criteria (optional)"
            multiline
            onChangeText={(value) => set('successCriteria', value)}
            placeholder="What evidence would tell you this is done? Do not invent numbers."
            value={form.successCriteria}
          />
          <CareerActions>
            <CareerButton label="Save goal" onPress={save} />
            <CareerButton
              label="Cancel"
              onPress={() => {
                setForm(emptyForm());
                setErrors({});
                setFormOpen(false);
              }}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      ) : null}

      {open.length > 0 ? (
        <>
          <CareerSectionLabel>Open</CareerSectionLabel>
          <CareerCard>
            {open.map((goal, index) => (
              <View key={goal.id} style={styles.item}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <GoalRow doc={doc} goal={goal} onOpen={() => onOpenGoal(goal.id)} today={today} />
              </View>
            ))}
          </CareerCard>
        </>
      ) : null}

      {achieved.length > 0 ? (
        <>
          <CareerSectionLabel>Achieved</CareerSectionLabel>
          <CareerCard>
            {achieved.map((goal, index) => (
              <View key={goal.id} style={styles.item}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <GoalRow doc={doc} goal={goal} onOpen={() => onOpenGoal(goal.id)} today={today} />
              </View>
            ))}
          </CareerCard>
        </>
      ) : null}

      {archived.length > 0 ? (
        <>
          <CareerSectionLabel>Archived</CareerSectionLabel>
          <CareerCard>
            <CareerMuted>
              Archived goals keep their history. Their milestones, evidence and
              achievements are still available.
            </CareerMuted>
            {archived.map((goal, index) => (
              <View key={goal.id} style={styles.item}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <GoalRow doc={doc} goal={goal} onOpen={() => onOpenGoal(goal.id)} today={today} />
              </View>
            ))}
          </CareerCard>
        </>
      ) : null}
    </CareerScreen>
  );
}

function GoalRow({
  doc,
  goal,
  today,
  onOpen,
}: {
  doc: CareerDoc;
  goal: CareerGoal;
  today: DayKey;
  onOpen: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const progress = goalProgress(doc, goal.id);
  const domain = careerDomainById(doc, goal.domainId);
  const overdue =
    goal.targetDate !== undefined &&
    goal.targetDate < today &&
    (goal.status === 'active' || goal.status === 'not-started');

  return (
    <View style={styles.goal}>
      <CareerLinkRow
        accessibilityLabel={`Open goal ${goal.title}`}
        detail={`${GOAL_TYPE_LABELS[goal.goalType]} · ${
          domain?.name ?? 'No area'
        }${goal.targetDate ? ` · due ${goal.targetDate}` : ''}`}
        label={goal.title}
        onPress={onOpen}
      />
      <View style={styles.tags}>
        <CareerTag label={PRIORITY_LABELS[goal.priority]} />
        <CareerTag label={GOAL_STATUS_LABELS[goal.status]} tone="muted" />
        {overdue ? <CareerTag label="Target passed" tone="danger" /> : null}
      </View>
      <CareerProgressBar
        label={
          progress.ratio === null
            ? 'No milestones yet'
            : `${progress.completed} of ${progress.total} milestones complete`
        }
        ratio={progress.ratio}
      />
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    item: {
      gap: 8,
    },
    goal: {
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
