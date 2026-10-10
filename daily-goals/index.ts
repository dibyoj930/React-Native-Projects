/**
 * Public surface of the daily-goals module.
 *
 * The pure half — types, validation, progress and the motivation line — is
 * storage-free and React-free; the hook is the only file that hydrates and
 * persists, and the editor UI lives in `components/GoalsScreen.tsx`. App code
 * imports from here; tests of the pure logic import `./goals` directly so they
 * cannot pick up storage.
 */

export {
  DEFAULT_DAILY_GOALS,
  FOCUS_GOAL_PRESETS,
  goalsProgress,
  MAX_FOCUS_GOAL_MINUTES,
  MAX_TASKS_GOAL,
  motivationFor,
  motivationStateFor,
  parseFocusGoal,
  parseTaskGoal,
  sanitizeGoals,
  type DailyGoals,
  type GoalsProgress,
  type MotivationState,
} from './goals';

export { DAILY_GOALS_STORAGE_KEY, loadDailyGoals, saveDailyGoals } from './goalsStorage';

export { useDailyGoals } from './useDailyGoals';
