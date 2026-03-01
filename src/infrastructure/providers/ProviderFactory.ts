/**
 * ProviderFactory - Factory class for managing AI Provider instances using TSyringe DI container.
 *
 * This factory registers and resolves provider instances, wrapping legacy BaseProvider
 * implementations with BaseProviderAdapter for dependency injection compatibility.
 *
 * Uses dynamic imports for code-splitting - providers are loaded on-demand to reduce
 * initial bundle size.
 */

import { injectable, container, inject, InjectionToken } from 'tsyringe';
import { BaseProviderAdapter } from './BaseProviderAdapter';
import type { BaseProvider } from './BaseProvider';
import type { IProvider } from '../interfaces/IProvider';
import type { ILogger } from '../interfaces/ILogger';
import 'reflect-metadata';

// ============================================================================
// LAZY PROVIDER LOADER (Code-Splitting)
// ============================================================================

/**
 * Type for provider class constructors.
 */
type ProviderConstructor = new (logger: ILogger) => BaseProvider;

/**
 * Lazy loader function type - dynamically imports provider module.
 */
type ProviderLoader = () => Promise<
  { default: ProviderConstructor } | { [key: string]: ProviderConstructor }
>;

/**
 * Map of provider IDs to their lazy loader functions.
 * Using dynamic imports enables webpack code-splitting - each provider
 * becomes a separate chunk that's loaded only when needed.
 */
const PROVIDER_LOADERS: ReadonlyMap<string, ProviderLoader> = new Map([
  [
    'openai',
    () =>
      import(
        /* webpackChunkName: "provider-openai" */
        './impl/OpenAIProvider'
      ).then((m) => ({ default: m.OpenAIProvider })),
  ],
  [
    'claude',
    () =>
      import(
        /* webpackChunkName: "provider-claude" */
        './impl/ClaudeProvider'
      ).then((m) => ({ default: m.ClaudeProvider })),
  ],
  [
    'gemini',
    () =>
      import(
        /* webpackChunkName: "provider-gemini" */
        './impl/GeminiProvider'
      ).then((m) => ({ default: m.GeminiProvider })),
  ],
  [
    'mistral',
    () =>
      import(
        /* webpackChunkName: "provider-mistral" */
        './impl/MistralProvider'
      ).then((m) => ({ default: m.MistralProvider })),
  ],
  [
    'ollama',
    () =>
      import(
        /* webpackChunkName: "provider-ollama" */
        './impl/OllamaProvider'
      ).then((m) => ({ default: m.OllamaProvider })),
  ],
  [
    'deepseek',
    () =>
      import(
        /* webpackChunkName: "provider-deepseek" */
        './impl/DeepseekProvider'
      ).then((m) => ({ default: m.DeepseekProvider })),
  ],
  [
    'zai-paas',
    () =>
      import(
        /* webpackChunkName: "provider-zai-paas" */
        './impl/ZaiPaaSProvider'
      ).then((m) => ({ default: m.ZaiPaaSProvider })),
  ],
  [
    'zai-coding',
    () =>
      import(
        /* webpackChunkName: "provider-zai-coding" */
        './impl/ZaiCodingProvider'
      ).then((m) => ({ default: m.ZaiCodingProvider })),
  ],
]);

/**
 * Cache for loaded provider classes to avoid repeated dynamic imports.
 */
const loadedProviderClasses = new Map<string, ProviderConstructor>();

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
 * - Loading providers on-demand using dynamic imports (code-splitting)
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
  private readonly registeredProviders = new Map<string, InjectionToken<unknown>>();
  private readonly adapterCache = new Map<string, IProvider>();
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
   * Initializes the ProviderFactory and registers provider tokens.
   *
   * This method is called by the constructor. It prepares the provider
   * registry but does NOT load provider modules - they are loaded on-demand.
   *
   * @remarks
   * This method is idempotent - calling it multiple times has no effect.
   */
  private initialize(): void {
    if (this.initialized) {
      this.logger.debug('ProviderFactory already initialized');
      return;
    }

    this.logger.info('Initializing ProviderFactory with lazy loading');

    // Register provider IDs (but don't load the modules yet)
    for (const providerId of PROVIDER_ID_TO_TOKEN.keys()) {
      const token = PROVIDER_ID_TO_TOKEN.get(providerId);
      if (token) {
        this.registeredProviders.set(providerId, token);
      }
    }

    this.initialized = true;
    this.logger.info('ProviderFactory initialized successfully', {
      availableProviders: this.getAvailableProviders(),
    });
  }

  /**
   * Loads a provider class dynamically using code-splitting.
   *
   * @param providerId - The provider ID to load
   * @returns The provider class constructor
   * @throws {Error} If provider cannot be loaded
   */
  private async loadProviderClass(providerId: string): Promise<ProviderConstructor> {
    // Check cache first
    const cachedClass = loadedProviderClasses.get(providerId);
    if (cachedClass) {
      this.logger.debug('Provider class loaded from cache', { providerId });
      return cachedClass;
    }

    // Get the loader function
    const loader = PROVIDER_LOADERS.get(providerId);
    if (!loader) {
      throw new Error(`No loader found for provider: ${providerId}`);
    }

    this.logger.debug('Loading provider module (code-split)', { providerId });

    // Dynamic import - webpack will create a separate chunk
    const module = await loader();
    const ProviderClass = module.default;

    if (!ProviderClass) {
      throw new Error(`Provider class not found in module for: ${providerId}`);
    }

    // Cache for future use
    loadedProviderClasses.set(providerId, ProviderClass);
    this.logger.debug('Provider class loaded and cached', { providerId });

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

    // Load the provider class dynamically
    const ProviderClass = await this.loadProviderClass(providerId);

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
   * This method loads the provider module on-demand using dynamic imports,
   * enabling code-splitting to reduce initial bundle size.
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

    // Validate provider ID
    if (!this.registeredProviders.has(providerId)) {
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
      this.logger.debug('Loading provider (lazy load)', { providerId });

      // Create the adapter (which loads the provider class dynamically)
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
   *   const provider = await providerFactory.getProvider('openai');
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
    this.adapterCache.clear();
    loadedProviderClasses.clear();
    this.initialized = false;
  }
}
