/**
 * Unit tests for StorageLocalConfigRepository.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from 'vitest';
import { StorageLocalConfigRepository, ConfigNotSetError } from '../src/infrastructure/repositories/StorageLocalConfigRepository';
import type { ILogger } from '../src/infrastructure/interfaces/ILogger';
import type {
  IProviderSettings,
  ICustomTag,
  IAppConfig,
} from '../src/infrastructure/interfaces/IConfigRepository';

// === Mock Browser API ===

function createMockBrowserStorage() {
  const storage = new Map<string, Record<string, unknown>>();

  return {
    get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
      const result: Record<string, unknown> = {};

      if (keys === null || typeof keys === 'string') {
        if (keys === null || storage.has(keys)) {
          const key = keys === null ? Array.from(storage.keys())[0] : keys;
          if (key && storage.has(key)) {
            result[key] = storage.get(key);
          }
        }
      } else if (Array.isArray(keys)) {
        for (const key of keys) {
          if (storage.has(key)) {
            result[key] = storage.get(key);
          }
        }
      } else if (typeof keys === 'object') {
        for (const key of Object.keys(keys)) {
          if (storage.has(key)) {
            result[key] = storage.get(key);
          }
        }
      }

      return result;
    }),

    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        storage.set(key, value as Record<string, unknown>);
      }
    }),

    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        storage.delete(key);
      }
    }),

    clear: vi.fn(async () => {
      storage.clear();
    }),

    _getStorage: () => storage,
  };
}

function mockGlobalBrowserStorage() {
  const mockStorage = createMockBrowserStorage();

  (globalThis as unknown as Record<string, unknown>).browser = {
    storage: {
      local: {
        get: mockStorage.get,
        set: mockStorage.set,
        remove: mockStorage.remove,
        clear: mockStorage.clear,
      },
    },
  };

  return mockStorage;
}

// === Test Fixtures ===

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn((key?: string) =>
      key ? `${key.slice(0, 7)}...${key.slice(-3)}` : 'not set'
    ),
  };
}

const sampleProviderSettings: IProviderSettings = {
  apiKey: 'sk-test-key-123',
  model: 'gpt-4',
  apiUrl: 'https://api.example.com/v1',
  additionalConfig: {
    temperature: 0.7,
  },
};

const sampleCustomTags: ICustomTag[] = [
  {
    key: 'is_advertise',
    name: 'Advertisement',
    color: '#FFC107',
    prompt: 'Check if email is advertising something',
  },
  {
    key: 'is_personal',
    name: 'Personal',
    color: '#4CAF50',
    prompt: 'Check if this is personal email',
  },
];

const sampleAppConfig: IAppConfig = {
  defaultProvider: 'openai',
  enableNotifications: true,
  enableLogging: true,
  modelConcurrencyLimits: [
    {
      provider: 'openai',
      model: 'gpt-4',
      concurrency: 10,
    },
    {
      provider: 'ollama',
      concurrency: 5,
    },
  ],
};

// === Test Suite ===

describe('StorageLocalConfigRepository', () => {
  let repository: StorageLocalConfigRepository;
  let mockLogger: ILogger;
  let mockStorage: ReturnType<typeof createMockBrowserStorage>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockStorage = mockGlobalBrowserStorage();
    repository = new StorageLocalConfigRepository(mockLogger);
  });

  afterEach(() => {
    // Clean up global mock
    delete (globalThis as unknown as Record<string, unknown>).browser;
    delete (globalThis as unknown as Record<string, unknown>).chrome;
  });

  // === Provider Settings Tests ===

  describe('Provider Settings', () => {
    it('should set and get provider settings', async () => {
      const providerId = 'openai';

      await repository.setProviderSettings(providerId, sampleProviderSettings);
      const retrieved = await repository.getProviderSettings(providerId);

      expect(retrieved).toEqual(sampleProviderSettings);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Saved provider settings for ${providerId}`,
        expect.objectContaining({
          providerId,
          hasApiKey: true,
          model: 'gpt-4',
        })
      );
    });

    it('should throw ConfigNotSetError when getting non-existent provider settings', async () => {
      await expect(repository.getProviderSettings('nonexistent')).rejects.toBeInstanceOf(
        ConfigNotSetError
      );
      await expect(repository.getProviderSettings('nonexistent')).rejects.toThrow(
        'Provider settings not found for provider: nonexistent'
      );
    });

    it('should get all provider settings', async () => {
      const settings2: IProviderSettings = {
        apiKey: 'ollama-key',
        model: 'llama2',
      };

      await repository.setProviderSettings('openai', sampleProviderSettings);
      await repository.setProviderSettings('ollama', settings2);

      const allSettings = await repository.getAllProviderSettings();

      expect(allSettings).toEqual({
        openai: sampleProviderSettings,
        ollama: settings2,
      });
    });

    it('should return empty object when no provider settings exist', async () => {
      const allSettings = await repository.getAllProviderSettings();

      expect(allSettings).toEqual({});
    });

    it('should overwrite existing provider settings', async () => {
      const providerId = 'openai';

      await repository.setProviderSettings(providerId, sampleProviderSettings);

      const updatedSettings: IProviderSettings = {
        apiKey: 'new-key',
        model: 'gpt-4-turbo',
      };

      await repository.setProviderSettings(providerId, updatedSettings);
      const retrieved = await repository.getProviderSettings(providerId);

      expect(retrieved).toEqual(updatedSettings);
      expect(retrieved).not.toEqual(sampleProviderSettings);
    });

    it('serializes concurrent writes so none are lost (#22)', async () => {
      // Force read interleaving: without the write queue both writers read the
      // empty store before either persists, and one update is lost.
      const realGet = (
        mockStorage.get as ReturnType<typeof vi.fn>
      ).getMockImplementation() as ((keys: unknown) => Promise<unknown>) | undefined;
      (mockStorage.get as ReturnType<typeof vi.fn>).mockImplementation(async (keys: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return realGet?.(keys);
      });

      await Promise.all([
        repository.setProviderSettings('openai', sampleProviderSettings),
        repository.setProviderSettings('ollama', { apiKey: 'k', model: 'm' }),
      ]);

      const all = await repository.getAllProviderSettings();
      expect(Object.keys(all).sort()).toEqual(['ollama', 'openai']);
    });
  });

  // === Custom Tags Tests ===

  describe('Custom Tags', () => {
    it('should set and get custom tags', async () => {
      await repository.setCustomTags(sampleCustomTags);
      const retrieved = await repository.getCustomTags();

      expect(retrieved).toEqual(sampleCustomTags);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[CONFIG-REPO] Custom tags saved successfully',
        { count: 2 }
      );
    });

    it('should return empty array when no custom tags exist', async () => {
      const tags = await repository.getCustomTags();

      expect(tags).toEqual([]);
    });

    it('should overwrite existing custom tags', async () => {
      await repository.setCustomTags(sampleCustomTags);

      const newTags: ICustomTag[] = [
        {
          key: 'new_tag',
          name: 'New Tag',
          color: '#123456',
        },
      ];

      await repository.setCustomTags(newTags);
      const retrieved = await repository.getCustomTags();

      expect(retrieved).toEqual(newTags);
      expect(retrieved).toHaveLength(1);
    });

    it('should handle empty custom tags array', async () => {
      await repository.setCustomTags([]);
      const tags = await repository.getCustomTags();

      expect(tags).toEqual([]);
    });
  });

  // === App Config Tests ===

  describe('App Config', () => {
    it('should set and get app config', async () => {
      await repository.setAppConfig(sampleAppConfig);
      const retrieved = await repository.getAppConfig();

      expect(retrieved).toEqual(sampleAppConfig);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Saved application config',
        expect.objectContaining({
          defaultProvider: 'openai',
          enableNotifications: true,
        })
      );
    });

    it('should throw ConfigNotSetError when app config does not exist', async () => {
      await expect(repository.getAppConfig()).rejects.toBeInstanceOf(ConfigNotSetError);
    });

    it('should update existing app config', async () => {
      await repository.setAppConfig(sampleAppConfig);

      const updatedConfig: IAppConfig = {
        ...sampleAppConfig,
        defaultProvider: 'ollama',
        enableNotifications: false,
      };

      await repository.setAppConfig(updatedConfig);
      const retrieved = await repository.getAppConfig();

      expect(retrieved).toEqual(updatedConfig);
      expect(retrieved.defaultProvider).toBe('ollama');
      expect(retrieved.enableNotifications).toBe(false);
    });

    it('should handle config without concurrency limits', async () => {
      const configWithoutLimits: IAppConfig = {
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: false,
      };

      await repository.setAppConfig(configWithoutLimits);
      const retrieved = await repository.getAppConfig();

      expect(retrieved.modelConcurrencyLimits).toBeUndefined();
    });
  });

  // === Clear All Tests ===

  describe('Clear All', () => {
    it('should clear all configuration data', async () => {
      await repository.setProviderSettings('openai', sampleProviderSettings);
      await repository.setCustomTags(sampleCustomTags);
      await repository.setAppConfig(sampleAppConfig);

      await repository.clearAll();

      const allSettings = await repository.getAllProviderSettings();
      const tags = await repository.getCustomTags();

      expect(allSettings).toEqual({});
      expect(tags).toEqual([]);
      await expect(repository.getAppConfig()).rejects.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleared all configuration data');

      // SECURITY (#13): only the repository-owned keys are removed; the whole
      // storage.local (which holds API keys + processed_-trackers) is never wiped.
      expect(mockStorage.remove).toHaveBeenCalledWith([
        'providerSettings',
        'customTags',
        'appConfig',
      ]);
      expect(mockStorage.clear).not.toHaveBeenCalled();
    });
  });

  // === Error Handling Tests ===

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      const errorMessage = 'Storage quota exceeded';
      mockStorage.set.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        repository.setProviderSettings('openai', sampleProviderSettings)
      ).rejects.toThrow('Failed to save provider settings for openai: Storage quota exceeded');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save provider settings for openai',
        expect.objectContaining({
          providerId: 'openai',
          error: errorMessage,
        })
      );
    });

    it('should handle get errors gracefully', async () => {
      const errorMessage = 'Database error';
      mockStorage.get.mockRejectedValueOnce(new Error(errorMessage));

      await expect(repository.getCustomTags()).rejects.toThrow(
        `Failed to get custom tags: ${errorMessage}`
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[CONFIG-REPO] Failed to get custom tags',
        expect.objectContaining({
          error: errorMessage,
        })
      );
    });
  });

  // === Type Safety Tests ===

  describe('Type Safety', () => {
    it('should preserve IProviderSettings type', async () => {
      await repository.setProviderSettings('test', sampleProviderSettings);
      const settings = await repository.getProviderSettings('test');

      expectTypeOf(settings).toMatchTypeOf<IProviderSettings>();
      expect(settings.apiKey).toBeTypeOf('string');
      expect(settings.model).toBeTypeOf('string');
      expect(settings.apiUrl).toBeTypeOf('string');
      expect(settings.additionalConfig).toBeTypeOf('object');
    });

    it('should preserve ICustomTag type', async () => {
      await repository.setCustomTags(sampleCustomTags);
      const tags = await repository.getCustomTags();

      expectTypeOf(tags).toMatchTypeOf<ICustomTag[]>();
      tags.forEach((tag) => {
        expect(tag.key).toBeTypeOf('string');
        expect(tag.name).toBeTypeOf('string');
        expect(tag.color).toBeTypeOf('string');
        if (tag.prompt) {
          expect(tag.prompt).toBeTypeOf('string');
        }
      });
    });

    it('should preserve IAppConfig type', async () => {
      await repository.setAppConfig(sampleAppConfig);
      const config = await repository.getAppConfig();

      expectTypeOf(config).toMatchTypeOf<IAppConfig>();
      expect(config.defaultProvider).toBeTypeOf('string');
      expect(config.enableNotifications).toBeTypeOf('boolean');
      expect(config.enableLogging).toBeTypeOf('boolean');
      expect(config.modelConcurrencyLimits).toBeTypeOf('object');
    });
  });

  // === Browser API Compatibility Tests ===

  describe('Browser API Compatibility', () => {
    it('should throw error when browser API is not available', () => {
      delete (globalThis as unknown as Record<string, unknown>).browser;

      expect(() => new StorageLocalConfigRepository(mockLogger)).toThrow(
        'browser.storage API not available'
      );
    });
  });
});
