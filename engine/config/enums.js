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
