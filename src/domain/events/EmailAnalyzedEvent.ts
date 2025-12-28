/**
 * Email Analyzed Event
 *
 * Published when an email has been successfully analyzed by an AI provider.
 *
 * @module domain/events
 */

import type { DomainEvent } from './DomainEvent';
import type { ITagResponse } from '@/infrastructure/interfaces/IProvider';

/**
 * Event published when email analysis is completed.
 *
 * This event includes the complete analysis result including tags,
 * confidence score, and reasoning from the AI provider.
 */
export interface EmailAnalyzedEvent extends DomainEvent {
  readonly eventType: 'EmailAnalyzed';
  /** Unique identifier of the analyzed email message */
  readonly messageId: string;
  /** Provider that performed the analysis */
  readonly providerId: string;
  /** Model used for analysis */
  readonly model: string;
  /** Analysis result containing tags and metadata */
  readonly result: ITagResponse;
  /** Whether result was retrieved from cache */
  readonly fromCache: boolean;
  /** Cache key for this analysis */
  readonly cacheKey?: string;
  /** Analysis duration in milliseconds */
  readonly duration?: number;
}

/**
 * Creates a new EmailAnalyzedEvent.
 *
 * @param messageId - Message ID that was analyzed
 * @param providerId - Provider that performed the analysis
 * @param model - Model used for analysis
 * @param result - Analysis result
 * @param options - Optional event metadata
 * @returns EmailAnalyzedEvent instance
 *
 * @example
 * ```typescript
 * const event = createEmailAnalyzedEvent(messageId, 'openai', 'gpt-4', result, {
 *   fromCache: false,
 *   duration: 1234
 * });
 * await eventBus.publish(event);
 * ```
 */
export function createEmailAnalyzedEvent(
  messageId: string,
  providerId: string,
  model: string,
  result: ITagResponse,
  options: {
    fromCache?: boolean;
    cacheKey?: string;
    duration?: number;
  } = {}
): EmailAnalyzedEvent {
  return {
    eventType: 'EmailAnalyzed',
    timestamp: new Date().toISOString(),
    messageId,
    providerId,
    model,
    result,
    fromCache: options.fromCache ?? false,
    cacheKey: options.cacheKey,
    duration: options.duration,
  };
}
