module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Jest config and setup run under Node with the Jest globals injected.
      // Without this they lint as plain scripts and every `jest.mock` reads as
      // an undefined identifier.
      files: ['jest.config.js', 'jest.setup.js'],
      env: { jest: true, node: true },
    },
  ],
};
