import fs from 'node:fs';
import path from 'node:path';
import { stripMarkdownAndHtml } from './text-sanitizer.js';
import {
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getCollectionLabel
} from '../config/mappings.js';
import { formatDate } from '../config/format.js';
import { COLLECTION_TYPES } from '../config/enums.js';
import { readProjectVersion } from '../config/paths.js';

/**
 * Builds a search subtitle for a collection item based on its entity type.
 * @param {string} type - Collection type (blog, project, publication, certificate, award)
 * @param {object} item - Item record
 * @returns {string} Contextual subtitle
 */
function getCollectionSubtitle(type, item) {
  switch (type) {
    case 'publication':
      return item.publisher || '';
    case 'certificate':
      return item.issuer || '';
    case 'award':
      return item.issuer || '';
    case 'project':
      if (item.start && item.end) {
        return `${formatDate(item.start)} – ${formatDate(item.end)}`;
      }
      return item.start ? formatDate(item.start) : '';
    case 'blog':
    default:
      return item.date ? formatDate(item.date) : '';
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
  const records = [];

  // 1. Index Profile: Experience Records
  if (Array.isArray(profile.experience)) {
    profile.experience.forEach((exp, idx) => {
      const dateDisplay = exp.start && exp.end
        ? `${formatDate(exp.start)} – ${formatDate(exp.end)}`
        : formatDate(exp.start || '');

      records.push({
        id: `experience:${idx}`,
        type: 'experience',
        typeLabel: 'Experience',
        title: exp.title,
        subtitle: exp.organization,
        url: exp.url || '',
        permalink: '/#experience',
        date: exp.start || '',
        dateDisplay,
        skills: Array.isArray(exp.skills) ? exp.skills : [],
        description: stripMarkdownAndHtml(exp.description || ''),
        content: '',
        meta: {
          location: exp.location || '',
          modality: getModalityLabel(exp.modality, 'experience'),
          employmentType: getEmploymentTypeLabel(exp.type)
        }
      });
    });
  }

  // 2. Index Profile: Education Records
  if (Array.isArray(profile.education)) {
    profile.education.forEach((edu, idx) => {
      const dateDisplay = edu.start && edu.end
        ? `${formatDate(edu.start)} – ${formatDate(edu.end)}`
        : formatDate(edu.start || '');

      records.push({
        id: `education:${idx}`,
        type: 'education',
        typeLabel: 'Education',
        title: edu.title,
        subtitle: edu.organization,
        url: edu.url || '',
        permalink: '/#education',
        date: edu.start || '',
        dateDisplay,
        skills: Array.isArray(edu.skills) ? edu.skills : [],
        description: stripMarkdownAndHtml(edu.description || ''),
        content: '',
        meta: {
          location: edu.location || '',
          modality: getModalityLabel(edu.modality, 'education'),
          degreeType: getDegreeTypeLabel(edu.type),
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
      const subtitle = getCollectionSubtitle(type, item);
      const dateDisplay = item.date ? formatDate(item.date) : (item.start ? formatDate(item.start) : '');
      const plainContent = item.hasMarkdown && item.content ? stripMarkdownAndHtml(item.content) : '';
      const description = stripMarkdownAndHtml(item.description || '');

      const meta = {};
      if (item.repository) meta.repository = item.repository;
      if (Array.isArray(item.authors) && item.authors.length > 0) meta.authors = item.authors;
      if (item.credential_id) meta.credential_id = item.credential_id;
      if (item.expires) meta.expires = formatDate(item.expires);
      if (item.publisher) meta.publisher = item.publisher;
      if (item.issuer) meta.issuer = item.issuer;
      if (item.readingTime) meta.readingTime = item.readingTime;
      if (item.wordCount) meta.wordCount = item.wordCount;
      if (Array.isArray(item.toc) && item.toc.length > 0) {
        meta.headings = item.toc.map((t) => t.text);
      }

      records.push({
        id: `${type}:${item.slug}`,
        type,
        typeLabel,
        slug: item.slug,
        title: item.title,
        subtitle,
        url: item.url || '',
        permalink: item.permalink,
        date: item.date || item.start || '',
        dateDisplay,
        skills: Array.isArray(item.skills) ? item.skills : [],
        description,
        content: plainContent,
        hasMarkdown: Boolean(item.hasMarkdown),
        meta: Object.keys(meta).length > 0 ? meta : undefined
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
