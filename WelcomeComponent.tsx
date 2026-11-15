import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TimerPickerModal } from 'react-native-timer-picker';

import { AddTodoModal } from './components/AddTodoModal';
import { AllTasksScreen } from './components/AllTasksScreen';
import { CareerModule } from './components/career/CareerModule';
import { GoalsScreen } from './components/GoalsScreen';
import { HomeScreen } from './components/HomeScreen';
import { PlanReviewScreen } from './components/PlanReviewScreen';
import { ReplanScreen } from './components/ReplanScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { TodoRow } from './components/TodoRow';
import { useDailyGoals, useProductivityView, useReplan, useSettings, useTaskScreen } from './hooks';
import { useCareerDevelopment } from './hooks/useCareerDevelopment';
import { useCareerRecommendations } from './hooks/useCareerRecommendations';
import { buildNextTaskViewModel } from './hooks';
import { useReplanSuggestions } from './hooks';
import { usePlanOutcome } from './hooks';
import { usePlanReview } from './hooks';
import { useReflection } from './hooks';
import type { TimerState } from './hooks';
import {
  buildCareerHomeSummary,
  buildCareerPlanReview,
  useCareer,
  type CareerRecommendation,
} from './career';
import type { Todo, TodoDraft } from './todos/model';
import { selectNextTask } from './todos/nextTask';
import { useTheme } from './theme/useTheme';
import type { Theme } from './theme/theme';

// The task model, the tag vocabulary and the storage boundary all live under
// `todos/`. Nothing is re-exported from here: the components that need them
// import the domain directly, and this module's own surface is the screen.

/**
 * Where the duration picker opens.
 *
 * These minutes used to drive a global "25 / 30 / 60 min" chip row above the
 * task list. That path is gone because it could not know which task it was for:
 * it fell back to `unfinished[unfinished.length - 1]` — the most recently *added*
 * task, silently — and when nothing was open it created a task literally named
 * "25 min focus" and started the timer on it.
 *
 * Choosing a duration now happens per task, via the picker, so the work being
 * focused on is never ambiguous. The picker library renders no custom content
 * slot, so the old three-chip shortcut is genuinely gone rather than relocated —
 * the picker opens on this value instead of zero, which reads as "nothing chosen".
 */
const DEFAULT_FOCUS_MINUTES = 25;

/**
 * Where the app is showing.
 *
 * A union rather than three booleans: exactly one screen is up at a time, and a
 * tag view that forgot which tag it is showing would render an unfiltered list
 * while looking perfectly correct. `name` carries which, and the tag carries its
 * own filter, so an impossible state cannot be built.
 */
export type Screen =
  | { name: 'home' }
  | { name: 'tasks' }
  | { name: 'tag'; tag: string }
  | { name: 'goals' }
  | { name: 'replan' }
  | { name: 'planReview' }
  | { name: 'career' }
  | { name: 'settings' };

export type WelcomeComponentProps = {
  /** Which screen to show. The union is on the `Screen` type above. */
  screen: Screen;
  onNavigate: (screen: Screen) => void;
};

/**
 * The composition point: which screen is showing, the two sheets, and the rows.
 *
 * The task logic — the list and its CRUD, the countdown and its picker, the
 * session log, and the rules that cross them — has a single home in
 * `hooks/useTaskScreen`, which this reads once. What is left here is only
 * composition: the screen switch, the two modals both screens share, and the
 * one-line `renderRow` that binds a task to the controller's row props. Keeping
 * the JSX in the view is why the controller returns `rowPropsFor` rather than a
 * renderer.
 *
 * The screens are still one component rather than three over a provider, and
 * that remains deliberate: there is one piece of navigation state (the `screen`
 * prop) and a provider would be a second way to reach what is already here. What
 * that buys is that the task list exists in exactly one place — the tasks screen
 * and its tag views are the same list under a predicate — instead of two.
 */
export default function WelcomeComponent({ screen, onNavigate }: WelcomeComponentProps) {
  const t = useTheme();
  // Styles are theme-derived, so they are built per theme rather than once at
  // module scope. `useTheme` returns a stable object, so this only recomputes
  // when the system colour scheme actually flips.
  const styles = useMemo(() => createStyles(t), [t]);
  const {
    todos,
    today,
    hydrated,
    anyTimerRunning,
    timerWindowFor,
    notificationsBlocked,
    editingTodo,
    draftPrefill,
    showTaskSheet,
    pickerVisible,
    setPickerVisible,
    handleTimerConfirm,
    handleTimerCancel,
    openCreate,
    openEdit,
    closeTaskSheet,
    submitTask,
    exportTodos,
    rowPropsFor,
    clearAllTasks,
    tags,
    addTag,
    focusSessions,
    setEstimatedMinutes,
    startFocusFor,
  } = useTaskScreen();

  // Settings reaches across four domains; its controller owns the confirmations
  // and the actions they gate. The task-list cleanup is passed in from the
  // controller above, so both read the one list rather than each keeping a copy.
  const settings = useSettings({
    taskCount: todos.length,
    onClearTasks: clearAllTasks,
  });

  // The user's daily targets live here, at the composition point, rather than in
  // the tile that shows them: the tile and the Goals & Preferences screen both
  // read the same fact, and a screen cannot own state it navigates away from.
  // One hook call means one hydration and one in-memory source of truth.
  const { goals, setGoals } = useDailyGoals();

  // The productivity controller turns the snapshot and the saved goals into the
  // two cards' models from one place, so the screens stay presentational. The
  // raw rollup is returned alongside for the goals screen, whose preview has to
  // follow the draft rather than the saved goals.
  const productivity = useProductivityView(goals);

  // The career document is independent of the task and focus stores. The home
  // card gets a derived summary, not the raw document, so the screen stays a view
  // and the same derivation is available if other destinations need it later.
  const career = useCareer();
  const careerHome = useMemo(
    () => buildCareerHomeSummary(career.doc, today),
    [career.doc, today],
  );

  // The bridge between the two stores. Career never reads tasks and tasks never
  // write career records; this controller holds both, derives practice, and
  // supplies the task sheet's link options.
  const development = useCareerDevelopment({ tasks: todos, sessions: focusSessions });

  // The replan controller owns the proposal, the approved plan and the
  // preferences. Mounted here because it needs the task list and the timer
  // windows that `useTaskScreen` holds, and because the approved plan is read by
  // the rows below. It reconciles its own planned-start reminders.
  const replan = useReplan({ todos, hydrated, today, timerWindowFor });

  // "What should I do next?" — one task and one action, chosen by the pure
  // selector so the home screen and the task list agree on the order. The live
  // timer readout is bound here rather than in the card, so the card stays a
  // dumb view of a model.
  const nextTaskSelection = selectNextTask({
    todos,
    today,
    plan: replan.plan,
    now: Date.now(),
  });
  const nextTaskRow = nextTaskSelection ? rowPropsFor(nextTaskSelection.todo) : null;
  const nextTask = buildNextTaskViewModel({
    selection: nextTaskSelection,
    todos,
    today,
    timer: nextTaskRow
      ? { running: nextTaskRow.isRunning, label: nextTaskRow.timerLabel }
      : undefined,
  });

  // Today's plan vs actual. Reads the approved plan and the per-task focus
  // attribution from the productivity snapshot, so the comparison is one
  // derivation rather than a second copy of the same facts.
  const outcome = usePlanOutcome({
    hydrated,
    dayKey: today,
    plan: replan.plan,
    todos,
    attribution: productivity.attribution,
    focusSessions,
  });

  // The 7-day plan review. Reads the session log and the outcome store, derives
  // rollover across days, and offers advisory estimate calibration. Its one
  // write — a changed estimate — is wired to the targeted task operation below.
  const review = usePlanReview({
    hydrated,
    today,
    plan: replan.plan,
    todos,
    sessions: focusSessions,
    onApplyEstimate: setEstimatedMinutes,
  });

  // The career slice of the same review window. Career rows carry the link that
  // was snapshotted when the comparison was recorded, and recorded focus comes
  // only from sessions that carried a career link at the time.
  const careerReview = useMemo(
    () =>
      buildCareerPlanReview({
        doc: career.doc,
        days: review.days.map((day) => day.dayKey),
        outcomes: review.days.map((day) => day.outcome ?? undefined),
        sessions: focusSessions,
      }),
    [career.doc, review.days, focusSessions],
  );

  // Daily, deterministic development suggestions. The hook measures open time
  // from today's approved plan so a recommendation never promises more room than
  // the day has.
  const recommendations = useCareerRecommendations({
    development,
    tasks: todos,
    today,
    plan: replan.plan,
    preferences: replan.preferences,
    planReview: careerReview,
  });

  // Contextual suggestions: the plan slipped, or progress fell behind. The
  // controller never emits while a focus timer runs, so it cannot interrupt one.
  const suggestions = useReplanSuggestions({
    hydrated,
    plan: replan.plan,
    replanTasks: replan.replanTasks,
    todos,
    anyTimerRunning,
    today,
    workdayStart: replan.preferences.workdayStart,
    workdayEnd: replan.preferences.workdayEnd,
    completedPlannedCount: outcome.outcome.summary.completed,
    totalPlannedCount: outcome.outcome.summary.totalPlanned,
  });

  // The end-of-day reflection prompt. Optional and user-dismissible; it never
  // shows while a timer runs and never touches the plan on its own.
  const reflection = useReflection({
    hydrated,
    dayKey: today,
    workdayEnd: replan.preferences.workdayEnd,
    anyTimerRunning,
    hasPlanToday: replan.hasPlan,
    taskCount: todos.length,
  });

  const [reflectionModalOpen, setReflectionModalOpen] = useState(false);
  const [yesterdayOutcome, setYesterdayOutcome] = useState<
    Awaited<ReturnType<typeof outcome.loadYesterday>>
  >(null);
  // The recommendation whose prefilled task is currently in the sheet. It stays
  // here until the task is actually created, so cancelling leaves the
  // recommendation in place for the user to choose again.
  const [acceptedRecommendationId, setAcceptedRecommendationId] = useState<
    string | null
  >(null);

  const acceptRecommendation = (recommendation: CareerRecommendation) => {
    setAcceptedRecommendationId(recommendation.id);
    openCreate({
      text: recommendation.taskText,
      notes: [
        recommendation.objective,
        `Finish when: ${recommendation.completionCriteria}`,
        `Evidence: ${recommendation.expectedEvidence}`,
      ].join('\n\n'),
      estimatedMinutes: recommendation.expectedMinutes,
      career: recommendation.career,
    });
  };

  const closeTaskSheetAndForgetRecommendation = () => {
    closeTaskSheet();
    setAcceptedRecommendationId(null);
  };

  const submitTaskAndSettleRecommendation = (draft: TodoDraft) => {
    const acceptedId = acceptedRecommendationId;
    submitTask(draft);
    if (acceptedId) {
      // The task now carries the link, so the suggestion has served its purpose.
      // Dismiss only after a successful submit; a cancel preserves it.
      career.dismissRecommendation(acceptedId);
      setAcceptedRecommendationId(null);
    }
  };

  // `loadYesterday` is memoised inside `usePlanOutcome` (keyed on the day key),
  // so it is a stable dependency rather than the whole controller object.
  const { loadYesterday } = outcome;
  useEffect(() => {
    // Both stores must be loaded before a comparison is read or written: a
    // focus log that has not hydrated yet reads as "no focus today", and a saved
    // outcome built from it would record a day with the work missing.
    if (!hydrated || !productivity.hydrated) return;
    let cancelled = false;
    loadYesterday().then((loaded) => {
      if (!cancelled) setYesterdayOutcome(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, productivity.hydrated, loadYesterday]);

  // Persist today's comparison as it evolves, so tomorrow can show "Yesterday".
  // The signature is the comparison's *counts*, not its focus minutes: focus
  // ticks every second during a session, and a storage write per second would be
  // absurd. The final focus figure is captured on reflection submit (below).
  const savedOutcomeRef = useRef<string>('');
  useEffect(() => {
    // `outcome.historyLoaded` too: the day's stored record is merged into the
    // comparison, and saving before it has loaded would overwrite it with the
    // reduced view — erasing a legacy completion it alone keeps alive.
    if (!hydrated || !productivity.hydrated || !replan.hasPlan || !outcome.historyLoaded) {
      return;
    }
    const s = outcome.outcome.summary;
    const signature = `${today}:${s.totalPlanned}:${s.completed}:${s.completedOnTime}:${s.completedLate}:${s.missed}`;
    if (savedOutcomeRef.current === signature) return;
    savedOutcomeRef.current = signature;
    outcome.saveOutcome().catch(() => {});
  }, [hydrated, productivity.hydrated, replan.hasPlan, outcome, outcome.historyLoaded, today]);

  // The one renderer both lists share. It is a one-liner here rather than in the
  // controller because it is JSX: the controller answers "what are this row's
  // props", and the view is what turns that into an element. The approved plan
  // window is bound here rather than in `rowPropsFor`, so the task controller
  // stays unaware of the replan layer.
  const renderRow = (todo: Todo) => (
    <TodoRow
      {...rowPropsFor(todo)}
      careerLabel={development.labelForLink(todo.career)}
      plannedLabel={replan.plannedLabelFor(todo.id)}
    />
  );

  // Both sheets are built here, outside the branch, and rendered in both screens.
  // The add sheet has to work from either screen — you can be mid-focus with the
  // timer sheet open — and a `Modal` does not remount when its parent re-renders,
  // which matters because this component re-renders once a second while a timer
  // runs. Building them once also keeps the two screens from drifting.
  const sheets = (
    <>
      {/* Opened per task, so the work being focused on is never ambiguous.

          Opens on 25 minutes rather than 00:00 — the picker's zero state reads
          as "you picked nothing", and 25 is the shortest duration the presets
          ever offered. */}
      <TimerPickerModal
        closeOnOverlayPress
        hideDays
        initialValue={{ minutes: DEFAULT_FOCUS_MINUTES }}
        LinearGradient=""
        modalProps={{
          overlayOpacity: 0.2,
        }}
        modalTitle="How long will you focus?"
        onCancel={handleTimerCancel}
        onConfirm={(picked) => handleTimerConfirm(picked as TimerState)}
        setIsVisible={setPickerVisible}
        styles={{
          theme: t.mode,
        }}
        visible={pickerVisible}
      />
      <AddTodoModal
        careerOptions={development.options}
        defaultDraft={editingTodo ? undefined : draftPrefill}
        defaultTag={screen.name === 'tag' ? screen.tag : undefined}
        onClose={closeTaskSheetAndForgetRecommendation}
        onSubmit={submitTaskAndSettleRecommendation}
        tags={tags}
        task={editingTodo}
        visible={showTaskSheet}
      />
    </>
  );

  // Career is one app destination with its own internal route union. It shares no
  // task state and has no sheet to keep open, so it returns before the task-list
  // branches.
  if (screen.name === 'career') {
    return (
      <View style={styles.screen}>
        <CareerModule
          development={development}
          onAcceptRecommendation={acceptRecommendation}
          onExit={() => onNavigate({ name: 'home' })}
          outcomes={review.days.map((day) => day.outcome ?? undefined)}
          recommendations={recommendations}
          sessions={focusSessions}
          tasks={todos}
        />
      </View>
    );
  }

  // Settings is its own destination, back to home, and shares none of the task
  // list. It is a full screen for the same reason the list is: it has somewhere
  // to return to and its own header.
  if (screen.name === 'settings') {
    return (
      <View style={styles.screen}>
        <SettingsScreen
          notificationPermission={settings.notificationPermission}
          onBack={() => onNavigate({ name: 'home' })}
          onClearCareer={settings.confirmClearCareer}
          onClearProductivity={settings.confirmClearProductivity}
          onClearTasks={settings.confirmClearTasks}
          onRequestNotifications={settings.requestNotifications}
          onSetPreference={settings.setPreference}
          preference={settings.preference}
          taskCount={settings.taskCount}
        />
      </View>
    );
  }

  if (screen.name === 'goals') {
    // Its own destination, back to home, like Settings. The save commits the
    // goals above and returns; a cancel/back simply returns, discarding the
    // draft the screen held locally.
    return (
      <View style={styles.screen}>
        <GoalsScreen
          goals={goals}
          onBack={() => onNavigate({ name: 'home' })}
          onSave={(next) => {
            setGoals(next);
            onNavigate({ name: 'home' });
          }}
          todayRollup={productivity.todayRollup}
        />
      </View>
    );
  }

  if (screen.name === 'replan') {
    // Its own destination, back to home, like Goals and Settings. It holds no
    // scheduling state of its own: the controller above owns the proposal and
    // the preferences, and this only renders them and reports intent.
    return (
      <View style={styles.screen}>
        <ReplanScreen
          proposal={replan.proposal}
          preferences={replan.preferences}
          tasksById={replan.tasksById}
          stale={replan.stale}
          onGenerate={replan.generate}
          onApply={() => {
            // The screen's `onApply` is fire-and-forget; a rejected write must not
            // surface as an unhandled rejection. Apply itself already refuses
            // quietly when the state has moved on.
            replan.apply().catch(() => {});
          }}
          onCancel={replan.cancel}
          onSetPreferences={replan.setPreferences}
          onEditTask={openEdit}
          onBack={() => onNavigate({ name: 'home' })}
        />
        {sheets}
      </View>
    );
  }

  if (screen.name === 'planReview') {
    // Its own destination, back to home. Presentational: the `review` controller
    // above owns the window, the rollover and the calibration suggestions, and
    // this only renders them and reports which suggestion to apply.
    return (
      <View style={styles.screen}>
        <PlanReviewScreen
          days={review.days}
          aggregate={review.aggregate}
          calibration={review.calibration}
          careerReview={careerReview}
          loading={review.loading}
          taskTextFor={(id) => todos.find((todo) => todo.id === id)?.text}
          onApplyAdjustment={review.applyAdjustment}
          onBack={() => onNavigate({ name: 'home' })}
        />
        {sheets}
      </View>
    );
  }

  if (screen.name !== 'home') {
    // A full screen swap rather than a `Modal`. It is the app's only task list, so
    // it is a destination with somewhere to come back to, not a layer over the
    // dashboard — and it gets its own header with a back control, which a
    // `pageSheet` only offers on iOS via a swipe.
    //
    // The unfiltered list and the tag view are this one branch. Both are the same
    // screen over the same rows; only the predicate differs, and `AllTasksScreen`
    // owns that predicate for exactly this reason.
    const tag = screen.name === 'tag' ? screen.tag : undefined;

    return (
      <View style={styles.screen}>
        <AllTasksScreen
          filterTag={tag}
          title={tag ?? 'All tasks'}
          today={today}
          onAddTask={openCreate}
          onBack={() => onNavigate({ name: 'home' })}
          renderRow={renderRow}
          todos={todos}
        />
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <HomeScreen
        notificationsBlocked={notificationsBlocked}
        today={productivity.today}
        nextTask={nextTask}
        onStartFocus={startFocusFor}
        history={productivity.history}
        onAddTag={addTag}
        onAddTask={openCreate}
        onExport={exportTodos}
        career={careerHome}
        onOpenCareer={() => onNavigate({ name: 'career' })}
        onOpenGoals={() => onNavigate({ name: 'goals' })}
        onOpenSettings={() => onNavigate({ name: 'settings' })}
        onOpenReplan={() => onNavigate({ name: 'replan' })}
        onOpenPlanReview={() => onNavigate({ name: 'planReview' })}
        replanAvailable={!anyTimerRunning}
        onOpenTag={(tag) => onNavigate({ name: 'tag', tag })}
        onOpenTasks={() => onNavigate({ name: 'tasks' })}
        tags={tags}
        todos={todos}
        suggestions={suggestions.suggestions}
        onDismissSuggestion={suggestions.dismiss}
        onRemindLaterSuggestion={suggestions.remindLater}
        todayOutcome={replan.hasPlan ? outcome.outcome : undefined}
        yesterdayOutcome={yesterdayOutcome ?? undefined}
        showReflectionPrompt={reflection.canReflect}
        onOpenReflection={() => setReflectionModalOpen(true)}
        onDismissReflection={reflection.dismiss}
        reflectionModalVisible={reflectionModalOpen}
        onSubmitReflection={async (data) => {
          await reflection.submit(data);
          // End of day is the natural moment to freeze the final comparison,
          // including the focus minutes the coarse auto-save above skips.
          await outcome.saveOutcome().catch(() => {});
          setReflectionModalOpen(false);
        }}
        onCloseReflection={() => setReflectionModalOpen(false)}
      />
      {sheets}
    </View>
  );
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    /**
     * The shared root of both screens.
     *
     * Deliberately un-padded: each screen now applies its own insets, because the
     * tasks screen is edge-to-edge with a hairline-divided header while the home
     * screen keeps a 16px gutter. A single padded root could only suit one of them.
     *
     * The home screen's own styles went with it into `components/HomeScreen.tsx`;
     * nothing rendered here needs anything beyond the root.
     */
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
  });
};
