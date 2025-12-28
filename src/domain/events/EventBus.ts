/**
 * Event Bus
 *
 * Central event bus for publishing and subscribing to domain events.
 * Implements the Publish/Subscribe pattern for loose coupling.
 *
 * Features:
 * - Type-safe event handling with TypeScript generics
 * - Support for both synchronous and asynchronous handlers
 * - Memory leak prevention through unsubscribe functionality
 * - Comprehensive error handling with logging
 * - DI container integration via tsyringe
 *
 * @module domain/events/EventBus
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Function to unsubscribe from an event.
 *
 * Call this function to remove a previously registered handler.
 */
export type UnsubscribeFunction = () => void;

/**
 * Event handler function type.
 *
 * Can be synchronous or asynchronous.
 */
export type EventHandler<T> = (event: T) => void | Promise<void>;

/**
 * Registered event handler with metadata.
 */
interface RegisteredHandler<T> {
  /** Unique handler ID */
  id: string;
  /** Handler function */
  handler: EventHandler<T>;
  /** When the handler was registered */
  registeredAt: number;
}

/**
 * Event bus state.
 */
interface EventBusState {
  /** Total number of handlers registered */
  totalHandlers: number;
  /** Number of events published */
  totalEventsPublished: number;
  /** Number of handler errors encountered */
  totalHandlerErrors: number;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Event Bus
 *
 * Central hub for publishing and subscribing to domain events.
 * Provides type-safe event handling with comprehensive error handling.
 *
 * The event bus is designed as a singleton in the DI container.
 * All components that need to publish or subscribe to events
 * should inject it via tsyringe.
 *
 * @example
 * ```typescript
 * // Subscribe to events
 * const unsubscribe = eventBus.subscribe<EmailAnalyzedEvent>(
 *   'EmailAnalyzed',
 *   async (event) => {
 *     console.log(`Email analyzed: ${event.messageId}`);
 *   }
 * );
 *
 * // Publish events
 * await eventBus.publish(emailAnalyzedEvent);
 *
 * // Unsubscribe when done
 * unsubscribe();
 * ```
 */
@injectable()
export class EventBus {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  /** Map of event type to registered handlers */
  private readonly handlers = new Map<string, RegisteredHandler<unknown>[]>();

  /** Logger for event operations */
  private readonly logger: ILogger;

  /** Event bus state */
  private state: EventBusState = {
    totalHandlers: 0,
    totalEventsPublished: 0,
    totalHandlerErrors: 0,
  };

  /** Counter for generating unique handler IDs */
  private handlerIdCounter = 0;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new EventBus instance.
   *
   * @param logger - Logger instance for logging operations
   */
  constructor(@inject('ILogger') logger: ILogger) {
    this.logger = logger;
    this.logger.debug('EventBus initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Publishes an event to all registered handlers.
   *
   * All handlers are called asynchronously. Errors in individual handlers
   * are caught and logged, but do not prevent other handlers from executing.
   *
   * @template T - Type of event to publish
   * @param event - Event to publish
   * @returns Promise resolving when all handlers have been called
   *
   * @example
   * ```typescript
   * await eventBus.publish({
   *   eventType: 'EmailAnalyzed',
   *   timestamp: new Date().toISOString(),
   *   messageId: '12345',
   *   // ... other properties
   * });
   * ```
   */
  async publish<T extends { eventType: string }>(event: T): Promise<void> {
    const eventType = event.eventType;

    this.logger.debug('Publishing event', { eventType });

    // Get all handlers for this event type
    const handlers = this.handlers.get(eventType) ?? [];

    if (handlers.length === 0) {
      this.logger.debug('No handlers registered for event', { eventType });
      return;
    }

    this.state.totalEventsPublished++;

    // Execute all handlers asynchronously
    const promises = handlers.map(async (registeredHandler) => {
      try {
        // Call handler (sync or async)
        await registeredHandler.handler(event);
      } catch (error) {
        this.state.totalHandlerErrors++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Event handler error', {
          eventType,
          handlerId: registeredHandler.id,
          error: errorMessage,
        });
        // Continue executing other handlers despite errors
      }
    });

    // Wait for all handlers to complete
    await Promise.all(promises);

    this.logger.debug('Event published', {
      eventType,
      handlersCalled: handlers.length,
    });
  }

  /**
   * Subscribes a handler to an event type.
   *
   * The handler will be called every time an event of the specified type
   * is published. The handler can be synchronous or asynchronous.
   *
   * @template T - Type of event to subscribe to
   * @param eventType - Event type to subscribe to
   * @param handler - Handler function to call when event is published
   * @returns Unsubscribe function to remove the handler
   *
   * @example
   * ```typescript
   * const unsubscribe = eventBus.subscribe<EmailAnalyzedEvent>(
   *   'EmailAnalyzed',
   *   (event) => {
   *     console.log(`Email analyzed: ${event.messageId}`);
   *   }
   * );
   *
   * // Later, unsubscribe
   * unsubscribe();
   * ```
   */
  subscribe<T>(eventType: string, handler: EventHandler<T>): UnsubscribeFunction {
    const handlerId = this.generateHandlerId();

    this.logger.debug('Subscribing to event', {
      eventType,
      handlerId,
    });

    // Create registered handler
    const registeredHandler: RegisteredHandler<unknown> = {
      id: handlerId,
      handler: handler as EventHandler<unknown>,
      registeredAt: Date.now(),
    };

    // Register handler
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(registeredHandler);

    this.state.totalHandlers++;

    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, handlerId);
    };
  }

  /**
   * Unsubscribes a handler from an event type.
   *
   * Removes the handler with the specified ID from the event type.
   * Does nothing if the handler is not found.
   *
   * @param eventType - Event type to unsubscribe from
   * @param handlerId - ID of handler to remove
   *
   * @example
   * ```typescript
   * const unsubscribe = eventBus.subscribe('EmailAnalyzed', handler);
   * // Later
   * unsubscribe(); // Calls this.unsubscribe(eventType, handlerId)
   * ```
   */
  unsubscribe(eventType: string, handlerId: string): void {
    this.logger.debug('Unsubscribing from event', {
      eventType,
      handlerId,
    });

    const handlers = this.handlers.get(eventType);

    if (!handlers) {
      this.logger.debug('No handlers found for event', { eventType });
      return;
    }

    // Find and remove handler
    const index = handlers.findIndex((h) => h.id === handlerId);

    if (index === -1) {
      this.logger.debug('Handler not found', { eventType, handlerId });
      return;
    }

    handlers.splice(index, 1);

    // Clean up empty handler arrays
    if (handlers.length === 0) {
      this.handlers.delete(eventType);
    }

    this.logger.debug('Handler unsubscribed', {
      eventType,
      handlerId,
    });
  }

  /**
   * Gets the current state of the event bus.
   *
   * @returns Event bus state
   */
  getState(): EventBusState {
    return { ...this.state };
  }

  /**
   * Clears all handlers for a specific event type.
   *
   * @param eventType - Event type to clear handlers for
   */
  clearHandlers(eventType: string): void {
    this.logger.info('Clearing handlers for event', { eventType });

    const handlers = this.handlers.get(eventType);

    if (handlers) {
      this.state.totalHandlers -= handlers.length;
      this.handlers.delete(eventType);
      this.logger.debug('Handlers cleared', { eventType, count: handlers.length });
    }
  }

  /**
   * Clears all handlers for all event types.
   *
   * Useful for testing or cleanup scenarios.
   */
  clearAllHandlers(): void {
    this.logger.info('Clearing all event handlers');

    const totalHandlers = this.state.totalHandlers;
    this.handlers.clear();
    this.state.totalHandlers = 0;

    this.logger.debug('All handlers cleared', { count: totalHandlers });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Generates a unique handler ID.
   *
   * @returns Unique handler ID
   */
  private generateHandlerId(): string {
    const id = `handler-${Date.now()}-${this.handlerIdCounter++}`;
    return id;
  }
}
