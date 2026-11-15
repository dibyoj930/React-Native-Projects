/**
 * The next-task card and its model.
 *
 * Two halves, both presentational. `buildNextTaskViewModel` turns a selection
 * into words — the reason chip, the planned window, whether to show a countdown
 * or a button — and the card paints that model and reports one tap. Neither
 * decides *which* task; that is `selectNextTask`, tested next to itself.
 */

import React from 'react';

import { NextTaskCard, type NextTaskCardProps } from '../../components/NextTaskCard';
import { buildNextTaskViewModel } from '../../hooks/useProductivityView';
import { selectNextTask } from '../../todos/nextTask';
import type { Todo } from '../../todos/model';
import type { DayPlan } from '../../replan/types';
import { formatClock } from '../../replan/explain';
import { byLabel, labels, press, visibleText, withRendered } from '../support/render';

const TODAY = '2026-05-10';
const T0 = new Date(2026, 4, 10, 9, 0, 0, 0).getTime();
const MINUTE = 60_000;

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    text: `Task ${overrides.id}`,
    completed: false,
    tags: [],
    createdAt: 1,
    ...overrides,
  };
}

function props(overrides: Partial<NextTaskCardProps> = {}): NextTaskCardProps {
  return {
    model: {
      state: 'task',
      id: 'a',
      title: 'Write the design doc',
      reason: 'Due today',
      plannedLabel: '9:00 AM – 9:25 AM',
      isNow: false,
      isRunning: false,
      timerLabel: '00:00:00',
    },
    onStartFocus: jest.fn(),
    onOpenTasks: jest.fn(),
    onAddTask: jest.fn(),
    ...overrides,
  };
}

describe('buildNextTaskViewModel', () => {
  it('distinguishes an empty list from an all-done one', () => {
    expect(buildNextTaskViewModel({ selection: null, todos: [], today: TODAY })).toEqual({
      state: 'empty',
    });
    expect(
      buildNextTaskViewModel({
        selection: null,
        todos: [todo({ id: 'a', completed: true })],
        today: TODAY,
      }),
    ).toEqual({ state: 'allComplete', total: 1 });
  });

  it('labels a scheduled window and marks it current', () => {
    const plan: DayPlan = {
      dayKey: TODAY,
      approvedAt: T0,
      signature: 'sig',
      placements: [{ taskId: 'a', start: T0, end: T0 + 25 * MINUTE }],
    };
    const todos = [todo({ id: 'a', text: 'Deep work', dueDate: TODAY })];
    const selection = selectNextTask({ todos, today: TODAY, plan, now: T0 + MINUTE });

    const model = buildNextTaskViewModel({ selection, todos, today: TODAY });
    expect(model).toMatchObject({
      state: 'task',
      id: 'a',
      title: 'Deep work',
      isNow: true,
      reason: 'Due today',
      plannedLabel: `${formatClock(T0)} – ${formatClock(T0 + 25 * MINUTE)}`,
    });
  });

  it('reports overdue and undated tasks in the list fallback', () => {
    const todos = [todo({ id: 'a', dueDate: '2026-05-01' })];
    const overdue = selectNextTask({ todos, today: TODAY, plan: null, now: T0 });
    expect(buildNextTaskViewModel({ selection: overdue, todos, today: TODAY })).toMatchObject({
      reason: 'Overdue',
      plannedLabel: null,
    });

    const undated = [todo({ id: 'b' })];
    const next = selectNextTask({ todos: undated, today: TODAY, plan: null, now: T0 });
    expect(buildNextTaskViewModel({ selection: next, todos: undated, today: TODAY })).toMatchObject({
      reason: 'No date',
    });
  });

  it('attaches the live timer readout when the controller supplies one', () => {
    const todos = [todo({ id: 'a' })];
    const selection = selectNextTask({ todos, today: TODAY, plan: null, now: T0 });
    const model = buildNextTaskViewModel({
      selection,
      todos,
      today: TODAY,
      timer: { running: true, label: '24:12' },
    });
    expect(model).toMatchObject({ isRunning: true, timerLabel: '24:12' });
  });
});

describe('NextTaskCard', () => {
  it('names the task, the reason and the window, and wires Start focus', async () => {
    const onStartFocus = jest.fn();
    await withRendered(
      <NextTaskCard {...props({ onStartFocus })} />,
      async (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('Write the design doc');
        expect(text).toContain('Due today');
        // The sentence is two Text children, so the join splits it across lines.
        expect(text).toContain('Planned');
        expect(text).toContain('9:00 AM – 9:25 AM');
        expect(labels(renderer)).toContain('Start focus');

        await press(renderer, 'Start focus');
        expect(onStartFocus).toHaveBeenCalledWith('a');
      },
    );
  });

  it('shows the countdown instead of a button while the task is in flight', async () => {
    const onStartFocus = jest.fn();
    await withRendered(
      <NextTaskCard
        {...props({
          onStartFocus,
          model: {
            state: 'task',
            id: 'a',
            title: 'Write the design doc',
            reason: 'Due today',
            plannedLabel: null,
            isNow: true,
            isRunning: true,
            timerLabel: '24:12',
          },
        })}
      />,
      async (renderer) => {
        const text = visibleText(renderer);
        expect(text).toContain('Happening now');
        expect(text).toContain('Focusing');
        expect(text).toContain('24:12');
        // No second way to start a timer while one is already running.
        expect(labels(renderer)).not.toContain('Start focus');

        const timer = byLabel(renderer, 'Focus timer running');
        expect(timer.props.accessibilityRole).toBe('timer');
      },
    );
  });

  it('congratulates an all-done list and offers the next step', async () => {
    const onAddTask = jest.fn();
    const onOpenTasks = jest.fn();
    await withRendered(
      <NextTaskCard
        {...props({
          onAddTask,
          onOpenTasks,
          model: { state: 'allComplete', total: 3 },
        })}
      />,
      async (renderer) => {
        expect(visibleText(renderer)).toContain('All 3 tasks are done');
        expect(labels(renderer)).toContain('Add another task');
        expect(labels(renderer)).toContain('See all tasks');
        expect(labels(renderer)).not.toContain('Start focus');

        await press(renderer, 'See all tasks');
        expect(onOpenTasks).toHaveBeenCalledTimes(1);
        await press(renderer, 'Add another task');
        expect(onAddTask).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('invites a first task on an empty list', async () => {
    const onAddTask = jest.fn();
    await withRendered(
      <NextTaskCard {...props({ onAddTask, model: { state: 'empty' } })} />,
      async (renderer) => {
        expect(visibleText(renderer)).toContain('Add your first task');
        expect(labels(renderer)).toContain('Add your first task');
        await press(renderer, 'Add your first task');
        expect(onAddTask).toHaveBeenCalledTimes(1);
      },
    );
  });
});
