import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadEngineData, normalizeDataAssets } from '../pipeline/data-loader.js';
import { formatDate } from '../eleventy/filters.js';
import configureEleventy, {
  registerAssetPassthroughs,
  registerThemeAssetPassthroughs
} from '../eleventy/eleventy.config.js';
import { inlineSvg, inlineThemedSvg, resetInlinedSvgCache } from '../eleventy/filters.js';
import { sortByRecency } from '../pipeline/ordering.js';

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

    // Every collection is present and populated. Exact counts are deliberately
    // not asserted, because this runs against the live content/ directory.
    for (const name of ['blog', 'project', 'publication', 'certificate', 'award']) {
      expect(Array.isArray(data.collections[name])).toBe(true);
      expect(data.collections[name].length).toBeGreaterThan(0);
    }

    // Every declared pinned reference resolves to exactly one item
    expect(data.pinned_items).toHaveLength(data.content.pinned_content.length);
    const pinnedSlugs = data.pinned_items.map((i) => i.slug);
    for (const ref of data.content.pinned_content) {
      expect(pinnedSlugs).toContain(ref.split(':')[1]);
    }

    // Verify Markdown-driven items extracted frontmatter and rendered HTML with anchor IDs
    const gpgPost = data.collections.blog.find((b) => b.slug === 'how-to-sign-commits');
    expect(gpgPost.hasMarkdown).toBe(true);
    expect(gpgPost.title).toBe('How to Sign Commits with GPG');
    // Raw markdown is carried through; the exact prose is content, not contract.
    expect(gpgPost.content.length).toBeGreaterThan(0);
    expect(gpgPost.wordCount).toBeGreaterThan(0);
    // Headings render with anchor ids, and every TOC entry points at a real one.
    expect(gpgPost.html).toMatch(/<h2 id="[^"]+">/);
    expect(gpgPost.toc.length).toBeGreaterThan(0);
    for (const heading of gpgPost.toc) {
      expect(gpgPost.html).toContain(`id="${heading.id}"`);
    }
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

    it('publishes a theme\'s own asset directories so the theme stays self-contained', () => {
      const passthroughs = [];
      const mock = { addPassthroughCopy: (entry) => passthroughs.push(entry) };
      const themeDir = path.resolve(__dirname, '../../theme');

      registerThemeAssetPassthroughs(mock, themeDir, FIXTURES_VALID_DIR);

      const mapped = Object.assign({}, ...passthroughs);
      expect(mapped['theme/static']).toBe('static');

      // Eleventy's own directories are never published
      for (const reserved of Object.keys(mapped)) {
        expect(reserved).not.toMatch(/\/_/);
      }
    });

    it('skips a theme directory that collides with a content directory', () => {
      const themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-'));
      const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
      fs.mkdirSync(path.join(themeDir, 'images'));
      fs.mkdirSync(path.join(themeDir, 'assets'));
      fs.mkdirSync(path.join(themeDir, '_includes'));
      fs.mkdirSync(path.join(contentDir, 'images'));

      const passthroughs = [];
      const mock = { addPassthroughCopy: (entry) => passthroughs.push(entry) };
      registerThemeAssetPassthroughs(mock, themeDir, contentDir);

      const targets = passthroughs.map((entry) => Object.values(entry)[0]);
      expect(targets).toContain('assets');
      expect(targets).not.toContain('images');
      expect(targets).not.toContain('_includes');

      fs.rmSync(themeDir, { recursive: true, force: true });
      fs.rmSync(contentDir, { recursive: true, force: true });
    });

    it('publishes any folder name, with no privileged asset directories', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passthrough-'));
      fs.mkdirSync(path.join(dir, 'pictures/avatars'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'static/css'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'blog/a-post'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'pictures/avatars/me.svg'), 'x');
      fs.writeFileSync(path.join(dir, 'static/css/site.css'), 'x');
      fs.writeFileSync(path.join(dir, 'blog/a-post/cover.png'), 'x');
      fs.writeFileSync(path.join(dir, 'blog/a-post/index.md'), '---\ntitle: T\n---\n');
      fs.writeFileSync(path.join(dir, 'CNAME'), 'example.com');
      fs.writeFileSync(path.join(dir, 'data.yaml'), 'site: {}\n');

      const mapped = {};
      registerAssetPassthroughs({ addPassthroughCopy: (e) => Object.assign(mapped, e) }, dir);
      const outputs = Object.values(mapped);

      // Arbitrary directories are published under their own name
      expect(outputs).toContain('pictures');
      expect(outputs).toContain('static');

      // Collection media is published per file, alongside its slug
      expect(outputs).toContain('blog/a-post/cover.png');

      // Extensionless top-level files are published, engine source is not
      expect(outputs).toContain('CNAME');
      expect(outputs.some((o) => o.endsWith('.md'))).toBe(false);
      expect(outputs.some((o) => o.endsWith('.yaml'))).toBe(false);

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('does not require any particular asset folder to exist', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passthrough-bare-'));
      fs.writeFileSync(path.join(dir, 'data.yaml'), 'site: {}\n');

      const mapped = {};
      expect(() =>
        registerAssetPassthroughs({ addPassthroughCopy: (e) => Object.assign(mapped, e) }, dir)
      ).not.toThrow();
      expect(Object.keys(mapped)).toHaveLength(0);

      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('inlineSvg Template Filter', () => {
    it('returns markup for an SVG and nothing for anything else', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-'));
      fs.writeFileSync(path.join(dir, 'mark.svg'), '<svg viewBox="0 0 1 1"><rect fill="currentColor"/></svg>');
      fs.writeFileSync(path.join(dir, 'cover.png'), 'not an svg');
      resetInlinedSvgCache();

      expect(inlineSvg('/mark.svg', dir)).toContain('currentColor');
      expect(inlineSvg('/cover.png', dir)).toBe('');
      expect(inlineSvg('/missing.svg', dir)).toBe('');
      expect(inlineSvg('https://example.com/a.svg', dir)).toBe('');
      expect(inlineSvg('/mark.svg', undefined)).toBe('');

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('strips scripts and event handlers from inlined markup', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-'));
      fs.writeFileSync(
        path.join(dir, 'unsafe.svg'),
        '<?xml version="1.0"?><svg onload="alert(1)"><script>alert(2)</script><rect/></svg>'
      );
      resetInlinedSvgCache();

      const markup = inlineSvg('/unsafe.svg', dir);
      expect(markup).not.toContain('<script');
      expect(markup).not.toContain('onload');
      expect(markup).not.toContain('<?xml');
      expect(markup).toContain('<rect/>');

      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('inlineThemedSvg Template Filter', () => {
    function fixture() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'body-'));
      fs.mkdirSync(path.join(dir, 'blog', 'post'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'blog', 'post', 'themed.svg'),
        '<svg viewBox="0 0 2 2"><rect fill="currentColor"/></svg>'
      );
      fs.writeFileSync(
        path.join(dir, 'blog', 'post', 'painted.svg'),
        '<svg viewBox="0 0 2 2"><rect fill="#ff0000"/></svg>'
      );
      resetInlinedSvgCache();
      return dir;
    }

    it('inlines only the SVGs that ask to follow the page colour', () => {
      const dir = fixture();
      const html = '<img src="./themed.svg" alt="Themed"><img src="./painted.svg" alt="Painted">'
        + '<img src="./cover.png" alt="Cover">';

      const out = inlineThemedSvg(html, dir, 'blog/post');

      expect(out).toContain('<svg class="inline-svg" role="img" aria-label="Themed"');
      expect(out).toContain('<img src="./painted.svg" alt="Painted">');
      expect(out).toContain('<img src="./cover.png" alt="Cover">');

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('marks an image with no alt text as decorative', () => {
      const dir = fixture();
      const out = inlineThemedSvg('<img src="./themed.svg" alt="">', dir, 'blog/post');

      expect(out).toContain('role="presentation"');
      expect(out).toContain('aria-hidden="true"');

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('namespaces ids so two inlined files cannot collide', () => {
      const dir = fixture();
      fs.writeFileSync(
        path.join(dir, 'blog', 'post', 'grad.svg'),
        '<svg><linearGradient id="g"><stop stop-color="currentColor"/></linearGradient>'
        + '<rect fill="url(#g)"/></svg>'
      );
      resetInlinedSvgCache();

      const out = inlineThemedSvg('<img src="./grad.svg" alt="a"><img src="./grad.svg" alt="b">', dir, 'blog/post');
      const ids = [...out.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      const refs = [...out.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);

      expect(new Set(ids).size).toBe(ids.length);
      expect(refs.every((ref) => ids.includes(ref))).toBe(true);

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('refuses a source that resolves outside the content directory', () => {
      const dir = fixture();
      const html = '<img src="../../../../etc/passwd.svg" alt="x">';

      expect(inlineThemedSvg(html, dir, 'blog/post')).toBe(html);
      expect(inlineThemedSvg('', dir, 'blog/post')).toBe('');

      fs.rmSync(dir, { recursive: true, force: true });
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

  it('orders all_content across collections but leaves pinned in declared order', () => {
    const { config, state } = createMockConfig();
    configureEleventy(config, { contentDir: FIXTURES_VALID_DIR });

    const all = state.collections.all_content();
    const collectionsSeen = new Set(all.map((i) => i.collection));

    // A combined feed interleaves types rather than grouping them
    expect(collectionsSeen.size).toBeGreaterThan(1);
    expect(all).toEqual(sortByRecency(all));

    // Curated order is preserved
    const pinned = state.collections.pinned();
    expect(pinned.map((p) => p._ref)).toEqual(['blog:test-post', 'project:test-project']);
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

describe('Profile History Ordering', () => {
  it('ranks a current role above past ones regardless of authored order', () => {
    const { profile } = normalizeDataAssets({
      site: { url: 'https://x.example.com', title: 'T', description: 'D' },
      profile: {
        name: 'N',
        handle: 'h',
        role: 'R',
        experience: [
          { title: 'Old Job', organization: 'First', start: '2018-01', end: '2021-12' },
          { title: 'Current Job', organization: 'Now', start: '2022-01', end: 'present' },
          { title: 'Recent Finished', organization: 'Mid', start: '2021-01', end: '2024-06' }
        ],
        education: [
          { title: 'BSc', organization: 'Uni', start: '2014-09', end: '2018-06' },
          { title: 'PhD', organization: 'Uni', start: '2023-09', end: 'present' }
        ]
      }
    });

    expect(profile.experience.map((e) => e.title)).toEqual(['Current Job', 'Recent Finished', 'Old Job']);
    expect(profile.education.map((e) => e.title)).toEqual(['PhD', 'BSc']);
  });
});
