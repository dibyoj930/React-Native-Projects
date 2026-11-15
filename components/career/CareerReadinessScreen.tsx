/**
 * Goal readiness: a transparent, evidence-based view of where a goal stands.
 *
 * No universal percentage is produced. Readiness is expressed through the
 * records that exist — assessments, evidence, milestones and skill gaps — so
 * the user can see what supports the goal and what is still missing.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ASSESSMENT_DIFFICULTY_LABELS,
  ASSESSMENT_TYPE_LABELS,
  EVIDENCE_TYPE_LABELS,
  GOAL_STATUS_LABELS,
  GOAL_TYPE_LABELS,
  MILESTONE_STATUS_LABELS,
  PROFICIENCY_LABELS,
  assessmentsForGoal,
  careerDomainById,
  evidenceForGoal,
  formatCareerDate,
  goalProgress,
  lastPractisedOn,
  relatedSkillsForGoal,
  milestonesForGoal,
  skillGap,
  type CareerDoc,
} from '../../career';
import type { DayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerActions,
  CareerButton,
  CareerCard,
  CareerCardTitle,
  CareerEmptyState,
  CareerLinkRow,
  CareerMuted,
  CareerProgressBar,
  CareerScreen,
  CareerSectionLabel,
  CareerTag,
} from './CareerUI';

export type CareerReadinessScreenProps = {
  doc: CareerDoc;
  goalId: string;
  today: DayKey;
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenSkill: (skillId: string) => void;
};

export function CareerReadinessScreen({
  doc,
  goalId,
  today,
  onBack,
  onOpenGoal,
  onOpenSkill,
}: CareerReadinessScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const goal = doc.goals.find((entry) => entry.id === goalId);

  if (!goal) {
    return (
      <CareerScreen backLabel="Back to goals" onBack={onBack} title="Goal not found">
        <CareerEmptyState
          body="This goal may have been deleted."
          title="That goal is no longer here"
        />
      </CareerScreen>
    );
  }

  const assessments = assessmentsForGoal(doc, goalId);
  const evidence = evidenceForGoal(doc, goalId);
  const milestones = milestonesForGoal(doc, goalId).filter(
    (m) => m.status !== 'archived',
  );
  const progress = goalProgress(doc, goalId);
  const skills = relatedSkillsForGoal(doc, goal);
  const domain = careerDomainById(doc, goal.domainId);
  const latestAssessment = assessments[0];
  const overdueMilestones = milestones.filter(
    (m) =>
      m.targetDate !== undefined &&
      m.targetDate < today &&
      (m.status === 'not-started' ||
        m.status === 'in-progress' ||
        m.status === 'blocked'),
  );

  return (
    <CareerScreen
      backLabel="Back to goals"
      onBack={onBack}
      subtitle={GOAL_TYPE_LABELS[goal.goalType]}
      title={goal.title}
    >
      <CareerCard>
        <View style={styles.tagRow}>
          <CareerTag label={GOAL_TYPE_LABELS[goal.goalType]} />
          <CareerTag
            label={GOAL_STATUS_LABELS[goal.status]}
            tone={goal.status === 'achieved' ? 'primary' : 'muted'}
          />
        </View>
        {domain ? (
          <CareerMuted>{domain.name}</CareerMuted>
        ) : null}
        {goal.targetDate ? (
          <CareerMuted>
            Target {formatCareerDate(goal.targetDate)}
          </CareerMuted>
        ) : null}
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
          {goal.successCriteria || 'Not defined yet.'}
        </CareerMuted>
      </CareerCard>

      <CareerSectionLabel>Assessments</CareerSectionLabel>
      {assessments.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No assessments recorded for this goal. Record a practical exercise,
            knowledge check or review to surface readiness evidence.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {assessments.map((assessment) => (
            <View key={assessment.id} style={styles.item}>
              <Text style={styles.itemTitle}>{assessment.title}</Text>
              <CareerMuted>
                {ASSESSMENT_TYPE_LABELS[assessment.type]} ·{' '}
                {formatCareerDate(assessment.assessedOn)}{' '}
                {assessment.difficulty ? `· ${ASSESSMENT_DIFFICULTY_LABELS[assessment.difficulty]}` : ''}
              </CareerMuted>
              {assessment.score !== null || assessment.maxScore !== null ? (
                <CareerMuted>
                  Score:{' '}
                  {assessment.score !== null ? String(assessment.score) : '—'}{' / '}
                  {assessment.maxScore !== null ? String(assessment.maxScore) : '—'}
                </CareerMuted>
              ) : null}
              {assessment.proficiencyLevel !== null ? (
                <CareerMuted>
                  Proficiency: {PROFICIENCY_LABELS[assessment.proficiencyLevel]}
                </CareerMuted>
              ) : null}
              {assessment.notes ? (
                <Text style={styles.paragraph}>{assessment.notes}</Text>
              ) : null}
            </View>
          ))}
          {latestAssessment ? (
            <View style={styles.latest}>
              <CareerMuted>
                Latest:{' '}
                {formatCareerDate(latestAssessment.assessedOn)} ·
                {assessments.length} assessment{assessments.length === 1 ? '' : 's'}
                recorded
              </CareerMuted>
            </View>
          ) : null}
        </CareerCard>
      )}

      <CareerSectionLabel>Milestones</CareerSectionLabel>
      {milestones.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No milestones defined. Break the goal into checkpoints so progress is
            visible.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {milestones.map((milestone) => (
            <View key={milestone.id} style={styles.item}>
              <Text style={styles.itemTitle}>{milestone.title}</Text>
              <View style={styles.tagRow}>
                <CareerTag
                  label={MILESTONE_STATUS_LABELS[milestone.status]}
                  tone={milestone.status === 'completed' ? 'primary' : 'muted'}
                />
                {milestone.targetDate ? (
                  <CareerTag
                    label={formatCareerDate(milestone.targetDate)}
                    tone="muted"
                  />
                ) : null}
              </View>
              {milestone.description ? (
                <Text style={styles.paragraph}>{milestone.description}</Text>
              ) : null}
            </View>
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Skills and gaps</CareerSectionLabel>
      {skills.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No skills linked to this goal. Link a skill from the goal editor to
            track the capability gap.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {skills.map((skill) => {
            const gap = skillGap(skill);
            const practisedOn = lastPractisedOn(doc, skill.id);
            return (
              <View key={skill.id} style={styles.item}>
                <CareerLinkRow
                  accessibilityLabel={`Open skill ${skill.name}`}
                  label={skill.name}
                  onPress={() => onOpenSkill(skill.id)}
                />
                <View style={styles.tagRow}>
                  <CareerTag
                    label={`Current: ${PROFICIENCY_LABELS[skill.currentLevel]}`}
                    tone="muted"
                  />
                  <CareerTag
                    label={`Target: ${PROFICIENCY_LABELS[skill.targetLevel]}`}
                    tone={gap > 0 ? 'primary' : 'muted'}
                  />
                </View>
                {gap > 0 ? (
                  <CareerMuted>
                    {gap}-level gap to target · last practised{' '}
                    {practisedOn ? formatCareerDate(practisedOn) : 'never'}
                  </CareerMuted>
                ) : (
                  <CareerMuted>Target level met.</CareerMuted>
                )}
              </View>
            );
          })}
        </CareerCard>
      )}

      <CareerSectionLabel>Evidence</CareerSectionLabel>
      {evidence.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No evidence recorded for this goal. Evidence is a concrete example
            of work you did — a project, a task, learning, feedback or a result.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {evidence.map((entry) => (
            <View key={entry.id} style={styles.item}>
              <Text style={styles.itemTitle}>{entry.title}</Text>
              <CareerMuted>
                {EVIDENCE_TYPE_LABELS[entry.type]} · {formatCareerDate(entry.occurredOn)}
              </CareerMuted>
            </View>
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Readiness</CareerSectionLabel>
      <CareerCard>
        <CareerMuted>
          Readiness is shown through the records above, not a universal score. A
          goal is ready when its milestones are complete, its skills show the
          target proficiency, and its assessments and evidence support the
          outcome.
        </CareerMuted>
        <CareerActions>
          <CareerButton label="Open goal" onPress={() => onOpenGoal(goal.id)} variant="secondary" />
        </CareerActions>
      </CareerCard>

      {overdueMilestones.length > 0 ? (
        <CareerCard style={styles.overdueCard}>
          <CareerSectionLabel>Needs a decision</CareerSectionLabel>
          {overdueMilestones.map((milestone) => (
            <View key={milestone.id} style={styles.item}>
              <Text style={styles.itemTitle}>{milestone.title}</Text>
              <CareerMuted>
                Was due {formatCareerDate(milestone.targetDate)} — move it, split
                it, or mark it blocked.
              </CareerMuted>
            </View>
          ))}
        </CareerCard>
      ) : null}
    </CareerScreen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    item: {
      gap: 6,
      marginBottom: 6,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
    },
    paragraph: {
      fontSize: 14,
      lineHeight: 20,
      color: t.colors.text,
    },
    latest: {
      fontSize: 12,
      color: t.colors.textMuted,
      marginTop: 8,
    },
    overdueCard: {
      borderLeftWidth: 4,
      borderLeftColor: t.colors.danger,
    },
  });
