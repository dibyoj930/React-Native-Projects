/**
 * `useReflection`: the end-of-day prompt gate and the submit path.
 *
 * The important behaviour is the gate: a reflection prompt is an end-of-day
 * thing, it must never appear while a focus timer runs, and it must not reappear
 * once the day has been reflected on or the user has dismissed it.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useReflection, type ReflectionController } from '../../hooks/useReflection';
import { REFLECTIONS_KEY } from '../../reflections/storage';
import type { ReflectionEntry } from '../../reflections/types';
import { render } from '../support/render';

const DAY = '2026-05-04';

type Args = {
  hydrated?: boolean;
  anyTimerRunning?: boolean;
  hasPlanToday?: boolean;
  taskCount?: number;
};

let api: ReflectionController | undefined;

function Probe({
  hydrated = true,
  anyTimerRunning = false,
  hasPlanToday = true,
  taskCount = 3,
}: Args) {
  api = useReflection({
    hydrated,
    dayKey: DAY,
    workdayEnd: '18:00',
    anyTimerRunning,
    hasPlanToday,
    taskCount,
  });
  return null;
}

/** Move the (faked) clock to `hours:minutes` on 4 May 2026 and let the tick run. */
async function tickTo(hours: number, minutes = 0) {
  jest.setSystemTime(new Date(2026, 4, 4, hours, minutes, 0, 0));
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(30_000);
  });
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

describe('useReflection', () => {
  it('does not prompt before the end of the workday', async () => {
    await render(<Probe />);
    await tickTo(14, 0);
    expect(api?.canReflect).toBe(false);
  });

  it('prompts in the last 15 minutes of the workday', async () => {
    await render(<Probe />);
    await tickTo(17, 50);
    expect(api?.canReflect).toBe(true);
  });

  it('never prompts while a focus timer runs', async () => {
    await render(<Probe anyTimerRunning />);
    await tickTo(18, 30);
    expect(api?.canReflect).toBe(false);
  });

  it('stays silent when there is nothing to reflect on', async () => {
    await render(<Probe hasPlanToday={false} taskCount={0} />);
    await tickTo(18, 30);
    expect(api?.canReflect).toBe(false);
  });

  it('saves the entry and stops prompting once reflected on', async () => {
    await render(<Probe />);
    await tickTo(18, 30);
    expect(api?.canReflect).toBe(true);

    await ReactTestRenderer.act(async () => {
      await api?.submit({ estimatesAccurate: 'no', notes: 'slipped' });
    });

    expect(api?.hasReflectedToday).toBe(true);
    expect(api?.canReflect).toBe(false);

    const raw = await AsyncStorage.getItem(REFLECTIONS_KEY);
    const store = JSON.parse(raw as string) as Record<string, ReflectionEntry>;
    expect(store[DAY].estimatesAccurate).toBe('no');
    expect(store[DAY].notes).toBe('slipped');
  });

  it('dismiss silences the prompt for the session', async () => {
    await render(<Probe />);
    await tickTo(18, 30);
    expect(api?.canReflect).toBe(true);

    await ReactTestRenderer.act(async () => {
      api?.dismiss();
    });

    expect(api?.canReflect).toBe(false);
  });
});
