/**
 * The recent-focus chart's tap-to-open.
 *
 * The bars are the dashboard's only interactive part. At rest every day shows a
 * pale bar and its time; opening one grows it back to green, wakes the orange
 * task tip and adds the task count. These pin what a finger can perceive — which
 * bar is marked selected, and what it then reads — not the pixels the animation
 * passes through on the way.
 */

import React from 'react';

import { ProductivityDashboard } from '../../components/ProductivityDashboard';
import { ProductivityProvider } from '../../productivity';
import {
  byLabel,
  press,
  visibleText,
  withRendered,
  type Rendered,
} from '../support/render';

function screen() {
  return (
    <ProductivityProvider>
      <ProductivityDashboard />
    </ProductivityProvider>
  );
}

/**
 * Every focus bar's accessibility label, in order — e.g. `10, 0m, 0 tasks`.
 *
 * A bar always ends its label with its task count, which is what separates it
 * from the streak tile and the hint sitting around it.
 */
function barLabels(renderer: Rendered): string[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props?.accessibilityLabel === 'string' &&
        / tasks?$/.test(node.props.accessibilityLabel),
    )
    .map((node) => node.props.accessibilityLabel as string);
}

describe('ProductivityDashboard — the focus bars', () => {
  it('shows one bar per day of the window, none open', async () => {
    await withRendered(screen(), (renderer) => {
      const bars = barLabels(renderer);
      expect(bars).toHaveLength(7);
      // The task count only appears once a bar is opened.
      expect(visibleText(renderer)).not.toContain('0 tasks');
    });
  });

  it('opens a bar on tap, moves the selection, and closes it again', async () => {
    await withRendered(screen(), async (renderer) => {
      const [first, second] = barLabels(renderer);

      await press(renderer, first);
      expect(visibleText(renderer)).toContain('0 tasks');
      expect(byLabel(renderer, first).props.accessibilityState).toMatchObject({
        selected: true,
      });

      // Opening another moves the selection rather than opening a second bar.
      await press(renderer, second);
      expect(byLabel(renderer, second).props.accessibilityState).toMatchObject({
        selected: true,
      });
      expect(byLabel(renderer, first).props.accessibilityState).toMatchObject({
        selected: false,
      });

      // Tapping the open bar again closes it.
      await press(renderer, second);
      expect(visibleText(renderer)).not.toContain('0 tasks');
      expect(byLabel(renderer, second).props.accessibilityState).toMatchObject({
        selected: false,
      });
    });
  });
});
