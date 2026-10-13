# Contextual Suggestions - Deep Dive Plan (Hook + UI First)

This plan focuses on surfacing contextual suggestions based on the requirements:
- Trigger when a planned task block ends without completion, OR when actual progress falls significantly behind planned schedule
- Combine both with deduplication
- Evaluate only when NOT actively focusing (never interrupt running focus session)
- Per-day dismissals (reset each day)
- Primary CTA -> contextual action screen/bottom sheet with recommended next step
- Secondary: "Dismiss" and "Remind me later"
- Don't interrupt running focus timer; defer until timer ends

## Architecture Overview

Following existing patterns:
- Pure domain logic in `replan/` (deterministic, no React/AsyncStorage)
- Controller hook `hooks/useReplanSuggestions.ts` (impure, side effects)
- UI components (subtle banner on Home, bottom sheet/modal for actions)
- Storage: extend `ReplanDoc` in `@replan/v1` to track dismissed suggestions per day (or separate small key). Per-day means we can store dismissed IDs for current `dayKey` and clear when day changes.

## 1. Types (replan/suggestions.ts or add to types)

Add pure domain types and detection logic.

File: `replan/suggestions.ts` (new, pure - no React/AsyncStorage)
```ts
import type { DayKey } from '../shared/date';
import type { DayPlan } from './types';
import type { ReplanTask } from './types';

export type SuggestionType = 
  | 'planned-block-missed'  // planned block ended, task not completed
  | 'behind-schedule';      // progress behind planned

export type SuggestionId = string;

export type ReplanSuggestion = {
  id: SuggestionId;
  type: SuggestionType;
  dayKey: DayKey;
  taskId?: string; // relevant task
  reason: string;  // human-readable explanation
  createdAt: number;
  expiresAt?: number; // optional
  metadata: {
    plannedStart?: number;
    plannedEnd?: number;
    missedByMs?: number;
    behindByPercent?: number;
    behindByMins?: number;
  };
};

export type SuggestionContext = {
  now: number;
  dayKey: DayKey;
  plan: DayPlan | null;
  replanTasks: readonly ReplanTask[];
  todos: readonly Todo[]; // need to see completion state
  anyTimerRunning: boolean;
  // for behind-schedule detection
  plannedFocusMinsSoFar?: number;
  actualFocusMinsSoFar?: number;
  completedPlannedCount?: number;
  totalPlannedCount?: number;
};
```

But wait - `replan/suggestions.ts` must stay pure. It shouldn't import React Native types? And we need access to todos (completed state). Also productivity data (actual focus). So inputs need to be normalized.

Also add to `replan/types.ts` or keep separate. Following pattern: domain types in types.ts, logic in separate module. Suggest adding:
```ts
// in replan/types.ts (optional extension)
export type ReplanSuggestionsState = {
  dayKey: DayKey;
  dismissedIds: string[]; // dismissed today
  lastEvaluatedAt: number;
};
```

And extend `ReplanDoc` to persist dismissals? Or add separate key? The existing plan is single doc `@replan/v1`. Could extend it (add optional field) - sanitize handles missing fields. That keeps consistency.

## 2. Detection Logic (pure)

In `replan/suggestions.ts`:
- `computeSuggestions(ctx: SuggestionContext, dismissedIds: string[]): ReplanSuggestion[]`
- Deduplication: don't suggest same (type, taskId) twice in same evaluation window? Or track by id. Generate stable ids.
- Never return suggestions if `anyTimerRunning` is true - defer. (requirement says defer until timer ends)
- Planned block missed: for each placement in today's plan where placement.end < now, find corresponding task not completed. If missed and not dismissed, create suggestion.
- Behind schedule: compute planned vs actual. e.g. if we've passed >50% of workday and completed < 40% of planned tasks? Or compare focus minutes. Be deterministic - choose a simple heuristic like "completedPlannedCount / totalPlannedCount < expectedProgress based on time elapsed in workday" or "actualFocusMinsSoFar < plannedFocusMinsSoFar * threshold". The user said "actual progress falls significantly behind planned schedule" - define concrete, testable rule (e.g. behind by >25% in time or completion). Also need to be conservative to avoid noise.

But we need workday bounds and actual progress. That means inputs come from controller layer that has access to productivity snapshot and workday resolution.

## 3. Storage changes

Extend `ReplanDoc` to track suggestions state.
File: `replan/types.ts`
```ts
export type ReplanDoc = {
  version: 1;
  preferences: ReplanPreferences;
  plan: DayPlan | null;
  suggestions?: ReplanSuggestionsState; // optional for backward compat
};
```

File: `replan/planStorage.ts` - update sanitize to handle suggestions, and empty doc.

```ts
export function emptyReplanDoc(): ReplanDoc {
  return {
    version: 1,
    preferences: { ...DEFAULT_REPLAN_PREFERENCES },
    plan: null,
    suggestions: undefined,
  };
}
```

Also add functions to update dismissed suggestions for current day.

## 4. Controller Hook: useReplanSuggestions

New file: `hooks/useReplanSuggestions.ts`

Pattern mirrors `useReminders`, `usePlanReminders` - pure computation + side effects. Needs access to:
- replan doc (for dismissals, plan)
- todos
- productivity snapshot (for actual focus, completed state)
- timer state (anyTimerRunning)
- current time (dayKey)

```ts
export type UseReplanSuggestionsArgs = {
  hydrated: boolean;
  plan: DayPlan | null;
  replanTasks: readonly ReplanTask[];
  todos: readonly Todo[];
  anyTimerRunning: boolean;
  today: string; // dayKey
  workdayStart: TimeKey;
  workdayEnd: TimeKey;
  actualFocusMinsSoFar?: number; // from productivity
  completedPlannedCount?: number;
  totalPlannedCount?: number;
};

export type ReplanSuggestionsController = {
  suggestions: ReplanSuggestion[];
  dismiss: (suggestionId: string) => void;
  remindLater: (suggestionId: string) => void; // dismiss for now but could reappear? "remind me later" - maybe just dismiss this instance? Or snooze
  openAction: (suggestion: ReplanSuggestion) => void;
};
```

Behavior:
- Compute suggestions when inputs change (plan, todos, time progression, timer state changes)
- If anyTimerRunning is true, return empty (defer until timer ends)
- Filter out dismissedIds for current dayKey
- On dismiss: update ReplanDoc.suggestions.dismissedIds to include id; persist
- On remindLater: similar to dismiss for now? Or add snooze? "Remind me later" - could mean dismiss for short time (e.g. 15 min) or just hide. Simpler: treat as dismiss this evaluation? Or add expiresAt. Maybe dismiss for 30 min snooze - store snoozedUntil. But requirement says "per-day dismissals" for dismiss; "remind me later" is secondary action - could be per-day dismiss too, or short snooze. Let's interpret as: Dismiss removes it today; Remind me later snoozes (e.g. 10-15 min) so it may reappear later if conditions still hold.

```ts
export type UseReplanSuggestionsArgs = {
  hydrated: boolean;
  plan: DayPlan | null;
  replanTasks: readonly ReplanTask[];
  todos: readonly Todo[];
  anyTimerRunning: boolean;
  today: string; // dayKey
  workdayStart: TimeKey;
  workdayEnd: TimeKey;
  actualFocusMinsSoFar?: number; // from productivity
  completedPlannedCount?: number;
  totalPlannedCount?: number;
};

export type ReplanSuggestionsController = {
  suggestions: ReplanSuggestion[];
  dismiss: (suggestionId: string) => void;
  remindLater: (suggestionId: string) => void; // dismiss for now but could reappear? "remind me later" - maybe just dismiss this instance? Or snooze
  openAction: (suggestion: ReplanSuggestion) => void;
};
```

Behavior:
- Compute suggestions when inputs change (plan, todos, time progression, timer state changes)
- If anyTimerRunning is true, return empty (defer until timer ends)
- Filter out dismissedIds for current dayKey
- On dismiss: update ReplanDoc.suggestions.dismissedIds to include id; persist
- On remindLater: similar to dismiss for now? Or add snooze? "Remind me later" - could mean dismiss this evaluation? Or add expiresAt. Maybe dismiss for 30 min snooze - store snoozedUntil. But requirement says "per-day dismissals" for dismiss; "remind me later" is secondary action - could be per-day dismiss too, or short snooze. Let's interpret as: Dismiss removes it today; Remind me later snoozes (e.g. 10-15 min) so it may reappear later if conditions still hold.

## 5. UI Components

### a) Subtle banner on HomeScreen
Add a dismissible suggestion banner near the replan entry. Don't replace replan tile - show above or below it.

File: `components/SuggestionBanner.tsx` (new, presentational)
- Shows suggestion text based on type
- "Adjust plan" CTA (opens action sheet/modal)
- "Dismiss" / "Later" actions
- Matches theme tokens (like existing banners)
- Only renders if suggestions exist

Props:
```ts
export type SuggestionBannerProps = {
  suggestion: ReplanSuggestion;
  onAction: () => void;
  onDismiss: () => void;
  onRemindLater: () => void;
};
```

### b) Contextual action bottom sheet/modal
File: `components/ReplanSuggestionSheet.tsx` (new)
Shows tailored content based on suggestion.type:
- `planned-block-missed`: "Your planned block for [Task] ended at [time] but it's not done. Reschedule it to the next available slot?"
- `behind-schedule`: "You're behind schedule. Rebalance remaining tasks based on available time and priorities?"

Actions:
- Primary: "Adjust plan" -> navigates to Replan screen with context? Or triggers replan flow. Since we need to "take user directly to contextual action screen or bottom sheet with recommended next step", bottom sheet is the action screen. Primary could be "Reschedule" / "Rebalance" which opens Replan screen (or maybe auto-adjust). But requirement says "Offer to reschedule..." - opening Replan screen with current state is reasonable; user can apply. Or we could pass context. But keep simple - primary CTA opens Replan screen (onOpenReplan) and sheet closes.
- Secondary: "Remind me later", "Dismiss"

## 6. Integration

### HomeScreen
- Accept `suggestions: ReplanSuggestion[]`, `onDismissSuggestion`, `onRemindLaterSuggestion`, `onOpenSuggestionAction`
- Show SuggestionBanner for the first/top suggestion (or most recent)? Deduped by logic; maybe show highest priority - missed block is more actionable than "behind schedule" maybe. Controller can return ordered suggestions.
- Don't show if `replanAvailable` is false? Or show anyway - but "never interrupt running focus session" means if timer running, we don't show. Also `replanAvailable` is false during focus. Controller already filters when anyTimerRunning true.

### WelcomeComponent / useTaskScreen
- Instantiate `useReplanSuggestions` with needed inputs
- Pass down to HomeScreen
- Wire up navigation - when opening action, maybe navigate to 'replan' screen
- Compute actual focus mins so far from productivity? Productivity snapshot has recentDays/todayRollup; can compute.

### Screen navigation
Add new screen type if needed? Or just use bottom sheet. Bottom sheet is overlay on current screen - no new screen in Screen union needed. That fits "contextual action screen or bottom sheet".

## 7. Exports and module wiring

- Export from `replan/domain.ts` and `replan/index.ts` (suggestions module)
- Add `hooks/useReplanSuggestions.ts` and export from `hooks/index.ts`
- Add components to themed sources in `__tests__/theme.test.ts` if they use theme

## 8. Tests (key cases)

Pure logic (`__tests__/replan/suggestions.test.ts`):
- No suggestion if timer running
- Planned block missed detected when end passed and task incomplete
- Behind schedule detected based on threshold
- Deduplication (same task+type not repeated)
- Per-day dismissed filtered
- Deterministic ids

Hook/UI tests:
- Banner renders when suggestion exists
- Dismiss removes banner
- Remind later snoozes
- Action sheet opens on CTA
- Never shows while timer running

## 9. Implementation order (hook+UI focused)

1. Types in `replan/types.ts` (ReplanSuggestionsState), extend ReplanDoc
2. Pure `replan/suggestions.ts` with computeSuggestions
3. Update `replan/planStorage.ts` (sanitize, helpers to update dismissals)
4. `hooks/useReplanSuggestions.ts` controller
5. `components/SuggestionBanner.tsx` + `components/ReplanSuggestionSheet.tsx`
6. Wire into `HomeScreen`, `WelcomeComponent`
7. Exports and theme test update
8. Tests

## 10. Deep Dive Details

### 10.1 Detection Algorithm

#### A) Planned block missed
Conditions:
- Plan exists for today (`plan.dayKey === today`)
- For each placement in plan.placements (only task placements, not breaks - breaks are in placements with kind? Check types: Placement has kind 'task'|'break' in engine; DayPlan stores placements as DayPlanPlacement {taskId,start,end} - so only tasks)
- placement.end < now (block ended)
- Find task: replanTasks by id or todos by id. Task not completed. (completed true means done)
- Not dismissed
- No active timer for this task? Or just general - we already return empty if anyTimerRunning globally; but specific task might not be running. Global guard is fine.
- Create suggestion once per (type, taskId) per evaluation? Or if it keeps ending without completion, could create again? But dismissed per day - so after dismiss, won't show again today even if still missed. That matches "per-day dismissals".

Example:
```ts
for (const p of plan.placements) {
  if (p.end >= now) continue;
  const task = todos.find(t => t.id === p.taskId);
  if (!task || task.completed) continue;
  // missed
}
```

#### B) Behind schedule
Need concrete heuristic. Factors: workday elapsed vs expected progress; planned completion vs actual completion; actual focus vs planned allocation.

Compute:
- Workday: resolve from preferences (workdayStart/workdayEnd) for today
- workdayStartMs = instantOnDay(today, workdayStart), workdayEndMs = instantOnDay(today, workdayEnd)
- totalWorkdayMins = (workdayEndMs - workdayStartMs)/60000
- elapsedMins = Math.max(0, Math.min(now - workdayStartMs, totalWorkdayMins))
- timeElapsedFraction = totalWorkdayMins > 0 ? elapsedMins / totalWorkdayMins : 0

Progress metrics:
- completedPlanned: count of planned tasks (those in placements? Or those that were in the approved plan outcomes classified scheduled?) that are completed now. Or simpler: look up tasks that appear in any placement of today's plan and are completed.
- totalPlanned: count of tasks that appear in today's plan placements (task placements). Exclude breaks.
- completionFraction = totalPlanned > 0 ? completedPlanned / totalPlanned : 0
- expectedCompletionByTime = timeElapsedFraction * 0.8? Or be generous. Suggest trigger if completionFraction < timeElapsedFraction - threshold. e.g. threshold 0.25 means if 50% time elapsed but < 25% completed (or < 25% of expected), trigger. Or simpler: "behind by >= 25 percentage points" or "significantly behind" -> completionFraction < max(0.1, timeElapsedFraction - 0.3)? Pick deterministic rule: trigger if timeElapsedFraction > 0.4 (past 40% of workday) AND completionFraction < timeElapsedFraction - 0.25. Also if actualFocusMinsSoFar is provided and is < (planned focus allocated so far) * 0.7, that strengthens case.

But need planned focus allocated so far - sum of estimatedMinutes for planned tasks that were scheduled to end <= now? Or just look at plan. Controller computes these; pure function takes them as inputs (as per SuggestionContext).

Trigger only if not missed-block suggestions exist? To avoid overwhelming - maybe prioritize missed blocks. Or allow both? Dedup by type/task combinations. Keep simple: compute both independently, then maybe de-dupe and cap (e.g. max 1-2 suggestions).

### 10.2 Snooze / "Remind me later" behavior

Two actions:
- Dismiss: add suggestionId to dismissedIds for current day. Persist in ReplanDoc.suggestions.dismissedIds. Never shows again today (per-day reset).
- Remind me later: snooze. Options: 
  1. Add to dismissed with expiresAt? But dismissed list is "dismissed today" conceptually. Or track snoozed separately.
  2. Store snoozedUntil: { [id]: number } in suggestions state. Filter: if snoozedUntil[id] > now, hide.
  
Better: extend ReplanSuggestionsState
```ts
export type ReplanSuggestionsState = {
  dayKey: DayKey;
  dismissedIds: string[]; // permanently dismissed for today
  snoozedUntil?: Record<string, number>; // snoozed temporarily
  lastEvaluatedAt: number;
};
```

On remindLater(id), set snoozedUntil[id] = now + 15*60*1000 (15 min snooze). On evaluation, skip if snoozed and not expired. When day changes, reset both.

Also "remind me later" after opening action sheet - same thing.

### 10.3 UI/Bottom Sheet specifics

#### SuggestionBanner
- Subtle surface (surface color, border, small radius) - consistent with existing tiles
- Icon: calendar-alert or information? MaterialCommunityIcons: "alert-circle-outline" or "clock-alert-outline"
- Text: reason from suggestion (human-readable)
- Actions row: "Adjust plan" (primary, text button or small pill), "Later" (text), "X"/dismiss (icon)
- Max lines, wrap nicely
- Only show if no timer running (controller enforces)

#### ReplanSuggestionSheet
Bottom sheet - can use existing patterns? Check components - maybe use Modal or a custom bottom sheet? The codebase uses Modal (AddTodoModal). Or just Modal with slide animation. Keep consistent.

```ts
export type ReplanSuggestionSheetProps = {
  visible: boolean;
  suggestion: ReplanSuggestion | null;
  onClose: () => void;
  onActionPrimary: (suggestion: ReplanSuggestion) => void; // go to replan
  onDismiss: (suggestion: ReplanSuggestion) => void;
  onRemindLater: (suggestion: ReplanSuggestion) => void;
};
```

Content:
- Title based on type
- Body with details (task name, times)
- Actions: primary button, secondary text buttons
- Theme aware

For planned-block-missed: include task text and missed duration ("missed by 10 min")

### 10.4 Hook implementation details

In `useReplanSuggestions.ts`:
```ts
export function useReplanSuggestions(args: UseReplanSuggestionsArgs): ReplanSuggestionsController {
  const { hydrated, plan, todos, anyTimerRunning, today } = args;
  const [doc, setDoc] = useState<ReplanDoc | null>(null);
  
  // hydrate doc
  useEffect(() => { /* loadReplanDoc if hydrated */ }, [hydrated]);
  
  const state = doc?.suggestions;
  const dismissedIds = state?.dismissedIds ?? [];
  const snoozedUntil = state?.snoozedUntil ?? {};
  
  // compute
  const suggestions = useMemo(() => {
    if (!hydrated || anyTimerRunning || !plan) return [];
    const ctx = buildContext(args, now);
    let computed = computeSuggestions(ctx, dismissedIds);
    // filter snoozed
    computed = computed.filter(s => !(snoozedUntil[s.id] && snoozedUntil[s.id] > Date.now()));
    return computed;
  }, [hydrated, anyTimerRunning, plan, todos, today, args, dismissedIds, snoozedUntil]);
  
  // persist helpers...
}
```

Also update planStorage to add helpers:
```ts
export async function updateReplanSuggestions(updater: (s: ReplanSuggestionsState | undefined, dayKey: string) => ReplanSuggestionsState | undefined): Promise<void> {
  const doc = await loadReplanDoc();
  const next = { ...doc, suggestions: updater(doc.suggestions, doc.plan?.dayKey ?? todayKey()) };
  await saveReplanDoc(next);
}
```
