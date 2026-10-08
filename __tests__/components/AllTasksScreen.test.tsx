/**
 * The All Tasks sheet.
 *
 * The screen's whole job is showing the same tasks as home with less around them,
 * so most of these tests are about what it does *not* do: no progress card, no
 * tag filter, no focus graph, no export bar.
 */

import React from 'react';
import { Text } from 'react-native';
import { AllTasksScreen, type AllTasksScreenProps } from '../../components/AllTasksScreen';
import type { Todo } from '../../todos/model';
import { hostNodes, labels, press, visibleText, withRendered } from '../support/render';

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    text: `Task ${overrides.id}`,
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

/** A stand-in row, so these tests describe the screen rather than `TodoRow`. */
const renderRow = (item: Todo) => <Text>{`row:${item.text}`}</Text>;

function props(overrides: Partial<AllTasksScreenProps> = {}): AllTasksScreenProps {
  return {
    todos: [todo({ id: 'a' }), todo({ id: 'b' }), todo({ id: 'c', completed: true })],
    renderRow,
    onAddTask: () => {},
    onBack: () => {},
    ...overrides,
  };
}

describe('AllTasksScreen — the list', () => {
  it('renders one row per task, through the renderer it was given', async () => {
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('row:Task a');
      expect(text).toContain('row:Task b');
      expect(text).toContain('row:Task c');
    });
  });

  it('renders every task, including completed ones', async () => {
    // "All" has to mean all. Anything else and the sheet is a second, quieter
    // place where a completed task disappears with no trace.
    await withRendered(
      <AllTasksScreen {...props({ todos: [todo({ id: 'x', completed: true })] })} />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('row:Task x');
      },
    );
  });

  it('reports how many are still open', async () => {
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      expect(visibleText(renderer)).toContain('2 open of 3');
    });
  });

  it('says so when everything is done, rather than "0 open of 3"', async () => {
    await withRendered(
      <AllTasksScreen
        {...props({
          todos: [todo({ id: 'a', completed: true }), todo({ id: 'b', completed: true })],
        })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('All 2 done');
      },
    );
  });

  it('shows an empty state instead of a blank sheet', async () => {
    await withRendered(<AllTasksScreen {...props({ todos: [] })} />, (renderer) => {
      const text = visibleText(renderer);
      expect(text).toContain('No tasks yet');
      expect(text).toContain('Nothing yet');
    });
  });
});

describe('AllTasksScreen — less furniture than home', () => {
  it('carries none of the progress or export furniture that home has', async () => {
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      const text = visibleText(renderer);
      // The tag filter, the focus graph, the export bar and the tag chips are all
      // deliberately absent: this screen answers "what did I write down", and the
      // rest of home answers "how am I doing".
      ['#coding', 'Tags', 'Export', 'Download', 'Focus'].forEach((absent) => {
        expect(text).not.toContain(absent);
      });
      // Nor any of the vocabulary the redesign removed.
      ['Productivity', 'Momentum', 'Streak', 'Mission', 'DNA', 'Pattern'].forEach((gone) => {
        expect(text).not.toContain(gone);
      });
    });
  });

  it('renders no row-level focus buttons of its own', async () => {
    // The row owns that, not the screen.
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      expect(hostNodes(renderer).filter((n) => typeof n.props?.onPress === 'function')).toHaveLength(0);
    });
  });
});

describe('AllTasksScreen — adding a task', () => {
  it('offers an add button', async () => {
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      expect(hostNodes(renderer).some((n) => n.props?.accessibilityLabel === 'Add a task')).toBe(true);
    });
  });

  it('calls back when the add button is pressed', async () => {
    const onAddTask = jest.fn();
    await withRendered(<AllTasksScreen {...props({ onAddTask })} />, async (renderer) => {
      await press(renderer, 'Add a task');
    });
    expect(onAddTask).toHaveBeenCalledTimes(1);
  });
});

describe('AllTasksScreen — the tag view', () => {
  const tagged = [
    todo({ id: 'a', completed: true, tags: ['#coding'] }),
    todo({ id: 'b', tags: ['#coding'] }),
    todo({ id: 'c', tags: ['#gym'] }),
  ];

  it('shows only the tasks carrying the filtered tag', async () => {
    await withRendered(
      <AllTasksScreen
        {...props({ todos: tagged, title: '#coding', filterTag: '#coding' })}
      />,
      (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('row:Task a');
        expect(text).toContain('row:Task b');
        expect(text).not.toContain('row:Task c');
      },
    );
  });

  it('heads the list with the tag, not the generic title', async () => {
    await withRendered(
      <AllTasksScreen
        {...props({ todos: tagged, title: '#coding', filterTag: '#coding' })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('#coding');
        expect(visibleText(renderer)).not.toContain('All tasks');
      },
    );
  });

  it('counts only the tagged rows', async () => {
    await withRendered(
      <AllTasksScreen
        {...props({ todos: tagged, filterTag: '#coding' })}
      />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('1 open of 2');
      },
    );
  });

  it('shows No Todos yet for a tag nothing uses, and points at how it starts', async () => {
    await withRendered(
      <AllTasksScreen
        {...props({ todos: tagged, filterTag: '#health' })}
      />,
      (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('No Todos yet');
        // The empty state is not a dead end: this screen's `+` creates the first
        // task with that tag.
        expect(text).toContain('Tap + to add the first #health task');
      },
    );
  });

  it('labels the add button with the tag it will apply', async () => {
    // A task created from a tag view is born with that tag, so the button says so
    // rather than pretending the tag had nothing to do with it.
    await withRendered(
      <AllTasksScreen
        {...props({ todos: tagged, filterTag: '#coding' })}
      />,
      (renderer) => {
        expect(labels(renderer)).toContain('Add a task tagged #coding');
        expect(labels(renderer)).not.toContain('Add a task');
      },
    );
  });

  it('keeps the all-tasks add label when it is not filtering', async () => {
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      expect(labels(renderer)).toContain('Add a task');
    });
  });
});

describe('AllTasksScreen — getting back', () => {
  it('has its own labelled back control', async () => {
    // Not optional, and not a swipe. This screen used to be a `pageSheet` modal, where
    // iOS gives you a drag-to-dismiss gesture for free; as a full screen that gesture
    // is gone, so without an explicit control there is no way out on either platform.
    await withRendered(<AllTasksScreen {...props()} />, (renderer) => {
      expect(labels(renderer)).toContain('Back to today');
    });
  });

  it('calls back when the back control is pressed', async () => {
    const onBack = jest.fn();
    await withRendered(<AllTasksScreen {...props({ onBack })} />, async (renderer) => {
      await press(renderer, 'Back to today');
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});