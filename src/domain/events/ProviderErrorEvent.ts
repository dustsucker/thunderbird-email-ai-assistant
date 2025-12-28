/**
 * Provider Error Event
 *
 * Published when an AI provider encounters an error during analysis.
 *
 * @module domain/events
 */

import type { DomainEvent } from './DomainEvent';

/**
 * Event published when a provider error occurs.
 *
 * This event tracks provider errors for monitoring and debugging purposes.
 */
export interface ProviderErrorEvent extends DomainEvent {
  readonly eventType: 'ProviderError';
  /** Provider that encountered the error */
  readonly providerId: string;
  /** Model that was being used */
  readonly model: string;
  /** Error message */
  readonly errorMessage: string;
  /** Original error object (if available) */
  readonly error?: Error;
  /** Message ID being analyzed (if applicable) */
  readonly messageId?: string;
  /** Type of error that occurred */
  readonly errorType: 'validation' | 'rate_limit' | 'api_error' | 'network' | 'unknown';
}

/**
 * Creates a new ProviderErrorEvent.
 *
 * @param providerId - Provider that encountered the error
 * @param model - Model being used
 * @param errorMessage - Error message
 * @param options - Optional event metadata
 * @returns ProviderErrorEvent instance
 *
 * @example
 * ```typescript
 * const event = createProviderErrorEvent('openai', 'gpt-4', 'API rate limit exceeded', {
 *   messageId: '12345',
 *   errorType: 'rate_limit'
 * });
 * await eventBus.publish(event);
 * ```
 */
export function createProviderErrorEvent(
  providerId: string,
  model: string,
  errorMessage: string,
  options: {
    error?: Error;
    messageId?: string;
    errorType?: ProviderErrorEvent['errorType'];
  } = {}
): ProviderErrorEvent {
  return {
    eventType: 'ProviderError',
    timestamp: new Date().toISOString(),
    providerId,
    model,
    errorMessage,
    error: options.error,
    messageId: options.messageId,
    errorType: options.errorType ?? 'unknown',
  };
}
