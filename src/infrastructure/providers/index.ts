/**
 * Exports for the Provider infrastructure.
 *
 * Provides access to IProvider interface, BaseProviderAdapter implementation,
 * and ProviderFactory.
 *
 * Note: Provider implementations are lazy-loaded via ProviderFactory.getProvider()
 * to enable code-splitting and reduce initial bundle size. Direct imports of
 * provider classes are available but should be avoided in production code.
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

// ============================================================================
// Helper Functions for UI Integration
// ============================================================================

/**
 * Fetches available models from Z.ai API.
 *
 * Helper function for UI code that needs to fetch models without DI.
 * Uses dynamic import for code-splitting - ZaiPaaSProvider is loaded on demand.
 *
 * @param apiKey - The API key for authentication
 * @returns Promise resolving to an array of available model names
 */
export async function fetchZaiModels(apiKey: string): Promise<string[]> {
  // Dynamic import for code-splitting
  const { ZaiPaaSProvider } = await import(
    /* webpackChunkName: "provider-zai-paas" */
    './impl/ZaiPaaSProvider'
  );

  const provider = new ZaiPaaSProvider({
    debug: () => {},
    info: () => {},
    error: () => {},
  } as never);

  return provider.listModels({ apiKey });
}
