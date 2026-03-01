/**
 * Use Cases Exports
 *
 * Exports all application use cases for email analysis and tag management.
 *
 * @module application/use-cases
 */

// ============================================================================
// Use Case Exports
// ============================================================================

export { AnalyzeEmail } from './AnalyzeEmail';
export type { AnalyzeEmailResult, AnalyzeEmailConfig } from './AnalyzeEmail';

export { ApplyTagsToEmail } from './ApplyTagsToEmail';
export type { ApplyTagsConfig, ApplyTagsResult } from './ApplyTagsToEmail';

export { AnalyzeBatchEmails } from './AnalyzeBatchEmails';
export type {
  BatchProgress,
  BatchAnalysisConfig,
  EmailAnalysisResult,
  BatchAnalysisResult,
} from './AnalyzeBatchEmails';

// New extracted use cases
export { RetrieveEmailUseCase } from './RetrieveEmailUseCase';
export type { RetrieveEmailResult } from './RetrieveEmailUseCase';

export { ExtractEmailContentUseCase } from './ExtractEmailContentUseCase';

export { CacheAnalysisUseCase } from './CacheAnalysisUseCase';
export type { CacheKeyResult } from './CacheAnalysisUseCase';

export { ApplyTagsWithConfidenceUseCase } from './ApplyTagsWithConfidenceUseCase';
export type {
  ApplyTagsWithConfidenceConfig,
  ApplyTagsWithConfidenceResult,
  LowConfidenceFlag,
} from './ApplyTagsWithConfidenceUseCase';

// ============================================================================
// Interface Re-exports
// ============================================================================

export type {
  IMailReader,
  IEmailMessage,
  IEmailPart,
  IEmailAttachment,
  IEmailHeaders,
  IEmailQuery,
} from '@/infrastructure/interfaces/IMailReader';

export type {
  ITagManager,
  ThunderbirdTag,
  StorageCustomTags,
  CustomTags,
  TagUpdateOptions,
} from '@/domain/interfaces';

export type {
  IProvider,
  IProviderSettings,
  IRuntimeProviderSettings,
  IAttachment,
  IStructuredEmailData,
  ICustomTag,
  ITagResponse,
  IAnalyzeInput,
} from '@/infrastructure/interfaces/IProvider';

export type { ICache, ICacheEntry, ICacheStats } from '@/infrastructure/interfaces/ICache';

export type { ILogger } from '@/domain/interfaces';

export type { IQueue, IQueuedItem, IQueueStats } from '@/infrastructure/interfaces/IQueue';
