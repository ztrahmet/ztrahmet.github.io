/**
 * Standardized UI Mapping Dictionary for Deterministic Presentation Rendering
 */

export const MODALITY_MAPPINGS = Object.freeze({
  experience: Object.freeze({
    'in-person': 'On-site',
    'hybrid': 'Hybrid',
    'remote': 'Remote'
  }),
  education: Object.freeze({
    'in-person': 'On-campus',
    'hybrid': 'Hybrid',
    'remote': 'Online'
  }),
  default: Object.freeze({
    'in-person': 'In-person',
    'hybrid': 'Hybrid',
    'remote': 'Remote'
  })
});

export const EMPLOYMENT_TYPE_MAPPINGS = Object.freeze({
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  'contract': 'Contract',
  'freelance': 'Freelance',
  'internship': 'Internship',
  'volunteer': 'Volunteer'
});

export const DEGREE_TYPE_MAPPINGS = Object.freeze({
  'bachelor': "Bachelor's Degree",
  'master': "Master's Degree",
  'doctorate': 'Doctorate',
  'associate': 'Associate Degree',
  'bootcamp': 'Bootcamp',
  'certificate': 'Certificate'
});

export const LANGUAGE_LEVEL_MAPPINGS = Object.freeze({
  a1: 'A1',
  a2: 'A2',
  b1: 'B1',
  b2: 'B2',
  c1: 'C1',
  c2: 'C2',
  native: 'Native'
});

export const COLLECTION_LABEL_MAPPINGS = Object.freeze({
  singular: Object.freeze({
    blog: 'Blog Post',
    project: 'Project',
    publication: 'Publication',
    certificate: 'Certificate',
    award: 'Award'
  }),
  plural: Object.freeze({
    blog: 'Blog',
    project: 'Projects',
    publication: 'Publications',
    certificate: 'Certificates',
    award: 'Awards'
  })
});

/**
 * Standard UI Mappings Dictionary
 */
export const UI_MAPPINGS = Object.freeze({
  modality: MODALITY_MAPPINGS,
  employmentType: EMPLOYMENT_TYPE_MAPPINGS,
  degreeType: DEGREE_TYPE_MAPPINGS,
  languageLevel: LANGUAGE_LEVEL_MAPPINGS,
  collections: COLLECTION_LABEL_MAPPINGS
});

/**
 * Resolves a human-readable display label for a modality enum.
 * @param {string} modality - The modality code (in-person, hybrid, remote)
 * @param {'experience' | 'education' | 'default'} [context='experience'] - Presentation context
 * @returns {string} Mapped display string
 */
export function getModalityLabel(modality, context = 'experience') {
  if (!modality) return '';
  const contextMap = MODALITY_MAPPINGS[context] || MODALITY_MAPPINGS.default;
  return contextMap[modality] || MODALITY_MAPPINGS.default[modality] || modality;
}

/**
 * Resolves a human-readable display label for an employment type.
 * @param {string} type - Employment type code
 * @returns {string} Mapped display string
 */
export function getEmploymentTypeLabel(type) {
  if (!type) return '';
  return EMPLOYMENT_TYPE_MAPPINGS[type] || type;
}

/**
 * Resolves a human-readable display label for a degree type.
 * @param {string} type - Degree type code
 * @returns {string} Mapped display string
 */
export function getDegreeTypeLabel(type) {
  if (!type) return '';
  return DEGREE_TYPE_MAPPINGS[type] || type;
}

/**
 * Resolves the display label for a language level.
 * @param {string} level - Normalized level key
 * @returns {string} Display label, or the level unchanged when unknown
 */
export function getLanguageLevelLabel(level) {
  if (!level) return '';
  return LANGUAGE_LEVEL_MAPPINGS[level] || level;
}

/**
 * Resolves a human-readable collection label.
 * @param {string} collection - Collection name (blog, project, etc.)
 * @param {boolean} [plural=true] - Whether to return plural form
 * @returns {string} Mapped display string
 */
export function getCollectionLabel(collection, plural = true) {
  if (!collection) return '';
  const form = plural ? 'plural' : 'singular';
  return COLLECTION_LABEL_MAPPINGS[form][collection] || collection;
}
