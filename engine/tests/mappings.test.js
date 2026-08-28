import { describe, it, expect } from 'vitest';
import {
  MODALITY_MAPPINGS,
  EMPLOYMENT_TYPE_MAPPINGS,
  DEGREE_TYPE_MAPPINGS,
  COLLECTION_LABEL_MAPPINGS,
  getModalityLabel,
  getEmploymentTypeLabel,
  getDegreeTypeLabel,
  getCollectionLabel
} from '../config/mappings.js';
import {
  MODALITIES,
  EMPLOYMENT_TYPES,
  DEGREE_TYPES,
  COLLECTION_TYPES
} from '../config/enums.js';

describe('Standardized UI Mappings & Enum Dictionaries', () => {
  describe('Modality Mappings', () => {
    it('maps experience modality correctly (On-site / Hybrid / Remote)', () => {
      expect(getModalityLabel('in-person', 'experience')).toBe('On-site');
      expect(getModalityLabel('hybrid', 'experience')).toBe('Hybrid');
      expect(getModalityLabel('remote', 'experience')).toBe('Remote');
    });

    it('maps education modality correctly (On-campus / Hybrid / Online)', () => {
      expect(getModalityLabel('in-person', 'education')).toBe('On-campus');
      expect(getModalityLabel('hybrid', 'education')).toBe('Hybrid');
      expect(getModalityLabel('remote', 'education')).toBe('Online');
    });

    it('falls back to default mapping or raw value', () => {
      expect(getModalityLabel('in-person', 'default')).toBe('In-person');
      expect(getModalityLabel('unknown-mode')).toBe('unknown-mode');
      expect(getModalityLabel('')).toBe('');
    });

    it('covers all defined MODALITIES', () => {
      for (const mod of MODALITIES) {
        expect(MODALITY_MAPPINGS.experience[mod]).toBeDefined();
        expect(MODALITY_MAPPINGS.education[mod]).toBeDefined();
        expect(MODALITY_MAPPINGS.default[mod]).toBeDefined();
      }
    });
  });

  describe('Employment Type Mappings', () => {
    it('maps employment types to capitalized display strings', () => {
      expect(getEmploymentTypeLabel('full-time')).toBe('Full-time');
      expect(getEmploymentTypeLabel('part-time')).toBe('Part-time');
      expect(getEmploymentTypeLabel('contract')).toBe('Contract');
      expect(getEmploymentTypeLabel('freelance')).toBe('Freelance');
      expect(getEmploymentTypeLabel('internship')).toBe('Internship');
      expect(getEmploymentTypeLabel('volunteer')).toBe('Volunteer');
    });

    it('covers all defined EMPLOYMENT_TYPES', () => {
      for (const type of EMPLOYMENT_TYPES) {
        expect(EMPLOYMENT_TYPE_MAPPINGS[type]).toBeDefined();
      }
    });
  });

  describe('Degree Type Mappings', () => {
    it('maps degree types to standard readable degree names', () => {
      expect(getDegreeTypeLabel('bachelor')).toBe("Bachelor's Degree");
      expect(getDegreeTypeLabel('master')).toBe("Master's Degree");
      expect(getDegreeTypeLabel('doctorate')).toBe('Doctorate');
      expect(getDegreeTypeLabel('associate')).toBe('Associate Degree');
      expect(getDegreeTypeLabel('bootcamp')).toBe('Bootcamp');
      expect(getDegreeTypeLabel('certificate')).toBe('Certificate');
    });

    it('covers all defined DEGREE_TYPES', () => {
      for (const deg of DEGREE_TYPES) {
        expect(DEGREE_TYPE_MAPPINGS[deg]).toBeDefined();
      }
    });
  });

  describe('Collection Label Mappings', () => {
    it('returns singular and plural collection labels', () => {
      expect(getCollectionLabel('blog', false)).toBe('Blog Post');
      expect(getCollectionLabel('blog', true)).toBe('Blog');
      expect(getCollectionLabel('project', true)).toBe('Projects');
      expect(getCollectionLabel('publication', true)).toBe('Publications');
      expect(getCollectionLabel('certificate', true)).toBe('Certificates');
      expect(getCollectionLabel('award', true)).toBe('Awards');
    });

    it('covers all defined COLLECTION_TYPES', () => {
      for (const col of COLLECTION_TYPES) {
        expect(COLLECTION_LABEL_MAPPINGS.singular[col]).toBeDefined();
        expect(COLLECTION_LABEL_MAPPINGS.plural[col]).toBeDefined();
      }
    });
  });
});
