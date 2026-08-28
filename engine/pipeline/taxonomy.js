import { COLLECTION_TYPES } from '../config/enums.js';

/**
 * Builds a global inverted taxonomy index for skills spanning profile entries and all collections.
 *
 * @param {object} engineData - Dataset containing profile and collections
 * @returns {{
 *   skills: Record<string, { name: string, count: number, items: Array<{ type: string, title: string, permalink: string, slug: string }> }>,
 *   allSkills: Array<string>,
 *   totalUniqueSkills: number
 * }} Compiled inverted taxonomy index
 */
export function buildTaxonomy(engineData = {}) {
  const { profile = {}, collections = {} } = engineData;
  const skillMap = new Map();

  /**
   * Records a skill reference for an item.
   * @param {string} skill - Skill name
   * @param {object} itemRef - Referenced entity metadata
   */
  function addSkillRef(skill, itemRef) {
    if (!skill || typeof skill !== 'string' || !skill.trim()) return;
    const cleanSkill = skill.trim();

    if (!skillMap.has(cleanSkill)) {
      skillMap.set(cleanSkill, {
        name: cleanSkill,
        count: 0,
        items: []
      });
    }

    const entry = skillMap.get(cleanSkill);
    entry.count++;
    entry.items.push(itemRef);
  }

  // 1. Ingest Profile: Experience Skills
  if (Array.isArray(profile.experience)) {
    profile.experience.forEach((exp, idx) => {
      const skills = Array.isArray(exp.skills) ? exp.skills : [];
      const itemRef = {
        type: 'experience',
        title: exp.title || 'Experience',
        permalink: exp.url || '/#experience',
        slug: `experience:${idx}`
      };
      skills.forEach((s) => addSkillRef(s, itemRef));
    });
  }

  // 2. Ingest Profile: Education Skills
  if (Array.isArray(profile.education)) {
    profile.education.forEach((edu, idx) => {
      const skills = Array.isArray(edu.skills) ? edu.skills : [];
      const itemRef = {
        type: 'education',
        title: edu.title || 'Education',
        permalink: edu.url || '/#education',
        slug: `education:${idx}`
      };
      skills.forEach((s) => addSkillRef(s, itemRef));
    });
  }

  // 3. Ingest All Collections
  for (const type of COLLECTION_TYPES) {
    const items = collections[type] || [];
    for (const item of items) {
      const skills = Array.isArray(item.skills) ? item.skills : [];
      const itemRef = {
        type,
        title: item.title || item.slug,
        permalink: item.permalink || `/${type}/${item.slug}/`,
        slug: item.slug
      };
      skills.forEach((s) => addSkillRef(s, itemRef));
    }
  }

  // Convert Map to sorted object and array
  const skillsObj = {};
  const sortedSkillNames = Array.from(skillMap.keys()).sort((a, b) => {
    const countDiff = skillMap.get(b).count - skillMap.get(a).count;
    return countDiff !== 0 ? countDiff : a.localeCompare(b);
  });

  for (const name of sortedSkillNames) {
    skillsObj[name] = skillMap.get(name);
  }

  return {
    skills: skillsObj,
    allSkills: sortedSkillNames,
    totalUniqueSkills: sortedSkillNames.length
  };
}
