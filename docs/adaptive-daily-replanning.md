# Adaptive Daily Replanning — Plan (with pointers + architecture)

Repository: `Native/MyApp/` (local-first React Native; no backend, no router/state/AI library).
All pointers are `path:line` in `Native/MyApp/` unless noted. Verified against the current tree.

This document emphasises two things: **`ReplanDoc`** (the single persisted replan document) and the
**replan logic** (the deterministic scheduling engine). A pointer index and architecture diagrams come first.

---

## 0. Architecture diagram

### 0.1 Runtime stack (existing) + the replan seam (new)

```
App.tsx:40  <SafeAreaProvider>
              <ThemeProvider>                 theme/ThemeProvider.tsx
                <NotificationProvider>        notifications/NotificationProvider.tsx   (permission, banner, pressedTodoId)
                  <ProductivityProvider>      productivity/ProductivityProvider.tsx:73  (@productivity/v1)
                    <AppRoot>
                      useReminders()          App.tsx:95
                      screen = useState<Screen>  App.tsx:71   -> WelcomeComponent.tsx:157
                      <WelcomeComponent>
                        useTaskScreen()       hooks/useTaskScreen.ts:80
                          useTasks()          todos/useTasks.ts:21        -> "todos"
                          useTimerOrchestration() hooks/useTimerOrchestration.ts:31  (OS timers)
                          useTaskReminders()  hooks/useTaskReminders.ts:33 (called useTaskScreen.ts:106)
                        useSettings()         hooks/useSettings.ts
                        useDailyGoals()       daily-goals/useDailyGoals.ts:14 -> "@daily-goals/v1"
                        useProductivity()     WelcomeComponent.tsx:120
                        renderRow -> TodoRow  WelcomeComponent.tsx:125
                        ──────────────────────────────────────────────────────────────
                        [NEW] useReplan()     hooks/useReplan.ts        -> "@replan/v1" (ReplanDoc)
                        [NEW] usePlanReminders() hooks/usePlanReminders.ts (planned-start reminders)
                        [NEW] <ReplanScreen/> components/ReplanScreen.tsx  (Screen union: WelcomeComponent.tsx:48)
```

### 0.2 Replan request / apply flow (engine is pure; only Apply persists)

```
   task list ("todos") ─────────┐
   fixed commitments (tasks) ───┤
   active timer windows (OS) ───┼──► replan/normalize.ts ──► replan/engine.ts ──► ReplanProposal
   clock: now ──────────────────┤            ▲                    │                (PURE, NOT persisted)
   preferences (ReplanDoc.prefs)┘        replan/rank.ts            │
                                          replan/interval.ts   replan/validate.ts
                                                               replan/explain.ts
                                                                   │
                                                                   ▼
                                                        components/ReplanScreen.tsx  (preview timeline,
                                                        summary, explanations, can't-fit section)
                                                                   │  user taps "Apply plan"
                                                                   ▼
                                                     hooks/useReplan.ts::apply()
                                                   recompute signature from LATEST state
                                                        stale ──► reject / regenerate
                                                        fresh ──► planStorage.save()
                                                                   │
                                                                   ▼
                                                    "@replan/v1" = ReplanDoc
                                                    { version, preferences, plan: DayPlan|null }
                                                                   │  after persist succeeds
                                                                   ▼
                                                    hooks/usePlanReminders.ts reconcile
                                                    (id namespace "plan-<taskId>"; never "timer-*")
```

### 0.3 Module boundary (pure vs impure) — the rule the codebase already enforces

```
   PURE  (no React / RN / AsyncStorage / Notifee)          IMPURE BOUNDARY (side effects)
 ┌──────────────────────────────────────────────┐     ┌────────────────────────────────────────────┐
 │ replan/types.ts        replan/normalize.ts   │     │ replan/planStorage.ts    -> AsyncStorage     │
 │ replan/interval.ts     replan/engine.ts      │◄────┤ hooks/useReplan.ts                          │
 │ replan/preferences.ts  replan/validate.ts    │     │ hooks/usePlanReminders.ts -> notifications/  │
 │ replan/rank.ts         replan/explain.ts     │     │ components/ReplanScreen.tsx                 │
 │ replan/planReminders.ts                      │     │ components/ReplanTimeline.tsx               │
 └──────────────────────────────────────────────┘     └────────────────────────────────────────────┘
   (mirrors productivity/domain.ts:13,23 — tests import the pure barrel and need no mocks)
```

---

## 1. Pointer index (existing code to reuse / modify)

### Task domain — `todos/`
- `todos/model.ts:14` `Todo` type · `:80` `TodoDraft` · `:130` `migrateTodos` · `:159` `nextTodoId` · `:171` `TODOS_STORAGE_KEY = 'todos'`
- `todos/taskOperations.ts:29` `applyDraftToTodo` · `:56` `createTodoFromDraft`
- `todos/taskReminders.ts:16` `PlannedTaskReminder` · `:31` `dueAt` · `:39` `planTaskReminders` (pure)
- `todos/taskRepository.ts:14` `loadTodos` · `:31` `saveTodos` · `:75` `buildExportPayload` (**frozen shape**) · `:125` `exportFilename`
- `todos/useTasks.ts:21` `useTasks` · `:26` `hydrated` · `:45-47` save effect · `:50` `createTodo`
- `todos/timeKey.ts:17` `TimeKey` · `:29` `isValidTimeKey` · `:34` `timeKeyFromDate` · `:50` `formatTimeLabel`

### Productivity — `productivity/`
- `dateKey.ts:17` `localDateKey` · `:40` `localDateFromDayKey` (noon anchor) · `:48` `addDays` · `:66` `startOfDay` · `:113` `todayKey` · `:135` `isValidDayKey`
- `storage.ts:18` `STORAGE_KEY = '@productivity/v1'` · `:35` `loadProductivity` · `:69` `saveProductivity`
- `ProductivityProvider.tsx:73` provider · `:74` reducer state · `:102` recompute tick · `:109-115` day rollover · `:153` interval · `:160-162` debounced save
- `domain.ts:13,23` pure barrel (tests import here)

### Notifications — `notifications/`
- `notificationService.ts:19` `ensurePermission` · `:61` `scheduleTimerNotification` · `:79` `cancelTimerNotification` · `:88` `syncTimerNotification` · `:141` `getPendingTimers` · `:150` `getPendingReminders` · `:159` `PendingTaskReminder` · `:173` `getPendingTaskReminders` · `:191` `scheduleTaskReminder` · `:223` `cancelTaskReminder`
- `reminderPlan.ts:21` `DAILY_REMINDER_HOUR` (pure plan example)

### Daily goals (closest template for the new domain) — `daily-goals/`
- `goals.ts:19` `DailyGoals` · `:79` `sanitizeGoals` · `:120` `goalsProgress`
- `goalsStorage.ts:16` `'@daily-goals/v1'` · `:18` `loadDailyGoals` · `:29` `saveDailyGoals`
- `useDailyGoals.ts:14` hook (plain state + one hydration)

### Controllers / composition
- `hooks/useTaskScreen.ts:41` `TaskScreen` · `:80` `useTaskScreen` · `:106` `useTaskReminders` call site
- `hooks/useTimerOrchestration.ts:31` hook · `:42` `hasTimer` · `:49` `remainingSecondsFor` · `:63` `getPendingTimers`
- `hooks/useFocusTimer.ts:42` `useFocusTimer` · `:49` `endsRef` (absolute epoch end times)
- `hooks/useTaskReminders.ts:33` hook · `:37` `hydrated`/permission gate · `:39` `planTaskReminders`
- `App.tsx:40` provider stack · `:71` `screen` state · `:95` `useReminders` · `:157` `WelcomeComponent`
- `WelcomeComponent.tsx:48` `Screen` union · `:102` `useTaskScreen` · `:116` `useDailyGoals` · `:120` `useProductivity` · `:125` `renderRow`
- `components/TodoRow.tsx:33` `TodoRowProps` · `:70` `dueLabel` · `:81` `TodoRow`
- `components/AddTodoModal.tsx:45` `onSubmit` · `:103` modal · `:116` `dueDate` · `:117` `dueTime` · `:188` draft

### Test harness
- `jest.setup.js:18` `TZ='Asia/Kolkata'` · `:66` Notifee mock
- `__tests__/theme.test.ts:29` `THEMED_SOURCES` allow-list · `:122-133` explicit count assertion (must update)
- `__tests__/support/render.tsx` render helpers · `__tests__/integration/taskFlow.test.tsx` (frozen seam)

---

## 2. `ReplanDoc` — the single persisted document (emphasis)

**File:** `replan/planStorage.ts` — the ONLY file in `replan/` that touches `AsyncStorage`.
**Key:** `@replan/v1` (versioned, separate key — mirrors `goalsStorage.ts:16`, `storage.ts:18`).

```
ReplanDoc = {
  version: 1,
  preferences: {
    workdayStart: TimeKey,        // '09:00'
    workdayEnd: TimeKey,          // '18:00'
    bufferMinutes: number,        // 10
    breakMinutes: number,         // 15
    breakAfterMinutes: number,    // 60
    mode: 'fit' | 'protect',      // default 'fit'
    lowPriorityDeferral: boolean, // default false  (Mode B opt-in)
    notifyPlannedStarts: boolean  // default false  (planned-start reminders OPT-IN)
  },
  plan: DayPlan | null
}

DayPlan = {
  dayKey: DayKey,            // the local day this plan is for  (dateKey.ts:17)
  approvedAt: number,        // epoch ms
  signature: string,         // staleness fingerprint (§3)
  placements: Array<{ taskId: string; start: number; end: number }>
}
```

Why `ReplanDoc` is shaped this way:

- **One key, one `setItem` per apply.** Preferences and the plan travel together, so applying a plan is a
  single write. This is the whole answer to "what if an apply spans multiple keys" — with one document it
  does not. (If that ever changes: persist `pendingApply = { signature, placements }` in this doc first, mutate
  tasks second, clear the marker third; a leftover marker on load triggers recompute rather than trusting a
  half-written state. Dormant by design.)
- **Plan is separate from the task.** The engine emits a proposal; `apply` writes only `@replan/v1`. A task's
  `dueDate`/`dueTime` (`todos/model.ts:55,67`) is never mutated — "preserve deadlines / never silently modify
  task data" is structural, not a convention.
- **`DayPlan.dayKey` scopes the plan to one local day.** A plan whose `dayKey !== todayKey()`
  (`dateKey.ts:113`) is ignored for display and reminders and must be regenerated — no silent reuse after
  midnight.
- **`signature` is the staleness guard.** `apply` recomputes it from the latest state; a mismatch rejects the
  proposal rather than overwriting newer user edits.
- **`sanitizeReplanDoc` repairs every field** and degrades to defaults on anything unexpected (same discipline
  as `sanitizeGoals` at `goals.ts:79` and `storage.ts:35`). Malformed data can never crash the app.

**Task-side inputs** (modify `todos/model.ts:14` `Todo`; mirror on `TodoDraft` `:80`; repair in
`migrateTodos` `:130`; carry in `taskOperations.ts:29,56`):

- `priority?: 'high' | 'medium' | 'low'` — **optional**; absent normalises to `'low'` (documented; not written
  to storage for legacy tasks). See the Mode B consequence in §8.
- `estimatedMinutes?: number` — whole minutes `> 0`; absent ⇒ `needsInformation` (`needs_duration`), never guessed.
- `schedulingMode?: 'flexible' | 'fixed'` — absent ⇒ `'flexible'`.
- `fixedStartAt?: number` — epoch ms; user-owned anchor for a fixed task/commitment.

The frozen export (`taskRepository.ts:75`) is untouched, so its test stays green.

---

## 3. The replan logic — deterministic scheduling engine (emphasis)

Pure function: `replan/engine.ts` → `buildReplanProposal(input): ReplanProposal`.
Guarantees: identical normalised input ⇒ identical schedule, classifications, reason codes. No AI, no API, no
`Date.now()` (now is passed in), integer-minute arithmetic, half-open `[start, end)`.

**Module split**

- `replan/types.ts` — `Priority`, `SchedulingMode`, `ReplanTask`, `FixedCommitment`, `ProtectedInterval`,
  `Workday`, `ReplanPreferences`, `ReplanningMode`, `Placement`, `Classification`, `ReasonCode`, `TaskOutcome`,
  `ReplanInput`, `ReplanProposal`.
- `replan/interval.ts` — `overlaps`, `contains`, `subtractIntervals`, `mergeIntervals`, `fits`.
- `replan/preferences.ts` — prefs type, defaults, `sanitizeReplanPreferences` (mirrors `goals.ts:79`).
- `replan/normalize.ts` — raw tasks + timers + commitments + now → validated `ReplanInput`; flags missing
  durations and conflicting commitments; never guesses.
- `replan/rank.ts` — the comparator below.
- `replan/engine.ts` — the phase pipeline.
- `replan/validate.ts` — `validateSchedule` (must be violation-free).
- `replan/explain.ts` — `ReasonCode` → calm, locale-free sentence + structured params.

**Phases**

1. **Validate & normalise.** Coerce priority/mode; missing/invalid duration → `needsInformation`
   (`needs_duration`), excluded from placement. Require `workday.start < workday.end`. Set aside completed
   tasks and tasks with a running timer as protected. Merge overlapping fixed commitments for protection **and
   report** them (`conflicting_commitments`).
2. **Remaining workday.** `[max(now, workday.start), workday.end)`, `now` rounded up to the next whole minute.
3. **Subtract protected intervals.** Remaining − commitments − active-timer windows → sorted free segments.
4. **Separate.** Completed (unchanged) · active-timer (unchanged/protected) · fixed tasks (protected at
   `fixedStartAt`) · flexible tasks (to place).
5. **Rank** (documented): priority high→medium→low (tasks with no `priority` rank as low); earliest hard
   deadline first (no-deadline last); earliest existing planned start (none last); stable tie-break `createdAt`
   then `id` (shuffle-invariant).
6. **Find feasible slots.** Earliest-fit: earliest `s ≥ cursor` inside one free segment, and
   `s + duration ≤ deadline` when a deadline exists.
7. **Place.** `cursor = end + bufferMinutes` after each task; skip commitments by jumping to the next segment
   (⇒ natural pre-commitment buffer, no post-commitment buffer). Insert **one break** of `breakMinutes` after
   the block where cumulative work first reaches `breakAfterMinutes`, buffer-separated like a work block.
8. **Recalculate feasibility.** Break/buffer insertion never forces a violation; squeezed tasks are classified.
9. **Classify:** `scheduled` · `deferred` · `infeasible` · `needsInformation` · protected
   (`completed` / `active_timer` / `fixed`).
10. **Explain.** Structured `ReasonCode` + params: `moved`, `kept`, `scheduled_after_commitment`,
    `deferred_no_time`, `deferred_low_priority`, `infeasible_deadline_passed`, `infeasible_deadline_too_soon`,
    `infeasible_no_free_time`, `needs_duration`, `conflicting_commitments`.
11. **Validate** with `validateSchedule` (bounds, no overlaps, no past start, buffers respected, deadlines
    respected, commitments protected).
12. **Return** the proposal. No mutation, no persistence.

**Hard invariants:** never past; never overlap a commitment or another placement; never exceed the workday;
never change/invent a deadline and never present a post-deadline finish as on-time; preserve completed tasks
and running timers (their window is busy); report infeasible tasks rather than dropping them.

**Edge cases:** missing duration → `needsInformation`; overdue deadline → `infeasible_deadline_passed`;
`now + duration > deadline` → `infeasible_deadline_too_soon`; no room & no deadline → `deferred_no_time`; fits
only after a commitment → scheduled in the next segment; conflicting commitments → merged, protected, reported.

**Modes:** **Mode A — "fit" (recommended default):** schedule all feasible tasks; defer only when forced.
**Mode B — "protect":** opt-in `lowPriorityDeferral`; defer low-priority tasks even when time remains
(`deferred_low_priority`). Never a silent default; every deferral carries a reason.

**Signature (staleness).** Stable hash over: task ids, priority, estimate, mode, `completed`, deadline,
`fixedStartAt`, commitments, `now` floored to the minute, resolved workday bounds, preferences/mode. Kept in
one function; `apply` recomputes from the latest state.

### Reference scenario — exact expected output

Inputs: now 14:00; day end 18:00; commitment `[16:00,16:30)`; buffer 10; one 15-min break; `breakAfterMinutes`
60; `mode: 'fit'`; tasks: report 45 high, PRs 30 medium, notes 25 low; all flexible, known durations, no
deadline before day end.

| Block | Interval | Note |
|---|---|---|
| Project report | 14:00–14:45 | scheduled (high) |
| buffer | 14:45–14:55 | |
| Review pull requests | 14:55–15:25 | scheduled (medium); cumulative 75 ≥ 60 ⇒ break next |
| buffer | 15:25–15:35 | |
| Break | 15:35–15:50 | the one break |
| buffer | 15:50–16:00 | |
| Fixed commitment | 16:00–16:30 | protected |
| Prepare tomorrow's notes | 16:30–16:55 | scheduled (low) — fits only after the commitment |

Totals: 100 work + 15 break + 30 commitment + 30 buffer = 175 ≤ 240; 16:55–18:00 stays unbooked.
Mode B instead defers `notes` (`deferred_low_priority`).

---

## 4. Controllers and UI (with pointers)

- `hooks/useReplan.ts` — hydrates `ReplanDoc` (mirrors `useDailyGoals.ts:14`); `generate()` builds a fresh
  proposal from current state; `apply()` re-validates the signature and writes via `planStorage`; exposes
  `plannedLabelFor(taskId)`. Mounted in `WelcomeComponent.tsx` beside `useTaskScreen` (`:102`).
- `hooks/usePlanReminders.ts` — mirrors `useTaskReminders.ts:33` (hydrated gate `:37`, idempotent reconcile).
  Distinct id namespace `plan-<taskId>` and body ("Planned: …") so it can never be confused with
  `todos/taskReminders` deadline reminders or `timer-*` notifications (`notificationService.ts:61-88`). Reconciles
  only after a validated, persisted apply. Never cancels `timer-*`.
- `components/ReplanScreen.tsx` (+ `ReplanTimeline.tsx`) — preferences editor (workday, buffer, break, mode),
  proposed timeline, summary (unchanged/moved/deferred/can't-fit/needs-info), per-task explanations, "Can't fit
  today" section (edit via the existing `AddTodoModal.tsx:103`, never lost), Apply / Cancel / Regenerate. Stale
  state shows "Your day changed — regenerate". Apply disabled while validation fails or stale, but **allowed
  while some tasks are `needsInformation`** (decision #5): those are excluded from placement and listed.
- `components/HomeScreen.tsx` — calm "Replan my day" entry + optional dismissible recovery banner; suppressed
  while any timer runs (`hasTimer` from `useTimerOrchestration.ts:42`); no OS notification.
- `components/TodoRow.tsx` — add optional `plannedLabel` beside `dueLabel` (`:70`), distinct from the due label.
- `WelcomeComponent.tsx:48` — add `| { name: 'replan' }`; render `ReplanScreen`; inject `plannedLabel` at
  `renderRow` (`:125`).
- `__tests__/theme.test.ts:29` — add the new component files to `THEMED_SOURCES` and update the count at
  `:127-130`.

---

## 5. File-by-file changes

New: `replan/types.ts`, `replan/interval.ts`, `replan/preferences.ts`, `replan/normalize.ts`, `replan/rank.ts`,
`replan/engine.ts`, `replan/validate.ts`, `replan/explain.ts`, `replan/planStorage.ts`, `replan/planReminders.ts`,
`replan/index.ts`; `hooks/useReplan.ts`, `hooks/usePlanReminders.ts`; `components/ReplanScreen.tsx`,
`components/ReplanTimeline.tsx`; tests under `__tests__/replan/`, `__tests__/hooks/`, `__tests__/components/`.

Modified: `todos/model.ts` (`:14,80,130`), `todos/taskOperations.ts` (`:29,56`), `components/AddTodoModal.tsx`
(`:103,116-117,188`), `components/TodoRow.tsx` (`:33,70`), `components/HomeScreen.tsx`,
`WelcomeComponent.tsx` (`:48,125`), `__tests__/theme.test.ts` (`:29,127`), plus
`docs/ARCHITECTURE.md`, `docs/INTEGRATION.md`, `README.md`.

Unchanged: `todos/taskRepository.ts` (frozen export, `:75`), `App.tsx` (navigation is generic).

---

## 6. Testing plan (pointers to harness)

Pure (`__tests__/replan/`, no mocks — import the pure barrel, per `productivity/domain.ts:13,23`): reference
scenario exact output; commitments never overlapped; no past start; deadlines unchanged; determinism +
shuffle-invariance; infeasible not dropped; breaks/buffers can't overlap; task fitting only after commitment;
missing duration ⇒ needs-info; completed/timer tasks unchanged; conflicting commitments reported; Mode A vs B.

Storage/migration (`__tests__/replan/planStorage.test.ts`, `__tests__/todos/migration.test.ts`): malformed
`@replan/v1` and malformed todo fields don't crash; new fields round-trip; export shape unchanged
(`taskRepository.ts:75`).

Hooks/integration (`__tests__/hooks/`, mirror `__tests__/hooks/useTaskReminders.test.tsx`): stale proposal
rejected/regenerated (fake timers); `usePlanReminders` reconciles without duplicates and respects permission +
hydration gate (`useTaskReminders.ts:37`); apply persists then reconciles (order asserted); relaunch does not
corrupt or re-apply an approved schedule; `theme.test.ts` updated; `taskFlow.test.tsx` stays green.

---

## 7. Implementation phases

1. Model groundwork — `todos/model.ts` (`:14,80,130`) + `taskOperations.ts` (`:29,56`) + `AddTodoModal.tsx`.
2. Pure interval + preferences + types.
3. Engine (`normalize`/`rank`/`engine`/`validate`/`explain`) + reference and constraint tests.
4. `planStorage.ts` + `sanitizeReplanDoc` + `ReplanDoc` tests.
5. `useReplan` (generate/apply/stale).
6. `planReminders.ts` + `usePlanReminders` (mirror `useTaskReminders.ts`).
7. UI (`ReplanScreen`/`ReplanTimeline`, Home entry/banner, `WelcomeComponent.tsx:48,125`, row planned label,
   `theme.test.ts:29,127`).
8. Docs.

Each phase is independently testable and leaves the app green.

---

## 8. Risks / trade-offs

- Buffer policy under-specified; recommended rule (buffer after tasks and after a break, none after a
  commitment) directly changes expected output — make it a preference.
- Threshold-based break placement is deterministic but can strand a task before a commitment (the reference
  `notes` case); explainable beats optimal.
- `priority` is new user-facing state; absent→**low** means existing/untagged tasks are the first candidates for
  Mode B's low-priority deferral. That is the chosen behaviour, but it is worth a calm UI hint so a task with no
  priority set is not silently treated as unimportant.
- Treating `dueTime` as a hard deadline may classify many tasks infeasible; the softer reading is forbidden
  (late is never on-time).
- Single-day scope: later-day tasks are `deferred`, not scheduled into tomorrow.
- DST / midnight-crossing workdays: resolve via `dateKey.ts` local helpers and flag rather than silently schedule.

---

## 9. Decisions (all settled)

Every open question is now closed. Values below are final and are what the implementation and tests must encode.

| # | Decision | Final choice |
|---|---|---|
| 1 | Fixed commitments | Represented as **fixed tasks** (`schedulingMode: 'fixed'`) in the existing task list |
| 2 | Priority | **Optional** `high \| medium \| low`; absent ⇒ **`low`**, not mandatory |
| 3 | Buffer policy | Buffer **after each task and after a break**; **none** after a fixed commitment; none before the first block or after the last |
| 4 | Break rule | **One** break per day, after cumulative scheduled work first reaches `breakAfterMinutes` (default **60**), buffer-separated like a work block |
| 5 | Missing durations | **Apply is allowed** while some tasks are `needsInformation`; those tasks are excluded from placement and listed separately |
| 6 | Planned-start notifications | **Opt-in** (`notifyPlannedStarts`, default `false`) |
| 7 | Scheduling mode | **Mode A ("fit")** is the default; Mode B (`lowPriorityDeferral`) is an explicit preference |
| 8 | Scope | **Today only**; a plan whose `dayKey !== todayKey()` is ignored and regenerated |
| A | Fixed-task anchor | Dedicated **`fixedStartAt`** epoch on the task (distinct from the `dueDate`/`dueTime` deadline) |
| B | Breaks per day | **One** per day (revisit later if long days need more) |
| C | Default workday | **09:00–18:00**, editable on the Replan screen |
| D | Stale planned windows | **Cleared automatically on re-apply** — the plan doc is replaced wholesale, so windows for tasks no longer scheduled disappear with it |

Notes that follow from the choices:

- Because the plan document is replaced wholesale on apply (D), no separate "clear old placements" step is
  needed; `plannedLabelFor` simply reflects the current `ReplanDoc.plan`.
- Decision 6 means `usePlanReminders` still reconciles (cancels orphans, schedules nothing new) even when the
  preference is off, so toggling it on later does not surface a backlog of stale planned reminders.
- Decisions 3 and 4 are the exact policy encoded in the reference-scenario expected output (§3).
