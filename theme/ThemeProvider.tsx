import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { darkTheme, lightTheme, type Theme, type ThemeMode } from './theme';

/**
 * Theme selection with an in-app override.
 *
 * `system` follows the OS and is the default. An explicit `light` or `dark`
 * choice wins over the OS, which is what someone actually wants when the phone
 * switches to dark at sunset but their eyes are not ready for it.
 *
 * The override is persisted, so the choice survives a relaunch — otherwise it
 * would silently reset and look broken.
 */

export type ThemePreference = ThemeMode | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  /** The appearance actually in effect, after resolving `system`. */
  mode: ThemeMode;
  setPreference: (next: ThemePreference) => void;
};

const STORAGE_KEY = '@theme/preference';

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        // An unrecognised stored value is ignored rather than trusted, so a
        // future version's preference cannot break this one.
        if (active && isPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {
        // A failed read just leaves the default. Not worth surfacing.
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Losing the preference is survivable; failing to switch theme is not,
      // so the state update above is not rolled back.
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const mode: ThemeMode =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return {
      theme: mode === 'dark' ? darkTheme : lightTheme,
      preference,
      mode,
      setPreference,
    };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The active theme.
 *
 * Falls back to reading the system scheme directly when no provider is mounted,
 * so a component rendered outside the tree still gets a usable theme instead of
 * throwing. Inside the app the provider is always present.
 */
export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  if (context) return context.theme;
  return systemScheme === 'dark' ? darkTheme : lightTheme;
}

/** Theme plus the controls for changing it. Requires a `ThemeProvider`. */
export function useThemeControls(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeControls must be used inside a <ThemeProvider>');
  }
  return context;
}
