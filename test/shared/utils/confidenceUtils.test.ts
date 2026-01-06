import { describe, it, expect } from 'vitest';
import {
  isValidConfidence,
  isValidThreshold,
  validateTagThreshold,
  confidenceToPercentage,
  percentageToConfidence,
  meetsThreshold,
  getEffectiveThreshold,
  meetsTagThreshold,
  formatConfidence,
  formatConfidenceAs,
  getConfidenceLevel,
  getConfidenceLevelLabel,
  getConfidenceColor,
  compareConfidence,
  getConfidenceDifference,
  ConfidenceLevel,
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

describe('confidenceUtils - Conversion Functions', () => {
  describe('confidenceToPercentage', () => {
    it('should convert valid confidence values to percentages', () => {
      expect(confidenceToPercentage(0)).toBe(0);
      expect(confidenceToPercentage(0.5)).toBe(50);
      expect(confidenceToPercentage(0.75)).toBe(75);
      expect(confidenceToPercentage(1)).toBe(100);
    });

    it('should round to nearest integer', () => {
      expect(confidenceToPercentage(0.756)).toBe(76); // rounds up
      expect(confidenceToPercentage(0.754)).toBe(75); // rounds down
      expect(confidenceToPercentage(0.749)).toBe(75); // rounds to nearest
      expect(confidenceToPercentage(0.999)).toBe(100); // rounds to 100
    });

    it('should handle edge cases', () => {
      expect(confidenceToPercentage(0.001)).toBe(0);
      expect(confidenceToPercentage(0.009)).toBe(1);
      expect(confidenceToPercentage(0.995)).toBe(100);
    });

    it('should throw error for values outside 0-1 range', () => {
      expect(() => confidenceToPercentage(-0.1)).toThrow('Confidence must be between 0 and 1');
      expect(() => confidenceToPercentage(1.1)).toThrow('Confidence must be between 0 and 1');
      expect(() => confidenceToPercentage(2)).toThrow('Confidence must be between 0 and 1');
      expect(() => confidenceToPercentage(-1)).toThrow('Confidence must be between 0 and 1');
    });

    it('should handle special numeric values', () => {
      // NaN passes the range check (NaN < 0 is false, NaN > 1 is false)
      // but Math.round returns NaN
      const nanResult = confidenceToPercentage(NaN);
      expect(Number.isNaN(nanResult)).toBe(true);

      // Infinity is outside 0-1 range
      expect(() => confidenceToPercentage(Infinity as any)).toThrow('Confidence must be between 0 and 1');
    });
  });

  describe('percentageToConfidence', () => {
    it('should convert valid percentage values to confidence', () => {
      expect(percentageToConfidence(0)).toBe(0);
      expect(percentageToConfidence(50)).toBe(0.5);
      expect(percentageToConfidence(75)).toBe(0.75);
      expect(percentageToConfidence(100)).toBe(1);
    });

    it('should handle edge cases', () => {
      expect(percentageToConfidence(1)).toBe(0.01);
      expect(percentageToConfidence(99)).toBe(0.99);
      expect(percentageToConfidence(33)).toBe(0.33);
    });

    it('should throw error for values outside 0-100 range', () => {
      expect(() => percentageToConfidence(-1)).toThrow('Percentage must be between 0 and 100');
      expect(() => percentageToConfidence(101)).toThrow('Percentage must be between 0 and 100');
      expect(() => percentageToConfidence(150)).toThrow('Percentage must be between 0 and 100');
      expect(() => percentageToConfidence(-10)).toThrow('Percentage must be between 0 and 100');
    });

    it('should handle special numeric values', () => {
      // NaN passes the range check but division produces NaN
      const nanResult = percentageToConfidence(NaN);
      expect(Number.isNaN(nanResult)).toBe(true);

      // Infinity is outside 0-100 range
      expect(() => percentageToConfidence(Infinity as any)).toThrow('Percentage must be between 0 and 100');
    });
  });

  describe('Conversion round-trip', () => {
    it('should maintain consistency through round-trip conversion', () => {
      const values = [0, 0.25, 0.5, 0.75, 1];
      values.forEach((conf) => {
        const percentage = confidenceToPercentage(conf);
        const backToConf = percentageToConfidence(percentage);
        // Due to rounding, we check if it's close enough
        expect(Math.abs(backToConf - conf)).toBeLessThanOrEqual(0.01);
      });
    });
  });
});

describe('confidenceUtils - Threshold Comparison Functions', () => {
  describe('meetsThreshold', () => {
    it('should return true when confidence meets or exceeds threshold', () => {
      expect(meetsThreshold(0.70, 70)).toBe(true); // equal
      expect(meetsThreshold(0.75, 70)).toBe(true); // above
      expect(meetsThreshold(0.80, 70)).toBe(true); // well above
      expect(meetsThreshold(1.0, 100)).toBe(true); // exact at max
      expect(meetsThreshold(0.0, 0)).toBe(true); // exact at min
    });

    it('should return false when confidence is below threshold', () => {
      expect(meetsThreshold(0.65, 70)).toBe(false);
      expect(meetsThreshold(0.50, 70)).toBe(false);
      expect(meetsThreshold(0.0, 1)).toBe(false);
      expect(meetsThreshold(0.99, 100)).toBe(false);
    });

    it('should handle edge cases at boundaries', () => {
      // At exactly threshold (should pass)
      expect(meetsThreshold(0.70, 70)).toBe(true);
      expect(meetsThreshold(0.50, 50)).toBe(true);
      expect(meetsThreshold(0.0, 0)).toBe(true);
      expect(meetsThreshold(1.0, 100)).toBe(true);

      // Just below threshold (should fail)
      expect(meetsThreshold(0.694, 70)).toBe(false); // rounds to 69
      expect(meetsThreshold(0.494, 50)).toBe(false); // rounds to 49
    });

    it('should handle rounding correctly', () => {
      // Values that round to threshold should pass
      expect(meetsThreshold(0.695, 70)).toBe(true); // rounds to 70 (69.5 -> 70)
      expect(meetsThreshold(0.699, 70)).toBe(true); // rounds to 70 (69.9 -> 70)

      // Values that round just below threshold should fail
      expect(meetsThreshold(0.694, 70)).toBe(false); // rounds to 69
      expect(meetsThreshold(0.689, 70)).toBe(false); // rounds to 69
    });
  });

  describe('getEffectiveThreshold', () => {
    it('should return tag override when specified', () => {
      const tag1 = { minConfidenceThreshold: 80 };
      expect(getEffectiveThreshold(tag1, 70)).toBe(80);

      const tag2 = { minConfidenceThreshold: 50 };
      expect(getEffectiveThreshold(tag2, 70)).toBe(50);

      const tag3 = { minConfidenceThreshold: 0 };
      expect(getEffectiveThreshold(tag3, 70)).toBe(0);

      const tag4 = { minConfidenceThreshold: 100 };
      expect(getEffectiveThreshold(tag4, 70)).toBe(100);
    });

    it('should return global threshold when tag override is not specified', () => {
      const tag1 = {};
      expect(getEffectiveThreshold(tag1, 70)).toBe(70);

      const tag2 = { minConfidenceThreshold: undefined };
      expect(getEffectiveThreshold(tag2, 70)).toBe(70);
    });

    it('should return default threshold (70) when global threshold not provided', () => {
      const tag1 = {};
      expect(getEffectiveThreshold(tag1)).toBe(70);

      const tag2 = { minConfidenceThreshold: undefined };
      expect(getEffectiveThreshold(tag2)).toBe(70);
    });

    it('should prioritize tag override over global threshold', () => {
      const tag = { minConfidenceThreshold: 85 };
      expect(getEffectiveThreshold(tag, 70)).toBe(85);
      expect(getEffectiveThreshold(tag, 50)).toBe(85);
      expect(getEffectiveThreshold(tag, 90)).toBe(85);
    });

    it('should work with tags that have other properties', () => {
      const tag: Partial<Tag> = {
        key: 'test-tag',
        name: 'Test Tag',
        color: '#FF0000',
        minConfidenceThreshold: 80,
      };
      expect(getEffectiveThreshold(tag, 70)).toBe(80);
    });
  });

  describe('meetsTagThreshold', () => {
    it('should check against tag override when specified', () => {
      const tag1 = { minConfidenceThreshold: 80 };
      expect(meetsTagThreshold(0.85, tag1, 70)).toBe(true);
      expect(meetsTagThreshold(0.75, tag1, 70)).toBe(false); // 75% < 80%
    });

    it('should check against global threshold when tag override not specified', () => {
      const tag1 = {};
      expect(meetsTagThreshold(0.75, tag1, 70)).toBe(true);
      expect(meetsTagThreshold(0.65, tag1, 70)).toBe(false);
    });

    it('should use default threshold when neither tag override nor global provided', () => {
      const tag1 = {};
      expect(meetsTagThreshold(0.75, tag1)).toBe(true); // default 70
      expect(meetsTagThreshold(0.65, tag1)).toBe(false);
    });

    it('should handle edge cases with thresholds at boundaries', () => {
      const tag1 = { minConfidenceThreshold: 100 };
      expect(meetsTagThreshold(1.0, tag1, 70)).toBe(true);
      expect(meetsTagThreshold(0.99, tag1, 70)).toBe(false);

      const tag2 = { minConfidenceThreshold: 0 };
      expect(meetsTagThreshold(0.0, tag2, 70)).toBe(true);
      expect(meetsTagThreshold(0.01, tag2, 70)).toBe(true);
    });
  });
});

describe('confidenceUtils - Display and Formatting Functions', () => {
  describe('formatConfidence', () => {
    it('should format confidence as percentage string with no decimals', () => {
      expect(formatConfidence(0.75)).toBe('75%');
      expect(formatConfidence(0.5)).toBe('50%');
      expect(formatConfidence(1.0)).toBe('100%');
      expect(formatConfidence(0.0)).toBe('0%');
    });

    it('should format with specified decimal places', () => {
      // Note: formatConfidence rounds to integer first, then applies decimals
      expect(formatConfidence(0.756, 1)).toBe('76.0%'); // rounds to 76, then 76.0
      expect(formatConfidence(0.756, 2)).toBe('76.00%'); // rounds to 76, then 76.00
      expect(formatConfidence(0.5, 1)).toBe('50.0%');
      expect(formatConfidence(0.123, 2)).toBe('12.00%'); // rounds to 12, then 12.00
    });

    it('should handle rounding with decimals', () => {
      expect(formatConfidence(0.756, 0)).toBe('76%'); // rounds to 76
      expect(formatConfidence(0.754, 0)).toBe('75%'); // rounds to 75
      expect(formatConfidence(0.999, 1)).toBe('100.0%'); // rounds to 100, then 100.0
    });
  });

  describe('formatConfidenceAs', () => {
    it('should format as percentage by default', () => {
      expect(formatConfidenceAs(0.75, 'percentage')).toBe('75%');
      expect(formatConfidenceAs(0.5, 'percentage')).toBe('50%');
    });

    it('should format as decimal', () => {
      expect(formatConfidenceAs(0.75, 'decimal')).toBe('0.75');
      expect(formatConfidenceAs(0.5, 'decimal')).toBe('0.50');
      expect(formatConfidenceAs(0.123, 'decimal')).toBe('0.12');
    });

    it('should format as label', () => {
      expect(formatConfidenceAs(0.85, 'label')).toBe('High');
      expect(formatConfidenceAs(0.75, 'label')).toBe('Medium');
      expect(formatConfidenceAs(0.65, 'label')).toBe('Low');
    });
  });

  describe('getConfidenceLevel', () => {
    it('should return HIGH for confidence >= 80%', () => {
      expect(getConfidenceLevel(0.80)).toBe(ConfidenceLevel.HIGH);
      expect(getConfidenceLevel(0.85)).toBe(ConfidenceLevel.HIGH);
      expect(getConfidenceLevel(0.90)).toBe(ConfidenceLevel.HIGH);
      expect(getConfidenceLevel(1.0)).toBe(ConfidenceLevel.HIGH);
    });

    it('should return MEDIUM for confidence 70-79%', () => {
      expect(getConfidenceLevel(0.70)).toBe(ConfidenceLevel.MEDIUM);
      expect(getConfidenceLevel(0.75)).toBe(ConfidenceLevel.MEDIUM);
      expect(getConfidenceLevel(0.79)).toBe(ConfidenceLevel.MEDIUM);
    });

    it('should return LOW for confidence < 70%', () => {
      expect(getConfidenceLevel(0.0)).toBe(ConfidenceLevel.LOW);
      expect(getConfidenceLevel(0.50)).toBe(ConfidenceLevel.LOW);
      expect(getConfidenceLevel(0.69)).toBe(ConfidenceLevel.LOW);
      expect(getConfidenceLevel(0.694)).toBe(ConfidenceLevel.LOW); // rounds to 69
    });

    it('should handle boundary cases correctly', () => {
      // At exactly 80% should be HIGH
      expect(getConfidenceLevel(0.80)).toBe(ConfidenceLevel.HIGH);

      // Values that round to 80% should be HIGH
      expect(getConfidenceLevel(0.795)).toBe(ConfidenceLevel.HIGH); // rounds to 80 (79.5 -> 80)
      expect(getConfidenceLevel(0.799)).toBe(ConfidenceLevel.HIGH); // rounds to 80 (79.9 -> 80)

      // Values that round to just below 80% should be MEDIUM
      expect(getConfidenceLevel(0.794)).toBe(ConfidenceLevel.MEDIUM); // rounds to 79

      // At exactly 70% should be MEDIUM
      expect(getConfidenceLevel(0.70)).toBe(ConfidenceLevel.MEDIUM);

      // Just below 70% should be LOW
      expect(getConfidenceLevel(0.694)).toBe(ConfidenceLevel.LOW); // rounds to 69
      expect(getConfidenceLevel(0.699)).toBe(ConfidenceLevel.MEDIUM); // rounds to 70 (69.9 -> 70)
    });
  });

  describe('getConfidenceLevelLabel', () => {
    it('should return human-readable labels', () => {
      expect(getConfidenceLevelLabel(0.85)).toBe('High');
      expect(getConfidenceLevelLabel(0.75)).toBe('Medium');
      expect(getConfidenceLevelLabel(0.65)).toBe('Low');
    });

    it('should handle boundary cases', () => {
      expect(getConfidenceLevelLabel(0.80)).toBe('High');
      expect(getConfidenceLevelLabel(0.70)).toBe('Medium');
      expect(getConfidenceLevelLabel(0.69)).toBe('Low');
    });
  });

  describe('getConfidenceColor', () => {
    it('should return green for HIGH confidence', () => {
      expect(getConfidenceColor(0.80)).toBe('#4CAF50');
      expect(getConfidenceColor(0.85)).toBe('#4CAF50');
      expect(getConfidenceColor(1.0)).toBe('#4CAF50');
    });

    it('should return amber/yellow for MEDIUM confidence', () => {
      expect(getConfidenceColor(0.70)).toBe('#FFC107');
      expect(getConfidenceColor(0.75)).toBe('#FFC107');
      expect(getConfidenceColor(0.79)).toBe('#FFC107');
    });

    it('should return red for LOW confidence', () => {
      expect(getConfidenceColor(0.0)).toBe('#F44336');
      expect(getConfidenceColor(0.50)).toBe('#F44336');
      expect(getConfidenceColor(0.69)).toBe('#F44336');
    });

    it('should handle boundary cases correctly', () => {
      expect(getConfidenceColor(0.795)).toBe('#4CAF50'); // rounds to 80
      expect(getConfidenceColor(0.694)).toBe('#F44336'); // rounds to 69
    });
  });
});

describe('confidenceUtils - Comparison Utilities', () => {
  describe('compareConfidence', () => {
    it('should return "greater" when first confidence is higher', () => {
      expect(compareConfidence(0.8, 0.7)).toBe('greater');
      expect(compareConfidence(0.75, 0.5)).toBe('greater');
      expect(compareConfidence(1.0, 0.0)).toBe('greater');
    });

    it('should return "less" when first confidence is lower', () => {
      expect(compareConfidence(0.7, 0.8)).toBe('less');
      expect(compareConfidence(0.5, 0.75)).toBe('less');
      expect(compareConfidence(0.0, 1.0)).toBe('less');
    });

    it('should return "equal" when confidences are very close', () => {
      expect(compareConfidence(0.7, 0.7)).toBe('equal');
      expect(compareConfidence(0.75, 0.7505)).toBe('equal'); // within 0.001
      expect(compareConfidence(0.8, 0.7999)).toBe('equal'); // within 0.001
    });

    it('should distinguish values outside tolerance', () => {
      expect(compareConfidence(0.7, 0.702)).toBe('less'); // difference 0.002
      expect(compareConfidence(0.75, 0.749)).toBe('greater'); // difference 0.001
    });
  });

  describe('getConfidenceDifference', () => {
    it('should calculate absolute difference in percentage points', () => {
      expect(getConfidenceDifference(0.8, 0.7)).toBe(10);
      expect(getConfidenceDifference(0.7, 0.8)).toBe(10); // absolute value
      expect(getConfidenceDifference(1.0, 0.0)).toBe(100);
      expect(getConfidenceDifference(0.5, 0.5)).toBe(0);
    });

    it('should handle various differences', () => {
      expect(getConfidenceDifference(0.75, 0.50)).toBe(25);
      expect(getConfidenceDifference(0.99, 0.01)).toBe(98);
      expect(getConfidenceDifference(0.695, 0.705)).toBe(1); // 70 vs 71
    });

    it('should return 0 for equal values', () => {
      expect(getConfidenceDifference(0.7, 0.7)).toBe(0);
      expect(getConfidenceDifference(0.0, 0.0)).toBe(0);
      expect(getConfidenceDifference(1.0, 1.0)).toBe(0);
    });
  });
});

describe('confidenceUtils - Edge Cases and Integration', () => {
  describe('Complete workflow scenarios', () => {
    it('should handle complete confidence evaluation workflow', () => {
      const confidence = 0.75;
      const threshold = 70;

      // Check if meets threshold
      expect(meetsThreshold(confidence, threshold)).toBe(true);

      // Format for display
      expect(formatConfidence(confidence)).toBe('75%');

      // Get level and color
      expect(getConfidenceLevel(confidence)).toBe(ConfidenceLevel.MEDIUM);
      expect(getConfidenceColor(confidence)).toBe('#FFC107');
    });

    it('should handle tag with custom threshold workflow', () => {
      const confidence = 0.82;
      const tag: Partial<Tag> = {
        key: 'test-tag',
        minConfidenceThreshold: 85,
      };
      const globalThreshold = 70;

      // Get effective threshold (tag override)
      expect(getEffectiveThreshold(tag, globalThreshold)).toBe(85);

      // Check if meets tag threshold
      expect(meetsTagThreshold(confidence, tag, globalThreshold)).toBe(false); // 82% < 85%

      // Format for display
      expect(formatConfidence(confidence)).toBe('82%');
    });

    it('should handle tag without custom threshold workflow', () => {
      const confidence = 0.72;
      const tag: Partial<Tag> = {
        key: 'test-tag',
      };
      const globalThreshold = 70;

      // Get effective threshold (global)
      expect(getEffectiveThreshold(tag, globalThreshold)).toBe(70);

      // Check if meets tag threshold
      expect(meetsTagThreshold(confidence, tag, globalThreshold)).toBe(true); // 72% >= 70%

      // Get level
      expect(getConfidenceLevel(confidence)).toBe(ConfidenceLevel.MEDIUM);
    });
  });

  describe('Boundary value analysis', () => {
    it('should handle confidence at 0%', () => {
      expect(confidenceToPercentage(0)).toBe(0);
      expect(percentageToConfidence(0)).toBe(0);
      expect(formatConfidence(0)).toBe('0%');
      expect(getConfidenceLevel(0)).toBe(ConfidenceLevel.LOW);
      expect(meetsThreshold(0, 0)).toBe(true);
      expect(meetsThreshold(0, 1)).toBe(false);
    });

    it('should handle confidence at 100%', () => {
      expect(confidenceToPercentage(1)).toBe(100);
      expect(percentageToConfidence(100)).toBe(1);
      expect(formatConfidence(1)).toBe('100%');
      expect(getConfidenceLevel(1)).toBe(ConfidenceLevel.HIGH);
      expect(meetsThreshold(1, 100)).toBe(true);
      expect(meetsThreshold(1, 99)).toBe(true);
    });

    it('should handle confidence at 70% (medium threshold)', () => {
      expect(confidenceToPercentage(0.70)).toBe(70);
      expect(formatConfidence(0.70)).toBe('70%');
      expect(getConfidenceLevel(0.70)).toBe(ConfidenceLevel.MEDIUM);
      expect(meetsThreshold(0.70, 70)).toBe(true);
      expect(meetsThreshold(0.70, 71)).toBe(false);
    });

    it('should handle confidence at 80% (high threshold)', () => {
      expect(confidenceToPercentage(0.80)).toBe(80);
      expect(formatConfidence(0.80)).toBe('80%');
      expect(getConfidenceLevel(0.80)).toBe(ConfidenceLevel.HIGH);
      expect(meetsThreshold(0.80, 80)).toBe(true);
      expect(meetsThreshold(0.80, 81)).toBe(false);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical AI confidence values', () => {
      const typicalValues = [0.92, 0.87, 0.73, 0.68, 0.45];
      const expectedLevels = [
        ConfidenceLevel.HIGH,
        ConfidenceLevel.HIGH,
        ConfidenceLevel.MEDIUM,
        ConfidenceLevel.LOW,
        ConfidenceLevel.LOW,
      ];

      typicalValues.forEach((confidence, index) => {
        expect(getConfidenceLevel(confidence)).toBe(expectedLevels[index]);
      });
    });

    it('should handle threshold-based tag application', () => {
      const tags = [
        { key: 'tag1', minConfidenceThreshold: 80 },
        { key: 'tag2', minConfidenceThreshold: 70 },
        { key: 'tag3' }, // uses global
      ];
      const globalThreshold = 70;
      const confidence = 0.75;

      // tag1: 75% < 80%, should not apply
      expect(meetsTagThreshold(confidence, tags[0], globalThreshold)).toBe(false);

      // tag2: 75% >= 70%, should apply
      expect(meetsTagThreshold(confidence, tags[1], globalThreshold)).toBe(true);

      // tag3: uses global 70%, 75% >= 70%, should apply
      expect(meetsTagThreshold(confidence, tags[2], globalThreshold)).toBe(true);
    });
  });

  describe('Rounding behavior', () => {
    it('should consistently round across all functions', () => {
      // Value that rounds to 75%
      const conf = 0.745;

      expect(confidenceToPercentage(conf)).toBe(75);
      expect(formatConfidence(conf)).toBe('75%');
      expect(getConfidenceLevel(conf)).toBe(ConfidenceLevel.MEDIUM); // 75% >= 70%
      expect(meetsThreshold(conf, 75)).toBe(true); // rounds to 75, meets 75
      expect(meetsThreshold(conf, 76)).toBe(false); // rounds to 75, below 76
    });

    it('should handle values at rounding boundaries', () => {
      // 0.695 rounds to 70
      expect(confidenceToPercentage(0.695)).toBe(70);
      expect(getConfidenceLevel(0.695)).toBe(ConfidenceLevel.MEDIUM);

      // 0.694 rounds to 69
      expect(confidenceToPercentage(0.694)).toBe(69);
      expect(getConfidenceLevel(0.694)).toBe(ConfidenceLevel.LOW);

      // 0.795 rounds to 80
      expect(confidenceToPercentage(0.795)).toBe(80);
      expect(getConfidenceLevel(0.795)).toBe(ConfidenceLevel.HIGH);
    });
  });
});
