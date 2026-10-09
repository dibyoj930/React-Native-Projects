import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import WelcomeComponent, { type Screen } from './WelcomeComponent';
import { NotificationProvider } from './notifications';
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

  return (
    <View style={styles.container}>
      <WelcomeComponent onNavigate={setScreen} screen={screen} />
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
  });

export default App;
