# src/shared/errors/

## Responsibility
Layered error hierarchy with error codes and type guards.

## Files
- `BaseErrors.ts` - Abstract bases: `DomainError`, `InfrastructureError`,
  `ApplicationError` (each with `code` + `severity` semantics).
- `AnalysisErrors.ts` - Analysis error hierarchy extending `ApplicationError`/
  `InfrastructureError`: EmailAnalysisError, EmailRetrievalError, TagApplicationError,
  CacheError, BatchAnalysisError, ConfigurationError, DependencyInjectionError.
- `ProviderErrors.ts` - Provider error hierarchy extending `InfrastructureError`:
  ProviderInitializationError, ProviderRequestError, ProviderResponseError,
  ProviderRateLimitError.
- `EmailAnalysisError.ts` - Legacy flat error classes (extend plain `Error`), kept for
  compatibility; prefer the typed hierarchies above.
- `index.ts` - Barrel export.

## Integration
- Storage/config reads raise typed errors instead of silently defaulting
  (`ConfigNotSetError` in `src/infrastructure/repositories/StorageLocalConfigRepository.ts`);
  LLM parse failures raise `LLMResponseParseError`
  (`src/infrastructure/providers/ProviderUtils.ts`).
- `mapAnalysisErrorToUserMessage` (`src/shared/utils/errorMessages.ts`) maps raw error
  strings to user-facing messages.
- Tested in `test/shared/errors/Errors.test.ts`.
