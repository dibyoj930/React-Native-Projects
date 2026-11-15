/**
 * Career document migrations.
 *
 * Storage outlives the app version that wrote it. A migration runs *before*
 * sanitising, because its job is to translate a shape the current types no
 * longer speak; `sanitizeCareerDoc` then repairs whatever the result still gets
 * wrong.
 *
 * The rules here mirror `migrateTodos`:
 *
 *  - Every step is additive and lossless. Nothing is guessed into existence.
 *  - A malformed record is left for the sanitizer to drop or repair.
 *  - A document already at the current version is returned untouched.
 *
 * v1 → v2:
 *  - `profile.currentRole` becomes `designation`; `targetRole` becomes the first
 *    entry of `desiredRoles`. The old free-text `targetTimeline` is kept.
 *  - `goal.category` becomes `goalType` through an explicit mapping. `network`
 *    maps to `custom` rather than being guessed into a different goal type.
 *  - `skill.importance` seeds both `roleImportance` and `futureImportance`,
 *    because v1 could not distinguish the two.
 */

import { GOAL_TYPES, type GoalType } from './types';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as RecordValue;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The v1 goal category taxonomy, mapped onto the v2 goal types.
 *
 * `network` and `impact` are the ambiguous ones: v1 used `network` for
 * relationships and `impact` for outcomes, and neither maps cleanly onto a single
 * v2 type without guessing. They become `custom` / `milestone` respectively, and
 * the user can reclassify them.
 */
const LEGACY_CATEGORY_TO_GOAL_TYPE: Record<string, GoalType> = {
  role: 'performance',
  skill: 'skill',
  portfolio: 'portfolio',
  network: 'custom',
  learning: 'skill',
  certification: 'certification',
  impact: 'milestone',
  custom: 'custom',
};

function goalTypeFromLegacy(category: unknown): GoalType {
  const key = typeof category === 'string' ? category : '';
  if ((GOAL_TYPES as readonly string[]).includes(key)) return key as GoalType;
  return LEGACY_CATEGORY_TO_GOAL_TYPE[key] ?? 'custom';
}

function migrateProfile(value: unknown): unknown {
  const profile = asRecord(value);
  if (!profile) return value;

  const next: RecordValue = { ...profile };

  if (next.designation === undefined) {
    next.designation = text(profile.currentRole) ?? '';
  }
  delete next.currentRole;

  if (next.desiredRoles === undefined) {
    const target = text(profile.targetRole);
    next.desiredRoles = target ? [target] : [];
  }
  delete next.targetRole;

  if (next.expertiseAreas === undefined) next.expertiseAreas = [];
  if (next.interests === undefined) next.interests = [];
  if (next.targetOrganisations === undefined) next.targetOrganisations = [];

  return next;
}

function migrateGoal(value: unknown): unknown {
  const goal = asRecord(value);
  if (!goal) return value;

  const next: RecordValue = { ...goal };
  if (next.goalType === undefined) {
    next.goalType = goalTypeFromLegacy(goal.category);
  }
  if (next.customGoalType === undefined && text(goal.customCategory)) {
    next.customGoalType = text(goal.customCategory);
  }
  delete next.category;
  delete next.customCategory;

  return next;
}

function migrateSkill(value: unknown): unknown {
  const skill = asRecord(value);
  if (!skill) return value;

  const next: RecordValue = { ...skill };
  if (next.roleImportance === undefined) {
    next.roleImportance = skill.importance ?? 'medium';
  }
  if (next.futureImportance === undefined) {
    next.futureImportance = skill.importance ?? 'medium';
  }
  delete next.importance;

  return next;
}

function mapArray(value: unknown, migrate: (entry: unknown) => unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(migrate);
}

/**
 * Upgrade a stored document to the current version.
 *
 * `now` is accepted for symmetry with the sanitizer and future migrations that
 * need to stamp a value. This migration does not use it: inventing a timestamp
 * for a record that never had one would be worse than leaving it absent.
 */
export function migrateCareerDoc(value: unknown, _now: number = Date.now()): unknown {
  const doc = asRecord(value);
  if (!doc) return value;

  const version = typeof doc.version === 'number' ? doc.version : 1;
  if (version >= 2) return doc;

  return {
    ...doc,
    version: 2,
    profile: migrateProfile(doc.profile),
    goals: mapArray(doc.goals, migrateGoal),
    skills: mapArray(doc.skills, migrateSkill),
  };
}
