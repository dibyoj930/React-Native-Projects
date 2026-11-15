/**
 * Task → career linkage.
 *
 * The promises this file protects are the reason the link is one-way:
 *   - a career record derives its linked tasks instead of storing task ids;
 *   - focus is counted only when it was explicitly attributed at session start;
 *   - deleting a task leaves the focus it already earned intact;
 *   - a deleted goal, milestone or skill stops resolving instead of showing a
 *     raw id or inflating practice.
 */

import {
  buildCareerDevelopment,
  buildCareerLinkOptions,
  careerLinkLabel,
  createCareerGoal,
  createCareerMilestone,
  createCareerSkill,
  createInitialCareerDoc,
  type CareerDoc,
} from '../../career';
import type { FocusSession } from '../../productivity/domain';
import { localDateKey } from '../../shared/date';
import type { Todo } from '../../todos/model';

const NOW = new Date(2026, 2, 10, 12, 0, 0, 0).getTime();

function at(month: number, day: number, hour = 12, minute = 0): number {
  return new Date(2026, month - 1, day, hour, minute, 0, 0).getTime();
}

function seed() {
  const goal = createCareerGoal(
    {
      title: 'Grow into a lead',
      description: '',
      goalType: 'promotion',
      priority: 'high',
      status: 'active',
      successCriteria: 'Lead a small piece of work end to end.',
      relatedSkillIds: [],
    },
    NOW,
  );
  const archived = createCareerGoal(
    {
      title: 'Old direction',
      description: '',
      goalType: 'custom',
      customGoalType: 'Retired',
      priority: 'low',
      status: 'archived',
      successCriteria: '',
      relatedSkillIds: [],
    },
    NOW,
  );
  const skill = createCareerSkill(
    {
      name: 'Client discovery',
      description: '',
      currentLevel: 2,
      targetLevel: 4,
      confidence: 2,
      roleImportance: 'medium',
      futureImportance: 'high',
    },
    NOW,
  );
  const secondSkill = createCareerSkill(
    {
      name: 'Facilitation',
      description: '',
      currentLevel: 2,
      targetLevel: 3,
      confidence: 3,
      roleImportance: 'low',
      futureImportance: 'medium',
    },
    NOW,
  );
  const milestone = createCareerMilestone(
    goal.id,
    {
      title: 'Run the first retrospective',
      description: '',
      status: 'in-progress',
      relatedSkillIds: [],
    },
    NOW,
  );
  const laterMilestone = createCareerMilestone(
    goal.id,
    {
      title: 'Hand over the work',
      description: '',
      status: 'not-started',
      relatedSkillIds: [],
    },
    NOW,
  );

  const doc: CareerDoc = {
    ...createInitialCareerDoc(NOW),
    goals: [goal, archived],
    skills: [skill, secondSkill],
    milestones: [milestone, laterMilestone],
  };

  return { doc, goal, archived, skill, secondSkill, milestone, laterMilestone };
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    text: 'A task',
    completed: false,
    createdAt: NOW,
    ...overrides,
  };
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's1',
    taskId: 't1',
    startedAt: at(3, 4, 9),
    endedAt: at(3, 4, 9, 30),
    focusedSeconds: 30 * 60,
    status: 'stopped',
    ...overrides,
  };
}

describe('buildCareerDevelopment — task links', () => {
  it('derives counts and the latest completed day without storing them', () => {
    const { doc, goal } = seed();
    const tasks = [
      todo({ id: 'open', career: { goalId: goal.id } }),
      todo({
        id: 'done',
        completed: true,
        completedAt: at(3, 5, 17),
        career: { goalId: goal.id },
      }),
    ];

    const development = buildCareerDevelopment(doc, tasks, []);
    const practice = development.practiceForGoal(goal.id);

    expect(practice).toEqual({
      linkedTaskCount: 2,
      openTaskCount: 1,
      completedTaskCount: 1,
      focusSessionCount: 0,
      focusedSeconds: 0,
      lastPractisedOn: localDateKey(at(3, 5, 17)),
    });
    expect(development.tasksForGoal(goal.id).map((task) => task.id)).toEqual([
      'open',
      'done',
    ]);
    expect(development.linkedTaskCount).toBe(2);
  });

  it('keeps skill attribution independent of the goal it was filed under', () => {
    const { doc, goal, skill } = seed();
    const tasks = [
      todo({ career: { goalId: goal.id, skillIds: [skill.id] } }),
      todo({ id: 'skills-only', career: { skillIds: [skill.id] } }),
    ];

    const development = buildCareerDevelopment(doc, tasks, []);

    expect(development.practiceForGoal(goal.id).linkedTaskCount).toBe(1);
    expect(development.practiceForSkill(skill.id).linkedTaskCount).toBe(2);
  });

  it('counts a milestone only when it still belongs to the linked goal', () => {
    const { doc, goal, milestone } = seed();
    const tasks = [
      todo({ id: 'milestone', career: { goalId: goal.id, milestoneId: milestone.id } }),
      todo({ id: 'wrong-goal', career: { skillIds: ['missing'] } }),
    ];

    const development = buildCareerDevelopment(doc, tasks, []);

    expect(development.practiceForMilestone(milestone.id).linkedTaskCount).toBe(1);
    // The second task resolves to nothing, so it is not linked at all.
    expect(development.linkedTaskCount).toBe(1);
  });
});

describe('buildCareerDevelopment — focus attribution', () => {
  it('counts focus carried by the session snapshot even after the task is deleted', () => {
    const { doc, goal } = seed();
    // The task list no longer contains the focused task. The session still does,
    // because the link was copied when focus started.
    const sessions = [
      session({
        career: { goalId: goal.id },
        focusedSeconds: 25 * 60,
        endedAt: at(3, 7, 11),
      }),
    ];

    const development = buildCareerDevelopment(doc, [], sessions);
    const practice = development.practiceForGoal(goal.id);

    expect(practice.linkedTaskCount).toBe(0);
    expect(practice.focusSessionCount).toBe(1);
    expect(practice.focusedSeconds).toBe(25 * 60);
    expect(practice.lastPractisedOn).toBe(localDateKey(at(3, 7, 11)));
  });

  it('does not backfill career attribution onto sessions that never had it', () => {
    const { doc, goal } = seed();
    const tasks = [todo({ career: { goalId: goal.id } })];

    // A session recorded before the task was linked has no snapshot. Linking the
    // task later must not retroactively turn that old focus into career practice.
    const development = buildCareerDevelopment(doc, tasks, [session()]);

    expect(development.practiceForGoal(goal.id).focusSessionCount).toBe(0);
    expect(development.practiceForGoal(goal.id).focusedSeconds).toBe(0);
  });

  it('ignores a session with no real focus time', () => {
    const { doc, goal } = seed();
    const sessions = [
      session({ career: { goalId: goal.id }, focusedSeconds: 0 }),
      session({ id: 's2', career: { goalId: goal.id }, focusedSeconds: -30 }),
    ];

    const development = buildCareerDevelopment(doc, [], sessions);

    expect(development.practiceForGoal(goal.id).focusSessionCount).toBe(0);
  });

  it('keeps the later of a completion and a focus session as the practice date', () => {
    const { doc, goal } = seed();
    const tasks = [
      todo({
        completed: true,
        completedAt: at(3, 5, 17),
        career: { goalId: goal.id },
      }),
    ];
    const sessions = [
      session({
        career: { goalId: goal.id },
        endedAt: at(3, 8, 9),
      }),
    ];

    const development = buildCareerDevelopment(doc, tasks, sessions);

    expect(development.practiceForGoal(goal.id).lastPractisedOn).toBe(
      localDateKey(at(3, 8, 9)),
    );
  });
});

describe('buildCareerDevelopment — deleted career records', () => {
  it('stops resolving a deleted goal but keeps a still-valid skill link', () => {
    const { doc, skill } = seed();
    const tasks = [
      todo({
        career: {
          goalId: 'deleted-goal',
          milestoneId: 'deleted-milestone',
          skillIds: [skill.id],
        },
      }),
    ];

    const development = buildCareerDevelopment(doc, tasks, []);

    expect(development.practiceForSkill(skill.id).linkedTaskCount).toBe(1);
    expect(development.practiceForGoal('deleted-goal').linkedTaskCount).toBe(0);
    expect(development.labelForLink(tasks[0].career)).toBe(skill.name);
  });

  it('drops a dangling link entirely rather than showing an empty career row', () => {
    const { doc } = seed();
    const dangling = todo({ career: { goalId: 'gone', skillIds: ['gone'] } });

    const development = buildCareerDevelopment(doc, [dangling], []);

    expect(development.linkedTaskCount).toBe(0);
    expect(development.labelForLink(dangling.career)).toBeUndefined();
  });
});

describe('career link options and labels', () => {
  it('offers open goals and their open milestones, but not archived work', () => {
    const { doc, goal, archived, skill, secondSkill, milestone, laterMilestone } = seed();

    const options = buildCareerLinkOptions(doc);

    expect(options.goals.map((entry) => entry.id)).toEqual([goal.id]);
    expect(options.goals[0].milestones.map((entry) => entry.id)).toEqual([
      milestone.id,
      laterMilestone.id,
    ]);
    expect(options.skills.map((entry) => entry.id)).toEqual([skill.id, secondSkill.id]);
    expect(options.goals.some((entry) => entry.id === archived.id)).toBe(false);
  });

  it('describes a full link in the order the task row reads it', () => {
    const { doc, goal, skill, milestone } = seed();

    const label = careerLinkLabel(doc, {
      goalId: goal.id,
      milestoneId: milestone.id,
      skillIds: [skill.id],
    });

    expect(label).toBe(`${goal.title} · ${milestone.title} · ${skill.name}`);
  });

  it('summarises several skills without pretending to name them all', () => {
    const { doc, skill, secondSkill } = seed();

    const label = careerLinkLabel(doc, {
      skillIds: [skill.id, secondSkill.id],
    });

    expect(label).toBe(`${skill.name} +1`);
  });
});
