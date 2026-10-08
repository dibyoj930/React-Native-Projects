/**
 * Test helpers for rendering a component in isolation.
 *
 * No `ThemeProvider` wrapper, which at first looks like an oversight. `useTheme`
 * reads its context and falls back to the system colour scheme when no provider is
 * mounted — it is written that way specifically so a component can render on its
 * own. Wrapping would also not have worked as a way to inject a theme:
 * `ThemeProvider` takes only `children`, so the obvious
 * `<ThemeProvider value={darkTheme}>` silently renders light and passes.
 *
 * Dark-mode coverage is not done here. What matters about theming is that
 * components hold no colours of their own, and `theme.test.ts` asserts that over
 * the source rather than over a rendered tree, which catches the mistake a render
 * test would miss.
 *
 * `react-test-renderer` rather than `@testing-library/react-native`, which is not
 * installed: it is already a declared devDependency alongside its own types, so
 * this needs no new package and no new framework.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

export type Rendered = ReactTestRenderer.ReactTestRenderer;

export async function render(ui: React.ReactElement): Promise<Rendered> {
  let renderer: Rendered | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(ui);
  });
  if (!renderer) throw new Error('renderer was never created');
  return renderer;
}

/** Renders, runs `body`, then unmounts — so every caller cannot leak a tree. */
export async function withRendered(
  ui: React.ReactElement,
  body: (renderer: Rendered) => void | Promise<void>,
): Promise<void> {
  const renderer = await render(ui);
  try {
    await body(renderer);
  } finally {
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  }
}

/** Re-renders the same tree with new props. */
export async function rerender(
  renderer: Rendered,
  ui: React.ReactElement,
): Promise<void> {
  await ReactTestRenderer.act(async () => {
    renderer.update(ui);
  });
}

/**
 * Every host element in the tree, flattened.
 *
 * `root.findAll` with `{ deepest: true }` misses nothing, but callers almost always
 * want the whole thing anyway, so this hides the flag.
 */
export function nodes(renderer: Rendered): ReactTestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(() => true);
}

/**
 * Only the host elements — the ones React Native actually renders to a `UIView`.
 *
 * This distinction is load-bearing and was the cause of a confusing first pass at
 * these tests. A single `<TouchableOpacity accessibilityLabel="X">` produces a
 * chain of nodes that all carry `accessibilityLabel: "X"`: the composite, its
 * wrapper views, and the host view. Matching on all of them reports "5 elements
 * labelled X" for one button. Composite props are conveniences; only host nodes are
 * what a user can perceive.
 */
export function hostNodes(renderer: Rendered): ReactTestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => typeof node.type === 'string');
}

/** Every string a `<Text>` in the tree is rendering, in document order. */
export function textContent(renderer: Rendered): string[] {
  return hostNodes(renderer)
    // `String(...)` rather than `=== 'Text'`: `node.type` is typed as `ElementType`,
    // and TypeScript refuses to narrow it against a literal that is not in the union.
    .filter((node) => String(node.type) === 'Text')
    .flatMap((node) => node.children.filter((c): c is string => typeof c === 'string'));
}

/** Everything readable, joined — handy for "does this screen say X at all". */
export function visibleText(renderer: Rendered): string {
  return textContent(renderer).join('\n');
}

/** Every accessibility label present, in order, deduplicated. */
export function labels(renderer: Rendered): string[] {
  const found = hostNodes(renderer)
    .map((node) => node.props?.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string');
  return [...new Set(found)];
}

/** The single host element with this accessibility label. Throws if absent or ambiguous. */
export function byLabel(
  renderer: Rendered,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const matches = hostNodes(renderer).filter(
    (node) => node.props?.accessibilityLabel === label,
  );
  if (matches.length === 0) {
    throw new Error(
      `no element labelled ${JSON.stringify(label)}; found: ${JSON.stringify(labels(renderer))}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(`${matches.length} elements labelled ${JSON.stringify(label)}`);
  }
  return matches[0];
}

/**
 * Invokes the press handler for the element carrying this accessibility label.
 *
 * Walks up from the host node because React Native does not put `onPress` on it:
 * `TouchableOpacity` keeps the handler on the composite and gives the host view
 * responder props instead. So the label identifies the element and the ancestry
 * finds the handler.
 */
export async function press(renderer: Rendered, label: string): Promise<void> {
  const host = byLabel(renderer, label);
  let cursor: ReactTestRenderer.ReactTestInstance | null = host;
  while (cursor) {
    if (typeof cursor.props?.onPress === 'function') {
      const { onPress } = cursor.props;
      await ReactTestRenderer.act(async () => {
        onPress();
      });
      return;
    }
    cursor = cursor.parent;
  }
  throw new Error(`element labelled ${JSON.stringify(label)} has no onPress anywhere above it`);
}