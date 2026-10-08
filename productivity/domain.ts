/**
 * The pure half of the productivity layer.
 *
 * This barrel deliberately does **not** re-export `ProductivityProvider`, and
 * therefore pulls in neither React Native nor AsyncStorage. Keeping the split in
 * module structure rather than in convention means a domain test cannot
 * accidentally acquire a storage dependency — importing from here is proof the
 * code under test needs no mocks.
 *
 * Import from `./index` inside the app; import from here in tests.
 */

export type {
  ActiveSession,
  CompletionRecord,
  DayKey,
  FocusSession,
  FocusSessionStatus,
  MomentumMemory,
  StreakLedger,
} from './types';

export {
  addDays,
  addYears,
  dayKeyRange,
  daysBetween,
  isValidDayKey,
  localDateFromDayKey,
  localDateKey,
  startOfDay,
  todayKey,
} from './dateKey';

export {
  closeSession,
  focusedSecondsAt,
  nextSessionId,
  pauseSession,
  resumeSession,
  startSession,
} from './sessions';

export { attributeToTask, buildAttribution, type Attribution } from './attribution';

export {
  formatCount,
  formatDayRange,
  formatDueLabel,
  formatDuration,
  formatElapsed,
  progressRatio,
} from './format';

export {
  computeRollups,
  emptyRollup,
  indexRollups,
  recentDayWindow,
  rollupDayForSession,
  type DayRollup,
} from './rollups';

export {
  isMissionComplete,
  MAX_MISSION_LEVEL,
  MISSIONS_PER_LEVEL,
  missionForDay,
  missionForLevel,
  missionLevelForStreak,
  missionProgress,
  type DailyMission,
  type MissionGoal,
  type MissionProgress,
} from './mission';

export {
  computeStreak,
  FREEZE_EARN_INTERVAL,
  FREEZE_MIN_FOCUSED_SECONDS,
  FREEZE_MIN_TASKS,
  qualifiesForFreeze,
  type StreakInput,
  type StreakResult,
} from './streak';

export {
  bandFor,
  computeMomentum,
  endOfDayScore,
  MOMENTUM_BAND_LABELS,
  type MomentumBand,
  type MomentumInput,
  type MomentumScore,
} from './momentum';

export {
  buildSnapshot,
  closingScoreFor,
  DEFAULT_RECENT_DAYS,
  type ProductivitySnapshot,
  type SnapshotInput,
} from './selectors';

export {
  initialProductivityState,
  MAX_RETAINED_SESSIONS,
  productivityReducer,
  type ProductivityAction,
  type ProductivityState,
} from './reducer';
