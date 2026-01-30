/**
 * Integration Tests: Tag Application with Confidence Thresholds
 *
 * These tests verify the end-to-end flow of email analysis and tag application,
 * specifically testing how confidence thresholds control which tags are applied.
 *
 * Tests cover:
 * - Tags applied when confidence meets/exceeds threshold
 * - Tags not applied when confidence is below threshold
 * - Per-tag threshold overrides
 * - Low-confidence flagging behavior
 * - Global threshold as default
 *
 * @module test/integration/tagApplication
 */

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
import type { Tag } from '@/shared/types/ProviderTypes';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';

/**
 * NOTE: This test file must be run as part of the full test suite (npm test)
 * due to vitest path resolution limitations with the @ alias in individual test runs.
 */

describe('Tag Application Integration Tests - Confidence Thresholds', () => {
  // ==========================================================================
  // Test Dependencies
  // ==========================================================================

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
  let mockProvider: IProvider;

  // Test email fixture
  const mockEmail: IEmailMessage = {
    id: 123,
    subject: 'Test Business Email',
    from: 'business@company.com',
    to: ['recipient@example.com'],
    body: 'This is a test email about business collaboration.',
    headers: {
      from: 'business@company.com',
      to: 'recipient@example.com',
      subject: 'Test Business Email',
    },
    attachments: [],
  };

  // Mock provider settings
  const mockProviderSettings: IProviderSettings = {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-key',
  };

  // Mock custom tags
  const mockCustomTags: Tag[] = [
    {
      key: 'is_business',
      name: 'Business',
      color: '#FF0000',
      prompt: 'Is this a business email?',
      minConfidenceThreshold: 75, // Custom override
    },
    {
      key: 'is_urgent',
      name: 'Urgent',
      color: '#FFA500',
      prompt: 'Is this urgent?',
      // No override - should use global threshold
    },
    {
      key: 'is_personal',
      name: 'Personal',
      color: '#00FF00',
      prompt: 'Is this personal?',
      minConfidenceThreshold: 90, // High custom threshold
    },
  ];

  // ==========================================================================
  // Test Setup
  // ==========================================================================

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock Logger
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key) => key),
    };

    // Mock Queue
    queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      clear: vi.fn(),
      getStats: vi.fn().mockResolvedValue({
        size: 0,
        waiting: 0,
        processing: 0,
        avgWaitTime: 0,
      }),
      peek: vi.fn(),
      size: vi.fn().mockResolvedValue(0),
      isEmpty: vi.fn().mockResolvedValue(true),
    };

    // Mock MailReader
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

    // Mock TagManager
    tagManager = {
      getAllTags: vi.fn().mockResolvedValue([]),
      createTag: vi.fn(),
      getCustomTags: vi.fn(),
      getTag: vi.fn(),
      getTagById: vi.fn(),
      updateTag: vi.fn(),
      deleteTag: vi.fn(),
      tagExists: vi.fn(),
      ensureTagExists: vi.fn(),
      setTagsOnMessage: vi.fn().mockResolvedValue(undefined),
      addTagToMessage: vi.fn(),
      removeTagFromMessage: vi.fn(),
      clearTagsFromMessage: vi.fn(),
      addTagToMessages: vi.fn(),
      setTagsOnMessages: vi.fn(),
    };

    // Mock Provider
    mockProvider = {
      providerId: 'openai',
      validateSettings: vi.fn().mockResolvedValue(true),
      analyze: vi.fn(),
    };

    // Mock ProviderFactory
    providerFactory = {
      getProvider: vi.fn().mockReturnValue(mockProvider),
      registerProvider: vi.fn(),
    } as unknown as ProviderFactory;

    // Mock Cache
    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
      getStats: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      cleanupExpired: vi.fn(),
    };

    // Mock EventBus
    eventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as EventBus;

    // Mock ConfigRepository
    configRepository = {
      getProviderSettings: vi.fn(),
      setProviderSettings: vi.fn(),
      getAllProviderSettings: vi.fn(),
      getAppConfig: vi.fn().mockResolvedValue({
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: true,
        modelConcurrencyLimits: [],
        minConfidenceThreshold: 70, // Global threshold
      }),
      getCustomTags: vi.fn().mockResolvedValue(mockCustomTags),
      setCustomTags: vi.fn(),
      setAppConfig: vi.fn(),
      clearAll: vi.fn(),
    };

    // Create real EmailContentExtractor
    contentExtractor = new EmailContentExtractor(logger);

    // Mock EmailAnalysisTracker
    analysisTracker = {
      wasAnalyzed: vi.fn().mockResolvedValue(false),
      markAnalyzed: vi.fn().mockResolvedValue(undefined),
      clearAnalysis: vi.fn().mockResolvedValue(undefined),
      getAnalyzedCount: vi.fn().mockResolvedValue(0),
    } as unknown as EmailAnalysisTracker;

    // Create AnalyzeEmail use case instance
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

  // ==========================================================================
  // Test Suite 1: Tags Applied When Above Threshold
  // ==========================================================================

  describe('Tags Applied When Above Threshold', () => {
    it('should apply all tags when confidence meets all thresholds', async () => {
      // Setup: Provider returns tags with 0.85 confidence (85%)
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business', 'is_urgent'],
        confidence: 0.85,
        reasoning: 'Email is business-related and urgent',
      });

      // Execute: Analyze the email
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Provider was called
      expect(mockProvider.analyze).toHaveBeenCalledTimes(1);

      // Verify: Both tags should be applied:
      // - is_business: 85% >= 75% (custom threshold) ✓
      // - is_urgent: 85% >= 70% (global threshold) ✓
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledTimes(1);
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_business', 'is_urgent']);

      // Verify: Analysis result is correct
      expect(result.tags).toEqual(['is_business', 'is_urgent']);
      expect(result.confidence).toBe(0.85);

      // Verify: Success logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Tags applied successfully'),
        expect.objectContaining({
          messageId: '123',
          applied: 2,
          total: 2,
        })
      );
    });

    it('should apply tag when confidence exactly equals threshold', async () => {
      // Setup: Provider returns tag with 0.75 confidence (exactly at custom threshold)
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business'],
        confidence: 0.75,
        reasoning: 'Business email',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag should be applied (75% >= 75%)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_business']);
      expect(result.tags).toEqual(['is_business']);
    });

    it('should apply tag using global threshold when no override exists', async () => {
      // Setup: Provider returns tag with 0.70 confidence (at global threshold)
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_urgent'],
        confidence: 0.70,
        reasoning: 'Urgent email',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag should be applied using global threshold (70% >= 70%)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_urgent']);
      expect(result.tags).toEqual(['is_urgent']);
    });
  });

  // ==========================================================================
  // Test Suite 2: Tags Not Applied When Below Threshold
  // ==========================================================================

  describe('Tags Not Applied When Below Threshold', () => {
    it('should not apply tags when confidence is below global threshold', async () => {
      // Setup: Provider returns tags with 0.65 confidence (65%)
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_urgent', 'is_business'],
        confidence: 0.65,
        reasoning: 'Low confidence classification',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tags should NOT be applied:
      // - is_urgent: 65% < 70% (global threshold) ✗
      // - is_business: 65% < 75% (custom threshold) ✗
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);

      // Verify: Warning logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No tags met confidence threshold'),
        expect.objectContaining({
          messageId: '123',
        })
      );

      // Verify: Analysis still returns the tags
      expect(result.tags).toEqual(['is_urgent', 'is_business']);
      expect(result.confidence).toBe(0.65);
    });

    it('should not apply tag when below custom threshold override', async () => {
      // Setup: Provider returns tag with 0.74 confidence (just below custom threshold of 75%)
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business'],
        confidence: 0.74,
        reasoning: 'Business email but low confidence',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag should NOT be applied (74% < 75% custom threshold)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);
      expect(result.tags).toEqual(['is_business']);
    });

    it('should not apply tag when below high custom threshold', async () => {
      // Setup: Provider returns tag with 0.85 confidence (below 90% custom threshold)
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_personal'],
        confidence: 0.85,
        reasoning: 'Personal email but not 90% confident',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag should NOT be applied (85% < 90% custom threshold)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);
      expect(result.tags).toEqual(['is_personal']);
    });
  });

  // ==========================================================================
  // Test Suite 3: Per-Tag Threshold Overrides
  // ==========================================================================

  describe('Per-Tag Threshold Overrides', () => {
    it('should use custom threshold when defined', async () => {
      // Setup: Confidence between global and custom thresholds
      // Global: 70%, Custom for is_business: 75%, Confidence: 72%
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business', 'is_urgent'],
        confidence: 0.72,
        reasoning: 'Mixed confidence tags',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify:
      // - is_business: 72% < 75% (custom) ✗ NOT applied
      // - is_urgent: 72% >= 70% (global) ✓ applied
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_urgent']);
      expect(result.tags).toEqual(['is_business', 'is_urgent']);

      // Verify: Debug logs show threshold comparison
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('below threshold, skipping'),
        expect.objectContaining({
          tag: 'is_business',
        })
      );
    });

    it('should fall back to global threshold when no override exists', async () => {
      // Setup: Only test is_urgent which has no custom override
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_urgent'],
        confidence: 0.68,
        reasoning: 'Urgent but below global threshold',
      });

      // Change global threshold to 65% for this test
      configRepository.getAppConfig = vi.fn().mockResolvedValue({
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: true,
        modelConcurrencyLimits: [],
        minConfidenceThreshold: 65,
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag should be applied (68% >= 65% global threshold)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['is_urgent']);
      expect(result.tags).toEqual(['is_urgent']);
    });

    it('should handle mix of tags with and without overrides', async () => {
      // Setup: Confidence at 80%
      // - is_business (override 75%): 80% >= 75% ✓
      // - is_urgent (global 70%): 80% >= 70% ✓
      // - is_personal (override 90%): 80% < 90% ✗
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business', 'is_urgent', 'is_personal'],
        confidence: 0.80,
        reasoning: 'Mixed results',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Only is_business and is_urgent applied
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, [
        'is_business',
        'is_urgent',
      ]);
      expect(result.tags).toEqual(['is_business', 'is_urgent', 'is_personal']);

      // Verify: Log shows 2 applied, 1 skipped
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Tags applied successfully'),
        expect.objectContaining({
          applied: 2,
          total: 3,
        })
      );
    });
  });

  // ==========================================================================
  // Test Suite 4: Low-Confidence Flagging Behavior
  // ==========================================================================

  describe('Low-Confidence Flagging Behavior', () => {
    it('should create low-confidence flags for tags below threshold', async () => {
      // Setup: Tags below their respective thresholds
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business', 'is_personal'],
        confidence: 0.65,
        reasoning: 'Low confidence classification',
      });

      // Mock messenger.storage.local for flag storage
      const mockStorage = new Map();
      global.messenger = {
        storage: {
          local: {
            set: vi.fn().mockImplementation((data) => {
              mockStorage.set(Object.keys(data)[0], Object.values(data)[0]);
            }),
            get: vi.fn(),
            remove: vi.fn(),
            clear: vi.fn(),
          },
        },
      };

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: No tags applied (both below threshold)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);

      // Verify: Low-confidence flags stored
      expect(global.messenger.storage.local.set).toHaveBeenCalled();
      const storageCall = global.messenger.storage.local.set.mock.calls[0][0];
      const storageKey = Object.keys(storageCall)[0];
      expect(storageKey).toMatch(/^lowConfidence_/);

      const flagData = storageCall[storageKey];
      expect(flagData.flags).toHaveLength(2);

      // Verify flag structure for is_business (65% < 75% custom)
      const businessFlag = flagData.flags.find((f: any) => f.tagKey === 'is_business');
      expect(businessFlag).toBeDefined();
      expect(businessFlag.confidence).toBe(0.65);
      expect(businessFlag.threshold).toBe(75);
      expect(businessFlag.thresholdType).toBe('custom');

      // Verify flag structure for is_personal (65% < 90% custom)
      const personalFlag = flagData.flags.find((f: any) => f.tagKey === 'is_personal');
      expect(personalFlag).toBeDefined();
      expect(personalFlag.confidence).toBe(0.65);
      expect(personalFlag.threshold).toBe(90);
      expect(personalFlag.thresholdType).toBe('custom');

      // Verify: Reasoning included in flags
      expect(businessFlag.reasoning).toContain('65%');
      expect(businessFlag.reasoning).toContain('75%');

      // Verify: Log shows low-confidence flags created
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Low-confidence flags created'),
        expect.objectContaining({
          messageId: '123',
          flagCount: 2,
        })
      );

      // Cleanup
      delete global.messenger;
    });

    it('should include threshold type in low-confidence flags', async () => {
      // Setup: Tag below global threshold
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_urgent'],
        confidence: 0.65,
        reasoning: 'Urgent but low confidence',
      });

      // Mock messenger.storage.local
      global.messenger = {
        storage: {
          local: {
            set: vi.fn(),
          },
        },
      };

      // Execute
      await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Flag includes threshold type
      const storageCall = global.messenger.storage.local.set.mock.calls[0][0];
      const flagData = Object.values(storageCall)[0] as { flags: Array<{ thresholdType: string }> };
      expect(flagData.flags[0].thresholdType).toBe('global');

      // Cleanup
      delete global.messenger;
    });

    it('should handle storage errors gracefully when flagging low confidence', async () => {
      // Setup
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business'],
        confidence: 0.50,
        reasoning: 'Low confidence',
      });

      // Mock storage that throws error
      global.messenger = {
        storage: {
          local: {
            set: vi.fn().mockRejectedValue(new Error('Storage error')),
          },
        },
      };

      // Execute: Should not throw, just log warning
      await expect(
        analyzeEmail.execute('123', mockProviderSettings)
      ).resolves.toBeDefined();

      // Verify: Warning logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store low-confidence flags'),
        expect.any(Object)
      );

      // Cleanup
      delete global.messenger;
    });
  });

  // ==========================================================================
  // Test Suite 5: Edge Cases and Boundary Conditions
  // ==========================================================================

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty tag list', async () => {
      // Setup: Provider returns no tags
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: [],
        confidence: 0.5,
        reasoning: 'No tags identified',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: No tags applied
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);
      expect(result.tags).toEqual([]);
    });

    it('should handle confidence of 1.0 (100%)', async () => {
      // Setup: Perfect confidence
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business', 'is_urgent', 'is_personal'],
        confidence: 1.0,
        reasoning: 'Perfect confidence',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: All tags should be applied (100% meets all thresholds)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, [
        'is_business',
        'is_urgent',
        'is_personal',
      ]);
      expect(result.tags).toHaveLength(3);
    });

    it('should handle confidence of 0.0 (0%)', async () => {
      // Setup: Zero confidence
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business'],
        confidence: 0.0,
        reasoning: 'No confidence',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: No tags applied
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);
      expect(result.confidence).toBe(0.0);
    });

    it('should handle tag not in custom tags list', async () => {
      // Setup: Provider returns unknown tag
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['unknown_tag'],
        confidence: 0.85,
        reasoning: 'Unknown tag',
      });

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag should use global threshold (no custom override found)
      // 85% >= 70% global threshold, so should be applied
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, ['unknown_tag']);
      expect(result.tags).toEqual(['unknown_tag']);
    });

    it('should apply tags when skipTagApplication is false', async () => {
      // Setup
      mockProvider.analyze = vi.fn().mockResolvedValue({
        tags: ['is_business'],
        confidence: 0.80,
        reasoning: 'Business email',
      });

      // Execute with applyTags=false
      const result = await analyzeEmail.execute('123', mockProviderSettings, {
        applyTags: false,
      });

      // Verify: Tags NOT applied
      expect(tagManager.setTagsOnMessage).not.toHaveBeenCalled();

      // Verify: Analysis still completes
      expect(result.tags).toEqual(['is_business']);
      expect(result.confidence).toBe(0.80);

      // Verify: Log shows skip
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping tag application')
      );
    });
  });

  // ==========================================================================
  // Test Suite 6: Caching Interactions
  // ==========================================================================

  describe('Caching Interactions with Confidence Thresholds', () => {
    it('should apply cached tags with threshold checking', async () => {
      // Setup: Cache has stored result
      const cachedResult = {
        tags: ['is_business', 'is_urgent'],
        confidence: 0.80,
        reasoning: 'Cached analysis',
      };

      cache.get = vi.fn().mockResolvedValue(cachedResult);

      // Mock storage for low-confidence flags
      global.messenger = {
        storage: {
          local: {
            set: vi.fn(),
          },
        },
      };

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Cache was checked
      expect(cache.get).toHaveBeenCalled();

      // Verify: Provider was NOT called (cache hit)
      expect(mockProvider.analyze).not.toHaveBeenCalled();

      // Verify: Tags applied from cache (80% meets thresholds)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, [
        'is_business',
        'is_urgent',
      ]);

      // Verify: Result from cache
      expect(result.tags).toEqual(['is_business', 'is_urgent']);
      expect(result.confidence).toBe(0.80);

      // Cleanup
      delete global.messenger;
    });

    it('should flag low-confidence from cached results', async () => {
      // Setup: Cache has low-confidence result
      const cachedResult = {
        tags: ['is_personal'],
        confidence: 0.70,
        reasoning: 'Cached low confidence',
      };

      cache.get = vi.fn().mockResolvedValue(cachedResult);

      // Mock storage
      global.messenger = {
        storage: {
          local: {
            set: vi.fn(),
          },
        },
      };

      // Execute
      const result = await analyzeEmail.execute('123', mockProviderSettings);

      // Verify: Tag not applied (70% < 90% custom threshold)
      expect(tagManager.setTagsOnMessage).toHaveBeenCalledWith(123, []);

      // Verify: Low-confidence flag stored
      expect(global.messenger.storage.local.set).toHaveBeenCalled();

      // Cleanup
      delete global.messenger;
    });
  });
});
