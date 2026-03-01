/**
 * Tests for SystemClock implementation.
 *
 * @module test/infrastructure/system/SystemClock.test
 */

import { describe, it, expect } from 'vitest';
import { SystemClock } from '@/infrastructure/system/SystemClock';

describe('SystemClock', () => {
  const clock = new SystemClock();

  describe('now()', () => {
    it('should return a number', () => {
      const result = clock.now();
      expect(typeof result).toBe('number');
    });

    it('should return a timestamp close to Date.now()', () => {
      const before = Date.now();
      const result = clock.now();
      const after = Date.now();

      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('should return increasing values on successive calls', async () => {
      const first = clock.now();
      // Small delay to ensure time has passed
      await new Promise((resolve) => setTimeout(resolve, 1));
      const second = clock.now();

      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe('currentDate()', () => {
    it('should return a Date object', () => {
      const result = clock.currentDate();
      expect(result).toBeInstanceOf(Date);
    });

    it('should return a date close to current time', () => {
      const before = new Date();
      const result = clock.currentDate();
      const after = new Date();

      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should return a date whose getTime() equals now()', () => {
      const timestamp = clock.now();
      const date = clock.currentDate();

      // They should be within a few milliseconds of each other
      const diff = Math.abs(date.getTime() - timestamp);
      expect(diff).toBeLessThan(10); // Within 10ms
    });
  });
});
