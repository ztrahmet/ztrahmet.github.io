import { formatDate, formatDateRange, toIsoDate, computeDuration } from '../config/format.js';
import { isOngoing } from './ordering.js';

/**
 * Adds the presentation fields a profile entry needs, mirroring what collection
 * items already carry so themes can treat both the same way.
 *
 * @param {object} entry - Experience or education record
 * @param {string} locale - BCP 47 language tag
 * @returns {object} Entry with display dates, ongoing flag and duration
 */
function enrichEntry(entry, locale) {
  return {
    ...entry,
    startDisplay: formatDate(entry.start, locale),
    endDisplay: formatDate(entry.end, locale),
    dateDisplay: formatDateRange(entry.start, entry.end, locale),
    startIso: toIsoDate(entry.start),
    endIso: toIsoDate(entry.end),
    isOngoing: isOngoing(entry),
    duration: computeDuration(entry.start, entry.end)
  };
}

/**
 * Enriches every experience and education record on a profile.
 *
 * @param {object} profile - Normalized profile object
 * @param {string} [locale='en-US'] - BCP 47 language tag
 * @returns {object} Profile with enriched history entries
 */
export function enrichProfile(profile, locale = 'en-US') {
  if (!profile) return profile;

  const enriched = { ...profile };

  if (Array.isArray(enriched.experience)) {
    enriched.experience = enriched.experience.map((entry) => enrichEntry(entry, locale));
  }
  if (Array.isArray(enriched.education)) {
    enriched.education = enriched.education.map((entry) => enrichEntry(entry, locale));
  }

  return enriched;
}

/**
 * Resolves the entry a profile should present as current, which themes often
 * surface in a header or hero. Falls back to the most recent entry.
 *
 * @param {Array<object>} [entries=[]] - Ordered experience or education entries
 * @returns {object|null} The current entry, or null when there are none
 */
export function getCurrentEntry(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries.find((entry) => isOngoing(entry)) || entries[0];
}

/**
 * Reports whether a profile carries a value for a given section, so themes can
 * skip rendering empty blocks.
 *
 * @param {object} profile - Profile object
 * @param {string} section - Section name
 * @returns {boolean} True when the section has content
 */
export function hasProfileSection(profile, section) {
  const value = profile?.[section];
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && String(value).trim());
}
