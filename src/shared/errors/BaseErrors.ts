/**
 * Base error classes for the layered architecture.
 *
 * Provides abstract base classes for each architectural layer:
 * - DomainError: Core business logic errors (no external dependencies)
 * - InfrastructureError: External service failures (API, storage, etc.)
 * - ApplicationError: Use case orchestration failures
 *
 * All errors include:
 * - Unique error code for programmatic handling
 * - Optional context for debugging
 * - Proper stack trace capture in V8 environments
 *
 * @module errors/base
 */

/**
 * Base error class for all domain layer errors.
 *
 * Domain errors represent business rule violations and validation failures.
 * They have no dependencies on external services or infrastructure.
 *
 * @example
 * ```typescript
 * export class InvalidEmailError extends DomainError {
 *   constructor(email: string) {
 *     super(`Invalid email: ${email}`, 'INVALID_EMAIL', { email });
 *   }
 * }
 * ```
 */
export abstract class DomainError extends Error {
  /**
   * Creates a new DomainError.
   *
   * @param message - Human-readable error message
   * @param code - Unique error code for programmatic handling
   * @param context - Optional additional context for debugging
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';

    // Maintain proper stack trace in V8 environments (Node.js, Chrome, Thunderbird)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Base error class for all infrastructure layer errors.
 *
 * Infrastructure errors represent failures in external systems:
 * - AI provider communication failures
 * - Storage/cache errors
 * - Network issues
 *
 * @example
 * ```typescript
 * export class ProviderRequestError extends InfrastructureError {
 *   constructor(provider: string, cause?: Error) {
 *     super(`Request to ${provider} failed`, 'PROVIDER_REQUEST_FAILED', cause, { provider });
 *   }
 * }
 * ```
 */
export abstract class InfrastructureError extends Error {
  /**
   * Creates a new InfrastructureError.
   *
   * @param message - Human-readable error message
   * @param code - Unique error code for programmatic handling
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'InfrastructureError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Base error class for all application layer errors.
 *
 * Application errors represent use case orchestration failures:
 * - Email retrieval failures
 * - Tag application failures
 * - Analysis workflow errors
 *
 * @example
 * ```typescript
 * export class EmailAnalysisError extends ApplicationError {
 *   constructor(messageId: string, cause?: Error) {
 *     super(`Analysis failed for ${messageId}`, 'ANALYSIS_FAILED', cause, { messageId });
 *   }
 * }
 * ```
 */
export abstract class ApplicationError extends Error {
  /**
   * Creates a new ApplicationError.
   *
   * @param message - Human-readable error message
   * @param code - Unique error code for programmatic handling
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApplicationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
