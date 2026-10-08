import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import {
  addYears,
  formatDueLabel,
  localDateFromDayKey,
  localDateKey,
  todayKey,
  type DayKey,
} from '../productivity';
import { AVAILABLE_TAGS, accentFor, textOnAccent, tintOf } from '../todos/tags';
import type { Todo } from '../todos/model';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

/** What the modal hands back. Deliberately not a `Todo`: the id is the caller's. */
export type TodoDraft = {
  text: string;
  notes?: string;
  dueDate?: DayKey;
  /**
   * The chosen tag, or absent for none.
   *
   * One tag or none — the `#` control offers the vocabulary and takes a single
   * pick, which is the one-element contract `Todo.tags` already speaks. The sheet
   * prefills it from the task being edited, or from the tag screen a new task is
   * being born on.
   */
  tag?: string;
};

export type AddTodoModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (draft: TodoDraft) => void;
  /**
   * The tag a new task should start with: the tag screen's own tag when creating
   * from one.
   *
   * Prefilled rather than applied silently after the fact, so a task created on
   * the `#gym` screen visibly *is* the `#gym` task and stays on that screen — and
   * the person who makes it can opt out. Ignored while editing, where the task's
   * own tag prefills instead.
   */
  defaultTag?: string;
  /**
   * The task being edited, or absent for a new one.
   *
   * One sheet for both jobs rather than a second edit form. They are the same three
   * fields in the same order, and two components for that would be two places to
   * keep working — and a third way for a task to be created, given the paths that
   * already exist. The draft does not carry the id, so the caller decides how to
   * merge: `id` and `createdAt` are not form data and never become it.
   */
  task?: Todo | null;
};

/** How far ahead a due date may be set. The picker bounds need an end. */
const MAX_YEARS_AHEAD = 5;

type Styles = ReturnType<typeof createStyles>;

/**
 * Create or edit a task: title, optional notes, optional date — and one optional tag.
 *
 * This replaces the single-line `TextInput` that used to sit in the header, rather
 * than sitting beside it. Two creation paths would mean two things to keep working
 * and two ways for a task to be born, and the second one would quietly become the
 * one nobody maintains. The same sheet now also edits, because a task with its
 * fields does not justify a second component for editing them.
 *
 * The tag sits behind a `#` button rather than in an always-open chip row. The
 * chips left this sheet once — the tag is a grouping tool, and a full five-tag row
 * is a lot of permanent furniture for a thing most tasks will never need. Behind
 * `#` it is there for the task that does want it, and nothing to the task that
 * does not.
 *
 * Autofocus and submit-on-return are there because removing the inline field also
 * removed the fastest path to a task. Anything that made adding a task take more
 * steps than typing it and pressing `+` would be a regression dressed as a
 * feature.
 */
export function AddTodoModal({
  visible,
  onClose,
  onSubmit,
  defaultTag,
  task,
}: AddTodoModalProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState<DayKey | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  // `tagLabel` rather than `tag`: the chip loop below binds `tag` to each available
  // tag in turn, and a state variable of the same name would be shadowed by it.
  const [tagLabel, setTagLabel] = useState<string | null>(null);
  /** Whether the `#`-revealed chip row is out. */
  const [tagOpen, setTagOpen] = useState(false);
  /** Whether the keyboard is covering the lower fields. */
  const [keyboardUp, setKeyboardUp] = useState(false);

  const titleRef = useRef<TextInput>(null);

  /** Editing an existing task rather than creating one. */
  const editing = task != null;

  // Read once per render, not once per use: it labels a relative date, and the
  // answer cannot change while the sheet is open.
  const today = todayKey();

  /**
   * Reset on open, not on close.
   *
   * Clearing after a submit means a double-tap leaves an empty sheet with a stale
   * draft on screen, and the reset cannot be observed without rendering. Clearing
   * on the way in means every open starts from the same place regardless of what
   * happened last time.
   *
   * In edit mode "the same place" is the task's current values, so the fields
   * arrive already filled — the point of the edit sheet is to change them, not to
   * re-enter them. A new task starts untagged unless its screen brings a tag: the
   * `defaultTag` from a tag view, so a task born there is visibly that tag.
   */
  useEffect(() => {
    if (!visible) return;
    setText(task?.text ?? '');
    setNotes(task?.notes ?? '');
    setDueDate(task?.dueDate);
    setShowPicker(false);
    // Only a vocabulary tag can prefill: a chip row shows chips, and a stored
    // label that no longer exists in the vocabulary is shown nowhere. Leaving it
    // out keeps the edit form honest — the caller side of the merge keeps the
    // task's old tag intact when the draft has no new one.
    const storedTag = task?.tags?.[0];
    setTagLabel(
      task
        ? AVAILABLE_TAGS.some((available) => available.label === storedTag)
          ? storedTag ?? null
          : null
        : defaultTag ?? null,
    );
    setTagOpen(false);
    setKeyboardUp(false);
    // Deferred so the field exists and has been laid out before it takes focus.
    // Focusing synchronously from the open animation makes the keyboard animate in
    // against an unrendered field, and the sheet visibly jumps.
    const focus = setTimeout(() => titleRef.current?.focus(), 250);
    return () => clearTimeout(focus);
    // `task` is stable while the sheet is open: it comes from the same `todos`
    // array, which only changes on submit, so this does not refire under the
    // once-a-second timer re-render. `defaultTag` only changes with the screen,
    // which cannot happen while a sheet covers it.
  }, [visible, task, defaultTag]);

  const canSubmit = text.trim().length > 0;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit({
      text: text.trim(),
      // Trimmed, and dropped when empty. The model stores notes as absent rather
      // than `''`, so that "no notes" stays distinguishable from "cleared" — which
      // means an all-whitespace entry has to become `undefined` here or it would be
      // saved as a note the user never wrote.
      notes: notes.trim().length > 0 ? notes.trim() : undefined,
      dueDate,
      // One tag or none, whichever the `#` control ends on. `undefined` means the
      // caller keeps whatever the task already had; a label means it replaces it.
      tag: tagLabel ?? undefined,
    });
  }, [canSubmit, dueDate, notes, onSubmit, tagLabel, text]);

  /**
   * The user settled on a date.
   *
   * This is the library's `onValueChange` rather than its older `onChange`, which
   * is deprecated and warns on every render. The replacement also removes the two
   * pieces of ceremony the old callback needed: a check for whether a date had
   * actually been attached, and a branch on `event.type === 'dismissed'`.
   *
   * The `Date` becomes a day key through `localDateKey`. `toISOString` is the wrong
   * tool here for the reason the rest of the app avoids it — it converts to UTC, so
   * a date chosen late in the evening would be stored as the following morning.
   */
  const handleValueChange = useCallback((_event: DateTimePickerChangeEvent, date: Date) => {
    setDueDate(localDateKey(date.getTime()));
  }, []);

  const handlePickerDismiss = useCallback(() => {
    // Android's picker is a dialog and closes itself — after a selection as well as
    // on cancel, so this fires either way. Hiding on dismiss is therefore correct
    // regardless of how the dialog closed, and never discards the date
    // `handleValueChange` has already stored. iOS renders inline, has no dialog to
    // dismiss, and so never calls this: the calendar stays open for browsing and is
    // closed by tapping the date row again.
    setShowPicker(false);
  }, []);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheet}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={styles.headerButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{editing ? 'Edit task' : 'New task'}</Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Save changes' : 'Add task'}
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={submit}
            style={styles.headerButton}
          >
            <Text style={[styles.addText, !canSubmit && styles.addTextDisabled]}>
              {editing ? 'Save' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={keyboardUp ? styles.bodyKeyboardUp : styles.body}
          keyboardShouldPersistTaps="handled"
          // A drag dismisses the keyboard, so the extra bottom padding that
          // `KeyboardAvoidingView` bought has to come back with it or the last
          // field stays unreachable behind the sticky bar.
          onScrollBeginDrag={() => setKeyboardUp(false)}
          style={styles.flex}
        >
          <Field label="Title" required styles={styles}>
            <TextInput
              accessibilityLabel="Task title"
              blurOnSubmit={false}
              onChangeText={setText}
              onFocus={() => setKeyboardUp(true)}
              onSubmitEditing={submit}
              placeholder="What needs doing?"
              placeholderTextColor={t.colors.textDisabled}
              ref={titleRef}
              returnKeyType="done"
              style={styles.input}
              value={text}
            />
          </Field>

          <Field
            hint="Optional. Anything worth remembering about this."
            label="Notes"
            styles={styles}
          >
            <TextInput
              accessibilityLabel="Task notes"
              multiline
              onChangeText={setNotes}
              onFocus={() => setKeyboardUp(true)}
              placeholder="Details, links, the reason this is on the list"
              placeholderTextColor={t.colors.textDisabled}
              style={[styles.input, styles.notesInput]}
              textAlignVertical="top"
              value={notes}
            />
          </Field>

          <Field
            hint="Optional. One tag from the list."
            label="Tag"
            styles={styles}
          >
            <View style={styles.tagRow}>
              <TouchableOpacity
                accessibilityLabel="Choose a tag"
                accessibilityRole="button"
                accessibilityState={{ expanded: tagOpen, selected: tagLabel != null }}
                onPress={() => setTagOpen((open) => !open)}
                style={[
                  styles.tagAnchor,
                  tagLabel != null && {
                    backgroundColor: tintOf(accentFor(tagLabel)),
                    borderColor: tintOf(accentFor(tagLabel)),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagAnchorGlyph,
                    { color: tagLabel != null ? accentFor(tagLabel) : t.colors.textMuted },
                  ]}
                >
                  #
                </Text>
              </TouchableOpacity>
              <Text
                numberOfLines={1}
                style={[styles.tagAnchorValue, tagLabel != null && { color: accentFor(tagLabel) }]}
              >
                {tagLabel ?? 'None'}
              </Text>
            </View>

            {tagOpen && (
              <View style={styles.tagChips}>
                {AVAILABLE_TAGS.map((tag) => {
                  const selected = tagLabel === tag.label;
                  return (
                    <TouchableOpacity
                      accessibilityLabel={`Tag ${tag.label}`}
                      accessibilityRole="button"
                      // The selected-ness is carried by `accessibilityState`, not by
                      // changing the label. Both VoiceOver and TalkBack announce that
                      // state on their own, and a control whose *name* changes the
                      // moment you press it is harder to operate than one that does not.
                      accessibilityState={{ selected }}
                      key={tag.label}
                      onPress={() => setTagLabel(selected ? null : tag.label)}
                      style={[
                        styles.tagChip,
                        {
                          backgroundColor: selected ? tag.accent : tintOf(tag.accent),
                          borderColor: selected ? tag.accent : tintOf(tag.accent),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagChipText,
                          {
                            color: selected
                              ? textOnAccent(tag.accent, t.mode)
                              : tag.accent,
                          },
                        ]}
                      >
                        {tag.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Field>

          <Field
            hint="Optional. A day, not a deadline time."
            label="Date"
            styles={styles}
          >
            <TouchableOpacity
              accessibilityLabel={
                dueDate
                  ? `Due date, ${labelFor(dueDate, today)}. Tap to change.`
                  : 'Add a due date'
              }
              accessibilityRole="button"
              onPress={() => setShowPicker((open) => !open)}
              style={styles.dateRow}
            >
              <MaterialCommunityIcons
                color={dueDate ? t.colors.primary : t.colors.textMuted}
                name="calendar-blank-outline"
                size={18}
              />
              <Text style={[styles.dateText, !dueDate && styles.dateTextEmpty]}>
                {dueDate ? labelFor(dueDate, today) : 'Add a date'}
              </Text>
            </TouchableOpacity>

            {dueDate && (
              <TouchableOpacity
                accessibilityLabel="Remove due date"
                accessibilityRole="button"
                onPress={() => {
                  setDueDate(undefined);
                  setShowPicker(false);
                }}
                style={styles.clearDate}
              >
                <Text style={styles.clearDateText}>Remove date</Text>
              </TouchableOpacity>
            )}
          </Field>

          {showPicker && (
            <DateTimePicker
              // iOS gets the inline calendar, because the sheet is already a modal
              // and stacking a second one for the picker would be two dismissals to
              // get out. Android ignores `display` and opens its own dialog.
              accentColor={t.colors.primary}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={localDateFromDayKey(addYears(today, MAX_YEARS_AHEAD))}
              minimumDate={localDateFromDayKey(today)}
              mode="date"
              onDismiss={handlePickerDismiss}
              onValueChange={handleValueChange}
              // The calendar is native chrome: left alone it follows the *system*
              // scheme, which is wrong the moment the app's own preference is dark on
              // a light system (or vice versa). The app theme is the one that counts,
              // so force it (iOS only; Android's dialog reads the app appearance).
              themeVariant={t.mode}
              value={localDateFromDayKey(dueDate ?? today)}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * One labelled field with an optional hint.
 *
 * Module-level and given `styles` explicitly rather than defined inside
 * `AddTodoModal`: a component defined in its parent's body is a new type on every
 * render, which remounts the field and its `TextInput` — dropping focus mid-typing.
 * That is exactly why it takes the theme styles as a prop instead of reaching for
 * `useTheme` itself, which would have been the tidier-looking mistake.
 */
function Field({
  children,
  hint,
  label,
  required,
  styles,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
  required?: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required && <Text style={styles.labelMeta}>Required</Text>}
      </View>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/**
 * The same label the task row shows, so a date reads identically in both places.
 *
 * `formatDueLabel` returns `''` only for a day key it cannot parse, which the
 * picker cannot produce — so this is a belt-and-braces fallback, not a path
 * anything should reach. Showing the raw key would be worse than a gap.
 */
function labelFor(day: DayKey, today: DayKey): string {
  return formatDueLabel(day, today) || day;
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    /**
     * The modal's root. Without a colour here the sheet's body would fall through
     * to the native modal card background, which the app's dark theme does not
     * control — a dark header over a light page. Painting the card explicitly in
     * the theme surface keeps the whole pageSheet one colour in both modes.
     */
    sheet: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      // A `pageSheet` carries no top safe-area inset of its own, so without this
      // the Cancel button sits under the status bar.
      paddingTop: Platform.OS === 'ios' ? 56 : 16,
      paddingBottom: 12,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
      backgroundColor: c.background,
    },
    headerButton: {
      // A 44px target, which the 16px text alone would not be. `minWidth` keeps
      // Cancel and Add optically balanced around the centred title.
      minWidth: 64,
      minHeight: 44,
      justifyContent: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: c.text,
    },
    cancelText: {
      fontSize: 16,
      color: c.textMuted,
      paddingHorizontal: 8,
    },
    addText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.primary,
      paddingHorizontal: 8,
    },
    addTextDisabled: {
      color: c.textDisabled,
    },
    body: {
      padding: 16,
      paddingBottom: 40,
    },
    bodyKeyboardUp: {
      padding: 16,
      // Room for the notes field plus the keyboard. Padded on the scroll content
      // rather than using `KeyboardAvoidingView` alone, because the sheet does not
      // resize and there is nothing else for it to push against.
      paddingBottom: 180,
    },
    field: {
      marginBottom: 22,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
    },
    labelMeta: {
      fontSize: 11,
      color: c.textDisabled,
    },
    hint: {
      fontSize: 12,
      color: c.textDisabled,
      marginTop: 6,
      lineHeight: 16,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.surface,
    },
    notesInput: {
      minHeight: 88,
    },
    /**
     * The `#` control. A compact anchor rather than another full field row, so the
     * tag is invisible to the task that does not want one.
     */
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    tagAnchor: {
      width: 36,
      height: 36,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    /** The `#` glyph. A literal is fine here — it is the button's name, not a colour. */
    tagAnchorGlyph: {
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 24,
    },
    tagAnchorValue: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: c.textMuted,
    },
    tagChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
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
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 13,
      backgroundColor: c.surface,
    },
    dateText: {
      fontSize: 16,
      fontWeight: '500',
      color: c.primary,
    },
    dateTextEmpty: {
      fontWeight: '400',
      color: c.textMuted,
    },
    clearDate: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingVertical: 6,
      paddingRight: 8,
    },
    clearDateText: {
      fontSize: 13,
      color: c.danger,
    },
  });
};