module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Rewrites worklets so Reanimated gestures can run on the UI thread.
  // Must stay last in the plugin list.
  plugins: ['react-native-worklets/plugin'],
};