# ADR-0007: Remove EventBus and Dead DI String Tokens

## Status

Accepted (2026-08-23, commit 19788c9)

Partially supersedes [ADR-0004](0004-event-driven-domain-events.md): the in-process EventBus is gone; use cases are orchestrated by direct calls.

## Context

ADR-0004 introduced an event-driven layer with a central `EventBus` (`src/domain/events/EventBus.ts`, 351 lines plus a 427-line test file) to publish and subscribe to domain events such as "email analyzed". In practice the bus never carried production traffic:

1. **No production publisher/subscriber wiring existed.** The EventBus was instantiated in use cases (`AnalyzeEmail`, `ApplyTagsToEmail`) and the options script, but no background component subscribed to the events, so published events had no effect.
2. **Dead registrations accumulated in the DI container.** `DIContainer` registered services under string tokens (`'EmailContentExtractor'`, `'AppConfigService'`, `'RateLimiterService'`, `'AnalyzeEmail'`, …) that no consumer ever resolved by string — all consumers inject via class tokens. Dead registrations suggested an architecture that was not actually in place.
3. **Maintenance cost without benefit.** ~930 lines of code and tests had to be kept compiling and passing for functionality nothing consumed.

## Decision

Commit 19788c9 removes the event machinery and tightens DI token discipline:

1. **Delete `EventBus`** (`src/domain/events/EventBus.ts`, its test, and the barrel export). The `src/domain/events/` directory no longer contains code. All references in `AnalyzeEmail`, `ApplyTagsToEmail`, `OptionsScript`, and `DIContainer` were removed.
2. **Register by class token by default.** `DIContainer` registers services and use cases under their class tokens (`container.registerSingleton(AnalyzeEmail, AnalyzeEmail)`).
3. **String tokens only where a consumer actually resolves by string**: the cross-cutting interfaces (`'ILogger'`, `'ICache'`, `'IConfigRepository'`) and the two class tokens resolved by string (`'ProviderFactory'` injected by `AnalyzeEmail`, `'TagService'` resolved by `BackgroundScript`).

## Consequences

### Positive

- **~930 fewer lines** of unused code and tests to maintain.
- **Honest architecture**: the DI container now reflects what is actually consumed; the domain layer contains only entities, value objects, and services.
- **Simpler control flow**: analysis results flow through direct use-case calls and return values, which is easier to trace than an event bus with no subscribers.

### Negative

- **No in-process pub/sub extension point**: future cross-cutting reactions to domain events (metrics, notifications) must be wired as explicit use-case calls or a new, actually-consumed event mechanism.
- **ADR-0004 is partially obsolete**: its EventBus mechanics no longer describe the code.

### Mitigations

- ADR-0004 remains valid as the historical rationale; this ADR records the deviation.
- A future event mechanism should be introduced only together with a real subscriber.

## References

### Key Files

- `src/background/DIContainer.ts` — class-token registrations; comment on the remaining string tokens
- `src/application/use-cases/AnalyzeEmail.ts` — direct orchestration, no event publishing
- Commit `19788c9` — "refactor: remove unused EventBus and dead DI string-token registrations"

### Related ADRs

- [ADR-0002: Hexagonal Architecture with DI](0002-hexagonal-architecture-with-di.md)
- [ADR-0004: Event-Driven Domain Events](0004-event-driven-domain-events.md) (partially superseded by this ADR)
