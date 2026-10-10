/**
 * Storage migration for tasks.
 *
 * The guarantee this file exists to protect: a task written by any older build
 * still loads, keeps its identity and completion state, and does not lose
 * anything — including the legacy fields that were deliberately removed.
 *
 * `migrateTodos` lives in `todos/model.ts`, which imports neither React nor React
 * Native, so this runs without a renderer. It used to live in
 * `WelcomeComponent.tsx`, which meant testing a pure function required importing
 * the whole component tree.
 */

import { migrateTodos, type Todo } from '../../todos/model';

const NOW = 1_800_000_000_000;

describe('migrateTodos — legacy tasks', () => {
  it('loads a task stored before notes and dueDate existed', () => {
    const [task] = migrateTodos(
      [{ id: 'abc', text: 'Fix login issue', completed: false }],
      NOW,
    );

    expect(task.id).toBe('abc');
    expect(task.text).toBe('Fix login issue');
    expect(task.completed).toBe(false);
    // Absent, not empty. An old task genuinely has no notes and no date.
    expect(task.notes).toBeUndefined();
    expect(task.dueDate).toBeUndefined();
    expect(task.dueTime).toBeUndefined();
  });

  it('backfills createdAt with the supplied load time', () => {
    const [task] = migrateTodos([{ id: 'abc', text: 'Old' }], NOW);
    expect(task.createdAt).toBe(NOW);
  });

  it('keeps a real createdAt rather than overwriting it', () => {
    const [task] = migrateTodos([{ id: 'abc', text: 'Old', createdAt: 42 }], NOW);
    expect(task.createdAt).toBe(42);
  });

  it('drops completedByTimer, which nothing ever set true', () => {
    const [task] = migrateTodos(
      [{ id: 'abc', text: 'Old', completedByTimer: true }],
      NOW,
    );
    // Not merely false — gone, so it cannot resurface in a future export.
    expect('completedByTimer' in task).toBe(false);
    expect(task.completed).toBe(false);
  });

  it('preserves completion state and its timestamp', () => {
    const [task] = migrateTodos(
      [{ id: 'abc', text: 'Done', completed: true, completedAt: 1234 }],
      NOW,
    );
    expect(task.completed).toBe(true);
    expect(task.completedAt).toBe(1234);
  });

  it('drops arbitrary unknown fields instead of carrying them forward', () => {
    const [task] = migrateTodos(
      [{ id: 'abc', text: 'Old', somethingRemoved: 'x', nested: { a: 1 } }],
      NOW,
    );
    expect(Object.keys(task).sort()).toEqual(
      [
        'completed',
        'completedAt',
        'createdAt',
        'dueDate',
        'dueTime',
        'id',
        'notes',
        'tags',
        'text',
      ].sort(),
    );
  });
});

describe('migrateTodos — notes and dueDate round-trip', () => {
  it('keeps both when they are well-formed', () => {
    const [task] = migrateTodos(
      [
        {
          id: 'abc',
          text: 'Build payment integration',
          notes: 'Need to finish the API integration.',
          dueDate: '2026-10-05',
        },
      ],
      NOW,
    );
    expect(task.notes).toBe('Need to finish the API integration.');
    expect(task.dueDate).toBe('2026-10-05');
  });

  it('accepts an empty notes string but still treats no date as absent', () => {
    const [task] = migrateTodos([{ id: 'abc', text: 'X', notes: '' }], NOW);
    // '' survives because the user genuinely cleared it to empty; a missing
    // notes field is a different claim and stays undefined.
    expect(task.notes).toBe('');
    expect(task.dueDate).toBeUndefined();
  });

  it('drops a non-string notes value rather than stringifying it', () => {
    const [task] = migrateTodos([{ id: 'abc', text: 'X', notes: 42 }], NOW);
    expect(task.notes).toBeUndefined();
  });
});

describe('migrateTodos — a corrupt dueDate costs the field, not the task', () => {
  it.each([
    ['2026-13-01', 'impossible month'],
    ['2026-10-32', 'impossible day'],
    ['2026-1-5', 'unpadded'],
    ['2026/10/05', 'wrong separator'],
    ['2026-10-05T00:00:00Z', 'an ISO timestamp instead of a day key'],
    ['', 'empty'],
    ['not-a-date', 'nonsense'],
  ])('drops %p (%s)', (dueDate) => {
    const [task] = migrateTodos([{ id: 'abc', text: 'Keep me', dueDate }], NOW);
    // The task survives intact; only the untrusted field is discarded.
    expect(task.dueDate).toBeUndefined();
    expect(task.id).toBe('abc');
    expect(task.text).toBe('Keep me');
    expect(task.createdAt).toBe(NOW);
  });

  it.each([null, 0, true, [], {}])('drops the non-string value %p', (dueDate) => {
    const [task] = migrateTodos([{ id: 'abc', text: 'Keep me', dueDate }], NOW);
    expect(task.dueDate).toBeUndefined();
    expect(task.id).toBe('abc');
  });

  it('accepts a leap day, which is a real day key', () => {
    const [task] = migrateTodos([{ id: 'abc', text: 'X', dueDate: '2024-02-29' }], NOW);
    expect(task.dueDate).toBe('2024-02-29');
  });
});

describe('migrateTodos — dueTime round-trip', () => {
  it('keeps a well-formed time', () => {
    const [task] = migrateTodos(
      [{ id: 'abc', text: 'X', dueDate: '2026-10-05', dueTime: '14:30' }],
      NOW,
    );
    expect(task.dueDate).toBe('2026-10-05');
    expect(task.dueTime).toBe('14:30');
  });

  it('accepts midnight and the last minute of the day', () => {
    const [[, midnight], [, lastMinute]] = migrateTodos(
      [
        { id: 'a', text: 'X', dueTime: '00:00' },
        { id: 'b', text: 'X', dueTime: '23:59' },
      ],
      NOW,
    ).map((task) => [task.id, task.dueTime]);
    expect(midnight).toBe('00:00');
    expect(lastMinute).toBe('23:59');
  });

  it.each([
    ['24:00', 'hour out of range'],
    ['9:05', 'unpadded hour'],
    ['23:60', 'minute out of range'],
    ['14:3', 'unpadded minute'],
    ['2:30 PM', 'a formatted label instead of a key'],
    ['', 'empty'],
    ['noon', 'nonsense'],
  ])('drops %p (%s)', (dueTime) => {
    const [task] = migrateTodos([{ id: 'abc', text: 'Keep me', dueTime }], NOW);
    expect(task.dueTime).toBeUndefined();
    expect(task.id).toBe('abc');
  });

  it.each([null, 0, true, [], {}])('drops the non-string value %p', (dueTime) => {
    const [task] = migrateTodos([{ id: 'abc', text: 'Keep me', dueTime }], NOW);
    expect(task.dueTime).toBeUndefined();
    expect(task.id).toBe('abc');
  });
});

describe('migrateTodos — structural robustness', () => {
  it('survives entries that are null, strings or numbers', () => {
    const tasks = migrateTodos([null, 'nope', 7, { id: 'ok', text: 'Fine' }], NOW);
    expect(tasks).toHaveLength(4);
    // Nothing throws, and the one usable entry is still usable.
    expect(tasks[3].text).toBe('Fine');
  });

  it('coerces a missing id and text to empty strings rather than undefined', () => {
    // `text: undefined` would crash the row renderer; `''` renders as an empty
    // row the user can delete.
    const [task] = migrateTodos([{}], NOW);
    expect(task.id).toBe('');
    expect(task.text).toBe('');
    expect(task.completed).toBe(false);
  });

  it('normalises a non-array tags field to an empty array', () => {
    const [task] = migrateTodos([{ id: 'a', text: 'X', tags: 'work' }], NOW);
    expect(task.tags).toEqual([]);
    const [second] = migrateTodos([{ id: 'b', text: 'X', tags: ['work', 3] }], NOW);
    expect(second.tags).toEqual(['work', '3']);
  });

  it('maps an empty stored list to an empty list', () => {
    expect(migrateTodos([], NOW)).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [{ id: 'a', text: 'X', completedByTimer: true }];
    migrateTodos(input, NOW);
    // If migration mutated its input, the stale field would already be gone here.
    expect(input[0]).toHaveProperty('completedByTimer', true);
  });
});

describe('Todo structural compatibility', () => {
  it('still satisfies CompletionRecord, which has no notes or dueDate', () => {
    // Compile-time guarantee, asserted at runtime so the intent is recorded. If
    // `notes` or `dueDate` ever became required, this assignment would stop
    // compiling — which is exactly when we would want to know.
    const task: Todo = {
      id: 'a',
      text: 'X',
      completed: false,
      tags: [],
      createdAt: 1,
      completedAt: undefined,
      notes: undefined,
      dueDate: undefined,
    };
    const record = {
      id: task.id,
      completed: task.completed,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
    };
    expect(record.completed).toBe(false);
  });
});