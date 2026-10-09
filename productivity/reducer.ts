import type { ActiveSession, FocusSession, MomentumMemory, StreakLedger } from './types';

/**
 * Productivity state and its transitions.
 *
 * Plain `useReducer` rather than a store library: the state is one flat object
 * with a handful of events, and every derived figure is recomputed from it on
 * read. A reducer keeps the transitions testable without rendering anything.
 */

export type ProductivityState = {
  /** Closed sessions, oldest first. */
  sessions: FocusSession[];
  /** Open sessions, keyed by task id. In memory only — never persisted. */
  active: Record<string, ActiveSession>;
  ledger: StreakLedger;
  memory: MomentumMemory;
  /** False until storage has been read. */
  hydrated: boolean;
};

/**
 * Upper bound on retained sessions.
 *
 * A year of steady use is roughly a thousand sessions, so this is generous
 * rather than tight. It exists because `sessions` is the one unbounded array in
 * the app, and an unbounded array in AsyncStorage eventually stops being a
 * feature. When the cap is hit the *oldest* sessions drop, which can only affect
 * the oldest daily rollups.
 */
export const MAX_RETAINED_SESSIONS = 10_000;

export const initialProductivityState: ProductivityState = {
  sessions: [],
  active: {},
  ledger: { freezesEarned: 0, freezesSpent: 0 },
  memory: { lastEventAt: null, previousDayScore: 0 },
  hydrated: false,
};

export type ProductivityAction =
  | {
      type: 'hydrated';
      sessions: FocusSession[];
      ledger: StreakLedger;
      memory: MomentumMemory;
    }
  | { type: 'startFocus'; taskId: string; session: ActiveSession }
  | { type: 'updateFocus'; taskId: string; session: ActiveSession }
  | { type: 'closeFocus'; taskId: string; session: FocusSession; at: number }
  | { type: 'noteEvent'; at: number }
  | { type: 'setLedger'; ledger: StreakLedger }
  | { type: 'setMemory'; memory: MomentumMemory }
  | { type: 'reset' };

export function productivityReducer(
  state: ProductivityState,
  action: ProductivityAction,
): ProductivityState {
  switch (action.type) {
    case 'hydrated':
      return {
        ...state,
        sessions: action.sessions,
        ledger: action.ledger,
        memory: action.memory,
        hydrated: true,
      };

    case 'startFocus':
      return {
        ...state,
        active: { ...state.active, [action.taskId]: action.session },
        // Starting counts as activity: without this, momentum would decay for
        // someone deep in a long session who has not yet closed it.
        memory: { ...state.memory, lastEventAt: action.session.startedAt },
      };

    case 'updateFocus':
      return {
        ...state,
        active: { ...state.active, [action.taskId]: action.session },
      };

    case 'closeFocus': {
      const remainingActive = { ...state.active };
      delete remainingActive[action.taskId];
      return {
        ...state,
        active: remainingActive,
        sessions: appendSession(state.sessions, action.session),
        memory: { ...state.memory, lastEventAt: action.at },
      };
    }

    case 'noteEvent':
      return { ...state, memory: { ...state.memory, lastEventAt: action.at } };

    case 'setLedger':
      return { ...state, ledger: action.ledger };

    case 'setMemory':
      return { ...state, memory: action.memory };

    case 'reset':
      // Wipes the log, ledger and memory but stays hydrated, so the save effect
      // persists the empty state rather than the provider trying to hydrate
      // again — a reset is a deliberate empty, not a fresh install.
      return { ...initialProductivityState, hydrated: true };

    default:
      return state;
  }
}

/**
 * Inserts a closed session in chronological order, replacing any existing entry
 * with the same id.
 *
 * The replacement is what stops a retried dispatch from double-counting a
 * session — with the focus time added twice, the day's total silently inflates
 * and no later recomputation can detect it.
 *
 * The log is kept sorted because closes genuinely arrive out of order: two
 * timers started in sequence will usually expire in sequence, but not always,
 * and a user can stop the earlier one last. Without an ordered insert, the
 * retention trim below would discard an arbitrary session rather than the
 * oldest one, quietly corrupting the earliest daily rollups.
 */
function appendSession(
  sessions: readonly FocusSession[],
  session: FocusSession,
): FocusSession[] {
  const withoutDuplicate = sessions.filter((existing) => existing.id !== session.id);

  // First session at or after this one — everything before it started earlier.
  let insertAt = withoutDuplicate.findIndex((existing) => existing.startedAt > session.startedAt);
  if (insertAt === -1) insertAt = withoutDuplicate.length;

  const next = [...withoutDuplicate];
  next.splice(insertAt, 0, session);

  return next.length > MAX_RETAINED_SESSIONS
    ? next.slice(next.length - MAX_RETAINED_SESSIONS)
    : next;
}
