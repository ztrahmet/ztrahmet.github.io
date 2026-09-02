import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import {
  buildSearchIndex,
  writeSearchIndexFile
} from '../search/search-indexer.js';
import {
  stripMarkdownAndHtml,
  truncateText
} from '../search/text-sanitizer.js';
import { loadEngineData } from '../pipeline/data-loader.js';
import { PROJECT_ROOT } from '../config/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_CONTENT_DIR = path.resolve(__dirname, '../../content');
const FIXTURES_VALID_DIR = path.resolve(__dirname, 'fixtures/valid');
const TEMP_OUTPUT_DIR = path.resolve(__dirname, 'fixtures/.temp-search');

const pkgPath = path.join(PROJECT_ROOT, 'package.json');
const expectedPackageVersion = fs.existsSync(pkgPath)
  ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || '1.0.0'
  : '1.0.0';

describe('Search Indexing Subsystem', () => {
  afterEach(() => {
    if (fs.existsSync(TEMP_OUTPUT_DIR)) {
      fs.rmSync(TEMP_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('text-sanitizer (stripMarkdownAndHtml & truncateText)', () => {
    it('strips markdown syntax and converts formatting to plain text', () => {
      const raw = `
# Main Header

This is **bold** text and *italic* text, plus ~~strikethrough~~.

Here is a [Google Link](https://google.com) and an image ![Alt Text](https://image.png).

> A blockquote message.

\`\`\`javascript
const foo = 'bar';
console.log(foo);
\`\`\`

Here is \`inline code\` snippet.

* Bullet 1
* Bullet 2
1. Numbered item

---

<p>An HTML paragraph with &amp; entity.</p>
`;
      const sanitized = stripMarkdownAndHtml(raw);

      expect(sanitized).not.toContain('#');
      expect(sanitized).not.toContain('**');
      expect(sanitized).not.toContain('*');
      expect(sanitized).not.toContain('~~');
      expect(sanitized).not.toContain('```');
      expect(sanitized).not.toContain('https://google.com');
      expect(sanitized).not.toContain('<p>');
      expect(sanitized).not.toContain('&amp;');

      expect(sanitized).toContain('Main Header');
      expect(sanitized).toContain('This is bold text and italic text, plus strikethrough.');
      expect(sanitized).toContain('Google Link');
      expect(sanitized).toContain('Alt Text');
      expect(sanitized).toContain('A blockquote message.');
      expect(sanitized).toContain('inline code snippet.');
      expect(sanitized).toContain('Bullet 1');
      expect(sanitized).toContain('Numbered item');
      expect(sanitized).toContain('An HTML paragraph with & entity.');
    });

    it('handles empty, whitespace, or invalid inputs gracefully', () => {
      expect(stripMarkdownAndHtml('')).toBe('');
      expect(stripMarkdownAndHtml('   ')).toBe('');
      expect(stripMarkdownAndHtml(null)).toBe('');
      expect(stripMarkdownAndHtml(undefined)).toBe('');
      expect(stripMarkdownAndHtml(123)).toBe('');
    });

    it('truncates text on word boundaries with ellipsis', () => {
      const long = 'The quick brown fox jumps over the lazy dog repeatedly until the sentence ends.';
      const truncated = truncateText(long, 20);
      expect(truncated.endsWith('...')).toBe(true);
      expect(truncated.length).toBeLessThanOrEqual(23);
      expect(truncated).toBe('The quick brown fox...');
    });
  });

  describe('buildSearchIndex', () => {
    it('indexes all entity types from the root content repository with dynamic package version', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const searchIndex = buildSearchIndex(engineData);

      expect(searchIndex.version).toBe(expectedPackageVersion);
      expect(searchIndex.generatedAt).toBeDefined();
      expect(searchIndex.totalRecords).toBe(searchIndex.records.length);
      expect(searchIndex.totalRecords).toBeGreaterThan(0);

      // Verify types represented
      const types = new Set(searchIndex.records.map((r) => r.type));
      expect(types.has('experience')).toBe(true);
      expect(types.has('education')).toBe(true);
      expect(types.has('blog')).toBe(true);
      expect(types.has('project')).toBe(true);
      expect(types.has('publication')).toBe(true);
      expect(types.has('certificate')).toBe(true);
      expect(types.has('award')).toBe(true);
    });

    it('guarantees unique IDs across all index records', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const searchIndex = buildSearchIndex(engineData);

      const ids = searchIndex.records.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('ensures consistent record structure with sanitized text and metadata', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const searchIndex = buildSearchIndex(engineData);

      for (const record of searchIndex.records) {
        expect(typeof record.id).toBe('string');
        expect(record.id.length).toBeGreaterThan(0);
        expect(typeof record.type).toBe('string');
        expect(typeof record.typeLabel).toBe('string');
        expect(typeof record.title).toBe('string');
        expect(record.title.length).toBeGreaterThan(0);
        expect(typeof record.url).toBe('string');
        expect(typeof record.permalink).toBe('string');
        expect(Array.isArray(record.skills)).toBe(true);
        expect(typeof record.description).toBe('string');

        // Check that description contains no raw HTML tags
        expect(record.description).not.toMatch(/<[^>]*>/);
        if (record.content) {
          expect(record.content).not.toMatch(/<[^>]*>/);
        }
      }
    });

    it('indexes Markdown-driven entries with extracted plain-text body', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const searchIndex = buildSearchIndex(engineData);

      const gpgRecord = searchIndex.records.find((r) => r.id === 'blog:how-to-sign-commits');
      expect(gpgRecord).toBeDefined();
      expect(gpgRecord.hasMarkdown).toBe(true);
      expect(gpgRecord.content).toContain('Signing commits ensures that others can verify');
      expect(gpgRecord.content).not.toContain('#');
      expect(gpgRecord.skills).toContain('Git');
      expect(gpgRecord.skills).toContain('Security');
    });

    it('indexes Inline-driven entries with empty content and preserved metadata', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const searchIndex = buildSearchIndex(engineData);

      const inlineBlog = searchIndex.records.find((r) => r.id === 'blog:why-static-site-generators-win');
      expect(inlineBlog).toBeDefined();
      expect(inlineBlog.hasMarkdown).toBe(false);
      expect(inlineBlog.content).toBe('');
      expect(inlineBlog.title).toBe('Why Static Site Generators Win');
      expect(inlineBlog.skills).toContain('Web Development');
    });

    it('indexes Experience and Education with mapped modality and degree labels', () => {
      const engineData = loadEngineData(ROOT_CONTENT_DIR);
      const searchIndex = buildSearchIndex(engineData);

      const exp = searchIndex.records.find((r) => r.type === 'experience');
      expect(exp).toBeDefined();
      expect(exp.typeLabel).toBe('Experience');
      expect(exp.meta.modality).toBe('On-site');
      expect(exp.meta.employmentType).toBe('Full-time');

      const edu = searchIndex.records.find((r) => r.type === 'education');
      expect(edu).toBeDefined();
      expect(edu.typeLabel).toBe('Education');
      expect(edu.meta.modality).toBe('On-campus');
      expect(edu.meta.degreeType).toBe("Bachelor's Degree");
    });
  });

  describe('writeSearchIndexFile', () => {
    it('writes search-index.json to disk with dynamic package version', () => {
      const engineData = loadEngineData(FIXTURES_VALID_DIR);
      const targetFile = path.join(TEMP_OUTPUT_DIR, 'search-index.json');

      const result = writeSearchIndexFile(engineData, targetFile);
      expect(fs.existsSync(targetFile)).toBe(true);

      const writtenRaw = fs.readFileSync(targetFile, 'utf-8');
      const writtenParsed = JSON.parse(writtenRaw);

      expect(writtenParsed.version).toBe(expectedPackageVersion);
      expect(writtenParsed.totalRecords).toBe(result.totalRecords);
      expect(writtenParsed.records.length).toBe(result.records.length);
    });
  });
});

describe('Search Text Extraction Quality', () => {
  it('flattens tables into readable text', () => {
    expect(stripMarkdownAndHtml('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a b 1 2');
  });

  it('keeps reference link text and drops the definitions', () => {
    expect(stripMarkdownAndHtml('[text][ref]\n\n[ref]: http://x.com')).toBe('text');
  });

  it('preserves autolinked URLs instead of stripping them as tags', () => {
    expect(stripMarkdownAndHtml('see <https://example.com> now')).toBe('see https://example.com now');
  });

  it('still protects currency and sanitizes math', () => {
    expect(stripMarkdownAndHtml('costs $50 - $100 total')).toBe('costs $50 - $100 total');
    expect(stripMarkdownAndHtml('$E = mc^2$ energy')).toContain('energy');
  });
});
