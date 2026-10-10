/**
 * The swipeable row wrapper.
 *
 * Its one side effect is a gesture tick: a left swipe that commits to revealing
 * the Stop/Delete actions triggers a `taskSwiped` haptic. The gesture library is
 * mocked to a plain `View` in `jest.setup.js`, so the test drives the callback
 * directly rather than simulating a drag — the point being pinned here is that
 * the wrapper asks for feedback exactly when the right-side actions open.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

import { SwipeableTodoRow } from '../../components/SwipeableTodoRow';
import { triggerHaptic } from '../../haptics';
import { hostNodes, visibleText, withRendered } from '../support/render';

function row(hasTimer = false) {
  return (
    <SwipeableTodoRow
      hasTimer={hasTimer}
      onDelete={() => {}}
      onStopTimer={() => {}}
    >
      <Text>a task</Text>
    </SwipeableTodoRow>
  );
}

/** The mocked Swipeable host node, which carries the gesture callbacks as props. */
function swipeable(renderer: ReactTestRenderer.ReactTestRenderer) {
  const found = hostNodes(renderer).filter(
    (n) => typeof n.props?.onSwipeableWillOpen === 'function',
  );
  expect(found).toHaveLength(1);
  return found[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SwipeableTodoRow — the left swipe ticks', () => {
  it('renders its content and opens with a taskSwiped haptic', async () => {
    await withRendered(row(), async (renderer) => {
      expect(visibleText(renderer)).toContain('a task');
      await ReactTestRenderer.act(async () => {
        swipeable(renderer).props.onSwipeableWillOpen('right');
      });
      expect(triggerHaptic).toHaveBeenCalledTimes(1);
      expect(triggerHaptic).toHaveBeenCalledWith('taskSwiped');
    });
  });

  it('stays silent when the revealed side is the left (nothing there)', async () => {
    await withRendered(row(), async (renderer) => {
      await ReactTestRenderer.act(async () => {
        swipeable(renderer).props.onSwipeableWillOpen('left');
      });
      expect(triggerHaptic).not.toHaveBeenCalled();
    });
  });
});