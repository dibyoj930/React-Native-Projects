# MyApp — Architecture

A local-first React Native productivity app: a task list with per-task focus
timers, OS notifications, a focus-session log with streaks/momentum, and a light
theme system. It has no backend and no accounts; every fact the app renders is
either in memory or one of five AsyncStorage keys.

This document is the map: what the layers are, which one owns which fact, how
data moves between them, and the invariants that hold the whole thing together.
For the runtime wiring (native modules, storage keys, end-to-end flows) see
[`INTEGRATION.md`](./INTEGRATION.md).

---

## 1. Design principles

These are the rules the refactor was built around. They are load-bearing: the
tests and the module layout both assume them.

1. **Thin containers, dumb UI.** Components render props and report intent. They
   do not fetch, decide business rules, or hold cross-domain state.
2. **Domain logic is pure and separately testable.** Filtering, completion
   rules, reminder planning, date math, scoring — all functions over data. No
   React, no React Native, no storage in the pure modules.
3. **Persistence is separated** behind a repository/service boundary, so the
   rest of the app never touches `AsyncStorage` or Notifee directly.
4. **One source of truth per fact.** Derived values are computed on read, not
   stored. Flags that duplicate derivable facts are removed rather than synced.
5. **No new infrastructure without a demonstrated need.** No router, no state
   manager, no second context for something a sibling already owns. `useReducer`
   + `useState` + Context cover the app.
6. **Providers only where a fact is genuinely shared across the tree.** Local
   state and plain hooks otherwise.
7. **Time is local-calendar.** Day keys are `YYYY-MM-DD` strings; `toISOString()`
   is deliberately absent so a UTC conversion cannot shift a calendar day.
8. **The OS is the source of truth for scheduled work.** A running timer and a
   pending reminder are read back from Notifee, not from a second store.

## Layering

```
                    ┌──────────────────────────────────────────────┐
   React tree       │  App.tsx  (providers + Screen navigation)      │
                    │  WelcomeComponent.tsx  (composition point)     │
                    │  components/*  (presentational screens/rows)   │
                    └───────────────┬──────────────────────────────┘
                                    │ reads controllers
                    ┌───────────────▼──────────────────────────────┐
   Controllers      │  hooks/useTaskScreen   hooks/useSettings       │
   (impure)         │  hooks/useTimerOrchestration, useFocusTimer    │
                    │  hooks/useReminders, useTaskReminders          │
                    └───────┬───────────┬──────────┬───────────────┘
                            │           │          │
        ┌───────────────────▼──┐  ┌─────▼───────┐  ┌▼─────────────────┐
        │ todos/               │  │ productivity/│  │ notifications/    │
        │ task domain + store  │  │ pure scoring │  │ Notifee boundary  │
        └──────────────────────┘  └─────────────┘  └───────────────────┘
                            │           │          │
                    ┌───────▼───────────▼──────────▼───────────────┐
   Adapters         │  AsyncStorage (3 keys)   Notifee (OS triggers) │
                    └───────────────────────────────────────────────┘
```

The rule of thumb: a **component** renders, a **controller** decides across
domains, a **domain module** is pure and testable without a renderer, and an
**adapter** (`taskRepository`, `notificationService`, `productivity/storage`,
`ThemeProvider`) is the only place a native module is touched.

## Domains

### `todos/` — the task domain

| File | Role | Pure? |
| --- | --- | --- |
| `model.ts` | `Todo`/`TodoDraft` types, `nextTodoId`, `migrateTodos`, storage key | ✅ |
| `taskOperations.ts` | `createTodoFromDraft`, `applyDraftToTodo` (merge rules) | ✅ |
| `taskRules.ts` | Completion guards, manual-toggle session status | ✅ |
| `taskSelectors.ts` | Filter/search/group/overdue/open-completed counts | ✅ |
| `timeKey.ts` | `'HH:mm'` validation, `timeKeyFromDate`, `formatTimeLabel` | ✅ |
| `taskReminders.ts` | `dueAt`, `planTaskReminders` (which reminders to schedule) | ✅ |
| `tags.ts` | Tag vocabulary + accent/tint/contrast helpers | pure (colour literals exempt) |
| `taskRepository.ts` | Load/save `Todo[]`, `buildExportPayload`, filename | impure (AsyncStorage) |
| `useTasks.ts` | List state + CRUD + load/save guard | React hook |

The `Todo` is the app's central record: `id`, `text`, `completed`, optional
`tags`, `createdAt`, `completedAt`, `notes`, `dueDate` (`DayKey`), and `dueTime`
(`TimeKey`). Storage is shape-checked on load (`migrateTodos`), so a malformed
field costs the field, never the task.

### `productivity/` — pure scoring

The focus log and everything derived from it. `productivity/domain.ts` is the
pure barrel (no React Native, no storage) re-exported by `productivity/index.ts`
alongside the provider.

- `dateKey.ts` — local day keys, `todayKey`, `addDays`, `localDateFromDayKey`.
- `sessions.ts` — start/pause/resume/close session math.
- `attribution.ts` — joins sessions to tasks ("was this completed by the timer?").
- `rollups.ts`, `streak.ts`, `momentum.ts`, `mission.ts` — derived statistics.
- `selectors.ts` — `buildSnapshot`, the single composition of all scorers.
- `reducer.ts` — flat `useReducer` state and its transitions.
- `ProductivityProvider.tsx` — context, hydration, persistence, tick/rollover.
- `storage.ts` — the only storage touchpoint; sanitises every value.

Task data is **fed in** (`setTasks`) rather than owned here, so there is one
source of truth for tasks while scoring can still read them.

### `notifications/` — the OS boundary

- `notificationService.ts` — the **only** module that imports Notifee. Schedules
  and cancels timer alerts, task reminders and daily/streak reminders; reads
  pending triggers; exposes the cold-start deep link.
- `reminderPlan.ts` — pure planner for the daily prompt and streak warning.
- `NotificationProvider.tsx` — permission state, foreground banner, and the
  pressed-task intent (`pressedTodoId`).
- `index.ts` — the layer's public surface.

### `theme/`, `haptics/`

`theme/theme.ts` holds every colour token (light/dark). `ThemeProvider` resolves
`system | light | dark` and persists the override. `theme.test.ts` enforces over
source that no UI file hardcodes a hex. `haptics/index.ts` wraps the haptic
library and is optional at runtime.

## State ownership (one source of truth per fact)

| Fact | Owner | Persisted? |
|---|---|---|
| Task list | `todos/useTasks` (`useState`) | `todos` key |
| Focus sessions, streak ledger, momentum memory | `ProductivityProvider` (`useReducer`) | `productivity` key |
| Focus timers (running/paused) | `useFocusTimer` (refs + mirrored state) | OS trigger only |
| Active/edit sheet visibility | `hooks/useTaskScreen` | no |
| Current screen | `App.AppContent` (`Screen` union) | no |
| Notification permission + banner | `NotificationProvider` | no (asked each launch) |
| Pending reminders (daily/streak) | Notifee, reconciled by `useReminders` | OS triggers |
| Per-task reminders | Notifee, reconciled by `useTaskReminders` | OS triggers |
| Daily goals | `useDailyGoals` in `WelcomeComponent` | `@daily-goals/v1` key |
| Goals draft (unsaved fields) | `GoalsScreen` local state | no |
| Theme override | `ThemeProvider` | `theme.preference` key |
| Editing draft + modal form | `AddTodoModal` local state | n/a |

## Runtime composition (providers)

`App.tsx` nests providers in a load-bearing order, documented inline:

```
GestureHandlerRootView   swipe gestures must reach rows first
  SafeAreaProvider       insets for headers/footers
    ThemeProvider        StatusBar + all children observe one appearance
      NotificationProvider   owns permission + tap intent
        ProductivityProvider  mounted inside notifications; feeds WelcomeComponent
          AppContent         owns the Screen union; useReminders + deep-link here
```

`AppContent` is the app's entire navigation: a single `Screen` union
(`home | tasks | tag | goals | settings`) held above `WelcomeComponent`. No router
is used because five destinations do not need a stack; the screens swap by
rendering one or the other, and Android hardware back is handled explicitly.

`WelcomeComponent` is the composition point: it reads `useTaskScreen()` once,
the settings controller once, the daily-goals hook once, and switches on
`screen`. Both sheets (`AddTodoModal`, `TimerPickerModal`) are built once here
and rendered in every branch, so they cannot drift between screens.

## Controllers

- **`useTaskScreen`** is the primary container. It composes `useTasks`,
  `useTimerOrchestration`, `useProductivity`, and `useTaskReminders`, then owns
  the rules that span them: timer expiry completes its task and closes the
  session `completed`; delete cancels the timer, closes the session `stopped`,
  then removes the task; completion checks the timer and lock guards before
  writing; `rowPropsFor` builds each row's props.
- `useTasks` owns only the list and its CRUD/persistence.
- `useTimerOrchestration` wraps `useFocusTimer` and supplies the other side of
  every timer event (start/pause/stop/expiry) plus notification scheduling.
- `useFocusTimer` owns countdown state, expiry detection (1s tick + foreground),
  and restore from an absolute end time.
- `useReminders` reconciles the daily/streak plan; `useTaskReminders` reconciles
  per-task reminders.
- `useDailyGoals` owns the user's daily targets: one hydration, one in-memory
  value shared by the home tile and the Goals & Preferences screen, and
  fire-and-forget writes under the `@daily-goals/v1` key.
- `useSettings` owns confirmations and cross-domain resets for the Settings
  screen.

## Key end-to-end flows

### Task create / edit

```
AddTodoModal.submit
  → useTaskScreen.submitTask(draft)
      → useTasks.createTodo / updateTodo
          → taskOperations.createTodoFromDraft / applyDraftToTodo   (pure)
          → setTodos
      → noteActivity() (productivity)   → haptic (create only)
  → effects: useTasks save effect writes storage
             useTaskScreen feeds setTasks(todos) to productivity
             useTaskReminders reconciles the OS notification plan
```

### Focus timer

```
row.onStartFocus → openTimerPicker → TimerPickerModal confirm
  → handleTimerConfirm → useTimerOrchestration
      → useFocusTimer.start (absolute end time) + scheduleTimerNotification
expiry (1s tick OR AppState→active) → onExpire
  → useTaskScreen.handleTimerExpired → completeTodos(ids) + finishFocus('completed')
restore on mount → getPendingTimers() → useFocusTimer.restore / treat past as expiry
```

A timer is "running" iff it has an entry in `endsRef`; there is no separate
running flag. The countdown display is derived from an absolute epoch, so
backgrounding cannot desynchronise it.

### Reminders

```
useReminders (App, under both providers):
  planReminders(now, streak, todayComplete)  vs  getPendingReminders()  → reconcile
useTaskReminders (useTaskScreen, under the task list):
  planTaskReminders(todos, now)              vs  getPendingTaskReminders() → reconcile
```

Both are idempotent: schedule what is missing, cancel what is no longer wanted.
The plans are pure; the hooks own only side effects.

### Notification tap (deep link)

```
Notifee PRESS event  ─┐
                      ├→ NotificationProvider.pressedTodoId
getInitialPressedTodoId┘        │
                                ▼
        AppContent effect → setScreen({ name: 'tasks' }) → clearPressedTodo()
```

A timer alert (`data.todoId`) and a task reminder (`data.taskReminder`) both
point at a task, so both deep-link to the list.

## Invariants worth protecting

These are the rules most likely to be broken by a well-meaning change:

1. **`buildExportPayload` does not include `notes`, `dueDate`, or `dueTime`.**
   The share sheet's shape is deliberately frozen and asserted field-by-field.
2. **A completed-by-timer task is locked**; a task with a live timer has a
   disabled checkbox. Both are enforced by `taskRules` **and** re-checked in the
   controller so a stray tap cannot double-count.
3. **Notification id/data-key namespacing:**
   `todoId` = running timer, `reminder` = daily/streak, `taskReminder` = task.
   A reader must only match its own key.
4. **`Notifee` repeating triggers are Android-only**, so every reminder is a
   one-shot timestamp reconciled on each relevant change.
5. **Storage keys are independent** (`todos`, `productivity`, theme preference):
   clearing one never touches another.
6. **Components hold no colours**; `theme.test.ts` enforces it over the source.
7. **No router, no new state library.** Four screens and one flat reducer do not
   need either.

## Testing strategy

The test layout mirrors the layers, which is deliberate: a pure-domain test
needs no renderer, and if it ever does, the architecture has regressed.

- `__tests__/productivity/`, `__tests__/todos/` — pure logic, no renderer.
- `__tests__/notifications/` — the Notifee boundary against mocks, plus the pure
  reminder planner.
- `__tests__/hooks/` — controllers via a thin probe component.
- `__tests__/components/` — presentational rules, driven through host nodes.
- `__tests__/integration/taskFlow.test.tsx` — the storage→screen seam; treated as
  a frozen behaviour pin.
- `__tests__/theme.test.ts` — reads source files to enforce theming.
- `__tests__/support/render.tsx` — `render`, `withRendered`, `press`, `typeText`,
  `byLabel`, `visibleText` (no testing-library; `react-test-renderer`).

See `INTEGRATION.md` for the runner configuration, mocks, and gates.
