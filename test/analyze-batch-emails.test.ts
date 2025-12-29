import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';

describe('AnalyzeBatchEmails - Logging Tests', () => {
  let logger: ILogger;
  let queue: IQueue;
  let configRepository: IConfigRepository;
  let analyzeEmail: AnalyzeEmail;
  let analyzeBatch: AnalyzeBatchEmails;

  const mockProviderSettings: IProviderSettings = {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-key',
  };

  const mockQueueStats = {
    size: 5,
    waiting: 2,
    processing: 3,
    avgWaitTime: 100,
  };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key) => key),
    };

    queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi
        .fn()
        .mockResolvedValueOnce({
          messageId: '123',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '456',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValue(null),
      clear: vi.fn(),
      getStats: vi.fn().mockResolvedValue(mockQueueStats),
      peek: vi.fn(),
      size: vi.fn(),
      isEmpty: vi.fn(),
    };

    configRepository = {
      getProviderSettings: vi.fn(),
      setProviderSettings: vi.fn(),
      getAllProviderSettings: vi.fn(),
      getAppConfig: vi.fn().mockResolvedValue({
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: true,
        modelConcurrencyLimits: [],
      }),
      getCustomTags: vi.fn().mockResolvedValue([]),
      setCustomTags: vi.fn(),
      setAppConfig: vi.fn(),
      clearAll: vi.fn(),
    };

    analyzeEmail = {
      execute: vi.fn().mockResolvedValue({
        tags: ['work'],
        confidence: 0.9,
        reasoning: 'Test reasoning',
      }),
    } as unknown as AnalyzeEmail;

    analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository);
  });

  describe('Batch email analysis started logging', () => {
    it('should log "Starting batch email analysis" with correct context', async () => {
      await analyzeBatch.execute(['123', '456'], {
        providerSettings: mockProviderSettings,
        priority: 1,
        concurrency: 2,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Starting batch email analysis',
        expect.objectContaining({
          count: 2,
          priority: 1,
        })
      );
    });

    it('should include message count in log context', async () => {
      const messageIds = ['1', '2', '3', '4', '5'];
      await analyzeBatch.execute(messageIds, {
        providerSettings: mockProviderSettings,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Starting batch email analysis',
        expect.objectContaining({
          count: 5,
          priority: 1,
        })
      );
    });

    it('should include priority in log context', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
        priority: 5,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Starting batch email analysis',
        expect.objectContaining({
          count: 1,
          priority: 5,
        })
      );
    });

    it('should use default priority if not specified', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Starting batch email analysis',
        expect.objectContaining({
          count: 1,
          priority: 1,
        })
      );
    });

    it('should log "Starting batch email analysis" as first log', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
      });

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(
        1,
        'Starting batch email analysis',
        expect.any(Object)
      );
    });
  });

  describe('Complete logging flow for batch analysis', () => {
    it('should log starting message with concurrency in correct order', async () => {
      await analyzeBatch.execute(['123', '456'], {
        providerSettings: mockProviderSettings,
        concurrency: 2,
      });

      const infoCall = logger.info as ReturnType<typeof vi.fn>;

      expect(infoCall).toHaveBeenNthCalledWith(
        1,
        'Starting batch email analysis',
        expect.objectContaining({
          count: 2,
          priority: 1,
          concurrency: 2,
        })
      );
    });

    it('should log all context fields correctly', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
        priority: 3,
        concurrency: 4,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Starting batch email analysis',
        expect.objectContaining({
          count: 1,
          priority: 3,
          concurrency: 4,
        })
      );
    });
  });
});
