import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveContentDir,
  extractArgValue,
  DEFAULT_CONTENT_DIR,
  PROJECT_ROOT
} from '../config/paths.js';
import { loadEngineData } from '../pipeline/data-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_VALID_DIR = path.resolve(__dirname, 'fixtures/valid');

describe('Content Directory Path Resolution & CLI Options', () => {
  const originalEnv = process.env.CONTENT_DIR;
  const originalArgv = [...process.argv];

  beforeEach(() => {
    delete process.env.CONTENT_DIR;
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    process.argv = [...originalArgv];
  });

  describe('resolveContentDir', () => {
    it('defaults to project content/ directory when no custom path is provided', () => {
      const resolved = resolveContentDir();
      expect(resolved).toBe(DEFAULT_CONTENT_DIR);
    });

    it('resolves explicit customPath argument (relative or absolute)', () => {
      const customRel = 'engine/tests/fixtures/valid';
      const resolved = resolveContentDir(customRel);
      expect(resolved).toBe(FIXTURES_VALID_DIR);

      const resolvedAbs = resolveContentDir(FIXTURES_VALID_DIR);
      expect(resolvedAbs).toBe(FIXTURES_VALID_DIR);
    });

    it('resolves from CONTENT_DIR environment variable', () => {
      process.env.CONTENT_DIR = 'engine/tests/fixtures/valid';
      const resolved = resolveContentDir();
      expect(resolved).toBe(FIXTURES_VALID_DIR);
    });

    it('resolves from CLI argument --content=<path>', () => {
      process.argv = ['node', 'cli.js', '--content=engine/tests/fixtures/valid'];
      const resolved = resolveContentDir();
      expect(resolved).toBe(FIXTURES_VALID_DIR);
    });

    it('resolves from CLI argument --content-dir <path>', () => {
      process.argv = ['node', 'cli.js', '--content-dir', 'engine/tests/fixtures/valid'];
      const resolved = resolveContentDir();
      expect(resolved).toBe(FIXTURES_VALID_DIR);
    });

    it('throws clear descriptive error if specified content directory does not exist', () => {
      expect(() => resolveContentDir('/non/existent/path/for/sure')).toThrow(
        /Content directory does not exist at/
      );
    });
  });

  describe('extractArgValue', () => {
    it('extracts value from --content=value syntax', () => {
      expect(extractArgValue(['--other', '--content=/my/path'])).toBe('/my/path');
    });

    it('extracts value from -c value syntax', () => {
      expect(extractArgValue(['-c', '/my/path'])).toBe('/my/path');
    });

    it('returns null if flag not present', () => {
      expect(extractArgValue(['--other', 'validate'])).toBeNull();
    });
  });

  describe('loadEngineData with custom path', () => {
    it('loads custom content directory dataset when passed directly', () => {
      const data = loadEngineData(FIXTURES_VALID_DIR);
      expect(data.contentDir).toBe(FIXTURES_VALID_DIR);
      expect(data.site.title).toBe('Developer Portfolio');
      expect(data.profile.name).toBe('Alice Engineer');
    });

    it('loads custom content directory dataset from CONTENT_DIR env', () => {
      process.env.CONTENT_DIR = FIXTURES_VALID_DIR;
      const data = loadEngineData();
      expect(data.contentDir).toBe(FIXTURES_VALID_DIR);
      expect(data.site.title).toBe('Developer Portfolio');
    });
  });
});
