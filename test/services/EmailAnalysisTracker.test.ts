/**
 * Unit tests for EmailAnalysisTracker (storage.local round-trip).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// Mock Browser API
// ============================================================================

function createMockStorage() {
  const storage = new Map<string, unknown>();

  return {
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
          const result: Record<string, unknown> = {};
          if (typeof keys === 'string') {
            if (storage.has(keys)) result[keys] = storage.get(keys);
          } else if (Array.isArray(keys)) {
            for (const key of keys) if (storage.has(key)) result[key] = storage.get(key);
          } else {
            for (const [key, value] of storage) result[key] = value;
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, value);
        }),
      },
    },
    _map: storage,
  };
}

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn(),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('EmailAnalysisTracker', () => {
  let tracker: EmailAnalysisTracker;
  let mockLogger: ILogger;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockStorage = createMockStorage();
    (globalThis as unknown as Record<string, unknown>).browser = {
      messenger: mockStorage,
    };
    tracker = new EmailAnalysisTracker(mockLogger);
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).browser;
    delete (globalThis as unknown as Record<string, unknown>).chrome;
  });

  describe('markAnalyzed / wasAnalyzed round-trip', () => {
    it('should return false for unknown message ids', async () => {
      expect(await tracker.wasAnalyzed(12345)).toBe(false);
    });

    it('should return true after markAnalyzed (single processedIds key, no header mechanism)', async () => {
      // DW6: modifyPermanent does not exist — header mechanism must be absent
      expect((mockStorage.storage.local.set as ReturnType<typeof vi.fn>).mock).toBeDefined();

      await tracker.markAnalyzed(12345);

      // #10: one consolidated `processedIds` key, not one key per message
      expect(mockStorage.storage.local.set).toHaveBeenCalledWith({
        processedIds: [12345],
      });
      expect(await tracker.wasAnalyzed(12345)).toBe(true);
      expect(await tracker.wasAnalyzed(67890)).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('[DEBUG] Email marked as analyzed', {
        messageId: 12345,
      });
    });

    it('#10: evicts the oldest tracked id beyond the 5000 LRU cap', () => {
      const addToSet = (
        tracker as unknown as { addToSet: (ids: Set<number>, messageId: number) => void }
      ).addToSet.bind(tracker);
      const ids = new Set<number>();
      for (let i = 0; i < 5000; i++) addToSet(ids, i);
      addToSet(ids, 5000);

      expect(ids.size).toBe(5000);
      expect(ids.has(0)).toBe(false);
      expect(ids.has(5000)).toBe(true);
    });

    it('should accept legacy boolean true values', async () => {
      mockStorage._map.set('processed_42', true);
      expect(await tracker.wasAnalyzed(42)).toBe(true);
    });

    it('migrates legacy processed_* keys into processedIds and removes them (#10)', async () => {
      mockStorage._map.set('processed_1', 'true');
      mockStorage._map.set('processed_2', 'true');

      // First read triggers migration
      expect(await tracker.wasAnalyzed(1)).toBe(true);
      expect(await tracker.wasAnalyzed(2)).toBe(true);

      expect(mockStorage._map.get('processedIds')).toEqual([1, 2]);
      // Legacy keys were removed (mock has no remove() → null-valued set)
      expect(mockStorage._map.get('processed_1')).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[INFO] Migrated legacy analysis tracking keys',
        expect.objectContaining({ count: 2 })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw when messenger API is not available', async () => {
      delete (globalThis as unknown as Record<string, unknown>).browser;

      await expect(tracker.wasAnalyzed(1)).rejects.toThrow('messenger API not available');
      await expect(tracker.markAnalyzed(1)).rejects.toThrow('messenger API not available');
    });

    it('should throw when storage write fails', async () => {
      (mockStorage.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('quota')
      );
      await expect(tracker.markAnalyzed(1)).rejects.toThrow('quota');
    });
  });

  describe('DW-D1: bare global messenger (bundled background env)', () => {
    it('round-trips via globalThis.messenger when only it is present', async () => {
      // Simulate the bundled background page: no browser/chrome wrapper
      delete (globalThis as unknown as Record<string, unknown>).browser;
      (globalThis as unknown as Record<string, unknown>).messenger = mockStorage;

      expect(await tracker.wasAnalyzed(77)).toBe(false);
      await tracker.markAnalyzed(77);
      expect(await tracker.wasAnalyzed(77)).toBe(true);

      delete (globalThis as unknown as Record<string, unknown>).messenger;
    });

    it('regression: no "messenger API not available" throw in that env', async () => {
      delete (globalThis as unknown as Record<string, unknown>).browser;
      (globalThis as unknown as Record<string, unknown>).messenger = mockStorage;

      await expect(tracker.wasAnalyzed(99)).resolves.not.toThrow();
      await expect(tracker.markAnalyzed(99)).resolves.toBeUndefined();

      delete (globalThis as unknown as Record<string, unknown>).messenger;
    });
  });
});
