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
import { ProductivityProvider } from '../../productivity';
import type { Todo } from '../../todos/model';
import { press, visibleText, withRendered } from '../support/render';

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
    onAddTask: () => {},
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
 * It carries no accessibility label, so unlike every other control here it
 * cannot be reached by pressing a label — it is found by its own text, then by
 * walking up to the ancestor holding the press handler.
 */
function exportButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance {
  const texts = renderer.root.findAll(
    (node) =>
      Array.isArray(node.props.children) &&
      typeof node.props.children[0] === 'string' &&
      (node.props.children[0] as string).startsWith('Download / Export'),
  );
  if (texts.length === 0) {
    throw new Error('no export button found');
  }
  let cursor: ReactTestRenderer.ReactTestInstance | null = texts[0].parent;
  while (cursor) {
    if (typeof cursor.props?.onPress === 'function') return cursor;
    cursor = cursor.parent;
  }
  throw new Error('the export text has no pressable ancestor');
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
});
