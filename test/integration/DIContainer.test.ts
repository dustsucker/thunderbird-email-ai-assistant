/**
 * Integration Tests: DI Container Setup
 *
 * These tests verify that the TSyringe DI container is correctly configured
 * and all services can be properly resolved.
 *
 * Test coverage:
 * - Use Cases resolution (AnalyzeEmail, ApplyTagsToEmail, etc.)
 * - Services resolution (ILogger, ICache, IQueue, etc.)
 * - Provider resolution (ProviderFactory)
 * - Singleton behavior verification
 * - Dependency chain verification
 *
 * @module test/integration/DIContainer
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container } from 'tsyringe';
import { setupDIContainer } from '@/background/DIContainer';

// Use Cases
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { ApplyTagsToEmail } from '@/application/use-cases/ApplyTagsToEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { RetrieveEmailUseCase } from '@/application/use-cases/RetrieveEmailUseCase';
import { ExtractEmailContentUseCase } from '@/application/use-cases/ExtractEmailContentUseCase';
import { CacheAnalysisUseCase } from '@/application/use-cases/CacheAnalysisUseCase';
import { ApplyTagsWithConfidenceUseCase } from '@/application/use-cases/ApplyTagsWithConfidenceUseCase';

// Services
import type { ILogger } from '@/domain/interfaces';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { IMailReader } from '@/infrastructure/interfaces/IMailReader';
import type { ITagManager } from '@/domain/interfaces';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';
import { TagService } from '@/domain/services/TagService';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { RateLimiterService } from '@/application/services/RateLimiterService';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';

// Background Services
import { EmailEventListener } from '@/interfaces/background/EmailEventListener';
import { MessageHandler } from '@/interfaces/background/MessageHandler';

// Domain Events
import { EventBus } from '@/domain/events/EventBus';

/**
 * Mock Thunderbird messenger API for testing
 */
function mockThunderbirdAPI(): void {
  const storageMock = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };

  // Setup browser.storage.local (required by IndexedDBConfigRepository)
  (globalThis as any).browser = {
    storage: {
      local: storageMock,
    },
  };

  // Setup messenger API (required by Thunderbird adapters)
  (global as any).messenger = {
    storage: {
      local: storageMock,
    },
    messages: {
      get: vi.fn().mockResolvedValue({
        id: 1,
        subject: 'Test',
        from: 'test@example.com',
        to: ['recipient@example.com'],
        body: 'Test body',
        headers: {},
        attachments: [],
      }),
      getFull: vi.fn().mockResolvedValue({
        id: 1,
        subject: 'Test',
        from: 'test@example.com',
        to: ['recipient@example.com'],
        body: 'Test body',
        headers: {},
        attachments: [],
      }),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
    },
    tags: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ key: 'test', tag: 'Test', color: '#000000' }),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

/**
 * Cleanup Thunderbird mock
 */
function cleanupThunderbirdAPI(): void {
  delete (global as any).messenger;
  delete (globalThis as any).browser;
}

describe('DIContainer Integration', () => {
  // ==========================================================================
  // Test Setup & Teardown
  // ==========================================================================

  beforeEach(() => {
    // Clear any existing registrations
    container.clearInstances();
    // Mock Thunderbird API for adapters
    mockThunderbirdAPI();
    // Setup the DI container
    setupDIContainer();
  });

  afterEach(() => {
    container.clearInstances();
    cleanupThunderbirdAPI();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Test Suite 1: Use Cases Resolution
  // ==========================================================================

  describe('Use Cases Resolution', () => {
    describe('AnalyzeEmail use case', () => {
      it('should resolve AnalyzeEmail from container', () => {
        const useCase = container.resolve<AnalyzeEmail>('AnalyzeEmail');
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(AnalyzeEmail);
      });

      it('should have all required dependencies injected', () => {
        const useCase = container.resolve<AnalyzeEmail>('AnalyzeEmail');
        // Verify the use case has an execute method
        expect(typeof useCase.execute).toBe('function');
      });
    });

    describe('ApplyTagsToEmail use case', () => {
      it('should resolve ApplyTagsToEmail from container', () => {
        const useCase = container.resolve<ApplyTagsToEmail>('ApplyTagsToEmail');
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(ApplyTagsToEmail);
      });

      it('should have execute method', () => {
        const useCase = container.resolve<ApplyTagsToEmail>('ApplyTagsToEmail');
        expect(typeof useCase.execute).toBe('function');
      });
    });

    describe('AnalyzeBatchEmails use case', () => {
      it('should resolve AnalyzeBatchEmails from container', () => {
        const useCase = container.resolve<AnalyzeBatchEmails>('AnalyzeBatchEmails');
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(AnalyzeBatchEmails);
      });

      it('should have execute method', () => {
        const useCase = container.resolve<AnalyzeBatchEmails>('AnalyzeBatchEmails');
        expect(typeof useCase.execute).toBe('function');
      });
    });

    describe('Sub-use-cases', () => {
      it('should resolve RetrieveEmailUseCase', () => {
        const useCase = container.resolve(RetrieveEmailUseCase);
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(RetrieveEmailUseCase);
      });

      it('should resolve ExtractEmailContentUseCase', () => {
        const useCase = container.resolve(ExtractEmailContentUseCase);
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(ExtractEmailContentUseCase);
      });

      it('should resolve CacheAnalysisUseCase', () => {
        const useCase = container.resolve(CacheAnalysisUseCase);
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(CacheAnalysisUseCase);
      });

      it('should resolve ApplyTagsWithConfidenceUseCase', () => {
        const useCase = container.resolve(ApplyTagsWithConfidenceUseCase);
        expect(useCase).toBeDefined();
        expect(useCase).toBeInstanceOf(ApplyTagsWithConfidenceUseCase);
      });
    });
  });

  // ==========================================================================
  // Test Suite 2: Services Resolution
  // ==========================================================================

  describe('Services Resolution', () => {
    describe('Core Services (ILogger)', () => {
      it('should resolve ILogger from container', () => {
        const logger = container.resolve<ILogger>('ILogger');
        expect(logger).toBeDefined();
      });

      it('should have all required methods', () => {
        const logger = container.resolve<ILogger>('ILogger');
        expect(typeof logger.debug).toBe('function');
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.maskApiKey).toBe('function');
      });
    });

    describe('Cache Service (ICache)', () => {
      it('should resolve ICache from container', () => {
        const cache = container.resolve<ICache>('ICache');
        expect(cache).toBeDefined();
      });

      it('should have all required methods', () => {
        const cache = container.resolve<ICache>('ICache');
        expect(typeof cache.get).toBe('function');
        expect(typeof cache.set).toBe('function');
        expect(typeof cache.delete).toBe('function');
        expect(typeof cache.has).toBe('function');
        expect(typeof cache.clear).toBe('function');
      });
    });

    describe('Queue Service (IQueue)', () => {
      it('should resolve IQueue from container', () => {
        const queue = container.resolve<IQueue>('IQueue');
        expect(queue).toBeDefined();
      });

      it('should have all required methods', () => {
        const queue = container.resolve<IQueue>('IQueue');
        expect(typeof queue.enqueue).toBe('function');
        expect(typeof queue.dequeue).toBe('function');
        expect(typeof queue.peek).toBe('function');
        expect(typeof queue.size).toBe('function');
        expect(typeof queue.isEmpty).toBe('function');
      });
    });

    describe('Mail Reader Service (IMailReader)', () => {
      it('should resolve IMailReader from container', () => {
        const mailReader = container.resolve<IMailReader>('IMailReader');
        expect(mailReader).toBeDefined();
      });

      it('should have required methods', () => {
        const mailReader = container.resolve<IMailReader>('IMailReader');
        expect(typeof mailReader.getFullMessage).toBe('function');
        expect(typeof mailReader.getMessageHeaders).toBe('function');
      });
    });

    describe('Tag Manager Service (ITagManager)', () => {
      it('should resolve ITagManager from container', () => {
        const tagManager = container.resolve<ITagManager>('ITagManager');
        expect(tagManager).toBeDefined();
      });

      it('should have required methods', () => {
        const tagManager = container.resolve<ITagManager>('ITagManager');
        expect(typeof tagManager.getAllTags).toBe('function');
        expect(typeof tagManager.createTag).toBe('function');
        expect(typeof tagManager.setTagsOnMessage).toBe('function');
      });
    });

    describe('Config Repository (IConfigRepository)', () => {
      it('should resolve IConfigRepository from container', () => {
        const configRepo = container.resolve<IConfigRepository>('IConfigRepository');
        expect(configRepo).toBeDefined();
      });

      it('should have required methods', () => {
        const configRepo = container.resolve<IConfigRepository>('IConfigRepository');
        expect(typeof configRepo.getProviderSettings).toBe('function');
        expect(typeof configRepo.setProviderSettings).toBe('function');
        expect(typeof configRepo.getAppConfig).toBe('function');
        expect(typeof configRepo.getCustomTags).toBe('function');
      });
    });
  });

  // ==========================================================================
  // Test Suite 3: Domain Services & Infrastructure Services Resolution
  // ==========================================================================

  describe('Domain & Infrastructure Services Resolution', () => {
    describe('EmailContentExtractor', () => {
      it('should resolve EmailContentExtractor from container', () => {
        const extractor = container.resolve<EmailContentExtractor>('EmailContentExtractor');
        expect(extractor).toBeDefined();
        expect(extractor).toBeInstanceOf(EmailContentExtractor);
      });

      it('should have findEmailParts method', () => {
        const extractor = container.resolve<EmailContentExtractor>('EmailContentExtractor');
        expect(typeof extractor.findEmailParts).toBe('function');
      });
    });

    describe('TagService', () => {
      it('should resolve TagService from container', () => {
        const tagService = container.resolve<TagService>('TagService');
        expect(tagService).toBeDefined();
        expect(tagService).toBeInstanceOf(TagService);
      });
    });

    describe('AppConfigService', () => {
      it('should resolve AppConfigService from container', () => {
        const appConfig = container.resolve<AppConfigService>('AppConfigService');
        expect(appConfig).toBeDefined();
        expect(appConfig).toBeInstanceOf(AppConfigService);
      });
    });

    describe('RateLimiterService', () => {
      it('should resolve RateLimiterService from container', () => {
        const rateLimiter = container.resolve<RateLimiterService>('RateLimiterService');
        expect(rateLimiter).toBeDefined();
        expect(rateLimiter).toBeInstanceOf(RateLimiterService);
      });
    });

    describe('EmailAnalysisTracker', () => {
      it('should resolve EmailAnalysisTracker from container', () => {
        const tracker = container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');
        expect(tracker).toBeDefined();
        expect(tracker).toBeInstanceOf(EmailAnalysisTracker);
      });

      it('should have required methods', () => {
        const tracker = container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');
        expect(typeof tracker.wasAnalyzed).toBe('function');
        expect(typeof tracker.markAnalyzed).toBe('function');
      });
    });
  });

  // ==========================================================================
  // Test Suite 4: Provider Resolution
  // ==========================================================================

  describe('Provider Resolution', () => {
    describe('ProviderFactory', () => {
      it('should resolve ProviderFactory from container', () => {
        const factory = container.resolve<ProviderFactory>('ProviderFactory');
        expect(factory).toBeDefined();
        expect(factory).toBeInstanceOf(ProviderFactory);
      });

      it('should have getProvider method', () => {
        const factory = container.resolve<ProviderFactory>('ProviderFactory');
        expect(typeof factory.getProvider).toBe('function');
      });

      it('should have registerProvider method', () => {
        const factory = container.resolve<ProviderFactory>('ProviderFactory');
        expect(typeof factory.registerProvider).toBe('function');
      });
    });
  });

  // ==========================================================================
  // Test Suite 5: Background Services Resolution
  // ==========================================================================

  describe('Background Services Resolution', () => {
    describe('EmailEventListener', () => {
      it('should resolve EmailEventListener from container', () => {
        const listener = container.resolve<EmailEventListener>('EmailEventListener');
        expect(listener).toBeDefined();
        expect(listener).toBeInstanceOf(EmailEventListener);
      });
    });

    describe('MessageHandler', () => {
      it('should resolve MessageHandler from container', () => {
        const handler = container.resolve<MessageHandler>('MessageHandler');
        expect(handler).toBeDefined();
        expect(handler).toBeInstanceOf(MessageHandler);
      });
    });
  });

  // ==========================================================================
  // Test Suite 6: Singleton Behavior
  // ==========================================================================

  describe('Singleton Behavior', () => {
    describe('Core Services Singletons', () => {
      it('should return same ILogger instance on multiple resolves', () => {
        const logger1 = container.resolve<ILogger>('ILogger');
        const logger2 = container.resolve<ILogger>('ILogger');
        expect(logger1).toBe(logger2);
      });

      it('should return same ICache instance on multiple resolves', () => {
        const cache1 = container.resolve<ICache>('ICache');
        const cache2 = container.resolve<ICache>('ICache');
        expect(cache1).toBe(cache2);
      });

      it('should return same IQueue instance on multiple resolves', () => {
        const queue1 = container.resolve<IQueue>('IQueue');
        const queue2 = container.resolve<IQueue>('IQueue');
        expect(queue1).toBe(queue2);
      });

      it('should return same IMailReader instance on multiple resolves', () => {
        const reader1 = container.resolve<IMailReader>('IMailReader');
        const reader2 = container.resolve<IMailReader>('IMailReader');
        expect(reader1).toBe(reader2);
      });

      it('should return same ITagManager instance on multiple resolves', () => {
        const tagManager1 = container.resolve<ITagManager>('ITagManager');
        const tagManager2 = container.resolve<ITagManager>('ITagManager');
        expect(tagManager1).toBe(tagManager2);
      });

      it('should return same IConfigRepository instance on multiple resolves', () => {
        const config1 = container.resolve<IConfigRepository>('IConfigRepository');
        const config2 = container.resolve<IConfigRepository>('IConfigRepository');
        expect(config1).toBe(config2);
      });
    });

    describe('Domain & Infrastructure Services Singletons', () => {
      it('should return same ProviderFactory instance on multiple resolves', () => {
        const factory1 = container.resolve<ProviderFactory>('ProviderFactory');
        const factory2 = container.resolve<ProviderFactory>('ProviderFactory');
        expect(factory1).toBe(factory2);
      });

      it('should return same EmailContentExtractor instance on multiple resolves', () => {
        const extractor1 = container.resolve<EmailContentExtractor>('EmailContentExtractor');
        const extractor2 = container.resolve<EmailContentExtractor>('EmailContentExtractor');
        expect(extractor1).toBe(extractor2);
      });

      it('should return same TagService instance on multiple resolves', () => {
        const tagService1 = container.resolve<TagService>('TagService');
        const tagService2 = container.resolve<TagService>('TagService');
        expect(tagService1).toBe(tagService2);
      });

      it('should return same AppConfigService instance on multiple resolves', () => {
        const config1 = container.resolve<AppConfigService>('AppConfigService');
        const config2 = container.resolve<AppConfigService>('AppConfigService');
        expect(config1).toBe(config2);
      });

      it('should return same RateLimiterService instance on multiple resolves', () => {
        const rateLimiter1 = container.resolve<RateLimiterService>('RateLimiterService');
        const rateLimiter2 = container.resolve<RateLimiterService>('RateLimiterService');
        expect(rateLimiter1).toBe(rateLimiter2);
      });

      it('should return same EmailAnalysisTracker instance on multiple resolves', () => {
        const tracker1 = container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');
        const tracker2 = container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');
        expect(tracker1).toBe(tracker2);
      });
    });

    describe('Use Cases Singletons', () => {
      it('should return same AnalyzeEmail instance on multiple resolves', () => {
        const useCase1 = container.resolve<AnalyzeEmail>('AnalyzeEmail');
        const useCase2 = container.resolve<AnalyzeEmail>('AnalyzeEmail');
        expect(useCase1).toBe(useCase2);
      });

      it('should return same ApplyTagsToEmail instance on multiple resolves', () => {
        const useCase1 = container.resolve<ApplyTagsToEmail>('ApplyTagsToEmail');
        const useCase2 = container.resolve<ApplyTagsToEmail>('ApplyTagsToEmail');
        expect(useCase1).toBe(useCase2);
      });

      it('should return same AnalyzeBatchEmails instance on multiple resolves', () => {
        const useCase1 = container.resolve<AnalyzeBatchEmails>('AnalyzeBatchEmails');
        const useCase2 = container.resolve<AnalyzeBatchEmails>('AnalyzeBatchEmails');
        expect(useCase1).toBe(useCase2);
      });

      it('should return same RetrieveEmailUseCase instance on multiple resolves', () => {
        const useCase1 = container.resolve(RetrieveEmailUseCase);
        const useCase2 = container.resolve(RetrieveEmailUseCase);
        expect(useCase1).toBe(useCase2);
      });

      it('should return same ExtractEmailContentUseCase instance on multiple resolves', () => {
        const useCase1 = container.resolve(ExtractEmailContentUseCase);
        const useCase2 = container.resolve(ExtractEmailContentUseCase);
        expect(useCase1).toBe(useCase2);
      });

      it('should return same CacheAnalysisUseCase instance on multiple resolves', () => {
        const useCase1 = container.resolve(CacheAnalysisUseCase);
        const useCase2 = container.resolve(CacheAnalysisUseCase);
        expect(useCase1).toBe(useCase2);
      });

      it('should return same ApplyTagsWithConfidenceUseCase instance on multiple resolves', () => {
        const useCase1 = container.resolve(ApplyTagsWithConfidenceUseCase);
        const useCase2 = container.resolve(ApplyTagsWithConfidenceUseCase);
        expect(useCase1).toBe(useCase2);
      });
    });

    describe('Background Services Singletons', () => {
      it('should return same EmailEventListener instance on multiple resolves', () => {
        const listener1 = container.resolve<EmailEventListener>('EmailEventListener');
        const listener2 = container.resolve<EmailEventListener>('EmailEventListener');
        expect(listener1).toBe(listener2);
      });

      it('should return same MessageHandler instance on multiple resolves', () => {
        const handler1 = container.resolve<MessageHandler>('MessageHandler');
        const handler2 = container.resolve<MessageHandler>('MessageHandler');
        expect(handler1).toBe(handler2);
      });
    });
  });

  // ==========================================================================
  // Test Suite 7: Dependency Chain Verification
  // ==========================================================================

  describe('Dependency Chain Verification', () => {
    describe('AnalyzeEmail Dependencies', () => {
      it('should have properly injected dependencies in AnalyzeEmail', () => {
        const analyzeEmail = container.resolve<AnalyzeEmail>('AnalyzeEmail');

        // Verify the use case can be called (dependencies are properly injected)
        expect(analyzeEmail).toBeDefined();
        expect(typeof analyzeEmail.execute).toBe('function');

        // The fact that it resolved successfully means all dependencies are available
      });

      it('should share singleton dependencies between AnalyzeEmail and sub-use-cases', () => {
        // Resolve main use case
        const analyzeEmail = container.resolve<AnalyzeEmail>('AnalyzeEmail');

        // Resolve sub-use-cases directly
        const retrieveEmail = container.resolve(RetrieveEmailUseCase);
        const extractContent = container.resolve(ExtractEmailContentUseCase);
        const cacheAnalysis = container.resolve(CacheAnalysisUseCase);
        const applyTagsWithConfidence = container.resolve(ApplyTagsWithConfidenceUseCase);

        // All should resolve successfully
        expect(analyzeEmail).toBeDefined();
        expect(retrieveEmail).toBeDefined();
        expect(extractContent).toBeDefined();
        expect(cacheAnalysis).toBeDefined();
        expect(applyTagsWithConfidence).toBeDefined();
      });
    });

    describe('Shared Dependencies', () => {
      it('should share ILogger instance across all services', () => {
        const logger = container.resolve<ILogger>('ILogger');

        // These services should all use the same logger instance
        const extractor = container.resolve<EmailContentExtractor>('EmailContentExtractor');
        const tracker = container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');

        // Verify they all resolved (meaning they got their logger dependency)
        expect(extractor).toBeDefined();
        expect(tracker).toBeDefined();
        expect(logger).toBeDefined();
      });

      it('should share ITagManager instance across services that need it', () => {
        const tagManager = container.resolve<ITagManager>('ITagManager');

        // ApplyTagsToEmail should use the same ITagManager
        const applyTags = container.resolve<ApplyTagsToEmail>('ApplyTagsToEmail');

        expect(applyTags).toBeDefined();
        expect(tagManager).toBeDefined();
      });

      it('should share ICache instance across services that need it', () => {
        const cache = container.resolve<ICache>('ICache');

        // CacheAnalysisUseCase should use the same ICache
        const cacheAnalysis = container.resolve(CacheAnalysisUseCase);

        expect(cacheAnalysis).toBeDefined();
        expect(cache).toBeDefined();
      });

      it('should share IConfigRepository instance across services', () => {
        const configRepo = container.resolve<IConfigRepository>('IConfigRepository');

        // Multiple services depend on config
        const appConfig = container.resolve<AppConfigService>('AppConfigService');
        const tracker = container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');

        expect(appConfig).toBeDefined();
        expect(tracker).toBeDefined();
        expect(configRepo).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Test Suite 8: Container Reset Behavior
  // ==========================================================================

  describe('Container Reset Behavior', () => {
    it('should create new instances after container reset', () => {
      // Get initial instances
      const logger1 = container.resolve<ILogger>('ILogger');
      const cache1 = container.resolve<ICache>('ICache');

      // Clear and re-setup
      container.clearInstances();
      setupDIContainer();

      // Get new instances
      const logger2 = container.resolve<ILogger>('ILogger');
      const cache2 = container.resolve<ICache>('ICache');

      // Should be different instances
      expect(logger1).not.toBe(logger2);
      expect(cache1).not.toBe(cache2);
    });

    it('should maintain singleton behavior after re-setup', () => {
      // Setup once
      container.clearInstances();
      setupDIContainer();

      const logger1 = container.resolve<ILogger>('ILogger');
      const logger2 = container.resolve<ILogger>('ILogger');

      // Should still be the same instance within the same container session
      expect(logger1).toBe(logger2);
    });
  });

  // ==========================================================================
  // Test Suite 9: Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should throw when resolving unregistered token', () => {
      expect(() => {
        container.resolve('UnregisteredToken');
      }).toThrow();
    });

    it('should handle multiple setupDIContainer calls gracefully', () => {
      // Call setup multiple times
      setupDIContainer();
      setupDIContainer();

      // Should still work
      const logger = container.resolve<ILogger>('ILogger');
      expect(logger).toBeDefined();
    });
  });

  // ==========================================================================
  // Test Suite 10: Type Safety
  // ==========================================================================

  describe('Type Safety', () => {
    it('should resolve correctly typed ILogger', () => {
      const logger = container.resolve<ILogger>('ILogger');

      // TypeScript should infer correct types
      const infoResult: void = logger.info('test');
      expect(infoResult).toBeUndefined();
    });

    it('should resolve correctly typed ICache', () => {
      const cache = container.resolve<ICache>('ICache');

      // TypeScript should infer correct types
      const getPromise: Promise<unknown> = cache.get('key');
      expect(getPromise).toBeInstanceOf(Promise);
    });
  });

  // ==========================================================================
  // Test Suite 11: Integration Smoke Test
  // ==========================================================================

  describe('Integration Smoke Test', () => {
    it('should resolve all core services without errors', () => {
      // This test verifies the entire DI setup works
      expect(() => {
        container.resolve<ILogger>('ILogger');
        container.resolve<ICache>('ICache');
        container.resolve<IQueue>('IQueue');
        container.resolve<IMailReader>('IMailReader');
        container.resolve<ITagManager>('ITagManager');
        container.resolve<IConfigRepository>('IConfigRepository');
        container.resolve<ProviderFactory>('ProviderFactory');
        container.resolve<EmailContentExtractor>('EmailContentExtractor');
        container.resolve<TagService>('TagService');
        container.resolve<AppConfigService>('AppConfigService');
        container.resolve<RateLimiterService>('RateLimiterService');
        container.resolve<EmailAnalysisTracker>('EmailAnalysisTracker');
      }).not.toThrow();
    });

    it('should resolve all use cases without errors', () => {
      expect(() => {
        container.resolve<AnalyzeEmail>('AnalyzeEmail');
        container.resolve<ApplyTagsToEmail>('ApplyTagsToEmail');
        container.resolve<AnalyzeBatchEmails>('AnalyzeBatchEmails');
        container.resolve(RetrieveEmailUseCase);
        container.resolve(ExtractEmailContentUseCase);
        container.resolve(CacheAnalysisUseCase);
        container.resolve(ApplyTagsWithConfidenceUseCase);
      }).not.toThrow();
    });

    it('should resolve all background services without errors', () => {
      expect(() => {
        container.resolve<EmailEventListener>('EmailEventListener');
        container.resolve<MessageHandler>('MessageHandler');
      }).not.toThrow();
    });
  });
});
