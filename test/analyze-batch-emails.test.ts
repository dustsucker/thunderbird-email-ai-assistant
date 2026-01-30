import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';

describe('AnalyzeBatchEmails - Logging Tests', () => {
  let logger: ILogger;
  let queue: IQueue;
  let configRepository: IConfigRepository;
  let analyzeEmail: AnalyzeEmail;
  let emailAnalysisTracker: EmailAnalysisTracker;
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

    emailAnalysisTracker = {
      wasAnalyzed: vi.fn().mockResolvedValue(false),
      markAnalyzed: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailAnalysisTracker;

    analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);
  });

  describe('Batch email analysis started logging', () => {
    it('should log "🚀 Starting batch email analysis" with correct context', async () => {
      await analyzeBatch.execute(['123', '456'], {
        providerSettings: mockProviderSettings,
        priority: 1,
        concurrency: 2,
      });

      expect(logger.info).toHaveBeenCalledWith(
        '🚀 Starting batch email analysis',
        expect.objectContaining({
          messageCount: 2,
          provider: 'openai',
        })
      );
    });

    it('should include message count in log context', async () => {
      const messageIds = ['1', '2', '3', '4', '5'];
      await analyzeBatch.execute(messageIds, {
        providerSettings: mockProviderSettings,
      });

      expect(logger.info).toHaveBeenCalledWith(
        '🚀 Starting batch email analysis',
        expect.objectContaining({
          messageCount: 5,
          provider: 'openai',
        })
      );
    });

    it('should include priority in config context', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
        priority: 5,
      });

      expect(logger.info).toHaveBeenCalledWith(
        '🚀 Starting batch email analysis',
        expect.objectContaining({
          messageCount: 1,
          config: expect.objectContaining({
            priority: 5,
          }),
        })
      );
    });

    it('should use default priority if not specified', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
      });

      // Check that the config is logged with undefined priority (as passed)
      expect(logger.info).toHaveBeenCalledWith(
        '🚀 Starting batch email analysis',
        expect.objectContaining({
          messageCount: 1,
          config: expect.objectContaining({
            priority: undefined,
          }),
        })
      );

      // Check that the actual processing uses the default priority
      expect(logger.info).toHaveBeenCalledWith(
        '✅ Starting batch processing',
        expect.objectContaining({
          priority: 1,
        })
      );
    });

    it('should log "🚀 Starting batch email analysis" as first log', async () => {
      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
      });

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(
        1,
        '🚀 Starting batch email analysis',
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

      // Check the "Starting batch processing" log (2nd call)
      expect(infoCall).toHaveBeenNthCalledWith(
        2,
        '✅ Starting batch processing',
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
        '✅ Starting batch processing',
        expect.objectContaining({
          count: 1,
          priority: 3,
          concurrency: 4,
        })
      );
    });
  });

  describe('Header check in batch processing', () => {
    beforeEach(() => {
      // Clear all mock calls from previous tests
      vi.clearAllMocks();
    });

    it('should check if email was analyzed before processing', async () => {
      // Set up queue for 1 message
      queue.dequeue = vi.fn().mockResolvedValueOnce({
        messageId: '123',
        providerSettings: mockProviderSettings,
      }).mockResolvedValue(null);

      analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);

      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
      });

      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenCalledWith(123);
    });

    it('should skip emails that have already been analyzed', async () => {
      // Set up queue for 2 messages
      queue.dequeue = vi.fn()
        .mockResolvedValueOnce({
          messageId: '123',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '456',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValue(null);

      analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);

      // Mock that message 123 was already analyzed
      emailAnalysisTracker.wasAnalyzed = vi
        .fn()
        .mockResolvedValueOnce(true) // Message 123 already analyzed
        .mockResolvedValueOnce(false); // Message 456 not analyzed

      const result = await analyzeBatch.execute(['123', '456'], {
        providerSettings: mockProviderSettings,
      });

      // Should have checked both emails
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenCalledWith(123);
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenCalledWith(456);

      // Should only analyze the non-analyzed email (456)
      expect(analyzeEmail.execute).toHaveBeenCalledTimes(1);
      expect(analyzeEmail.execute).toHaveBeenCalledWith('456', mockProviderSettings);

      // Result should show 1 success, 0 failures
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.total).toBe(2);
    });

    it('should log "Skipping already-analyzed email" when header is present', async () => {
      // Set up queue for 1 message
      queue.dequeue = vi.fn().mockResolvedValueOnce({
        messageId: '123',
        providerSettings: mockProviderSettings,
      }).mockResolvedValue(null);

      analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);

      emailAnalysisTracker.wasAnalyzed = vi.fn().mockResolvedValueOnce(true);

      await analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
      });

      expect(logger.info).toHaveBeenCalledWith(
        '⏭️  Skipping already-analyzed email',
        { messageId: '123' }
      );
    });

    it('should process all emails when none have been analyzed', async () => {
      // Set up queue for 2 messages
      queue.dequeue = vi.fn()
        .mockResolvedValueOnce({
          messageId: '123',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '456',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValue(null);

      analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);

      emailAnalysisTracker.wasAnalyzed = vi.fn().mockResolvedValue(false);

      const result = await analyzeBatch.execute(['123', '456'], {
        providerSettings: mockProviderSettings,
      });

      // Should check both emails
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenCalledTimes(2);

      // Should analyze both emails
      expect(analyzeEmail.execute).toHaveBeenCalledTimes(2);
      expect(analyzeEmail.execute).toHaveBeenCalledWith('123', mockProviderSettings);
      expect(analyzeEmail.execute).toHaveBeenCalledWith('456', mockProviderSettings);

      // Result should show 2 successes
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });

    it('should handle mixed analyzed and non-analyzed emails in batch', async () => {
      // Set up queue for 3 messages
      queue.dequeue = vi.fn()
        .mockResolvedValueOnce({
          messageId: '123',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '456',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '789',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValue(null);

      analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);

      emailAnalysisTracker.wasAnalyzed = vi
        .fn()
        .mockResolvedValueOnce(false) // 123 - not analyzed
        .mockResolvedValueOnce(true) // 456 - already analyzed
        .mockResolvedValueOnce(false); // 789 - not analyzed

      const result = await analyzeBatch.execute(['123', '456', '789'], {
        providerSettings: mockProviderSettings,
      });

      // Should check all three emails
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenCalledTimes(3);
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenNthCalledWith(1, 123);
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenNthCalledWith(2, 456);
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenNthCalledWith(3, 789);

      // Should only analyze the non-analyzed emails (123 and 789)
      expect(analyzeEmail.execute).toHaveBeenCalledTimes(2);
      expect(analyzeEmail.execute).toHaveBeenCalledWith('123', mockProviderSettings);
      expect(analyzeEmail.execute).toHaveBeenCalledWith('789', mockProviderSettings);

      // Result should show 2 successes (skipped 456)
      expect(result.successCount).toBe(2);
      expect(result.total).toBe(3);
    });

    it('should skip all emails when all have been analyzed', async () => {
      // Set up queue for 3 messages
      queue.dequeue = vi.fn()
        .mockResolvedValueOnce({
          messageId: '123',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '456',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValueOnce({
          messageId: '789',
          providerSettings: mockProviderSettings,
        })
        .mockResolvedValue(null);

      analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, emailAnalysisTracker);

      emailAnalysisTracker.wasAnalyzed = vi.fn().mockResolvedValue(true);

      const result = await analyzeBatch.execute(['123', '456', '789'], {
        providerSettings: mockProviderSettings,
      });

      // Should check all three emails
      expect(emailAnalysisTracker.wasAnalyzed).toHaveBeenCalledTimes(3);

      // Should not analyze any emails
      expect(analyzeEmail.execute).not.toHaveBeenCalled();

      // Result should show 0 successes
      expect(result.successCount).toBe(0);
      expect(result.total).toBe(3);

      // Should log skip messages for all
      expect(logger.info).toHaveBeenCalledWith(
        '⏭️  Skipping already-analyzed email',
        { messageId: '123' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        '⏭️  Skipping already-analyzed email',
        { messageId: '456' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        '⏭️  Skipping already-analyzed email',
        { messageId: '789' }
      );
    });
  });
});
