import { COLLECTION_TYPES } from '../config/enums.js';
import { getCollectionLabel, COLLECTION_INDEX_ROUTES } from '../config/mappings.js';

/**
 * Builds a registry describing every collection type, so a theme can render
 * navigation and section listings generically instead of hard-coding names.
 * Themes that only care about one collection can ignore it.
 *
 * @param {Record<string, Array<object>>} [collections={}] - Synthesized collections
 * @returns {Array<{
 *   name: string,
 *   label: string,
 *   labelPlural: string,
 *   permalink: string,
 *   count: number,
 *   hasItems: boolean
 * }>} Collection registry in canonical order
 */
export function buildCollectionTypes(collections = {}) {
  return COLLECTION_TYPES.map((name) => {
    const items = collections[name] || [];
    return {
      name,
      label: getCollectionLabel(name, false),
      labelPlural: getCollectionLabel(name, true),
      permalink: COLLECTION_INDEX_ROUTES[name] || `/${name}/`,
      count: items.length,
      hasItems: items.length > 0
    };
  });
}
