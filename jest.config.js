const path = require('path');

/**
 * Jest configuration.
 *
 * Extends the React Native preset with the three things this project's
 * dependencies need and the preset does not provide:
 *
 *  1. Font assets. The preset's asset transformer covers images but not `.ttf`,
 *     which the icon library imports — that alone made the app smoke test fail
 *     to even parse.
 *  2. `transformIgnorePatterns`. The preset whitelists only the core packages,
 *     so every other RN library shipped untranspiled ESM and blew up on its
 *     first `import` statement.
 *  3. Native module mocks, in `jest.setup.js`.
 */

const rnPackages = [
  '(jest-)?react-native',
  '@react-native(-community)?',
  '@react-native-vector-icons',
  '@react-native-async-storage',
  '@notifee',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-safe-area-context',
  'react-native-timer-picker',
  'react-native-svg',
].join('|');

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: [path.join(__dirname, 'jest.setup.js')],
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf)$': require.resolve(
      '@react-native/jest-preset/jest/assetFileTransformer.js',
    ),
  },
  transformIgnorePatterns: [`node_modules/(?!(${rnPackages})/)`],
  // The preset collects every file under `__tests__`, which sweeps up the shared
  // render helpers in `__tests__/support/` and fails them as suites with no tests.
  // `node_modules` is repeated because setting this key replaces the preset's
  // default rather than adding to it.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/support/'],
};
