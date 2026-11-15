/**
 * Repair stored career data field by field.
 *
 * Storage outlives app versions and is user-writable. The rule is the same one
 * `migrateTodos` follows: a bad field costs that field, not the whole document.
 * A record missing the minimum needed to be meaningful (a title, a goal link, a
 * valid day) is dropped; everything else is repaired in place.
 *
 * No validation here invents progress. A missing assessment date does not become
 * today, a missing goal does not become "achieved", and a malformed metric does
 * not become zero — metadata timestamps are the only values that fall back.
 */

import { isValidDayKey } from '../shared/date';

import { createInitialCareerDoc, seedDefaultDomains, unique } from './factory';
import { migrateCareerDoc } from './migrations';
import {
  ACHIEVEMENT_CATEGORIES,
  ASSESSMENT_DIFFICULTIES,
  ASSESSMENT_TYPES,
  CAREER_DOC_VERSION,
  EVIDENCE_TYPES,
  GOAL_STATUSES,
  GOAL_TYPES,
  IMPORTANCE_VALUES,
  MILESTONE_STATUSES,
  PRIORITIES,
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
  type GoalStatus,
  type GoalType,
  type Importance,
  type MilestoneStatus,
  type Priority,
  type SkillLevel,
} from './types';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as RecordValue;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function requiredText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalText(value: unknown): string | undefined {
  const trimmed = requiredText(value);
  return trimmed ?? undefined;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number <= 0) return null;
  return number;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number < 0) return null;
  return number;
}

function dayKey(value: unknown): string | null {
  return isValidDayKey(value) ? value : null;
}

function optionalDayKey(value: unknown): string | undefined {
  return dayKey(value) ?? undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function skillLevel(value: unknown, fallback: SkillLevel): SkillLevel {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  const rounded = Math.round(number);
  if (rounded < 0) return 0;
  if (rounded > 5) return 5;
  return rounded as SkillLevel;
}

function confidence(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const number = finiteNumber(value);
  if (number === null) return 3;
  const rounded = Math.round(number);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded as 1 | 2 | 3 | 4 | 5;
}

function timestamp(value: unknown, fallback: number): number {
  return finiteNumber(value) ?? fallback;
}

/** Remove repeated ids, keeping the first well-formed record. */
function dedupeById<T extends { id: string }>(records: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
  }
  return result;
}

function sanitizeProfile(value: unknown, now: number): CareerProfile | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const experience = finiteNumber(raw.experienceYears);

  // v1 fallbacks. `migrateCareerDoc` normally runs first; these keep a direct
  // sanitize call honest too, without guessing a profession from a free-text role.
  const designation = optionalText(raw.designation) ?? optionalText(raw.currentRole) ?? '';
  const legacyTargetRole = optionalText(raw.targetRole);
  const desiredRoles = stringArray(raw.desiredRoles);
  if (desiredRoles.length === 0 && legacyTargetRole) desiredRoles.push(legacyTargetRole);

  return {
    profession: stringValue(raw.profession),
    designation,
    industry: stringValue(raw.industry),
    experienceYears:
      experience !== null && experience >= 0 ? Math.floor(experience) : null,
    responsibilities: stringValue(raw.responsibilities),
    expertiseAreas: stringArray(raw.expertiseAreas),
    interests: stringArray(raw.interests),
    shortTermGoals: stringValue(raw.shortTermGoals),
    longTermAmbitions: stringValue(raw.longTermAmbitions),
    desiredRoles,
    targetOrganisations: stringArray(raw.targetOrganisations),
    ...(optionalDayKey(raw.targetDate) ? { targetDate: optionalDayKey(raw.targetDate) } : {}),
    targetTimeline: stringValue(raw.targetTimeline),
    strengths: stringValue(raw.strengths),
    growthAreas: stringValue(raw.growthAreas),
    constraints: stringValue(raw.constraints),
    updatedAt: timestamp(raw.updatedAt, now),
  };
}

function sanitizeDomains(value: unknown, now: number): DevelopmentDomain[] {
  if (!Array.isArray(value)) return seedDefaultDomains([], now);

  const domains = value.flatMap((entry, index): DevelopmentDomain[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const name = requiredText(raw.name);
    if (!id || !name) return [];

    const order = finiteNumber(raw.order);
    return [
      {
        id,
        name,
        description: stringValue(raw.description),
        isCustom: raw.isCustom === true,
        isEnabled: raw.isEnabled !== false,
        order: order !== null ? Math.floor(order) : index,
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
      },
    ];
  });

  // A stored empty array is intentional: the user removed every area. Only a
  // missing or non-array field gets the suggested defaults.
  return dedupeById(domains);
}

function sanitizeGoals(value: unknown, now: number): CareerGoal[] {
  if (!Array.isArray(value)) return [];

  const goals = value.flatMap((entry): CareerGoal[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const title = requiredText(raw.title);
    if (!id || !title) return [];

    const status: GoalStatus = oneOf(raw.status, GOAL_STATUSES, 'active');
    // `goalType` is authoritative after migration; the legacy category is only a
    // last-resort fallback for a hand-edited document.
    const goalType: GoalType = oneOf(
      raw.goalType ?? raw.category,
      GOAL_TYPES,
      'custom',
    );
    const priority: Priority = oneOf(raw.priority, PRIORITIES, 'medium');
    const archivedAt = finiteNumber(raw.archivedAt);

    return [
      {
        id,
        title,
        description: stringValue(raw.description),
        goalType,
        ...(optionalText(raw.customGoalType) ?? optionalText(raw.customCategory)
          ? {
              customGoalType:
                optionalText(raw.customGoalType) ?? optionalText(raw.customCategory),
            }
          : {}),
        priority,
        status,
        ...(optionalDayKey(raw.targetDate)
          ? { targetDate: optionalDayKey(raw.targetDate) }
          : {}),
        successCriteria: stringValue(raw.successCriteria),
        ...(optionalText(raw.domainId) ? { domainId: optionalText(raw.domainId) } : {}),
        relatedSkillIds: stringArray(raw.relatedSkillIds),
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
        ...(archivedAt !== null ? { archivedAt } : {}),
      },
    ];
  });

  return dedupeById(goals);
}

function sanitizeSkills(value: unknown, now: number): CareerSkill[] {
  if (!Array.isArray(value)) return [];

  const skills = value.flatMap((entry): CareerSkill[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const name = requiredText(raw.name);
    if (!id || !name) return [];

    // v1 stored one importance. It seeds both axes rather than the sanitizer
    // inventing a difference the user never expressed.
    const roleImportance: Importance = oneOf(
      raw.roleImportance ?? raw.importance,
      IMPORTANCE_VALUES,
      'medium',
    );
    const futureImportance: Importance = oneOf(
      raw.futureImportance ?? raw.importance,
      IMPORTANCE_VALUES,
      'medium',
    );
    return [
      {
        id,
        name,
        description: stringValue(raw.description),
        ...(optionalText(raw.domainId) ? { domainId: optionalText(raw.domainId) } : {}),
        currentLevel: skillLevel(raw.currentLevel, 0),
        targetLevel: skillLevel(raw.targetLevel, 0),
        confidence: confidence(raw.confidence),
        roleImportance,
        futureImportance,
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
      },
    ];
  });

  return dedupeById(skills);
}

function sanitizeMilestones(value: unknown, now: number): CareerMilestone[] {
  if (!Array.isArray(value)) return [];

  const milestones = value.flatMap((entry): CareerMilestone[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const goalId = requiredText(raw.goalId);
    const title = requiredText(raw.title);
    if (!id || !goalId || !title) return [];

    const status: MilestoneStatus = oneOf(raw.status, MILESTONE_STATUSES, 'not-started');
    const completedAt = finiteNumber(raw.completedAt);

    return [
      {
        id,
        goalId,
        title,
        description: stringValue(raw.description),
        ...(optionalDayKey(raw.targetDate)
          ? { targetDate: optionalDayKey(raw.targetDate) }
          : {}),
        status,
        relatedSkillIds: stringArray(raw.relatedSkillIds),
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
        ...(completedAt !== null ? { completedAt } : {}),
      },
    ];
  });

  return dedupeById(milestones);
}

function sanitizeEvidence(value: unknown, now: number): CareerEvidence[] {
  if (!Array.isArray(value)) return [];

  const evidence = value.flatMap((entry): CareerEvidence[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const title = requiredText(raw.title);
    const occurredOn = dayKey(raw.occurredOn);
    if (!id || !title || !occurredOn) return [];

    const score = nonNegativeNumber(raw.score);

    return [
      {
        id,
        title,
        description: stringValue(raw.description),
        type: oneOf(raw.type, EVIDENCE_TYPES, 'other'),
        occurredOn,
        score: score !== null ? score : undefined,
        skillIds: stringArray(raw.skillIds),
        ...(optionalText(raw.goalId) ? { goalId: optionalText(raw.goalId) } : {}),
        ...(optionalText(raw.milestoneId)
          ? { milestoneId: optionalText(raw.milestoneId) }
          : {}),
        ...(optionalText(raw.source) ? { source: optionalText(raw.source) } : {}),
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
        ...(optionalText(raw.goalTitleSnapshot)
          ? { goalTitleSnapshot: optionalText(raw.goalTitleSnapshot) }
          : {}),
      },
    ];
  });

  return dedupeById(evidence);
}

function sanitizeAchievements(value: unknown, now: number): CareerAchievement[] {
  if (!Array.isArray(value)) return [];

  const achievements = value.flatMap((entry): CareerAchievement[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const title = requiredText(raw.title);
    const date = dayKey(raw.date);
    if (!id || !title || !date) return [];

    return [
      {
        id,
        title,
        description: stringValue(raw.description),
        category: oneOf(raw.category, ACHIEVEMENT_CATEGORIES, 'other'),
        date,
        impact: stringValue(raw.impact),
        metrics: stringValue(raw.metrics),
        demonstratedSkillIds: stringArray(raw.demonstratedSkillIds),
        evidenceIds: stringArray(raw.evidenceIds),
        ...(optionalText(raw.goalId) ? { goalId: optionalText(raw.goalId) } : {}),
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
        ...(optionalText(raw.goalTitleSnapshot)
          ? { goalTitleSnapshot: optionalText(raw.goalTitleSnapshot) }
          : {}),
      },
    ];
  });

  return dedupeById(achievements);
}

function sanitizeAssessments(value: unknown, now: number): CareerAssessment[] {
  if (!Array.isArray(value)) return [];

  const assessments = value.flatMap((entry): CareerAssessment[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const title = requiredText(raw.title);
    const assessedOn = dayKey(raw.assessedOn);
    if (!id || !title || !assessedOn) return [];

    const score = finiteNumber(raw.score);
    const maxScoreValue = positiveNumber(raw.maxScore);
    const maxScore = maxScoreValue !== null ? maxScoreValue : null;
    const boundedScore =
      score !== null && score >= 0 && (maxScore === null || score <= maxScore)
        ? score
        : null;
    const timeTaken = positiveNumber(raw.timeTakenMins);
    const proficiency = finiteNumber(raw.proficiencyLevel);

    return [
      {
        id,
        title,
        type: oneOf(raw.type, ASSESSMENT_TYPES, 'custom'),
        assessedOn,
        skillIds: stringArray(raw.skillIds),
        ...(optionalText(raw.goalId) ? { goalId: optionalText(raw.goalId) } : {}),
        score: boundedScore,
        maxScore,
        proficiencyLevel:
          proficiency !== null && proficiency >= 0 && proficiency <= 5
            ? (Math.round(proficiency) as SkillLevel)
            : null,
        timeTakenMins: timeTaken !== null ? Math.round(timeTaken) : null,
        difficulty: oneOf(raw.difficulty, ASSESSMENT_DIFFICULTIES, 'medium'),
        notes: stringValue(raw.notes),
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
        ...(optionalText(raw.goalTitleSnapshot)
          ? { goalTitleSnapshot: optionalText(raw.goalTitleSnapshot) }
          : {}),
      },
    ];
  });

  return dedupeById(assessments);
}

function sanitizeReviews(value: unknown, now: number): CareerReviewNote[] {
  if (!Array.isArray(value)) return [];

  const reviews = value.flatMap((entry): CareerReviewNote[] => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const id = requiredText(raw.id);
    const periodStart = dayKey(raw.periodStart);
    const periodEnd = dayKey(raw.periodEnd);
    if (!id || !periodStart || !periodEnd) return [];

    return [
      {
        id,
        period: raw.period === 'month' ? 'month' : 'week',
        periodStart,
        periodEnd,
        notes: stringValue(raw.notes),
        wins: stringValue(raw.wins),
        challenges: stringValue(raw.challenges),
        nextPriorities: stringArray(raw.nextPriorities),
        createdAt: timestamp(raw.createdAt, now),
        updatedAt: timestamp(raw.updatedAt, now),
      },
    ];
  });

  return dedupeById(reviews);
}

function sanitizeRecommendations(value: unknown): CareerDoc['recommendations'] {
  const raw = asRecord(value);
  if (!raw) return { dismissedIds: [] };
  return {
    dismissedIds: stringArray(raw.dismissedIds),
    ...(optionalDayKey(raw.snoozedUntil)
      ? { snoozedUntil: optionalDayKey(raw.snoozedUntil) }
      : {}),
    ...(optionalDayKey(raw.lastEvaluatedOn)
      ? { lastEvaluatedOn: optionalDayKey(raw.lastEvaluatedOn) }
      : {}),
  };
}

export function sanitizeCareerDoc(value: unknown, now: number = Date.now()): CareerDoc {
  // Migrate first. `asRecord` would otherwise discard the legacy fields the
  // migration needs, and a caller that passes a v1 document directly should get
  // the same result as one read through storage.
  const migrated = migrateCareerDoc(value, now);
  const raw = asRecord(migrated);
  if (!raw) return createInitialCareerDoc(now);

  return {
    version: CAREER_DOC_VERSION,
    profile: sanitizeProfile(raw.profile, now),
    domains: sanitizeDomains(raw.domains, now),
    goals: sanitizeGoals(raw.goals, now),
    skills: sanitizeSkills(raw.skills, now),
    milestones: sanitizeMilestones(raw.milestones, now),
    evidence: sanitizeEvidence(raw.evidence, now),
    achievements: sanitizeAchievements(raw.achievements, now),
    assessments: sanitizeAssessments(raw.assessments, now),
    reviews: sanitizeReviews(raw.reviews, now),
    recommendations: sanitizeRecommendations(raw.recommendations),
  };
}
