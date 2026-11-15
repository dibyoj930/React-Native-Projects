/**
 * The career domain's data model.
 *
 * Everything here is plain data. There is deliberately no product-specific
 * vocabulary in these unions: a goal can be about a trade, a clinical skill, a
 * teaching portfolio or a software project — the model describes *what kind* of
 * career work it is, not which profession the user happens to be in.
 *
 * The one-way rule from the Phase 0 design also lives here by construction:
 * career records never point at a task. A task carries an optional career
 * reference; career goals and milestones stay independent so deleting a task can
 * never erase career history.
 */

import type { DayKey } from '../shared/date';

export const CAREER_DOC_VERSION = 2 as const;

export type Priority = 'high' | 'medium' | 'low';

/**
 * What kind of career work a goal represents.
 *
 * These are the generic goal types the product vision asks for, not job titles.
 * They describe the shape of the work (learn, change role, prepare for a review)
 * and never assume a profession.
 */
export type GoalType =
  | 'performance'
  | 'skill'
  | 'promotion'
  | 'transition'
  | 'exploration'
  | 'assessment'
  | 'certification'
  | 'portfolio'
  | 'leadership'
  | 'milestone'
  | 'custom';

export type GoalStatus = 'not-started' | 'active' | 'paused' | 'achieved' | 'archived';

export type MilestoneStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'blocked'
  | 'archived';

/** 0 is "not started"; the rest are intentionally profession-neutral. */
export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** A self-reported confidence, kept separate from proficiency on purpose. */
export type Confidence = 1 | 2 | 3 | 4 | 5;

export type Importance = 'low' | 'medium' | 'high';

export type EvidenceType =
  | 'project'
  | 'task'
  | 'learning'
  | 'practice'
  | 'feedback'
  | 'impact'
  | 'other';

export type AchievementCategory =
  | 'project'
  | 'recognition'
  | 'impact'
  | 'learning'
  | 'leadership'
  | 'other';

export type AssessmentType =
  | 'self'
  | 'practical'
  | 'scenario'
  | 'knowledge'
  | 'feedback'
  | 'custom';

export type AssessmentDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export type ReviewPeriod = 'week' | 'month';

export type CareerProfile = {
  /** Broad field of work, e.g. "software", "nursing", "construction". */
  profession: string;
  /** The user's current title or role, e.g. "senior engineer", "site lead". */
  designation: string;
  industry: string;
  experienceYears: number | null;
  responsibilities: string;
  /** Areas the user already knows well. Free text, split by the UI. */
  expertiseAreas: string[];
  /** Professional interests, which may point beyond the current role. */
  interests: string[];
  shortTermGoals: string;
  longTermAmbitions: string;
  /** Roles the user may want later; can be more than one. */
  desiredRoles: string[];
  /** Optional: organisations the user is aiming at. Never mandatory. */
  targetOrganisations: string[];
  /** Optional target date for the direction as a whole. */
  targetDate?: DayKey;
  /** Free-text timeline retained from v1, because it is not a calendar date. */
  targetTimeline: string;
  strengths: string;
  growthAreas: string;
  constraints: string;
  updatedAt: number;
};

export type DevelopmentDomain = {
  id: string;
  name: string;
  description: string;
  /** Suggested areas shipped with the app, versus areas the user added. */
  isCustom: boolean;
  /** A disabled area stays in the document; it is just hidden from pickers. */
  isEnabled: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type CareerGoal = {
  id: string;
  title: string;
  description: string;
  goalType: GoalType;
  /** Free-text label used only when `goalType === 'custom'`. */
  customGoalType?: string;
  priority: Priority;
  status: GoalStatus;
  targetDate?: DayKey;
  successCriteria: string;
  domainId?: string;
  relatedSkillIds: string[];
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
};

export type CareerSkill = {
  id: string;
  name: string;
  description: string;
  domainId?: string;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel;
  confidence: Confidence;
  /** Importance to the work the user does now. */
  roleImportance: Importance;
  /** Importance to the direction the user is moving towards. */
  futureImportance: Importance;
  createdAt: number;
  updatedAt: number;
};

export type CareerMilestone = {
  id: string;
  goalId: string;
  title: string;
  description: string;
  targetDate?: DayKey;
  status: MilestoneStatus;
  relatedSkillIds: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type CareerEvidence = {
  id: string;
  title: string;
  description: string;
  type: EvidenceType;
  occurredOn: DayKey;
  skillIds: string[];
  goalId?: string;
  milestoneId?: string;
  source?: string;
  /** A score the user chooses to record, on whatever scale they used. Never inferred. */
  score?: number;
  createdAt: number;
  updatedAt: number;
  /**
   * The goal's title at the moment a hard delete unlinked this evidence. Kept so
   * history still says what the work was for.
   */
  goalTitleSnapshot?: string;
};

export type CareerAchievement = {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  date: DayKey;
  impact: string;
  metrics: string;
  demonstratedSkillIds: string[];
  evidenceIds: string[];
  goalId?: string;
  createdAt: number;
  updatedAt: number;
  goalTitleSnapshot?: string;
};

export type CareerAssessment = {
  id: string;
  title: string;
  type: AssessmentType;
  assessedOn: DayKey;
  skillIds: string[];
  goalId?: string;
  score: number | null;
  maxScore: number | null;
  proficiencyLevel: SkillLevel | null;
  timeTakenMins: number | null;
  difficulty: AssessmentDifficulty;
  notes: string;
  createdAt: number;
  updatedAt: number;
  goalTitleSnapshot?: string;
};

export type CareerReviewNote = {
  id: string;
  period: ReviewPeriod;
  periodStart: DayKey;
  periodEnd: DayKey;
  notes: string;
  wins: string;
  challenges: string;
  nextPriorities: string[];
  createdAt: number;
  updatedAt: number;
};

export type RecommendationState = {
  dismissedIds: string[];
  snoozedUntil?: DayKey;
  lastEvaluatedOn?: DayKey;
};

export type CareerDoc = {
  version: typeof CAREER_DOC_VERSION;
  profile: CareerProfile | null;
  domains: DevelopmentDomain[];
  goals: CareerGoal[];
  skills: CareerSkill[];
  milestones: CareerMilestone[];
  evidence: CareerEvidence[];
  achievements: CareerAchievement[];
  assessments: CareerAssessment[];
  reviews: CareerReviewNote[];
  recommendations: RecommendationState;
};

/** Inputs accepted by the factories. Timestamps and ids belong to the domain. */
export type CareerProfileDraft = Omit<CareerProfile, 'updatedAt'>;
export type CareerGoalDraft = Omit<
  CareerGoal,
  'id' | 'createdAt' | 'updatedAt' | 'archivedAt'
>;
export type CareerSkillDraft = Omit<CareerSkill, 'id' | 'createdAt' | 'updatedAt'>;
export type CareerMilestoneDraft = Omit<
  CareerMilestone,
  'id' | 'goalId' | 'createdAt' | 'updatedAt' | 'completedAt'
>;
export type CareerEvidenceDraft = Omit<
  CareerEvidence,
  'id' | 'createdAt' | 'updatedAt' | 'goalTitleSnapshot'
>;
export type CareerAchievementDraft = Omit<
  CareerAchievement,
  'id' | 'createdAt' | 'updatedAt' | 'goalTitleSnapshot'
>;
export type CareerAssessmentDraft = Omit<
  CareerAssessment,
  'id' | 'createdAt' | 'updatedAt' | 'goalTitleSnapshot'
>;
export type CareerReviewDraft = Omit<
  CareerReviewNote,
  'id' | 'createdAt' | 'updatedAt'
>;

export const GOAL_TYPES: readonly GoalType[] = [
  'performance',
  'skill',
  'promotion',
  'transition',
  'exploration',
  'assessment',
  'certification',
  'portfolio',
  'leadership',
  'milestone',
  'custom',
];

export const GOAL_STATUSES: readonly GoalStatus[] = [
  'not-started',
  'active',
  'paused',
  'achieved',
  'archived',
];

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  'not-started',
  'in-progress',
  'completed',
  'blocked',
  'archived',
];

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  'project',
  'task',
  'learning',
  'practice',
  'feedback',
  'impact',
  'other',
];

export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = [
  'project',
  'recognition',
  'impact',
  'learning',
  'leadership',
  'other',
];

export const ASSESSMENT_TYPES: readonly AssessmentType[] = [
  'self',
  'practical',
  'scenario',
  'knowledge',
  'feedback',
  'custom',
];

export const ASSESSMENT_DIFFICULTIES: readonly AssessmentDifficulty[] = [
  'easy',
  'medium',
  'hard',
  'mixed',
];

export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];
export const IMPORTANCE_VALUES: readonly Importance[] = ['high', 'medium', 'low'];

export const PROFICIENCY_LABELS: readonly string[] = [
  'Not started',
  'Beginner',
  'Developing',
  'Proficient',
  'Advanced',
  'Expert',
];

export const CONFIDENCE_LABELS: readonly string[] = [
  'Very low',
  'Low',
  'Moderate',
  'High',
  'Very high',
];

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  performance: 'Current role performance',
  skill: 'New skill',
  promotion: 'Promotion',
  transition: 'Career transition',
  exploration: 'Explore a new direction',
  assessment: 'Interview or assessment prep',
  certification: 'Certification',
  portfolio: 'Portfolio or demonstrable project',
  leadership: 'Leadership and collaboration',
  milestone: 'Personal professional milestone',
  custom: 'Custom',
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  'not-started': 'Not started',
  active: 'Active',
  paused: 'Paused',
  achieved: 'Achieved',
  archived: 'Archived',
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  archived: 'Archived',
};

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  project: 'Project',
  task: 'Task',
  learning: 'Learning',
  practice: 'Practice',
  feedback: 'Feedback',
  impact: 'Impact',
  other: 'Other',
};

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  project: 'Project',
  recognition: 'Recognition',
  impact: 'Impact',
  learning: 'Learning',
  leadership: 'Leadership',
  other: 'Other',
};

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  self: 'Self assessment',
  practical: 'Practical exercise',
  scenario: 'Scenario',
  knowledge: 'Knowledge check',
  feedback: 'Feedback review',
  custom: 'Custom',
};

export const ASSESSMENT_DIFFICULTY_LABELS: Record<AssessmentDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  mixed: 'Mixed',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
