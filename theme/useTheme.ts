/**
 * Re-exported from `ThemeProvider` so existing components keep importing
 * `useTheme` from here while the selection logic lives in one place.
 */
export { useTheme, useThemeControls, ThemeProvider } from './ThemeProvider';
export type { ThemePreference } from './ThemeProvider';
