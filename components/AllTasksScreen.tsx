import React, { useMemo, useState } from 'react';
import {
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Todo } from '../todos/model';
import {
  filterByTag,
  filterByTags,
  groupTodos,
  openCount,
  searchTodos,
  tagsInUse,
} from '../todos/taskSelectors';
import { accentFor, tintOf } from '../todos/tags';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type AllTasksScreenProps = {
  todos: Todo[];
  /**
   * Today's local day key, for ordering tasks into due-date groups.
   *
   * Passed in rather than read here: the same value labels each row's date, and
   * a screen that called `Date.now()` itself could disagree with the controller
   * about which day it is.
   */
  today: string;
  /**
   * Heading. `All tasks` unless a tag view is showing.
   *
   * Passed in rather than derived: the screen has no way to know what a tag name
   * means, and inventing its own wording would put two voices on the same heading.
   */
  title?: string;
  /**
   * When set, only tasks carrying this tag are shown, and the search/tag filter
   * bar is hidden — a tag view is already a filter.
   *
   * The base list lives here rather than in the caller so the two variants cannot
   * drift: "all tasks" and "the #coding tasks" are one list with and without a
   * predicate, not two lists that might one day disagree about what a task is.
   */
  filterTag?: string;
  /**
   * Renders one task row, supplied by the owner of the task state.
   *
   * A function rather than the dozen callbacks it would wrap, because this screen
   * has no business knowing about focus timers, completion locks or inline
   * renaming — it is a list, and every rule those represent already lives in
   * `TodoRow`. These are the *same* rows the home screen rendered, and passing a
   * renderer rather than a second set of handlers is what makes it structurally
   * impossible for the two screens to disagree about how a task behaves.
   */
  renderRow: (todo: Todo) => React.ReactElement;
  onAddTask: () => void;
  onBack: () => void;
};

/**
 * How many list cells to mount before the first scroll measurement.
 *
 * A section costs two cells of its own — a header and a footer — on top of its
 * tasks, so the default of 10 leaves only a handful of rows rendered on the first
 * paint, with blank space where the rest should be until layout reports. 30
 * comfortably covers a full screen of rows and their section chrome without
 * mounting a long list up front.
 */
const INITIAL_RENDERED_CELLS = 30;

/**
 * Every task, in one list. The app's only list.
 *
 * This is a screen, not a sheet: home shows how today is going, and this shows the
 * work itself. There is no second copy of the list anywhere — home used to render
 * the same rows and no longer does, because two places showing the same tasks is
 * how they start disagreeing about what "done" means.
 *
 * The tag row on home opens this screen with a `filterTag`, which then shows one
 * tag's tasks under that tag's heading. Unfiltered, the screen earns its keep by
 * organising rather than merely listing: tasks are grouped by due date — Overdue
 * first, then Today, Upcoming, no date, and Completed last — and a search box plus
 * a multi-select tag filter narrow the list from there.
 *
 * The search text and the selected tags are view state, so they live here. What
 * each means — which tasks match a query, which tasks carry a tag, which group a
 * task falls into — is pure and lives in `todos/taskSelectors`, so the rules can
 * be tested without a renderer and this component stays a composition of them.
 */
export function AllTasksScreen({
  todos,
  today,
  title,
  filterTag,
  renderRow,
  onAddTask,
  onBack,
}: AllTasksScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  // View state: what the user has typed and which tag chips are lit. It is not
  // domain state, so it does not belong in `useTaskScreen` — nothing outside this
  // screen can observe or act on it.
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // The tag view's slice, or the whole list. Filtering lives here rather than in
  // the caller so the two variants cannot drift.
  const base = useMemo(() => filterByTag(todos, filterTag), [filterTag, todos]);

  const filtered = useMemo(() => {
    // A tag view is already filtered, so the multi-select chips are skipped there
    // rather than stacked on top and leaving the heading lying about what is up.
    const byTags = filterTag ? base : filterByTags(base, selectedTags);
    return searchTodos(byTags, query);
  }, [base, filterTag, query, selectedTags]);

  const sections = useMemo(() => groupTodos(filtered, today), [filtered, today]);

  // Counted over what is shown, not the whole list: the subtitle describes the
  // list under it.
  const open = openCount(filtered);

  const tags = useMemo(() => tagsInUse(base), [base]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((chosen) => chosen !== tag) : [...current, tag],
    );
  };

  const subtitle =
    filtered.length === 0
      ? 'Nothing yet'
      : open === 0
        ? `All ${filtered.length} done`
        : `${open} open of ${filtered.length}`;

  // Three empty states, because one message cannot be true in all three cases:
  // the tag has no tasks, the filters matched nothing, or there is simply nothing
  // yet. `hidden` puts no component in the list at all.
  const emptyKind: 'none' | 'noMatches' | 'hidden' =
    filtered.length > 0 ? 'hidden' : base.length === 0 ? 'none' : 'noMatches';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          accessibilityLabel="Back to today"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onBack}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            color={t.colors.text}
            name="chevron-left"
            size={26}
          />
        </TouchableOpacity>

        <View style={styles.heading}>
          <Text style={styles.title}>{title ?? 'All tasks'}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel={
            filterTag ? `Add a task tagged ${filterTag}` : 'Add a task'
          }
          accessibilityRole="button"
          onPress={onAddTask}
          style={styles.addButton}
        >
          <MaterialCommunityIcons
            color={t.colors.primaryText}
            name="plus"
            size={24}
          />
        </TouchableOpacity>
      </View>

      {!filterTag && (
        <View style={styles.filters}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons
              color={t.colors.textMuted}
              name="magnify"
              size={16}
            />
            <TextInput
              accessibilityLabel="Search tasks"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search tasks"
              placeholderTextColor={t.colors.textDisabled}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
          </View>

          {/* Only tags actually in use: a filter over eight vocabulary entries when
              two tags exist is mostly dead buttons. Absent entirely when nothing is
              tagged, so the unfiltered list keeps its old, uncluttered header. */}
          {tags.length > 0 && (
            <View style={styles.chipRow}>
              {tags.map((tag) => {
                const accent = accentFor(tag);
                const active = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    accessibilityLabel={`Filter by ${tag}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    activeOpacity={0.7}
                    onPress={() => toggleTag(tag)}
                    style={[
                      styles.filterChip,
                      active
                        ? { backgroundColor: accent, borderColor: accent }
                        : {
                            backgroundColor: tintOf(accent),
                            borderColor: tintOf(accent),
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? t.colors.primaryText : accent },
                      ]}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      <SectionList
        // No `extraData`: every mutation replaces the array, so `sections`
        // changes identity and the list re-renders on its own.
        sections={sections}
        initialNumToRender={INITIAL_RENDERED_CELLS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderRow(item)}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        // The list is the screen, so it owns the bottom inset. Without this the last
        // row's tag chips sit under the home indicator.
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) },
          filtered.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          emptyKind === 'none' ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {filterTag ? 'No Todos yet' : 'No tasks yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {filterTag
                  ? `Tap + to add the first ${filterTag} task — it is created already tagged.`
                  : 'Anything you add shows up here, whether or not it has a date.'}
              </Text>
            </View>
          ) : emptyKind === 'noMatches' ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyBody}>
                Nothing here fits that search or tag filter. Clear it to see every
                task again.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    /**
     * The way back to home.
     *
     * A chevron rather than a text word: the row it shares space with is a title and
     * a count, so a text label here would be the only word-wrapped control in the
     * header. `hitSlop` widens the 26px glyph to a comfortable target without
     * changing what it looks like.
     */
    backButton: {
      width: 40,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    heading: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      fontSize: 13,
      color: c.textMuted,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    /**
     * The search box and the tag filter, between the header and the list.
     *
     * Its own hairline rather than a gap, because it is a second band of chrome
     * over the same list — the divider is what says the two belong to the screen
     * rather than to any one row.
     */
    filters: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 8,
      fontSize: 15,
      color: c.text,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    filterChip: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: c.textMuted,
      paddingTop: 14,
      paddingBottom: 6,
      backgroundColor: c.background,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    /** Lets the empty state sit in the upper half rather than dead-centre. */
    listContentEmpty: {
      flexGrow: 1,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
      gap: 6,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textMuted,
    },
    emptyBody: {
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      color: c.textDisabled,
    },
  });
};
