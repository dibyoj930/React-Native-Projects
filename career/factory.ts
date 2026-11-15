/**
 * Factories for career records.
 *
 * Ids and timestamps are assigned here, not in the UI, so every entity has the
 * same shape wherever it is created. The factories are pure apart from the
 * optional `now` argument (which defaults to the clock for convenience), and
 * they never read or write storage.
 */

import { DEFAULT_DEVELOPMENT_DOMAINS } from './defaults';
import {
  CAREER_DOC_VERSION,
  type CareerAchievement,
  type CareerAchievementDraft,
  type CareerAssessment,
  type CareerAssessmentDraft,
  type CareerDoc,
  type CareerEvidence,
  type CareerEvidenceDraft,
  type CareerGoal,
  type CareerGoalDraft,
  type CareerMilestone,
  type CareerMilestoneDraft,
  type CareerProfile,
  type CareerProfileDraft,
  type CareerReviewDraft,
  type CareerReviewNote,
  type CareerSkill,
  type CareerSkillDraft,
  type DevelopmentDomain,
} from './types';

/**
 * A collision-resistant id.
 *
 * The counter matters because several records can be created in the same
 * millisecond (seeding domains, or a fast double-tap). The timestamp keeps ids
 * sortable-ish across launches; the counter keeps them unique within one.
 */
let idCounter = 0;

export function nextCareerId(prefix: string, now: number = Date.now()): string {
  idCounter += 1;
  return `career_${prefix}_${now.toString(36)}_${idCounter.toString(36)}`;
}

/** A complete, empty document with no domains and no history. */
export function emptyCareerDoc(): CareerDoc {
  return {
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
  };
}

/** Seed the suggested areas without overwriting or duplicating existing ones. */
export function seedDefaultDomains(
  existing: readonly DevelopmentDomain[],
  now: number = Date.now(),
): DevelopmentDomain[] {
  const byId = new Map(existing.map((domain) => [domain.id, domain]));
  const seeded = [...existing];

  DEFAULT_DEVELOPMENT_DOMAINS.forEach((suggestion, index) => {
    if (byId.has(suggestion.id)) return;
    seeded.push(
      createDevelopmentDomain(
        {
          ...suggestion,
          isCustom: false,
          isEnabled: true,
          order: index,
        },
        now,
      ),
    );
  });

  return seeded;
}

/** A new document with the suggested development areas enabled. */
export function createInitialCareerDoc(now: number = Date.now()): CareerDoc {
  return {
    ...emptyCareerDoc(),
    domains: seedDefaultDomains([], now),
  };
}

export function createCareerProfile(
  draft: CareerProfileDraft,
  now: number = Date.now(),
): CareerProfile {
  return {
    ...draft,
    expertiseAreas: unique(draft.expertiseAreas),
    interests: unique(draft.interests),
    desiredRoles: unique(draft.desiredRoles),
    targetOrganisations: unique(draft.targetOrganisations),
    updatedAt: now,
  };
}

export function createDevelopmentDomain(
  draft: Pick<
    DevelopmentDomain,
    'id' | 'name' | 'description' | 'isCustom' | 'isEnabled' | 'order'
  >,
  now: number = Date.now(),
): DevelopmentDomain {
  return {
    ...draft,
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerGoal(
  draft: CareerGoalDraft,
  now: number = Date.now(),
): CareerGoal {
  return {
    ...draft,
    id: nextCareerId('goal', now),
    relatedSkillIds: unique(draft.relatedSkillIds),
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerSkill(
  draft: CareerSkillDraft,
  now: number = Date.now(),
): CareerSkill {
  return {
    ...draft,
    id: nextCareerId('skill', now),
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerMilestone(
  goalId: string,
  draft: CareerMilestoneDraft,
  now: number = Date.now(),
): CareerMilestone {
  return {
    ...draft,
    id: nextCareerId('milestone', now),
    goalId,
    relatedSkillIds: unique(draft.relatedSkillIds),
    createdAt: now,
    updatedAt: now,
    ...(draft.status === 'completed' ? { completedAt: now } : {}),
  };
}

export function createCareerEvidence(
  draft: CareerEvidenceDraft,
  now: number = Date.now(),
): CareerEvidence {
  return {
    ...draft,
    id: nextCareerId('evidence', now),
    skillIds: unique(draft.skillIds),
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerAchievement(
  draft: CareerAchievementDraft,
  now: number = Date.now(),
): CareerAchievement {
  return {
    ...draft,
    id: nextCareerId('achievement', now),
    demonstratedSkillIds: unique(draft.demonstratedSkillIds),
    evidenceIds: unique(draft.evidenceIds),
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerAssessment(
  draft: CareerAssessmentDraft,
  now: number = Date.now(),
): CareerAssessment {
  return {
    ...draft,
    id: nextCareerId('assessment', now),
    skillIds: unique(draft.skillIds),
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerReviewNote(
  draft: CareerReviewDraft,
  now: number = Date.now(),
): CareerReviewNote {
  return {
    ...draft,
    id: nextCareerId('review', now),
    nextPriorities: unique(draft.nextPriorities),
    createdAt: now,
    updatedAt: now,
  };
}

/** Stable de-duplication that preserves the caller's order. */
export function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
