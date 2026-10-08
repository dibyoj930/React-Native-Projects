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
import App from '../App';

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
