import { COLLECTION_TYPES } from '../config/enums.js';
import { ValidationError } from '../validation/errors.js';

const CONTENT_REF_REGEX = /^([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/;

/**
 * Parses a ContentRef string into collection name and slug.
 * @param {string} refStr - Reference string (e.g. "blog:how-to-sign-commits")
 * @returns {{ collection: string, slug: string }} Parsed collection and slug
 * @throws {ValidationError} If format is invalid or collection type is unknown
 */
export function parseContentRef(refStr) {
  if (typeof refStr !== 'string') {
    throw new ValidationError(`ContentRef must be a string, received: ${typeof refStr}`);
  }

  const match = refStr.trim().match(CONTENT_REF_REGEX);
  if (!match) {
    throw new ValidationError(`Invalid ContentRef format '${refStr}'. Expected format: '<collection>:<slug>' (e.g., 'blog:my-post').`);
  }

  const [, collection, slug] = match;

  if (!COLLECTION_TYPES.includes(collection)) {
    throw new ValidationError(`Invalid collection in ContentRef '${refStr}'. Collection '${collection}' must be one of: [${COLLECTION_TYPES.join(', ')}]`);
  }

  return { collection, slug };
}

/**
 * Creates a ContentRef string from collection name and slug.
 * @param {string} collection - Collection name (e.g. 'blog')
 * @param {string} slug - Item slug
 * @returns {string} Formatted ContentRef string (e.g. "blog:how-to-sign-commits")
 */
export function formatContentRef(collection, slug) {
  return `${collection}:${slug}`;
}

/**
 * Validates that all references in pinned_content point to existing items in synthesized collections.
 * Resolves each reference to its full item object, preserving the declared pin order.
 *
 * @param {Array<string>} pinnedContent - Array of ContentRef strings
 * @param {Record<string, Array<object>>} collections - Synthesized collections map
 * @returns {Array<object>} Array of resolved item objects with attached ref metadata
 * @throws {ValidationError} If any reference is duplicated or cannot be resolved
 */
export function validateAndResolvePinnedContent(pinnedContent, collections) {
  if (!pinnedContent || !Array.isArray(pinnedContent)) {
    return [];
  }

  const resolved = [];
  const seen = new Set();

  for (const ref of pinnedContent) {
    const { collection, slug } = parseContentRef(ref);

    const normalizedRef = formatContentRef(collection, slug);
    if (seen.has(normalizedRef)) {
      throw new ValidationError(
        `Duplicate ContentRef in pinned_content: '${ref}'. Each item may only be pinned once.`
      );
    }
    seen.add(normalizedRef);

    const item = (collections[collection] || []).find((entry) => entry.slug === slug);

    if (!item) {
      throw new ValidationError(
        `Broken ContentRef in pinned_content: '${ref}'. Item with slug '${slug}' does not exist in synthesized collection '${collection}'.`
      );
    }

    resolved.push({
      ...item,
      collection: item.collection || collection,
      _ref: normalizedRef
    });
  }

  return resolved;
}
