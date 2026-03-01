/**
 * Tests for UndoTagChanges Use Case
 *
 * @module test/application/use-cases/UndoTagChanges.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndoTagChanges } from '../../../src/application/use-cases/UndoTagChanges';
import { TagHistoryRepository } from '../../../src/infrastructure/storage/TagHistoryRepository';
import type { ITagManager } from '../../../src/domain/interfaces/ITagManager';
import type { TagHistoryItem } from '../../../src/shared/types/TagHistory';
import { createMockLogger, createMockClock, createMockRandom } from '../../helpers/mock-factories';

// ============================================================================
// Tests
// ============================================================================

describe('UndoTagChanges', () => {
  let useCase: UndoTagChanges;
  let mockTagManager: ITagManager;
  let mockHistoryRepository: TagHistoryRepository;
  let mockLogger = createMockLogger();
  let mockClock = createMockClock(1709251200000);
  let mockRandom = createMockRandom('test-uuid-1');

  // Mock storage for TagHistoryRepository
  const mockStorage: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

    // Mock messenger.storage.local
    (globalThis as Record<string, unknown>).messenger = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[]) => {
            if (typeof keys === 'string') {
              return { [keys]: mockStorage[keys] };
            }
            const result: Record<string, unknown> = {};
            const keyArray = Array.isArray(keys) ? keys : [];
            keyArray.forEach((key) => {
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

    mockTagManager = {
      getAllTags: vi.fn(),
      getTag: vi.fn(),
      getTagById: vi.fn(),
      createTag: vi.fn(),
      updateTag: vi.fn(),
      deleteTag: vi.fn(),
      addTagToMessage: vi.fn(),
      removeTagFromMessage: vi.fn(),
      setTagsOnMessage: vi.fn(),
      clearTagsFromMessage: vi.fn(),
      tagExists: vi.fn(),
      ensureTagExists: vi.fn(),
      addTagToMessages: vi.fn(),
      setTagsOnMessages: vi.fn(),
    };

    mockLogger = createMockLogger();
    mockClock = createMockClock(1709251200000);
    mockRandom = createMockRandom('test-uuid-1');

    mockHistoryRepository = new TagHistoryRepository(mockLogger, mockClock, mockRandom);

    useCase = new UndoTagChanges(mockLogger, mockTagManager, mockHistoryRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(useCase).toBeInstanceOf(UndoTagChanges);
      expect(mockLogger.debug).toHaveBeenCalledWith('UndoTagChanges use case initialized');
    });
  });

  // ==========================================================================
  // execute() Tests - Success Scenarios
  // ==========================================================================

  describe('execute - success scenarios', () => {
    it('should return false when no history exists for message', async () => {
      const result = await useCase.execute('123');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('No tag history found for message', {
        messageId: '123',
      });
    });

    it('should undo added tags by removing them', async () => {
      // Setup history
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '123',
        timestamp: 1709251200000,
        addedTags: [
          { key: 'business', tag: 'Business' },
          { key: 'important', tag: 'Important' },
        ],
        removedTags: [],
        previousTags: [],
      };
      mockStorage.tagHistory = [historyItem];

      const result = await useCase.execute('123');

      expect(result).toBe(true);
      expect(mockTagManager.removeTagFromMessage).toHaveBeenCalledWith(123, 'business');
      expect(mockTagManager.removeTagFromMessage).toHaveBeenCalledWith(123, 'important');
      expect(mockTagManager.addTagToMessage).not.toHaveBeenCalled();
    });

    it('should undo removed tags by re-adding them', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '456',
        timestamp: 1709251200000,
        addedTags: [],
        removedTags: [{ key: 'personal', tag: 'Personal' }],
        previousTags: [{ key: 'personal', tag: 'Personal' }],
      };
      mockStorage.tagHistory = [historyItem];

      const result = await useCase.execute('456');

      expect(result).toBe(true);
      expect(mockTagManager.addTagToMessage).toHaveBeenCalledWith(456, 'personal');
      expect(mockTagManager.removeTagFromMessage).not.toHaveBeenCalled();
    });

    it('should undo both added and removed tags', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '789',
        timestamp: 1709251200000,
        addedTags: [{ key: 'business', tag: 'Business' }],
        removedTags: [{ key: 'personal', tag: 'Personal' }],
        previousTags: [{ key: 'personal', tag: 'Personal' }],
      };
      mockStorage.tagHistory = [historyItem];

      const result = await useCase.execute('789');

      expect(result).toBe(true);
      expect(mockTagManager.removeTagFromMessage).toHaveBeenCalledWith(789, 'business');
      expect(mockTagManager.addTagToMessage).toHaveBeenCalledWith(789, 'personal');
    });

    it('should remove history item after successful undo', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '123',
        timestamp: 1709251200000,
        addedTags: [{ key: 'business', tag: 'Business' }],
        removedTags: [],
        previousTags: [],
      };
      mockStorage.tagHistory = [historyItem];

      await useCase.execute('123');

      // Verify history item was removed
      const remainingHistory = mockStorage.tagHistory as TagHistoryItem[];
      expect(remainingHistory).toHaveLength(0);
    });

    it('should handle undo with empty added and removed arrays', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '123',
        timestamp: 1709251200000,
        addedTags: [],
        removedTags: [],
        previousTags: [{ key: 'existing', tag: 'Existing' }],
      };
      mockStorage.tagHistory = [historyItem];

      const result = await useCase.execute('123');

      expect(result).toBe(true);
      expect(mockTagManager.removeTagFromMessage).not.toHaveBeenCalled();
      expect(mockTagManager.addTagToMessage).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // execute() Tests - Error Handling
  // ==========================================================================

  describe('execute - error handling', () => {
    it('should return false for invalid message ID', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: 'invalid-id',
        timestamp: 1709251200000,
        addedTags: [{ key: 'business', tag: 'Business' }],
        removedTags: [],
        previousTags: [],
      };
      mockStorage.tagHistory = [historyItem];

      const result = await useCase.execute('invalid-id');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to undo tag changes',
        expect.objectContaining({
          messageId: 'invalid-id',
          error: 'Invalid message ID: invalid-id',
        })
      );
    });

    it('should return false when tag manager throws error', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '123',
        timestamp: 1709251200000,
        addedTags: [{ key: 'business', tag: 'Business' }],
        removedTags: [],
        previousTags: [],
      };
      mockStorage.tagHistory = [historyItem];

      vi.mocked(mockTagManager.removeTagFromMessage).mockRejectedValue(
        new Error('Tag manager error')
      );

      const result = await useCase.execute('123');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to undo tag changes',
        expect.objectContaining({
          messageId: '123',
          error: 'Tag manager error',
        })
      );
    });

    it('should handle non-Error thrown values', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '123',
        timestamp: 1709251200000,
        addedTags: [{ key: 'business', tag: 'Business' }],
        removedTags: [],
        previousTags: [],
      };
      mockStorage.tagHistory = [historyItem];

      vi.mocked(mockTagManager.removeTagFromMessage).mockRejectedValue('String error');

      const result = await useCase.execute('123');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to undo tag changes',
        expect.objectContaining({
          error: 'String error',
        })
      );
    });
  });

  // ==========================================================================
  // Logging Tests
  // ==========================================================================

  describe('logging', () => {
    it('should log when starting undo operation', async () => {
      await useCase.execute('123');

      expect(mockLogger.info).toHaveBeenCalledWith('Undoing tag changes', { messageId: '123' });
    });

    it('should log successful undo with details', async () => {
      const historyItem: TagHistoryItem = {
        id: 'history-1',
        messageId: '123',
        timestamp: 1709251200000,
        addedTags: [{ key: 'business', tag: 'Business' }],
        removedTags: [{ key: 'personal', tag: 'Personal' }],
        previousTags: [],
      };
      mockStorage.tagHistory = [historyItem];

      await useCase.execute('123');

      expect(mockLogger.info).toHaveBeenCalledWith('Tag changes undone successfully', {
        messageId: '123',
        historyId: 'history-1',
        addedTagsReversed: 1,
        removedTagsRestored: 1,
      });
    });
  });
});
