/**
 * Tag vocabulary and colour derivation.
 *
 * Extracted from `WelcomeComponent.tsx` for the same reason as `todos/model.ts`:
 * the task row renders tag chips and needed this logic, and duplicating the map
 * would create a second colour table that silently diverges from the first — the
 * exact failure the old `TAG_COLORS` / `getTagColor` lookup is still remembered
 * for.
 *
 * Two older mistakes are worth keeping in view, because both are ways this
 * vocabulary went wrong while looking correct:
 *
 *  - The chips once sat above the task list, styled like a filter, over an
 *    unfiltered `data={todos}`. All they ever did was supply the default tag for
 *    the next task. They now live where the choice applies: the add/edit sheet,
 *    and the tag screen a task is created from.
 *  - Every tag is listed here whether or not anything uses it. A tag with
 *    nothing behind it opens an empty screen whose `+` creates its first task —
 *    the only way a task can come to carry one. Pruning the vocabulary because
 *    it looked unused would have made it impossible to add.
 *
 * Colours are raw hex rather than theme tokens because each tag is a distinct
 * hue, not a lightness of one colour, so there is no light/dark pair to derive.
 * `textOnAccent` exists so the yellows, which are the only accents light enough
 * to need dark text, stay readable against a filled chip.
 */

import type { Theme } from '../theme/theme';

export const AVAILABLE_TAGS = [
  { label: '#architecture', accent: '#AF52DE' },
  { label: '#coding', accent: '#0A84FF' },
  { label: '#travel', accent: '#FF9F0A' },
  { label: '#practice', accent: '#30D158' },
  { label: '#gym', accent: '#FF375F' },
  { label: '#health', accent: '#64D2FF' },
  { label: '#study', accent: '#BF5AF2' },
  { label: '#blog', accent: '#FFD60A' },
] as const;

const TAG_ACCENTS: Record<string, string> = AVAILABLE_TAGS.reduce(
  (accents, tag) => {
    accents[tag.label] = tag.accent;
    return accents;
  },
  {} as Record<string, string>,
);

export const accentFor = (tag: string): string => TAG_ACCENTS[tag] ?? '#007AFF';

/** Same hex as `accent` at ~12% opacity, for tinted chip backgrounds. */
export const tintOf = (accent: string): string => `${accent}1F`;

/** WCAG relative luminance of a 6-digit hex colour. */
const luminanceOf = (hex: string): number => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const packed = parseInt(match[1], 16);
  // Bitwise shifts are how a packed 24-bit integer is taken apart; there is no
  // arithmetic expression that reads better here.
  // eslint-disable-next-line no-bitwise
  const linear = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map(
    (raw) => {
      const channel = raw / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    },
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

/**
 * Picks a readable text colour for a filled chip. Bright accents (the yellows)
 * need dark text; the rest read better in white.
 */
export const textOnAccent = (accent: string, mode: Theme['mode']): string =>
  luminanceOf(accent) > 0.45
    ? mode === 'dark'
      ? '#000000'
      : '#11181C'
    : '#FFFFFF';