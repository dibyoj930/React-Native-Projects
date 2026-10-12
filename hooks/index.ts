/**
 * The controllers layer's public surface.
 *
 * `hooks/` holds every React controller in the app — the impure half of the
 * architecture that decides *across* domains (`docs/ARCHITECTURE.md`). App code
 * that composes several of them (the composition point, `WelcomeComponent`)
 * imports from here; a controller inside this folder imports its siblings by
 * path, so the dependency graph stays visible where it matters.
 *
 * The two replan controllers (`useReplan`, `usePlanReminders`) are deliberately
 * not listed yet: their files currently export only their contracts — the hook
 * bodies are still to be written — so there is no controller to re-export. Add
 * them here when the implementations land.
 */

export * from './useCustomTags';
export * from './useDailyGoals';
export * from './useFocusTimer';
export * from './useProductivityView';
export * from './useReminders';
export * from './useSettings';
export * from './useTaskReminders';
export * from './useTaskScreen';
export * from './useTimerOrchestration';
export * from './useTasks';
