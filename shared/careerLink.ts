/**
 * The one-way link between a task and the career record.
 *
 * This type is shared rather than owned by either domain because it is the
 * boundary itself: a task may point at career work, but no career record may
 * point back at a task. Keeping the shape here means `todos/` does not have to
 * import `career/`, and `career/` can derive practice without owning task state.
 *
 * Every field is optional. A link with no goal and no skill is not a link at all,
 * so `sanitizeCareerLink` returns `undefined` for it rather than storing `{}` —
 * "not linked" and "linked to nothing" must not become two different states.
 */

export type CareerLink = {
  /** The goal this work contributes to. */
  goalId?: string;
  /**
   * A milestone inside that goal.
   *
   * A milestone cannot stand without its goal, so a stored milestone with no
   * goal is dropped. The pair is checked again against the document at read
   * time, because a milestone can be deleted after a task was linked to it.
   */
  milestoneId?: string;
  /** Skills this work exercises. A task can serve more than one. */
  skillIds?: string[];
};

/** A goal the task sheet can offer, with the milestones inside it. */
export type CareerLinkGoalOption = {
  id: string;
  title: string;
  milestones: readonly { id: string; title: string }[];
};

/** A skill the task sheet can offer. */
export type CareerLinkSkillOption = {
  id: string;
  name: string;
};

/**
 * The pickers the task sheet needs.
 *
 * Built from the career document by `career/linkage`, but declared here so the
 * task sheet can accept an option set without importing career storage or React
 * context.
 */
export type CareerLinkOptions = {
  goals: readonly CareerLinkGoalOption[];
  skills: readonly CareerLinkSkillOption[];
};

export const EMPTY_CAREER_LINK_OPTIONS: CareerLinkOptions = {
  goals: [],
  skills: [],
};

/** Repairs a stored or submitted link, dropping anything that is not usable. */
export function sanitizeCareerLink(value: unknown): CareerLink | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as {
    goalId?: unknown;
    milestoneId?: unknown;
    skillIds?: unknown;
  };

  const goalId = nonEmptyString(candidate.goalId);
  // A milestone belongs to a goal; without the goal it has nothing to belong to.
  const milestoneId = goalId ? nonEmptyString(candidate.milestoneId) : undefined;
  const skillIds = Array.isArray(candidate.skillIds)
    ? [
        ...new Set(
          candidate.skillIds
            .map((id) => nonEmptyString(id))
            .filter((id): id is string => id !== undefined),
        ),
      ].sort()
    : [];

  if (!goalId && skillIds.length === 0) return undefined;

  return {
    ...(goalId ? { goalId } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    ...(skillIds.length > 0 ? { skillIds } : {}),
  };
}

/** Whether a link names anything at all. */
export function isEmptyCareerLink(link: CareerLink | undefined): boolean {
  return sanitizeCareerLink(link) === undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
