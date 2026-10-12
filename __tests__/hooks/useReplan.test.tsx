/**
 * `useReplan`: generation, approval and the apply guard.
 *
 * The engine is pure and tested beside this; what these tests pin is the
 * controller — hydrate the document, build a fresh proposal, and refuse to apply
 * one that no longer matches the day. The last is the brief's "never present a
 * post-deadline finish as on-time" expressed as a persisted-plan guard.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { REPLAN_STORAGE_KEY } from '../../replan/planStorage';
import type { ReplanDoc } from '../../replan/types';
import { useReplan, type ReplanController } from '../../hooks/useReplan';
import { NotificationProvider } from '../../notifications';
import type { Todo } from '../../todos/model';
import { render } from '../support/render';

/** 4 May 2026 at `hours:minutes` local. */
function at(hours: number, minutes = 0): number {
  return new Date(2026, 4, 4, hours, minutes, 0, 0).getTime();
}

const TODAY = '2026-05-04';

const REPORT: Todo = {
  id: 'report',
  text: 'Project report',
  completed: false,
  tags: [],
  createdAt: 1,
  estimatedMinutes: 45,
  priority: 'high',
};

let api: ReplanController | undefined;

function Probe({ todos, hydrated = true }: { todos: Todo[]; hydrated?: boolean }) {
  api = useReplan({
    todos,
    hydrated,
    today: TODAY,
    timerWindowFor: () => null,
  });
  return null;
}

function tree(todos: Todo[], hydrated = true) {
  return (
    <NotificationProvider>
      <Probe todos={todos} hydrated={hydrated} />
    </NotificationProvider>
  );
}

const act = (body: () => void) => ReactTestRenderer.act(body);
const settle = () => ReactTestRenderer.act(async () => undefined);

async function readDoc(): Promise<ReplanDoc | null> {
  const raw = await AsyncStorage.getItem(REPLAN_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ReplanDoc) : null;
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 4, 14, 0, 0));
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useReplan', () => {
  it('hydrates an approved plan and labels its windows', async () => {
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
        plan: {
          dayKey: TODAY,
          approvedAt: at(13, 0),
          signature: 'sig',
          placements: [{ taskId: 'report', start: at(14, 0), end: at(14, 45) }],
        },
      }),
    );

    await render(tree([REPORT]));
    await settle();

    expect(api?.hasPlan).toBe(true);
    expect(api?.plannedLabelFor('report')).toBe('2:00 PM – 2:45 PM');
    expect(api?.plannedLabelFor('missing')).toBeUndefined();
  });

  it('generates a proposal without persisting anything', async () => {
    await render(tree([REPORT]));
    await settle();

    let proposal: ReturnType<ReplanController['generate']> | undefined;
    act(() => {
      proposal = api?.generate();
    });

    expect(proposal?.placements[0]).toMatchObject({
      taskId: 'report',
      start: at(14, 0),
      end: at(14, 45),
    });
    expect(await readDoc()).toBeNull();
  });

  it('persists the plan on apply and reports it as the approved plan', async () => {
    await render(tree([REPORT]));
    await settle();

    act(() => {
      api?.generate();
    });
    await ReactTestRenderer.act(async () => {
      await api?.apply();
    });

    const doc = await readDoc();
    expect(doc?.plan?.dayKey).toBe(TODAY);
    expect(doc?.plan?.placements).toEqual([
      { taskId: 'report', start: at(14, 0), end: at(14, 45) },
    ]);
    expect(api?.hasPlan).toBe(true);
    expect(api?.plannedLabelFor('report')).toBe('2:00 PM – 2:45 PM');
  });

  it('marks a proposal stale and refuses to persist once the clock moves', async () => {
    await render(tree([REPORT]));
    await settle();

    act(() => {
      api?.generate();
    });

    // A minute of drift is enough: the signature is floored to the minute.
    jest.setSystemTime(new Date(2026, 4, 4, 14, 2, 0));
    await ReactTestRenderer.act(async () => {
      await api?.apply();
    });

    expect(api?.stale).toBe(true);
    expect(await readDoc()).toBeNull();
  });

  it('refuses to apply and marks stale when the workday has ended', async () => {
    await render(tree([REPORT]));
    await settle();

    act(() => {
      api?.generate();
    });

    jest.setSystemTime(new Date(2026, 4, 4, 19, 0, 0));
    await ReactTestRenderer.act(async () => {
      await api?.apply();
    });

    expect(api?.stale).toBe(true);
    expect(await readDoc()).toBeNull();
  });

  it('persists a preference change and drops the in-memory proposal', async () => {
    await render(tree([REPORT]));
    await settle();

    act(() => {
      api?.generate();
    });
    expect(api?.proposal).not.toBeNull();

    act(() => {
      api?.setPreferences({
        ...api!.preferences,
        workdayStart: '08:00',
        mode: 'protect',
      });
    });
    await settle();

    expect(api?.proposal).toBeNull();
    const doc = await readDoc();
    expect(doc?.preferences.workdayStart).toBe('08:00');
    expect(doc?.preferences.mode).toBe('protect');
  });

  it('cancel drops the proposal without persisting', async () => {
    await render(tree([REPORT]));
    await settle();

    act(() => {
      api?.generate();
    });
    act(() => {
      api?.cancel();
    });

    expect(api?.proposal).toBeNull();
    expect(await readDoc()).toBeNull();
  });
});
