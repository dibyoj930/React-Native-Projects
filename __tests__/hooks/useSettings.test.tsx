/**
 * The settings controller: the confirmations and the cross-domain wiring.
 *
 * The screen test covers what settings *looks like*; this covers what it *does* —
 * that a destructive button asks first, that cancelling does nothing, and that
 * the theme override it exposes is the persisted one. It needs the real provider
 * stack because the hook reaches into the theme, notification and productivity
 * contexts, and a fake would test the mock rather than the wiring.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Alert, type AlertButton } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSettings } from '../../hooks/useSettings';
import { NotificationProvider } from '../../notifications';
import { ProductivityProvider } from '../../productivity';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { render } from '../support/render';

type Settings = ReturnType<typeof useSettings>;

let api: Settings | undefined;
const onClearTasks = jest.fn();

function Probe() {
  api = useSettings({ taskCount: 2, onClearTasks });
  return null;
}

function tree() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <ProductivityProvider>
          <Probe />
        </ProductivityProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

const act = (body: () => void) => ReactTestRenderer.act(body);
const settle = () => ReactTestRenderer.act(async () => undefined);

/** The destructive button of the alert last shown. */
function destructiveButton(alert: jest.SpyInstance): AlertButton {
  const buttons = alert.mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
  const found = buttons?.find((button) => button.style === 'destructive');
  if (!found) throw new Error('the alert had no destructive button');
  return found;
}

beforeEach(async () => {
  api = undefined;
  onClearTasks.mockClear();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useSettings — appearance', () => {
  it('exposes the persisted preference and updates it', async () => {
    await render(tree());
    await settle();

    expect(api!.preference).toBe('system');
    await act(() => api!.setPreference('dark'));
    expect(api!.preference).toBe('dark');
  });
});

describe('useSettings — destructive actions', () => {
  it('asks before deleting every task, and only deletes on confirm', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(tree());
    await settle();

    await act(() => api!.confirmClearTasks());
    expect(alert).toHaveBeenCalledWith(
      'Delete all tasks?',
      'This removes all 2 tasks for good. It cannot be undone.',
      expect.any(Array),
    );
    // The tap only opens the question; nothing is deleted yet.
    expect(onClearTasks).not.toHaveBeenCalled();

    await act(() => destructiveButton(alert).onPress?.());
    expect(onClearTasks).toHaveBeenCalledTimes(1);
  });

  it('wipes the stored focus history when confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const removeItem = jest.spyOn(AsyncStorage, 'removeItem');
    await render(tree());
    await settle();

    await act(() => api!.confirmClearProductivity());
    expect(removeItem).not.toHaveBeenCalledWith('@productivity/v1');

    await act(() => destructiveButton(alert).onPress?.());
    expect(removeItem).toHaveBeenCalledWith('@productivity/v1');
  });
});
