# src/domain/

## Responsibility
Core business layer with zero outward dependencies: entities, value objects, ports
(interfaces), domain services, and typed domain errors.

## Design
- Entity pattern with identity + mutable state: `Email` (tags, low-confidence flags via
  `flagLowConfidence`), `Tag` (validation, Thunderbird conversion).
- Value Object pattern: immutable, self-validating constructors (`EmailAddress`,
  `EmailSubject`, `EmailBody`, `ApiKey`, `TagColor`, `TagKey`).
- Dependency Inversion: `interfaces/` defines ports implemented by infrastructure
  (`ILogger`→ConsoleLogger, `ITagManager`→ThunderbirdTagManager, `IClock`→SystemClock,
  `IRandom`→CryptoRandom).
- Errors as classes with type guards (`src/domain/errors/`).

## Layout
| Directory | Content | Details |
| --- | --- | --- |
| `entities/` | Email, Tag | [codemap](entities/codemap.md) |
| `value-objects/` | ApiKey, EmailAddress, EmailBody, EmailSubject, TagColor, TagKey | [codemap](value-objects/codemap.md) |
| `interfaces/` | ILogger, ITagManager, IClock, IRandom | [codemap](interfaces/codemap.md) |
| `services/` | TagService, EmailContentExtractor | [codemap](services/codemap.md) |
| `errors/` | ValueObjectErrors | [codemap](errors/codemap.md) |

## Integration
- Consumed by application use cases and infrastructure implementations.
- Domain may import only from `src/domain/` and `src/shared/`.
- Tested under `test/domain/`.
