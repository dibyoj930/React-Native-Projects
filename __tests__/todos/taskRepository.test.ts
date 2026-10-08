/**
 * The task storage boundary, and the body the export button shares.
 *
 * `buildExportPayload` is pinned field by field on purpose. The share sheet has
 * always written this exact shape, and an *addition* — the draft version of
 * this module carried `notes` and `dueDate` — changes the file a user receives
 * without anything else failing. The only way to make that cost something is to
 * assert the keys.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildExportPayload,
  exportFilename,
  loadTodos,
  saveTodos,
} from '../../todos/taskRepository';
import { TODOS_STORAGE_KEY, type Todo } from '../../todos/model';
import { buildSnapshot } from '../../productivity/domain';

/** Mid-morning, local — `jest.setup.js` pins the suite to Asia/Kolkata. */
const NOW = new Date(2026, 4, 3, 10, 30).getTime();

/** Empty history, so the statistics in these tests come only from the todos. */
function snapshot() {
  return buildSnapshot({
    sessions: [],
    active: [],
    tasks: [],
    ledger: { freezesEarned: 0, freezesSpent: 0 },
    memory: { lastEventAt: null, previousDayScore: 0 },
    now: NOW,
  });
}

/** A completed task carrying every field the model offers, export or not. */
const todo: Todo = {
  id: 't1',
  text: 'Write the assessment',
  completed: true,
  completedAt: NOW - 60_000,
  createdAt: NOW - 3_600_000,
  tags: ['#coding'],
  notes: 'with diagrams',
  dueDate: '2026-05-03',
};

describe('buildExportPayload', () => {
  it('writes exactly the fields the export has always carried', () => {
    const payload = buildExportPayload([todo], snapshot());
    expect(Object.keys(payload.tasks[0])).toEqual([
      'id',
      'text',
      'completed',
      'completedAt',
      'createdAt',
      'tags',
    ]);
  });

  it('does not leak notes or due dates into the file', () => {
    // The model carries both, so nothing stops them reaching an export — which
    // is precisely how they got into the draft of this module. They never were
    // in the file a user receives, and this is what keeps it that way.
    const payload = buildExportPayload([todo], snapshot());
    expect(payload.tasks[0]).not.toHaveProperty('notes');
    expect(payload.tasks[0]).not.toHaveProperty('dueDate');
    expect(JSON.stringify(payload)).not.toContain('with diagrams');
  });

  it('reports timestamps a legacy task does not have as null', () => {
    const legacy: Todo = {
      id: 'old',
      text: 'Written before timestamps existed',
      completed: false,
      tags: [],
    };
    const [task] = buildExportPayload([legacy], snapshot()).tasks;
    expect(task.createdAt).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.tags).toEqual([]);
  });

  it('counts totals and takes the statistics from the snapshot', () => {
    const open: Todo = { ...todo, id: 't2', completed: false, completedAt: undefined };
    const payload = buildExportPayload([todo, open], snapshot());

    expect(payload.totalTasks).toBe(2);
    expect(payload.completedTasks).toBe(1);
    expect(Object.keys(payload.statistics)).toEqual([
      'momentum',
      'streak',
      'mission',
      'today',
      'daysTracked',
    ]);
    // Empty history, so nothing was recorded on any day — and the day is the
    // local one, not UTC.
    expect(payload.statistics.daysTracked).toBe(0);
    expect(payload.statistics.today.day).toBe('2026-05-03');
  });
});

describe('exportFilename', () => {
  it('names the file after the day of the export', () => {
    jest.useFakeTimers({ now: new Date('2026-05-03T18:30:00.000Z') });
    const payload = buildExportPayload([todo], snapshot());
    expect(exportFilename(payload)).toBe('todos-2026-05-03.json');
    jest.useRealTimers();
  });
});

describe('saveTodos / loadTodos', () => {
  // The AsyncStorage mock's store is module-level, so each of these starts from
  // an empty one rather than inheriting the previous test's list.
  beforeEach(async () => {
    await AsyncStorage.clear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  it('round-trips a list through storage', async () => {
    await saveTodos([todo]);
    const loaded = await loadTodos();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('t1');
    expect(loaded[0].text).toBe('Write the assessment');
    expect(loaded[0].tags).toEqual(['#coding']);
  });

  it('hands back no tasks when nothing is stored', async () => {
    await expect(loadTodos()).resolves.toEqual([]);
  });

  it('treats a non-array value as no tasks, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify({ nope: true }));

    await expect(loadTodos()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      '[todos] stored value is not an array, ignoring it',
    );
    warn.mockRestore();
  });

  it('degrades a corrupt value to an empty list rather than throwing', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await AsyncStorage.setItem(TODOS_STORAGE_KEY, '{not json');

    await expect(loadTodos()).resolves.toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('keeps a failed write from reaching the caller as a rejection', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(saveTodos([todo])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Failed to save todos:', expect.any(Error));
    error.mockRestore();
  });
});
