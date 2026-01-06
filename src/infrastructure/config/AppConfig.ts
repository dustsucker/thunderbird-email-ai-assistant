import { singleton, inject } from 'tsyringe';
import {
  Tag,
  HardcodedTags,
  CustomTags,
  Provider,
  AppConfig,
  DefaultConfig,
  ModelConcurrencyConfig,
} from '@/shared/types/ProviderTypes';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cached configuration with timestamp.
 */
interface CachedConfig<T> {
  /** Cached value */
  value: T;
  /** Cache timestamp */
  timestamp: number;
}

/**
 * Cache entry with TTL.
 */
interface CacheEntry {
  /** Cached configuration */
  config: CachedConfig<unknown>;
  /** Time-to-live in milliseconds */
  ttl: number;
}

// ============================================================================
// AppConfigService Implementation
// ============================================================================

/**
 * Configuration service with caching.
 *
 * Provides access to application configuration with in-memory caching
 * to improve performance. Falls back to defaults if ConfigRepository is unavailable.
 */
@singleton()
export class AppConfigService {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly configRepository: IConfigRepository;
  private readonly logger: ILogger;

  /** In-memory cache for configurations */
  private readonly cache: Map<string, CacheEntry> = new Map();

  /** Default cache TTL: 5 minutes */
  private readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000;

  // Hardcoded tags (system tags that cannot be modified)
  private readonly hardcodedTags: HardcodedTags = {
    is_scam: { key: 'is_scam', name: 'Scam Alert', color: '#FF5722' },
    spf_fail: { key: 'spf_fail', name: 'SPF Fail', color: '#E91E63' },
    dkim_fail: { key: 'dkim_fail', name: 'DKIM Fail', color: '#E91E63' },
    tagged: { key: 'tagged', name: 'Tagged', color: '#4f4f4f' },
    email_ai_analyzed: { key: 'email_ai_analyzed', name: 'AI Analyzed', color: '#9E9E9E' },
  };

  private readonly defaultCustomTags: CustomTags = [
    {
      key: 'is_advertise',
      name: 'Advertisement',
      color: '#FFC107',
      prompt:
        'check if email is advertising something and contains an offer or someone is asking for contact to show the offer',
    },
    {
      key: 'is_business_approach',
      name: 'Business Ad',
      color: '#2196F3',
      prompt:
        'check if email is a cold marketing/sales/business approach (or next message in the approach process where sender reply to self to refresh the approach in the mailbox). Consider typical sales and lead generation scenarios.',
    },
    {
      key: 'is_personal',
      name: 'Personal',
      color: '#4CAF50',
      prompt:
        'check if this is non-sales scenario approach from someone who likes to contact in a non-business context.',
    },
    {
      key: 'is_business',
      name: 'Business',
      color: '#af4c87',
      prompt: 'check if this looks like work related email',
    },
    {
      key: 'is_service_important',
      name: 'Service Important',
      color: '#F44336',
      prompt:
        'check if email contains important information related to already subscribed service (if this is subscription offer - ignore it): bill, password reset, login link, 2fa code, expiration notice. Consider common services like electricity, bank account, netflix, or similar subscription service.',
    },
    {
      key: 'is_service_not_important',
      name: 'Service Info',
      color: '#9E9E9E',
      prompt:
        'check if email contains non critical information from already subscribed service (if this is subscription offer - ignore it) - like: daily posts update from linkedin, AWS invitation for conference, cross sale, tips how to use product, surveys, new offers',
    },
    {
      key: 'is_bill',
      name: 'Bill',
      color: '#f4b136',
      prompt: 'check if email contains bill or invoice information.',
    },
    {
      key: 'has_calendar_invite',
      name: 'Appointment',
      color: '#7F07f2',
      prompt:
        'check if the mail has invitation to the call or meeting (with calendar appointment attached)',
    },
  ];

  private readonly defaults: Readonly<DefaultConfig> = {
    provider: Provider.OLLAMA,
    ollamaApiUrl: 'http://localhost:11434/api/generate',
    ollamaModel: 'gemma3:27b',
    openaiApiKey: '',
    geminiApiKey: '',
    claudeApiKey: '',
    mistralApiKey: '',
    deepseekApiKey: '',
    zaiPaasApiKey: '',
    zaiPaasModel: 'glm-4.5',
    zaiCodingApiKey: '',
    zaiCodingModel: 'glm-4.7',
    customTags: this.defaultCustomTags,
    enableNotifications: true,
    enableLogging: true,
    model: undefined,
    modelConcurrencyLimits: undefined,
    minConfidenceThreshold: 70,
  };

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ILogger') logger: ILogger,
    @inject('IConfigRepository') configRepository: IConfigRepository
  ) {
    this.logger = logger;
    this.configRepository = configRepository;
    this.logger.debug('AppConfigService initialized with ConfigRepository');
  }

  // ==========================================================================
  // Public Methods - ConfigRepository Integration
  // ==========================================================================

  /**
   * Gets application configuration from ConfigRepository with caching.
   *
   * @returns Promise resolving to application config
   */
  async getAppConfig(): Promise<
    import('@/infrastructure/interfaces/IConfigRepository').IAppConfig
  > {
    const cacheKey = 'appConfig';

    // Check cache
    const cached =
      this.getFromCache<import('@/infrastructure/interfaces/IConfigRepository').IAppConfig>(
        cacheKey
      );
    if (cached) {
      this.logger.debug('AppConfig cache hit', { cacheKey });
      return cached;
    }

    // Load from repository
    try {
      const config = await this.configRepository.getAppConfig();

      // Cache the result
      this.setInCache(cacheKey, config, this.DEFAULT_CACHE_TTL);

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to load app config from repository, using fallback', {
        error: errorMessage,
      });

      // Return fallback config
      return {
        defaultProvider: this.defaults.provider,
        enableNotifications: this.defaults.enableNotifications,
        enableLogging: this.defaults.enableLogging,
        modelConcurrencyLimits: this.defaults.modelConcurrencyLimits,
      };
    }
  }

  /**
   * Gets provider settings from ConfigRepository with caching.
   *
   * @param providerId - Provider identifier
   * @returns Promise resolving to provider settings
   */
  async getProviderSettings(
    providerId: string
  ): Promise<import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings> {
    const cacheKey = `providerSettings:${providerId}`;

    // Check cache
    const cached =
      this.getFromCache<import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings>(
        cacheKey
      );
    if (cached) {
      this.logger.debug('ProviderSettings cache hit', { cacheKey, providerId });
      return cached;
    }

    // Load from repository
    try {
      const settings = await this.configRepository.getProviderSettings(providerId);

      // Cache the result
      this.setInCache(cacheKey, settings, this.DEFAULT_CACHE_TTL);

      return settings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to load provider settings from repository, using fallback', {
        providerId,
        error: errorMessage,
      });

      // Return fallback settings based on provider
      return this.getFallbackProviderSettings(providerId);
    }
  }

  /**
   * Gets custom tags from ConfigRepository with caching.
   *
   * @returns Promise resolving to custom tags array
   */
  async getCustomTags(): Promise<
    import('@/infrastructure/interfaces/IConfigRepository').ICustomTag[]
  > {
    const cacheKey = 'customTags';

    // Check cache
    const cached =
      this.getFromCache<import('@/infrastructure/interfaces/IConfigRepository').ICustomTag[]>(
        cacheKey
      );
    if (cached) {
      this.logger.debug('CustomTags cache hit', { cacheKey });
      return cached;
    }

    // Load from repository
    try {
      const tags = await this.configRepository.getCustomTags();

      // Cache the result
      this.setInCache(cacheKey, tags, this.DEFAULT_CACHE_TTL);

      return tags;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to load custom tags from repository, using defaults', {
        error: errorMessage,
      });

      // Return default custom tags
      return this.defaultCustomTags.map((tag) => ({
        key: tag.key,
        name: tag.name,
        color: tag.color,
        prompt: tag.prompt,
      }));
    }
  }

  /**
   * Saves provider settings to ConfigRepository and invalidates cache.
   *
   * @param providerId - Provider identifier
   * @param settings - Provider settings to save
   */
  async setProviderSettings(
    providerId: string,
    settings: import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings
  ): Promise<void> {
    try {
      await this.configRepository.setProviderSettings(providerId, settings);

      // Invalidate cache
      this.invalidateCache(`providerSettings:${providerId}`);

      this.logger.info('Provider settings saved successfully', { providerId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to save provider settings', { providerId, error: errorMessage });
      throw new Error(`Failed to save provider settings for ${providerId}: ${errorMessage}`);
    }
  }

  /**
   * Saves custom tags to ConfigRepository and invalidates cache.
   *
   * @param tags - Custom tags to save
   */
  async setCustomTags(
    tags: import('@/infrastructure/interfaces/IConfigRepository').ICustomTag[]
  ): Promise<void> {
    try {
      await this.configRepository.setCustomTags(tags);

      // Invalidate cache
      this.invalidateCache('customTags');

      this.logger.info('Custom tags saved successfully', { count: tags.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to save custom tags', { error: errorMessage });
      throw new Error(`Failed to save custom tags: ${errorMessage}`);
    }
  }

  /**
   * Saves application configuration to ConfigRepository and invalidates cache.
   *
   * @param config - Application config to save
   */
  async setAppConfig(
    config: import('@/infrastructure/interfaces/IConfigRepository').IAppConfig
  ): Promise<void> {
    try {
      await this.configRepository.setAppConfig(config);

      // Invalidate cache
      this.invalidateCache('appConfig');

      this.logger.info('App config saved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to save app config', { error: errorMessage });
      throw new Error(`Failed to save app config: ${errorMessage}`);
    }
  }

  /**
   * Clears all configuration cache entries.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('AppConfigService cache cleared');
  }

  // ==========================================================================
  // Public Methods - Defaults and Helpers
  // ==========================================================================

  getDefaults(): Readonly<DefaultConfig> {
    return this.defaults;
  }

  getHardcodedTags(): HardcodedTags {
    return this.hardcodedTags;
  }

  getDefaultCustomTags(): CustomTags {
    return this.defaultCustomTags;
  }

  getPromptTemplate(): string {
    const PROMPT_INSTRUCTIONS: ReadonlyArray<string> = [
      'Hi, I like you to check and score an email based on the following structured data. Please respond as a single, clean JSON object with the specified properties.',
      '',
      '### Email Headers',
      '```json',
      '{headers}',
      '```',
      '',
      '### Email Body (converted from HTML to plain text)',
      '```text',
      '{body}',
      '```',
      '',
      '### Attachments',
      '```json',
      '{attachments}',
      '```',
      '',
      '### INSTRUCTIONS',
      'Based on the data above, please populate the following JSON object:',
      '- tags: (array of strings) list of tag keys where the corresponding check is true (e.g., ["is_advertise", "is_business"])',
      '- confidence: (number between 0.0 and 1.0) your overall confidence in the analysis',
      '- reasoning: (string) brief explanation of your analysis in one or two sentences',
    ];

    return PROMPT_INSTRUCTIONS.join('\n');
  }

  isValidProvider(provider: string): provider is Provider {
    return Object.values(Provider).includes(provider as Provider);
  }

  isHardcodedTag(tag: Tag): tag is Tag & { key: keyof HardcodedTags } {
    return Object.keys(this.hardcodedTags).includes(tag.key as string);
  }

  isValidColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  getConcurrencyLimit(config: AppConfig, provider: string, model: string): number {
    const PROVIDER_DEFAULT_CONCURRENCY: Record<Provider, number> = {
      [Provider.OLLAMA]: 5,
      [Provider.OPENAI]: 10,
      [Provider.GEMINI]: 5,
      [Provider.CLAUDE]: 5,
      [Provider.MISTRAL]: 10,
      [Provider.DEEPSEEK]: 10,
      [Provider.ZAI_PAAS]: 5,
      [Provider.ZAI_CODING]: 5,
    };

    if (!config.modelConcurrencyLimits) {
      return PROVIDER_DEFAULT_CONCURRENCY[provider as Provider] ?? 5;
    }

    const modelConfig = config.modelConcurrencyLimits.find(
      (c) => c.provider === provider && c.model === model
    );

    if (modelConfig && modelConfig.concurrency > 0) {
      return modelConfig.concurrency;
    }

    const providerConfig = config.modelConcurrencyLimits.find(
      (c) => c.provider === provider && !c.model
    );

    if (providerConfig && providerConfig.concurrency > 0) {
      return providerConfig.concurrency;
    }

    return PROVIDER_DEFAULT_CONCURRENCY[provider as Provider] ?? 5;
  }

  validateConcurrencyConfig(config: ModelConcurrencyConfig[]): string[] {
    const errors: string[] = [];

    for (const entry of config) {
      const providerStr = entry.provider as string;
      if (!this.isValidProvider(providerStr)) {
        errors.push(`Invalid provider: ${entry.provider}`);
      }

      if (!entry.model && !entry.provider) {
        errors.push('Either provider or model must be specified');
      }

      if (
        entry.concurrency !== undefined &&
        (entry.concurrency < 1 || !Number.isInteger(entry.concurrency))
      ) {
        errors.push(
          `Invalid concurrency value for ${providerStr}/${entry.model || '(any)'}: ${entry.concurrency}. Must be a positive integer.`
        );
      }
    }

    return errors;
  }

  // ==========================================================================
  // Private Methods - Caching
  // ==========================================================================

  /**
   * Gets value from cache if not expired.
   *
   * @param key - Cache key
   * @returns Cached value or null if not found or expired
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    if (now - entry.config.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.config.value as T;
  }

  /**
   * Sets value in cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds
   */
  private setInCache<T>(key: string, value: T, ttl: number): void {
    const entry: CacheEntry = {
      config: {
        value,
        timestamp: Date.now(),
      },
      ttl,
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidates cache entry.
   *
   * @param key - Cache key to invalidate
   */
  private invalidateCache(key: string): void {
    this.cache.delete(key);
    this.logger.debug('Cache entry invalidated', { key });
  }

  /**
   * Gets fallback provider settings for a provider.
   *
   * @param providerId - Provider identifier
   * @returns Fallback provider settings
   */
  private getFallbackProviderSettings(
    providerId: string
  ): import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings {
    const providerDefaults: Record<
      string,
      import('@/infrastructure/interfaces/IConfigRepository').IProviderSettings
    > = {
      openai: {
        apiKey: this.defaults.openaiApiKey,
        model: 'gpt-4o-mini',
      },
      gemini: {
        apiKey: this.defaults.geminiApiKey,
        model: 'gemini-2.0-flash-exp',
      },
      claude: {
        apiKey: this.defaults.claudeApiKey,
        model: 'claude-3-5-sonnet-20241022',
      },
      mistral: {
        apiKey: this.defaults.mistralApiKey,
        model: 'mistral-large-latest',
      },
      deepseek: {
        apiKey: this.defaults.deepseekApiKey,
        model: 'deepseek-chat',
      },
      'zai-paas': {
        apiKey: this.defaults.zaiPaasApiKey,
        model: this.defaults.zaiPaasModel,
        apiUrl: 'https://api.z.ai/v1',
      },
      'zai-coding': {
        apiKey: this.defaults.zaiCodingApiKey,
        model: this.defaults.zaiCodingModel,
        apiUrl: 'https://api.z.ai/v1',
      },
      ollama: {
        apiKey: '',
        model: this.defaults.ollamaModel,
        apiUrl: this.defaults.ollamaApiUrl,
      },
    };

    return (
      providerDefaults[providerId] ?? {
        apiKey: '',
        model: '',
      }
    );
  }
}
