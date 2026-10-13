# Plan-Outcome Comparison (Hook + UI Focus)

Goal: Compare what was planned with what actually happened (tasks completed, focus time recorded, tasks postponed). Build foundation for future learning/reflection.

## Requirements
- Compare planned vs actual: tasks completed, focus time recorded, tasks postponed
- Distinctive product identity
- Deterministic, transparent, optional, user-controlled
- Pure domain where possible
## 1. Types (replan/planOutcome.ts domain types)

Add to `replan/types.ts` or new module. Following existing patterns.

```ts
export type PlannedTaskResultStatus =
  | 'completed-on-time'  // completed within/around planned window? or by end of day
  | 'completed-late'     // completed after planned end but same day
  | 'postponed'          // planned but not completed by end of day; moved to later
  | 'missed'             // planned window passed, not completed, not postponed (effectively missed)
  | 'ongoing'            // planned but not yet ended/completed
  | 'infeasible';        // was infeasible in plan

export type PlannedTaskResult = {
  taskId: string;
  taskText?: string;
  plannedStart?: number;
  plannedEnd?: number;
  wasScheduled: boolean;
  completed: boolean;
  completedAt?: number;
  actualFocusSeconds?: number;
  status: PlannedTaskResultStatus;
  reason?: string;
};

export type PlanOutcome = {
  dayKey: DayKey;
  planApprovedAt: number;
  generatedAt: number;
  planSignature: string;
  results: PlannedTaskResult[];
  summary: {
    totalPlanned: number;
    completed: number;
    completedOnTime: number;
    completedLate: number;
    postponed: number;
    missed: number;
    totalPlannedFocusMins?: number;
    totalActualFocusMins?: number;
  };
};
```

## 2. Pure domain logic (replan/planOutcome.ts)

New pure module: `replan/planOutcome.ts`
- `computePlanOutcome(ctx: OutcomeContext): PlanOutcome`
- Joins DayPlan with todos, productivity (sessions, attribution) to determine actuals
- Classify status based on planned window vs completion time
- Compute actual focus attributed to each planned task (via attribution map from productivity)

```ts
export type OutcomeContext = {
  dayKey: DayKey;
  plan: DayPlan | null;
  todos: readonly Todo[];
  // productivity-derived
  attribution: Map<string, Attribution>; // from productivity snapshot
  focusSessionsForDay?: FocusSession[]; // sessions on this day
  now: number;
};
```

Rules:
- If task not in plan placements (wasn't scheduled) - not included as "planned task result" in comparison? Focus on planned tasks.
- completed-on-time: completed is true and completedAt is <= plannedEnd + grace? Or just completedAt <= plannedEnd? Define simple: completed-on-time if completed and completedAt <= plannedEnd (or within small window). Or if completed same day before or at planned end. 
- completed-late: completed true, completedAt > plannedEnd
- postponed: was scheduled (in plan) but not completed by end of day and day ended? Or if still not completed now and it's end of day context - "postponed" means moved to later (not done today). So if not completed and (now is past workday end or we’re computing for closed day), status is postponed/missed. For "ongoing" comparison during day, use 'ongoing'.
- missed: planned window ended (plannedEnd < now), not completed, and (if day context is "closed" or just ended) -> missed. If still within day and not ended, 'ongoing'.

## 3. Storage

Option: add to ReplanDoc? Or separate key `@replan-outcomes/v1`? To build history over time (for learning in reflection), better separate or store outcomes by day. Also comparison is useful to show "how yesterday went".

New: `replan/planOutcomeStorage.ts` (impure) with key like `@replan-outcomes/v1` storing map of dayKey -> PlanOutcome (or array). Similar to goals storage pattern.

```ts
export const PLAN_OUTCOMES_KEY = '@replan-outcomes/v1';
export type PlanOutcomesStore = Record<string, PlanOutcome>;
```

Also maybe persist last outcome when day closes? Hook can manage.

## 4. Controller Hook: usePlanOutcome

New: `hooks/usePlanOutcome.ts`
```ts
export type UsePlanOutcomeArgs = {
  hydrated: boolean;
  dayKey: DayKey;
  plan: DayPlan | null;
  todos: readonly Todo[];
  attribution: Map<string, Attribution>;
  now: number;
};
export type PlanOutcomeController = {
  outcome: PlanOutcome | null;
  loadYesterday: () => Promise<PlanOutcome | null>;
  saveOutcome: () => Promise<void>;
};
```

Provides comparison for today’s plan vs actual so far; also can load yesterday’s outcome for UI.

## 5. UI

### a) Comparison summary on Replan screen or Home?
Could add a "Today’s plan vs actual" section on Home (compact) or on Replan screen after applying. Also show yesterday’s comparison.

Components:
- `components/PlanOutcomeSummary.tsx` (compact tiles: completed/planned, on-time/late, postponed/missed, focus mins)
- `components/PlanOutcomeList.tsx` (per-task breakdown with status chips)

### b) Yesterday comparison banner on Home
Show subtle "Yesterday: X/Y done, Y postponed" if yesterday has outcome.

Integration: HomeScreen takes `yesterdayOutcome?: PlanOutcome`.

## 6. Implementation order (hook+UI)

1. Types in replan/types.ts for PlanOutcome
2. Pure replan/planOutcome.ts
3. planOutcomeStorage.ts
4. hooks/usePlanOutcome.ts
5. UI components (Summary, List)
6. Wire into HomeScreen/ReplanScreen
7. Tests
