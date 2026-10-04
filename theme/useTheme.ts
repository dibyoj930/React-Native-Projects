import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './theme';

/**
 * Resolves the active theme from the system colour scheme.
 *
 * Returns one of two module-level constant objects, so the reference is stable
 * across renders and safe to use as a `useMemo` dependency for style creation.
 */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
