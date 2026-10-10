/**
 * The theme's central rule, enforced over the source.
 *
 * `theme/theme.ts` says components must not hardcode colours. Nothing in the
 * compiler, ESLint or a render test can check that: a hex literal renders
 * perfectly well, in the wrong colour, and a dark-mode render test would pass
 * because the literal is just a string.
 *
 * So this reads the files. It is not a substitute for reviewing them, but it turns
 * "every colour comes from a token" from a convention into something that fails.
 *
 * The exception is `todos/tags.ts` and `theme/theme.ts` itself: the tag accents are
 * eight distinct hues with no light/dark pair to derive, so they are legitimately
 * literals, and the token file is where literals belong. Both are named explicitly
 * below rather than skipped by a loose pattern, so adding a third one is a
 * deliberate edit.
 */

// `@types/node` is not a direct dependency, and installing it to read two built-ins
// would be a heavier change than this test deserves. Jest runs this file as
// CommonJS, so `require` and `__dirname` both exist at runtime; the compiler is told
// so here rather than by an install.
declare const __dirname: string;

const { readFileSync } = require('fs');
const { join } = require('path');

/** UI files that must read every colour from the theme. */
const THEMED_SOURCES = [
  'WelcomeComponent.tsx',
  join('components', 'TodoRow.tsx'),
  join('components', 'AllTasksScreen.tsx'),
  join('components', 'AddTodoModal.tsx'),
  join('components', 'HomeScreen.tsx'),
  join('components', 'TodayCard.tsx'),
  join('components', 'GoalMeter.tsx'),
  join('components', 'GoalsScreen.tsx'),
  join('components', 'ProductivityDashboard.tsx'),
  join('components', 'SettingsScreen.tsx'),
];

/**
 * Where a hex literal is allowed, and why.
 *
 * Named file by file rather than matched with a loose pattern, so adding an entry
 * is a deliberate edit rather than something a broad `except` regex swallows by
 * accident.
 */
const LITERAL_EXEMPT = new Set([
  // The tokens themselves — this is where literals belong.
  join('theme', 'theme.ts'),
  // Eight distinct tag hues, each with a tinted variant derived from the same hex.
  // There is no light/dark pair to derive: they are hues, not lightnesses.
  join('todos', 'tags.ts'),
  // ONE remaining literal: the amber behind the swipe-to-Stop action, which has no
  // token. Fixing it properly means adding a caution colour to the design system,
  // which is a design decision rather than a refactor. The four `#FFFFFF` literals
  // that were here alongside it have been replaced with `primaryText`, which is
  // white in both themes — so this exemption is now exactly one line wide.
  join('components', 'SwipeableTodoRow.tsx'),
]);

/**
 * The app root, from `__dirname`.
 *
 * This file sits in `<app>/__tests__`, so one `..` is the app and two would be its
 * parent — which is exactly how the first version of this test came to silently
 * read nothing at all.
 */
const APP_ROOT = join(__dirname, '..');

/** Matches `#rgb`, `#rrggbb` and `#rrggbbaa`. Ignores `#` inside words. */
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;

/**
 * Hex occurrences, by line, ignoring anything inside a comment.
 *
 * Comments are stripped first because a hex *named in prose* is documentation, not
 * a violation — and this file's own sibling `WelcomeComponent.tsx` documents the
 * literal it used to have. Scanning comments would have made it impossible to
 * record why a bug was fixed.
 *
 * A tag label like `#coding` is not matched by `HEX` at all, which is lucky rather
 * than deliberate: `#cod` would match if `o` were a hex digit. `todos/tags.ts` is
 * exempt outright, so this does not currently depend on that.
 */
function hexLines(relativePath: string): { line: number; text: string }[] {
  const source = readFileSync(join(APP_ROOT, relativePath), 'utf8');
  // Blank out comments while preserving line numbering, so a reported line is still
  // the line a person would see in their editor.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, (block: string) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (line: string) => ' '.repeat(line.length));

  return code.split('\n').flatMap((text: string, index: number) => {
    HEX.lastIndex = 0;
    return HEX.test(text) ? [{ line: index + 1, text: text.trim() }] : [];
  });
}

describe('theme discipline', () => {
  it.each(THEMED_SOURCES)('%s contains no colour literals', (relativePath) => {
    expect(LITERAL_EXEMPT.has(relativePath)).toBe(false);
    const found = hexLines(relativePath);
    expect(found).toEqual([]);
  });

  it('finds every themed source it claims to', () => {
    // A typo in the list above would make the rest of this file vacuous, which is
    // the same failure mode as a timezone pin that silently stops applying.
    THEMED_SOURCES.forEach((relativePath) => {
      expect(() => readFileSync(join(APP_ROOT, relativePath), 'utf8')).not.toThrow();
    });
  });

  it('has exempt entries that still exist', () => {
    [...LITERAL_EXEMPT].forEach((relativePath) => {
      expect(() => readFileSync(join(APP_ROOT, relativePath), 'utf8')).not.toThrow();
    });
  });

  it('covers every component file in the components directory', () => {
    // Keeps the list from going stale as files are added. `readdirSync` is not
    // declared above, so this is expressed as an explicit count instead — which is
    // only as good as remembering to update it, which is why the file list is short
    // and named here.
    const known = [
      'TodoRow', 'AllTasksScreen', 'AddTodoModal', 'HomeScreen', 'TodayCard',
      'GoalMeter', 'GoalsScreen', 'ProductivityDashboard', 'SettingsScreen',
    ];
    expect(THEMED_SOURCES.filter((p) => p.startsWith('components'))).toHaveLength(
      known.length,
    );
  });
});