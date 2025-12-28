/**
 * Tag Created Event
 *
 * Published when a new tag is created in the system.
 *
 * @module domain/events
 */

import type { DomainEvent } from './DomainEvent';

/**
 * Event published when a new tag is created.
 *
 * This event tracks tag creation for auditing and synchronization purposes.
 */
export interface TagCreatedEvent extends DomainEvent {
  readonly eventType: 'TagCreated';
  /** Unique key identifying the tag */
  readonly tagKey: string;
  /** Display name of the tag */
  readonly tagName: string;
  /** Color of the tag (hex code) */
  readonly tagColor: string;
  /** Description of the tag (optional) */
  readonly tagDescription?: string;
}

/**
 * Creates a new TagCreatedEvent.
 *
 * @param tagKey - Tag key
 * @param tagName - Tag display name
 * @param tagColor - Tag color (hex code)
 * @param tagDescription - Optional tag description
 * @returns TagCreatedEvent instance
 *
 * @example
 * ```typescript
 * const event = createTagCreatedEvent('is_business', 'Business', '#FF5733', 'Business emails');
 * await eventBus.publish(event);
 * ```
 */
export function createTagCreatedEvent(
  tagKey: string,
  tagName: string,
  tagColor: string,
  tagDescription?: string
): TagCreatedEvent {
  return {
    eventType: 'TagCreated',
    timestamp: new Date().toISOString(),
    tagKey,
    tagName,
    tagColor,
    tagDescription,
  };
}
