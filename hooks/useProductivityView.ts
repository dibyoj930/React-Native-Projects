/**
 * The home screen's productivity controller: turns the productivity snapshot
 * into what the two cards render.
 *
 * "Turn what into what" is the whole job. `TodayCard` and
 * `ProductivityDashboard` are dumb views now — they render the model they are
 * handed and report taps — so the decisions that used to live in their JSX
 * (which sentence says the momentum band, what "30m / 45m" reads like, how a
 * milestone celebration reads, how tall each bar is) move up to the controller.
 * The pure half of each decision still lives under `productivity/`
 * (`buildFocusChart`, the ladder maths, the formatters); this file is only the
 * composition that crosses domains — the goals half of the Today tile lives in
 * `daily-goals/`, the momentum sentence in `productivity/`.
 *
 * `buildTodayViewModel` and `buildHistoryViewModel` are exported alongside the
 * hook so the card tests can build a model without mounting a provider.
 */
import { useMemo } from 'react';

import { goalsProgress, motivationFor, type DailyGoals } from '../daily-goals';
import {
  buildFocusChart,
  type DayRollup,
  type FocusBarViewModel,
  formatDayRange,
  formatDuration,
  type MomentumBand,
  MOMENTUM_BAND_LABELS,
  type StreakResult,
  useProductivity,
} from '../productivity';

/** Everything the Today tile prints. Nothing here is derived in the view. */
export type TodayViewModel = {
  /** The momentum band's sentence — e.g. `🔥 You're in the flow`. */
  momentumLabel: string;
  /** `30m / 45m` — today's focus measured against the focus goal. */
  focusLine: string;
  /** `2 / 3` — tasks closed measured against the task goal. */
  tasksLine: string;
  /** Progress toward the focus goal, 0..1. */
  focusRatio: number;
  /** Progress toward the task goal, 0..1. */
  tasksRatio: number;
  /** The encouragement line under the meters. */
  motivation: string;
};

/** The streak, reduced to the three numbers the history panel prints. */
export type StreakViewModel = {
  current: number;
  longest: number;
  freezesRemaining: number;
};

/**
 * The celebration banner, when the window's best day has crossed a milestone.
 *
 * `reachedMinutes` is the rung that was crossed, in minutes — the key the view
 * dismisses by, so patting away the 6h banner cannot silence the 8h one later.
 * The message is pre-formatted so the view never assembles a sentence.
 */
export type MilestoneViewModel = {
  reachedMinutes: number;
  message: string;
};

/** Everything the history panel prints, prepared above the view. */
export type HistoryViewModel = {
  streak: StreakViewModel;
  /**
   * The span the bars cover, e.g. `Feb 21 – Mar 6`. Empty when there is only
   * one day's worth of window.
   */
  rangeLabel: string;
  /** The chart's bars, oldest → newest, ready to render left-to-right. */
  bars: FocusBarViewModel[];
  /** The milestone celebration, or null below the first rung. */
  celebration: MilestoneViewModel | null;
};

/**
 * The Today tile's readout from the day's rollup, the momentum band and the
 * saved goals.
 *
 * A missing rollup is a quiet day: zero progress, and the momentum sentence
 * still leads the card.
 */
export function buildTodayViewModel(input: {
  todayRollup: DayRollup | undefined;
  momentumBand: MomentumBand;
  goals: DailyGoals;
}): TodayViewModel {
  const progress = goalsProgress(input.todayRollup, input.goals);
  const focusedSeconds = input.todayRollup?.focusedSeconds ?? 0;

  return {
    momentumLabel: MOMENTUM_BAND_LABELS[input.momentumBand],
    focusLine: `${formatDuration(focusedSeconds)} / ${formatDuration(
      input.goals.focusMinutes * 60,
    )}`,
    tasksLine: `${progress.tasksCompleted} / ${input.goals.tasksCompleted}`,
    focusRatio: progress.focusRatio,
    tasksRatio: progress.tasksRatio,
    motivation: motivationFor(progress),
  };
}

/**
 * The history panel's readout from the streak and the recent days.
 *
 * `recentDays` is newest-first (the snapshot's contract); `buildFocusChart`
 * owns the reversal and the bar maths, and the range label and the celebration
 * sentence are composed here.
 */
export function buildHistoryViewModel(input: {
  streak: StreakResult;
  recentDays: readonly DayRollup[];
}): HistoryViewModel {
  const chart = buildFocusChart(input.recentDays);

  const rangeLabel =
    input.recentDays.length > 1
      ? formatDayRange(
          input.recentDays[0].day,
          input.recentDays[input.recentDays.length - 1].day,
        )
      : '';

  const celebration =
    chart.reachedMinutes === null
      ? null
      : {
          reachedMinutes: chart.reachedMinutes,
          message: `🎉 You hit ${formatDuration(chart.reachedMinutes * 60)} of focus in a day — next target: ${formatDuration(chart.targetMinutes * 60)}`,
        };

  return {
    streak: {
      current: input.streak.current,
      longest: input.streak.longest,
      freezesRemaining: input.streak.freezesRemaining,
    },
    rangeLabel,
    bars: chart.bars,
    celebration,
  };
}

/**
 * The one hook the home screen needs: the two cards' models and today's rollup
 * for the Goals screen, all derived from the productivity snapshot and the
 * saved goals.
 */
export function useProductivityView(goals: DailyGoals) {
  const { snapshot } = useProductivity();

  const today = useMemo(
    () =>
      buildTodayViewModel({
        todayRollup: snapshot.todayRollup,
        momentumBand: snapshot.momentum.band,
        goals,
      }),
    [snapshot.todayRollup, snapshot.momentum.band, goals],
  );

  const history = useMemo(
    () =>
      buildHistoryViewModel({
        streak: snapshot.streak,
        recentDays: snapshot.recentDays,
      }),
    [snapshot.streak, snapshot.recentDays],
  );

  return { today, history, todayRollup: snapshot.todayRollup };
}