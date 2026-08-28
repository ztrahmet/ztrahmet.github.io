import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { COLLECTION_TYPES } from '../config/enums.js';
import { loadMarkdownFile } from './frontmatter-loader.js';
import { normalizeAsset } from './asset-normalizer.js';
import { validateCollectionItem } from '../validation/validator.js';
import { renderMarkdown, extractTableOfContents } from './markdown-renderer.js';
import { calculateReadingMetrics, generateExcerpt } from './content-metrics.js';
import { buildItemSeo } from './seo-normalizer.js';
import { computeRelatedItems } from './content-graph.js';
import { formatDate } from '../eleventy/filters.js';

/**
 * Renders a Markdown string to sanitized HTML with pre-rendered KaTeX math and heading anchor IDs.
 * @param {string} markdown - Raw markdown text
 * @returns {string} Rendered HTML string
 */
export function renderMarkdownToHtml(markdown) {
  return renderMarkdown(markdown);
}

/**
 * Normalizes all asset fields on a collection item.
 * @param {object} item - Raw collection item data
 * @param {string} [baseDir=''] - Referencing directory relative to content root
 * @returns {object} Cloned item with normalized asset URLs
 */
function normalizeItemAssets(item, baseDir = '') {
  const cloned = { ...item };

  if (cloned.image) {
    cloned.image = normalizeAsset(cloned.image, { baseDir });
  }

  if (cloned.logo) {
    cloned.logo = normalizeAsset(cloned.logo, { baseDir });
  }

  return cloned;
}

/**
 * Extracts pure schema-validated payload from a synthesized collection item
 * by stripping internal pipeline and Eleventy runtime properties.
 *
 * @param {object} item - Synthesized collection item
 * @returns {object} Sanitized item payload for schema validation
 */
export function extractSchemaPayload(item) {
  const {
    content,
    html,
    excerpt,
    hasMarkdown,
    isMarkdown,
    filePath,
    baseDir,
    permalink,
    collection,
    newer,
    older,
    wordCount,
    readingTime,
    toc,
    related,
    seo,
    ...schemaPayload
  } = item;

  return schemaPayload;
}

/**
 * Discovers and parses all Markdown collection files in content/<collection>/
 * Supports both directory index format (<slug>/index.md) and standalone format (<slug>.md).
 *
 * @param {string} contentDir - Absolute path to content directory
 * @param {string} collectionType - Collection name (blog, project, publication, certificate, award)
 * @returns {Map<string, object>} Map of slug -> parsed item record
 */
export function discoverMarkdownItems(contentDir, collectionType) {
  const collectionDir = path.join(contentDir, collectionType);
  const itemsMap = new Map();

  if (!fs.existsSync(collectionDir)) {
    return itemsMap;
  }

  const patterns = [
    `${collectionType}/*/index.md`,
    `${collectionType}/*.md`
  ];

  const files = fg.sync(patterns, {
    cwd: contentDir,
    absolute: true,
    onlyFiles: true
  });

  for (const filePath of files) {
    const relativeToContent = path.relative(contentDir, filePath).replace(/\\/g, '/');
    const parsed = loadMarkdownFile(filePath);
    const fileName = path.basename(filePath);

    let slug = '';
    let baseDir = '';

    if (fileName === 'index.md') {
      const parentDirName = path.basename(path.dirname(filePath));
      slug = parsed.data.slug || parentDirName;
      baseDir = path.dirname(relativeToContent);
    } else {
      slug = parsed.data.slug || path.basename(filePath, '.md');
      baseDir = path.dirname(relativeToContent);
    }

    const item = {
      ...parsed.data,
      slug,
      content: parsed.content,
      excerpt: parsed.excerpt,
      hasMarkdown: true,
      isMarkdown: true,
      filePath: relativeToContent,
      baseDir
    };

    itemsMap.set(slug, item);
  }

  return itemsMap;
}

/**
 * Sorts items chronologically (newest first) based on date or start date.
 * Handles 'present' keyword as highest/newest timestamp.
 *
 * @param {Array<object>} items - Collection items to sort
 * @returns {Array<object>} Sorted items
 */
export function sortChronologically(items = []) {
  return [...items].sort((a, b) => {
    const dateA = String(a.date || a.start || '').trim();
    const dateB = String(b.date || b.start || '').trim();

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    const isPresentA = dateA.toLowerCase() === 'present';
    const isPresentB = dateB.toLowerCase() === 'present';

    if (isPresentA && isPresentB) return 0;
    if (isPresentA) return -1;
    if (isPresentB) return 1;

    return dateB.localeCompare(dateA);
  });
}

/**
 * Attaches bidirectional adjacent navigation pointers (newer and older) to sorted collection items.
 *
 * @param {Array<object>} sortedItems - Chronologically sorted collection items (newest first)
 * @returns {Array<object>} Items with attached newer and older navigation pointers
 */
export function attachNavigationPointers(sortedItems = []) {
  return sortedItems.map((item, idx) => {
    const newerItem = idx > 0 ? sortedItems[idx - 1] : null;
    const olderItem = idx < sortedItems.length - 1 ? sortedItems[idx + 1] : null;

    const newer = newerItem
      ? {
          title: newerItem.title,
          permalink: newerItem.permalink,
          slug: newerItem.slug,
          date: newerItem.date || newerItem.start || '',
          dateDisplay: formatDate(newerItem.date || newerItem.start || '')
        }
      : null;

    const older = olderItem
      ? {
          title: olderItem.title,
          permalink: olderItem.permalink,
          slug: olderItem.slug,
          date: olderItem.date || olderItem.start || '',
          dateDisplay: formatDate(olderItem.date || olderItem.start || '')
        }
      : null;

    return {
      ...item,
      newer,
      older
    };
  });
}

/**
 * Synthesizes a collection by merging Markdown files with content.yaml declarations.
 *
 * Enriches every item with:
 * - Pre-rendered HTML (`html`) with KaTeX math and heading anchor IDs
 * - Reading metrics (`wordCount`, `readingTime`)
 * - Structured Table of Contents (`toc`)
 * - Fallback excerpts (`excerpt`)
 * - Canonical permalinks and guaranteed skills array
 *
 * @param {string} contentDir - Absolute path to content/
 * @param {string} collectionType - Collection name (e.g. 'blog')
 * @param {Array<object>} [declaredEntries=[]] - Collection entries declared in content.yaml
 * @param {object} [siteData={}] - Site metadata for SEO normalization
 * @returns {Array<object>} Synthesized collection items
 */
export function synthesizeCollection(contentDir, collectionType, declaredEntries = [], siteData = {}) {
  const discoveredMap = discoverMarkdownItems(contentDir, collectionType);
  const synthesized = [];
  const processedSlugs = new Set();

  // 1. Process entries in the order declared in content.yaml
  for (const entry of declaredEntries) {
    const slug = entry.slug;
    if (!slug) continue;

    processedSlugs.add(slug);
    const permalink = `/${collectionType}/${slug}/`;

    if (discoveredMap.has(slug)) {
      const mdItem = discoveredMap.get(slug);
      const normalized = normalizeItemAssets(mdItem, mdItem.baseDir);

      validateCollectionItem(
        collectionType,
        extractSchemaPayload(normalized),
        `Markdown file 'content/${mdItem.filePath}'`
      );

      const rawContent = normalized.content || '';
      const renderedHtml = renderMarkdown(rawContent);
      const metrics = calculateReadingMetrics(rawContent);
      const toc = extractTableOfContents(rawContent);
      const excerpt = normalized.excerpt || generateExcerpt(rawContent);

      const baseItem = {
        ...normalized,
        collection: collectionType,
        permalink,
        skills: Array.isArray(normalized.skills) ? normalized.skills : [],
        content: rawContent,
        html: renderedHtml,
        wordCount: metrics.wordCount,
        readingTime: metrics.readingTime,
        toc,
        excerpt
      };

      const seo = buildItemSeo(baseItem, siteData);

      synthesized.push({
        ...baseItem,
        seo
      });
    } else {
      const inlineItem = {
        ...entry,
        slug,
        collection: collectionType,
        permalink,
        skills: Array.isArray(entry.skills) ? entry.skills : [],
        hasMarkdown: false,
        isMarkdown: false,
        content: null,
        html: '',
        excerpt: entry.description || '',
        wordCount: 0,
        readingTime: 0,
        toc: [],
        filePath: null,
        baseDir: ''
      };

      const normalized = normalizeItemAssets(inlineItem, '');

      validateCollectionItem(
        collectionType,
        extractSchemaPayload(normalized),
        `content.yaml [${collectionType} -> slug: '${slug}']`
      );

      const seo = buildItemSeo(normalized, siteData);

      synthesized.push({
        ...normalized,
        seo
      });
    }
  }

  // 2. Append discovered Markdown files not explicitly declared in content.yaml
  for (const [slug, mdItem] of discoveredMap.entries()) {
    if (processedSlugs.has(slug)) continue;

    const permalink = `/${collectionType}/${slug}/`;
    const normalized = normalizeItemAssets(mdItem, mdItem.baseDir);

    validateCollectionItem(
      collectionType,
      extractSchemaPayload(normalized),
      `Markdown file 'content/${mdItem.filePath}'`
    );

    const rawContent = normalized.content || '';
    const renderedHtml = renderMarkdown(rawContent);
    const metrics = calculateReadingMetrics(rawContent);
    const toc = extractTableOfContents(rawContent);
    const excerpt = normalized.excerpt || generateExcerpt(rawContent);

    const baseItem = {
      ...normalized,
      collection: collectionType,
      permalink,
      skills: Array.isArray(normalized.skills) ? normalized.skills : [],
      content: rawContent,
      html: renderedHtml,
      wordCount: metrics.wordCount,
      readingTime: metrics.readingTime,
      toc,
      excerpt
    };

    const seo = buildItemSeo(baseItem, siteData);

    synthesized.push({
      ...baseItem,
      seo
    });
  }

  return synthesized;
}

/**
 * Synthesizes all five collections across the workspace:
 * - Synthesizes Markdown & inline entries
 * - Sorts date-bearing collections chronologically (newest first)
 * - Computes bidirectional navigation pointers (newer / older)
 * - Calculates related content recommendations across collections
 *
 * @param {string} contentDir - Absolute path to content directory
 * @param {object} contentYamlData - Parsed content.yaml object
 * @param {object} [siteData={}] - Site metadata for SEO normalization
 * @returns {Record<string, Array<object>>} Map of collectionType -> Array of synthesized items
 */
export function synthesizeAllCollections(contentDir, contentYamlData = {}, siteData = {}) {
  const rawCollections = {};

  // 1. Synthesize individual collections
  for (const type of COLLECTION_TYPES) {
    const declared = contentYamlData[type] || [];
    const synthesized = synthesizeCollection(contentDir, type, declared, siteData);
    const sorted = sortChronologically(synthesized);
    rawCollections[type] = attachNavigationPointers(sorted);
  }

  // 2. Calculate and attach related items recommendations across all collections
  const allItems = Object.values(rawCollections).flat();
  const enriched = {};

  for (const [type, items] of Object.entries(rawCollections)) {
    enriched[type] = items.map((item) => ({
      ...item,
      related: computeRelatedItems(item, allItems, 3)
    }));
  }

  return enriched;
}
