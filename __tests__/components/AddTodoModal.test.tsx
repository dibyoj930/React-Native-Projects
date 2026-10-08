/**
 * The Add Todo sheet.
 *
 * The rules worth pinning down here are about what reaches storage. `migrateTodos`
 * keeps a `notes` string verbatim and keeps any well-formed `dueDate`, so whatever
 * this modal hands back is what a task will carry — including the difference
 * between "no notes" and "notes the user wrote and then cleared".
 *
 * `DateTimePicker` renders under Jest as a single host view, which is enough to
 * drive `onChange` and assert the date that comes out the other side. That is the
 * only thing being tested about it: it is a native view, not app logic.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AddTodoModal, type TodoDraft } from '../../components/AddTodoModal';
import type { Todo } from '../../todos/model';
import { AVAILABLE_TAGS } from '../../todos/tags';
import { isValidDayKey, localDateFromDayKey, todayKey } from '../../productivity';
import {
  byLabel,
  hostNodes,
  labels,
  press,
  render,
  rerender,
  visibleText,
  withRendered,
} from '../support/render';

type Renderer = ReactTestRenderer.ReactTestRenderer;

function element(overrides: Partial<React.ComponentProps<typeof AddTodoModal>> = {}) {
  return <AddTodoModal onClose={() => {}} onSubmit={() => {}} visible {...overrides} />;
}

/** Types into a field by accessibility label. */
async function type(renderer: Renderer, label: string, value: string): Promise<void> {
  const { onChangeText } = byLabel(renderer, label).props;
  await ReactTestRenderer.act(async () => {
    onChangeText(value);
  });
}

// --- Title -------------------------------------------------------------------

describe('AddTodoModal — the title is required', () => {
  it('starts with Add disabled', async () => {
    await withRendered(element(), (renderer) => {
      expect(byLabel(renderer, 'Add task').props.accessibilityState).toEqual({ disabled: true });
    });
  });

  it('enables Add once there is text', async () => {
    await withRendered(element(), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      expect(byLabel(renderer, 'Add task').props.accessibilityState).toEqual({ disabled: false });
    });
  });

  it('treats whitespace as no text', async () => {
    // Otherwise a user can submit a task whose title is invisible.
    await withRendered(element(), async (renderer) => {
      await type(renderer, 'Task title', '   ');
      expect(byLabel(renderer, 'Add task').props.accessibilityState).toEqual({ disabled: true });
    });
  });

  it('submits a trimmed title', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', '  Buy milk  ');
      await press(renderer, 'Add task');
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].text).toBe('Buy milk');
  });

  it('submits from the return key, so typing stays the fastest path', async () => {
    // The inline input this replaced submitted on Enter. Losing that would make
    // adding a task slower than it was, which is a regression dressed as a feature.
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await ReactTestRenderer.act(async () => {
        byLabel(renderer, 'Task title').props.onSubmitEditing();
      });
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].text).toBe('Buy milk');
  });

  it('does nothing on submit when the title is empty', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await ReactTestRenderer.act(async () => {
        byLabel(renderer, 'Task title').props.onSubmitEditing();
      });
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes on Cancel', async () => {
    const onClose = jest.fn();
    await withRendered(element({ onClose }), async (renderer) => {
      await press(renderer, 'Cancel');
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// --- Notes -------------------------------------------------------------------

/**
 * The draft as it will actually be persisted.
 *
 * `JSON` is the real boundary: the task store writes `JSON.stringify(todos)`, and
 * that drops `undefined` values. Asserting on the live object instead would
 * distinguish `notes: undefined` from `notes` being absent, which is a difference
 * that disappears on the way to disk and is not the one that matters.
 */
function persisted(draft: TodoDraft): Record<string, unknown> {
  return JSON.parse(JSON.stringify(draft));
}

describe('AddTodoModal — notes', () => {
  it('stores no notes at all when the user wrote none', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).not.toHaveProperty('notes');
  });

  it('drops notes that are only whitespace', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await type(renderer, 'Task notes', '   \n  ');
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).not.toHaveProperty('notes');
  });

  it('keeps trimmed notes the user actually wrote', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await type(renderer, 'Task notes', '  semi-skimmed, one litre  ');
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0]).notes).toBe('semi-skimmed, one litre');
  });
});

// --- Date --------------------------------------------------------------------

/** The picker's host view, once it is on screen. */
function picker(renderer: Renderer): ReactTestRenderer.ReactTestInstance {
  const found = hostNodes(renderer).filter((n) => String(n.type).includes('DateTimePicker'));
  if (found.length !== 1) throw new Error(`expected 1 picker, found ${found.length}`);
  return found[0];
}

/**
 * The picker reports a settled date through `onValueChange`, not the deprecated
 * `onChange`.
 *
 * The host prop names differ from the public ones, and that is the library's own
 * doing rather than a mistake here: `datetimepicker.ios.js` builds an internal
 * `_onChange` and hands *that* to the native view under the key `onChange`, so the
 * app's `onValueChange` reaches the host node via a prop that happens to carry the
 * deprecated name. Driving the host directly is what a native event looks like from
 * inside; the alternative is mocking the component, which would test the mock.
 */
async function chooseDate(renderer: Renderer, date: Date): Promise<void> {
  const { onChange } = picker(renderer).props;
  await ReactTestRenderer.act(async () => {
    onChange({ nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } });
  });
}

/** The picker's dialog closed. Also `onPickerDismiss` rather than `onDismiss` on the host. */
async function dismissPicker(renderer: Renderer): Promise<void> {
  const { onPickerDismiss } = picker(renderer).props;
  await ReactTestRenderer.act(async () => {
    onPickerDismiss();
  });
}

/**
 * Today, at `hours` past local midnight.
 *
 * Derived rather than written as a literal. An earlier version of this suite hardcoded
 * `new Date(2026, 9, 5)` wherever it needed "today", which is right until midnight on
 * the 6th and then quietly wrong: the tests started failing a full day early with no
 * change to the code under test. Any test that means "today" has to ask what today is.
 */
function todayAt(hours: number, minutes = 0): Date {
  const date = localDateFromDayKey(todayKey());
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe('AddTodoModal — the date field', () => {
  it('offers to add a date rather than showing an empty one', async () => {
    await withRendered(element(), (renderer) => {
      expect(visibleText(renderer)).toContain('Add a date');
    });
  });

  it('stores no date unless one was chosen', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).not.toHaveProperty('dueDate');
  });

  it('shows no picker until the date row is tapped', async () => {
    await withRendered(element(), async (renderer) => {
      expect(hostNodes(renderer).filter((n) => String(n.type).includes('DateTimePicker'))).toHaveLength(0);
      await press(renderer, 'Add a due date');
      expect(hostNodes(renderer).filter((n) => String(n.type).includes('DateTimePicker'))).toHaveLength(1);
    });
  });

  it('labels the date row with the chosen date once there is one', async () => {
    await withRendered(element(), async (renderer) => {
      await press(renderer, 'Add a due date');
      await chooseDate(renderer, todayAt(14));
      expect(visibleText(renderer)).toContain('Today');
      expect(labels(renderer)).toContain('Due date, Today. Tap to change.');
    });
  });

  it('stores the picked day as a day key, in local time', async () => {
    // The whole reason `handleDateChange` goes through `localDateKey`: the picker
    // hands back a `Date`, and `toISOString().slice(0, 10)` on it would be the
    // UTC day. Under this suite's +05:30 pin, a late-evening local time is the
    // clearest case — the UTC day behind it is already tomorrow.
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await press(renderer, 'Add a due date');
      // 02:30 local is 21:00 UTC on the *previous* day, which is the failing case:
      // reading the UTC day here would store yesterday's key. This suite's +05:30 pin
      // makes that window eight and a half hours wide every morning.
      await chooseDate(renderer, todayAt(2, 30));
      await press(renderer, 'Add task');
    });
    const { dueDate } = onSubmit.mock.calls[0][0];
    expect(dueDate).toBe(todayKey());
    // And the value it stored must survive the migration that reads it back.
    expect(isValidDayKey(dueDate)).toBe(true);
  });

  it('names a distant date by its date rather than a weekday', async () => {
    await withRendered(element(), async (renderer) => {
      await press(renderer, 'Add a due date');
      await chooseDate(renderer, new Date(2026, 11, 25));
      expect(visibleText(renderer)).toContain('Dec 25');
    });
  });

  it('will not let the user pick a day in the past', async () => {
    // The picker converts `Date` props to epoch ms before they reach the native view,
    // so this asserts the number against the local-noon anchor it should be — which
    // is also the assertion that would catch the `new Date(dayKey)` UTC trap, since
    // that lands on midnight UTC instead and a different epoch entirely.
    await withRendered(element(), async (renderer) => {
      await press(renderer, 'Add a due date');
      const { minimumDate, maximumDate } = picker(renderer).props;
      const today = localDateFromDayKey(todayKey());
      expect(minimumDate).toBe(today.getTime());
      expect(minimumDate).toBeGreaterThan(new Date(2020, 0, 1).getTime());
      // Five years out, clamped correctly — `addYears` is covered in more depth by
      // the date tests; here it only has to be in the future and after today.
      expect(maximumDate).toBeGreaterThan(minimumDate);
    });
  });

  it('can clear a chosen date', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await press(renderer, 'Add a due date');
      await chooseDate(renderer, todayAt(14));
      await press(renderer, 'Remove due date');
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).not.toHaveProperty('dueDate');
  });

  it('hides the remove control until a date is chosen', async () => {
    await withRendered(element(), (renderer) => {
      expect(labels(renderer)).not.toContain('Remove due date');
    });
  });

  it('closes the picker when its dialog is dismissed, keeping the date', async () => {
    // Android's picker closes itself on every outcome, so `onDismiss` is not a
    // signal that the choice was thrown away. Treating it as one would lose a date
    // the user had already picked — the exact bug the old `event.type === 'dismissed'`
    // branch was there to avoid, and the reason the replacement separates the two
    // callbacks instead.
    await withRendered(element(), async (renderer) => {
      await press(renderer, 'Add a due date');
      await chooseDate(renderer, todayAt(14));
      await dismissPicker(renderer);
      expect(
        hostNodes(renderer).filter((n: ReactTestRenderer.ReactTestInstance) =>
          String(n.type).includes('DateTimePicker'),
        ),
      ).toHaveLength(0);
      expect(visibleText(renderer)).toContain('Today');
    });
  });

  it('does not warn about a deprecated picker callback', async () => {
    // `onChange` warns once per render of the picker, which is console noise in the
    // console during development and invisible in a release build. Asserting the
    // warning is absent is the only way a migration back to the deprecated prop
    // would fail anything.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await withRendered(element(), async (renderer) => {
        await press(renderer, 'Add a due date');
      });
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages.filter((m) => m.includes('onChange'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

// --- Lifecycle ---------------------------------------------------------------

describe('AddTodoModal — editing', () => {
  const TASK: Todo = {
    id: 't9',
    text: 'Renew passport',
    completed: false,
    tags: ['#travel'],
    createdAt: 1,
    notes: 'Counter closes at 4 on weekdays.',
    dueDate: todayKey(),
  };

  it('opens in edit mode with the task already filled in', async () => {
    await withRendered(element({ task: TASK }), (renderer) => {
      expect(visibleText(renderer)).toContain('Edit task');
      // The sheet's own labels on each field, not the row's: the values arrived
      // inside the form, which is exactly what prefill means.
      expect(byLabel(renderer, 'Task title').props.value).toBe('Renew passport');
      expect(byLabel(renderer, 'Task notes').props.value).toBe(
        'Counter closes at 4 on weekdays.',
      );
      // The date row announces the stored date rather than "Add a date".
      expect(labels(renderer)).toContain('Due date, Today. Tap to change.');
    });
  });

  it('offers Save rather than Add', async () => {
    await withRendered(element({ task: TASK }), (renderer) => {
      expect(labels(renderer)).toContain('Save changes');
      expect(labels(renderer)).not.toContain('Add task');
    });
  });

  it('hands back a draft of what the user changed, not the rest of the task', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ task: TASK, onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Renew passport and visa');
      await press(renderer, 'Save changes');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).toMatchObject({
      text: 'Renew passport and visa',
      notes: 'Counter closes at 4 on weekdays.',
      dueDate: TASK.dueDate,
    });
  });

  it('keeps a cleared date cleared', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ task: TASK, onSubmit }), async (renderer) => {
      await press(renderer, 'Remove due date');
      await press(renderer, 'Save changes');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).not.toHaveProperty('dueDate');
  });

  it('keeps facts off the draft; the tag travels deliberately', async () => {
    // `id`, `createdAt` and `completed` are facts about the task, not form data;
    // if any appeared in the draft the merge below would have to fight the sheet.
    // The tag is form data now: it prefilled from the task, so editing a tagged
    // task keeps its tag without re-typing it.
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ task: TASK, onSubmit }), async (renderer) => {
      await press(renderer, 'Save changes');
    });
    const draft = persisted(onSubmit.mock.calls[0][0]);
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('completed');
    expect(draft).not.toHaveProperty('createdAt');
    expect(draft.tag).toBe('#travel');
  });
});

describe('AddTodoModal — the # tag button', () => {
  it('keeps the chips hidden until the # button is pressed', async () => {
    await withRendered(element(), (renderer) => {
      expect(labels(renderer)).toContain('Choose a tag');
      expect(labels(renderer).filter((l) => l.startsWith('Tag '))).toHaveLength(0);
    });
  });

  it('reveals every available tag on press, none chosen', async () => {
    await withRendered(element(), async (renderer) => {
      await press(renderer, 'Choose a tag');
      const chips = labels(renderer).filter((l) => l.startsWith('Tag '));
      expect(chips).toHaveLength(AVAILABLE_TAGS.length);
      expect(byLabel(renderer, `Tag ${AVAILABLE_TAGS[0].label}`).props.accessibilityState).toEqual(
        { selected: false },
      );
    });
  });

  it('hands the chosen tag to the draft', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await press(renderer, 'Choose a tag');
      await press(renderer, `Tag ${AVAILABLE_TAGS[0].label}`);
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0]).tag).toBe(AVAILABLE_TAGS[0].label);
  });

  it('drops a tag whose chip is pressed twice', async () => {
    const onSubmit = jest.fn<void, [TodoDraft]>();
    await withRendered(element({ onSubmit }), async (renderer) => {
      await type(renderer, 'Task title', 'Buy milk');
      await press(renderer, 'Choose a tag');
      await press(renderer, `Tag ${AVAILABLE_TAGS[0].label}`);
      await press(renderer, `Tag ${AVAILABLE_TAGS[0].label}`);
      await press(renderer, 'Add task');
    });
    expect(persisted(onSubmit.mock.calls[0][0])).not.toHaveProperty('tag');
  });

  it('prefills the task being edited with its own tag', async () => {
    const TASK: Todo = {
      id: 't9',
      text: 'Renew passport',
      completed: false,
      tags: ['#travel'],
      createdAt: 1,
    };
    await withRendered(element({ task: TASK }), async (renderer) => {
      // The anchor shows the task's tag even before the chips open.
      expect(visibleText(renderer)).toContain('#travel');
      await press(renderer, 'Choose a tag');
      expect(byLabel(renderer, 'Tag #travel').props.accessibilityState).toEqual({ selected: true });
    });
  });

  it('prefills the screen tag when creating from a tag view', async () => {
    await withRendered(element({ defaultTag: '#gym' }), async (renderer) => {
      expect(visibleText(renderer)).toContain('#gym');
      await press(renderer, 'Choose a tag');
      expect(byLabel(renderer, 'Tag #gym').props.accessibilityState).toEqual({ selected: true });
    });
  });

  it('starts untagged and closed on every open', async () => {
    // The reset effect clears the tag with the rest of the form, so a task added
    // after a tagged one cannot silently inherit it.
    await withRendered(element({ visible: false }), async (renderer) => {
      await rerender(renderer, element({ visible: true }));
      expect(visibleText(renderer)).toContain('None');
      expect(labels(renderer).filter((l) => l.startsWith('Tag '))).toHaveLength(0);
    });
  });
});

describe('AddTodoModal — lifecycle', () => {
  it('does not draw the form when closed', async () => {
    // Otherwise the sheet's fields and placeholders sit in the tree from first
    // render, and anything searching the home screen's text would match text that
    // nobody can see.
    const renderer = await render(element({ visible: false }));
    expect(visibleText(renderer)).not.toContain('New task');
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

  it('starts from empty on every open', async () => {
    // The reset is keyed on `visible`, so this asserts that a draft left over from
    // a previous open cannot survive into the next one.
    const renderer = await render(element());
    await type(renderer, 'Task title', 'Half-written');
    await rerender(renderer, element({ visible: false }));
    await rerender(renderer, element({ visible: true }));
    expect(byLabel(renderer, 'Task title').props.value).toBe('');
    expect(visibleText(renderer)).not.toContain('Half-written');
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the draft through a re-render that does not reopen it', async () => {
    // The counterpart to the reset above: the effect must not fire on every render,
    // or a parent re-render — this app re-renders once a second while a timer runs
    // — would wipe out whatever the user had typed.
    const renderer = await render(element());
    await type(renderer, 'Task title', 'Half-written');
    await rerender(renderer, element({ visible: true }));
    expect(byLabel(renderer, 'Task title').props.value).toBe('Half-written');
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});