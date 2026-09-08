import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import {
  buildSearchIndex,
  writeSearchIndexFile,
  extractLinksSearchText,
  extractDateSearchText,
  getCollectionSearchTokens,
  calculateRelevance,
  SEARCH_FIELD_WEIGHTS
} from '../search/search-indexer.js';
import MiniSearch from 'minisearch';
import {
  stripMarkdownAndHtml,
  truncateText
} from '../search/text-sanitizer.js';
import {
  MODALITY_MAPPINGS,
  EMPLOYMENT_TYPE_MAPPINGS,
  DEGREE_TYPE_MAPPINGS
} from '../config/mappings.js';
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
      // The body is extracted as plain text: present, but with no markup left in it.
      expect(gpgRecord.content.length).toBeGreaterThan(0);
      expect(gpgRecord.content).not.toMatch(/<[^>]*>/);
      expect(gpgRecord.content).not.toContain('#');
      expect(gpgRecord.content).not.toContain('```');
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
      // Assert the enum was mapped to a display label, not which label the first
      // record happens to carry, so reordering the sample profile cannot break this.
      expect(Object.values(MODALITY_MAPPINGS.experience)).toContain(exp.meta.modality);
      expect(Object.values(EMPLOYMENT_TYPE_MAPPINGS)).toContain(exp.meta.employmentType);

      const edu = searchIndex.records.find((r) => r.type === 'education');
      expect(edu).toBeDefined();
      expect(edu.typeLabel).toBe('Education');
      expect(Object.values(MODALITY_MAPPINGS.education)).toContain(edu.meta.modality);
      expect(Object.values(DEGREE_TYPE_MAPPINGS)).toContain(edu.meta.degreeType);
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

describe('Search Field Extractors & Unified Index Capabilities', () => {
  it('extracts link labels, URLs, domains, and icons into searchable tokens', () => {
    const links = [
      { label: 'Source Code', url: 'https://github.com/ztrahmet/glyphd', icon: 'github' },
      { label: 'Live Demo', url: 'https://demo.example.dev/app/test', icon: 'external' }
    ];
    const text = extractLinksSearchText(links);
    expect(text).toContain('Source Code');
    expect(text).toContain('github');
    expect(text).toContain('github.com');
    expect(text).toContain('Live Demo');
    expect(text).toContain('demo.example.dev');
    expect(text).toContain('external');
  });

  it('extracts dates, ranges, and isolated 4-digit years into search tokens', () => {
    const text = extractDateSearchText('2024-08', 'Aug 2024 – Present', '2024-08', 'present');
    expect(text).toContain('2024');
    expect(text).toContain('Aug 2024');
    expect(text).toContain('Present');
  });

  it('generates singular and plural collection aliases for collection search', () => {
    expect(getCollectionSearchTokens('blog', 'Blog')).toContain('posts');
    expect(getCollectionSearchTokens('project', 'Project')).toContain('showcases');
    expect(getCollectionSearchTokens('publication', 'Publication')).toContain('papers');
    expect(getCollectionSearchTokens('certificate', 'Certificate')).toContain('certifications');
    expect(getCollectionSearchTokens('award', 'Award')).toContain('honors');
  });

  it('searches all items with all fields and tolerates typos using MiniSearch', () => {
    const engineData = loadEngineData(ROOT_CONTENT_DIR);
    const searchIndex = buildSearchIndex(engineData);

    const ms = new MiniSearch({
      fields: [
        'title', 'skills', 'subtitle', 'issuer', 'publisher', 'authors',
        'typeLabel', 'type', 'credential_id', 'links', 'headings',
        'dateDisplay', 'date', 'location', 'description', 'content', 'searchable'
      ],
      storeFields: ['title', 'subtitle', 'permalink', 'typeLabel', 'dateDisplay', 'type', 'id', 'skills', 'slug'],
      searchOptions: {
        boost: {
          title: 8, skills: 7, subtitle: 5, issuer: 5, publisher: 5,
          authors: 4, typeLabel: 3, type: 3, credential_id: 3, links: 3,
          headings: 2.5, dateDisplay: 2, date: 2, description: 2, location: 2,
          searchable: 1, content: 1
        },
        prefix: true,
        fuzzy: (term) => /^\d+$/.test(term) ? 0 : (term.length <= 2 ? 0 : (term.length <= 3 ? 1 : 2)),
        combineWith: 'OR'
      }
    });
    ms.addAll(searchIndex.records);

    // 1. Matches by skill even when layout might hide skills (e.g. typography)
    const typoSkill = ms.search('typography');
    expect(typoSkill.length).toBeGreaterThan(0);
    expect(typoSkill.some((r) => r.id === 'project:glyphd')).toBe(true);

    // 2. Tolerates mistypes on skills (e.g. "typogrphy" or "pythn" or "terrafrm")
    const typoSearch = ms.search('typogrphy');
    expect(typoSearch.length).toBeGreaterThan(0);
    expect(typoSearch.some((r) => r.id === 'project:glyphd')).toBe(true);

    const pythnSearch = ms.search('pythn');
    expect(pythnSearch.length).toBeGreaterThan(0);

    const terraformTypo = ms.search('terrafrm');
    expect(terraformTypo.length).toBeGreaterThan(0);
    expect(terraformTypo.some((r) => r.id === 'certificate:terraform-associate')).toBe(true);

    // 3. Matches by link url / label / icon (e.g. github)
    const githubSearch = ms.search('github');
    expect(githubSearch.length).toBeGreaterThan(0);

    // 4. Matches by issuer (e.g. "Google Cloud" or "Amazon Web Services")
    const issuerSearch = ms.search('google cloud');
    expect(issuerSearch.length).toBeGreaterThan(0);
    expect(issuerSearch.some((r) => r.id === 'certificate:gcp-professional-architect')).toBe(true);

    // 5. Matches by year / date
    const dateSearch = ms.search('2024');
    expect(dateSearch.length).toBeGreaterThan(0);

    // 6. Matches by collection name
    const collectionSearch = ms.search('certificates');
    expect(collectionSearch.length).toBeGreaterThan(0);

    // 7. Matches by credential ID
    const credSearch = ms.search('GCP-PCA-4417923');
    expect(credSearch.length).toBeGreaterThan(0);
    expect(credSearch[0].id).toBe('certificate:gcp-professional-architect');
  });
});

describe('Smart Relevance Ranking & Field Importance Calculation', () => {
  it('defines an explicit importance hierarchy across item fields', () => {
    expect(SEARCH_FIELD_WEIGHTS.title).toBeGreaterThan(SEARCH_FIELD_WEIGHTS.skills);
    expect(SEARCH_FIELD_WEIGHTS.skills).toBeGreaterThan(SEARCH_FIELD_WEIGHTS.subtitle);
    expect(SEARCH_FIELD_WEIGHTS.subtitle).toBeGreaterThan(SEARCH_FIELD_WEIGHTS.description);
    expect(SEARCH_FIELD_WEIGHTS.description).toBeGreaterThan(SEARCH_FIELD_WEIGHTS.content);
    expect(SEARCH_FIELD_WEIGHTS.issuer).toBeGreaterThan(SEARCH_FIELD_WEIGHTS.content);
  });

  it('ranks an exact title match higher than a skill or description match', () => {
    const titleItem = {
      id: 'skill:python',
      title: 'Python',
      skills: ['Python'],
      description: 'The Python programming language.',
      content: ''
    };
    const mentionItem = {
      id: 'experience:backend',
      title: 'Backend Engineer',
      skills: ['Go', 'Docker'],
      description: 'Worked with Python microservices and APIs.',
      content: 'Extensive use of Python in production.'
    };

    const scoreTitle = calculateRelevance(titleItem, 'python');
    const scoreMention = calculateRelevance(mentionItem, 'python');

    expect(scoreTitle).toBeGreaterThan(scoreMention * 2);
  });

  it('ranks an explicit skill tag match higher than deep markdown body content mention', () => {
    const skillItem = {
      id: 'project:glyphd',
      title: 'glyphd: Font Daemon',
      skills: ['Typography', 'Go'],
      description: 'Font subsetting engine.',
      content: ''
    };
    const bodyItem = {
      id: 'blog:random-article',
      title: 'What I Read This Year',
      skills: ['Reading'],
      description: 'Reflections on various topics.',
      content: 'In one chapter the author briefly mentioned typography principles.'
    };

    const scoreSkill = calculateRelevance(skillItem, 'typography');
    const scoreBody = calculateRelevance(bodyItem, 'typography');

    expect(scoreSkill).toBeGreaterThan(scoreBody * 3);
  });

  it('boosts items matching all query terms quadratically over items matching only one term', () => {
    const bothTermsItem = {
      id: 'award:best-paper',
      title: 'Best Student Paper',
      description: 'Award for the best research paper.',
      content: ''
    };
    const singleTermItem = {
      id: 'publication:other-paper',
      title: 'A New Layout Engine',
      description: 'Research paper on static generation.',
      content: ''
    };

    const scoreBoth = calculateRelevance(bothTermsItem, 'best paper');
    const scoreSingle = calculateRelevance(singleTermItem, 'best paper');

    expect(scoreBoth).toBeGreaterThan(scoreSingle * 4);
  });

  it('awards a phrase bonus when multi-word query appears contiguously in title or metadata', () => {
    const contiguousItem = {
      id: 'cert:gcp',
      title: 'Professional Cloud Architect',
      issuer: 'Google Cloud',
      subtitle: 'Google Cloud',
      skills: ['Google Cloud'],
      description: ''
    };
    const splitItem = {
      id: 'exp:cloud',
      title: 'Software Engineer',
      subtitle: 'Google',
      issuer: '',
      skills: ['Cloud Architecture'],
      description: 'Worked in the cloud computing division.'
    };

    const scoreContiguous = calculateRelevance(contiguousItem, 'google cloud');
    const scoreSplit = calculateRelevance(splitItem, 'google cloud');

    expect(scoreContiguous).toBeGreaterThan(scoreSplit);
  });

  it('breaks ties using item recency when relevance is identical', () => {
    const newerItem = {
      id: 'cert:2025',
      title: 'Kubernetes Administrator',
      skills: ['Kubernetes'],
      date: '2025-06',
      dateDisplay: '2025'
    };
    const olderItem = {
      id: 'cert:2021',
      title: 'Kubernetes Administrator',
      skills: ['Kubernetes'],
      date: '2021-06',
      dateDisplay: '2021'
    };

    const scoreNewer = calculateRelevance(newerItem, 'kubernetes');
    const scoreOlder = calculateRelevance(olderItem, 'kubernetes');

    expect(scoreNewer).toBeGreaterThan(scoreOlder);
  });
});
