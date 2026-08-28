import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { COLLECTION_TYPES } from '../config/enums.js';
import { loadEngineData } from '../pipeline/data-loader.js';
import { registerFilters } from './filters.js';
import { resolveContentDir, PROJECT_ROOT, SCHEMAS_DIR } from '../config/paths.js';

/**
 * Registers passthrough copy rules for top-level asset folders and co-located collection media.
 * Guarantees that any image, video, audio, or document placed anywhere in content/ is copied
 * to _site/ with an exact matching relative URL path.
 *
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {string} contentDir - Absolute path to content directory
 */
export function registerAssetPassthroughs(eleventyConfig, contentDir) {
  const topDirs = ['images', 'documents', 'assets', 'media', 'files'];

  for (const dir of topDirs) {
    const fullDir = path.join(contentDir, dir);
    if (fs.existsSync(fullDir)) {
      const relDir = path.relative(PROJECT_ROOT, fullDir).replace(/\\/g, '/');
      eleventyConfig.addPassthroughCopy({ [relDir]: dir });
    }
  }

  // Discover and register all co-located media in collections (e.g. content/blog/slug/cover.png)
  const nestedAssets = fg.sync(['**/*'], {
    cwd: contentDir,
    absolute: true,
    onlyFiles: true,
    ignore: ['**/*.md', '**/*.yaml', '**/*.yml', '**/*.json']
  });

  for (const assetPath of nestedAssets) {
    const relToContent = path.relative(contentDir, assetPath).replace(/\\/g, '/');
    const topSegment = relToContent.split('/')[0];
    if (topDirs.includes(topSegment)) {
      continue;
    }
    const relToProject = path.relative(PROJECT_ROOT, assetPath).replace(/\\/g, '/');
    eleventyConfig.addPassthroughCopy({ [relToProject]: relToContent });
  }
}

/**
 * Configures the Eleventy engine for the static site generator.
 * Exposes dynamic reactive global data, collections, filters, asset passthroughs, and watch targets.
 *
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {object} [options={}] - Custom engine options
 * @param {string} [options.contentDir] - Optional custom content directory path
 * @returns {object} Eleventy directory and template engine configuration
 */
export default function configureEleventy(eleventyConfig, options = {}) {
  // 1. Opt-out of freezing reserved Eleventy properties to allow content data aliases
  if (typeof eleventyConfig.setFreezeReservedData === 'function') {
    eleventyConfig.setFreezeReservedData(false);
  }

  // 2. Resolve content directory dynamically (options.contentDir -> CLI args -> CONTENT_DIR env -> default content/)
  const contentDir = resolveContentDir(options.contentDir);

  // 3. Reactive Data Ingestion Provider
  // Evaluates fresh content on every rebuild/watch cycle during dev server execution
  const getFreshData = () => loadEngineData(contentDir);

  // 4. Expose Global Data Objects to Eleventy Templates
  eleventyConfig.addGlobalData('site', () => getFreshData().site);
  eleventyConfig.addGlobalData('profile', () => getFreshData().profile);
  eleventyConfig.addGlobalData('content', () => getFreshData().content);
  eleventyConfig.addGlobalData('content_data', () => getFreshData().content);
  eleventyConfig.addGlobalData('site_content', () => getFreshData().content);
  eleventyConfig.addGlobalData('collections_data', () => getFreshData().collections);
  eleventyConfig.addGlobalData('pinned_items', () => getFreshData().pinned_items);
  eleventyConfig.addGlobalData('mappings', () => getFreshData().mappings);
  eleventyConfig.addGlobalData('contentDir', () => getFreshData().contentDir);

  // 5. Register Custom Eleventy Collections (reactive on reload)
  for (const name of COLLECTION_TYPES) {
    eleventyConfig.addCollection(name, () => {
      return getFreshData().collections[name] || [];
    });
  }

  eleventyConfig.addCollection('all_content', () => {
    return Object.values(getFreshData().collections).flat();
  });

  eleventyConfig.addCollection('pinned', () => {
    return getFreshData().pinned_items;
  });

  // 6. Register Template Filters (mappings, dates, markdown)
  registerFilters(eleventyConfig);

  // 7. Register Dynamic Asset Passthrough Copies
  registerAssetPassthroughs(eleventyConfig, contentDir);

  // 8. Watch Targets for Live Reload Reactivity
  eleventyConfig.addWatchTarget(contentDir);
  eleventyConfig.addWatchTarget(SCHEMAS_DIR);

  return {
    dir: {
      input: 'theme',
      output: '_site',
      includes: '_includes',
      layouts: '_layouts',
      data: '_data'
    },
    templateFormats: ['html', 'njk', 'md', '11ty.js'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
}
