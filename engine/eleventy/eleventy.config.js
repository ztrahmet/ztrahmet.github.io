import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { COLLECTION_TYPES } from '../config/enums.js';
import { loadEngineData } from '../pipeline/data-loader.js';
import { registerFilters, resetInlinedSvgCache } from './filters.js';
import { resolveContentDir, PROJECT_ROOT, SCHEMAS_DIR, THEME_DIR, THEME_DIR_NAME } from '../config/paths.js';
import { writeSearchIndexFile } from '../search/search-indexer.js';

/** Files the engine reads as source, so they are never published as-is. */
const SOURCE_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json']);

/**
 * Checks whether a filename is engine source rather than a publishable asset.
 * @param {string} name - File name
 * @returns {boolean} True for markdown, YAML and JSON
 */
function isSourceFile(name) {
  return SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * Registers passthrough copy rules so anything in content/ is published at a URL
 * matching where it sits on disk.
 *
 * Asset folders are not named or fixed. Any directory that is not a collection is
 * published under its own name, so `content/images/` and `content/whatever/` behave
 * the same. Collection directories are handled per file, because their media sits
 * next to the markdown the engine reads rather than publishes.
 *
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {string} contentDir - Absolute path to content directory
 */
export function registerAssetPassthroughs(eleventyConfig, contentDir) {
  const toProjectPath = (absolute) => path.relative(PROJECT_ROOT, absolute).replace(/\\/g, '/');

  for (const entry of fs.readdirSync(contentDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(contentDir, entry.name);

    if (entry.isDirectory()) {
      if (COLLECTION_TYPES.includes(entry.name)) {
        const media = fg.sync(['**/*'], {
          cwd: absolute,
          absolute: true,
          onlyFiles: true,
          ignore: ['**/*.md', '**/*.yaml', '**/*.yml', '**/*.json']
        }).sort();

        for (const file of media) {
          const relToContent = path.relative(contentDir, file).replace(/\\/g, '/');
          eleventyConfig.addPassthroughCopy({ [toProjectPath(file)]: relToContent });
        }
      } else {
        eleventyConfig.addPassthroughCopy({ [toProjectPath(absolute)]: entry.name });
      }
      continue;
    }

    if (entry.isFile() && !isSourceFile(entry.name)) {
      eleventyConfig.addPassthroughCopy({ [toProjectPath(absolute)]: entry.name });
    }
  }
}

/**
 * Registers passthrough copies for a theme's own static assets.
 *
 * A theme has to be able to ship the fonts, icons and files its stylesheets
 * reference without putting them in content/, which holds the author's data.
 * Every directory in the theme is published under its own name, except the ones
 * Eleventy reserves, which are prefixed with an underscore.
 *
 * Theme and content assets share the site root, so a name used by both is a
 * genuine ambiguity. Content wins, because it is the author's, and the theme
 * directory is skipped with a warning rather than silently shadowing it.
 *
 * @param {object} eleventyConfig - Eleventy configuration object
 * @param {string} themeDir - Absolute path to the theme directory
 * @param {string} contentDir - Absolute path to the content directory
 */
export function registerThemeAssetPassthroughs(eleventyConfig, themeDir, contentDir) {
  if (!fs.existsSync(themeDir)) return;

  const contentNames = new Set(
    fs.existsSync(contentDir)
      ? fs.readdirSync(contentDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
      : []
  );

  for (const entry of fs.readdirSync(themeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

    if (contentNames.has(entry.name)) {
      console.warn(
        `⚠️  [Warning] Theme directory "${entry.name}" is also a content directory. `
        + 'Content is published and the theme copy is skipped; rename the theme directory.'
      );
      continue;
    }

    const absolute = path.join(themeDir, entry.name);
    const projectPath = path.relative(PROJECT_ROOT, absolute).replace(/\\/g, '/');
    eleventyConfig.addPassthroughCopy({ [projectPath]: entry.name });
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
    resetInlinedSvgCache();
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
  registerFilters(eleventyConfig, contentDir);

  // 6. Register dynamic asset passthrough copies
  registerAssetPassthroughs(eleventyConfig, contentDir);

  //    A theme ships its own fonts and files, so it stays self-contained.
  registerThemeAssetPassthroughs(eleventyConfig, THEME_DIR, contentDir);

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
      input: THEME_DIR_NAME,
      includes: '_includes',
      layouts: '_layouts',
      data: '_data'
    },
    templateFormats: ['html', 'njk', 'md', '11ty.js'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
}
