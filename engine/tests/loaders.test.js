import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadYamlFile, parseYamlString } from '../pipeline/yaml-loader.js';
import { loadMarkdownFile, parseMarkdownString } from '../pipeline/frontmatter-loader.js';
import { formatInstancePath, formatAjvErrors, ValidationError } from '../validation/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('Loaders & Error Formatter Unit Tests', () => {
  describe('yaml-loader', () => {
    it('parses valid YAML string and preserves date strings without Date coercion', () => {
      const yaml = `
date_str: 2023-08-15
month_str: 2022-01
year_num: 2022
title: Hello World
nested:
  items:
    - 1
    - 2
`;
      const data = parseYamlString(yaml);
      expect(typeof data.date_str).toBe('string');
      expect(data.date_str).toBe('2023-08-15');
      expect(typeof data.month_str).toBe('string');
      expect(data.month_str).toBe('2022-01');
      expect(typeof data.year_num).toBe('number');
      expect(data.year_num).toBe(2022);
      expect(data.title).toBe('Hello World');
      expect(data.nested.items).toEqual([1, 2]);
    });

    it('returns empty object for empty or whitespace-only YAML string', () => {
      expect(parseYamlString('')).toEqual({});
      expect(parseYamlString('   \n  ')).toEqual({});
      expect(parseYamlString(null)).toEqual({});
    });

    it('throws descriptive error on malformed YAML syntax', () => {
      const badYaml = `
key: value
  bad_indentation: here
`;
      expect(() => parseYamlString(badYaml, 'bad.yaml')).toThrow(
        /Failed to parse YAML from bad\.yaml/
      );
    });

    it('throws error when file does not exist', () => {
      expect(() => loadYamlFile('/non/existent/file.yaml')).toThrow(
        /YAML file not found at/
      );
    });
  });

  describe('frontmatter-loader', () => {
    it('parses markdown with frontmatter, body content, and excerpt', () => {
      const md = `---
title: Test Title
date: 2024-03-01
---

First paragraph excerpt.

Second paragraph content.
`;
      const parsed = parseMarkdownString(md);
      expect(parsed.data.title).toBe('Test Title');
      expect(parsed.data.date).toBe('2024-03-01');
      expect(typeof parsed.data.date).toBe('string');
      expect(parsed.content).toContain('First paragraph excerpt.');
      expect(parsed.content).toContain('Second paragraph content.');
    });

    it('handles markdown without frontmatter cleanly', () => {
      const md = '# Just Markdown Body\n\nNo frontmatter here.';
      const parsed = parseMarkdownString(md);
      expect(parsed.data).toEqual({});
      expect(parsed.content.trim()).toBe('# Just Markdown Body\n\nNo frontmatter here.');
    });

    it('returns empty structure for empty string or non-string input', () => {
      expect(parseMarkdownString('')).toEqual({ data: {}, content: '' });
      expect(parseMarkdownString(null)).toEqual({ data: {}, content: '' });
    });

    it('throws error when markdown file does not exist on disk', () => {
      expect(() => loadMarkdownFile('/non/existent/post.md')).toThrow(
        /Markdown file not found at/
      );
    });
  });

  describe('errors & formatting utilities', () => {
    it('formats JSON Pointer instancePath to dot and bracket notation', () => {
      expect(formatInstancePath('')).toBe('root');
      expect(formatInstancePath('/')).toBe('root');
      expect(formatInstancePath('/profile/name')).toBe('profile.name');
      expect(formatInstancePath('/profile/experience/0/title')).toBe('profile.experience[0].title');
      expect(formatInstancePath('/pinned_content/2')).toBe('pinned_content[2]');
      expect(formatInstancePath('/a/b/c/3/d')).toBe('a.b.c[3].d');
    });

    it('formats various Ajv error keyword types into descriptive messages', () => {
      const errors = [
        {
          keyword: 'required',
          instancePath: '/profile',
          params: { missingProperty: 'role' },
          data: {}
        },
        {
          keyword: 'enum',
          instancePath: '/profile/experience/0/modality',
          params: { allowedValues: ['in-person', 'hybrid', 'remote'] },
          data: 'online'
        },
        {
          keyword: 'additionalProperties',
          instancePath: '/site',
          params: { additionalProperty: 'unexpected_field' },
          data: { unexpected_field: 'value' }
        },
        {
          keyword: 'pattern',
          instancePath: '/profile/experience/0/start',
          params: { pattern: '^\\d{4}...' },
          data: 'invalid-date'
        },
        {
          keyword: 'minLength',
          instancePath: '/profile/name',
          params: { limit: 1 },
          data: ''
        }
      ];

      const formatted = formatAjvErrors(errors, 'test.yaml');
      expect(formatted).toContain("[Schema Validation Failed] in test.yaml:");
      expect(formatted).toContain("Missing required property 'role'");
      expect(formatted).toContain("Value must be one of: [\"in-person\", \"hybrid\", \"remote\"]");
      expect(formatted).toContain("Unexpected property 'unexpected_field' is not allowed");
      expect(formatted).toContain("pattern: ^\\d{4}...");
      expect(formatted).toContain("minimum length is 1");
    });

    it('handles empty errors array gracefully', () => {
      expect(formatAjvErrors([], 'test.yaml')).toContain('validation failed with unknown error');
      expect(formatAjvErrors(null, 'test.yaml')).toContain('validation failed with unknown error');
    });

    it('creates ValidationError instance with details array', () => {
      const err = new ValidationError('Custom error', [{ code: 123 }]);
      expect(err.name).toBe('ValidationError');
      expect(err.message).toBe('Custom error');
      expect(err.details).toEqual([{ code: 123 }]);
    });
  });
});
