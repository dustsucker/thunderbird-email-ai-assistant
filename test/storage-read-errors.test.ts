/**
 * Tests for Issue #33: storage/config READ errors must not silently become
 * defaults (wrong tagset / wrong provider), while a genuinely missing key
 * ("not set") may still fall back to defaults. Only writes may seed defaults.
 *
 * @module test/storage-read-errors.test
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageLocalConfigRepository, ConfigNotSetError } from '@/infrastructure/repositories/StorageLocalConfigRepository';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { ProviderSettingsService } from '@/interfaces/shared/ProviderSettingsService';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { TagHistoryRepository } from '@/infrastructure/storage/TagHistoryRepository';
import { TAG_HISTORY_STORAGE_KEY } from '@/shared/types/TagHistory';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { IProvider } from '@/infrastructure/interfaces/IProvider';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { IEmailMessage, IMailReader } from '@/infrastructure/interfaces/IMailReader';
import { ProviderFactory } from '@/infrastructure/providers/ProviderFactory';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import { RetrieveEmailUseCase } from '@/application/use-cases/RetrieveEmailUseCase';
import { ExtractEmailContentUseCase } from '@/application/use-cases/ExtractEmailContentUseCase';
import { CacheAnalysisUseCase } from '@/application/use-cases/CacheAnalysisUseCase';
import { ApplyTagsWithConfidenceUseCase } from '@/application/use-cases/ApplyTagsWithConfidenceUseCase';
import { EmailContentExtractor } from '@/domain/services/EmailContentExtractor';

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn((key?: string) => key ?? 'not set'),
  } as unknown as ILogger;
}

function mockGlobalBrowserStorage(getBehavior: (keys: string) => Promise<Record<string, unknown>>) {
  (globalThis as unknown as Record<string, unknown>).browser = {
    storage: {
      local: {
        get: vi.fn(getBehavior),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        clear: vi.fn(async () => undefined),
      },
    },
  };
}

// ============================================================================
// StorageLocalConfigRepository — read errors vs. not-set
// ============================================================================

describe('StorageLocalConfigRepository (issue #33)', () => {
  let mockLogger: ILogger;
  let repository: StorageLocalConfigRepository;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).browser;
  });

  describe('getCustomTags', () => {
    it('rejects on storage read failure instead of returning []', async () => {
      mockGlobalBrowserStorage(async () => {
        throw new Error('Database is locked');
      });
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getCustomTags()).rejects.toThrow(
        'Failed to get custom tags: Database is locked'
      );
    });

    it('rejects on corrupt (non-array) customTags data', async () => {
      mockGlobalBrowserStorage(async () => ({ customTags: { corrupted: true } }));
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getCustomTags()).rejects.toThrow(
        'Custom tags storage is corrupt: expected array'
      );
    });

    it('returns [] when the key is not set (deliberately empty)', async () => {
      mockGlobalBrowserStorage(async () => ({}));
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getCustomTags()).resolves.toEqual([]);
    });

    it('filters invalid entries but keeps valid ones (validate pattern)', async () => {
      mockGlobalBrowserStorage(async () => ({
        customTags: [
          { key: 'is_bill', name: 'Bill', color: '#f4b136' },
          null,
          42,
          { key: '', name: 'NoKey' },
          { name: 'NoKeyField' },
          { key: 'is_personal', name: 'Personal', color: '#4CAF50' },
        ],
      }));
      repository = new StorageLocalConfigRepository(mockLogger);

      const tags = await repository.getCustomTags();
      expect(tags.map((t) => t.key)).toEqual(['is_bill', 'is_personal']);
    });
  });

  describe('getAppConfig', () => {
    it('rejects on storage read failure instead of returning defaults', async () => {
      mockGlobalBrowserStorage(async () => {
        throw new Error('Storage unavailable');
      });
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getAppConfig()).rejects.toThrow(
        'Failed to get application config: Storage unavailable'
      );
    });

    it('throws ConfigNotSetError (not a generic error) when the key is missing', async () => {
      mockGlobalBrowserStorage(async () => ({}));
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getAppConfig()).rejects.toBeInstanceOf(ConfigNotSetError);
    });
  });

  describe('getProviderSettings', () => {
    it('rejects on storage read failure', async () => {
      mockGlobalBrowserStorage(async () => {
        throw new Error('Quota exceeded');
      });
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getProviderSettings('openai')).rejects.toThrow('Quota exceeded');
    });

    it('throws ConfigNotSetError when the key is missing', async () => {
      mockGlobalBrowserStorage(async () => ({}));
      repository = new StorageLocalConfigRepository(mockLogger);

      await expect(repository.getProviderSettings('openai')).rejects.toBeInstanceOf(
        ConfigNotSetError
      );
    });
  });
});

// ============================================================================
// AppConfigService — defaults only for not-set, errors propagate
// ============================================================================

describe('AppConfigService (issue #33)', () => {
  let mockLogger: ILogger;
  let configRepository: IConfigRepository;
  let service: AppConfigService;

  beforeEach(() => {
    mockLogger = createMockLogger();
    configRepository = {
      getProviderSettings: vi.fn(),
      setProviderSettings: vi.fn(),
      getAllProviderSettings: vi.fn(),
      getCustomTags: vi.fn(),
      setCustomTags: vi.fn(),
      getAppConfig: vi.fn(),
      setAppConfig: vi.fn(),
      clearAll: vi.fn(),
    };
    service = new AppConfigService(mockLogger, configRepository);
  });

  it('getAppConfig propagates read errors instead of returning Ollama defaults', async () => {
    vi.mocked(configRepository.getAppConfig).mockRejectedValue(new Error('Storage failed'));

    await expect(service.getAppConfig()).rejects.toThrow('Storage failed');
    // Wrong-provider default must never be produced silently:
    expect(mockLogger.debug).not.toHaveBeenCalledWith(
      'App config not set, using defaults',
      expect.anything()
    );
  });

  it('getAppConfig returns Ollama defaults only when the key is not set', async () => {
    vi.mocked(configRepository.getAppConfig).mockRejectedValue(
      new ConfigNotSetError('Application configuration not found')
    );

    const config = await service.getAppConfig();
    expect(config.defaultProvider).toBe('ollama');
  });

  it('getProviderSettings propagates read errors instead of fallback settings', async () => {
    vi.mocked(configRepository.getProviderSettings).mockRejectedValue(
      new Error('Storage corrupted')
    );

    await expect(service.getProviderSettings('openai')).rejects.toThrow('Storage corrupted');
  });

  it('getProviderSettings returns fallback settings only when not set', async () => {
    vi.mocked(configRepository.getProviderSettings).mockRejectedValue(
      new ConfigNotSetError('Provider settings not found for provider: openai')
    );

    const settings = await service.getProviderSettings('openai');
    expect(settings.model).toBe('gpt-4o-mini');
  });

  it('getCustomTags propagates read errors instead of returning default tags', async () => {
    vi.mocked(configRepository.getCustomTags).mockRejectedValue(new Error('DB locked'));

    await expect(service.getCustomTags()).rejects.toThrow('DB locked');
  });

  it('getCustomTags returns [] as-is when not configured (no default substitution)', async () => {
    vi.mocked(configRepository.getCustomTags).mockResolvedValue([]);

    await expect(service.getCustomTags()).resolves.toEqual([]);
  });
});

// ============================================================================
// ProviderSettingsService — no more {provider:''} on read errors
// ============================================================================

describe('ProviderSettingsService (issue #33)', () => {
  it('propagates read errors instead of returning {provider: ""}', async () => {
    const appConfigService = {
      getAppConfig: vi.fn().mockRejectedValue(new Error('Storage read failed')),
    };
    const service = new ProviderSettingsService(
      appConfigService as unknown as AppConfigService,
      createMockLogger()
    );

    await expect(service.getProviderSettings()).rejects.toThrow('Storage read failed');
  });
});

// ============================================================================
// AnalyzeEmail — read errors abort the analysis (no silent empty tagset)
// ============================================================================

describe('AnalyzeEmail loadCustomTags (issue #33)', () => {
  it('aborts the analysis when custom tags cannot be read', async () => {
    const logger = createMockLogger();
    const mockEmail: IEmailMessage = {
      id: 123,
      subject: 'Test Subject',
      from: 'test@example.com',
      to: ['recipient@example.com'],
      body: 'Test body',
      headers: {},
      attachments: [],
    };
    const mailReader: IMailReader = {
      getFullMessage: vi.fn().mockResolvedValue(mockEmail),
    } as unknown as IMailReader;
    const tagManager = { setTagsOnMessage: vi.fn() } as unknown as ITagManager;
    const providerAnalyze = vi.fn();
    const mockProvider: IProvider = {
      providerId: 'openai',
      validateSettings: vi.fn().mockResolvedValue(true),
      analyze: providerAnalyze,
    };
    const providerFactory = {
      getProvider: vi.fn().mockReturnValue(mockProvider),
      registerProvider: vi.fn(),
    } as unknown as ProviderFactory;
    const cache: ICache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as unknown as ICache;
    const analysisTracker = {
      wasAnalyzed: vi.fn().mockResolvedValue(false),
      markAnalyzed: vi.fn(),
    } as unknown as EmailAnalysisTracker;
    const configRepository: IConfigRepository = {
      getProviderSettings: vi.fn(),
      setProviderSettings: vi.fn(),
      getAllProviderSettings: vi.fn(),
      getCustomTags: vi.fn().mockRejectedValue(new Error('Failed to get custom tags: DB locked')),
      setCustomTags: vi.fn(),
      getAppConfig: vi.fn(),
      setAppConfig: vi.fn(),
      clearAll: vi.fn(),
    };

    const analyzeEmail = new AnalyzeEmail(
      providerFactory,
      configRepository,
      analysisTracker,
      logger,
      new RetrieveEmailUseCase(mailReader, logger),
      new ExtractEmailContentUseCase(new EmailContentExtractor(logger), logger),
      new CacheAnalysisUseCase(cache, logger),
      new ApplyTagsWithConfidenceUseCase(
        tagManager,
        configRepository,
        { recordChange: vi.fn().mockResolvedValue(undefined) } as unknown as TagHistoryRepository,
        logger
      )
    );

    const providerSettings: IProviderSettings = {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'test-key',
    };
    await expect(analyzeEmail.execute('123', providerSettings)).rejects.toThrow(
      'Failed to get custom tags: DB locked'
    );
    // The provider must never run with a silently substituted tagset:
    expect(providerAnalyze).not.toHaveBeenCalled();
  });
});

// ============================================================================
// TagHistoryRepository — corrupt history throws instead of being overwritten
// ============================================================================

describe('TagHistoryRepository corruption handling (issue #33)', () => {
  let mockLogger: ILogger;
  let storageSet: ReturnType<typeof vi.fn>;
  let storageGet: ReturnType<typeof vi.fn>;
  let repository: TagHistoryRepository;

  beforeEach(() => {
    mockLogger = createMockLogger();
    storageSet = vi.fn(async () => undefined);
    (globalThis as unknown as Record<string, unknown>).messenger = {
      storage: {
        local: {
          get: storageGet = vi.fn(async () => ({})),
          set: storageSet,
          remove: vi.fn(async () => undefined),
        },
      },
    };
    repository = new TagHistoryRepository(
      mockLogger,
      { now: vi.fn(() => 1700000000000) } as never,
      { uuid: vi.fn(() => 'test-uuid') } as never
    );
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).messenger;
  });

  it('getLatestForMessage rejects on corrupt (non-array) history', async () => {
    storageGet.mockResolvedValue({ [TAG_HISTORY_STORAGE_KEY]: { corrupted: true } });

    await expect(repository.getLatestForMessage('123')).rejects.toThrow(
      'Tag history storage is corrupt'
    );
  });

  it('recordChange rejects on corrupt history and never overwrites it', async () => {
    storageGet.mockResolvedValue({ [TAG_HISTORY_STORAGE_KEY]: 'garbage' });

    await expect(repository.recordChange('123', [], [], [])).rejects.toThrow(
      'Tag history storage is corrupt'
    );
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('filters invalid entries but keeps well-formed history items', async () => {
    storageGet.mockResolvedValue({
      [TAG_HISTORY_STORAGE_KEY]: [
        {
          id: 'h1',
          messageId: '123',
          timestamp: 1,
          addedTags: [],
          removedTags: [],
          previousTags: [],
        },
        null,
        'not-an-item',
      ],
    });

    const latest = await repository.getLatestForMessage('123');
    expect(latest?.id).toBe('h1');
  });

  it('treats a missing key as empty history', async () => {
    storageGet.mockResolvedValue({});

    await expect(repository.getLatestForMessage('123')).resolves.toBeNull();
  });
});
