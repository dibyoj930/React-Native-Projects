/**
 * Suggested development areas.
 *
 * These are generic on purpose. A new user should see a vocabulary that fits a
 * nurse, a teacher, a tradesperson or an engineer equally well, and every area
 * can be renamed, disabled or removed. None of them is a statement about the
 * user's profession.
 *
 * Ids are stable strings rather than generated values: a suggested area that
 * was disabled on one launch must stay the same area on the next, and a user's
 * custom area must never collide with a shipped one.
 */

import type { DevelopmentDomain } from './types';

export type DefaultDomain = Pick<DevelopmentDomain, 'id' | 'name' | 'description'>;

export const DEFAULT_DEVELOPMENT_DOMAINS: readonly DefaultDomain[] = [
  {
    id: 'core-craft',
    name: 'Core craft',
    description: 'The hands-on skills your work is judged on day to day.',
  },
  {
    id: 'professional-knowledge',
    name: 'Professional knowledge',
    description: 'Concepts, standards and practices that underpin your work.',
  },
  {
    id: 'problem-solving',
    name: 'Problem solving',
    description: 'Diagnosing, deciding and finding a way through ambiguity.',
  },
  {
    id: 'communication',
    name: 'Communication',
    description: 'Writing, speaking and explaining ideas to different audiences.',
  },
  {
    id: 'collaboration',
    name: 'Collaboration',
    description: 'Working with others, sharing context and handling disagreement.',
  },
  {
    id: 'leadership',
    name: 'Leadership & influence',
    description: 'Guiding work and people, with or without formal authority.',
  },
  {
    id: 'business-context',
    name: 'Business & customer context',
    description: 'Understanding who the work serves and why it matters.',
  },
  {
    id: 'creativity',
    name: 'Creativity & innovation',
    description: 'Generating options, experimenting and improving how work is done.',
  },
  {
    id: 'digital-ai',
    name: 'Digital & AI fluency',
    description: 'Using current tools thoughtfully, including AI-assisted work.',
  },
  {
    id: 'domain-expertise',
    name: 'Domain expertise',
    description: 'Knowledge specific to your field, sector or client group.',
  },
  {
    id: 'personal-effectiveness',
    name: 'Personal effectiveness',
    description: 'Planning, focus, resilience and sustainable ways of working.',
  },
];

/** Suggested learning modes, offered as examples rather than a fixed plan. */
export const SUGGESTED_LEARNING_MODES: readonly string[] = [
  'Read or study',
  'Practise deliberately',
  'Shadow or ask for feedback',
  'Build a small deliverable',
  'Teach or explain it',
  'Apply it in real work',
];

/** Suggested evidence prompts — explicitly optional. */
export const EVIDENCE_PROMPTS: readonly string[] = [
  'What did you do?',
  'What changed because of it?',
  'Who saw or used it?',
  'What did you learn?',
];
