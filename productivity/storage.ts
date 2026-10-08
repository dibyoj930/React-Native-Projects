import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialProductivityState, type ProductivityState } from './reducer';
import type { FocusSession, MomentumMemory, StreakLedger } from './types';

/**
 * Persistence for the productivity layer.
 *
 * This is the *only* file in `productivity/` allowed to touch AsyncStorage.
 * Keeping the boundary this narrow is what lets every scorer be tested without
 * a storage mock.
 *
 * Separate key from `todos` on purpose. The task list and the focus log are
 * independent stores that happen to be read together; folding them into one
 * document would mean a corrupt session log could take the user's tasks with it.
 */

const STORAGE_KEY = '@productivity/v1';

type PersistedShape = {
  sessions: FocusSession[];
  ledger: StreakLedger;
  memory: MomentumMemory;
};

export type HydratedData = Pick<ProductivityState, 'sessions' | 'ledger' | 'memory'>;

/**
 * Reads persisted data, falling back to a clean slate on anything unexpected.
 *
 * Never throws. A storage read must not be able to prevent the app from
 * starting — the worst case of losing history is recoverable, the worst case of
 * failing to launch is not.
 */
export async function loadProductivity(): Promise<HydratedData> {
  const empty: HydratedData = {
    sessions: [],
    ledger: { ...initialProductivityState.ledger },
    memory: { ...initialProductivityState.memory },
  };

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[productivity] stored value is not an object, ignoring it');
      return empty;
    }

    const candidate = parsed as Partial<PersistedShape>;
    return {
      sessions: sanitizeSessions(candidate.sessions),
      ledger: sanitizeLedger(candidate.ledger),
      memory: sanitizeMemory(candidate.memory),
    };
  } catch (error) {
    console.warn('[productivity] could not read stored data, starting fresh', error);
    return empty;
  }
}

/**
 * Writes the persistable slice. Open sessions are intentionally dropped: an
 * in-flight focus session that the app killed did not happen, and recording it
 * would credit focus the user never actually completed.
 */
export async function saveProductivity(state: ProductivityState): Promise<void> {
  const payload: PersistedShape = {
    sessions: state.sessions,
    ledger: state.ledger,
    memory: state.memory,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('[productivity] could not save:', error);
  }
}

/**
 * Wipes the focus log and the ledger.
 *
 * Not currently called from the UI — there is no reset control yet. It lives
 * here rather than being written when one is added, because a data-deletion
 * path that has never been executed is a data-deletion path that does not work.
 *
 * The tasks themselves live under a separate key and are untouched: clearing
 * productivity history should not delete anyone's to-do list.
 */
export async function clearProductivity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[productivity] could not clear:', error);
  }
}

/**
 * Keeps only entries that are shaped like a session.
 *
 * Field-by-field rather than trusting the stored shape: this data outlives app
 * versions, and one malformed entry must not be able to poison every downstream
 * calculation with `NaN`.
 */
function sanitizeSessions(value: unknown): FocusSession[] {
  if (!Array.isArray(value)) return [];

  const valid: FocusSession[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<FocusSession>;

    if (typeof candidate.id !== 'string') continue;
    if (typeof candidate.startedAt !== 'number' || !Number.isFinite(candidate.startedAt)) continue;
    if (typeof candidate.endedAt !== 'number' || !Number.isFinite(candidate.endedAt)) continue;
    if (
      typeof candidate.focusedSeconds !== 'number' ||
      !Number.isFinite(candidate.focusedSeconds) ||
      candidate.focusedSeconds < 0
    ) {
      continue;
    }
    if (
      candidate.status !== 'completed' &&
      candidate.status !== 'finished' &&
      candidate.status !== 'stopped'
    ) {
      continue;
    }

    valid.push({
      id: candidate.id,
      taskId: typeof candidate.taskId === 'string' ? candidate.taskId : null,
      startedAt: candidate.startedAt,
      endedAt: candidate.endedAt,
      focusedSeconds: candidate.focusedSeconds,
      status: candidate.status,
    });
  }
  return valid;
}

function sanitizeLedger(value: unknown): StreakLedger {
  const candidate = (value ?? {}) as Partial<StreakLedger>;
  const earned = toCount(candidate.freezesEarned);
  const spent = toCount(candidate.freezesSpent);
  // Spending more than was ever granted means a corrupt or hand-edited value.
  // Clamping to earned keeps `freezesRemaining` non-negative.
  return { freezesEarned: earned, freezesSpent: Math.min(spent, earned) };
}

function sanitizeMemory(value: unknown): MomentumMemory {
  const candidate = (value ?? {}) as Partial<MomentumMemory>;
  const lastEventAt =
    typeof candidate.lastEventAt === 'number' && Number.isFinite(candidate.lastEventAt)
      ? candidate.lastEventAt
      : null;
  const previousDayScore =
    typeof candidate.previousDayScore === 'number' && Number.isFinite(candidate.previousDayScore)
      ? Math.min(100, Math.max(0, candidate.previousDayScore))
      : 0;
  return { lastEventAt, previousDayScore };
}

function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
