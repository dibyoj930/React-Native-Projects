/**
 * The career storage boundary.
 *
 * One key holds the whole document. A read repairs and migrates; it never
 * throws. A write goes through the serialized queue so an explicit reset cannot
 * be undone by a save that was already scheduled.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CAREER_STORAGE_KEY,
  clearCareerDoc,
  loadCareerDoc,
  saveCareerDoc,
} from '../../career/storage';
import { createInitialCareerDoc } from '../../career/factory';

const NOW = 1_760_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('loadCareerDoc', () => {
  it('seeds suggested areas when nothing has been stored', async () => {
    const doc = await loadCareerDoc(NOW);

    expect(doc.version).toBe(2);
    expect(doc.profile).toBeNull();
    expect(doc.domains.length).toBeGreaterThan(0);
    expect(doc.domains.every((domain) => domain.isEnabled)).toBe(true);
  });

  it('migrates a stored v1 document on the way in', async () => {
    await AsyncStorage.setItem(
      CAREER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        profile: {
          currentRole: 'Site supervisor',
          targetRole: 'Project manager',
          industry: 'construction',
        },
        goals: [{ id: 'g1', title: 'Lead a package', category: 'role' }],
        skills: [{ id: 's1', name: 'Planning', importance: 'high' }],
      }),
    );

    const doc = await loadCareerDoc(NOW);

    expect(doc.version).toBe(2);
    expect(doc.profile?.designation).toBe('Site supervisor');
    expect(doc.profile?.desiredRoles).toEqual(['Project manager']);
    expect(doc.profile?.industry).toBe('construction');
    expect(doc.goals[0].goalType).toBe('performance');
    expect(doc.skills[0]).toMatchObject({
      roleImportance: 'high',
      futureImportance: 'high',
    });
  });

  it('degrades malformed JSON to a usable document instead of throwing', async () => {
    await AsyncStorage.setItem(CAREER_STORAGE_KEY, '{ not json');

    const doc = await loadCareerDoc(NOW);
    expect(doc).toEqual(createInitialCareerDoc(NOW));
  });

  it('drops a non-object stored value', async () => {
    await AsyncStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(['not', 'a', 'doc']));

    const doc = await loadCareerDoc(NOW);
    expect(doc).toEqual(createInitialCareerDoc(NOW));
  });
});

describe('saveCareerDoc', () => {
  it('round-trips the v2 fields, including two-axis importance and evidence score', async () => {
    const doc = createInitialCareerDoc(NOW);
    await saveCareerDoc({
      ...doc,
      profile: {
        profession: 'nursing',
        designation: 'Staff nurse',
        industry: 'healthcare',
        experienceYears: 4,
        responsibilities: 'Ward care',
        expertiseAreas: ['patient care'],
        interests: ['research'],
        shortTermGoals: '',
        longTermAmbitions: '',
        desiredRoles: ['Ward manager'],
        targetOrganisations: [],
        targetDate: '2027-04-01',
        targetTimeline: '',
        strengths: '',
        growthAreas: '',
        constraints: '',
        updatedAt: NOW,
      },
      skills: [
        {
          id: 's1',
          name: 'Triage',
          description: '',
          currentLevel: 2,
          targetLevel: 4,
          confidence: 3,
          roleImportance: 'high',
          futureImportance: 'low',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      evidence: [
        {
          id: 'e1',
          title: 'Triage shift',
          description: '',
          type: 'practice',
          occurredOn: '2026-03-01',
          score: 8,
          skillIds: ['s1'],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    const loaded = await loadCareerDoc(NOW);
    expect(loaded.profile?.designation).toBe('Staff nurse');
    expect(loaded.profile?.desiredRoles).toEqual(['Ward manager']);
    expect(loaded.profile?.targetDate).toBe('2027-04-01');
    expect(loaded.skills[0]).toMatchObject({
      roleImportance: 'high',
      futureImportance: 'low',
    });
    expect(loaded.evidence[0].score).toBe(8);
    expect(loaded.version).toBe(2);
  });

  it('sanitises on the way out, so an impossible score is not persisted', async () => {
    const doc = createInitialCareerDoc(NOW);
    await saveCareerDoc({
      ...doc,
      evidence: [
        {
          id: 'e1',
          title: 'Bad score',
          description: '',
          type: 'practice',
          occurredOn: '2026-03-01',
          score: -3,
          skillIds: [],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    const loaded = await loadCareerDoc(NOW);
    expect(loaded.evidence[0].score).toBeUndefined();
  });

  it('keeps a reset from being undone by an earlier queued save', async () => {
    const doc = createInitialCareerDoc(NOW);

    const save = saveCareerDoc(doc);
    const clear = clearCareerDoc();
    await Promise.all([save, clear]);

    expect(await AsyncStorage.getItem(CAREER_STORAGE_KEY)).toBeNull();
  });
});
