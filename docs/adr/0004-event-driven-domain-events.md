# ADR-0004: Event-Driven Domain Events

## Status

Accepted

## Context

The Thunderbird Email AI Assistant needs to track and respond to various business events:

1. **Email received**: New email arrives in inbox
2. **Email analyzed**: AI has processed and classified an email
3. **Tag applied**: A tag has been applied to an email
4. **Tag created**: A new tag has been created in the system
5. **Provider error**: An LLM provider has encountered an error

Without an event system, we face:
- **Tight coupling**: Components directly call each other
- **Scattered logic**: Side effects spread across the codebase
- **Hard testing**: Difficult to verify event-driven behavior
- **Extension difficulty**: Adding new event handlers requires modifying existing code

## Decision

We implement an **Event-Driven Architecture** using **Domain Events** with a centralized **EventBus**.

### Event System Architecture

```
┌─────────────────────────────────────────────┐
│                 EventBus                    │
│         (Publish/Subscribe Pattern)         │
└─────────────────────────────────────────────┘
        ▲                    ▲
        │ publish            │ subscribe
        │                    │
┌───────┴───────┐   ┌───────┴───────┐   ┌───────────────┐
│ AnalyzeEmail  │   │ Event Listener│   │ Error Handler │
│  (Publisher)  │   │ (Subscriber)  │   │ (Subscriber)  │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Domain Events

All events extend the base `DomainEvent` interface:

```typescript
interface DomainEvent {
  readonly eventType: string;      // Unique identifier
  readonly timestamp: string;      // ISO 8601 timestamp
  readonly metadata?: Record<string, unknown>;
}
```

### Event Types

| Event | Description | Location |
|-------|-------------|----------|
| `EmailReceivedEvent` | New email detected | `src/domain/events/EmailReceivedEvent.ts` |
| `EmailAnalyzedEvent` | AI analysis complete | `src/domain/events/EmailAnalyzedEvent.ts` |
| `TagAppliedEvent` | Tag added to email | `src/domain/events/TagAppliedEvent.ts` |
| `TagCreatedEvent` | New tag created | `src/domain/events/TagCreatedEvent.ts` |
| `ProviderErrorEvent` | LLM provider error | `src/domain/events/ProviderErrorEvent.ts` |

### EventBus Implementation

The `EventBus` class provides:

```typescript
@injectable()
export class EventBus {
  // Publish event to all subscribers
  async publish<T extends { eventType: string }>(event: T): Promise<void>;
  
  // Subscribe to event type
  subscribe<T>(eventType: string, handler: EventHandler<T>): UnsubscribeFunction;
  
  // Unsubscribe from event type
  unsubscribe(eventType: string, handlerId: string): void;
}
```

### Usage Example

```typescript
// Publishing events
await eventBus.publish({
  eventType: 'EmailAnalyzed',
  timestamp: new Date().toISOString(),
  messageId: '12345',
  tags: ['work', 'important'],
  confidence: 0.95
});

// Subscribing to events
const unsubscribe = eventBus.subscribe<EmailAnalyzedEvent>(
  'EmailAnalyzed',
  async (event) => {
    console.log(`Email ${event.messageId} analyzed with tags: ${event.tags}`);
  }
);

// Later, clean up
unsubscribe();
```

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|------------|------|------|----------|
| **Direct Method Calls** | Simple, fast | Tight coupling, hard to extend | Rejected |
| **RxJS Observables** | Powerful, reactive | Overkill for this use case | Rejected |
| **Node EventEmitter** | Familiar API | Not type-safe, no DI integration | Rejected |
| **Custom EventBus with DI** | Type-safe, DI integrated | Custom implementation needed | **Accepted** |

## Consequences

### Positive

- **Loose coupling**: Publishers don't know about subscribers
- **Extensibility**: Add new subscribers without modifying publishers
- **Testability**: Easy to mock EventBus for testing
- **Type safety**: TypeScript ensures event type correctness
- **Async support**: Handlers can be async
- **Error isolation**: One handler error doesn't affect others
- **Memory management**: Unsubscribe functions prevent leaks

### Negative

- **Debugging complexity**: Event flow can be harder to trace
- **Learning curve**: Developers need to understand pub/sub pattern
- **Order of execution**: Handler execution order is not guaranteed
- **Implicit dependencies**: Component relationships are less obvious

### Mitigations

- **Event logging**: EventBus logs all events for debugging
- **Clear documentation**: AGENTS.md explains event patterns
- **Handler metadata**: Registered handlers include timestamps
- **State inspection**: `getState()` provides event bus metrics

## References

### Key Files

- `src/domain/events/DomainEvent.ts` - Base event interface
- `src/domain/events/EventBus.ts` - Central event bus implementation
- `src/domain/events/DomainEventBus.ts` - Singleton event bus wrapper
- `src/domain/events/EmailReceivedEvent.ts` - Email received event
- `src/domain/events/EmailAnalyzedEvent.ts` - Analysis complete event
- `src/domain/events/TagAppliedEvent.ts` - Tag applied event
- `src/domain/events/TagCreatedEvent.ts` - Tag created event
- `src/domain/events/ProviderErrorEvent.ts` - Provider error event

### Related ADRs

- [ADR-0002: Hexagonal Architecture](0002-hexagonal-architecture-with-di.md)
- [ADR-0003: Multi-Provider Strategy](0003-multi-provider-strategy.md)

### External References

- [Martin Fowler - Domain Events](https://martinfowler.com/eaaDev/DomainEvent.html)
- [Publish-Subscribe Pattern](https://en.wikipedia.org/wiki/Publish%E2%80%93subscribe_pattern)
