# src/domain/events/

## Responsibility
Event-driven backbone of the domain: the `DomainEvent` base contract, concrete event types for the email classification lifecycle (`EmailReceivedEvent`, `EmailAnalyzedEvent`, `TagAppliedEvent`, `TagCreatedEvent`, `ProviderErrorEvent`), and the in-process `DomainEventBus` that routes them. Barrel `index.ts` re-exports all types plus their factory functions.

## Design
- Observer / Mediator: `DomainEventBus` is a lazily-instantiated singleton (`getInstance`) holding `Map<eventType, Set<handler>>`; `subscribe` returns an unsubscribe closure; `publish`/`publishAll` fan out via `Promise.allSettled` so one failing handler cannot break others; `clear()` resets for tests.
- Event-as-data: events are readonly interfaces extending `DomainEvent` (`eventType`, ISO-8601 `timestamp`, optional `metadata`), built by factory functions (`createEmailReceivedEvent`, `createEmailAnalyzedEvent`, `createTagAppliedEvent`, `createTagCreatedEvent`, `createProviderErrorEvent`) that stamp the timestamp.
- Discriminated unions: each event narrows `eventType` to a string literal (`'EmailAnalyzed'`, `'TagApplied'`, ...).
- Note: `DomainEventBus.ts` re-declares a second, divergent `DomainEvent` interface (`occurredAt: Date`, `aggregateId`, `version`) used by the bus itself — distinct from the canonical one in `DomainEvent.ts`.

## Flow
1. Producer calls a factory (e.g. `createEmailAnalyzedEvent(messageId, providerId, model, result: ITagResponse, { fromCache, duration })`).
2. Producer awaits `DomainEventBus.getInstance().publish(event)`; the bus looks up handlers by `event.eventType`.
3. All registered handlers run concurrently; results are settled, never rethrown.
4. `subscribe`/unsubscribe closures manage handler lifecycle per event type.

## Integration
- Consumed by: `test/domain/events/EmailAnalyzedEvent.test.ts`; exported for producers in the interfaces layer (`EmailEventListener`) and application services (no production publisher wired yet — bus currently consumed only via tests).
- Depends on: `@/shared/types/ProviderTypes` (`ITagResponse` in `EmailAnalyzedEvent`). No infrastructure imports.
