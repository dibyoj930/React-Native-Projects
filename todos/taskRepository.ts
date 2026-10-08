/**
 * Task persistence and export helpers (separates storage from UI/orchestration).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { migrateTodos, TODOS_STORAGE_KEY, type Todo } from './model';
import { completedCount } from './taskSelectors';
import type { MissionGoal, ProductivitySnapshot } from '../productivity';

export async function loadTodos(): Promise<Todo[]> {
  try {
    const saved = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      console.warn('[todos] stored value is not an array, ignoring it');
      return [];
    }
    const now = Date.now();
    return migrateTodos(parsed, now);
  } catch (error) {
    console.error('Failed to load todos:', error);
    return [];
  }
}

export async function saveTodos(todos: Todo[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(todos));
  } catch (error) {
    console.error('Failed to save todos:', error);
  }
}

export type ExportPayload = {
  exportedAt: string;
  totalTasks: number;
  completedTasks: number;
  tasks: Array<{
    id: string;
    text: string;
    completed: boolean;
    completedAt: number | null;
    createdAt: number | null;
    tags: string[];
  }>;
  statistics: {
    momentum: { total: number; band: string };
    streak: { current: number; longest: number; freezesRemaining: number };
    // `goal` is the ladder entry itself, not a count: the live export writes
    // `snapshot.mission.goal`, which is `{ focusMinutes, tasksCompleted }`.
    // Typing it `number` was the stale half of this file.
    mission: { goal: MissionGoal; complete: boolean; progress: number };
    today: { day: string; focusedSeconds: number; tasksCompleted: number };
    daysTracked: number;
  };
};

/**
 * The export body, shared by whatever triggers an export.
 *
 * The shape is pinned to what the app has always written: id, text, completed,
 * completedAt, createdAt, tags. `notes` and `dueDate` are deliberately absent —
 * the live export never sent them, so adding them here would silently change the
 * file users receive. (The old draft of this file included them; it was wrong.)
 *
 * Everything under `statistics` is recomputed from the snapshot, never a stored
 * count, so an export explains the user's own history rather than just listing
 * tasks.
 */
export function buildExportPayload(todos: Todo[], snapshot: ProductivitySnapshot): ExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    totalTasks: todos.length,
    completedTasks: completedCount(todos),
    tasks: todos.map((todo) => ({
      id: todo.id,
      text: todo.text,
      completed: todo.completed,
      // Null rather than a guessed value: a task that predates these fields
      // genuinely has no known completion time, and an invented one would be
      // indistinguishable from a real one in the export.
      completedAt: todo.completedAt ?? null,
      createdAt: todo.createdAt ?? null,
      tags: todo.tags ?? [],
    })),
    statistics: {
      momentum: {
        total: snapshot.momentum.total,
        band: snapshot.momentum.band,
      },
      streak: {
        current: snapshot.streak.current,
        longest: snapshot.streak.longest,
        freezesRemaining: snapshot.streak.freezesRemaining,
      },
      mission: {
        goal: snapshot.mission.goal,
        complete: snapshot.missionToday.complete,
        progress: snapshot.missionToday.ratio,
      },
      today: {
        day: snapshot.today,
        focusedSeconds: snapshot.todayRollup?.focusedSeconds ?? 0,
        tasksCompleted: snapshot.todayRollup?.tasksCompleted ?? 0,
      },
      daysTracked: snapshot.rollups.length,
    },
  };
}

export function exportFilename(payload: ExportPayload): string {
  return `todos-${payload.exportedAt.slice(0, 10)}.json`;
}
