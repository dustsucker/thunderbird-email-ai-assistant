/**
 * Domain Events Module
 *
 * Exports all domain events, base types, and the event bus.
 *
 * This module provides the foundation for event-driven architecture
 * in the application, enabling loose coupling between components.
 *
 * @module domain/events
 */

// ============================================================================
// Base Types
// ============================================================================

export type { DomainEvent } from './DomainEvent';

// ============================================================================
// Event Bus
// ============================================================================

export type { UnsubscribeFunction, EventHandler } from './EventBus';
export { EventBus } from './EventBus';

// ============================================================================
// Domain Events
// ============================================================================

export type { EmailReceivedEvent } from './EmailReceivedEvent';
export { createEmailReceivedEvent } from './EmailReceivedEvent';

export type { EmailAnalyzedEvent } from './EmailAnalyzedEvent';
export { createEmailAnalyzedEvent } from './EmailAnalyzedEvent';

export type { TagAppliedEvent } from './TagAppliedEvent';
export { createTagAppliedEvent } from './TagAppliedEvent';

export type { TagCreatedEvent } from './TagCreatedEvent';
export { createTagCreatedEvent } from './TagCreatedEvent';

export type { ProviderErrorEvent } from './ProviderErrorEvent';
export { createProviderErrorEvent } from './ProviderErrorEvent';
