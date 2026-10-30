# Repository Atlas: thunderbird-email-ai-assistant

## Project Responsibility
Thunderbird MailExtension for AI-powered email classification and tagging. Sends email content to one of 10 configurable LLM providers, maps the response to Thunderbird tags (with confidence scoring, batch processing, undo, and metrics), and persists results. Built on a hexagonal (Clean Architecture) codebase with TSyringe dependency injection.

## System Entry Points
- `manifest.json`: MailExtension manifest (permissions, entry script registration).
- `background.ts` → `src/background/`: bootstrap of the TSyringe container, Thunderbird event listeners (new mail, context menu, install), runtime message API, graceful shutdown.
- `options.ts` / `options.html` → `src/interfaces/options/`: options page UI (currently the DebugTab: queue panel + log viewer).
- `package.json`: scripts (`npm run build|test|lint|package`), vitest config.

## Layering (dependency rule: interfaces → application → domain ← infrastructure; shared importable by all)
```
src/interfaces/      Thunderbird adapters + UI (only layer touching messenger/browser)
src/background/      DI container bootstrap + event/message orchestration
src/application/     Use cases + stateful services (workflows)
src/domain/          Entities, value objects, events, services, ports (zero deps)
src/infrastructure/  LLM providers, cache, storage, logger, config, system
src/shared/          Types, constants, error hierarchy, pure utils (no side effects)
types/               Ambient Thunderbird WebExtension declarations
core/                Legacy re-export shims (deprecated, still type-imported by providers)
```

## Directory Map (Aggregated)
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | Root of the hexagonal source tree; separates business logic from Thunderbird adapters. | [View Map](src/codemap.md) |
| `src/background/` | TSyringe container bootstrap, Thunderbird event listeners, runtime message handlers, shutdown. | [View Map](src/background/codemap.md) |
| `src/domain/` | Core business layer: entities, value objects, domain events + bus, services, ports, typed errors. | [View Map](src/domain/codemap.md) |
| `src/domain/entities/` | `Email` aggregate and `Tag` definition with lifecycle behavior. | [View Map](src/domain/entities/codemap.md) |
| `src/domain/errors/` | Typed validation errors + type guards for value objects. | [View Map](src/domain/errors/codemap.md) |
| `src/domain/events/` | `DomainEvent` contract, lifecycle events, in-process `DomainEventBus` (observer). | [View Map](src/domain/events/codemap.md) |
| `src/domain/interfaces/` | Ports (DIP): `ILogger`, `ITagManager`, `IClock`, `IRandom`. | [View Map](src/domain/interfaces/codemap.md) |
| `src/domain/services/` | `TagService` (tag reconciliation) and `EmailContentExtractor` (MIME walk + prompt assembly). | [View Map](src/domain/services/codemap.md) |
| `src/domain/value-objects/` | Immutable self-validating primitives: `EmailAddress`, `EmailBody`, `TagColor`, `ApiKey`, … | [View Map](src/domain/value-objects/codemap.md) |
| `src/application/` | Workflow orchestration composing domain objects via injected ports; no I/O specifics. | [View Map](src/application/codemap.md) |
| `src/application/use-cases/` | One class per operation: `AnalyzeEmail`, `AnalyzeBatchEmails`, `ApplyTagsWithConfidenceUseCase`, `UndoTagChanges`, … | [View Map](src/application/use-cases/codemap.md) |
| `src/application/services/` | Cross-cutting mechanisms: analysis dedup, rate limiting/concurrency, priority queue. | [View Map](src/application/services/codemap.md) |
| `src/infrastructure/` | Outward-facing adapters: LLM providers, persistence, logging, config, system primitives. | [View Map](src/infrastructure/codemap.md) |
| `src/infrastructure/providers/` | `ProviderFactory`, `BaseProvider` (Template Method: timeout/retry/validate), adapter. | [View Map](src/infrastructure/providers/codemap.md) |
| `src/infrastructure/providers/impl/` | The 10 LLM provider strategies (OpenAI, Gemini, Claude, Mistral, DeepSeek, OpenRouter, OpenRouter-Decisions, Ollama, ZAI PaaS, ZAI Coding). | [View Map](src/infrastructure/providers/impl/codemap.md) |
| `src/infrastructure/cache/` | Dual cache: `MemoryCache` (transient) + `AnalysisCache` (IndexedDB, email-hash keyed). | [View Map](src/infrastructure/cache/codemap.md) |
| `src/infrastructure/config/` | `AppConfigService`: cached config/provider-settings/tag-definitions access. | [View Map](src/infrastructure/config/codemap.md) |
| `src/infrastructure/interfaces/` | Infrastructure port contracts: `IProvider`, `ICache`, `IConfigRepository`, `IMailReader`, `IQueue`. | [View Map](src/infrastructure/interfaces/codemap.md) |
| `src/infrastructure/logger/` | `ConsoleLogger` (API-key masking), `DebugLogBuffer` (ring buffer + storage.session), `LegacyLogger`. | [View Map](src/infrastructure/logger/codemap.md) |
| `src/infrastructure/repositories/` | `StorageLocalConfigRepository` on `browser.storage.local` (3 config namespaces). | [View Map](src/infrastructure/repositories/codemap.md) |
| `src/infrastructure/storage/` | `MetricsRepository` + `TagHistoryRepository` (undo backing) on `messenger.storage.local`. | [View Map](src/infrastructure/storage/codemap.md) |
| `src/infrastructure/system/` | `SystemClock` (`IClock`) and `CryptoRandom` (`IRandom`). | [View Map](src/infrastructure/system/codemap.md) |
| `src/interfaces/` | Outermost layer: adapts Thunderbird host; only layer touching `messenger`/`browser` globals. | [View Map](src/interfaces/codemap.md) |
| `src/interfaces/adapters/` | `ThunderbirdMailReader`, `ThunderbirdTagManager` — WebExtension API adapters behind ports. | [View Map](src/interfaces/adapters/codemap.md) |
| `src/interfaces/background/` | Mail event listeners + runtime message API (action dispatch, batch progress). | [View Map](src/interfaces/background/codemap.md) |
| `src/interfaces/options/` | Options-page UI components (`DebugTab`: queue panel, log viewer). | [View Map](src/interfaces/options/codemap.md) |
| `src/interfaces/shared/` | Helpers shared by background + UI: provider settings resolution, folder listing. | [View Map](src/interfaces/shared/codemap.md) |
| `src/interfaces/shared/components/` | Framework-free DOM components: confidence badges, low-confidence indicators. | [View Map](src/interfaces/shared/components/codemap.md) |
| `src/shared/` | Cross-cutting kernel: types, constants, error hierarchy, pure utils — no side effects. | [View Map](src/shared/codemap.md) |
| `src/shared/constants/` | Tag-key conventions, system tags, AI prompt templates. | [View Map](src/shared/constants/codemap.md) |
| `src/shared/errors/` | Layer-aligned error hierarchy dispatchable by `code`. | [View Map](src/shared/errors/codemap.md) |
| `src/shared/types/` | Canonical dependency-free type contracts (provider config, tags, email, history, metrics). | [View Map](src/shared/types/codemap.md) |
| `src/shared/utils/` | Pure helpers: confidence math, type guards, log sanitization, validation, error messages. | [View Map](src/shared/utils/codemap.md) |
| `types/` | Ambient Thunderbird WebExtension global type declarations (`messenger`). | [View Map](types/codemap.md) |
| `core/` | Legacy re-export shims, `@deprecated`; still type-imported by provider impls — no logic. | [View Map](core/codemap.md) |

## Data Flow (happy path)
1. Thunderbird new-mail event → `src/interfaces/background/` `EmailEventListener` → runtime message to background script.
2. `src/background/` handlers resolve `AnalyzeEmail` / `AnalyzeBatchEmails` from the TSyringe container.
3. Use case pipeline: retrieve (`ThunderbirdMailReader`) → extract (`EmailContentExtractor`) → cache check (`AnalysisCache`) → LLM call (`ProviderFactory` → provider impl, throttled by `RateLimiterService`) → parse → confidence filtering (`ApplyTagsWithConfidenceUseCase`) → tag application (`ThunderbirdTagManager`, `_ma_` prefixed).
4. Side effects: metrics (`MetricsRepository`), tag history for undo (`TagHistoryRepository`), dedup marker (`EmailAnalysisTracker`), low-confidence UI flags.
