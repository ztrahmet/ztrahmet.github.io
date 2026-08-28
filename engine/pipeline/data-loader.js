import path from 'node:path';
import { loadYamlFile } from './yaml-loader.js';
import { validateData, validateContent } from '../validation/validator.js';
import { synthesizeAllCollections } from './collection-synthesizer.js';
import { validateAndResolvePinnedContent } from './content-ref.js';
import { normalizeAsset } from './asset-normalizer.js';
import { UI_MAPPINGS } from '../config/mappings.js';
import { resolveContentDir } from '../config/paths.js';
import { buildSearchIndex } from '../search/search-indexer.js';
import { buildTaxonomy } from './taxonomy.js';

/**
 * Normalizes all asset paths in data.yaml (site and profile entities).
 * @param {object} data - Parsed data.yaml object
 * @returns {object} Cloned data object with normalized assets
 */
export function normalizeDataAssets(data) {
  if (!data) return data;

  const cloned = JSON.parse(JSON.stringify(data));

  if (cloned.site) {
    if (cloned.site.favicon) {
      cloned.site.favicon = normalizeAsset(cloned.site.favicon);
    }
    if (cloned.site.share_image) {
      cloned.site.share_image = normalizeAsset(cloned.site.share_image);
    }
  }

  if (cloned.profile) {
    if (cloned.profile.avatar) {
      cloned.profile.avatar = normalizeAsset(cloned.profile.avatar);
    }
    if (cloned.profile.resume) {
      cloned.profile.resume = normalizeAsset(cloned.profile.resume);
    }
    if (Array.isArray(cloned.profile.social)) {
      cloned.profile.social = cloned.profile.social.map((s) => ({
        ...s,
        icon: s.icon ? normalizeAsset(s.icon, { isIcon: true }) : undefined
      }));
    }
    if (Array.isArray(cloned.profile.experience)) {
      cloned.profile.experience = cloned.profile.experience.map((exp) => ({
        ...exp,
        logo: exp.logo ? normalizeAsset(exp.logo) : undefined
      }));
    }
    if (Array.isArray(cloned.profile.education)) {
      cloned.profile.education = cloned.profile.education.map((edu) => ({
        ...edu,
        logo: edu.logo ? normalizeAsset(edu.logo) : undefined
      }));
    }
  }

  return cloned;
}

/**
 * Executes the complete data ingestion, schema validation, collection synthesis,
 * asset normalization, taxonomy compilation, and search indexing lifecycle.
 *
 * @param {string} [customContentDir] - Optional path to custom content directory
 * @returns {{
 *   site: object,
 *   profile: object,
 *   content: object,
 *   collections: Record<string, Array<object>>,
 *   pinned_items: Array<object>,
 *   taxonomy: object,
 *   mappings: object,
 *   search_index: object,
 *   contentDir: string
 * }} Fully normalized and validated data tree
 * @throws {ValidationError} If any schema or reference validation fails
 */
export function loadEngineData(customContentDir) {
  const contentDir = resolveContentDir(customContentDir);
  const dataFilePath = path.join(contentDir, 'data.yaml');
  const contentFilePath = path.join(contentDir, 'content.yaml');

  // 1. Ingest YAML files
  const rawData = loadYamlFile(dataFilePath);
  const rawContent = loadYamlFile(contentFilePath);

  // 2. Validate YAML files against JSON Schemas (fail fast)
  validateData(rawData, path.relative(process.cwd(), dataFilePath));
  validateContent(rawContent, path.relative(process.cwd(), contentFilePath));

  // 3. Normalize site and profile assets
  const normalizedData = normalizeDataAssets(rawData);

  // 4. Synthesize collections (dual-mode Markdown frontmatter + inline items, sorting, navigation, TOC, SEO, related)
  const collections = synthesizeAllCollections(contentDir, rawContent, normalizedData.site);

  // 5. Validate and resolve pinned_content integrity
  const pinnedItems = validateAndResolvePinnedContent(rawContent.pinned_content, collections);

  // 6. Build global inverted taxonomy (skills index across profile & collections)
  const taxonomy = buildTaxonomy({
    profile: normalizedData.profile,
    collections
  });

  // 7. Build unified search index
  const baseData = {
    site: normalizedData.site,
    profile: normalizedData.profile,
    content: rawContent,
    collections,
    pinned_items: pinnedItems,
    taxonomy,
    mappings: UI_MAPPINGS,
    contentDir
  };

  const searchIndex = buildSearchIndex(baseData);

  return {
    ...baseData,
    search_index: searchIndex
  };
}
