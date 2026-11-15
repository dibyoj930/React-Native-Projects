/**
 * Intelligence screen: surfaces optional, offline insights built from records
 * the user actually made. Nothing here changes the plan, and nothing is
 * required for the app to work.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  buildIntelligenceReport,
  formatCareerDate,
  insightKindLabel,
  insightSeverityTone,
  totalFocusSeconds,
  type CareerDoc,
  type Insight,
} from '../../career';
import { type DayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerCard,
  CareerEmptyState,
  CareerLinkRow,
  CareerMuted,
  CareerScreen,
  CareerSectionLabel,
  CareerStat,
  CareerStatGrid,
  CareerTag,
} from './CareerUI';

export type CareerIntelligenceScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  tasks: readonly import('../../todos/model').Todo[];
  sessions: readonly import('../../productivity/types').FocusSession[];
  outcomes: readonly (import('../../replan/types').PlanOutcome | undefined)[];
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenSkill: (skillId: string) => void;
};

export function CareerIntelligenceScreen({
  doc,
  today,
  tasks,
  sessions,
  outcomes,
  onBack,
  onOpenGoal,
  onOpenSkill,
}: CareerIntelligenceScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  const report = useMemo(
    () =>
      buildIntelligenceReport({ doc, tasks, sessions, outcomes, today }),
    [doc, tasks, sessions, outcomes, today],
  );

  const focusMins = Math.round(totalFocusSeconds(sessions) / 60);

  const byKind = new Map<string, Insight[]>();
  for (const insight of report.insights) {
    const bucket = byKind.get(insight.kind) ?? [];
    bucket.push(insight);
    byKind.set(insight.kind, bucket);
  }

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle={`${formatCareerDate(report.windowStart)} – ${formatCareerDate(report.windowEnd)}`}
      title="Development intelligence"
    >
      <CareerStatGrid>
        <CareerStat label="Insights this period" value={String(report.insights.length)} />
        <CareerStat label="Focused minutes (logged)" value={String(focusMins)} />
      </CareerStatGrid>

      {report.insights.length === 0 ? (
        <CareerEmptyState
          body="Record evidence, assessments and achievements — or run a focus session linked to career work — and insights will appear here."
          title="No insights yet"
        />
      ) : null}

      {byKind.has('strength') && (
        <CareerCard>
          <CareerSectionLabel>Strengths</CareerSectionLabel>
          {byKind.get('strength')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
              {insight.relatedGoalIds.length > 0 && (
                <CareerLinkRow
                  accessibilityLabel={`Open goal ${insight.relatedGoalIds[0]}`}
                  label="Open related goal"
                  onPress={() => onOpenGoal(insight.relatedGoalIds[0])}
                />
              )}
              {insight.relatedSkillIds.length > 0 && (
                <CareerLinkRow
                  accessibilityLabel={`Open skill ${insight.relatedSkillIds[0]}`}
                  label="Open related skill"
                  onPress={() => onOpenSkill(insight.relatedSkillIds[0])}
                />
              )}
            </View>
          ))}
        </CareerCard>
      )}

      {byKind.has('underdeveloped') && (
        <CareerCard>
          <CareerSectionLabel>Capability gaps</CareerSectionLabel>
          {byKind.get('underdeveloped')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
              {insight.relatedSkillIds.length > 0 && (
                <CareerLinkRow
                  accessibilityLabel={`Open skill ${insight.relatedSkillIds[0]}`}
                  label="Open related skill"
                  onPress={() => onOpenSkill(insight.relatedSkillIds[0])}
                />
              )}
            </View>
          ))}
        </CareerCard>
      )}

      {byKind.has('neglectedGoal') && (
        <CareerCard>
          <CareerSectionLabel>Neglected goals</CareerSectionLabel>
          {byKind.get('neglectedGoal')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
              {insight.relatedGoalIds.length > 0 && (
                <CareerLinkRow
                  accessibilityLabel={`Open goal ${insight.relatedGoalIds[0]}`}
                  label="Open related goal"
                  onPress={() => onOpenGoal(insight.relatedGoalIds[0])}
                />
              )}
            </View>
          ))}
        </CareerCard>
      )}

      {byKind.has('learningConsistency') && (
        <CareerCard>
          <CareerSectionLabel>Learning consistency</CareerSectionLabel>
          {byKind.get('learningConsistency')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
            </View>
          ))}
        </CareerCard>
      )}

      {byKind.has('completionPattern') && (
        <CareerCard>
          <CareerSectionLabel>Completion pattern</CareerSectionLabel>
          {byKind.get('completionPattern')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
            </View>
          ))}
        </CareerCard>
      )}

      {byKind.has('achievementTrend') && (
        <CareerCard>
          <CareerSectionLabel>Achievement trend</CareerSectionLabel>
          {byKind.get('achievementTrend')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
            </View>
          ))}
        </CareerCard>
      )}

      {byKind.has('repeatedlyPostponed') && (
        <CareerCard>
          <CareerSectionLabel>Repeatedly postponed</CareerSectionLabel>
          {byKind.get('repeatedlyPostponed')!.map((insight) => (
            <View key={insight.id} style={styles.item}>
              <CareerTag label={insightKindLabel(insight.kind)} tone={insightSeverityTone(insight.severity)} />
              <Text style={styles.itemTitle}>{insight.title}</Text>
              <CareerMuted>{insight.body}</CareerMuted>
              {insight.relatedGoalIds.length > 0 && (
                <CareerLinkRow
                  accessibilityLabel={`Open goal ${insight.relatedGoalIds[0]}`}
                  label="Open related goal"
                  onPress={() => onOpenGoal(insight.relatedGoalIds[0])}
                />
              )}
            </View>
          ))}
        </CareerCard>
      )}

      <CareerMuted>
        Insights are read-only summaries of your own records. They describe what
        happened; they do not predict what will happen or claim cause and effect.
      </CareerMuted>
    </CareerScreen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    item: {
      gap: 6,
      marginBottom: 10,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
    },
  });
