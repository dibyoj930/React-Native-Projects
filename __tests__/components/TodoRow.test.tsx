/**
 * The task row.
 *
 * Every test here guards a rule that was previously only enforced by reading the
 * JSX. The row is now shared between two screens, so a regression in it would
 * show up twice and in neither place obviously.
 */

import React from 'react';
import { TodoRow, type TodoRowProps } from '../../components/TodoRow';
import type { Todo } from '../../todos/model';
import { byLabel, hostNodes, labels, nodes, press, textContent, visibleText, withRendered } from '../support/render';

const TODO: Todo = {
  id: 't1',
  text: 'Fix login issue',
  completed: false,
  tags: [],
  createdAt: 1,
};

function props(overrides: Partial<TodoRowProps> = {}): TodoRowProps {
  return {
    todo: TODO,
    hasTimer: false,
    isRunning: false,
    timerLabel: '00:25:00',
    isLocked: false,
    completionDisabled: false,
    onToggleComplete: () => {},
    onStartFocus: () => {},
    onToggleTimerRunning: () => {},
    onStopTimer: () => {},
    onEdit: () => {},
    onDelete: () => {},
    ...overrides,
  };
}

describe('TodoRow — completion is an explicit control, not the row', () => {
  it('has exactly one checkbox, and it is labelled', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      const checkboxes = hostNodes(renderer).filter(
        (n) => n.props?.accessibilityRole === 'checkbox',
      );
      expect(checkboxes).toHaveLength(1);
      expect(checkboxes[0].props.accessibilityLabel).toBe('Complete Fix login issue');
    });
  });

  it('offers nothing pressable on the task text itself', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      // The body used to be a TouchableOpacity wrapping the text, the timer
      // display, the lock badge and the tag chips — so reading a task marked it
      // done, and a tap aimed at a chip completed it.
      const pressables = nodes(renderer).filter((n) => typeof n.props?.onPress === 'function');
      const text = hostNodes(renderer).find(
        (n) => String(n.type) === 'Text' && n.children.includes(TODO.text),
      );
      expect(text).toBeDefined();
      // No ancestor of the text carries an onPress.
      let cursor: typeof text | undefined = text;
      while (cursor) {
        expect(cursor.props?.onPress).toBeUndefined();
        cursor = cursor.parent as typeof text | undefined;
      }
      // And the pressables that do exist are all named controls.
      expect(pressables.length).toBeGreaterThan(0);
      pressables.forEach((node) => {
        expect(typeof node.props.accessibilityLabel).toBe('string');
      });
    });
  });

  it('reverses the checkbox label for a completed task', async () => {
    await withRendered(
      <TodoRow {...props({ todo: { ...TODO, completed: true } })} />,
      (renderer) => {
        expect(byLabel(renderer, 'Reopen Fix login issue')).toBeDefined();
        expect(labels(renderer)).not.toContain('Complete Fix login issue');
      },
    );
  });

  it('reports the disabled state to assistive tech, not just visually', async () => {
    await withRendered(<TodoRow {...props({ completionDisabled: true })} />, (renderer) => {
      const checkbox = byLabel(renderer, 'Complete Fix login issue');
      expect(checkbox.props.accessibilityState).toEqual({
        checked: false,
        disabled: true,
      });
    });
  });

  it('marks a completed task as checked', async () => {
    await withRendered(
      <TodoRow {...props({ todo: { ...TODO, completed: true } })} />,
      (renderer) => {
        expect(byLabel(renderer, 'Reopen Fix login issue').props.accessibilityState).toEqual({
          checked: true,
          disabled: false,
        });
      },
    );
  });
});

describe('TodoRow — timer controls', () => {
  it('offers a labelled Focus button when no timer is attached', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      expect(visibleText(renderer)).toContain('Focus');
      expect(labels(renderer)).toContain('Start focus on Fix login issue');
    });
  });

  it('replaces Focus with pause/resume and stop when a timer is attached', async () => {
    await withRendered(<TodoRow {...props({ hasTimer: true, isRunning: true })} />, (renderer) => {
      expect(visibleText(renderer)).not.toContain('Focus');
      expect(labels(renderer)).toContain('Pause focus on Fix login issue');
      expect(labels(renderer)).toContain('Stop focus on Fix login issue');
      // The remaining time is on screen, not only in an accessibility label.
      expect(visibleText(renderer)).toContain('00:25:00');
    });
  });

  it('offers resume rather than pause on a stopped timer', async () => {
    await withRendered(<TodoRow {...props({ hasTimer: true, isRunning: false })} />, (renderer) => {
      expect(labels(renderer)).toContain('Resume focus on Fix login issue');
    });
  });

  it('says why a locked task cannot be reopened', async () => {
    // Without this the disabled checkbox just reads as a broken tap.
    await withRendered(<TodoRow {...props({ isLocked: true, completionDisabled: true })} />, (renderer) => {
      expect(visibleText(renderer)).toContain('focus session ended');
    });
  });

  it('shows no timer text when no timer is attached', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      expect(visibleText(renderer)).not.toContain('00:25:00');
    });
  });
});

describe('TodoRow — the due date line', () => {
  it('shows a due label when one is given', async () => {
    await withRendered(<TodoRow {...props({ dueLabel: 'Tomorrow' })} />, (renderer) => {
      expect(visibleText(renderer)).toContain('Tomorrow');
    });
  });

  it('shows nothing when there is no date', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      expect(visibleText(renderer)).toContain('Fix login issue');
      expect(labels(renderer)).not.toContain('Due date, Tomorrow. Tap to change.');
    });
  });

  it('hides the date on a completed task', async () => {
    // A completed task's due date is history; showing it invites the question of
    // whether it is still due.
    await withRendered(
      <TodoRow {...props({ todo: { ...TODO, completed: true }, dueLabel: 'Tomorrow' })} />,
      (renderer) => {
        expect(visibleText(renderer)).not.toContain('Tomorrow');
      },
    );
  });
});

describe('TodoRow — the notes line', () => {
  const NOTES = 'Agent is Mr Rao, +91 98xxx xxxxx';

  it('shows the notes under the title', async () => {
    await withRendered(<TodoRow {...props({ todo: { ...TODO, notes: NOTES } })} />, (renderer) => {
      expect(visibleText(renderer)).toContain(NOTES);
    });
  });

  it('puts the notes after the title, not before it', async () => {
    // The brief was "title, with details below". Document order is the only thing
    // that distinguishes "below" from "beside" here, so it is what gets asserted.
    await withRendered(<TodoRow {...props({ todo: { ...TODO, notes: NOTES } })} />, (renderer) => {
      const strings = textContent(renderer);
      expect(strings.indexOf(TODO.text)).toBeLessThan(strings.indexOf(NOTES));
    });
  });

  it('shows no notes line for a task without them', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      expect(visibleText(renderer)).not.toContain(NOTES);
    });
  });

  it('hides the notes on a completed task', async () => {
    // Same rule as the date: a finished task's detail is history, and showing it
    // only makes a row taller to say nothing you can act on.
    await withRendered(
      <TodoRow {...props({ todo: { ...TODO, notes: NOTES, completed: true } })} />,
      (renderer) => {
        expect(visibleText(renderer)).not.toContain(NOTES);
      },
    );
  });
});

describe('TodoRow — editing goes through the sheet', () => {
  it('offers a labelled Edit control on every row', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      expect(labels(renderer)).toContain('Edit Fix login issue');
    });
  });

  it('calls back rather than editing inline', async () => {
    // Editing used to swap the title for a `TextInput` inside the row, which could
    // only ever hold the title. Now that tasks can be edited in date, title and
    // notes, the sheet owns the edit form and this button only asks for it.
    const onEdit = jest.fn();
    await withRendered(<TodoRow {...props({ onEdit })} />, async (renderer) => {
      expect(visibleText(renderer)).not.toContain('Save');
      await press(renderer, 'Edit Fix login issue');
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('TodoRow — tag chips', () => {
  it('renders each tag', async () => {
    await withRendered(
      <TodoRow {...props({ todo: { ...TODO, tags: ['#coding', '#gym'] } })} />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('#coding');
        expect(visibleText(renderer)).toContain('#gym');
      },
    );
  });

  it('renders no chip container for an untagged task', async () => {
    await withRendered(<TodoRow {...props()} />, (renderer) => {
      expect(visibleText(renderer)).not.toContain('#');
    });
  });

  it('renders an unknown tag without crashing', async () => {
    await withRendered(
      <TodoRow {...props({ todo: { ...TODO, tags: ['#not-a-real-tag'] } })} />,
      (renderer) => {
        expect(visibleText(renderer)).toContain('#not-a-real-tag');
      },
    );
  });
});

describe('TodoRow — theming', () => {
  it('renders from theme tokens, so it needs no per-theme test here', async () => {
    // Stated explicitly rather than left implicit. Dark-mode coverage for this
    // component lives in `theme.test.ts`, which asserts the stronger property over
    // the source — that the file contains no colour literals at all. A render test
    // in dark mode would pass even with a hardcoded light hex in it.
    await withRendered(<TodoRow {...props({ dueLabel: 'Today' })} />, (renderer) => {
      expect(visibleText(renderer)).toContain('Fix login issue');
    });
  });
});