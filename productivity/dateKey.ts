/**
 * Day keys live in `shared/date.ts` now.
 *
 * The task domain and the scoring layer both need local day keys, so neither
 * domain should own them; the functions and the `DayKey` type moved to
 * `shared/date`. This module re-exports that surface under the path every file
 * in `productivity/` already imports, so the move is invisible inside the layer
 * — and `productivity/domain.ts` keeps re-exporting it to the rest of the app.
 */

export * from '../shared/date';
