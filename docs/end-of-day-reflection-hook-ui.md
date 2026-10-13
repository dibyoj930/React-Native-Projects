# End-of-Day Reflection (Hook + UI Focus)

Goal: Ask what got done, what moved, whether estimates realistic. Optional, brief. Use results to improve duration estimates over time.

## 1. Types

New module types. Store reflections per day.

```ts
export type EstimateAccuracy = 'yes' | 'mostly' | 'no' | 'unsure';

export type ReflectionEntry = {
  dayKey: DayKey;
  createdAt: number;
  completed: string[]; // task IDs or just store - better IDs for learning
  moved: string[]; // tasks that moved
  estimatesAccurate: EstimateAccuracy;
  actualDurations?: Record<string, number>; // mins per taskId
  notes?: string;
};

export type ReflectionsStore = Record<string, ReflectionEntry>; // dayKey -> entry
```

## 2. Storage

Key: `@reflections/v1` - separate from replan outcomes. Pure storage module `reflections/storage.ts` (impure) following pattern of other storage modules.

## 3. Learning logic (pure)

`reflections/learning.ts` (pure): Given reflection + past history, compute adjusted estimates. Simple approach: for tasks with actualDurations, compute running average with decay? Or just update estimate if user indicates 'no'. Keep deterministic and transparent - store adjustment factors, don't auto-apply silently without user consent? Or apply suggestions. Requirement says "improve duration estimates over time" - could be opt-in: show suggested updated estimates based on history.

But to keep user-controlled: generate suggested estimates, but don't change stored `estimatedMinutes` until user accepts in replan context.

## 4. Controller Hook

`hooks/useReflection.ts`
```ts
export type ReflectionController = {
  reflection: ReflectionEntry | null;
  canReflect: boolean; // can show prompt today?
  submit: (entry: Partial<ReflectionEntry>) => Promise<void>;
  dismiss: () => void;
  hasReflectedToday: boolean;
};
```

Trigger logic: when to prompt? End of day - e.g. workday ended and (plan existed or many tasks done). Or after rollover. Avoid interrupting focus.

## 5. UI

- `components/ReflectionScreen.tsx` or modal - brief form (3-4 questions max)
- `components/ReflectionPromptBanner.tsx` on Home near end of day
