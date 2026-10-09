/**
 * The settings screen.
 *
 * Presentational, so these tests cover the two things such a screen owns: what it
 * prints for a given state, and what it reports back. The confirmations live in
 * `useSettings`; the destructive callbacks here are spies, and the screen must not
 * act past them.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  SettingsScreen,
  type SettingsScreenProps,
} from '../../components/SettingsScreen';
import { byLabel, labels, press, visibleText, withRendered } from '../support/render';

function props(overrides: Partial<SettingsScreenProps> = {}): SettingsScreenProps {
  return {
    preference: 'system',
    onSetPreference: () => {},
    notificationPermission: 'granted',
    onRequestNotifications: () => {},
    taskCount: 0,
    onClearTasks: () => {},
    onClearProductivity: () => {},
    onBack: () => {},
    ...overrides,
  };
}

/**
 * The pressable node behind an accessibility label.
 *
 * `byLabel` finds the host view; the handler (and the `accessibilityState`) live
 * on the composite above it, so this walks up the same way `press` does but
 * returns the node for inspection.
 */
function button(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  let cursor: ReactTestRenderer.ReactTestInstance | null = byLabel(renderer, label);
  while (cursor) {
    if (typeof cursor.props?.onPress === 'function') return cursor;
    cursor = cursor.parent;
  }
  throw new Error(`no pressable node for ${JSON.stringify(label)}`);
}

describe('SettingsScreen — appearance', () => {
  it('offers system, light and dark', async () => {
    await withRendered(<SettingsScreen {...props()} />, (renderer) => {
      expect(visibleText(renderer)).toContain('Settings');
      expect(labels(renderer)).toEqual(
        expect.arrayContaining([
          'Use system appearance',
          'Use light appearance',
          'Use dark appearance',
        ]),
      );
    });
  });

  it('reports the chosen appearance', async () => {
    const onSetPreference = jest.fn();
    await withRendered(
      <SettingsScreen {...props({ preference: 'dark', onSetPreference })} />,
      async (renderer) => {
        await press(renderer, 'Use light appearance');
        expect(onSetPreference).toHaveBeenCalledWith('light');
      },
    );
  });

  it('marks the active choice as selected', async () => {
    await withRendered(<SettingsScreen {...props({ preference: 'dark' })} />, (renderer) => {
      expect(button(renderer, 'Use dark appearance').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(
        button(renderer, 'Use system appearance').props.accessibilityState,
      ).toEqual({ selected: false });
    });
  });
});

describe('SettingsScreen — notifications', () => {
  it('shows the on state without a turn-on button when granted', async () => {
    await withRendered(<SettingsScreen {...props()} />, (renderer) => {
      expect(visibleText(renderer)).toContain('On. Timer alerts and reminders can reach you.');
      expect(labels(renderer)).not.toContain('Turn on notifications');
    });
  });

  it('offers to turn them on when they are off, and reports the tap', async () => {
    const onRequestNotifications = jest.fn();
    await withRendered(
      <SettingsScreen
        {...props({ notificationPermission: 'denied', onRequestNotifications })}
      />,
      async (renderer) => {
        expect(labels(renderer)).toContain('Turn on notifications');
        await press(renderer, 'Turn on notifications');
        expect(onRequestNotifications).toHaveBeenCalledTimes(1);
      },
    );
  });
});

describe('SettingsScreen — data', () => {
  it('reports a request to delete all tasks', async () => {
    const onClearTasks = jest.fn();
    await withRendered(
      <SettingsScreen {...props({ taskCount: 3, onClearTasks })} />,
      async (renderer) => {
        await press(renderer, 'Delete all tasks');
        expect(onClearTasks).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('disables the delete button when there is nothing to delete', async () => {
    await withRendered(<SettingsScreen {...props({ taskCount: 0 })} />, (renderer) => {
      expect(visibleText(renderer)).toContain('No tasks to delete.');
      expect(button(renderer, 'Delete all tasks').props.accessibilityState).toEqual({
        disabled: true,
      });
    });
  });

  it('reports a request to clear the focus history', async () => {
    const onClearProductivity = jest.fn();
    await withRendered(
      <SettingsScreen {...props({ onClearProductivity })} />,
      async (renderer) => {
        await press(renderer, 'Clear focus history');
        expect(onClearProductivity).toHaveBeenCalledTimes(1);
      },
    );
  });
});

describe('SettingsScreen — getting back', () => {
  it('reports the back control', async () => {
    const onBack = jest.fn();
    await withRendered(<SettingsScreen {...props({ onBack })} />, async (renderer) => {
      await press(renderer, 'Back to today');
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
