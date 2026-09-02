import { describe, it, expect } from 'vitest';
import { isOngoing, getPrimaryDate, compareByRecency, sortByRecency } from '../pipeline/ordering.js';

const titles = (entries) => sortByRecency(entries).map((e) => e.title);

describe('Recency Ordering', () => {
  describe('isOngoing', () => {
    it('detects entries that are still running', () => {
      expect(isOngoing({ start: '2020-01', end: 'present' })).toBe(true);
      expect(isOngoing({ start: '2020-01', end: 'Present' })).toBe(true);
      expect(isOngoing({ start: '2020-01', end: '2022-01' })).toBe(false);
      expect(isOngoing({ date: '2022-01' })).toBe(false);
      expect(isOngoing(null)).toBe(false);
    });

    it('also treats a primary date of present as ongoing', () => {
      expect(isOngoing({ date: 'present' })).toBe(true);
    });
  });

  describe('getPrimaryDate', () => {
    it('prefers date and falls back to start', () => {
      expect(getPrimaryDate({ date: '2023-01', start: '2020-01' })).toBe('2023-01');
      expect(getPrimaryDate({ start: '2020-01' })).toBe('2020-01');
      expect(getPrimaryDate({})).toBe('');
    });
  });

  describe('ongoing entries rank above finished ones', () => {
    it('ranks a long-running entry above a more recently finished one', () => {
      expect(titles([
        { title: 'Finished recently', start: '2026-08', end: '2026-08' },
        { title: 'Ongoing since 2015', start: '2015-01', end: 'present' }
      ])).toEqual(['Ongoing since 2015', 'Finished recently']);
    });

    it('orders multiple ongoing entries by most recent start', () => {
      expect(titles([
        { title: 'Started 2019', start: '2019-01', end: 'present' },
        { title: 'Started 2022', start: '2022-01', end: 'present' },
        { title: 'Started 2020', start: '2020-01', end: 'present' }
      ])).toEqual(['Started 2022', 'Started 2020', 'Started 2019']);
    });
  });

  describe('equality cases', () => {
    it('ranks the entry that ended later first when starts are equal', () => {
      expect(titles([
        { title: 'Ended 2023', start: '2020-01', end: '2023-01' },
        { title: 'Ended 2025', start: '2020-01', end: '2025-01' }
      ])).toEqual(['Ended 2025', 'Ended 2023']);
    });

    it('falls back to title, then organization, then slug', () => {
      expect(titles([
        { title: 'Zebra', date: '2023-01' },
        { title: 'Alpha', date: '2023-01' }
      ])).toEqual(['Alpha', 'Zebra']);

      const bySlug = sortByRecency([
        { title: 'Same', slug: 'z', date: '2023-01' },
        { title: 'Same', slug: 'a', date: '2023-01' }
      ]);
      expect(bySlug.map((e) => e.slug)).toEqual(['a', 'z']);

      const byOrg = sortByRecency([
        { title: 'Same', organization: 'Zeta', date: '2023-01' },
        { title: 'Same', organization: 'Acme', date: '2023-01' }
      ]);
      expect(byOrg.map((e) => e.organization)).toEqual(['Acme', 'Zeta']);
    });

    it('is a total order: antisymmetric and reflexive', () => {
      const a = { title: 'A', start: '2020', end: 'present' };
      const b = { title: 'B', start: '2021', end: '2022' };

      expect(compareByRecency(a, b)).toBe(-1);
      expect(compareByRecency(b, a)).toBe(1);
      expect(compareByRecency(a, a)).toBe(0);
    });

    it('produces the same order regardless of input order', () => {
      const entries = [
        { title: 'A', start: '2020-01', end: 'present' },
        { title: 'B', date: '2024-01' },
        { title: 'C', date: '2024-01' },
        { title: 'D' }
      ];
      const forward = titles(entries);
      const reversed = titles([...entries].reverse());

      expect(forward).toEqual(reversed);
    });
  });

  describe('date granularity and types', () => {
    it('orders partial dates correctly against full ones', () => {
      expect(titles([
        { title: 'Year', date: '2023' },
        { title: 'Day', date: '2023-05-15' },
        { title: 'Month', date: '2023-05' }
      ])).toEqual(['Day', 'Month', 'Year']);
    });

    it('handles integer years from YAML', () => {
      expect(titles([
        { title: 'Older', date: 2022 },
        { title: 'Newer', date: 2024 },
        { title: 'Middle', date: '2023-06' }
      ])).toEqual(['Newer', 'Middle', 'Older']);
    });
  });

  describe('entries without dates', () => {
    it('ranks undated entries last', () => {
      expect(titles([
        { title: 'Undated' },
        { title: 'Dated', date: '2020-01' }
      ])).toEqual(['Dated', 'Undated']);
    });

    it('keeps undated entries deterministic among themselves', () => {
      expect(titles([{ title: 'B' }, { title: 'A' }])).toEqual(['A', 'B']);
    });
  });
});
