/**
 * Calculates related items for a collection entry based on shared skills and contextual overlap.
 *
 * @param {object} currentItem - The target collection item
 * @param {Array<object>} allItems - Flat array of all collection items across the site
 * @param {number} [limit=3] - Maximum number of related items to return
 * @returns {Array<{ collection: string, title: string, slug: string, permalink: string, date: string, image: any, sharedSkills: Array<string> }>}
 */
export function computeRelatedItems(currentItem, allItems = [], limit = 3) {
  if (!currentItem || !Array.isArray(allItems) || allItems.length === 0) {
    return [];
  }

  const currentSkills = new Set(
    (Array.isArray(currentItem.skills) ? currentItem.skills : []).map((s) => s.toLowerCase().trim())
  );

  if (currentSkills.size === 0) {
    return [];
  }

  const scored = [];

  for (const other of allItems) {
    // Exclude self
    if (other.slug === currentItem.slug && other.collection === currentItem.collection) {
      continue;
    }

    const otherSkills = Array.isArray(other.skills) ? other.skills : [];
    const shared = [];

    for (const skill of otherSkills) {
      if (currentSkills.has(skill.toLowerCase().trim())) {
        shared.push(skill);
      }
    }

    if (shared.length > 0) {
      // Score = shared skills count * 10 + same collection bonus
      const score = shared.length * 10 + (other.collection === currentItem.collection ? 2 : 0);
      scored.push({
        score,
        item: {
          collection: other.collection,
          title: other.title,
          slug: other.slug,
          permalink: other.permalink,
          date: other.date || other.start || '',
          image: other.image || null,
          description: other.description || '',
          sharedSkills: shared
        }
      });
    }
  }

  // Sort descending by score, then by date descending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const dateA = a.item.date || '';
    const dateB = b.item.date || '';
    return dateB.localeCompare(dateA);
  });

  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Attaches related items recommendations to every collection item in all collections.
 *
 * @param {Record<string, Array<object>>} collections - Synthesized collections map
 * @returns {Record<string, Array<object>>} Collections with attached related recommendations
 */
export function attachRelatedItemsToCollections(collections = {}) {
  const allItems = Object.values(collections).flat();
  const enrichedCollections = {};

  for (const [colName, items] of Object.entries(collections)) {
    enrichedCollections[colName] = items.map((item) => ({
      ...item,
      related: computeRelatedItems(item, allItems, 3)
    }));
  }

  return enrichedCollections;
}
