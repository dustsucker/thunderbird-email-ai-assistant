/**
 * browser.storage.local-based configuration repository.
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
  remove: (keys: string | string[]) => Promise<void>;
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
    typeof local.remove === 'function' &&
    typeof local.clear === 'function'
  );
}

// === Errors ===

/**
 * Thrown when a configuration key is not set in storage (first run / never saved).
 *
 * Issue #33: callers must be able to tell "deliberately not configured" (may get
 * defaults) from "read error / corrupt data" (must NOT silently become defaults).
 * Storage failures and validation failures are thrown as plain errors instead.
 */
export class ConfigNotSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigNotSetError';
  }
}

// === Constants ===

const STORAGE_KEYS = {
  PROVIDER_SETTINGS: 'providerSettings',
  CUSTOM_TAGS: 'customTags',
  APP_CONFIG: 'appConfig',
} as const;

// === Implementation ===

@injectable()
export class StorageLocalConfigRepository implements IConfigRepository {
  private readonly storage: StorageLocal;

  /**
   * Serializes write operations to avoid lost-update races on
   * read-modify-write sequences (get → mutate → set).
   */
  private writeQueue: Promise<void> = Promise.resolve();

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
        remove: browserApi.storage.local.remove.bind(browserApi.storage.local),
        clear: browserApi.storage.local.clear.bind(browserApi.storage.local),
      };
      this.logger.info('Using browser.storage.local for configuration persistence');
    } else if (chromeApi && hasBrowserStorage(chromeApi)) {
      this.storage = {
        get: chromeApi.storage.local.get.bind(chromeApi.storage.local),
        set: chromeApi.storage.local.set.bind(chromeApi.storage.local),
        remove: chromeApi.storage.local.remove.bind(chromeApi.storage.local),
        clear: chromeApi.storage.local.clear.bind(chromeApi.storage.local),
      };
      this.logger.info('Using chrome.storage.local for configuration persistence');
    } else {
      throw new Error(
        'browser.storage API not available. StorageLocalConfigRepository requires a Thunderbird extension environment.'
      );
    }
  }

  /**
   * Runs a write task after all previously queued writes have settled.
   * Failures do not break the chain for subsequent callers.
   */
  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  // === Provider Settings ===

  async getProviderSettings(providerId: string): Promise<IProviderSettings> {
    let data: Record<string, unknown>;
    try {
      data = await this.storage.get(STORAGE_KEYS.PROVIDER_SETTINGS);
    } catch (error) {
      // Issue #33: a storage READ failure must propagate — only a missing key
      // (ConfigNotSetError below) may be treated as "not configured".
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get provider settings for ${providerId}`, {
        providerId,
        error: message,
      });
      throw error;
    }

    const providerSettings = data[STORAGE_KEYS.PROVIDER_SETTINGS] as
      | Record<string, IProviderSettings>
      | undefined;

    if (!providerSettings || !(providerId in providerSettings)) {
      throw new ConfigNotSetError(`Provider settings not found for provider: ${providerId}`);
    }

    const settings = providerSettings[providerId];
    this.logger.debug(`Retrieved provider settings for ${providerId}`, {
      providerId,
      hasApiKey: !!settings.apiKey,
      model: settings.model,
    });

    return settings;
  }

  async setProviderSettings(providerId: string, settings: IProviderSettings): Promise<void> {
    try {
      await this.enqueueWrite(async () => {
        const data = await this.storage.get(STORAGE_KEYS.PROVIDER_SETTINGS);
        const providerSettings =
          (data[STORAGE_KEYS.PROVIDER_SETTINGS] as Record<string, IProviderSettings>) || {};

        providerSettings[providerId] = settings;

        await this.storage.set({ [STORAGE_KEYS.PROVIDER_SETTINGS]: providerSettings });
      });

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

    let data: Record<string, unknown>;
    try {
      data = await this.storage.get(STORAGE_KEYS.CUSTOM_TAGS);
    } catch (error) {
      // Issue #33: storage READ failures propagate — never silently become [].
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('[CONFIG-REPO] Failed to get custom tags', { error: message });
      throw new Error(`Failed to get custom tags: ${message}`);
    }

    if (data[STORAGE_KEYS.CUSTOM_TAGS] === undefined) {
      // Key not set (never saved): an empty list is the legitimate "not configured".
      return [];
    }

    const stored = data[STORAGE_KEYS.CUSTOM_TAGS];
    if (!Array.isArray(stored)) {
      // Issue #33: corrupt data must not silently become an empty/default tagset.
      const message = `Custom tags storage is corrupt: expected array, got ${typeof stored}`;
      this.logger.error('[CONFIG-REPO] Failed to get custom tags', { error: message });
      throw new Error(message);
    }

    // Validation pattern from EmailAnalysisTracker: keep well-formed entries,
    // drop the rest (a tag without key/name cannot be used anywhere).
    const customTags = stored.filter(
      (entry): entry is ICustomTag =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ICustomTag).key === 'string' &&
        (entry as ICustomTag).key !== '' &&
        typeof (entry as ICustomTag).name === 'string'
    );
    if (customTags.length !== stored.length) {
      this.logger.warn('[CONFIG-REPO] Dropped invalid custom tag entries', {
        total: stored.length,
        valid: customTags.length,
      });
    }

    this.logger.info('[CONFIG-REPO] Custom tags retrieved successfully', {
      count: customTags.length,
      tags: customTags.map((t) => t.key).join(', '),
    });

    return customTags;
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
    let data: Record<string, unknown>;
    try {
      data = await this.storage.get(STORAGE_KEYS.APP_CONFIG);
    } catch (error) {
      // Issue #33: a storage READ failure must propagate — only a missing key
      // (ConfigNotSetError below) may fall back to defaults upstream.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get application config', { error: message });
      throw new Error(`Failed to get application config: ${message}`);
    }

    const appConfig = data[STORAGE_KEYS.APP_CONFIG] as IAppConfig | undefined;

    if (!appConfig) {
      throw new ConfigNotSetError('Application configuration not found');
    }

    if (typeof appConfig !== 'object') {
      const message = 'Application configuration storage is corrupt: expected object';
      this.logger.error('Failed to get application config', { error: message });
      throw new Error(message);
    }

    this.logger.debug('Retrieved application config', {
      defaultProvider: appConfig.defaultProvider,
      enableNotifications: appConfig.enableNotifications,
      enableLogging: appConfig.enableLogging,
    });

    return appConfig;
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
      // SECURITY: only remove keys owned by this repository — never wipe the
      // whole storage.local (that would delete API keys and processed_-trackers).
      await this.storage.remove([
        STORAGE_KEYS.PROVIDER_SETTINGS,
        STORAGE_KEYS.CUSTOM_TAGS,
        STORAGE_KEYS.APP_CONFIG,
      ]);
      this.logger.info('Cleared all configuration data');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear configuration data', { error: message });
      throw new Error(`Failed to clear configuration data: ${message}`);
    }
  }
}
