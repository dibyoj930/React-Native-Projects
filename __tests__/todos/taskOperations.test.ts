/**
 * The pure task mutations, with attention to the scheduling fields.
 *
 * The replan engine reads `priority`/`estimatedMinutes`/`schedulingMode`, so how
 * a draft writes them — and how an edit clears a stale fixed anchor — is part of
 * the contract, not incidental form plumbing. `withEstimatedMinutes` is the
 * narrow write behind plan-review calibration.
 */

import {
  applyDraftToTodo,
  createTodoFromDraft,
  withEstimatedMinutes,
} from '../../todos/taskOperations';
import type { Todo, TodoDraft } from '../../todos/model';

function todo(overrides: Partial<Todo> = {}): Todo {
  return { id: 't1', text: 'Task', completed: false, tags: [], createdAt: 1, ...overrides };
}

function draft(overrides: Partial<TodoDraft> = {}): TodoDraft {
  return { text: 'Task', ...overrides };
}

describe('applyDraftToTodo — scheduling fields', () => {
  it('writes priority, estimate and mode straight from the draft', () => {
    const updated = applyDraftToTodo(
      todo(),
      draft({ priority: 'high', estimatedMinutes: 45, schedulingMode: 'flexible' }),
    );
    expect(updated.priority).toBe('high');
    expect(updated.estimatedMinutes).toBe(45);
    expect(updated.schedulingMode).toBe('flexible');
  });

  it('clears the fields when the draft omits them', () => {
    const updated = applyDraftToTodo(
      todo({ priority: 'high', estimatedMinutes: 30, schedulingMode: 'fixed' }),
      draft(),
    );
    expect(updated.priority).toBeUndefined();
    expect(updated.estimatedMinutes).toBeUndefined();
    expect(updated.schedulingMode).toBeUndefined();
  });

  it('keeps a fixed anchor while the task stays fixed', () => {
    const updated = applyDraftToTodo(
      todo({ schedulingMode: 'fixed', fixedStartAt: 5_000 }),
      draft({ schedulingMode: 'fixed' }),
    );
    expect(updated.fixedStartAt).toBe(5_000);
  });

  it('drops the anchor when the task becomes flexible', () => {
    const updated = applyDraftToTodo(
      todo({ schedulingMode: 'fixed', fixedStartAt: 5_000 }),
      draft({ schedulingMode: 'flexible' }),
    );
    expect(updated.fixedStartAt).toBeUndefined();
  });

  it('never overwrites identity or completion facts', () => {
    const original = todo({ id: 'keep', completed: true, completedAt: 99, createdAt: 7 });
    const updated = applyDraftToTodo(original, draft({ priority: 'low' }));
    expect(updated.id).toBe('keep');
    expect(updated.completed).toBe(true);
    expect(updated.completedAt).toBe(99);
    expect(updated.createdAt).toBe(7);
  });
});

describe('createTodoFromDraft — scheduling fields', () => {
  it('carries priority, estimate and mode onto the new task', () => {
    const created = createTodoFromDraft(
      draft({ text: 'New', priority: 'medium', estimatedMinutes: 20, schedulingMode: 'flexible' }),
      'id-1',
      { now: () => 1234 },
    );
    expect(created).toMatchObject({
      id: 'id-1',
      text: 'New',
      completed: false,
      createdAt: 1234,
      priority: 'medium',
      estimatedMinutes: 20,
      schedulingMode: 'flexible',
    });
  });
});

describe('task career links', () => {
  it('writes a valid link onto a new task', () => {
    const created = createTodoFromDraft(
      draft({
        text: 'Write case study',
        career: { goalId: 'goal-1', milestoneId: 'm-1', skillIds: ['s-1'] },
      }),
      'id-1',
      { now: () => 1234 },
    );

    expect(created.career).toEqual({
      goalId: 'goal-1',
      milestoneId: 'm-1',
      skillIds: ['s-1'],
    });
  });

  it('treats the draft as the whole selection, so omitting it clears the link', () => {
    const updated = applyDraftToTodo(
      todo({ career: { goalId: 'goal-1', skillIds: ['s-1'] } }),
      draft(),
    );

    expect(updated.career).toBeUndefined();
  });

  it('does not let a malformed draft store a dangling reference', () => {
    const updated = applyDraftToTodo(
      todo(),
      draft({ career: { milestoneId: 'm-1', skillIds: ['  ', 's-1'] } }),
    );

    expect(updated.career).toEqual({ skillIds: ['s-1'] });
  });
});

describe('withEstimatedMinutes', () => {
  it('rewrites only the target task’s estimate', () => {
    const next = withEstimatedMinutes(
      [todo({ id: 'a', estimatedMinutes: 10 }), todo({ id: 'b', estimatedMinutes: 20 })],
      'a',
      45,
    );
    expect(next[0].estimatedMinutes).toBe(45);
    expect(next[1].estimatedMinutes).toBe(20);
  });

  it('changes nothing else about the task', () => {
    const original = todo({
      id: 'keep',
      completed: true,
      completedAt: 99,
      createdAt: 7,
      estimatedMinutes: 30,
      tags: ['gym'],
    });
    const [updated] = withEstimatedMinutes([original], 'keep', 60);
    expect(updated).toEqual({ ...original, estimatedMinutes: 60 });
  });

  it('clears the estimate when given a non-positive number', () => {
    const [updated] = withEstimatedMinutes([todo({ estimatedMinutes: 30 })], 't1', 0);
    expect(updated.estimatedMinutes).toBeUndefined();
  });

  it('leaves other tasks untouched', () => {
    const other = todo({ id: 't2', estimatedMinutes: 45 });
    expect(withEstimatedMinutes([other], 'missing', 10)).toEqual([other]);
  });
});
