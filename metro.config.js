const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      // react-native-haptic-feedback v3 points its package.json "react-native"
      // field at raw TypeScript in src/. Metro cannot always transform that
      // (it is resolved as a haste/node_modules mix), so point Metro at the
      // prebuilt CommonJS output instead.
      'react-native-haptic-feedback': path.resolve(
        __dirname,
        'node_modules/react-native-haptic-feedback/lib/commonjs',
      ),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
