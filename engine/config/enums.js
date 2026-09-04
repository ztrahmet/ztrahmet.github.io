/**
 * Centralized Enum Definitions for Engine & Content Validation
 */

export const EMPLOYMENT_TYPES = Object.freeze([
  'full-time',
  'part-time',
  'contract',
  'freelance',
  'internship',
  'volunteer'
]);

export const DEGREE_TYPES = Object.freeze([
  'bachelor',
  'master',
  'doctorate',
  'associate',
  'bootcamp',
  'certificate'
]);

/** CEFR, plus native for a language that is not learned to a level. */
export const LANGUAGE_LEVELS = Object.freeze([
  'a1',
  'a2',
  'b1',
  'b2',
  'c1',
  'c2',
  'native'
]);

export const MODALITIES = Object.freeze([
  'in-person',
  'hybrid',
  'remote'
]);

export const PROFILE_ANCHORS = Object.freeze({
  experience: '/cv/#experience',
  education: '/cv/#education'
});

export const COLLECTION_TYPES = Object.freeze([
  'blog',
  'project',
  'publication',
  'certificate',
  'award'
]);
