/**
 * Exports for the Provider infrastructure.
 *
 * Provides access to IProvider interface, BaseProviderAdapter implementation,
 * ProviderFactory, and all DI-injectable provider implementations.
 */

export type {
  IProvider,
  IProviderSettings,
  IAttachment,
  IStructuredEmailData,
  ICustomTag,
  ITagResponse,
  IAnalyzeInput,
} from '../interfaces/IProvider';

export { BaseProviderAdapter } from './BaseProviderAdapter';
export { ProviderFactory, ProviderTokens } from './ProviderFactory';

export { BaseProvider } from './BaseProvider';

export { ClaudeProvider } from './impl/ClaudeProvider';
export { DeepseekProvider } from './impl/DeepseekProvider';
export { GeminiProvider } from './impl/GeminiProvider';
export { MistralProvider } from './impl/MistralProvider';
export { OllamaProvider } from './impl/OllamaProvider';
export { OpenAIProvider } from './impl/OpenAIProvider';
export { ZaiPaaSProvider } from './impl/ZaiPaaSProvider';
export { ZaiCodingProvider } from './impl/ZaiCodingProvider';

// ============================================================================
// Helper Functions for UI Integration
// ============================================================================

import { ZaiPaaSProvider } from './impl/ZaiPaaSProvider';
import { ZaiCodingProvider } from './impl/ZaiCodingProvider';

/**
 * Fetches available models from Z.ai API.
 *
 * Helper function for UI code that needs to fetch models without DI.
 * Uses ZaiPaaSProvider for 'paas' variant and ZaiCodingProvider for 'coding' variant.
 * Defaults to 'paas' variant.
 *
 * @param apiKey - The API key for authentication
 * @param variant - Optional API variant ('paas' or 'coding'). Defaults to 'paas'.
 * @returns Promise resolving to an array of available model names
 */
export async function fetchZaiModels(
  apiKey: string,
  variant?: 'paas' | 'coding'
): Promise<string[]> {
  const provider =
    variant === 'coding'
      ? new ZaiCodingProvider({ debug: () => {}, info: () => {}, error: () => {} } as never)
      : new ZaiPaaSProvider({ debug: () => {}, info: () => {}, error: () => {} } as never);

  return provider.listModels({ apiKey });
}
