import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

export const REVEAL_WIDTH = 160;

interface SwipeableTodoRowProps {
  children: React.ReactNode;
  /** True when the todo has a timer, which adds a stop action to the revealed pane. */
  hasTimer: boolean;
  onDelete: () => void;
  onStopTimer: () => void;
}

/**
 * Wraps a todo row so a left swipe reveals actions behind it (iOS Mail pattern).
 *
 * Left swipe slides the row to the left, revealing actions on its right.
 * Delete is reveal-then-tap (not instant swipe-to-delete) to avoid accidental
 * deletions while scrolling.
 */
export function SwipeableTodoRow({
  children,
  hasTimer,
  onDelete,
  onStopTimer,
}: SwipeableTodoRowProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  const renderRightActions = () => {
    if (hasTimer) {
      return (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.action, styles.stopAction]}
            onPress={onStopTimer}
            activeOpacity={0.9}
          >
            <MaterialCommunityIcons
              name="stop-circle-outline"
              size={22}
              color="#FFFFFF"
            />
            <Text style={styles.actionLabel}>Stop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.action, styles.deleteAction]}
            onPress={onDelete}
            activeOpacity={0.9}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={22}
              color="#FFFFFF"
            />
            <Text style={styles.actionLabel}>Delete</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.action, styles.deleteActionFull]}
          onPress={onDelete}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.actionLabel}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Swipeable
      friction={1.5}
      rightThreshold={REVEAL_WIDTH / 2}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      renderRightActions={renderRightActions}
      containerStyle={styles.swipeableContainer}
      childrenContainerStyle={styles.swipeableChildren}
    >
      {children}
    </Swipeable>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    swipeableContainer: {
      marginBottom: 10,
      borderRadius: 8,
      overflow: 'hidden',
      // Backing colour for the revealed pane, so no light flash shows through
      // the rounded corners while the row is swiped.
      backgroundColor: c.surface,
    },
    swipeableChildren: {
      borderRadius: 8,
    },
    actionsContainer: {
      flexDirection: 'row',
      alignItems: 'stretch',
      height: '100%',
      borderTopRightRadius: 8,
      borderBottomRightRadius: 8,
      overflow: 'hidden',
    },
    action: {
      width: 80,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingHorizontal: 8,
    },
    stopAction: {
      backgroundColor: t.mode === 'dark' ? '#FF9F0A' : '#FF9500',
    },
    deleteAction: {
      backgroundColor: c.danger,
    },
    deleteActionFull: {
      width: REVEAL_WIDTH,
      backgroundColor: c.danger,
    },
    actionLabel: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
};
