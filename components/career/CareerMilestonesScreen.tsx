/**
 * All milestones, grouped by the goal they belong to.
 *
 * This is an index, not a second editor. Milestones are created and changed on
 * the goal detail screen so their parent goal is always in view.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  MILESTONE_STATUS_LABELS,
  formatCareerDate,
  milestonesForGoal,
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
  CareerScreen,
  CareerSectionLabel,
  CareerTag,
} from './CareerUI';

export type CareerMilestonesScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGoals: () => void;
};

export function CareerMilestonesScreen({
  doc,
  today,
  onBack,
  onOpenGoal,
  onOpenGoals,
}: CareerMilestonesScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  const groups = useMemo(
    () =>
      doc.goals
        .map((goal) => ({ goal, milestones: milestonesForGoal(doc, goal.id) }))
        .filter((group) => group.milestones.length > 0)
        .sort((a, b) => {
          const aArchived = a.goal.status === 'archived' ? 1 : 0;
          const bArchived = b.goal.status === 'archived' ? 1 : 0;
          return aArchived - bArchived || a.goal.title.localeCompare(b.goal.title);
        }),
    [doc],
  );

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="Checkpoints across your goals"
      title="Milestones"
    >
      <CareerCard>
        <CareerCardTitle>Milestones are checkpoints</CareerCardTitle>
        <CareerMuted>
          A milestone breaks a goal into something you can recognise. Dates are
          optional; an overdue date is a prompt to review, not a failure.
        </CareerMuted>
      </CareerCard>

      {groups.length === 0 ? (
        <CareerEmptyState
          actionLabel="Open goals"
          body="No milestones yet. Open a goal and add a checkpoint when it helps you decide what to do next."
          onAction={onOpenGoals}
          title="No milestones yet"
        />
      ) : (
        groups.map(({ goal, milestones }) => (
          <View key={goal.id} style={styles.group}>
            <CareerSectionLabel>{goal.title}</CareerSectionLabel>
            <CareerCard>
              {milestones.map((milestone, index) => {
                const overdue =
                  milestone.targetDate !== undefined &&
                  milestone.targetDate < today &&
                  milestone.status !== 'completed' &&
                  milestone.status !== 'archived';
                return (
                  <View key={milestone.id} style={styles.item}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <CareerLinkRow
                      accessibilityLabel={`Open milestone ${milestone.title}`}
                      detail={
                        milestone.targetDate
                          ? `Due ${formatCareerDate(milestone.targetDate)}`
                          : 'No target date'
                      }
                      label={milestone.title}
                      onPress={() => onOpenGoal(goal.id)}
                    />
                    <View style={styles.tagRow}>
                      <CareerTag
                        label={MILESTONE_STATUS_LABELS[milestone.status]}
                        tone={milestone.status === 'completed' ? 'primary' : 'muted'}
                      />
                      {overdue ? <CareerTag label="Overdue" tone="danger" /> : null}
                    </View>
                    {milestone.description ? (
                      <Text style={styles.paragraph}>{milestone.description}</Text>
                    ) : null}
                  </View>
                );
              })}
              <CareerActions>
                <CareerButton
                  label="Open goal"
                  onPress={() => onOpenGoal(goal.id)}
                  variant="secondary"
                />
              </CareerActions>
            </CareerCard>
          </View>
        ))
      )}
    </CareerScreen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    group: {
      gap: 2,
    },
    item: {
      gap: 6,
    },
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
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.divider,
      marginVertical: 7,
    },
  });
