/**
 * Repository interface for persisting application configuration.
 *
 * Provides methods for managing provider settings, custom tags, and
 * application configuration using a persistent storage layer.
 */

/**
 * Model-specific concurrency configuration.
 */
export interface IModelConcurrencyConfig {
  /** Provider identifier (e.g., 'openai', 'ollama') */
  provider: string;
  /** Optional specific model name */
  model?: string;
  /** Maximum concurrent requests allowed */
  concurrency: number;
}

/**
 * Provider-specific settings including credentials and endpoints.
 */
export interface IProviderSettings {
  /** API authentication key for the provider */
  apiKey: string;
  /** Model identifier/name to use */
  model: string;
  /** Custom API base URL (optional) */
  apiUrl?: string;
  /** Additional provider-specific configuration */
  additionalConfig?: Record<string, unknown>;
}

/**
 * Application configuration settings.
 */
export interface IAppConfig {
  /** Default provider to use for analysis */
  defaultProvider: string;
  /** Enable notification for analysis results */
  enableNotifications: boolean;
  /** Enable detailed logging */
  enableLogging: boolean;
  /** Model-specific concurrency limits */
  modelConcurrencyLimits?: IModelConcurrencyConfig[];
  /** Minimum confidence threshold for tag application (0-100) */
  minConfidenceThreshold?: number;
}

/**
 * Custom tag definition for email classification.
 */
export interface ICustomTag {
  /** Unique tag key/identifier */
  key: string;
  /** Display name for the tag */
  name: string;
  /** Hex color code for tag display */
  color: string;
  /** Optional prompt description for AI analysis */
  prompt?: string;
  /** Optional minimum confidence threshold override (0-100) */
  minConfidenceThreshold?: number;
}

/**
 * Repository interface for configuration persistence.
 *
 * Provides CRUD operations for provider settings, custom tags,
 * and application-level configuration.
 */
export interface IConfigRepository {
  /**
   * Get settings for a specific provider.
   *
   * @param providerId - The provider identifier (e.g., 'openai', 'ollama')
   * @returns Provider settings object
   * @throws Error if provider settings not found
   */
  getProviderSettings(providerId: string): Promise<IProviderSettings>;

  /**
   * Save settings for a specific provider.
   *
   * @param providerId - The provider identifier
   * @param settings - Provider settings to save
   * @throws Error if save operation fails
   */
  setProviderSettings(providerId: string, settings: IProviderSettings): Promise<void>;

  /**
   * Get settings for all configured providers.
   *
   * @returns Record mapping provider IDs to their settings
   */
  getAllProviderSettings(): Promise<Record<string, IProviderSettings>>;

  /**
   * Get custom tags for email classification.
   *
   * @returns Array of custom tag definitions
   */
  getCustomTags(): Promise<ICustomTag[]>;

  /**
   * Save custom tags configuration.
   *
   * @param tags - Array of custom tags to save
   * @throws Error if save operation fails
   */
  setCustomTags(tags: ICustomTag[]): Promise<void>;

  /**
   * Get application-level configuration.
   *
   * @returns Application configuration object
   * @throws Error if app config not found
   */
  getAppConfig(): Promise<IAppConfig>;

  /**
   * Save application configuration.
   *
   * @param config - Application configuration to save
   * @throws Error if save operation fails
   */
  setAppConfig(config: IAppConfig): Promise<void>;

  /**
   * Clear all configuration data.
   *
   * This will remove all provider settings, custom tags, and app config.
   * Use with caution.
   *
   * @throws Error if clear operation fails
   */
  clearAll(): Promise<void>;
}
