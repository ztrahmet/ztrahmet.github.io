import fs from 'node:fs';
import path from 'node:path';
import { stripMarkdownAndHtml } from './text-sanitizer.js';
import {
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getCollectionLabel
} from '../config/mappings.js';
import { formatDate, formatDateRange } from '../config/format.js';
import { COLLECTION_TYPES, PROFILE_ANCHORS } from '../config/enums.js';
import { readProjectVersion } from '../config/paths.js';

/**
 * Extracts searchable text tokens from an array of links.
 * Extracts labels, URLs, hostnames, domain keywords, and icon names.
 * @param {Array<object>} links - Array of { label, url, icon }
 * @returns {string} Searchable text string
 */
export function extractLinksSearchText(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const tokens = [];
  for (const l of links) {
    if (l && typeof l === 'object') {
      if (l.label) tokens.push(l.label);
      if (l.icon) tokens.push(l.icon);
      if (l.url) {
        tokens.push(l.url);
        try {
          const parsed = new URL(l.url);
          tokens.push(parsed.hostname);
          const hostParts = parsed.hostname.split('.');
          hostParts.forEach((part) => {
            if (part.length > 2 && !['www', 'com', 'org', 'net', 'dev', 'io', 'edu', 'app'].includes(part)) {
              tokens.push(part);
            }
          });
          const pathSegments = parsed.pathname.split('/').filter(Boolean);
          pathSegments.forEach((seg) => {
            if (seg.length > 1) tokens.push(seg);
          });
        } catch {
          // not a standard URL (e.g. mailto:), continue
        }
      }
    }
  }
  return tokens.join(' ');
}

/**
 * Extracts date tokens including 4-digit years for search matching.
 * @param {string|number} date - Primary date string/int
 * @param {string} dateDisplay - Formatted date display string
 * @param {string|number} start - Start date string/int
 * @param {string|number} end - End date string/int
 * @returns {string} Date search tokens
 */
export function extractDateSearchText(date, dateDisplay, start, end) {
  const tokens = [];
  if (dateDisplay) tokens.push(dateDisplay);
  if (date) tokens.push(String(date));
  if (start) tokens.push(String(start));
  if (end) tokens.push(String(end));
  const yearMatches = `${dateDisplay || ''} ${date || ''} ${start || ''} ${end || ''}`.match(/\b\d{4}\b/g);
  if (yearMatches) {
    yearMatches.forEach((y) => tokens.push(y));
  }
  return Array.from(new Set(tokens)).join(' ');
}

/**
 * Returns collection name tokens including singular and plural forms.
 * @param {string} type - Collection key
 * @param {string} typeLabel - Display label
 * @returns {string} Collection search tokens
 */
export function getCollectionSearchTokens(type, typeLabel) {
  const plurals = {
    blog: 'blogs posts writing articles',
    project: 'projects showcases open-source apps',
    publication: 'publications papers research academic articles',
    certificate: 'certificates certifications credentials licenses',
    award: 'awards honors recognitions prizes',
    experience: 'experiences jobs roles employment work career positions',
    education: 'education degrees academic university school',
    skill: 'skills technologies taxonomy capabilities'
  };
  return [type, typeLabel, plurals[type] || ''].filter(Boolean).join(' ');
}

/**
 * Builds a search subtitle for a collection item based on its entity type.
 * @param {string} type - Collection type (blog, project, publication, certificate, award)
 * @param {object} item - Item record
 * @returns {string} Contextual subtitle
 */
function getCollectionSubtitle(type, item, locale) {
  switch (type) {
    case 'publication':
    case 'certificate':
    case 'award':
      return item.subtitle || '';
    case 'project': {
      const start = item.startDisplay ?? formatDate(item.start, locale);
      const end = item.endDisplay ?? formatDate(item.end, locale);
      return start && end ? `${start} – ${end}` : start;
    }
    case 'blog':
    default:
      return item.dateDisplay ?? formatDate(item.date, locale);
  }
}

/**
 * Compiles a unified, optimized search index from all profile and collection records.
 *
 * @param {object} engineData - Normalized engine dataset (site, profile, collections, mappings)
 * @returns {{
 *   version: string,
 *   generatedAt: string,
 *   totalRecords: number,
 *   records: Array<object>
 * }} Compiled search index payload
 */
export function buildSearchIndex(engineData) {
  const version = engineData?.build?.version || readProjectVersion('1.0.0');
  const generatedAt = engineData?.build?.generatedAt || new Date().toISOString();

  if (!engineData) {
    return {
      version,
      generatedAt,
      totalRecords: 0,
      records: []
    };
  }

  const { profile = {}, collections = {} } = engineData;
  const locale = engineData?.build?.locale || 'en-US';
  const records = [];

  // 1. Index Profile: Experience Records
  if (Array.isArray(profile.experience)) {
    profile.experience.forEach((exp, idx) => {
      const dateDisplay = exp.dateDisplay ?? formatDateRange(exp.start, exp.end, locale);
      const modalityLabel = getModalityLabel(exp.modality, 'experience');
      const employmentTypeLabel = getEmploymentTypeLabel(exp.type);
      const skills = Array.isArray(exp.skills) ? exp.skills : [];
      const description = stripMarkdownAndHtml(exp.description || '');
      const links = exp.url ? extractLinksSearchText([{ label: exp.organization, url: exp.url }]) : '';

      records.push({
        id: `experience:${idx}`,
        type: 'experience',
        typeLabel: 'Experience',
        title: exp.title,
        subtitle: exp.organization,
        url: exp.url || '',
        permalink: PROFILE_ANCHORS.experience,
        date: exp.start || '',
        dateDisplay,
        skills,
        description,
        content: '',
        issuer: '',
        publisher: '',
        authors: [],
        credential_id: '',
        links,
        headings: [],
        location: exp.location || '',
        hasMarkdown: false,
        searchable: [
          exp.title,
          exp.organization,
          getCollectionSearchTokens('experience', 'Experience'),
          ...skills,
          extractDateSearchText(exp.start, dateDisplay, exp.start, exp.end),
          exp.location,
          modalityLabel,
          employmentTypeLabel,
          links,
          description
        ].filter(Boolean).join(' '),
        meta: {
          location: exp.location || '',
          modality: modalityLabel,
          employmentType: employmentTypeLabel
        }
      });
    });
  }

  // 2. Index Profile: Education Records
  if (Array.isArray(profile.education)) {
    profile.education.forEach((edu, idx) => {
      const dateDisplay = edu.dateDisplay ?? formatDateRange(edu.start, edu.end, locale);
      const modalityLabel = getModalityLabel(edu.modality, 'education');
      const degreeTypeLabel = getDegreeTypeLabel(edu.type);
      const skills = Array.isArray(edu.skills) ? edu.skills : [];
      const description = stripMarkdownAndHtml(edu.description || '');
      const links = edu.url ? extractLinksSearchText([{ label: edu.organization, url: edu.url }]) : '';

      records.push({
        id: `education:${idx}`,
        type: 'education',
        typeLabel: 'Education',
        title: edu.title,
        subtitle: edu.organization,
        url: edu.url || '',
        permalink: PROFILE_ANCHORS.education,
        date: edu.start || '',
        dateDisplay,
        skills,
        description,
        content: '',
        issuer: '',
        publisher: '',
        authors: [],
        credential_id: '',
        links,
        headings: [],
        location: edu.location || '',
        hasMarkdown: false,
        searchable: [
          edu.title,
          edu.organization,
          getCollectionSearchTokens('education', 'Education'),
          ...skills,
          extractDateSearchText(edu.start, dateDisplay, edu.start, edu.end),
          edu.location,
          modalityLabel,
          degreeTypeLabel,
          edu.grade,
          links,
          description
        ].filter(Boolean).join(' '),
        meta: {
          location: edu.location || '',
          modality: modalityLabel,
          degreeType: degreeTypeLabel,
          grade: edu.grade || ''
        }
      });
    });
  }

  // 3. Index All Collections (blog, project, publication, certificate, award)
  for (const type of COLLECTION_TYPES) {
    const items = collections[type] || [];
    const typeLabel = getCollectionLabel(type, false);

    for (const item of items) {
      const subtitle = getCollectionSubtitle(type, item, locale);
      const dateDisplay = item.dateDisplay ?? formatDate(item.date ?? item.start, locale);
      const plainContent = item.hasMarkdown && item.content ? stripMarkdownAndHtml(item.content) : '';
      const description = stripMarkdownAndHtml(item.description || '');
      const skills = Array.isArray(item.skills) ? item.skills : [];
      const links = extractLinksSearchText(item.link);
      const headings = Array.isArray(item.toc) ? item.toc.map((t) => t.text) : [];
      const authors = Array.isArray(item.authors) ? item.authors : [];
      const issuer = item.issuer || '';
      const publisher = item.publisher || '';
      const credentialId = item.credential_id || '';
      const location = item.location || '';

      const meta = {};
      if (Array.isArray(item.link) && item.link.length > 0) meta.link = item.link;
      if (authors.length > 0) meta.authors = authors;
      if (credentialId) meta.credential_id = credentialId;
      if (item.expires) meta.expires = item.expiresDisplay ?? formatDate(item.expires, locale);
      if (publisher) meta.publisher = publisher;
      if (issuer) meta.issuer = issuer;
      if (item.readingTime) meta.readingTime = item.readingTime;
      if (item.wordCount) meta.wordCount = item.wordCount;
      if (headings.length > 0) meta.headings = headings;

      records.push({
        id: `${type}:${item.slug}`,
        type,
        typeLabel,
        slug: item.slug,
        title: item.title,
        subtitle,
        url: item.link?.[0]?.url || item.url || '',
        permalink: item.permalink,
        date: item.primaryDate ?? (item.date || item.start || ''),
        dateDisplay,
        skills,
        description,
        content: plainContent,
        issuer,
        publisher,
        authors,
        credential_id: credentialId,
        links,
        headings,
        location,
        hasMarkdown: Boolean(item.hasMarkdown),
        searchable: [
          item.title,
          subtitle,
          description,
          getCollectionSearchTokens(type, typeLabel),
          ...skills,
          extractDateSearchText(item.date, dateDisplay, item.start, item.end),
          issuer,
          publisher,
          ...authors,
          credentialId,
          links,
          ...headings,
          location,
          plainContent
        ].filter(Boolean).join(' '),
        meta: Object.keys(meta).length > 0 ? meta : undefined
      });
    }
  }

  // 4. Index Taxonomy Skills
  if (engineData.taxonomy && Array.isArray(engineData.taxonomy.allSkills)) {
    for (const skill of engineData.taxonomy.allSkills) {
      const referencedTitles = (skill.items || [])
        .map((it) => `${it.title || ''} ${it.organization || ''}`)
        .filter(Boolean)
        .join(' ');

      records.push({
        id: `skill:${skill.slug}`,
        type: 'skill',
        typeLabel: 'Skill',
        slug: skill.slug,
        title: skill.name,
        subtitle: `${skill.count} reference${skill.count === 1 ? '' : 's'}`,
        url: '',
        permalink: `/skills/${skill.slug}/`,
        date: '',
        dateDisplay: '',
        skills: [skill.name],
        description: `Skill: ${skill.name}`,
        content: referencedTitles,
        issuer: '',
        publisher: '',
        authors: [],
        credential_id: '',
        links: '',
        headings: [],
        location: '',
        hasMarkdown: false,
        searchable: [
          skill.name,
          skill.slug,
          getCollectionSearchTokens('skill', 'Skill'),
          referencedTitles
        ].filter(Boolean).join(' ')
      });
    }
  }

  return {
    version,
    generatedAt,
    totalRecords: records.length,
    records
  };
}

/**
 * Canonical field weights reflecting the relative importance of item metadata.
 */
export const SEARCH_FIELD_WEIGHTS = Object.freeze({
  title: 15,
  skills: 12,
  subtitle: 7,
  issuer: 7,
  publisher: 7,
  credential_id: 6,
  authors: 5,
  headings: 4,
  links: 3.5,
  typeLabel: 3.5,
  type: 3.5,
  description: 3,
  date: 2.5,
  location: 2,
  content: 0.5
});

/**
 * Calculates a relevance score for an indexed search item given a query and optional raw search result.
 * Accounts for field importance, whole-phrase title matches, exact skill matches,
 * multi-term coverage, and recency tie-breaking.
 *
 * @param {object} item - Indexed record
 * @param {string} query - Raw search query string
 * @param {object} [searchMatch] - Raw search match (e.g. MiniSearch result with .score, .match)
 * @returns {number} Calculated relevance score
 */
export function calculateRelevance(item, query, searchMatch) {
  if (!item || typeof item !== 'object') return 0;
  const q = (query || '').toLowerCase().trim();
  if (!q) return 0;
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;

  let score = 0;
  const title = (item.title || '').toLowerCase();
  const subtitle = (item.subtitle || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const skills = Array.isArray(item.skills) ? item.skills.map((s) => String(s).toLowerCase()) : [];
  const issuer = (item.issuer || '').toLowerCase();
  const publisher = (item.publisher || '').toLowerCase();
  const authors = Array.isArray(item.authors) ? item.authors.map((a) => String(a).toLowerCase()).join(' ') : '';
  const links = (item.links || '').toLowerCase();
  const headings = Array.isArray(item.headings) ? item.headings.map((h) => String(h).toLowerCase()).join(' ') : '';
  const typeLabel = (item.typeLabel || '').toLowerCase();
  const type = (item.type || '').toLowerCase();
  const dateStr = (item.dateDisplay || item.date || '').toLowerCase();
  const content = (item.content || '').toLowerCase();

  // 1. Dominant exact whole-query matches
  if (title === q) {
    score += 300;
  } else if (title.startsWith(q)) {
    score += 180;
  } else if (title.includes(q)) {
    score += 100;
  }

  // Exact skill match
  if (skills.includes(q)) {
    score += 160;
  } else if (skills.some((s) => s.startsWith(q))) {
    score += 80;
  }

  // Exact phrase in metadata
  if (q.length > 2) {
    if (issuer.includes(q)) score += 70;
    if (subtitle.includes(q)) score += 50;
    if (desc.includes(q)) score += 40;
  }

  // 2. Field-by-Field Term Scoring with weights
  let termsMatched = 0;
  terms.forEach((term) => {
    let termMatched = false;
    let termMaxWeight = 0;

    if (title.includes(term)) {
      termMatched = true;
      const exactWord = new RegExp('\\b' + term + '\\b').test(title);
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.title * (exactWord ? 1.5 : 1.0));
    }
    if (skills.some((s) => s === term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.skills * 1.5);
    } else if (skills.some((s) => s.includes(term))) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.skills);
    }
    if (subtitle.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.subtitle);
    }
    if (issuer.includes(term) || publisher.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.issuer);
    }
    if (authors.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.authors);
    }
    if (headings.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.headings);
    }
    if (links.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.links);
    }
    if (typeLabel.includes(term) || type.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.typeLabel);
    }
    if (desc.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.description);
    }
    if (dateStr.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.date);
    }
    if (content.includes(term)) {
      termMatched = true;
      termMaxWeight = Math.max(termMaxWeight, SEARCH_FIELD_WEIGHTS.content);
    }

    // MiniSearch fuzzy/prefix fallback
    if (!termMatched && searchMatch && searchMatch.match) {
      for (const matchedTerm of Object.keys(searchMatch.match)) {
        if (matchedTerm.startsWith(term) || term.startsWith(matchedTerm)) {
          termMatched = true;
          termMaxWeight = Math.max(termMaxWeight, 2.0);
          break;
        } else {
          termMatched = true;
          termMaxWeight = Math.max(termMaxWeight, 1.0);
          break;
        }
      }
    }

    if (termMatched) {
      termsMatched++;
      score += termMaxWeight * 6;
    }
  });

  // 3. Multi-term coverage: reward documents matching all terms
  const coverage = terms.length > 0 ? termsMatched / terms.length : 1;
  score *= Math.pow(coverage, 2);

  // 4. Retain BM25 component if provided
  if (searchMatch && searchMatch.score) {
    score += searchMatch.score * 0.2;
  }

  // 5. Recency tie-breaker
  const yearMatch = (item.date || item.dateDisplay || '').match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (!isNaN(yr)) {
      score += Math.max(0, (yr - 2015) * 0.05);
    }
  }

  return score;
}

/**
 * Compiles and writes the static search-index.json artifact to disk.
 *
 * @param {object} engineData - Normalized engine dataset
 * @param {string} outputFilePath - Absolute path to target search-index.json
 * @returns {object} The written search index object
 */
export function writeSearchIndexFile(engineData, outputFilePath) {
  const index = engineData?.search_index || buildSearchIndex(engineData);
  const targetDir = path.dirname(outputFilePath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(outputFilePath, JSON.stringify(index, null, 2), 'utf-8');
  return index;
}
