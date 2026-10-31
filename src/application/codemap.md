# src/application/

## Responsibility
Orchestration layer: use cases (one per business operation) and stateful services.
No direct Thunderbird/API access - everything goes through injected interfaces.

## Design
- Use cases are `@injectable()` classes; dependencies arrive via `@inject()` tokens.
- Use cases compose domain services and infrastructure ports; business rules stay in
  `src/domain/`.
- `BatchAnalysisStatus = 'success' | 'partial' | 'error'` (`AnalyzeBatchEmails.ts`):
  batch results distinguish fully processed runs from partial failures.

## Layout
| Directory | Content | Details |
| --- | --- | --- |
| `use-cases/` | AnalyzeEmail, AnalyzeBatchEmails, ApplyTagsToEmail, ApplyTagsWithConfidenceUseCase, CacheAnalysisUseCase, ExtractEmailContentUseCase, RetrieveEmailUseCase, TrackAnalysisMetrics, UndoTagChanges | [codemap](use-cases/codemap.md) |
| `services/` | EmailAnalysisTracker, RateLimiterService, PriorityQueue | [codemap](services/codemap.md) |

## Integration
- Called from `src/interfaces/background/` handlers (message/event entry points).
- Registered in `src/background/DIContainer.ts`.
- Tested under `test/application/use-cases/`, `test/services/`, plus root-level suites
  (`test/analyze-email.test.ts`, `test/analyze-batch-emails.test.ts`).
