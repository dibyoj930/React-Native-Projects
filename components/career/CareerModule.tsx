/**
 * The career destination: one component, a local route union, and the career
 * context.
 *
 * Back behaviour mirrors the rest of the app: an Android hardware back or a
 * header back returns one step inside the module, and from the overview it exits
 * to today.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import {
  type CareerAchievementDraft,
  type CareerAssessmentDraft,
  type CareerDevelopment,
  type CareerEvidenceDraft,
  type CareerGoalDraft,
  type CareerMilestoneDraft,
  type CareerProfileDraft,
  type CareerRecommendation,
  type CareerRecommendations,
  type CareerSkillDraft,
  useCareer,
} from '../../career';
import { localDateKey } from '../../shared/date';
import { CareerAchievementsScreen } from './CareerAchievementsScreen';
import { CareerAssessmentsScreen } from './CareerAssessmentsScreen';
import { CareerDomainsScreen } from './CareerDomainsScreen';
import { CareerGoalDetailScreen } from './CareerGoalDetailScreen';
import { CareerGoalsScreen } from './CareerGoalsScreen';
import { CareerMilestonesScreen } from './CareerMilestonesScreen';
import { CareerOverviewScreen } from './CareerOverviewScreen';
import { CareerProfileScreen } from './CareerProfileScreen';
import { CareerReadinessScreen } from './CareerReadinessScreen';
import { CareerReviewScreen } from './CareerReviewScreen';
import { CareerIntelligenceScreen } from './CareerIntelligenceScreen';
import { CareerSkillDetailScreen } from './CareerSkillDetailScreen';
import { CareerSkillsScreen } from './CareerSkillsScreen';
import { CareerMuted, CareerScreen } from './CareerUI';
import { parentCareerRoute, type CareerRoute } from './routes';

export type CareerModuleProps = {
  onExit: () => void;
  /**
   * Task and focus practice derived from the other two stores.
   *
   * Optional so the module can be rendered without them in isolation. When it is
   * present, goal and skill detail show the tasks linked to that record and the
   * focus attributed to it; when it is absent, the screens look exactly as they
   * did before.
   */
  development?: CareerDevelopment;
  /** Daily recommendations built by the composition hook, when available. */
  recommendations?: CareerRecommendations;
  /**
   * Execution records needed for weekly and monthly reviews.
   *
   * Optional so the module stays testable in isolation. When absent the review
   * screens render an empty state rather than inventing activity.
   */
  tasks?: readonly import('../../todos/model').Todo[];
  sessions?: readonly import('../../productivity/types').FocusSession[];
  outcomes?: readonly (import('../../replan/types').PlanOutcome | undefined)[];
  /**
   * Opens the normal task sheet prefilled with the recommendation. The module
   * never creates a task itself; the user reviews it first.
   */
  onAcceptRecommendation?: (recommendation: CareerRecommendation) => void;
};

export function CareerModule({
  onExit,
  development,
  recommendations,
  tasks,
  sessions,
  outcomes,
  onAcceptRecommendation,
}: CareerModuleProps) {
  const career = useCareer();
  const [route, setRoute] = useState<CareerRoute>({ name: 'overview' });
  const routeRef = useRef(route);
  routeRef.current = route;

  const today = localDateKey(Date.now());

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const parent = parentCareerRoute(routeRef.current);
      if (parent === null) {
        onExit();
      } else {
        setRoute(parent);
      }
      return true;
    });
    return () => subscription.remove();
  }, [onExit]);

  const goBack = useCallback(() => {
    const parent = parentCareerRoute(route);
    if (parent === null) onExit();
    else setRoute(parent);
  }, [onExit, route]);

  if (!career.hydrated) {
    return (
      <CareerScreen backLabel="Back to today" onBack={onExit} title="Career">
        <CareerMuted>Loading your career record…</CareerMuted>
      </CareerScreen>
    );
  }

  switch (route.name) {
    case 'overview':
      return (
        <CareerOverviewScreen
          doc={career.doc}
          onBack={onExit}
          onOpenAchievements={() => setRoute({ name: 'achievements' })}
          onOpenAssessments={() => setRoute({ name: 'assessments' })}
          onOpenWeeklyReview={() => setRoute({ name: 'review', period: 'week' })}
          onOpenMonthlyReview={() => setRoute({ name: 'review', period: 'month' })}
          onOpenIntelligence={() => setRoute({ name: 'intelligence' })}
          onOpenDomains={() => setRoute({ name: 'domains' })}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onOpenGoals={() => setRoute({ name: 'goals' })}
          onOpenMilestones={() => setRoute({ name: 'milestones' })}
          onOpenProfile={() => setRoute({ name: 'profile' })}
          onOpenSkill={(skillId) => setRoute({ name: 'skill', skillId })}
          onOpenSkills={() => setRoute({ name: 'skills' })}
          onAcceptRecommendation={onAcceptRecommendation}
          onDismissRecommendation={career.dismissRecommendation}
          onResumeRecommendations={career.resumeRecommendations}
          onSnoozeRecommendations={career.snoozeRecommendations}
          recommendations={recommendations}
          today={today}
        />
      );

    case 'profile':
      return (
        <CareerProfileScreen
          onBack={goBack}
          onSave={(draft: CareerProfileDraft) => {
            career.saveProfile(draft);
            setRoute({ name: 'overview' });
          }}
          profile={career.doc.profile}
        />
      );

    case 'domains':
      return (
        <CareerDomainsScreen
          doc={career.doc}
          onAdd={career.addDomain}
          onBack={goBack}
          onEdit={career.editDomain}
          onRemove={career.removeDomain}
          onRestoreSuggested={career.restoreSuggestedDomains}
          onToggle={career.toggleDomain}
        />
      );

    case 'goals':
      return (
        <CareerGoalsScreen
          doc={career.doc}
          onBack={goBack}
          onCreate={(draft: CareerGoalDraft) => career.saveGoal(draft)}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          today={today}
        />
      );

    case 'goal':
      return (
        <CareerGoalDetailScreen
          development={development}
          doc={career.doc}
          goalId={route.goalId}
          onBack={() => setRoute({ name: 'goals' })}
          onDelete={career.deleteGoal}
          onDeleteEvidence={career.deleteEvidence}
          onDeleteMilestone={career.deleteMilestone}
          onOpenAchievements={() => setRoute({ name: 'achievements' })}
          onOpenSkill={(skillId) => setRoute({ name: 'skill', skillId })}
          onSave={(draft: CareerGoalDraft, id: string) => career.saveGoal(draft, id)}
          onSaveEvidence={(draft: CareerEvidenceDraft) => career.saveEvidence(draft)}
          onSaveMilestone={(goalId: string, draft: CareerMilestoneDraft) =>
            career.saveMilestone(goalId, draft)
          }
          onSetMilestoneStatus={career.setMilestoneStatus}
          onSetStatus={career.setGoalStatus}
          today={today}
        />
      );

    case 'skills':
      return (
        <CareerSkillsScreen
          doc={career.doc}
          onBack={goBack}
          onCreate={(draft: CareerSkillDraft) => career.saveSkill(draft)}
          onOpenSkill={(skillId) => setRoute({ name: 'skill', skillId })}
        />
      );

    case 'skill':
      return (
        <CareerSkillDetailScreen
          development={development}
          doc={career.doc}
          onBack={() => setRoute({ name: 'skills' })}
          onDelete={career.deleteSkill}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onOpenGoals={() => setRoute({ name: 'goals' })}
          onSave={(draft: CareerSkillDraft, id: string) => career.saveSkill(draft, id)}
          skillId={route.skillId}
        />
      );

    case 'milestones':
      return (
        <CareerMilestonesScreen
          doc={career.doc}
          onBack={goBack}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onOpenGoals={() => setRoute({ name: 'goals' })}
          today={today}
        />
      );

    case 'achievements':
      return (
        <CareerAchievementsScreen
          doc={career.doc}
          onBack={goBack}
          onDelete={career.deleteAchievement}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onSave={(draft: CareerAchievementDraft, id?: string) =>
            career.saveAchievement(draft, id)
          }
          today={today}
        />
      );

    case 'assessments':
      return (
        <CareerAssessmentsScreen
          assessmentId={undefined}
          doc={career.doc}
          onBack={goBack}
          onDelete={career.deleteAssessment}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onSave={(draft: CareerAssessmentDraft, id?: string) =>
            career.saveAssessment(draft, id)
          }
          today={today}
        />
      );

    case 'assessment':
      return (
        <CareerAssessmentsScreen
          assessmentId={route.assessmentId}
          doc={career.doc}
          onBack={() => setRoute({ name: 'assessments' })}
          onDelete={career.deleteAssessment}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onSave={(draft: CareerAssessmentDraft, id?: string) =>
            career.saveAssessment(draft, id)
          }
          today={today}
        />
      );

    case 'readiness':
      return (
        <CareerReadinessScreen
          doc={career.doc}
          goalId={route.goalId}
          onBack={() => setRoute({ name: 'goals' })}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onOpenSkill={(skillId) => setRoute({ name: 'skill', skillId })}
          today={today}
        />
      );

    case 'review':
      return (
        <CareerReviewScreen
          doc={career.doc}
          today={today}
          period={route.period}
          tasks={tasks ?? []}
          sessions={sessions ?? []}
          outcomes={outcomes ?? []}
          onBack={() => setRoute({ name: 'overview' })}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onOpenSkill={(skillId) => setRoute({ name: 'skill', skillId })}
        />
      );

    case 'intelligence':
      return (
        <CareerIntelligenceScreen
          doc={career.doc}
          today={today}
          tasks={tasks ?? []}
          sessions={sessions ?? []}
          outcomes={outcomes ?? []}
          onBack={() => setRoute({ name: 'overview' })}
          onOpenGoal={(goalId) => setRoute({ name: 'goal', goalId })}
          onOpenSkill={(skillId) => setRoute({ name: 'skill', skillId })}
        />
      );
  }
}
