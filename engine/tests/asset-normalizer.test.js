import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isUri,
  isIconSlug,
  normalizeAssetPath,
  resolveAssetFsPath,
  normalizeAsset
} from '../pipeline/asset-normalizer.js';

describe('Asset Path Normalization & Resolvers', () => {
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

  describe('normalizeAsset', () => {
    it('normalizes simple string asset paths', () => {
      expect(normalizeAsset('/images/logo.png')).toBe('/images/logo.png');
      expect(normalizeAsset('./logo.png', { baseDir: 'blog/post-1' })).toBe('/blog/post-1/logo.png');
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
