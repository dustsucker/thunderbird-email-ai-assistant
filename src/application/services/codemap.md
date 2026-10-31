# src/application/services/

## Responsibility
Stateful cross-cutting services reused by use cases.

## Files
- `EmailAnalysisTracker.ts` - Tracks analyzed mails via the `X-AI-Analyzed` header
  with fallback to `storage.local`; feeds `TrackAnalysisMetrics`.
- `RateLimiterService.ts` - Token-bucket rate limiting with per-model concurrency control.
- `PriorityQueue.ts` - Priority queue used by `AnalyzeBatchEmails` (implements `IQueue`).
- `index.ts` - Barrel export.

## Integration
- Injected into use cases; `PriorityQueue` is registered under the `IQueue` token in
  `src/background/DIContainer.ts`. Tested in `test/services/`, `test/rate-limiter.test.ts`.
