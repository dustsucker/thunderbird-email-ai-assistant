/**
 * Tests for TagHistoryRepository
 *
 * @module test/infrastructure/storage/TagHistoryRepository.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagHistoryRepository } from '../../../src/infrastructure/storage/TagHistoryRepository';
import type { TagHistoryItem } from '../../../src/shared/types/TagHistory';
import {
  MAX_HISTORY_PER_MESSAGE,
  TAG_HISTORY_STORAGE_KEY,
} from '../../../src/shared/types/TagHistory';
import { createMockLogger, createMockClock, createMockRandom } from '../../helpers/mock-factories';

// ============================================================================
// Tests
// ============================================================================

describe('TagHistoryRepository', () => {
  let repository: TagHistoryRepository;
  let mockLogger = createMockLogger();
  let mockClock = createMockClock(1709251200000);
  let mockRandom = createMockRandom('test-uuid-1');

  // Mock storage
  const mockStorage: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

    // Mock messenger.storage.local
    (globalThis as Record<string, unknown>).messenger = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
            if (keys === null || keys === undefined) {
              return { ...mockStorage };
            }
            if (typeof keys === 'string') {
              return { [keys]: mockStorage[keys] };
            }
            if (Array.isArray(keys)) {
              const result: Record<string, unknown> = {};
              keys.forEach((key) => {
                if (mockStorage[key] !== undefined) {
                  result[key] = mockStorage[key];
                }
              });
              return result;
            }
            // Object case
            const result: Record<string, unknown> = {};
            Object.keys(keys).forEach((key) => {
              if (mockStorage[key] !== undefined) {
                result[key] = mockStorage[key];
              }
            });
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
    mockRandom = createMockRandom('test-uuid-1');

    repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(repository).toBeInstanceOf(TagHistoryRepository);
      expect(mockLogger.debug).toHaveBeenCalledWith('TagHistoryRepository initialized');
    });
  });

  // ==========================================================================
  // recordChange() Tests
  // ==========================================================================

  describe('recordChange', () => {
    it('should create history item with correct data', async () => {
      const item = await repository.recordChange(
        '123',
        [{ key: 'business', tag: 'Business' }],
        [{ key: 'personal', tag: 'Personal' }],
        [{ key: 'personal', tag: 'Personal' }]
      );

      expect(item.id).toBe('test-uuid-1');
      expect(item.messageId).toBe('123');
      expect(item.timestamp).toBe(1709251200000);
      expect(item.addedTags).toHaveLength(1);
      expect(item.addedTags[0]).toEqual({ key: 'business', tag: 'Business' });
      expect(item.removedTags).toHaveLength(1);
      expect(item.removedTags[0]).toEqual({ key: 'personal', tag: 'Personal' });
    });

    it('should add new item at beginning of history array', async () => {
      // Add first item
      mockRandom = createMockRandom('uuid-1');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('123', [], [], []);

      // Add second item
      mockRandom = createMockRandom('uuid-2');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('456', [], [], []);

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('uuid-2');
      expect(history[1].id).toBe('uuid-1');
    });

    it('should log when recording change', async () => {
      await repository.recordChange('123', [], [], []);

      expect(mockLogger.info).toHaveBeenCalledWith('Tag change recorded', {
        messageId: '123',
        historyId: 'test-uuid-1',
      });
    });

    it('should handle empty added and removed arrays', async () => {
      const item = await repository.recordChange('123', [], [], []);

      expect(item.addedTags).toEqual([]);
      expect(item.removedTags).toEqual([]);
    });
  });

  // ==========================================================================
  // recordChange() - History Trimming Tests
  // ==========================================================================

  describe('recordChange - history trimming', () => {
    it('should trim old entries when exceeding MAX_HISTORY_PER_MESSAGE', async () => {
      // Add MAX_HISTORY_PER_MESSAGE + 1 items for the same message
      for (let i = 0; i < MAX_HISTORY_PER_MESSAGE + 2; i++) {
        mockRandom = createMockRandom(`uuid-${i}`);
        repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
        await repository.recordChange('123', [], [], []);
      }

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      const messageHistory = history.filter((h) => h.messageId === '123');
      expect(messageHistory.length).toBeLessThanOrEqual(MAX_HISTORY_PER_MESSAGE);
    });

    it('should keep most recent entries when trimming', async () => {
      // Add more than max entries
      for (let i = 0; i < MAX_HISTORY_PER_MESSAGE + 3; i++) {
        mockRandom = createMockRandom(`uuid-${i}`);
        repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
        await repository.recordChange('123', [], [], []);
      }

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      const messageHistory = history.filter((h) => h.messageId === '123');

      // Check that the most recent entries are kept
      const ids = messageHistory.map((h) => h.id);
      expect(ids).toContain('uuid-12'); // Most recent
      expect(ids).toContain('uuid-11');
      expect(ids).not.toContain('uuid-0'); // Oldest should be trimmed
    });

    it('should not affect history of other messages when trimming', async () => {
      // Add items for message 123
      for (let i = 0; i < MAX_HISTORY_PER_MESSAGE + 1; i++) {
        mockRandom = createMockRandom(`uuid-123-${i}`);
        repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
        await repository.recordChange('123', [], [], []);
      }

      // Add one item for message 456
      mockRandom = createMockRandom('uuid-456-0');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('456', [], [], []);

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      const history456 = history.filter((h) => h.messageId === '456');
      expect(history456).toHaveLength(1);
    });

    it('should log when trimming entries', async () => {
      // Add more than max entries
      for (let i = 0; i < MAX_HISTORY_PER_MESSAGE + 1; i++) {
        mockRandom = createMockRandom(`uuid-${i}`);
        repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
        await repository.recordChange('123', [], [], []);
      }

      expect(mockLogger.debug).toHaveBeenCalledWith('Trimmed old history entries', {
        messageId: '123',
        removed: expect.any(Number),
      });
    });
  });

  // ==========================================================================
  // getLatestForMessage() Tests
  // ==========================================================================

  describe('getLatestForMessage', () => {
    it('should return null when no history exists', async () => {
      const result = await repository.getLatestForMessage('123');
      expect(result).toBeNull();
    });

    it('should return null when no history for specific message', async () => {
      await repository.recordChange('456', [], [], []);
      const result = await repository.getLatestForMessage('123');
      expect(result).toBeNull();
    });

    it('should return most recent history item for message', async () => {
      // Add two items for same message
      mockRandom = createMockRandom('uuid-1');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('123', [{ key: 'first', tag: 'First' }], [], []);

      mockRandom = createMockRandom('uuid-2');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('123', [{ key: 'second', tag: 'Second' }], [], []);

      const result = await repository.getLatestForMessage('123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('uuid-2');
      expect(result?.addedTags[0].key).toBe('second');
    });
  });

  // ==========================================================================
  // getHistoryForMessage() Tests
  // ==========================================================================

  describe('getHistoryForMessage', () => {
    it('should return empty array when no history exists', async () => {
      const result = await repository.getHistoryForMessage('123');
      expect(result).toEqual([]);
    });

    it('should return all history items for specific message', async () => {
      // Add items for multiple messages
      mockRandom = createMockRandom('uuid-123-1');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('123', [], [], []);

      mockRandom = createMockRandom('uuid-456-1');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('456', [], [], []);

      mockRandom = createMockRandom('uuid-123-2');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('123', [], [], []);

      const result = await repository.getHistoryForMessage('123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('uuid-123-2');
      expect(result[1].id).toBe('uuid-123-1');
    });

    it('should return items in most-recent-first order', async () => {
      for (let i = 0; i < 3; i++) {
        mockRandom = createMockRandom(`uuid-${i}`);
        repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
        await repository.recordChange('123', [], [], []);
      }

      const result = await repository.getHistoryForMessage('123');

      expect(result[0].id).toBe('uuid-2');
      expect(result[1].id).toBe('uuid-1');
      expect(result[2].id).toBe('uuid-0');
    });
  });

  // ==========================================================================
  // removeHistoryItem() Tests
  // ==========================================================================

  describe('removeHistoryItem', () => {
    it('should remove history item by id', async () => {
      await repository.recordChange('123', [], [], []);

      let history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toHaveLength(1);

      await repository.removeHistoryItem('test-uuid-1');

      history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toHaveLength(0);
    });

    it('should not affect other history items', async () => {
      mockRandom = createMockRandom('uuid-1');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('123', [], [], []);

      mockRandom = createMockRandom('uuid-2');
      repository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);
      await repository.recordChange('456', [], [], []);

      await repository.removeHistoryItem('uuid-1');

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('uuid-2');
    });

    it('should handle non-existent id gracefully', async () => {
      await repository.recordChange('123', [], [], []);
      await repository.removeHistoryItem('non-existent');

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toHaveLength(1);
    });

    it('should log when removing item', async () => {
      await repository.recordChange('123', [], [], []);
      await repository.removeHistoryItem('test-uuid-1');

      expect(mockLogger.debug).toHaveBeenCalledWith('History item removed', {
        historyId: 'test-uuid-1',
      });
    });
  });

  // ==========================================================================
  // clearHistory() Tests
  // ==========================================================================

  describe('clearHistory', () => {
    it('should clear all history', async () => {
      await repository.recordChange('123', [], [], []);
      await repository.recordChange('456', [], [], []);

      await repository.clearHistory();

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toEqual([]);
    });

    it('should log when clearing history', async () => {
      await repository.clearHistory();

      expect(mockLogger.info).toHaveBeenCalledWith('Tag history cleared');
    });

    it('should handle empty history gracefully', async () => {
      await repository.clearHistory();

      const history = mockStorage[TAG_HISTORY_STORAGE_KEY] as TagHistoryItem[];
      expect(history).toEqual([]);
    });
  });
});
