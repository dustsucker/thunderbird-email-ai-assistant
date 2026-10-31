# src/application/use-cases/

## Responsibility
One injectable class per business operation; orchestrate domain + infrastructure.

## Files
- `AnalyzeEmail.ts` - Single-mail workflow: retrieve → extract content → build prompt →
  provider call → validate/parse → cache → apply tags; owns analysis logging.
- `AnalyzeBatchEmails.ts` - Batch analysis with priority queue, concurrency limits,
  progress and cancellation; exports `BatchAnalysisStatus` (`'success' | 'partial' | 'error'`).
- `ApplyTagsToEmail.ts` - Validates/creates tags via `ITagManager` and applies them.
- `ApplyTagsWithConfidenceUseCase.ts` - Threshold-filtered tag application, honoring
  per-tag threshold overrides.
- `CacheAnalysisUseCase.ts` - Store/lookup analysis results (AnalysisCache).
- `ExtractEmailContentUseCase.ts` - Structured content extraction for the prompt.
- `RetrieveEmailUseCase.ts` - Fetch a message via `IMailReader`.
- `TrackAnalysisMetrics.ts` - Records per-analysis metrics via `EmailAnalysisTracker`/
  `MetricsRepository`.
- `UndoTagChanges.ts` - Restores a previous tag state (undo of AI tag changes).
- `index.ts` - Barrel export.

## Integration
- Resolved via DI in `src/background/DIContainer.ts`; invoked from
  `src/interfaces/background/` handlers; tested in `test/application/use-cases/`.
