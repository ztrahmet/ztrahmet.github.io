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
 * Builds an inverted index of skills and recency-sorted collection maps
 * across all items to eliminate O(N^2) pairwise comparisons in recommendation queries.
 *
 * @param {Array<object>} allItems - Flat list of all collection items
 * @returns {{ skillToItems: Map<string, Array<object>>, byCollection: Map<string, Array<object>> }}
 */
export function buildContentGraphIndex(allItems = []) {
  const skillToItems = new Map();
  const byCollection = new Map();

  for (const item of allItems) {
    if (!item) continue;

    const skills = Array.isArray(item.skills) ? item.skills : [];
    for (const skill of skills) {
      if (typeof skill !== 'string' || !skill.trim()) continue;
      const key = skill.trim().toLowerCase();
      let list = skillToItems.get(key);
      if (!list) {
        list = [];
        skillToItems.set(key, list);
      }
      list.push(item);
    }

    if (item.collection) {
      let list = byCollection.get(item.collection);
      if (!list) {
        list = [];
        byCollection.set(item.collection, list);
      }
      list.push(item);
    }
  }

  for (const [col, list] of byCollection.entries()) {
    byCollection.set(col, sortByRecency(list));
  }

  return { skillToItems, byCollection };
}

/**
 * Calculates related items for a collection entry based on shared skills using an inverted index.
 * When an item has too few skill matches, the remaining slots are filled with the
 * chronologically nearest items from the same collection.
 *
 * @param {object} currentItem - The target collection item
 * @param {Array<object>} allItems - Flat array of all collection items across the site
 * @param {number} [limit=3] - Maximum number of related items to return
 * @param {{ skillToItems: Map<string, Array<object>>, byCollection: Map<string, Array<object>> }} [index=null] - Pre-built content graph index
 * @returns {Array<object>} Related item projections, strongest match first
 */
export function computeRelatedItems(currentItem, allItems = [], limit = 3, index = null) {
  if (!currentItem || !Array.isArray(allItems) || allItems.length === 0 || limit <= 0) {
    return [];
  }

  const isSelf = (other) => other.slug === currentItem.slug && other.collection === currentItem.collection;
  const graphIndex = index || buildContentGraphIndex(allItems);
  const currentSkills = toSkillKeys(currentItem.skills);
  const scored = [];

  if (currentSkills.size > 0) {
    const candidates = new Set();
    for (const skillKey of currentSkills) {
      const matches = graphIndex.skillToItems.get(skillKey);
      if (matches) {
        for (const candidate of matches) {
          if (!isSelf(candidate)) {
            candidates.add(candidate);
          }
        }
      }
    }

    for (const other of candidates) {
      const shared = (Array.isArray(other.skills) ? other.skills : []).filter((skill) =>
        currentSkills.has(String(skill).trim().toLowerCase())
      );

      if (shared.length > 0) {
        const score = shared.length * 10 + (other.collection === currentItem.collection ? 2 : 0);
        scored.push({ score, item: toRelatedItem(other, shared, 'skills') });
      }
    }

    // Strongest skill overlap first, then recency ordering
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareByRecency(a.item, b.item);
    });
  }

  const related = scored.slice(0, limit).map((entry) => entry.item);
  if (related.length >= limit) return related;

  // Fill remaining slots with the most recent siblings from the same collection
  const taken = new Set(related.map((item) => `${item.collection}:${item.slug}`));
  const siblings = graphIndex.byCollection.get(currentItem.collection) || [];

  for (const sibling of siblings) {
    if (related.length >= limit) break;
    if (isSelf(sibling) || taken.has(`${sibling.collection}:${sibling.slug}`)) continue;
    related.push(toRelatedItem(sibling, [], 'collection'));
  }

  return related;
}

/**
 * Attaches related items recommendations to every collection item in all collections.
 * Precomputes an inverted graph index once for all collections.
 *
 * @param {Record<string, Array<object>>} collections - Synthesized collections map
 * @param {number} [limit=3] - Maximum number of related items per entry
 * @returns {Record<string, Array<object>>} Collections with attached related recommendations
 */
export function attachRelatedItemsToCollections(collections = {}, limit = 3) {
  const allItems = Object.values(collections).flat();
  const index = buildContentGraphIndex(allItems);
  const enriched = {};

  for (const [name, items] of Object.entries(collections)) {
    enriched[name] = items.map((item) => ({
      ...item,
      related: computeRelatedItems(item, allItems, limit, index)
    }));
  }

  return enriched;
}
