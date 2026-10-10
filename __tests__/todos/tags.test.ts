/**
 * The tag vocabulary: normalisation, the merge with the user's own tags, and the
 * derived accent.
 *
 * These are pure and have no renderer, which is the point — the same functions
 * decide the chip on home, the chip in the create sheet and the colour on a row,
 * so a bug here would disagree with itself in three places rather than throw.
 */

import {
  AVAILABLE_TAGS,
  CUSTOM_TAGS_STORAGE_KEY,
  accentFor,
  isCustomTag,
  isVocabularyTag,
  mergeTags,
  normalizeTagInput,
} from '../../todos/tags';

describe('normalizeTagInput', () => {
  it('adds the `#` the user did not type', () => {
    expect(normalizeTagInput('coding')).toBe('#coding');
  });

  it('does not double up a `#` that was typed, however many', () => {
    expect(normalizeTagInput('#coding')).toBe('#coding');
    expect(normalizeTagInput('##coding')).toBe('#coding');
  });

  it('trims, lowercases and squeezes out spaces', () => {
    // One token, one case — "Deep Work" and "deep work" are the same idea.
    expect(normalizeTagInput('  ##Deep Work ')).toBe('#deepwork');
  });

  it('answers null when nothing is left', () => {
    expect(normalizeTagInput('')).toBeNull();
    expect(normalizeTagInput('   ')).toBeNull();
    expect(normalizeTagInput('#')).toBeNull();
    expect(normalizeTagInput('  ##  ')).toBeNull();
  });
});

describe('mergeTags', () => {
  it('is the shipped vocabulary when there is nothing custom', () => {
    expect(mergeTags([]).map((tag) => tag.label)).toEqual(
      AVAILABLE_TAGS.map((tag) => tag.label),
    );
  });

  it('appends the user’s tags after the vocabulary, in order', () => {
    expect(mergeTags(['#fitness', '#reading']).map((tag) => tag.label)).toEqual([
      ...AVAILABLE_TAGS.map((tag) => tag.label),
      '#fitness',
      '#reading',
    ]);
  });

  it('never lists the same tag twice', () => {
    // A stored label that matches a shipped tag, or another user tag, is a
    // duplicate rather than a second chip.
    const labels = mergeTags(['#coding', '#fitness', '#fitness']).map((tag) => tag.label);
    expect(labels).toEqual([...AVAILABLE_TAGS.map((tag) => tag.label), '#fitness']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('gives a custom tag a derived accent, and the vocabulary its own', () => {
    const merged = mergeTags(['#fitness']);
    const fitness = merged.find((tag) => tag.label === '#fitness');
    const coding = merged.find((tag) => tag.label === '#coding');
    expect(fitness?.accent).toBe(accentFor('#fitness'));
    expect(coding?.accent).toBe(AVAILABLE_TAGS[1].accent);
  });
});

describe('accentFor', () => {
  it('returns the shipped hue for a shipped tag', () => {
    expect(accentFor('#gym')).toBe('#FF375F');
  });

  it('derives a stable hue for a tag it does not know', () => {
    // Stable across calls is the whole requirement: the label is the only thing
    // persisted, so the colour has to come back the same every time.
    expect(accentFor('#fitness')).toBe(accentFor('#fitness'));
    expect(accentFor('#fitness')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('isCustomTag / isVocabularyTag', () => {
  it('separates a shipped tag from one the user made', () => {
    expect(isVocabularyTag('#coding')).toBe(true);
    expect(isCustomTag('#coding')).toBe(false);
    expect(isVocabularyTag('#fitness')).toBe(false);
    expect(isCustomTag('#fitness')).toBe(true);
  });
});

it('pins the storage key custom tags are written to', () => {
  expect(CUSTOM_TAGS_STORAGE_KEY).toBe('customTags');
});
