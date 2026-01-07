/**
 * IndexedDB-based configuration repository.
 *
 * Implements IConfigRepository using browser.storage.local (Chrome Storage API)
 * which is available in Thunderbird extensions and provides a Promise-based
 * interface for persistent configuration storage.
 *
 * Uses three storage namespaces (keys):
 * - 'providerSettings': Store for provider-specific settings
 * - 'customTags': Store for custom email classification tags
 * - 'appConfig': Store for application-level configuration
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../interfaces/ILogger';
import type {
  IConfigRepository,
  IAppConfig,
  IProviderSettings,
  ICustomTag,
} from '../interfaces/IConfigRepository';

// === Type Definitions ===

interface StorageLocal {
  get: (
    keys: string | string[] | Record<string, unknown> | null
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  clear: () => Promise<void>;
}

interface BrowserStorage {
  storage: {
    local: StorageLocal;
  };
}

// === Type Guards ===

/**
 * Type guard to check if object has browser.storage API.
 */
function hasBrowserStorage(obj: unknown): obj is BrowserStorage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const maybeStorage = obj as Record<string, unknown>;
  if (typeof maybeStorage.storage !== 'object' || maybeStorage.storage === null) {
    return false;
  }

  const storage = maybeStorage.storage as Record<string, unknown>;
  if (typeof storage.local !== 'object' || storage.local === null) {
    return false;
  }

  const local = storage.local as Record<string, unknown>;
  return (
    typeof local.get === 'function' &&
    typeof local.set === 'function' &&
    typeof local.clear === 'function'
  );
}

// === Constants ===

const STORAGE_KEYS = {
  PROVIDER_SETTINGS: 'providerSettings',
  CUSTOM_TAGS: 'customTags',
  APP_CONFIG: 'appConfig',
} as const;

// === Implementation ===

@injectable()
export class IndexedDBConfigRepository implements IConfigRepository {
  private readonly storage: {
    get: (
      keys: string | string[] | Record<string, unknown> | null
    ) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    clear: () => Promise<void>;
  };

  constructor(@inject('ILogger') private readonly logger: ILogger) {
    // Use browser.storage.local if available (Thunderbird extension environment)
    const browserApi = (globalThis as unknown as Record<string, unknown>).browser as
      | BrowserStorage
      | undefined;
    const chromeApi = (globalThis as unknown as Record<string, unknown>).chrome as
      | BrowserStorage
      | undefined;

    if (browserApi && hasBrowserStorage(browserApi)) {
      this.storage = {
        get: browserApi.storage.local.get.bind(browserApi.storage.local),
        set: browserApi.storage.local.set.bind(browserApi.storage.local),
        clear: browserApi.storage.local.clear.bind(browserApi.storage.local),
      };
      this.logger.info('Using browser.storage.local for configuration persistence');
    } else if (chromeApi && hasBrowserStorage(chromeApi)) {
      this.storage = {
        get: chromeApi.storage.local.get.bind(chromeApi.storage.local),
        set: chromeApi.storage.local.set.bind(chromeApi.storage.local),
        clear: chromeApi.storage.local.clear.bind(chromeApi.storage.local),
      };
      this.logger.info('Using chrome.storage.local for configuration persistence');
    } else {
      throw new Error(
        'browser.storage API not available. IndexedDBConfigRepository requires a Thunderbird extension environment.'
      );
    }
  }

  // === Provider Settings ===

  async getProviderSettings(providerId: string): Promise<IProviderSettings> {
    try {
      const data = await this.storage.get(STORAGE_KEYS.PROVIDER_SETTINGS);
      const providerSettings = data[STORAGE_KEYS.PROVIDER_SETTINGS] as
        | Record<string, IProviderSettings>
        | undefined;

      if (!providerSettings || !(providerId in providerSettings)) {
        throw new Error(`Provider settings not found for provider: ${providerId}`);
      }

      const settings = providerSettings[providerId];
      this.logger.debug(`Retrieved provider settings for ${providerId}`, {
        providerId,
        hasApiKey: !!settings.apiKey,
        model: settings.model,
      });

      return settings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get provider settings for ${providerId}`, {
        providerId,
        error: message,
      });
      throw new Error(`Failed to get provider settings for ${providerId}: ${message}`);
    }
  }

  async setProviderSettings(providerId: string, settings: IProviderSettings): Promise<void> {
    try {
      const data = await this.storage.get(STORAGE_KEYS.PROVIDER_SETTINGS);
      const providerSettings =
        (data[STORAGE_KEYS.PROVIDER_SETTINGS] as Record<string, IProviderSettings>) || {};

      providerSettings[providerId] = settings;

      await this.storage.set({ [STORAGE_KEYS.PROVIDER_SETTINGS]: providerSettings });

      this.logger.debug(`Saved provider settings for ${providerId}`, {
        providerId,
        hasApiKey: !!settings.apiKey,
        model: settings.model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to save provider settings for ${providerId}`, {
        providerId,
        error: message,
      });
      throw new Error(`Failed to save provider settings for ${providerId}: ${message}`);
    }
  }

  async getAllProviderSettings(): Promise<Record<string, IProviderSettings>> {
    try {
      const data = await this.storage.get(STORAGE_KEYS.PROVIDER_SETTINGS);
      const providerSettings =
        (data[STORAGE_KEYS.PROVIDER_SETTINGS] as Record<string, IProviderSettings>) || {};

      this.logger.debug(`Retrieved settings for ${Object.keys(providerSettings).length} providers`);

      return providerSettings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get all provider settings', { error: message });
      throw new Error(`Failed to get all provider settings: ${message}`);
    }
  }

  // === Custom Tags ===

  async getCustomTags(): Promise<ICustomTag[]> {
    this.logger.info('[CONFIG-REPO] Retrieving custom tags from storage');

    try {
      const data = await this.storage.get(STORAGE_KEYS.CUSTOM_TAGS);
      const customTags = (data[STORAGE_KEYS.CUSTOM_TAGS] as ICustomTag[]) || [];

      this.logger.info('[CONFIG-REPO] Custom tags retrieved successfully', {
        count: customTags.length,
        tags: customTags.map((t) => t.key).join(', '),
      });

      return customTags;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('[CONFIG-REPO] Failed to get custom tags', { error: message });
      throw new Error(`Failed to get custom tags: ${message}`);
    }
  }

  async setCustomTags(tags: ICustomTag[]): Promise<void> {
    this.logger.info('[CONFIG-REPO] Saving custom tags to storage', {
      count: tags.length,
      tags: tags.map((t) => t.key).join(', '),
    });

    try {
      await this.storage.set({ [STORAGE_KEYS.CUSTOM_TAGS]: tags });

      this.logger.info('[CONFIG-REPO] Custom tags saved successfully', { count: tags.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('[CONFIG-REPO] Failed to save custom tags', {
        error: message,
        tagCount: tags.length,
        tags: tags.map((t) => t.key).join(', '),
      });
      throw new Error(`Failed to save custom tags: ${message}`);
    }
  }

  // === Application Configuration ===

  async getAppConfig(): Promise<IAppConfig> {
    try {
      const data = await this.storage.get(STORAGE_KEYS.APP_CONFIG);
      const appConfig = data[STORAGE_KEYS.APP_CONFIG] as IAppConfig | undefined;

      if (!appConfig) {
        throw new Error('Application configuration not found');
      }

      this.logger.debug('Retrieved application config', {
        defaultProvider: appConfig.defaultProvider,
        enableNotifications: appConfig.enableNotifications,
        enableLogging: appConfig.enableLogging,
      });

      return appConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get application config', { error: message });
      throw new Error(`Failed to get application config: ${message}`);
    }
  }

  async setAppConfig(config: IAppConfig): Promise<void> {
    try {
      await this.storage.set({ [STORAGE_KEYS.APP_CONFIG]: config });

      this.logger.debug('Saved application config', {
        defaultProvider: config.defaultProvider,
        enableNotifications: config.enableNotifications,
        enableLogging: config.enableLogging,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to save application config', { error: message });
      throw new Error(`Failed to save application config: ${message}`);
    }
  }

  // === Utility Methods ===

  async clearAll(): Promise<void> {
    try {
      await this.storage.clear();
      this.logger.info('Cleared all configuration data');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear configuration data', { error: message });
      throw new Error(`Failed to clear configuration data: ${message}`);
    }
  }
}
