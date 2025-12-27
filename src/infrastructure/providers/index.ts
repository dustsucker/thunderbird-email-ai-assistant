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
export { ZaiProvider } from './impl/ZaiProvider';
