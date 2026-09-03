import {
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getCollectionLabel
} from '../config/mappings.js';
import {
  formatDate,
  formatDateRange,
  toIsoDate,
  toRfc822Date,
  computeDuration,
  slugify
} from '../config/format.js';
import { renderMarkdown, renderMarkdownInline } from '../pipeline/markdown-renderer.js';
import { resolveAbsoluteUrl } from '../pipeline/seo-normalizer.js';
import { sortByRecency, sortByDate } from '../pipeline/ordering.js';

export { formatDate, formatDateRange, toIsoDate, toRfc822Date, slugify };

/**
 * Rewrites root-relative src and href attributes to absolute URLs.
 * Feeds and syndicated content need absolute links to resolve off-site.
 *
 * @param {string} html - Rendered HTML
 * @param {string} siteUrl - Site base URL
 * @returns {string} HTML with absolute URLs
 */
export function absolutizeUrls(html, siteUrl) {
  if (typeof html !== 'string' || !html || !siteUrl) return html || '';
  const base = String(siteUrl).replace(/\/+$/, '');
  // Markdown renders double quotes, but authors may hand-write single quoted HTML
  return html.replace(/\b(src|href|poster)=(["'])\/(?!\/)/g, `$1=$2${base}/`);
}

/**
 * Registers all engine filters on an Eleventy configuration instance.
 * @param {object} eleventyConfig - Eleventy configuration object
 */
export function registerFilters(eleventyConfig) {
  // Presentation mappings
  eleventyConfig.addFilter('modalityLabel', (val, context) => getModalityLabel(val, context));
  eleventyConfig.addFilter('employmentTypeLabel', (val) => getEmploymentTypeLabel(val));
  eleventyConfig.addFilter('degreeTypeLabel', (val) => getDegreeTypeLabel(val));
  eleventyConfig.addFilter('collectionLabel', (val, plural) => getCollectionLabel(val, plural));

  // Dates
  eleventyConfig.addFilter('formatDate', (val, locale) => formatDate(val, locale));
  eleventyConfig.addFilter('dateRange', (start, end, locale) => formatDateRange(start, end, locale));
  eleventyConfig.addFilter('isoDate', (val) => toIsoDate(val));

  // Markdown
  eleventyConfig.addFilter('markdown', (content) => renderMarkdown(content));
  eleventyConfig.addFilter('markdownInline', (content) => renderMarkdownInline(content));

  eleventyConfig.addFilter('rfc822Date', (val) => toRfc822Date(val));
  eleventyConfig.addFilter('duration', (start, end) => computeDuration(start, end)?.text || '');

  // URLs and identifiers
  eleventyConfig.addFilter('absoluteUrl', (urlPath, siteUrl) => resolveAbsoluteUrl(urlPath, siteUrl));
  eleventyConfig.addFilter('absoluteUrls', (html, siteUrl) => absolutizeUrls(html, siteUrl));
  eleventyConfig.addFilter('slugify', (val) => slugify(val));

  // List helpers. Nunjucks selectattr only tests truthiness and slice chunks
  // rather than limiting, so themes cannot filter or cap a list without these.
  eleventyConfig.addFilter('limit', (list, count) => (Array.isArray(list) ? list.slice(0, count) : list));
  eleventyConfig.addFilter('where', (list, key, value) =>
    (Array.isArray(list) ? list.filter((entry) => entry?.[key] === value) : list));
  eleventyConfig.addFilter('whereNot', (list, key, value) =>
    (Array.isArray(list) ? list.filter((entry) => entry?.[key] !== value) : list));
  eleventyConfig.addFilter('sortBy', (list, key, descending = false) => {
    if (!Array.isArray(list)) return list;
    const sorted = [...list].sort((a, b) =>
      String(a?.[key] ?? '').localeCompare(String(b?.[key] ?? ''), undefined, { numeric: true }));
    return descending ? sorted.reverse() : sorted;
  });
  eleventyConfig.addFilter('byRecency', (list) => (Array.isArray(list) ? sortByRecency(list) : list));
  eleventyConfig.addFilter('byDate', (list) => (Array.isArray(list) ? sortByDate(list) : list));
}
