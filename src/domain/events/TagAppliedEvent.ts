/**
 * Tag Applied Event
 *
 * Published when tags are successfully applied to an email message.
 *
 * @module domain/events
 */

import type { DomainEvent } from './DomainEvent';

/**
 * Event published when tags are applied to an email.
 *
 * This event tracks which tags were applied to which message,
 * and whether any new tags were created during the process.
 */
export interface TagAppliedEvent extends DomainEvent {
  readonly eventType: 'TagApplied';
  /** Unique identifier of the email message */
  readonly messageId: string;
  /** Tags that were successfully applied */
  readonly appliedTags: string[];
  /** Tags that were skipped (already existed or failed) */
  readonly skippedTags: string[];
  /** Tags that were created during application (if auto-create enabled) */
  readonly createdTags: string[];
  /** Whether existing tags were replaced (false = appended) */
  readonly replaceTags: boolean;
}

/**
 * Creates a new TagAppliedEvent.
 *
 * @param messageId - Message ID that tags were applied to
 * @param appliedTags - Tags that were successfully applied
 * @param options - Optional event metadata
 * @returns TagAppliedEvent instance
 *
 * @example
 * ```typescript
 * const event = createTagAppliedEvent(messageId, ['is_business'], {
 *   skippedTags: [],
 *   createdTags: [],
 *   replaceTags: false
 * });
 * await eventBus.publish(event);
 * ```
 */
export function createTagAppliedEvent(
  messageId: string,
  appliedTags: string[],
  options: {
    skippedTags?: string[];
    createdTags?: string[];
    replaceTags?: boolean;
  } = {}
): TagAppliedEvent {
  return {
    eventType: 'TagApplied',
    timestamp: new Date().toISOString(),
    messageId,
    appliedTags,
    skippedTags: options.skippedTags ?? [],
    createdTags: options.createdTags ?? [],
    replaceTags: options.replaceTags ?? false,
  };
}
