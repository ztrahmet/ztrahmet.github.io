import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadYamlFile } from '../pipeline/yaml-loader.js';
import {
  createValidator,
  validateData,
  validateContent,
  validateCollectionItem
} from '../validation/validator.js';
import { ValidationError } from '../validation/errors.js';
import { COLLECTION_TYPES } from '../config/enums.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('JSON Schemas & Ajv Validation Pipeline', () => {
  const validator = createValidator();

  describe('Common Definitions: Atomic Types', () => {
    it('validates Slug', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/Slug');
      expect(validate('valid-slug')).toBe(true);
      expect(validate('valid_slug_123')).toBe(true);
      expect(validate('slug-with-hyphens')).toBe(true);
      expect(validate('en_US')).toBe(true);

      expect(validate('slug with spaces')).toBe(false);
      expect(validate('slug/with/slashes')).toBe(false);
      expect(validate('slug@special#chars')).toBe(false);
      expect(validate('')).toBe(false);
      expect(validate(123)).toBe(false);
    });

    it('validates Text and MultilineText', () => {
      const validateText = validator.ajv.getSchema('common.defs.json#/definitions/Text');
      const validateMulti = validator.ajv.getSchema('common.defs.json#/definitions/MultilineText');

      expect(validateText('Hello World')).toBe(true);
      expect(validateText('')).toBe(false);
      expect(validateText(123)).toBe(false);

      expect(validateMulti('Line 1\nLine 2\nLine 3')).toBe(true);
      expect(validateMulti('')).toBe(false);
    });

    it('validates URI', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/URI');
      expect(validate('https://example.com')).toBe(true);
      expect(validate('http://localhost:8080/path?query=1')).toBe(true);
      expect(validate('mailto:user@example.com')).toBe(true);
      expect(validate('doi:10.1000/182')).toBe(true);

      expect(validate('not a uri')).toBe(false);
      expect(validate('/relative/path')).toBe(false);
      expect(validate('https://with spaces')).toBe(false);
      expect(validate('')).toBe(false);
    });

    it('validates Date (YYYY, YYYY-MM, YYYY-MM-DD)', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/Date');
      // Valid dates
      expect(validate('2023-08-15')).toBe(true);
      expect(validate('2023-08')).toBe(true);
      expect(validate('2023')).toBe(true);
      expect(validate(2023)).toBe(true);
      expect(validate('1999-12-31')).toBe(true);

      // Invalid dates
      expect(validate('2023-13')).toBe(false); // Invalid month 13
      expect(validate('2023-00')).toBe(false); // Invalid month 00
      expect(validate('2023-08-32')).toBe(false); // Invalid day 32
      expect(validate('2023-08-00')).toBe(false); // Invalid day 00
      expect(validate('23-08-15')).toBe(false); // 2-digit year
      expect(validate('2023/08/15')).toBe(false); // Wrong separator
      expect(validate('invalid-date')).toBe(false);
    });

    it('validates DateOrPresent', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/DateOrPresent');
      expect(validate('2023-08')).toBe(true);
      expect(validate('2023-08-15')).toBe(true);
      expect(validate(2023)).toBe(true);
      expect(validate('present')).toBe(true);

      expect(validate('Present')).toBe(false);
      expect(validate('current')).toBe(false);
      expect(validate('future')).toBe(false);
    });

    it('validates Path', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/Path');
      expect(validate('/images/favicon.svg')).toBe(true);
      expect(validate('/documents/resume.pdf')).toBe(true);
      expect(validate('images/logo.png')).toBe(true);
      expect(validate('./cover.png')).toBe(true);

      expect(validate('')).toBe(false);
      expect(validate('path with spaces')).toBe(false);
    });
  });

  describe('Common Definitions: Composite & Reference Types', () => {
    it('validates Asset (Path or URI)', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/Asset');
      expect(validate('/images/favicon.svg')).toBe(true);
      expect(validate('https://example.com/image.png')).toBe(true);
      expect(validate('')).toBe(false);
    });

    it('validates ThemedAsset', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/ThemedAsset');
      // Single asset
      expect(validate('/images/logo.svg')).toBe(true);
      expect(validate('https://example.com/logo.svg')).toBe(true);

      // Themed light/dark object
      expect(validate({
        light: '/images/logo-light.svg',
        dark: '/images/logo-dark.svg'
      })).toBe(true);

      // Missing dark
      expect(validate({ light: '/images/logo.svg' })).toBe(false);
      // Unexpected additional property
      expect(validate({
        light: '/images/logo-light.svg',
        dark: '/images/logo-dark.svg',
        extra: 'not-allowed'
      })).toBe(false);
    });

    it('validates Icon (ThemedAsset or simple-icon Slug)', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/Icon');
      expect(validate('gmail')).toBe(true);
      expect(validate('github')).toBe(true);
      expect(validate('linkedin')).toBe(true);
      expect(validate('/images/custom.svg')).toBe(true);
      expect(validate('https://thesvg.org/icon.svg')).toBe(true);
      expect(validate({
        light: '/images/icon-light.svg',
        dark: '/images/icon-dark.svg'
      })).toBe(true);
    });

    it('validates Enums (EmploymentType, DegreeType, Modality)', () => {
      const validateEmp = validator.ajv.getSchema('common.defs.json#/definitions/EmploymentType');
      for (const t of ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'volunteer']) {
        expect(validateEmp(t)).toBe(true);
      }
      expect(validateEmp('invalid-type')).toBe(false);

      const validateDeg = validator.ajv.getSchema('common.defs.json#/definitions/DegreeType');
      for (const d of ['bachelor', 'master', 'doctorate', 'associate', 'bootcamp', 'certificate']) {
        expect(validateDeg(d)).toBe(true);
      }
      expect(validateDeg('phd-honorary')).toBe(false);

      const validateMod = validator.ajv.getSchema('common.defs.json#/definitions/Modality');
      for (const m of ['in-person', 'hybrid', 'remote']) {
        expect(validateMod(m)).toBe(true);
      }
      expect(validateMod('virtual')).toBe(false);
    });

    it('validates ContentRef (collection:slug format)', () => {
      const validate = validator.ajv.getSchema('common.defs.json#/definitions/ContentRef');
      expect(validate('blog:how-to-sign-commits')).toBe(true);
      expect(validate('project:open-source-engine')).toBe(true);
      expect(validate('publication:icwe-2023-paper')).toBe(true);
      expect(validate('certificate:aws-csa')).toBe(true);
      expect(validate('award:honor-graduate')).toBe(true);

      expect(validate('invalid-collection:slug')).toBe(false);
      expect(validate('blog:')).toBe(false);
      expect(validate(':slug')).toBe(false);
      expect(validate('just-a-slug')).toBe(false);
    });
  });

  describe('YAML Fixture Ingestion & Schema Compliance', () => {
    it('validates complete valid data.yaml', () => {
      const validData = loadYamlFile(path.join(FIXTURES_DIR, 'valid/data.yaml'));
      expect(() => validateData(validData, 'fixtures/valid/data.yaml')).not.toThrow();
    });

    it('validates complete valid content.yaml', () => {
      const validContent = loadYamlFile(path.join(FIXTURES_DIR, 'valid/content.yaml'));
      expect(() => validateContent(validContent, 'fixtures/valid/content.yaml')).not.toThrow();
    });

    it('fails fast with ValidationError when required properties are missing', () => {
      const invalid = loadYamlFile(path.join(FIXTURES_DIR, 'invalid/invalid-missing-profile.yaml'));
      expect(() => validateData(invalid, 'missing-profile')).toThrow(ValidationError);
      expect(() => validateData(invalid, 'missing-profile')).toThrow(/Missing required property 'profile'/);
    });

    it('fails fast on date format violation in experience record', () => {
      const invalid = loadYamlFile(path.join(FIXTURES_DIR, 'invalid/invalid-bad-date.yaml'));
      expect(() => validateData(invalid, 'bad-date')).toThrow(ValidationError);
      expect(() => validateData(invalid, 'bad-date')).toThrow(/profile\.experience\[0\]\.start/);
    });

    it('fails fast on invalid URI scheme', () => {
      const invalid = loadYamlFile(path.join(FIXTURES_DIR, 'invalid/invalid-bad-uri.yaml'));
      expect(() => validateData(invalid, 'bad-uri')).toThrow(ValidationError);
      expect(() => validateData(invalid, 'bad-uri')).toThrow(/site\.url/);
    });

    it('fails fast on invalid enum values', () => {
      const invalid = loadYamlFile(path.join(FIXTURES_DIR, 'invalid/invalid-bad-modality.yaml'));
      expect(() => validateData(invalid, 'bad-modality')).toThrow(ValidationError);
      expect(() => validateData(invalid, 'bad-modality')).toThrow(/profile\.experience\[0\]\.modality/);
    });

    it('fails fast on malformed pinned_content references', () => {
      const invalid = loadYamlFile(path.join(FIXTURES_DIR, 'invalid/invalid-content-bad-ref.yaml'));
      expect(() => validateContent(invalid, 'bad-ref')).toThrow(ValidationError);
      expect(() => validateContent(invalid, 'bad-ref')).toThrow(/pinned_content\[0\]/);
    });

    it('fails fast on forbidden additional properties', () => {
      const invalid = loadYamlFile(path.join(FIXTURES_DIR, 'invalid/invalid-content-extra-prop.yaml'));
      expect(() => validateContent(invalid, 'extra-prop')).toThrow(ValidationError);
      expect(() => validateContent(invalid, 'extra-prop')).toThrow(/forbidden_property/);
    });
  });

  describe('Collection Item Schemas: Strict Validation', () => {
    it('validates blog item requirements (slug, title, date)', () => {
      expect(() =>
        validateCollectionItem('blog', { slug: 'post', title: 'Title', date: '2023-01' })
      ).not.toThrow();

      expect(() =>
        validateCollectionItem('blog', { slug: 'post', title: 'Title' })
      ).toThrow(ValidationError);

      expect(() =>
        validateCollectionItem('blog', { slug: 'post', date: '2023-01' })
      ).toThrow(ValidationError);
    });

    it('validates project item requirements (slug, title, start)', () => {
      expect(() =>
        validateCollectionItem('project', { slug: 'p1', title: 'Proj', start: '2023-01' })
      ).not.toThrow();

      expect(() =>
        validateCollectionItem('project', { slug: 'p1', title: 'Proj' })
      ).toThrow(ValidationError);
    });

    it('validates publication item requirements (slug, title, publisher, date)', () => {
      expect(() =>
        validateCollectionItem('publication', {
          slug: 'pub1',
          title: 'Paper',
          publisher: 'IEEE',
          date: '2023-11'
        })
      ).not.toThrow();

      expect(() =>
        validateCollectionItem('publication', {
          slug: 'pub1',
          title: 'Paper',
          date: '2023-11'
        })
      ).toThrow(ValidationError);
    });

    it('validates certificate item requirements (slug, title, issuer, date)', () => {
      expect(() =>
        validateCollectionItem('certificate', {
          slug: 'c1',
          title: 'AWS SAA',
          issuer: 'AWS',
          date: '2023-04'
        })
      ).not.toThrow();

      expect(() =>
        validateCollectionItem('certificate', {
          slug: 'c1',
          title: 'AWS SAA',
          date: '2023-04'
        })
      ).toThrow(ValidationError);
    });

    it('validates award item requirements (slug, title, issuer, date)', () => {
      expect(() =>
        validateCollectionItem('award', {
          slug: 'a1',
          title: 'Award',
          issuer: 'Uni',
          date: '2022-06'
        })
      ).not.toThrow();

      expect(() =>
        validateCollectionItem('award', {
          slug: 'a1',
          title: 'Award',
          date: '2022-06'
        })
      ).toThrow(ValidationError);
    });
  });
});

describe('Schema Registry Consistency', () => {
  it('has a compiled validator for every collection type', () => {
    const { validateCollectionItem } = createValidator();

    for (const type of COLLECTION_TYPES) {
      expect(() => validateCollectionItem(type, {})).toThrow(/Schema Validation Failed/);
    }
  });

  it('rejects a collection type that does not exist', () => {
    const { validateCollectionItem } = createValidator();
    expect(() => validateCollectionItem('nonexistent', {})).toThrow(/Unknown collection type/);
  });

  it('ships a schema file for every collection type', () => {
    for (const type of COLLECTION_TYPES) {
      const file = path.resolve(__dirname, `../schemas/collections/${type}.item.json`);
      expect(fs.existsSync(file), `missing schema for ${type}`).toBe(true);
    }
  });
});
