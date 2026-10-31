# Repository Atlas: thunderbird-email-ai-assistant

## Project Responsibility
Thunderbird MailExtension for AI-powered email classification and tagging. Sends email
content to one of 10 configurable LLM providers, maps the response to Thunderbird tags
(with confidence scoring, batch processing, undo, and metrics), and persists results.
Built on a hexagonal (Clean Architecture) codebase with TSyringe dependency injection.

## System Entry Points
- `manifest.json`: MailExtension manifest (permissions, entry script registration).
- `background.ts` → `src/background/`: bootstrap of the TSyringe container, Thunderbird
  event listeners (new mail, context menu, install, toolbar), runtime message API.
- `options.ts` / `options.html`: options page UI (provider settings) plus the debug tab
  (`src/interfaces/options/DebugTab.ts`: queue panel + log viewer).
- `package.json`: scripts (`npm run build|test|lint|package`), vitest config.

## Layering (dependency rule: interfaces → application → domain ← infrastructure; shared importable by all)
```
src/background/      DI container bootstrap + event/message orchestration
src/interfaces/      Thunderbird adapters + UI (only layer touching messenger/browser)
src/application/     Use cases + stateful services (workflows)
src/domain/          Entities, value objects, interfaces (ports), services, errors (zero deps)
src/infrastructure/  LLM providers, cache, storage, logger, config, system
src/shared/          Types, constants, error hierarchy, pure utils (no side effects)
types/               Ambient Thunderbird WebExtension declarations
```

## Directory Map
| Directory | Responsibility | Details |
| --- | --- | --- |
| `src/background/` | Container wiring, handler registration | [codemap](src/background/codemap.md) |
| `src/interfaces/` | Adapters, background handlers, options UI | [codemap](src/interfaces/codemap.md) |
| `src/application/` | Use cases, tracker, rate limiter, queue | [codemap](src/application/codemap.md) |
| `src/domain/` | Entities, value objects, ports, domain services | [codemap](src/domain/codemap.md) |
| `src/infrastructure/` | Providers, caches, repositories, logger, system | [codemap](src/infrastructure/codemap.md) |
| `src/shared/` | Types, constants, errors, pure utils | [codemap](src/shared/codemap.md) |
| `types/` | Ambient Thunderbird API declarations | [codemap](types/codemap.md) |
| `test/` | Vitest suites, mirrors the src tree | [AGENTS.md](test/AGENTS.md) |

## Key Flows
1. **Single analysis**: `EmailEventListener`/`MessageHandler` → `AnalyzeEmail` →
   `RetrieveEmailUseCase` → `ExtractEmailContentUseCase` → `PromptBuilder.buildPrompt` →
   provider (`ProviderFactory.getProvider`) → `Validator` → `CacheAnalysisUseCase` →
   `ApplyTagsWithConfidenceUseCase` / `ApplyTagsToEmail`.
2. **Batch**: `MessageHandler` → `AnalyzeBatchEmails` (PriorityQueue + RateLimiterService,
   concurrent workers) → per-mail single-analysis path; final status is `BatchAnalysisStatus`
   (`'success' | 'partial' | 'error'`) — batches with unprocessed mails never report success.
3. **Undo**: `UndoTagChanges` + `TagApplyHistoryRepository` restore a previous tag state.
4. **Metrics**: `TrackAnalysisMetrics` → `MetricsRepository` (storage.local).
5. **Config**: `AppConfigService` (`src/infrastructure/config/AppConfig.ts`) loads and caches
   configuration via `StorageLocalConfigRepository`; missing config raises `ConfigNotSetError`.

## Cross-Cutting Facts
- **DI**: single wiring point is `src/background/DIContainer.ts` (`registerSingleton` per
  interface: `ILogger`, `ICache`, `IQueue`, `IMailReader`, `ITagManager`, `IConfigRepository`,
  `IClock`, `IRandom`, repositories, use cases, background handlers).
- **Providers**: static `PROVIDER_REGISTRY` Map literal in
  `src/infrastructure/providers/ProviderFactory.ts` — 10 providers (openai, claude, gemini,
  mistral, ollama, deepseek, openrouter, openrouter-decisions, zai-paas, zai-coding).
  No dynamic import(): async chunks are not shippable in a MailExtension xpi.
- **Tag namespace**: every AI tag key is prefixed `_ma_` (`TAG_KEY_PREFIX` in
  `src/shared/constants/TagConstants.ts`); unprefixed keys belong to the user and are never
  touched by the extension (see `src/interfaces/adapters/ThunderbirdTagManager.ts`).
- **Errors**: layered hierarchy in `src/shared/errors/` (`DomainError`,
  `ApplicationError`, `InfrastructureError`); parse failures raise `LLMResponseParseError`
  (`src/infrastructure/providers/ProviderUtils.ts`), storage/config read errors are surfaced
  instead of silently defaulting.
- **Logging**: `ConsoleLogger` implements domain `ILogger`; debug-tab entries go through
  `DebugLogBuffer`; API keys are masked via `src/shared/utils/loggingUtils.ts`.

## Testing
Vitest (`npm test`); suites mirror `src/` under `test/` — see [test/AGENTS.md](test/AGENTS.md).
E2E: `test/e2e.test.ts` (mock provider), `test/e2e-real-provider.test.ts` (real credentials).

For deep work on a specific folder, also read that folder's `codemap.md`.
