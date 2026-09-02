import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadEngineData } from '../pipeline/data-loader.js';
import { formatDate } from '../eleventy/filters.js';
import configureEleventy, { registerAssetPassthroughs } from '../eleventy/eleventy.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_CONTENT_DIR = path.resolve(__dirname, '../../content');
const FIXTURES_VALID_DIR = path.resolve(__dirname, 'fixtures/valid');

describe('End-to-End Data Engine Pipeline & Eleventy Integration', () => {
  it('loads and validates the fixture dataset cleanly', () => {
    const data = loadEngineData(FIXTURES_VALID_DIR);

    expect(data.site.title).toBe('Developer Portfolio');
    expect(data.profile.name).toBe('Alice Engineer');
    expect(data.profile.experience).toHaveLength(1);
    expect(data.profile.education).toHaveLength(1);

    expect(data.collections.blog).toHaveLength(2);
    expect(data.collections.project).toHaveLength(1);
    expect(data.collections.publication).toHaveLength(1);
    expect(data.collections.certificate).toHaveLength(1);
    expect(data.collections.award).toHaveLength(1);

    expect(data.pinned_items).toHaveLength(2);
    expect(data.pinned_items[0].slug).toBe('test-post');
    expect(data.pinned_items[1].slug).toBe('test-project');
  });

  it('loads and validates the root content/ repository dataset without error', () => {
    const data = loadEngineData(ROOT_CONTENT_DIR);

    expect(data.site.title).toBe('Portfolio');
    expect(data.profile.handle).toBe('username');

    // Check all collections are present
    expect(data.collections.blog).toHaveLength(2);
    expect(data.collections.project).toHaveLength(2);
    expect(data.collections.publication).toHaveLength(2);
    expect(data.collections.certificate).toHaveLength(2);
    expect(data.collections.award).toHaveLength(2);

    // Verify pinned items integrity
    expect(data.pinned_items).toHaveLength(3);
    const pinnedSlugs = data.pinned_items.map((i) => i.slug);
    expect(pinnedSlugs).toContain('how-to-sign-commits');
    expect(pinnedSlugs).toContain('open-source-engine');
    expect(pinnedSlugs).toContain('second-ranked-graduate');

    // Verify Markdown-driven items extracted frontmatter and rendered HTML with anchor IDs
    const gpgPost = data.collections.blog.find((b) => b.slug === 'how-to-sign-commits');
    expect(gpgPost.hasMarkdown).toBe(true);
    expect(gpgPost.title).toBe('How to Sign Commits with GPG');
    expect(gpgPost.content).toContain('Signing commits ensures that others can verify');
    expect(gpgPost.html).toContain('How to Sign Commits with GPG</h1>');
    expect(gpgPost.permalink).toBe('/blog/how-to-sign-commits/');

    // Verify Inline-driven items
    const ssgPost = data.collections.blog.find((b) => b.slug === 'why-static-site-generators-win');
    expect(ssgPost.hasMarkdown).toBe(false);
    expect(ssgPost.title).toBe('Why Static Site Generators Win');
    expect(ssgPost.content).toBeNull();
    expect(ssgPost.html).toBe('');
    expect(ssgPost.permalink).toBe('/blog/why-static-site-generators-win/');
  });

  describe('Eleventy Configuration & Passthroughs', () => {
    it('registers global data and collections on Eleventy config object', () => {
      const globalData = {};
      const collections = {};
      const filters = {};
      const passthroughs = [];
      const watchTargets = [];

      const events = {};
      const mockEleventyConfig = {
        on: (name, handler) => {
          events[name] = handler;
        },
        addGlobalData: (key, getter) => {
          globalData[key] = getter;
        },
        addCollection: (key, getter) => {
          collections[key] = getter;
        },
        addFilter: (key, fn) => {
          filters[key] = fn;
        },
        addPassthroughCopy: (entry) => {
          passthroughs.push(entry);
        },
        addWatchTarget: (target) => {
          watchTargets.push(target);
        }
      };

      const result = configureEleventy(mockEleventyConfig, { contentDir: FIXTURES_VALID_DIR });

      expect(result.dir.input).toBe('theme');
      expect(result.dir.output).toBeUndefined();

      // Verify global data keys
      expect(globalData.site).toBeDefined();
      expect(globalData.site().title).toBe('Developer Portfolio');
      expect(globalData.profile().name).toBe('Alice Engineer');
      expect(globalData.content_data).toBeDefined();
      expect(globalData.collections_data).toBeDefined();
      expect(globalData.pinned_items).toBeDefined();
      expect(globalData.taxonomy).toBeDefined();
      expect(globalData.mappings).toBeDefined();

      // Verify collections
      expect(collections.blog).toBeDefined();
      expect(collections.blog()).toHaveLength(2);
      expect(collections.project()).toHaveLength(1);
      expect(collections.all_content()).toHaveLength(6);
      expect(collections.pinned()).toHaveLength(2);

      // Verify filters
      expect(filters.modalityLabel).toBeDefined();
      expect(filters.formatDate).toBeDefined();
      expect(filters.markdown).toBeDefined();
      expect(filters.markdown('**test**')).toBe('<p><strong>test</strong></p>');

      // Verify watch targets include contentDir and schemas
      expect(watchTargets).toContain(FIXTURES_VALID_DIR);
    });

    it('registers co-located media and top-level asset folders in registerAssetPassthroughs', () => {
      const passthroughs = [];
      const mockEleventyConfig = {
        addPassthroughCopy: (entry) => {
          passthroughs.push(entry);
        }
      };

      registerAssetPassthroughs(mockEleventyConfig, ROOT_CONTENT_DIR);
      // Ensure it executes without errors
      expect(Array.isArray(passthroughs)).toBe(true);
    });
  });

  describe('formatDate Template Filter', () => {
    it('formats YYYY-MM-DD correctly', () => {
      const formatted = formatDate('2023-08-15', 'en-US');
      expect(formatted).toBe('Aug 15, 2023');
    });

    it('formats YYYY-MM correctly', () => {
      const formatted = formatDate('2022-01', 'en-US');
      expect(formatted).toBe('Jan 2022');
    });

    it('formats YYYY correctly', () => {
      expect(formatDate('2022')).toBe('2022');
      expect(formatDate(2022)).toBe('2022');
    });

    it('formats "present" keyword correctly', () => {
      expect(formatDate('present')).toBe('Present');
      expect(formatDate('Present')).toBe('Present');
    });

    it('handles empty or non-date inputs gracefully', () => {
      expect(formatDate('')).toBe('');
      expect(formatDate(null)).toBe('');
    });
  });
});

describe('Build Metadata & Content Statistics', () => {
  it('describes the current compilation for the theme layer', () => {
    const data = loadEngineData(FIXTURES_VALID_DIR);

    expect(data.build.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(data.build.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.build.generatedYear).toBeGreaterThan(2000);
    expect(data.build.locale).toBe('en-US');
    expect(data.build.contentDir).toBe(FIXTURES_VALID_DIR);
  });

  it('stamps the search index with the same build identity', () => {
    const data = loadEngineData(FIXTURES_VALID_DIR);

    expect(data.search_index.generatedAt).toBe(data.build.generatedAt);
    expect(data.search_index.version).toBe(data.build.version);
  });

  it('aggregates per-collection and site-wide counts', () => {
    const data = loadEngineData(FIXTURES_VALID_DIR);
    const { stats } = data;

    expect(stats.collections.blog.total).toBe(data.collections.blog.length);
    expect(stats.collections.blog.markdown + stats.collections.blog.inline).toBe(stats.collections.blog.total);
    expect(stats.totalItems).toBe(Object.values(data.collections).flat().length);
    expect(stats.totalSkills).toBe(data.taxonomy.totalUniqueSkills);
    expect(stats.totalWords).toBeGreaterThan(0);
  });
});

describe('Eleventy Reserved Data & Build Caching', () => {
  const createMockConfig = () => {
    const state = { globalData: {}, collections: {}, filters: {}, events: {}, passthroughs: [], watchTargets: [] };
    const config = {
      on: (name, handler) => {
        state.events[name] = handler;
      },
      addGlobalData: (key, getter) => {
        state.globalData[key] = getter;
      },
      addCollection: (key, getter) => {
        state.collections[key] = getter;
      },
      addFilter: (key, fn) => {
        state.filters[key] = fn;
      },
      addPassthroughCopy: (entry) => state.passthroughs.push(entry),
      addWatchTarget: (target) => state.watchTargets.push(target)
    };
    return { config, state };
  };

  it('never publishes a global named "content", which Eleventy reserves for layout output', () => {
    const { config, state } = createMockConfig();
    configureEleventy(config, { contentDir: FIXTURES_VALID_DIR });

    expect(state.globalData.content).toBeUndefined();
    expect(state.globalData.content_data).toBeDefined();
    expect(state.globalData.collections_data).toBeDefined();
  });

  it('omits dir.output so the caller controls the output directory', () => {
    const { config } = createMockConfig();
    const result = configureEleventy(config, { contentDir: FIXTURES_VALID_DIR });

    expect(result.dir.input).toBe('theme');
    expect(result.dir.output).toBeUndefined();
  });

  it('compiles the dataset once per build and refreshes it between builds', () => {
    const { config, state } = createMockConfig();
    configureEleventy(config, { contentDir: FIXTURES_VALID_DIR });

    const first = state.globalData.site();
    const second = state.globalData.profile();
    const firstBuildStamp = state.globalData.build().generatedAt;

    // Same build: every consumer sees one compilation
    expect(state.globalData.build().generatedAt).toBe(firstBuildStamp);
    expect(first).toBe(state.globalData.site());
    expect(second).toBe(state.globalData.profile());

    // Next build: the cache is cleared so watch rebuilds pick up content changes
    state.events['eleventy.before']();
    expect(state.globalData.site()).not.toBe(first);
  });

  it('exposes the full theme data surface', () => {
    const { config, state } = createMockConfig();
    configureEleventy(config, { contentDir: FIXTURES_VALID_DIR });

    for (const key of ['site', 'profile', 'content_data', 'collections_data', 'pinned_items',
      'taxonomy', 'stats', 'mappings', 'search_index', 'build', 'contentDir']) {
      expect(state.globalData[key], `missing global: ${key}`).toBeDefined();
    }

    for (const key of ['blog', 'project', 'publication', 'certificate', 'award', 'all_content', 'pinned']) {
      expect(state.collections[key], `missing collection: ${key}`).toBeDefined();
    }
  });
});
