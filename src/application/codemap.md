# src/application/

## Responsibility
Application layer of the hexagonal architecture: orchestrates end-to-end workflows (email analysis, tag application, undo, metrics) by composing domain objects with infrastructure services. Contains no Thunderbird/LLM specifics itself — all I/O is delegated through injected ports (`IMailReader`, `ITagManager`, `ICache`, `IConfigRepository`, `IQueue`).

## Design
- Use Case pattern: each user action is one `@injectable()` class with a single `execute()` entry point (`AnalyzeEmail`, `AnalyzeBatchEmails`, `ApplyTagsToEmail`, `UndoTagChanges`, `TrackAnalysisMetrics`).
- Composite refactor of the analysis workflow: `AnalyzeEmail` delegates to extracted sub-use-cases `RetrieveEmailUseCase`, `ExtractEmailContentUseCase`, `CacheAnalysisUseCase`, `ApplyTagsWithConfidenceUseCase`.
- Cross-cutting application services: `EmailAnalysisTracker` (dedup via `processedIds` in storage.local), `RateLimiterService` (token bucket + per-model semaphores), `PriorityQueue` (implements `IQueue`).
- DTOs as plain interfaces per use case (`AnalyzeEmailConfig`/`AnalyzeEmailResult`, `BatchAnalysisConfig`/`BatchAnalysisResult`, `ApplyTagsResult`); barrel re-exports of port types in both `index.ts` files.

## Flow
1. Entry interfaces (`background.ts` handlers: `EmailEventListener`, `MessageHandler`, `ContextMenuHandler`, `ToolbarHandler`) resolve use cases from the TSyringe container.
2. `AnalyzeEmail.execute()` runs the pipeline: dedup check → retrieve → extract → cache-key/lookup → provider analysis → cache write → confidence-filtered tag application → `markAnalyzed`.
3. `AnalyzeBatchEmails.execute()` enqueues message IDs into `IQueue` and drains them with N worker promises, reporting via the optional `BatchProgressListener` token.
4. Failures are wrapped and re-thrown with context after `ILogger` logging; aborts propagate as `AbortError` for batch cancellation.

## Integration
- Consumed by: background handlers (`src/background/` — `MessageHandler`, `EmailEventListener`, `ContextMenuHandler`, `ToolbarHandler`) wired in `src/background/DIContainer.ts`.
- Depends on: domain interfaces (`ILogger`, `ITagManager`, `IClock`, `EmailContentExtractor`), infrastructure interfaces (`IMailReader`, `ICache`, `IQueue`, `IConfigRepository`, `IProvider`), `ProviderFactory`, repositories (`TagHistoryRepository`, `MetricsRepository`), shared utils/constants (`confidenceUtils`, `TagConstants`). Subdirectories: `use-cases/`, `services/`.
