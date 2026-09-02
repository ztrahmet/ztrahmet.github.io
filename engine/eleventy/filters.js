import {
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getCollectionLabel
} from '../config/mappings.js';
import { formatDate, formatDateRange, toIsoDate, slugify } from '../config/format.js';
import { renderMarkdown, renderMarkdownInline } from '../pipeline/markdown-renderer.js';
import { resolveAbsoluteUrl } from '../pipeline/seo-normalizer.js';

export { formatDate, formatDateRange, toIsoDate, slugify };

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

  // URLs and identifiers
  eleventyConfig.addFilter('absoluteUrl', (urlPath, siteUrl) => resolveAbsoluteUrl(urlPath, siteUrl));
  eleventyConfig.addFilter('slugify', (val) => slugify(val));
}
