import {
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getCollectionLabel
} from '../config/mappings.js';
import { renderMarkdown } from '../pipeline/markdown-renderer.js';

/**
 * Formats a date string ('YYYY-MM-DD', 'YYYY-MM', 'YYYY', or 'present')
 * into a human-readable localized display string.
 *
 * @param {string|number} dateVal - Date string or integer year
 * @param {string} [locale='en-US'] - BCP 47 language tag
 * @returns {string} Formatted display date (e.g. "Aug 15, 2023", "Jan 2022", "Present")
 */
export function formatDate(dateVal, locale = 'en-US') {
  if (!dateVal) return '';
  if (dateVal === 'present' || dateVal === 'Present') return 'Present';

  const str = String(dateVal).trim();

  // Year only (YYYY)
  if (/^\d{4}$/.test(str)) {
    return str;
  }

  // Year and Month (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [year, month] = str.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' });
  }

  // Full Date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return str;
}

/**
 * Registers all engine filters on an Eleventy configuration instance.
 * @param {object} eleventyConfig - Eleventy configuration object
 */
export function registerFilters(eleventyConfig) {
  eleventyConfig.addFilter('modalityLabel', (val, context) => getModalityLabel(val, context));
  eleventyConfig.addFilter('employmentTypeLabel', (val) => getEmploymentTypeLabel(val));
  eleventyConfig.addFilter('degreeTypeLabel', (val) => getDegreeTypeLabel(val));
  eleventyConfig.addFilter('collectionLabel', (val, plural) => getCollectionLabel(val, plural));
  eleventyConfig.addFilter('formatDate', (val, locale) => formatDate(val, locale));
  eleventyConfig.addFilter('markdown', (content) => renderMarkdown(content));
}
