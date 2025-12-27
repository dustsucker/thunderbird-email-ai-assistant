/**
 * ProviderFactory - Factory class for managing AI Provider instances using TSyringe DI container.
 *
 * This factory registers and resolves provider instances, wrapping legacy BaseProvider
 * implementations with BaseProviderAdapter for dependency injection compatibility.
 */

import { injectable, container, InjectionToken } from 'tsyringe';
import { ConsoleLogger } from '../logger/ConsoleLogger';
import { BaseProviderAdapter } from './BaseProviderAdapter';
import type { IProvider } from '../interfaces/IProvider';
import type { ILogger } from '../interfaces/ILogger';
import 'reflect-metadata';

// ============================================================================
// TOKEN DEFINITIONS
// ============================================================================

/**
 * Provider registration tokens for dependency injection.
 * Each provider has a unique token for registration in the DI container.
 */
export const ProviderTokens = {
  LOGGER: 'ILogger' as InjectionToken<ILogger>,
  OPENAI_PROVIDER: 'provider:openai' as InjectionToken<unknown>,
  CLAUDE_PROVIDER: 'provider:claude' as InjectionToken<unknown>,
  GEMINI_PROVIDER: 'provider:gemini' as InjectionToken<unknown>,
  MISTRAL_PROVIDER: 'provider:mistral' as InjectionToken<unknown>,
  OLLAMA_PROVIDER: 'provider:ollama' as InjectionToken<unknown>,
  DEEPSEEK_PROVIDER: 'provider:deepseek' as InjectionToken<unknown>,
  ZAI_PROVIDER: 'provider:zai' as InjectionToken<unknown>,
} as const;

/**
 * Provider ID to token mapping
 */
const PROVIDER_ID_TO_TOKEN: ReadonlyMap<string, InjectionToken<unknown>> = new Map([
  ['openai', ProviderTokens.OPENAI_PROVIDER],
  ['claude', ProviderTokens.CLAUDE_PROVIDER],
  ['gemini', ProviderTokens.GEMINI_PROVIDER],
  ['mistral', ProviderTokens.MISTRAL_PROVIDER],
  ['ollama', ProviderTokens.OLLAMA_PROVIDER],
  ['deepseek', ProviderTokens.DEEPSEEK_PROVIDER],
  ['zai', ProviderTokens.ZAI_PROVIDER],
] as const);

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a value implements IProvider interface
 */
function isIProvider(value: unknown): value is IProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    'providerId' in value &&
    'analyze' in value &&
    'validateSettings' in value
  );
}

// ============================================================================
// PROVIDER FACTORY CLASS
// ============================================================================

/**
 * ProviderFactory manages the lifecycle and registration of AI Provider instances.
 *
 * This factory is responsible for:
 * - Registering providers as singletons in the TSyringe DI container
 * - Wrapping legacy BaseProvider implementations with BaseProviderAdapter
 * - Resolving provider instances on demand
 * - Maintaining a registry of available providers
 *
 * @example
 * ```typescript
 * // Initialize the factory (register all providers)
 * ProviderFactory.initialize();
 *
 * // Get a specific provider
 * const provider = ProviderFactory.getProvider('openai');
 * const result = await provider.analyze({...});
 *
 * // List available providers
 * const providers = ProviderFactory.getAvailableProviders();
 * console.log(providers); // ['openai', 'claude', ...]
 *
 * // Register a custom provider
 * ProviderFactory.registerProvider('custom', new CustomProvider());
 * ```
 */
@injectable()
export class ProviderFactory {
  private static readonly logger: ILogger = new ConsoleLogger();
  private static readonly registeredProviders = new Map<string, InjectionToken<unknown>>();
  private static initialized = false;

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  /**
   * Initializes the ProviderFactory and registers core services.
   *
   * This method should be called before using the factory to resolve providers.
   * It registers the ILogger implementation and prepares the factory for use.
   *
   * @remarks
   * This method is idempotent - calling it multiple times has no effect.
   */
  public static initialize(): void {
    if (this.initialized) {
      this.logger.debug('ProviderFactory already initialized');
      return;
    }

    this.logger.info('Initializing ProviderFactory');

    // Register Logger as singleton
    container.registerSingleton<ILogger>(ProviderTokens.LOGGER, ConsoleLogger);

    // Register provider adapters for known providers
    // Note: Actual provider implementations are not yet DI-ready, so we
    // only register tokens for future migration
    this.registerAdapterTokens();

    this.initialized = true;
    this.logger.info('ProviderFactory initialized successfully');
  }

  /**
   * Registers adapter tokens for all known providers.
   *
   * This registers the IProvider implementations (BaseProviderAdapter) for
   * each provider token. The actual BaseProvider implementations will be
   * lazily instantiated when needed.
   *
   * @private
   */
  private static registerAdapterTokens(): void {
    const providerIds = Array.from(PROVIDER_ID_TO_TOKEN.keys());

    providerIds.forEach((providerId) => {
      const token = PROVIDER_ID_TO_TOKEN.get(providerId);
      if (!token) {
        this.logger.warn('Failed to get token for provider', { providerId });
        return;
      }

      // Register BaseProviderAdapter as a factory
      container.register(token, {
        useFactory: () => {
          this.logger.debug('Creating adapter for provider', { providerId });
          const logger = container.resolve<ILogger>(ProviderTokens.LOGGER);

          // Import provider dynamically (legacy implementations)
          // This will be replaced with DI-ready providers in future
          return new BaseProviderAdapter(providerId, null as never, logger);
        },
      });

    // Store using providerId as the key, token as the value
    this.registeredProviders.set(providerId, token);
      this.logger.debug('Registered provider adapter', { providerId });
    });
  }

  // ========================================================================
  // PROVIDER RESOLUTION
  // ========================================================================

  /**
   * Gets a provider instance by its provider ID.
   *
   * @param providerId - The unique identifier for the provider (e.g., 'openai', 'claude')
   * @returns Promise resolving to the IProvider instance
   * @throws {Error} If provider is not registered or factory is not initialized
   *
   * @example
   * ```typescript
   * const provider = await ProviderFactory.getProvider('openai');
   * const isValid = await provider.validateSettings({ apiKey: 'sk-...' });
   * ```
   */
  public static getProvider(providerId: string): IProvider {
    if (!this.initialized) {
      this.initialize();
    }

    const token = PROVIDER_ID_TO_TOKEN.get(providerId);
    if (!token) {
      const available = this.getAvailableProviders();
      this.logger.error('Provider not found', {
        providerId,
        availableProviders: available,
      });
      throw new Error(
        `Provider '${providerId}' is not registered. Available providers: ${available.join(', ')}`
      );
    }

    try {
      this.logger.debug('Resolving provider', { providerId });
      const provider = container.resolve(token) as unknown;

      if (!isIProvider(provider)) {
        this.logger.error('Resolved object is not an IProvider', { providerId });
        throw new Error(`Resolved object is not a valid IProvider: ${providerId}`);
      }

      this.logger.debug('Provider resolved successfully', {
        providerId,
        resolvedProviderId: provider.providerId,
      });

      return provider;
    } catch (error) {
      this.logger.error('Failed to resolve provider', {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ========================================================================
  // PROVIDER REGISTRATION
  // ========================================================================

  /**
   * Registers a custom provider with the factory.
   *
   * This method allows registration of custom or dynamically created providers.
   * The provider is registered as a singleton in the DI container.
   *
   * @param providerId - Unique identifier for the provider
   * @param provider - The provider implementation (any type, will be wrapped in adapter if needed)
   * @throws {Error} If providerId is empty or provider is null/undefined
   *
   * @example
   * ```typescript
   * ProviderFactory.registerProvider('custom', new CustomProvider());
   * const provider = ProviderFactory.getProvider('custom');
   * ```
   */
  public static registerProvider(providerId: string, provider: unknown): void {
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('Provider ID must be a non-empty string');
    }

    if (provider === null || provider === undefined) {
      throw new Error('Provider cannot be null or undefined');
    }

    this.logger.info('Registering custom provider', { providerId });

    const token = `provider:${providerId}` as InjectionToken<unknown>;

    // If provider already implements IProvider, register it directly
    if (isIProvider(provider)) {
      container.registerInstance(token, provider);
      this.logger.debug('Registered provider as IProvider implementation', { providerId });
    } else {
      // Otherwise, wrap it in a BaseProviderAdapter
      const logger = container.resolve<ILogger>(ProviderTokens.LOGGER);
      const adapter = new BaseProviderAdapter(providerId, provider as never, logger);
      container.registerInstance(token, adapter);
      this.logger.debug('Registered provider with BaseProviderAdapter', { providerId });
    }

    this.registeredProviders.set(providerId, token);
    this.logger.info('Custom provider registered', { providerId });
  }

  // ========================================================================
  // PROVIDER DISCOVERY
  // ========================================================================

  /**
   * Returns a list of all registered provider IDs.
   *
   * @returns Array of provider ID strings
   *
   * @example
   * ```typescript
   * const providers = ProviderFactory.getAvailableProviders();
   * console.log(providers); // ['openai', 'claude', 'ollama', ...]
   * ```
   */
  public static getAvailableProviders(): string[] {
    if (!this.initialized) {
      this.initialize();
    }

    return Array.from(this.registeredProviders.keys()).sort();
  }

  /**
   * Checks if a provider is registered.
   *
   * @param providerId - The provider ID to check
   * @returns True if the provider is registered, false otherwise
   *
   * @example
   * ```typescript
   * if (ProviderFactory.hasProvider('openai')) {
   *   const provider = ProviderFactory.getProvider('openai');
   * }
   * ```
   */
  public static hasProvider(providerId: string): boolean {
    return this.registeredProviders.has(providerId);
  }

  // ========================================================================
  // CONTAINER ACCESS
  // ========================================================================

  /**
   * Gets the TSyringe DI container instance.
   *
   * This provides access to the underlying container for advanced scenarios
   * where custom registrations or resolutions are needed.
   *
   * @returns The TSyringe DependencyInjectionContainer instance
   */
  public static getContainer(): typeof container {
    if (!this.initialized) {
      this.initialize();
    }
    return container;
  }

  /**
   * Clears all registrations from the DI container.
   *
   * This method is primarily useful for testing and should not be called
   * in production code.
   *
   * @remarks
   * After calling this method, the factory needs to be re-initialized.
   */
  public static reset(): void {
    this.logger.warn('Resetting ProviderFactory');
    container.clearInstances();
    container.reset();
    this.registeredProviders.clear();
    this.initialized = false;
  }
}
