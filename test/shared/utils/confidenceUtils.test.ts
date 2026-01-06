import { describe, it, expect } from 'vitest';
import {
  isValidConfidence,
  isValidThreshold,
  validateTagThreshold,
  confidenceToPercentage,
  percentageToConfidence,
} from '../../../src/shared/utils/confidenceUtils';
import type { Tag } from '../../../src/shared/types/ProviderTypes';

describe('confidenceUtils - Validation Functions', () => {
  describe('isValidConfidence', () => {
    it('should return true for valid confidence values', () => {
      expect(isValidConfidence(0.5)).toBe(true);
      expect(isValidConfidence(0.0)).toBe(true);
      expect(isValidConfidence(1.0)).toBe(true);
      expect(isValidConfidence(0.999)).toBe(true);
      expect(isValidConfidence(0.001)).toBe(true);
    });

    it('should return false for values outside 0-1 range', () => {
      expect(isValidConfidence(-0.1)).toBe(false);
      expect(isValidConfidence(1.1)).toBe(false);
      expect(isValidConfidence(-1)).toBe(false);
      expect(isValidConfidence(2)).toBe(false);
    });

    it('should return false for non-number types', () => {
      expect(isValidConfidence(NaN)).toBe(false);
      expect(isValidConfidence(Infinity as any)).toBe(false);
      expect(isValidConfidence(-Infinity as any)).toBe(false);
      expect(isValidConfidence('0.5' as any)).toBe(false);
      expect(isValidConfidence(null as any)).toBe(false);
      expect(isValidConfidence(undefined as any)).toBe(false);
    });
  });

  describe('isValidThreshold', () => {
    it('should return true for valid threshold values (integers 0-100)', () => {
      expect(isValidThreshold(0)).toBe(true);
      expect(isValidThreshold(1)).toBe(true);
      expect(isValidThreshold(50)).toBe(true);
      expect(isValidThreshold(70)).toBe(true);
      expect(isValidThreshold(100)).toBe(true);
    });

    it('should return false for non-integer values', () => {
      expect(isValidThreshold(50.5)).toBe(false);
      expect(isValidThreshold(70.1)).toBe(false);
      expect(isValidThreshold(0.1)).toBe(false);
      expect(isValidThreshold(99.9)).toBe(false);
    });

    it('should return false for values outside 0-100 range', () => {
      expect(isValidThreshold(-1)).toBe(false);
      expect(isValidThreshold(101)).toBe(false);
      expect(isValidThreshold(-100)).toBe(false);
      expect(isValidThreshold(200)).toBe(false);
    });

    it('should return false for non-number types', () => {
      expect(isValidThreshold(NaN)).toBe(false);
      expect(isValidThreshold(Infinity as any)).toBe(false);
      expect(isValidThreshold(-Infinity as any)).toBe(false);
      expect(isValidThreshold('70' as any)).toBe(false);
      expect(isValidThreshold(null as any)).toBe(false);
      expect(isValidThreshold(undefined as any)).toBe(false);
    });
  });

  describe('validateTagThreshold', () => {
    it('should return valid result when threshold is undefined', () => {
      const tag = {};
      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return valid result for valid threshold values', () => {
      const validTags = [
        { minConfidenceThreshold: 0 },
        { minConfidenceThreshold: 50 },
        { minConfidenceThreshold: 70 },
        { minConfidenceThreshold: 100 },
      ];

      validTags.forEach((tag) => {
        const result = validateTagThreshold(tag);
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      });
    });

    it('should return invalid result for thresholds outside 0-100 range', () => {
      const invalidTags = [
        { minConfidenceThreshold: -1 },
        { minConfidenceThreshold: -100 },
        { minConfidenceThreshold: 101 },
        { minConfidenceThreshold: 200 },
      ];

      invalidTags.forEach((tag) => {
        const result = validateTagThreshold(tag);
        expect(result.valid).toBe(false);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain('Tag threshold must be an integer between 0 and 100');
        expect(result.error).toContain(tag.minConfidenceThreshold.toString());
      });
    });

    it('should return invalid result for non-integer thresholds', () => {
      const invalidTags = [
        { minConfidenceThreshold: 50.5 },
        { minConfidenceThreshold: 70.1 },
        { minConfidenceThreshold: 99.9 },
      ];

      invalidTags.forEach((tag) => {
        const result = validateTagThreshold(tag);
        expect(result.valid).toBe(false);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain('Tag threshold must be an integer between 0 and 100');
        expect(result.error).toContain(tag.minConfidenceThreshold.toString());
      });
    });

    it('should handle tags with other properties', () => {
      const tag: Partial<Tag> = {
        key: 'test-tag',
        name: 'Test Tag',
        color: '#FF0000',
        minConfidenceThreshold: 80,
      };

      const result = validateTagThreshold(tag);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should provide specific error messages', () => {
      const result1 = validateTagThreshold({ minConfidenceThreshold: 150 });
      expect(result1.error).toBe('Tag threshold must be an integer between 0 and 100, got: 150');

      const result2 = validateTagThreshold({ minConfidenceThreshold: -5 });
      expect(result2.error).toBe('Tag threshold must be an integer between 0 and 100, got: -5');

      const result3 = validateTagThreshold({ minConfidenceThreshold: 75.5 });
      expect(result3.error).toBe('Tag threshold must be an integer between 0 and 100, got: 75.5');
    });
  });

  describe('Integration with conversion functions', () => {
    it('should ensure conversions throw errors for invalid input', () => {
      // confidenceToPercentage should throw for invalid confidence
      expect(() => confidenceToPercentage(1.5)).toThrow('Confidence must be between 0 and 1');
      expect(() => confidenceToPercentage(-0.5)).toThrow('Confidence must be between 0 and 1');

      // percentageToConfidence should throw for invalid percentage
      expect(() => percentageToConfidence(150)).toThrow('Percentage must be between 0 and 100');
      expect(() => percentageToConfidence(-10)).toThrow('Percentage must be between 0 and 100');
    });

    it('should accept valid values from conversions', () => {
      // Valid conversions should produce values that pass validation
      const validConfidences = [0, 0.5, 0.7, 1];
      validConfidences.forEach((conf) => {
        expect(isValidConfidence(conf)).toBe(true);
      });

      const validPercentages = [0, 50, 70, 100];
      validPercentages.forEach((pct) => {
        expect(isValidThreshold(pct)).toBe(true);
      });
    });
  });

  describe('Edge cases and boundary values', () => {
    it('should handle exact boundary values for confidence', () => {
      expect(isValidConfidence(0)).toBe(true);
      expect(isValidConfidence(1)).toBe(true);
      expect(isValidConfidence(0.000001)).toBe(true);
      expect(isValidConfidence(0.999999)).toBe(true);
    });

    it('should handle exact boundary values for threshold', () => {
      expect(isValidThreshold(0)).toBe(true);
      expect(isValidThreshold(100)).toBe(true);
      expect(isValidThreshold(1)).toBe(true);
      expect(isValidThreshold(99)).toBe(true);
    });

    it('should reject values just outside boundaries', () => {
      expect(isValidConfidence(-0.000001)).toBe(false);
      expect(isValidConfidence(1.000001)).toBe(false);
      expect(isValidThreshold(-1)).toBe(false);
      expect(isValidThreshold(101)).toBe(false);
    });

    it('should handle zero as valid threshold', () => {
      const result = validateTagThreshold({ minConfidenceThreshold: 0 });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should handle 100 as valid threshold', () => {
      const result = validateTagThreshold({ minConfidenceThreshold: 100 });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('Type safety and validation consistency', () => {
    it('should consistently reject invalid numeric types', () => {
      const invalidValues = [NaN, Infinity, -Infinity];

      invalidValues.forEach((value) => {
        expect(isValidConfidence(value as number)).toBe(false);
        expect(isValidThreshold(value as number)).toBe(false);
      });
    });

    it('should validate threshold independently from other tag properties', () => {
      const tagsWithInvalidThresholds: Partial<Tag>[] = [
        { key: 'valid-tag', name: 'Valid', minConfidenceThreshold: 150 },
        { key: 'another', color: '#FFF', minConfidenceThreshold: -10 },
        { key: 'test', minConfidenceThreshold: 75.5 },
      ];

      tagsWithInvalidThresholds.forEach((tag) => {
        const result = validateTagThreshold(tag);
        expect(result.valid).toBe(false);
        expect(result.error).not.toBeNull();
      });
    });
  });
});
