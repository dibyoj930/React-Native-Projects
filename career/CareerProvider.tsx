/**
 * Owns the career document: hydration, mutations and persistence.
 *
 * Mirrors `ProductivityProvider`: one plain context, one reducer, one debounced
 * write. The provider is the only place that stamps `Date.now()`, which keeps
 * the reducer deterministic and the factories testable.
 *
 * Cross-domain task links are deliberately absent here. A career record does not
 * own a task, and a task deletion must never be able to reach into this
 * document. The one-way link lives on `Todo`, and `career/linkage.ts` derives the
 * linked work from it without writing anything back.
 */

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

import type { DayKey } from '../shared/date';

import {
  createCareerAchievement,
  createCareerAssessment,
  createCareerEvidence,
  createCareerGoal,
  createCareerMilestone,
  createCareerReviewNote,
  createCareerSkill,
  createCareerProfile,
  createDevelopmentDomain,
  createInitialCareerDoc,
  nextCareerId,
} from './factory';
import { careerReducer, initialCareerState } from './reducer';
import { clearCareerDoc, loadCareerDoc, saveCareerDoc } from './storage';
import type {
  CareerAchievementDraft,
  CareerAssessmentDraft,
  CareerEvidenceDraft,
  CareerGoalDraft,
  CareerMilestoneDraft,
  CareerProfileDraft,
  CareerReviewDraft,
  CareerSkillDraft,
  CareerDoc,
  GoalStatus,
  MilestoneStatus,
} from './types';

const SAVE_DEBOUNCE_MS = 800;

export type CareerContextValue = {
  doc: CareerDoc;
  hydrated: boolean;
  saveProfile: (draft: CareerProfileDraft) => void;
  addDomain: (name: string, description: string) => void;
  editDomain: (id: string, name: string, description: string) => void;
  toggleDomain: (id: string, enabled: boolean) => void;
  removeDomain: (id: string) => void;
  restoreSuggestedDomains: () => void;
  saveGoal: (draft: CareerGoalDraft, id?: string) => void;
  setGoalStatus: (id: string, status: GoalStatus) => void;
  deleteGoal: (id: string, mode: 'archive' | 'delete') => void;
  saveSkill: (draft: CareerSkillDraft, id?: string) => void;
  deleteSkill: (id: string) => void;
  saveMilestone: (goalId: string, draft: CareerMilestoneDraft, id?: string) => void;
  setMilestoneStatus: (id: string, status: MilestoneStatus) => void;
  deleteMilestone: (id: string) => void;
  saveEvidence: (draft: CareerEvidenceDraft, id?: string) => void;
  deleteEvidence: (id: string) => void;
  saveAchievement: (draft: CareerAchievementDraft, id?: string) => void;
  deleteAchievement: (id: string) => void;
  saveAssessment: (draft: CareerAssessmentDraft, id?: string) => void;
  deleteAssessment: (id: string) => void;
  saveReview: (draft: CareerReviewDraft, id?: string) => void;
  dismissRecommendation: (id: string) => void;
  snoozeRecommendations: (until: DayKey) => void;
  resumeRecommendations: () => void;
  resetCareer: () => void;
};

const CareerContext = React.createContext<CareerContextValue | null>(null);

export function CareerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(careerReducer, initialCareerState);

  useEffect(() => {
    let active = true;
    loadCareerDoc().then((doc) => {
      if (active) dispatch({ type: 'hydrated', doc });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return undefined;
    const timeout = setTimeout(() => {
      saveCareerDoc(state.doc);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [state.doc, state.hydrated]);

  const saveProfile = useCallback((draft: CareerProfileDraft) => {
    dispatch({ type: 'setProfile', profile: createCareerProfile(draft, Date.now()) });
  }, []);

  const addDomain = useCallback((name: string, description: string) => {
    const now = Date.now();
    const id = nextCareerId('domain', now);
    dispatch({
      type: 'upsertDomain',
      domain: createDevelopmentDomain(
        {
          id,
          name: name.trim(),
          description: description.trim(),
          isCustom: true,
          isEnabled: true,
          order: Number.MAX_SAFE_INTEGER,
        },
        now,
      ),
    });
  }, []);

  const toggleDomain = useCallback((id: string, enabled: boolean) => {
    dispatch({ type: 'toggleDomain', id, enabled, at: Date.now() });
  }, []);

  const editDomain = useCallback(
    (id: string, name: string, description: string) => {
      const domain = state.doc.domains.find((entry) => entry.id === id);
      if (!domain) return;
      dispatch({
        type: 'upsertDomain',
        domain: {
          ...domain,
          name: name.trim(),
          description: description.trim(),
          updatedAt: Date.now(),
        },
      });
    },
    [state.doc.domains],
  );

  const removeDomain = useCallback((id: string) => {
    dispatch({ type: 'removeDomain', id });
  }, []);

  const restoreSuggestedDomains = useCallback(() => {
    dispatch({ type: 'restoreSuggestedDomains', at: Date.now() });
  }, []);

  const saveGoal = useCallback((draft: CareerGoalDraft, id?: string) => {
    const now = Date.now();
    const existing = id ? state.doc.goals.find((goal) => goal.id === id) : undefined;
    if (existing) {
      dispatch({
        type: 'upsertGoal',
        goal: {
          ...existing,
          ...draft,
          updatedAt: now,
          archivedAt: draft.status === 'archived' ? existing.archivedAt ?? now : undefined,
        },
      });
      return;
    }
    dispatch({ type: 'upsertGoal', goal: createCareerGoal(draft, now) });
  }, [state.doc.goals]);

  const setGoalStatus = useCallback(
    (id: string, status: GoalStatus) => {
      const goal = state.doc.goals.find((entry) => entry.id === id);
      if (!goal) return;
      const now = Date.now();
      dispatch({
        type: 'upsertGoal',
        goal: {
          ...goal,
          status,
          updatedAt: now,
          archivedAt: status === 'archived' ? now : undefined,
        },
      });
    },
    [state.doc.goals],
  );

  const deleteGoal = useCallback((id: string, mode: 'archive' | 'delete') => {
    dispatch({ type: 'deleteGoal', id, mode, at: Date.now() });
  }, []);

  const saveSkill = useCallback((draft: CareerSkillDraft, id?: string) => {
    const now = Date.now();
    const existing = id ? state.doc.skills.find((skill) => skill.id === id) : undefined;
    if (existing) {
      dispatch({ type: 'upsertSkill', skill: { ...existing, ...draft, updatedAt: now } });
      return;
    }
    dispatch({ type: 'upsertSkill', skill: createCareerSkill(draft, now) });
  }, [state.doc.skills]);

  const deleteSkill = useCallback((id: string) => {
    dispatch({ type: 'deleteSkill', id });
  }, []);

  const saveMilestone = useCallback(
    (goalId: string, draft: CareerMilestoneDraft, id?: string) => {
      const now = Date.now();
      const existing = id
        ? state.doc.milestones.find((milestone) => milestone.id === id)
        : undefined;
      if (existing) {
        const completedNow =
          draft.status === 'completed' && existing.status !== 'completed'
            ? { completedAt: now }
            : draft.status !== 'completed'
              ? { completedAt: undefined }
              : {};
        dispatch({
          type: 'upsertMilestone',
          milestone: {
            ...existing,
            ...draft,
            ...completedNow,
            updatedAt: now,
          },
        });
        return;
      }
      dispatch({
        type: 'upsertMilestone',
        milestone: createCareerMilestone(goalId, draft, now),
      });
    },
    [state.doc.milestones],
  );

  const setMilestoneStatus = useCallback(
    (id: string, status: MilestoneStatus) => {
      const milestone = state.doc.milestones.find((entry) => entry.id === id);
      if (!milestone) return;
      const now = Date.now();
      dispatch({
        type: 'upsertMilestone',
        milestone: {
          ...milestone,
          status,
          completedAt:
            status === 'completed'
              ? milestone.completedAt ?? now
              : undefined,
          updatedAt: now,
        },
      });
    },
    [state.doc.milestones],
  );

  const deleteMilestone = useCallback((id: string) => {
    dispatch({ type: 'deleteMilestone', id });
  }, []);

  const saveEvidence = useCallback((draft: CareerEvidenceDraft, id?: string) => {
    const now = Date.now();
    const existing = id ? state.doc.evidence.find((entry) => entry.id === id) : undefined;
    if (existing) {
      dispatch({ type: 'upsertEvidence', evidence: { ...existing, ...draft, updatedAt: now } });
      return;
    }
    dispatch({ type: 'upsertEvidence', evidence: createCareerEvidence(draft, now) });
  }, [state.doc.evidence]);

  const deleteEvidence = useCallback((id: string) => {
    dispatch({ type: 'deleteEvidence', id });
  }, []);

  const saveAchievement = useCallback(
    (draft: CareerAchievementDraft, id?: string) => {
      const now = Date.now();
      const existing = id
        ? state.doc.achievements.find((entry) => entry.id === id)
        : undefined;
      if (existing) {
        dispatch({
          type: 'upsertAchievement',
          achievement: { ...existing, ...draft, updatedAt: now },
        });
        return;
      }
      dispatch({
        type: 'upsertAchievement',
        achievement: createCareerAchievement(draft, now),
      });
    },
    [state.doc.achievements],
  );

  const deleteAchievement = useCallback((id: string) => {
    dispatch({ type: 'deleteAchievement', id });
  }, []);

  const saveAssessment = useCallback(
    (draft: CareerAssessmentDraft, id?: string) => {
      const now = Date.now();
      const existing = id
        ? state.doc.assessments.find((entry) => entry.id === id)
        : undefined;
      if (existing) {
        dispatch({
          type: 'upsertAssessment',
          assessment: { ...existing, ...draft, updatedAt: now },
        });
        return;
      }
      dispatch({
        type: 'upsertAssessment',
        assessment: createCareerAssessment(draft, now),
      });
    },
    [state.doc.assessments],
  );

  const deleteAssessment = useCallback((id: string) => {
    dispatch({ type: 'deleteAssessment', id });
  }, []);

  const saveReview = useCallback((draft: CareerReviewDraft, id?: string) => {
    const now = Date.now();
    const existing = id ? state.doc.reviews.find((entry) => entry.id === id) : undefined;
    if (existing) {
      dispatch({ type: 'upsertReview', review: { ...existing, ...draft, updatedAt: now } });
      return;
    }
    dispatch({ type: 'upsertReview', review: createCareerReviewNote(draft, now) });
  }, [state.doc.reviews]);

  const dismissRecommendation = useCallback((id: string) => {
    dispatch({ type: 'dismissRecommendation', id });
  }, []);

  const snoozeRecommendations = useCallback((until: DayKey) => {
    dispatch({ type: 'snoozeRecommendations', until });
  }, []);

  const resumeRecommendations = useCallback(() => {
    dispatch({ type: 'resumeRecommendations' });
  }, []);

  const resetCareer = useCallback(() => {
    clearCareerDoc();
    dispatch({ type: 'reset', doc: createInitialCareerDoc(Date.now()) });
  }, []);

  const value = useMemo<CareerContextValue>(
    () => ({
      doc: state.doc,
      hydrated: state.hydrated,
      saveProfile,
      addDomain,
      editDomain,
      toggleDomain,
      removeDomain,
      restoreSuggestedDomains,
      saveGoal,
      setGoalStatus,
      deleteGoal,
      saveSkill,
      deleteSkill,
      saveMilestone,
      setMilestoneStatus,
      deleteMilestone,
      saveEvidence,
      deleteEvidence,
      saveAchievement,
      deleteAchievement,
      saveAssessment,
      deleteAssessment,
      saveReview,
      dismissRecommendation,
      snoozeRecommendations,
      resumeRecommendations,
      resetCareer,
    }),
    [
      state.doc,
      state.hydrated,
      saveProfile,
      addDomain,
      editDomain,
      toggleDomain,
      removeDomain,
      restoreSuggestedDomains,
      saveGoal,
      setGoalStatus,
      deleteGoal,
      saveSkill,
      deleteSkill,
      saveMilestone,
      setMilestoneStatus,
      deleteMilestone,
      saveEvidence,
      deleteEvidence,
      saveAchievement,
      deleteAchievement,
      saveAssessment,
      deleteAssessment,
      saveReview,
      dismissRecommendation,
      snoozeRecommendations,
      resumeRecommendations,
      resetCareer,
    ],
  );

  return <CareerContext.Provider value={value}>{children}</CareerContext.Provider>;
}

export function useCareer(): CareerContextValue {
  const context = useContext(CareerContext);
  if (!context) {
    throw new Error('useCareer must be used inside a <CareerProvider>');
  }
  return context;
}
