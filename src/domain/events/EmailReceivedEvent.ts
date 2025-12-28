/**
 * Email Received Event
 *
 * Published when a new email is received by Thunderbird.
 *
 * @module domain/events
 */

import type { DomainEvent } from './DomainEvent';

/**
 * Event published when a new email is received.
 *
 * This event is triggered by the Thunderbird onNewMailReceived API.
 */
export interface EmailReceivedEvent extends DomainEvent {
  readonly eventType: 'EmailReceived';
  /** Unique identifier of the received email message */
  readonly messageId: string;
  /** Subject line of the email */
  readonly subject: string;
  /** Email address of the sender */
  readonly from: string;
  /** Email addresses of recipients */
  readonly to: string[];
  /** Folder where the email was received */
  readonly folderName: string;
  /** Type of folder (inbox, sent, etc.) */
  readonly folderType: string;
  /** Path to the folder */
  readonly folderPath?: string;
}

/**
 * Creates a new EmailReceivedEvent.
 *
 * @param messageData - Message data from Thunderbird
 * @param folderData - Folder data from Thunderbird
 * @returns EmailReceivedEvent instance
 *
 * @example
 * ```typescript
 * const event = createEmailReceivedEvent(message, folder);
 * await eventBus.publish(event);
 * ```
 */
export function createEmailReceivedEvent(
  messageData: { id: number; subject: string; from: string; to: string[] },
  folderData: { name: string; type: string; path?: string }
): EmailReceivedEvent {
  return {
    eventType: 'EmailReceived',
    timestamp: new Date().toISOString(),
    messageId: String(messageData.id),
    subject: messageData.subject,
    from: messageData.from,
    to: messageData.to,
    folderName: folderData.name,
    folderType: folderData.type,
    folderPath: folderData.path,
  };
}
