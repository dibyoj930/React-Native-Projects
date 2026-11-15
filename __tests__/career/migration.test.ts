/**
 * Career document migrations.
 *
 * These tests pin the translation from v1 shapes to v2. A migration is allowed
 * to preserve text and copy an ambiguous field into two places; it is not
 * allowed to invent a profession, a goal type the user never chose, or a value
 * that was not already present.
 */

import { migrateCareerDoc } from '../../career/migrations';
import { sanitizeCareerDoc } from '../../career/sanitize';

const NOW = 1_760_000_000_000;

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('migrateCareerDoc v1 → v2', () => {
  it('turns the v1 role fields into designation and desired roles', () => {
    const migrated = record(
      migrateCareerDoc(
        {
          version: 1,
          profile: {
            currentRole: 'Senior carer',
            targetRole: 'Ward manager',
            targetTimeline: 'within 18 months',
            strengths: 'calm under pressure',
          },
        },
        NOW,
      ),
    );

    const profile = record(migrated.profile);
    expect(migrated.version).toBe(2);
    expect(profile.designation).toBe('Senior carer');
    expect(profile.desiredRoles).toEqual(['Ward manager']);
    expect(profile.targetTimeline).toBe('within 18 months');
    expect(profile.strengths).toBe('calm under pressure');
    expect(profile.expertiseAreas).toEqual([]);
    expect(profile.interests).toEqual([]);
    expect(profile.targetOrganisations).toEqual([]);
    expect(profile).not.toHaveProperty('currentRole');
    expect(profile).not.toHaveProperty('targetRole');
  });

  it('maps every v1 goal category onto the v2 taxonomy', () => {
    const categories = [
      ['role', 'performance'],
      ['skill', 'skill'],
      ['portfolio', 'portfolio'],
      ['network', 'custom'],
      ['learning', 'skill'],
      ['certification', 'certification'],
      ['impact', 'milestone'],
      ['custom', 'custom'],
    ] as const;

    const migrated = record(
      migrateCareerDoc(
        {
          version: 1,
          goals: categories.map(([category], index) => ({
            id: `g${index}`,
            title: category,
            category,
          })),
        },
        NOW,
      ),
    );

    const goals = migrated.goals as Array<Record<string, unknown>>;
    expect(goals.map((goal) => goal.goalType)).toEqual(
      categories.map(([, expected]) => expected),
    );
    expect(goals.every((goal) => !('category' in goal))).toBe(true);
  });

  it('keeps a legacy custom category label as the v2 custom type label', () => {
    const migrated = record(
      migrateCareerDoc(
        {
          version: 1,
          goals: [
            {
              id: 'g1',
              title: 'Something specific',
              category: 'custom',
              customCategory: 'Community leadership',
            },
          ],
        },
        NOW,
      ),
    );

    expect(record((migrated.goals as unknown[])[0])).toMatchObject({
      goalType: 'custom',
      customGoalType: 'Community leadership',
    });
    expect((migrated.goals as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'customCategory',
    );
  });

  it('seeds both importance axes from the single v1 value', () => {
    const migrated = record(
      migrateCareerDoc(
        {
          version: 1,
          skills: [
            { id: 's1', name: 'Handover', importance: 'high' },
            { id: 's2', name: 'Scheduling' },
          ],
        },
        NOW,
      ),
    );

    const [first, second] = migrated.skills as Array<Record<string, unknown>>;
    expect(first).toMatchObject({
      roleImportance: 'high',
      futureImportance: 'high',
    });
    expect(first).not.toHaveProperty('importance');
    expect(second).toMatchObject({
      roleImportance: 'medium',
      futureImportance: 'medium',
    });
  });

  it('does not invent a goal type from an unknown category', () => {
    const migrated = record(
      migrateCareerDoc(
        { version: 1, goals: [{ id: 'g1', title: 'Odd', category: 'unheard-of' }] },
        NOW,
      ),
    );

    expect(record((migrated.goals as unknown[])[0]).goalType).toBe('custom');
  });

  it('leaves an already-current document untouched', () => {
    const current = {
      version: 2,
      profile: { designation: 'Analyst' },
      goals: [{ id: 'g1', goalType: 'skill' }],
      skills: [{ id: 's1', roleImportance: 'high', futureImportance: 'low' }],
    };

    expect(migrateCareerDoc(current, NOW)).toBe(current);
  });

  it('leaves malformed records for the sanitizer to drop', () => {
    const migrated = record(
      migrateCareerDoc({ version: 1, goals: [null, 42, 'not a goal'] }, NOW),
    );
    expect(migrated.goals).toEqual([null, 42, 'not a goal']);
  });

  it('runs as part of sanitising, so a direct read cannot skip it', () => {
    const doc = sanitizeCareerDoc(
      {
        version: 1,
        profile: { currentRole: 'Teacher', targetRole: 'Head of year' },
        goals: [{ id: 'g1', title: 'Move into leadership', category: 'role' }],
        skills: [{ id: 's1', name: 'Coaching', importance: 'high' }],
      },
      NOW,
    );

    expect(doc.version).toBe(2);
    expect(doc.profile?.designation).toBe('Teacher');
    expect(doc.profile?.desiredRoles).toEqual(['Head of year']);
    expect(doc.goals[0].goalType).toBe('performance');
    expect(doc.skills[0].roleImportance).toBe('high');
    expect(doc.skills[0].futureImportance).toBe('high');
  });
});
