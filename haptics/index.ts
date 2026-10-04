import { Vibration } from 'react-native';

/**
 * Haptic feedback for app events.
 *
 * Two paths, in order of preference:
 *
 *  1. `react-native-haptic-feedback` — real CoreHaptics/Taptic Engine feedback.
 *     It is loaded lazily inside a try/catch because it resolves its native
 *     TurboModule at import time; an unlinked module throws during module
 *     evaluation and would take every consumer down with it.
 *
 *  2. React Native's built-in `Vibration` API — needs no native linking at all,
 *     so it works even when the pods for (1) have not been installed.
 *
 * Both are silent no-ops when the device/OS has feedback disabled, so callers
 * never need to check anything.
 */

export type HapticEvent =
  | 'taskCompleted'
  | 'taskUncompleted'
  | 'taskAdded'
  | 'taskDeleted';

/** Subset of the library's haptic types that this app uses. */
type HapticType =
  | 'selection'
  | 'impactLight'
  | 'notificationSuccess';

type HapticModule = {
  default?: { trigger?: (type: string, options?: object) => void };
  trigger?: (type: string, options?: object) => void;
};

const HAPTIC_BY_EVENT: Record<HapticEvent, HapticType> = {
  taskCompleted: 'notificationSuccess',
  taskUncompleted: 'impactLight',
  taskAdded: 'selection',
  taskDeleted: 'impactLight',
};

/**
 * Vibration patterns in ms, used when the native module is unavailable.
 * `Vibration.vibrate` is a no-op on iOS Simulator, which is expected.
 */
const FALLBACK_PATTERN: Record<HapticEvent, number | number[]> = {
  taskAdded: 10,
  taskUncompleted: 20,
  taskDeleted: 20,
  // Two short pulses, mirroring a "success" notification.
  taskCompleted: [0, 30, 70, 30],
};

const OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

let cachedModule: HapticModule | null | undefined;
let warned = false;

function loadNativeModule(): HapticModule | null {
  // `undefined` means "not tried yet", `null` means "unavailable".
  if (cachedModule !== undefined) return cachedModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedModule = require('react-native-haptic-feedback') as HapticModule;
    if (!warned) {
      warned = true;
      console.log('[haptics] using native haptic feedback module');
    }
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * Fire haptic feedback for an app event. Never throws.
 */
export function triggerHaptic(event: HapticEvent): void {
  const lib = loadNativeModule();
  const api = lib?.default ?? lib;
  const trigger = api?.trigger ?? lib?.trigger;

  if (typeof trigger === 'function') {
    try {
      trigger(HAPTIC_BY_EVENT[event], OPTIONS);
      return;
    } catch {
      // Native call failed at runtime — fall through to vibration.
    }
  }

  try {
    Vibration.vibrate(FALLBACK_PATTERN[event]);
  } catch {
    // Nothing else to try; feedback is best-effort.
  }
}
