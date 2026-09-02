import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { COLLECTION_TYPES } from '../config/enums.js';
import { loadEngineData } from '../pipeline/data-loader.js';
import { registerFilters } from './filters.js';
import { resolveContentDir, PROJECT_ROOT, SCHEMAS_DIR } from '../config/paths.js';
import { writeSearchIndexFile } from '../search/search-indexer.js';

/**
 * Registers passthrough copy rules for top-level asset folders and co-located collection media.
 * Guarantees that any image, video, audio, or document placed anywhere in content/ is copied
 * to the output directory with an exact matching relative URL path.
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
    if (topDirs.includes(relToContent.split('/')[0])) {
      continue;
    }
    const relToProject = path.relative(PROJECT_ROOT, assetPath).replace(/\\/g, '/');
    eleventyConfig.addPassthroughCopy({ [relToProject]: relToContent });
  }
}

/**
 * Configures the Eleventy engine for the static site generator.
 * Exposes the engine data surface as global data, collections, filters, asset passthroughs,
 * search artifact emission, and watch targets.
 *
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {object} [options={}] - Custom engine options
 * @param {string} [options.contentDir] - Optional custom content directory path
 * @returns {object} Eleventy directory and template engine configuration
 */
export default function configureEleventy(eleventyConfig, options = {}) {
  // 1. Resolve content directory (options.contentDir -> CLI args -> CONTENT_DIR env -> default content/)
  const contentDir = resolveContentDir(options.contentDir);

  // 2. Compile the dataset once per build and reuse it across every data callback.
  //    The cache is cleared before each run so watch rebuilds always see fresh content.
  let cache = null;
  const getData = () => (cache ??= loadEngineData(contentDir));

  eleventyConfig.on('eleventy.before', () => {
    cache = null;
  });

  // 3. Expose the engine data surface to templates.
  //    `content` and `collections` are reserved by Eleventy, so the parsed content.yaml is
  //    published as `content_data` and the synthesized map as `collections_data`.
  eleventyConfig.addGlobalData('site', () => getData().site);
  eleventyConfig.addGlobalData('profile', () => getData().profile);
  eleventyConfig.addGlobalData('content_data', () => getData().content);
  eleventyConfig.addGlobalData('collections_data', () => getData().collections);
  eleventyConfig.addGlobalData('collection_types', () => getData().collection_types);
  eleventyConfig.addGlobalData('all_content', () => getData().all_content);
  eleventyConfig.addGlobalData('pinned_items', () => getData().pinned_items);
  eleventyConfig.addGlobalData('taxonomy', () => getData().taxonomy);
  eleventyConfig.addGlobalData('stats', () => getData().stats);
  eleventyConfig.addGlobalData('mappings', () => getData().mappings);
  eleventyConfig.addGlobalData('search_index', () => getData().search_index);
  eleventyConfig.addGlobalData('build', () => getData().build);
  eleventyConfig.addGlobalData('contentDir', () => getData().contentDir);

  // 4. Register engine collections
  for (const name of COLLECTION_TYPES) {
    eleventyConfig.addCollection(name, () => getData().collections[name] || []);
  }

  // A combined feed is ordered across collections, not grouped by type
  eleventyConfig.addCollection('all_content', () => getData().all_content);

  // Pinned content keeps the order declared in content.yaml, which is a curation choice
  eleventyConfig.addCollection('pinned', () => getData().pinned_items);

  // 5. Register template filters (mappings, dates, markdown, urls)
  registerFilters(eleventyConfig);

  // 6. Register dynamic asset passthrough copies
  registerAssetPassthroughs(eleventyConfig, contentDir);

  // 7. Emit the search artifact into the resolved output directory on every build
  eleventyConfig.on('eleventy.after', ({ directories, dir }) => {
    const outputDir = directories?.output || dir?.output || '_site';
    writeSearchIndexFile(getData(), path.resolve(PROJECT_ROOT, outputDir, 'search-index.json'));
  });

  // 8. Watch targets for live reload reactivity
  eleventyConfig.addWatchTarget(contentDir);
  eleventyConfig.addWatchTarget(SCHEMAS_DIR);

  return {
    dir: {
      input: 'theme',
      includes: '_includes',
      layouts: '_layouts',
      data: '_data'
    },
    templateFormats: ['html', 'njk', 'md', '11ty.js'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
}
