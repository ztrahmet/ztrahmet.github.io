import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  synthesizeCollection,
  synthesizeAllCollections,
  discoverMarkdownItems,
  renderMarkdownToHtml
} from '../pipeline/collection-synthesizer.js';
import { ValidationError } from '../validation/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const VALID_CONTENT_DIR = path.join(FIXTURES_DIR, 'valid');

describe('Collection Synthesizer & Dual-Mode Resolution', () => {
  describe('renderMarkdownToHtml', () => {
    it('converts markdown formatting into sanitized HTML with heading anchors', () => {
      const html = renderMarkdownToHtml('# Title\n\nA **bold** statement and a [link](https://example.com).');
      expect(html).toContain('<h1 id="title">Title</h1>');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<a href="https://example.com">link</a>');
    });

    it('returns empty string for empty input', () => {
      expect(renderMarkdownToHtml('')).toBe('');
      expect(renderMarkdownToHtml(null)).toBe('');
      expect(renderMarkdownToHtml('   ')).toBe('');
    });

    it('wraps a table so a wide one has somewhere to scroll', () => {
      const html = renderMarkdownToHtml('| a | b |\n| --- | --- |\n| 1 | 2 |');

      expect(html).toContain('<div class="table-scroll"><table>');
      expect(html).toContain('</table></div>');
      expect(html.match(/<div class="table-scroll">/g)).toHaveLength(1);
      // A table is sized by its columns, so without the wrapper the cells are
      // clipped by the column and cannot be reached.
      expect(html).not.toMatch(/<p>[^<]*<table>/);
    });
  });

  describe('discoverMarkdownItems', () => {
    it('discovers index.md markdown files in collection directory', () => {
      const discovered = discoverMarkdownItems(VALID_CONTENT_DIR, 'blog');
      expect(discovered.has('test-post')).toBe(true);

      const post = discovered.get('test-post');
      expect(post.title).toBe('Markdown Test Post');
      expect(post.date).toBe('2024-02-01');
      expect(post.hasMarkdown).toBe(true);
      expect(post.filePath).toBe('blog/test-post/index.md');
      expect(post.content).toContain('Markdown Test Post Body');
    });
  });

  describe('synthesizeCollection Dual-Mode Resolution', () => {
    it('resolves Markdown-driven and Inline-driven items with guaranteed normalized shapes', () => {
      const declaredEntries = [
        { slug: 'test-post' }, // Markdown-driven
        {
          slug: 'inline-blog', // Inline-driven
          title: 'Inline Blog Post',
          date: '2024-01-15',
          description: 'Purely inline blog post.'
        }
      ];

      const synthesized = synthesizeCollection(VALID_CONTENT_DIR, 'blog', declaredEntries);

      expect(synthesized).toHaveLength(2);

      // Markdown-Driven item
      const mdItem = synthesized.find((i) => i.slug === 'test-post');
      expect(mdItem).toBeDefined();
      expect(mdItem.hasMarkdown).toBe(true);
      expect(mdItem.isMarkdown).toBe(true);
      expect(mdItem.collection).toBe('blog');
      expect(mdItem.permalink).toBe('/blog/test-post/');
      expect(mdItem.link).toEqual([{ label: 'Post Link', url: 'https://example.com/test-post' }]);
      expect(mdItem.title).toBe('Markdown Test Post');
      expect(mdItem.image).toBe('/blog/test-post/cover.png');
      expect(mdItem.content).toContain('# Markdown Test Post Body');
      expect(mdItem.html).toContain('Markdown Test Post Body</h1>');
      expect(Array.isArray(mdItem.skills)).toBe(true);
      expect(mdItem.skills).toContain('Vitest');
      expect(mdItem.readingTime).toBeGreaterThanOrEqual(1);
      expect(mdItem.wordCount).toBeGreaterThan(0);
      expect(mdItem.seo).toBeDefined();

      // Inline-Driven item
      const inlineItem = synthesized.find((i) => i.slug === 'inline-blog');
      expect(inlineItem).toBeDefined();
      expect(inlineItem.hasMarkdown).toBe(false);
      expect(inlineItem.isMarkdown).toBe(false);
      expect(inlineItem.collection).toBe('blog');
      expect(inlineItem.permalink).toBe('/blog/inline-blog/');
      expect(inlineItem.title).toBe('Inline Blog Post');
      expect(inlineItem.content).toBeNull();
      expect(inlineItem.html).toBe('');
      expect(inlineItem.wordCount).toBe(0);
      expect(inlineItem.readingTime).toBe(0);
      expect(Array.isArray(inlineItem.skills)).toBe(true);
      expect(inlineItem.seo).toBeDefined();
    });

    it('gives frontmatter strict precedence for Markdown-driven items', () => {
      const declaredEntries = [
        {
          slug: 'test-post',
          title: 'Title in YAML (should be overridden by markdown frontmatter)'
        }
      ];

      const synthesized = synthesizeCollection(VALID_CONTENT_DIR, 'blog', declaredEntries);
      const item = synthesized[0];

      expect(item.title).toBe('Markdown Test Post');
      expect(item.hasMarkdown).toBe(true);
    });

    it('fails fast when inline-driven item lacks required schema fields', () => {
      const invalidDeclared = [
        { slug: 'no-metadata-and-no-markdown-file' }
      ];

      expect(() =>
        synthesizeCollection(VALID_CONTENT_DIR, 'blog', invalidDeclared)
      ).toThrow(ValidationError);
    });
  });

  describe('synthesizeAllCollections', () => {
    it('synthesizes all collections across workspace', () => {
      const mockYaml = {
        blog: [{ slug: 'test-post' }],
        project: [
          {
            slug: 'p1',
            title: 'P1',
            start: '2023-01'
          }
        ],
        publication: [],
        certificate: [],
        award: []
      };

      const result = synthesizeAllCollections(VALID_CONTENT_DIR, mockYaml);
      expect(result.blog).toHaveLength(1);
      expect(result.project).toHaveLength(1);
      expect(result.publication).toHaveLength(0);
      expect(result.certificate).toHaveLength(0);
      expect(result.award).toHaveLength(0);
    });
  });
});

describe('Slug Uniqueness Enforcement', () => {
  const SITE = { url: 'https://x.example.com', title: 'T', description: 'D' };

  it('rejects a slug declared more than once in content.yaml', () => {
    const declared = [
      { slug: 'post-a', title: 'First Declaration', date: '2024-01-01' },
      { slug: 'post-a', title: 'Second Declaration', date: '2023-01-01' }
    ];

    expect(() => synthesizeCollection(VALID_CONTENT_DIR, 'blog', declared, SITE)).toThrow(ValidationError);
    expect(() => synthesizeCollection(VALID_CONTENT_DIR, 'blog', declared, SITE)).toThrow(
      /Duplicate slug 'post-a' declared more than once/
    );
  });

  it('rejects two Markdown files that resolve to the same slug', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-slug-'));
    fs.mkdirSync(path.join(dir, 'blog/collide'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'blog/collide/index.md'), '---\ntitle: Dir Form\ndate: 2024-05-01\n---\n\nbody\n');
    fs.writeFileSync(path.join(dir, 'blog/collide.md'), '---\ntitle: Flat Form\ndate: 2024-06-01\n---\n\nbody\n');

    expect(() => discoverMarkdownItems(dir, 'blog')).toThrow(/Duplicate slug 'collide'/);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Synthesized Item Presentation Fields', () => {
  it('attaches display and ISO dates to every item', () => {
    const collections = synthesizeAllCollections(VALID_CONTENT_DIR, {
      blog: [{ slug: 'inline-blog', title: 'Inline', date: '2024-01-15', description: 'D' }]
    }, { url: 'https://x.example.com', title: 'T', description: 'D', locale: 'en_US' });

    const item = collections.blog.find((i) => i.slug === 'inline-blog');
    expect(item.dateDisplay).toBe('Jan 15, 2024');
    expect(item.dateIso).toBe('2024-01-15');
  });

  it('derives excerpts as clean plain text even when the body contains a horizontal rule', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-excerpt-'));
    fs.mkdirSync(path.join(dir, 'blog/post'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'blog/post/index.md'),
      '---\ntitle: Post\ndate: 2024-01-01\n---\n\nIntro **bold** and [a link](http://x.com).\n\n---\n\n## More\n\nBody.\n'
    );

    const [item] = synthesizeCollection(dir, 'blog', [{ slug: 'post' }], { url: 'https://x.example.com' });

    expect(item.excerpt).not.toMatch(/\*\*|\[.*\]\(/);
    expect(item.excerpt).toContain('Intro bold');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
