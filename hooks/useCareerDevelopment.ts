/**
 * The career-side controller for task and focus links.
 *
 * `useCareer` owns the career document. `useTaskScreen` owns the task list and
 * focus log. Neither may import the other's state, so this hook is the one place
 * that holds all three and memoises the derived practice model for the screens.
 *
 * Nothing is written here. A career record still has no field for a task count
 * or a focus total; those are read from the two stores that own them.
 */

import { useMemo } from 'react';

import { useCareer } from '../career/CareerProvider';
import {
  buildCareerDevelopment,
  type CareerDevelopment,
} from '../career/linkage';
import type { FocusSession } from '../productivity/types';
import type { Todo } from '../todos/model';

export type CareerDevelopmentInput = {
  tasks: readonly Todo[];
  sessions: readonly FocusSession[];
};

export function useCareerDevelopment({
  tasks,
  sessions,
}: CareerDevelopmentInput): CareerDevelopment {
  const { doc } = useCareer();

  return useMemo(
    () => buildCareerDevelopment(doc, tasks, sessions),
    [doc, tasks, sessions],
  );
}
