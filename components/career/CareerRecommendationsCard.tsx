/**
 * The daily development card on the career overview.
 *
 * It is presentational: the recommendation set is already built from recorded
 * facts and the approved plan. The component never invents a suggestion, never
 * changes a task itself and never presents a recommendation as an assessment
 * score. Accepting opens the normal task sheet, so "accept" and "modify" are the
 * same honest path.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  careerLinkLabel,
  formatCareerDate,
  recommendationsResumeOn,
  topRecommendations,
  VISIBLE_RECOMMENDATIONS,
  type CareerDoc,
  type CareerRecommendation,
  type CareerRecommendationKind,
  type CareerRecommendations,
} from '../../career';
import type { DayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerActions,
  CareerBody,
  CareerButton,
  CareerCard,
  CareerCardTitle,
  CareerSectionLabel,
  CareerTag,
} from './CareerUI';

const KIND_LABELS: Record<CareerRecommendationKind, string> = {
  learn: 'Learn',
  practise: 'Practise',
  milestone: 'Milestone',
  project: 'Project',
  assessment: 'Assessment prep',
  achievement: 'Achievement',
  review: 'Review',
  'improve-process': 'Unblock',
};

export type CareerRecommendationsCardProps = {
  doc: CareerDoc;
  recommendations: CareerRecommendations;
  onAccept: (recommendation: CareerRecommendation) => void;
  onDismiss: (id: string) => void;
  onSnooze: (until: DayKey) => void;
  onResume: () => void;
};

export function CareerRecommendationsCard({
  doc,
  recommendations,
  onAccept,
  onDismiss,
  onSnooze,
  onResume,
}: CareerRecommendationsCardProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const visible = topRecommendations(recommendations.items, VISIBLE_RECOMMENDATIONS);
  const snoozed =
    recommendations.snoozedUntil !== undefined &&
    recommendations.snoozedUntil > recommendations.forDay;

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <CareerSectionLabel>Today's development</CareerSectionLabel>
        {recommendations.availableMinutes !== undefined &&
        recommendations.availableMinutes > 0 ? (
          <Text style={styles.openTime}>
            {recommendations.availableMinutes} min open
          </Text>
        ) : null}
      </View>

      {snoozed ? (
        <CareerCard>
          <CareerCardTitle>Paused until tomorrow</CareerCardTitle>
          <CareerBody>
            Recommendations will return on{' '}
            {formatCareerDate(recommendations.snoozedUntil)}. You can resume now
            if you have space.
          </CareerBody>
          <CareerActions>
            <CareerButton
              label="Resume recommendations"
              onPress={onResume}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      ) : recommendations.noTime ? (
        <CareerCard>
          <CareerCardTitle>No open time left today</CareerCardTitle>
          <CareerBody>
            There is not enough space in today's approved plan for a useful
            development block. Recommendations return when you replan with a
            little room.
          </CareerBody>
        </CareerCard>
      ) : visible.length === 0 ? (
        <CareerCard>
          <CareerCardTitle>
            {recommendations.allDismissed
              ? 'You have reviewed today\'s suggestions'
              : 'Nothing to recommend yet'}
          </CareerCardTitle>
          <CareerBody>
            {recommendations.allDismissed
              ? 'They return tomorrow with the next useful step.'
              : recommendations.hasContext
                ? 'There is no open career action that needs attention right now.'
                : 'Add a goal or skill first. Recommendations are built only from what you record.'}
          </CareerBody>
        </CareerCard>
      ) : (
        <>
          {visible.map((recommendation) => {
            const link = careerLinkLabel(doc, recommendation.career);
            return (
              <CareerCard key={recommendation.id}>
                <View style={styles.cardTop}>
                  <CareerTag
                    label={KIND_LABELS[recommendation.kind]}
                    tone="primary"
                  />
                  <CareerTag
                    label={`${recommendation.expectedMinutes} min`}
                    tone="muted"
                  />
                </View>
                <CareerCardTitle>{recommendation.title}</CareerCardTitle>
                {link ? <Text style={styles.link}>{link}</Text> : null}
                <CareerBody>{recommendation.objective}</CareerBody>
                <Text style={styles.why}>Why this: {recommendation.rationale}</Text>
                <Text style={styles.detail}>
                  Finish when: {recommendation.completionCriteria}
                </Text>
                <Text style={styles.detail}>
                  Evidence: {recommendation.expectedEvidence}
                </Text>
                <CareerActions>
                  <CareerButton
                    label="Add to plan"
                    accessibilityLabel={`Add recommendation to plan: ${recommendation.title}`}
                    onPress={() => onAccept(recommendation)}
                  />
                  <CareerButton
                    label="Skip"
                    accessibilityLabel={`Skip recommendation: ${recommendation.title}`}
                    onPress={() => onDismiss(recommendation.id)}
                    variant="secondary"
                  />
                </CareerActions>
              </CareerCard>
            );
          })}
          <CareerActions>
            <CareerButton
              label="Pause until tomorrow"
              accessibilityLabel="Pause career recommendations until tomorrow"
              onPress={() => onSnooze(recommendationsResumeOn(recommendations.forDay))}
              variant="secondary"
            />
          </CareerActions>
        </>
      )}
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    section: {
      gap: 10,
      marginTop: 4,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    openTime: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 14,
    },
    cardTop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    link: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    why: {
      fontSize: 13,
      color: c.textMuted,
      fontStyle: 'italic',
    },
    detail: {
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
    },
  });
};
