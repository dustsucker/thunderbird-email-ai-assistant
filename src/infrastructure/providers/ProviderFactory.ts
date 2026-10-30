/**
 * ProviderFactory - Factory class for managing AI Provider instances using TSyringe DI container.
 *
 * This factory registers and resolves provider instances, wrapping legacy BaseProvider
 * implementations with BaseProviderAdapter for dependency injection compatibility.
 *
 * Providers are statically imported — the background bundle is self-contained
 * (dynamic import() would emit async chunks that a MailExtension cannot ship).
 */

import { injectable, container, inject, InjectionToken } from 'tsyringe';
import { BaseProviderAdapter } from './BaseProviderAdapter';
import type { BaseProvider } from './BaseProvider';
import type { IProvider } from '../interfaces/IProvider';
import type { ILogger } from '@/domain/interfaces';
import { OpenAIProvider } from './impl/OpenAIProvider';
import { ClaudeProvider } from './impl/ClaudeProvider';
import { GeminiProvider } from './impl/GeminiProvider';
import { MistralProvider } from './impl/MistralProvider';
import { OllamaProvider } from './impl/OllamaProvider';
import { DeepseekProvider } from './impl/DeepseekProvider';
import { OpenRouterProvider } from './impl/OpenRouterProvider';
import { OpenRouterDecisionsProvider } from './impl/OpenRouterDecisionsProvider';
import { ZaiPaaSProvider } from './impl/ZaiPaaSProvider';
import { ZaiCodingProvider } from './impl/ZaiCodingProvider';
import 'reflect-metadata';

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Type for provider class constructors.
 */
type ProviderConstructor = new (logger: ILogger) => BaseProvider;

/**
 * Static provider registry: provider ID → provider class.
 * All providers are bundled into the background script (no code-splitting —
 * async chunks are not shippable in a MailExtension xpi).
 */
const PROVIDER_REGISTRY: ReadonlyMap<string, ProviderConstructor> = new Map<string, ProviderConstructor>([
  ['openai', OpenAIProvider as ProviderConstructor],
  ['claude', ClaudeProvider as ProviderConstructor],
  ['gemini', GeminiProvider as ProviderConstructor],
  ['mistral', MistralProvider as ProviderConstructor],
  ['ollama', OllamaProvider as ProviderConstructor],
  ['deepseek', DeepseekProvider as ProviderConstructor],
  ['openrouter', OpenRouterProvider as ProviderConstructor],
  ['openrouter-decisions', OpenRouterDecisionsProvider as ProviderConstructor],
  ['zai-paas', ZaiPaaSProvider as ProviderConstructor],
  ['zai-coding', ZaiCodingProvider as ProviderConstructor],
]);

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
  OPENROUTER_PROVIDER: 'provider:openrouter' as InjectionToken<unknown>,
  OPENROUTER_DECISIONS_PROVIDER: 'provider:openrouter-decisions' as InjectionToken<unknown>,
  ZAI_PAAS_PROVIDER: 'provider:zai-paas' as InjectionToken<unknown>,
  ZAI_CODING_PROVIDER: 'provider:zai-coding' as InjectionToken<unknown>,
} as const;

/**
 * Derives the DI registration token for a provider id.
 * Single source of truth: the id itself.
 */
function providerToken(providerId: string): InjectionToken<unknown> {
  return `provider:${providerId}` as InjectionToken<unknown>;
}

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
 * - Resolving statically registered provider classes
 * - Caching loaded provider instances for performance
 * - Wrapping legacy BaseProvider implementations with BaseProviderAdapter
 * - Maintaining a registry of available providers
 *
 * @example
 * ```typescript
 * // Use via DI container
 * const providerFactory = container.resolve<ProviderFactory>(ProviderFactory);
 *
 * // Get a specific provider (async - loads on demand)
 * const provider = await providerFactory.getProvider('openai');
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
  /** Providers registered at runtime via registerProvider() */
  private readonly customProviders = new Map<string, IProvider>();
  private readonly adapterCache = new Map<string, IProvider>();

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
   * Initializes the ProviderFactory.
   *
   * Providers are statically imported into PROVIDER_REGISTRY, so no runtime
   * registration is required — this only emits the startup log.
   */
  private initialize(): void {
    this.logger.info('Initializing ProviderFactory');
    this.logger.info('ProviderFactory initialized successfully', {
      availableProviders: this.getAvailableProviders(),
    });
  }

  /**
   * Resolves a provider class from the static registry.
   *
   * @param providerId - The provider ID to resolve
   * @returns The provider class constructor
   * @throws {Error} If provider is not in the registry
   */
  private getProviderClass(providerId: string): ProviderConstructor {
    const ProviderClass = PROVIDER_REGISTRY.get(providerId);
    if (!ProviderClass) {
      throw new Error(`No provider class registered for: ${providerId}`);
    }
    return ProviderClass;
  }

  /**
   * Creates a provider adapter for the given provider ID.
   *
   * @param providerId - The provider ID
   * @returns The provider adapter instance
   */
  private async createProviderAdapter(providerId: string): Promise<IProvider> {
    this.logger.debug('Creating provider adapter', { providerId });

    // Resolve the statically imported provider class
    const ProviderClass = this.getProviderClass(providerId);

    // Instantiate the provider with logger
    const providerInstance = new ProviderClass(this.logger) as BaseProvider;
    this.logger.debug('Provider instantiated', { providerId });

    // Create adapter with the provider instance
    return new BaseProviderAdapter(providerId, providerInstance, this.logger);
  }

  // ========================================================================
  // PROVIDER RESOLUTION
  // ========================================================================

  /**
   * Gets a provider instance by its provider ID.
   *
   * All providers are statically imported and bundled — dynamic import()
   * code-splitting is intentionally avoided because the packaged extension
   * only ships the main bundles (async chunks would 404 at runtime).
   *
   * @param providerId - The unique identifier for the provider (e.g., 'openai', 'claude')
   * @returns Promise resolving to the IProvider instance
   * @throws {Error} If provider is not registered or fails to load
   *
   * @example
   * ```typescript
   * const provider = await providerFactory.getProvider('openai');
   * const isValid = await provider.validateSettings({ apiKey: 'sk-...' });
   * ```
   */
  public async getProvider(providerId: string): Promise<IProvider> {
    // Check cache first
    const cachedAdapter = this.adapterCache.get(providerId);
    if (cachedAdapter) {
      this.logger.debug('Provider adapter served from cache', { providerId });
      return cachedAdapter;
    }

    // Serve custom providers directly from the runtime registry
    const customProvider = this.customProviders.get(providerId);
    if (customProvider) {
      this.logger.debug('Provider adapter served from custom registry', { providerId });
      return customProvider;
    }

    // Validate provider ID
    if (!PROVIDER_REGISTRY.has(providerId)) {
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

      // Create the adapter (resolves the statically imported provider class)
      const adapter = await this.createProviderAdapter(providerId);

      // Validate the adapter implements IProvider
      if (!isIProvider(adapter)) {
        this.logger.error('Created adapter is not an IProvider', { providerId });
        throw new Error(`Created adapter is not a valid IProvider: ${providerId}`);
      }

      // Cache the adapter for future use
      this.adapterCache.set(providerId, adapter);

      this.logger.debug('Provider loaded and cached successfully', {
        providerId,
        resolvedProviderId: adapter.providerId,
      });

      return adapter;
    } catch (error) {
      this.logger.error('Failed to load provider', {
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

    const token = providerToken(providerId);

    // If provider already implements IProvider, register it directly
    if (isIProvider(provider)) {
      container.registerInstance(token, provider);
      this.customProviders.set(providerId, provider);
      this.logger.debug('Registered provider as IProvider implementation', { providerId });
    } else {
      // Otherwise, wrap it in a BaseProviderAdapter
      const adapter = new BaseProviderAdapter(providerId, provider as never, this.logger);
      container.registerInstance(token, adapter);
      this.customProviders.set(providerId, adapter);
      this.logger.debug('Registered provider with BaseProviderAdapter', { providerId });
    }

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
    return Array.from(new Set([...PROVIDER_REGISTRY.keys(), ...this.customProviders.keys()])).sort();
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
   *   const provider = await providerFactory.getProvider('openai');
   * }
   * ```
   */
  public hasProvider(providerId: string): boolean {
    return PROVIDER_REGISTRY.has(providerId) || this.customProviders.has(providerId);
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
   * Clears the provider adapter cache.
   *
   * Does NOT touch the global DI container — providers are statically
   * registered and the container is owned by the application bootstrap.
   *
   * This method is primarily useful for testing.
   */
  public reset(): void {
    this.logger.warn('Resetting ProviderFactory');
    this.adapterCache.clear();
  }
}
