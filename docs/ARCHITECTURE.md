# MyApp — Architecture

A local-first React Native productivity app: a task list with per-task focus
timers, OS notifications, a focus-session log with streaks/momentum, adaptive
daily replanning, and a light theme system. It has no backend and no accounts;
every fact the app renders is either in memory or one of six AsyncStorage keys.

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
   Controllers      │  hooks/useTaskScreen   useProductivityView     │
   (impure)         │  useTimerOrchestration, useFocusTimer          │
                    │  useReminders, useTaskReminders                │
                    │  useTasks, useCustomTags, useDailyGoals         │
                    │  useReplan, usePlanReminders                   │
                    │  useSettings                                   │
                    └───────┬───────────┬──────────┬───────────────┘
                            │           │          │
        ┌───────────────────▼──┐  ┌─────▼───────┐  ┌▼─────────────────┐
        │ todos/               │  │ productivity/│  │ notifications/    │
        │ task domain + store  │  │ pure scoring │  │ Notifee boundary  │
        └──────────────────────┘  └─────────────┘  └───────────────────┘
                            │           │          │
                    ┌───────▼───────────▼──────────▼───────────────┐
   Adapters         │  AsyncStorage (6 keys)   Notifee (OS triggers) │
                    └───────────────────────────────────────────────┘
```

`shared/date.ts` is a pure leaf under both `todos/` and `productivity/`: the local
day-key type and date maths both domains need, owned by neither. A controller is
a hook in `hooks/` — the domain modules no longer hold any.

`replan/` is a fourth pure domain, drawn out of the diagram purely for legibility:
it turns the task list and the day's free time into a proposed schedule, and
imports no React, RN or storage except in `replan/planStorage.ts`. For the same
reason `shared/` is not a box.

The rule of thumb: a **component** renders, a **controller** decides across
domains, a **domain module** is pure and testable without a renderer, and an
**adapter** (`taskRepository`, `notificationService`, `productivity/storage`,
`replan/planStorage`, `ThemeProvider`) is the only place a native module is
touched.

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
| `rowViewModel.ts` | `TodoRowProps` — the contract a row's controller builds to | ✅ |
| `taskRepository.ts` | Load/save `Todo[]`, `buildExportPayload`, filename | impure (AsyncStorage) |

The list's state and persistence are a controller (`hooks/useTasks`), not a domain
file: nothing under `todos/` is a React hook any more.

The `Todo` is the app's central record: `id`, `text`, `completed`, optional
`tags`, `createdAt`, `completedAt`, `notes`, `dueDate` (`DayKey`), `dueTime`
(`TimeKey`), and the optional scheduling fields the replanner reads — `priority`
(`high | medium | low`), `estimatedMinutes`, `schedulingMode` (`fixed |
flexible`) and `fixedStartAt`. Storage is shape-checked on load (`migrateTodos`),
so a malformed field costs the field, never the task; `priority` is deliberately
left absent for legacy tasks (absent means `low`), and a scheduling field is only
kept while it is coherent.

### `productivity/` — pure scoring

The focus log and everything derived from it. `productivity/domain.ts` is the
pure barrel (no React Native, no storage) re-exported by `productivity/index.ts`
alongside the provider.

- `dateKey.ts` — re-exports `shared/date.ts` (local day keys, `todayKey`, `addDays`).
- `focusChart.ts` — the focus chart's bar view model (`buildFocusChart`).
- `milestones.ts` — the focus-milestone ladder (`focusTargetMinutes`, `focusFillPercent`).
- `sessions.ts` — start/pause/resume/close session math.
- `attribution.ts` — joins sessions to tasks ("was this completed by the timer?").
- `rollups.ts`, `streak.ts`, `momentum.ts`, `mission.ts` — derived statistics.
- `selectors.ts` — `buildSnapshot`, the single composition of all scorers.
- `reducer.ts` — flat `useReducer` state and its transitions.
- `ProductivityProvider.tsx` — context, hydration, persistence, tick/rollover.
- `storage.ts` — the only storage touchpoint; sanitises every value.

Task data is **fed in** (`setTasks`) rather than owned here, so there is one
source of truth for tasks while scoring can still read them.

### `replan/` — pure daily planning

Turns a task list, the workday, and the day's commitments into a proposed
schedule, and stores the one the user approves. Pure except for the storage file;
the barrel `replan/domain.ts` deliberately excludes `planStorage`.

- `types.ts` — contracts only (`ReplanTask`, `ReplanInput`, `ReplanProposal`,
  `DayPlan`, `ReplanPreferences`, `ReplanDoc`).
- `interval.ts` — half-open `[start, end)` maths, free-segment subtraction.
- `preferences.ts` — `DEFAULT_REPLAN_PREFERENCES` + `sanitizeReplanPreferences`.
- `normalize.ts` — the only place raw `Todo`s are read; builds `ReplanInput`
  (`normalizeReplanTasks`, `collectCommitments`, `computeSignature`).
- `rank.ts` — `compareReplanTasks` (priority, then deadline, then duration).
- `engine.ts` — `buildReplanProposal`, the deterministic core.
- `validate.ts` — re-checks a proposal's placements (no overlap, inside workday).
- `explain.ts` — `formatClock` and the reason-code copy.
- `planReminders.ts` — `planStartReminders`, the pure planned-start planner.
- `planStorage.ts` — the **only** file that touches AsyncStorage (`@replan/v1`).

The engine **never mutates tasks** and never rewrites `dueDate`/`dueTime`: it
returns a *proposal*, and an approval writes one `DayPlan` in one `setItem`, so
applying can never half-succeed across keys. Intervals are half-open
`[start, end)`; the usable window never begins before `now`.

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
| Task list | `hooks/useTasks` (`useState`) | `todos` key |
| Focus sessions, streak ledger, momentum memory | `ProductivityProvider` (`useReducer`) | `productivity` key |
| Focus timers (running/paused) | `useFocusTimer` (refs + mirrored state) | OS trigger only |
| Active/edit sheet visibility | `hooks/useTaskScreen` | no |
| Current screen | `App.AppContent` (`Screen` union) | no |
| Notification permission + banner | `NotificationProvider` | no (asked each launch) |
| Pending reminders (daily/streak) | Notifee, reconciled by `useReminders` | OS triggers |
| Per-task reminders | Notifee, reconciled by `useTaskReminders` | OS triggers |
| Planned-start reminders | Notifee, reconciled by `usePlanReminders` | OS triggers |
| Daily goals | `hooks/useDailyGoals` in `WelcomeComponent` | `@daily-goals/v1` key |
| Goals draft (unsaved fields) | `GoalsScreen` local state | no |
| Approved plan + replan preferences | `hooks/useReplan` in `WelcomeComponent` | `@replan/v1` key |
| Replan proposal (unapproved) | `hooks/useReplan` (in-memory) | no |
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
(`home | tasks | tag | goals | replan | settings`) held above `WelcomeComponent`.
No router is used because six destinations do not need a stack; the screens swap
by rendering one or the other, and Android hardware back is handled explicitly.

`WelcomeComponent` is the composition point: it reads `useTaskScreen()` once,
the settings controller once, the daily-goals hook once, the replan controller
once, and switches on `screen`. Both sheets (`AddTodoModal`, `TimerPickerModal`)
are built once here and rendered in every branch, so they cannot drift between
screens.

## Controllers

`hooks/` holds every controller; `hooks/index.ts` is the layer's public surface,
which the composition point imports. Inside the folder, a controller imports its
siblings by path so the graph stays visible.

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
- `useReplan` owns the replan proposal and the approved plan: it hydrates
  `@replan/v1`, builds a proposal from the current tasks (via the pure engine),
  and applies one — re-checking the signature and the workday end first. It also
  exposes `plannedLabelFor` for the rows and the engine-view `tasksById`.
- `usePlanReminders` reconciles the approved plan's start reminders
  (`plan-<taskId>`), opt-in and gated on hydration. Each reconciler filters the
  OS's pending set to **its own id namespace**, so the daily/streak, task and
  planned passes cannot cancel one another.
- `useDailyGoals` owns the user's daily targets: one hydration, one in-memory
  value shared by the home tile and the Goals & Preferences screen, and
  fire-and-forget writes under the `@daily-goals/v1` key.
- `useProductivityView` turns the productivity snapshot and the saved goals into
  the two home cards' models (`TodayViewModel`, `HistoryViewModel`), so
  `TodayCard` and `ProductivityDashboard` stay presentational.
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
usePlanReminders (useReplan, beside the task list):
  planStartReminders(plan, tasks, now)       vs  getPendingReminders()  → reconcile
useTaskReminders (useTaskScreen, under the task list):
  planTaskReminders(todos, now)              vs  getPendingTaskReminders() → reconcile
```

All three are idempotent: schedule what is missing, cancel what is no longer
wanted. The plans are pure; the hooks own only side effects. Each reads only the
pending entries in **its own id namespace** (`daily-`/`streak-`, `plan-`,
`task-reminder-`), so none can cancel another's.

### Daily replan

```
Home "Replan my day" → screen { name: 'replan' } → ReplanScreen
  Build → useReplan.generate()
      normalizeReplanTasks(todos, timerWindows) + collectCommitments(fixed tasks)
        → buildReplanProposal(input)   (pure engine; declares, never mutates)
  Apply → useReplan.apply()
      re-check signature + workday end  → savePlan(...)   ONE setItem @replan/v1
      → usePlanReminders reconciles the plan's start reminders
  Cancel → drop the in-memory proposal (nothing was persisted)
```

A running focus timer is a protected interval, so the plan is built around it;
the home entry is suppressed entirely while one runs. Completed, fixed and
active-timer tasks are reported `protected` and never moved.

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
   `todoId` = running timer, `reminder` = daily/streak **and** planned starts
   (`plan-<taskId>`), `taskReminder` = task. A reader must only match its own key,
   and each reconciler must cancel only ids in its own namespace — see
   `isDailyOrStreakReminderId`.
4. **`Notifee` repeating triggers are Android-only**, so every reminder is a
   one-shot timestamp reconciled on each relevant change.
5. **Storage keys are independent** (`todos`, `productivity`, theme preference,
   custom tags, daily goals, replan): clearing one never touches another.
6. **Components hold no colours**; `theme.test.ts` enforces it over the source.
7. **No router, no new state library.** Six screens and one flat reducer do not
   need either.

## Known follow-ups

Two presentational strings were deliberately left in place: each needs a copy
decision before it needs a selector, so moving them would have been motion
without a test behind it.

1. **The home screen's task tile title.** `HomeScreen` still writes the
   `All tasks` / `1 open of N` line inline. The wording (and its pluralisation)
   belongs next to the other list copy in `todos/taskSelectors` once it settles.
2. **The Goals editor's preview copy.** `GoalsScreen` builds its preview strings
   inline; their natural home is beside `motivationFor` in `daily-goals/goals.ts`.

## Testing strategy

The test layout mirrors the layers, which is deliberate: a pure-domain test
needs no renderer, and if it ever does, the architecture has regressed.

- `__tests__/productivity/`, `__tests__/todos/`, `__tests__/replan/` — pure logic,
  no renderer.
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
