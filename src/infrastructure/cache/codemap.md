# src/infrastructure/cache/

## Responsibility
Two-tier caching of analysis results: persistent IndexedDB for LLM analyses,
transient in-memory cache for short-lived data.

## Files
- `AnalysisCache.ts` - Persistent analysis cache (IndexedDB): `AnalysisCache` class
  (+ singleton `analysisCache`), cache keys via `hashEmail()`/`createCacheKey()`,
  freshness check `isEmailFresh()` with `CACHE_TTL`, `normalizeHeaders()`.
- `MemoryCache.ts` - In-memory `ICache` implementation with TTL; keys hashed with
  SHA-256 via Web Crypto (`generateHash()`).
- `index.ts` - Barrel export.

## Integration
- `MemoryCache` is registered under the `ICache` token (`src/background/DIContainer.ts`);
  `CacheAnalysisUseCase` uses `AnalysisCache` for analysis results.
- Cache read errors surface as `CacheError` (`src/shared/errors/AnalysisErrors.ts`)
  instead of silently returning misses.
- Tested in `test/infrastructure/cache/`.
