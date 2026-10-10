/**
 * App smoke test.
 *
 * Guards the thing unit tests cannot: that the whole provider stack composes and
 * mounts. Every provider here does async work on mount — AsyncStorage hydration
 * in three separate places — so the test has to flush those inside `act`. Without
 * that flush the state updates land after the test has already finished, which
 * Jest reports as "cannot log after tests are done" and which would hide a real
 * mount-time crash.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import notifee, { EventType } from '@notifee/react-native';

import App from '../App';
import { press, typeText, visibleText } from './support/render';

test('mounts the full app tree', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  // Flush storage hydration for todos, productivity and the theme preference.
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(renderer).toBeDefined();
  expect(renderer!.toJSON()).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('opens the task list when a timer notification is tapped', async () => {
  const onForegroundEvent = notifee.onForegroundEvent as unknown as jest.Mock;
  onForegroundEvent.mockClear();

  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  // The home screen is up first; the tap is what moves the app.
  expect(visibleText(renderer!)).not.toContain('All tasks');

  const handler = onForegroundEvent.mock.calls.at(-1)?.[0];
  if (!handler) throw new Error('no foreground handler was registered');
  await ReactTestRenderer.act(async () => {
    handler({
      type: EventType.PRESS,
      detail: { notification: { data: { todoId: 'task-1' } } },
    });
  });

  expect(visibleText(renderer!)).toContain('All tasks');

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('edits the daily goals through the dedicated screen', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  // The home tile leads with the shipped defaults, and is the way into the
  // goals screen.
  expect(visibleText(renderer!)).toContain('0 / 1');
  await press(renderer!, 'Open goals and preferences');
  expect(visibleText(renderer!)).toContain('Goals & Preferences');

  // A saved goal comes back with the user: the tile now measures against it,
  // without touching the focus history or the task list.
  await typeText(renderer!, 'Daily task goal', '5');
  await press(renderer!, 'Save daily goals');
  expect(visibleText(renderer!)).toContain('0 / 5');

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
