import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import type { IMailReader, IEmailMessage } from '@/infrastructure/interfaces/IMailReader';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { IProvider, IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import { RetrieveEmailUseCase } from '@/application/use-cases/RetrieveEmailUseCase';
import { ExtractEmailContentUseCase } from '@/application/use-cases/ExtractEmailContentUseCase';
import { CacheAnalysisUseCase } from '@/application/use-cases/CacheAnalysisUseCase';
import { ApplyTagsWithConfidenceUseCase } from '@/application/use-cases/ApplyTagsWithConfidenceUseCase';
import type { TagHistoryRepository } from '@/infrastructure/storage/TagHistoryRepository';

describe('AnalyzeEmail - Logging Tests', () => {
  let logger: ILogger;
  let mailReader: IMailReader;
  let tagManager: ITagManager;
  let providerFactory: ProviderFactory;
  let cache: ICache;
  let contentExtractor: EmailContentExtractor;
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

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key) => key),
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
      getTagsOnMessage: vi.fn().mockResolvedValue([]),
      setTagsOnMessage: vi.fn(),
      getTagsOnMessage: vi.fn().mockResolvedValue([]),
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

    analysisTracker = {
      wasAnalyzed: vi.fn().mockResolvedValue(false),
      markAnalyzed: vi.fn().mockResolvedValue(undefined),
      clearAnalysis: vi.fn().mockResolvedValue(undefined),
      getAnalyzedCount: vi.fn().mockResolvedValue(0),
    } as unknown as EmailAnalysisTracker;

    // Create sub-use-cases
    const retrieveEmailUseCase = new RetrieveEmailUseCase(mailReader, logger);
    const extractEmailContentUseCase = new ExtractEmailContentUseCase(contentExtractor, logger);
    const cacheAnalysisUseCase = new CacheAnalysisUseCase(cache, logger);
    const applyTagsWithConfidenceUseCase = new ApplyTagsWithConfidenceUseCase(
      tagManager,
      configRepository,
      { recordChange: vi.fn().mockResolvedValue(undefined) } as unknown as TagHistoryRepository,
      logger
    );

    analyzeEmail = new AnalyzeEmail(
      providerFactory,
      configRepository,
      analysisTracker,
      logger,
      retrieveEmailUseCase,
      extractEmailContentUseCase,
      cacheAnalysisUseCase,
      applyTagsWithConfidenceUseCase
    );
  });

  describe('Email analysis started logging', () => {
    it('should log "Starting email analysis" with correct context', async () => {
      await analyzeEmail.execute('123', mockProviderSettings);

      expect(logger.debug).toHaveBeenCalledWith('[DEBUG] Starting email analysis', {
        runId: expect.any(String),
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

      expect(logger.debug).toHaveBeenCalledWith('[DEBUG] Starting email analysis', {
        runId: expect.any(String),
        messageId: '123',
        providerId: 'custom-provider-id',
        config: { forceReanalyze: false, applyTags: true },
      });
    });

    it('should log start message as first execution-phase debug call', async () => {
      await analyzeEmail.execute('456', mockProviderSettings);

      const debugMessages = (logger.debug as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0]
      );
      // Skip constructor init logs from AnalyzeEmail and its sub-use-cases
      const firstExecutionLog = debugMessages.find((msg) => !msg.includes('initialized'));
      expect(firstExecutionLog).toBe('[DEBUG] Starting email analysis');
    });
  });

  describe('Complete logging flow', () => {
    it('should log analysis completed message', async () => {
      await analyzeEmail.execute('999', mockProviderSettings);

      expect(logger.info).toHaveBeenCalledWith(
        '[INFO] Email analysis completed successfully',
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
      expect(logger.info).toHaveBeenCalledWith('[INFO] Skipping already-analyzed email', {
        messageId: '123',
      });

      // Should NOT call the mail reader or provider
      expect(mailReader.getFullMessage).not.toHaveBeenCalled();
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
        '[WARN] Failed to mark email as analyzed',
        expect.objectContaining({
          messageId: '202',
          error: 'Failed to mark analyzed',
        })
      );
    });

    it('should log debug message when checking if email was analyzed', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await analyzeEmail.execute('303', mockProviderSettings);

      expect(logger.debug).toHaveBeenCalledWith('[DEBUG] Checking if email was already analyzed');
    });

    it('should log debug message after successfully marking email as analyzed', async () => {
      (analysisTracker.wasAnalyzed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      await analyzeEmail.execute('404', mockProviderSettings);

      expect(logger.debug).toHaveBeenCalledWith('[DEBUG] Email marked as analyzed', {
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

  describe('#12 in-flight dedup / #8 abort / #9a TTL prune', () => {
    it('#12: concurrent execute() for the same message joins one in-flight analysis', async () => {
      const provider = (providerFactory.getProvider as unknown as () => IProvider)();
      let resolveAnalyze!: (value: unknown) => void;
      (provider.analyze as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAnalyze = resolve;
          })
      );

      const first = analyzeEmail.execute('123', mockProviderSettings);
      const second = analyzeEmail.execute('123', mockProviderSettings);

      // Second trigger joined the in-flight promise instead of re-analyzing.
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1));

      resolveAnalyze({ tags: ['work'], confidence: 0.9, reasoning: 'r' });
      const [r1, r2] = await Promise.all([first, second]);

      expect(r1).toEqual(r2);
      expect(logger.debug).toHaveBeenCalledWith('[DEBUG] Joining in-flight analysis', {
        messageId: '123',
      });
    });

    it('#8: propagates AbortError unchanged instead of wrapping it', async () => {
      const provider = (providerFactory.getProvider as unknown as () => IProvider)();
      const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
      (provider.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);

      await expect(analyzeEmail.execute('123', mockProviderSettings)).rejects.toBe(abortError);
      expect(logger.error).not.toHaveBeenCalledWith(
        '[ERROR] Email analysis failed',
        expect.anything()
      );
    });

    it('#9a: prunes expired low-confidence entries via the index key (no full storage scan)', async () => {
      const store = new Map<string, unknown>();
      const get = vi.fn(async (keys?: string | string[]) => {
        if (typeof keys === 'string') {
          return store.has(keys) ? { [keys]: store.get(keys) } : {};
        }
        return {};
      });
      const set = vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) store.set(key, value);
      });
      const remove = vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      });
      (globalThis as unknown as Record<string, unknown>).messenger = {
        storage: { local: { get, set, remove } },
      };

      try {
        const now = Date.now();
        store.set('lowConfidenceIndex', {
          fresh: now,
          old: now - 31 * 24 * 60 * 60 * 1000,
        });

        await (
          analyzeEmail as unknown as {
            storeLowConfidenceFlags: (
              cacheKey: string,
              flags: Array<{
                tagKey: string;
                confidence: number;
                threshold: number;
                thresholdType: 'custom' | 'global';
                reasoning: string;
              }>
            ) => Promise<void>;
          }
        ).storeLowConfidenceFlags('newKey', [
          {
            tagKey: 'x',
            confidence: 0.4,
            threshold: 0.7,
            thresholdType: 'global',
            reasoning: 'r',
          },
        ]);

        // Only the index key is read — never a full-storage get(null).
        expect(get).toHaveBeenCalledWith('lowConfidenceIndex');
        expect(get).not.toHaveBeenCalledWith(null);
        // The index is updated via set ...
        expect(set).toHaveBeenCalledWith({ lowConfidenceIndex: expect.any(Object) });
        // ... and the expired entry is deleted via remove, NOT set(null).
        expect(remove).toHaveBeenCalledWith(['lowConfidence_old']);
        expect(store.has('lowConfidence_old')).toBe(false);
      } finally {
        delete (globalThis as unknown as Record<string, unknown>).messenger;
      }
    });
  });
});
