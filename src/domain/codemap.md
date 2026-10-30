# src/domain/

## Responsibility
Core business layer of the hexagonal architecture: entities (Email, Tag), value objects (EmailAddress, TagColor, ApiKey, ...), domain events with a publish/subscribe bus (DomainEventBus, EmailReceivedEvent), domain service logic (TagService, EmailContentExtractor), ports (ILogger, ITagManager, IClock, IRandom) and typed validation errors (InvalidEmailAddressError, InvalidApiKeyError).

## Design
- Entity pattern with identity + mutability: `Email` (tags as `Set<string>`, low-confidence flags as `Map`), `Tag` (immutable-update methods `withName`/`withColor`, static factories `fromThunderbirdTag`/`createDefault`).
- Value Object pattern: immutable, self-validating constructors with static `tryCreate`/`isValid`/`empty` factories.
- Observer/Mediator: `DomainEventBus` singleton (`getInstance`, `subscribe`, `publish`, `publishAll`); events created via factory functions (`createEmailAnalyzedEvent`, `createTagAppliedEvent`).
- Dependency Inversion: `src/domain/interfaces/` defines ports implemented by infrastructure (`ConsoleLogger`, `ThunderbirdTagManager`); DI via TSyringe (`@singleton`, `@inject`) in services.
- Errors as classes extending `Error` with type guards (`isInvalidTagKeyError`).

## Flow
1. Thunderbird fires a mail event; the interfaces layer builds `EmailReceivedEvent` and publishes it on `DomainEventBus`.
2. Application use cases compose an `Email` entity from validated value objects (`EmailAddress`, `EmailSubject`, `EmailBody`).
3. `EmailContentExtractor.findEmailParts` walks the MIME tree; `buildPrompt` renders the prompt template; `TagService.ensureTagsExist` reconciles tags via `ITagManager`.
4. Provider results become `EmailAnalyzedEvent`/`TagAppliedEvent`; low-confidence tags are recorded via `Email.flagLowConfidence`.

## Integration
- Consumed by: application use cases (`ExtractEmailContentUseCase`), background wiring (`src/background/BackgroundScript.ts`, `src/background/DIContainer.ts`), `core/tags.ts`, interfaces adapters (`ThunderbirdMailReader`, `MessageHandler`), vitest suites under `test/domain/`.
- Depends on: `@/shared/types/` (TagTypes, ProviderTypes, EmailPart), TSyringe, and `@/shared/utils/emailPartUtils` (in `EmailContentExtractor`). No infrastructure or Thunderbird API imports.
