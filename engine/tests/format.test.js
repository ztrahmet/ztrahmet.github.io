import { describe, it, expect } from 'vitest';
import {
  slugify,
  formatDate,
  formatDateRange,
  toDateString,
  toIsoDate,
  resolveLocale,
  computeDuration
} from '../config/format.js';
import * as configIndex from '../config/index.js';

describe('Formatting Primitives', () => {
  describe('slugify', () => {
    it('produces URL-safe slugs from plain text', () => {
      expect(slugify('Getting Started with GPG!')).toBe('getting-started-with-gpg');
      expect(slugify('Section 1: Quick & Easy')).toBe('section-1-quick-easy');
      expect(slugify('')).toBe('');
      expect(slugify(null)).toBe('');
    });

    it('transliterates non-ASCII letters instead of dropping them', () => {
      expect(slugify('Ağ Güvenliği ve Şifreleme')).toBe('ag-guvenligi-ve-sifreleme');
      expect(slugify('Işık ısı')).toBe('isik-isi');
      expect(slugify('Café Zürich Łódź')).toBe('cafe-zurich-lodz');
    });

    it('keeps C, C++ and C# distinct', () => {
      expect(slugify('C')).toBe('c');
      expect(slugify('C++')).toBe('c-plus-plus');
      expect(slugify('C#')).toBe('c-sharp');
    });
  });

  describe('toDateString', () => {
    it('coerces integer years and trims strings', () => {
      expect(toDateString(2023)).toBe('2023');
      expect(toDateString(' 2023-05 ')).toBe('2023-05');
      expect(toDateString(null)).toBe('');
      expect(toDateString(undefined)).toBe('');
    });
  });

  describe('toIsoDate', () => {
    it('expands partial dates to full ISO dates', () => {
      expect(toIsoDate(2023)).toBe('2023-01-01');
      expect(toIsoDate('2023-05')).toBe('2023-05-01');
      expect(toIsoDate('2023-05-15')).toBe('2023-05-15');
    });

    it('returns empty string for non-dates', () => {
      expect(toIsoDate('present')).toBe('');
      expect(toIsoDate('')).toBe('');
      expect(toIsoDate('garbage')).toBe('');
    });
  });

  describe('formatDate', () => {
    it('formats each supported granularity', () => {
      expect(formatDate('2023-05-15')).toBe('May 15, 2023');
      expect(formatDate('2023-05')).toBe('May 2023');
      expect(formatDate('2023')).toBe('2023');
      expect(formatDate(2023)).toBe('2023');
      expect(formatDate('present')).toBe('Present');
      expect(formatDate('')).toBe('');
    });
  });

  describe('formatDateRange', () => {
    it('joins a start and end into one display range', () => {
      expect(formatDateRange('2022-01', 'present')).toBe('Jan 2022 – Present');
      expect(formatDateRange('2022-01')).toBe('Jan 2022');
    });
  });

  describe('resolveLocale', () => {
    it('normalizes underscore locales and falls back to en-US', () => {
      expect(resolveLocale({ locale: 'en_US' })).toBe('en-US');
      expect(resolveLocale({ lang: 'de' })).toBe('de');
      expect(resolveLocale({})).toBe('en-US');
    });
  });

  describe('computeDuration', () => {
    it('calculates duration inclusive of the start month', () => {
      expect(computeDuration('2022-01', '2023-01')).toMatchObject({ years: 1, remainingMonths: 1, text: '1 yr 1 mo' });
      expect(computeDuration('2023-01', '2023-12')).toMatchObject({ years: 1, remainingMonths: 0, text: '1 yr' });
    });

    it('returns null for inverted ranges (end date before start date)', () => {
      expect(computeDuration('2024-06', '2022-01')).toBeNull();
      expect(computeDuration('2023-05', '2023-04')).toBeNull();
    });

    it('returns null for invalid or absent dates', () => {
      expect(computeDuration(null, '2023-01')).toBeNull();
      expect(computeDuration('invalid', '2023-01')).toBeNull();
    });
  });

  describe('config/index.js module re-exports', () => {
    it('re-exports formatting primitives from config/index.js', () => {
      expect(configIndex.formatDate).toBe(formatDate);
      expect(configIndex.slugify).toBe(slugify);
      expect(configIndex.computeDuration).toBe(computeDuration);
      expect(configIndex.toIsoDate).toBe(toIsoDate);
    });
  });
});
