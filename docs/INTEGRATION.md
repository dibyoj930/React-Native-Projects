# Integration Guide

How the app's layers, native modules, and storage fit together at runtime — and
how to build, run, and test it. Read `ARCHITECTURE.md` first for the layer model;
this document is the wiring.

## Contents

1. [Running the app](#1-running-the-app)
2. [Boot sequence](#2-boot-sequence)
3. [Native modules and their boundaries](#3-native-modules-and-their-boundaries)
4. [Storage contract](#4-storage-contract)
5. [Notifications contract](#5-notifications-contract)
6. [Cross-domain flows](#6-cross-domain-flows)
7. [Testing integration](#7-testing-integration)
8. [Environment gotchas](#8-environment-gotchas)
9. [Adding a feature: checklist](#9-adding-a-feature-checklist)

## 1. Running the app

```sh
npm install
bundle install            # once, for CocoaPods
bundle exec pod install   # after native dependency changes

npm start                 # Metro
npm run ios               # or: npm run android
```

Quality gates (run from `Native/MyApp/`):

```sh
npx tsc --noEmit     # types
npx eslint .         # 0 errors expected
npx jest             # full suite
```

A headless iOS build exists for CI-like runs: `npm run ios:headless` →
`scripts/run-ios-headless.sh` (boots a simulator without opening Simulator.app).

## 2. Boot sequence

```
index.js
  registerBackgroundHandler()      ← Notifee headless task (must be top level)
  AppRegistry.registerComponent('MyApp', () => App)

App.tsx
  GestureHandlerRootView
    SafeAreaProvider
      ThemeProvider                ← hydrates @theme/preference
        NotificationProvider       ← ensurePermission on mount
          ProductivityProvider     ← hydrates @productivity/v1
            AppContent
              useReminders()       ← daily/streak reconcile (needs both providers)
              deep-link effect     ← pressedTodoId → screen 'tasks'
              WelcomeComponent
                useTaskScreen()    ← tasks + timers + productivity + task reminders
                useDailyGoals()    ← targets shared by the home tile + goals screen
                useSettings()      ← only while the Settings screen is mounted
```

Provider order is load-bearing and documented inline in `App.tsx`; do not
reorder without reading that comment.

Navigation is a single `Screen` union in `WelcomeComponent.tsx`
(`home | tasks | tag | goals | settings`) held in `AppContent`. There is no router.
Android hardware back is registered in `AppContent` only while a sub-screen is
up.

## 3. Native modules and their boundaries

Each native dependency is reached through exactly one module, so the rest of the
app is testable without a binary.

| Native module | Sole boundary | Notes |
| --- | --- | --- |
| `@notifee/react-native` | `notifications/notificationService.ts` | Scheduled triggers, permission, initial notification, foreground events |
| `@react-native-async-storage/async-storage` | `todos/taskRepository.ts`, `productivity/storage.ts`, `theme/ThemeProvider.tsx` | One of three independent keys each |
| `@react-native-community/datetimepicker` | `components/AddTodoModal.tsx` | `mode="date"` and `mode="time"` |
| `react-native-timer-picker` | `WelcomeComponent.tsx` | Focus-duration picker |
| `react-native-gesture-handler` | `App.tsx`, `components/SwipeableTodoRow.tsx` | Gesture root + swipe actions |
| `react-native-reanimated` / `worklets` | via `ReanimatedSwipeable` | Native-animated swipe |
| `react-native-safe-area-context` | `App.tsx`, screens | Insets |
| `@react-native-vector-icons/material-design-icons` | components | Icons |
| `react-native-haptic-feedback` | `haptics/index.ts` | Optional feedback |

`haptics/index.ts` wraps haptics so they are optional at runtime; the test setup
mocks the module to a no-op.

### AsyncStorage boundary

Only a handful of modules touch AsyncStorage. Each key is independent: clearing
one never touches another.

| Module | Key | Written by |
| --- | --- | --- |
| `todos/taskRepository.ts` | `todos` (`TODOS_STORAGE_KEY`) | `saveTodos` |
| `productivity/storage.ts` | `@productivity/v1` | debounced `saveProductivity` |
| `theme/ThemeProvider.tsx` | `@theme/preference` | the appearance control |
| `todos/useCustomTags.ts` | `customTags` (`CUSTOM_TAGS_STORAGE_KEY`) | `addTag` |
| `daily-goals/goalsStorage.ts` | `@daily-goals/v1` | `saveDailyGoals` |

Every read is defensive: a missing key, non-array/non-object JSON, or a read
failure returns empty/default state and logs, rather than throwing. A broken
store degrades to an empty app, never a spinner that never resolves.

### Notifee boundary

`notifications/notificationService.ts` is the **only** module that imports
Notifee. `NotificationProvider.tsx` consumes it for context; the two pure
planners (`notifications/reminderPlan`, `todos/taskReminders`) never import it.

`registerBackgroundHandler()` is called at the top of `index.js` so Notifee can
spin up its headless task when a notification is delivered or tapped while the
app is not foregrounded.

> Known gap: the app does not explicitly create an Android notification channel.
> Android requires a channel for notifications to display; Notifee falls back to
> its default channel, but a production build should create and pass a
> `channelId`.

## 4. Storage contract

Three independent AsyncStorage keys. Clearing one never touches another.

| Key | Owner | Shape | Repair on load |
| --- | --- | --- | --- |
| `todos` (`TODOS_STORAGE_KEY`) | `todos/taskRepository.ts` | `Todo[]` | `migrateTodos` |
| `@productivity/v1` | `productivity/storage.ts` | `{ sessions, ledger, memory }` | per-field sanitising |
| `@theme/preference` | `theme/ThemeProvider.tsx` | `'system' \| 'light' \| 'dark'` | falls back to `system` |
| `customTags` (`CUSTOM_TAGS_STORAGE_KEY`) | `todos/useCustomTags.ts` | `string[]` | normalised, deduplicated, stripped |
| `@daily-goals/v1` | `daily-goals/goalsStorage.ts` | `{ focusMinutes, tasksCompleted }` | field-by-field via `sanitizeGoals` |

### `todos`

A JSON array of `Todo`, written whole on every change (after hydration).
`migrateTodos(parsed, now)` runs on load and shape-checks every field:

| Field | Rule | On invalid |
| --- | --- | --- |
| `id`, `text` | string | task dropped if `id` missing |
| `completed` | boolean | defaults `false` |
| `tags` | `string[]` | defaults `[]`, elements `String()`ed |
| `createdAt` | number | backfilled with `now` |
| `completedAt` | number | left undefined (never guessed) |
| `notes` | string | left undefined (absent ≠ cleared) |
| `dueDate` | `isValidDayKey` (`YYYY-MM-DD`) | field dropped |
| `dueTime` | `isValidTimeKey` (`HH:mm`) | field dropped |

A malformed field costs the field, never the whole task. Legacy/unknown fields
are ignored.

**Export is a separate, frozen shape.** `buildExportPayload` deliberately omits
`notes`, `dueDate`, and `dueTime`; the share body must stay backward-compatible.
`__tests__/todos/taskRepository.test.ts` asserts the exact keys so an accidental
addition fails.

### `@productivity/v1`

`{ sessions: FocusSession[], ledger: StreakLedger, memory: MomentumMemory }`.
Open/active sessions are **never** persisted. `loadProductivity` sanitises every
field independently; corrupt values degrade to safe defaults. `@daily-goals/v1`
lives under its own key and is repaired by `sanitizeGoals` on load (Settings →
Clear focus history does not touch it). Writes are debounced
(`SAVE_DEBOUNCE_MS = 800`) for productivity.

### `@theme/preference`

One of `'system' | 'light' | 'dark'`. Missing or invalid falls back to `system`.

## 5. Notifications contract

All scheduling goes through `notifications/notificationService.ts` (the only
Notifee import). Every trigger is a **one-shot `TriggerType.TIMESTAMP`** —
Notifee repeating triggers are Android-only — so "recurring" reminders are laid
down as a rolling window and reconciled against what the OS holds on each
relevant change.

| Kind | Notification id | `data` key | Read back by | Scheduled by |
| --- | --- | --- | --- | --- |
| Focus timer | `timer-<taskId>` | `todoId` | `getPendingTimers` | `useTimerOrchestration` |
| Daily / streak reminder | `reminder-<planId>` | `reminder` | `getPendingReminders` | `useReminders` |
| Task reminder | `task-reminder-<taskId>` | `taskReminder` | `getPendingTaskReminders` | `useTaskReminders` |

Plan ids: `daily-YYYY-MM-DD` (09:00 local, 7-day window) and
`streak-YYYY-MM-DD` (20:00 local when `streak >= 1 && !todayComplete`), from the
pure `planReminders`. Task reminders come from the pure `planTaskReminders`:
one entry per open task that has both a `dueDate` and a `dueTime` in the future.

Reconciliation is idempotent: cancel anything no longer wanted or whose `fireAt`
moved, then schedule what is desired but not held. The OS pending set is the
source of truth, so a relaunch or re-render cannot stack duplicates or leave
orphans.

**Taps.** `NotificationProvider` maps a foreground `PRESS` event to
`pressedTodoId` via `data.todoId ?? data.taskReminder`; on a cold start it uses
`getInitialPressedTodoId`. `AppContent` consumes the intent as navigation
(opens the task list) and clears it. `registerBackgroundHandler()` owns
background delivery/taps.

## 6. Cross-domain flows

### 6.1 Task create / edit

```
AddTodoModal.onSubmit(draft)
  → useTaskScreen.submitTask(draft)              [hooks/useTaskScreen.ts]
      create: useTasks.createTodo → createTodoFromDraft (pure) → setTodos
      edit:   useTasks.updateTodo → applyDraftToTodo     (pure)
      noteActivity(); haptic on create
  → effects:
      useTasks saves to AsyncStorage ('todos')
      useTaskScreen → ProductivityProvider.setTasks(todos)
      useTaskReminders reconciles the OS task-reminder plan
```

The modal prefills `dueDate`/`dueTime` on edit; picking a time with no date
defaults the date to today; "Remove due date" clears both. Removing a
`dueDate`/`dueTime` from a task also cancels its reminder, via reconciliation.

### 6.2 Complete a task

```
row checkbox → useTaskScreen.toggleComplete(id)
  guard: isCompletionDisabled(hasTimer, completed, isLocked) → no-op if blocked
  cancel timer notification + clear timer
  useTasks.setCompleted(id, next)      (stamps/clears completedAt)
  finishFocus(id, manualToggleStatus(next))
  noteActivity()
```

A timer that runs to zero is a different path: `handleTimerExpired` calls
`completeTodos(ids, at)` + `finishFocus(id, 'completed')`, which locks the task
against reopening (`isLocked` is derived from the session log, not a stored flag).

### 6.3 Focus timer lifecycle

```
start:   row → openTimerPicker → TimerPickerModal → handleTimerConfirm
         → useFocusTimer.start (absolute end) + scheduleTimerNotification
pause:   frozen remainder stored, trigger cancelled
resume:  new absolute end + trigger rescheduled
stop:    cancel + clear + finishFocus('stopped')
expire:  1s tick or AppState→active → checkExpired → onExpire → complete + finish
restore: mount → getPendingTimers() → restore live ends; past ends treated as expiry
delete:  useTaskScreen.deleteTodo → cancel + clear + finishFocus('stopped') + remove
```

The countdown is derived from an absolute epoch (`endsRef[id]`), so backgrounding
cannot desynchronise it. A "running" timer is simply one with a live end time.

### 6.4 Reminder reconciliation

```
App level: useReminders        planReminders     vs getPendingReminders
Task list: useTaskReminders    planTaskReminders vs getPendingTaskReminders
```

Both reconcilers follow the same shape: build the desired plan (pure), read what
the OS holds, cancel anything unwanted or moved, schedule anything missing.
`useTaskReminders` is gated on `hydrated`, so an empty first render cannot cancel
reminders that outlived the previous session.

### 6.5 Notification tap → navigation

```
notifee PRESS event (foreground)
  → NotificationProvider sets pressedTodoId (data.todoId ?? data.taskReminder)
cold start
  → getInitialPressedTodoId() reads data.todoId ?? data.taskReminder
AppContent effect: pressedTodoId → setScreen({ name: 'tasks' }) → clearPressedTodo()
```

### 6.6 Data resets

- `useTaskScreen.clearAllTasks` — cancels each timer, closes each session
  `stopped`, clears the list, notes activity. Reminders reconcile away.
- `ProductivityProvider.resetProductivity` — wipes `@productivity/v1`; goals
  stored under `@daily-goals/v1` survive that reset.
  (sessions, ledger, memory); tasks untouched. Confirmed in `useSettings`.
- Deleting a single task does its per-task cleanup in `useTaskScreen.deleteTodo`.

### 6.7 Export

`useTaskScreen.exportTodos` builds the frozen payload in
`taskRepository.buildExportPayload`, names it via the local day (not UTC), and
opens the OS share sheet.

### 6.8 Daily goals

```
TodayCard tap → WelcomeComponent onNavigate({ name: 'goals' })
  → GoalsScreen (draft fields, preview via goalsProgress)
      Save → onSave → useDailyGoals.setGoals(next)   (state + @daily-goals/v1)
          → navigate home, tile re-renders against the new targets
      Cancel / back / hardware back → navigate home, draft discarded
```

Goals live under their own AsyncStorage key (`@daily-goals/v1`,
`sanitizeGoals`-repaired on load), so a save never touches `todos` or
`@productivity/v1` — task completion and focus sessions are read-only inputs to
the tile's progress math, never rewritten.

## 7. Testing integration

Jest config (`jest.config.js`) extends `@react-native/jest-preset` and adds:
font-asset transformation, a `transformIgnorePatterns` allowlist for RN ESM
packages, and the mocks in `jest.setup.js`.

`jest.setup.js` provides:

- `process.env.TZ = 'Asia/Kolkata'` (UTC+5:30 — a half-hour offset makes
  calendar boundary bugs obvious).
- An in-memory AsyncStorage mock, cleared per test.
- A Notifee mock returning empty triggers / authorized permission by default.
- Safe-area, `ReanimatedSwipeable`, and haptics mocks.

Test helpers live in `__tests__/support/render.tsx`: `render`, `withRendered`,
`press`, `typeText`, `byLabel`, `visibleText`, `labels`, `hostNodes`, and
friends. Matching is on **host** nodes only; `press`/`typeText` walk up to the
composite holding the handler. Use `withRendered` for trees with
auto-dismissing timers.

Layer → suite mapping:

| Layer | Suites |
| --- | --- |
| Pure productivity | `__tests__/productivity/*` |
| Pure tasks | `__tests__/todos/{taskRules,taskSelectors,timeKey,taskReminders,migration,taskRepository}` |
| Notifee boundary | `__tests__/notifications/{notificationService,reminderPlan}` |
| Controllers | `__tests__/hooks/*` (probe components call the hook) |
| Components | `__tests__/components/*` |
| End-to-end seam | `__tests__/integration/taskFlow.test.tsx` (frozen) |
| Theme source rule | `__tests__/theme.test.ts` |
| App composition | `__tests__/App.test.tsx` |

`__tests__/integration/taskFlow.test.tsx` is a **behaviour pin** — it must not be
edited. It walks storage → screen: create, edit, tag, remove due date, export. If
a change breaks it, the change is wrong, not the test.

`__tests__/theme.test.ts` reads component source and fails on hardcoded colours.
Its allow-list is `theme/theme.ts`, `todos/tags.ts`, and
`components/SwipeableTodoRow.tsx`. The themed component list only changes when a
themed source is added or removed.

## 8. Environment gotchas

- Metro must be running before `npm run ios` / `android`.
- `jest.setup.js` sets `TZ` before any module loads; do not move it.
- Timers are absolute-epoch based; tests that exercise them use fake timers and
  `jest.setSystemTime`.
- A jest run may print "A worker process has failed to exit gracefully"
  (unref'd timers); the tests still pass.
- `DateTimePicker` renders as a single host view under Jest with its `mode`
  prop; tests select the time picker via `props.mode === 'time'`.
- `Native/package.json` is a stub — always run commands from `Native/MyApp/`.

## 9. Adding a feature: checklist

1. Decide the owning domain. A pure rule → a `*Selectors`/domain module with an
   `expect`-only test; a native side effect → the relevant adapter.
2. If it persists, add the field to the model and to `migrateTodos`; keep the
   export shape unchanged.
3. Put cross-domain orchestration in the relevant controller (e.g.
   `useTaskScreen`), not in a component.
4. Keep components presentational and theme-only (no hex literals).
5. If it schedules, add a pure planner + a reconciling hook that treats the OS as
   the source of truth, with its own notification `data` key.
6. Add tests at the matching layer, then run `tsc`, `eslint`, and `jest`.
7. Never edit `__tests__/integration/taskFlow.test.tsx`.
