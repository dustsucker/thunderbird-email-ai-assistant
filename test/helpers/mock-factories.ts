/**
 * Mock Factories for Tests
 *
 * Provides consistent mock implementations for commonly used interfaces.
 *
 * @module test/helpers/mock-factories
 */

import { vi } from 'vitest';
import type { ILogger } from '@/domain/interfaces/ILogger';
import type { ICache, ICacheStats } from '@/infrastructure/interfaces/ICache';
import type {
  IConfigRepository,
  IAppConfig,
  ICustomTag,
  IProviderSettings,
} from '@/infrastructure/interfaces/IConfigRepository';

// ============================================================================
// Logger Mock
// ============================================================================

/**
 * Creates a mock ILogger instance.
 */
export function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn((key?: string) => {
      if (!key) return 'not set';
      if (key.length <= 10) return '***';
      return `${key.substring(0, 7)}...${key.substring(key.length - 3)}`;
    }),
  };
}

// ============================================================================
// Cache Mock
// ============================================================================

/**
 * Creates a mock ICache instance with an in-memory store.
 */
export function createMockCache(): ICache {
  const store = new Map<string, { value: unknown; timestamp: number; ttl?: number }>();
  let hitCount = 0;
  let missCount = 0;

  return {
    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | null> => {
      const entry = store.get(key);
      if (!entry) {
        missCount++;
        return null;
      }
      if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
        store.delete(key);
        missCount++;
        return null;
      }
      hitCount++;
      return entry.value as T;
    }) as <T>(key: string) => Promise<T | null>,

    set: vi.fn(async <T>(key: string, value: T, ttl?: number): Promise<void> => {
      store.set(key, { value, timestamp: Date.now(), ttl });
    }),

    delete: vi.fn(async (key: string): Promise<void> => {
      store.delete(key);
    }),

    clear: vi.fn(async (): Promise<void> => {
      store.clear();
      hitCount = 0;
      missCount = 0;
    }),

    has: vi.fn(async (key: string): Promise<boolean> => {
      const entry = store.get(key);
      if (!entry) return false;
      if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
        store.delete(key);
        return false;
      }
      return true;
    }),

    cleanupExpired: vi.fn(async (): Promise<number> => {
      let cleaned = 0;
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (entry.ttl && now > entry.timestamp + entry.ttl) {
          store.delete(key);
          cleaned++;
        }
      }
      return cleaned;
    }),

    getStats: vi.fn(async (): Promise<ICacheStats> => {
      const total = hitCount + missCount;
      return {
        totalEntries: store.size,
        hitRate: total > 0 ? Math.round((hitCount / total) * 10000) / 100 : 0,
      };
    }),
  };
}

// ============================================================================
// Config Repository Mock
// ============================================================================

/**
 * Creates default app config for testing.
 */
export function createDefaultAppConfig(): IAppConfig {
  return {
    defaultProvider: 'openai',
    enableNotifications: true,
    enableLogging: false,
    minConfidenceThreshold: 70,
  };
}

/**
 * Creates default provider settings for testing.
 */
export function createDefaultProviderSettings(): IProviderSettings {
  return {
    apiKey: 'test-api-key',
    model: 'gpt-4',
  };
}

/**
 * Creates a mock IConfigRepository instance.
 */
export function createMockConfigRepository(): IConfigRepository {
  const appConfig: IAppConfig = createDefaultAppConfig();
  const providerSettings: Record<string, IProviderSettings> = {
    openai: createDefaultProviderSettings(),
  };
  let customTags: ICustomTag[] = [];

  return {
    getAppConfig: vi.fn(async (): Promise<IAppConfig> => ({ ...appConfig })),

    setAppConfig: vi.fn(async (config: IAppConfig): Promise<void> => {
      Object.assign(appConfig, config);
    }),

    getProviderSettings: vi.fn(async (providerId: string): Promise<IProviderSettings> => {
      const settings = providerSettings[providerId];
      if (!settings) {
        throw new Error(`Provider settings not found: ${providerId}`);
      }
      return { ...settings };
    }),

    setProviderSettings: vi.fn(
      async (providerId: string, settings: IProviderSettings): Promise<void> => {
        providerSettings[providerId] = { ...settings };
      }
    ),

    getAllProviderSettings: vi.fn(async (): Promise<Record<string, IProviderSettings>> => {
      return { ...providerSettings };
    }),

    getCustomTags: vi.fn(async (): Promise<ICustomTag[]> => {
      return [...customTags];
    }),

    setCustomTags: vi.fn(async (tags: ICustomTag[]): Promise<void> => {
      customTags = [...tags];
    }),

    clearAll: vi.fn(async (): Promise<void> => {
      Object.keys(providerSettings).forEach((key) => delete providerSettings[key]);
      customTags = [];
    }),
  };
}
