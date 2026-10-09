/**
 * The pure task selectors: the filtering, search and grouping behind the list.
 *
 * No renderer and no provider — these are plain functions over plain data, which
 * is the point of keeping them out of the screen. The cases that matter are the
 * boundaries: what "overdue" does to a completed task, whether two tags union or
 * intersect, and whether an empty group is dropped or left as a bare heading.
 */

import {
  completedCount,
  filterByTag,
  filterByTags,
  findTodo,
  groupTodos,
  isOverdue,
  openCount,
  searchTodos,
  tagsInUse,
} from '../../todos/taskSelectors';
import type { Todo } from '../../todos/model';

const TODAY = '2026-05-10';

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    text: `Task ${overrides.id}`,
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

describe('taskSelectors — counts and lookup', () => {
  const list = [todo({ id: 'a' }), todo({ id: 'b', completed: true }), todo({ id: 'c' })];

  it('counts the open and the completed separately', () => {
    expect(openCount(list)).toBe(2);
    expect(completedCount(list)).toBe(1);
  });

  it('finds by id, and returns undefined for an unknown one', () => {
    expect(findTodo(list, 'b')?.id).toBe('b');
    expect(findTodo(list, 'nope')).toBeUndefined();
  });
});

describe('taskSelectors — filtering by tag', () => {
  const tagged = [
    todo({ id: 'a', tags: ['#coding'] }),
    todo({ id: 'b', tags: ['#coding', '#gym'] }),
    todo({ id: 'c', tags: ['#gym'] }),
    todo({ id: 'd' }),
  ];

  it('returns everyone when no tag is given', () => {
    expect(filterByTag(tagged, undefined).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps only the tasks carrying the tag', () => {
    expect(filterByTag(tagged, '#gym').map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('copies when there is nothing to filter, so a caller cannot mutate the list', () => {
    const result = filterByTags(tagged, []);
    expect(result).toEqual(tagged);
    expect(result).not.toBe(tagged);
  });

  it('unions several tags rather than intersecting them', () => {
    // #coding alone matches a and b; #gym adds c, and the task with neither is
    // still excluded.
    expect(filterByTags(tagged, ['#coding', '#gym']).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('taskSelectors — search', () => {
  const list = [
    todo({ id: 'a', text: 'Buy milk' }),
    todo({ id: 'b', text: 'Call the bank', notes: 'ask for Priya' }),
    todo({ id: 'c', text: 'Read' }),
  ];

  it('matches titles case-insensitively', () => {
    expect(searchTodos(list, 'MILK').map((t) => t.id)).toEqual(['a']);
  });

  it('matches notes too', () => {
    expect(searchTodos(list, 'priya').map((t) => t.id)).toEqual(['b']);
  });

  it('treats a blank query as no filter', () => {
    expect(searchTodos(list, '   ')).toEqual(list);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchTodos(list, 'xyzzy')).toEqual([]);
  });
});

describe('taskSelectors — tags in use', () => {
  it('lists each tag once, in first-seen order', () => {
    const list = [
      todo({ id: 'a', tags: ['#gym', '#coding'] }),
      todo({ id: 'b', tags: ['#coding'] }),
      todo({ id: 'c' }),
    ];
    expect(tagsInUse(list)).toEqual(['#gym', '#coding']);
  });

  it('is empty when nothing is tagged', () => {
    expect(tagsInUse([todo({ id: 'a' })])).toEqual([]);
  });
});

describe('taskSelectors — overdue', () => {
  it('is true for an open task whose date is before today', () => {
    expect(isOverdue(todo({ id: 'a', dueDate: '2026-05-09' }), TODAY)).toBe(true);
  });

  it('is false for today, for the future, and for no date', () => {
    expect(isOverdue(todo({ id: 'a', dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(todo({ id: 'a', dueDate: '2026-05-11' }), TODAY)).toBe(false);
    expect(isOverdue(todo({ id: 'a' }), TODAY)).toBe(false);
  });

  it('is false for a completed task, however old its date', () => {
    expect(isOverdue(todo({ id: 'a', dueDate: '2020-01-01', completed: true }), TODAY)).toBe(false);
  });
});

describe('taskSelectors — grouping', () => {
  const list = [
    todo({ id: 'late', dueDate: '2026-05-01' }),
    todo({ id: 'now', dueDate: TODAY }),
    todo({ id: 'soon', dueDate: '2026-05-20' }),
    todo({ id: 'someday' }),
    todo({ id: 'done', completed: true, dueDate: '2026-05-01' }),
  ];

  it('buckets by due date in urgency order, completed last', () => {
    const groups = groupTodos(list, TODAY);
    expect(groups.map((g) => g.key)).toEqual([
      'overdue',
      'today',
      'upcoming',
      'undated',
      'completed',
    ]);
    expect(groups.map((g) => g.title)).toEqual([
      'Overdue',
      'Today',
      'Upcoming',
      'No date',
      'Completed',
    ]);
  });

  it('puts each task in its group, keeping list order inside it', () => {
    const groups = groupTodos(list, TODAY);
    expect(groups.find((g) => g.key === 'overdue')?.data.map((t) => t.id)).toEqual(['late']);
    expect(groups.find((g) => g.key === 'completed')?.data.map((t) => t.id)).toEqual(['done']);
  });

  it('files a completed task as completed even when its date has passed', () => {
    const groups = groupTodos(list, TODAY);
    expect(groups.find((g) => g.key === 'overdue')?.data.map((t) => t.id)).not.toContain('done');
  });

  it('drops empty groups rather than heading nothing', () => {
    expect(groupTodos([todo({ id: 'a' })], TODAY).map((g) => g.key)).toEqual(['undated']);
  });

  it('returns no groups for no tasks', () => {
    expect(groupTodos([], TODAY)).toEqual([]);
  });
});
