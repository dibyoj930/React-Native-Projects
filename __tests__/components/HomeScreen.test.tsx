/**
 * The home screen.
 *
 * It is presentational, so these tests are about the two things a presentational
 * screen has to get right: what it prints from the props it is given, and what
 * it reports back. No assertion here knows how the app acts on either — that is
 * the container's business, and the screen would be failing at its own job if it
 * knew.
 *
 * Wrapped in `ProductivityProvider` because two of the cards it composes read
 * the productivity context themselves.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { HomeScreen, type HomeScreenProps } from '../../components/HomeScreen';
import { DEFAULT_DAILY_GOALS } from '../../daily-goals';
import { ProductivityProvider } from '../../productivity';
import type { Todo } from '../../todos/model';
import { AVAILABLE_TAGS } from '../../todos/tags';
import { byLabel, focusText, labels, press, submitText, textContent, typeText, visibleText, withRendered } from '../support/render';

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    text: `Task ${overrides.id}`,
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

function props(overrides: Partial<HomeScreenProps> = {}): HomeScreenProps {
  return {
    todos: [],
    notificationsBlocked: false,
    onOpenTasks: () => {},
    onOpenTag: () => {},
    tags: [...AVAILABLE_TAGS],
    onAddTag: () => {},
    onAddTask: () => {},
    onOpenSettings: () => {},
    goals: DEFAULT_DAILY_GOALS,
    onOpenGoals: () => {},
    onExport: () => {},
    ...overrides,
  };
}

function screen(overrides: Partial<HomeScreenProps> = {}) {
  return (
    <ProductivityProvider>
      <HomeScreen {...props(overrides)} />
    </ProductivityProvider>
  );
}

/**
 * The export button.
 *
 * Located by its accessibility label, then walked up to the node carrying the
 * press handler, so callers can reach both the handler and the composite's
 * `style` and `accessibilityState` props.
 */
function exportButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance {
  const host = byLabel(renderer, 'Export tasks');
  let cursor: ReactTestRenderer.ReactTestInstance | null = host;
  while (cursor) {
    if (typeof cursor.props?.onPress === 'function') return cursor;
    cursor = cursor.parent;
  }
  throw new Error('the export button has no pressable ancestor');
}

describe('HomeScreen — the counts', () => {
  it('invites a first task when there is nothing yet', async () => {
    await withRendered(screen(), (renderer) => {
      expect(visibleText(renderer)).toContain('Add your first task');
    });
  });

  it('counts what is still open out of everything', async () => {
    const todos = [
      todo({ id: 'a' }),
      todo({ id: 'b', completed: true }),
      todo({ id: 'c', completed: true }),
    ];
    await withRendered(screen({ todos }), (renderer) => {
      expect(visibleText(renderer)).toContain('1 open of 3');
    });
  });

  it('says so when every task is done', async () => {
    const todos = [todo({ id: 'a', completed: true }), todo({ id: 'b', completed: true })];
    await withRendered(screen({ todos }), (renderer) => {
      expect(visibleText(renderer)).toContain('All 2 done');
    });
  });

  it('counts the whole list, completed tasks included', async () => {
    // An "all tasks" tile that only counted the open ones would understate the
    // list it opens.
    const todos = [todo({ id: 'a', completed: true }), todo({ id: 'b', completed: true })];
    await withRendered(screen({ todos }), (renderer) => {
      expect(visibleText(renderer)).not.toContain('Add your first task');
    });
  });
});

describe('HomeScreen — notifications', () => {
  it('warns when notifications are blocked', async () => {
    await withRendered(screen({ notificationsBlocked: true }), (renderer) => {
      expect(visibleText(renderer)).toContain(
        'Notifications are off, so timer alerts will not reach you.',
      );
    });
  });

  it('says nothing when they are not', async () => {
    await withRendered(screen(), (renderer) => {
      expect(visibleText(renderer)).not.toContain('Notifications are off');
    });
  });
});

describe('HomeScreen — what it reports back', () => {
  it('reports the tile as a request for the task list', async () => {
    const onOpenTasks = jest.fn();
    await withRendered(screen({ onOpenTasks }), async (renderer) => {
      await press(renderer, 'Open all tasks');
      expect(onOpenTasks).toHaveBeenCalledTimes(1);
    });
  });

  it('reports the `+` as a request to add a task', async () => {
    const onAddTask = jest.fn();
    await withRendered(screen({ onAddTask }), async (renderer) => {
      await press(renderer, 'Add a task');
      expect(onAddTask).toHaveBeenCalledTimes(1);
    });
  });

  it('reports the gear as a request for settings', async () => {
    const onOpenSettings = jest.fn();
    await withRendered(screen({ onOpenSettings }), async (renderer) => {
      await press(renderer, 'Open settings');
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  it('reports a tag chip as that tag, not as a filter it applies itself', async () => {
    const onOpenTag = jest.fn();
    await withRendered(screen({ onOpenTag }), async (renderer) => {
      await press(renderer, 'Show tasks tagged #gym');
      expect(onOpenTag).toHaveBeenCalledWith('#gym');
      expect(onOpenTag).toHaveBeenCalledTimes(1);
    });
  });

  it('reports the export button', async () => {
    const onExport = jest.fn();
    await withRendered(screen({ todos: [todo({ id: 'a' })], onExport }), async (renderer) => {
      await ReactTestRenderer.act(async () => {
        exportButton(renderer).props.onPress();
      });
      expect(onExport).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the export button as disabled when there is nothing to export', async () => {
    // The button stays reachable rather than disappearing, but it is styled as
    // off — the second entry in its style array is the disabled flag.
    await withRendered(screen({ todos: [todo({ id: 'a' })] }), (renderer) => {
      expect(exportButton(renderer).props.style[1]).toBe(false);
    });
    await withRendered(screen(), (renderer) => {
      expect(exportButton(renderer).props.style[1]).not.toBe(false);
    });
  });

  it('labels the export button and reports whether it is enabled', async () => {
    // A labelled control is reachable by assistive tech; the state tells it the
    // button is inert when the list is empty.
    await withRendered(screen({ todos: [todo({ id: 'a' })] }), (renderer) => {
      expect(labels(renderer)).toContain('Export tasks');
      expect(exportButton(renderer).props.accessibilityState).toEqual({
        disabled: false,
      });
    });
    await withRendered(screen(), (renderer) => {
      expect(exportButton(renderer).props.accessibilityState).toEqual({
        disabled: true,
      });
    });
  });
});

describe('HomeScreen — adding a tag', () => {
  it('draws the tags it is handed, not a fixed list', async () => {
    // The section is presentational: a tag the user made is just another entry
    // in the list it is passed.
    const tags = [
      { label: '#coding', accent: '#0A84FF' },
      { label: '#deepwork', accent: '#30D158' },
    ];
    await withRendered(screen({ tags }), (renderer) => {
      const chipLabels = labels(renderer).filter((l) => l.startsWith('Show tasks tagged'));
      expect(chipLabels).toEqual(['Show tasks tagged #coding', 'Show tasks tagged #deepwork']);
    });
  });

  it('reports the typed text as a tag and clears the field', async () => {
    // The raw string is handed over untouched; normalisation (the `#`, the
    // lowercasing) is the tag domain's job, not this screen's.
    const onAddTag = jest.fn();
    await withRendered(screen({ onAddTag }), async (renderer) => {
      await typeText(renderer, 'Add a tag', 'Deep Work');
      await submitText(renderer, 'Add a tag');
      expect(onAddTag).toHaveBeenCalledWith('Deep Work');
      expect(onAddTag).toHaveBeenCalledTimes(1);
      // Cleared, so the next tag starts from nothing.
      expect(byLabel(renderer, 'Add a tag').props.value).toBe('');
    });
  });

  it('hides the add control behind no label of its own', async () => {
    // It shows nothing at rest — no chip text, no placeholder — so the only
    // thing that names it is the accessibility label.
    await withRendered(screen(), (renderer) => {
      expect(labels(renderer)).toContain('Add a tag');
      expect(visibleText(renderer)).not.toContain('Add a tag');
    });
  });
});

describe('HomeScreen — the add-tag chip', () => {
  it('draws a coloured chip with the cursor once the field is focused', async () => {
    await withRendered(screen(), async (renderer) => {
      // Nothing in the tree is a lone `#` at rest; the tag chips read `#coding`
      // and so on, which is a different string.
      expect(textContent(renderer)).not.toContain('#');
      await focusText(renderer, 'Add a tag');
      expect(textContent(renderer)).toContain('#');
      // The same field is still the one assistive tech reaches.
      expect(labels(renderer)).toContain('Add a tag');
    });
  });

  it('keeps the chip up while there is text, focus or not', async () => {
    await withRendered(screen(), async (renderer) => {
      await typeText(renderer, 'Add a tag', 'Deep Work');
      expect(textContent(renderer)).toContain('#');
    });
  });
});
