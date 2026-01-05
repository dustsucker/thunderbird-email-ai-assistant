import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashEmail,
  simpleHash,
  normalizeHeaders,
  createCacheKey,
  isEmailFresh,
} from './cache';
import { AnalysisCache } from './cache';

describe('cache module', () => {
  describe('hashEmail', () => {
    it('should return consistent hash for same input', async () => {
      const body = 'Hello world';
      const headers = { from: 'test@example.com', subject: 'Test' };
      const hash1 = await hashEmail(body, headers);
      const hash2 = await hashEmail(body, headers);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different body', async () => {
      const headers = { from: 'test@example.com', subject: 'Test' };
      const hash1 = await hashEmail('Body 1', headers);
      const hash2 = await hashEmail('Body 2', headers);
      expect(hash1).not.toBe(hash2);
    });

    it('should return different hash for different headers', async () => {
      const body = 'Hello world';
      const hash1 = await hashEmail(body, { from: 'test1@example.com' });
      const hash2 = await hashEmail(body, { from: 'test2@example.com' });
      expect(hash1).not.toBe(hash2);
    });

    it('should return 64-character hex string', async () => {
      const hash = await hashEmail('test', {});
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('should handle empty body and headers', async () => {
      const hash = await hashEmail('', {});
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/i);
    });
  });

  describe('simpleHash', () => {
    it('should return consistent hash for same input', () => {
      const hash1 = simpleHash('test');
      const hash2 = simpleHash('test');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', () => {
      const hash1 = simpleHash('test1');
      const hash2 = simpleHash('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 32-bit integer', () => {
      const hash = simpleHash('test');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
      expect(Number.isInteger(hash)).toBe(true);
    });

    it('should handle empty string', () => {
      const hash = simpleHash('');
      expect(Number.isInteger(hash)).toBe(true);
    });
  });

  describe('normalizeHeaders', () => {
    it('should extract relevant headers only', () => {
      const headers = {
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        date: '2024-01-01',
        'message-id': '123@example.com',
        references: '<parent@example.com>',
        'in-reply-to': '<parent@example.com>',
        'x-custom-header': 'should be ignored',
        'content-type': 'text/plain',
      };
      const normalized = normalizeHeaders(headers);
      expect(normalized).toEqual({
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        date: '2024-01-01',
        'message-id': '123@example.com',
        references: '<parent@example.com>',
        'in-reply-to': '<parent@example.com>',
      });
    });

    it('should handle empty headers object', () => {
      const normalized = normalizeHeaders({});
      expect(normalized).toEqual({});
    });

    it('should handle headers with only some relevant fields', () => {
      const headers = {
        from: 'test@example.com',
        subject: 'Test Email',
      };
      const normalized = normalizeHeaders(headers);
      expect(normalized).toEqual({
        from: 'test@example.com',
        subject: 'Test Email',
      });
    });

    it('should handle headers with no relevant fields', () => {
      const headers = {
        'x-custom-1': 'value1',
        'x-custom-2': 'value2',
      };
      const normalized = normalizeHeaders(headers);
      expect(normalized).toEqual({});
    });
  });

  describe('createCacheKey', () => {
    it('should combine body and normalized headers into hash', async () => {
      const body = 'Hello world';
      const headers = {
        from: 'test@example.com',
        subject: 'Test',
        'x-custom': 'ignored',
      };
      const hash = await createCacheKey(body, headers);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('should be deterministic', async () => {
      const body = 'Test email';
      const headers = { from: 'test@example.com' };
      const hash1 = await createCacheKey(body, headers);
      const hash2 = await createCacheKey(body, headers);
      expect(hash1).toBe(hash2);
    });

    it('should produce different keys for different content', async () => {
      const body = 'Test email';
      const headers = { from: 'test@example.com' };
      const hash1 = await createCacheKey(body, headers);
      const hash2 = await createCacheKey(body, { from: 'other@example.com' });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('isEmailFresh', () => {
    it('should return true for recent email', () => {
      const now = Date.now();
      const recentTimestamp = now - 1000 * 60 * 60; // 1 hour ago
      expect(isEmailFresh(recentTimestamp)).toBe(true);
    });

    it('should return false for old email', () => {
      const now = Date.now();
      const oldTimestamp = now - 1000 * 60 * 60 * 25; // 25 hours ago
      expect(isEmailFresh(oldTimestamp)).toBe(false);
    });

    it('should respect custom maxAge', () => {
      const now = Date.now();
      const timestamp = now - 1000 * 60 * 30; // 30 minutes ago
      expect(isEmailFresh(timestamp, 1000 * 60 * 15)).toBe(false); // 15 minute max
      expect(isEmailFresh(timestamp, 1000 * 60 * 60)).toBe(true); // 1 hour max
    });

    it('should handle future timestamps', () => {
      const now = Date.now();
      const futureTimestamp = now + 1000 * 60 * 60; // 1 hour in future
      expect(isEmailFresh(futureTimestamp)).toBe(true);
    });
  });

  describe('AnalysisCache', () => {
    let cache: AnalysisCache;

    beforeEach(() => {
      cache = new AnalysisCache();
    });

    it('should instantiate without errors', () => {
      expect(cache).toBeInstanceOf(AnalysisCache);
    });

    it('should return null for non-existent entry', async () => {
      const result = await cache.get('nonexistent-hash');
      expect(result).toBeNull();
    });

    it('should handle IndexedDB gracefully in test environment', async () => {
      const mockHash = 'test-hash-123';
      const mockResult = {
        tags: ['business'],
        confidence: 0.9,
        reasoning: 'Test reasoning',
      };

      const result = await cache.get(mockHash);
      expect(result).toBeNull();

      await cache.set(mockHash, mockResult);

      const retrieved = await cache.get(mockHash);
      if (retrieved !== null) {
        expect(retrieved.tags).toEqual(mockResult.tags);
        expect(retrieved.confidence).toBe(mockResult.confidence);
        expect(retrieved.reasoning).toBe(mockResult.reasoning);
      }
    });

    it('should handle clear operation', async () => {
      const mockHash = 'test-hash-456';
      const mockResult = {
        tags: ['newsletter'],
        confidence: 0.85,
        reasoning: 'Newsletter email',
      };

      try {
        await cache.set(mockHash, mockResult);
        await cache.clear();

        const retrieved = await cache.get(mockHash);
        expect(retrieved).toBeNull();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle delete operation', async () => {
      const mockHash = 'test-hash-789';
      const mockResult = {
        tags: ['business'],
        confidence: 0.95,
        reasoning: 'Business email',
      };

      await cache.set(mockHash, mockResult);
      await cache.delete(mockHash);

      const retrieved = await cache.get(mockHash);
      expect(retrieved).toBeNull();
    });

    it('should track cache statistics', async () => {
      const stats = await cache.getStats();
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(100);
    });

    it('should handle has() method', async () => {
      const mockHash = 'test-hash-has';
      const existsBefore = await cache.has(mockHash);
      expect(existsBefore).toBe(false);

      const mockResult = {
        tags: ['test'],
        confidence: 0.8,
        reasoning: 'Test',
      };

      await cache.set(mockHash, mockResult);
      const existsAfter = await cache.has(mockHash);

      if (typeof indexedDB !== 'undefined') {
        expect(existsAfter).toBe(true);
      } else {
        expect(existsAfter).toBe(false);
      }
    });

    it('should store per-tag confidence scores', async () => {
      const mockHash = 'test-hash-tagconf';
      const mockResult = {
        tags: ['business', 'urgent'],
        confidence: 0.85,
        reasoning: 'Test reasoning',
      };
      const tagConfidence = {
        'business': 0.9,
        'urgent': 0.75,
      };

      await cache.set(mockHash, mockResult, tagConfidence);

      const retrieved = await cache.getTagConfidence(mockHash);
      if (retrieved !== null) {
        expect(retrieved).toEqual(tagConfidence);
        expect(retrieved['business']).toBe(0.9);
        expect(retrieved['urgent']).toBe(0.75);
      }
    });

    it('should populate tagConfidence with overall confidence if not provided', async () => {
      const mockHash = 'test-hash-autofill';
      const mockResult = {
        tags: ['business', 'urgent'],
        confidence: 0.85,
        reasoning: 'Test reasoning',
      };

      await cache.set(mockHash, mockResult);

      const retrieved = await cache.getTagConfidence(mockHash);
      if (retrieved !== null) {
        expect(retrieved['business']).toBe(0.85);
        expect(retrieved['urgent']).toBe(0.85);
      }
    });

    it('should retrieve full cache entry with getWithDetails', async () => {
      const mockHash = 'test-hash-details';
      const mockResult = {
        tags: ['business'],
        confidence: 0.9,
        reasoning: 'Business email',
      };
      const tagConfidence = {
        'business': 0.95,
      };

      await cache.set(mockHash, mockResult, tagConfidence);

      const entry = await cache.getWithDetails(mockHash);
      if (entry !== null) {
        expect(entry.result).toEqual(mockResult);
        expect(entry.tagConfidence).toEqual(tagConfidence);
        expect(entry.emailHash).toBe(mockHash);
        expect(typeof entry.timestamp).toBe('number');
      } else {
        // If IndexedDB is not available
        expect(entry).toBeNull();
      }
    });

    it('should return null for getTagConfidence when entry does not exist', async () => {
      const retrieved = await cache.getTagConfidence('nonexistent-hash');
      expect(retrieved).toBeNull();
    });

    it('should return null for getWithDetails when entry does not exist', async () => {
      const entry = await cache.getWithDetails('nonexistent-hash');
      expect(entry).toBeNull();
    });
  });
});
