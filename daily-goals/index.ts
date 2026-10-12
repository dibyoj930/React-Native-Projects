/**
 * Public surface of the daily-goals module.
 *
 * This module is the goal *domain*: the type, its validation, the progress maths
 * and the motivation line — all storage-free and React-free. The controller that
 * hydrates and persists goals lives with the other controllers in
 * `hooks/useDailyGoals`, and the editor UI is `components/GoalsScreen.tsx`. App
 * code imports the domain from here; tests of the pure logic import `./goals`
 * directly so they cannot pick up storage.
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
