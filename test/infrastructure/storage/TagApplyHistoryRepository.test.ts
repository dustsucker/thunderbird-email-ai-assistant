/**
 * Tests for TagApplyHistoryRepository (debug tag-apply history, ring buffer)
 *
 * @module test/infrastructure/storage/TagApplyHistoryRepository.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagApplyHistoryRepository } from '../../../src/infrastructure/storage/TagApplyHistoryRepository';
import type { TagApplyHistoryEntry } from '../../../src/shared/types/TagHistory';
import {
  MAX_TAG_APPLY_HISTORY,
  TAG_APPLY_HISTORY_STORAGE_KEY,
} from '../../../src/shared/types/TagHistory';
import { createMockLogger, createMockClock } from '../../helpers/mock-factories';

// ============================================================================
// Tests
// ============================================================================

describe('TagApplyHistoryRepository', () => {
  let repository: TagApplyHistoryRepository;
  let mockLogger = createMockLogger();
  let mockClock = createMockClock(1709251200000);

  // Mock storage
  const mockStorage: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

    (globalThis as Record<string, unknown>).messenger = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
            if (keys === null || keys === undefined) {
              return { ...mockStorage };
            }
            const result: Record<string, unknown> = {};
            const requested = Array.isArray(keys) ? keys : [keys];
            for (const key of requested) {
              if (typeof key === 'string' && mockStorage[key] !== undefined) {
                result[key] = mockStorage[key];
              }
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(mockStorage, items);
          }),
        },
      },
    };

    mockLogger = createMockLogger();
    mockClock = createMockClock(1709251200000);
    repository = new TagApplyHistoryRepository(mockLogger, mockClock);
  });

  const recordEntry = (overrides: Partial<TagApplyHistoryEntry> = {}) =>
    repository.record({
      messageId: '123',
      tags: ['business'],
      providerId: 'openai',
      ...overrides,
    });

  // ==========================================================================
  // record()
  // ==========================================================================

  describe('record', () => {
    it('should store entry with all fields and clock timestamp', async () => {
      await recordEntry({ messageId: '123', tags: ['business'], providerId: 'openai' });

      const history = mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] as TagApplyHistoryEntry[];
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        timestamp: 1709251200000,
        messageId: '123',
        tags: ['business'],
        providerId: 'openai',
      });
    });

    it('should keep optional subject when provided', async () => {
      await recordEntry({ subject: 'Invoice from Acme' });

      const history = mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] as TagApplyHistoryEntry[];
      expect(history[0].subject).toBe('Invoice from Acme');
    });

    it('should insert newest entry first', async () => {
      await recordEntry({ messageId: '1' });
      mockClock = createMockClock(1709251260000);
      repository = new TagApplyHistoryRepository(mockLogger, mockClock);
      await recordEntry({ messageId: '2' });

      const history = mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] as TagApplyHistoryEntry[];
      expect(history.map((h) => h.messageId)).toEqual(['2', '1']);
    });

    it('should accept empty tags array', async () => {
      await recordEntry({ tags: [] });

      const history = mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] as TagApplyHistoryEntry[];
      expect(history[0].tags).toEqual([]);
    });
  });

  // ==========================================================================
  // Ring Buffer
  // ==========================================================================

  describe('ring buffer', () => {
    it(`should keep at most ${MAX_TAG_APPLY_HISTORY} entries`, async () => {
      for (let i = 0; i < MAX_TAG_APPLY_HISTORY + 10; i++) {
        await recordEntry({ messageId: String(i) });
      }

      const history = mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] as TagApplyHistoryEntry[];
      expect(history).toHaveLength(MAX_TAG_APPLY_HISTORY);
    });

    it('should drop the oldest entries when the limit is exceeded', async () => {
      for (let i = 0; i < MAX_TAG_APPLY_HISTORY + 5; i++) {
        await recordEntry({ messageId: String(i) });
      }

      const history = mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] as TagApplyHistoryEntry[];
      const ids = history.map((h) => h.messageId);
      expect(ids[0]).toBe(String(MAX_TAG_APPLY_HISTORY + 4)); // newest
      expect(ids).not.toContain('0'); // oldest dropped
      expect(ids).not.toContain('4'); // dropped too
      expect(ids).toContain('5'); // first kept
    });
  });

  // ==========================================================================
  // getHistory()
  // ==========================================================================

  describe('getHistory', () => {
    it('should return empty array when nothing was recorded', async () => {
      expect(await repository.getHistory()).toEqual([]);
    });

    it('should return recorded entries newest first', async () => {
      await recordEntry({ messageId: '1' });
      await recordEntry({ messageId: '2' });

      const history = await repository.getHistory();
      expect(history.map((h) => h.messageId)).toEqual(['2', '1']);
    });

    it('should return empty array for corrupted storage content', async () => {
      mockStorage[TAG_APPLY_HISTORY_STORAGE_KEY] = 'not-an-array';
      expect(await repository.getHistory()).toEqual([]);
    });
  });

  // ==========================================================================
  // clearHistory()
  // ==========================================================================

  describe('clearHistory', () => {
    it('should remove all entries', async () => {
      await recordEntry({ messageId: '1' });
      await recordEntry({ messageId: '2' });

      await repository.clearHistory();

      expect(await repository.getHistory()).toEqual([]);
    });
  });
});
