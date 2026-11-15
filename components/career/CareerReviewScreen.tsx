/**
 * Weekly and monthly career review screen.
 *
 * One screen, parameterised by period. It renders only derived facts —
 * activity that actually happened in the window, capability gaps with no
 * recent practice, and planned-versus-actual execution. Nothing is generated
 * or inferred beyond what the records support.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  GOAL_STATUS_LABELS,
  buildCareerReview,
  formatCareerDate,
  lastPractisedOn,
  type CareerDoc,
  type ReviewPeriod,
} from '../../career';
import type { DayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerCard,
  CareerEmptyState,
  CareerLinkRow,
  CareerMuted,
  CareerProgressBar,
  CareerScreen,
  CareerSectionLabel,
  CareerStat,
  CareerStatGrid,
  CareerTag,
} from './CareerUI';

export type CareerReviewScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  period: ReviewPeriod;
  tasks: readonly import('../../todos/model').Todo[];
  sessions: readonly import('../../productivity/types').FocusSession[];
  outcomes: readonly (import('../../replan/types').PlanOutcome | undefined)[];
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenSkill: (skillId: string) => void;
};

export function CareerReviewScreen({
  doc,
  today,
  period,
  tasks,
  sessions,
  outcomes,
  onBack,
  onOpenGoal,
  onOpenSkill,
}: CareerReviewScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  const review = useMemo(
    () =>
      buildCareerReview({
        doc,
        tasks,
        sessions,
        outcomes,
        period,
        today,
      }),
    [doc, tasks, sessions, outcomes, period, today],
  );

  const periodLabel = period === 'week' ? 'Weekly review' : 'Monthly review';
  const windowLabel = `${formatCareerDate(review.periodStart)} – ${formatCareerDate(review.periodEnd)}`;

  const empty =
    review.goalsProgressed.length === 0 &&
    review.skillsPractised.length === 0 &&
    review.milestonesCompleted.length === 0 &&
    review.achievements.length === 0 &&
    review.assessments.length === 0 &&
    review.planned === 0 &&
    review.completed === 0 &&
    review.postponed === 0 &&
    review.missed === 0;

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle={windowLabel}
      title={periodLabel}
    >
      <CareerStatGrid>
        <CareerStat label="Planned activities" value={String(review.planned)} />
        <CareerStat label="Completed activities" value={String(review.completed)} />
        <CareerStat label="Planned focus (min)" value={String(review.plannedFocusMins)} />
        <CareerStat label="Actual focus (min)" value={String(review.actualFocusMins)} />
      </CareerStatGrid>

      {empty ? (
        <CareerEmptyState
          body={`No career activity was recorded between ${windowLabel}. Record an assessment, a milestone, evidence or an achievement — or run a focus session linked to career work — and it will appear here.`}
          title={`Nothing in the ${periodLabel.toLowerCase()}`}
        />
      ) : null}

      {!empty && (
        <>
          <CareerSectionLabel>Planned versus actual</CareerSectionLabel>
          <CareerCard>
            <View style={styles.tagRow}>
              <CareerTag label={String(review.planned)} tone="muted" />
              <CareerTag label={String(review.completed)} tone="muted" />
              {review.postponed > 0 ? (
                <CareerTag label={`postponed ${review.postponed}`} tone="muted" />
              ) : null}
              {review.missed > 0 ? (
                <CareerTag label={`missed ${review.missed}`} tone="danger" />
              ) : null}
            </View>
            <CareerMuted>
              {review.completed === 0 && review.planned === 0
                ? 'No career activities were planned in this window.'
                : `${review.completed} of ${review.planned} planned career activities completed.`}
            </CareerMuted>
            <CareerMuted>
              {review.plannedFocusMins === 0 && review.actualFocusMins === 0
                ? 'No focused development time recorded.'
                : `Planned ${review.plannedFocusMins} min · actual ${review.actualFocusMins} min of focused development time.`}
            </CareerMuted>
            {review.postponedGoalIds.length > 0 ? (
              <CareerSectionLabel>Goals with postponed activity</CareerSectionLabel>
            ) : null}
            {review.postponedGoalIds.map((goalId) => {
              const goal = doc.goals.find((entry) => entry.id === goalId);
              if (!goal) return null;
              return (
                <CareerLinkRow
                  key={goal.id}
                  accessibilityLabel={`Open goal ${goal.title}`}
                  label={goal.title}
                  onPress={() => onOpenGoal(goal.id)}
                />
              );
            })}
          </CareerCard>

          <CareerSectionLabel>Goals progressed</CareerSectionLabel>
          {review.goalsProgressed.length === 0 ? (
            <CareerCard>
              <CareerMuted>No career goal had activity in this window.</CareerMuted>
            </CareerCard>
          ) : (
            <CareerCard>
              {review.goalsProgressed.map((goalReview) => {
                const progressLabel =
                  goalReview.progress.ratio === null
                    ? 'No milestones yet'
                    : `${Math.round(goalReview.progress.ratio * 100)}% milestones complete`;
                return (
                  <View key={goalReview.goal.id} style={styles.item}>
                    <CareerLinkRow
                      accessibilityLabel={`Open goal ${goalReview.goal.title}`}
                      label={goalReview.goal.title}
                      onPress={() => onOpenGoal(goalReview.goal.id)}
                    />
                    <View style={styles.tagRow}>
                      <CareerTag
                        label={GOAL_STATUS_LABELS[goalReview.goal.status]}
                        tone="muted"
                      />
                      <CareerTag label={progressLabel} tone="muted" />
                      {goalReview.focusSeconds > 0 && (
                        <CareerTag label={`${Math.round(goalReview.focusSeconds / 60)} min focus`} tone="primary" />
                      )}
                    </View>
                    {goalReview.milestonesCompleted > 0 && (
                      <CareerMuted>
                        {goalReview.milestonesCompleted} milestone{goalReview.milestonesCompleted === 1 ? '' : 's'}
                        completed
                      </CareerMuted>
                    )}
                    {goalReview.evidenceCount > 0 && (
                      <CareerMuted>
                        {goalReview.evidenceCount} evidence{goalReview.evidenceCount === 1 ? '' : 's'} recorded
                      </CareerMuted>
                    )}
                    {goalReview.achievementCount > 0 && (
                      <CareerMuted>
                        {goalReview.achievementCount} achievement{goalReview.achievementCount === 1 ? '' : 's'}
                        recorded
                      </CareerMuted>
                    )}
                    {goalReview.assessmentCount > 0 && (
                      <CareerMuted>
                        {goalReview.assessmentCount} assessment{goalReview.assessmentCount === 1 ? '' : 's'}
                        recorded
                      </CareerMuted>
                    )}
                  </View>
                );
              })}
            </CareerCard>
          )}

          <CareerSectionLabel>Skills practised</CareerSectionLabel>
          {review.skillsPractised.length === 0 ? (
            <CareerCard>
              <CareerMuted>No skill had evidence, an assessment or attributed focus in this window.</CareerMuted>
            </CareerCard>
          ) : (
            <CareerCard>
              {review.skillsPractised.map((skillReview) => (
                <View key={skillReview.skill.id} style={styles.item}>
                  <CareerLinkRow
                    accessibilityLabel={`Open skill ${skillReview.skill.name}`}
                    label={skillReview.skill.name}
                    onPress={() => onOpenSkill(skillReview.skill.id)}
                  />
                  <View style={styles.tagRow}>
                    <CareerTag
                      label={`Gap: ${skillReview.gap} level`}
                      tone={skillReview.gap > 0 ? 'primary' : 'muted'}
                    />
                    {skillReview.focusSeconds > 0 && (
                      <CareerTag label={`${Math.round(skillReview.focusSeconds / 60)} min focus`} tone="primary" />
                    )}
                  </View>
                  {skillReview.evidenceCount > 0 && (
                    <CareerMuted>
                      {skillReview.evidenceCount} evidence{skillReview.evidenceCount === 1 ? '' : 's'}
                    </CareerMuted>
                  )}
                  {skillReview.assessmentCount > 0 && (
                    <CareerMuted>
                      {skillReview.assessmentCount} assessment{skillReview.assessmentCount === 1 ? '' : 's'}
                    </CareerMuted>
                  )}
                  {skillReview.completedTaskCount > 0 && (
                    <CareerMuted>
                      {skillReview.completedTaskCount} linked task{skillReview.completedTaskCount === 1 ? '' : 's'}
                      completed
                    </CareerMuted>
                  )}
                </View>
              ))}
            </CareerCard>
          )}

          <CareerSectionLabel>Milestones completed</CareerSectionLabel>
          {review.milestonesCompleted.length === 0 ? (
            <CareerCard>
              <CareerMuted>No milestone was completed in this window.</CareerMuted>
            </CareerCard>
          ) : (
            <CareerCard>
              {review.milestonesCompleted.map((milestoneReview) => (
                <View key={milestoneReview.milestone.id} style={styles.item}>
                  <CareerLinkRow
                    accessibilityLabel={`Open goal ${milestoneReview.goal.title}`}
                    label={milestoneReview.milestone.title}
                    detail={milestoneReview.goal.title}
                    onPress={() => onOpenGoal(milestoneReview.goal.id)}
                  />
                  <CareerMuted>
                    Completed {formatCareerDate(milestoneReview.completedDay)}
                  </CareerMuted>
                </View>
              ))}
            </CareerCard>
          )}

          <CareerSectionLabel>Achievements recorded</CareerSectionLabel>
          {review.achievements.length === 0 ? (
            <CareerCard>
              <CareerMuted>No professional achievement was recorded in this window.</CareerMuted>
            </CareerCard>
          ) : (
            <CareerCard>
              {review.achievements.map((achievement) => (
                <View key={achievement.id} style={styles.item}>
                  <Text style={styles.itemTitle}>{achievement.title}</Text>
                  <CareerMuted>
                    {formatCareerDate(achievement.date)}
                  </CareerMuted>
                </View>
              ))}
            </CareerCard>
          )}

          <CareerSectionLabel>Assessments completed</CareerSectionLabel>
          {review.assessments.length === 0 ? (
            <CareerCard>
              <CareerMuted>No assessment was completed in this window.</CareerMuted>
            </CareerCard>
          ) : (
            <CareerCard>
              {review.assessments.map((assessment) => (
                <View key={assessment.id} style={styles.item}>
                  <Text style={styles.itemTitle}>{assessment.title}</Text>
                  <CareerMuted>
                    {formatCareerDate(assessment.assessedOn)}
                  </CareerMuted>
                </View>
              ))}
            </CareerCard>
          )}

          <CareerSectionLabel>Areas neglected</CareerSectionLabel>
          {review.neglectedSkills.length === 0 ? (
            <CareerCard>
              <CareerMuted>
                Every skill with a capability gap had practice in this window — or
                there are no skills with a gap yet.
              </CareerMuted>
            </CareerCard>
          ) : (
            <CareerCard>
              {review.neglectedSkills.map((skill) => {
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
                        label={`Gap: ${skillGapNumber(skill)} level`}
                        tone="primary"
                      />
                      <CareerTag
                        label={`Last practised ${practisedOn ? formatCareerDate(practisedOn) : 'never'}`}
                        tone="muted"
                      />
                    </View>
                  </View>
                );
              })}
            </CareerCard>
          )}

          <CareerSectionLabel>Goal progress at a glance</CareerSectionLabel>
          <CareerCard>
            {review.goalProgressSnapshots.length === 0 ? (
              <CareerMuted>No goals defined yet.</CareerMuted>
            ) : (
              review.goalProgressSnapshots.map((snapshot) => {
                const goal = doc.goals.find((entry) => entry.id === snapshot.goalId);
                if (!goal) return null;
                return (
                  <View key={goal.id} style={styles.item}>
                    <CareerLinkRow
                      accessibilityLabel={`Open goal ${goal.title}`}
                      label={goal.title}
                      onPress={() => onOpenGoal(goal.id)}
                    />
                    <CareerProgressBar
                      label={
                        snapshot.progress.ratio === null
                          ? 'No milestones defined'
                          : `${Math.round(snapshot.progress.ratio * 100)}%`
                      }
                      ratio={snapshot.progress.ratio}
                    />
                  </View>
                );
              })
            )}
          </CareerCard>
        </>
      )}
    </CareerScreen>
  );
}

function skillGapNumber(skill: { currentLevel: number; targetLevel: number }): number {
  return Math.max(0, skill.targetLevel - skill.currentLevel);
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
    smallSection: {
      fontSize: 13,
      fontWeight: '600',
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 10,
      marginBottom: 2,
    },
  });
