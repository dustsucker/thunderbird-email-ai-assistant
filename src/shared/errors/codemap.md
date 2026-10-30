# src/shared/errors/

## Responsibility
Unified, layer-aligned error hierarchy so failures can be caught and dispatched programmatically by `code` while preserving the cause chain and debug context.

## Design
Three-level hierarchy in `BaseErrors.ts`: abstract `DomainError`, `InfrastructureError` and `ApplicationError`, all extending `Error` with `code: string` and `context?: Record<string, unknown>` (infrastructure/application add `cause?: Error`) plus V8 `Error.captureStackTrace`. Specializations:
- `ProviderErrors.ts` (infrastructure): `ProviderInitializationError`, `ProviderRequestError`, `ProviderResponseError`, `ProviderRateLimitError` (with `retryAfter` seconds); codes in `PROVIDER_ERROR_CODES`.
- `AnalysisErrors.ts` (application + cache infra): `EmailAnalysisError`, `EmailRetrievalError`, `TagApplicationError`, `CacheError` (takes `operation: 'read'|'write'|'delete'|'clear'`), `BatchAnalysisError`, `ConfigurationError`, `DependencyInjectionError`; codes in `ANALYSIS_ERROR_CODES`.
- `EmailAnalysisError.ts`: legacy standalone hierarchy rooted at its own `EmailAnalysisError extends Error` — kept for backward compatibility but NOT exported from the barrel.

## Flow
Infrastructure code throws `Provider*Error`/`CacheError` wrapping the raw cause; use cases re-throw as `EmailAnalysisError`/`TagApplicationError`/`BatchAnalysisError` with `messageId` context; consumers branch on `error.code`.

## Integration
- Consumed by: application use cases (`AnalyzeEmail`, `AnalyzeBatchEmails`), provider implementations, DI bootstrap (`DependencyInjectionError`).
- Depends on: only `BaseErrors.ts` internally; no external dependencies.
