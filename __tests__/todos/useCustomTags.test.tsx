/**
 * The user's own tag list: add, dedupe, and round-trip through storage.
 *
 * The hook owns only the labels; the colours are derived, so what has to survive
 * a restart is exactly the strings asserted here.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CUSTOM_TAGS_STORAGE_KEY } from '../../todos/tags';
import { useCustomTags } from '../../todos/useCustomTags';
import { render } from '../support/render';

type Api = ReturnType<typeof useCustomTags>;

let api: Api | undefined;

/** Reads the hook on every render, so tests act on the live value. */
function Probe() {
  api = useCustomTags();
  return null;
}

const act = (body: () => void) => ReactTestRenderer.act(body);
/** Lets the storage hydration and its save effect settle. */
const settle = () => ReactTestRenderer.act(async () => undefined);

beforeEach(async () => {
  api = undefined;
  // The AsyncStorage mock's store is module-level, so start each test empty.
  await AsyncStorage.clear();
});

describe('useCustomTags — adding', () => {
  beforeEach(async () => {
    await render(<Probe />);
    await settle();
  });

  it('normalises whatever was typed before storing it', async () => {
    await act(() => api!.addTag('  ##Deep Work '));
    expect(api!.customTags).toEqual(['#deepwork']);
  });

  it('ignores a blank entry', async () => {
    await act(() => api!.addTag('   '));
    expect(api!.customTags).toEqual([]);
  });

  it('refuses to duplicate an existing custom tag', async () => {
    await act(() => api!.addTag('fitness'));
    await act(() => api!.addTag('#fitness'));
    expect(api!.customTags).toEqual(['#fitness']);
  });

  it('refuses a tag that ships with the app', async () => {
    // It already exists in the vocabulary, so storing it again would be a second
    // entry for one idea.
    await act(() => api!.addTag('#coding'));
    expect(api!.customTags).toEqual([]);
  });

  it('exposes the vocabulary plus the user’s tags, deduplicated', async () => {
    await act(() => api!.addTag('fitness'));
    const labels = api!.tags.map((tag) => tag.label);
    expect(labels).toContain('#coding');
    expect(labels).toContain('#fitness');
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('useCustomTags — persistence', () => {
  it('writes the labels so a later mount can read them back', async () => {
    await render(<Probe />);
    await settle();
    await act(() => api!.addTag('fitness'));
    await settle();

    expect(await AsyncStorage.getItem(CUSTOM_TAGS_STORAGE_KEY)).toBe(
      JSON.stringify(['#fitness']),
    );
  });

  it('repairs stored labels on read: normalised, deduplicated, vocabulary dropped', async () => {
    await AsyncStorage.setItem(
      CUSTOM_TAGS_STORAGE_KEY,
      JSON.stringify(['#fitness', '  ', '#fitness', '##Blog']),
    );
    await render(<Probe />);
    await settle();

    // `#blog` is a shipped tag, so it is not a custom entry; the duplicate and
    // the blank fall away.
    expect(api!.customTags).toEqual(['#fitness']);
  });
});
