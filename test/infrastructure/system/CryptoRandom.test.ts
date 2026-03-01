/**
 * Tests for CryptoRandom implementation.
 *
 * @module test/infrastructure/system/CryptoRandom.test
 */

import { describe, it, expect } from 'vitest';
import { CryptoRandom } from '@/infrastructure/system/CryptoRandom';

describe('CryptoRandom', () => {
  const random = new CryptoRandom();

  describe('uuid()', () => {
    it('should return a string', () => {
      const result = random.uuid();
      expect(typeof result).toBe('string');
    });

    it('should return a valid UUID v4 format', () => {
      const result = random.uuid();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where y is 8, 9, a, or b
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidRegex);
    });

    it('should return unique values on successive calls', () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(random.uuid());
      }
      // All 100 UUIDs should be unique
      expect(results.size).toBe(100);
    });

    it('should return a 36-character string', () => {
      const result = random.uuid();
      expect(result.length).toBe(36);
    });
  });

  describe('randomInt()', () => {
    it('should return a number within the range [min, max]', () => {
      const min = 1;
      const max = 10;

      for (let i = 0; i < 100; i++) {
        const result = random.randomInt(min, max);
        expect(result).toBeGreaterThanOrEqual(min);
        expect(result).toBeLessThanOrEqual(max);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('should return min when min equals max', () => {
      const result = random.randomInt(5, 5);
      expect(result).toBe(5);
    });

    it('should handle negative numbers', () => {
      const min = -10;
      const max = -5;

      for (let i = 0; i < 50; i++) {
        const result = random.randomInt(min, max);
        expect(result).toBeGreaterThanOrEqual(min);
        expect(result).toBeLessThanOrEqual(max);
      }
    });

    it('should handle zero range', () => {
      const result = random.randomInt(0, 0);
      expect(result).toBe(0);
    });

    it('should throw when min is greater than max', () => {
      expect(() => random.randomInt(10, 1)).toThrow('min must be less than or equal to max');
    });

    it('should throw when min is not an integer', () => {
      expect(() => random.randomInt(1.5, 10)).toThrow('min and max must be integers');
    });

    it('should throw when max is not an integer', () => {
      expect(() => random.randomInt(1, 10.5)).toThrow('min and max must be integers');
    });

    it('should eventually produce all values in the range', () => {
      const min = 0;
      const max = 5;
      const seen = new Set<number>();

      // Run enough iterations to likely see all values
      for (let i = 0; i < 200; i++) {
        seen.add(random.randomInt(min, max));
      }

      // All values from 0 to 5 should have been seen
      expect(seen.size).toBe(max - min + 1);
    });
  });
});
