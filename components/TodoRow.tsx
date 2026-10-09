import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { SwipeableTodoRow } from './SwipeableTodoRow';
import { accentFor, tintOf } from '../todos/tags';
import type { Todo } from '../todos/model';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

/**
 * One task row, shared by the tasks screen and the tag view.
 *
 * Extracted from `WelcomeComponent`'s `renderItem` so every list shows the same
 * thing. That matters more than usual here, because this row encodes several
 * hard-won rules that a second copy would immediately get wrong:
 *
 *  - the body is inert. Completion is an explicit checkbox, because the body used
 *    to be the button and a tap aimed at the text completed the task instead.
 *  - the checkbox is disabled while a timer is attached, and again once a
 *    finished timer has locked the task.
 *  - the focus entry point is labelled, not a bare glyph.
 *
 * Everything presentational is passed in rather than read from context, so this
 * component has no opinion about where the task came from. The one thing it does
 * decide is the disabled *appearance* and the accessibility state, both read
 * from the same `completionDisabled` flag so they cannot drift apart.
 */
export type TodoRowProps = {
  todo: Todo;
  /** A focus timer is attached to this task. */
  hasTimer: boolean;
  /** That timer is counting down, rather than paused. */
  isRunning: boolean;
  /** Remaining time, already formatted. Only read when `hasTimer` is true. */
  timerLabel: string;
  /** A finished focus session closed this task. */
  isLocked: boolean;
  /**
   * Whether the checkbox must not respond: a live timer in either direction, or a
   * finished timer's lock on reopening.
   */
  completionDisabled: boolean;
  onToggleComplete: () => void;
  onStartFocus: () => void;
  onToggleTimerRunning: () => void;
  onStopTimer: () => void;
  /**
   * Opens the edit sheet for this task.
   *
   * Editing used to happen inline in the row — a `TextInput` that swapped in for the
   * title. It could only ever hold the title, and the requirement is that a task's
   * date, title and notes are all editable, so the sheet took it over: same three
   * fields as creation, prefilled, one path for both. That leaves this component with
   * no form state at all, which is what the `editing` props used to be.
   */
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Human-readable due date, e.g. `Due Fri`. Absent when the task has no date.
   *
   * Passed in already formatted rather than derived here: this component has no
   * business calling `Date`, and the day key it would parse is deliberately
   * timezone-free.
   */
  dueLabel?: string;
  /**
   * Whether that date is in the past. Only read when `dueLabel` is present.
   *
   * Passed in for the same reason as `dueLabel`: answering it needs today's day
   * key, and the row has no clock. The controller derives it from the task, so
   * the row only decides how an overdue date *looks*.
   */
  overdue: boolean;
};

export function TodoRow({
  todo,
  hasTimer,
  isRunning,
  timerLabel,
  isLocked,
  completionDisabled,
  onToggleComplete,
  onStartFocus,
  onToggleTimerRunning,
  onStopTimer,
  onEdit,
  onDelete,
  dueLabel,
  overdue,
}: TodoRowProps) {
  const t = useTheme();
  // Theme-derived, so built per theme rather than at module scope.
  const styles = useMemo(() => createStyles(t), [t]);

  return (
    <SwipeableTodoRow
      hasTimer={hasTimer}
      onDelete={onDelete}
      onStopTimer={onStopTimer}
    >
      <View style={styles.todoItem}>
        {/* Completion is an explicit control, not the row. The body used to be
            the button, so reading a task to see what it said marked it done —
            and because the text, timer display, lock badge and tag chips were
            all inside that one target, a tap aimed at any of them completed
            the task instead. */}
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: todo.completed,
            disabled: completionDisabled,
          }}
          accessibilityLabel={`${todo.completed ? 'Reopen' : 'Complete'} ${todo.text}`}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          onPress={onToggleComplete}
          style={[styles.checkboxHit, completionDisabled && styles.checkboxDisabled]}
        >
          <View style={[styles.checkbox, todo.completed && styles.checkboxDone]}>
            {todo.completed && (
              <MaterialCommunityIcons
                name="check"
                size={13}
                color={t.colors.primaryText}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Deliberately inert. Nothing here is pressable, so a tap that lands
            on the task changes nothing at all. */}
        <View style={styles.todoBody}>
          <Text style={[styles.todoText, todo.completed && styles.completedText]}>
            {todo.text}
          </Text>

          {/* The notes sit directly under the title rather than beside it: they
              are detail about the same thing, and a second column would push the
              title into a narrow strip that wraps before the notes do. */}
          {todo.notes && !todo.completed && (
            <Text numberOfLines={2} style={styles.notes}>
              {todo.notes}
            </Text>
          )}

          {dueLabel && !todo.completed && (
            <View style={styles.metaLine}>
              <MaterialCommunityIcons
                name="calendar-blank-outline"
                size={12}
                color={overdue ? t.colors.danger : t.colors.textMuted}
              />
              <Text style={[styles.dueText, overdue && styles.dueTextOverdue]}>
                {dueLabel}
              </Text>
            </View>
          )}

          {hasTimer && (
            <View style={styles.metaLine}>
              <MaterialCommunityIcons
                name={isRunning ? 'timer-sand' : 'timer-off-outline'}
                size={14}
                color={t.colors.textMuted}
              />
              <Text style={styles.timerText}>{timerLabel}</Text>
            </View>
          )}

          {/* A finished timer locks this task closed. The checkbox above then
              stops responding, which on its own reads as a broken tap rather
              than a deliberate rule — this is the reason, shown next to the
              task it applies to. */}
          {isLocked && (
            <View style={styles.metaLine}>
              <MaterialCommunityIcons
                name="lock-check-outline"
                size={12}
                color={t.colors.primary}
              />
              <Text style={styles.lockText}>focus session ended</Text>
            </View>
          )}

          {todo.tags && todo.tags.length > 0 && (
            <View style={styles.taskTagsContainer}>
              {todo.tags.map((tag, idx) => {
                const accent = accentFor(tag);
                return (
                  <View
                    key={idx}
                    style={[
                      styles.taskTagChip,
                      {
                        backgroundColor: tintOf(accent),
                        borderColor: tintOf(accent),
                      },
                    ]}
                  >
                    <Text style={[styles.taskTagText, { color: accent }]}>
                      {tag}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.actionContainer}>
          {hasTimer ? (
            <>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  isRunning ? `Pause focus on ${todo.text}` : `Resume focus on ${todo.text}`
                }
                onPress={onToggleTimerRunning}
                style={styles.iconButton}
              >
                <MaterialCommunityIcons
                  name={isRunning ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={24}
                  color={t.colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Stop focus on ${todo.text}`}
                onPress={onStopTimer}
                style={styles.iconButton}
              >
                <MaterialCommunityIcons
                  name="stop-circle-outline"
                  size={24}
                  color={t.colors.danger}
                />
              </TouchableOpacity>
            </>
          ) : (
            // Labelled rather than a bare icon. This replaced a global chip row
            // that could not identify its task; leaving the per-task entry
            // point as an unlabelled glyph would have traded a wrong-task bug
            // for a discoverability one.
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Start focus on ${todo.text}`}
              onPress={onStartFocus}
              style={styles.focusButton}
            >
              <MaterialCommunityIcons
                name="timer-outline"
                size={16}
                color={t.colors.primary}
              />
              <Text style={styles.focusButtonText}>Focus</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Edit ${todo.text}`}
            onPress={onEdit}
          >
            <Text style={styles.actionButton}>Edit</Text>
          </TouchableOpacity>
        </View>
  </View>
    </SwipeableTodoRow>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    todoItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: c.surface,
    },
    /**
     * Touch target for the completion checkbox.
     *
     * The box itself is only 18px, so `hitSlop` on the pressable does the work of
     * getting it to a comfortable size. Padding would have worked too, but would
     * have shoved the task text right by the full amount.
     *
     * `alignSelf: flex-start` is what keeps the box level with the task text. The
     * row is `alignItems: 'center'`, so a centred checkbox drifts downwards on any
     * row tall enough to matter — a task with tag chips put the first line of text
     * at the top and the box floating in the middle of the row beside the tags.
     * Pinning to the top and nudging down optically centres the 18px box on the
     * ~19px line box of 16px text.
     */
    checkboxHit: {
      alignSelf: 'flex-start',
      // Optical centring is `(box - lineBox) / 2`, and 18px against the ~19px line
      // box of 16px text is now about half a pixel high — below what a layout
      // resolves. It cannot go to 0 though: with `hitSlop: 13` that reaches 1px
      // past the row's top edge, and the row above has its own checkbox at the same
      // x. 1px puts the pressable's edge exactly on the row boundary, so a tap near
      // the top of a row cannot land on the row above's checkbox instead.
      marginTop: 1,
      marginRight: 12,
    },
    checkbox: {
      width: 18,
      height: 18,
      // Kept at roughly the same fraction of the side as when the box was 22px
      // (7/22 ≈ 0.32) so the corner reads the same shape rather than pinched.
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** A task mid-focus or locked by a finished timer. */
    checkboxDisabled: {
      opacity: 0.35,
    },
    checkboxDone: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    todoBody: {
      flex: 1,
    },
    todoText: {
      fontSize: 16,
      flex: 1,
      marginRight: 12,
      color: c.text,
    },
    completedText: {
      textDecorationLine: 'line-through',
      color: c.textDisabled,
    },
    /**
     * The notes line.
     *
     * Muted and one step smaller than the title so the title still reads first, and
     * clamped to two lines so a long note cannot make one row taller than the rest
     * of the list. Hidden on a completed task for the same reason the date is: the
     * detail belongs to work that is finished.
     */
    notes: {
      fontSize: 13,
      lineHeight: 17,
      color: c.textMuted,
      // Tight against the title rather than spaced like the date line below it, so
      // title and notes read as one block.
      marginTop: 2,
    },
    /**
     * Shared by the due date, the timer readout and the lock badge.
     *
     * These three are mutually exclusive in practice — a locked task's timer has
     * ended — but they share one rule rather than three copies of it, so they
     * cannot end up with different spacing.
     */
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    dueText: {
      fontSize: 12,
      color: c.textMuted,
    },
    /**
     * A date that has already passed.
     *
     * Colour alone carries the status: the label already gives the date, and the
     * list's `Overdue` heading says what the colour means. Weight as well as
     * colour, so it does not rely on red being distinguishable from grey.
     */
    dueTextOverdue: {
      color: c.danger,
      fontWeight: '600',
    },
    timerText: {
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    lockText: {
      fontSize: 11,
      color: c.primary,
    },
    actionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconButton: {
      // A 24px glyph is a 24px target, which is under the 44px comfortable
      // minimum. This does not reach 44px either, but it widens the pressable to
      // the same 34px the labelled Focus button gives, and adds no visual weight.
      paddingHorizontal: 5,
      paddingVertical: 5,
    },
    focusButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
    },
    focusButtonText: {
      color: c.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    actionButton: {
      color: c.primary,
      fontSize: 16,
      marginHorizontal: 8,
    },
    taskTagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    taskTagChip: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    taskTagText: {
      fontSize: 12,
      fontWeight: '600',
    },
  });
};