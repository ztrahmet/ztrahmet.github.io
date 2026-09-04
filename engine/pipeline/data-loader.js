import path from 'node:path';
import { loadYamlFile } from './yaml-loader.js';
import { validateData, validateContent } from '../validation/validator.js';
import { synthesizeAllCollections } from './collection-synthesizer.js';
import { validateAndResolvePinnedContent } from './content-ref.js';
import { normalizeAsset, resetMissingAssetWarnings } from './asset-normalizer.js';
import { UI_MAPPINGS } from '../config/mappings.js';
import { resolveContentDir, readProjectVersion } from '../config/paths.js';
import { resolveLocale } from '../config/format.js';
import { COLLECTION_TYPES } from '../config/enums.js';
import { buildSearchIndex } from '../search/search-indexer.js';
import { buildTaxonomy } from './taxonomy.js';
import { sortByRecency } from './ordering.js';
import { buildCollectionTypes } from './collection-views.js';
import { enrichProfile } from './profile-normalizer.js';

/**
 * Normalizes an optional asset field, leaving the property absent when unset.
 * @param {object} target - Object holding the asset property
 * @param {string} key - Property name
 * @param {object} options - Asset normalization options
 */
function normalizeOptionalAsset(target, key, options) {
  if (target?.[key]) {
    target[key] = normalizeAsset(target[key], options);
  }
}

/**
 * Lowercases language levels so an author can write B2, b2 or Native.
 *
 * This runs before validation rather than after, because the schema enum is the
 * thing being satisfied and JSON Schema has no case-insensitive enum. The data
 * is copied down to the level being changed; nothing else is touched.
 *
 * @param {object} data - Parsed data.yaml, before validation
 * @returns {object} Data with normalized language levels
 */
export function normalizeLanguageLevels(data) {
  const languages = data?.profile?.languages;
  if (!Array.isArray(languages)) return data;

  return {
    ...data,
    profile: {
      ...data.profile,
      languages: languages.map((language) => (
        typeof language?.level === 'string'
          ? { ...language, level: language.level.trim().toLowerCase() }
          : language
      ))
    }
  };
}

/**
 * Normalizes all asset paths in data.yaml (site and profile entities).
 * Checks physical existence of referenced assets within contentDir.
 *
 * @param {object} data - Parsed data.yaml object
 * @param {string} [contentDir] - Absolute path to content directory
 * @returns {object} Cloned data object with normalized assets
 */
export function normalizeDataAssets(data, contentDir) {
  if (!data) return data;

  const cloned = structuredClone(data);
  const options = { contentDir, warnMissing: true };

  if (cloned.site) {
    // Guarantee a language so templates never emit an empty lang attribute
    cloned.site.lang = cloned.site.lang || 'en';
    // Guarantee an accent so the stylesheet always has a palette to read
    cloned.site.accent = cloned.site.accent || 'petrol';
    normalizeOptionalAsset(cloned.site, 'favicon', options);
    normalizeOptionalAsset(cloned.site, 'share_image', options);
  }

  if (cloned.profile) {
    normalizeOptionalAsset(cloned.profile, 'avatar', options);
    normalizeOptionalAsset(cloned.profile, 'resume', options);

    for (const link of cloned.profile.social || []) {
      normalizeOptionalAsset(link, 'icon', { ...options, isIcon: true });
    }

    for (const entry of [...(cloned.profile.experience || []), ...(cloned.profile.education || [])]) {
      normalizeOptionalAsset(entry, 'logo', options);
    }

    // Order profile history newest first, with current roles ranked above past ones
    if (Array.isArray(cloned.profile.experience)) {
      cloned.profile.experience = sortByRecency(cloned.profile.experience);
    }
    if (Array.isArray(cloned.profile.education)) {
      cloned.profile.education = sortByRecency(cloned.profile.education);
    }
  }

  return cloned;
}

/**
 * Compiles per-collection and site-wide counts for the theme layer.
 *
 * @param {Record<string, Array<object>>} collections - Synthesized collections
 * @param {object} taxonomy - Compiled taxonomy index
 * @returns {object} Aggregated content statistics
 */
export function buildStats(collections = {}, taxonomy = {}) {
  const perCollection = {};
  let totalItems = 0;
  let totalWords = 0;

  for (const type of COLLECTION_TYPES) {
    const items = collections[type] || [];
    const markdown = items.filter((item) => item.hasMarkdown).length;
    const words = items.reduce((sum, item) => sum + (item.wordCount || 0), 0);

    perCollection[type] = {
      total: items.length,
      markdown,
      inline: items.length - markdown,
      words
    };

    totalItems += items.length;
    totalWords += words;
  }

  return {
    collections: perCollection,
    totalItems,
    totalWords,
    totalSkills: taxonomy.totalUniqueSkills || 0
  };
}

/**
 * Executes the complete data ingestion, schema validation, collection synthesis,
 * asset normalization, taxonomy compilation, and search indexing lifecycle.
 *
 * @param {string} [customContentDir] - Optional path to custom content directory
 * @returns {object} Fully normalized and validated data tree
 * @throws {ValidationError} If any schema or reference validation fails
 */
export function loadEngineData(customContentDir) {
  const contentDir = resolveContentDir(customContentDir);
  const dataFilePath = path.join(contentDir, 'data.yaml');
  const contentFilePath = path.join(contentDir, 'content.yaml');

  // Re-report missing assets on every load so watch rebuilds stay informative
  resetMissingAssetWarnings();

  // 1. Ingest YAML files
  const rawData = loadYamlFile(dataFilePath);
  const rawContent = loadYamlFile(contentFilePath);

  // 2. Validate YAML files against JSON Schemas (fail fast). Language levels are
  //    lowered first, since the schema enum is what they have to satisfy.
  const leveledData = normalizeLanguageLevels(rawData);
  validateData(leveledData, path.relative(process.cwd(), dataFilePath));
  validateContent(rawContent, path.relative(process.cwd(), contentFilePath));

  // 3. Normalize site and profile assets
  const normalizedData = normalizeDataAssets(leveledData, contentDir);

  // 4. Synthesize collections (Markdown + inline items, sorting, navigation, TOC, SEO, related)
  const collections = synthesizeAllCollections(contentDir, rawContent, normalizedData.site);

  // 5. Validate and resolve pinned_content integrity
  const pinnedItems = validateAndResolvePinnedContent(rawContent.pinned_content, collections);

  // 6. Build global inverted taxonomy (skills index across profile & collections)
  const taxonomy = buildTaxonomy({
    profile: normalizedData.profile,
    collections
  });

  // 7. Derive the presentation views the theme layer consumes
  const locale = resolveLocale(normalizedData.site);
  const profile = enrichProfile(normalizedData.profile, locale);
  const allContent = sortByRecency(Object.values(collections).flat());
  const collectionTypes = buildCollectionTypes(collections);

  // 8. Describe this compilation for the theme layer
  const generatedAt = new Date();
  const build = {
    version: readProjectVersion('1.0.0'),
    generatedAt: generatedAt.toISOString(),
    generatedYear: generatedAt.getUTCFullYear(),
    locale,
    contentDir
  };

  const baseData = {
    site: normalizedData.site,
    profile,
    content: rawContent,
    collections,
    collection_types: collectionTypes,
    all_content: allContent,
    pinned_items: pinnedItems,
    taxonomy,
    stats: buildStats(collections, taxonomy),
    mappings: UI_MAPPINGS,
    build,
    contentDir
  };

  // 9. Build the unified search index from the fully assembled dataset
  return {
    ...baseData,
    search_index: buildSearchIndex(baseData)
  };
}
