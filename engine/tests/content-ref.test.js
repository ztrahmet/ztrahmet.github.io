import { describe, it, expect } from 'vitest';
import {
  parseContentRef,
  formatContentRef,
  validateAndResolvePinnedContent
} from '../pipeline/content-ref.js';
import { ValidationError } from '../validation/errors.js';

describe('ContentRef Parsing & Integrity Validation', () => {
  describe('parseContentRef', () => {
    it('successfully parses valid ContentRef strings for all collections', () => {
      expect(parseContentRef('blog:how-to-sign-commits')).toEqual({
        collection: 'blog',
        slug: 'how-to-sign-commits'
      });

      expect(parseContentRef('project:open-source-engine')).toEqual({
        collection: 'project',
        slug: 'open-source-engine'
      });

      expect(parseContentRef('publication:icwe-2023-paper')).toEqual({
        collection: 'publication',
        slug: 'icwe-2023-paper'
      });

      expect(parseContentRef('certificate:aws-csa')).toEqual({
        collection: 'certificate',
        slug: 'aws-csa'
      });

      expect(parseContentRef('award:honor-graduate')).toEqual({
        collection: 'award',
        slug: 'honor-graduate'
      });
    });

    it('throws ValidationError on malformed ref string', () => {
      expect(() => parseContentRef('not-a-ref')).toThrow(ValidationError);
      expect(() => parseContentRef('blog:')).toThrow(ValidationError);
      expect(() => parseContentRef(':slug')).toThrow(ValidationError);
      expect(() => parseContentRef(123)).toThrow(ValidationError);
    });

    it('throws ValidationError for unsupported collection type in ContentRef', () => {
      expect(() => parseContentRef('unknown:my-item')).toThrow(ValidationError);
      expect(() => parseContentRef('unknown:my-item')).toThrow(/Invalid collection in ContentRef/);
    });
  });

  describe('formatContentRef', () => {
    it('creates formatted ContentRef string', () => {
      expect(formatContentRef('blog', 'post-1')).toBe('blog:post-1');
    });
  });

  describe('validateAndResolvePinnedContent', () => {
    const mockCollections = {
      blog: [{ slug: 'post-1', title: 'Post 1' }],
      project: [{ slug: 'proj-1', title: 'Project 1' }],
      publication: [],
      certificate: [],
      award: [{ slug: 'award-1', title: 'Award 1' }]
    };

    it('resolves existing pinned content items', () => {
      const pinned = ['blog:post-1', 'project:proj-1', 'award:award-1'];
      const resolved = validateAndResolvePinnedContent(pinned, mockCollections);

      expect(resolved).toHaveLength(3);
      expect(resolved[0].slug).toBe('post-1');
      expect(resolved[0]._ref).toBe('blog:post-1');
      expect(resolved[0].collection).toBe('blog');
      expect(resolved[1].slug).toBe('proj-1');
      expect(resolved[2].slug).toBe('award-1');
    });

    it('throws ValidationError when the same item is pinned twice', () => {
      expect(() => validateAndResolvePinnedContent(['blog:post-1', 'blog:post-1'], mockCollections)).toThrow(
        /Duplicate ContentRef in pinned_content/
      );
    });

    it('throws ValidationError when a pinned reference points to a non-existent item', () => {
      const brokenPinned = ['blog:non-existent-slug'];
      expect(() => validateAndResolvePinnedContent(brokenPinned, mockCollections)).toThrow(
        ValidationError
      );
      expect(() => validateAndResolvePinnedContent(brokenPinned, mockCollections)).toThrow(
        /Broken ContentRef in pinned_content: 'blog:non-existent-slug'/
      );
    });

    it('returns empty array when pinned_content is empty or undefined', () => {
      expect(validateAndResolvePinnedContent([], mockCollections)).toEqual([]);
      expect(validateAndResolvePinnedContent(null, mockCollections)).toEqual([]);
    });
  });
});
