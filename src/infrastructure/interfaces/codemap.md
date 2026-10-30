# src/infrastructure/interfaces/

## Responsibility
Port/contract definitions for the infrastructure layer: `IProvider` (AI analysis), `ICache` (TTL cache), `IConfigRepository` (config persistence), `IMailReader` (email access/parsing), `IQueue` (priority queue), plus deprecated aliases `ILogger`/`ITagManager` re-exported from `@/domain/interfaces`.

## Design
- `IProvider`: `validateSettings(settings)` + `analyze(input)` returning `ITagResponse`; input types `IAnalyzeInput`, `IStructuredEmailData`, `IAttachment`, `ICustomTag`, `IRuntimeProviderSettings` (extensible index signature; `IProviderSettings` deprecated alias).
- `IConfigRepository`: `IAppConfig`, `IProviderSettings`, `ICustomTag`, `IModelConcurrencyConfig` — the persistence-shaped counterpart of the runtime settings.
- `IMailReader`: `IEmailMessage`, `IEmailHeaders`, `IEmailPart`, `IEmailAttachment(Content)`, `IEmailQuery`, `IEMLParseResult` — Thunderbird/EML abstraction for the hexagonal input port.
- `IQueue`: `IQueuedItem<T>`, `IQueueStats` — generic priority-queue contract.
- `ICache`: `ICache<T>`, `ICacheEntry<T>`, `ICacheStats`.

## Flow
1. Application/domain code programs against these interfaces; infrastructure classes (`StorageLocalConfigRepository`, `MemoryCache`, `BaseProviderAdapter`) implement them.
2. TSyringe tokens ('ILogger', 'ICache', 'IConfigRepository', 'provider:<id>') bind implementations at bootstrap.
3. No runtime logic here — only type-level contracts and backward-compat re-exports.

## Integration
- Consumed by: application use cases, `background.ts`, all infrastructure implementations in sibling folders.
- Depends on: `@/shared/types/ProviderTypes` (`ITagResponse`), `@/domain/interfaces` (re-exported `ILogger`, `ITagManager`).
