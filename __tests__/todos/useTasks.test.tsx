/**
 * The task hook.
 *
 * The interesting behaviour here is the one that is *absent*: the save effect
 * must not write before the load has resolved. Killing the app inside that
 * window would otherwise destroy every task, so the guard is worth a test of
 * its own rather than being left to the ordering of two effects.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTasks } from '../../todos/useTasks';
import { TODOS_STORAGE_KEY, type Todo } from '../../todos/model';
import { render } from '../support/render';

type Tasks = ReturnType<typeof useTasks>;

const todoA: Todo = {
  id: 'a',
  text: 'First',
  completed: false,
  tags: [],
  createdAt: 1,
};

let tasks: Tasks | undefined;

/** Reads the hook's return value on every render, so tests act on the live one. */
function Probe() {
  tasks = useTasks();
  return null;
}

/** Lets a pending load (or its follow-up save) settle. */
const settle = () => ReactTestRenderer.act(async () => undefined);

const writes = (): string[] =>
  (AsyncStorage.setItem as jest.Mock).mock.calls.map((call) => call[1] as string);

beforeEach(async () => {
  tasks = undefined;
  // The AsyncStorage mock's store is module-level: without this, a task created
  // by one test is still sitting in storage when the next test hydrates.
  await AsyncStorage.clear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
});

describe('useTasks — hydration', () => {
  it('does not write the list before it has read it', async () => {
    await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify([todoA]));
    (AsyncStorage.setItem as jest.Mock).mockClear();

    await render(<Probe />);

    // The guard. Without it, the first render's save effect has already written
    // `[]` over the stored list by the time this assertion runs.
    expect(writes()).not.toContain('[]');

    await settle();
    expect(tasks!.hydrated).toBe(true);
    expect(tasks!.todos.map((todo) => todo.id)).toEqual(['a']);

    // And it then saves what it read, rather than an empty list.
    const saved = writes().map((value) => JSON.parse(value) as Todo[]);
    expect(saved).toHaveLength(1);
    expect(saved[0].map((todo) => todo.id)).toEqual(['a']);
  });
});

describe('useTasks — the operations', () => {
  beforeEach(async () => {
    await render(<Probe />);
    await settle();
  });

  it('creates a task from a draft, stamping the id and the creation time', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'New', tag: '#gym' });
    });

    const [created] = tasks!.todos;
    expect(created.text).toBe('New');
    expect(created.completed).toBe(false);
    expect(created.tags).toEqual(['#gym']);
    expect(typeof created.id).toBe('string');
    expect(typeof created.createdAt).toBe('number');

    // Persisted by the effect, not by the operation.
    const saved = JSON.parse(writes().at(-1) as string) as Todo[];
    expect(saved.map((todo) => todo.id)).toEqual([created.id]);
  });

  it('makes a task with no tag when the draft carries none', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'Untagged' });
    });
    expect(tasks!.todos[0].tags).toEqual([]);
  });

  it('keeps a task’s own tag when an edit carries none', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'Tagged', tag: '#coding' });
    });

    await ReactTestRenderer.act(async () => {
      tasks!.updateTodo(tasks!.todos[0].id, { text: 'Tagged, renamed' });
    });

    const [edited] = tasks!.todos;
    expect(edited.text).toBe('Tagged, renamed');
    // The draft had no tag, so the task keeps its own. This is what stops a
    // legacy tag from being deleted by editing something else.
    expect(edited.tags).toEqual(['#coding']);
  });

  it('replaces the tag when the draft carries one', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'Tagged', tag: '#coding' });
    });
    await ReactTestRenderer.act(async () => {
      tasks!.updateTodo(tasks!.todos[0].id, { text: 'Tagged', tag: '#study' });
    });
    expect(tasks!.todos[0].tags).toEqual(['#study']);
  });

  it('leaves the other tasks alone, including when the id is unknown', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'One' });
      tasks!.createTodo({ text: 'Two' });
    });
    const [first, second] = tasks!.todos;

    await ReactTestRenderer.act(async () => {
      tasks!.updateTodo(first.id, { text: 'One, edited' });
      tasks!.updateTodo('nobody', { text: 'Ghost edit' });
    });

    expect(tasks!.todos.map((todo) => todo.text)).toEqual(['One, edited', 'Two']);
    expect(tasks!.todos[1].id).toBe(second.id);
  });

  it('removes a task by id', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'One' });
      tasks!.createTodo({ text: 'Two' });
    });
    const [first] = tasks!.todos;

    await ReactTestRenderer.act(async () => {
      tasks!.removeTodo(first.id);
    });

    expect(tasks!.todos.map((todo) => todo.text)).toEqual(['Two']);
  });

  it('completes several tasks at one instant, leaving completed ones alone', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'One' });
      tasks!.createTodo({ text: 'Two' });
      tasks!.createTodo({ text: 'Three' });
    });
    const [one, two, three] = tasks!.todos;

    const stamp = Date.now() - 5_000;
    await ReactTestRenderer.act(async () => {
      // Two is already complete: a re-fired expiry must not restamp it.
      tasks!.setCompleted(two.id, true);
      tasks!.completeTodos([one.id, two.id, three.id, 'nobody'], stamp);
    });

    const byId = new Map(tasks!.todos.map((todo) => [todo.id, todo]));
    expect(byId.get(one.id)).toMatchObject({ completed: true, completedAt: stamp });
    expect(byId.get(three.id)).toMatchObject({ completed: true, completedAt: stamp });
    // The earlier completion keeps its own time.
    expect(byId.get(two.id)?.completedAt).not.toBe(stamp);
  });

  it('stamps a completion time when completing and clears it when reopening', async () => {
    await ReactTestRenderer.act(async () => {
      tasks!.createTodo({ text: 'One' });
    });
    const [task] = tasks!.todos;

    await ReactTestRenderer.act(async () => {
      tasks!.setCompleted(task.id, true);
    });
    expect(tasks!.todos[0].completed).toBe(true);
    expect(typeof tasks!.todos[0].completedAt).toBe('number');

    await ReactTestRenderer.act(async () => {
      tasks!.setCompleted(task.id, false);
    });
    expect(tasks!.todos[0].completed).toBe(false);
    // Reopened, so it does not claim a completion it no longer earned.
    expect(tasks!.todos[0].completedAt).toBeUndefined();
  });
});
