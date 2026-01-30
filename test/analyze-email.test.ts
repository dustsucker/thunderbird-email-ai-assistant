import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import type { IMailReader, IEmailMessage } from '@/infrastructure/interfaces/IMailReader';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { IProvider, IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';
import { EventBus } from '@/domain/events/EventBus';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';

describe('AnalyzeEmail - Logging Tests', () => {
  let logger: ILogger;
  let queue: IQueue;
  let mailReader: IMailReader;
  let tagManager: ITagManager;
  let providerFactory: ProviderFactory;
  let cache: ICache;
  let contentExtractor: EmailContentExtractor;
  let eventBus: EventBus;
  let configRepository: IConfigRepository;
  let analysisTracker: EmailAnalysisTracker;
  let analyzeEmail: AnalyzeEmail;

  const mockEmail: IEmailMessage = {
    id: 123,
    subject: 'Test Subject',
    from: 'test@example.com',
    to: ['recipient@example.com'],
    body: 'Test body',
    headers: {},
    attachments: [],
  };

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
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      clear: vi.fn(),
      getStats: vi.fn().mockResolvedValue(mockQueueStats),
      peek: vi.fn(),
      size: vi.fn(),
      isEmpty: vi.fn(),
    };

    mailReader = {
      getFullMessage: vi.fn().mockResolvedValue(mockEmail),
      getMessageHeaders: vi.fn(),
      getRawMessage: vi.fn(),
      parseMessageParts: vi.fn(),
      getPlainTextBody: vi.fn(),
      getHTMLTextBody: vi.fn(),
      getAttachments: vi.fn(),
      getAttachmentContent: vi.fn(),
      getMessages: vi.fn(),
      queryMessages: vi.fn(),
      parseEMLFile: vi.fn(),
    };

    tagManager = {
      getAllTags: vi.fn(),
      createTag: vi.fn(),
      getCustomTags: vi.fn(),
      getTag: vi.fn(),
      getTagById: vi.fn(),
      updateTag: vi.fn(),
      deleteTag: vi.fn(),
      tagExists: vi.fn(),
      ensureTagExists: vi.fn(),
      setTagsOnMessage: vi.fn(),
      addTagToMessage: vi.fn(),
      removeTagFromMessage: vi.fn(),
      clearTagsFromMessage: vi.fn(),
      addTagToMessages: vi.fn(),
      setTagsOnMessages: vi.fn(),
    };

    const mockProvider: IProvider = {
      providerId: 'openai',
      validateSettings: vi.fn().mockResolvedValue(true),
      analyze: vi.fn().mockResolvedValue({
        tags: ['work'],
        confidence: 0.9,
        reasoning: 'Test reasoning',
      }),
    };

    providerFactory = {
      getProvider: vi.fn().mockReturnValue(mockProvider),
      registerProvider: vi.fn(),
    } as unknown as ProviderFactory;

    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      clear: vi.fn(),
      getStats: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      cleanupExpired: vi.fn(),
    };

    contentExtractor = new EmailContentExtractor(logger);

    eventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as EventBus;

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

    queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      clear: vi.fn(),
      size: vi.fn().mockResolvedValue(0),
      isEmpty: vi.fn().mockResolvedValue(true),
      peek: vi.fn(),
      getStats: vi.fn().mockResolvedValue({
        size: 0,
        waiting: 0,
        processing: 0,
        avgWaitTime: 0,
      }),
    };

    analysisTracker = {
      wasAnalyzed: vi.fn().mockResolvedValue(false),
      markAnalyzed: vi.fn().mockResolvedValue(undefined),
      clearAnalysis: vi.fn().mockResolvedValue(undefined),
      getAnalyzedCount: vi.fn().mockResolvedValue(0),
    } as unknown as EmailAnalysisTracker;

    analyzeEmail = new AnalyzeEmail(
      mailReader,
      tagManager,
      providerFactory,
      cache,
      logger,
      contentExtractor,
      eventBus,
      configRepository,
      queue,
      analysisTracker
    );
  });

  describe('Email analysis started logging', () => {
    it('should log "Starting email analysis" with correct context', async () => {
      await analyzeEmail.execute('123', mockProviderSettings);

      expect(logger.info).toHaveBeenCalledWith('🚀 Starting email analysis', {
        messageId: '123',
        providerId: mockProviderSettings.provider,
        config: { forceReanalyze: false, applyTags: true },
      });
    });

    it('should include providerId from provider settings in log context', async () => {
      const settingsWithId: IProviderSettings = {
        provider: 'custom-provider-id',
        model: 'gpt-4',
        apiKey: 'test-key',
      };

      await analyzeEmail.execute('123', settingsWithId);

      expect(logger.info).toHaveBeenCalledWith('🚀 Starting email analysis', {
        messageId: '123',
        providerId: 'custom-provider-id',
        config: { forceReanalyze: false, applyTags: true },
      });
    });

    it('should log start message as first info call', async () => {
      await analyzeEmail.execute('456', mockProviderSettings);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(1, '🚀 Starting email analysis', {
        messageId: '456',
        providerId: mockProviderSettings.provider,
        config: { forceReanalyze: false, applyTags: true },
      });
    });
  });

  describe('Complete logging flow', () => {
    it('should log analysis completed message', async () => {
      await analyzeEmail.execute('999', mockProviderSettings);

      expect(logger.info).toHaveBeenCalledWith(
        '✅ Email analysis completed successfully',
        expect.objectContaining({
          messageId: '999',
          tags: ['work'],
          confidence: 0.9,
        })
      );
    });
  });

  describe('Header check integration', () => {
    it('should skip analysis if email was already analyzed', async () => {
      // Mock the tracker to indicate email was already analyzed
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Should return empty result
      expect(result).toEqual({
        tags: [],
        confidence: 0,
        reasoning: '',
      });

      // Should log that the email is being skipped
      expect(logger.info).toHaveBeenCalledWith('⏭️ Skipping already-analyzed email', {
        messageId: '123',
      });

      // Should NOT call the mail reader or provider
      expect(mailReader.getFullMessage).not.toHaveBeenCalled();
      expect(queue.getStats).not.toHaveBeenCalled();
    });

    it('should proceed with analysis if email was not analyzed', async () => {
      // Mock the tracker to indicate email was not analyzed
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await analyzeEmail.execute('456', mockProviderSettings);

      // Should return actual analysis result
      expect(result.tags).toEqual(['work']);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('Test reasoning');

      // Should call the mail reader
      expect(mailReader.getFullMessage).toHaveBeenCalledWith(456);
      // Should mark the email as analyzed
      expect(analysisTracker.markAnalyzed).toHaveBeenCalledWith(456);
    });

    it('should mark email as analyzed after successful analysis', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await analyzeEmail.execute('789', mockProviderSettings);

      // Should mark the email as analyzed
      expect(analysisTracker.markAnalyzed).toHaveBeenCalledWith(789);
    });

    it('should call markAnalyzed after applying tags from cache', async () => {
      // Mock cache hit
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const cachedResult = {
        tags: ['cached-tag'],
        confidence: 0.85,
        reasoning: 'Cached reasoning',
      };
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResult);

      await analyzeEmail.execute('101', mockProviderSettings);

      // Should mark the email as analyzed even with cache hit
      expect(analysisTracker.markAnalyzed).toHaveBeenCalledWith(101);
    });

    it('should handle markAnalyzed failure gracefully and continue execution', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      (analysisTracker.markAnalyzed as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to mark analyzed')
      );

      // Should not throw, should continue execution
      const result = await analyzeEmail.execute('202', mockProviderSettings);

      // Should still get valid result
      expect(result.tags).toEqual(['work']);

      // Should log warning about the failure
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️  Failed to mark email as analyzed',
        expect.objectContaining({
          messageId: '202',
          error: 'Failed to mark analyzed',
        })
      );
    });

    it('should log debug message when checking if email was analyzed', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await analyzeEmail.execute('303', mockProviderSettings);

      expect(logger.debug).toHaveBeenCalledWith('🔍 Checking if email was already analyzed');
    });

    it('should log debug message after successfully marking email as analyzed', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await analyzeEmail.execute('404', mockProviderSettings);

      expect(logger.debug).toHaveBeenCalledWith('✅ Email marked as analyzed', {
        messageId: '404',
      });
    });

    it('should validate message ID before checking analysis status', async () => {
      // Invalid message ID should throw error
      await expect(analyzeEmail.execute('invalid-id', mockProviderSettings)).rejects.toThrow(
        'Invalid message ID'
      );
    });

    it('should check analysis status with numeric message ID', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await analyzeEmail.execute('12345', mockProviderSettings);

      // Should call wasAnalyzed with numeric ID
      expect(analysisTracker.wasAnalyzed).toHaveBeenCalledWith(12345);
    });
  });
});
