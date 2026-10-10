/**
 * The user's own tag labels: state, persistence and the add rule.
 *
 * The shipped vocabulary is a compile-time constant in `todos/tags.ts` and needs
 * no state. What needs state is the part a person can extend, so this owns only
 * that: the labels they have added, read/written against their own storage key.
 * Hues are not stored — `tags.ts` derives one from each label, so the only thing
 * that has to survive a restart is the label itself.
 *
 * Pattern note: same shape as `todos/useTasks` — plain state plus named
 * operations, no context. One component consumes it, so a provider would be a
 * second way to reach the same state.
 *
 * A separate key rather than folding labels into the task array: this is the
 * vocabulary, not a task, and mixing them would make "clear all tasks" also mean
 * "forget every tag the user ever named".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CUSTOM_TAGS_STORAGE_KEY,
  isCustomTag,
  mergeTags,
  normalizeTagInput,
  type TagOption,
} from './tags';

export type CustomTags = {
  /** The labels the user has added, in the order they were added. */
  customTags: string[];
  /** The vocabulary plus the user's own, deduplicated — what a picker renders. */
  tags: TagOption[];
  /** Adds whatever was typed, if it normalises to a new label. */
  addTag: (raw: string) => void;
};

export function useCustomTags(): CustomTags {
  const [customTags, setCustomTags] = useState<string[]>([]);
  // Guards the save effect: without it the first render would write an empty
  // list over whatever is stored, before `getItem` resolves.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CUSTOM_TAGS_STORAGE_KEY);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          // Storage is user-writable, so nothing in it is trusted: every entry
          // is re-normalised and the result deduplicated, exactly as if it had
          // just been typed. A malformed key costs a tag, never the load.
          if (Array.isArray(parsed)) {
            const cleaned: string[] = [];
            for (const entry of parsed) {
              const label = normalizeTagInput(String(entry));
              if (label && isCustomTag(label) && !cleaned.includes(label)) {
                cleaned.push(label);
              }
            }
            setCustomTags(cleaned);
          }
        }
      } catch {
        // A broken store degrades to "no custom tags" rather than a failed load.
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // Fire-and-forget: a write failure must not surface as a render error, and
    // the in-memory list is already correct.
    AsyncStorage.setItem(CUSTOM_TAGS_STORAGE_KEY, JSON.stringify(customTags)).catch(
      () => undefined,
    );
  }, [customTags, hydrated]);

  const addTag = useCallback((raw: string) => {
    const label = normalizeTagInput(raw);
    // A shipped tag already exists, and a duplicate would be a second chip for
    // one idea — both are no-ops rather than errors.
    if (!label || !isCustomTag(label)) return;
    setCustomTags((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }, []);

  const tags = useMemo(() => mergeTags(customTags), [customTags]);

  return { customTags, tags, addTag };
}
