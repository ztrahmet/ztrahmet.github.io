import fs from 'node:fs';
import path from 'node:path';
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
import { resolveAssetFsPath } from '../pipeline/asset-normalizer.js';

export { formatDate, formatDateRange, toIsoDate, toRfc822Date, slugify };

/** Already absolute, or a scheme the resolver must not touch. */
const RESOLVED_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Rewrites src, href and poster attributes to absolute URLs.
 * Feeds and syndicated content need absolute links to resolve off-site.
 *
 * Root-relative paths resolve against the site, and document-relative ones such as
 * `./cover.png` against the page that contains them, which is the only way an
 * entry's own assets survive syndication.
 *
 * @param {string} html - Rendered HTML
 * @param {string} siteUrl - Site base URL
 * @param {string} [pagePath='/'] - Path of the page the HTML belongs to
 * @returns {string} HTML with absolute URLs
 */
export function absolutizeUrls(html, siteUrl, pagePath = '/') {
  if (typeof html !== 'string' || !html || !siteUrl) return html || '';

  let pageBase;
  try {
    pageBase = new URL(String(pagePath || '/'), `${String(siteUrl).replace(/\/+$/, '')}/`);
  } catch {
    return html;
  }

  // Markdown renders double quotes, but authors may hand-write single quoted HTML
  return html.replace(/\b(src|href|poster)=(["'])([^"']*)\2/gi, (match, attr, quote, value) => {
    const ref = value.trim();
    if (!ref || RESOLVED_REFERENCE.test(ref)) return match;
    try {
      return `${attr}=${quote}${new URL(ref, pageBase).href}${quote}`;
    } catch {
      return match;
    }
  });
}

const inlinedSvgCache = new Map();

/**
 * Reads an SVG asset and returns its markup for inlining.
 *
 * An SVG referenced by `<img>` is a separate document, so `currentColor` inside
 * it never sees the page. Inlining is what lets an asset take the theme colour.
 * Scripts and event handlers are stripped, since the markup is injected as-is.
 *
 * @param {string} assetPath - Root-relative asset path
 * @param {string} contentDir - Absolute path to content directory
 * @returns {string} SVG markup, or an empty string when not an inlinable SVG
 */
export function inlineSvg(assetPath, contentDir) {
  if (typeof assetPath !== 'string' || !assetPath.toLowerCase().endsWith('.svg')) return '';
  if (!contentDir) return '';

  const cacheKey = `${contentDir}::${assetPath}`;
  if (inlinedSvgCache.has(cacheKey)) return inlinedSvgCache.get(cacheKey);

  const fsPath = resolveAssetFsPath(assetPath, contentDir);
  let markup = '';

  if (fsPath && fs.existsSync(fsPath)) {
    markup = fs.readFileSync(fsPath, 'utf-8')
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .trim();
  }

  inlinedSvgCache.set(cacheKey, markup);
  return markup;
}

/**
 * Clears the inlined SVG cache so a watch rebuild picks up edited files.
 */
export function resetInlinedSvgCache() {
  inlinedSvgCache.clear();
}

/** Ids are document scoped, so two inlined files can each define the same one. */
function namespaceSvgIds(markup, token) {
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  if (!ids.length) return markup;

  let out = markup;
  for (const id of new Set(ids)) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const renamed = `${token}-${id}`;
    out = out
      .replace(new RegExp(`\\sid="${escaped}"`, 'g'), ` id="${renamed}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${renamed})`)
      .replace(new RegExp(`((?:xlink:)?href)="#${escaped}"`, 'g'), `$1="#${renamed}"`);
  }
  return out;
}

/**
 * Inlines the SVG images in a rendered body that are written to follow the page.
 *
 * Markdown produces `<img src="diagram.svg">`, and an image referenced that way is
 * a separate document, so `currentColor` inside it renders black whatever the page
 * is doing. Only files that actually ask for `currentColor` are inlined, so a full
 * colour illustration keeps its own palette and stays a normal, lazily loaded image.
 *
 * @param {string} html - Rendered entry body
 * @param {string} contentDir - Absolute path to content directory
 * @param {string} [baseDir] - Entry directory, for resolving relative sources
 * @returns {string} Body with themeable SVGs inlined
 */
export function inlineThemedSvg(html, contentDir, baseDir = '') {
  if (typeof html !== 'string' || !html || !contentDir) return html || '';

  let seq = 0;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\ssrc="([^"]+)"/i)?.[1];
    if (!src || !src.split(/[?#]/)[0].toLowerCase().endsWith('.svg')) return tag;

    const assetPath = src.startsWith('/') ? src : path.posix.join('/', baseDir, src);
    const markup = inlineSvg(assetPath, contentDir);
    if (!markup || !markup.includes('currentColor')) return tag;

    const alt = tag.match(/\salt="([^"]*)"/i)?.[1] ?? '';
    const label = alt
      ? ` role="img" aria-label="${alt}"`
      : ' role="presentation" aria-hidden="true"';

    seq += 1;
    return namespaceSvgIds(markup, `svg${seq}`)
      .replace(/^<svg\b/i, `<svg class="inline-svg"${label}`);
  });
}

/**
 * Registers all engine filters on an Eleventy configuration instance.
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {string} [contentDir] - Absolute path to content directory, for asset reading filters
 */
export function registerFilters(eleventyConfig, contentDir) {
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
  eleventyConfig.addFilter('absoluteUrls', (html, siteUrl, pagePath) => absolutizeUrls(html, siteUrl, pagePath));
  eleventyConfig.addFilter('slugify', (val) => slugify(val));

  // Assets
  eleventyConfig.addFilter('inlineSvg', (assetPath) => inlineSvg(assetPath, contentDir));
  eleventyConfig.addFilter('inlineThemedSvg', (html, baseDir) => inlineThemedSvg(html, contentDir, baseDir));

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
