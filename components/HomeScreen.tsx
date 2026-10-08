/**
 * The home screen: the dashboard column, the tag index, the export footer.
 *
 * Presentational in the strict sense used here — it renders what it is given
 * and reports intent ("open the list", "add a task", "export") without knowing
 * how the app arrives at any of those states. No task rules, no navigation
 * state, no storage: the counts it prints come from the list it is handed.
 *
 * Two of the cards it composes (`TodayCard`, `ProductivityDashboard`) read the
 * productivity context themselves. That is their own choice and their own
 * documented exception, not a dependency this component adds; everything *it*
 * displays arrives as a prop.
 */
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductivityDashboard } from './ProductivityDashboard';
import { TodayCard } from './TodayCard';
import type { Todo } from '../todos/model';
import { AVAILABLE_TAGS, tintOf } from '../todos/tags';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export type HomeScreenProps = {
  /** The whole list — the tile counts it, the export button is enabled by it. */
  todos: Todo[];
  /**
   * Notifications were asked for and refused, so a timer's alert will not land.
   * A boolean rather than the raw permission string: this screen has exactly one
   * thing to say about the answer, and "denied" is the whole of it.
   */
  notificationsBlocked: boolean;
  /** The task list, unfiltered. */
  onOpenTasks: () => void;
  /** One tag's list. */
  onOpenTag: (tag: string) => void;
  /** Opens the create sheet. */
  onAddTask: () => void;
  /** Shares the list as JSON. No-op when there is nothing to export. */
  onExport: () => void;
};

export function HomeScreen({
  todos,
  notificationsBlocked,
  onOpenTasks,
  onOpenTag,
  onAddTask,
  onExport,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  // Styles are theme-derived, so they are built per theme rather than once at
  // module scope. `useTheme` returns a stable object, so this only recomputes
  // when the system colour scheme actually flips.
  const styles = useMemo(() => createStyles(t), [t]);

  const openCount = todos.filter((todo) => !todo.completed).length;

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.homeContent,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Today</Text>
        </View>

        {notificationsBlocked && (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>
              Notifications are off, so timer alerts will not reach you.
            </Text>
          </View>
        )}

        {/* The way to the work. It sits above the progress card rather than below
            it because a person opening this app is usually asking "what now?",
            and this is the answer to that question.

            The `+` sits beside it rather than in the header, because it belongs to
            this pair: add a task, then see your tasks. Both parts are the way into
            the list, so they share a row. */}
        <View style={styles.tileRow}>
          <TouchableOpacity
            accessibilityLabel="Open all tasks"
            accessibilityRole="button"
            onPress={onOpenTasks}
            style={styles.allTasksTile}
          >
            <View style={styles.allTasksTextGroup}>
              <Text style={styles.allTasksTitle}>
                {todos.length === 0
                  ? 'Add your first task'
                  : openCount === 0
                    ? `All ${todos.length} done`
                    : `${openCount} open of ${todos.length}`}
              </Text>
              <Text style={styles.allTasksBody}>See every task you have written down.</Text>
            </View>
            <MaterialCommunityIcons
              color={t.colors.textMuted}
              name="chevron-right"
              size={20}
            />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Add a task"
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

        {/* Replaced a "3 of 7 tasks done" row, which counted every task ever
            added — including ones completed weeks ago — and so answered a
            question nobody was asking. */}
        <TodayCard />

        {/* Always here, between the two cards — and every tag is always here,
            not just the ones in use. A tag with nothing behind it opens an
            empty screen whose `+` creates its first task, which is the only way
            a task can come to carry a tag: the chips left the create sheet, so
            a vocabulary entry that disappeared because nothing used it would be
            gone for good. Empty when unused, never missing. */}
        <View style={styles.tagsSection}>
          <View style={styles.tagsHeadingRow}>
            <Text style={styles.tagsHeader}>Tags</Text>
            <Text style={styles.tagsHint}>Open one to see its tasks</Text>
          </View>
          <View style={styles.tagsChipRow}>
            {AVAILABLE_TAGS.map((tag) => (
              <TouchableOpacity
                key={tag.label}
                accessibilityLabel={`Show tasks tagged ${tag.label}`}
                accessibilityRole="button"
                activeOpacity={0.7}
                onPress={() => onOpenTag(tag.label)}
                style={[
                  styles.tagChip,
                  {
                    backgroundColor: tintOf(tag.accent),
                    borderColor: tintOf(tag.accent),
                  },
                ]}
              >
                <Text style={[styles.tagChipText, { color: tag.accent }]}>{tag.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Replaces the old `completedByTimer` progress bar, which was driven by
            a flag nothing ever set and so always rendered empty. */}
        <ProductivityDashboard />
      </ScrollView>

      {/* Fixed footer: always anchored to the bottom of the screen, outside the
          scrollable content so it stays put no matter how long the page is.
          Padded by the bottom safe-area inset so the home indicator never clips
          the button. */}
      <View
        style={[
          styles.exportFooter,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            marginBottom: insets.bottom > 0 ? 0 : 4,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.exportButton,
            todos.length === 0 && styles.exportButtonDisabled,
          ]}
          onPress={onExport}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="download"
            size={18}
            color={todos.length === 0 ? t.colors.textDisabled : t.colors.primaryText}
          />
          <Text
            style={[
              styles.exportButtonText,
              todos.length === 0 && styles.exportButtonTextDisabled,
            ]}
          >
            Download / Export{'\n'}({todos.length}{' '}
            {todos.length === 1 ? 'task' : 'tasks'})
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    /**
     * The scrolling home page.
     *
     * A `ScrollView` rather than the `FlatList` this replaced. The list moved to
     * its own screen, so what is left here is a fixed, short column of cards —
     * nothing on it is data-driven or unbounded, so a virtualised list would be
     * machinery with nothing to virtualise. The bottom padding is what keeps the
     * export footer from overlapping the last card when the page does scroll.
     */
    homeContent: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 0,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.text,
    },
    permissionBanner: {
      backgroundColor: c.warningSurface,
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.warningBorder,
    },
    permissionText: {
      fontSize: 13,
      color: c.warningText,
    },
    /**
     * Round. It opens the task sheet, so it is a navigation control rather than
     * the submit half of a form.
     */
    addButton: {
      backgroundColor: c.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    /**
     * The tile and its `+`, as one row.
     *
     * The tile flexes so the count inside it can wrap to a second line while the
     * button stays 44px and square — giving it a percentage width instead would
     * have made the `+` grow and shrink with the text next to it.
     */
    tileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    /**
     * The way into the task list.
     *
     * Styled as a row rather than a button so it reads as a panel rather than an
     * action competing with the `+` beside it.
     */
    allTasksTile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    allTasksTextGroup: {
      flex: 1,
      gap: 2,
    },
    allTasksTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    allTasksBody: {
      fontSize: 13,
      color: c.textMuted,
    },
    /**
     * The tag index, between the two cards.
     *
     * A heading plus a right-aligned hint rather than a heading alone: chips in a
     * row are exactly what the old, non-working filter looked like, and "Open one
     * to see its tasks" is the one line that tells this apart from it.
     */
    tagsSection: {
      marginBottom: 16,
      marginTop: 4,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    tagsHeadingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 10,
    },
    tagsHeader: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    tagsHint: {
      fontSize: 12,
      color: c.textMuted,
    },
    tagsChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagChip: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    tagChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    exportFooter: {
      borderTopWidth: 1,
      borderTopColor: c.divider,
      paddingTop: 12,
      marginTop: 12,
      backgroundColor: c.background,
    },
    exportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    /**
     * Disabled state for the export bar.
     *
     * Was a hardcoded pair, `'#1C3A5E'` and `'#A5C9F5'`, neither of which existed
     * anywhere else in the app. It is now `surfaceMuted`, which is what every other
     * disabled surface in the design already uses, and the label moves to
     * `textDisabled` to go with it — white on `surfaceMuted` is unreadable in light
     * mode, so dimming the fill alone would have fixed the theming and left the
     * contrast broken.
     */
    exportButtonDisabled: {
      backgroundColor: c.surfaceMuted,
    },
    exportButtonText: {
      color: c.primaryText,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    exportButtonTextDisabled: {
      color: c.textDisabled,
    },
  });
};
