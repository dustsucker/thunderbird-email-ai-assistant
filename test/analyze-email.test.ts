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

    analyzeEmail = new AnalyzeEmail(
      mailReader,
      tagManager,
      providerFactory,
      cache,
      logger,
      contentExtractor,
      eventBus,
      configRepository,
      queue
    );
  });

  describe('Email analysis started logging', () => {
    it('should log "Email analysis started" with correct context', async () => {
      await analyzeEmail.execute('123', mockProviderSettings);

      expect(logger.info).toHaveBeenCalledWith('Email analysis started', {
        messageId: '123',
        providerId: mockProviderSettings.providerId,
        model: mockProviderSettings.model,
      });
    });

    it('should include providerId from provider settings in log context', async () => {
      const settingsWithId: IProviderSettings = {
        provider: 'openai',
        providerId: 'custom-provider-id',
        model: 'gpt-4',
        apiKey: 'test-key',
      };

      await analyzeEmail.execute('123', settingsWithId);

      expect(logger.info).toHaveBeenCalledWith('Email analysis started', {
        messageId: '123',
        providerId: 'custom-provider-id',
        model: 'gpt-4',
      });
    });

    it('should log start message as first info call', async () => {
      await analyzeEmail.execute('456', mockProviderSettings);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(1, 'Email analysis started', {
        messageId: '456',
        providerId: mockProviderSettings.providerId,
        model: mockProviderSettings.model,
      });
    });
  });

  describe('Queue status logging', () => {
    it('should call logQueueStatus after analysis start', async () => {
      await analyzeEmail.execute('123', mockProviderSettings);

      expect(queue.getStats).toHaveBeenCalled();
    });

    it('should log queue status with correct fields', async () => {
      await analyzeEmail.execute('123', mockProviderSettings);

      expect(logger.info).toHaveBeenCalledWith(
        'Queue status',
        expect.objectContaining({
          size: mockQueueStats.size,
          waiting: mockQueueStats.waiting,
          processing: mockQueueStats.processing,
          avgWaitTime: mockQueueStats.avgWaitTime,
        })
      );
    });

    it('should log queue status after "Email analysis started"', async () => {
      await analyzeEmail.execute('123', mockProviderSettings);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(1, 'Email analysis started', expect.any(Object));
      expect(infoCall).toHaveBeenNthCalledWith(2, 'Queue status', expect.any(Object));
    });

    it('should handle queue stats correctly', async () => {
      const customStats = {
        size: 10,
        waiting: 5,
        processing: 5,
        avgWaitTime: 200,
      };

      (queue.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce(customStats);

      await analyzeEmail.execute('789', mockProviderSettings);

      expect(logger.info).toHaveBeenCalledWith(
        'Queue status',
        expect.objectContaining({
          size: customStats.size,
          waiting: customStats.waiting,
          processing: customStats.processing,
          avgWaitTime: customStats.avgWaitTime,
        })
      );
    });
  });

  describe('Complete logging flow', () => {
    it('should log both start message and queue status in correct order', async () => {
      await analyzeEmail.execute('999', mockProviderSettings);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;

      expect(infoCall).toHaveBeenNthCalledWith(1, 'Email analysis started', {
        messageId: '999',
        providerId: mockProviderSettings.providerId,
        model: mockProviderSettings.model,
      });
      expect(infoCall).toHaveBeenNthCalledWith(
        2,
        'Queue status',
        expect.objectContaining({
          size: mockQueueStats.size,
          waiting: mockQueueStats.waiting,
          processing: mockQueueStats.processing,
          avgWaitTime: mockQueueStats.avgWaitTime,
        })
      );
    });
  });
});
