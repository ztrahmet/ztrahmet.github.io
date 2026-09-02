import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { COLLECTION_TYPES } from '../config/enums.js';
import { formatDate, toDateString, toIsoDate, resolveLocale } from '../config/format.js';
import { loadMarkdownFile } from './frontmatter-loader.js';
import { normalizeAsset } from './asset-normalizer.js';
import { validateCollectionItem } from '../validation/validator.js';
import { ValidationError } from '../validation/errors.js';
import { renderMarkdown, renderMarkdownDocument } from './markdown-renderer.js';
import { calculateReadingMetrics, generateExcerpt } from './content-metrics.js';
import { buildItemSeo } from './seo-normalizer.js';
import { attachRelatedItemsToCollections } from './content-graph.js';
import { sortByRecency, isOngoing } from './ordering.js';

/**
 * Properties synthesized by the pipeline that are not part of any content schema.
 * Stripped before validation so enriched items still satisfy `additionalProperties: false`.
 */
const SYNTHETIC_KEYS = Object.freeze([
  'content', 'html', 'excerpt', 'hasMarkdown', 'isMarkdown', 'filePath', 'baseDir',
  'permalink', 'collection', 'newer', 'older', 'wordCount', 'readingTime', 'toc',
  'related', 'seo', 'primaryDate', 'dateDisplay', 'dateIso', 'year', 'startDisplay', 'endDisplay',
  'isOngoing', 'isExpired', 'expiresDisplay'
]);

/**
 * Renders a Markdown string to sanitized HTML with pre-rendered KaTeX math and heading anchor IDs.
 * @param {string} markdown - Raw markdown text
 * @returns {string} Rendered HTML string
 */
export function renderMarkdownToHtml(markdown) {
  return renderMarkdown(markdown);
}

/**
 * Normalizes all asset fields on a collection item and optionally checks existence.
 * @param {object} item - Raw collection item data
 * @param {string} [baseDir=''] - Referencing directory relative to content root
 * @param {string} [contentDir=''] - Absolute path to content root for existence checking
 * @returns {object} Cloned item with normalized asset URLs
 */
function normalizeItemAssets(item, baseDir = '', contentDir = '') {
  const cloned = { ...item };
  const options = { baseDir, contentDir, warnMissing: true };

  if (cloned.image) {
    cloned.image = normalizeAsset(cloned.image, options);
  }

  if (cloned.logo) {
    cloned.logo = normalizeAsset(cloned.logo, options);
  }

  return cloned;
}

/**
 * Extracts pure schema-validated payload from a synthesized collection item
 * by stripping internal pipeline properties and any private underscore-prefixed key.
 *
 * @param {object} item - Synthesized collection item
 * @returns {object} Sanitized item payload for schema validation
 */
export function extractSchemaPayload(item) {
  const payload = {};

  for (const [key, value] of Object.entries(item || {})) {
    if (SYNTHETIC_KEYS.includes(key) || key.startsWith('_')) continue;
    payload[key] = value;
  }

  return payload;
}

/**
 * Builds the display and machine-readable date fields shared by every collection item.
 * @param {object} item - Collection item
 * @param {string} locale - BCP 47 language tag
 * @returns {object} Date presentation fields
 */
function buildDateFields(item, locale) {
  const primary = toDateString(item.date ?? item.start);

  const iso = toIsoDate(primary);

  const fields = {
    primaryDate: primary,
    dateDisplay: formatDate(primary, locale),
    dateIso: iso,
    year: iso ? Number(iso.slice(0, 4)) : null,
    isOngoing: isOngoing(item)
  };

  if (item.start !== undefined) fields.startDisplay = formatDate(item.start, locale);
  if (item.end !== undefined) fields.endDisplay = formatDate(item.end, locale);

  if (item.expires !== undefined) {
    const expiresIso = toIsoDate(item.expires);
    fields.expiresDisplay = formatDate(item.expires, locale);
    fields.isExpired = Boolean(expiresIso) && expiresIso < new Date().toISOString().slice(0, 10);
  }

  return fields;
}

/**
 * Discovers and parses all Markdown collection files in content/<collection>/
 * Supports both directory index format (<slug>/index.md) and standalone format (<slug>.md).
 *
 * @param {string} contentDir - Absolute path to content directory
 * @param {string} collectionType - Collection name (blog, project, publication, certificate, award)
 * @returns {Map<string, object>} Map of slug -> parsed item record
 * @throws {ValidationError} If two Markdown files resolve to the same slug
 */
export function discoverMarkdownItems(contentDir, collectionType) {
  const collectionDir = path.join(contentDir, collectionType);
  const itemsMap = new Map();

  if (!fs.existsSync(collectionDir)) {
    return itemsMap;
  }

  const files = fg.sync([`${collectionType}/*/index.md`, `${collectionType}/*.md`], {
    cwd: contentDir,
    absolute: true,
    onlyFiles: true
  }).sort();

  for (const filePath of files) {
    const relativeToContent = path.relative(contentDir, filePath).replace(/\\/g, '/');
    const parsed = loadMarkdownFile(filePath);
    const isIndexFile = path.basename(filePath) === 'index.md';

    const fallbackSlug = isIndexFile
      ? path.basename(path.dirname(filePath))
      : path.basename(filePath, '.md');
    const slug = parsed.data.slug || fallbackSlug;

    if (itemsMap.has(slug)) {
      throw new ValidationError(
        `Duplicate slug '${slug}' in collection '${collectionType}'. ` +
        `Both 'content/${itemsMap.get(slug).filePath}' and 'content/${relativeToContent}' resolve to the same slug.`
      );
    }

    itemsMap.set(slug, {
      ...parsed.data,
      slug,
      content: parsed.content,
      hasMarkdown: true,
      isMarkdown: true,
      filePath: relativeToContent,
      baseDir: path.dirname(relativeToContent)
    });
  }

  return itemsMap;
}

/**
 * Attaches bidirectional adjacent navigation pointers (newer and older) to sorted collection items.
 *
 * @param {Array<object>} sortedItems - Chronologically sorted collection items (newest first)
 * @param {string} [locale='en-US'] - BCP 47 language tag for date display
 * @returns {Array<object>} Items with attached newer and older navigation pointers
 */
export function attachNavigationPointers(sortedItems = [], locale = 'en-US') {
  const toPointer = (item) => {
    if (!item) return null;
    const date = toDateString(item.date || item.start);
    return {
      title: item.title,
      permalink: item.permalink,
      slug: item.slug,
      collection: item.collection,
      date,
      dateDisplay: formatDate(date, locale),
      image: item.image || null
    };
  };

  return sortedItems.map((item, idx) => ({
    ...item,
    newer: toPointer(idx > 0 ? sortedItems[idx - 1] : null),
    older: toPointer(idx < sortedItems.length - 1 ? sortedItems[idx + 1] : null)
  }));
}

/**
 * Builds a synthesized item from a Markdown-driven record.
 *
 * @param {object} mdItem - Parsed Markdown record
 * @param {object} context - Synthesis context
 * @returns {object} Synthesized collection item
 */
function buildMarkdownItem(mdItem, { collectionType, contentDir, siteData, locale }) {
  const normalized = normalizeItemAssets(mdItem, mdItem.baseDir, contentDir);

  validateCollectionItem(
    collectionType,
    extractSchemaPayload(normalized),
    `Markdown file 'content/${mdItem.filePath}'`
  );

  const rawContent = normalized.content || '';
  const { html, toc } = renderMarkdownDocument(rawContent);
  const metrics = calculateReadingMetrics(rawContent);

  const item = {
    ...normalized,
    collection: collectionType,
    permalink: `/${collectionType}/${normalized.slug}/`,
    skills: Array.isArray(normalized.skills) ? normalized.skills : [],
    content: rawContent,
    html,
    toc,
    wordCount: metrics.wordCount,
    readingTime: metrics.readingTime,
    excerpt: generateExcerpt(rawContent),
    ...buildDateFields(normalized, locale)
  };

  return { ...item, seo: buildItemSeo(item, siteData) };
}

/**
 * Builds a synthesized item from an inline content.yaml declaration.
 *
 * @param {object} entry - Declared content.yaml entry
 * @param {object} context - Synthesis context
 * @returns {object} Synthesized collection item
 */
function buildInlineItem(entry, { collectionType, contentDir, siteData, locale }) {
  const normalized = normalizeItemAssets(
    {
      ...entry,
      collection: collectionType,
      permalink: `/${collectionType}/${entry.slug}/`,
      skills: Array.isArray(entry.skills) ? entry.skills : [],
      hasMarkdown: false,
      isMarkdown: false,
      content: null,
      html: '',
      toc: [],
      wordCount: 0,
      readingTime: 0,
      excerpt: entry.description || '',
      filePath: null,
      baseDir: ''
    },
    '',
    contentDir
  );

  validateCollectionItem(
    collectionType,
    extractSchemaPayload(normalized),
    `content.yaml [${collectionType} -> slug: '${entry.slug}']`
  );

  const item = { ...normalized, ...buildDateFields(normalized, locale) };
  return { ...item, seo: buildItemSeo(item, siteData) };
}

/**
 * Synthesizes a collection by merging Markdown files with content.yaml declarations.
 *
 * Entries declared in content.yaml keep their declared order and are followed by any
 * Markdown files that were not declared. Markdown frontmatter always takes precedence.
 *
 * @param {string} contentDir - Absolute path to content/
 * @param {string} collectionType - Collection name (e.g. 'blog')
 * @param {Array<object>} [declaredEntries=[]] - Collection entries declared in content.yaml
 * @param {object} [siteData={}] - Site metadata for SEO normalization
 * @returns {Array<object>} Synthesized collection items
 * @throws {ValidationError} If a slug is declared more than once
 */
export function synthesizeCollection(contentDir, collectionType, declaredEntries = [], siteData = {}) {
  const discovered = discoverMarkdownItems(contentDir, collectionType);
  const context = { collectionType, contentDir, siteData, locale: resolveLocale(siteData) };
  const synthesized = [];
  const declaredSlugs = new Set();

  for (const entry of declaredEntries) {
    const slug = entry.slug;
    if (!slug) continue;

    if (declaredSlugs.has(slug)) {
      throw new ValidationError(
        `Duplicate slug '${slug}' declared more than once in content.yaml under '${collectionType}'. ` +
        'Each slug must be unique within a collection.'
      );
    }
    declaredSlugs.add(slug);

    synthesized.push(
      discovered.has(slug)
        ? buildMarkdownItem(discovered.get(slug), context)
        : buildInlineItem(entry, context)
    );
  }

  for (const [slug, mdItem] of discovered.entries()) {
    if (declaredSlugs.has(slug)) continue;
    synthesized.push(buildMarkdownItem(mdItem, context));
  }

  return synthesized;
}

/**
 * Synthesizes all five collections across the workspace:
 * - Synthesizes Markdown & inline entries
 * - Orders each collection newest first, with ongoing entries ranked above finished ones
 * - Computes bidirectional navigation pointers (newer / older)
 * - Calculates related content recommendations across collections
 *
 * @param {string} contentDir - Absolute path to content directory
 * @param {object} contentYamlData - Parsed content.yaml object
 * @param {object} [siteData={}] - Site metadata for SEO normalization
 * @returns {Record<string, Array<object>>} Map of collectionType -> Array of synthesized items
 */
export function synthesizeAllCollections(contentDir, contentYamlData = {}, siteData = {}) {
  const locale = resolveLocale(siteData);
  const collections = {};

  for (const type of COLLECTION_TYPES) {
    const items = synthesizeCollection(contentDir, type, contentYamlData[type] || [], siteData);
    collections[type] = attachNavigationPointers(sortByRecency(items), locale);
  }

  return attachRelatedItemsToCollections(collections);
}
