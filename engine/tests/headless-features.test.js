import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  sortChronologically,
  attachNavigationPointers,
  extractSchemaPayload
} from '../pipeline/collection-synthesizer.js';
import {
  calculateReadingMetrics,
  generateExcerpt
} from '../pipeline/content-metrics.js';
import {
  extractTableOfContents,
  slugifyHeading,
  renderMarkdown
} from '../pipeline/markdown-renderer.js';
import { buildTaxonomy } from '../pipeline/taxonomy.js';
import {
  computeRelatedItems,
  attachRelatedItemsToCollections
} from '../pipeline/content-graph.js';
import { buildItemSeo, resolveAbsoluteUrl } from '../pipeline/seo-normalizer.js';
import { loadEngineData } from '../pipeline/data-loader.js';
import { validateCollectionItem } from '../validation/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_CONTENT_DIR = path.resolve(__dirname, '../../content');

describe('Headless Feature Backbone Subsystem', () => {
  describe('1. Chronological Sorting & Bidirectional Navigation', () => {
    const items = [
      { slug: 'p1', title: 'Post 1', date: '2022-01', permalink: '/blog/p1/' },
      { slug: 'p2', title: 'Post 2', date: '2024-03-01', permalink: '/blog/p2/' },
      { slug: 'p3', title: 'Post 3', date: '2023-06', permalink: '/blog/p3/' },
      { slug: 'p4', title: 'Post 4', date: 'present', permalink: '/blog/p4/' }
    ];

    it('sorts date-bearing items chronologically with newest first', () => {
      const sorted = sortChronologically(items);
      expect(sorted.map((i) => i.slug)).toEqual(['p4', 'p2', 'p3', 'p1']);
    });

    it('attaches accurate newer and older navigation pointers', () => {
      const sorted = sortChronologically(items);
      const withNav = attachNavigationPointers(sorted);

      // Newest item (index 0) has newer: null and older pointing to index 1
      expect(withNav[0].newer).toBeNull();
      expect(withNav[0].older).not.toBeNull();
      expect(withNav[0].older.slug).toBe('p2');

      // Middle item (index 1) has both newer and older
      expect(withNav[1].newer.slug).toBe('p4');
      expect(withNav[1].older.slug).toBe('p3');

      // Middle item (index 2)
      expect(withNav[2].newer.slug).toBe('p2');
      expect(withNav[2].older.slug).toBe('p1');

      // Oldest item (index 3) has older: null and newer pointing to index 2
      expect(withNav[3].older).toBeNull();
      expect(withNav[3].newer.slug).toBe('p3');
    });

    it('handles single item collection gracefully', () => {
      const single = [{ slug: 'only', title: 'Only', date: '2024-01', permalink: '/blog/only/' }];
      const withNav = attachNavigationPointers(single);

      expect(withNav[0].newer).toBeNull();
      expect(withNav[0].older).toBeNull();
    });
  });

  describe('2. Reading Metrics & Excerpt Extractor', () => {
    it('calculates word count and estimated reading time accurately', () => {
      const shortText = 'This is a short post with ten words in total.';
      const shortMetrics = calculateReadingMetrics(shortText);
      expect(shortMetrics.wordCount).toBe(10);
      expect(shortMetrics.readingTime).toBe(1); // Minimum 1 minute for non-empty

      // 450 words -> 3 minutes (Math.ceil(450 / 200) = 3)
      const longText = Array(450).fill('word').join(' ');
      const longMetrics = calculateReadingMetrics(longText);
      expect(longMetrics.wordCount).toBe(450);
      expect(longMetrics.readingTime).toBe(3);
    });

    it('handles empty or whitespace content', () => {
      expect(calculateReadingMetrics('')).toEqual({ wordCount: 0, readingTime: 0 });
      expect(calculateReadingMetrics('   \n  ')).toEqual({ wordCount: 0, readingTime: 0 });
      expect(calculateReadingMetrics(null)).toEqual({ wordCount: 0, readingTime: 0 });
    });

    it('generates a clean preview excerpt', () => {
      const markdown = '# Title\n\nThis is the first sentence of the article. And this is the second sentence.';
      const excerpt = generateExcerpt(markdown, 50);
      expect(excerpt.length).toBeLessThanOrEqual(53);
      expect(excerpt).not.toContain('#');
    });
  });

  describe('3. Structured Table of Contents (TOC) & Heading Anchors', () => {
    it('slugifies heading text into URL-safe anchors', () => {
      expect(slugifyHeading('Getting Started with GPG!')).toBe('getting-started-with-gpg');
      expect(slugifyHeading('Section 1: Quick & Easy')).toBe('section-1-quick-easy');
      expect(slugifyHeading('')).toBe('');
    });

    it('extracts h2 and h3 headings with disambiguated slugs', () => {
      const markdown = `
# Title (h1 ignored in TOC)

## Overview
Some content.

### Prerequisites
More content.

## Overview
Duplicate section.

\`\`\`markdown
## Heading in code block (must be ignored)
\`\`\`

### Next Steps
Final content.
`;
      const toc = extractTableOfContents(markdown);
      expect(toc).toHaveLength(4);

      expect(toc[0]).toEqual({
        id: 'overview',
        slug: 'overview',
        text: 'Overview',
        level: 2
      });

      expect(toc[1]).toEqual({
        id: 'prerequisites',
        slug: 'prerequisites',
        text: 'Prerequisites',
        level: 3
      });

      // Duplicate slug disambiguation
      expect(toc[2]).toEqual({
        id: 'overview-1',
        slug: 'overview-1',
        text: 'Overview',
        level: 2
      });

      expect(toc[3]).toEqual({
        id: 'next-steps',
        slug: 'next-steps',
        text: 'Next Steps',
        level: 3
      });
    });

    it('generates matching id attributes on HTML headings', () => {
      const md = '## Architecture Overview\n\n### Core Pipeline';
      const html = renderMarkdown(md);

      expect(html).toContain('<h2 id="architecture-overview">Architecture Overview</h2>');
      expect(html).toContain('<h3 id="core-pipeline">Core Pipeline</h3>');
    });
  });

  describe('4. Skills Taxonomy & Inverted Index', () => {
    it('compiles an inverted skills index across profile and collections', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const taxonomy = buildTaxonomy({
        profile: engineData.profile,
        collections: engineData.collections
      });

      expect(taxonomy.skills).toBeDefined();
      expect(taxonomy.allSkills).toBeDefined();
      expect(taxonomy.totalUniqueSkills).toBe(taxonomy.allSkills.length);
      expect(taxonomy.totalUniqueSkills).toBeGreaterThan(0);

      // Verify Git skill index
      expect(taxonomy.skills.Git).toBeDefined();
      expect(taxonomy.skills.Git.count).toBeGreaterThan(0);
      expect(Array.isArray(taxonomy.skills.Git.items)).toBe(true);

      const referringSlugs = taxonomy.skills.Git.items.map((i) => i.slug);
      expect(referringSlugs).toContain('how-to-sign-commits');
    });
  });

  describe('5. Content Graph & Related Items', () => {
    const allItems = [
      {
        collection: 'blog',
        slug: 'post-1',
        title: 'Post 1',
        permalink: '/blog/post-1/',
        skills: ['JavaScript', 'Node.js', 'Security']
      },
      {
        collection: 'blog',
        slug: 'post-2',
        title: 'Post 2',
        permalink: '/blog/post-2/',
        skills: ['JavaScript', 'React']
      },
      {
        collection: 'project',
        slug: 'proj-1',
        title: 'Project 1',
        permalink: '/project/proj-1/',
        skills: ['JavaScript', 'Node.js', 'Docker']
      },
      {
        collection: 'blog',
        slug: 'post-3',
        title: 'Post 3',
        permalink: '/blog/post-3/',
        skills: ['Python', 'Django']
      }
    ];

    it('computes related items based on shared skill overlap', () => {
      const related = computeRelatedItems(allItems[0], allItems, 3);
      expect(related).toHaveLength(2);

      // proj-1 shares 2 skills ('JavaScript', 'Node.js')
      // post-2 shares 1 skill ('JavaScript') + same collection bonus
      const slugs = related.map((r) => r.slug);
      expect(slugs).toContain('proj-1');
      expect(slugs).toContain('post-2');
      expect(slugs).not.toContain('post-3'); // Shares 0 skills
    });

    it('excludes self from related recommendations', () => {
      const related = computeRelatedItems(allItems[0], allItems, 3);
      const slugs = related.map((r) => r.slug);
      expect(slugs).not.toContain('post-1');
    });
  });

  describe('6. SEO & OpenGraph Normalization', () => {
    it('resolves absolute canonical URLs against site.url', () => {
      expect(resolveAbsoluteUrl('/blog/my-post/', 'https://username.github.io')).toBe(
        'https://username.github.io/blog/my-post/'
      );
      expect(resolveAbsoluteUrl('https://external.com/article', 'https://username.github.io')).toBe(
        'https://external.com/article'
      );
    });

    it('builds complete SEO metadata for collection items', () => {
      const item = {
        collection: 'blog',
        slug: 'test-post',
        title: 'Test Post Title',
        permalink: '/blog/test-post/',
        date: '2024-01-15',
        description: 'Test post description',
        image: '/blog/test-post/cover.png'
      };

      const site = {
        title: 'Portfolio Site',
        url: 'https://username.github.io',
        share_image: '/images/share.png'
      };

      const seo = buildItemSeo(item, site);
      expect(seo.canonicalUrl).toBe('https://username.github.io/blog/test-post/');
      expect(seo.title).toBe('Test Post Title');
      expect(seo.description).toBe('Test post description');
      expect(seo.image).toBe('https://username.github.io/blog/test-post/cover.png');
      expect(seo.ogType).toBe('article');
      expect(seo.publishedTime).toBe('2024-01-15');
    });
  });

  describe('7. Schema Protection & Runtime Sanitization', () => {
    it('strips all synthetic properties in extractSchemaPayload to pass strict Ajv validation', () => {
      const enrichedItem = {
        slug: 'test-post',
        title: 'Test Post',
        date: '2024-01-15',
        // Synthetic properties:
        content: '# Title\n\nBody content.',
        html: '<h1>Title</h1><p>Body content.</p>',
        excerpt: 'Body content.',
        hasMarkdown: true,
        isMarkdown: true,
        filePath: 'blog/test-post/index.md',
        baseDir: 'blog/test-post',
        permalink: '/blog/test-post/',
        collection: 'blog',
        newer: null,
        older: null,
        wordCount: 3,
        readingTime: 1,
        toc: [{ id: 'title', slug: 'title', text: 'Title', level: 1 }],
        related: [],
        seo: { canonicalUrl: 'https://example.com' }
      };

      const sanitizedPayload = extractSchemaPayload(enrichedItem);
      expect(sanitizedPayload.content).toBeUndefined();
      expect(sanitizedPayload.html).toBeUndefined();
      expect(sanitizedPayload.newer).toBeUndefined();
      expect(sanitizedPayload.older).toBeUndefined();
      expect(sanitizedPayload.toc).toBeUndefined();
      expect(sanitizedPayload.wordCount).toBeUndefined();
      expect(sanitizedPayload.readingTime).toBeUndefined();
      expect(sanitizedPayload.related).toBeUndefined();
      expect(sanitizedPayload.seo).toBeUndefined();

      // Ensure strict validation succeeds
      expect(() => validateCollectionItem('blog', sanitizedPayload)).not.toThrow();
    });
  });
});
