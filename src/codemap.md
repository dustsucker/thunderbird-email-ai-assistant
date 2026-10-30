# src/

## Responsibility
Root of the extension's hexagonal (Clean Architecture) source tree. Contains no source files itself — it separates business logic from Thunderbird-facing adapters so the core has zero WebExtension dependencies.

## Design
Five layers with a strict dependency rule (Interfaces → Application → Domain ← Infrastructure, Shared is cross-cutting):
- `domain/` — entities (`Email`), value objects, events, errors, domain services (`TagService`, `EmailContentExtractor`), ports (`IClock`, `IRandom`)
- `application/` — use cases (`AnalyzeEmail`, `ApplyTagsToEmail`, `AnalyzeBatchEmails`, `UndoTagChanges`), services (`PriorityQueue`, `EmailAnalysisTracker`), DTOs, ports
- `infrastructure/` — provider implementations (`ProviderFactory`), cache (`MemoryCache`), logger (`ConsoleLogger`, `DebugLogBuffer`), repositories (`StorageLocalConfigRepository`), storage (`TagHistoryRepository`, `MetricsRepository`), config (`AppConfigService`), system (`SystemClock`, `CryptoRandom`)
- `interfaces/` — Thunderbird adapters (`ThunderbirdMailReader`, `ThunderbirdTagManager`), background listeners (`EmailEventListener`, `MessageHandler`), options UI
- `shared/` — types, constants, utils (`errorMessages`), errors
Wiring is done centrally via TSyringe in `background/DIContainer.ts`.

## Flow
1. Thunderbird events enter via `interfaces/background` listeners.
2. Listeners/`MessageHandler` dispatch to application use cases.
3. Use cases orchestrate domain services and infrastructure (providers, cache, storage).
4. Results (tags, notifications, badge updates) are written back through `interfaces/adapters`.

## Integration
- Consumed by: `background.ts` (entry, imports `src/background`), `options.ts`, webpack build
- Depends on: TSyringe (`container`, `@injectable()`), `@/` path alias rooted here
