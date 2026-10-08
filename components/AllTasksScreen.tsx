import React, { useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Todo } from '../todos/model';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type AllTasksScreenProps = {
  todos: Todo[];
  /**
   * Heading. `All tasks` unless a tag view is showing.
   *
   * Passed in rather than derived: the screen has no way to know what a tag name
   * means, and inventing its own wording would put two voices on the same heading.
   */
  title?: string;
  /**
   * When set, only tasks carrying this tag are shown.
   *
   * Filtering lives here rather than in the caller so the two variants cannot drift:
   * "all tasks" and "the #coding tasks" are one list with and without a predicate,
   * not two lists that might one day disagree about what a task is.
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
 * Every task, in one list. The app's only list.
 *
 * This is a screen, not a sheet: home shows how today is going, and this shows the
 * work itself. There is no second copy of the list anywhere — home used to render
 * the same rows and no longer does, because two places showing the same tasks is
 * how they start disagreeing about what "done" means.
 *
 * The tag row on home opens this screen with a `filterTag`, which is why the chips
 * are not a filter on home: there is nothing there to filter. A filter belongs on
 * the thing it filters, and this is that thing. Every tag opens it, used or not:
 * an unused tag lands on an empty state that names the gap and can create the
 * tag's first task, since the chip left the create sheet and that screen's `+` is
 * now the only way a task comes to carry a tag.
 *
 * Today does not filter by date, so this shows everything, in the order it was
 * added. That is deliberate rather than a placeholder. A screen that looks like a
 * filter but does not filter is worse than one that openly shows everything, and the
 * alternative — pulling a date filter forward — is a larger change to behaviour than
 * this one is meant to be. The due-date line on each row is what makes the date
 * data visible in the meantime, so nothing is hidden by the lack of a filter.
 */
export function AllTasksScreen({
  todos,
  title,
  filterTag,
  renderRow,
  onAddTask,
  onBack,
}: AllTasksScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  const shown = useMemo(
    () => (filterTag ? todos.filter((todo) => todo.tags?.includes(filterTag)) : todos),
    [filterTag, todos],
  );

  // Counted here rather than passed in: it is one pass over an array already in
  // memory, and a `total`/`open` prop pair is a chance for the caller to disagree
  // with the data it is describing.
  const open = shown.filter((todo) => !todo.completed).length;

  const subtitle =
    shown.length === 0
      ? 'Nothing yet'
      : open === 0
        ? `All ${shown.length} done`
        : `${open} open of ${shown.length}`;

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

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        // No `extraData` needed: every mutation replaces the array, so `data`
        // changes identity and the list re-renders on its own.
        renderItem={({ item }) => renderRow(item)}
        // The list is the screen, so it owns the bottom inset. Without this the last
        // row's tag chips sit under the home indicator.
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) },
          shown.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
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
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
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
