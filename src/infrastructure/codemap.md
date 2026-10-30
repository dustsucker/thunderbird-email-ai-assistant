# src/infrastructure/

## Responsibility
Implements the outward-facing adapters of the hexagonal architecture: external LLM services (`providers/`), persistence (`repositories/`, `storage/`, `cache/`), logging (`logger/`), configuration (`config/`), platform primitives (`system/`), and the port interfaces they satisfy (`interfaces/`). This layer implements interfaces owned by domain/application and is injected via TSyringe.

## Design
- Ports in `src/infrastructure/interfaces/`: `IProvider`, `ICache`, `IConfigRepository`, `IMailReader`, `IQueue`; `ILogger` and `ITagManager` are deprecated aliases re-exported from `@/domain/interfaces`.
- `ProviderFactory` (Factory pattern, static `PROVIDER_REGISTRY`) + `BaseProviderAdapter` (Adapter: legacy `BaseProvider` → `IProvider`).
- Repository pattern: `StorageLocalConfigRepository`, `MetricsRepository`, `TagHistoryRepository`.
- Template Method base class `BaseProvider`; Strategy per provider in `impl/`.
- Singleton `AnalysisCache` (IndexedDB) coexists with DI-injectable `MemoryCache` (`ICache`).

## Flow
1. Bootstrap registers adapters: `'ILogger'`→`ConsoleLogger`, `'ICache'`→`MemoryCache`, `'IConfigRepository'`→`StorageLocalConfigRepository`, `'provider:<id>'`→`BaseProviderAdapter`.
2. Use cases resolve `ProviderFactory`, call `getProvider(providerId)` → cached `IProvider` adapter → HTTP call → `TagResponse`.
3. Config reads go through `AppConfigService` (5-min in-memory TTL cache) → `StorageLocalConfigRepository` → `browser.storage.local`; writes invalidate cache and are picked up via `browser.storage.onChanged`.
4. All log output flows through `ConsoleLogger`/`sharedLogger` into `debugLogBuffer` (mirrored to `storage.session`).

## Integration
- Consumed by: application use cases (`AnalyzeEmail`, `ApplyTags`), `background.ts`, `options.ts`.
- Depends on: `src/domain/interfaces` (`ILogger`, `IClock`, `IRandom`), `src/shared/types`, TSyringe, Thunderbird WebExtension APIs (`browser.storage`, `indexedDB`, Web Crypto).
