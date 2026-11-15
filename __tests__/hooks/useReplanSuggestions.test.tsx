/**
 * `useReplanSuggestions`: detection, per-day dismissal, snooze and persistence.
 *
 * The detection maths is pure and tested in `replan/suggestions.test.ts`. What
 * these pin is the controller: the focus-timer guard, that a dismissal survives a
 * write (it once produced a versionless doc the sanitiser dropped), that a
 * dismissal is per-day, and that "remind me later" snoozes rather than drops.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  useReplanSuggestions,
  SUGGESTION_SNOOZE_MS,
  type ReplanSuggestionsController,
} from '../../hooks/useReplanSuggestions';
import { REPLAN_STORAGE_KEY } from '../../replan/planStorage';
import type { DayPlan, ReplanDoc } from '../../replan/types';
import type { Todo } from '../../todos/model';
import { render } from '../support/render';

const DAY = '2026-05-04';

function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

/** A plan whose single block ended at 11:00; at 14:00 it has been missed. */
const PLAN: DayPlan = {
  dayKey: DAY,
  approvedAt: at(9),
  signature: 'sig',
  placements: [{ taskId: 'report', start: at(10), end: at(11) }],
};

const REPORT: Todo = {
  id: 'report',
  text: 'Project report',
  completed: false,
  tags: [],
  createdAt: 1,
};

let api: ReplanSuggestionsController | undefined;

function Probe({
  hydrated = true,
  anyTimerRunning = false,
  plan = PLAN,
}: {
  hydrated?: boolean;
  anyTimerRunning?: boolean;
  plan?: DayPlan | null;
}) {
  api = useReplanSuggestions({
    hydrated,
    plan,
    replanTasks: [],
    todos: [REPORT],
    anyTimerRunning,
    today: DAY,
    workdayStart: '09:00',
    workdayEnd: '18:00',
  });
  return null;
}

async function readDoc(): Promise<ReplanDoc | null> {
  const raw = await AsyncStorage.getItem(REPLAN_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ReplanDoc) : null;
}

const act = (body: () => void) => ReactTestRenderer.act(body);

beforeEach(async () => {
  jest.useFakeTimers();
  // 12:00: the 10–11 block has ended (missed) but the workday is only a third
  // gone, so the behind-schedule rule stays quiet and each test sees one cause.
  jest.setSystemTime(new Date(2026, 4, 4, 12, 0, 0));
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useReplanSuggestions', () => {
  it('reports a missed planned block', async () => {
    await render(<Probe />);
    await ReactTestRenderer.act(async () => undefined);

    expect(api?.suggestions).toHaveLength(1);
    expect(api?.suggestions[0]).toMatchObject({
      type: 'planned-block-missed',
      taskId: 'report',
      dayKey: DAY,
    });
  });

  it('suppresses everything while a focus timer runs', async () => {
    await render(<Probe anyTimerRunning />);
    await ReactTestRenderer.act(async () => undefined);
    expect(api?.suggestions).toEqual([]);
  });

  it('dismissing removes the suggestion and persists a valid document', async () => {
    await render(<Probe />);
    await ReactTestRenderer.act(async () => undefined);

    const id = api!.suggestions[0].id;
    act(() => {
      api?.dismiss(id);
    });
    await ReactTestRenderer.act(async () => undefined);

    expect(api?.suggestions).toEqual([]);

    const doc = await readDoc();
    expect(doc?.version).toBe(1);
    expect(doc?.suggestions?.dayKey).toBe(DAY);
    expect(doc?.suggestions?.dismissedIds).toContain(id);
  });

  it('"remind me later" snoozes rather than dismisses', async () => {
    await render(<Probe />);
    await ReactTestRenderer.act(async () => undefined);

    const id = api!.suggestions[0].id;
    act(() => {
      api?.remindLater(id);
    });
    await ReactTestRenderer.act(async () => undefined);

    // Snoozed now: hidden, but not in dismissedIds.
    expect(api?.suggestions).toEqual([]);
    const doc = await readDoc();
    expect(doc?.suggestions?.snoozedUntil?.[id]).toBe(Date.now() + SUGGESTION_SNOOZE_MS);
    expect(doc?.suggestions?.dismissedIds ?? []).toEqual([]);
  });

  it('ignores a dismissal stored for a previous day', async () => {
    await AsyncStorage.setItem(
      REPLAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        preferences: {
          workdayStart: '09:00',
          workdayEnd: '18:00',
          bufferMinutes: 10,
          breakMinutes: 15,
          breakAfterMinutes: 60,
          mode: 'fit',
          lowPriorityDeferral: false,
          notifyPlannedStarts: false,
        },
        plan: null,
        suggestions: {
          dayKey: '2026-05-03',
          dismissedIds: ['planned-block-missed:report'],
          snoozedUntil: {},
          lastEvaluatedAt: at(13),
        },
      }),
    );

    await render(<Probe />);
    await ReactTestRenderer.act(async () => undefined);

    // Yesterday's dismissal must not silence today's identical suggestion.
    expect(api?.suggestions).toHaveLength(1);
  });
});
