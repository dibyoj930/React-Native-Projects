import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { TimerPickerModal } from 'react-native-timer-picker';
import type { TimerPickerModalProps } from 'react-native-timer-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelTimerNotification,
  ensurePermission,
  scheduleTimerNotification,
  syncTimerNotification,
} from './notifications';
import { SwipeableTodoRow } from './components/SwipeableTodoRow';
import { triggerHaptic } from './haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme/useTheme';
import type { Theme } from './theme/theme';

type TimerState = TimerPickerModalProps['initialValue'];

export type Todo = {
  id: string;
  text: string;
  completed: boolean;
  completedByTimer?: boolean;
  tags?: string[];
};

const PRESETS = [
  { minutes: 25, accent: '#FF6B6B', tint: '#FF6B6B' },
  { minutes: 30, accent: '#4ECDC4', tint: '#4ECDC4' },
  { minutes: 60, accent: '#FFD93D', tint: '#FFD93D' },
] as const;

const AVAILABLE_TAGS = [
  { label: '#architecture', accent: '#AF52DE' },
  { label: '#coding', accent: '#0A84FF' },
  { label: '#travel', accent: '#FF9F0A' },
  { label: '#practice', accent: '#30D158' },
  { label: '#gym', accent: '#FF375F' },
  { label: '#health', accent: '#64D2FF' },
  { label: '#study', accent: '#BF5AF2' },
  { label: '#blog', accent: '#FFD60A' },
] as const;

const TAG_ACCENTS: Record<string, string> = AVAILABLE_TAGS.reduce(
  (accents, tag) => {
    accents[tag.label] = tag.accent;
    return accents;
  },
  {} as Record<string, string>,
);

const accentFor = (tag: string): string => TAG_ACCENTS[tag] ?? '#007AFF';
/** Same hex as `accent` at ~12% opacity, for tinted chip backgrounds. */
const tintOf = (accent: string): string => `${accent}1F`;

/** WCAG relative luminance of a 6-digit hex colour. */
const luminanceOf = (hex: string): number => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const packed = parseInt(match[1], 16);
  const linear = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map(
    (raw) => {
      const channel = raw / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    },
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

/**
 * Picks a readable text colour for a filled chip. Bright accents (the yellows)
 * need dark text; the rest read better in white.
 */
const textOnAccent = (accent: string, mode: Theme['mode']): string =>
  luminanceOf(accent) > 0.45
    ? mode === 'dark'
      ? '#000000'
      : '#11181C'
    : '#FFFFFF';

const TAG_COLORS: Record<string, string> = {
  '#architecture': '#AF52DE',
  '#coding': '#007AFF',
  '#travel': '#FF9500',
  '#practice': '#FF3B30',
  '#gym': '#FF2D55',
  '#health': '#34C759',
  '#study': '#5856D6',
  '#blog': '#00C7BE',
};

const DEFAULT_TAG_COLOR = '#8E8E93';

const getTagColor = (tag: string): string => TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR;

export default function WelcomeComponent() {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  // Styles are theme-derived, so they are built per theme rather than once at
  // module scope. `useTheme` returns a stable object, so this only recomputes
  // when the system colour scheme actually flips.
  const styles = useMemo(() => createStyles(t), [t]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');
  const [editIndex, setEditIndex] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [timerEnds, setTimerEnds] = useState<Record<string, number>>({});
  const [runningTimers, setRunningTimers] = useState<Record<string, boolean>>({});
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const saveTodos = async (newTodos: Todo[]) => {
    try {
      await AsyncStorage.setItem('todos', JSON.stringify(newTodos));
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  };

  const loadTodos = async () => {
    try {
      const savedTodos = await AsyncStorage.getItem('todos');
      if (savedTodos) {
        setTodos(JSON.parse(savedTodos));
      }
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  };

  useEffect(() => {
    loadTodos();
  }, []);

  useEffect(() => {
    saveTodos(todos);
  }, [todos]);

  useEffect(() => {
    (async () => {
      const status = await ensurePermission();
      setPermissionStatus(status);
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimerEnds((prev) => ({ ...prev }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addTodo = () => {
    if (input.trim()) {
      const newTodo: Todo = {
        id: Date.now().toString(),
        text: input.trim(),
        completed: false,
        tags: selectedTag ? [selectedTag] : [],
      };
      setTodos([...todos, newTodo]);
      setInput('');
      setSelectedTag(null);
      triggerHaptic('taskAdded');
    }
  };

  const handleEdit = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      setEditIndex(id);
      setEditText(todo.text);
    }
  };

  const handleSave = (id: string) => {
    setTodos(todos.map((todo) => (todo.id === id ? { ...todo, text: editText } : todo)));
    setEditIndex(null);
    setEditText('');
  };

  const deleteTodo = (id: string) => {
    triggerHaptic('taskDeleted');
    cancelTimerNotification(id);
    setTodos((prevTodos) => prevTodos.filter((todo) => todo.id !== id));
    setTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRunningTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTimerEnds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleComplete = (id: string) => {
    const target = todos.find((todo) => todo.id === id);
    triggerHaptic(target?.completed ? 'taskUncompleted' : 'taskCompleted');
    cancelTimerNotification(id);
    setTodos((prevTodos) =>
      prevTodos.map((todo) =>
        todo.id === id
          ? { ...todo, completed: !todo.completed, completedByTimer: false }
          : todo,
      ),
    );
    setTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRunningTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTimerEnds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toSeconds = (t: TimerState | undefined | null): number => {
    if (!t) return 0;
    const hours = t.hours ?? 0;
    const minutes = t.minutes ?? 0;
    const seconds = t.seconds ?? 0;
    return (hours * 60 + minutes) * 60 + seconds;
  };

  const startPresetTimer = (minutes: number) => {
    const unfinished = todos.filter((t) => !t.completed);
    let targetId: string | null = null;
    if (unfinished.length > 0) {
      targetId = unfinished[unfinished.length - 1].id;
    } else {
      const newTodo: Todo = {
        id: Date.now().toString(),
        text: `${minutes} min focus`,
        completed: false,
        tags: [],
      };
      setTodos((prev) => [...prev, newTodo]);
      targetId = newTodo.id;
    }

    if (!targetId) return;

    const seconds = minutes * 60;
    const picked = {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
      seconds: 0,
    } as TimerState;
    setTimers((prev) => ({ ...prev, [targetId]: picked }));
    setRunningTimers((prev) => ({ ...prev, [targetId]: true }));
    const end = Date.now() + seconds * 1000;
    setTimerEnds((prev) => ({ ...prev, [targetId]: end }));
    scheduleTimerNotification({ timerId: targetId, title: 'Timer done', body: 'Time is up', fireAt: end });
    setSelectedPreset(null);
  };

  const openTimerPicker = (id: string) => {
    setPickerTargetId(id);
    setPickerVisible(true);
  };

  const handleTimerConfirm = (picked: TimerState) => {
    if (pickerTargetId) {
      const totalSec = toSeconds(picked);
      if (totalSec <= 0) {
        setPickerVisible(false);
        setPickerTargetId(null);
        return;
      }
      setTimers((prev) => ({ ...prev, [pickerTargetId]: picked as TimerState }));
      setRunningTimers((prev) => ({ ...prev, [pickerTargetId]: true }));
      const endPicker = Date.now() + totalSec * 1000;
      setTimerEnds((prev) => ({ ...prev, [pickerTargetId]: endPicker }));
      syncTimerNotification({ timerId: pickerTargetId, title: 'Timer done', body: 'Time is up', fireAt: endPicker });
    }
    setPickerVisible(false);
    setPickerTargetId(null);
  };

  const handleTimerCancel = () => {
    setPickerVisible(false);
    setPickerTargetId(null);
  };

  const handleStartPreset = () => {
    if (selectedPreset === null) return;
    startPresetTimer(selectedPreset);
  };

  const stopTimer = (id: string) => {
    cancelTimerNotification(id);
    setTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRunningTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTimerEnds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleTimerRunning = (id: string) => {
    const willRun = !runningTimers[id];
    if (willRun) {
      const timer = timers[id];
      if (timer) {
        const end = Date.now() + toSeconds(timer) * 1000;
        setTimerEnds((prev) => ({ ...prev, [id]: end }));
        setRunningTimers((prev) => ({ ...prev, [id]: true }));
        syncTimerNotification({ timerId: id, title: 'Timer done', body: 'Time is up', fireAt: end });
      } else {
        setRunningTimers((prev) => ({ ...prev, [id]: true }));
      }
    } else {
      const end = timerEnds[id];
      if (end) {
        const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        setTimers((prev) => ({ ...prev, [id]: { hours: h, minutes: m, seconds: s } as TimerState }));
      }
      setTimerEnds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRunningTimers((prev) => ({ ...prev, [id]: false }));
      cancelTimerNotification(id);
    }
  };

  const formatTimeForTodo = (id: string, t: TimerState | undefined | null): string => {
    const end = timerEnds[id];
    if (end) {
      const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    if (t) {
      const pad = (n: number | undefined) => (n ?? 0).toString().padStart(2, '0');
      return `${pad(t.hours)}:${pad(t.minutes)}:${pad(t.seconds)}`;
    }
    return '00:00:00';
  };

  const exportTodos = async () => {
    if (todos.length === 0) {
      Alert.alert('Nothing to export', 'Add a task before exporting your list.');
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      totalTasks: todos.length,
      completedTasks: todos.filter((todo) => todo.completed).length,
      tasks: todos.map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        completedByTimer: todo.completedByTimer ?? false,
        tags: todo.tags ?? [],
      })),
    };

    const fileName = `todos-${payload.exportedAt.slice(0, 10)}.json`;
    const json = JSON.stringify(payload, null, 2);

    try {
      // iOS/Android share sheet: lets the user save to Files, send to mail, etc.
      // The filename is passed through the message so it survives the round trip.
      await Share.share({
        title: 'Export tasks',
        message: `${fileName}\n\n${json}`,
      }, { subject: fileName });
    } catch (error) {
      console.error('Failed to export todos:', error);
      Alert.alert('Export failed', 'Could not open the share sheet.');
    }
  };

  const completedByTimerCount = todos.filter((todo) => todo.completedByTimer).length;
  const progress = todos.length > 0 ? completedByTimerCount / todos.length : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>Todo App</Text>

      {permissionStatus === 'denied' && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Notifications are off, so timer alerts will not reach you.
          </Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add a new todo..."
          value={input}
          onChangeText={setInput}
          placeholderTextColor={t.colors.textDisabled}
        />
        <TouchableOpacity style={styles.addButton} onPress={addTodo}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        {PRESETS.map((preset) => {
          const selected = selectedPreset === preset.minutes;
          return (
            <TouchableOpacity
              key={preset.minutes}
              activeOpacity={0.7}
              onPress={() => setSelectedPreset(selected ? null : preset.minutes)}
              style={[
                styles.chip,
                { backgroundColor: selected ? preset.tint : `${preset.tint}26` },
                selected && { transform: [{ scale: 1.05 }] },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: selected
                      ? textOnAccent(preset.accent, t.mode)
                      : preset.accent,
                  },
                ]}
              >
                {preset.minutes} min
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedPreset !== null && (
        <TouchableOpacity style={styles.startButton} onPress={handleStartPreset}>
          <Text style={styles.startButtonText}>
            Start {selectedPreset} min focus
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { flex: progress }]} />
        <View style={[styles.progressBarEmpty, { flex: 1 - progress }]} />
      </View>
      <Text style={styles.progressText}>
        {completedByTimerCount} of {todos.length} tasks completed by timer
      </Text>

      <TimerPickerModal
        closeOnOverlayPress
        LinearGradient=""
        modalProps={{
          overlayOpacity: 0.2,
        }}
        modalTitle="How far you want to stay focused!"
        onCancel={handleTimerCancel}
        onConfirm={(picked) => handleTimerConfirm(picked as TimerState)}
        setIsVisible={setPickerVisible}
        styles={{
          theme: t.mode,
        }}
        visible={pickerVisible}
      />

      <FlatList
        style={styles.list}
        data={todos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SwipeableTodoRow
            hasTimer={!!timers[item.id]}
            onDelete={() => deleteTodo(item.id)}
            onStopTimer={() => stopTimer(item.id)}
          >
            <View style={styles.todoItem}>
              {item.id === editIndex ? (
                <>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editText}
                    onChangeText={(text) => setEditText(text)}
                  />
                  <TouchableOpacity onPress={() => handleSave(item.id)}>
                    <Text style={styles.actionButton}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => toggleComplete(item.id)}
                    style={{ flex: 1 }}
                  >
                    <Text
                      style={[
                        styles.todoText,
                        item.completed && styles.completedText,
                      ]}
                    >
                      {item.text}
                    </Text>
                    {timers[item.id] && (
                      <View style={styles.timerDisplay}>
                        <MaterialCommunityIcons
                          name={
                            runningTimers[item.id]
                              ? 'timer-sand'
                              : 'timer-off-outline'
                          }
                          size={14}
                          color={t.colors.textMuted}
                        />
                        <Text style={styles.timerText}>
                          {formatTimeForTodo(item.id, timers[item.id])}
                        </Text>
                      </View>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <View style={styles.taskTagsContainer}>
                        {item.tags.map((tag, idx) => {
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
                  </TouchableOpacity>
                  <View style={styles.actionContainer}>
                    {timers[item.id] ? (
                      <>
                        <TouchableOpacity onPress={() => toggleTimerRunning(item.id)}>
                          <MaterialCommunityIcons
                            name={
                              runningTimers[item.id]
                                ? 'pause-circle-outline'
                                : 'play-circle-outline'
                            }
                            size={24}
                            color={t.colors.text}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => stopTimer(item.id)}>
                          <MaterialCommunityIcons
                            name="stop-circle-outline"
                            size={24}
                            color={t.colors.danger}
                          />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity onPress={() => openTimerPicker(item.id)}>
                        <MaterialCommunityIcons name="timer-outline" size={24} color={t.colors.text} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleEdit(item.id)}>
                      <Text style={styles.actionButton}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </SwipeableTodoRow>
        )}
        ListFooterComponent={
          <View style={styles.tagsSection}>
            <Text style={styles.tagsHeader}>Tags</Text>
            <View style={styles.tagsChipRow}>
              {AVAILABLE_TAGS.map((tag) => {
                const selected = selectedTag === tag.label;
                return (
                  <TouchableOpacity
                    key={tag.label}
                    activeOpacity={0.7}
                    onPress={() => setSelectedTag(selected ? null : tag.label)}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: selected
                          ? tag.accent
                          : tintOf(tag.accent),
                        borderColor: selected ? tag.accent : tintOf(tag.accent),
                      },
                      selected && styles.tagChipSelected,
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
          </View>
        }
        scrollEnabled={true}
      />

      {/* Fixed footer: always anchored to the bottom of the screen, outside the
          scrollable list so it stays put no matter how long the list is.
          Padded by the bottom safe-area inset so the home indicator never
          clips the button. */}
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
          onPress={exportTodos}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="download" size={18} color={t.colors.primaryText} />
          <Text style={styles.exportButtonText}>
            Download / Export{'\n'}({todos.length}{' '}
            {todos.length === 1 ? 'task' : 'tasks'})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: c.background,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 16,
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
    inputContainer: {
      flexDirection: 'row',
      marginBottom: 12,
      gap: 8,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.background,
    },
    addButton: {
      backgroundColor: c.primary,
      width: 50,
      height: 50,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addButtonText: {
      color: c.primaryText,
      fontSize: 24,
      fontWeight: 'bold',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
    },
    startButton: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    startButtonText: {
      color: c.primaryText,
      fontSize: 16,
      fontWeight: '600',
    },
    progressBarContainer: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 5,
      backgroundColor: c.progressTrack,
      overflow: 'hidden',
      marginBottom: 16,
    },
    progressBarFill: {
      backgroundColor: c.primary,
    },
    progressBarEmpty: {
      backgroundColor: c.progressTrack,
    },
    progressText: {
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 16,
      textAlign: 'center',
      color: c.textMuted,
    },
    list: {
      flex: 1,
    },
    todoItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: c.surface,
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
    timerDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    timerText: {
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    actionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
    tagsSection: {
      paddingBottom: 8,
    },
    tagsHeader: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 10,
      color: c.text,
    },
    tagsChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
    },
    tagChipSelected: {
      transform: [{ scale: 1.05 }],
    },
    tagChipText: {
      fontSize: 12,
      fontWeight: '700',
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
    exportButtonDisabled: {
      backgroundColor: t.mode === 'dark' ? '#1C3A5E' : '#A5C9F5',
    },
    exportButtonText: {
      color: c.primaryText,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
};