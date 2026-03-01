/**
 * Custom error hierarchy for consistent error handling in the Thunderbird Email AI Assistant.
 *
 * All errors extend EmailAnalysisError which provides:
 * - Error code for programmatic handling
 * - Optional cause chain for proper error propagation
 * - Proper stack trace capture in V8 environments
 *
 * @module errors
 */

/**
 * Base error class for all email analysis errors.
 *
 * Provides a consistent interface for error handling with:
 * - Error code for programmatic identification
 * - Optional cause chain for error propagation
 * - Proper stack trace capture
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   throw new EmailAnalysisError('Operation failed', 'OPERATION_FAILED', error);
 * }
 * ```
 */
export class EmailAnalysisError extends Error {
  /**
   * Creates a new EmailAnalysisError.
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param cause - Optional underlying error that caused this error
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EmailAnalysisError';

    // Maintain proper stack trace in V8 environments (Node.js, Chrome, Thunderbird)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error during email retrieval from Thunderbird.
 *
 * Thrown when the extension fails to read an email from Thunderbird's API.
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
export class EmailRetrievalError extends EmailAnalysisError {
  /**
   * Creates a new EmailRetrievalError.
   *
   * @param messageId - The ID of the email that failed to retrieve
   * @param cause - Optional underlying error that caused this error
   */
  constructor(messageId: string, cause?: Error) {
    super(`Failed to retrieve email ${messageId}`, 'EMAIL_RETRIEVAL_FAILED', cause);
    this.name = 'EmailRetrievalError';
  }
}

/**
 * Error during AI provider communication.
 *
 * Thrown when communication with an AI provider (OpenAI, Ollama, etc.) fails.
 *
 * @example
 * ```typescript
 * try {
 *   const response = await provider.analyze(content);
 * } catch (error) {
 *   throw new ProviderError('openai', 'Analysis request failed', error);
 * }
 * ```
 */
export class ProviderError extends EmailAnalysisError {
  /**
   * Creates a new ProviderError.
   *
   * @param provider - The name of the provider that failed
   * @param message - Description of what failed
   * @param cause - Optional underlying error that caused this error
   */
  constructor(provider: string, message: string, cause?: Error) {
    super(`Provider ${provider} error: ${message}`, 'PROVIDER_ERROR', cause);
    this.name = 'ProviderError';
  }
}

/**
 * Error during tag application.
 *
 * Thrown when the extension fails to apply tags to an email.
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
export class TagApplicationError extends EmailAnalysisError {
  /**
   * Creates a new TagApplicationError.
   *
   * @param messageId - The ID of the email that failed tag application
   * @param tags - The tags that failed to be applied
   * @param cause - Optional underlying error that caused this error
   */
  constructor(messageId: string, tags: string[], cause?: Error) {
    super(
      `Failed to apply tags ${tags.join(', ')} to email ${messageId}`,
      'TAG_APPLICATION_FAILED',
      cause
    );
    this.name = 'TagApplicationError';
  }
}

/**
 * Error during batch analysis.
 *
 * Thrown when a batch analysis operation fails.
 *
 * @example
 * ```typescript
 * try {
 *   await analyzeBatch.execute(messageIds, settings);
 * } catch (error) {
 *   throw new BatchAnalysisError('Batch processing interrupted', error);
 * }
 * ```
 */
export class BatchAnalysisError extends EmailAnalysisError {
  /**
   * Creates a new BatchAnalysisError.
   *
   * @param message - Description of what failed in the batch
   * @param cause - Optional underlying error that caused this error
   */
  constructor(message: string, cause?: Error) {
    super(message, 'BATCH_ANALYSIS_FAILED', cause);
    this.name = 'BatchAnalysisError';
  }
}

/**
 * Configuration error.
 *
 * Thrown when there's an issue with the extension configuration.
 *
 * @example
 * ```typescript
 * if (!config.apiKey) {
 *   throw new ConfigurationError('API key is required but not configured');
 * }
 * ```
 */
export class ConfigurationError extends EmailAnalysisError {
  /**
   * Creates a new ConfigurationError.
   *
   * @param message - Description of the configuration issue
   * @param cause - Optional underlying error that caused this error
   */
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIGURATION_ERROR', cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error when DI container fails to resolve dependencies.
 *
 * Thrown when a required service cannot be resolved from the dependency
 * injection container.
 *
 * @example
 * ```typescript
 * const analyzeEmail = container.resolve(AnalyzeEmail);
 * if (!analyzeEmail) {
 *   throw new DependencyInjectionError('AnalyzeEmail');
 * }
 * ```
 */
export class DependencyInjectionError extends EmailAnalysisError {
  /**
   * Creates a new DependencyInjectionError.
   *
   * @param serviceName - The name of the service that failed to resolve
   * @param cause - Optional underlying error that caused this error
   */
  constructor(serviceName: string, cause?: Error) {
    super(`Failed to resolve ${serviceName} from DI container`, 'DI_RESOLUTION_FAILED', cause);
    this.name = 'DependencyInjectionError';
  }
}
