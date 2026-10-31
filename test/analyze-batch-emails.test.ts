import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { container } from 'tsyringe';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import type { ILogger } from '@/domain/interfaces';
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
        '[INFO] Starting batch email analysis',
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
        '[INFO] Starting batch email analysis',
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
        '[INFO] Starting batch email analysis',
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
        '[INFO] Starting batch email analysis',
        expect.objectContaining({
          messageCount: 1,
          config: expect.objectContaining({
            priority: undefined,
          }),
        })
      );

      // Check that the actual processing uses the default priority
      expect(logger.info).toHaveBeenCalledWith(
        '[INFO] Starting batch processing',
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
        '[INFO] Starting batch email analysis',
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
        '[INFO] Starting batch processing',
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
        '[INFO] Starting batch processing',
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
      expect(analyzeEmail.execute).toHaveBeenCalledWith('456', mockProviderSettings, expect.objectContaining({ signal: expect.anything() }));

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
        '[INFO] Skipping already-analyzed email',
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
      expect(analyzeEmail.execute).toHaveBeenCalledWith('123', mockProviderSettings, expect.objectContaining({ signal: expect.anything() }));
      expect(analyzeEmail.execute).toHaveBeenCalledWith('456', mockProviderSettings, expect.objectContaining({ signal: expect.anything() }));

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
      expect(analyzeEmail.execute).toHaveBeenCalledWith('123', mockProviderSettings, expect.objectContaining({ signal: expect.anything() }));
      expect(analyzeEmail.execute).toHaveBeenCalledWith('789', mockProviderSettings, expect.objectContaining({ signal: expect.anything() }));

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
      expect(result.skippedCount).toBe(3);
      // Healthy re-run over analyzed mail must not be misreported as error (#29)
      expect(result.status).toBe('success');
      expect(result.unprocessedCount).toBe(0);

      // Should log skip messages for all
      expect(logger.info).toHaveBeenCalledWith(
        '[INFO] Skipping already-analyzed email',
        { messageId: '123' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[INFO] Skipping already-analyzed email',
        { messageId: '456' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[INFO] Skipping already-analyzed email',
        { messageId: '789' }
      );
    });
  });

  describe('#8/#24: cancellation and counts-only progress', () => {
    it('#8/#24: cancel() aborts in-flight work and counts cancellations separately', async () => {
      let capturedSignal: AbortSignal | undefined;
      (analyzeEmail.execute as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, _settings: unknown, config?: { signal?: AbortSignal }) => {
          capturedSignal = config?.signal;
          return new Promise((_resolve, reject) => {
            config?.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          });
        }
      );

      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '123', providerSettings: mockProviderSettings })
        .mockResolvedValue(null);

      const executePromise = analyzeBatch.execute(['123'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });

      await vi.waitFor(() => expect(capturedSignal).toBeDefined());
      await analyzeBatch.cancel();
      const result = await executePromise;

      expect(capturedSignal?.aborted).toBe(true);
      expect(result.cancelledCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.cancelled).toBe(true);
      expect(queue.clear).toHaveBeenCalledWith(false);
    });

    it('#arbiter-followup: cancel with unprocessed mails reports status partial (not success)', async () => {
      let capturedSignal: AbortSignal | undefined;
      (analyzeEmail.execute as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, _settings: unknown, config?: { signal?: AbortSignal }) => {
          capturedSignal = config?.signal;
          return new Promise((_resolve, reject) => {
            config?.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          });
        }
      );

      // Two mails requested, only one ever enters the queue — the second stays
      // unprocessed when the cancel stops the workers.
      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '123', providerSettings: mockProviderSettings })
        .mockResolvedValue(null);

      const executePromise = analyzeBatch.execute(['123', '456'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });

      await vi.waitFor(() => expect(capturedSignal).toBeDefined());
      await analyzeBatch.cancel();
      const result = await executePromise;

      expect(result.cancelled).toBe(true);
      expect(result.cancelledCount).toBe(1);
      expect(result.unprocessedCount).toBe(1);
      expect(result.status).toBe('partial');
    });

    it('#24: progress notifications carry only counts (no ID arrays)', async () => {
      container.reset();
      const listener = { onBatchProgress: vi.fn() };
      container.registerInstance('BatchProgressListener', listener);

      try {
        await analyzeBatch.execute(['123', '456'], {
          providerSettings: mockProviderSettings,
          concurrency: 1,
        });

        expect(listener.onBatchProgress).toHaveBeenCalled();
        const lastProgress = listener.onBatchProgress.mock.calls.at(-1)?.[0] as Record<
          string,
          unknown
        >;
        expect(lastProgress.total).toBe(2);
        expect(lastProgress).not.toHaveProperty('processedMessageIds');
        expect(lastProgress).not.toHaveProperty('failedMessageIds');
      } finally {
        container.reset();
      }
    });
  });

  describe('#29: partial failure accounting', () => {
    let listener: { onBatchProgress: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      container.clearInstances();
      listener = { onBatchProgress: vi.fn() };
      container.registerInstance('BatchProgressListener', listener);
    });

    afterEach(() => {
      container.clearInstances();
    });

    it('5 emails, provider fails at #2 and #4: no throw, 3 processed, 2 failed, onProgress per email', async () => {
      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '101', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '102', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '103', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '104', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '105', providerSettings: mockProviderSettings })
        .mockResolvedValue(null);

      (analyzeEmail.execute as ReturnType<typeof vi.fn>).mockImplementation(
        (messageId: string) =>
          messageId === '102' || messageId === '104'
            ? Promise.reject(new Error(`boom ${messageId}`))
            : Promise.resolve({ tags: ['work'], confidence: 0.9 })
      );

      const result = await analyzeBatch.execute(['101', '102', '103', '104', '105'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });

      expect(result.total).toBe(5);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(2);
      expect(result.failedMessageIds).toEqual(['102', '104']);
      expect(result.unprocessedCount).toBe(0);
      expect(result.status).toBe('partial');

      // onProgress fires once per email (5×) plus the init and final notification
      const percentages = listener.onBatchProgress.mock.calls.map(
        (call) => (call[0] as { percentage: number }).percentage
      );
      expect(percentages).toEqual([0, 20, 40, 60, 80, 100, 100]);

      // Failures are logged via ILogger...
      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Failed to analyze email',
        expect.objectContaining({ messageId: '102', error: 'boom 102' })
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Failed to analyze email',
        expect.objectContaining({ messageId: '104', error: 'boom 104' })
      );
      // ...and no API key leaks into any log line
      const logged = JSON.stringify([
        (logger.debug as ReturnType<typeof vi.fn>).mock.calls,
        (logger.info as ReturnType<typeof vi.fn>).mock.calls,
        (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
        (logger.error as ReturnType<typeof vi.fn>).mock.calls,
      ]);
      expect(logged).not.toContain('test-key');
    });

    it('already-analyzed subset: skipped counts as complete → success, no unprocessed alarm', async () => {
      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '501', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '502', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '503', providerSettings: mockProviderSettings })
        .mockResolvedValue(null);
      emailAnalysisTracker.wasAnalyzed = vi
        .fn()
        .mockResolvedValueOnce(true) // 501 → skipped
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const result = await analyzeBatch.execute(['501', '502', '503'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });

      expect(result.skippedCount).toBe(1);
      expect(result.successCount).toBe(2);
      expect(result.total).toBe(3);
      expect(result.unprocessedCount).toBe(0);
      expect(result.status).toBe('success');
      expect(result.status).not.toBe('error');
    });

    it('continueOnError: false → batch throws on queue defect', async () => {
      queue.dequeue = vi.fn().mockRejectedValue(new Error('queue broken'));

      await expect(
        analyzeBatch.execute(['201'], {
          providerSettings: mockProviderSettings,
          concurrency: 1,
          continueOnError: false,
        })
      ).rejects.toThrow('Batch analysis failed: queue broken');

      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Queue dequeue failed',
        expect.objectContaining({ error: 'queue broken' })
      );
    });

    it('queue defect with default continueOnError → status "error", no success', async () => {
      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '301', providerSettings: mockProviderSettings })
        .mockRejectedValue(new Error('queue broken'));

      const result = await analyzeBatch.execute(['301', '302', '303'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });

      expect(result.total).toBe(3);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.unprocessedCount).toBe(2);
      expect(result.status).toBe('error');
      expect(result.status).not.toBe('success');
      // The queue defect is surfaced in the log
      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Queue dequeue failed',
        expect.objectContaining({ error: 'queue broken' })
      );
    });

    it('queue.complete() defect: continues by default, throws with continueOnError: false', async () => {
      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '401', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '402', providerSettings: mockProviderSettings })
        .mockResolvedValue(null);
      queue.complete = vi.fn().mockRejectedValue(new Error('complete broken'));

      // Default: item outcomes stay counted, worker keeps draining
      const result = await analyzeBatch.execute(['401', '402'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });
      expect(result.successCount).toBe(2);
      expect(result.status).toBe('success');
      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Queue complete failed',
        expect.objectContaining({ messageId: '401', error: 'complete broken' })
      );

      // continueOnError: false → batch throws instead of reporting success
      analyzeBatch = new AnalyzeBatchEmails(
        analyzeEmail,
        queue,
        logger,
        configRepository,
        emailAnalysisTracker
      );
      queue.dequeue = vi
        .fn()
        .mockResolvedValueOnce({ messageId: '401', providerSettings: mockProviderSettings })
        .mockResolvedValueOnce({ messageId: '402', providerSettings: mockProviderSettings })
        .mockResolvedValue(null);
      await expect(
        analyzeBatch.execute(['401', '402'], {
          providerSettings: mockProviderSettings,
          concurrency: 1,
          continueOnError: false,
        })
      ).rejects.toThrow('Batch analysis failed: complete broken');
    });
  });

  // ==========================================================================
  // Queue-panel contract: status + lastRun persistence (Debug-Tab)
  // ==========================================================================

  describe('queue-panel contract: status + lastRun', () => {
    function makeQueue(items: string[]): IQueue {
      return {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi
          .fn()
          .mockImplementation(() =>
            items.length > 0
              ? Promise.resolve({ messageId: items.shift()!, providerSettings: mockProviderSettings })
              : Promise.resolve(null)
          ),
        clear: vi.fn().mockResolvedValue(0),
        getStats: vi.fn().mockResolvedValue(mockQueueStats),
        peek: vi.fn(),
        size: vi.fn(),
        isEmpty: vi.fn(),
      };
    }

    it("reports status 'running' with live counters while the batch is in flight", async () => {
      let releaseAnalysis!: (value: unknown) => void;
      const gate = new Promise((resolve) => (releaseAnalysis = resolve));
      const slowAnalyzeEmail = {
        execute: vi.fn().mockReturnValue(gate),
      } as unknown as AnalyzeEmail;
      const batch = new AnalyzeBatchEmails(
        slowAnalyzeEmail,
        makeQueue(['1', '2']),
        logger,
        configRepository,
        emailAnalysisTracker
      );

      const execution = batch.execute(['1', '2'], {
        providerSettings: mockProviderSettings,
        concurrency: 1,
      });

      // Let execute() initialize state and reach the gated analysis
      let inFlight = await batch.getProgress();
      for (let i = 0; i < 50 && inFlight.status !== 'running'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight = await batch.getProgress();
      }

      // First item is stuck in the (gated) analysis: running, live counts at 0
      expect(inFlight.status).toBe('running');
      expect(inFlight.isRunning).toBe(true);
      expect(inFlight.total).toBe(2);
      expect(inFlight.processed).toBe(0);

      releaseAnalysis({ tags: ['work'], confidence: 0.9 });
      await execution;

      // After completion: idle, counters served from lastRun (not zeroed)
      const finished = await batch.getProgress();
      expect(finished.status).toBe('idle');
      expect(finished.isRunning).toBe(false);
      expect(finished.total).toBe(2);
      expect(finished.processed).toBe(2);
      expect(finished.failed).toBe(0);
      expect(finished.percentage).toBe(100);
      expect(typeof finished.lastRunCompletedAt).toBe('number');
    });

    it('keeps failed counts after resetState (lastRun survives the batch end)', async () => {
      const failingAnalyzeEmail = {
        execute: vi.fn().mockRejectedValue(new Error('provider down')),
      } as unknown as AnalyzeEmail;
      const batch = new AnalyzeBatchEmails(
        failingAnalyzeEmail,
        makeQueue(['1']),
        logger,
        configRepository,
        emailAnalysisTracker
      );

      await batch.execute(['1'], { providerSettings: mockProviderSettings, concurrency: 1 });

      const progress = await batch.getProgress();
      expect(progress.status).toBe('idle');
      expect(progress.total).toBe(1);
      expect(progress.failed).toBe(1);
      expect(progress.processed).toBe(0);
      expect(progress.lastRunCompletedAt).toBeDefined();
    });

    it('sends isRunning:false in the final progress event when mails were skipped (F1 badge clear)', async () => {
      const progressEvents: unknown[] = [];
      const progressListener = { onBatchProgress: vi.fn((p: unknown) => progressEvents.push(p)) };
      container.register('BatchProgressListener', { useValue: progressListener });

      // '1' already analyzed → skipped (counts neither processed nor failed);
      // '2' analyzed → processed. remaining = 2 - 1 - 0 = 1 > 0, so only
      // isRunning:false lets the toolbar badge clear.
      (emailAnalysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockImplementation(
        (id: number) => Promise.resolve(id === 1)
      );
      const batch = new AnalyzeBatchEmails(
        analyzeEmail,
        makeQueue(['1', '2']),
        logger,
        configRepository,
        emailAnalysisTracker
      );

      try {
        await batch.execute(['1', '2'], {
          providerSettings: mockProviderSettings,
          concurrency: 1,
        });
      } finally {
        container.clearInstances();
      }

      expect(progressEvents.length).toBeGreaterThan(0);
      const finalEvent = progressEvents[progressEvents.length - 1] as Record<string, unknown>;
      expect(finalEvent).toMatchObject({ isRunning: false, total: 2, processed: 1 });
    });
  });
});
