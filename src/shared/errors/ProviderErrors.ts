/**
 * Provider-specific error classes for AI provider communication.
 *
 * These errors represent failures in the infrastructure layer when
 * communicating with AI providers (OpenAI, Gemini, Claude, etc.).
 *
 * @module errors/provider
 */

import { InfrastructureError } from './BaseErrors';

/**
 * Error codes for provider-related failures.
 */
export const PROVIDER_ERROR_CODES = {
  INITIALIZATION_FAILED: 'PROVIDER_INITIALIZATION_FAILED',
  REQUEST_FAILED: 'PROVIDER_REQUEST_FAILED',
  RESPONSE_INVALID: 'PROVIDER_RESPONSE_INVALID',
  RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
} as const;

/**
 * Error thrown when an AI provider fails to initialize.
 *
 * This typically occurs when:
 * - Required configuration is missing (API key, model, URL)
 * - Invalid configuration values are provided
 * - Provider-specific setup fails
 *
 * @example
 * ```typescript
 * if (!config.apiKey) {
 *   throw new ProviderInitializationError('openai', 'API key is required');
 * }
 * ```
 */
export class ProviderInitializationError extends InfrastructureError {
  /**
   * Creates a new ProviderInitializationError.
   *
   * @param provider - The provider that failed to initialize (e.g., 'openai', 'gemini')
   * @param reason - Human-readable reason for the failure
   * @param context - Optional additional context for debugging
   */
  constructor(provider: string, reason: string, context?: Record<string, unknown>) {
    super(
      `Failed to initialize ${provider} provider: ${reason}`,
      PROVIDER_ERROR_CODES.INITIALIZATION_FAILED,
      undefined,
      { provider, reason, ...context }
    );
    this.name = 'ProviderInitializationError';
  }
}

/**
 * Error thrown when an AI provider request fails.
 *
 * This occurs when:
 * - Network request fails
 * - Provider returns an error response
 * - Request times out
 *
 * @example
 * ```typescript
 * try {
 *   const response = await fetch(apiUrl, { ... });
 * } catch (error) {
 *   throw new ProviderRequestError('openai', 'Analysis request failed', error);
 * }
 * ```
 */
export class ProviderRequestError extends InfrastructureError {
  /**
   * Creates a new ProviderRequestError.
   *
   * @param provider - The provider that failed (e.g., 'openai', 'gemini')
   * @param operation - The operation that failed (e.g., 'analyze', 'classify')
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(
    provider: string,
    operation: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `${provider} provider request failed during ${operation}`,
      PROVIDER_ERROR_CODES.REQUEST_FAILED,
      cause,
      { provider, operation, ...context }
    );
    this.name = 'ProviderRequestError';
  }
}

/**
 * Error thrown when an AI provider returns an invalid response.
 *
 * This occurs when:
 * - Response cannot be parsed as expected format
 * - Required fields are missing from response
 * - Response contains invalid data
 *
 * @example
 * ```typescript
 * if (!response.tags || !Array.isArray(response.tags)) {
 *   throw new ProviderResponseError('openai', 'Response missing tags array');
 * }
 * ```
 */
export class ProviderResponseError extends InfrastructureError {
  /**
   * Creates a new ProviderResponseError.
   *
   * @param provider - The provider that returned the invalid response
   * @param reason - Human-readable reason why the response is invalid
   * @param cause - Optional underlying error that caused this error
   * @param context - Optional additional context for debugging
   */
  constructor(provider: string, reason: string, cause?: Error, context?: Record<string, unknown>) {
    super(
      `${provider} provider returned invalid response: ${reason}`,
      PROVIDER_ERROR_CODES.RESPONSE_INVALID,
      cause,
      { provider, reason, ...context }
    );
    this.name = 'ProviderResponseError';
  }
}

/**
 * Error thrown when an AI provider rate limits requests.
 *
 * Includes retryAfter property to indicate when the request can be retried.
 *
 * @example
 * ```typescript
 * if (response.status === 429) {
 *   const retryAfter = response.headers.get('Retry-After');
 *   throw new ProviderRateLimitError('openai', parseInt(retryAfter || '60', 10));
 * }
 * ```
 */
export class ProviderRateLimitError extends InfrastructureError {
  /**
   * The number of seconds to wait before retrying the request.
   */
  public readonly retryAfter: number;

  /**
   * Creates a new ProviderRateLimitError.
   *
   * @param provider - The provider that rate limited the request
   * @param retryAfter - Number of seconds to wait before retrying (default: 60)
   * @param context - Optional additional context for debugging
   */
  constructor(provider: string, retryAfter: number = 60, context?: Record<string, unknown>) {
    super(
      `${provider} provider rate limit exceeded. Retry after ${retryAfter} seconds.`,
      PROVIDER_ERROR_CODES.RATE_LIMITED,
      undefined,
      { provider, retryAfter, ...context }
    );
    this.name = 'ProviderRateLimitError';
    this.retryAfter = retryAfter;
  }
}
