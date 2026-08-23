/**
 * Unit tests for MessageHandler.
 *
 * Covers DW7a (pagination), DW7c (live batch progress) and DW9 (honest handlers).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '@/interfaces/background/MessageHandler';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { ICache, ICacheStats } from '@/infrastructure/interfaces/ICache';
import type { IQueue, IQueueStats } from '@/infrastructure/interfaces/IQueue';
import type { ITagManager } from '@/domain/interfaces';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AppConfigService } from '@/infrastructure/config/AppConfig';

// ============================================================================
// Fixtures
// ============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn(),
  };
}

function createHandler(overrides: { analyzeBatch?: Partial<AnalyzeBatchEmails>; queue?: Partial<IQueue> } = {}) {
  const logger = createMockLogger();

  const cache: ICache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    cleanupExpired: vi.fn().mockResolvedValue(0),
    getStats: vi.fn().mockResolvedValue({ totalEntries: 7, hitRate: 42 } as ICacheStats),
  };

  const queueStats: IQueueStats = { size: 3, waiting: 2, processing: 1, avgWaitTime: 10 };
  const queue: IQueue = {
    enqueue: vi.fn().mockResolvedValue(undefined),
    dequeue: vi.fn().mockResolvedValue(null),
    peek: vi.fn().mockResolvedValue(null),
    size: vi.fn().mockResolvedValue(3),
    isEmpty: vi.fn().mockResolvedValue(false),
    clear: vi.fn().mockResolvedValue(2),
    getStats: vi.fn().mockResolvedValue(queueStats),
    ...overrides.queue,
  };

  const tagManager = {
    getAllTags: vi.fn().mockResolvedValue([]),
    createTag: vi.fn().mockResolvedValue({ key: 'x', tag: 'X', color: '#000000' }),
    getTag: vi.fn().mockResolvedValue(undefined),
    getTagById: vi.fn().mockResolvedValue(undefined),
    addTagToMessage: vi.fn().mockResolvedValue(undefined),
    removeTagFromMessage: vi.fn().mockResolvedValue(undefined),
    addTagToMessages: vi.fn().mockResolvedValue(undefined),
  } as unknown as ITagManager;

  const analyzeBatch = {
    execute: vi.fn().mockResolvedValue({ total: 0, successCount: 0, failureCount: 0, results: [], cancelled: false }),
    getProgress: vi.fn().mockResolvedValue({
      total: 0, processed: 0, failed: 0, percentage: 0,
      isRunning: false, isCancelled: false, processedMessageIds: [], failedMessageIds: [],
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockResolvedValue(false),
    ...overrides.analyzeBatch,
  } as unknown as AnalyzeBatchEmails;

  const debugLogBuffer = {
    getEntries: vi.fn().mockReturnValue([]),
    getDroppedCount: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    add: vi.fn(),
  };

  const handler = new MessageHandler(
    {} as AnalyzeEmail,
    analyzeBatch,
    {} as never,
    logger,
    {} as AppConfigService,
    queue,
    cache,
    tagManager,
    debugLogBuffer as never
  );

  return { handler, logger, cache, queue, tagManager, analyzeBatch, debugLogBuffer };
}

/** Replaces the global messenger's storage mock while keeping it an object. */
function setMessengerMessages(messages: unknown): void {
  const globals = globalThis as unknown as { messenger: Record<string, unknown> };
  globals.messenger = { ...globals.messenger, messages };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('MessageHandler', () => {
  let storage: Map<string, unknown>;

  beforeEach(() => {
    storage = new Map();
    (globalThis as unknown as Record<string, unknown>).messenger = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
            const result: Record<string, unknown> = {};
            if (typeof keys === 'string') {
              if (storage.has(keys)) result[keys] = storage.get(keys);
            } else if (Array.isArray(keys)) {
              for (const key of keys) if (storage.has(key)) result[key] = storage.get(key);
            } else if (!keys) {
              for (const [key, value] of storage) result[key] = value;
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) storage.set(key, value);
          }),
        },
      },
    };
  });

  describe('DW7a: folder listing pagination', () => {
    it('collects message ids across ALL pages via continueList', async () => {
      const list = vi.fn().mockResolvedValue({
        id: 'p1',
        messages: [{ id: 1 }, { id: 2 }],
      });
      const continueList = vi.fn().mockResolvedValue({ id: null, messages: [{ id: 3 }] });
      setMessengerMessages({ list, continueList });

      const { handler } = createHandler();
      const result = await (handler as unknown as {
        getMessagesToAnalyze: (f?: string) => Promise<string[]>;
      }).getMessagesToAnalyze('folder1');

      expect(list).toHaveBeenCalledWith('folder1');
      expect(continueList).toHaveBeenCalledWith('p1');
      expect(result).toEqual(['1', '2', '3']);
    });
  });

  describe('DW7c: live batch progress', () => {
    it('reflects live processed counts from AnalyzeBatchEmails.getProgress()', async () => {
      const { handler } = createHandler({
        analyzeBatch: {
          getProgress: vi.fn().mockResolvedValue({
            total: 10, processed: 4, failed: 1, percentage: 50,
            isRunning: true, isCancelled: false, processedMessageIds: [], failedMessageIds: [],
          }),
        },
      });

      const progress = await (handler as unknown as {
        handleGetBatchProgress: () => Promise<Record<string, unknown>>;
      }).handleGetBatchProgress();

      expect(progress).toMatchObject({ status: 'running', total: 10, processed: 4, failed: 1 });
    });

    it('reports completed when the batch finished', async () => {
      const { handler } = createHandler({
        analyzeBatch: {
          getProgress: vi.fn().mockResolvedValue({
            total: 10, processed: 9, failed: 1, percentage: 100,
            isRunning: false, isCancelled: false, processedMessageIds: [], failedMessageIds: [],
          }),
        },
      });

      const progress = await (handler as unknown as {
        handleGetBatchProgress: () => Promise<Record<string, unknown>>;
      }).handleGetBatchProgress();

      expect(progress).toMatchObject({ status: 'completed', total: 10, processed: 9 });
    });
  });

  describe('DW-D5: debug log + queue stats handlers', () => {
    it('getDebugLogs returns contract shape (newest-first entries + droppedCount)', async () => {
      const { handler, debugLogBuffer } = createHandler();
      (debugLogBuffer.getEntries as ReturnType<typeof vi.fn>).mockReturnValue([
        { ts: 2, level: 'error', msg: 'newer' },
        { ts: 1, level: 'info', msg: 'older' },
      ]);
      (debugLogBuffer.getDroppedCount as ReturnType<typeof vi.fn>).mockReturnValue(7);

      const result = await (handler as unknown as {
        handleGetDebugLogs: () => { success: boolean; entries: unknown[]; droppedCount: number };
      }).handleGetDebugLogs();

      expect(result).toEqual({
        success: true,
        entries: [
          { ts: 2, level: 'error', msg: 'newer' },
          { ts: 1, level: 'info', msg: 'older' },
        ],
        droppedCount: 7,
      });
    });

    it('clearDebugLogs clears the buffer and returns success', async () => {
      const { handler, debugLogBuffer } = createHandler();

      const result = await (handler as unknown as {
        handleClearDebugLogs: () => { success: boolean };
      }).handleClearDebugLogs();

      expect(debugLogBuffer.clear).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true });
    });

    it('getQueueStats returns live queue stats + batch progress verbatim', async () => {
      const batchProgress = {
        total: 10,
        processed: 4,
        failed: 1,
        percentage: 50,
        isRunning: true,
        isCancelled: false,
        processedMessageIds: ['1', '2', '3', '4'],
        failedMessageIds: ['5'],
      };
      const { handler, queue } = createHandler({
        analyzeBatch: { getProgress: vi.fn().mockResolvedValue(batchProgress) },
      });

      const result = await (handler as unknown as {
        handleGetQueueStats: () => Promise<{
          success: boolean;
          queue: { size: number; waiting: number; processing: number; avgWaitTime: number };
          batch: unknown;
        }>;
      }).handleGetQueueStats();

      expect(queue.getStats).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.queue).toEqual({ size: 3, waiting: 2, processing: 1, avgWaitTime: 10 });
      expect(result.batch).toEqual(batchProgress);
    });
  });

  describe('DW9: honest handlers', () => {
    it('clearQueue clears the real queue and reports actual stats', async () => {
      const { handler, queue } = createHandler();

      const result = await (handler as unknown as {
        handleClearQueue: (m: { cancelRunning?: boolean }) => Promise<Record<string, unknown>>;
      }).handleClearQueue({ cancelRunning: true });

      expect(queue.clear).toHaveBeenCalledWith(true);
      expect(queue.getStats).toHaveBeenCalled();
      expect(result).toMatchObject({
        success: true,
        clearedTasks: 2,
        providers: { queue: { queueLength: 2, isProcessing: true } },
      });
    });

    it('clearCache clears the real cache', async () => {
      const { handler, cache } = createHandler();

      const result = await (handler as unknown as {
        handleClearCache: () => Promise<{ success: boolean; message: string }>;
      }).handleClearCache();

      expect(cache.clear).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('clearCache reports failure when the cache throws', async () => {
      const { handler, cache } = createHandler();
      (cache.clear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));

      const result = await (handler as unknown as {
        handleClearCache: () => Promise<{ success: boolean; message: string }>;
      }).handleClearCache();

      expect(result.success).toBe(false);
      expect(result.message).toContain('boom');
    });

    it('getCacheStats returns real stats from ICache', async () => {
      const { handler } = createHandler();

      const result = await (handler as unknown as {
        handleGetCacheStats: () => Promise<{ success: boolean; totalEntries?: number; hitRate?: number }>;
      }).handleGetCacheStats();

      expect(result).toMatchObject({ success: true, totalEntries: 7, hitRate: 42 });
    });

    it('getAnalysisResults returns success:false (no results store exists)', async () => {
      const { handler } = createHandler();

      const result = await (handler as unknown as {
        handleGetAnalysisResults: () => Promise<{ success: boolean; error?: string }>;
      }).handleGetAnalysisResults();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('applyTagManually requires a messageId', async () => {
      const { handler, tagManager } = createHandler();

      const result = await (handler as unknown as {
        handleApplyTagManually: (m: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      }).handleApplyTagManually({ action: 'applyTagManually', tagKey: 'is_bill', confidence: 0.4 });

      expect(result.success).toBe(false);
      expect(tagManager.addTagToMessage).not.toHaveBeenCalled();
    });

    it('applyTagManually applies the tag and removes the low-confidence flag', async () => {
      const { handler, tagManager } = createHandler();
      storage.set('lowConfidence_abc', {
        cacheKey: 'abc',
        flags: [{ tagKey: 'is_bill', confidence: 0.4, threshold: 0.7 }],
        timestamp: 1,
      });

      const result = await (handler as unknown as {
        handleApplyTagManually: (m: Record<string, unknown>) => Promise<{ success: boolean }>;
      }).handleApplyTagManually({
        action: 'applyTagManually',
        tagKey: 'is_bill',
        confidence: 0.4,
        messageId: '123',
      });

      expect(tagManager.addTagToMessage).toHaveBeenCalledWith(123, 'is_bill');
      expect(result.success).toBe(true);
      expect((storage.get('lowConfidence_abc') as { flags: unknown[] }).flags).toEqual([]);
    });

    it('dismissTag removes the stored suggestion', async () => {
      const { handler } = createHandler();
      storage.set('lowConfidence_abc', {
        cacheKey: 'abc',
        flags: [{ tagKey: 'is_bill', confidence: 0.4, threshold: 0.7 }],
        timestamp: 1,
      });

      const result = await (handler as unknown as {
        handleDismissTag: (m: Record<string, unknown>) => Promise<{ success: boolean }>;
      }).handleDismissTag({ action: 'dismissTag', tagKey: 'is_bill' });

      expect(result.success).toBe(true);
      expect((storage.get('lowConfidence_abc') as { flags: unknown[] }).flags).toEqual([]);
    });

    it('dismissTag fails honestly when no stored suggestion exists', async () => {
      const { handler } = createHandler();

      const result = await (handler as unknown as {
        handleDismissTag: (m: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      }).handleDismissTag({ action: 'dismissTag', tagKey: 'is_bill' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
