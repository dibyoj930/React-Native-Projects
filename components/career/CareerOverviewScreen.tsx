/**
 * Career overview: the module's home.
 *
 * It renders the model from `buildCareerOverview` and reports intent. The cards
 * are ordered by the question they answer: where am I going, what am I working
 * on, what is next, what have I done.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  GOAL_TYPE_LABELS,
  buildCareerOverview,
  formatCareerDate,
  goalProgress,
  type CareerDoc,
  type CareerRecommendation,
  type CareerRecommendations,
  type CareerSuggestion,
} from '../../career';
import type { DayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import { CareerRecommendationsCard } from './CareerRecommendationsCard';
import {
  CareerActions,
  CareerBody,
  CareerButton,
  CareerCard,
  CareerCardTitle,
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

export type CareerOverviewScreenProps = {
  doc: CareerDoc;
  today: DayKey;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenGoals: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenDomains: () => void;
  onOpenSkills: () => void;
  onOpenSkill: (skillId: string) => void;
  onOpenMilestones: () => void;
  onOpenAchievements: () => void;
  onOpenAssessments: () => void;
  onOpenWeeklyReview: () => void;
  onOpenMonthlyReview: () => void;
  onOpenIntelligence: () => void;
  recommendations?: CareerRecommendations;
  onAcceptRecommendation?: (recommendation: CareerRecommendation) => void;
  onDismissRecommendation?: (id: string) => void;
  onSnoozeRecommendations?: (until: DayKey) => void;
  onResumeRecommendations?: () => void;
};

export function CareerOverviewScreen({
  doc,
  today,
  onBack,
  onOpenProfile,
  onOpenGoals,
  onOpenGoal,
  onOpenDomains,
  onOpenSkills,
  onOpenSkill,
  onOpenMilestones,
  onOpenAchievements,
  onOpenAssessments,
  onOpenWeeklyReview,
  onOpenMonthlyReview,
  onOpenIntelligence,
  recommendations,
  onAcceptRecommendation,
  onDismissRecommendation,
  onSnoozeRecommendations,
  onResumeRecommendations,
}: CareerOverviewScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const model = useMemo(() => buildCareerOverview(doc, today), [doc, today]);

  const openSuggestion = (suggestion: CareerSuggestion) => {
    switch (suggestion.kind) {
      case 'profile':
        onOpenProfile();
        return;
      case 'goal':
        if (suggestion.goalId) onOpenGoal(suggestion.goalId);
        else onOpenGoals();
        return;
      case 'milestone':
        if (suggestion.goalId) onOpenGoal(suggestion.goalId);
        else onOpenMilestones();
        return;
      case 'evidence':
        if (suggestion.skillId) onOpenSkill(suggestion.skillId);
        else onOpenGoals();
        return;
      case 'achievement':
        onOpenAchievements();
        return;
      case 'skill':
        onOpenSkills();
        return;
      case 'domain':
        onOpenDomains();
        return;
    }
  };

  return (
    <CareerScreen
      backLabel="Back to today"
      onBack={onBack}
      subtitle="Assess, plan, learn, practise, apply, demonstrate, reflect"
      title="Career"
    >
      <CareerCard>
        <CareerCardTitle>Direction</CareerCardTitle>
        {doc.profile ? (
          <>
            <CareerBody>
              {doc.profile.designation || 'Current role not set'}
              {doc.profile.profession ? ` · ${doc.profile.profession}` : ''}
              {doc.profile.desiredRoles.length > 0
                ? ` → ${doc.profile.desiredRoles.join(', ')}`
                : ''}
            </CareerBody>
            {doc.profile.industry ? (
              <CareerMuted>{doc.profile.industry}</CareerMuted>
            ) : null}
            <CareerActions>
              <CareerButton
                label="Edit profile"
                onPress={onOpenProfile}
                variant="secondary"
              />
            </CareerActions>
          </>
        ) : (
          <>
            <CareerBody>
              Add where you are now and what you are working towards. This is a
              direction, not a promise, and you can change it whenever your plans
              do.
            </CareerBody>
            <CareerButton label="Set up profile" onPress={onOpenProfile} />
          </>
        )}
      </CareerCard>

      <CareerStatGrid>
        <CareerStat label="Active goals" value={String(model.activeGoalCount)} />
        <CareerStat label="Skills" value={String(model.skillCount)} />
        <CareerStat label="Evidence" value={String(model.evidenceCount)} />
        <CareerStat label="Achievements" value={String(model.achievementCount)} />
      </CareerStatGrid>

      {recommendations &&
      onAcceptRecommendation &&
      onDismissRecommendation &&
      onSnoozeRecommendations &&
      onResumeRecommendations ? (
        <CareerRecommendationsCard
          doc={doc}
          onAccept={onAcceptRecommendation}
          onDismiss={onDismissRecommendation}
          onResume={onResumeRecommendations}
          onSnooze={onSnoozeRecommendations}
          recommendations={recommendations}
        />
      ) : null}

      <CareerSectionLabel>What you are working on</CareerSectionLabel>
      {model.focusGoals.length === 0 ? (
        <CareerEmptyState
          actionLabel="Create a goal"
          body="Goals are the direction you choose. Start with one that matters now, in any profession."
          onAction={onOpenGoals}
          title="No active goals yet"
        />
      ) : (
        <CareerCard>
          {model.focusGoals.map((goal, index) => {
            const progress = goalProgress(doc, goal.id);
            return (
              <View key={goal.id} style={styles.listItem}>
                {index > 0 ? <View style={styles.itemDivider} /> : null}
                <CareerLinkRow
                  accessibilityLabel={`Open goal ${goal.title}`}
                  detail={`${GOAL_TYPE_LABELS[goal.goalType]} · ${formatCareerDate(
                    goal.targetDate,
                    'No target date',
                  )}`}
                  label={goal.title}
                  onPress={() => onOpenGoal(goal.id)}
                />
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
          })}
          <CareerActions>
            <CareerButton
              label="All goals"
              onPress={onOpenGoals}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      )}

      {model.overdueMilestones.length > 0 ? (
        <>
          <CareerSectionLabel>Needs a decision</CareerSectionLabel>
          <CareerCard>
            {model.overdueMilestones.map(({ milestone, goal }) => (
              <View key={milestone.id} style={styles.listItem}>
                <CareerLinkRow
                  accessibilityLabel={`Open overdue milestone ${milestone.title}`}
                  detail={`${goal.title} · was due ${formatCareerDate(
                    milestone.targetDate,
                  )}`}
                  label={milestone.title}
                  onPress={() => onOpenGoal(goal.id)}
                />
                <CareerTag label="Overdue" tone="danger" />
              </View>
            ))}
          </CareerCard>
        </>
      ) : null}

      <CareerSectionLabel>Next milestones</CareerSectionLabel>
      {model.nextMilestones.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No dated milestones ahead. Add a target date to a milestone when a
            date is genuinely useful.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {model.nextMilestones.map(({ milestone, goal }, index) => (
            <View key={milestone.id} style={styles.listItem}>
              {index > 0 ? <View style={styles.itemDivider} /> : null}
              <CareerLinkRow
                accessibilityLabel={`Open milestone ${milestone.title}`}
                detail={`${goal.title} · ${formatCareerDate(milestone.targetDate)}`}
                label={milestone.title}
                onPress={() => onOpenGoal(goal.id)}
              />
            </View>
          ))}
        </CareerCard>
      )}

      <CareerSectionLabel>Suggested next steps</CareerSectionLabel>
      {model.suggestions.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            Nothing needs attention right now. Review your goals and evidence when
            you are ready.
          </CareerMuted>
        </CareerCard>
      ) : (
        model.suggestions.map((suggestion) => (
          <CareerCard key={suggestion.id}>
            <CareerCardTitle>{suggestion.title}</CareerCardTitle>
            <CareerMuted>{suggestion.body}</CareerMuted>
            <CareerActions>
              <CareerButton
                label="Open"
                onPress={() => openSuggestion(suggestion)}
                variant="secondary"
              />
            </CareerActions>
          </CareerCard>
        ))
      )}

      <CareerSectionLabel>Recent achievements</CareerSectionLabel>
      {model.recentAchievements.length === 0 ? (
        <CareerCard>
          <CareerMuted>
            No achievements recorded. Only record outcomes you can support with
            evidence — no invented metrics.
          </CareerMuted>
        </CareerCard>
      ) : (
        <CareerCard>
          {model.recentAchievements.map((achievement, index) => (
            <View key={achievement.id} style={styles.listItem}>
              {index > 0 ? <View style={styles.itemDivider} /> : null}
              <Text style={styles.itemTitle}>{achievement.title}</Text>
              <CareerMuted>
                {formatCareerDate(achievement.date)}
                {achievement.impact ? ` · ${achievement.impact}` : ''}
              </CareerMuted>
            </View>
          ))}
          <CareerActions>
            <CareerButton
              label="All achievements"
              onPress={onOpenAchievements}
              variant="secondary"
            />
          </CareerActions>
        </CareerCard>
      )}

      <CareerSectionLabel>Explore</CareerSectionLabel>
      <CareerCard>
        <CareerLinkRow
          detail={`${model.activeDomainCount} active areas`}
          label="Development areas"
          onPress={onOpenDomains}
        />
        <CareerLinkRow
          detail={`${model.skillCount} skills · ${model.skillGapCount} with a gap to close`}
          label="Skills"
          onPress={onOpenSkills}
        />
        <CareerLinkRow
          detail={`${model.milestoneCompleted} of ${model.milestoneTotal} active-goal milestones complete`}
          label="Milestones"
          onPress={onOpenMilestones}
        />
        <CareerLinkRow
          detail={`${model.achievementCount} recorded`}
          label="Achievements"
          onPress={onOpenAchievements}
        />
        <CareerLinkRow
          detail={`${doc.assessments.length} recorded`}
          label="Assessments"
          onPress={onOpenAssessments}
        />
        <CareerLinkRow
          label="Weekly review"
          onPress={onOpenWeeklyReview}
        />
        <CareerLinkRow
          label="Monthly review"
          onPress={onOpenMonthlyReview}
        />
        <CareerLinkRow
          label="Development intelligence"
          onPress={onOpenIntelligence}
        />
      </CareerCard>
    </CareerScreen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    listItem: {
      gap: 6,
    },
    itemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.divider,
      marginVertical: 4,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
    },
  });
