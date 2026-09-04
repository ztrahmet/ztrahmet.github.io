import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadEngineData } from '../pipeline/data-loader.js';
import { buildCollectionTypes } from '../pipeline/collection-views.js';
import { enrichProfile, getCurrentEntry, hasProfileSection } from '../pipeline/profile-normalizer.js';
import { computeDuration, toRfc822Date } from '../config/format.js';
import { registerFilters, absolutizeUrls } from '../eleventy/filters.js';
import { COLLECTION_TYPES } from '../config/enums.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_VALID_DIR = path.resolve(__dirname, 'fixtures/valid');

describe('Theme Surface', () => {
  describe('collection registry', () => {
    it('describes every collection type for generic navigation', () => {
      const types = buildCollectionTypes({ blog: [{ slug: 'a' }, { slug: 'b' }], project: [] });
      const blog = types.find((t) => t.name === 'blog');
      const project = types.find((t) => t.name === 'project');

      expect(types).toHaveLength(COLLECTION_TYPES.length);
      expect(blog).toEqual({
        name: 'blog',
        label: 'Blog Post',
        labelPlural: 'Blog',
        permalink: '/blog/',
        count: 2,
        hasItems: true
      });
      expect(project.hasItems).toBe(false);
      expect(project.count).toBe(0);
    });

    it('lets a theme skip empty collections', () => {
      const types = buildCollectionTypes({ blog: [{ slug: 'a' }] });
      expect(types.filter((t) => t.hasItems).map((t) => t.name)).toEqual(['blog']);
    });
  });

  describe('profile presentation fields', () => {
    it('mirrors the fields collection items carry', () => {
      const { experience } = enrichProfile({
        experience: [{ title: 'Eng', start: '2022-01', end: 'present' }]
      });
      const entry = experience[0];

      expect(entry.dateDisplay).toBe('Jan 2022 – Present');
      expect(entry.startDisplay).toBe('Jan 2022');
      expect(entry.startIso).toBe('2022-01-01');
      expect(entry.isOngoing).toBe(true);
      expect(entry.duration.text).toMatch(/yrs? ?|mos?/);
    });

    it('computes durations inclusive of the start month', () => {
      expect(computeDuration('2022-01', '2024-03')).toMatchObject({ years: 2, remainingMonths: 3, text: '2 yrs 3 mos' });
      expect(computeDuration('2023-01', '2023-12')).toMatchObject({ years: 1, remainingMonths: 0, text: '1 yr' });
      expect(computeDuration('2022-01', '2022-01').text).toBe('1 mo');
      expect(computeDuration(null, '2024-01')).toBeNull();
    });

    it('resolves the current entry, preferring an ongoing one', () => {
      const entries = [{ title: 'Past', end: '2020-01' }, { title: 'Now', end: 'present' }];
      expect(getCurrentEntry(entries).title).toBe('Now');
      expect(getCurrentEntry([{ title: 'Only', end: '2020-01' }]).title).toBe('Only');
      expect(getCurrentEntry([])).toBeNull();
    });

    it('reports which profile sections have content', () => {
      const profile = { name: 'N', summary: '  ', social: [], experience: [{ title: 'E' }] };
      expect(hasProfileSection(profile, 'name')).toBe(true);
      expect(hasProfileSection(profile, 'summary')).toBe(false);
      expect(hasProfileSection(profile, 'social')).toBe(false);
      expect(hasProfileSection(profile, 'experience')).toBe(true);
    });
  });

  describe('feed and archive support', () => {
    it('exposes a year on every dated item so themes can group archives', () => {
      const data = loadEngineData(FIXTURES_VALID_DIR);
      const dated = data.all_content.filter((i) => i.dateIso);

      expect(dated.length).toBeGreaterThan(0);
      expect(dated.every((i) => typeof i.year === 'number' && String(i.year) === i.dateIso.slice(0, 4))).toBe(true);
    });

    it('exposes one normalized date field regardless of collection shape', () => {
      const data = loadEngineData(FIXTURES_VALID_DIR);
      const project = data.collections.project[0];
      const post = data.collections.blog.find((i) => i.date);

      // Projects carry `start` and posts carry `date`, but a feed needs one field
      expect(project.primaryDate).toBe(String(project.start));
      expect(post.primaryDate).toBe(String(post.date));
      expect(data.all_content.every((i) => typeof i.primaryDate === 'string')).toBe(true);
    });

    it('exposes all_content as one recency-ordered list', () => {
      const data = loadEngineData(FIXTURES_VALID_DIR);
      expect(data.all_content).toHaveLength(Object.values(data.collections).flat().length);
      expect(new Set(data.all_content.map((i) => i.collection)).size).toBeGreaterThan(1);
    });

    it('formats RFC-822 dates for RSS', () => {
      expect(toRfc822Date('2023-09-01')).toBe('Fri, 01 Sep 2023 00:00:00 GMT');
      expect(toRfc822Date('present')).toBe('');
    });

    it('absolutizes root-relative URLs without touching external ones', () => {
      const html = '<img src="/a.png"><a href="/b/">x</a><a href="https://e.com/c">y</a>';
      expect(absolutizeUrls(html, 'https://s.com/')).toBe(
        '<img src="https://s.com/a.png"><a href="https://s.com/b/">x</a><a href="https://e.com/c">y</a>'
      );
    });

    it('resolves document-relative URLs against the page that contains them', () => {
      const html = '<img src="./cover.png"><a href="../other/">x</a><a href="#top">y</a>';
      expect(absolutizeUrls(html, 'https://s.com', '/blog/post/')).toBe(
        '<img src="https://s.com/blog/post/cover.png">'
        + '<a href="https://s.com/blog/other/">x</a>'
        + '<a href="https://s.com/blog/post/#top">y</a>'
      );
    });

    it('leaves non-http schemes and protocol-relative URLs alone', () => {
      const html = '<a href="mailto:a@b.c">m</a><a href="tel:+100">t</a><img src="//cdn.e.com/x.png">';
      expect(absolutizeUrls(html, 'https://s.com', '/blog/post/')).toBe(html);
    });

    it('still resolves root-relative URLs when no page path is given', () => {
      expect(absolutizeUrls('<img src="/a.png">', 'https://s.com')).toBe('<img src="https://s.com/a.png">');
    });
  });

  describe('list filters Nunjucks cannot provide', () => {
    const filters = {};
    registerFilters({ addFilter: (name, fn) => { filters[name] = fn; } });
    const items = [{ t: 'a', c: 'blog' }, { t: 'b', c: 'blog' }, { t: 'c', c: 'project' }];

    it('unions two lists without repeating a skill in another case', () => {
      const merged = filters.union(['Go', 'TypeScript'], ['go', 'Compilers', 'TYPESCRIPT']);

      expect(merged).toEqual(['Go', 'TypeScript', 'Compilers']);
      // The spelling that arrives first is the one kept
      expect(filters.union(['node.js'], ['Node.js'])).toEqual(['node.js']);
      expect(filters.union(null, undefined)).toEqual([]);
    });

    it('limits, filters and sorts lists', () => {
      expect(filters.limit(items, 2).map((i) => i.t)).toEqual(['a', 'b']);
      expect(filters.where(items, 'c', 'blog').map((i) => i.t)).toEqual(['a', 'b']);
      expect(filters.whereNot(items, 'c', 'blog').map((i) => i.t)).toEqual(['c']);
      expect(filters.sortBy(items, 't', true).map((i) => i.t)).toEqual(['c', 'b', 'a']);
    });

    it('passes non-array input through untouched', () => {
      expect(filters.limit(null, 2)).toBeNull();
      expect(filters.where(undefined, 'c', 'blog')).toBeUndefined();
    });

    it('orders any list by the shared recency rules', () => {
      const ordered = filters.byRecency([{ title: 'Old', date: '2020' }, { title: 'New', date: '2024' }]);
      expect(ordered.map((i) => i.title)).toEqual(['New', 'Old']);
    });
  });

  describe('site defaults', () => {
    it('always provides a language for the html lang attribute', () => {
      expect(loadEngineData(FIXTURES_VALID_DIR).site.lang).toBeTruthy();
    });
  });
});
