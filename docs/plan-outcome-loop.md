# Closing the loop between plan and outcome (Phase 0–2)

Status: agreed plan; implementation in progress.

For one day, compare the approved plan against what actually happened — tasks
completed, focus time recorded, and tasks **postponed** (carried into a later
plan) — and close the loop by feeding that back into task estimates through
advisory, user-confirmed adjustments. Nothing about a task's estimate, deadline
or plan is ever changed silently.

## Locked decisions

1. **Postponed** = planned for a previous window, remained unfinished, and was
   subsequently carried into a later recorded plan. Not every unfinished task.
   No separate "Defer" action this pass.
2. **Scope** = Phase 0–2. No trend dashboard or extra metrics.
3. **Detail location** = a dedicated Plan Review screen; the Home card stays
   compact with a clear entry point.
4. **History depth** = rolling 7 local calendar days, today inclusive.
5. **Calibration estimate source** = the day's **placement duration** (the
   estimate as planned), not the task's current `estimatedMinutes`.
6. **Apply mechanism** = a targeted `setEstimatedMinutes(id, minutes)` invoked
   only on an explicit per-row tap in Plan Review.
7. **Today's focus source** = the session log (authoritative), with the stored
   `totalActualFocusMins` as fallback when sessions are unavailable.

## Validated assumptions

- `PlanOutcome.results[]` records each planned task's `taskId`, `plannedStart`,
  `plannedEnd` and `completed`. A stored outcome is therefore also a record of
  that day's plan — this is what makes "carried into a later plan" computable.
- `useReplan.apply()` filters `kind: 'break'` before persisting, so
  `DayPlan.placements` are task-only. Planned focus minutes = Σ(end − start) is
  safe.
- Focus sessions persist in `@productivity/v1` as a full ordered log, capped at
  `MAX_RETAINED_SESSIONS = 10_000` — far beyond a 7-day window.
- Day boundaries are consistent: sessions bucket by
  `localDateKey(session.startedAt)` (`rollupDayForSession`); helpers live in
  `shared/date.ts` (`dayKeyRange`, `addDays`, `startOfDay`).
- `useTasks` exposes `updateTodo`; `openEdit` exists. There is a clean place to
  add a targeted estimate write.

## Problems this work fixes

- `totalPlannedFocusMins` is hardcoded `undefined` in both return paths of
  `computePlanOutcome`.
- `postponed` is unreachable: `classify()` can only return `missed` for an
  unfinished block, yet the summary/tile count it.
- `OutcomeContext.focusSessionsForDay` is accepted but never passed.
- `totalPlanned = plan.placements.length` double-counts duplicate placements.
- `planOutcomeStorage` does not sanitize on read.
- The productivity provider does not expose the session log, so history hooks
  cannot compute per-day focus without a second storage read.
- `reflections/learning.ts#suggestAdjustments` reads `entry.actualDurations`,
  which the reflection modal never populates — the function is dead today.

## Honest limitations to surface in the UI

- `@replan/v1` stores only the latest `DayPlan`; past plans come from stored
  outcome records. If a day has no saved outcome, that day is partial/
  unavailable.
- A past day's `completed` flag is the value persisted during that day.
- A completion recorded before `Todo.completedAt` existed cannot be dated from
  the task. Today's comparison therefore merges the day's persisted outcome, so a
  rebuild does not erase a legacy completion. Other days attribute it only if
  their stored record already holds it; a day without that record stays unknown
  rather than having a day guessed for it.
- Per-task focus for a past day is recomputed from the session log; if that log
  was cleared, focus is shown as **unavailable**, not 0.

## Postponed rule

A task counts as postponed for day **D** iff it appears in D's recorded plan,
was **not** completed by end of D, and appears in the recorded plan of some
later day D′ (D′ > D) within the window. Established purely from the outcome
store plus today's live plan; never inferred from a task's current state, and
never counted merely because it is unfinished.

## File-by-file plan

### Pure domain — replan
- `replan/planOutcome.ts` — compute `totalPlannedFocusMins` from placements;
  accept `focusSessionsForDay`; accept optional `carriedForwardTaskIds` so
  unfinished carried tasks classify as `postponed`; dedupe placements by task id.
- `replan/rollover.ts` (new) — `deriveRollover`, `applyRollover`, window
  aggregates.
- `replan/planOutcomeStorage.ts` — sanitize on read; windowed load.

### Pure domain — productivity
- `productivity/planFocus.ts` (new) — day and per-task focus from the session
  log.

### Pure domain — todos / calibration
- `todos/taskOperations.ts` — `withEstimatedMinutes`.
- `reflections/learning.ts` — rewrite `suggestAdjustments` to a pure calibration
  input returning `{ adjustments, planningFactor }`.

### Provider
- `productivity/ProductivityProvider.tsx` — expose the closed session log.

### Hooks
- `hooks/usePlanOutcome.ts` — derive and pass `focusSessionsForDay`.
- `hooks/usePlanReview.ts` (new) — 7-day controller, rollover, calibration,
  explicit apply.
- `hooks/useTasks.ts` / `hooks/useTaskScreen.ts` — `setEstimatedMinutes`.

### UI
- `components/PlanReviewScreen.tsx` (new).
- `components/PlanOutcomeList.tsx`, `components/PlanOutcomeSummary.tsx` tweaks.
- `components/HomeScreen.tsx` entry point.
- `WelcomeComponent.tsx` — `{ name: 'planReview' }` screen + wiring.

### Tests
`replan/planOutcome`, `replan/rollover`, `replan/planOutcomeStorage`,
`productivity/planFocus`, `reflections/learning`, `hooks/usePlanReview`,
`components/PlanReviewScreen`, `todos/taskOperations`, `theme`.

## Out of scope (deferred)

- Phase 3 accuracy trend and additional dashboard metrics.
- A separate Defer action.
- Any silent changes to estimates, deadlines or plans.
