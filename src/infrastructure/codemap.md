# src/infrastructure/

## Responsibility
Implements the domain/application ports against external systems: LLM providers,
persistent/in-memory caches, storage repositories, logging, configuration, and
platform services (clock, randomness).

## Design
- All external calls are async with wrapped errors (see `ProviderUtils.LLMResponseParseError`,
  `ConfigNotSetError` in `repositories/StorageLocalConfigRepository.ts`).
- API keys are masked in logs (`maskApiKey`); log payloads are sanitized
  (`src/shared/utils/loggingUtils.ts`).
- Everything ships statically bundled - no dynamic `import()` (async chunks would 404
  in the packaged xpi).

## Layout
| Directory | Content | Details |
| --- | --- | --- |
| `providers/` | BaseProvider, ProviderFactory, PromptBuilder, Validator, 10 impls | [codemap](providers/codemap.md) |
| `cache/` | AnalysisCache (IndexedDB), MemoryCache (SHA-256) | [codemap](cache/codemap.md) |
| `config/` | AppConfigService | [codemap](config/codemap.md) |
| `interfaces/` | IProvider, ICache, IConfigRepository, IMailReader, IQueue | [codemap](interfaces/codemap.md) |
| `logger/` | ConsoleLogger, DebugLogBuffer, LegacyLogger | [codemap](logger/codemap.md) |
| `repositories/` | StorageLocalConfigRepository | [codemap](repositories/codemap.md) |
| `storage/` | MetricsRepository, TagHistoryRepository, TagApplyHistoryRepository | [codemap](storage/codemap.md) |
| `system/` | SystemClock, CryptoRandom | [codemap](system/codemap.md) |

## Rules
1. Implement interfaces from `@/domain/interfaces/` - never depend on concretes.
2. `@injectable()` + constructor `@inject()`; registration in `src/background/DIContainer.ts`.
3. Import `ILogger`/`ITagManager` from `@/domain/interfaces`.
