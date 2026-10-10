/**
 * Design tokens for the app.
 *
 * Every colour the UI uses lives here — light and dark variants of the same
 * token set. Components must not hardcode hex values; read them from a theme so
 * a single source of truth drives both appearances.
 */

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  /** Screen background. */
  background: string;
  /** Raised surface: todo rows, cards. */
  surface: string;
  /** De-emphasised surface behind `surface` content. */
  surfaceMuted: string;
  /** Input / control borders. */
  border: string;
  /** Horizontal section separators. */
  divider: string;
  /** Primary body text. */
  text: string;
  /** Secondary text: timers, counts, placeholders. */
  textMuted: string;
  /** Text for completed or unavailable content. */
  textDisabled: string;
  /** Accent used by add/start buttons and action links. */
  primary: string;
  /** Text/icon colour that sits on top of `primary`. */
  primaryText: string;
  /** Destructive actions. */
  danger: string;
  /** Notification-permission banner surface. */
  warningSurface: string;
  warningBorder: string;
  warningText: string;
  /** Unfilled portion of the progress bar. */
  progressTrack: string;
  /** Positive focus fill in the recent-focus chart. */
  focusBar: string;
  /** Resting (unopened) bar in the recent-focus chart. */
  focusBarIdle: string;
  /** Task-count tip above an opened focus bar. */
  focusTip: string;
};

export type Theme = {
  mode: ThemeMode;
  colors: ThemeColors;
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    surfaceMuted: '#EBEBEB',
    border: '#DDDDDD',
    divider: '#ECECEC',
    text: '#11181C',
    textMuted: '#666666',
    textDisabled: '#999999',
    primary: '#007AFF',
    primaryText: '#FFFFFF',
    danger: '#FF3B30',
    warningSurface: '#FFF4E5',
    warningBorder: '#FFD8A8',
    warningText: '#8A5A00',
    progressTrack: '#E0E0E0',
    focusBar: '#34C759',
    focusBarIdle: '#CBEBD5',
    focusTip: '#FF9500',
  },
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#000000',
    surface: '#1C1C1E',
    surfaceMuted: '#2C2C2E',
    border: '#3A3A3C',
    divider: '#2C2C2E',
    text: '#F2F2F7',
    textMuted: '#9E9EA7',
    textDisabled: '#6E6E73',
    primary: '#0A84FF',
    primaryText: '#FFFFFF',
    danger: '#FF453A',
    warningSurface: '#2A2118',
    warningBorder: '#5A4526',
    warningText: '#FFB84D',
    progressTrack: '#3A3A3C',
    focusBar: '#30D158',
    focusBarIdle: '#1F4A2C',
    focusTip: '#FF9F0A',
  },
};
