import { toDateString } from '../config/format.js';
import { compareByRecency, sortByRecency, isOngoing } from './ordering.js';

/**
 * Normalizes a skill list into canonical lookup keys.
 * Matches the canonicalization used by the taxonomy index.
 *
 * @param {Array<string>} skills - Raw skill names
 * @returns {Set<string>} Canonical skill keys
 */
function toSkillKeys(skills) {
  const list = Array.isArray(skills) ? skills : [];
  return new Set(list.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().toLowerCase()));
}

/**
 * Projects a collection item into the lightweight shape used for recommendations.
 *
 * @param {object} item - Source collection item
 * @param {Array<string>} sharedSkills - Skills shared with the current item
 * @param {'skills' | 'collection'} reason - Why the item was recommended
 * @returns {object} Related item projection
 */
function toRelatedItem(item, sharedSkills, reason) {
  return {
    collection: item.collection,
    title: item.title,
    slug: item.slug,
    permalink: item.permalink,
    date: toDateString(item.date || item.start),
    end: toDateString(item.end),
    isOngoing: isOngoing(item),
    image: item.image || null,
    logo: item.logo || null,
    description: item.description || '',
    sharedSkills,
    reason
  };
}

/**
 * Calculates related items for a collection entry based on shared skills.
 * When an item has too few skill matches, the remaining slots are filled with the
 * chronologically nearest items from the same collection, so every item can offer
 * the theme something to render.
 *
 * @param {object} currentItem - The target collection item
 * @param {Array<object>} allItems - Flat array of all collection items across the site
 * @param {number} [limit=3] - Maximum number of related items to return
 * @returns {Array<object>} Related item projections, strongest match first
 */
export function computeRelatedItems(currentItem, allItems = [], limit = 3) {
  if (!currentItem || !Array.isArray(allItems) || allItems.length === 0 || limit <= 0) {
    return [];
  }

  const isSelf = (other) => other.slug === currentItem.slug && other.collection === currentItem.collection;
  const currentSkills = toSkillKeys(currentItem.skills);
  const scored = [];

  if (currentSkills.size > 0) {
    for (const other of allItems) {
      if (isSelf(other)) continue;

      const shared = (Array.isArray(other.skills) ? other.skills : []).filter((skill) =>
        currentSkills.has(String(skill).trim().toLowerCase())
      );

      if (shared.length > 0) {
        const score = shared.length * 10 + (other.collection === currentItem.collection ? 2 : 0);
        scored.push({ score, item: toRelatedItem(other, shared, 'skills') });
      }
    }

    // Strongest skill overlap first, then the shared recency ordering
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareByRecency(a.item, b.item);
    });
  }

  const related = scored.slice(0, limit).map((entry) => entry.item);
  if (related.length >= limit) return related;

  // Fill remaining slots with the most recent siblings from the same collection
  const taken = new Set(related.map((item) => `${item.collection}:${item.slug}`));
  const siblings = sortByRecency(
    allItems
      .filter((other) => !isSelf(other) && other.collection === currentItem.collection)
      .filter((other) => !taken.has(`${other.collection}:${other.slug}`))
  );

  for (const sibling of siblings) {
    if (related.length >= limit) break;
    related.push(toRelatedItem(sibling, [], 'collection'));
  }

  return related;
}

/**
 * Attaches related items recommendations to every collection item in all collections.
 *
 * @param {Record<string, Array<object>>} collections - Synthesized collections map
 * @param {number} [limit=3] - Maximum number of related items per entry
 * @returns {Record<string, Array<object>>} Collections with attached related recommendations
 */
export function attachRelatedItemsToCollections(collections = {}, limit = 3) {
  const allItems = Object.values(collections).flat();
  const enriched = {};

  for (const [name, items] of Object.entries(collections)) {
    enriched[name] = items.map((item) => ({
      ...item,
      related: computeRelatedItems(item, allItems, limit)
    }));
  }

  return enriched;
}
