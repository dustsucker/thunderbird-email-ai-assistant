/**
 * Provider registry for email analysis AI providers
 * @module providers
 */

import { Provider, ProviderConfig, CustomTags } from '../core/config';
import { StructuredEmailData } from '../core/analysis';
import { TagResponse } from '../src/infrastructure/providers/ProviderUtils';

// Import type for backward compatibility
export type { TagResponse };

import { analyzeWithOllama } from './ollama';
import { analyzeWithOpenAI } from './openai';
import { analyzeWithGemini } from './gemini';
import { analyzeWithClaude } from './claude';
import { analyzeWithMistral } from './mistral';
import { analyzeWithDeepseek } from './deepseek';
import { analyzeWithZai, ZaiSettings } from './zai';

// ============================================================================
// PROVIDER INTERFACES
// ============================================================================

/**
 * Unified provider function signature for all AI providers
 * All providers must conform to this interface
 * Note: Provider functions now throw errors instead of returning null
 */
export type ProviderFunction = (
  settings: unknown,
  structuredData: StructuredEmailData,
  customTags: CustomTags
) => Promise<TagResponse>;

/**
 * Provider settings type mapping
 * Maps each provider to its specific settings type from ProviderConfig
 */
export type ProviderSettingsMap = {
  [Provider.OLLAMA]: Pick<ProviderConfig, 'ollamaApiUrl' | 'ollamaModel'>;
  [Provider.OPENAI]: Pick<ProviderConfig, 'openaiApiKey'>;
  [Provider.GEMINI]: Pick<ProviderConfig, 'geminiApiKey'>;
  [Provider.CLAUDE]: Pick<ProviderConfig, 'claudeApiKey'>;
  [Provider.MISTRAL]: Pick<ProviderConfig, 'mistralApiKey'>;
  [Provider.DEEPSEEK]: Pick<ProviderConfig, 'deepseekApiKey'>;
  [Provider.ZAI]: ZaiSettings;
};

/**
 * Extract settings type for a specific provider
 */
export type GetProviderSettings<T extends Provider> = ProviderSettingsMap[T];

/**
 * Type-safe provider registry
 * Maps Provider enum values to their implementation functions
 */
export type ProviderRegistry = Readonly<{
  [K in Provider]: ProviderFunction;
}>;

/**
 * Type-safe provider settings extraction function
 */
export type ProviderSettingsExtractor<T extends Provider> = (
  config: ProviderConfig
) => GetProviderSettings<T>;

// ============================================================================
// PROVIDER SETTINGS EXTRACTORS
// ============================================================================

/**
 * Extracts Ollama-specific settings from full provider config
 */
export function getOllamaSettings(config: ProviderConfig): GetProviderSettings<Provider.OLLAMA> {
  return {
    ollamaApiUrl: config.ollamaApiUrl,
    ollamaModel: config.ollamaModel,
  };
}

/**
 * Extracts OpenAI-specific settings from full provider config
 */
export function getOpenAISettings(config: ProviderConfig): GetProviderSettings<Provider.OPENAI> {
  return {
    openaiApiKey: config.openaiApiKey,
  };
}

/**
 * Extracts Gemini-specific settings from full provider config
 */
export function getGeminiSettings(config: ProviderConfig): GetProviderSettings<Provider.GEMINI> {
  return {
    geminiApiKey: config.geminiApiKey,
  };
}

/**
 * Extracts Claude-specific settings from full provider config
 */
export function getClaudeSettings(config: ProviderConfig): GetProviderSettings<Provider.CLAUDE> {
  return {
    claudeApiKey: config.claudeApiKey,
  };
}

/**
 * Extracts Mistral-specific settings from full provider config
 */
export function getMistralSettings(config: ProviderConfig): GetProviderSettings<Provider.MISTRAL> {
  return {
    mistralApiKey: config.mistralApiKey,
  };
}

/**
 * Extracts Deepseek-specific settings from full provider config
 */
export function getDeepseekSettings(
  config: ProviderConfig
): GetProviderSettings<Provider.DEEPSEEK> {
  return {
    deepseekApiKey: config.deepseekApiKey,
  };
}

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Readonly registry of all available provider implementations
 * This map ensures type-safe provider lookup and selection
 */
export const PROVIDER_REGISTRY: ProviderRegistry = {
  [Provider.OLLAMA]: analyzeWithOllama as ProviderFunction,
  [Provider.OPENAI]: analyzeWithOpenAI as ProviderFunction,
  [Provider.GEMINI]: analyzeWithGemini as ProviderFunction,
  [Provider.CLAUDE]: analyzeWithClaude as ProviderFunction,
  [Provider.MISTRAL]: analyzeWithMistral as ProviderFunction,
  [Provider.DEEPSEEK]: analyzeWithDeepseek as ProviderFunction,
  [Provider.ZAI]: analyzeWithZai as ProviderFunction,
} as const;

/**
 * Settings extractor registry
 * Maps each provider to its settings extraction function
 */
export const SETTINGS_EXTRACTORS: Readonly<{
  [K in Provider]: ProviderSettingsExtractor<K>;
}> = {
  [Provider.OLLAMA]: getOllamaSettings,
  [Provider.OPENAI]: getOpenAISettings,
  [Provider.GEMINI]: getGeminiSettings,
  [Provider.CLAUDE]: getClaudeSettings,
  [Provider.MISTRAL]: getMistralSettings,
  [Provider.DEEPSEEK]: getDeepseekSettings,
  [Provider.ZAI]: (config: ProviderConfig): ZaiSettings => ({
    zaiApiKey: config.zaiApiKey,
    zaiBaseUrl: config.zaiBaseUrl,
    zaiModel: config.zaiModel,
    zaiVariant: config.zaiVariant,
  }),
} as const;

// ============================================================================
// PROVIDER SELECTION FUNCTIONS
// ============================================================================

/**
 * Type guard to check if a provider string is valid
 * @param provider - Provider string to validate
 * @returns True if the provider is valid
 */
export function isValidProvider(provider: string): provider is Provider {
  return Object.values(Provider).includes(provider as Provider);
}

/**
 * Gets a provider function by provider type
 *
 * @param provider - The provider enum value
 * @returns The provider function for the given provider type
 * @throws {Error} If the provider is not found in registry
 *
 * @example
 * const providerFn = getProvider(Provider.OPENAI);
 * const result = await providerFn(
 *   { openaiApiKey: 'sk-...' },
 *   emailData,
 *   customTags
 * );
 */
export function getProvider(provider: Provider): ProviderFunction {
  const providerFn = PROVIDER_REGISTRY[provider];

  if (!providerFn) {
    throw new Error(`Provider not found: ${provider}`);
  }

  return providerFn;
}

/**
 * Gets provider settings for a specific provider from full config
 *
 * @param provider - The provider enum value
 * @param config - Full provider configuration
 * @returns Provider-specific settings
 *
 * @example
 * const ollamaSettings = getProviderSettings(Provider.OLLAMA, fullConfig);
 * // Returns: { ollamaApiUrl: '...', ollamaModel: '...' }
 */
export function getProviderSettings<T extends Provider>(
  provider: T,
  config: ProviderConfig
): GetProviderSettings<T> {
  const extractor = SETTINGS_EXTRACTORS[provider];

  if (!extractor) {
    throw new Error(`Settings extractor not found for provider: ${provider}`);
  }

  return extractor(config);
}

/**
 * Analyzes an email using the specified provider
 *
 * This is a convenience function that extracts the provider settings
 * from the full config and calls the appropriate provider function.
 *
 * @param provider - The provider enum value
 * @param config - Full provider configuration
 * @param structuredData - Email data including headers, body, and attachments
 * @param customTags - Array of custom tag configurations for analysis
 * @returns Promise resolving to validated LLM response
 * @throws {Error} If provider settings are invalid, API request fails, or response parsing fails
 *
 * @example
 * const result = await analyzeEmail(
 *   Provider.OPENAI,
 *   fullConfig,
 *   emailData,
 *   customTags
 * );
 */
export async function analyzeEmail(
  provider: Provider,
  config: ProviderConfig,
  structuredData: StructuredEmailData,
  customTags: CustomTags
): Promise<TagResponse> {
  const providerFn = getProvider(provider);
  const settings = getProviderSettings(provider, config);

  return providerFn(settings, structuredData, customTags);
}

// ============================================================================
// PROVIDER ENUMERATION
// ============================================================================

/**
 * Array of all available provider values
 */
export const AVAILABLE_PROVIDERS: ReadonlyArray<Provider> = Object.freeze([
  Provider.OLLAMA,
  Provider.OPENAI,
  Provider.GEMINI,
  Provider.CLAUDE,
  Provider.MISTRAL,
  Provider.DEEPSEEK,
  Provider.ZAI,
]);

/**
 * Gets all available providers as an array
 * @returns Readonly array of all provider enum values
 */
export function getAllProviders(): ReadonlyArray<Provider> {
  return AVAILABLE_PROVIDERS;
}

/**
 * Checks if a provider is available in the registry
 * @param provider - Provider to check
 * @returns True if the provider is available
 */
export function isProviderAvailable(provider: Provider): boolean {
  return provider in PROVIDER_REGISTRY;
}

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================

/**
 * Legacy export name for provider engines
 * Maps provider names to their implementation functions
 * @deprecated Use PROVIDER_REGISTRY instead
 */
export const PROVIDER_ENGINES: Readonly<Record<string, ProviderFunction>> = {
  ollama: PROVIDER_REGISTRY[Provider.OLLAMA],
  openai: PROVIDER_REGISTRY[Provider.OPENAI],
  gemini: PROVIDER_REGISTRY[Provider.GEMINI],
  claude: PROVIDER_REGISTRY[Provider.CLAUDE],
  mistral: PROVIDER_REGISTRY[Provider.MISTRAL],
  deepseek: PROVIDER_REGISTRY[Provider.DEEPSEEK],
  zai: PROVIDER_REGISTRY[Provider.ZAI],
} as const;
