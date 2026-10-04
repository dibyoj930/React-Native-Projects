/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { NewAppScreen } from '@react-native/new-app-screen';
import React, { useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import WelcomeComponent from './WelcomeComponent';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NotificationProvider } from './notifications';
import { useTheme } from './theme/useTheme';
import type { Theme } from './theme/theme';

function App() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  return (
    // Must stay outermost so the swipe gestures are received before any child
    // view claims the touch.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NotificationProvider>
          <StatusBar
            barStyle={t.mode === 'dark' ? 'light-content' : 'dark-content'}
            backgroundColor={t.colors.background}
          />
          <AppContent />
        </NotificationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);

  return (
    <View style={styles.container}>
      {/* <NewAppScreen
        templateFileName="App.tsx"
        safeAreaInsets={safeAreaInsets}
      /> */}

      <WelcomeComponent />
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
