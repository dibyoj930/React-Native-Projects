/**
 * Career reducer.
 *
 * Pure, synchronous and storage-free. The provider owns the clock and the
 * persistence; the reducer owns the referential rules that must hold no matter
 * which screen fired the action.
 *
 * The important choices:
 *
 *  - Archiving is a status change, never a delete. A goal's milestones,
 *    evidence, achievements and assessments stay attached and remain visible.
 *  - Hard-deleting a goal removes the goal and its milestones (they are the
 *    plan's breakdown), but preserves evidence, achievements and assessments.
 *    Their `goalId` is cleared and `goalTitleSnapshot` keeps the context, so
 *    deleting a plan cannot erase what the user actually did.
 *  - Deleting a skill only unlinks it. It never deletes the evidence or
 *    achievements that mention it.
 *  - Removing a development area only unlinks goals and skills from it.
 */

import type { DayKey } from '../shared/date';

import { seedDefaultDomains } from './factory';
import {
  CAREER_DOC_VERSION,
  type CareerAchievement,
  type CareerAssessment,
  type CareerDoc,
  type CareerEvidence,
  type CareerGoal,
  type CareerMilestone,
  type CareerProfile,
  type CareerReviewNote,
  type CareerSkill,
  type DevelopmentDomain,
} from './types';

export type CareerState = {
  doc: CareerDoc;
  hydrated: boolean;
};

export type CareerAction =
  | { type: 'hydrated'; doc: CareerDoc }
  | { type: 'setProfile'; profile: CareerProfile }
  | { type: 'upsertDomain'; domain: DevelopmentDomain }
  | { type: 'toggleDomain'; id: string; enabled: boolean; at: number }
  | { type: 'removeDomain'; id: string }
  | { type: 'restoreSuggestedDomains'; at: number }
  | { type: 'upsertGoal'; goal: CareerGoal }
  | { type: 'deleteGoal'; id: string; mode: 'archive' | 'delete'; at: number }
  | { type: 'upsertSkill'; skill: CareerSkill }
  | { type: 'deleteSkill'; id: string }
  | { type: 'upsertMilestone'; milestone: CareerMilestone }
  | { type: 'deleteMilestone'; id: string }
  | { type: 'upsertEvidence'; evidence: CareerEvidence }
  | { type: 'deleteEvidence'; id: string }
  | { type: 'upsertAchievement'; achievement: CareerAchievement }
  | { type: 'deleteAchievement'; id: string }
  | { type: 'upsertAssessment'; assessment: CareerAssessment }
  | { type: 'deleteAssessment'; id: string }
  | { type: 'upsertReview'; review: CareerReviewNote }
  | { type: 'dismissRecommendation'; id: string }
  | { type: 'snoozeRecommendations'; until: DayKey }
  | { type: 'resumeRecommendations' }
  | { type: 'reset'; doc: CareerDoc };

function replaceOrAppend<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

/**
 * Dismissals are day-scoped ids, so old ones can never match again. Keeping the
 * most recent entries bounds a document that would otherwise grow forever while
 * still covering any realistic "return to yesterday's list" scenario.
 */
const MAX_DISMISSED_RECOMMENDATIONS = 200;

function unlinkSkill(ids: readonly string[], skillId: string): string[] {
  return ids.filter((id) => id !== skillId);
}

function deleteSkillRefs(doc: CareerDoc, skillId: string): CareerDoc {
  return {
    ...doc,
    goals: doc.goals.map((goal) => ({
      ...goal,
      relatedSkillIds: unlinkSkill(goal.relatedSkillIds, skillId),
    })),
    milestones: doc.milestones.map((milestone) => ({
      ...milestone,
      relatedSkillIds: unlinkSkill(milestone.relatedSkillIds, skillId),
    })),
    evidence: doc.evidence.map((entry) => ({
      ...entry,
      skillIds: unlinkSkill(entry.skillIds, skillId),
    })),
    achievements: doc.achievements.map((entry) => ({
      ...entry,
      demonstratedSkillIds: unlinkSkill(entry.demonstratedSkillIds, skillId),
    })),
    assessments: doc.assessments.map((entry) => ({
      ...entry,
      skillIds: unlinkSkill(entry.skillIds, skillId),
    })),
  };
}

function deleteGoal(doc: CareerDoc, id: string, mode: 'archive' | 'delete', at: number): CareerDoc {
  const goal = doc.goals.find((entry) => entry.id === id);
  if (!goal) return doc;

  if (mode === 'archive') {
    return {
      ...doc,
      goals: doc.goals.map((entry) =>
        entry.id === id
          ? { ...entry, status: 'archived', archivedAt: at, updatedAt: at }
          : entry,
      ),
    };
  }

  const removedMilestoneIds = new Set(
    doc.milestones.filter((entry) => entry.goalId === id).map((entry) => entry.id),
  );

  return {
    ...doc,
    goals: doc.goals.filter((entry) => entry.id !== id),
    milestones: doc.milestones.filter((entry) => entry.goalId !== id),
    evidence: doc.evidence.map((entry) => {
      const wasForGoal = entry.goalId === id;
      const wasForMilestone =
        entry.milestoneId !== undefined && removedMilestoneIds.has(entry.milestoneId);
      if (!wasForGoal && !wasForMilestone) return entry;
      return {
        ...entry,
        goalId: wasForGoal ? undefined : entry.goalId,
        milestoneId: wasForMilestone ? undefined : entry.milestoneId,
        goalTitleSnapshot: wasForGoal || wasForMilestone ? goal.title : entry.goalTitleSnapshot,
      };
    }),
    achievements: doc.achievements.map((entry) =>
      entry.goalId === id
        ? { ...entry, goalId: undefined, goalTitleSnapshot: goal.title }
        : entry,
    ),
    assessments: doc.assessments.map((entry) =>
      entry.goalId === id
        ? { ...entry, goalId: undefined, goalTitleSnapshot: goal.title }
        : entry,
    ),
  };
}

export const initialCareerState: CareerState = {
  // Hydration replaces this in the same tick a provider mounts. It is empty
  // rather than seeded so a screen can never show suggested areas as if they
  // were the user's before the storage read has answered.
  doc: {
    version: CAREER_DOC_VERSION,
    profile: null,
    domains: [],
    goals: [],
    skills: [],
    milestones: [],
    evidence: [],
    achievements: [],
    assessments: [],
    reviews: [],
    recommendations: { dismissedIds: [] },
  },
  hydrated: false,
};

export function careerReducer(state: CareerState, action: CareerAction): CareerState {
  const doc = state.doc;

  switch (action.type) {
    case 'hydrated':
      return { doc: action.doc, hydrated: true };

    case 'setProfile':
      return { ...state, doc: { ...doc, profile: action.profile } };

    case 'upsertDomain':
      return {
        ...state,
        doc: { ...doc, domains: replaceOrAppend(doc.domains, action.domain) },
      };

    case 'toggleDomain':
      return {
        ...state,
        doc: {
          ...doc,
          domains: doc.domains.map((domain) =>
            domain.id === action.id
              ? { ...domain, isEnabled: action.enabled, updatedAt: action.at }
              : domain,
          ),
        },
      };

    case 'removeDomain':
      return {
        ...state,
        doc: {
          ...doc,
          domains: doc.domains.filter((domain) => domain.id !== action.id),
          // Unlink, never delete. A goal that lived in the removed area keeps its
          // history and remains editable.
          goals: doc.goals.map((goal) =>
            goal.domainId === action.id ? { ...goal, domainId: undefined } : goal,
          ),
          skills: doc.skills.map((skill) =>
            skill.domainId === action.id ? { ...skill, domainId: undefined } : skill,
          ),
        },
      };

    case 'restoreSuggestedDomains':
      return {
        ...state,
        doc: { ...doc, domains: seedDefaultDomains(doc.domains, action.at) },
      };

    case 'upsertGoal':
      return {
        ...state,
        doc: { ...doc, goals: replaceOrAppend(doc.goals, action.goal) },
      };

    case 'deleteGoal':
      return {
        ...state,
        doc: deleteGoal(doc, action.id, action.mode, action.at),
      };

    case 'upsertSkill':
      return {
        ...state,
        doc: { ...doc, skills: replaceOrAppend(doc.skills, action.skill) },
      };

    case 'deleteSkill':
      return {
        ...state,
        doc: deleteSkillRefs(
          { ...doc, skills: doc.skills.filter((skill) => skill.id !== action.id) },
          action.id,
        ),
      };

    case 'upsertMilestone':
      return {
        ...state,
        doc: { ...doc, milestones: replaceOrAppend(doc.milestones, action.milestone) },
      };

    case 'deleteMilestone':
      return {
        ...state,
        doc: {
          ...doc,
          milestones: doc.milestones.filter((milestone) => milestone.id !== action.id),
          evidence: doc.evidence.map((entry) =>
            entry.milestoneId === action.id
              ? { ...entry, milestoneId: undefined }
              : entry,
          ),
        },
      };

    case 'upsertEvidence':
      return {
        ...state,
        doc: { ...doc, evidence: replaceOrAppend(doc.evidence, action.evidence) },
      };

    case 'deleteEvidence':
      return {
        ...state,
        doc: {
          ...doc,
          evidence: doc.evidence.filter((entry) => entry.id !== action.id),
          achievements: doc.achievements.map((achievement) => ({
            ...achievement,
            evidenceIds: achievement.evidenceIds.filter((id) => id !== action.id),
          })),
        },
      };

    case 'upsertAchievement':
      return {
        ...state,
        doc: {
          ...doc,
          achievements: replaceOrAppend(doc.achievements, action.achievement),
        },
      };

    case 'deleteAchievement':
      return {
        ...state,
        doc: {
          ...doc,
          achievements: doc.achievements.filter(
            (achievement) => achievement.id !== action.id,
          ),
        },
      };

    case 'upsertAssessment':
      return {
        ...state,
        doc: {
          ...doc,
          assessments: replaceOrAppend(doc.assessments, action.assessment),
        },
      };

    case 'deleteAssessment':
      return {
        ...state,
        doc: {
          ...doc,
          assessments: doc.assessments.filter(
            (assessment) => assessment.id !== action.id,
          ),
        },
      };

    case 'upsertReview':
      return {
        ...state,
        doc: { ...doc, reviews: replaceOrAppend(doc.reviews, action.review) },
      };

    case 'dismissRecommendation': {
      if (doc.recommendations.dismissedIds.includes(action.id)) return state;
      return {
        ...state,
        doc: {
          ...doc,
          recommendations: {
            ...doc.recommendations,
            dismissedIds: [
              ...doc.recommendations.dismissedIds,
              action.id,
            ].slice(-MAX_DISMISSED_RECOMMENDATIONS),
          },
        },
      };
    }

    case 'snoozeRecommendations':
      return {
        ...state,
        doc: {
          ...doc,
          recommendations: {
            ...doc.recommendations,
            snoozedUntil: action.until,
          },
        },
      };

    case 'resumeRecommendations': {
      const recommendations = { ...doc.recommendations };
      delete recommendations.snoozedUntil;
      return {
        ...state,
        doc: { ...doc, recommendations },
      };
    }

    case 'reset':
      return { doc: action.doc, hydrated: true };

    default:
      return state;
  }
}
