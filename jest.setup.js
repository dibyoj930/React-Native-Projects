/**
 * Native module mocks for the Jest environment.
 *
 * Only modules that genuinely need a native binary are mocked. Everything in
 * `productivity/` is pure and unmocked on purpose — if a domain test ever needed
 * a mock to run, that would mean the architecture had regressed.
 */

// Pinned before any test module loads, which is the only point at which it
// reliably takes effect: `import` declarations are hoisted above any statement in
// the importing file, so setting TZ inside a test file would run *after* the
// module under test had already been evaluated.
//
// Asia/Kolkata is UTC+5:30 with no DST. A half-hour offset is deliberately the
// hard case: the whole reason `productivity/dateKey.ts` avoids `toISOString()` is
// that UTC conversion shifts the calendar day, and integer-hour zones cannot
// expose a boundary error that a half-hour one makes obvious.
process.env.TZ = 'Asia/Kolkata';

require('react-native-gesture-handler/jestSetup');

// `ReanimatedSwipeable` is a native-animated component built on Reanimated 4,
// which in turn delegates to react-native-worklets and resolves a native
// binding at import time. Neither can load under Jest, and Reanimated's own
// shipped mock still trips over the worklets binding — so the swap is done at
// the component boundary instead.
//
// The stand-in renders its children, which is what the smoke test actually
// cares about: that the whole tree composes and mounts.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Swipeable = ({ children, ...props }) =>
    React.createElement(View, props, children);
  return { __esModule: true, default: Swipeable, Swipeable };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  // In-memory, per-test. A module-level store would leak between tests, which is
  // exactly the kind of cross-test coupling that makes a suite untrustworthy.
  let store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      setItem: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key) => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store = new Map();
      }),
      getAllKeys: jest.fn(async () => [...store.keys()]),
      multiGet: jest.fn(async (keys) =>
        keys.map((key) => [key, store.has(key) ? store.get(key) : null]),
      ),
      multiSet: jest.fn(async (pairs) => {
        pairs.forEach(([key, value]) => store.set(key, value));
      }),
    },
  };
});

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => 'default'),
    createTriggerNotification: jest.fn(async () => 'trigger'),
    cancelTriggerNotification: jest.fn(async () => undefined),
    cancelNotification: jest.fn(async () => undefined),
    displayNotification: jest.fn(async () => 'displayed'),
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    getNotificationSettings: jest.fn(async () => ({ authorizationStatus: 1 })),
    onForegroundEvent: jest.fn(() => () => undefined),
    onBackgroundEvent: jest.fn(async () => undefined),
    registerBackgroundHandler: jest.fn(async () => undefined),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidVisibility: { VISIBLE: 1 },
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
  },
  EventType: { DELIVERED: 4, PRESS: 1, CANCELLED: 5 },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
  TimestampTrigger: {
    TriggerType: { TIMESTAMP: 0 },
    type: 0,
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 47, right: 0, bottom: 34, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    __esModule: true,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});

// Haptics are optional at runtime by design; keep that true in tests too.
jest.mock('./haptics', () => ({
  triggerHaptic: jest.fn(),
}));
