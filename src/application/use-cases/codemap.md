# src/application/use-cases/codemap.md

## Responsibility
One class per user-facing operation of the extension: single-email AI analysis (`AnalyzeEmail`), batch analysis (`AnalyzeBatchEmails`), tag application (`ApplyTagsToEmail`, `ApplyTagsWithConfidenceUseCase`), tag undo (`UndoTagChanges`), metrics tracking (`TrackAnalysisMetrics`), plus the extracted single-purpose steps `RetrieveEmailUseCase`, `ExtractEmailContentUseCase`, `CacheAnalysisUseCase`. Each validates input, orchestrates ports, wraps/re-throws errors with context.

## Design
- Use Case pattern with TSyringe `@injectable()` classes and `@inject()` constructor tokens: `'IMailReader'`, `'ITagManager'`, `'ICache'`, `'IConfigRepository'`, `'ILogger'`, `'ProviderFactory'`, plus class tokens (`RetrieveEmailUseCase`, `EmailContentExtractor`, `EmailAnalysisTracker`, `AnalyzeEmail`).
- Composite pattern: `AnalyzeEmail` coordinates the four sub-use-cases and owns an `inFlight: Map<string, Promise<ITagResponse>>` for request de-duplication (TOCTOU guard); `AnalyzeBatchEmails` is a Worker-pool/Producer-Consumer over `IQueue` with an `AbortController` for cancellation and an optional `'BatchProgressListener'` observer.
- Policy/filtering: `ApplyTagsWithConfidenceUseCase` whitelists LLM tag keys against `HARDCODED_TAG_KEYS` + custom tags, then applies per-tag vs global thresholds via `getEffectiveThreshold`/`meetsTagThreshold`.
- `CacheAnalysisUseCase` generates SHA-256 keys with Web Crypto; `index.ts` is a barrel re-exporting classes, DTOs and port interfaces.

## Flow
1. `AnalyzeEmail.execute()`: `wasAnalyzed` check → `RetrieveEmailUseCase.execute()` → `ExtractEmailContentUseCase.execute()` → `CacheAnalysisUseCase.generateKey()/get()` → on miss `providerFactory.getProvider()` + `provider.analyze()` → `cacheAnalysis.set()` → `ApplyTagsWithConfidenceUseCase.execute()` → `markAnalyzed` → persist `lowConfidenceFlags` to `storage.local`.
2. `AnalyzeBatchEmails.execute()`: load concurrency from `IConfigRepository.getAppConfig()` → enqueue `QueueItem`s → N `startWorker` loops dequeue and call `AnalyzeEmail` → progress via `notifyProgress()` → `cancel()` aborts in-flight requests and clears the queue.
3. `UndoTagChanges.execute()` reverses the latest `TagHistoryRepository` entry via `ITagManager.addTagToMessage`/`removeTagFromMessage`; `TrackAnalysisMetrics.startTracking()` returns a completion closure that records duration/cost in `MetricsRepository`.

## Integration
- Consumed by: background handlers in `src/background/` (`MessageHandler`, `EmailEventListener`, `ContextMenuHandler`, `ToolbarHandler`) and `RateLimiterService` consumers; registered as singletons in `src/background/DIContainer.ts` (lines 179–189).
- Depends on: `src/application/services/` (`EmailAnalysisTracker`), domain (`ILogger`, `ITagManager`, `EmailContentExtractor`, `IClock`), infrastructure (`IMailReader`, `ICache`, `IQueue`, `IConfigRepository`, `IProvider`, `ProviderFactory`, `TagHistoryRepository`, `MetricsRepository`), shared (`confidenceUtils`, `TagConstants`, `Metrics` types).
