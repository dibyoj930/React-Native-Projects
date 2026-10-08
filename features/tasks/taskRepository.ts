/**
 * Task persistence and export helpers (separates storage from UI/orchestration).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { migrateTodos, TODOS_STORAGE_KEY, type Todo } from '../../todos/model';
import type { MissionGoal, ProductivitySnapshot } from '../../productivity';

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
    notes?: string | null;
    dueDate?: string | null;
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

export function buildExportPayload(todos: Todo[], snapshot: ProductivitySnapshot): ExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    totalTasks: todos.length,
    completedTasks: todos.filter((todo) => todo.completed).length,
    tasks: todos.map((todo) => ({
      id: todo.id,
      text: todo.text,
      completed: todo.completed,
      completedAt: todo.completedAt ?? null,
      createdAt: todo.createdAt ?? null,
      tags: todo.tags ?? [],
      notes: todo.notes ?? null,
      dueDate: todo.dueDate ?? null,
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
