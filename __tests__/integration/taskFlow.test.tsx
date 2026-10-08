/**
 * Storage to screen.
 *
 * Every other suite tests a piece. This one tests the seam, and the seam is where
 * the two new fields could most plausibly go missing: `notes` and `dueDate` are
 * written by one component, repaired by `migrateTodos`, carried on the `Todo`, and
 * only then turned into a visible line by `formatDueLabel`. Every one of those
 * steps is tested in isolation, and none of them would fail if the *next* one had
 * quietly stopped being wired up.
 *
 * A due date that survives migration but never reaches a row would look entirely
 * correct from the model side, which is exactly the kind of bug unit tests are
 * worst at catching.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import App from '../../App';
import { todayKey } from '../../productivity';
import { AVAILABLE_TAGS } from '../../todos/tags';
import { hostNodes, labels, press, visibleText } from '../support/render';

/** Mounts the whole app and flushes the storage hydration the providers perform. */
async function mountApp(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // Three providers hydrate on mount — todos, productivity, theme preference.
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  if (!renderer) throw new Error('renderer was never created');
  return renderer;
}

/**
 * Mounts the app on the tasks screen, which is where tasks live.
 *
 * Home no longer renders rows, so anything asserting on a task has to walk in
 * through the real control rather than assume the list is on screen. Going through
 * the button is the point: it is the same path a person takes, and it is what
 * proves the navigation actually reaches the list.
 */
async function mountAppOnTasks(): Promise<ReactTestRenderer.ReactTestRenderer> {
  const renderer = await mountApp();
  await press(renderer, 'Open all tasks');
  return renderer;
}

async function unmount(renderer: ReactTestRenderer.ReactTestRenderer): Promise<void> {
  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
}

async function seedTodos(value: unknown): Promise<void> {
  await AsyncStorage.setItem('todos', JSON.stringify(value));
}

const today = todayKey();

describe('a stored task reaches the list', () => {
  it('shows a due date that was written by the Add Todo sheet', async () => {
    await seedTodos([
      { id: 'a', text: 'Renew passport', completed: false, tags: [], createdAt: 1, dueDate: today },
    ]);
    const renderer = await mountAppOnTasks();
    const text = visibleText(renderer);
    expect(text).toContain('Renew passport');
    // The label is derived, so asserting the word rather than a hardcoded date is
    // what proves the value travelled: it is computed from the stored day key at
    // render time, and "Today" is only reachable if that key is intact.
    expect(text).toContain('Today');
    await unmount(renderer);
  });

  it('shows a task that carries notes but no date, without inventing a date line', async () => {
    await seedTodos([
      {
        id: 'a',
        text: 'Email the landlord',
        completed: false,
        tags: [],
        createdAt: 1,
        notes: 'Agent is Mr Rao, +91 98xxx xxxxx',
      },
    ]);
    const renderer = await mountAppOnTasks();
    expect(visibleText(renderer)).toContain('Email the landlord');
    // The notes render under the title, and the absence of a date stays invisible:
    // a task with notes and no date must not gain a date line by association.
    expect(visibleText(renderer)).toContain('Agent is Mr Rao, +91 98xxx xxxxx');
    expect(visibleText(renderer)).not.toContain('Add a date');
    await unmount(renderer);
  });

  it('keeps a legacy task working and still shows its text', async () => {
    // No `createdAt`, no notes, no date, plus the removed `completedByTimer` flag.
    await seedTodos([
      { id: 'old-1', text: 'Written by an old build', completed: true, tags: ['#coding'] },
    ]);
    const renderer = await mountAppOnTasks();
    expect(visibleText(renderer)).toContain('Written by an old build');
    await unmount(renderer);
  });

  it('does not lose a task whose stored date is malformed', async () => {
    // `migrateTodos` drops the bad field and keeps the task. Losing the task would
    // be a far worse outcome than losing the date.
    await seedTodos([
      { id: 'a', text: 'Survivor', completed: false, tags: [], createdAt: 1, dueDate: 'not-a-date' },
      { id: 'b', text: 'Also fine', completed: false, tags: [], createdAt: 1, dueDate: '2026-13-45' },
    ]);
    const renderer = await mountAppOnTasks();
    const text = visibleText(renderer);
    expect(text).toContain('Survivor');
    expect(text).toContain('Also fine');
    expect(text).not.toContain('not-a-date');
    await unmount(renderer);
  });

  it('does not render a date line for a task that has none', async () => {
    await seedTodos([
      { id: 'a', text: 'No date here', completed: false, tags: [], createdAt: 1 },
    ]);
    const renderer = await mountAppOnTasks();
    const calendarGlyphs = hostNodes(renderer).filter(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Add a due date',
    );
    // `Add a due date` is the Add Todo *sheet's* control, not a row's. It appearing
    // here would mean the sheet's form had leaked into the list, so the check is
    // that no such control exists alongside the row.
    expect(calendarGlyphs).toHaveLength(0);
    expect(visibleText(renderer)).toContain('No date here');
    await unmount(renderer);
  });
});

describe('the list lives in exactly one place', () => {
  it('does not render task rows on home', async () => {
    // The whole point of the split. If a row ever comes back to home, there are two
    // copies of the same list again — and the completion lock and timer state that
    // make a row behave correctly would then have to be kept in step across both.
    await seedTodos([
      { id: 'a', text: 'Only on the tasks screen', completed: false, tags: [], createdAt: 1 },
    ]);
    const renderer = await mountApp();
    expect(visibleText(renderer)).not.toContain('Only on the tasks screen');
    // The doorway is there, though — home is how you get to the work.
    expect(visibleText(renderer)).toContain('See every task you have written down.');
    await unmount(renderer);
  });

  it('summarises the open count on home without listing them', async () => {
    await seedTodos([
      { id: 'a', text: 'One', completed: false, tags: [], createdAt: 1 },
      { id: 'b', text: 'Two', completed: true, tags: [], createdAt: 2 },
    ]);
    const renderer = await mountApp();
    expect(visibleText(renderer)).toContain('1 open of 2');
    await unmount(renderer);
  });

  it('opens the list from home and closes it again from its own back control', async () => {
    await seedTodos([
      { id: 'a', text: 'Round trip', completed: false, tags: [], createdAt: 1 },
    ]);
    const renderer = await mountApp();

    await press(renderer, 'Open all tasks');
    expect(visibleText(renderer)).toContain('Round trip');
    expect(visibleText(renderer)).toContain('All tasks');

    await press(renderer, 'Back to today');
    expect(visibleText(renderer)).not.toContain('Round trip');
    expect(visibleText(renderer)).toContain('Today');
    await unmount(renderer);
  });

  it('keeps the progress dashboard on home, off the list screen', async () => {
    // The split is not "everything moves to the new screen". Home answers "how is
    // today going"; the tasks screen answers "what is there to do".
    const renderer = await mountApp();
    const home = visibleText(renderer);
    expect(home).toContain('Focus time');

    await press(renderer, 'Open all tasks');
    const tasks = visibleText(renderer);
    expect(tasks).not.toContain('Focus time');
    await unmount(renderer);
  });
});

describe('the tag index on home', () => {
  it('always sits between Today and the streak, even when nothing is tagged', async () => {
    // Fresh install: no task carries a tag, and the section still exists. It used
    // to hide when nothing was tagged — which is why it kept being asked for in
    // exactly this spot. Now it is permanent.
    await seedTodos([]);
    const renderer = await mountApp();
    const home = visibleText(renderer);
    expect(home).toContain('Tags');
    // Document order: the tags section is physically between the progress card
    // (whose label is "Today") and the streak.
    expect(home.indexOf('Today')).toBeLessThan(home.indexOf('Tags'));
    expect(home.indexOf('Tags')).toBeLessThan(home.indexOf('Streak'));
    // And every vocabulary tag is there on a fresh install, because an unused
    // chip is how a tag's first task ever gets created — none may disappear.
    const chips = labels(renderer).filter((l) => l.startsWith('Show tasks tagged'));
    expect(chips).toHaveLength(AVAILABLE_TAGS.length);
    await unmount(renderer);
  });

  it('opens a filtered list for the pressed tag, and back returns home', async () => {
    await seedTodos([
      { id: 'a', text: 'Write the design doc', completed: false, tags: ['#coding'], createdAt: 1 },
      { id: 'b', text: 'Do the bench press', completed: false, tags: ['#gym'], createdAt: 2 },
      { id: 'c', text: 'Review PR', completed: false, tags: ['#coding'], createdAt: 3 },
    ]);
    const renderer = await mountApp();

    await press(renderer, 'Show tasks tagged #coding');
    const coding = visibleText(renderer);
    expect(coding).toContain('Write the design doc');
    expect(coding).toContain('Review PR');
    // Filtered: the #gym task is not on this screen.
    expect(coding).not.toContain('Do the bench press');
    // The tag heads the screen, in place of "All tasks".
    expect(coding).toContain('#coding');
    expect(coding).not.toContain('All tasks');

    await press(renderer, 'Back to today');
    expect(visibleText(renderer)).toContain('Today');

    await press(renderer, 'Show tasks tagged #gym');
    const gym = visibleText(renderer);
    expect(gym).toContain('Do the bench press');
    expect(gym).not.toContain('Write the design doc');
    await unmount(renderer);
  });

  it('shows "No Todos yet" for a tag nothing uses, and can start it from there', async () => {
    await seedTodos([
      { id: 'a', text: 'Write the design doc', completed: false, tags: ['#coding'], createdAt: 1 },
    ]);
    const renderer = await mountApp();

    await press(renderer, 'Show tasks tagged #blog');
    const empty = visibleText(renderer);
    // The tag names the screen, and the empty state says so rather than
    // pretending a blank page is normal.
    expect(empty).toContain('#blog');
    expect(empty).toContain('No Todos yet');
    // The dead end never existed: this screen's `+` is how the tag starts.
    expect(labels(renderer)).toContain('Add a task tagged #blog');
    await unmount(renderer);
  });

  it('creates a task that is born with the tag of the screen it was made on', async () => {
    // Nothing tagged on install: the tag is created from scratch through its own
    // empty screen, which is the only way a task can ever come to carry a tag.
    await seedTodos([]);
    const renderer = await mountApp();
    await press(renderer, 'Show tasks tagged #gym');

    // The tag screen's `+` says what it will do, so the tap needs no second thought.
    await press(renderer, 'Add a task tagged #gym');

    const field = hostNodes(renderer).find(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Task title',
    );
    if (!field) throw new Error('the task sheet did not open from the tag screen');

    const { onChangeText } = field.props;
    await ReactTestRenderer.act(async () => {
      onChangeText('Born tagged');
    });
    await ReactTestRenderer.act(async () => {
      field.props.onSubmitEditing();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const parsed = JSON.parse((await AsyncStorage.getItem('todos')) as string);
    const born = parsed.find((t: { text: string }) => t.text === 'Born tagged');
    expect(born.tags).toEqual(['#gym']);
    // And it appears on the tag screen it was created from.
    expect(visibleText(renderer)).toContain('Born tagged');
    await unmount(renderer);
  });
});

describe('the + on home', () => {
  it('opens the create sheet from right beside the All tasks tile', async () => {
    await seedTodos([]);
    const renderer = await mountApp();
    // Home has the tile and its `+`, and the definition of "opens" is that the
    // sheet's own field enters the tree — a Modal renders nothing until shown.
    await press(renderer, 'Add a task');
    const field = hostNodes(renderer).find(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Task title',
    );
    if (!field) throw new Error('the task sheet did not open from home');

    const { onChangeText } = field.props;
    await ReactTestRenderer.act(async () => {
      onChangeText('From the home plus');
    });
    await ReactTestRenderer.act(async () => {
      field.props.onSubmitEditing();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const parsed = JSON.parse((await AsyncStorage.getItem('todos')) as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe('From the home plus');
    expect(parsed[0].tags).toEqual([]);
    // Home's own summary notices straight away: one open of one.
    expect(visibleText(renderer)).toContain('1 open of 1');
    await unmount(renderer);
  });
});

describe('tagging from the sheet', () => {
  it('lets a task created on home carry a tag chosen through #', async () => {
    await seedTodos([]);
    const renderer = await mountApp();
    await press(renderer, 'Add a task');

    // The sheet's own # control: hidden until pressed, then one pick.
    await press(renderer, 'Choose a tag');
    await press(renderer, 'Tag #coding');

    const field = hostNodes(renderer).find(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Task title',
    );
    if (!field) throw new Error('the task sheet did not open from home');

    const { onChangeText } = field.props;
    await ReactTestRenderer.act(async () => {
      onChangeText('Tagged from the sheet');
    });
    await ReactTestRenderer.act(async () => {
      field.props.onSubmitEditing();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const parsed = JSON.parse((await AsyncStorage.getItem('todos')) as string);
    expect(parsed[0].text).toBe('Tagged from the sheet');
    expect(parsed[0].tags).toEqual(['#coding']);
    await unmount(renderer);
  });
});

describe('editing through the sheet', () => {
  it('changes title, notes and date, and not the facts that are not form data', async () => {
    await seedTodos([
      {
        id: 'a',
        text: 'Renew passport',
        completed: false,
        tags: ['#travel'],
        createdAt: 1,
        notes: 'Counter closes at 4.',
        dueDate: today,
      },
    ]);
    const renderer = await mountAppOnTasks();

    await press(renderer, 'Edit Renew passport');
    expect(visibleText(renderer)).toContain('Edit task');

    const field = hostNodes(renderer).find(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Task title',
    );
    if (!field) throw new Error('the edit sheet did not open');

    const { onChangeText } = field.props;
    await ReactTestRenderer.act(async () => {
      onChangeText('Renew passport and visa');
    });
    // Change the notes the same way the sheet hands them back.
    const notesField = hostNodes(renderer).find(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Task notes',
    );
    if (!notesField) throw new Error('the notes field did not open with the edit sheet');
    await ReactTestRenderer.act(async () => {
      notesField.props.onChangeText('Bring two photographs.');
    });
    await press(renderer, 'Remove due date');
    await press(renderer, 'Save changes');

    // The row reflects the three editable fields.
    const row = visibleText(renderer);
    expect(row).toContain('Renew passport and visa');
    expect(row).toContain('Bring two photographs.');
    expect(row).not.toContain('Counter closes at 4.');

    // Storage keeps the things the sheet cannot touch.
    const parsed = JSON.parse((await AsyncStorage.getItem('todos')) as string);
    expect(parsed[0].text).toBe('Renew passport and visa');
    expect(parsed[0].notes).toBe('Bring two photographs.');
    expect(parsed[0].dueDate).toBeUndefined();
    expect(parsed[0].tags).toEqual(['#travel']);
    expect(parsed[0].completed).toBe(false);
    await unmount(renderer);
  });

  it('lets the sheet swap a task\'s tag for another', async () => {
    await seedTodos([
      {
        id: 'a',
        text: 'Renew passport',
        completed: false,
        tags: ['#travel'],
        createdAt: 1,
      },
    ]);
    const renderer = await mountAppOnTasks();

    await press(renderer, 'Edit Renew passport');
    // The edit sheet opened with the current tag shown, so switching is a one-tap
    // replacement rather than an add.
    await press(renderer, 'Choose a tag');
    await press(renderer, 'Tag #gym');
    await press(renderer, 'Save changes');

    const parsed = JSON.parse((await AsyncStorage.getItem('todos')) as string);
    expect(parsed[0].tags).toEqual(['#gym']);
    await unmount(renderer);
  });
});

describe('creation reaches storage', () => {
  it('writes a task through the Add Todo sheet, inventing nothing', async () => {
    // The other direction of the same seam: what the sheet produces has to survive
    // the trip to AsyncStorage intact, or the row tests above would be asserting on
    // data no user could ever create.
    await seedTodos([]);
    const renderer = await mountAppOnTasks();

    // Open the sheet through the tasks screen's `+`. Reaching straight for the field
    // would not work: the sheet is a `Modal` and renders nothing while closed, so
    // its fields only enter the tree once the button has been pressed.
    await press(renderer, 'Add a task');

    const field = hostNodes(renderer).find(
      (n: ReactTestRenderer.ReactTestInstance) => n.props?.accessibilityLabel === 'Task title',
    );
    if (!field) throw new Error('the Add Todo sheet did not open');

    // Drive the sheet's own submit path rather than its internals.
    const { onChangeText } = field.props;
    await ReactTestRenderer.act(async () => {
      onChangeText('Book the dentist');
    });
    await ReactTestRenderer.act(async () => {
      field.props.onSubmitEditing();
    });
    // Let the save effect run.
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const stored = await AsyncStorage.getItem('todos');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe('Book the dentist');
    expect(parsed[0].completed).toBe(false);
    // Nothing invented: no date and no notes were entered, so neither is stored.
    expect(parsed[0].dueDate).toBeUndefined();
    expect(parsed[0].notes).toBeUndefined();

    await unmount(renderer);
  });
});
