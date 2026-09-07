import { COLLECTION_TYPES, PROFILE_ANCHORS } from '../config/enums.js';
import { slugify } from '../config/format.js';
import { sortByRecency } from './ordering.js';

/**
 * Builds a global inverted taxonomy index for skills spanning profile entries and all collections.
 *
 * Skills are canonicalized case-insensitively, so "Node.js" and "node.js" resolve to a single
 * entry, matching how the content graph scores skill overlap. Each entry carries a URL-safe,
 * collision-free slug for routing, and every reference exposes an internal permalink separately
 * from any external URL.
 *
 * @param {object} engineData - Dataset containing profile and collections
 * @returns {{
 *   skills: Record<string, { name: string, key: string, slug: string, count: number, items: Array<object> }>,
 *   allSkills: Array<object>,
 *   skillNames: Array<string>,
 *   totalUniqueSkills: number
 * }} Compiled inverted taxonomy index
 */
export function buildTaxonomy(engineData = {}) {
  const { profile = {}, collections = {} } = engineData;
  const skillMap = new Map();

  /**
   * Records a skill reference for an item under its canonical key.
   * @param {string} skill - Skill name as authored
   * @param {object} itemRef - Referenced entity metadata
   */
  function addSkillRef(skill, itemRef) {
    if (!skill || typeof skill !== 'string' || !skill.trim()) return;

    const name = skill.trim();
    const key = name.toLowerCase();

    if (!skillMap.has(key)) {
      skillMap.set(key, { name, key, slug: '', count: 0, items: [] });
    }

    const entry = skillMap.get(key);
    entry.count++;
    entry.items.push(itemRef);
  }

  /**
   * Ingests the skills of a profile section (experience or education).
   * @param {Array<object>} entries - Profile entries
   * @param {string} type - Reference type label
   * @param {string} anchor - Internal anchor permalink
   */
  function ingestProfileSection(entries, type, anchor) {
    if (!Array.isArray(entries)) return;

    entries.forEach((entry, idx) => {
      const itemRef = {
        type,
        title: entry.title || '',
        organization: entry.organization || '',
        permalink: anchor,
        url: entry.url || '',
        slug: `${type}:${idx}`,
        date: entry.start || '',
        end: entry.end || '',
        logo: entry.logo || null
      };
      const skills = Array.isArray(entry.skills) ? entry.skills : [];
      skills.forEach((s) => addSkillRef(s, itemRef));
    });
  }

  ingestProfileSection(profile.experience, 'experience', PROFILE_ANCHORS.experience);
  ingestProfileSection(profile.education, 'education', PROFILE_ANCHORS.education);

  for (const type of COLLECTION_TYPES) {
    const items = collections[type] || [];
    for (const item of items) {
      const itemRef = {
        type,
        title: item.title || item.slug,
        permalink: item.permalink || `/${type}/${item.slug}/`,
        url: item.link?.[0]?.url || item.url || '',
        slug: item.slug,
        date: item.date || item.start || '',
        end: item.end || '',
        logo: item.logo || null
      };
      const skills = Array.isArray(item.skills) ? item.skills : [];
      skills.forEach((s) => addSkillRef(s, itemRef));
    }
  }

  // Sort by frequency, then alphabetically, so slug disambiguation stays deterministic
  const sorted = Array.from(skillMap.values()).sort((a, b) => {
    const countDiff = b.count - a.count;
    return countDiff !== 0 ? countDiff : a.name.localeCompare(b.name);
  });

  const usedSlugs = new Map();
  const skills = {};
  const bySlug = {};

  for (const entry of sorted) {
    const baseSlug = slugify(entry.name) || 'skill';
    const taken = usedSlugs.get(baseSlug) || 0;
    entry.slug = taken > 0 ? `${baseSlug}-${taken}` : baseSlug;
    usedSlugs.set(baseSlug, taken + 1);
    entry.items = sortByRecency(entry.items);
    skills[entry.key] = entry;
    bySlug[entry.slug] = entry;
  }

  return {
    skills,
    bySlug,
    allSkills: sorted,
    skillNames: sorted.map((entry) => entry.name),
    totalUniqueSkills: sorted.length
  };
}

/**
 * Resolves a taxonomy entry by skill name, canonical key, or slug.
 *
 * @param {object} taxonomy - Compiled taxonomy index
 * @param {string} value - Skill name, key, or slug
 * @returns {object|null} Matching taxonomy entry, or null
 */
export function findSkill(taxonomy, value) {
  if (!taxonomy || !value || typeof value !== 'string') return null;

  const key = value.trim().toLowerCase();
  return taxonomy.skills?.[key] || taxonomy.bySlug?.[key] || taxonomy.allSkills?.find((entry) => entry.slug === key) || null;
}
