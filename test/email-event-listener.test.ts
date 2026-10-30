/**
 * Unit tests for EmailEventListener.
 *
 * DW5: the new-mail path must resolve provider settings via
 * AppConfigService (appConfig.defaultProvider + providerSettings[defaultProvider]),
 * seeded exactly as options.ts writes it to storage.local.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailEventListener } from '@/interfaces/background/EmailEventListener';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { StorageLocalConfigRepository } from '@/infrastructure/repositories/StorageLocalConfigRepository';

// ============================================================================
// Fixtures
// ============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn(),
  };
}

const mockFolder = {
  accountId: 'account1',
  name: 'INBOX',
  type: 'inbox',
  path: '/INBOX',
};

const mockMessages = {
  messages: [{ id: 123 }, { id: 456 }],
};

// ============================================================================
// Test Suite
// ============================================================================

describe('EmailEventListener', () => {
  let logger: ILogger;
  let analyzeBatch: AnalyzeBatchEmails;
  let listener: EmailEventListener;
  let storageData: Record<string, unknown>;
  let analyzeBatchExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createMockLogger();

    analyzeBatchExecute = vi.fn().mockResolvedValue({
      total: 2,
      successCount: 2,
      failureCount: 0,
      results: [
        { messageId: '123', success: true, tags: ['work'] },
        { messageId: '456', success: true, tags: ['personal'] },
      ],
      cancelled: false,
    });
    analyzeBatch = { execute: analyzeBatchExecute } as unknown as AnalyzeBatchEmails;

    // storage.local seeded exactly as options.ts writes it:
    // appConfig (with defaultProvider) + providerSettings (keyed by provider)
    storageData = {
      appConfig: {
        defaultProvider: 'openai',
        enableNotifications: true,
        enableLogging: true,
      },
      providerSettings: {
        openai: { apiKey: 'sk-test-key', model: 'gpt-4o-mini' },
      },
    };

    (globalThis as unknown as Record<string, unknown>).browser = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
            const result: Record<string, unknown> = {};
            if (typeof keys === 'string') {
              if (keys in storageData) result[keys] = storageData[keys];
            } else if (Array.isArray(keys)) {
              for (const key of keys) if (key in storageData) result[key] = storageData[key];
            } else if (keys && typeof keys === 'object') {
              for (const key of Object.keys(keys)) {
                result[key] = key in storageData ? storageData[key] : (keys as Record<string, unknown>)[key];
              }
            } else {
              Object.assign(result, storageData);
            }
            return result;
          }),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete storageData[key];
          }),
          clear: vi.fn(async () => undefined),
        },
      },
    };

    const configRepo = new StorageLocalConfigRepository(logger);
    const appConfigService = new AppConfigService(logger, configRepo);

    listener = new EmailEventListener(analyzeBatch, logger, appConfigService);

    (globalThis as unknown as Record<string, unknown>).messenger = {
      messages: {
        onNewMailReceived: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).browser;
    delete (globalThis as unknown as Record<string, unknown>).messenger;
  });

  describe('DW5: provider settings resolution', () => {
    it('resolves non-empty provider settings from options.ts-shaped storage', async () => {
      const handler = listener as unknown as {
        getProviderSettings: () => Promise<{ provider: string; apiKey?: string; model?: string }>;
      };
      const settings = await handler.getProviderSettings();

      expect(settings.provider).toBe('openai');
      expect(settings.apiKey).toBe('sk-test-key');
      expect(settings.model).toBe('gpt-4o-mini');
    });

    it('starts batch analysis with the resolved provider settings', async () => {
      const handler = listener as unknown as {
        onNewMailReceived: (f: unknown, m: unknown) => Promise<void>;
      };
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(analyzeBatchExecute).toHaveBeenCalledTimes(1);
      const [ids, config] = analyzeBatchExecute.mock.calls[0];
      expect(ids).toEqual(['123', '456']);
      expect(config.providerSettings.provider).toBe('openai');
      expect(config.providerSettings.apiKey).toBe('sk-test-key');
      expect(config.providerSettings.model).toBe('gpt-4o-mini');
    });

    it('skips analysis when no provider is configured', async () => {
      // Fresh instance so the AppConfigService cache reads the mutated storage
      storageData.appConfig = { defaultProvider: '' };
      const configRepo = new StorageLocalConfigRepository(logger);
      const fresh = new EmailEventListener(
        analyzeBatch,
        logger,
        new AppConfigService(logger, configRepo)
      );

      const handler = fresh as unknown as {
        onNewMailReceived: (f: unknown, m: unknown) => Promise<void>;
      };
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(analyzeBatchExecute).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('No provider configured, skipping email analysis');
    });
  });

  describe('Listener registration', () => {
    it('registers and unregisters the new-mail listener', () => {
      const messenger = (globalThis as unknown as { messenger: { messages: { onNewMailReceived: {
        addListener: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
      } } } }).messenger;

      listener.registerListeners();
      expect(messenger.messages.onNewMailReceived.addListener).toHaveBeenCalledTimes(1);

      listener.unregisterListeners();
      expect(messenger.messages.onNewMailReceived.removeListener).toHaveBeenCalledTimes(1);
    });

    it('warns when already registered', () => {
      listener.registerListeners();
      listener.registerListeners();
      expect(logger.warn).toHaveBeenCalledWith('Event listeners already registered');
    });
  });
});
