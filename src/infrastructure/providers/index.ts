/**
 * Exports for the Provider infrastructure.
 *
 * Provides access to IProvider interface, BaseProviderAdapter implementation,
 * and ProviderFactory.
 *
 * Note: Provider implementations are statically bundled and resolved via
 * ProviderFactory.getProvider() (no async chunks — MailExtensions cannot ship
 * split chunks in an xpi).
 */

export type {
  IProvider,
  IProviderSettings,
  IRuntimeProviderSettings,
  IAttachment,
  IStructuredEmailData,
  ICustomTag,
  ITagResponse,
  IAnalyzeInput,
} from '../interfaces/IProvider';

export { BaseProviderAdapter } from './BaseProviderAdapter';
export { ProviderFactory, ProviderTokens } from './ProviderFactory';
import { ZaiPaaSProvider } from './impl/ZaiPaaSProvider';

export { BaseProvider } from './BaseProvider';

// ============================================================================
// Helper Functions for UI Integration
// ============================================================================

/**
 * Fetches available models from Z.ai API.
 *
 * Helper function for UI code that needs to fetch models without DI.
 * ZaiPaaSProvider is statically imported (no async chunks in MailExtensions).
 *
 * @param apiKey - The API key for authentication
 * @returns Promise resolving to an array of available model names
 */
export async function fetchZaiModels(apiKey: string): Promise<string[]> {
  const provider = new ZaiPaaSProvider({
    debug: () => {},
    info: () => {},
    error: () => {},
  } as never);

  return provider.listModels({ apiKey });
}
