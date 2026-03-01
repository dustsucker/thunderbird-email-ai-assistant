/**
 * Tests for EventBus
 *
 * @module test/domain/events/EventBus.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../src/domain/events/EventBus';
import { createMockLogger } from '../../helpers/mock-factories';

// ============================================================================
// Test Events
// ============================================================================

interface TestEvent {
  eventType: 'TestEvent';
  data: string;
}

interface AnotherEvent {
  eventType: 'AnotherEvent';
  value: number;
}

// ============================================================================
// Tests
// ============================================================================

describe('EventBus', () => {
  let eventBus: EventBus;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    eventBus = new EventBus(mockLogger);
  });

  afterEach(() => {
    eventBus.clearAllHandlers();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(eventBus).toBeInstanceOf(EventBus);
      expect(mockLogger.debug).toHaveBeenCalledWith('EventBus initialized');
    });
  });

  // ==========================================================================
  // subscribe() Tests
  // ==========================================================================

  describe('subscribe', () => {
    it('should register a handler for an event type', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe<TestEvent>('TestEvent', handler);

      expect(typeof unsubscribe).toBe('function');
      expect(mockLogger.debug).toHaveBeenCalledWith('Subscribing to event', {
        eventType: 'TestEvent',
        handlerId: expect.stringMatching(/^handler-/),
      });
    });

    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe<TestEvent>('TestEvent', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow multiple handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe<TestEvent>('TestEvent', handler1);
      eventBus.subscribe<TestEvent>('TestEvent', handler2);

      const state = eventBus.getState();
      expect(state.totalHandlers).toBe(2);
    });

    it('should allow handlers for different event types', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe<TestEvent>('TestEvent', handler1);
      eventBus.subscribe<AnotherEvent>('AnotherEvent', handler2);

      const state = eventBus.getState();
      expect(state.totalHandlers).toBe(2);
    });
  });

  // ==========================================================================
  // unsubscribe() Tests
  // ==========================================================================

  describe('unsubscribe', () => {
    it('should remove a registered handler from being called', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe<TestEvent>('TestEvent', handler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      await eventBus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should not affect other handlers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = eventBus.subscribe<TestEvent>('TestEvent', handler1);
      eventBus.subscribe<TestEvent>('TestEvent', handler2);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      unsubscribe1();

      await eventBus.publish(event);
      expect(handler1).toHaveBeenCalledTimes(1); // Still 1
      expect(handler2).toHaveBeenCalledTimes(2); // Called again
    });

    it('should handle unsubscribe of non-existent handler gracefully', () => {
      eventBus.unsubscribe('TestEvent', 'non-existent-id');
      // Should not throw
    });

    it('should handle unsubscribe for non-existent event type', () => {
      eventBus.unsubscribe('NonExistentEvent', 'some-id');
      // Should not throw
    });
  });

  // ==========================================================================
  // publish() Tests
  // ==========================================================================

  describe('publish', () => {
    it('should call registered handlers with event data', async () => {
      const handler = vi.fn();
      eventBus.subscribe<TestEvent>('TestEvent', handler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test data' };
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call all handlers for an event type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe<TestEvent>('TestEvent', handler1);
      eventBus.subscribe<TestEvent>('TestEvent', handler2);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should not call handlers for different event types', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe<TestEvent>('TestEvent', handler1);
      eventBus.subscribe<AnotherEvent>('AnotherEvent', handler2);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should handle async handlers', async () => {
      const asyncHandler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      eventBus.subscribe<TestEvent>('TestEvent', asyncHandler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(asyncHandler).toHaveBeenCalledWith(event);
    });

    it('should increment totalEventsPublished counter', async () => {
      const handler = vi.fn();
      eventBus.subscribe<TestEvent>('TestEvent', handler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      const state = eventBus.getState();
      expect(state.totalEventsPublished).toBe(1);
    });

    it('should not increment counter when no handlers registered', async () => {
      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      const state = eventBus.getState();
      expect(state.totalEventsPublished).toBe(0);
    });

    it('should log when no handlers registered', async () => {
      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(mockLogger.debug).toHaveBeenCalledWith('No handlers registered for event', {
        eventType: 'TestEvent',
      });
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should catch handler errors and continue', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      eventBus.subscribe<TestEvent>('TestEvent', errorHandler);
      eventBus.subscribe<TestEvent>('TestEvent', normalHandler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });

    it('should increment totalHandlerErrors on error', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      eventBus.subscribe<TestEvent>('TestEvent', errorHandler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      const state = eventBus.getState();
      expect(state.totalHandlerErrors).toBe(1);
    });

    it('should log handler errors', async () => {
      const error = new Error('Handler error');
      const errorHandler = vi.fn().mockImplementation(() => {
        throw error;
      });

      eventBus.subscribe<TestEvent>('TestEvent', errorHandler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(mockLogger.error).toHaveBeenCalledWith('Event handler error', {
        eventType: 'TestEvent',
        handlerId: expect.stringMatching(/^handler-/),
        error: 'Handler error',
      });
    });

    it('should handle async handler errors', async () => {
      const asyncErrorHandler = vi.fn().mockImplementation(async () => {
        throw new Error('Async handler error');
      });

      eventBus.subscribe<TestEvent>('TestEvent', asyncErrorHandler);

      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      const state = eventBus.getState();
      expect(state.totalHandlerErrors).toBe(1);
    });
  });

  // ==========================================================================
  // clearHandlers() Tests
  // ==========================================================================

  describe('clearHandlers', () => {
    it('should clear all handlers for a specific event type', () => {
      eventBus.subscribe<TestEvent>('TestEvent', vi.fn());
      eventBus.subscribe<TestEvent>('TestEvent', vi.fn());
      eventBus.subscribe<AnotherEvent>('AnotherEvent', vi.fn());

      eventBus.clearHandlers('TestEvent');

      const state = eventBus.getState();
      expect(state.totalHandlers).toBe(1); // AnotherEvent handler remains
    });

    it('should handle clearing non-existent event type', () => {
      eventBus.clearHandlers('NonExistentEvent');
      // Should not throw
    });
  });

  // ==========================================================================
  // clearAllHandlers() Tests
  // ==========================================================================

  describe('clearAllHandlers', () => {
    it('should clear all handlers for all event types', () => {
      eventBus.subscribe<TestEvent>('TestEvent', vi.fn());
      eventBus.subscribe<AnotherEvent>('AnotherEvent', vi.fn());

      eventBus.clearAllHandlers();

      const state = eventBus.getState();
      expect(state.totalHandlers).toBe(0);
    });

    it('should reset handler counter to zero', () => {
      for (let i = 0; i < 10; i++) {
        eventBus.subscribe<TestEvent>('TestEvent', vi.fn());
      }

      expect(eventBus.getState().totalHandlers).toBe(10);

      eventBus.clearAllHandlers();

      expect(eventBus.getState().totalHandlers).toBe(0);
    });
  });

  // ==========================================================================
  // getState() Tests
  // ==========================================================================

  describe('getState', () => {
    it('should return current event bus state', () => {
      const state = eventBus.getState();

      expect(state).toHaveProperty('totalHandlers');
      expect(state).toHaveProperty('totalEventsPublished');
      expect(state).toHaveProperty('totalHandlerErrors');
    });

    it('should return a copy of state (immutable)', () => {
      const state1 = eventBus.getState();
      const state2 = eventBus.getState();

      expect(state1).not.toBe(state2); // Different references
      expect(state1).toEqual(state2); // Same values
    });

    it('should reflect handler count after subscriptions', () => {
      eventBus.subscribe<TestEvent>('TestEvent', vi.fn());
      eventBus.subscribe<TestEvent>('TestEvent', vi.fn());

      const state = eventBus.getState();
      expect(state.totalHandlers).toBe(2);
    });

    it('should reflect published events count', async () => {
      eventBus.subscribe<TestEvent>('TestEvent', vi.fn());

      await eventBus.publish({ eventType: 'TestEvent', data: '1' });
      await eventBus.publish({ eventType: 'TestEvent', data: '2' });

      const state = eventBus.getState();
      expect(state.totalEventsPublished).toBe(2);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration', () => {
    it('should handle full lifecycle: subscribe, publish, unsubscribe', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe<TestEvent>('TestEvent', handler);

      // Publish event
      const event: TestEvent = { eventType: 'TestEvent', data: 'test' };
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe and publish again
      unsubscribe();
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle multiple event types with different handlers', async () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      eventBus.subscribe<TestEvent>('TestEvent', testHandler);
      eventBus.subscribe<AnotherEvent>('AnotherEvent', anotherHandler);

      await eventBus.publish({ eventType: 'TestEvent', data: 'test' });
      await eventBus.publish({ eventType: 'AnotherEvent', value: 42 });

      expect(testHandler).toHaveBeenCalledTimes(1);
      expect(anotherHandler).toHaveBeenCalledTimes(1);
    });
  });
});
