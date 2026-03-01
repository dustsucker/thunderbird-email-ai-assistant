/**
 * Analysis-specific error classes for email analysis workflows.
 *
 * These errors represent failures in the application layer during
 * email analysis, retrieval, and tag application operations.
 *
 * @module errors/analysis
 */

import { ApplicationError, InfrastructureError } from './BaseErrors';

/**
 * Error codes for analysis-related failures.
 */
export const ANALYSIS_ERROR_CODES = {
  EMAIL_ANALYSIS_FAILED: 'EMAIL_ANALYSIS_FAILED',
  EMAIL_RETRIEVAL_FAILED: 'EMAIL_RETRIEVAL_FAILED',
  TAG_APPLICATION_FAILED: 'TAG_APPLICATION_FAILED',
  CACHE_ERROR: 'CACHE_ERROR',
  BATCH_ANALYSIS_FAILED: 'BATCH_ANALYSIS_FAILED',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DI_RESOLUTION_FAILED: 'DI_RESOLUTION_FAILED',
} as const;

/**
 * Error thrown when email analysis fails.
 *
 * This is the main error for the email analysis use case,
 * wrapping failures from providers or other infrastructure.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await provider.analyze(email.content);
 * } catch (error) {
 *   throw new EmailAnalysisError(messageId, 'Analysis request failed', error);
 * }
 * ```
 */
export class EmailAnalysisError extends ApplicationError {
  /**
   * Creates a new EmailAnalysisError.
   *
   * @param messageId - The ID of the email that failed analysis
   * @param reason - Human-readable reason for the failure
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(messageId: string, reason: string, cause?: Error, context?: Record<string, unknown>) {
    super(
      `Email analysis failed for ${messageId}: ${reason}`,
      ANALYSIS_ERROR_CODES.EMAIL_ANALYSIS_FAILED,
      cause,
      { messageId, reason, ...context }
    );
    this.name = 'EmailAnalysisError';
  }
}

/**
 * Error thrown when email retrieval from Thunderbird fails.
 *
 * This occurs when the extension cannot read an email from
 * Thunderbird's mail API.
 *
 * @example
 * ```typescript
 * try {
 *   const email = await mailReader.getEmail(messageId);
 * } catch (error) {
 *   throw new EmailRetrievalError(messageId, error);
 * }
 * ```
 */
export class EmailRetrievalError extends ApplicationError {
  /**
   * Creates a new EmailRetrievalError.
   *
   * @param messageId - The ID of the email that failed to retrieve
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(messageId: string, cause?: Error, context?: Record<string, unknown>) {
    super(
      `Failed to retrieve email ${messageId}`,
      ANALYSIS_ERROR_CODES.EMAIL_RETRIEVAL_FAILED,
      cause,
      { messageId, ...context }
    );
    this.name = 'EmailRetrievalError';
  }
}

/**
 * Error thrown when tag application to an email fails.
 *
 * This occurs when the extension cannot apply tags to an email
 * through Thunderbird's tagging API.
 *
 * @example
 * ```typescript
 * try {
 *   await tagManager.applyTags(messageId, ['important', 'work']);
 * } catch (error) {
 *   throw new TagApplicationError(messageId, ['important', 'work'], error);
 * }
 * ```
 */
export class TagApplicationError extends ApplicationError {
  /**
   * Creates a new TagApplicationError.
   *
   * @param messageId - The ID of the email that failed tag application
   * @param tags - The tags that failed to be applied
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(messageId: string, tags: string[], cause?: Error, context?: Record<string, unknown>) {
    super(
      `Failed to apply tags [${tags.join(', ')}] to email ${messageId}`,
      ANALYSIS_ERROR_CODES.TAG_APPLICATION_FAILED,
      cause,
      { messageId, tags, ...context }
    );
    this.name = 'TagApplicationError';
  }
}

/**
 * Error thrown when cache operations fail.
 *
 * This occurs when reading from or writing to the analysis cache fails.
 *
 * @example
 * ```typescript
 * try {
 *   await cache.set(cacheKey, analysisResult);
 * } catch (error) {
 *   throw new CacheError('write', cacheKey, error);
 * }
 * ```
 */
export class CacheError extends InfrastructureError {
  /**
   * Creates a new CacheError.
   *
   * @param operation - The cache operation that failed ('read' or 'write')
   * @param key - The cache key involved in the operation
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(
    operation: 'read' | 'write' | 'delete' | 'clear',
    key: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(`Cache ${operation} failed for key ${key}`, ANALYSIS_ERROR_CODES.CACHE_ERROR, cause, {
      operation,
      key,
      ...context,
    });
    this.name = 'CacheError';
  }
}

/**
 * Error thrown when batch analysis fails.
 *
 * This wraps errors that occur during batch processing of multiple emails.
 *
 * @example
 * ```typescript
 * try {
 *   await analyzeBatch.execute(messageIds, settings);
 * } catch (error) {
 *   throw new BatchAnalysisError(processedCount, totalCount, error);
 * }
 * ```
 */
export class BatchAnalysisError extends ApplicationError {
  /**
   * Creates a new BatchAnalysisError.
   *
   * @param processedCount - Number of emails processed before failure
   * @param totalCount - Total number of emails in the batch
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(
    processedCount: number,
    totalCount: number,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `Batch analysis failed after processing ${processedCount}/${totalCount} emails`,
      ANALYSIS_ERROR_CODES.BATCH_ANALYSIS_FAILED,
      cause,
      { processedCount, totalCount, ...context }
    );
    this.name = 'BatchAnalysisError';
  }
}

/**
 * Error thrown when configuration is invalid or missing.
 *
 * @example
 * ```typescript
 * if (!config.apiKey) {
 *   throw new ConfigurationError('API key is required but not configured');
 * }
 * ```
 */
export class ConfigurationError extends ApplicationError {
  /**
   * Creates a new ConfigurationError.
   *
   * @param message - Description of the configuration issue
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, ANALYSIS_ERROR_CODES.CONFIGURATION_ERROR, cause, context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when DI container fails to resolve dependencies.
 *
 * @example
 * ```typescript
 * try {
 *   const analyzeEmail = container.resolve(AnalyzeEmail);
 * } catch (error) {
 *   throw new DependencyInjectionError('AnalyzeEmail', error);
 * }
 * ```
 */
export class DependencyInjectionError extends ApplicationError {
  /**
   * Creates a new DependencyInjectionError.
   *
   * @param serviceName - The name of the service that failed to resolve
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(serviceName: string, cause?: Error, context?: Record<string, unknown>) {
    super(
      `Failed to resolve ${serviceName} from DI container`,
      ANALYSIS_ERROR_CODES.DI_RESOLUTION_FAILED,
      cause,
      { serviceName, ...context }
    );
    this.name = 'DependencyInjectionError';
  }
}
