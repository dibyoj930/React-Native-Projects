/**
 * Public surface of the productivity layer for app code.
 *
 * The pure half is re-exported from `./domain`, which is guaranteed free of
 * React Native imports; only the two entries below reach outside the layer.
 * Tests should import from `./domain` so they cannot pick up a storage
 * dependency by accident.
 */

export * from './domain';

export { ProductivityProvider, useProductivity } from './ProductivityProvider';
