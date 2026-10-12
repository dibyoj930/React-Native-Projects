/**
 * The pure half of the replan layer, for app code and tests.
 *
 * Mirrors productivity/domain.ts: this barrel must NOT re-export
 * `replan/planStorage.ts` (AsyncStorage) or anything that reaches a native module.
 * A test that imports from here is proof the code under test needs no mocks.
 *
 * App code imports from `./index`; tests import from here.
 */

export * from './types';
export * from './preferences';
export * from './interval';
export * from './rank';
export * from './normalize';
export * from './validate';
export * from './explain';
export * from './engine';
export * from './planReminders';
