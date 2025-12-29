/**
 * ProviderFactory - Factory class for managing AI Provider instances using TSyringe DI container.
 *
 * This factory registers and resolves provider instances, wrapping legacy BaseProvider
 * implementations with BaseProviderAdapter for dependency injection compatibility.
 */

import { injectable, container, inject, InjectionToken } from 'tsyringe';
import { BaseProviderAdapter } from './BaseProviderAdapter';
import type { BaseProvider } from './BaseProvider';
import type { IProvider } from '../interfaces/IProvider';
import type { ILogger } from '../interfaces/ILogger';
import { OpenAIProvider } from './impl/OpenAIProvider';
import { ClaudeProvider } from './impl/ClaudeProvider';
import { GeminiProvider } from './impl/GeminiProvider';
import { MistralProvider } from './impl/MistralProvider';
import { OllamaProvider } from './impl/OllamaProvider';
import { DeepseekProvider } from './impl/DeepseekProvider';
import { ZaiPaaSProvider } from './impl/ZaiPaaSProvider';
import { ZaiCodingProvider } from './impl/ZaiCodingProvider';
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
  ZAI_PAAS_PROVIDER: 'provider:zai-paas' as InjectionToken<unknown>,
  ZAI_CODING_PROVIDER: 'provider:zai-coding' as InjectionToken<unknown>,
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
  ['zai-paas', ProviderTokens.ZAI_PAAS_PROVIDER],
  ['zai-coding', ProviderTokens.ZAI_CODING_PROVIDER],
] as const);

/**
 * Provider ID to class mapping
 * Maps provider IDs to their implementation classes
 */
const PROVIDER_ID_TO_CLASS: ReadonlyMap<string, new (logger: ILogger) => unknown> = new Map([
  ['openai', OpenAIProvider],
  ['claude', ClaudeProvider],
  ['gemini', GeminiProvider],
  ['mistral', MistralProvider],
  ['ollama', OllamaProvider],
  ['deepseek', DeepseekProvider],
  ['zai-paas', ZaiPaaSProvider],
  ['zai-coding', ZaiCodingProvider],
] as Array<[string, new (logger: ILogger) => unknown]>);

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
 * // Use via DI container
 * const providerFactory = container.resolve<ProviderFactory>(ProviderFactory);
 *
 * // Get a specific provider
 * const provider = providerFactory.getProvider('openai');
 * const result = await provider.analyze({...});
 *
 * // List available providers
 * const providers = providerFactory.getAvailableProviders();
 * console.log(providers); // ['openai', 'claude', ...]
 * ```
 */
@injectable()
export class ProviderFactory {
  // ========================================================================
  // PRIVATE FIELDS
  // ========================================================================

  private readonly logger: ILogger;
  private readonly registeredProviders = new Map<string, InjectionToken<unknown>>();
  private initialized = false;

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

  constructor(@inject('ILogger') logger: ILogger) {
    this.logger = logger;
    this.initialize();
  }

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  /**
   * Initializes the ProviderFactory and registers core services.
   *
   * This method is called by the constructor. It registers the provider
   * adapters for all known providers.
   *
   * @remarks
   * This method is idempotent - calling it multiple times has no effect.
   */
  private initialize(): void {
    if (this.initialized) {
      this.logger.debug('ProviderFactory already initialized');
      return;
    }

    this.logger.info('Initializing ProviderFactory');

    // Register provider adapters for known providers
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
  private registerAdapterTokens(): void {
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

          // Get the provider class from mapping
          const ProviderClass = PROVIDER_ID_TO_CLASS.get(providerId);
          if (!ProviderClass) {
            this.logger.error('Provider class not found', { providerId });
            throw new Error(`Provider class not found for provider: ${providerId}`);
          }

          // Instantiate the provider with logger
          // Type assertion: all provider classes extend BaseProvider
          const providerInstance = new ProviderClass(this.logger) as BaseProvider;
          this.logger.debug('Provider instantiated', { providerId });

          // Create adapter with the provider instance
          return new BaseProviderAdapter(providerId, providerInstance, this.logger);
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
   * @returns The IProvider instance
   * @throws {Error} If provider is not registered
   *
   * @example
   * ```typescript
   * const provider = providerFactory.getProvider('openai');
   * const isValid = await provider.validateSettings({ apiKey: 'sk-...' });
   * ```
   */
  public getProvider(providerId: string): IProvider {
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
   * providerFactory.registerProvider('custom', new CustomProvider());
   * const provider = providerFactory.getProvider('custom');
   * ```
   */
  public registerProvider(providerId: string, provider: unknown): void {
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
      const adapter = new BaseProviderAdapter(providerId, provider as never, this.logger);
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
   * const providers = providerFactory.getAvailableProviders();
   * console.log(providers); // ['openai', 'claude', 'ollama', ...]
   * ```
   */
  public getAvailableProviders(): string[] {
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
   * if (providerFactory.hasProvider('openai')) {
   *   const provider = providerFactory.getProvider('openai');
   * }
   * ```
   */
  public hasProvider(providerId: string): boolean {
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
  public getContainer(): typeof container {
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
  public reset(): void {
    this.logger.warn('Resetting ProviderFactory');
    container.clearInstances();
    container.reset();
    this.registeredProviders.clear();
    this.initialized = false;
  }
}
