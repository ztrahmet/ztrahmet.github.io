import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { COLLECTION_TYPES } from '../config/enums.js';
import { loadMarkdownFile } from './frontmatter-loader.js';
import { normalizeAsset } from './asset-normalizer.js';
import { validateCollectionItem } from '../validation/validator.js';
import { renderMarkdown } from './markdown-renderer.js';

/**
 * Renders a Markdown string to sanitized HTML with pre-rendered KaTeX math.
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
 * @param {object} item - Synthesized collection item
 * @returns {object} Sanitized item payload for schema validation
 */
function extractSchemaPayload(item) {
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
 * Synthesizes a collection by merging Markdown files with content.yaml declarations.
 * Ensures consistent, predictable item shapes with pre-rendered HTML, canonical permalinks,
 * guaranteed arrays for skills, and normalized asset paths.
 *
 * @param {string} contentDir - Absolute path to content/
 * @param {string} collectionType - Collection name (e.g. 'blog')
 * @param {Array<object>} [declaredEntries=[]] - Collection entries declared in content.yaml
 * @returns {Array<object>} Fully synthesized, normalized, and validated collection items
 */
export function synthesizeCollection(contentDir, collectionType, declaredEntries = []) {
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

      synthesized.push({
        ...normalized,
        collection: collectionType,
        permalink,
        skills: Array.isArray(normalized.skills) ? normalized.skills : [],
        content: rawContent,
        html: renderedHtml
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
        excerpt: '',
        filePath: null,
        baseDir: ''
      };

      const normalized = normalizeItemAssets(inlineItem, '');

      validateCollectionItem(
        collectionType,
        extractSchemaPayload(normalized),
        `content.yaml [${collectionType} -> slug: '${slug}']`
      );

      synthesized.push(normalized);
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

    synthesized.push({
      ...normalized,
      collection: collectionType,
      permalink,
      skills: Array.isArray(normalized.skills) ? normalized.skills : [],
      content: rawContent,
      html: renderedHtml
    });
  }

  return synthesized;
}

/**
 * Synthesizes all five collections across the workspace.
 * @param {string} contentDir - Absolute path to content directory
 * @param {object} contentYamlData - Parsed content.yaml object
 * @returns {Record<string, Array<object>>} Map of collectionType -> Array of synthesized items
 */
export function synthesizeAllCollections(contentDir, contentYamlData = {}) {
  const result = {};

  for (const type of COLLECTION_TYPES) {
    const declared = contentYamlData[type] || [];
    result[type] = synthesizeCollection(contentDir, type, declared);
  }

  return result;
}
