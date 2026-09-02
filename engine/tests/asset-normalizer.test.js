import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isUri,
  isIconSlug,
  normalizeAssetPath,
  resolveAssetFsPath,
  checkAssetExists,
  resetMissingAssetWarnings,
  normalizeAsset
} from '../pipeline/asset-normalizer.js';
import { ValidationError } from '../validation/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_VALID_DIR = path.resolve(__dirname, 'fixtures/valid');

describe('Asset Path Normalization & Resolvers', () => {
  beforeEach(() => {
    resetMissingAssetWarnings();
  });

  describe('isUri', () => {
    it('correctly identifies URIs', () => {
      expect(isUri('https://example.com/logo.png')).toBe(true);
      expect(isUri('http://localhost:8080/image.jpg')).toBe(true);
      expect(isUri('mailto:test@example.com')).toBe(true);
      expect(isUri('doi:10.1000/182')).toBe(true);
      expect(isUri('/images/logo.png')).toBe(false);
      expect(isUri('./cover.png')).toBe(false);
      expect(isUri('gmail')).toBe(false);
      expect(isUri(null)).toBe(false);
      expect(isUri(123)).toBe(false);
    });
  });

  describe('isIconSlug', () => {
    it('correctly identifies simple-icon slugs', () => {
      expect(isIconSlug('gmail')).toBe(true);
      expect(isIconSlug('github')).toBe(true);
      expect(isIconSlug('linkedin')).toBe(true);
      expect(isIconSlug('aws-lambda')).toBe(true);
      expect(isIconSlug('https://example.com/icon.svg')).toBe(false);
      expect(isIconSlug('/images/icon.svg')).toBe(false);
      expect(isIconSlug('./icon.svg')).toBe(false);
      expect(isIconSlug(null)).toBe(false);
    });
  });

  describe('normalizeAssetPath', () => {
    it('normalizes root-relative paths starting with / against content root', () => {
      expect(normalizeAssetPath('/images/favicon.svg')).toBe('/images/favicon.svg');
      expect(normalizeAssetPath('/documents/resume.pdf')).toBe('/documents/resume.pdf');
    });

    it('resolves relative paths against the referencing file base directory', () => {
      expect(normalizeAssetPath('./cover.png', 'blog/my-post')).toBe('/blog/my-post/cover.png');
      expect(normalizeAssetPath('preview.jpg', 'project/my-project')).toBe('/project/my-project/preview.jpg');
    });

    it('leaves external URIs untouched', () => {
      expect(normalizeAssetPath('https://thesvg.org/icon.svg')).toBe('https://thesvg.org/icon.svg');
    });
  });

  describe('resolveAssetFsPath', () => {
    it('resolves root-relative path to absolute filesystem path in contentDir', () => {
      const contentDir = '/fake/workspace/content';
      expect(resolveAssetFsPath('/images/avatar.svg', contentDir)).toBe(
        path.resolve(contentDir, 'images/avatar.svg')
      );
    });

    it('returns null for external URIs', () => {
      const contentDir = '/fake/workspace/content';
      expect(resolveAssetFsPath('https://example.com/avatar.svg', contentDir)).toBeNull();
    });
  });

  describe('checkAssetExists', () => {
    it('detects existing assets in contentDir without warning', () => {
      const exists = checkAssetExists('/assets/favicon.svg', FIXTURES_VALID_DIR);
      expect(exists).toBe(true);
    });

    it('detects missing assets and returns false while emitting console warning when isRequired: false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const exists = checkAssetExists('/images/non-existent-avatar.svg', FIXTURES_VALID_DIR, { isRequired: false });

      expect(exists).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Referenced asset not found')
      );
      warnSpy.mockRestore();
    });

    it('throws ValidationError immediately when isRequired: true and asset is missing', () => {
      expect(() =>
        checkAssetExists('/images/missing-required.svg', FIXTURES_VALID_DIR, { isRequired: true })
      ).toThrow(ValidationError);

      expect(() =>
        checkAssetExists('/images/missing-required.svg', FIXTURES_VALID_DIR, { isRequired: true })
      ).toThrow(/Missing required asset on disk/);
    });

    it('does not throw for valid assets when isRequired: true', () => {
      expect(() =>
        checkAssetExists('/assets/favicon.svg', FIXTURES_VALID_DIR, { isRequired: true })
      ).not.toThrow();
    });

    it('does not throw for external URIs and icon slugs when isRequired: true', () => {
      expect(() =>
        checkAssetExists('https://example.com/cover.jpg', FIXTURES_VALID_DIR, { isRequired: true })
      ).not.toThrow();

      expect(() =>
        checkAssetExists('github', FIXTURES_VALID_DIR, { isRequired: true })
      ).not.toThrow();
    });

    it('suppresses console warning when silent option is true', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const exists = checkAssetExists('/images/non-existent.svg', FIXTURES_VALID_DIR, { silent: true });

      expect(exists).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('resetMissingAssetWarnings', () => {
    it('resets warned assets set to allow repeating warnings across cycles', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First check -> warns
      checkAssetExists('/images/repeat-warning-test.svg', FIXTURES_VALID_DIR);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Second check -> deduplicated (not called again)
      checkAssetExists('/images/repeat-warning-test.svg', FIXTURES_VALID_DIR);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Reset cache
      resetMissingAssetWarnings();

      // Third check after reset -> warns again
      checkAssetExists('/images/repeat-warning-test.svg', FIXTURES_VALID_DIR);
      expect(warnSpy).toHaveBeenCalledTimes(2);

      warnSpy.mockRestore();
    });
  });

  describe('normalizeAsset', () => {
    it('normalizes simple string asset paths', () => {
      expect(normalizeAsset('/images/logo.png')).toBe('/images/logo.png');
      expect(normalizeAsset('./logo.png', { baseDir: 'blog/post-1' })).toBe('/blog/post-1/logo.png');
    });

    it('throws ValidationError when isRequired: true and asset is missing', () => {
      expect(() =>
        normalizeAsset('/images/strictly-required.png', {
          contentDir: FIXTURES_VALID_DIR,
          isRequired: true
        })
      ).toThrow(ValidationError);
    });

    it('preserves simple-icon slugs when isIcon option is enabled', () => {
      expect(normalizeAsset('gmail', { isIcon: true })).toBe('gmail');
      expect(normalizeAsset('https://thesvg.org/icons/custom.svg', { isIcon: true })).toBe(
        'https://thesvg.org/icons/custom.svg'
      );
      expect(normalizeAsset('/images/custom.svg', { isIcon: true })).toBe('/images/custom.svg');
    });

    it('normalizes ThemedAsset objects with light and dark variants', () => {
      const themed = {
        light: '/images/logo-light.svg',
        dark: './logo-dark.svg'
      };

      const normalized = normalizeAsset(themed, { baseDir: 'project/app' });
      expect(normalized).toEqual({
        light: '/images/logo-light.svg',
        dark: '/project/app/logo-dark.svg'
      });
    });
  });
});

describe('Asset Path Confinement', () => {
  it('resolves traversal segments and clamps root-relative paths to the content root', () => {
    expect(normalizeAssetPath('/../../etc/passwd')).toBe('/etc/passwd');
    expect(normalizeAssetPath('/images/../../secret.txt')).toBe('/secret.txt');
    expect(normalizeAssetPath('../outside.png')).toBe('/outside.png');
  });

  it('never resolves a filesystem path outside the content directory', () => {
    for (const candidate of ['/../../etc/passwd', '/images/../../secret.txt', '../outside.png']) {
      const resolved = resolveAssetFsPath(normalizeAssetPath(candidate), FIXTURES_VALID_DIR);
      expect(resolved === null || resolved.startsWith(FIXTURES_VALID_DIR + path.sep)).toBe(true);
    }
  });

  it('still resolves legitimate co-located relative paths', () => {
    expect(normalizeAssetPath('./cover.png', 'blog/post')).toBe('/blog/post/cover.png');
    expect(normalizeAssetPath('cover.png', 'blog/post')).toBe('/blog/post/cover.png');
    expect(normalizeAssetPath('../shared.png', 'blog/post')).toBe('/blog/shared.png');
  });
});
