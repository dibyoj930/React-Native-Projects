import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import WelcomeComponent, { type Screen } from './WelcomeComponent';
import { useReminders } from './hooks/useReminders';
import { NotificationProvider, useNotifications } from './notifications';
import { ProductivityProvider } from './productivity';
import { ThemeProvider } from './theme/ThemeProvider';
import { useTheme } from './theme/useTheme';
import type { Theme } from './theme/theme';

/**
 * Provider order is load-bearing, not incidental:
 *
 *   GestureHandlerRootView  must be outermost so swipe gestures reach the rows
 *                           before any child view claims the touch.
 *   SafeAreaProvider        needs to be above anything reading insets.
 *   ThemeProvider           above everything, so the StatusBar and all nested
 *                           providers observe the same resolved appearance.
 *   NotificationProvider    before Productivity, which is mounted inside it.
 *   ProductivityProvider    above WelcomeComponent, which both feeds tasks into
 *                           it and reads statistics back out.
 */
function App() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NotificationProvider>
            <ProductivityProvider>
              <StatusBar
                barStyle={t.mode === 'dark' ? 'light-content' : 'dark-content'}
                backgroundColor={t.colors.background}
              />
              <AppContent />
            </ProductivityProvider>
          </NotificationProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Owns which screen is showing.
 *
 * This is the app's entire navigation: one piece of state with four values, held
 * above the component that needs it. There is no router here and none is warranted
 * — four destinations do not need a stack, a back stack or a dependency, and the
 * screens swap by rendering one or the other.
 *
 * The state lives out here rather than inside `WelcomeComponent` because that
 * component *is* the screen. A screen cannot navigate away from itself.
 */
function AppContent() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const { pressedTodoId, clearPressedTodo } = useNotifications();

  // The fade-and-slide every destination change runs through. `WelcomeComponent`
  // is never re-keyed, so the task controller above it survives navigation; only
  // these two values are reset and animated back to rest, which is what makes the
  // switch read as a transition rather than a jump.
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  // Read once, then held. A reduce-motion user asked for movement to stop, so the
  // wrapper snaps instead of animating — checked from a ref at transition time
  // rather than as state, so toggling it never replays the current screen.
  const reduceMotion = useRef(false);
  useEffect(() => {
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((value) => {
        reduceMotion.current = value === true;
      })
      .catch(() => undefined);
  }, []);

  // Reminders need both the notification layer and the productivity snapshot, so
  // they are reconciled here, below both providers.
  useReminders();

  // A tapped timer notification asks to see the task it was about, and the only
  // place a task is shown is the list. The intent is consumed as it is honoured,
  // so a later re-render cannot navigate a second time.
  useEffect(() => {
    if (!pressedTodoId) return;
    setScreen({ name: 'tasks' });
    clearPressedTodo();
  }, [pressedTodoId, clearPressedTodo]);

  // Android's hardware back has to be handled explicitly: without this it exits
  // the app from either screen, skipping the one step back the user expects. The
  // subscription is registered only while a sub-screen is up, so the gesture keeps
  // its default meaning — leaving the app — on home.
  useEffect(() => {
    if (screen.name === 'home') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setScreen({ name: 'home' });
        return true;
      },
    );
    return () => subscription.remove();
  }, [screen.name]);

  // Replays on every destination change. Home is the shallowest screen, so it
  // slides in from the left and everything else steps in from the right; sub-
  // screens are only ever reached and left through home, so two directions cover
  // every real move.
  useEffect(() => {
    const from = screen.name === 'home' ? -24 : 24;

    if (reduceMotion.current) {
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateX.setValue(from);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [screen.name, opacity, translateX]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.screen, { opacity, transform: [{ translateX }] }]}
      >
        <WelcomeComponent onNavigate={setScreen} screen={screen} />
      </Animated.View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Outermost view: painting it stops white showing before the first
      // render or during overscroll in dark mode.
      backgroundColor: t.colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: t.colors.background,
    },
    /** The transition wrapper: same box as the screen it carries. */
    screen: {
      flex: 1,
    },
  });

export default App;
