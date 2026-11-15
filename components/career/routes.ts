/**
 * The career module's internal destination union.
 *
 * There is one top-level app destination (`career`); everything below it is
 * local state. That keeps the hand-rolled `Screen` union small and means a
 * career detail view cannot accidentally become a new root screen.
 */

export type CareerRoute =
  | { name: 'overview' }
  | { name: 'profile' }
  | { name: 'domains' }
  | { name: 'goals' }
  | { name: 'goal'; goalId: string }
  | { name: 'skills' }
  | { name: 'skill'; skillId: string }
  | { name: 'milestones' }
  | { name: 'achievements' }
  | { name: 'assessments' }
  | { name: 'assessment'; assessmentId: string }
  | { name: 'readiness'; goalId: string }
  | { name: 'review'; period: 'week' | 'month' }
  | { name: 'intelligence' };

/** The screen a back press returns to; `null` means leave the module. */
export function parentCareerRoute(route: CareerRoute): CareerRoute | null {
  switch (route.name) {
    case 'overview':
      return null;
    case 'goal':
      return { name: 'goals' };
    case 'skill':
      return { name: 'skills' };
    case 'assessments':
      return { name: 'overview' };
    case 'assessment':
      return { name: 'assessments' };
    case 'readiness':
      return { name: 'goals' };
    default:
      return { name: 'overview' };
  }
}
